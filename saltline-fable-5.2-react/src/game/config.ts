export type QualityName = 'test' | 'low' | 'medium' | 'high' | 'ultra';
export interface QualityPreset {
  name: QualityName;
  scale: number;
  msaa: number;
  shadow: number;
  tex: number;
  volSteps: number;
  ao: boolean;
  planar: number;
  bloom: boolean;
  motionBlur: boolean;
  rain: number;
}
/**
 * Saltline / config
 * 从原版游戏按职责提取；保留原始算法、参数、着色器与执行顺序。
 */
import { Color, Vector3 } from 'three';
var /* 关卡可移动边界、地面高度、海平面及码头边缘；影响碰撞、落水救援和地表生成。 */ WORLD_BOUNDS =
    {
      min: new Vector3(-40, 0, -30),
      max: new Vector3(40, 30, 30),
      groundY: 0,
      seaY: -1.6,
      quayX: 30,
    },
  /* 日光方向、颜色与强度；渲染、地面、特效和武器共享同一照明基准。 */ SUN = {
    dir: new Vector3(0.916, 0.225, 0.331).normalize(),
    color: new Color(1, 0.72, 0.42),
    intensity: 9,
  },
  /* 天空天顶、朝日地平线、背日地平线与雾色；保持原版雨港的综合色调。 */ SKY_COLORS = {
    zenith: new Color(0.055, 0.085, 0.13),
    horizon: new Color(0.95, 0.55, 0.28),
    horizonAway: new Color(0.16, 0.22, 0.3),
    fog: new Color(0.42, 0.47, 0.52),
  },
  /* 玩家碰撞胶囊、站立/蹲伏视点和世界/武器视野；移动调参另见 player/player.js。 */ PLAYER_CONFIG =
    {
      eye: 1.68,
      crouchEye: 1.05,
      radius: 0.32,
      height: 1.8,
      fov: 74,
      viewFov: 54,
    },
  /* 世界场景使用的 Three.js 图层编号；保持与 renderer、weapon 中 layers 设置一致。 */ vf = 0,
  /* 第一人称武器使用的 Three.js 图层编号，与世界场景分开绘制。 */ zc = 1,
  /* 画质档位：scale 为分辨率比例，msaa 为采样数，shadow/tex 为纹理尺寸，volSteps 为体积光步数，ao/planar/bloom/motionBlur/rain 控制环境效果。test 用于原版截图与诊断。 */ QUALITY_PRESETS: Record<
    QualityName,
    QualityPreset
  > = {
    test: {
      name: 'test',
      scale: 1,
      msaa: 0,
      shadow: 1024,
      tex: 256,
      volSteps: 10,
      ao: !0,
      planar: 0.5,
      bloom: !0,
      motionBlur: !1,
      rain: 0.4,
    },
    low: {
      name: 'low',
      scale: 0.7,
      msaa: 0,
      shadow: 2048,
      tex: 512,
      volSteps: 12,
      ao: !1,
      planar: 0,
      bloom: !0,
      motionBlur: !1,
      rain: 0.5,
    },
    medium: {
      name: 'medium',
      scale: 0.85,
      msaa: 2,
      shadow: 2048,
      tex: 1024,
      volSteps: 16,
      ao: !0,
      planar: 0.5,
      bloom: !0,
      motionBlur: !1,
      rain: 0.8,
    },
    high: {
      name: 'high',
      scale: 1,
      msaa: 4,
      shadow: 4096,
      tex: 1024,
      volSteps: 24,
      ao: !0,
      planar: 0.5,
      bloom: !0,
      motionBlur: !0,
      rain: 1,
    },
    ultra: {
      name: 'ultra',
      scale: 1,
      msaa: 4,
      shadow: 4096,
      tex: 2048,
      volSteps: 40,
      ao: !0,
      planar: 1,
      bloom: !0,
      motionBlur: !0,
      rain: 1,
    },
  };
/* 优先使用显式档位；否则根据触屏设备和 GPU 标识选择原版默认画质，并释放探测用 WebGL 上下文。 */
function selectQuality(i?: string): QualityPreset {
  if (i && QUALITY_PRESETS[i as QualityName])
    return {
      ...QUALITY_PRESETS[i as QualityName],
    };
  if (
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900)
  )
    return {
      ...QUALITY_PRESETS.low,
    };
  let t = '';
  try {
    let s = document.createElement('canvas'),
      o = s.getContext('webgl2') || s.getContext('webgl');
    if (o) {
      let r = o.getExtension('WEBGL_debug_renderer_info');
      t = String(r ? o.getParameter(r.UNMASKED_RENDERER_WEBGL) : o.getParameter(o.RENDERER));
      let a = o.getExtension('WEBGL_lose_context');
      a && a.loseContext();
    }
  } catch {}
  return {
    ...(/SwiftShader|llvmpipe|Software|Mali|Adreno|PowerVR/i.test(t) ||
    (/Intel/i.test(t) && !/Arc/i.test(t))
      ? QUALITY_PRESETS.medium
      : QUALITY_PRESETS.high),
  };
}
export { PLAYER_CONFIG, QUALITY_PRESETS, SKY_COLORS, SUN, WORLD_BOUNDS, selectQuality, vf, zc };
