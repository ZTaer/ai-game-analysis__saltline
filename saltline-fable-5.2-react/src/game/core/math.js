/**
 * Saltline / core/math
 * 纯数值工具，返回值不修改输入。参数位置沿用调用方约定：
 * clamp(value, min, max)：限制范围；lerp(from, to, fraction)：不钳制比例的线性插值。
 * saturate(value)：限制到 [0, 1]；smoothstep(edge0, edge1, value)：平滑过渡到 [0, 1]。
 * damp(current, target, rate, dt)：指数逼近，dt 为秒，rate 为每秒响应速率。
 * damp 使用时间步长计算衰减，避免相同参数在不同帧率下产生不同的平滑速度。
 */
var clamp = (i, e, t) => Math.min(t, Math.max(e, i)),
  lerp = (i, e, t) => i + (e - i) * t,
  saturate = (i) => Math.min(1, Math.max(0, i)),
  smoothstep = (i, e, t) => {
    let n = saturate((t - i) / (e - i));
    return n * n * (3 - 2 * n);
  },
  damp = (i, e, t, n) => e + (i - e) * Math.exp(-t * n);
export { clamp, damp, lerp, saturate, smoothstep };
