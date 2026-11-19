/**
 * Saltline / player/player
 * 从原版游戏按职责提取；保留原始算法、参数、着色器与执行顺序。
 */
import { Euler, Vector3 } from 'three';
import { PLAYER_CONFIG, WORLD_BOUNDS } from '../config.ts';
import { clamp, damp, lerp, saturate, smoothstep } from '../core/math.ts';
import { PLAYER_TUNING, JUMP_SPEED } from './tuning.ts';

/**
 * 创建玩家状态及其逐帧控制器；输入、物理、镜头和关卡需已由运行入口创建。
 * enabled 控制主动操作，alive 控制生死；死亡时仍会更新倒地碰撞和镜头。
 * 调整数值从 tuning.js 入手，修改规则再阅读 updatePlayer()/updateCamera()。
 * @param {object} context 共享游戏上下文；update() 时还会读取武器的瞄准状态。
 * @returns {object} 可供任务状态机重置、战斗系统伤害、HUD 读取的玩家接口。
 */
function createPlayer(context) {
  let camera = context.camera,
    getPostEffects = () => (context.render && context.render.post) || fallbackPostEffects,
    fallbackPostEffects = {},
    eyeHeight = PLAYER_CONFIG.eye,
    capsuleHeight = PLAYER_TUNING.standHeight,
    coyoteTime = 0,
    jumpBufferTime = 0,
    wasOnGround = true,
    airTime = 0,
    maxFallSpeed = 0,
    stridePhase = 0,
    bobWeight = 0,
    bobX = 0,
    bobY = 0,
    strafeRoll = 0,
    landingSpring = {
      x: 0,
      v: 0,
    },
    recoilPitch = 0,
    recoilYaw = 0,
    appliedRecoilPitch = 0,
    appliedRecoilYaw = 0,
    recoilHoldTime = 0,
    shakeAmount = 0,
    shakeTime = 0,
    timeSinceDamage = 99,
    damagePulse = 0,
    lowHealthEffect = 0,
    deathTime = 0,
    currentFov = PLAYER_CONFIG.fov,
    fallbackAds = 0,
    groundSurface = 'concrete',
    targetVelocity = new Vector3(),
    lookEuler = new Euler(0, 0, 0, 'YXZ'),
    lastSafePosition = new Vector3(),
    player = {
      pos: new Vector3(),
      eye: new Vector3(),
      vel: new Vector3(),
      forward: new Vector3(0, 0, -1),
      yaw: 0,
      pitch: 0,
      health: 100,
      maxHealth: 100,
      alive: true,
      onGround: true,
      sprinting: false,
      crouching: false,
      ads: 0,
      speed: 0,
      enabled: true,
      invulnerable: false,
      baseFov: PLAYER_CONFIG.fov,
      hurtPulse: 0,
      lookScale: 1,
      lastSafe: lastSafePosition,
      tuning: PLAYER_TUNING,
      // 新任务复用同一对象：清除运动/受伤/镜头暂态，并立即把相机同步到出生点。
      reset(spawn) {
        let spawnPoint = spawn ||
          (context.level && context.level.playerStart) || {
            pos: new Vector3(),
            yaw: 0,
          };
        player.pos.copy(spawnPoint.pos);
        player.yaw = spawnPoint.yaw || 0;
        player.pitch = 0;
        player.vel.set(0, 0, 0);
        player.health = player.maxHealth;
        player.alive = true;
        player.onGround = true;
        player.sprinting = false;
        player.crouching = false;
        player.invulnerable = false;
        player.speed = 0;
        eyeHeight = PLAYER_CONFIG.eye;
        capsuleHeight = PLAYER_TUNING.standHeight;
        coyoteTime = 0;
        jumpBufferTime = 0;
        wasOnGround = true;
        airTime = 0;
        maxFallSpeed = 0;
        stridePhase = 0;
        bobWeight = 0;
        bobX = bobY = 0;
        strafeRoll = 0;
        landingSpring.x = landingSpring.v = 0;
        recoilPitch = recoilYaw = appliedRecoilPitch = appliedRecoilYaw = 0;
        recoilHoldTime = 0;
        shakeAmount = 0;
        timeSinceDamage = 99;
        damagePulse = 0;
        lowHealthEffect = 0;
        deathTime = 0;
        player.hurtPulse = 0;
        lastSafePosition.copy(player.pos);
        let postEffects = getPostEffects();
        postEffects.damage = 0;
        postEffects.lowHealth = 0;
        postEffects.ads = 0;
        updateCamera(0);
      },
      // fromPosition 用于 HUD 的受击方向；死亡事件在生命值归零后同步发出。
      damage(amount, fromPosition) {
        if (!(!player.alive || player.invulnerable || !(amount > 0))) {
          player.health = Math.max(0, player.health - amount);
          timeSinceDamage = 0;
          damagePulse = Math.min(1, damagePulse + 0.35 + amount / 40);
          player.addShake(0.22 + amount / 70);
          context.events.emit('player:hit', {
            amount: amount,
            fromPos: fromPosition,
          });
          if (player.health <= 0) {
            player.alive = false;
            deathTime = 0;
            player.sprinting = false;
            context.events.emit('player:dead', {});
          }
        }
      },
      heal(amount) {
        if (player.alive) {
          player.health = Math.min(player.maxHealth, player.health + amount);
        }
      },
      // 一部分后坐力改变玩家真实朝向，其余作为镜头暂态回弹；参数单位为弧度。
      addRecoil(pitch = 0, yaw = 0) {
        let retainedFraction = PLAYER_TUNING.recoilKeep;
        player.pitch = clamp(
          player.pitch + pitch * retainedFraction,
          -PLAYER_TUNING.pitchLimit,
          PLAYER_TUNING.pitchLimit,
        );
        player.yaw += yaw * retainedFraction;
        recoilPitch += pitch * (1 - retainedFraction);
        recoilYaw += yaw * (1 - retainedFraction);
        recoilPitch = clamp(recoilPitch, -0.3, 0.3);
        recoilYaw = clamp(recoilYaw, -0.2, 0.2);
        recoilHoldTime = PLAYER_TUNING.recoilHold;
      },
      addShake(amount = 0.3) {
        shakeAmount = Math.min(1, shakeAmount + amount);
      },
      setFov(degrees) {
        player.baseFov = clamp(+degrees || PLAYER_CONFIG.fov, 55, 100);
      },
      update: updatePlayer,
    };
  context.events.on('explosion', (F) => {
    if (!F || !F.pos) return;
    let X = player.eye.distanceTo(F.pos),
      ne = F.size || 1,
      re = saturate(1 - X / (14 + ne * 10)) * (0.35 + 0.35 * ne);
    if (re > 0.01) {
      player.addShake(re);
    }
  });
  /* 检查头顶空间，避免在低矮障碍物内起身。 */
  function canStand() {
    let collisionBoxes = context.physics && context.physics.boxes;
    if (!collisionBoxes) return true;
    let radius = PLAYER_CONFIG.radius * 0.9,
      headBottom = player.pos.y + PLAYER_TUNING.crouchHeight - 0.05,
      standingTop = player.pos.y + PLAYER_TUNING.standHeight;
    for (let $ = 0; $ < collisionBoxes.length; $++) {
      let ue = collisionBoxes[$];
      if (
        !ue.bulletOnly &&
        !(
          player.pos.x + radius < ue.min.x ||
          player.pos.x - radius > ue.max.x ||
          player.pos.z + radius < ue.min.z ||
          player.pos.z - radius > ue.max.z
        ) &&
        ue.min.y < standingTop &&
        ue.max.y > headBottom
      )
        return false;
    }
    return true;
  }
  /* 脚步材质优先采用水坑，再采用物理碰撞与关卡地表信息。 */
  function getFootstepSurface() {
    let worldX = player.pos.x,
      worldZ = player.pos.z;
    try {
      if (
        context.ground &&
        context.ground.isPuddle &&
        player.pos.y < 0.05 &&
        context.ground.isPuddle(worldX, worldZ)
      )
        return 'water';
    } catch {}
    if (groundSurface && groundSurface !== 'concrete') return groundSurface;
    try {
      return (
        (context.level &&
          context.level.groundSurfaceAt &&
          context.level.groundSurfaceAt(worldX, worldZ)) ||
        groundSurface ||
        'concrete'
      );
    } catch {
      return groundSurface || 'concrete';
    }
  }
  /* 每帧按原顺序更新瞄准、移动、跳跃、碰撞、落地、脚步、恢复与镜头。 */
  /**
   * 输入已在本帧更新；dt 为秒。先应用玩家意图，再做碰撞，最后更新镜头/HUD 所需状态。
   * input.look 已是本帧累计的转角，直接使用，不能再乘 dt。
   * @param {number} dt 由主循环提供的游戏时间步长。
   */
  function updatePlayer(dt) {
    let input = context.input,
      weapon = context.weapon || {};
    if (
      (weapon.stub || typeof weapon.ads != 'number'
        ? ((fallbackAds = damp(fallbackAds, player.enabled && input.ads ? 1 : 0, 14, dt)),
          (player.ads = fallbackAds))
        : (player.ads = saturate(weapon.ads)),
      !player.alive)
    ) {
      deathTime += dt;
      updateDeadBody(dt);
      updateCamera(dt);
      updatePostEffects(dt);
      return;
    }
    let enabled = player.enabled;
    player.lookScale = lerp(1, PLAYER_TUNING.adsLook, player.ads);
    if (enabled) {
      player.yaw -= input.look.dx * player.lookScale;
      player.pitch = clamp(
        player.pitch - input.look.dy * player.lookScale,
        -PLAYER_TUNING.pitchLimit,
        PLAYER_TUNING.pitchLimit,
      );
      if (player.yaw > Math.PI * 4 || player.yaw < -Math.PI * 4) {
        player.yaw = player.yaw % (Math.PI * 2);
      }
    }
    enabled && input.crouch
      ? (player.crouching = true)
      : player.crouching && canStand() && (player.crouching = false);
    capsuleHeight = player.crouching ? PLAYER_TUNING.crouchHeight : PLAYER_TUNING.standHeight;
    let moveX = enabled ? input.move.x : 0,
      moveY = enabled ? input.move.y : 0,
      isMoving = moveX * moveX + moveY * moveY > 0.01,
      wantsSprint =
        enabled &&
        input.sprint &&
        moveY > 0.55 &&
        Math.abs(moveX) < 0.6 &&
        !player.crouching &&
        player.ads < 0.35 &&
        !input.fire;
    player.sprinting =
      (wantsSprint && player.onGround && player.speed > PLAYER_TUNING.walk * 0.6) ||
      (wantsSprint && !player.onGround && player.sprinting);
    let moveSpeed = PLAYER_TUNING.walk;
    player.crouching
      ? (moveSpeed = PLAYER_TUNING.crouch)
      : wantsSprint && (moveSpeed = PLAYER_TUNING.sprint);
    moveSpeed = lerp(moveSpeed, Math.min(moveSpeed, PLAYER_TUNING.ads), player.ads);
    if (moveY < 0) {
      moveSpeed *= lerp(1, 0.82, -moveY);
    }
    let sinYaw = Math.sin(player.yaw),
      cosYaw = Math.cos(player.yaw);
    targetVelocity
      .set(moveX * cosYaw - moveY * sinYaw, 0, -moveX * sinYaw - moveY * cosYaw)
      .multiplyScalar(moveSpeed);
    let acceleration = player.onGround
        ? isMoving
          ? PLAYER_TUNING.accelGround
          : PLAYER_TUNING.decelGround
        : isMoving
          ? PLAYER_TUNING.accelAir
          : 0.6,
      velocityDeltaX = targetVelocity.x - player.vel.x,
      velocityDeltaZ = targetVelocity.z - player.vel.z;
    if (!player.onGround && !isMoving) {
      velocityDeltaX = -player.vel.x;
      velocityDeltaZ = -player.vel.z;
    }
    let velocityDeltaLength = Math.hypot(velocityDeltaX, velocityDeltaZ),
      maxVelocityChange = acceleration * dt;
    velocityDeltaLength <= maxVelocityChange || velocityDeltaLength < 1e-6
      ? (player.onGround || isMoving) &&
        ((player.vel.x = targetVelocity.x), (player.vel.z = targetVelocity.z))
      : ((player.vel.x += (velocityDeltaX / velocityDeltaLength) * maxVelocityChange),
        (player.vel.z += (velocityDeltaZ / velocityDeltaLength) * maxVelocityChange));
    coyoteTime = player.onGround ? PLAYER_TUNING.coyote : Math.max(0, coyoteTime - dt);
    jumpBufferTime =
      enabled && input.pressed('jump')
        ? PLAYER_TUNING.jumpBuffer
        : Math.max(0, jumpBufferTime - dt);
    if (jumpBufferTime > 0 && coyoteTime > 0 && (!player.crouching || canStand())) {
      player.vel.y = JUMP_SPEED;
      jumpBufferTime = 0;
      coyoteTime = 0;
      player.onGround = false;
      player.crouching = false;
      capsuleHeight = PLAYER_TUNING.standHeight;
      context.events.emit('player:jump', {
        pos: player.pos,
      });
    }
    // 重力分半步应用在碰撞移动两侧；保留此顺序以维持原版跳跃和落地手感。
    player.vel.y -= PLAYER_TUNING.gravity * dt * 0.5;
    if (player.vel.y < -40) {
      player.vel.y = -40;
    }
    let verticalSpeedBeforeMove = player.vel.y,
      collision =
        context.physics.moveCapsule(
          player.pos,
          player.vel,
          dt,
          PLAYER_CONFIG.radius,
          capsuleHeight,
          wasOnGround,
        ) || {};
    if (!collision.onGround) {
      player.vel.y -= PLAYER_TUNING.gravity * dt * 0.5;
    }
    let worldBounds = context.physics.bounds;
    if (
      (worldBounds &&
        ((player.pos.x = clamp(player.pos.x, worldBounds.min.x + 0.4, worldBounds.max.x - 0.4)),
        (player.pos.z = clamp(player.pos.z, worldBounds.min.z + 0.4, worldBounds.max.z - 0.4))),
      (player.onGround = !!collision.onGround),
      collision.surface && (groundSurface = collision.surface),
      player.onGround)
    ) {
      if (!wasOnGround && airTime > 0.12) {
        let ce = Math.max(0, -verticalSpeedBeforeMove, maxFallSpeed);
        landingSpring.v -= Math.min(ce * PLAYER_TUNING.landDip, 3.2);
        if (ce > 7.5) {
          player.addShake(Math.min(0.5, (ce - 7.5) * 0.06));
        }
        context.events.emit('player:land', {
          speed: ce,
          surface: getFootstepSurface(),
          pos: player.pos,
        });
        if (ce > 13) {
          player.damage((ce - 13) * 7, null);
        }
        stridePhase = 0.35;
      }
      airTime = 0;
      maxFallSpeed = 0;
      if (player.pos.x <= WORLD_BOUNDS.quayX - 1.2 && player.pos.y > -0.5) {
        lastSafePosition.copy(player.pos);
      }
    } else {
      airTime += dt;
      maxFallSpeed = Math.max(maxFallSpeed, -player.vel.y);
    }
    wasOnGround = player.onGround;
    // 落海救援使用最近的安全陆地位置；保持惩罚伤害及 player:rescued 提示事件。
    if (player.pos.y < WORLD_BOUNDS.seaY - 2.2) {
      player.pos.copy(lastSafePosition);
      player.vel.set(0, 0, 0);
      player.onGround = true;
      wasOnGround = true;
      shakeAmount = 0.6;
      player.yaw += Math.PI;
      player.damage(12, null);
      context.events.emit('player:rescued', {});
    }
    player.speed = Math.hypot(player.vel.x, player.vel.z);
    let strideLength = player.crouching
      ? PLAYER_TUNING.stride.crouch
      : player.sprinting
        ? PLAYER_TUNING.stride.sprint
        : PLAYER_TUNING.stride.walk;
    if (player.onGround && player.speed > 0.5) {
      let ce = stridePhase;
      stridePhase += (player.speed * dt) / strideLength;
      if (Math.floor(stridePhase) > Math.floor(ce)) {
        context.events.emit('player:step', {
          surface: getFootstepSurface(),
          sprint: player.sprinting,
          pos: player.pos,
        });
      }
    } else {
      if (player.onGround) {
        stridePhase = damp(stridePhase, Math.round(stridePhase), 8, dt);
      }
    }
    let targetBobWeight = player.onGround
      ? saturate(player.speed / PLAYER_TUNING.walk) *
        (player.sprinting ? PLAYER_TUNING.bobSprint : 1) *
        lerp(1, PLAYER_TUNING.bobAds, player.ads) *
        (player.crouching ? 0.7 : 1)
      : 0;
    bobWeight = damp(bobWeight, targetBobWeight, 9, dt);
    bobY = -Math.cos(stridePhase * Math.PI * 2) * PLAYER_TUNING.bobY * bobWeight;
    bobX = Math.sin(stridePhase * Math.PI) * PLAYER_TUNING.bobX * bobWeight;
    let lateralSpeed = player.vel.x * cosYaw - player.vel.z * sinYaw;
    strafeRoll = damp(
      strafeRoll,
      (-lateralSpeed / PLAYER_TUNING.sprint) * PLAYER_TUNING.rollStrafe * lerp(1, 0.4, player.ads),
      8,
      dt,
    );
    timeSinceDamage += dt;
    if (timeSinceDamage > PLAYER_TUNING.regenDelay && player.health < player.maxHealth) {
      player.health = Math.min(player.maxHealth, player.health + PLAYER_TUNING.regenRate * dt);
    }
    updateCamera(dt);
    updatePostEffects(dt);
  }
  /* 死亡后继续重力与碰撞，逐步停止移动晃动。 */
  function updateDeadBody(dt) {
    player.vel.x = damp(player.vel.x, 0, 5, dt);
    player.vel.z = damp(player.vel.z, 0, 5, dt);
    player.vel.y -= PLAYER_TUNING.gravity * dt;
    try {
      let X = context.physics.moveCapsule(
        player.pos,
        player.vel,
        dt,
        PLAYER_CONFIG.radius,
        0.6,
        wasOnGround,
      );
      wasOnGround = !!(X && X.onGround);
    } catch {}
    if (player.pos.y < WORLD_BOUNDS.seaY - 1) {
      player.pos.y = WORLD_BOUNDS.seaY - 1;
      player.vel.y = 0;
    }
    player.speed = 0;
    player.sprinting = false;
    bobWeight = damp(bobWeight, 0, 10, dt);
    bobX *= 0.9;
    bobY *= 0.9;
  }
  /* 镜头叠加蹲伏高度、步伐、落地弹簧、后坐力、受击晃动和视野变化。 */
  function updateCamera(dt) {
    let targetEyeHeight = player.crouching ? PLAYER_CONFIG.crouchEye : PLAYER_CONFIG.eye,
      deathRoll = 0,
      deathPitch = 0;
    if (player.alive)
      dt > 0
        ? (eyeHeight = damp(eyeHeight, targetEyeHeight, PLAYER_TUNING.eyeRate, dt))
        : (eyeHeight = targetEyeHeight);
    else {
      let Z = smoothstep(0, 0.85, deathTime),
        J = Z * Z;
      targetEyeHeight = lerp(PLAYER_CONFIG.eye, 0.22, J);
      eyeHeight = damp(eyeHeight, targetEyeHeight, 18, dt);
      deathRoll = 1.15 * J;
      deathPitch = -0.25 * Z + 0.12 * Math.sin(Z * Math.PI);
    }
    if (dt > 0) {
      let Z = -landingSpring.x * 150 - landingSpring.v * 17;
      landingSpring.v += Z * dt;
      landingSpring.x += landingSpring.v * dt;
      landingSpring.x = clamp(landingSpring.x, -PLAYER_TUNING.landDipMax, 0.05);
      recoilHoldTime -= dt;
      if (recoilHoldTime <= 0) {
        recoilPitch = damp(recoilPitch, 0, PLAYER_TUNING.recoilRecover, dt);
        recoilYaw = damp(recoilYaw, 0, PLAYER_TUNING.recoilRecover, dt);
      }
      appliedRecoilPitch = damp(appliedRecoilPitch, recoilPitch, PLAYER_TUNING.recoilApply, dt);
      appliedRecoilYaw = damp(appliedRecoilYaw, recoilYaw, PLAYER_TUNING.recoilApply, dt);
      shakeAmount = Math.max(0, shakeAmount - PLAYER_TUNING.shakeDecay * dt);
      shakeTime += dt;
    }
    let sinYaw = Math.sin(player.yaw),
      cosYaw = Math.cos(player.yaw);
    player.eye.set(
      player.pos.x + bobX * cosYaw,
      player.pos.y + eyeHeight + bobY + landingSpring.x,
      player.pos.z - bobX * sinYaw,
    );
    let viewPitch = clamp(player.pitch + appliedRecoilPitch, -1.55, 1.55),
      viewYaw = player.yaw + appliedRecoilYaw;
    lookEuler.set(viewPitch, viewYaw, 0, 'YXZ');
    player.forward.set(0, 0, -1).applyEuler(lookEuler);
    let shakeStrength = shakeAmount * shakeAmount,
      phase = shakeTime,
      shakePitch =
        shakeStrength *
        PLAYER_TUNING.shakePitch *
        (Math.sin(phase * 43.1) + 0.6 * Math.sin(phase * 71.7 + 1.3)),
      shakeYaw =
        shakeStrength *
        PLAYER_TUNING.shakeYaw *
        (Math.sin(phase * 37.3 + 2.1) + 0.6 * Math.sin(phase * 83.9)),
      shakeRoll =
        shakeStrength *
        PLAYER_TUNING.shakeRoll *
        (Math.sin(phase * 29.7 + 0.7) + 0.5 * Math.sin(phase * 61.3 + 4));
    if (
      (camera.position.copy(player.eye),
      camera.rotation.set(
        viewPitch + shakePitch + deathPitch + landingSpring.x * 0.12,
        viewYaw + shakeYaw,
        strafeRoll + shakeRoll + deathRoll + bobX * 0.35,
        'YXZ',
      ),
      !context.params || !context.params.fov)
    ) {
      let Z = lerp(
        player.baseFov + (player.sprinting ? PLAYER_TUNING.fovSprint : 0),
        PLAYER_TUNING.fovAds,
        player.ads,
      );
      currentFov =
        dt > 0 ? damp(currentFov, Z, player.ads > 0.02 && player.ads < 0.98 ? 30 : 7, dt) : Z;
      if (Math.abs(camera.fov - currentFov) > 0.01) {
        camera.fov = currentFov;
        camera.updateProjectionMatrix();
      }
    }
  }
  /* 同步伤害和低血量后处理参数。 */
  function updatePostEffects(dt) {
    damagePulse = Math.max(0, damagePulse - dt * 1.9);
    player.hurtPulse = damagePulse;
    let targetLowHealth = player.alive
      ? smoothstep(0.55, 0.12, player.health / player.maxHealth)
      : 1;
    lowHealthEffect = damp(lowHealthEffect, targetLowHealth, 4, dt);
    let postEffects = getPostEffects();
    postEffects.damage = damagePulse;
    postEffects.lowHealth = lowHealthEffect;
    postEffects.ads = player.ads;
  }
  return player;
}
export { createPlayer };
