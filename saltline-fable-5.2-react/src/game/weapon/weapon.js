/**
 * Saltline / weapon/weapon
 * 从原版游戏按职责提取；保留原始算法、参数、着色器与执行顺序。
 */
import {
  Color,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { vf as WORLD_LAYER, zc as VIEWMODEL_LAYER } from '../config.js';
import { clamp, damp, lerp, saturate } from '../core/math.js';
import { Kc as countTriangles, createRifleGeometry, mi as RIFLE_INFO } from './rifleGeometry.js';
import { createHands } from './hands.js';
import { createRifleDecals } from './decals.js';
import { createOpticGlass, createReticle } from './optic.js';
import { Bf as applyWeaponSurface, Wv as WEAPON_WETNESS } from './materials.js';
import {
  MAGAZINE_CAPACITY,
  INITIAL_RESERVE_AMMO,
  FIRE_RATE_RPM,
  BULLET_DAMAGE,
  BULLET_RANGE,
  HIP_POSE,
  AIM_POSE,
  SPRINT_POSE,
  RELOAD_POSE,
  TACTICAL_RELOAD_SECONDS,
  EMPTY_RELOAD_SECONDS,
} from './tuning.js';
var WeaponVector3 = Vector3,
  WeaponQuaternion = Quaternion,
  smoothBlend = (amount) => (
    (amount = saturate(amount)),
    amount * amount * amount * (amount * (6 * amount - 15) + 10)
  ),
  createSpring = (stiffness, damping) => ({
    x: 0,
    v: 0,
    k: stiffness,
    c: damping,
  });
/* 弹簧按固定上限细分步长积分，保持不同帧率下的后坐力与手部晃动。 */
function updateSpring(spring, target, dt) {
  let steps = dt > 0.012 ? Math.ceil(dt / 0.008) : 1,
    stepSeconds = dt / steps;
  for (let o = 0; o < steps; o++) {
    spring.v += ((target - spring.x) * spring.k - spring.v * spring.c) * stepSeconds;
    spring.x += spring.v * stepSeconds;
  }
  return spring.x;
}
var eulerQuaternion = (pitch, yaw, roll, order = 'XYZ') =>
  new WeaponQuaternion().setFromEuler(new Euler(pitch, yaw, roll, order));
/**
 * 创建 PAC-9 视图模型与控制器。先构建几何、材质和动画关键帧，再返回弹药/动画接口。
 * context 需已有 scene、mats、player、input、combat 和两台相机；敌人可稍后创建，
 * 因为命中查询只在 updateWeapon() 真正开火时执行。
 * @param {object} context 共享游戏上下文。
 * @returns {Promise<object>} 武器接口；玩法数值和目标姿态集中在 tuning.js。
 */
async function createWeapon(context) {
  let root = new Group();
  root.name = 'viewmodel-pac9';
  let geometry = createRifleGeometry(),
    materialScales = {
      anodized_black: 2,
      gunmetal: 2,
      brass: 4,
      glove_fabric: 3,
      rubber: 4,
    },
    getMaterial = (materialName) =>
      context.mats.get(materialName, {
        triplanar: true,
        vertexColors: true,
        scale: materialScales[materialName] || 1,
      }),
    createWeaponMesh = (geometryData, material) => {
      let mesh = new Mesh(geometryData, material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return mesh;
    },
    anodizedMaterial = new MeshStandardMaterial({
      color: new Color(0.0085, 0.009, 0.0105),
      roughness: 0.4,
      metalness: 0.45,
      vertexColors: true,
    });
  anodizedMaterial.name = 'pac9_anodised';
  applyWeaponSurface(anodizedMaterial, 0);
  let matteMaterial = new MeshStandardMaterial({
    color: 16777215,
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
  });
  matteMaterial.name = 'pac9_matte';
  let phosphateMaterial = new MeshStandardMaterial({
    color: new Color(0.016, 0.016, 0.0165),
    roughness: 0.5,
    metalness: 0.7,
    vertexColors: true,
  });
  phosphateMaterial.name = 'pac9_phosphate';
  applyWeaponSurface(phosphateMaterial, 1);
  let polymerMaterial = new MeshStandardMaterial({
    color: new Color(0.0125, 0.0128, 0.0135),
    roughness: 0.62,
    metalness: 0,
    vertexColors: true,
  });
  polymerMaterial.name = 'pac9_polymer';
  applyWeaponSurface(polymerMaterial, 2);
  let tanPolymerMaterial = new MeshStandardMaterial({
    color: new Color(0.105, 0.08, 0.05),
    roughness: 0.62,
    metalness: 0,
    vertexColors: true,
  });
  tanPolymerMaterial.name = 'pac9_polymer_tan';
  applyWeaponSurface(tanPolymerMaterial, 2);
  root.add(
    createWeaponMesh(geometry.ano, anodizedMaterial),
    createWeaponMesh(geometry.gun, phosphateMaterial),
    createWeaponMesh(geometry.poly, polymerMaterial),
    createWeaponMesh(geometry.plain, matteMaterial),
  );
  let boltMesh = createWeaponMesh(geometry.bolt, phosphateMaterial);
  root.add(boltMesh);
  let magazineGroup = new Group(),
    magazineOrigin = new WeaponVector3().fromArray(RIFLE_INFO.magPos);
  magazineGroup.position.copy(magazineOrigin);
  let roundMesh = createWeaponMesh(geometry.round, getMaterial('brass'));
  magazineGroup.add(createWeaponMesh(geometry.mag, tanPolymerMaterial), roundMesh);
  root.add(magazineGroup);
  let decals = null,
    opticGlass = null,
    muzzleFlash = null;
  try {
    decals = createRifleDecals([
      ['model', -0.0168, -0.0315, 0.064, 0.0095, 'L'],
      ['maker', -0.0168, -0.042, 0.064, 0.003, 'L'],
      ['cal', -0.0168, -0.0465, 0.064, 0.0028, 'L'],
      ['prop', -0.0168, -0.071, 0.066, 0.0026, 'L'],
      ['auto', -0.0168, -0.027, -0.0335, 0.0036, 'L'],
      ['semi', -0.0168, -0.0262, -0.049, 0.0036, 'L'],
      ['safe', -0.0168, -0.0362, -0.062, 0.0036, 'L'],
      ['rack', -0.0168, -0.004, -0.205, 0.02, 'L'],
      ['warn', -0.0181, -0.01, 0.03, 0.0062, 'L'],
      ['optic', -0.0195, 0.0735, 0.021, 0.0024, 'L'],
      ['model', 0.0168, -0.0315, 0.068, 0.0095, 'R'],
      ['warn', 0.0168, -0.066, 0.066, 0.0075, 'R'],
      ['rack', 0.0168, -0.004, -0.205, 0.02, 'R'],
      ['auto', 0.0168, -0.027, -0.0335, 0.0036, 'R'],
      ['safe', 0.0168, -0.0362, -0.062, 0.0036, 'R'],
      ['optic', 0.0195, 0.0735, 0.021, 0.0024, 'R'],
      ['cal', 0.0181, 0.0245, -0.055, 0.0026, 'R'],
      ['r2', 0, 0.04365, -0.0816, 0.003, 'T'],
      ['r4', 0, 0.04365, -0.0616, 0.003, 'T'],
      ['r6', 0, 0.04365, 0.0584, 0.003, 'T'],
      ['r8', 0, 0.04365, 0.0784, 0.003, 'T'],
      ['r10', 0, 0.04365, 0.0984, 0.003, 'T'],
      ['r12', 0, 0.04365, 0.1184, 0.003, 'T'],
    ]);
    decals.castShadow = false;
    decals.receiveShadow = true;
    decals.frustumCulled = false;
    root.add(decals);
  } catch (Me) {
    console.warn('[weapon] markings skipped: ' + Me);
  }
  opticGlass = createOpticGlass(
    RIFLE_INFO.window.map((Me) => [
      Me[0] * 1.01,
      (Me[1] - RIFLE_INFO.sightY) * 1.01 + RIFLE_INFO.sightY,
    ]),
    RIFLE_INFO.lensF + 0.0025,
  );
  opticGlass.frustumCulled = false;
  root.add(opticGlass);
  muzzleFlash = createReticle();
  muzzleFlash.position.fromArray(RIFLE_INFO.muzzle);
  muzzleFlash.visible = false;
  root.add(muzzleFlash);
  let toHandDirection = (rotation, worldDirection, mirrored) => {
      let localDirection = new WeaponVector3(
        worldDirection[0],
        worldDirection[1],
        worldDirection[2],
      )
        .normalize()
        .applyQuaternion(rotation.clone().invert());
      if (mirrored) {
        localDirection.x *= -1;
      }
      return [localDirection.x, localDirection.y, localDirection.z];
    },
    rightHandRotation = eulerQuaternion(-0.24, 0, 0).multiply(eulerQuaternion(0, 0, -Math.PI / 2)),
    rightHandGeometry = createHands({
      mirror: false,
      fingers: [null, [0.62, 1.72, 0.8, 0], [0.68, 1.7, 0.8, -0.03], [0.74, 1.66, 0.8, -0.09]],
      indexPoses: [
        [0.1, 0.16, 0.1, 0.05],
        [0.46, 1.15, 0.5, 0],
      ],
      thumb: [
        toHandDirection(rightHandRotation, [-0.85, 0.05, -0.5]),
        toHandDirection(rightHandRotation, [-0.6, -0.05, -0.8]),
        toHandDirection(rightHandRotation, [-0.05, -0.2, -0.97]),
      ],
      forearm: toHandDirection(rightHandRotation, [0.27, -0.44, 0.86]),
      sleeve: 0.34,
    }),
    rightHand = new Group();
  rightHand.quaternion.copy(rightHandRotation);
  rightHand.position
    .fromArray(RIFLE_INFO.grip)
    .sub(new WeaponVector3(0.006, -0.031, -0.085).applyQuaternion(rightHandRotation));
  let gloveMaterial = getMaterial('glove_fabric');
  rightHand.add(createWeaponMesh(rightHandGeometry.fabric, gloveMaterial));
  let triggerFingerMesh = createWeaponMesh(rightHandGeometry.index[0].clone(), gloveMaterial);
  rightHand.add(triggerFingerMesh);
  root.add(rightHand);
  let relaxedFingerAttributes = rightHandGeometry.index[0].attributes,
    pressedFingerAttributes = rightHandGeometry.index[1].attributes,
    lastFingerWeight = -1;
  /* 插值食指顶点与法线，保持扣动扳机的手部形变。 */
  function updateTriggerFinger(weight) {
    if (Math.abs(weight - lastFingerWeight) < 0.004) return;
    lastFingerWeight = weight;
    let positionAttribute = triggerFingerMesh.geometry.attributes.position,
      normalAttribute = triggerFingerMesh.geometry.attributes.normal,
      relaxedPositions = relaxedFingerAttributes.position.array,
      pressedPositions = pressedFingerAttributes.position.array,
      relaxedNormals = relaxedFingerAttributes.normal.array,
      pressedNormals = pressedFingerAttributes.normal.array;
    for (let bt = 0; bt < relaxedPositions.length; bt++) {
      positionAttribute.array[bt] =
        relaxedPositions[bt] + (pressedPositions[bt] - relaxedPositions[bt]) * weight;
      normalAttribute.array[bt] =
        relaxedNormals[bt] + (pressedNormals[bt] - relaxedNormals[bt]) * weight;
    }
    positionAttribute.needsUpdate = true;
    normalAttribute.needsUpdate = true;
  }
  let leftHandRotation = eulerQuaternion(0, 0, Math.PI / 2).multiply(eulerQuaternion(0.06, 0, 0)),
    leftHandGeometry = createHands({
      mirror: true,
      fingers: [
        [1.27, 1.42, 0.75, 0.02],
        [1.3, 1.45, 0.75, 0],
        [1.3, 1.45, 0.75, -0.02],
        [1.33, 1.45, 0.75, -0.05],
      ],
      thumb: [
        toHandDirection(leftHandRotation, [0, 0.25, -0.97], true),
        toHandDirection(leftHandRotation, [0.05, 0.1, -0.99], true),
        toHandDirection(leftHandRotation, [0, 0, -1], true),
      ],
      forearm: toHandDirection(leftHandRotation, [-0.5, -0.35, 0.79], true),
      sleeve: 0.34,
    }),
    leftHand = new Group();
  leftHand.add(createWeaponMesh(leftHandGeometry.fabric, gloveMaterial));
  root.add(leftHand);
  let leftHandGripOffset = new WeaponVector3(0, -0.015, -0.055),
    createHandPose = (rotation, gripPosition, pivot = leftHandGripOffset) => ({
      q: rotation.clone(),
      p: new WeaponVector3(gripPosition[0], gripPosition[1], gripPosition[2]).sub(
        pivot.clone().applyQuaternion(rotation),
      ),
    }),
    offsetHandPose = (pose, offsetX, offsetY, offsetZ, rotation = null) => ({
      q: rotation ? rotation.clone() : pose.q.clone(),
      p: pose.p.clone().add(new WeaponVector3(offsetX, offsetY, offsetZ)),
    }),
    magazineGripRotation = eulerQuaternion(0, 0, Math.PI / 2).multiply(eulerQuaternion(0.12, 0, 0)),
    foregripPose = createHandPose(leftHandRotation, [-0.015, -0.062, -0.236]),
    magazineGripPose = createHandPose(magazineGripRotation, [-0.0135, -0.15, -0.0745]),
    approachMagazinePose = offsetHandPose(magazineGripPose, -0.035, -0.02, 0.01),
    removedMagazinePose = offsetHandPose(
      magazineGripPose,
      -0.06,
      -0.3,
      0.13,
      magazineGripRotation.clone().multiply(eulerQuaternion(-0.5, 0, 0.25)),
    ),
    insertMagazinePose = offsetHandPose(magazineGripPose, 0, -0.035, 0.004),
    tapMagazinePose = offsetHandPose(magazineGripPose, -0.004, -0.06, 0),
    seatedMagazinePose = offsetHandPose(magazineGripPose, 0, -0.012, 0),
    chargingHandleRotation = eulerQuaternion(-0.6, 0, 0).multiply(
      new WeaponQuaternion().setFromRotationMatrix(
        new Matrix4().makeBasis(
          new WeaponVector3(0, 0, 1),
          new WeaponVector3(-1, 0, 0),
          new WeaponVector3(0, -1, 0),
        ),
      ),
    ),
    chargingHandlePose = createHandPose(
      chargingHandleRotation,
      [RIFLE_INFO.handlePos[0] - 0.004, RIFLE_INFO.handlePos[1], RIFLE_INFO.handlePos[2]],
      new WeaponVector3(0, -0.024, -0.118),
    ),
    pulledHandlePose = offsetHandPose(chargingHandlePose, 0, 0, RIFLE_INFO.boltTravel),
    tacticalReloadKeyframes = [
      [0, foregripPose],
      [0.1, foregripPose],
      [0.36, approachMagazinePose],
      [0.44, magazineGripPose],
      [0.5, magazineGripPose],
      [0.8, removedMagazinePose],
      [0.98, removedMagazinePose],
      [1.28, insertMagazinePose],
      [1.35, magazineGripPose],
      [1.45, tapMagazinePose],
      [1.52, seatedMagazinePose],
      [1.62, magazineGripPose],
      [1.7, approachMagazinePose],
      [2.02, foregripPose],
      [9, foregripPose],
    ],
    emptyReloadKeyframes = [
      ...tacticalReloadKeyframes.slice(0, 12),
      [1.7, approachMagazinePose],
      [1.96, chargingHandlePose],
      [2.02, chargingHandlePose],
      [2.14, pulledHandlePose],
      [2.19, pulledHandlePose],
      [2.26, chargingHandlePose],
      [2.36, chargingHandlePose],
      [2.66, foregripPose],
      [9, foregripPose],
    ],
    magazineOutTime = 0.47,
    magazineInTime = 1.345,
    boltPullStart = 2.02,
    boltPullEnd = 2.14,
    boltReleaseTime = 2.19,
    sampledHandPosition = new WeaponVector3(),
    sampledHandRotation = new WeaponQuaternion(),
    magazineRotation = new WeaponQuaternion(),
    spareHandVector = new WeaponVector3(),
    sparePoseVector = new WeaponVector3(),
    spareMotionVector = new WeaponVector3();
  /* 按重装关键帧插值左手位置与旋转。 */
  function sampleHandPose(keyframes, time) {
    let segment = 0;
    for (; segment < keyframes.length - 2 && time > keyframes[segment + 1][0];) segment++;
    let start = keyframes[segment],
      end = keyframes[segment + 1],
      blend = smoothBlend((time - start[0]) / Math.max(1e-4, end[0] - start[0]));
    sampledHandPosition.copy(start[1].p).lerp(end[1].p, blend);
    sampledHandRotation.copy(start[1].q).slerp(end[1].q, blend);
  }
  leftHand.position.copy(foregripPose.p);
  leftHand.quaternion.copy(foregripPose.q);
  let inverseMagazineGripRotation = magazineGripRotation.clone().invert();
  root.traverse((Me) => {
    Me.layers.set(VIEWMODEL_LAYER);
  });
  context.camera.add(root);
  let triangleCount =
      Object.values(geometry).reduce((Me, we) => Me + countTriangles(we), 0) +
      countTriangles(rightHandGeometry.fabric) +
      countTriangles(rightHandGeometry.index[0]) +
      countTriangles(leftHandGeometry.fabric) +
      (decals ? countTriangles(decals.geometry) : 0) +
      2,
    meshCount = 0;
  root.traverse((Me) => {
    if (Me.isMesh) {
      meshCount++;
    }
  });
  console.log(
    `[weapon] ${RIFLE_INFO.name}: ${Math.round(triangleCount)} tris, ${meshCount} meshes (flash only while firing)`,
  );
  let random = context.rng && context.rng.fork ? context.rng.fork() : Math.random,
    animation = {
      t: 0,
      cooldown: 0,
      prevFire: false,
      dryDone: false,
      autoReload: -1,
      reload: null,
      burst: 0,
      lastShot: -9,
      bloom: 0,
      heat: 0,
      smoke: 0,
      smokeTick: 0,
      adsLin: 0,
      adsE: 0,
      sprintT: 0,
      reloadW: 0,
      rackW: 0,
      bobPhase: 0,
      bobAmt: 0,
      finger: 0,
      boltT: 9,
      boltLocked: false,
      flashT: 0,
      flashDur: 0.05,
      recPhase: 0,
      wasGround: true,
      lastVy: 0,
      spreadS: 0.0125,
      idleT: 0,
      inspect: -1,
      kZ: createSpring(520, 30),
      kP: createSpring(380, 26),
      kY: createSpring(300, 22),
      kR: createSpring(300, 20),
      swY: createSpring(110, 15),
      swP: createSpring(110, 15),
      jY: createSpring(140, 13),
      jP: createSpring(140, 13),
      bump: createSpring(600, 30),
    },
    debug = {
      freeze: false,
      reloadT: null,
      empty: false,
      flash: false,
      noFire: false,
    },
    weapon = {
      name: RIFLE_INFO.name,
      ammo: MAGAZINE_CAPACITY,
      magSize: MAGAZINE_CAPACITY,
      reserve: INITIAL_RESERVE_AMMO,
      state: 'idle',
      ads: 0,
      spread: 0.0125,
      damage: BULLET_DAMAGE,
      rpm: FIRE_RATE_RPM,
      root: root,
      debug: debug,
      info: {
        tris: Math.round(triangleCount),
        meshes: meshCount,
      },
      update: updateWeapon,
      reset: resetWeapon,
      setVisible(visible) {
        root.visible = !!visible;
      },
      muzzleWorld: muzzleWorld,
      reloadNow: startReload,
      addAmmo(amount) {
        weapon.reserve += amount;
      },
      setWetness(wetness) {
        WEAPON_WETNESS.value = Math.max(0, Math.min(1, +wetness || 0));
      },
      snap() {
        animation.adsLin = context.input.ads ? 1 : 0;
        for (let Me of ['kZ', 'kP', 'kY', 'kR', 'swY', 'swP', 'jY', 'jP', 'bump']) {
          animation[Me].x = 0;
          animation[Me].v = 0;
        }
        animation.sprintT = context.player.sprinting ? 1 : 0;
      },
    };
  /* 新任务或展示重置弹药、枪机、动画弹簧和手部姿势。 */
  function resetWeapon() {
    weapon.ammo = MAGAZINE_CAPACITY;
    weapon.reserve = INITIAL_RESERVE_AMMO;
    weapon.state = 'idle';
    weapon.ads = 0;
    Object.assign(animation, {
      cooldown: 0,
      prevFire: false,
      dryDone: false,
      autoReload: -1,
      reload: null,
      burst: 0,
      lastShot: -9,
      bloom: 0,
      heat: 0,
      smoke: 0,
      adsLin: 0,
      adsE: 0,
      sprintT: 0,
      reloadW: 0,
      boltT: 9,
      boltLocked: false,
      flashT: 0,
      idleT: 0,
      inspect: -1,
    });
    for (let Me of ['kZ', 'kP', 'kY', 'kR', 'swY', 'swP', 'jY', 'jP', 'bump']) {
      animation[Me].x = 0;
      animation[Me].v = 0;
    }
    roundMesh.visible = true;
    magazineGroup.visible = true;
    magazineGroup.position.copy(magazineOrigin);
    magazineGroup.quaternion.identity();
    leftHand.position.copy(foregripPose.p);
    leftHand.quaternion.copy(foregripPose.q);
  }
  let spareTransform = new Matrix4();
  /* 把武器相机坐标转换为世界坐标，修正世界与武器视野差异。 */
  function viewToWorld(localPosition, target) {
    root.updateMatrix();
    target.fromArray(localPosition).applyMatrix4(root.matrix);
    let camera = context.camera,
      fovScale =
        Math.tan((camera.fov * Math.PI) / 360) / Math.tan((context.viewCamera.fov * Math.PI) / 360);
    target.x *= fovScale;
    target.y *= fovScale;
    return target.applyQuaternion(camera.quaternion).add(camera.position);
  }
  /* 查询枪口世界位置，供曳光、闪光、烟雾和音效使用。 */
  function muzzleWorld(target = new WeaponVector3()) {
    return viewToWorld(RIFLE_INFO.muzzle, target);
  }
  /**
   * 弹匣未满且备弹充足时启动重装；空仓使用带拉栓步骤的长动画。
   * 本方法只创建换弹状态；弹药转移和后续音效由 updateWeapon() 按关键时刻推进。
   * @returns {boolean} 是否成功开始；重复换弹、满弹匣或无备弹时为 false。
   */
  function startReload() {
    if (animation.reload || weapon.ammo >= weapon.magSize || weapon.reserve <= 0) return false;
    let empty = weapon.ammo <= 0;
    animation.reload = {
      t: 0,
      T: empty ? EMPTY_RELOAD_SECONDS : TACTICAL_RELOAD_SECONDS,
      empty: empty,
      f: {},
    };
    animation.autoReload = -1;
    context.events.emit('weapon:reload', {
      phase: 'start',
      empty: empty,
    });
    return true;
  }
  let shotDirection = new WeaponVector3(),
    muzzlePosition = new WeaponVector3(),
    shotTarget = new WeaponVector3(),
    shellPosition = new WeaponVector3(),
    shellVelocity = new WeaponVector3(),
    shotOrigin = new WeaponVector3();
  /**
   * 发射一发：消耗弹药、射线伤害、曳光与抛壳、事件、后坐力和枪口闪光。
   * 调用者 updateWeapon() 已检查弹药、换弹状态及冷却时间；这里不再次判定。
   * 随机调用顺序影响散布和画面反馈，整理代码时不要调换调用顺序。
   */
  function fireShot() {
    let player = context.player,
      camera = context.camera;
    weapon.ammo--;
    animation.burst++;
    animation.lastShot = animation.t;
    animation.heat = Math.min(1.3, animation.heat + 0.05);
    let spread = weapon.spread,
      spreadAngle = random() * Math.PI * 2,
      spreadRadius = Math.tan(spread) * Math.sqrt(random());
    shotDirection
      .set(Math.cos(spreadAngle) * spreadRadius, Math.sin(spreadAngle) * spreadRadius, -1)
      .normalize()
      .applyQuaternion(camera.quaternion);
    shotOrigin.copy(player.eye || camera.position);
    let hit = null;
    try {
      hit = context.combat.playerShot(shotOrigin, shotDirection, {
        damage: BULLET_DAMAGE,
        range: BULLET_RANGE,
      });
    } catch {}
    hit && hit.point
      ? shotTarget.copy(hit.point)
      : shotTarget.copy(shotOrigin).addScaledVector(shotDirection, BULLET_RANGE);
    muzzleWorld(muzzlePosition);
    let effects = context.fx;
    if (effects) {
      if (effects.tracer) {
        effects.tracer(muzzlePosition, shotTarget);
      }
      if (effects.shell) {
        viewToWorld(RIFLE_INFO.eject, shellPosition);
        shellVelocity
          .set(2 + random() * 1.2, 1.2 + random() * 0.8, 0.5 - random() * 0.6)
          .applyQuaternion(camera.quaternion);
        if (player.vel) {
          shellVelocity.add(player.vel);
        }
        effects.shell(shellPosition, shellVelocity);
      }
    }
    if (context.render && context.render.lightPool) {
      context.render.lightPool.flash(muzzlePosition, 16756832, 45, 9, 0.05);
    }
    // 命中结果已同步取得；此事件通知枪声、敌人听觉等旁路反馈。
    // 载荷中的向量会在后续射击复用，需要延迟使用的订阅者应自行复制。
    context.events.emit('weapon:fire', {
      origin: shotOrigin,
      dir: shotDirection,
      muzzle: muzzlePosition,
      ads: animation.adsE,
    });
    let recoilScale = lerp(1, 0.55, animation.adsE) * (player.crouching ? 0.85 : 1),
      burstIndex = animation.burst,
      pitchScale = burstIndex <= 9 ? 1 : 0.38,
      yawRecoil =
        (burstIndex < 4
          ? (random() - 0.5) * 0.0022
          : Math.sin(burstIndex * 0.57 + animation.recPhase) * 0.0042 + (random() - 0.5) * 0.002) *
        recoilScale;
    if (player.addRecoil) {
      player.addRecoil(0.0068 * pitchScale * recoilScale * (0.85 + random() * 0.3), yawRecoil);
    }
    if (player.addShake) {
      player.addShake(0.12 * recoilScale);
    }
    animation.kZ.v += 1.5 * lerp(1, 0.6, animation.adsE);
    animation.kP.v += 1.5 * recoilScale;
    animation.kY.v += (random() - 0.5) * 1 * recoilScale;
    animation.kR.v += (random() - 0.5) * 1.8 * recoilScale;
    animation.bloom = Math.min(1, animation.bloom + 0.17);
    animation.flashT = animation.flashDur = 0.036 + random() * 0.02;
    let flashUniforms = muzzleFlash.material.uniforms;
    flashUniforms.uSeed.value = random() * 100;
    flashUniforms.uJet.value = 0.6 + random() * 0.6;
    muzzleFlash.rotation.z = (random() - 0.5) * 0.4;
    let flashScale = (0.8 + random() * 0.5) * lerp(1, 0.62, animation.adsE);
    muzzleFlash.scale.set(flashScale, flashScale, flashScale * (0.8 + random() * 0.5));
    animation.boltT = 0;
    if (weapon.ammo <= 0) {
      animation.boltLocked = true;
      roundMesh.visible = false;
    }
  }
  /**
   * 每帧按原顺序推进换弹事件、自动射击、散布、瞄准、枪机、烟雾与持枪姿态。
   * 主循环先更新玩家再调用本方法，因此持枪动画使用本帧玩家位置和镜头状态。
   * @param {number} dt 本帧时间步长（秒）。
   */
  function updateWeapon(dt) {
    let player = context.player,
      input = context.input;
    if (!player || !input || !player.alive) {
      animation.prevFire = false;
      if (muzzleFlash) {
        muzzleFlash.visible = false;
      }
      return;
    }
    animation.t += dt;
    let fireHeld = !!input.fire && root.visible && !debug.noFire,
      firePressed = fireHeld && !animation.prevFire;
    animation.prevFire = fireHeld;
    if (!fireHeld) {
      animation.dryDone = false;
    }
    let wantsSprint = !!player.sprinting && !fireHeld && !input.ads && !animation.reload;
    animation.sprintT = damp(animation.sprintT, wantsSprint ? 1 : 0, 9, dt);
    if (input.pressed && input.pressed('reload')) {
      startReload();
    }
    if (animation.autoReload >= 0) {
      animation.autoReload -= dt;
      if (animation.autoReload < 0) {
        startReload();
      }
    }
    let rackAmount = 0;
    if (
      (debug.reloadT != null &&
        !animation.reload &&
        (animation.reload = {
          t: 0,
          T: debug.empty ? EMPTY_RELOAD_SECONDS : TACTICAL_RELOAD_SECONDS,
          empty: debug.empty,
          f: {},
        }),
      animation.reload)
    ) {
      let reload = animation.reload;
      debug.reloadT != null ? (reload.t = debug.reloadT) : (reload.t += dt);
      let reloadTime = reload.t,
        emitReloadPhase = (Tt, Ai) =>
          reloadTime >= Ai && !reload.f[Tt]
            ? ((reload.f[Tt] = 1),
              context.events.emit('weapon:reload', {
                phase: Tt,
                empty: reload.empty,
              }),
              true)
            : false;
      if (
        (emitReloadPhase('magout', magazineOutTime) && (animation.bump.v -= 0.25),
        reloadTime > 0.86 && !reload.f.fresh && ((reload.f.fresh = 1), (roundMesh.visible = true)),
        emitReloadPhase('magin', magazineInTime))
      ) {
        animation.bump.v += 0.55;
        let roundsToLoad = Math.min(weapon.magSize - weapon.ammo, weapon.reserve);
        weapon.ammo += roundsToLoad;
        weapon.reserve -= roundsToLoad;
        if (!reload.empty) {
          animation.boltLocked = false;
        }
      }
      if (reloadTime >= 1.5 && !reload.f.tap) {
        reload.f.tap = 1;
        animation.bump.v += 0.4;
      }
      if (reload.empty) {
        if (reloadTime >= boltPullStart) {
          rackAmount =
            reloadTime < boltPullEnd
              ? smoothBlend((reloadTime - boltPullStart) / (boltPullEnd - boltPullStart))
              : reloadTime < boltReleaseTime
                ? 1
                : Math.max(0, 1 - (reloadTime - boltReleaseTime) / 0.035);
        }
        if (emitReloadPhase('bolt', boltReleaseTime)) {
          animation.boltLocked = false;
          animation.bump.v += 0.3;
          animation.kZ.v -= 0.5;
        }
      }
      sampleHandPose(reload.empty ? emptyReloadKeyframes : tacticalReloadKeyframes, reloadTime);
      leftHand.position.copy(sampledHandPosition);
      leftHand.quaternion.copy(sampledHandRotation);
      reloadTime >= magazineOutTime && reloadTime < magazineInTime
        ? (magazineRotation.copy(sampledHandRotation).multiply(inverseMagazineGripRotation),
          magazineGroup.quaternion.copy(magazineRotation),
          magazineGroup.position
            .copy(magazineOrigin)
            .sub(magazineGripPose.p)
            .applyQuaternion(magazineRotation)
            .add(sampledHandPosition))
        : (magazineGroup.quaternion.identity(), magazineGroup.position.copy(magazineOrigin));
      let raiseWeight = smoothBlend(reloadTime / 0.3),
        lowerWeight = 1 - smoothBlend((reloadTime - (reload.T - 0.46)) / 0.4);
      animation.reloadW = Math.min(raiseWeight, lowerWeight);
      animation.rackW = reload.empty ? smoothBlend((reloadTime - 1.62) / 0.3) * lowerWeight : 0;
      if (reloadTime >= reload.T && debug.reloadT == null) {
        animation.reload = null;
        animation.reloadW = 0;
        animation.rackW = 0;
        context.events.emit('weapon:reload', {
          phase: 'done',
        });
        leftHand.position.copy(foregripPose.p);
        leftHand.quaternion.copy(foregripPose.q);
      }
    }
    animation.cooldown -= dt;
    let canFire = !animation.reload && animation.sprintT < 0.45;
    if (fireHeld && canFire)
      if (weapon.ammo > 0) {
        let Je = 0;
        for (; animation.cooldown <= 0 && weapon.ammo > 0 && Je < 3;) {
          fireShot();
          animation.cooldown += 60 / FIRE_RATE_RPM;
          Je++;
        }
      } else {
        if (!animation.dryDone) {
          animation.dryDone = true;
          context.events.emit('weapon:dry', {});
          animation.bump.v -= 0.08;
          if (weapon.reserve > 0) {
            animation.autoReload = 0.32;
          }
        }
      }
    if (animation.cooldown < 0) {
      animation.cooldown = Math.max(animation.cooldown, -0.001);
    }
    if (animation.t - animation.lastShot > 0.24) {
      if (animation.burst > 0) {
        animation.recPhase = random() * 6.28;
      }
      animation.burst = 0;
    }
    animation.bloom = Math.max(0, animation.bloom - dt * 1.5);
    if (
      animation.t - animation.lastShot > 0.11 &&
      animation.t - animation.lastShot < 0.11 + dt * 1.5 &&
      animation.heat > 0.4
    ) {
      animation.smoke = Math.min(1.6, animation.heat * 1.3);
    }
    if (animation.smoke > 0) {
      animation.smoke -= dt;
      animation.smokeTick -= dt;
      if (animation.smokeTick <= 0 && context.fx && context.fx.smoke) {
        animation.smokeTick = 0.085;
        muzzleWorld(muzzlePosition);
        context.fx.smoke(muzzlePosition, {
          size: 0.1 + animation.smoke * 0.06,
          life: 1.3,
          rise: 0.5,
          count: 1,
          alpha: 0.22,
        });
      }
    }
    animation.heat = Math.max(0, animation.heat - dt * 0.2);
    let wantsAim = !!input.ads && !animation.reload && animation.sprintT < 0.35;
    animation.adsLin = clamp(animation.adsLin + (wantsAim ? dt : -dt) / 0.18, 0, 1);
    animation.adsE = smoothBlend(animation.adsLin);
    weapon.ads = animation.adsE;
    let speed = player.speed || 0,
      moveSpreadWeight = saturate(speed / 6),
      targetSpread =
        lerp(0.0125, 0.0012, animation.adsE) +
        moveSpreadWeight * lerp(0.013, 0.004, animation.adsE) +
        animation.bloom * lerp(0.0065, 0.0022, animation.adsE) +
        (player.onGround === false ? 0.022 : 0) -
        (player.crouching ? 0.002 * (1 - animation.adsE) : 0);
    animation.spreadS = damp(animation.spreadS, targetSpread, 18, dt);
    weapon.spread = animation.spreadS;
    fireHeld ||
    !!input.ads ||
    !!animation.reload ||
    speed > 0.2 ||
    (input.look && Math.abs(input.look.dx) + Math.abs(input.look.dy) > 0.002) ||
    animation.sprintT > 0.1
      ? ((animation.idleT = 0),
        animation.inspect >= 0 && (animation.inspect = Math.max(animation.inspect, 2.9)))
      : (animation.idleT += dt);
    if (animation.inspect < 0 && animation.idleT > 24) {
      animation.inspect = 0;
    }
    let inspectLeft = 0,
      inspectRight = 0,
      inspectWeight = 0;
    if (animation.inspect >= 0) {
      let Je = (animation.inspect += dt);
      inspectLeft = smoothBlend(Je / 0.5) * (1 - smoothBlend((Je - 1.4) / 0.5));
      inspectRight = smoothBlend((Je - 1.5) / 0.5) * (1 - smoothBlend((Je - 2.8) / 0.5));
      inspectWeight = smoothBlend(Je / 0.5) * (1 - smoothBlend((Je - 2.9) / 0.5));
      if (Je > 3.5) {
        animation.inspect = -1;
        animation.idleT = 0;
      }
    }
    weapon.state = animation.reload
      ? 'reloading'
      : animation.inspect >= 0
        ? 'inspect'
        : animation.sprintT > 0.5
          ? 'sprinting'
          : animation.t - animation.lastShot < 0.14
            ? 'firing'
            : 'idle';
    animation.boltT += dt;
    let boltCycleSeconds = 0.072,
      boltAmount =
        animation.boltT < boltCycleSeconds
          ? Math.sin((Math.PI * animation.boltT) / boltCycleSeconds)
          : 0;
    if (animation.boltLocked && animation.boltT > boltCycleSeconds * 0.5) {
      boltAmount = Math.max(boltAmount, 0.86);
    }
    boltMesh.position.z = RIFLE_INFO.boltTravel * Math.max(boltAmount * 0.95, rackAmount);
    animation.finger = damp(animation.finger, (fireHeld && canFire) || debug.flash ? 1 : 0, 30, dt);
    updateTriggerFinger(animation.finger);
    let flashUniforms = muzzleFlash.material.uniforms;
    if (
      (debug.flash &&
        ((animation.flashT = animation.flashDur = 0.05), (flashUniforms.uSeed.value = 3.7)),
      (animation.flashT -= dt),
      (flashUniforms.uInt.value =
        animation.flashT > 0
          ? 9.5 * Math.sqrt(Math.max(0, animation.flashT / animation.flashDur))
          : 0),
      (flashUniforms.uHeat.value = saturate((animation.heat - 0.45) / 0.8) * 2.2),
      (muzzleFlash.visible = flashUniforms.uInt.value > 0 || flashUniforms.uHeat.value > 0.02),
      debug.freeze)
    )
      return;
    let onGround = player.onGround !== false,
      verticalSpeed = player.vel ? player.vel.y : 0;
    animation.bobAmt = damp(animation.bobAmt, onGround ? saturate(speed / 3.6) : 0, 8, dt);
    animation.bobPhase += dt * (speed > 0.3 && onGround ? 5.2 + speed * 1.55 : 0);
    let bobPhase = animation.bobPhase,
      bobWeight = animation.bobAmt * lerp(1, 0.12, animation.adsE) * (1 + animation.sprintT * 1.4),
      bobX = Math.sin(bobPhase) * 0.006 * bobWeight,
      bobY =
        (Math.sin(2 * bobPhase) * 0.0042 -
          Math.pow(0.5 + 0.5 * Math.cos(2 * bobPhase + 0.6), 4) * 0.0048) *
        bobWeight,
      breathScale = lerp(1, 0.3, animation.adsE),
      time = animation.t,
      swayScale = lerp(1, 0.4, animation.adsE);
    if (
      ((animation.swY.v += clamp(input.look ? input.look.dx : 0, -0.2, 0.2) * 3.2 * swayScale),
      (animation.swP.v += clamp(input.look ? input.look.dy : 0, -0.2, 0.2) * 2.6 * swayScale),
      updateSpring(animation.swY, 0, dt),
      updateSpring(animation.swP, 0, dt),
      (animation.swY.x = clamp(animation.swY.x, -0.09, 0.09)),
      (animation.swP.x = clamp(animation.swP.x, -0.07, 0.07)),
      animation.wasGround &&
        !onGround &&
        verticalSpeed > 1 &&
        ((animation.jY.v -= 0.22), (animation.jP.v += 0.7)),
      !animation.wasGround && onGround)
    ) {
      let Je = clamp(-animation.lastVy * 0.06, 0, 0.6);
      animation.jY.v -= Je;
      animation.jP.v -= Je * 3.2;
      animation.kR.v += (random() - 0.5) * Je * 2;
    }
    animation.wasGround = onGround;
    if (!onGround) {
      animation.lastVy = verticalSpeed;
    }
    updateSpring(animation.jY, onGround ? 0 : clamp(-verticalSpeed * 0.0045, -0.02, 0.024), dt);
    updateSpring(animation.jP, onGround ? 0 : clamp(verticalSpeed * 0.012, -0.06, 0.06), dt);
    updateSpring(animation.kZ, 0, dt);
    updateSpring(animation.kP, 0, dt);
    updateSpring(animation.kY, 0, dt);
    updateSpring(animation.kR, 0, dt);
    updateSpring(animation.bump, 0, dt);
    let strafe = input.move ? input.move.x : 0,
      forward = input.move ? input.move.y : 0,
      hipWeight = 1 - animation.adsE,
      aimWeight = animation.adsE,
      sprintWeight = animation.sprintT,
      reloadWeight = animation.reloadW,
      rackWeight = animation.rackW,
      positionX =
        lerp(HIP_POSE.p[0], AIM_POSE.p[0], aimWeight) +
        SPRINT_POSE.p[0] * sprintWeight +
        RELOAD_POSE.p[0] * reloadWeight +
        bobX +
        Math.sin(time * 0.85 + 1) * 0.0012 * breathScale -
        animation.swY.x * 0.06 -
        strafe * 0.004 * hipWeight -
        0.035 * inspectWeight,
      positionY =
        lerp(HIP_POSE.p[1], AIM_POSE.p[1], aimWeight) +
        SPRINT_POSE.p[1] * sprintWeight +
        RELOAD_POSE.p[1] * reloadWeight +
        bobY +
        Math.sin(time * 1.7) * 0.0016 * breathScale +
        animation.swP.x * 0.05 +
        animation.jY.x +
        animation.bump.x * 0.6 +
        0.045 * inspectWeight,
      positionZ =
        lerp(HIP_POSE.p[2], AIM_POSE.p[2], aimWeight) +
        SPRINT_POSE.p[2] * sprintWeight +
        RELOAD_POSE.p[2] * reloadWeight +
        animation.kZ.x * 0.55 +
        forward * 0.004 * hipWeight * (1 - sprintWeight),
      pitch =
        HIP_POSE.r[0] * hipWeight +
        SPRINT_POSE.r[0] * sprintWeight +
        RELOAD_POSE.r[0] * reloadWeight -
        0.16 * rackWeight +
        Math.sin(time * 1.7 + 0.8) * 0.0035 * breathScale +
        Math.sin(2 * bobPhase + 0.5) * 0.008 * bobWeight +
        animation.swP.x +
        animation.jP.x +
        animation.kP.x +
        animation.bump.x * 1.5 +
        0.3 * inspectWeight,
      yaw =
        HIP_POSE.r[1] * hipWeight +
        SPRINT_POSE.r[1] * sprintWeight +
        RELOAD_POSE.r[1] * reloadWeight +
        Math.sin(time * 0.6) * 0.002 * breathScale +
        Math.sin(bobPhase) * 0.01 * bobWeight +
        animation.swY.x +
        animation.kY.x +
        0.18 * inspectWeight +
        0.25 * inspectRight,
      roll =
        HIP_POSE.r[2] * hipWeight +
        SPRINT_POSE.r[2] * sprintWeight +
        RELOAD_POSE.r[2] * reloadWeight +
        0.62 * rackWeight +
        Math.sin(bobPhase) * 0.014 * bobWeight +
        animation.swY.x * 0.7 -
        strafe * 0.035 * hipWeight +
        animation.kR.x -
        0.75 * inspectLeft +
        0.55 * inspectRight +
        Math.sin(time * 0.5) * 0.004 * breathScale;
    root.position.set(positionX, positionY, positionZ);
    root.rotation.set(pitch, yaw, roll, 'YXZ');
  }
  resetWeapon();
  return weapon;
}
/* 保留原版武器展示与截图接口；PC 由运行时 showcase 注册表调用。 */
async function PC(context) {
  let weapon = await createWeapon(context);
  context.weapon = weapon;
  let root = weapon.root,
    viewPosition = new WeaponVector3(0, 1.68, 4),
    lookDirections = {
      south: [0.28, -0.01, 1],
      east: [1, 0, 0.25],
      north: [-0.2, -0.01, -1],
      west: [-1, 0, 0.1],
      nw: [-0.75, -0.01, -0.65],
    },
    showcaseViews = {
      side: [Math.PI, [1.12, 1.3, 0.11], [0, 1.235, 0.11], 30],
      right: [0, [1.12, 1.3, -0.11], [0, 1.235, -0.11], 30],
      top: [Math.PI * 0.86, [0.62, 1.8, -0.42], [0, 1.24, 0.12], 32],
      hands: [Math.PI, [0.4, 1.4, 0.02], [0.02, 1.215, 0.25], 30],
      rhand: [0, [0.36, 1.22, 0.27], [0.03, 1.16, 0.09], 30],
      muzzle: [Math.PI, [0.26, 1.37, 0.98], [0, 1.262, 0.44], 30],
      optic: [Math.PI, [0.2, 1.4, -0.26], [0, 1.31, 0.02], 30],
      lower: [Math.PI, [0.34, 1.26, 0.04], [0, 1.2, 0.03], 30],
    },
    previousSetShot = window.__setShot,
    activePose = null;
  function setPose(pose, options = {}) {
    activePose = pose;
    let view = showcaseViews[pose],
      input = context.input,
      player = context.player;
    input.ads = false;
    input.fire = false;
    player.sprinting = false;
    player.speed = 0;
    weapon.debug.reloadT = null;
    weapon.debug.flash = false;
    weapon.debug.empty = false;
    weapon.debug.freeze = !!view;
    weapon.reset();
    let cameraPosition, target, fov;
    if (view) {
      context.scene.add(root);
      root.position.set(0, 1.25, 0);
      root.rotation.set(0, view[0], 0, 'YXZ');
      root.traverse((y) => y.layers.set(WORLD_LAYER));
      cameraPosition = view[1];
      target = view[2];
      fov = view[3];
      if (options.wt != null) {
        weapon.debug.reloadT = +options.wt;
        weapon.debug.empty = !!options.wempty;
      }
    } else {
      context.camera.add(root);
      root.traverse((b) => b.layers.set(VIEWMODEL_LAYER));
      let y = lookDirections[options.wlook] || lookDirections.south;
      cameraPosition = [viewPosition.x, viewPosition.y, viewPosition.z];
      target = [viewPosition.x + y[0] * 50, viewPosition.y + y[1] * 50, viewPosition.z + y[2] * 50];
      fov = 74;
      if (pose === 'ads') {
        input.ads = true;
        fov = 52;
      }
      if (pose === 'sprint') {
        player.sprinting = true;
        player.speed = 6;
      }
      if (pose === 'fire') {
        weapon.debug.flash = true;
        if (options.wads) {
          input.ads = true;
          fov = 52;
        }
      }
      if (pose === 'reload' || pose === 'empty') {
        weapon.debug.reloadT = options.wt != null ? +options.wt : 0.62;
        weapon.debug.empty = pose === 'empty';
      }
      if (pose === 'empty') {
        weapon.ammo = 0;
      }
    }
    weapon.snap();
    weapon.update(0.016);
    weapon.snap();
    if (previousSetShot) {
      previousSetShot({
        cam: options.cam || [...cameraPosition, ...target].join(','),
        fov: options.fov || fov,
        exposure: options.exposure,
      });
    }
    return {
      cam: cameraPosition,
      target: target,
    };
  }
  window.__setShot = (u) => {
    u && u.wpose ? setPose(u.wpose, u) : previousSetShot && previousSetShot(u);
  };
  let initialView = setPose(context.params.wpose || 'hip', context.params);
  return {
    cam: initialView.cam,
    target: initialView.target,
    update(u) {
      weapon.update(u);
      if (activePose === 'fire') {
        weapon.debug.flash = true;
      }
    },
  };
}
export { PC, createWeapon };
