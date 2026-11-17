import { useEffect } from 'react';
import { startGame } from './game/runtime/startGame.js';

/**
 * React 与游戏引擎的生命周期边界。
 * DOM 挂载后才创建游戏，确保引擎能够取得 #view/#ui/#boot；卸载时释放同一实例。
 * 镜头、武器矩阵与 HUD 的逐帧数据留在引擎内，避免每帧驱动 React 更新。
 */
export function App() {
  // 空依赖数组使一次挂载只启动一次；重新挂载时仍会创建新的运行实例。
  useEffect(() => {
    const game = startGame();
    // 运行句柄的 ready 只表示初始化完成；启动错误已由引擎显示，这里接住 Promise 拒绝。
    game.ready.catch(() => {});
    return () => game.dispose();
  }, []);

  // 这些 id 是渲染器、HUD、菜单与加载进度共同使用的挂载约定；修改时需同步调用方。
  return (
    <div id="app">
      <canvas id="view" tabIndex={0} />
      <div id="ui" />
      <div id="boot">
        <div className="boot-mark">SALTLINE</div>
        <div className="boot-sub" id="boot-msg">
          Raising the terminal
        </div>
        <div className="boot-bar">
          <i id="boot-fill" />
        </div>
      </div>
    </div>
  );
}
