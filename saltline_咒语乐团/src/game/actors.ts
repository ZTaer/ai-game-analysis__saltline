import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Season } from "./types";

// Static pieces are merged per material. A whole creature costs only a handful
// of draw calls; articulated pieces remain separate for locomotion.
const materials = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, metal = 0, glow = 0, intensity = 0) {
  const key = `${color}/${metal}/${glow}/${intensity}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: metal ? 0.43 : 0.82,
        metalness: metal,
        emissive: glow,
        emissiveIntensity: intensity,
        flatShading: true,
      }),
    );
  return materials.get(key)!;
}
const teal = mat(0x153e3c),
  darkTeal = mat(0x0b2429),
  blue = mat(0x235455);
const brass = mat(0xc6a965, 0.7),
  ivory = mat(0xd8cfb4),
  leather = mat(0x322a28);
const dark = mat(0x151b1c),
  magic = mat(0xb5ffe2, 0.3, 0x40ffc0, 2.2);

function mesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const sphere = new THREE.IcosahedronGeometry(1, 1);
const octa = new THREE.OctahedronGeometry(1, 0);
const cube = new THREE.BoxGeometry(1, 1, 1);
function ball(
  p: THREE.Object3D,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy = sx,
  sz = sx,
) {
  return mesh(p, sphere, m, x, y, z, sx, sy, sz);
}
function rod(
  p: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r1: number,
  r2: number,
  m: THREE.Material,
  sides = 7,
) {
  const d = b.clone().sub(a);
  const o = mesh(p, new THREE.CylinderGeometry(r2, r1, d.length(), sides), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}
function branch(
  p: THREE.Object3D,
  coords: number[][],
  radius: number,
  m: THREE.Material,
) {
  for (let k = 1; k < coords.length; k++)
    rod(
      p,
      new THREE.Vector3(...(coords[k - 1] as [number, number, number])),
      new THREE.Vector3(...(coords[k] as [number, number, number])),
      radius * (1 - (k - 1) / coords.length),
      radius * (1 - k / coords.length),
      m,
    );
}
function ring(
  p: THREE.Object3D,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  r: number,
  t: number,
  rx = 0,
) {
  const o = mesh(p, new THREE.TorusGeometry(r, t, 5, 24), m, x, y, z);
  o.rotation.x = rx;
  return o;
}
function batch(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const sets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Object3D[] = [];
  for (const o of group.children) {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) continue;
    const geometry = o.geometry.clone();
    geometry.applyMatrix4(o.matrix);
    // All generated primitives carry the same index/position/normal/UV layout
    // after converting to nonindexed. Torus and icosahedra differ otherwise.
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute("uv");
    if (!sets.has(o.material)) sets.set(o.material, []);
    sets.get(o.material)!.push(g);
    remove.push(o);
  }
  remove.forEach((o) => group.remove(o));
  for (const [material, geometries] of sets) {
    const merged = mergeGeometries(geometries, false);
    if (merged) mesh(group, merged, material);
    geometries.forEach((g) => g.dispose());
  }
}

function bentHat() {
  const verts: number[] = [],
    indices: number[] = [];
  const rings = [
    [0.0, 0.0, 0, 0.43],
    [0.03, 0.18, 0.02, 0.31],
    [0.08, 0.37, 0.04, 0.2],
    [0.16, 0.55, 0.07, 0.105],
    [0.3, 0.61, 0.1, 0.025],
  ];
  const sides = 14;
  for (const [x, y, z, r] of rings)
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      verts.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    }
  for (let k = 0; k < rings.length - 1; k++)
    for (let j = 0; j < sides; j++) {
      const a = k * (sides + 1) + j,
        b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function createWizard(): THREE.Group {
  const root = new THREE.Group();
  root.name = "wayfarer";
  const body = new THREE.Group();
  root.add(body);
  const leftLeg = new THREE.Group(),
    rightLeg = new THREE.Group();
  leftLeg.position.set(-0.18, 0.26, 0);
  rightLeg.position.set(0.18, 0.26, 0);
  root.add(leftLeg, rightLeg);
  for (const leg of [leftLeg, rightLeg]) {
    mesh(leg, cube, leather, 0, -0.1, -0.07, 0.22, 0.29, 0.38);
    mesh(leg, cube, brass, 0, -0.09, -0.23, 0.2, 0.07, 0.045);
    batch(leg);
  }
  const robe = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.43, 0.22),
      new THREE.Vector2(0.48, 0.3),
      new THREE.Vector2(0.34, 0.65),
      new THREE.Vector2(0.27, 0.94),
      new THREE.Vector2(0.4, 1.14),
      new THREE.Vector2(0.21, 1.28),
    ],
    14,
  );
  mesh(body, robe, teal);
  // Alternating seams and an embroidered front tabard keep the silhouette legible.
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2;
    rod(
      body,
      new THREE.Vector3(Math.cos(a) * 0.425, 0.28, Math.sin(a) * 0.425),
      new THREE.Vector3(Math.cos(a) * 0.29, 0.82, Math.sin(a) * 0.29),
      0.014,
      0.009,
      blue,
      4,
    );
  }
  mesh(body, cube, darkTeal, 0, 0.68, -0.32, 0.32, 0.65, 0.035);
  for (const x of [-0.135, 0.135])
    mesh(body, cube, brass, x, 0.66, -0.345, 0.017, 0.63, 0.018);
  mesh(body, cube, brass, 0, 0.32, -0.35, 0.28, 0.028, 0.03);
  mesh(
    body,
    new THREE.CylinderGeometry(0.294, 0.3, 0.09, 14),
    leather,
    0,
    0.84,
    0,
  );
  mesh(body, cube, brass, 0, 0.84, -0.315, 0.15, 0.13, 0.04);
  mesh(body, cube, darkTeal, 0, 0.84, -0.345, 0.075, 0.068, 0.025);
  // Back cape, shoulder mantle and ivory throat wrap.
  ball(body, darkTeal, 0, 0.75, 0.26, 0.4, 0.54, 0.16);
  mesh(
    body,
    new THREE.CylinderGeometry(0.21, 0.47, 0.16, 14),
    blue,
    0,
    1.17,
    0,
  );
  ring(body, brass, 0, 1.11, 0, 0.43, 0.018, Math.PI / 2);
  mesh(
    body,
    new THREE.CylinderGeometry(0.18, 0.23, 0.12, 12),
    ivory,
    0,
    1.28,
    0,
  );
  ball(body, mat(0xb99b79), 0, 1.43, -0.025, 0.22, 0.22, 0.21);
  ball(body, dark, 0, 1.45, -0.16, 0.2, 0.11, 0.075);
  for (const x of [-0.075, 0.075])
    ball(body, magic, x, 1.46, -0.224, 0.026, 0.018, 0.016);
  mesh(
    body,
    new THREE.CylinderGeometry(0.53, 0.51, 0.035, 18),
    darkTeal,
    0,
    1.64,
    0,
  ).rotation.z = -0.045;
  mesh(body, bentHat(), teal, 0, 1.64, 0);
  mesh(
    body,
    new THREE.CylinderGeometry(0.378, 0.42, 0.09, 14),
    leather,
    0.012,
    1.695,
    0.008,
  );
  ring(body, brass, 0.012, 1.74, 0.008, 0.375, 0.013, Math.PI / 2);
  mesh(body, octa, brass, 0.16, 1.73, -0.35, 0.07, 0.09, 0.025).rotation.z =
    0.25;
  // Book, potion, satchel, and pendant: small but visible in the close menu view.
  mesh(body, cube, leather, -0.35, 0.7, 0.02, 0.17, 0.26, 0.21).rotation.z =
    -0.13;
  mesh(body, cube, ivory, -0.36, 0.7, -0.09, 0.12, 0.19, 0.025);
  ball(
    body,
    mat(0x6fa8a0, 0.45, 0x236f62, 0.3),
    0.31,
    0.73,
    0.13,
    0.085,
    0.11,
    0.085,
  );
  mesh(
    body,
    new THREE.CylinderGeometry(0.045, 0.045, 0.06, 6),
    brass,
    0.31,
    0.85,
    0.13,
  );
  mesh(body, octa, brass, 0, 1.15, -0.35, 0.065, 0.085, 0.035);
  const arm = new THREE.Group();
  arm.position.set(0.39, 1.12, 0);
  body.add(arm);
  rod(
    arm,
    new THREE.Vector3(),
    new THREE.Vector3(0.17, -0.36, -0.13),
    0.16,
    0.105,
    teal,
  );
  ball(arm, ivory, 0.17, -0.36, -0.13, 0.09);
  const staff = new THREE.Group();
  staff.position.set(0.58, 0, -0.13);
  body.add(staff);
  branch(
    staff,
    [
      [0, 0.15, 0],
      [0.03, 0.8, 0],
      [-0.01, 1.45, 0],
      [0.03, 1.85, 0],
    ],
    0.037,
    leather,
  );
  for (const y of [0.25, 0.8, 1.58])
    mesh(
      staff,
      new THREE.CylinderGeometry(0.047, 0.047, 0.05, 8),
      brass,
      0,
      y,
      0,
    );
  ring(staff, brass, 0.03, 1.89, 0, 0.17, 0.025);
  for (const x of [-0.12, 0.12])
    branch(
      staff,
      [
        [0, 1.61, 0],
        [x, 1.79, 0],
        [x * 0.8, 1.99, 0],
      ],
      0.023,
      brass,
    );
  const crystal = mesh(
    staff,
    octa.clone(),
    magic,
    0.03,
    1.91,
    0,
    0.09,
    0.18,
    0.09,
  );
  // Preserve the rotating crystal as a separate pivot before static batching.
  staff.remove(crystal);
  batch(staff);
  staff.add(crystal);
  batch(arm);
  batch(body);
  root.userData = {
    body,
    legs: [leftLeg, rightLeg],
    staff,
    crystal,
    baseY: 0,
    kind: "wizard",
  };
  return root;
}

function antler(
  group: THREE.Group,
  side: number,
  y: number,
  scale: number,
  m: THREE.Material,
) {
  const path = [
    [side * 0.25, y, 0],
    [side * 0.52, y + 0.34, -0.02],
    [side * 0.75, y + 0.72, 0.02],
    [side * 0.65, y + 1.1, 0.02],
  ];
  branch(
    group,
    path.map((p) => [p[0] * scale, p[1] * scale, p[2] * scale]),
    0.082 * scale,
    m,
  );
  branch(
    group,
    [
      [side * 0.5 * scale, (y + 0.32) * scale, 0],
      [side * 0.95 * scale, (y + 0.48) * scale, 0.04],
      [side * 1.12 * scale, (y + 0.76) * scale, 0],
    ],
    0.052 * scale,
    m,
  );
  branch(
    group,
    [
      [side * 0.74 * scale, (y + 0.68) * scale, 0],
      [side * 0.98 * scale, (y + 0.92) * scale, -0.07],
    ],
    0.04 * scale,
    m,
  );
}

export function createEnemy(
  kind: "crawler" | "wisp" | "brute" | "boss",
  season: Season,
): THREE.Group {
  const winter = season === "winter";
  const bark = mat(winter ? 0x30475b : 0x493e2a),
    shade = mat(winter ? 0x172d43 : 0x252b22);
  const armor = mat(winter ? 0x9bbfd0 : 0x657b45, 0.12),
    edge = mat(winter ? 0xd6e9e8 : 0xa7b66b, 0.15);
  const eye = mat(
    winter ? 0xa8f2ff : 0xffb77b,
    0.15,
    winter ? 0x48c9ff : 0xff6139,
    2.1,
  );
  const root = new THREE.Group();
  root.name = `${season}-${kind}`;
  const body = new THREE.Group();
  root.add(body);
  const legs: THREE.Group[] = [];
  const ornaments: THREE.Object3D[] = [];
  if (kind === "wisp") {
    ball(body, shade, 0, 0.85, 0, 0.35, 0.42, 0.31);
    ball(body, armor, 0, 0.94, 0.06, 0.3, 0.32, 0.24);
    for (const x of [-0.1, 0.1])
      ball(body, eye, x, 0.91, -0.29, 0.055, 0.045, 0.035);
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2;
      const shard = mesh(
        body,
        octa.clone(),
        j % 2 ? edge : armor,
        Math.sin(a) * 0.28,
        0.48,
        Math.cos(a) * 0.28,
        0.075,
        0.34,
        0.07,
      );
      shard.rotation.z = Math.sin(a) * 0.27;
      ornaments.push(shard);
    }
    for (const side of [-1, 1]) {
      const shard = mesh(
        body,
        octa,
        edge,
        side * 0.31,
        1.25,
        0.04,
        0.1,
        0.33,
        0.09,
      );
      shard.rotation.z = -side * 0.45;
    }
    ring(body, eye, 0, 0.63, 0, 0.37, 0.018, Math.PI / 2);
    ornaments.forEach((o) => body.remove(o));
    batch(body);
    ornaments.forEach((o) => body.add(o));
  } else if (kind === "crawler") {
    ball(body, bark, 0, 0.55, 0.02, 0.43, 0.4, 0.38);
    ball(body, armor, 0, 0.74, 0.12, 0.4, 0.28, 0.32);
    ball(body, shade, 0, 0.58, -0.26, 0.31, 0.22, 0.16);
    for (const x of [-0.12, 0.12]) {
      ball(body, eye, x, 0.64, -0.4, 0.055, 0.042, 0.035);
      mesh(body, octa, edge, x, 0.42, -0.37, 0.047, 0.1, 0.045).rotation.x =
        0.22;
    }
    for (const side of [-1, 1]) {
      branch(
        body,
        [
          [side * 0.22, 0.83, 0.02],
          [side * 0.41, 1.12, 0.05],
          [side * 0.51, 1.3, -0.1],
        ],
        0.075,
        bark,
      );
      mesh(
        body,
        octa,
        armor,
        side * 0.43,
        1.11,
        0.05,
        0.12,
        0.26,
        0.06,
      ).rotation.z = -side * 0.5;
      const leg = new THREE.Group();
      leg.position.set(side * 0.29, 0.45, 0.06);
      root.add(leg);
      legs.push(leg);
      branch(
        leg,
        [
          [0, 0, 0],
          [side * 0.18, -0.14, -0.12],
          [side * 0.16, -0.37, -0.24],
        ],
        0.095,
        bark,
      );
      for (const x of [-0.04, 0.05])
        mesh(
          leg,
          octa,
          edge,
          side * 0.16 + x,
          -0.36,
          -0.29,
          0.035,
          0.035,
          0.13,
        );
      batch(leg);
    }
    for (let j = 0; j < 3; j++)
      mesh(
        body,
        octa,
        armor,
        (j - 1) * 0.2,
        0.86,
        0.2,
        0.1,
        0.22,
        0.15,
      ).rotation.x = 0.5;
    batch(body);
  } else {
    const boss = kind === "boss",
      s = boss ? 1.65 : 1;
    // Geometry is created at a consistent scale before being attached to the
    // body; the visual pivot is free to breathe independently from the collider.
    body.scale.setScalar(s);
    ball(body, bark, 0, 1.1, 0, 0.58, 0.73, 0.43);
    ball(body, shade, 0, 1.16, -0.23, 0.43, 0.55, 0.25);
    for (const side of [-1, 1]) {
      ball(body, armor, side * 0.5, 1.49, 0.01, 0.34, 0.3, 0.35);
      mesh(
        body,
        octa,
        edge,
        side * 0.58,
        1.72,
        0.05,
        0.16,
        0.29,
        0.16,
      ).rotation.z = -side * 0.5;
      branch(
        body,
        [
          [side * 0.53, 1.4, 0],
          [side * 0.77, 0.91, -0.02],
          [side * 0.68, 0.55, -0.23],
        ],
        0.16,
        bark,
      );
      ball(body, shade, side * 0.68, 0.58, -0.23, 0.22, 0.24, 0.23);
      for (let finger = 0; finger < 3; finger++)
        branch(
          body,
          [
            [side * 0.58 + finger * 0.09, 0.57, -0.38],
            [side * 0.59 + finger * 0.09, 0.38, -0.44],
          ],
          0.037,
          edge,
        );
      const leg = new THREE.Group();
      leg.position.set(side * 0.32 * s, 0.56 * s, 0);
      root.add(leg);
      legs.push(leg);
      ball(leg, bark, 0, -0.18 * s, 0, 0.2 * s, 0.35 * s, 0.2 * s);
      ball(leg, shade, 0, -0.43 * s, -0.13 * s, 0.25 * s, 0.13 * s, 0.34 * s);
      batch(leg);
    }
    ball(body, bark, 0, 1.92, -0.02, 0.33, 0.33, 0.3);
    ball(body, shade, 0, 1.9, -0.25, 0.27, 0.18, 0.12);
    for (const side of [-1, 1]) {
      ball(body, eye, side * 0.115, 1.94, -0.35, 0.065, 0.045, 0.035);
      antler(body, side, 2.06, boss ? 1 : 0.78, boss ? edge : bark);
    }
    // Exposed heart and carved rib plates are a recognizable weak-point motif.
    mesh(body, octa, eye, 0, 1.15, -0.48, 0.17, 0.25, 0.1);
    for (let j = 0; j < 3; j++)
      for (const side of [-1, 1]) {
        const rib = mesh(
          body,
          cube,
          armor,
          side * 0.29,
          1.35 - j * 0.19,
          -0.38,
          0.27,
          0.08,
          0.12,
        );
        rib.rotation.z = side * 0.25;
      }
    for (let j = 0; j < 5; j++)
      mesh(
        body,
        octa,
        armor,
        (j - 2) * 0.14,
        0.56,
        0.34,
        0.14,
        0.31,
        0.16,
      ).rotation.x = 0.4;
    if (boss) {
      for (const side of [-1, 1]) {
        mesh(
          body,
          octa,
          armor,
          side * 0.74,
          1.55,
          0.19,
          0.28,
          0.55,
          0.23,
        ).rotation.z = -side * 0.45;
        branch(
          body,
          [
            [side * 0.4, 1.9, 0.2],
            [side * 0.6, 2.27, 0.2],
            [side * 0.51, 2.57, 0.23],
          ],
          0.065,
          brass,
        );
      }
      const crown = new THREE.Group();
      crown.position.set(0, 2.38, 0);
      body.add(crown);
      ring(crown, brass, 0, 0, 0, 0.48, 0.018, Math.PI / 2);
      for (let j = 0; j < 7; j++) {
        const a = (j / 7) * Math.PI * 2;
        mesh(
          crown,
          octa,
          eye,
          Math.sin(a) * 0.48,
          0.05,
          Math.cos(a) * 0.48,
          0.045,
          0.13,
          0.045,
        );
      }
      batch(crown);
      ornaments.push(crown);
      const rune = ring(body, brass, 0, 1.15, -0.53, 0.25, 0.014);
      ornaments.push(rune);
    }
    batch(body);
  }
  root.userData = {
    body,
    legs,
    ornaments,
    kind,
    season,
    baseY: 0,
    phase: Math.random() * Math.PI * 2,
  };
  return root;
}

export function animateActor(
  group: THREE.Group,
  time: number,
  speed: number,
  kind: string,
): void {
  const d = group.userData;
  if (!d.body) return;
  const moving = Math.min(1, Math.max(0, speed) / 3.5),
    phase = time * (kind === "wizard" ? 10 : 7) + (d.phase || 0);
  d.body.position.y =
    kind === "wisp"
      ? 0.1 + Math.sin(time * 2.5 + (d.phase || 0)) * 0.13
      : Math.sin(phase * 2) * 0.027 * moving + Math.sin(time * 2) * 0.012;
  d.body.rotation.z = Math.sin(phase) * 0.035 * moving;
  for (let j = 0; j < (d.legs?.length || 0); j++) {
    d.legs[j].rotation.x = Math.sin(phase + j * Math.PI) * 0.42 * moving;
  }
  if (d.crystal) {
    d.crystal.rotation.y = time * 1.8;
    d.crystal.position.y = 1.91 + Math.sin(time * 3) * 0.025;
  }
  if (d.staff) d.staff.rotation.x = Math.sin(phase) * 0.045 * moving;
  if (kind === "wisp")
    for (let j = 0; j < (d.ornaments?.length || 0); j++)
      d.ornaments[j].rotation.x = Math.sin(time * 3 + j) * 0.15;
  if (kind === "boss" && d.ornaments?.[0])
    d.ornaments[0].rotation.y = time * 0.25;
}
