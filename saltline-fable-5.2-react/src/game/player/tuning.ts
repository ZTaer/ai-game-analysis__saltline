import { PLAYER_CONFIG } from '../config.ts';

/**
 * 玩家手感配置。距离采用游戏世界单位（按米使用），时间为秒，旋转为弧度；
 * fov* 字段的值为角度。运行中的 player.tuning 引用本对象，不创建副本。
 * 调整镜头/碰撞基础尺寸仍从 ../config.ts 的 PLAYER_CONFIG 入手。
 */
export const PLAYER_TUNING = {
  // 平移速度（米/秒）：普通行走、冲刺、蹲行、瞄准移动。
  walk: 3.8,
  sprint: 6.4,
  crouch: 1.9,
  ads: 2.4,
  // 地面加减速与空中操控加速度（米/秒²）。
  accelGround: 34,
  decelGround: 26,
  accelAir: 9,
  gravity: 21,
  jumpApex: 1, // 从起跳点到最高点的目标高度（米）。
  coyote: 0.12, // 离地后仍允许起跳的宽限时间。
  jumpBuffer: 0.13, // 落地前提前按跳跃时保留输入的时间。
  standHeight: PLAYER_CONFIG.height,
  crouchHeight: 1.15,
  eyeRate: 11, // 蹲起时眼睛高度的指数平滑速率。
  // 每跨过一个步幅触发一次脚步事件，同时驱动走路镜头相位。
  stride: {
    walk: 1.55,
    sprint: 2.1,
    crouch: 1.05,
  },
  bobY: 0.024,
  bobX: 0.013,
  bobSprint: 1.9, // 冲刺时镜头晃动倍率。
  bobAds: 0.22, // 瞄准时镜头晃动倍率。
  rollStrafe: 0.02,
  landDip: 0.36, // 落地速度对镜头下沉弹簧的影响系数。
  landDipMax: 0.2,
  fovSprint: 6, // 冲刺时叠加到基础 FOV 的角度。
  fovAds: 52, // 完全瞄准时的目标 FOV。
  adsLook: 0.6, // 瞄准时视角输入倍率。
  regenDelay: 4, // 最后一次受伤后等待多少秒开始回血。
  regenRate: 25, // 自动回血速度（生命值/秒）。
  recoilKeep: 0.35, // 后坐力中永久留在玩家朝向上的比例；其余部分逐渐恢复。
  recoilApply: 34,
  recoilRecover: 6.5,
  recoilHold: 0.09,
  shakeDecay: 1.7,
  shakePitch: 0.03,
  shakeYaw: 0.03,
  shakeRoll: 0.045,
  pitchLimit: 1.5,
};

// 保持原版的一次性派生方式：模块加载时按 v² = 2gh 算起跳速度。
// 若在控制台临时修改 gravity/jumpApex，本值不会自动重新计算。
export const JUMP_SPEED = Math.sqrt(2 * PLAYER_TUNING.gravity * PLAYER_TUNING.jumpApex);
