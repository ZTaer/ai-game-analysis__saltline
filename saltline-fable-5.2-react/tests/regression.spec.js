import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const originalUrl = process.env.ORIGINAL_URL || 'http://127.0.0.1:8731';
const reactUrl = process.env.REACT_URL || 'http://127.0.0.1:5173';
const targets = [
  ['original', originalUrl],
  ['react', reactUrl],
];

async function openGame(
  browser,
  url,
  { query = '', mobile = false, deterministic = false, audio = false } = {},
) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Exercise the game's supported drag fallback; headless pointer capture is not
  // representative of a physical mouse and makes menu clicks platform dependent.
  await page.addInitScript(
    ({ deterministic }) => {
      HTMLCanvasElement.prototype.requestPointerLock = undefined;
      if (!deterministic) return;
      window.__fontTrace = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (...args) {
        window.__fontTrace.push({
          text: String(args[0]),
          font: this.font,
          available: document.fonts.check(this.font),
        });
        return fillText.apply(this, args);
      };
      let seed = 4207;
      Math.random = () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
      performance.now = () => 1000;
      const requestFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        requestFrame((timestamp) => {
          if (window.__frames >= 4 && window.__G?.renderer) {
            window.__G.renderer.setAnimationLoop(null);
            return;
          }
          callback(timestamp);
        });
    },
    { deterministic },
  );
  await page.goto(
    `${url}/?q=test&${audio ? '' : 'noaudio=1&'}seed=4207&dt=0.05${query ? `&${query}` : ''}`,
  );
  expect(errors, 'JavaScript module initialization errors').toEqual([]);
  await page.waitForFunction(() => window.__ready || window.__fatal, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.__fatal)).toBeNull();
  if (deterministic) await page.waitForFunction(() => window.__frames === 4);
  await page.evaluate(() => window.__G.renderer.setAnimationLoop(null));
  await expect(page.locator('#boot')).toHaveClass('done');
  await expect(page.locator('#boot')).toHaveCSS('opacity', '0');
  return { context, page, errors };
}

// Simulate gameplay in the same order as the original animation loop, without
// GPU rendering between every physics tick. Browser keyboard events still feed
// the real input system. Pixel comparisons use the real animation loop instead.
async function advance(page, frames, dt = 0.05) {
  await page.evaluate(
    ({ frames, dt }) => {
      const game = window.__G;
      for (let frame = 0; frame < frames; frame++) {
        game.time.dt = dt;
        game.time.t += dt;
        game.time.frame++;
        game.input.update(dt);
        const active =
          game.game.update(dt) !== false && !['title', 'paused'].includes(game.game.state);
        if (active) {
          game.player.update(dt);
          game.weapon.update(dt);
          game.enemies.update(dt);
        }
        game.audio.update(dt);
        game.hud.update(dt);
        game.input.endFrame();
      }
    },
    { frames, dt },
  );
}

async function press(page, key, frames = 1) {
  await page.keyboard.down(key);
  await advance(page, frames);
  await page.keyboard.up(key);
  await advance(page, 1);
}

async function readErrors(page, pageErrors) {
  return [...pageErrors, ...(await page.evaluate(() => window.__errors || []))];
}

test('title, settings, controls, focus and persisted settings match the original', async ({
  browser,
}) => {
  const snapshots = [];
  for (const [name, url] of targets) {
    const { context, page, errors } = await openGame(browser, url);
    await expect(page.locator('.menu')).toHaveAttribute('data-screen', 'title');
    const studioCredit = '万我工作室 · React 工程化重构与维护';
    let title = await page.locator('[data-s="title"]').innerText();
    if (name === 'react') {
      await expect(page.locator('.m-studio-credit')).toHaveText(studioCredit);
      await expect(page.locator('.m-studio-credit')).toBeVisible();
      // 只移除新增声明及它的段落分隔；其余标题文字和空白仍与原版严格对照。
      const creditSuffix = `\n\n${studioCredit}`;
      expect(title.endsWith(creditSuffix)).toBe(true);
      title = title.slice(0, -creditSuffix.length);
    }
    await page.locator('[data-s="title"] [data-act="settings"]').click();
    await expect(page.locator('.panel')).toBeVisible();
    await expect(page.locator('.panel')).toBeFocused();
    await page.locator('#s-sens').fill('1.75');
    await page.locator('#s-vol').fill('37');
    await page.locator('#s-fov').fill('83');
    await page.locator('[data-act="invert"]').click();
    await expect(page.locator('[data-o="sens"]')).toHaveText('1.75×');
    await expect(page.locator('[data-o="vol"]')).toHaveText('37%');
    await expect(page.locator('[data-o="fov"]')).toHaveText('83°');
    await page.locator('[data-tab="controls"]').click();
    await expect(page.locator('[data-pane="controls"]')).toBeVisible();
    const controls = await page.locator('[data-pane="controls"]').innerText();
    await page.locator('[data-act="close-panel"]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-tab="settings"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-act="close-panel"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.panel')).toBeHidden();
    await expect(page.locator('[data-s="title"] [data-act="settings"]')).toBeFocused();
    const settings = await page.evaluate(() => ({
      saved: JSON.parse(localStorage.getItem('saltline.settings.v1')),
      sensitivity: window.__G.input.sensitivity,
      invertY: window.__G.input.invertY,
    }));
    expect(settings.sensitivity).toBe(1.75);
    expect(settings.invertY).toBe(true);
    await page.reload();
    expect(errors, 'JavaScript module initialization errors').toEqual([]);
    await page.waitForFunction(() => window.__ready || window.__fatal, null, { timeout: 180_000 });
    await page.evaluate(() => window.__G.renderer.setAnimationLoop(null));
    expect(await page.evaluate(() => window.__G.game.menus.settings)).toEqual(settings.saved);
    expect(await readErrors(page, errors), `${name} runtime errors`).toEqual([]);
    snapshots.push({ title, controls, settings });
    await context.close();
  }
  expect(snapshots[1]).toEqual(snapshots[0]);
});

test('deploy, movement, aim, fire, reload, pause, death, retry and extraction match', async ({
  browser,
}) => {
  const snapshots = [];
  for (const [name, url] of targets) {
    const { context, page, errors } = await openGame(browser, url);
    await page.locator('[data-act="deploy"]').click();
    expect(await page.evaluate(() => window.__G.game.state)).toBe('intro');
    await advance(page, 72);
    expect(await page.evaluate(() => window.__G.game.state)).toBe('playing');
    await page.evaluate(() => {
      window.__G.player.invulnerable = true;
      window.__G.enemies.clear();
    });
    const startPosition = await page.evaluate(() => window.__G.player.pos.toArray());
    await press(page, 'w', 12);
    const movedPosition = await page.evaluate(() => window.__G.player.pos.toArray());
    expect(movedPosition).not.toEqual(startPosition);
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'right' });
    await advance(page, 10);
    expect(await page.evaluate(() => window.__G.player.ads)).toBeGreaterThan(0.8);
    await page.mouse.up({ button: 'right' });
    await advance(page, 10);
    await press(page, 'Enter', 10);
    const firedAmmo = await page.evaluate(() => window.__G.weapon.ammo);
    expect(firedAmmo).toBeLessThan(30);
    await press(page, 'r');
    await advance(page, 65);
    expect(await page.evaluate(() => window.__G.weapon.ammo)).toBe(30);
    await page.evaluate(() => window.__G.game.pause());
    await expect(page.locator('.menu')).toHaveAttribute('data-screen', 'paused');
    await page.locator('[data-act="resume"]').click();
    expect(await page.evaluate(() => window.__G.game.state)).toBe('playing');
    await page.evaluate(() => {
      window.__G.player.invulnerable = false;
      window.__G.player.damage(1000, null);
    });
    await advance(page, 35);
    await expect(page.locator('.menu')).toHaveAttribute('data-screen', 'dead');
    await page.locator('[data-act="retry"]').click();
    await advance(page, 28);
    expect(await page.evaluate(() => window.__G.game.state)).toBe('playing');
    expect(await page.evaluate(() => window.__G.game.run.retries)).toBe(1);
    await page.evaluate(() => {
      const game = window.__G;
      game.player.invulnerable = true;
      game.enemies.clear();
      game.player.pos.copy(game.game.run.relays[0].o.pos);
      game.player.pos.z += 1;
      game.player.yaw = 0;
      game.player.forward.set(0, 0, -1);
    });
    await press(page, 'e', 10);
    const partialProgress = await page.evaluate(() => window.__G.game.run.relays[0].t);
    expect(partialProgress).toBeGreaterThan(0);
    expect(partialProgress).toBeLessThan(1);
    await advance(page, 5);
    expect(await page.evaluate(() => window.__G.game.run.relays[0].t)).toBeLessThan(
      partialProgress,
    );
    await press(page, 'e', 50);
    expect(await page.evaluate(() => window.__G.game.run.cut)).toBe(1);
    await page.evaluate(() => {
      window.__G.game.debugCut();
      window.__G.game.debugCut();
    });
    await advance(page, 1);
    await expect(page.locator('.h-relays b')).toHaveText('3/3');
    expect(await page.evaluate(() => window.__G.game.run.allCut)).toBe(true);
    const waveQueue = await page.evaluate(() =>
      window.__G.game.run.queue.map((enemy) => enemy.type),
    );
    await page.evaluate(() => window.__G.player.pos.copy(window.__G.level.extraction.pos));
    await advance(page, 70);
    await expect(page.locator('.menu')).toHaveAttribute('data-screen', 'complete');
    const debrief = await page.locator('[data-s="complete"]').innerText();
    // The original transparent location card overlaps this button at 1280px.
    // Keyboard activation exercises the supported action without changing CSS.
    await page.locator('[data-act="redeploy"]').focus();
    await page.keyboard.press('Enter');
    await advance(page, 28);
    expect(await page.evaluate(() => window.__G.game.run.retries)).toBe(0);
    expect(await page.evaluate(() => window.__G.game.run.cut)).toBe(0);
    expect(await readErrors(page, errors), `${name} runtime errors`).toEqual([]);
    snapshots.push({ startPosition, movedPosition, firedAmmo, waveQueue, debrief });
    await context.close();
  }
  expect(snapshots[1]).toEqual(snapshots[0]);
});

test('mobile layout and touch controls match', async ({ browser }) => {
  const snapshots = [];
  for (const [name, url] of targets) {
    const { context, page, errors } = await openGame(browser, url, { mobile: true });
    await expect(page.locator('[data-s="title"] [data-act="controls"]')).toBeVisible();
    await page.locator('[data-s="title"] [data-act="controls"]').click();
    await expect(page.locator('[data-pane="controls"]')).toBeVisible();
    await page.locator('[data-act="close-panel"]').click();
    await page.locator('[data-act="deploy"]').click();
    await advance(page, 72);
    await page.evaluate(() => {
      window.__G.player.invulnerable = true;
      window.__G.enemies.clear();
    });
    // A real touch event activates the original touch-mode input branch.
    await page.touchscreen.tap(190, 400);
    await advance(page, 1);
    await expect(page.locator('.touch')).toHaveClass(/on/);
    await expect(page.locator('.t-fire')).toBeVisible();
    const controls = await page.locator('.touch button').evaluateAll((buttons) =>
      buttons.map((button) => ({
        action: button.dataset.a,
        text: button.textContent,
        label: button.getAttribute('aria-label'),
      })),
    );
    expect(await readErrors(page, errors), `${name} runtime errors`).toEqual([]);
    snapshots.push(controls);
    await context.close();
  }
  expect(snapshots[1]).toEqual(snapshots[0]);
});

test('showcase and benchmark entry points remain available', async ({ browser }) => {
  for (const [name, url] of targets) {
    const showcase = await openGame(browser, url, { query: 'show=weapon' });
    expect(await showcase.page.evaluate(() => window.__G.game.state)).toBe('showcase');
    expect(await showcase.page.evaluate(() => window.__G.showcase)).toBe('weapon');
    expect(await readErrors(showcase.page, showcase.errors), `${name} showcase errors`).toEqual([]);
    await showcase.context.close();
    const benchmark = await openGame(browser, url, { query: 'bench=1' });
    await expect(benchmark.page.locator('#bench')).toBeAttached();
    expect(await benchmark.page.evaluate(() => typeof window.__G.bench.frame)).toBe('function');
    expect(await readErrors(benchmark.page, benchmark.errors), `${name} benchmark errors`).toEqual(
      [],
    );
    await benchmark.context.close();
  }
});

test('fixed-seed rendered frame is visually equivalent', async ({ browser }, testInfo) => {
  const screenshots = [];
  const sceneStats = [];
  for (const [name, url] of targets) {
    const { context, page, errors } = await openGame(browser, url, {
      deterministic: true,
      query: 'shot=1&cam=-32,1.7,6,0,2,5',
    });
    expect(await readErrors(page, errors), `${name} screenshot errors`).toEqual([]);
    screenshots.push(await page.screenshot({ path: testInfo.outputPath(`${name}.png`) }));
    await fs.writeFile(
      testInfo.outputPath(`${name}-font-trace.json`),
      JSON.stringify(await page.evaluate(() => window.__fontTrace), null, 2),
    );
    sceneStats.push(
      await page.evaluate(() => ({
        frame: window.__frames,
        sceneObjects: window.__G.scene.children.length,
        state: window.__G.game.state,
        quality: window.__G.quality.name,
        relays: window.__G.level.objectives.map((relay) => ({
          id: relay.id,
          pos: relay.pos.toArray(),
        })),
      })),
    );
    await context.close();
  }
  expect(sceneStats[1]).toEqual(sceneStats[0]);
  const page = await browser.newPage();
  const comparison = await page.evaluate(
    async (sources) => {
      const images = await Promise.all(
        sources.map(async (source) => {
          const image = await createImageBitmap(await (await fetch(source)).blob());
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height);
        }),
      );
      let changed = 0,
        difference = 0,
        maxDifference = 0;
      const [original, react] = images;
      const canvas = document.createElement('canvas');
      canvas.width = original.width;
      canvas.height = original.height;
      const context = canvas.getContext('2d');
      const diff = context.createImageData(canvas.width, canvas.height);
      for (let pixel = 0; pixel < original.data.length; pixel += 4) {
        let delta = 0;
        for (let channel = 0; channel < 3; channel++) {
          const amount = Math.abs(original.data[pixel + channel] - react.data[pixel + channel]);
          difference += amount;
          delta = Math.max(delta, amount);
          diff.data[pixel + channel] = amount * 5;
        }
        diff.data[pixel + 3] = 255;
        if (delta > 5) changed++;
        maxDifference = Math.max(delta, maxDifference);
      }
      context.putImageData(diff, 0, 0);
      return {
        width: original.width,
        height: original.height,
        changedPixelRatio: changed / (original.width * original.height),
        meanChannelDifference: difference / (original.width * original.height * 3),
        maxDifference,
        diff: canvas.toDataURL('image/png').split(',')[1],
      };
    },
    screenshots.map((buffer) => `data:image/png;base64,${buffer.toString('base64')}`),
  );
  await page.close();
  const { diff, ...metrics } = comparison;
  await fs.writeFile(testInfo.outputPath('difference.png'), Buffer.from(diff, 'base64'));
  await fs.writeFile(
    testInfo.outputPath('visual-comparison.json'),
    JSON.stringify({ metrics, sceneStats }, null, 2),
  );
  await testInfo.attach('visual-comparison', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  // Allow only insignificant rasterization/antialiasing differences.
  expect(metrics.changedPixelRatio).toBeLessThan(0.01);
  expect(metrics.meanChannelDifference).toBeLessThan(0.5);
});

test('procedural audio generates real buffers and resumes after a user action', async ({
  browser,
}) => {
  const snapshots = [];
  for (const [name, url] of targets) {
    const { context, page, errors } = await openGame(browser, url, { audio: true });
    await page.evaluate(async () => {
      await window.__G.audio.ready;
    });
    expect(await page.evaluate(() => !!window.__G.audio.stub)).toBe(false);
    await page.locator('[data-act="deploy"]').click();
    await advance(page, 4);
    await expect.poll(() => page.evaluate(() => window.__G.audio.ctx.state)).toBe('running');
    const audio = await page.evaluate(() => {
      const audio = window.__G.audio;
      const status = audio.debug();
      return {
        sampleRate: status.sampleRate,
        buffers: status.buffers,
        reverb: status.reverb,
        names: audio.names,
      };
    });
    expect(audio.buffers).toBeGreaterThan(0);
    expect(audio.reverb).toEqual([true, true]);
    expect(await readErrors(page, errors), `${name} audio errors`).toEqual([]);
    snapshots.push(audio);
    await context.close();
  }
  expect(snapshots[1]).toEqual(snapshots[0]);
});

test('high quality renders all primary systems without fallback modules', async ({ browser }) => {
  const { context, page, errors } = await openGame(browser, reactUrl, { query: 'q=high&shot=1' });
  const status = await page.evaluate(() => {
    const game = window.__G;
    const modules = [
      'render',
      'mats',
      'level',
      'backdrop',
      'ground',
      'fx',
      'weapon',
      'enemies',
      'hud',
    ];
    return {
      quality: game.quality.name,
      frames: window.__frames,
      fallbackModules: modules.filter((name) => !game[name] || game[name].stub),
    };
  });
  expect(status.quality).toBe('high');
  expect(status.frames).toBeGreaterThanOrEqual(2);
  expect(status.fallbackModules).toEqual([]);
  expect(await readErrors(page, errors)).toEqual([]);
  await context.close();
});
