import * as THREE from "three";
import type { Season } from "./types";
/** A local HDR-like sky for physically based reflections; no downloaded assets. */
export function createEnvironment(
  renderer: THREE.WebGLRenderer,
  season: Season,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const winter = season === "winter";
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, winter ? "#739cc3" : "#9cbabc");
  g.addColorStop(0.43, winter ? "#d2e1ec" : "#e5e5cc");
  g.addColorStop(0.51, winter ? "#c7d8e3" : "#e7dac1");
  g.addColorStop(0.56, winter ? "#718c9f" : "#697957");
  g.addColorStop(1, winter ? "#31414e" : "#29392a");
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 256);
  const sun = c.createRadialGradient(140, 86, 0, 140, 86, 40);
  sun.addColorStop(0, "#ffffff");
  sun.addColorStop(0.12, winter ? "#ffffff" : "#fff5d3");
  sun.addColorStop(1, "#ffffff00");
  c.fillStyle = sun;
  c.fillRect(90, 36, 100, 100);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const generator = new THREE.PMREMGenerator(renderer),
    result = generator.fromEquirectangular(texture);
  texture.dispose();
  generator.dispose();
  return result;
}
