import { PLAYER_CONFIG, QUALITY_PRESETS } from '../game/config.js';

// 保留原存储键；同源部署沿用已有偏好，不同端口的 localStorage 由浏览器隔离。
export const SETTINGS_KEY = 'saltline.settings.v1';
export const QUALITY_OPTIONS = ['low', 'medium', 'high', 'ultra'];
/**
 * @typedef {object} GameSettings
 * @property {'auto'|'low'|'medium'|'high'|'ultra'} quality 画质预设。
 * @property {number} sens 灵敏度倍率，读取时限制为 0.2～3。
 * @property {boolean} invertY 是否反转垂直视角。
 * @property {number} volume 主音量，范围 0～1；UI 显示为百分比。
 * @property {number} fov 玩家基础视野，单位为度，范围 60～95。
 */
/** @type {GameSettings} */
export const DEFAULT_SETTINGS = {
  quality: 'auto',
  sens: 1,
  invertY: false,
  volume: 0.8,
  fov: PLAYER_CONFIG.fov,
};

/**
 * 每次创建独立设置对象；只接受已知档位和有限数值，旧存档/损坏数据回退到默认值。
 * @returns {GameSettings}
 */
export function readSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (saved.quality === 'auto' || QUALITY_OPTIONS.includes(saved.quality)) {
        settings.quality = saved.quality;
      }
      if (Number.isFinite(saved.sens)) settings.sens = Math.min(3, Math.max(0.2, saved.sens));
      settings.invertY = !!saved.invertY;
      if (Number.isFinite(saved.volume)) settings.volume = Math.min(1, Math.max(0, saved.volume));
      if (Number.isFinite(saved.fov)) settings.fov = Math.min(95, Math.max(60, saved.fov));
    }
  } catch {
    // 隐私模式拒绝存储、非法 JSON 等情况不会阻止游戏启动。
  }
  return settings;
}

/** @param {GameSettings} settings 存整份偏好；新增字段仍需在 readSettings 中校验。 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

/**
 * 将一个设置同步到所属子系统；changed 省略时用于首次应用整份设置。
 * 首次画质应用尊重 URL 中的 q/shot，避免用户旧偏好覆盖测试或展示指定的画质。
 * @param {object} context 游戏上下文；FOV 由 player 设置，质量由 render 重建资源。
 * @param {GameSettings} settings 当前偏好。
 * @param {keyof GameSettings} [changed] 本次改动的字段。
 */
export function applySettings(context, settings, changed) {
  if (!changed || changed === 'sens') context.input.sensitivity = settings.sens;
  if (!changed || changed === 'invertY') context.input.invertY = settings.invertY;
  if (!changed || changed === 'volume') {
    try {
      context.audio?.setVolume?.(settings.volume);
    } catch (error) {
      console.error(error);
    }
  }
  if (!changed || changed === 'fov') context.player?.setFov?.(settings.fov);
  if (
    changed === 'quality' ||
    (!changed &&
      settings.quality !== 'auto' &&
      !context.params.shot &&
      !context.params.q &&
      settings.quality !== context.quality?.name)
  ) {
    const quality = QUALITY_PRESETS[settings.quality];
    if (quality) {
      try {
        if (context.render?.setQuality) context.render.setQuality({ ...quality });
        else context.quality = { ...quality };
      } catch (error) {
        console.error('[game] setQuality failed', error);
      }
    }
  }
}

/** 秒数向下取整后显示为 mm:ss；用于死亡/结算页面，不改变任务计时。 */
export function formatTime(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}
