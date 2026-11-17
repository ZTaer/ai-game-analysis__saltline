import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFrameLoop } from '../src/game/runtime/frameLoop.js';

// 无 GPU 的流程测试：固定时钟，观察各子系统被调用的实际顺序和时间步。
function createHarness(t, { state = 'playing', params = {}, getShotCamera = () => null } = {}) {
  const previousWindow = globalThis.window;
  globalThis.window = { __frames: 0, __ready: false };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  let now = 1000;
  t.mock.method(performance, 'now', () => now);
  const calls = [];
  let frame;
  const context = {
    time: { t: 0, dt: 0, real: 0, frame: 0 },
    game: {
      state,
      update(dt) {
        calls.push(['game', dt]);
        return true;
      },
    },
    renderer: {
      setAnimationLoop(callback) {
        frame = callback;
      },
    },
    render: {
      frame(dt) {
        calls.push(['render', dt]);
      },
    },
    camera: {
      position: {
        copy(value) {
          calls.push(['camera-position', value]);
        },
      },
      lookAt(value) {
        calls.push(['camera-look', value]);
      },
    },
  };
  for (const name of [
    'input',
    'player',
    'weapon',
    'enemies',
    'fx',
    'ground',
    'level',
    'backdrop',
    'mats',
    'audio',
    'hud',
  ]) {
    context[name] = {
      update(dt) {
        calls.push([name, dt]);
      },
    };
  }
  context.input.endFrame = () => calls.push(['endFrame']);
  const frameStats = { averageFrameSeconds: 0 };
  startFrameLoop(context, { params, showcaseName: null, getShotCamera, frameStats });
  return {
    context,
    calls,
    frameStats,
    tick(milliseconds = 16) {
      now += milliseconds;
      frame();
    },
  };
}

test('ordinary frames keep input, mission, actors, feedback, rendering and input cleanup in order', (t) => {
  const game = createHarness(t);
  game.tick(100); // 模拟卡顿：逻辑只推进原版上限 50ms，FPS 仍统计真实 100ms。
  assert.deepEqual(
    game.calls.map(([name]) => name),
    [
      'input',
      'game',
      'player',
      'weapon',
      'enemies',
      'fx',
      'ground',
      'level',
      'backdrop',
      'mats',
      'audio',
      'hud',
      'render',
      'endFrame',
    ],
  );
  assert.equal(game.context.time.dt, 0.05);
  assert.equal(game.frameStats.averageFrameSeconds, 0.1);
  assert.equal(window.__ready, false);
  game.tick();
  assert.equal(window.__frames, 2);
  assert.equal(window.__ready, true);
});

test('paused frames keep UI/audio/render active but stop actors and world updates', (t) => {
  const game = createHarness(t, { state: 'paused' });
  game.tick();
  assert.deepEqual(
    game.calls.map(([name]) => name),
    ['input', 'game', 'audio', 'hud', 'render', 'endFrame'],
  );
});

test('a pause requested by the mission takes effect before actors are updated in the same frame', (t) => {
  const game = createHarness(t);
  game.context.game.update = (dt) => {
    game.calls.push(['game', dt]);
    game.context.game.state = 'paused';
    return false;
  };
  game.tick();
  assert.deepEqual(
    game.calls.map(([name]) => name),
    ['input', 'game', 'audio', 'hud', 'render', 'endFrame'],
  );
});

test('debug dt and camera changes are read without replacing the running loop', (t) => {
  let shot = null;
  const game = createHarness(t, { params: { dt: '0.02' }, getShotCamera: () => shot });
  game.tick(100);
  assert.equal(game.context.time.dt, 0.02);
  assert.equal(game.frameStats.averageFrameSeconds, 0.1);
  shot = { pos: { x: 1 }, look: { z: 2 } };
  game.calls.length = 0;
  game.tick();
  assert.deepEqual(game.calls.slice(-4), [
    ['camera-position', shot.pos],
    ['camera-look', shot.look],
    ['render', 0.02],
    ['endFrame'],
  ]);
});
