import { mi as RIFLE_INFO } from './rifleGeometry.js';

/**
 * PAC-9 的玩法数值与持枪姿态。这里保留原版数值及对象引用，控制器负责使用它们。
 * 几何模型只提供瞄具基准位置，不反向依赖武器控制器，避免初始化循环。
 */
export const MAGAZINE_CAPACITY = 30;
export const INITIAL_RESERVE_AMMO = 150;
export const FIRE_RATE_RPM = 720; // 发/分钟；实际射击间隔为 60 / FIRE_RATE_RPM 秒。
export const BULLET_DAMAGE = 26; // 单发基础伤害；弱点倍率由 combat.playerShot() 应用。
export const BULLET_RANGE = 300; // 世界射线最大长度（米）。

// p 为武器局部位移（米），r 为局部欧拉旋转（弧度）。
// 这些是动画混合的目标姿态，不是玩家相机的世界坐标。
export const HIP_POSE = {
  p: [0.118, -0.122, -0.275],
  r: [0.034, 0.085, -0.03],
};
export const AIM_POSE = {
  p: [0, -RIFLE_INFO.sightY, -0.135],
  r: [0, 0, 0],
};
export const SPRINT_POSE = {
  p: [-0.035, 0.004, 0.03],
  r: [-0.04, 0.62, 0.26],
};
export const RELOAD_POSE = {
  p: [-0.03, 0.1, -0.02],
  r: [0.46, 0.22, -0.8],
};

// 两种换弹时长（秒）。控制器按归一化进度安排手部动画与弹匣/枪机音效。
export const TACTICAL_RELOAD_SECONDS = 2.1;
export const EMPTY_RELOAD_SECONDS = 2.72;
