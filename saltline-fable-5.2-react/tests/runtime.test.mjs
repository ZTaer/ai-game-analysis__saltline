import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginResources, defer, listen, ownAudioContext } from '../src/game/runtime/resources.js';

test('disposing a runtime removes listeners, cancels callbacks, and closes its audio context once', async () => {
  const resources = beginResources();
  const target = new EventTarget();
  let calls = 0;
  let closed = 0;
  listen(target, 'input', () => calls++);
  ownAudioContext({
    state: 'running',
    close() {
      closed++;
      return Promise.resolve();
    },
  });
  target.dispatchEvent(new Event('input'));
  assert.equal(calls, 1);
  defer(() => calls++, 5);
  resources.dispose();
  resources.dispose();
  target.dispatchEvent(new Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
  assert.equal(closed, 1);
});

test('a replacement runtime disposes the previous listeners without removing its own', () => {
  const target = new EventTarget();
  const first = beginResources();
  let firstCalls = 0;
  let secondCalls = 0;
  listen(target, 'input', () => firstCalls++);
  const second = beginResources();
  listen(target, 'input', () => secondCalls++);
  first.dispose();
  target.dispatchEvent(new Event('input'));
  assert.equal(firstCalls, 0);
  assert.equal(secondCalls, 1);
  second.dispose();
});
