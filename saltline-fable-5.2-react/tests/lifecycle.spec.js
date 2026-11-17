import { test, expect } from '@playwright/test';

const reactUrl = process.env.REACT_URL || 'http://127.0.0.1:5173';

async function openHarness(page, audio = false) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Count native global subscriptions made by the runtime. React's delegated
    // listeners on its DOM root and its persistent selectionchange hook are not
    // runtime-owned resources and deliberately stay outside this measurement.
    const watchedTypes = new Set([
      'error',
      'keydown',
      'keyup',
      'mousedown',
      'mouseup',
      'mousemove',
      'blur',
      'resize',
      'visibilitychange',
      'pointerlockchange',
      'pointerlockerror',
      'mouseleave',
      'touchstart',
      'touchend',
      'touchcancel',
      'touchmove',
      'contextmenu',
      'fullscreenchange',
      'webkitfullscreenchange',
      'gamepadconnected',
      'gamepaddisconnected',
      'pointerdown',
    ]);
    const subscriptions = [];
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const capture = (options) => (typeof options === 'boolean' ? options : !!options?.capture);
    EventTarget.prototype.addEventListener = function (type, callback, options) {
      if ((this === window || this === document) && watchedTypes.has(type) && callback) {
        const capturing = capture(options);
        if (
          !subscriptions.some(
            (entry) =>
              entry.target === this &&
              entry.type === type &&
              entry.callback === callback &&
              entry.capture === capturing,
          )
        ) {
          subscriptions.push({ target: this, type, callback, capture: capturing });
        }
      }
      return add.call(this, type, callback, options);
    };
    EventTarget.prototype.removeEventListener = function (type, callback, options) {
      const index = subscriptions.findIndex(
        (entry) =>
          entry.target === this &&
          entry.type === type &&
          entry.callback === callback &&
          entry.capture === capture(options),
      );
      if (index >= 0) subscriptions.splice(index, 1);
      return remove.call(this, type, callback, options);
    };
    const audioContexts = [];
    if (window.AudioContext) {
      window.AudioContext = new Proxy(window.AudioContext, {
        construct(target, args) {
          const context = Reflect.construct(target, args);
          audioContexts.push(context);
          return context;
        },
      });
    }
    window.runtimeTracker = {
      audioContexts,
      snapshot() {
        const result = {};
        for (const entry of subscriptions) {
          const key = `${entry.target === window ? 'window' : 'document'}:${entry.type}:${entry.capture}`;
          result[key] = (result[key] || 0) + 1;
        }
        return result;
      },
    };
    HTMLCanvasElement.prototype.requestPointerLock = undefined;
  });
  await page.goto(`${reactUrl}/tests/fixtures/runtime.html?q=test${audio ? '' : '&noaudio=1'}`);
  await page.waitForFunction(() => !!window.runtimeHarness);
  const listenersBefore = await page.evaluate(() => window.runtimeTracker.snapshot());
  return { errors, listenersBefore };
}

test('disposing during renderer initialization settles ready and releases allocated resources', async ({
  page,
}) => {
  const { errors, listenersBefore } = await openHarness(page);
  const result = await page.evaluate(async () => {
    const { startGame, originalConsoleError } = window.runtimeHarness;
    let handle;
    let renderer;
    const observer = new MutationObserver(() => {
      // This progress message is issued after renderer creation and before
      // materials/level creation, while boot still awaits its next task.
      if (document.getElementById('boot-msg').textContent === 'Mixing paint, rust and rain') {
        renderer = window.__G.renderer;
        observer.disconnect();
        handle.dispose();
      }
    });
    observer.observe(document.getElementById('boot-msg'), { childList: true });
    handle = startGame();
    await handle.ready;
    handle.dispose(); // The public cleanup contract is idempotent.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      allocatedRenderer: !!renderer,
      contextLost: renderer?.getContext().isContextLost(),
      contextCleared: !window.__G,
      frames: window.__frames,
      fatal: window.__fatal,
      errors: window.__errors,
      consoleRestored: console.error === originalConsoleError,
      listeners: window.runtimeTracker.snapshot(),
      menus: document.querySelectorAll('.menu').length,
    };
  });
  expect(result).toEqual({
    allocatedRenderer: true,
    contextLost: true,
    contextCleared: true,
    frames: 0,
    fatal: null,
    errors: [],
    consoleRestored: true,
    listeners: listenersBefore,
    menus: 0,
  });
  expect(errors).toEqual([]);
});

test('disposing a running game stops frames, closes audio and removes global listeners and menus', async ({
  page,
}) => {
  const { errors, listenersBefore } = await openHarness(page, true);
  await page.evaluate(async () => {
    window.runtimeHandle = window.runtimeHarness.startGame();
    await window.runtimeHandle.ready;
  });
  await page.waitForFunction(() => window.__ready);
  await expect(page.locator('.menu')).toHaveCount(1);
  expect(await page.evaluate(() => window.runtimeTracker.audioContexts.length)).toBeGreaterThan(0);
  const result = await page.evaluate(async () => {
    const renderer = window.__G.renderer;
    const frames = window.__frames;
    window.runtimeHandle.dispose();
    window.runtimeHandle.dispose();
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      framesStopped: window.__frames === frames,
      contextLost: renderer.getContext().isContextLost(),
      contextCleared: !window.__G,
      ready: window.__ready,
      consoleRestored: console.error === window.runtimeHarness.originalConsoleError,
      listeners: window.runtimeTracker.snapshot(),
      errors: window.__errors,
    };
  });
  expect(result).toEqual({
    framesStopped: true,
    contextLost: true,
    contextCleared: true,
    ready: false,
    consoleRestored: true,
    listeners: listenersBefore,
    errors: [],
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.runtimeTracker.audioContexts.every((context) => context.state === 'closed'),
      ),
    )
    .toBe(true);
  await expect(page.locator('.menu')).toHaveCount(0);
  expect(errors).toEqual([]);
});
