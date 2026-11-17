import { listen, defer } from '../runtime/resources.js';
/**
 * Saltline / gameplay/gameFlow
 * 从原版游戏按职责提取；保留原始算法、参数、着色器与执行顺序。
 */
import { Vector3 } from 'three';
import { createMenus } from '../../ui/createMenus.jsx';
import { clamp, damp, saturate, smoothstep } from '../core/math.js';
import { GAME_CONFIG, COMPASS_DIRECTIONS } from './missionConfig.js';
import { RADIO_LINES } from './radioLines.js';

/**
 * 任务状态机：title → intro → playing → paused / dead / complete。
 * 玩家、关卡、HUD、输入、武器和敌人均已创建后才调用；创建期间会接入 React 菜单。
 * 规则配置见 missionConfig.js，无线电原文见 radioLines.js，地图目标来自 level.objectives。
 * @param {object} context 共享游戏上下文。
 * @returns {object} start/pause/resume/update 与调试接口；run 保存本局任务状态。
 */
function createGame(context) {
  let postEffects = (context.render && context.render.post) || {},
    baseSaturation = typeof postEffects.saturation == 'number' ? postEffects.saturation : 1,
    player = context.player,
    level = context.level,
    hud = context.hud,
    input = context.input,
    callIfAvailable = (P, V, ...Y) => {
      try {
        if (P && typeof P[V] == 'function') return P[V](...Y);
      } catch (L) {
        console.error(`[game] ${V} threw`, L);
      }
    },
    menus = createMenus(context, {
      deploy() {
        callIfAvailable(context.audio, 'resume');
        input.requestLock();
        startMission({});
      },
      resume() {
        resumeGame(true);
      },
      restart() {
        callIfAvailable(context.audio, 'resume');
        input.requestLock();
        missionRun.retries++;
        startMission({
          quick: true,
          keepRetries: true,
        });
      },
      retry() {
        callIfAvailable(context.audio, 'resume');
        input.requestLock();
        missionRun.retries++;
        startMission({
          quick: true,
          keepRetries: true,
        });
      },
      redeploy() {
        callIfAvailable(context.audio, 'resume');
        input.requestLock();
        startMission({
          quick: true,
        });
      },
    });
  menus.applySettings();
  let missionRun = {
      time: 0,
      retries: 0,
      relays: [],
      cut: 0,
      allCut: false,
      queue: [],
      waveHot: 0,
      alertT: 0,
      pursuitT: 0,
      pursuitLeft: 0,
      contactSaid: false,
      lowSaid: false,
      extractHint: 0,
      intensity: 0.15,
      used: new Map(),
    },
    stateTime = 0,
    introDuration = GAME_CONFIG.introSeconds,
    locationShown = false,
    introRadioPlayed = false,
    pauseCooldown = 0,
    unusedTimer = 0,
    hadMouseLock = false,
    lastLookMode = '',
    lookHintCountdown = 0.8,
    scratchPosition = new Vector3(),
    scratchLook = new Vector3(),
    getObjectives = () => (level && level.objectives) || [],
    game = {
      state: 'title',
      flow: GAME_CONFIG,
      run: missionRun,
      menus: menus,
      start(options = {}) {
        startMission({
          skipIntro: !!options.skipIntro,
          quick: !!options.quick,
        });
      },
      pause() {
        pauseGame();
      },
      resume() {
        resumeGame(false);
      },
      update: updateGame,
      debugCut() {
        let P = missionRun.relays.find((V) => !V.cut);
        if (P) {
          finishRelay(P);
        }
      },
    };
  /* 状态变化统一重置计时器并发布事件。 */
  function setState(nextState) {
    let previousState = game.state;
    if (nextState !== previousState) {
      game.state = nextState;
      stateTime = 0;
      context.events.emit('game:state', {
        state: nextState,
        prev: previousState,
      });
    }
  }
  let cinematic = {
    pos: [],
    look: [],
    len: 1,
    t: 0,
  };
  /* 准备标题画面的巡视路径；无配置时沿出生点构造默认路径。 */
  function buildCinematicPath() {
    let path = (level && level.cinematicPath) || [];
    if (
      ((cinematic.pos = path.map((Y) => new Vector3(...Y.pos))),
      (cinematic.look = path.map((Y) => new Vector3(...Y.look))),
      cinematic.pos.length < 2)
    ) {
      let Y = (level && level.playerStart && level.playerStart.pos) || new Vector3();
      cinematic.pos = [new Vector3(Y.x, 2.2, Y.z), new Vector3(Y.x + 8, 2, Y.z)];
      cinematic.look = [new Vector3(Y.x + 30, 2.5, Y.z - 2), new Vector3(Y.x + 40, 3, Y.z - 2)];
    }
    let length = 0;
    for (let Y = 1; Y < cinematic.pos.length; Y++)
      length += cinematic.pos[Y].distanceTo(cinematic.pos[Y - 1]);
    cinematic.len = Math.max(length, 4);
  }
  /* 保持原版 Catmull–Rom 插值与端点处理。 */
  function sampleCinematic(points, progress, target) {
    let lastIndex = points.length - 1,
      scaledProgress = clamp(progress, 0, 1) * lastIndex,
      segment = Math.min(lastIndex - 1, Math.floor(scaledProgress)),
      fraction = scaledProgress - segment,
      before = points[Math.max(0, segment - 1)],
      start = points[segment],
      end = points[segment + 1],
      after = points[Math.min(lastIndex, segment + 2)],
      fractionSquared = fraction * fraction,
      fractionCubed = fractionSquared * fraction,
      interpolate = (ce, ve, _e, Te) =>
        0.5 *
        (2 * ve +
          (-ce + _e) * fraction +
          (2 * ce - 5 * ve + 4 * _e - Te) * fractionSquared +
          (-ce + 3 * ve - 3 * _e + Te) * fractionCubed);
    return target.set(
      interpolate(before.x, start.x, end.x, after.x),
      interpolate(before.y, start.y, end.y, after.y),
      interpolate(before.z, start.z, end.z, after.z),
    );
  }
  /* 标题场景缓慢巡视，并在循环接缝处淡入淡出。 */
  function updateTitleCamera(dt) {
    let duration = Math.max(26, cinematic.len / GAME_CONFIG.titleSpeed);
    cinematic.t += dt;
    if (cinematic.t >= duration) {
      cinematic.t = 0;
    }
    let progress = cinematic.t / duration,
      easedProgress = progress * progress * (3 - 2 * progress) * 0.25 + progress * 0.75,
      camera = context.camera,
      time = context.time.t;
    sampleCinematic(cinematic.pos, easedProgress, scratchPosition);
    sampleCinematic(cinematic.look, easedProgress, scratchLook);
    scratchPosition.x += Math.sin(time * 0.31) * 0.05;
    scratchPosition.y += Math.sin(time * 0.43 + 1.7) * 0.035;
    scratchPosition.z += Math.sin(time * 0.27 + 0.6) * 0.05;
    scratchLook.y += Math.sin(time * 0.19) * 0.12;
    scratchLook.x += Math.sin(time * 0.13 + 2) * 0.2;
    camera.position.copy(scratchPosition);
    camera.lookAt(scratchLook);
    camera.rotation.z += Math.sin(time * 0.21) * 0.006;
    if (!context.params.fov && Math.abs(camera.fov - GAME_CONFIG.titleFov) > 0.01) {
      camera.fov = GAME_CONFIG.titleFov;
      camera.updateProjectionMatrix();
    }
    postEffects.fade = Math.max(
      1 - smoothstep(0, 1.8, cinematic.t),
      smoothstep(duration - 1.6, duration, cinematic.t),
    );
  }
  /* 清空上一局实体、战斗统计与目标状态，再恢复出生点和巡逻敌人。 */
  /**
   * 重置本局暂态并从关卡目标重建中继列表，然后重新生成巡逻敌人。
   * 任务目标数量来自 level.objectives；重试次数由 startMission() 的选项决定是否保留。
   */
  function resetMission() {
    callIfAvailable(context.enemies, 'clear');
    callIfAvailable(context.fx, 'clear');
    callIfAvailable(context.combat, 'reset');
    callIfAvailable(context.weapon, 'reset');
    missionRun.time = 0;
    missionRun.cut = 0;
    missionRun.allCut = false;
    missionRun.queue.length = 0;
    missionRun.waveHot = 0;
    missionRun.alertT = 0;
    missionRun.pursuitT = 0;
    missionRun.pursuitLeft = 0;
    missionRun.contactSaid = false;
    missionRun.lowSaid = false;
    missionRun.extractHint = 0;
    missionRun.used.clear();
    missionRun.relays = getObjectives().map((P, V) => {
      let Y = (/([a-z0-9])$/i.exec(String(P.id || '')) || [
        0,
        String.fromCharCode(65 + V),
      ])[1].toUpperCase();
      setRelayState(P, 'live');
      return {
        o: P,
        id: P.id || 'relay_' + V,
        short: Y,
        t: 0,
        cut: false,
        cutting: false,
      };
    });
    player.reset(level.playerStart);
    if (hud.reset) {
      hud.reset();
    }
    postEffects.saturation = baseSaturation;
    postEffects.flash = 0;
    refreshMarkers();
    if (hud.setRelays) {
      hud.setRelays(0, missionRun.relays.length);
    }
    spawnPatrols();
  }
  /* 通过中继站模型接口同步灯光与动画状态。 */
  function setRelayState(objective, state) {
    try {
      let Y = objective && objective.object && objective.object.userData;
      if (Y && typeof Y.setState == 'function') {
        Y.setState(state);
      }
    } catch (Y) {
      console.error('[game] relay setState threw', Y);
    }
  }
  /* 未切断的中继站显示标记；全部切断后切换为撤离船。 */
  function refreshMarkers() {
    if (!hud.setMarkers) return;
    let markers = missionRun.relays
      .filter((V) => !V.cut)
      .map((V) => ({
        id: V.id,
        short: V.short,
        label: V.o.label || 'Relay ' + V.short,
        pos: V.o.pos,
        kind: 'relay',
      }));
    if (missionRun.allCut && level.extraction) {
      markers.push({
        id: 'extract',
        short: 'EX',
        label: 'Boat',
        pos: level.extraction.pos,
        kind: 'extract',
      });
    }
    hud.setMarkers(markers);
  }
  /**
   * 部署、重试、重新部署共用入口；从菜单进入时，菜单回调负责恢复音频并请求鼠标锁定。
   * skipIntro 用于截图/自动开始，quick 选用较短介绍，keepRetries 保留本轮重试计数。
   */
  function startMission({ skipIntro = false, quick = false, keepRetries = false } = {}) {
    if (
      (keepRetries || (missionRun.retries = 0),
      menus.show('none'),
      menus.locationCard(false),
      callIfAvailable(context.audio, 'setPaused', false),
      resetMission(),
      callIfAvailable(context.weapon, 'setVisible', true),
      (hadMouseLock = false),
      skipIntro)
    ) {
      postEffects.fade = 0;
      enterPlaying();
      return;
    }
    introDuration = quick ? GAME_CONFIG.retryIntroSeconds : GAME_CONFIG.introSeconds;
    locationShown = quick;
    introRadioPlayed = quick;
    player.enabled = false;
    if (input.setGameplay) {
      input.setGameplay(false);
    }
    hud.show(false);
    postEffects.fade = 1;
    callIfAvailable(context.audio, 'setIntensity', 0.15);
    setState('intro');
  }
  /* 开放玩家输入，显示 HUD，并进入任务进行状态。 */
  function enterPlaying() {
    player.enabled = true;
    hud.show(true);
    if (input.setGameplay) {
      input.setGameplay(true);
    }
    hud.setObjective(getObjectiveText());
    setState('playing');
    updateLookHint(true);
  }
  /* 按剩余中继站数返回原版目标文案。 */
  function getObjectiveText() {
    if (missionRun.allCut) return 'Get to the boat';
    let remaining = missionRun.relays.length - missionRun.cut;
    return missionRun.cut === 0
      ? 'Cut the three uplink relays'
      : remaining === 1
        ? 'Cut the last relay'
        : `Cut the remaining ${remaining} relays`;
  }
  /* 鼠标输入模式变化时同步暂停菜单和 HUD 提示。 */
  function updateLookHint(force) {
    let description = input.describeMode ? input.describeMode() : '';
    menus.setLookMode(description);
    if (!(!force && description === lastLookMode)) {
      lastLookMode = description;
      game.state === 'playing' &&
      (input.mode === 'drag' ||
        (input.mode === 'lock' &&
          !input.locked &&
          !context.params.shot &&
          !context.params.autostart))
        ? hud.message(description, input.mode === 'drag' ? 7 : 4)
        : game.state === 'playing' && input.locked && hud.message('', 0);
    }
  }
  if (input.onModeChange) {
    input.onModeChange(() => updateLookHint(false));
  }
  context.events.on('input:lock', (P) => {
    if (P.locked) {
      hadMouseLock = true;
      updateLookHint(false);
      return;
    }
    if (game.state === 'playing' && hadMouseLock) {
      pauseGame();
    }
    hadMouseLock = false;
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden && game.state === 'playing') {
      pauseGame();
    }
  });
  listen(window, 'keydown', (P) => {
    if (!(
      game.state !== 'title' ||
      menus.panelOpen ||
      (P.code !== 'Enter' && P.code !== 'NumpadEnter') ||
      (P.target && P.target.tagName === 'BUTTON')
    )) {
      callIfAvailable(context.audio, 'resume');
      input.requestLock();
      startMission({});
    }
  });
  /* 暂停输入和音频，同时显示暂停菜单。 */
  function pauseGame() {
    if (game.state === 'playing') {
      if (input.setGameplay) {
        input.setGameplay(false);
      }
      input.exitLock();
      callIfAvailable(context.audio, 'setPaused', true);
      menus.setLookMode(
        input.mode === 'drag'
          ? input.describeMode()
          : input.touch
            ? ''
            : 'Resume recaptures the mouse.',
      );
      hud.show(false);
      menus.show('paused');
      pauseCooldown = 0.35;
      setState('paused');
    }
  }
  /* 恢复任务并重新请求鼠标锁定。 */
  function resumeGame(fromMenu) {
    if (game.state === 'paused') {
      menus.show('none');
      callIfAvailable(context.audio, 'setPaused', false);
      hud.show(true);
      if (input.setGameplay) {
        input.setGameplay(true);
      }
      hadMouseLock = false;
      input.requestLock();
      setState('playing');
      defer(() => updateLookHint(true), 700);
    }
  }
  /* 空中与地面敌人使用对应出生点。 */
  function getSpawnPoints(enemyType) {
    let spawnType = enemyType === 'gull' ? 'air' : 'ground',
      spawns = (level && level.enemySpawns) || [],
      matching = spawns.filter((Z) => Z.type === spawnType);
    return matching.length ? matching : spawns;
  }
  /* 综合距离、遮挡和近期使用情况选择增援出生位置。 */
  function chooseSpawnPosition(
    enemyType,
    { minDist: minDistance = GAME_CONFIG.spawnFar, from = player.pos, preferHidden = true } = {},
  ) {
    let spawnPoints = getSpawnPoints(enemyType),
      bestSpawn = null,
      bestScore = -1e9;
    for (let le of spawnPoints) {
      let R = Math.hypot(le.pos.x - from.x, le.pos.z - from.z),
        I = context.rng() * 1.5;
      if (
        ((I +=
          R >= minDistance
            ? 2 + Math.min(1, (R - minDistance) / 30) * 0.5
            : -(minDistance - R) / 4),
        preferHidden)
      ) {
        scratchPosition.copy(le.pos);
        scratchPosition.y += enemyType === 'gull' ? 0 : 1;
        let ae = true;
        try {
          ae = context.physics.lineOfSight(scratchPosition, player.eye);
        } catch {}
        if (!ae) {
          I += 2.5;
        }
      }
      let se = missionRun.used.get(le);
      if (se !== void 0 && missionRun.time - se < 6) {
        I -= 3;
      }
      if (I > bestScore) {
        bestScore = I;
        bestSpawn = le;
      }
    }
    let position = new Vector3();
    if (bestSpawn) {
      missionRun.used.set(bestSpawn, missionRun.time);
      position.copy(bestSpawn.pos);
      let le = (context.rng() - 0.5) * 2.4,
        R = (context.rng() - 0.5) * 2.4,
        I = enemyType === 'gull';
      try {
        if (!I) {
          I = context.physics.nav.isWalkable(position.x + le, position.z + R);
        }
      } catch {
        I = false;
      }
      if (I) {
        position.x += le;
        position.z += R;
      }
    } else {
      let le = context.rng() * Math.PI * 2;
      position.set(
        clamp(from.x + Math.cos(le) * 26, -34, 26),
        0,
        clamp(from.z + Math.sin(le) * 26, -26, 24),
      );
    }
    if (enemyType === 'gull' && position.y < 2.5) {
      position.y = 6 + context.rng() * 3;
    }
    return position;
  }
  /* 集中调用敌人生成接口并记录异常。 */
  function spawnEnemy(enemyType, position, options) {
    let enemy = null;
    try {
      enemy = context.enemies.spawn(enemyType, position, options);
    } catch (Z) {
      console.error('[game] enemies.spawn threw', Z);
    }
    return enemy;
  }
  /* 创建任务开始时的巡逻队。 */
  function spawnPatrols() {
    let startPosition = (level.playerStart && level.playerStart.pos) || player.pos;
    for (let V of ['gull', 'hound'])
      for (let Y = 0; Y < GAME_CONFIG.patrol[V]; Y++)
        spawnEnemy(
          V,
          chooseSpawnPosition(V, {
            minDist: 32,
            from: startPosition,
            preferHidden: true,
          }),
          {
            state: 'patrol',
          },
        );
  }
  /* 切断中继站触发分批增援，并提示来袭方向。 */
  /**
   * 创建一波增援的定时队列，实际生成在 updateReinforcements() 中受存活数上限控制。
   * 先算出生位置再入队；顺序会影响随机序列、出现方位和警告文案。
   * @param {number} waveIndex 从 0 开始的中继完成序号。
   */
  function queueReinforcements(waveIndex) {
    let wave = GAME_CONFIG.waves[Math.min(waveIndex, GAME_CONFIG.waves.length - 1)],
      enemyTypes = [];
    for (let oe = 0; oe < wave.gull; oe++) enemyTypes.push('gull');
    for (let oe = 0; oe < wave.hound; oe++)
      enemyTypes.splice(Math.min(enemyTypes.length, 1 + oe * 2), 0, 'hound');
    let directionX = 0,
      directionZ = 0;
    enemyTypes.forEach((oe, fe) => {
      let le = chooseSpawnPosition(oe);
      directionX += le.x - player.pos.x;
      directionZ += le.z - player.pos.z;
      missionRun.queue.push({
        type: oe,
        pos: le,
        at: missionRun.time + 1.6 + fe * GAME_CONFIG.spawnStagger,
      });
    });
    missionRun.waveHot = 30;
    let heading = ((Math.atan2(directionX, -directionZ) * 180) / Math.PI + 360) % 360;
    if (hud.warn) {
      hud.warn('Contact \u2014 ' + COMPASS_DIRECTIONS[Math.round(heading / 45) % 8], 3.4);
    }
  }
  /* 依次释放增援队列，限制同时存活数量，并推进最终追击。 */
  function updateReinforcements(dt) {
    let aliveCount = countAliveEnemies();
    for (let Y = 0; Y < missionRun.queue.length; Y++) {
      let L = missionRun.queue[Y];
      if (missionRun.time < L.at) continue;
      if (aliveCount >= GAME_CONFIG.maxAlive) {
        L.at = missionRun.time + 1;
        continue;
      }
      if (
        !spawnEnemy(L.type, L.pos, {
          state: 'alert',
          target: player.pos,
        }) &&
        !context.enemies.stub &&
        (L.tries = (L.tries || 0) + 1) < 6
      ) {
        L.at = missionRun.time + 1.5;
        continue;
      }
      missionRun.queue.splice(Y, 1);
      callIfAvailable(context.enemies, 'alert', player.pos, 60);
      break;
    }
    if (missionRun.allCut) {
      if (
        ((missionRun.pursuitT -= dt),
        missionRun.pursuitT <= 0 &&
          missionRun.pursuitLeft > 0 &&
          !missionRun.queue.length &&
          aliveCount < GAME_CONFIG.pursuitMinAlive)
      ) {
        missionRun.pursuitT = GAME_CONFIG.pursuitEvery;
        missionRun.pursuitLeft--;
        let Y = context.rng() < 0.6 ? 'gull' : 'hound';
        missionRun.queue.push({
          type: Y,
          pos: chooseSpawnPosition(Y),
          at: missionRun.time + 0.5,
        });
      }
      if (missionRun.pursuitT <= 0) {
        missionRun.pursuitT = 4;
        callIfAvailable(context.enemies, 'alert', player.pos, 90);
      }
    }
  }
  /* 兼容完整敌人模块和降级接口的存活数查询。 */
  function countAliveEnemies() {
    try {
      return context.enemies.aliveCount
        ? context.enemies.aliveCount()
        : context.enemies.list.filter((P) => P.alive).length;
    } catch {
      return 0;
    }
  }
  /* 查询附近敌人，用于决定战斗音乐强度。 */
  function hasNearbyEnemy(radius) {
    let enemies = (context.enemies && context.enemies.list) || [];
    for (let Y = 0; Y < enemies.length; Y++) {
      let L = enemies[Y];
      if (
        L &&
        L.alive &&
        L.pos &&
        Math.hypot(L.pos.x - player.pos.x, L.pos.z - player.pos.z) < radius
      )
        return true;
    }
    return false;
  }
  context.events.on('enemy:alert', () => {
    missionRun.alertT = 10;
    if (game.state === 'playing' && !missionRun.contactSaid) {
      missionRun.contactSaid = true;
      if (hud.radio) {
        hud.radio(RADIO_LINES.contact, 3.2);
      }
    }
  });
  context.events.on('player:hit', () => {
    missionRun.alertT = Math.max(missionRun.alertT, 8);
  });
  context.events.on('player:rescued', () => {
    if (game.state === 'playing') {
      hud.message('Hauled out of the water', 2.5);
    }
  });
  /* 按照距离、垂直高度与朝向寻找可交互中继站。 */
  function findInteractableRelay() {
    let nearest = null,
      range = GAME_CONFIG.interactRange;
    for (let Y of missionRun.relays) {
      if (Y.cut) continue;
      let L = Y.o.pos.x - player.pos.x,
        Z = Y.o.pos.z - player.pos.z,
        J = Math.hypot(L, Z);
      if (!(
        J > range ||
        Math.abs((Y.o.pos.y || 0) - player.pos.y) > 2.5 ||
        (J > 0.9 &&
          (L * player.forward.x + Z * player.forward.z) /
            (J * Math.max(0.2, Math.hypot(player.forward.x, player.forward.z))) <
            GAME_CONFIG.interactFacing)
      )) {
        nearest = Y;
        range = J;
      }
    }
    return nearest;
  }
  /**
   * 按住交互键积累切断进度，松开后回退；全部完成后允许撤离。
   * relay.t 是 0..1 的进度，objective:progress 的载荷也使用这一比例；
   * 回退速度维持原版 1.6/秒，完成时机由本帧递增后的值决定。
   */
  function updateObjectives(dt) {
    let relay = player.alive ? findInteractableRelay() : null;
    for (let L of missionRun.relays) {
      if (!L.cut) {
        L === relay && input.down('interact')
          ? (L.cutting || ((L.cutting = true), setRelayState(L.o, 'cutting')),
            (L.t += dt / GAME_CONFIG.cutSeconds),
            context.events.emit('objective:progress', {
              id: L.id,
              t: Math.min(1, L.t),
            }),
            L.t >= 1 && finishRelay(L))
          : L.t > 0 &&
            ((L.t = Math.max(0, L.t - dt * 1.6)),
            L.cutting &&
              ((L.cutting = false),
              setRelayState(L.o, 'live'),
              context.events.emit('objective:progress', {
                id: L.id,
                t: 0,
              })));
      }
    }
    relay && !relay.cut
      ? hud.setPrompt && hud.setPrompt('Cut relay ' + relay.short, saturate(relay.t))
      : hud.setPrompt && hud.setPrompt(null);
    let extraction = level.extraction;
    if (extraction && extraction.pos) {
      let L = Math.hypot(extraction.pos.x - player.pos.x, extraction.pos.z - player.pos.z),
        Z = L < (extraction.radius || 2.5) && Math.abs(extraction.pos.y - player.pos.y) < 3.5;
      Z && missionRun.allCut && player.alive
        ? completeMission()
        : Z &&
          !missionRun.allCut &&
          missionRun.extractHint <= 0 &&
          ((missionRun.extractHint = 8),
          hud.message('Relays still live \u2014 the boat will not wait under fire', 3.5));
      missionRun.extractHint = Math.max(0, missionRun.extractHint - dt);
    }
  }
  /**
   * 完成一个尚未完成的中继；调用方保证每个中继只进入一次。
   * 先修改本局状态并更新模型，再同步发布 objective:done（最后一个还会发布 objective:all）。
   * 事件订阅者以及后续 HUD、无线电和增援读取到的是完成后的状态。
   */
  function finishRelay(relay) {
    relay.cut = true;
    relay.cutting = false;
    relay.t = 1;
    missionRun.cut++;
    setRelayState(relay.o, 'cut');
    let total = missionRun.relays.length;
    context.events.emit('objective:done', {
      id: relay.id,
      index: missionRun.cut,
      total: total,
    });
    if (hud.setRelays) {
      hud.setRelays(missionRun.cut, total);
    }
    if (hud.setPrompt) {
      hud.setPrompt(null);
    }
    player.addShake(0.18);
    queueReinforcements(missionRun.cut - 1);
    missionRun.cut >= total
      ? ((missionRun.allCut = true),
        (missionRun.pursuitLeft = GAME_CONFIG.pursuitExtra),
        (missionRun.pursuitT = 12),
        context.events.emit('objective:all', {}),
        hud.radio && hud.radio(RADIO_LINES.all, 4.5))
      : hud.radio &&
        hud.radio(RADIO_LINES.cut[Math.min(missionRun.cut - 1, RADIO_LINES.cut.length - 1)], 3.6);
    hud.setObjective(getObjectiveText());
    refreshMarkers();
  }
  context.events.on('player:dead', () => {
    if (!(game.state !== 'playing' && game.state !== 'paused')) {
      if (input.setGameplay) {
        input.setGameplay(false);
      }
      input.exitLock();
      if (hud.setPrompt) {
        hud.setPrompt(null);
      }
      hud.show(false);
      if (hud.clearRadio) {
        hud.clearRadio();
      }
      menus.setDead({
        time: missionRun.time,
        relays: missionRun.cut,
        total: missionRun.relays.length,
      });
      setState('dead');
    }
  });
  /* 撤离成功后锁定玩家，按时间、命中率与重试次数生成结算。 */
  function completeMission() {
    player.invulnerable = true;
    player.enabled = false;
    if (input.setGameplay) {
      input.setGameplay(false);
    }
    input.exitLock();
    if (hud.setPrompt) {
      hud.setPrompt(null);
    }
    hud.show(false);
    context.events.emit('extraction:reached', {});
    if (hud.clearRadio) {
      hud.clearRadio();
    }
    if (hud.radio) {
      hud.radio(RADIO_LINES.done, 2.2);
    }
    let stats = (context.combat && context.combat.stats) || {
        shots: 0,
        hits: 0,
        kills: 0,
      },
      accuracy = stats.shots > 0 ? clamp(stats.hits / stats.shots, 0, 1) : null,
      score =
        (missionRun.time < 270 ? 2 : missionRun.time < 400 ? 1 : 0) +
        (accuracy >= 0.5 ? 2 : accuracy >= 0.3 ? 1 : 0) +
        (missionRun.retries === 0 ? 1 : 0),
      rating = ['Messy', 'Loud', 'Steady', 'Clean', 'Sharp', 'Surgical'][score];
    menus.setDebrief({
      time: missionRun.time,
      accuracy: accuracy,
      kills: stats.kills || 0,
      retries: missionRun.retries,
      rating: rating,
    });
    setState('complete');
  }
  /**
   * 主状态机每帧更新。返回 false 暂停玩家/武器/敌人的模拟，仍允许外层循环绘制菜单。
   * dead/complete 返回 true，以保留倒地运动和结算过渡；title/paused 返回 false。
   * stateTime 统计当前状态经过时间，missionRun.time 只在 playing 状态累计。
   * @param {number} dt 本帧时间步长（秒）。
   * @returns {boolean} 当前状态是否允许外层推进角色模拟。
   */
  function updateGame(dt) {
    switch (((stateTime += dt), game.state)) {
      case 'title':
        updateTitleCamera(dt);
        return false;
      case 'intro':
        postEffects.fade = 1 - smoothstep(0.25, Math.min(introDuration, 2.6), stateTime);
        if (!locationShown && stateTime > 0.5) {
          locationShown = true;
          menus.locationCard(true);
        }
        if (!introRadioPlayed && stateTime > 1.3) {
          introRadioPlayed = true;
          if (hud.radio) {
            hud.radio(RADIO_LINES.intro, 4.2);
          }
        }
        if (stateTime > introDuration - 0.6 && !hud.root?.classList.contains('on')) {
          hud.show(true);
          hud.setObjective(getObjectiveText());
        }
        if (stateTime >= introDuration) {
          menus.locationCard(false);
          postEffects.fade = 0;
          enterPlaying();
        }
        return true;
      case 'playing': {
        if (
          ((missionRun.time += dt),
          (postEffects.fade = damp(postEffects.fade || 0, 0, 6, dt)),
          pauseCooldown > 0 && (pauseCooldown -= dt),
          input.pressed('pause'))
        ) {
          pauseGame();
          return false;
        }
        if ((updateObjectives(dt), game.state !== 'playing')) return true;
        updateReinforcements(dt);
        missionRun.alertT = Math.max(0, missionRun.alertT - dt);
        missionRun.waveHot = Math.max(0, missionRun.waveHot - dt);
        let V = countAliveEnemies();
        if (
          missionRun.waveHot > 0 &&
          V === 0 &&
          !missionRun.queue.length &&
          missionRun.waveHot < 24
        ) {
          missionRun.waveHot = 0;
        }
        let Y =
          missionRun.allCut || missionRun.queue.length || (missionRun.waveHot > 0 && V > 0)
            ? 1
            : missionRun.alertT > 0 || (V > 0 && hasNearbyEnemy(26))
              ? 0.6
              : 0.15;
        if (Y !== missionRun.intensity) {
          missionRun.intensity = Y;
          callIfAvailable(context.audio, 'setIntensity', Y);
        }
        input.mode === 'lock' &&
        !input.locked &&
        !input.touch &&
        !context.params.shot &&
        !context.params.autostart
          ? ((lookHintCountdown -= dt),
            lookHintCountdown <= 0 &&
              ((lookHintCountdown = 2), hud.message(input.describeMode(), 2.6)))
          : (lookHintCountdown = 0.8);
        if (!missionRun.lowSaid && player.alive && player.health < 30) {
          missionRun.lowSaid = true;
          if (hud.radio) {
            hud.radio(RADIO_LINES.low, 3);
          }
        }
        return true;
      }
      case 'paused':
        pauseCooldown > 0
          ? (pauseCooldown -= dt)
          : input.pressed('pause') && (menus.closePanel() || resumeGame(false));
        return false;
      case 'dead':
        postEffects.saturation = damp(postEffects.saturation ?? 1, 0.12, 2.2, dt);
        postEffects.fade = damp(postEffects.fade || 0, 0.55, 1.4, dt);
        if (stateTime > 1.5 && menus.screen !== 'dead') {
          menus.show('dead');
          callIfAvailable(context.audio, 'setIntensity', 0.15);
        }
        return true;
      case 'complete':
        postEffects.fade = damp(postEffects.fade || 0, 0.72, 0.9, dt);
        postEffects.saturation = damp(postEffects.saturation ?? 1, baseSaturation * 0.7, 1, dt);
        if (stateTime > 3.3 && menus.screen !== 'complete') {
          menus.show('complete');
          callIfAvailable(context.audio, 'setIntensity', 0.15);
        }
        return true;
    }
    return false;
  }
  buildCinematicPath();
  player.enabled = false;
  hud.show(false);
  callIfAvailable(context.weapon, 'setVisible', false);
  if (input.setGameplay) {
    input.setGameplay(false);
  }
  callIfAvailable(context.audio, 'setIntensity', 0.15);
  if (!(context.params.shot || context.params.autostart)) {
    menus.show('title');
  }
  return game;
}
export { createGame };
