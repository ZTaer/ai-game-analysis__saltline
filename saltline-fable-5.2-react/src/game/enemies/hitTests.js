/** 敌人射线命中测试。独立于敌人管理器，避免 Hound 与敌人配置形成循环初始化。 */
import { Vector3 } from 'three';
function sM(i, e, t, n, s, o) {
  let r = i.x - t.x,
    a = i.y - t.y,
    l = i.z - t.z,
    c = r * e.x + a * e.y + l * e.z,
    u = r * r + a * a + l * l - n * n,
    h = c * c - u;
  if (h < 0) return !1;
  let f = -c - Math.sqrt(h);
  return f < 0 || f > s || f >= o.dist
    ? !1
    : ((o.dist = f),
      o.point.copy(i).addScaledVector(e, f),
      o.normal.copy(o.point).sub(t).normalize(),
      !0);
}
var au = new Vector3(),
  Jv = new Vector3(),
  tM = new Vector3();
function nM(i, e, t, n, s, o, r) {
  (au.copy(n).sub(t), Jv.copy(i).sub(t));
  let a = au.dot(au),
    l = au.dot(e),
    c = au.dot(Jv),
    u = e.dot(Jv),
    h = a - l * l,
    f = h > 1e-8 ? (c - l * u) / h : 0;
  return (
    (f = f < 0 ? 0 : f > 1 ? 1 : f),
    tM.copy(t).addScaledVector(au, f),
    sM(i, e, tM, s, o, r)
  );
}
export { sM, nM };
