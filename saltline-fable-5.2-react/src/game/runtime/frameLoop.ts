import type { GameContext, FrameOptions } from '../types.ts';
type UpdatableKey =
  | 'input'
  | 'player'
  | 'weapon'
  | 'enemies'
  | 'fx'
  | 'ground'
  | 'level'
  | 'backdrop'
  | 'mats'
  | 'audio'
  | 'hud';
type SafeUpdater = ((key: UpdatableKey, dt: number) => void) & {
  err: Partial<Record<UpdatableKey | 'game' | 'sc' | 'render', number>>;
};
/**
 * 游戏唯一帧循环。更新顺序属于玩法约定：输入 → 任务 → 玩家/武器/敌人 → 环境 → 音频/HUD → 渲染 → 清输入边沿。
 * 暂停保留音频、HUD、渲染更新；dt 默认上限 50ms，URL dt 覆盖保留用于回归。
 * @param {object} gameContext 所有已初始化子系统的共享对象。
 * @param {object} options 本实例的启动参数、镜头读取函数和 FPS 统计容器。
 */
export function startFrameLoop(
  gameContext: GameContext,
  { params, showcaseName, getShotCamera, frameStats }: FrameOptions,
) {
  let previousFrameTime = performance.now(),
    weaponWetness = 1,
    updateSubsystem: SafeUpdater = ((key: UpdatableKey, deltaSeconds: number) => {
      let system = gameContext[key];
      if (system && system.update)
        try {
          system.update(deltaSeconds);
        } catch (d) {
          if (!updateSubsystem.err[key]) {
            updateSubsystem.err[key] = 1;
            console.error(
              `[loop] ${key}.update threw: ${(d && (d as { stack?: unknown }).stack) || d}`,
            );
          }
        }
    }) as SafeUpdater;
  updateSubsystem.err = {};
  gameContext.renderer.setAnimationLoop(() => {
    let now = performance.now(),
      realDeltaSeconds = (now - previousFrameTime) / 1e3;
    previousFrameTime = now;
    // FPS 使用真实帧耗时；模拟使用截断后的 dt，两者不能混用。
    frameStats.averageFrameSeconds = frameStats.averageFrameSeconds
      ? frameStats.averageFrameSeconds * 0.95 + realDeltaSeconds * 0.05
      : realDeltaSeconds;
    let deltaSeconds = Math.min(realDeltaSeconds, 0.05);
    if (params.dt) {
      deltaSeconds = +params.dt;
    }
    gameContext.time.dt = deltaSeconds;
    gameContext.time.t += deltaSeconds;
    gameContext.time.real = now / 1e3;
    gameContext.time.frame++;
    // 先消费浏览器输入，再推进任务；任务可能在这一帧切换暂停或结束状态。
    updateSubsystem('input', deltaSeconds);
    let simulate = false;
    try {
      simulate =
        gameContext.game.update(deltaSeconds) !== false &&
        gameContext.game.state !== 'title' &&
        gameContext.game.state !== 'paused';
    } catch (v) {
      if (!updateSubsystem.err.game) {
        updateSubsystem.err.game = 1;
        console.error(
          '[loop] game.update threw: ' + ((v && (v as { stack?: unknown }).stack) || v),
        );
      }
    }
    if (showcaseName) {
      if (gameContext.showcaseInfo.update)
        try {
          gameContext.showcaseInfo.update(deltaSeconds);
        } catch (v) {
          if (!updateSubsystem.err.sc) {
            updateSubsystem.err.sc = 1;
            console.error(
              '[loop] showcase update threw: ' + ((v && (v as { stack?: unknown }).stack) || v),
            );
          }
        }
    } else {
      if (simulate) {
        updateSubsystem('player', deltaSeconds);
        updateSubsystem('weapon', deltaSeconds);
        updateSubsystem('enemies', deltaSeconds);
      }
    }
    if (
      gameContext.weapon &&
      gameContext.weapon.setWetness &&
      gameContext.level &&
      gameContext.level.interiorBoxes &&
      gameContext.level.interiorBoxes[0]
    ) {
      // 室内逐渐变干，室外逐渐被雨淋湿；原边界判定和插值速度保持不变。
      let v = gameContext.level.interiorBoxes[0],
        g = gameContext.camera.position,
        x = g.x > v.min.x && g.x < v.max.x && g.z > v.min.z && g.z < v.max.z && g.y < v.max.y;
      weaponWetness +=
        ((x ? 0.3 : 1) - weaponWetness) * Math.min(1, deltaSeconds * (x ? 0.25 : 0.6));
      try {
        gameContext.weapon.setWetness(weaponWetness);
      } catch {}
    }
    if (gameContext.game.state !== 'paused') {
      updateSubsystem('fx', deltaSeconds);
      updateSubsystem('ground', deltaSeconds);
      updateSubsystem('level', deltaSeconds);
      updateSubsystem('backdrop', deltaSeconds);
      updateSubsystem('mats', deltaSeconds);
    }
    // 暂停仍需音频状态同步、菜单/HUD 和画面输出，不停止整个动画循环。
    updateSubsystem('audio', deltaSeconds);
    updateSubsystem('hud', deltaSeconds);
    const shotCamera = getShotCamera();
    if (shotCamera) {
      gameContext.camera.position.copy(shotCamera.pos);
      gameContext.camera.lookAt(shotCamera.look);
    }
    if (gameContext.bench) {
      gameContext.bench.frame(realDeltaSeconds);
    }
    try {
      gameContext.render.frame(deltaSeconds);
    } catch (v) {
      if (!updateSubsystem.err.render) {
        updateSubsystem.err.render = 1;
        console.error(
          '[loop] render.frame threw: ' + ((v && (v as { stack?: unknown }).stack) || v),
        );
      }
    }
    // 所有系统消费过本帧输入后，才清理 pressed 等一次性边沿状态。
    if (gameContext.input.endFrame) {
      gameContext.input.endFrame();
    }
    window.__frames++;
    if (window.__frames === 2) {
      window.__ready = true;
    }
  });
}
