import { listen } from '../runtime/resources.ts';
/**
 * Saltline / hud/hud
 * 从原版游戏按职责提取；保留原始算法、参数、着色器与执行顺序。
 */
import { Vector3 } from 'three';
var COMPASS_PIXELS_PER_DEGREE = 4,
  COMPASS_MIN_DEGREES = -90,
  COMPASS_MAX_DEGREES = 450,
  COMPASS_LABELS = {
    0: 'N',
    45: 'NE',
    90: 'E',
    135: 'SE',
    180: 'S',
    225: 'SW',
    270: 'W',
    315: 'NW',
  },
  PROMPT_RING_CIRCUMFERENCE = 2 * Math.PI * 19;
// html 仅来自游戏自带的标记模板/文案；不要将未处理的外部输入送入此接口。
function createElement(tag, className, html) {
  let element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (html != null) {
    element.innerHTML = html;
  }
  return element;
}
/**
 * 高频 HUD：创建并缓存 DOM 节点，逐帧读取玩家/武器/相机状态，避免经 React 转发帧数据。
 * 瞬时反馈订阅 player:hitEnemy / enemy:killed / player:hit；任务内容由 gameFlow 主动设置。
 * @param {object} context 已创建 player、weapon、camera、input、events 与 time 的运行上下文。
 * @returns {object} update(dt) 与任务/提示/字幕控制接口；root 供显隐与状态查询。
 */
function createHud(context) {
  let uiRoot = document.getElementById('ui'),
    root = createElement('div', 'hud');
  root.setAttribute('aria-hidden', 'true');
  let compass = createElement('div', 'h-compass'),
    compassTape = createElement('div', 'h-tape'),
    compassHtml = '';
  for (let k = COMPASS_MIN_DEGREES; k <= COMPASS_MAX_DEGREES; k += 5) {
    let ce = (k - COMPASS_MIN_DEGREES) * COMPASS_PIXELS_PER_DEGREE,
      ve = ((k % 360) + 360) % 360,
      _e = ve % 45 === 0,
      Te = ve % 15 === 0;
    compassHtml += `<i class="${_e ? 'mj' : Te ? 'md' : 'mn'}" style="left:${ce}px"></i>`;
    _e
      ? (compassHtml += `<b class="${ve % 90 === 0 ? 'card' : 'ic'}" style="left:${ce}px">${COMPASS_LABELS[ve]}</b>`)
      : ve % 15 === 0 &&
        (compassHtml += `<b class="num" style="left:${ce}px">${String(ve).padStart(3, '0')}</b>`);
  }
  compassTape.innerHTML = compassHtml;
  let tapeViewport = createElement('div', 'h-tape-wrap');
  tapeViewport.appendChild(compassTape);
  let compassMarkers = createElement('div', 'h-cmarks'),
    headingLabel = createElement('div', 'h-heading', '000');
  compass.append(tapeViewport, createElement('i', 'h-needle'), compassMarkers, headingLabel);
  let objectivePanel = createElement(
      'div',
      'h-obj',
      '<div class="h-k">Objective</div><div class="h-obj-t"></div><div class="h-relays"><span>Relays</span><i></i><i></i><i></i><b>0/3</b></div>',
    ),
    objectiveLabel = objectivePanel.querySelector('.h-obj-t'),
    relayStrip = objectivePanel.querySelector('.h-relays'),
    relayCounter = relayStrip.querySelector('b'),
    relayPips = [...relayStrip.querySelectorAll('i')],
    warning = createElement('div', 'h-warn'),
    crosshair = createElement(
      'div',
      'h-cross',
      '<i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><i class="c-dot"></i>',
    ),
    crosshairArms = crosshair.querySelectorAll('i'),
    hitMarker = createElement('div', 'h-hit', '<i></i><i></i><i></i><i></i>'),
    damageArcsRoot = createElement('div', 'h-arcs'),
    damageArcs = [];
  for (let k = 0; k < 4; k++) {
    let ce = createElement(
      'div',
      'h-arc',
      '<svg viewBox="-100 -100 200 200"><path d="M -38 -84 A 92 92 0 0 1 38 -84" /><path class="tip" d="M -7 -97 L 0 -106 L 7 -97" /></svg>',
    );
    damageArcsRoot.appendChild(ce);
    damageArcs.push({
      el: ce,
      life: 0,
      src: new Vector3(),
      op: -1,
      rot: 1e9,
    });
  }
  let prompt = createElement(
      'div',
      'h-prompt',
      `<svg viewBox="-24 -24 48 48"><circle class="bg" r="19"/><circle class="fg" r="19" stroke-dasharray="${PROMPT_RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${PROMPT_RING_CIRCUMFERENCE.toFixed(2)}" transform="rotate(-90)"/></svg><span class="h-key">E</span><span class="h-plabel"></span>`,
    ),
    promptRing = prompt.querySelector('.fg'),
    promptKey = prompt.querySelector('.h-key'),
    promptLabel = prompt.querySelector('.h-plabel'),
    feedRoot = createElement('div', 'h-feed'),
    messageRoot = createElement('div', 'h-msg'),
    healthPanel = createElement(
      'div',
      'h-health',
      '<div class="h-k">Vitals</div><div class="h-hp-row"><b class="h-hp-n">100</b><div class="h-hp-bar">' +
        '<i></i>'.repeat(10) +
        '</div></div>',
    ),
    healthNumber = healthPanel.querySelector('.h-hp-n'),
    healthPips = [...healthPanel.querySelectorAll('.h-hp-bar i')],
    ammoPanel = createElement(
      'div',
      'h-ammo',
      '<div class="h-cue"></div><div class="h-ammo-row"><b class="h-ammo-n">30</b><span class="h-ammo-r">120</span></div><div class="h-pips"></div><div class="h-wname"></div>',
    ),
    ammoNumber = ammoPanel.querySelector('.h-ammo-n'),
    reserveNumber = ammoPanel.querySelector('.h-ammo-r'),
    ammoPipsRoot = ammoPanel.querySelector('.h-pips'),
    weaponName = ammoPanel.querySelector('.h-wname'),
    ammoCueLabel = ammoPanel.querySelector('.h-cue'),
    worldMarkersRoot = createElement('div', 'h-marks');
  root.append(
    worldMarkersRoot,
    compass,
    objectivePanel,
    warning,
    damageArcsRoot,
    crosshair,
    hitMarker,
    prompt,
    feedRoot,
    messageRoot,
    healthPanel,
    ammoPanel,
  );
  uiRoot.appendChild(root);
  let radioRoot = createElement(
    'div',
    'comms',
    '<span class="comms-who">Control</span><span class="comms-t"></span>',
  );
  radioRoot.setAttribute('role', 'status');
  radioRoot.setAttribute('aria-live', 'polite');
  let radioText = radioRoot.querySelector('.comms-t');
  uiRoot.appendChild(radioRoot);
  let shown = false,
    compassWidth = 420,
    viewportWidth = innerWidth,
    viewportHeight = innerHeight,
    cache = {
      ammo: -1,
      mag: -1,
      reserve: -1,
      name: null,
      cue: null,
      low: null,
      hp: -1,
      hpSeg: -1,
      hurt: null,
      head: -1,
      tapeX: 1e9,
      gap: -1,
      crossOn: null,
      promptOn: null,
      promptText: null,
      promptT: -1,
      promptKey: null,
      marksOn: null,
      done: -1,
      total: -1,
    },
    ammoPips = [],
    objectiveText = '',
    objectiveChars = 0,
    objectiveTypeProgress = 0,
    radioQueue = [],
    currentRadio = null,
    radioChars = 0,
    radioTypeProgress = 0,
    radioHoldTime = 0,
    warningTime = 0,
    messageTime = 0,
    feedEntries = [],
    markerEntries = [],
    projectedMarker = new Vector3(),
    lastKillEntry = null,
    lastKillFrame = -1;
  /* 窗口尺寸变化时刷新投影尺寸，并使位置缓存失效。 */
  function resize() {
    viewportWidth = innerWidth;
    viewportHeight = innerHeight;
    compassWidth = compass.clientWidth || Math.min(420, viewportWidth * 0.6);
    cache.tapeX = 1e9;
    cache.gap = -1;
    for (let k of markerEntries) {
      k.lastC = 1e9;
      k.lastW = '';
    }
  }
  listen(window, 'resize', resize);
  // 敌人的 damage() 可先发 enemy:killed；同帧命中回调再为已有击杀条目补上弱点说明。
  context.events.on('player:hitEnemy', (k) => {
    hud.hitmarker(k && k.killed ? 'kill' : k && (k.weak || k.part === 'weak') ? 'weak' : 'hit');
    if (
      k &&
      k.killed &&
      k.weak &&
      lastKillEntry &&
      lastKillFrame === context.time.frame &&
      !lastKillEntry.weak
    ) {
      lastKillEntry.weak = true;
      lastKillEntry.el.innerHTML += '<em>Weak point</em>';
    }
  });
  context.events.on('enemy:killed', (k) => {
    let ce = String((k && (k.type || (k.enemy && k.enemy.type))) || 'machine').toUpperCase();
    lastKillEntry = hud.feed(`<b>${ce}</b> destroyed`);
    lastKillFrame = context.time.frame;
  });
  context.events.on('player:hit', (k) => {
    if (!k || !k.fromPos) return;
    let ce = damageArcs[0];
    for (let ve of damageArcs) {
      if (ve.life <= 0) {
        ce = ve;
        break;
      }
      if (ve.life < ce.life) {
        ce = ve;
      }
    }
    ce.src.copy(k.fromPos);
    ce.life = 1.5;
    ce.max = 1.5;
  });
  let hud = {
    root: root,
    show(visible) {
      visible = !!visible;
      if (visible !== shown) {
        shown = visible;
        root.classList.toggle('on', visible);
        if (visible) {
          resize();
        }
      }
    },
    // 同一文案不重启动画；offsetWidth 强制读布局，使移除再添加 class 能重新播放闪烁。
    setObjective(text) {
      text = text || '';
      if (text !== objectiveText) {
        objectiveText = text;
        objectiveChars = 0;
        objectiveTypeProgress = 0;
        objectiveLabel.textContent = '';
        objectivePanel.classList.toggle('has', !!text);
        objectivePanel.classList.remove('flash');
        objectivePanel.offsetWidth;
        objectivePanel.classList.add('flash');
      }
    },
    /* 中继站总数变化时重建方格，只更新切断数量发生变化的画面。 */ setRelays(done, total) {
      if (!(done === cache.done && total === cache.total)) {
        if (total !== cache.total) {
          relayPips.forEach((ve) => ve.remove());
          relayPips = [];
          for (let ve = 0; ve < total; ve++) {
            let _e = document.createElement('i');
            relayStrip.insertBefore(_e, relayCounter);
            relayPips.push(_e);
          }
        }
        cache.done = done;
        cache.total = total;
        relayPips.forEach((ve, _e) => ve.classList.toggle('cut', _e < done));
        relayCounter.textContent = `${done}/${total}`;
        relayStrip.classList.toggle('all', done >= total && total > 0);
      }
    },
    /* 同时生成指南针标记与世界空间标记；投影规则保持原版。 */ setMarkers(sourceMarkers) {
      for (let ce of markerEntries) {
        ce.cEl.remove();
        ce.wEl.remove();
      }
      markerEntries = (sourceMarkers || []).map((ce) => {
        let ve = createElement(
            'div',
            'h-cm ' + (ce.kind || 'relay'),
            `<i></i><b>${ce.short || ''}</b><span></span>`,
          ),
          _e = createElement(
            'div',
            'h-wm ' + (ce.kind || 'relay'),
            `<i></i><b>${ce.short || ''}</b><span></span>`,
          );
        compassMarkers.appendChild(ve);
        worldMarkersRoot.appendChild(_e);
        return {
          ...ce,
          cEl: ve,
          wEl: _e,
          cDist: ve.querySelector('span'),
          wDist: _e.querySelector('span'),
          lastD: -1,
          lastC: 1e9,
          lastW: '',
          vis: null,
        };
      });
    },
    /* 根据键鼠、触屏或手柄显示操作键，并量化环形进度以减少 DOM 更新。 */ setPrompt(
      text,
      progress = 0,
    ) {
      let visible = !!text;
      if (
        (visible !== cache.promptOn &&
          ((cache.promptOn = visible),
          prompt.classList.toggle('on', visible),
          context.input.setPrompt && context.input.setPrompt(visible)),
        !visible)
      )
        return;
      let key = context.input.touch
        ? 'USE'
        : context.input.gamepad && !context.input.locked
          ? 'Y'
          : 'E';
      if (key !== cache.promptKey) {
        cache.promptKey = key;
        promptKey.textContent = key;
        promptKey.classList.toggle('wide', key.length > 1);
      }
      let label = `Hold ${key} \u2014 ${text}`;
      if (label !== cache.promptText) {
        cache.promptText = label;
        promptLabel.textContent = label;
      }
      let quantizedProgress = Math.round(progress * 200) / 200;
      if (quantizedProgress !== cache.promptT) {
        cache.promptT = quantizedProgress;
        promptRing.setAttribute(
          'stroke-dashoffset',
          (PROMPT_RING_CIRCUMFERENCE * (1 - quantizedProgress)).toFixed(2),
        );
        prompt.classList.toggle('busy', quantizedProgress > 0);
      }
    },
    /** 排队展示无线电字幕；seconds 为展示时长，具体打字推进由 updateRadio 负责。 */
    radio(text, seconds = 4.5) {
      if (text) {
        radioQueue.push({
          text: text,
          secs: seconds,
        });
      }
    },
    clearRadio() {
      radioQueue.length = 0;
      currentRadio = null;
      radioRoot.classList.remove('on');
    },
    warn(text, seconds = 3) {
      warning.textContent = text;
      warningTime = seconds;
      warning.classList.remove('on');
      warning.offsetWidth;
      warning.classList.add('on');
    },
    message(text, seconds = 3) {
      messageRoot.textContent = text || '';
      messageTime = text ? seconds : 0;
      messageRoot.classList.toggle('on', !!text);
    },
    feed(html) {
      let element = createElement('div', 'h-fl', html);
      feedRoot.appendChild(element);
      let entry = {
        el: element,
        life: 4.2,
        weak: false,
      };
      for (feedEntries.push(entry); feedEntries.length > 4;) feedEntries.shift().el.remove();
      return entry;
    },
    hitmarker(kind = 'hit') {
      hitMarker.className = 'h-hit ' + kind;
      let scale = kind === 'weak' || kind === 'kill' ? 1.5 : 1.15;
      try {
        hitMarker.animate(
          [
            {
              opacity: 1,
              transform: `translate(-50%,-50%) scale(${scale})`,
            },
            {
              opacity: 1,
              transform: 'translate(-50%,-50%) scale(1)',
              offset: 0.35,
            },
            {
              opacity: 0,
              transform: 'translate(-50%,-50%) scale(0.92)',
            },
          ],
          {
            duration: kind === 'kill' ? 420 : 240,
            easing: 'ease-out',
          },
        );
      } catch {}
    },
    /* 清空上一局字幕、击杀信息、受击方向和任务提示。 */ reset() {
      radioQueue.length = 0;
      currentRadio = null;
      radioRoot.classList.remove('on');
      for (let k of feedEntries) k.el.remove();
      feedEntries.length = 0;
      for (let k of damageArcs) k.life = 0;
      warningTime = 0;
      warning.classList.remove('on');
      hud.message('');
      hud.setPrompt(null);
      hud.setObjective('');
      cache.hp = -1;
    },
    update: updateHud,
  };
  /* 逐帧更新 HUD；先推进无线电，即使 HUD 隐藏也保持字幕计时。 */
  /** @param {number} dt 当前帧秒数；读取运行态快照并只写入变化的样式/文字。 */
  function updateHud(dt) {
    if ((updateRadio(dt), !shown)) return;
    let player = context.player,
      weapon = context.weapon || {},
      camera = context.camera,
      ads = player.ads || 0,
      headingDegrees = ((-player.yaw * 180) / Math.PI) % 360;
    if (headingDegrees < 0) {
      headingDegrees += 360;
    }
    let tapeOffset =
      Math.round(
        (compassWidth / 2 - (headingDegrees - COMPASS_MIN_DEGREES) * COMPASS_PIXELS_PER_DEGREE) * 2,
      ) / 2;
    if (tapeOffset !== cache.tapeX) {
      cache.tapeX = tapeOffset;
      compassTape.style.transform = `translate3d(${tapeOffset}px,0,0)`;
    }
    let displayHeading = Math.round(headingDegrees) % 360;
    if (displayHeading !== cache.head) {
      cache.head = displayHeading;
      headingLabel.textContent = String(displayHeading).padStart(3, '0');
    }
    let showWorldMarkers = ads < 0.5;
    if (
      (showWorldMarkers !== cache.marksOn &&
        ((cache.marksOn = showWorldMarkers),
        worldMarkersRoot.classList.toggle('off', !showWorldMarkers)),
      markerEntries.length)
    ) {
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      let compassLimit = compassWidth / 2 - 14;
      for (let marker of markerEntries) {
        let deltaX = marker.pos.x - player.pos.x,
          deltaZ = marker.pos.z - player.pos.z,
          distance = Math.round(Math.hypot(deltaX, deltaZ));
        if (distance !== marker.lastD) {
          marker.lastD = distance;
          let distanceLabel = distance + 'm';
          marker.cDist.textContent = distanceLabel;
          marker.wDist.textContent = distanceLabel;
        }
        let relativeHeading = (Math.atan2(deltaX, -deltaZ) * 180) / Math.PI - headingDegrees;
        relativeHeading = ((relativeHeading + 540) % 360) - 180;
        let compassX = Math.round(
          Math.max(
            -compassLimit,
            Math.min(compassLimit, relativeHeading * COMPASS_PIXELS_PER_DEGREE),
          ),
        );
        if (compassX !== marker.lastC) {
          marker.lastC = compassX;
          marker.cEl.style.transform = `translate3d(${compassX}px,0,0)`;
          marker.cEl.classList.toggle('edge', Math.abs(compassX) >= compassLimit);
        }
        projectedMarker
          .set(marker.pos.x, marker.pos.y + (marker.kind === 'extract' ? 1.2 : 1.9), marker.pos.z)
          .project(camera);
        let screenX,
          screenY,
          offscreen = false;
        if (
          (projectedMarker.z > 1 &&
            ((offscreen = true),
            (projectedMarker.x = -projectedMarker.x),
            (projectedMarker.y = -projectedMarker.y)),
          offscreen || Math.abs(projectedMarker.x) > 0.9 || Math.abs(projectedMarker.y) > 0.82)
        ) {
          offscreen = true;
          let edgeScale = Math.max(
            Math.abs(projectedMarker.x) / 0.9,
            Math.abs(projectedMarker.y) / 0.82,
            0.001,
          );
          if (
            ((projectedMarker.x /= edgeScale),
            (projectedMarker.y /= edgeScale),
            projectedMarker.z > 1)
          ) {
            let edgeScale = Math.max(
              Math.abs(projectedMarker.x) / 0.9,
              Math.abs(projectedMarker.y) / 0.82,
            );
            if (edgeScale < 0.999) {
              projectedMarker.x /= edgeScale;
              projectedMarker.y /= edgeScale;
            }
          }
        }
        screenX = Math.round((projectedMarker.x * 0.5 + 0.5) * viewportWidth);
        screenY = Math.round((-projectedMarker.y * 0.5 + 0.5) * viewportHeight);
        let nearCrosshair =
            !offscreen && Math.hypot(projectedMarker.x, projectedMarker.y * 0.6) < 0.16,
          worldCacheKey =
            screenX +
            ',' +
            screenY +
            (offscreen ? 'o' : '') +
            (distance < 3 ? 'n' : '') +
            (nearCrosshair ? 'd' : '');
        if (worldCacheKey !== marker.lastW) {
          marker.lastW = worldCacheKey;
          marker.wEl.style.transform = `translate3d(${screenX}px,${screenY}px,0)`;
          marker.wEl.classList.toggle('offscreen', offscreen);
          marker.wEl.classList.toggle('near', distance < 3);
          marker.wEl.classList.toggle('dim', nearCrosshair);
        }
      }
    }
    let showCrosshair = ads <= 0.6 && player.alive && weapon.state !== 'reloading_hidden';
    if (
      (showCrosshair !== cache.crossOn &&
        ((cache.crossOn = showCrosshair), crosshair.classList.toggle('off', !showCrosshair)),
      showCrosshair)
    ) {
      let spread = typeof weapon.spread == 'number' ? weapon.spread : 0.012,
        halfFovRadians = (camera.fov * Math.PI) / 360,
        crosshairGap =
          (Math.tan(spread) / Math.tan(halfFovRadians)) * (viewportHeight / 2) +
          4 +
          (player.sprinting ? 10 : 0);
      crosshairGap = Math.round(Math.max(4, Math.min(70, crosshairGap)) * 2) / 2;
      if (crosshairGap !== cache.gap) {
        cache.gap = crosshairGap;
        crosshairArms[0].style.transform = `translate3d(-50%,${-crosshairGap}px,0) translateY(-100%)`;
        crosshairArms[1].style.transform = `translate3d(-50%,${crosshairGap}px,0)`;
        crosshairArms[2].style.transform = `translate3d(${-crosshairGap}px,-50%,0) translateX(-100%)`;
        crosshairArms[3].style.transform = `translate3d(${crosshairGap}px,-50%,0)`;
      }
    }
    let magazineSize = Math.max(1, Math.min(60, weapon.magSize | 0 || 30)),
      ammoCount = Math.max(0, weapon.ammo | 0),
      reserveAmmo = Math.max(0, weapon.reserve | 0);
    if (
      (magazineSize !== cache.mag &&
        ((cache.mag = magazineSize),
        (ammoPipsRoot.innerHTML = '<i></i>'.repeat(magazineSize)),
        (ammoPips = [...ammoPipsRoot.children]),
        (cache.ammo = -1)),
      ammoCount !== cache.ammo)
    ) {
      cache.ammo = ammoCount;
      ammoNumber.textContent = String(ammoCount).padStart(2, '0');
      for (let we = 0; we < ammoPips.length; we++)
        ammoPips[we].className = we < ammoCount ? '' : 'off';
    }
    if (reserveAmmo !== cache.reserve) {
      cache.reserve = reserveAmmo;
      reserveNumber.textContent = String(reserveAmmo).padStart(3, '0');
    }
    if (weapon.name !== cache.name) {
      cache.name = weapon.name;
      weaponName.textContent = weapon.name || '';
    }
    let lowAmmo = ammoCount <= Math.ceil(magazineSize * 0.27),
      ammoCue =
        weapon.state === 'reloading'
          ? 'Reloading'
          : ammoCount === 0
            ? reserveAmmo > 0
              ? context.input.touch
                ? 'Reload'
                : 'R \u2014 Reload'
              : 'Empty'
            : lowAmmo
              ? 'Low ammo'
              : '';
    if (ammoCue !== cache.cue) {
      cache.cue = ammoCue;
      ammoCueLabel.textContent = ammoCue;
      ammoCueLabel.className =
        'h-cue' +
        (ammoCue ? ' on' : '') +
        (ammoCount === 0 && weapon.state !== 'reloading' ? ' urgent' : '');
    }
    if (lowAmmo !== cache.low) {
      cache.low = lowAmmo;
      ammoPanel.classList.toggle('low', lowAmmo);
    }
    let health = Math.max(0, Math.ceil(player.health)),
      isHurt = player.health < player.maxHealth - 0.5;
    if (health !== cache.hp) {
      cache.hp = health;
      healthNumber.textContent = String(health);
      let we = Math.ceil((health / player.maxHealth) * healthPips.length);
      if (we !== cache.hpSeg) {
        cache.hpSeg = we;
        for (let be = 0; be < healthPips.length; be++)
          healthPips[be].className = be < we ? '' : 'off';
        healthPanel.classList.toggle('crit', we <= 3);
      }
    }
    if (isHurt !== cache.hurt) {
      cache.hurt = isHurt;
      healthPanel.classList.toggle('on', isHurt);
    }
    for (let arc of damageArcs) {
      if (arc.life <= 0) {
        if (arc.op !== 0) {
          arc.op = 0;
          arc.el.style.opacity = '0';
        }
        continue;
      }
      arc.life -= dt;
      let directionRadians =
          Math.atan2(arc.src.x - player.pos.x, -(arc.src.z - player.pos.z)) + player.yaw,
        rotationDegrees = Math.round((directionRadians * 180) / Math.PI);
      if (rotationDegrees !== arc.rot) {
        arc.rot = rotationDegrees;
        arc.el.style.transform = `translate(-50%,-50%) rotate(${rotationDegrees}deg)`;
      }
      let opacity = Math.round(Math.min(1, Math.max(0, arc.life / 0.6)) * 20) / 20;
      if (opacity !== arc.op) {
        arc.op = opacity;
        arc.el.style.opacity = String(opacity);
      }
    }
    if (objectiveChars < objectiveText.length) {
      objectiveTypeProgress += dt * 46;
      let we = Math.min(objectiveText.length, Math.floor(objectiveTypeProgress));
      if (we !== objectiveChars) {
        objectiveChars = we;
        objectiveLabel.textContent = objectiveText.slice(0, we);
      }
    }
    if (warningTime > 0) {
      warningTime -= dt;
      if (warningTime <= 0) {
        warning.classList.remove('on');
      }
    }
    if (messageTime > 0) {
      messageTime -= dt;
      if (messageTime <= 0) {
        messageRoot.classList.remove('on');
      }
    }
    for (let we = feedEntries.length - 1; we >= 0; we--) {
      let be = feedEntries[we];
      be.life -= dt;
      be.life <= 0
        ? (be.el.remove(), feedEntries.splice(we, 1))
        : be.life < 0.6 && !be.out && ((be.out = true), be.el.classList.add('out'));
    }
  }
  /* 无线电队列按原版速度逐字显示，显示完毕后保留指定秒数。 */
  // 字幕队列按游戏步长推进；开始一条字幕时发 radio:line，供音频系统同步无线电效果。
  function updateRadio(dt) {
    if (!currentRadio) {
      if (!radioQueue.length) return;
      currentRadio = radioQueue.shift();
      radioChars = 0;
      radioTypeProgress = 0;
      radioHoldTime = currentRadio.secs;
      radioText.textContent = '';
      radioRoot.classList.add('on');
      context.events.emit('radio:line', {
        text: currentRadio.text,
      });
    }
    let text = currentRadio.text;
    if (radioChars < text.length) {
      radioTypeProgress += dt * 58;
      let ve = Math.min(text.length, Math.floor(radioTypeProgress));
      if (ve !== radioChars) {
        radioChars = ve;
        radioText.textContent = text.slice(0, ve);
      }
    } else {
      radioHoldTime -= dt;
      if (radioHoldTime <= 0) {
        currentRadio = null;
        if (!radioQueue.length) {
          radioRoot.classList.remove('on');
        }
      }
    }
  }
  resize();
  return hud;
}
export { createHud };
