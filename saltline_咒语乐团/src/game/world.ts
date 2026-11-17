import * as THREE from "three";
import type { Obstacle, PhysicsProp, Season, WorldView } from "./types";

/** The stage is built from shared primitives and instanced vegetation. No asset requests. */
export function createWorld(scene: THREE.Scene, season: Season): WorldView {
  const winter = season === "winter";
  const group = new THREE.Group();
  group.name = `world-${season}`;
  scene.add(group);
  let seed = winter ? 7131 : 4207;
  const random = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (a: number, b: number) => a + random() * (b - a);
  const obstacles: Obstacle[] = [];
  const props: PhysicsProp[] = [];
  const textures: THREE.Texture[] = [];
  const wind = { value: 0 };
  const playerWorld = { value: new THREE.Vector3(100, 0, 100) };
  const stoneColor = winter ? "#718a95" : "#868d79";
  const stone = new THREE.MeshStandardMaterial({
    color: stoneColor,
    roughness: 0.89,
  });
  const darkStone = new THREE.MeshStandardMaterial({
    color: winter ? "#3c535f" : "#4e5b50",
    roughness: 0.9,
  });
  const lightStone = new THREE.MeshStandardMaterial({
    color: winter ? "#c6dce1" : "#c0c2a7",
    roughness: 0.84,
  });
  const snow = new THREE.MeshStandardMaterial({
    color: "#e1f0f2",
    roughness: 0.82,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: "#b89a5c",
    metalness: 0.76,
    roughness: 0.36,
  });
  const bark = new THREE.MeshStandardMaterial({
    color: winter ? "#4d5557" : "#65584d",
    roughness: 1,
  });
  const leaf = new THREE.MeshStandardMaterial({
    color: winter ? "#294d4e" : "#405d38",
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.MeshBasicMaterial({
    color: winter ? "#96dfff" : "#ffcd7e",
    toneMapped: false,
  });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  const orbGeometry = new THREE.IcosahedronGeometry(1, 2);
  const object = new THREE.Object3D();
  const tempColor = new THREE.Color();

  const mineralCanvas = document.createElement("canvas");
  mineralCanvas.width = mineralCanvas.height = 128;
  const mineralCtx = mineralCanvas.getContext("2d")!,
    mineralPixels = mineralCtx.createImageData(128, 128);
  for (let i = 0; i < mineralPixels.data.length; i += 4) {
    const gray = Math.floor(range(170, 227));
    mineralPixels.data[i] = gray;
    mineralPixels.data[i + 1] = gray;
    mineralPixels.data[i + 2] = gray;
    mineralPixels.data[i + 3] = 255;
  }
  mineralCtx.putImageData(mineralPixels, 0, 0);
  mineralCtx.strokeStyle = "#4b514a40";
  mineralCtx.lineWidth = 0.7;
  for (let n = 0; n < 9; n++) {
    let x = range(0, 128),
      y = range(0, 128);
    mineralCtx.beginPath();
    mineralCtx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += range(-8, 8);
      y += range(2, 7);
      mineralCtx.lineTo(x, y);
    }
    mineralCtx.stroke();
  }
  const mineralMap = new THREE.CanvasTexture(mineralCanvas);
  mineralMap.wrapS = mineralMap.wrapT = THREE.RepeatWrapping;
  mineralMap.colorSpace = THREE.SRGBColorSpace;
  mineralMap.anisotropy = 4;
  textures.push(mineralMap);
  for (const material of [stone, darkStone, lightStone]) {
    material.map = mineralMap;
    material.bumpMap = mineralMap;
    material.bumpScale = 0.065;
  }

  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = sx,
    sz = sx,
  ) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }
  function batch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    shadow = true,
  ) {
    const result = new THREE.InstancedMesh(geometry, material, count);
    result.castShadow = shadow;
    result.receiveShadow = true;
    result.frustumCulled = false;
    group.add(result);
    return result;
  }
  function instance(
    target: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
    ry = 0,
    rx = 0,
    rz = 0,
    tint?: THREE.ColorRepresentation,
  ) {
    object.position.set(x, y, z);
    object.rotation.set(rx, ry, rz);
    object.scale.set(sx, sy, sz);
    object.updateMatrix();
    target.setMatrixAt(index, object.matrix);
    if (tint !== undefined) target.setColorAt(index, tempColor.set(tint));
  }
  function swaying(
    material: THREE.MeshStandardMaterial,
    amplitude: number,
    revealPlayer = false,
  ) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = wind;
      shader.vertexShader = "uniform float uWindTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat windPhase = instanceMatrix[3].x * .31 + instanceMatrix[3].z * .23;\ntransformed.x += sin(uWindTime * 1.3 + windPhase + position.y * 1.7) * ${amplitude.toFixed(3)} * max(0., position.y);\ntransformed.z += cos(uWindTime * .8 + windPhase) * ${(0.4 * amplitude).toFixed(3)} * max(0., position.y);\n#endif`,
      );
      if (revealPlayer) {
        shader.uniforms.uPlayerWorld = playerWorld;
        shader.vertexShader =
          "varying vec3 vCanopyWorld;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `#ifdef USE_INSTANCING\nvCanopyWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;\n#else\nvCanopyWorld=(modelMatrix*vec4(transformed,1.)).xyz;\n#endif\n#include <project_vertex>`,
        );
        shader.fragmentShader =
          "varying vec3 vCanopyWorld;uniform vec3 uPlayerWorld;\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>\nvec2 projectedCanopy=vCanopyWorld.xz-vec2(.522,.783)*max(0.,vCanopyWorld.y-.8);\nfloat playerClear=1.-smoothstep(.7,2.1,distance(projectedCanopy,uPlayerWorld.xz));\nif(playerClear>.02&&fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)<playerClear*.88)discard;`,
        );
      }
    };
    material.customProgramCacheKey = () => `wind-${amplitude}-${revealPlayer}`;
  }

  // A hand-painted mineral/soil texture, with grain that survives the oblique camera.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = winter ? "#aec5cb" : "#557745";
  ctx.fillRect(0, 0, 512, 512);
  for (let n = 0; n < 12000; n++) {
    const size = range(0.6, 5),
      shade = Math.floor(range(70, 150));
    ctx.fillStyle = winter
      ? `rgba(${shade + 70},${shade + 86},${shade + 92},${range(0.05, 0.24)})`
      : `rgba(${shade * 0.73},${shade},${shade * 0.62},${range(0.09, 0.35)})`;
    ctx.beginPath();
    ctx.ellipse(
      range(0, 512),
      range(0, 512),
      size * 2,
      size,
      range(0, Math.PI),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  const groundMap = new THREE.CanvasTexture(canvas);
  groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.repeat.set(10, 10);
  groundMap.colorSpace = THREE.SRGBColorSpace;
  groundMap.anisotropy = 8;
  textures.push(groundMap);
  const terrain = new THREE.MeshStandardMaterial({
    color: winter ? "#d8e6e4" : "#d7d4ae",
    map: groundMap,
    bumpMap: groundMap,
    bumpScale: winter ? 0.025 : 0.075,
    roughness: winter ? 0.8 : 0.95,
  });
  const ground = mesh(
    new THREE.CircleGeometry(25.6, 96),
    terrain,
    0,
    -0.025,
    0,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  mesh(new THREE.CylinderGeometry(25.65, 26.3, 0.8, 96), darkStone, 0, -0.5, 0);
  mesh(new THREE.CylinderGeometry(26.3, 26.9, 0.9, 96), stone, 0, -1.1, 0);

  const waterUniforms = {
    time: wind,
    cold: { value: winter ? 1 : 0 },
    sunColor: { value: new THREE.Color(winter ? "#84bfd0" : "#9dbb9a") },
  };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: false,
    vertexShader: `varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `varying vec3 vWorld;uniform float time;uniform float cold;uniform vec3 sunColor;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){vec2 p=vWorld.xz;float wave=sin(p.x*.76+p.y*.43+time*.52)*sin(p.y*1.7-p.x*.38-time*.36);float fine=sin(p.x*4.+p.y*3.8+time*.3)*sin(p.y*4.7-time*.3);float glint=pow(max(0.,wave*.58+fine*.28),7.);float shoreline=1.-smoothstep(25.5,30.,length(p));vec3 base=mix(vec3(.09,.24,.24),vec3(.18,.34,.43),cold);base+=wave*.016+sunColor*glint*.4+shoreline*.055;gl_FragColor=vec4(base,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
  });
  const water = mesh(
    new THREE.PlaneGeometry(160, 160),
    waterMaterial,
    0,
    -1.08,
    0,
  );
  water.rotation.x = -Math.PI / 2;
  water.castShadow = water.receiveShadow = false;

  const shoreline = batch(rockGeometry, stone, 125);
  for (let n = 0; n < 125; n++) {
    const a = (n / 125) * Math.PI * 2,
      radius = range(25.1, 26.6);
    instance(
      shoreline,
      n,
      Math.sin(a) * radius,
      range(-0.75, -0.2),
      Math.cos(a) * radius,
      range(0.6, 1.3),
      range(0.35, 0.7),
      range(0.5, 1.1),
      a,
      0.15,
      range(-0.2, 0.2),
      winter ? "#9bb0b7" : "#6c7867",
    );
  }

  const shrinePositions = [
    { x: -12, z: -8 },
    { x: 12, z: -7 },
    { x: 0, z: 14 },
  ];
  function distanceToPath(x: number, z: number) {
    let result = Math.hypot(x, z);
    for (const s of shrinePositions) {
      const t = THREE.MathUtils.clamp(
        (x * s.x + z * s.z) / (s.x * s.x + s.z * s.z),
        0,
        1,
      );
      result = Math.min(result, Math.hypot(x - s.x * t, z - s.z * t));
    }
    return result;
  }
  const paving = batch(unitBox, lightStone, 270);
  const pathEdges: { x: number; z: number; angle: number }[] = [];
  let tile = 0;
  for (const target of shrinePositions) {
    const length = Math.hypot(target.x, target.z),
      angle = Math.atan2(target.x, target.z);
    for (let d = 2.7; d < length + 2.3; d += 1.08)
      for (let side = -1; side <= 1; side++) {
        const offset = side * 0.96,
          x = Math.sin(angle) * d + Math.cos(angle) * offset,
          z = Math.cos(angle) * d - Math.sin(angle) * offset;
        instance(
          paving,
          tile++,
          x + range(-0.05, 0.05),
          0.015,
          z + range(-0.05, 0.05),
          range(0.81, 0.94),
          0.08,
          range(0.83, 0.99),
          angle + range(-0.045, 0.045),
          0,
          0,
          new THREE.Color(winter ? "#e4f3f3" : "#fff8db").multiplyScalar(
            range(0.68, 1.08),
          ),
        );
        if (side !== 0)
          pathEdges.push({
            x: x + Math.cos(angle) * side * 0.49,
            z: z - Math.sin(angle) * side * 0.49,
            angle,
          });
      }
  }
  // Center rosette: a ring of individually weathered radial stones.
  for (let r = 2; r <= 4; r++)
    for (let n = 0; n < r * 12; n++) {
      const a = (n / (r * 12)) * Math.PI * 2;
      instance(
        paving,
        tile++,
        Math.sin(a) * r * 0.69,
        0.008,
        Math.cos(a) * r * 0.69,
        0.43,
        0.09,
        0.58,
        a,
        0,
        0,
        new THREE.Color(winter ? "#e4eff2" : "#fff2cc").multiplyScalar(
          range(0.73, 1.05),
        ),
      );
    }
  paving.count = tile;
  const seamMaterial = new THREE.MeshStandardMaterial({
    color: winter ? "#cfe7e7" : "#6f883c",
    roughness: 1,
  });
  const pathMoss = batch(
    rockGeometry,
    seamMaterial,
    pathEdges.length * 5,
    false,
  );
  const gravel = batch(rockGeometry, lightStone, pathEdges.length * 3, false);
  pathEdges.forEach((p, index) => {
    for (let n = 0; n < 5; n++) {
      const d = (n - 2) * 0.17;
      instance(
        pathMoss,
        index * 5 + n,
        p.x + Math.sin(p.angle) * d + range(-0.035, 0.035),
        0.035,
        p.z + Math.cos(p.angle) * d + range(-0.035, 0.035),
        range(0.06, 0.13),
        winter ? 0.035 : range(0.025, 0.06),
        range(0.11, 0.19),
        range(0, 6),
        0,
        0,
        new THREE.Color().setHSL(
          winter ? 0.51 : range(0.18, 0.28),
          winter ? 0.13 : 0.48,
          winter ? range(0.7, 0.9) : range(0.38, 0.61),
        ),
      );
    }
    for (let n = 0; n < 3; n++)
      instance(
        gravel,
        index * 3 + n,
        p.x + range(-0.24, 0.24),
        0.055,
        p.z + range(-0.45, 0.45),
        range(0.035, 0.09),
        range(0.025, 0.06),
        range(0.04, 0.12),
        range(0, 6),
        0.2,
        0.2,
        "#c7c5ad",
      );
  });
  const disc = mesh(
    new THREE.CylinderGeometry(1.06, 1.1, 0.055, 48),
    darkStone,
    0,
    0.018,
    0,
  );
  disc.receiveShadow = true;
  const centralInlay = mesh(
    new THREE.TorusGeometry(0.84, 0.018, 5, 80),
    gold,
    0,
    0.054,
    0,
  );
  centralInlay.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const line = mesh(unitBox, gold, 0, 0.055, 0, 1.62, 0.007, 0.024);
    line.rotation.y = (i / 6) * Math.PI;
  }

  // Ruined arcade. The arch is a true opening, and each upright has its own collider.
  const blocks = batch(unitBox, stone, 200);
  const trims = batch(unitBox, lightStone, 120);
  let blockN = 0,
    trimN = 0;
  const columnDetails: {
    x: number;
    z: number;
    height: number;
    width: number;
  }[] = [];
  function column(x: number, z: number, height: number, width = 0.68) {
    columnDetails.push({ x, z, height, width });
    instance(blocks, blockN++, x, 0.18, z, width * 1.8, 0.36, width * 1.8);
    instance(blocks, blockN++, x, height * 0.5 + 0.3, z, width, height, width);
    instance(
      trims,
      trimN++,
      x,
      height + 0.32,
      z,
      width * 1.35,
      0.24,
      width * 1.35,
    );
    instance(trims, trimN++, x, 0.48, z, width * 1.15, 0.12, width * 1.15);
    if (winter)
      instance(
        trims,
        trimN++,
        x,
        height + 0.49,
        z,
        width * 1.39,
        0.1,
        width * 1.4,
        0,
        0,
        0,
        "#e6f5f3",
      );
    for (let k = 1; k < height; k += 0.7)
      instance(
        trims,
        trimN++,
        x,
        k + 0.28,
        z,
        width * 1.035,
        0.025,
        width * 1.035,
        0,
        0,
        0,
        winter ? "#728c97" : "#536658",
      );
    obstacles.push({ x, z, radius: width * 0.8, height });
  }
  column(-3.3, -18, 4.4, 0.9);
  column(3.3, -18, 4.4, 0.9);
  const archStone = new THREE.TorusGeometry(3.3, 0.48, 5, 18, Math.PI);
  const arch = mesh(archStone, stone, 0, 4.65, -18);
  arch.castShadow = true;
  const archTrim = mesh(
    new THREE.TorusGeometry(3.3, 0.055, 5, 44, Math.PI),
    gold,
    0,
    4.65,
    -17.49,
  );
  archTrim.castShadow = false;
  mesh(unitBox, lightStone, 0, 7.96, -18, 0.72, 0.6, 1.05);
  const seal = mesh(new THREE.OctahedronGeometry(0.31), glow, 0, 7.95, -17.42);
  seal.rotation.z = Math.PI / 4;
  column(-17, -12, 2.6);
  column(-17, -7, 3.8);
  column(17, -10, 3.7);
  column(17, -15, 2.3);
  column(-8.5, 17.5, 1.8);
  column(8.5, 17.5, 3.0);
  for (const side of [-1, 1]) {
    for (let n = 0; n < 6; n++) {
      const x = side * (5.1 + n * 1.5),
        height = range(0.8, 2.5);
      for (let y = 0.25; y < height; y += 0.53)
        instance(
          blocks,
          blockN++,
          x + (Math.floor(y * 2) % 2) * 0.25,
          y,
          -18.5,
          1.39,
          0.49,
          0.9,
          range(-0.03, 0.03),
        );
    }
    for (let n = 0; n < 8; n++)
      instance(
        blocks,
        blockN++,
        side * range(14, 18),
        range(0.14, 0.32),
        range(-14, -4),
        range(0.4, 1.1),
        range(0.25, 0.6),
        range(0.45, 0.9),
        range(0, 6),
      );
  }
  blocks.count = blockN;
  trims.count = trimN;

  const engraved = batch(
    unitBox,
    new THREE.MeshStandardMaterial({
      color: winter ? "#446678" : "#4a5642",
      roughness: 0.93,
    }),
    columnDetails.length * 10 + 25,
    false,
  );
  let engravedN = 0;
  for (const p of columnDetails) {
    for (const face of [0, 1]) {
      const y = Math.min(p.height * 0.6, 1.9) + 0.3,
        size = p.width * 0.22;
      for (let n = 0; n < 4; n++) {
        const a = n * Math.PI * 0.5 + Math.PI * 0.25,
          dx = Math.cos(a) * size * 0.62,
          dy = Math.sin(a) * size * 0.62;
        instance(
          engraved,
          engravedN++,
          p.x + (face ? p.width * 0.508 : dx),
          y + dy,
          p.z + (face ? dx : p.width * 0.508),
          face ? 0.019 : size * 0.72,
          size * 0.72,
          face ? size * 0.72 : 0.019,
          0,
          face ? a : 0,
          face ? 0 : a,
        );
      }
      instance(
        engraved,
        engravedN++,
        p.x + (face ? p.width * 0.508 : 0),
        y - size * 1.7,
        p.z + (face ? 0 : p.width * 0.508),
        face ? 0.019 : 0.035,
        size * 1.2,
        face ? 0.035 : 0.019,
      );
    }
  }
  for (let n = 0; n < 19; n++) {
    const a = (n / 18) * Math.PI;
    instance(
      engraved,
      engravedN++,
      Math.cos(a) * 3.3,
      4.65 + Math.sin(a) * 3.3,
      -17.51,
      0.045,
      0.68,
      0.022,
      0,
      0,
      a - Math.PI * 0.5,
    );
  }
  engraved.count = engravedN;

  // Shrines are readable landmarks with dark dormant hearts and growing charged rings.
  const shrines: {
    gem: THREE.Mesh;
    rings: THREE.Mesh[];
    light: THREE.PointLight;
    progress: number;
    active: boolean;
    motes: THREE.Points;
  }[] = [];
  shrinePositions.forEach((p, index) => {
    mesh(
      new THREE.CylinderGeometry(2.28, 2.45, 0.13, 12),
      darkStone,
      p.x,
      0.035,
      p.z,
    );
    mesh(
      new THREE.CylinderGeometry(1.8, 1.9, 0.13, 12),
      lightStone,
      p.x,
      0.14,
      p.z,
    );
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: winter ? "#9acde1" : "#d6bc7e",
      transparent: true,
      opacity: 0.38,
      toneMapped: false,
    });
    const rings = [1.98, 1.6].map((r) => {
      const m = mesh(
        new THREE.TorusGeometry(r, 0.025, 5, 80),
        ringMaterial.clone(),
        p.x,
        0.22,
        p.z,
      );
      m.rotation.x = Math.PI / 2;
      m.castShadow = false;
      return m;
    });
    for (let n = 0; n < 8; n++) {
      const a = (n / 8) * Math.PI * 2;
      const rune = mesh(
        unitBox,
        gold,
        p.x + Math.sin(a) * 1.43,
        0.224,
        p.z + Math.cos(a) * 1.43,
        0.055,
        0.012,
        0.19,
      );
      rune.rotation.y = a;
    }
    const plinth = mesh(
      new THREE.CylinderGeometry(0.45, 0.7, 0.55, 6),
      stone,
      p.x,
      0.44,
      p.z,
    );
    plinth.rotation.y = Math.PI / 6;
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: winter ? "#63b3cc" : "#8ca586",
      emissive: winter ? "#458ba4" : "#78945b",
      emissiveIntensity: 0.22,
      metalness: 0.4,
      roughness: 0.2,
      transparent: true,
      opacity: 0.88,
    });
    const gem = mesh(
      new THREE.OctahedronGeometry(0.48),
      crystalMaterial,
      p.x,
      1.38,
      p.z,
      0.73,
      1.5,
      0.73,
    );
    const light = new THREE.PointLight(
      winter ? "#91e7ff" : "#d4ff9d",
      0.4,
      6,
      2,
    );
    light.position.set(p.x, 2, p.z);
    group.add(light);
    const approachLength = Math.hypot(p.x, p.z);
    for (const side of [-1, 1]) {
      const x = p.x + (p.z / approachLength) * side * 2.6,
        z = p.z - (p.x / approachLength) * side * 2.6;
      column(x, z, 0.8 + (index % 2) * 0.3, 0.38);
    }
    const points = new Float32Array(18 * 3);
    for (let n = 0; n < 18; n++) {
      const a = (n / 18) * Math.PI * 2;
      points.set(
        [p.x + Math.cos(a) * 1.4, 0.3 + (n % 4) * 0.3, p.z + Math.sin(a) * 1.4],
        n * 3,
      );
    }
    const particles = new THREE.BufferGeometry();
    particles.setAttribute("position", new THREE.BufferAttribute(points, 3));
    const motes = new THREE.Points(
      particles,
      new THREE.PointsMaterial({
        color: winter ? "#9edfff" : "#dfff9b",
        size: 0.07,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    group.add(motes);
    shrines.push({ gem, rings, light, active: false, progress: 0, motes });
  });
  // Columns were added around shrines after the arcade batch was first trimmed.
  blocks.count = blockN;
  trims.count = trimN;

  const treeLocations: { x: number; z: number; height: number }[] = [];
  for (let n = 0; n < 18; n++) {
    const a = (n / 18) * Math.PI * 2 + range(-0.07, 0.07),
      r = range(19.9, 23.8);
    if (Math.abs(a - Math.PI) < 0.2) continue;
    treeLocations.push({
      x: Math.sin(a) * r,
      z: Math.cos(a) * r,
      height: range(4.4, 7.3),
    });
  }
  treeLocations.push(
    { x: -8.2, z: 5.8, height: 5.3 },
    { x: 10.5, z: 7.1, height: 5.6 },
    { x: -6.7, z: -12.5, height: 5.1 },
  );
  const trunks = batch(
    new THREE.CylinderGeometry(0.12, 0.22, 1, 7),
    bark,
    treeLocations.length * 20,
  );
  let trunkN = 0;
  const crownMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.94,
    flatShading: false,
  });
  swaying(crownMaterial, 0.018, true);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const crownVertices = crownGeometry.getAttribute("position");
  for (let i = 0; i < crownVertices.count; i++) {
    const x = crownVertices.getX(i),
      y = crownVertices.getY(i),
      z = crownVertices.getZ(i),
      variation = 1 + Math.sin(x * 13.1 + z * 8.7) * Math.cos(y * 11.3) * 0.23;
    crownVertices.setXYZ(i, x * variation, y * variation, z * variation);
  }
  crownGeometry.computeVertexNormals();
  const canopy = batch(
    winter ? new THREE.ConeGeometry(1, 1, 12) : crownGeometry,
    crownMaterial,
    treeLocations.length * (winter ? 7 : 38),
  );
  const treeSnow = winter ? snow.clone() : null;
  if (treeSnow) swaying(treeSnow, 0.018, true);
  const caps = treeSnow
    ? batch(
        new THREE.ConeGeometry(1, 1, 12),
        treeSnow,
        treeLocations.length * 7,
      )
    : null;
  // A translucent cutout stamp contains individual five-petal blossoms or fir needles.
  // Small cards break the silhouette; solid masses below them carry convincing shadows.
  const petalCanvas = document.createElement("canvas");
  petalCanvas.width = petalCanvas.height = 128;
  const petalCtx = petalCanvas.getContext("2d")!;
  if (winter) {
    petalCtx.strokeStyle = "#cce2da";
    petalCtx.lineWidth = 1.5;
    for (let i = 0; i < 35; i++) {
      const x = range(12, 116),
        y = range(12, 116);
      petalCtx.beginPath();
      petalCtx.moveTo(x, y);
      petalCtx.lineTo(x + range(-12, 12), y - range(9, 21));
      petalCtx.stroke();
    }
  } else {
    for (let i = 0; i < 14; i++) {
      const x = range(15, 113),
        y = range(15, 113),
        r = range(4, 7),
        phase = range(0, 6);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + phase;
        petalCtx.fillStyle = ["#ffe3dd", "#ffd1d2", "#efafb9", "#f4c4c2"][
          i % 4
        ];
        petalCtx.beginPath();
        petalCtx.ellipse(
          x + Math.cos(a) * r * 0.62,
          y + Math.sin(a) * r * 0.62,
          r * 0.76,
          r * 0.45,
          a,
          0,
          Math.PI * 2,
        );
        petalCtx.fill();
      }
      petalCtx.fillStyle = "#b7546c";
      petalCtx.beginPath();
      petalCtx.ellipse(x, y, 1.2, 1.2, 0, 0, Math.PI * 2);
      petalCtx.fill();
    }
  }
  const petalMap = new THREE.CanvasTexture(petalCanvas);
  petalMap.colorSpace = THREE.SRGBColorSpace;
  petalMap.anisotropy = 4;
  textures.push(petalMap);
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: petalMap,
    alphaTest: 0.34,
    side: THREE.DoubleSide,
    roughness: 0.88,
  });
  swaying(petalMaterial, 0.06, true);
  const petalCards = batch(
    new THREE.PlaneGeometry(1, 1),
    petalMaterial,
    treeLocations.length * (winter ? 72 : 190),
  );
  let petalN = 0;
  const foliageTint = new THREE.Color();
  let crownN = 0;
  treeLocations.forEach((p, treeIndex) => {
    instance(
      trunks,
      trunkN++,
      p.x,
      p.height * 0.36,
      p.z,
      1,
      p.height * 0.72,
      1,
      0,
      0.05,
      range(-0.08, 0.08),
    );
    obstacles.push({ x: p.x, z: p.z, radius: 0.42, height: p.height });
    if (winter) {
      for (let j = 0; j < 7; j++) {
        const width = (1 - j * 0.118) * p.height * 0.28,
          y = p.height * (0.25 + j * 0.105);
        instance(
          canopy,
          crownN,
          p.x,
          y,
          p.z,
          width,
          p.height * 0.25,
          width,
          treeIndex + j * 0.2,
          0,
          0,
          new THREE.Color(j % 2 ? "#244e4d" : "#3e6961").multiplyScalar(
            range(0.8, 1.25),
          ),
        );
        instance(
          caps!,
          crownN,
          p.x + width * 0.03,
          y + p.height * 0.045,
          p.z,
          width * 0.85,
          p.height * 0.19,
          width * 0.88,
          treeIndex + j * 0.2,
          0,
          0,
          new THREE.Color("#e7f2f2").multiplyScalar(range(0.85, 1.1)),
        );
        crownN++;
      }
      for (let j = 0; j < 72; j++) {
        const h = range(0.24, 0.91),
          a = range(0, Math.PI * 2),
          r = (1 - h) * p.height * 0.35;
        instance(
          petalCards,
          petalN++,
          p.x + Math.cos(a) * r,
          p.height * h,
          p.z + Math.sin(a) * r,
          range(0.35, 0.6),
          range(0.45, 0.7),
          1,
          a,
          -Math.PI * 0.2,
          range(-0.5, 0.5),
          j % 3 ? "#416d5f" : "#aec9bf",
        );
      }
    } else {
      for (let j = 0; j < 6; j++) {
        const a = j * 2.4 + treeIndex,
          bx = Math.cos(a) * p.height * 0.25,
          bz = Math.sin(a) * p.height * 0.25;
        const start = new THREE.Vector3(p.x, p.height * 0.4, p.z),
          end = new THREE.Vector3(
            p.x + bx,
            p.height * (0.69 + (j % 2) * 0.1),
            p.z + bz,
          ),
          delta = end.clone().sub(start);
        object.position.copy(start).addScaledVector(delta, 0.5);
        object.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          delta.clone().normalize(),
        );
        object.scale.set(0.48, delta.length(), 0.48);
        object.updateMatrix();
        trunks.setMatrixAt(trunkN++, object.matrix);
        for (const fork of [-1, 1]) {
          const tip = end
              .clone()
              .add(
                new THREE.Vector3(
                  Math.cos(a + fork * 0.65) * 0.62,
                  0.45,
                  Math.sin(a + fork * 0.65) * 0.62,
                ),
              ),
            twig = tip.clone().sub(end);
          object.position.copy(end).addScaledVector(twig, 0.5);
          object.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            twig.clone().normalize(),
          );
          object.scale.set(0.18, twig.length(), 0.18);
          object.updateMatrix();
          trunks.setMatrixAt(trunkN++, object.matrix);
        }
      }
      const crowns: { x: number; y: number; z: number; s: number }[] = [];
      for (let j = 0; j < 38; j++) {
        const a = j * 2.399 + treeIndex * 0.3,
          r = Math.sqrt((j + 0.5) / 38) * p.height * 0.34,
          top = p.height * (0.84 + range(-0.07, 0.09)) - r * 0.13,
          size = range(0.36, 0.67);
        foliageTint
          .set(["#e8b2ac", "#d98f9f", "#b76e86", "#efc2b4", "#d59c9d"][j % 5])
          .multiplyScalar(range(0.86, 1.12));
        const cx = p.x + Math.cos(a) * r,
          cz = p.z + Math.sin(a) * r;
        instance(
          canopy,
          crownN++,
          cx,
          top,
          cz,
          size * 1.14,
          size * 0.7,
          size,
          a,
          0.2,
          0,
          foliageTint,
        );
        crowns.push({ x: cx, y: top, z: cz, s: size });
      }
      for (let j = 0; j < 190; j++) {
        const c = crowns[j % crowns.length],
          a = j * 2.399,
          r = c.s * range(0.35, 1.15),
          py = c.y + range(-0.16, 0.28);
        instance(
          petalCards,
          petalN++,
          c.x + Math.cos(a) * r,
          py,
          c.z + Math.sin(a) * r,
          range(0.5, 0.83),
          range(0.45, 0.75),
          1,
          a,
          -Math.PI * 0.5 + range(-0.65, 0.65),
          range(-0.25, 0.25),
          new THREE.Color("#ffffff").multiplyScalar(range(0.83, 1.06)),
        );
      }
    }
  });
  trunks.count = trunkN;
  petalCards.count = petalN;

  // Ground dressing is excluded from paths, ruins and shrine platforms.
  function isMeadow(x: number, z: number) {
    return (
      Math.hypot(x, z) > 3.8 &&
      Math.hypot(x, z) < 24.4 &&
      distanceToPath(x, z) > 1.9 &&
      !(z < -16 && Math.abs(x) < 16)
    );
  }
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.13, 0, 0, 0.13, 0, 0, -0.065, 0.55, 0.08, 0.13, 0, 0, 0.065, 0.55,
        0.08, -0.065, 0.55, 0.08, -0.065, 0.55, 0.08, 0.065, 0.55, 0.08, 0.03,
        1, 0.2,
      ],
      3,
    ),
  );
  grassGeometry.computeVertexNormals();
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    roughness: 1,
  });
  swaying(grassMaterial, 0.24);
  const grass = batch(
    grassGeometry,
    grassMaterial,
    winter ? 1400 : 9800,
    false,
  );
  const grassPatches: { x: number; z: number }[] = [];
  for (let n = 0; n < 100; n++) {
    let x = range(-23, 23),
      z = range(-23, 23);
    while (!isMeadow(x, z)) {
      x = range(-23, 23);
      z = range(-23, 23);
    }
    grassPatches.push({ x, z });
  }
  for (let n = 0; n < grass.count; n++) {
    let x = 0,
      z = 0;
    for (let tries = 0; tries < 50; tries++) {
      const patch = grassPatches[n % grassPatches.length];
      x = n % 3 ? patch.x + range(-1.15, 1.15) : range(-24, 24);
      z = n % 3 ? patch.z + range(-1.15, 1.15) : range(-24, 24);
      if (isMeadow(x, z)) break;
    }
    const scale = range(0.21, 0.62),
      tint = new THREE.Color().setHSL(
        winter ? 0.48 : range(0.21, 0.31),
        winter ? 0.13 : range(0.38, 0.65),
        winter ? range(0.5, 0.7) : range(0.25, 0.43),
      );
    instance(
      grass,
      n,
      x,
      0.01,
      z,
      range(0.6, 1.4),
      scale,
      1,
      range(0, Math.PI * 2),
      0,
      0,
      tint,
    );
  }
  const shrubMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.95,
  });
  swaying(shrubMaterial, 0.035);
  const bushes = batch(
    crownGeometry,
    winter ? snow : shrubMaterial,
    winter ? 60 : 150,
  );
  const rocks = batch(rockGeometry, darkStone, 74);
  for (let n = 0; n < 74; n++) {
    let x = range(-22, 22),
      z = range(-22, 22);
    while (!isMeadow(x, z)) {
      x = range(-22, 22);
      z = range(-22, 22);
    }
    const scale = n < 19 ? range(0.48, 0.9) : range(0.12, 0.4);
    instance(
      rocks,
      n,
      x,
      scale * 0.25,
      z,
      scale * 1.3,
      scale * 0.7,
      scale,
      range(0, 6),
      range(-0.3, 0.3),
      range(-0.3, 0.3),
      new THREE.Color(stoneColor).multiplyScalar(range(0.8, 1.2)),
    );
    if (n < 19) obstacles.push({ x, z, radius: scale * 0.8, height: scale });
  }
  for (let n = 0; n < bushes.count; n++) {
    let x = range(-23, 23),
      z = range(-23, 23);
    while (!isMeadow(x, z)) {
      x = range(-23, 23);
      z = range(-23, 23);
    }
    instance(
      bushes,
      n,
      x,
      0.1,
      z,
      range(0.25, 0.58),
      range(0.16, 0.37),
      range(0.3, 0.6),
      range(0, 6),
      0,
      0,
      new THREE.Color(
        winter
          ? "#cbdfe0"
          : ["#365d32", "#638340", "#456a32", "#719148"][n % 4],
      ).multiplyScalar(range(0.8, 1.2)),
    );
  }
  const fernVertices: number[] = [];
  for (let n = 0; n < 8; n++) {
    const y = 0.12 + n * 0.09,
      width = Math.sin(((n + 1) / 9) * Math.PI) * 0.25,
      z = y * y * 0.45;
    for (const side of [-1, 1]) {
      fernVertices.push(
        0,
        y,
        z,
        side * width,
        y + 0.08,
        z + 0.02,
        side * width * 0.52,
        y + 0.1,
        z + 0.025,
        0,
        y,
        z,
        side * width * 0.52,
        y + 0.1,
        z + 0.025,
        0,
        y + 0.07,
        z + 0.025,
      );
    }
  }
  const fernGeometry = new THREE.BufferGeometry();
  fernGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(fernVertices, 3),
  );
  fernGeometry.computeVertexNormals();
  const fernMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.87,
    side: THREE.DoubleSide,
  });
  swaying(fernMaterial, 0.12);
  const ferns = batch(fernGeometry, fernMaterial, winter ? 70 : 520, false);
  for (let n = 0; n < ferns.count; n++) {
    const p = grassPatches[Math.floor(n / 5) % grassPatches.length],
      a = (n / 5) * Math.PI * 2;
    instance(
      ferns,
      n,
      p.x + Math.sin(a) * 0.16,
      0.02,
      p.z + Math.cos(a) * 0.16,
      range(0.6, 1.1),
      range(0.45, 0.85),
      1,
      a,
      0.4,
      range(-0.2, 0.2),
      winter ? "#809b95" : ["#4b813d", "#789a46", "#35693b"][n % 3],
    );
  }
  const flowers = batch(
    new THREE.SphereGeometry(0.065, 5, 4),
    new THREE.MeshStandardMaterial({
      color: "#fff4cb",
      roughness: 0.8,
      emissive: winter ? "#22496b" : "#382b15",
      emissiveIntensity: 0.15,
    }),
    winter ? 90 : 750,
    false,
  );
  const flowerStems = batch(
    new THREE.CylinderGeometry(0.012, 0.018, 1, 3),
    leaf,
    flowers.count,
    false,
  );
  for (let n = 0; n < flowers.count; n++) {
    let x = range(-23, 23),
      z = range(-23, 23);
    while (!isMeadow(x, z)) {
      x = range(-23, 23);
      z = range(-23, 23);
    }
    const h = range(0.16, 0.5),
      c = winter
        ? "#94d4df"
        : ["#fff0bd", "#ccacd0", "#eec3ad", "#eac456"][n % 4];
    instance(flowers, n, x, h, z, range(0.7, 1.4), 0.6, 1, 0, 0, 0, c);
    instance(flowerStems, n, x, h * 0.5, z, 1, h, 1);
  }
  if (winter) {
    const crystals = batch(
      new THREE.ConeGeometry(0.34, 1.7, 5),
      new THREE.MeshPhysicalMaterial({
        color: "#88bbd2",
        metalness: 0.26,
        roughness: 0.19,
        clearcoat: 1,
        emissive: "#1a5571",
        emissiveIntensity: 0.3,
      }),
      64,
    );
    for (let n = 0; n < 64; n++) {
      const a = (n / 64) * Math.PI * 2,
        r = range(19, 25),
        h = range(0.3, 1.15);
      instance(
        crystals,
        n,
        Math.cos(a) * r,
        h * 0.5,
        Math.sin(a) * r,
        range(0.4, 1.2),
        h,
        range(0.4, 1.2),
        a,
        range(-0.2, 0.2),
      );
    }
  } else {
    const ivy = batch(new THREE.SphereGeometry(1, 5, 4), leaf, 200, false);
    for (let n = 0; n < 200; n++) {
      const side = n % 2 ? -1 : 1,
        x = side * range(3.1, 3.65),
        y = range(0.2, 4.9);
      instance(
        ivy,
        n,
        x,
        y,
        -17.44 + range(-0.1, 0.15),
        range(0.08, 0.18),
        range(0.05, 0.1),
        range(0.08, 0.15),
        range(0, 6),
      );
    }
    const mushroomStem = batch(unitCylinder, lightStone, 40, false),
      mushroomCaps = batch(
        new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: "#bb7150", roughness: 0.7 }),
        40,
      );
    for (let n = 0; n < 40; n++) {
      const t = treeLocations[n % treeLocations.length],
        x = t.x + range(-1.2, 1.2),
        z = t.z + range(-1.2, 1.2),
        s = range(0.06, 0.15);
      instance(mushroomStem, n, x, s, z, s * 0.23, s * 1.8, s * 0.23);
      instance(mushroomCaps, n, x, s * 1.8, z, s, s * 0.7, s);
    }
  }

  // Shallow reflective patches with inset rims: ice in winter, rain puddles in spring.
  const puddleMaterial = new THREE.MeshPhysicalMaterial({
    color: winter ? "#88b9c9" : "#6d9283",
    roughness: winter ? 0.17 : 0.1,
    metalness: 0.36,
    transparent: true,
    opacity: 0.55,
    clearcoat: 1,
    depthWrite: false,
  });
  for (const [x, z, sx, sz] of [
    [6, 3, 2.2, 1.3],
    [-6, -4, 1.5, 1.2],
    [9, -13, 1.5, 0.85],
    [-13, 10, 2.5, 1.5],
    [4, 18, 2, 1.3],
  ]) {
    const patch = mesh(
      new THREE.CircleGeometry(1, 30),
      puddleMaterial,
      x,
      0.005,
      z,
      sx,
      sz,
      1,
    );
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = range(0, 6);
    patch.castShadow = false;
  }

  // Movable crates and ceramic urns are real rigid-body props, supplied to the engine.
  const wood = new THREE.MeshStandardMaterial({
    color: "#6d5140",
    roughness: 0.9,
  });
  const urnMaterial = new THREE.MeshStandardMaterial({
    color: winter ? "#799ca5" : "#a77f63",
    roughness: 0.73,
  });
  const propLocations = [
    [-4.5, -14.7],
    [-5.4, -15.2],
    [5.5, -15.6],
    [15, -3.5],
    [15.6, -3.3],
    [-15.5, 1.7],
    [-15, 2.5],
    [7.7, 15.5],
    [-6.9, 16.2],
    [-15.8, -11.5],
  ];
  for (let n = 0; n < propLocations.length; n++) {
    const [x, z] = propLocations[n],
      prop = new THREE.Group(),
      isUrn = n % 3 === 0,
      half: [number, number, number] = isUrn
        ? [0.29, 0.4, 0.29]
        : [0.38, 0.38, 0.38];
    const body = new THREE.Mesh(
      isUrn
        ? new THREE.LatheGeometry(
            [
              new THREE.Vector2(0.14, -0.4),
              new THREE.Vector2(0.3, -0.27),
              new THREE.Vector2(0.33, 0.05),
              new THREE.Vector2(0.23, 0.3),
              new THREE.Vector2(0.17, 0.35),
              new THREE.Vector2(0.21, 0.4),
            ],
            12,
          )
        : new THREE.BoxGeometry(0.76, 0.76, 0.76),
      isUrn ? urnMaterial : wood,
    );
    body.castShadow = body.receiveShadow = true;
    prop.add(body);
    if (!isUrn)
      for (const y of [-0.28, 0.28]) {
        const strap = new THREE.Mesh(
          new THREE.BoxGeometry(0.78, 0.045, 0.78),
          darkStone,
        );
        strap.position.y = y;
        prop.add(strap);
      }
    if (winter) {
      const cap = new THREE.Mesh(
        isUrn
          ? new THREE.CylinderGeometry(0.21, 0.23, 0.04, 12)
          : new THREE.BoxGeometry(0.77, 0.06, 0.77),
        snow,
      );
      cap.position.y = 0.4;
      prop.add(cap);
    }
    prop.position.set(x, half[1] + 0.03, z);
    prop.rotation.y = range(0, 6);
    group.add(prop);
    props.push({ mesh: prop, halfSize: half, mass: isUrn ? 2.2 : 5 });
  }

  // Small warm lamps establish depth and make the winter palette inviting.
  const lanterns: {
    light: THREE.PointLight;
    flame: THREE.Mesh;
    phase: number;
  }[] = [];
  for (const [x, z] of [
    [-4.5, -2.7],
    [4.5, -2.7],
    [-4, 9],
    [4, 9],
    [-14.5, -8],
    [14.5, -7],
  ]) {
    mesh(new THREE.CylinderGeometry(0.26, 0.39, 0.7, 6), darkStone, x, 0.35, z);
    mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.13, 8), gold, x, 0.74, z);
    const flame = mesh(
      new THREE.OctahedronGeometry(0.12),
      glow,
      x,
      0.93,
      z,
      0.7,
      1.65,
      0.7,
    );
    const light = new THREE.PointLight(
      winter ? "#ffc27a" : "#ffd28d",
      winter ? 1.8 : 1,
      4.5,
      2,
    );
    light.position.set(x, 1.1, z);
    group.add(light);
    lanterns.push({ light, flame, phase: range(0, 6) });
  }

  // Feathered particles avoid square sprites, even against the dark water.
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = spriteCanvas.height = 32;
  const spriteCtx = spriteCanvas.getContext("2d")!,
    gradient = spriteCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(0.4, "#ffffffd0");
  gradient.addColorStop(1, "#ffffff00");
  spriteCtx.fillStyle = gradient;
  spriteCtx.fillRect(0, 0, 32, 32);
  const sprite = new THREE.CanvasTexture(spriteCanvas);
  textures.push(sprite);
  const weatherN = winter ? 950 : 280,
    weatherPositions = new Float32Array(weatherN * 3),
    weatherSpeed = new Float32Array(weatherN);
  for (let n = 0; n < weatherN; n++) {
    weatherPositions.set(
      [range(-30, 30), range(0.5, 16), range(-30, 30)],
      n * 3,
    );
    weatherSpeed[n] = range(0.45, 1.35);
  }
  const weatherGeometry = new THREE.BufferGeometry();
  weatherGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(weatherPositions, 3),
  );
  const weather = new THREE.Points(
    weatherGeometry,
    new THREE.PointsMaterial({
      color: winter ? "#e9f8ff" : "#f9c8c3",
      size: winter ? 0.075 : 0.095,
      map: sprite,
      transparent: true,
      opacity: winter ? 0.72 : 0.66,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  weather.frustumCulled = false;
  group.add(weather);
  const fireflyPositions = new Float32Array(70 * 3);
  for (let n = 0; n < 70; n++)
    fireflyPositions.set(
      [range(-20, 20), range(0.15, 1.3), range(-20, 20)],
      n * 3,
    );
  const fireflyGeometry = new THREE.BufferGeometry();
  fireflyGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(fireflyPositions, 3),
  );
  const fireflies = new THREE.Points(
    fireflyGeometry,
    new THREE.PointsMaterial({
      color: winter ? "#89cfff" : "#ddf2a4",
      size: 0.11,
      map: sprite,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  group.add(fireflies);

  // A very low translucent ground haze, not a screen-filling fog overlay.
  const hazeMaterial = new THREE.MeshBasicMaterial({
    color: winter ? "#b8d6e4" : "#c4c8ac",
    transparent: true,
    opacity: 0.025,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const haze = mesh(new THREE.PlaneGeometry(48, 48), hazeMaterial, 0, 0.24, 0);
  haze.rotation.x = -Math.PI / 2;
  haze.castShadow = haze.receiveShadow = false;

  const update = (dt: number, time: number, player: THREE.Vector3) => {
    wind.value = time;
    playerWorld.value.copy(player);
    for (let n = 0; n < weatherN; n++) {
      const i = n * 3,
        speed = weatherSpeed[n];
      weatherPositions[i] +=
        dt * ((winter ? 1.25 : 0.55) + Math.sin(time * 0.4 + n) * 0.26);
      weatherPositions[i + 1] -= dt * speed * (winter ? 1.1 : 0.42);
      weatherPositions[i + 2] += dt * Math.sin(time * 0.3 + n * 0.73) * 0.25;
      if (weatherPositions[i + 1] < 0.05) {
        weatherPositions[i + 1] = 13;
        weatherPositions[i] = range(-30, 30);
        weatherPositions[i + 2] = range(-30, 30);
      }
      if (weatherPositions[i] > 31) weatherPositions[i] = -31;
    }
    weatherGeometry.attributes.position.needsUpdate = true;
    for (let n = 0; n < 70; n++)
      fireflyPositions[n * 3 + 1] = 0.8 + Math.sin(time * 0.6 + n * 4.1) * 0.5;
    fireflyGeometry.attributes.position.needsUpdate = true;
    (fireflies.material as THREE.PointsMaterial).opacity =
      0.45 + Math.sin(time * 0.7) * 0.15;
    lanterns.forEach((l) => {
      const f = Math.sin(time * 7 + l.phase) * Math.sin(time * 13.1 + l.phase);
      l.light.intensity = (winter ? 1.7 : 0.95) + f * 0.16;
      l.flame.scale.y = 1.6 + f * 0.24;
    });
    shrines.forEach((s, index) => {
      s.gem.position.y = 1.4 + Math.sin(time * 1.3 + index) * 0.14;
      s.gem.rotation.y = time * 0.5;
      s.gem.rotation.z = Math.sin(time + index) * 0.09;
      const amount = s.active ? 1 : s.progress;
      (s.gem.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.2 + amount * 2;
      s.light.intensity = 0.3 + amount * 2.5;
      for (const ring of s.rings)
        (ring.material as THREE.MeshBasicMaterial).opacity =
          0.25 + amount * 0.7;
      (s.motes.material as THREE.PointsMaterial).opacity = 0.2 + amount * 0.7;
      s.rings[1].rotation.z = time * 0.13;
    });
  };
  const setShrine = (index: number, progress: number, active: boolean) => {
    const s = shrines[index];
    if (s) {
      s.progress = THREE.MathUtils.clamp(progress, 0, 1);
      s.active = active;
    }
  };
  const dispose = () => {
    scene.remove(group);
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material)
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) =>
          materials.add(mat),
        );
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };
  update(0, 0, new THREE.Vector3());
  return {
    group,
    obstacles,
    props,
    shrinePositions,
    update,
    setShrine,
    dispose,
  };
}
