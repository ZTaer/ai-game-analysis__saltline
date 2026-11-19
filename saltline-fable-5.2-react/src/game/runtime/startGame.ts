import type { BootContext, GameHandle } from '../types.ts';
/**
 * React 与游戏运行时的生命周期边界；每页只保留一个活动实例。
 */
import { beginResources, releaseGame } from './resources.ts';
import { bootGame } from './bootGame.ts';
import { createBootScreen } from './bootScreen.ts';
import { installDiagnostics } from './diagnostics.ts';
let activeGame: GameHandle | null = null;
/**
 * 创建运行句柄。ready 在初始化并安装帧循环后结算，不等待玩家进入任务或全部音效合成。
 * @returns {{ready: Promise<void>, dispose: () => void}}
 */
export function startGame(): GameHandle {
  activeGame?.dispose();
  const resources = beginResources();
  const originalConsoleError = console.error;
  let disposed = false;
  let bootFinished = false;
  let context: BootContext | null = null;
  const assertActive = () => {
    if (disposed) throw new DOMException('Game unmounted', 'AbortError');
  };
  const bootScreen = createBootScreen(assertActive);
  const diagnostics = installDiagnostics(originalConsoleError);
  const ready = bootGame({
    assertActive,
    setContext(value) {
      context = value;
    },
    reportFatal: diagnostics.reportFatal,
    bootScreen,
  })
    .catch((error) => {
      if (disposed) return;
      diagnostics.reportFatal(error?.stack || error);
      throw error;
    })
    .finally(() => {
      // 创建子系统可能已经进入异步过程；等它结算后再释放，避免资源创建与销毁交错。
      bootFinished = true;
      if (disposed) releaseGame(context);
    });
  const instance = {
    ready,
    dispose() {
      // 幂等：React 卸载与下一次启动均可能请求销毁同一实例。
      if (disposed) return;
      disposed = true;
      context?.renderer?.setAnimationLoop(null);
      resources.dispose();
      diagnostics.restoreConsole();
      if (bootFinished) releaseGame(context);
      if (activeGame === instance) activeGame = null;
      if (window.__G === context) {
        window.__ready = false;
        delete window.__G;
        delete window.__stats;
        delete window.__setShot;
      }
    },
  };
  activeGame = instance;
  return instance;
}
