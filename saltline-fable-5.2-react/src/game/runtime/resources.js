/** 一个页面只运行一个游戏实例；集中回收原版散落的浏览器副作用。 */
let currentResources = null;

/**
 * 开始一次运行资源收集；再次调用会先清理前一次收集的副作用。
 * add(cleanup) 返回“取消登记”的函数，不会立刻执行 cleanup。
 * @returns {{disposed: boolean, add: (cleanup: () => void) => (() => void), dispose: () => void}}
 */
export function beginResources() {
  currentResources?.dispose();
  const cleanups = new Set();
  const resources = {
    disposed: false,
    add(cleanup) {
      if (resources.disposed) cleanup();
      else cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    },
    dispose() {
      if (resources.disposed) return;
      resources.disposed = true;
      // 后创建的资源通常依赖先创建的资源，按登记的逆序释放。
      for (const cleanup of [...cleanups].reverse()) {
        try {
          cleanup();
        } catch (error) {
          console.warn('[dispose]', error);
        }
      }
      cleanups.clear();
      if (currentResources === resources) currentResources = null;
    },
  };
  currentResources = resources;
  return resources;
}

/** 用同一监听函数和 capture/options 注册清理；保持浏览器原有事件派发语义。 */
export function listen(target, type, callback, options) {
  target.addEventListener(type, callback, options);
  currentResources?.add(() => target.removeEventListener(type, callback, options));
}

/**
 * 属于当前游戏实例的延迟任务；回调执行前解除登记，销毁实例时取消未执行任务。
 * 等待启动流程继续的 Promise 不使用它，见 bootScreen.js 的 nextTask。
 * @param {Function} callback
 * @param {number} delay 毫秒，沿用 setTimeout 的单位。
 */
export function defer(callback, delay, ...args) {
  const resources = currentResources;
  let forget = () => {};
  const id = setTimeout(() => {
    forget();
    if (!resources?.disposed) callback(...args);
  }, delay);
  forget = resources?.add(() => clearTimeout(id)) || forget;
  return id;
}

/** 登记真实 AudioContext 的所有权；销毁时关闭上下文，释放其活动音源与设备资源。 */
export function ownAudioContext(context) {
  currentResources?.add(() => {
    if (context.state !== 'closed') void context.close().catch(() => {});
  });
  return context;
}

/** 共享材质/纹理只释放一次；forceContextLoss 释放内部渲染目标占用的 GPU 内存。 */
export function releaseGame(context) {
  if (!context) return;
  context.renderer?.setAnimationLoop(null);
  context.input?.exitLock?.();
  // App 的清理可能处于 React 提交阶段；将嵌套菜单根的卸载推迟到微任务。
  queueMicrotask(() => context.game?.menus?.dispose?.());
  const released = new Set();
  function release(value) {
    if (!value || released.has(value)) return;
    released.add(value);
    if (Array.isArray(value)) {
      value.forEach(release);
      return;
    }
    if (value.isMaterial) {
      for (const item of Object.values(value)) if (item?.isTexture) release(item);
      for (const uniform of Object.values(value.uniforms || {})) {
        if (uniform?.value?.isTexture) release(uniform.value);
      }
    }
    value.dispose?.();
  }
  context.scene?.traverse((object) => {
    release(object.geometry);
    release(object.material);
  });
  release(context.scene?.environment);
  release(context.scene?.background);
  context.events?.clear?.();
  context.renderer?.dispose();
  context.renderer?.forceContextLoss();
}
