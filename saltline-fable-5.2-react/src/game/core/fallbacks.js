/**
 * Saltline / core/fallbacks
 * 可选子系统启动失败、无音频选项与展示模式所用的接口占位。
 * 每个工厂保持对应系统的调用形状，stub 标志用于识别降级；这些数值不是正常玩法配置。
 * 回退策略由运行入口决定；关键渲染器/关卡没有在这里提供静默替代。
 */
import { Color, MeshBasicMaterial, MeshStandardMaterial } from 'three';
var noop = () => {},
  fallbacks = {
    ground: () => ({
      stub: !0,
      update: noop,
      wetnessAt: () => 0.5,
      isPuddle: () => !1,
    }),
    backdrop: () => ({
      stub: !0,
      update: noop,
    }),
    fx: () => ({
      stub: !0,
      update: noop,
      muzzleFlash: noop,
      tracer: noop,
      impact: noop,
      sparks: noop,
      smoke: noop,
      explosion: noop,
      debris: noop,
      shell: noop,
      decal: noop,
      dust: noop,
      clear: noop,
      splash: noop,
      addEmitter: () => ({
        stop: noop,
        setPos: noop,
      }),
    }),
    audio: () => {
      let i = {
        setPos: noop,
        setGain: noop,
        setPitch: noop,
        stop: noop,
      };
      return {
        stub: !0,
        update: noop,
        resume: noop,
        play: noop,
        loop: () => i,
        setIntensity: noop,
        setInterior: noop,
        setVolume: noop,
        setPaused: noop,
      };
    },
    weapon: () => ({
      stub: !0,
      update: noop,
      reset: noop,
      setVisible: noop,
      ammo: 30,
      magSize: 30,
      reserve: 120,
      state: 'idle',
      name: 'KR-7',
      ads: 0,
      spread: 0.01,
    }),
    enemies: () => ({
      stub: !0,
      list: [],
      update: noop,
      spawn: () => null,
      raycast: () => null,
      aliveCount: () => 0,
      clear: noop,
      alert: noop,
    }),
    hud: () => ({
      stub: !0,
      update: noop,
      show: noop,
      setObjective: noop,
      message: noop,
      hitmarker: noop,
    }),
    // 同一材质名称复用实例，避免降级场景中每个物件都创建一份新材质。
    mats: () => {
      let i = new Map();
      return {
        stub: !0,
        get: (t) => (
          i.has(t) ||
            i.set(
              t,
              new MeshStandardMaterial({
                color: 7829367,
                roughness: 0.7,
              }),
            ),
          i.get(t)
        ),
        emissive: (t = 16777215, n = 4) =>
          new MeshBasicMaterial({
            color: new Color(t).multiplyScalar(n),
          }),
        names: [],
        decal: () => ({
          material: new MeshBasicMaterial({
            transparent: !0,
            opacity: 0,
          }),
          aspect: 1,
        }),
        label: () => ({
          material: new MeshBasicMaterial({
            transparent: !0,
            opacity: 0,
          }),
          aspect: 4,
        }),
        uniforms: {
          wet: {
            value: 1,
          },
        },
        update: noop,
      };
    },
  };
export { fallbacks };
