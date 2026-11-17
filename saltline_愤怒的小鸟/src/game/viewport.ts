import { WORLD } from './types';
/** Dimensions are those of the landscape canvas, before a phone's CSS rotation. */
export function getViewport(width: number, height: number) {
  const scale = Math.max(0.001, Math.min(width / WORLD.width, height / 620));
  return {
    scale,
    offsetX: (width - WORLD.width * scale) / 2,
    offsetY: height * 0.82 - WORLD.ground * scale,
  };
}
export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; right: number; width: number; height: number },
  layoutWidth: number,
  layoutHeight: number,
) {
  const rotated = layoutWidth > layoutHeight && rect.height > rect.width;
  return rotated
    ? { x: clientY - rect.top, y: rect.right - clientX }
    : { x: clientX - rect.left, y: clientY - rect.top };
}
export function screenToWorld(x: number, y: number, viewport: ReturnType<typeof getViewport>) {
  return { x: (x - viewport.offsetX) / viewport.scale, y: (y - viewport.offsetY) / viewport.scale };
}
