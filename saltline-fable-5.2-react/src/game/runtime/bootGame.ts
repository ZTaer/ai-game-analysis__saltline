import type { BootLifecycle, GameContext, ShowcaseInfo } from '../types.ts';
type SubsystemKey =
  | 'render'
  | 'mats'
  | 'level'
  | 'backdrop'
  | 'ground'
  | 'fx'
  | 'audio'
  | 'weapon'
  | 'enemies'
  | 'hud';
/**
 * 按依赖顺序组装游戏；本文件是系统创建顺序的唯一入口。
 * 先场景/材质、再世界/碰撞、再玩家/武器/敌人、最后任务与菜单。不要并行这些创建步骤：它们共享场景和随机序列。
 * 普通启动保持 title；shot/autostart 才调用 game.start({ skipIntro: true })。
 */
import { defer } from './resources.ts';
import * as THREE from 'three';
import { PlaneGeometry, Vector3 } from 'three';
import { selectQuality } from '../config.ts';
import { createEventBus } from '../core/events.ts';
import { createRandom } from '../core/random.ts';
import { fallbacks } from '../core/fallbacks.js';
import { createMesh } from '../core/geometry.js';
import { createRenderer } from '../render/renderer.js';
import { createMaterials } from '../materials/materials.js';
import { createPhysics } from '../physics/physics.js';
import { createProps } from '../props/props.js';
import { createLevel } from '../level/level.js';
import { createBackdrop } from '../backdrop/backdrop.js';
import { createGround } from '../ground/ground.js';
import { createEffects } from '../effects/effects.js';
import { createAudio } from '../audio/audio.js';
import { createInput } from '../input/input.js';
import { createPlayer } from '../player/player.js';
import { createCombat } from '../combat/combat.js';
import { createWeapon } from '../weapon/weapon.js';
import { createEnemies } from '../enemies/enemies.js';
import { createHud } from '../hud/hud.js';
import { createGame } from '../gameplay/gameFlow.js';
import '../props/register.js';
import { showcases, createShowcaseInput, createShowcasePlayer } from './debug/showcases.js';
import { createBenchmark } from './debug/benchmark.js';
import { createShotCamera } from './debug/shotCamera.js';
import { startFrameLoop } from './frameLoop.ts';
/**
 * @param {object} lifecycle 本实例的生命周期回调，不向 React 暴露引擎内部状态。
 * @param {() => void} lifecycle.assertActive 在异步阶段间检查是否已卸载。
 * @param {(context: object) => void} lifecycle.setContext 尽早发布部分创建的上下文，便于失败/卸载清理。
 * @param {(error: unknown) => void} lifecycle.reportFatal 保留原版失败面板。
 * @param {{element: HTMLElement, update: (message: string, progress: number) => Promise<void>}} lifecycle.bootScreen
 * @returns {Promise<void>}
 */
export async function bootGame({
  assertActive,
  setContext,
  reportFatal,
  bootScreen,
}: BootLifecycle): Promise<void> {
  const updateBootProgress = bootScreen.update;
  const bootElement = bootScreen.element;
  let params = Object.fromEntries(new URLSearchParams(location.search)),
    benchmarkEnabled = !!params.bench || location.hash === '#bench';
  if (benchmarkEnabled) {
    params.noaudio = '1';
    params.autostart = '1';
  }
  // 所有工厂共享同一个可逐步补齐的对象；工厂构造阶段不得使用尚未创建的系统。
  // 此处是旧 JS 引擎的装配边界：完成后才交给帧循环，清理端始终按 BootContext 处理。
  let gameContext = {
    THREE: THREE,
    params: params,
    events: createEventBus(),
    rng: createRandom(+(params.seed || 4207)),
    time: {
      t: 0,
      dt: 0,
      frame: 0,
      real: 0,
    },
    quality: selectQuality(params.q || (params.shot ? 'test' : '')),
  } as GameContext;
  setContext(gameContext);
  window.__G = gameContext;
  let showcaseName = params.show && showcases[params.show] ? params.show : null;
  gameContext.showcase = showcaseName;
  const shotController = createShotCamera(gameContext);
  const setShot = shotController.setShot;
  window.__setShot = setShot;
  // label 是原加载接口保留的描述参数；key 决定上下文字段与可选降级工厂。
  // JS 工厂和降级表在边界处断言返回契约，实际行为继续由浏览器回归约束。
  async function loadSubsystem<K extends SubsystemKey>(
    key: K,
    label: string,
    create: () => unknown,
    required = false,
  ) {
    let startedAt = performance.now();
    try {
      gameContext[key] = (await create()) as GameContext[K];
    } catch (x) {
      console.error(
        `[boot] module "${key}" failed: ${(x && (x as { stack?: unknown }).stack) || x}`,
      );
      if (required || !fallbacks[key as keyof typeof fallbacks]) throw x;
      gameContext[key] = fallbacks[key as keyof typeof fallbacks]() as unknown as GameContext[K];
    }
    assertActive();
    let durationMs = performance.now() - startedAt;
    if (durationMs > 150) {
      console.log(`[boot] ${key} ${durationMs.toFixed(0)}ms`);
    }
  }
  // 阶段 1：渲染与材质。renderer 是 Three 实例，render 是本项目带后处理的封装。
  await updateBootProgress('Waking the renderer', 0.04);
  await loadSubsystem('render', 'render', () => createRenderer(gameContext), true);
  gameContext.renderer = gameContext.render.renderer;
  gameContext.scene = gameContext.render.scene;
  gameContext.camera = gameContext.render.camera;
  gameContext.viewCamera = gameContext.render.viewCamera;
  await updateBootProgress('Mixing paint, rust and rain', 0.12);
  await loadSubsystem('mats', 'materials', () => createMaterials(gameContext));
  gameContext.physics = createPhysics(gameContext);
  gameContext.props = createProps(gameContext);
  gameContext.input = showcaseName ? createShowcaseInput() : createInput(gameContext);
  if (showcaseName) {
    // 展示模式使用简化世界和占位接口；保留各展示自身的相机与更新方法。
    let h = createMesh(
      new PlaneGeometry(80, 80).rotateX(-Math.PI / 2),
      gameContext.mats.get('concrete'),
      {
        cast: false,
      },
    );
    gameContext.scene.add(h);
    gameContext.level = {
      stub: true,
      playerStart: {
        pos: new Vector3(0, 0, 4),
        yaw: 0,
      },
      objectives: [],
      enemySpawns: [],
      zones: [],
      interiorBoxes: [],
      cinematicPath: [],
      extraction: {
        pos: new Vector3(),
        radius: 2,
      },
      groundSurfaceAt: () => 'concrete',
      update() {},
    };
    gameContext.backdrop = fallbacks.backdrop();
    gameContext.ground = fallbacks.ground();
    gameContext.physics.build();
    if (showcaseName === 'fx') await loadSubsystem('fx', 'fx', () => createEffects(gameContext));
    else
      try {
        gameContext.fx = await createEffects(gameContext);
      } catch {
        gameContext.fx = fallbacks.fx();
      }
    gameContext.audio = fallbacks.audio();
    gameContext.hud = fallbacks.hud();
    gameContext.player = createShowcasePlayer(gameContext);
    gameContext.combat = createCombat(gameContext);
    gameContext.weapon = fallbacks.weapon();
    gameContext.enemies = fallbacks.enemies();
    gameContext.game = {
      state: 'showcase',
      update: () => false,
      start() {},
    };
    let f: ShowcaseInfo | void | null = null;
    try {
      f = await showcases[showcaseName].showcase(gameContext);
    } catch (p) {
      reportFatal(
        `showcase "${showcaseName}" threw: ${(p && (p as { stack?: unknown }).stack) || p}`,
      );
    }
    gameContext.showcaseInfo = f || {};
    if (f && f.cam) {
      setShot({
        cam: [...f.cam, ...(f.target || [0, 1, 0])].join(','),
      });
    }
  } else {
    // 阶段 2：完整世界。实体构造完再 build，物理数据才能覆盖关卡碰撞体。
    await updateBootProgress('Stacking containers', 0.34);
    await loadSubsystem('level', 'level', () => createLevel(gameContext), true);
    await updateBootProgress('Raising the cranes', 0.5);
    await loadSubsystem('backdrop', 'backdrop', () => createBackdrop(gameContext));
    await updateBootProgress('Flooding the apron', 0.58);
    await loadSubsystem('ground', 'ground', () => createGround(gameContext));
    if (gameContext.ground.stub) {
      let h = createMesh(
        new PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
        gameContext.mats.get('asphalt'),
        {
          cast: false,
        },
      );
      gameContext.scene.add(h);
    }
    gameContext.physics.build();
    await updateBootProgress('Loading tracers and smoke', 0.66);
    await loadSubsystem('fx', 'fx', () => createEffects(gameContext));
    await loadSubsystem('audio', 'audio', () =>
      params.noaudio ? fallbacks.audio() : createAudio(gameContext),
    );
    // 阶段 3：玩法系统；任务最后创建，才能同时控制玩家、武器、HUD 和菜单。
    gameContext.player = createPlayer(gameContext);
    gameContext.combat = createCombat(gameContext);
    await updateBootProgress('Checking the rifle', 0.74);
    await loadSubsystem('weapon', 'weapon', () => createWeapon(gameContext));
    await updateBootProgress('Waking the Harbormaster', 0.82);
    await loadSubsystem('enemies', 'enemies', () => createEnemies(gameContext));
    await loadSubsystem('hud', 'hud', () => createHud(gameContext));
    gameContext.game = createGame(gameContext) as GameContext['game'];
  }
  // 阶段 4：环境探针与 Shader 预编译；音频非必需资源仍在后台逐批生成。
  await updateBootProgress('Waiting for first light', 0.92);
  try {
    await gameContext.render.onLevelReady();
  } catch (h) {
    console.error(
      '[boot] render.onLevelReady failed: ' + ((h && (h as { stack?: unknown }).stack) || h),
    );
  }
  const frameStats = {
    averageFrameSeconds: 0,
  };
  window.__stats = () => ({
    ...(gameContext.render.stats ? gameContext.render.stats() : {}),
    fps: frameStats.averageFrameSeconds ? +(1 / frameStats.averageFrameSeconds).toFixed(1) : 0,
    state: gameContext.game && gameContext.game.state,
  });
  if (params.cam) {
    setShot(params);
  }
  if (params.fov) {
    setShot({
      fov: params.fov,
    });
  }
  if (!showcaseName && (params.shot || params.autostart))
    try {
      gameContext.game.start({
        skipIntro: true,
      });
    } catch (h) {
      console.error('[boot] game.start failed', h);
    }
  if (params.noweapon && gameContext.weapon.setVisible) {
    gameContext.weapon.setVisible(false);
  }
  if (benchmarkEnabled) {
    createBenchmark(gameContext);
  }
  await updateBootProgress('Ready', 1);
  bootElement.classList.add('done');
  defer(() => {
    bootElement.hidden = true;
  }, 700);
  startFrameLoop(gameContext, {
    params,
    showcaseName,
    getShotCamera: shotController.getCamera,
    frameStats,
  });
}
