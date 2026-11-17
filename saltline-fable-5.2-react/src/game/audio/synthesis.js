/**
 * 音频 DSP 基础工具：噪声、振荡、滤波、包络、混合和循环处理。
 * 数组索引表示采样点，时长转换由各工具按采样率处理；修改计算顺序可能改变输出波形。
 */
var vt = Math.PI * 2;
function ao(i) {
  let e = i >>> 0;
  return () => {
    ((e |= 0), (e = (e + 1831565813) | 0));
    let t = Math.imul(e ^ (e >>> 15), 1 | e);
    return (
      (t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t),
      ((t ^ (t >>> 14)) >>> 0) / 4294967296
    );
  };
}
function Kb(i) {
  let e = 2166136261;
  for (let t = 0; t < i.length; t++) ((e ^= i.charCodeAt(t)), (e = Math.imul(e, 16777619)));
  return e >>> 0;
}
var St = (i, e) => new Float32Array(Math.max(1, Math.round(i * e))),
  Xt = (i, e, t) => e + (t - e) * i(),
  Ns = (i) => 440 * Math.pow(2, (i - 69) / 12);
function Qn(i, e, t) {
  let n = St(i, e);
  for (let s = 0; s < n.length; s++) n[s] = t() * 2 - 1;
  return n;
}
function Av(i, e, t, n) {
  let s = (vt * Math.max(10, Math.min(e, n * 0.47))) / n,
    o = Math.cos(s),
    r = Math.sin(s),
    a = r / (2 * t),
    l,
    c,
    u,
    h = 1 + a,
    f = -2 * o,
    p = 1 - a;
  return (
    i === 'lp'
      ? ((l = (1 - o) / 2), (c = 1 - o), (u = l))
      : i === 'hp'
        ? ((l = (1 + o) / 2), (c = -(1 + o)), (u = l))
        : ((l = a), (c = 0), (u = -a)),
    [l / h, c / h, u / h, f / h, p / h]
  );
}
function tn(i, e, t, n, s) {
  let [o, r, a, l, c] = Av(e, t, n, s),
    u = 0,
    h = 0;
  for (let f = 0; f < i.length; f++) {
    let p = i[f],
      d = o * p + u;
    ((u = r * p - l * d + h), (h = a * p - c * d), (i[f] = d));
  }
  return i;
}
function di(i, e, t, n, s, o = 1) {
  let r = i.length;
  for (let a = 0; a < o; a++) {
    let l = 0,
      c = 0,
      u = null;
    a > 0 && ((l = di.z1), (c = di.z2));
    let h = a === o - 1 ? i : null;
    for (let f = 0; f < r; f++) {
      (f & 31) === 0 && (u = Av(e, t(f / r), typeof n == 'function' ? n(f / r) : n, s));
      let p = i[f],
        d = u[0] * p + l;
      ((l = u[1] * p - u[3] * d + c), (c = u[2] * p - u[4] * d), h && (h[f] = d));
    }
    ((di.z1 = l), (di.z2 = c));
  }
  return i;
}
var Vo =
  (i, e, t = 1) =>
  (n) =>
    i * Math.pow(e / i, Math.pow(n, t));
function lo(i, e, t) {
  for (let n = 0; n < i.length; n++) i[n] *= t(n / e);
  return i;
}
var co = (i, e = 0) =>
  e > 0 ? (t) => (1 - Math.exp(-t / e)) * Math.exp(-t / i) : (t) => Math.exp(-t / i);
function Se(i, e, t, n, s) {
  let o = Math.round(t * s),
    r = Math.min(e.length, i.length - o);
  for (let a = Math.max(0, -o); a < r; a++) i[o + a] += e[a] * n;
  return i;
}
function Us(i, e, t, n, s) {
  let o = i.length,
    r = Math.round(t * s) % o;
  r < 0 && (r += o);
  for (let a = 0; a < e.length; a++) ((i[r] += e[a] * n), ++r >= o && (r = 0));
  return i;
}
function Qb(i) {
  let e = 0;
  for (let t = 0; t < i.length; t++) {
    let n = Math.abs(i[t]);
    n > e && (e = n);
  }
  return e;
}
function ml(i, e) {
  for (let t = 0; t < i.length; t++) i[t] *= e;
  return i;
}
function Wo(i, e) {
  let t = 1 / Math.tanh(e);
  for (let n = 0; n < i.length; n++) i[n] = Math.tanh(i[n] * e) * t;
  return i;
}
function em(i, e, t, n) {
  let s = Math.min(i.length >> 1, Math.round(t * e)),
    o = Math.min(i.length >> 1, Math.round(n * e));
  for (let r = 0; r < s; r++) i[r] *= r / s;
  for (let r = 0; r < o; r++) {
    let a = r / o;
    i[i.length - 1 - r] *= a * a;
  }
  return i;
}
function at(i, e, t, n, s = {}) {
  let o = Qn(i, t, e);
  (s.hp && tn(o, 'hp', s.hp, 0.707, i),
    s.lp && tn(o, 'lp', s.lp, 0.707, i),
    s.bp && tn(o, 'bp', s.bp, s.q || 1, i),
    lo(o, i, co(n, s.att || 0)));
  let r = Qb(o);
  return r > 0 ? ml(o, 1 / r) : o;
}
function ei(i, e, t, n, s, o, r = 6e-4) {
  let a = St(i, e),
    l = 0;
  for (let c = 0; c < a.length; c++) {
    let u = c / i;
    ((l += (vt * (n + (t - n) * Math.exp(-u / s))) / i),
      (a[c] = Math.sin(l) * Math.exp(-u / o) * (1 - Math.exp(-u / r))));
  }
  return a;
}
function jc(i, e, t, n, s = !0) {
  let o = St(i, e),
    r = 0,
    a = o.length;
  for (let l = 0; l < a; l++) {
    let c = l / a;
    ((r += (vt * t * Math.pow(n / t, c)) / i),
      (o[l] = Math.sin(r) * (s ? Math.sin(Math.PI * c) : 1)));
  }
  return o;
}
function dn(i, e, t, n) {
  let s = St(i, e);
  for (let [r, a, l] of t) {
    if (r > i * 0.46) continue;
    let c = (vt * r) / i,
      u = n ? n() * vt : 0,
      h = Math.exp(-1 / (a * i)),
      f = l;
    for (
      let p = 0;
      p < s.length && ((s[p] += Math.sin(c * p + u) * f), (f *= h), !(f < 1e-5));
      p++
    );
  }
  let o = Math.min(s.length, Math.round(4e-4 * i));
  for (let r = 0; r < o; r++) s[r] *= r / o;
  return s;
}
function Jc(i, e, t, n, s = {}) {
  let o = St(i, t),
    r = s.from || 0,
    a = s.fall || 1;
  for (let l = 0; l < n; l++) {
    let c = r + (t - r - 0.02) * Math.pow(e(), a),
      u = Math.round(c * i),
      h = Math.round(Xt(e, s.minLen || 0.001, s.maxLen || 0.004) * i),
      f = Xt(e, 0.2, 1) * (s.ampFall ? Math.exp(-c / s.ampFall) : 1);
    for (let p = 0; p < h && u + p < o.length; p++)
      o[u + p] += (e() * 2 - 1) * f * Math.exp((-4 * p) / h);
  }
  return (
    s.hp && tn(o, 'hp', s.hp, 0.707, i),
    s.lp && tn(o, 'lp', s.lp, 0.707, i),
    s.bp && tn(o, 'bp', s.bp, s.q || 1, i),
    o
  );
}
function Rv(i, e, t) {
  let n = i.length - e,
    s = new Float32Array(e);
  s.set(i.subarray(0, e));
  for (let o = 0; o < n; o++) {
    let r = (o + 0.5) / n,
      a = t ? Math.sin((r * Math.PI) / 2) : r,
      l = t ? Math.cos((r * Math.PI) / 2) : 1 - r;
    s[o] = i[o] * a + i[e + o] * l;
  }
  return s;
}
function Zc(i, e, t, n, s = 0.4) {
  let o = Qn(i, e + s, t);
  return (n(o), Rv(o, Math.round(i * e), !0));
}
function Q1(i, ...e) {
  let t = new Float32Array(i);
  for (let [n, s] of e) for (let o = 0; o < Math.min(i, n.length); o++) t[o] += n[o] * s;
  return t;
}
export {
  Av,
  Jc,
  Kb,
  Ns,
  Q1,
  Qb,
  Qn,
  Rv,
  Se,
  St,
  Us,
  Vo,
  Wo,
  Xt,
  Zc,
  ao,
  at,
  co,
  di,
  dn,
  ei,
  em,
  jc,
  lo,
  ml,
  tn,
  vt,
};
