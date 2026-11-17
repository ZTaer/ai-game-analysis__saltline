/** 原版性能巡游：按镜头路径运动，用真实帧耗时统计 FPS；不改变游戏模拟步长。 */
import { Vector2, Vector3 } from 'three';
export function createBenchmark(gameContext) {
  let panel = document.createElement('pre');
  panel.id = 'bench';
  panel.style.cssText =
    'position:absolute;left:12px;top:12px;z-index:90;margin:0;padding:10px 12px;font:12px/1.45 "IBM Plex Mono",ui-monospace,monospace;color:#d8f0d0;background:rgba(0,0,0,.72);white-space:pre-wrap;max-width:min(560px,90vw);pointer-events:none';
  document.getElementById('app').appendChild(panel);
  let gpuName = 'unknown';
  try {
    let f = gameContext.renderer.getContext(),
      p = f.getExtension('WEBGL_debug_renderer_info');
    gpuName = p ? f.getParameter(p.UNMASKED_RENDERER_WEBGL) : f.getParameter(f.RENDERER);
  } catch {}
  let cameraPath =
      gameContext.level.cinematicPath && gameContext.level.cinematicPath.length >= 2
        ? gameContext.level.cinematicPath
        : [
            {
              pos: [-32, 1.7, 6],
              look: [0, 2, 5],
            },
            {
              pos: [10, 1.7, 6],
              look: [30, 6, 0],
            },
          ],
    frameSamples = [],
    elapsed = 0,
    lastRefresh = 0,
    pathSeconds = 30,
    fromPosition = new Vector3(),
    toPosition = new Vector3(),
    fromLook = new Vector3(),
    toLook = new Vector3();
  if (gameContext.player) {
    gameContext.player.enabled = false;
  }
  gameContext.bench = {
    frame(realDeltaSeconds) {
      elapsed += realDeltaSeconds;
      let pathProgress = ((elapsed / pathSeconds) % 1) * (cameraPath.length - 1),
        segmentIndex = Math.min(cameraPath.length - 2, Math.floor(pathProgress)),
        segmentProgress = pathProgress - segmentIndex,
        easedProgress = segmentProgress * segmentProgress * (3 - 2 * segmentProgress);
      fromPosition.fromArray(cameraPath[segmentIndex].pos);
      toPosition.fromArray(cameraPath[segmentIndex + 1].pos);
      fromLook.fromArray(cameraPath[segmentIndex].look);
      toLook.fromArray(cameraPath[segmentIndex + 1].look);
      gameContext.camera.position.lerpVectors(fromPosition, toPosition, easedProgress);
      gameContext.camera.lookAt(fromLook.lerp(toLook, easedProgress));
      if (elapsed > 2) {
        frameSamples.push(realDeltaSeconds * 1e3);
      }
      if (frameSamples.length > 3e3) {
        frameSamples.shift();
      }
      if (elapsed - lastRefresh > 1 && frameSamples.length > 10) {
        lastRefresh = elapsed;
        let x = frameSamples.slice().sort((M, E) => M - E),
          y = x.reduce((M, E) => M + E, 0) / x.length,
          b = x[Math.floor(x.length * 0.99)],
          m = x[x.length >> 1],
          A = gameContext.render.stats ? gameContext.render.stats() : {},
          _ = gameContext.renderer.getDrawingBufferSize(new Vector2());
        panel.textContent = `SALTLINE BENCH  t=${elapsed.toFixed(0)}s
GPU: ${gpuName}
buffer ${_.x}x${_.y}  quality ${gameContext.quality.name}  dpr ${window.devicePixelRatio}
frame ms avg ${y.toFixed(1)}  median ${m.toFixed(1)}  p99 ${b.toFixed(1)}  => ${(1e3 / y).toFixed(0)} fps
stats ${JSON.stringify(A)}
errors ${window.__errors.length}${
          window.__errors.length
            ? `
 - ` +
              window.__errors.slice(0, 6).join(`
 - `)
            : ''
        }`;
      }
    },
  };
}
