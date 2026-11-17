import { describe, it, expect } from 'vitest';
import { getViewport, clientToCanvas, screenToWorld } from './viewport';
import { WORLD } from './types';

describe('full-window camera and pointer mapping', () => {
  it.each([
    [1920, 1080],
    [1440, 900],
    [3440, 1440],
    [844, 390],
  ])('%s × %s keeps the sling, towers and ground visible', (width, height) => {
    const v = getViewport(width, height);
    for (const p of [
      { x: 165, y: 575 },
      { x: 1510, y: 735 },
      { x: 960, y: 300 },
    ]) {
      const x = p.x * v.scale + v.offsetX,
        y = p.y * v.scale + v.offsetY;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
      const mapped = screenToWorld(x, y, v);
      expect(mapped.x).toBeCloseTo(p.x);
      expect(mapped.y).toBeCloseTo(p.y);
    }
    expect(WORLD.ground * v.scale + v.offsetY).toBeCloseTo(height * 0.82);
  });
  it('rotated phone touches map back to the same world coordinates as landscape', () => {
    const width = 844,
      height = 390;
    const viewport = getViewport(width, height);
    const rect = { left: 0, top: 0, right: height, width: height, height: width };
    for (const point of [WORLD.sling, { x: 176, y: 622 }, { x: 1510, y: 735 }]) {
      const localX = point.x * viewport.scale + viewport.offsetX;
      const localY = point.y * viewport.scale + viewport.offsetY;
      const screen = { x: height - localY, y: localX };
      const canvas = clientToCanvas(screen.x, screen.y, rect, width, height);
      const mapped = screenToWorld(canvas.x, canvas.y, viewport);
      expect(mapped.x).toBeCloseTo(point.x);
      expect(mapped.y).toBeCloseTo(point.y);
    }
  });
});
