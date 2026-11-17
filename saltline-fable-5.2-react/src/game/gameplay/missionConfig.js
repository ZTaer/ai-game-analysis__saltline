/**
 * 任务节奏配置。这里只保存规则；中继位置、出生点与撤离区域由 level/level.js 提供。
 * game.flow 引用本对象。保持可变对象语义，供原有调试入口读取和检查。
 */
export const GAME_CONFIG = {
  introSeconds: 3.5,
  retryIntroSeconds: 1.3,
  interactRange: 2.2, // 交互的水平距离上限（米）。
  interactFacing: 0.45, // 水平朝向点积阈值；越大越要求正对中继。
  cutSeconds: 2.4, // 连续按住交互键达到满进度的时间（秒）。
  patrol: {
    gull: 2,
    hound: 1,
  },
  // 每完成一个中继取对应波次；超出数组长度时沿用最后一项。
  waves: [
    {
      gull: 3,
      hound: 1,
    },
    {
      gull: 3,
      hound: 2,
    },
    {
      gull: 4,
      hound: 3,
    },
  ],
  maxAlive: 9, // 增援释放时允许同时存活的敌人数量上限。
  spawnStagger: 0.85, // 一波内相邻增援的排队时间间隔（秒）。
  spawnFar: 18, // 选择增援出生点时优先保证的玩家距离（米）。
  pursuitEvery: 7, // 所有中继断开后，额外追兵的检查/生成周期（秒）。
  pursuitMinAlive: 4,
  pursuitExtra: 5, // 最终追击阶段额外生成次数预算。
  titleSpeed: 1.15, // 标题镜头路径的速度参数。
  titleFov: 50, // 标题镜头视野角度。
};

// 增援提示的八方位标签，按北起顺时针排列；不要改变顺序。
export const COMPASS_DIRECTIONS = [
  'NORTH',
  'NORTH-EAST',
  'EAST',
  'SOUTH-EAST',
  'SOUTH',
  'SOUTH-WEST',
  'WEST',
  'NORTH-WEST',
];
