/** 固定镜头/曝光调试控制器。闭包保存当前镜头，允许 __setShot 在帧循环启动后继续修改。 */
import { Vector3 } from 'three';
export function createShotCamera(gameContext) {
  let shotCamera = null;
  function setShot(shot) {
    if (shot.cam) {
      let f = String(shot.cam).split(',').map(Number);
      shotCamera = {
        pos: new Vector3(f[0], f[1], f[2]),
        look: new Vector3(f[3] ?? 0, f[4] ?? 1, f[5] ?? 0),
      };
    }
    if (shot.cam === '') {
      shotCamera = null;
    }
    if (shot.fov) {
      gameContext.camera.fov = +shot.fov;
      gameContext.camera.updateProjectionMatrix();
    }
    if (shot.exposure) {
      gameContext.render.exposure = +shot.exposure;
    }
  }
  return {
    setShot,
    getCamera: () => shotCamera,
  };
}
