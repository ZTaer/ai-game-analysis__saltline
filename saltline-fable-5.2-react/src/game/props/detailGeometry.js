/**
 * 道具建模工具：细部几何、变换、颜色、分桶合并和重复几何缓存。
 * 该文件被多个道具生成器共享。缓存键及顶点属性布局属于调用约定，修改会影响多个模型。
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShapeUtils,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { createRandom } from '../core/random.js';
import { cylinderGeometry, mergeColoredGeometries, transformGeometry } from '../core/geometry.js';
import { PROP_SIZES } from './props.js';
var At = Math.PI,
  tt = Math.PI / 2,
  zi = (i, e, t) => Math.min(t, Math.max(e, i));
function Za(i, e, t) {
  let n = Math.imul(i, 374761393) ^ Math.imul(e, 668265263) ^ Math.imul(t, 2147483647);
  return ((n = Math.imul(n ^ (n >>> 13), 1274126177)), ((n ^ (n >>> 16)) >>> 0) / 4294967296);
}
function gn(i, e = 0, t = 0) {
  let n = Math.floor(i),
    s = Math.floor(e),
    o = Math.floor(t),
    r = i - n,
    a = e - s,
    l = t - o;
  ((r = r * r * (3 - 2 * r)), (a = a * a * (3 - 2 * a)), (l = l * l * (3 - 2 * l)));
  let c = (u, h, f) => u + (h - u) * f;
  return c(
    c(c(Za(n, s, o), Za(n + 1, s, o), r), c(Za(n, s + 1, o), Za(n + 1, s + 1, o), r), a),
    c(
      c(Za(n, s, o + 1), Za(n + 1, s, o + 1), r),
      c(Za(n, s + 1, o + 1), Za(n + 1, s + 1, o + 1), r),
      a,
    ),
    l,
  );
}
function Mf(i, e, t, n) {
  let s = new BufferGeometry();
  return (
    s.setAttribute('position', new BufferAttribute(new Float32Array(i), 3)),
    e && s.setAttribute('normal', new BufferAttribute(new Float32Array(e), 3)),
    s.setAttribute('uv', new BufferAttribute(new Float32Array(t), 2)),
    n && s.setIndex(n),
    e || s.computeVertexNormals(),
    s
  );
}
function us(i, e = 16) {
  let t = i.length,
    n = [],
    s = [],
    o = [],
    r = [],
    a = [],
    l = [],
    c = [],
    u = 0,
    h = 0;
  for (let f = 0; f < t; f++) {
    let p = 0,
      d = 0;
    if (f > 0) {
      let g = i[f][0] - i[f - 1][0],
        x = i[f][1] - i[f - 1][1],
        y = Math.hypot(g, x);
      y > 1e-6 && ((p += g / y), (d += x / y), (h += y));
    }
    if (f < t - 1) {
      let g = i[f + 1][0] - i[f][0],
        x = i[f + 1][1] - i[f][1],
        y = Math.hypot(g, x);
      y > 1e-6 && ((p += g / y), (d += x / y));
    }
    let v = Math.hypot(p, d) || 1;
    (a.push(d / v), l.push(-p / v), c.push(h), (u = Math.max(u, i[f][0])));
  }
  for (let f = 0; f < t; f++)
    for (let p = 0; p <= e; p++) {
      let d = (p / e) * At * 2,
        v = Math.cos(d),
        g = Math.sin(d);
      (n.push(i[f][0] * v, i[f][1], i[f][0] * g),
        s.push(a[f] * v, l[f], a[f] * g),
        o.push((p / e) * At * 2 * u, c[f]));
    }
  for (let f = 0; f < t - 1; f++)
    if (!(Math.hypot(i[f + 1][0] - i[f][0], i[f + 1][1] - i[f][1]) < 1e-6))
      for (let p = 0; p < e; p++) {
        let d = f * (e + 1) + p,
          v = d + e + 1,
          g = v + 1,
          x = d + 1;
        (i[f][0] > 1e-6 && r.push(d, v, x), i[f + 1][0] > 1e-6 && r.push(v, g, x));
      }
  return Mf(n, s, o, r);
}
function Ge(i, e, t, n = 0.008, s = 'center') {
  let o = [i / 2, e / 2, t / 2];
  n = Math.min(n, o[0] * 0.9, o[1] * 0.9, o[2] * 0.9);
  let r = [],
    a = [],
    l = [],
    c = [];
  for (let p = 0; p < 8; p++)
    for (let d = 0; d < 3; d++) {
      let v = [p & 1 ? 1 : -1, p & 2 ? 1 : -1, p & 4 ? 1 : -1],
        g = [0, 1, 2].map((x) => v[x] * (o[x] - (x !== d ? n : 0)));
      (r.push(g[0], g[1], g[2]),
        a.push(d === 0 ? v[0] : 0, d === 1 ? v[1] : 0, d === 2 ? v[2] : 0),
        d === 0 ? l.push(g[2], g[1]) : d === 1 ? l.push(g[0], g[2]) : l.push(g[0], g[1]));
    }
  let u = (p, d) => p * 3 + d,
    h = (p, d, v, g, x, y) => {
      let b = r[d * 3] - r[p * 3],
        m = r[d * 3 + 1] - r[p * 3 + 1],
        A = r[d * 3 + 2] - r[p * 3 + 2],
        _ = r[v * 3] - r[p * 3],
        M = r[v * 3 + 1] - r[p * 3 + 1],
        E = r[v * 3 + 2] - r[p * 3 + 2];
      (m * E - A * M) * g + (A * _ - b * E) * x + (b * M - m * _) * y >= 0
        ? c.push(p, d, v)
        : c.push(p, v, d);
    };
  for (let p = 0; p < 3; p++) {
    let d = (p + 1) % 3,
      v = (p + 2) % 3;
    for (let g of [0, 1]) {
      let x = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([b, m]) => (g << p) | (b << d) | (m << v)),
        y = [0, 0, 0];
      ((y[p] = g ? 1 : -1),
        h(u(x[0], p), u(x[1], p), u(x[2], p), ...y),
        h(u(x[0], p), u(x[2], p), u(x[3], p), ...y));
    }
    for (let g of [0, 1])
      for (let x of [0, 1]) {
        let y = (g << d) | (x << v),
          b = y | (1 << p),
          m = [0, 0, 0];
        ((m[d] = g ? 1 : -1),
          (m[v] = x ? 1 : -1),
          h(u(y, d), u(b, d), u(b, v), ...m),
          h(u(y, d), u(b, v), u(y, v), ...m));
      }
  }
  for (let p = 0; p < 8; p++)
    h(u(p, 0), u(p, 1), u(p, 2), p & 1 ? 1 : -1, p & 2 ? 1 : -1, p & 4 ? 1 : -1);
  let f = Mf(r, a, l, c);
  return (s === 'bottom' && f.translate(0, e / 2, 0), f);
}
function eo(i, e, t, n = 0.03, s = 3, o = 3, r = 3, a = 'center') {
  let l = new BoxGeometry(i, e, t, s, o, r),
    c = l.attributes.position,
    u = l.attributes.normal,
    h = l.attributes.uv,
    f = i / 2,
    p = e / 2,
    d = t / 2;
  n = Math.min(n, f * 0.95, p * 0.95, d * 0.95);
  let v = (x, y, b) => {
      if (Math.abs(x) > y - 1e-6 || b < 3) return x;
      let m = (2 * y) / b;
      return (x * (y - n)) / (y - m);
    },
    g = new Vector3();
  for (let x = 0; x < c.count; x++) {
    let y = v(c.getX(x), f, s),
      b = v(c.getY(x), p, o),
      m = v(c.getZ(x), d, r),
      A = zi(y, -(f - n), f - n),
      _ = zi(b, -(p - n), p - n),
      M = zi(m, -(d - n), d - n);
    (g.set(y - A, b - _, m - M),
      (Math.abs(y) > f - 1e-5 ? 1 : 0) +
        (Math.abs(b) > p - 1e-5 ? 1 : 0) +
        (Math.abs(m) > d - 1e-5 ? 1 : 0) >=
        2 &&
        g.lengthSq() > 1e-12 &&
        (g.normalize(),
        (y = A + g.x * n),
        (b = _ + g.y * n),
        (m = M + g.z * n),
        u.setXYZ(x, g.x, g.y, g.z)),
      c.setXYZ(x, y, b, m));
    let w = Math.abs(u.getX(x)),
      S = Math.abs(u.getY(x)),
      z = Math.abs(u.getZ(x));
    w >= S && w >= z ? h.setXY(x, m, b) : S >= w && S >= z ? h.setXY(x, y, m) : h.setXY(x, y, b);
  }
  return (a === 'bottom' && l.translate(0, e / 2, 0), l);
}
function to(i, e) {
  let t = i.attributes.position,
    n = new Vector3();
  for (let s = 0; s < t.count; s++)
    (n.fromBufferAttribute(t, s), e(n, s), t.setXYZ(s, n.x, n.y, n.z));
  return i;
}
function gr(i) {
  let e = i.attributes.position,
    t = i.index,
    n = e.count,
    s = new Map(),
    o = (f) =>
      Math.round(e.getX(f) * 2e3) +
      ',' +
      Math.round(e.getY(f) * 2e3) +
      ',' +
      Math.round(e.getZ(f) * 2e3),
    r = new Array(n);
  for (let f = 0; f < n; f++) r[f] = o(f);
  let a = new Vector3(),
    l = new Vector3(),
    c = new Vector3(),
    u = t ? t.count : n;
  for (let f = 0; f < u; f += 3) {
    let p = t ? t.getX(f) : f,
      d = t ? t.getX(f + 1) : f + 1,
      v = t ? t.getX(f + 2) : f + 2;
    (a.fromBufferAttribute(e, p),
      l.fromBufferAttribute(e, d),
      c.fromBufferAttribute(e, v),
      l.sub(a),
      c.sub(a),
      l.cross(c));
    for (let g of [p, d, v]) {
      let x = s.get(r[g]);
      (x || ((x = [0, 0, 0]), s.set(r[g], x)), (x[0] += l.x), (x[1] += l.y), (x[2] += l.z));
    }
  }
  let h = new Float32Array(n * 3);
  for (let f = 0; f < n; f++) {
    let p = s.get(r[f]) || [0, 1, 0],
      d = Math.hypot(p[0], p[1], p[2]) || 1;
    ((h[f * 3] = p[0] / d), (h[f * 3 + 1] = p[1] / d), (h[f * 3 + 2] = p[2] / d));
  }
  return (i.setAttribute('normal', new BufferAttribute(h, 3)), i);
}
function M1(i) {
  if (i.index) {
    let t = i.index.array;
    for (let n = 0; n < t.length; n += 3) {
      let s = t[n + 1];
      ((t[n + 1] = t[n + 2]), (t[n + 2] = s));
    }
  } else
    for (let t of Object.keys(i.attributes)) {
      let n = i.attributes[t],
        s = n.itemSize,
        o = n.array;
      for (let r = 0; r < n.count; r += 3)
        for (let a = 0; a < s; a++) {
          let l = o[(r + 1) * s + a];
          ((o[(r + 1) * s + a] = o[(r + 2) * s + a]), (o[(r + 2) * s + a] = l));
        }
    }
  let e = i.attributes.normal.array;
  for (let t = 0; t < e.length; t++) e[t] = -e[t];
  return i;
}
function ev(i, e) {
  let t = i.groups[e];
  if (!t) return i;
  let n = Array.from(i.index.array);
  (n.splice(t.start, t.count), i.setIndex(n));
  for (let s of i.groups) s.start > t.start && (s.start -= t.count);
  return ((t.count = 0), i);
}
var O3 = new Quaternion(),
  FA = new Vector3(0, 1, 0),
  _1 = new Vector3(),
  H3 = new Matrix4();
function vn(i, e, t = 0.02, n = 6, s = !1, o = t) {
  _1.set(e[0] - i[0], e[1] - i[1], e[2] - i[2]);
  let r = _1.length();
  _1.normalize();
  let a = cylinderGeometry(o, t, r, n, !s);
  return (
    O3.setFromUnitVectors(FA, _1),
    H3.compose(
      new Vector3((i[0] + e[0]) / 2, (i[1] + e[1]) / 2, (i[2] + e[2]) / 2),
      O3,
      new Vector3(1, 1, 1),
    ),
    a.applyMatrix4(H3),
    a
  );
}
function Mo(i, e, { soft: t = 0.6, caps: n = !0 } = {}) {
  let s = i.length,
    o = [],
    r = [],
    a = [],
    l = [],
    c = e / 2,
    u = [],
    h = 0,
    f = [0];
  for (let d = 0; d < s; d++) {
    let v = i[d],
      g = i[(d + 1) % s],
      x = g[0] - v[0],
      y = g[1] - v[1],
      b = Math.hypot(x, y) || 1;
    (u.push([y / b, -x / b]), (h += b), f.push(h));
  }
  let p = (d, v) => {
    let g = u[d],
      x = u[(v + s) % s];
    if (g[0] * x[0] + g[1] * x[1] > Math.cos(t)) {
      let y = g[0] + x[0],
        b = g[1] + x[1],
        m = Math.hypot(y, b) || 1;
      return [y / m, b / m];
    }
    return g;
  };
  for (let d = 0; d < s; d++) {
    let v = i[d],
      g = i[(d + 1) % s],
      x = p(d, d - 1),
      y = p(d, d + 1),
      b = o.length / 3;
    (o.push(v[0], v[1], c, v[0], v[1], -c, g[0], g[1], -c, g[0], g[1], c),
      r.push(x[0], x[1], 0, x[0], x[1], 0, y[0], y[1], 0, y[0], y[1], 0),
      a.push(f[d], c, f[d], -c, f[d + 1], -c, f[d + 1], c),
      l.push(b, b + 1, b + 2, b, b + 2, b + 3));
  }
  if (n) {
    let d = ShapeUtils.triangulateShape(
      i.map((v) => new Vector2(v[0], v[1])),
      [],
    );
    for (let v of [1, -1]) {
      let g = o.length / 3;
      for (let x of i) (o.push(x[0], x[1], v * c), r.push(0, 0, v), a.push(x[0], x[1]));
      for (let x of d)
        v > 0 ? l.push(g + x[0], g + x[1], g + x[2]) : l.push(g + x[0], g + x[2], g + x[1]);
    }
  }
  return Mf(o, r, a, l);
}
function vr(i, e, t = !0) {
  let n = i.length,
    s = [],
    o = [],
    r = [],
    a = 0,
    l = Math.hypot(e[0], e[1], e[2]) * 2;
  for (let p = 0; p < n; p++)
    (p && (a += Math.hypot(i[p][0] - i[p - 1][0], i[p][1] - i[p - 1][1], i[p][2] - i[p - 1][2])),
      s.push(
        i[p][0] - e[0],
        i[p][1] - e[1],
        i[p][2] - e[2],
        i[p][0] + e[0],
        i[p][1] + e[1],
        i[p][2] + e[2],
      ),
      o.push(a, 0, a, l));
  for (let p = 0; p < n - 1; p++) {
    let d = p * 2;
    r.push(d, d + 1, d + 3, d, d + 3, d + 2);
  }
  let c = Mf(s, null, o, r);
  if (!t) return c;
  let u = c.clone(),
    h = u.index.array;
  for (let p = 0; p < h.length; p += 3) {
    let d = h[p + 1];
    ((h[p + 1] = h[p + 2]), (h[p + 2] = d));
  }
  let f = u.attributes.normal.array;
  for (let p = 0; p < f.length; p++) f[p] = -f[p];
  return mergeColoredGeometries([c, u]);
}
function _f(i, e) {
  return new PlaneGeometry(i, e);
}
function UA(i, e, t, n = 4) {
  let s = [],
    o = [],
    r = [],
    a = [];
  for (let l = 0; l <= n; l++) {
    let c = ((l / n - 0.5) * e) / i,
      u = Math.sin(c),
      h = Math.cos(c);
    (s.push(i * u, -t / 2, i * h, i * u, t / 2, i * h),
      o.push(u, 0, h, u, 0, h),
      r.push(l / n, 0, l / n, 1));
  }
  for (let l = 0; l < n; l++) {
    let c = l * 2;
    a.push(c, c + 2, c + 3, c, c + 3, c + 1);
  }
  return Mf(s, o, r, a);
}
function ja(i, e, t = 6, n = 12, s = At * 2) {
  let o = new TorusGeometry(i, e, t, n, s),
    r = o.attributes.uv;
  for (let a = 0; a < r.count; a++) r.setXY(a, r.getX(a) * s * i, r.getY(a) * 2 * At * e);
  return o;
}
function Y3(i, e = 8, t = 6) {
  let n = new SphereGeometry(i, e, t),
    s = n.attributes.uv;
  for (let o = 0; o < s.count; o++) s.setXY(o, s.getX(o) * 2 * At * i, s.getY(o) * At * i);
  return n;
}
function NA(i, e) {
  let t = i.attributes.position.count,
    n = i.attributes.color;
  if (
    (n ||
      ((n = new BufferAttribute(new Float32Array(t * 3).fill(1), 3)), i.setAttribute('color', n)),
    e === 1 || e == null)
  )
    return i;
  let s = n.array;
  if (typeof e == 'function') {
    let l = i.attributes.position;
    for (let c = 0; c < t; c++) {
      let u = e(l.getX(c), l.getY(c), l.getZ(c));
      typeof u == 'number'
        ? ((s[c * 3] *= u), (s[c * 3 + 1] *= u), (s[c * 3 + 2] *= u))
        : ((s[c * 3] *= u[0]), (s[c * 3 + 1] *= u[1]), (s[c * 3 + 2] *= u[2]));
    }
    return i;
  }
  let o = typeof e == 'number' ? e : e[0],
    r = typeof e == 'number' ? e : e[1],
    a = typeof e == 'number' ? e : e[2];
  for (let l = 0; l < t; l++) ((s[l * 3] *= o), (s[l * 3 + 1] *= r), (s[l * 3 + 2] *= a));
  return i;
}
var V3 = {
  red: ['paint_red', 1],
  blue: ['paint_blue', 1],
  green: ['paint_green', 1],
  yellow: ['paint_yellow', 1],
  orange: ['paint_orange', 1],
  white: ['paint_white', 1],
  grey: ['paint_grey', 1],
  teal: ['paint_teal', 1],
  rust: ['steel_rust', 1],
  black: ['paint_grey', [0.2, 0.2, 0.22]],
  olive: ['paint_green', [0.75, 0.8, 0.45]],
};
function Ja(i, e = 'blue') {
  return V3[i] || V3[e];
}
var pI = new Matrix4(),
  W3 = new Quaternion(),
  G3 = new Euler(),
  q3 = new Vector3(),
  Qg = new Vector3();
function BA({ p: i = [0, 0, 0], r: e = [0, 0, 0], s: t = 1 } = {}) {
  return (
    G3.set(e[0], e[1], e[2]),
    W3.setFromEuler(G3),
    q3.set(i[0], i[1], i[2]),
    typeof t == 'number' ? Qg.set(t, t, t) : Qg.set(t[0], t[1], t[2]),
    new Matrix4().compose(q3, W3, Qg)
  );
}
var Kn = class {
    constructor(e, t, n = 1) {
      ((this.G = e),
        (this.name = t),
        (this.seed = Math.abs(n | 0)),
        (this.rng = createRandom((this.seed + 1) * 7919 + t.length * 131)),
        (this.b = new Map()),
        (this.stack = [new Matrix4()]));
    }
    push(e) {
      return (this.stack.push(this.stack[this.stack.length - 1].clone().multiply(BA(e))), this);
    }
    pop() {
      return (this.stack.pop(), this);
    }
    mat(e, t) {
      return this.G.mats.get(e, {
        vertexColors: !0,
        ...(t || {}),
      });
    }
    add(e, t, n, s = 1, { raw: o = !1, cast: r = !0 } = {}) {
      let a = typeof e == 'string' ? this.mat(e) : e;
      (n && transformGeometry(t, n),
        t.applyMatrix4(this.stack[this.stack.length - 1]),
        o || NA(t, s));
      let l = a.uuid + (r ? 'c' : 'n'),
        c = this.b.get(l);
      return (
        c ||
          ((c = {
            mat: a,
            geos: [],
            raw: o,
            cast: r,
          }),
          this.b.set(l, c)),
        c.geos.push(t),
        this
      );
    }
    decal(e, t, n, s) {
      return this.add(e.material, _f(t, s || t / (e.aspect || 1)), n, 1, {
        raw: !0,
        cast: !1,
      });
    }
    label(e, t, n, s, o) {
      let r = this.G.mats.label(e, t),
        a = Math.min(n, s * (r.aspect || 1));
      return this.add(r.material, _f(a, a / (r.aspect || 1)), o, 1, {
        raw: !0,
        cast: !1,
      });
    }
    cdecal(e, t, n, s, o) {
      return this.add(e.material, UA(t, n, o || n / (e.aspect || 1)), s, 1, {
        raw: !0,
        cast: !1,
      });
    }
    finish({ size: e, colliders: t, grime: n = 1, surface: s } = {}) {
      let o = new Group(),
        r = this.seed * 3.71;
      for (let c of this.b.values()) {
        let u = mergeColoredGeometries(c.geos);
        if (!c.raw && n > 0 && u.attributes.color) {
          let f = u.attributes.position,
            p = u.attributes.normal,
            d = u.attributes.color.array;
          for (let v = 0; v < f.count; v++) {
            let g = f.getX(v),
              x = f.getY(v),
              y = f.getZ(v),
              b = p.getY(v),
              m = gn(g * 1.9 + r, x * 1.9, y * 1.9 + 5.3),
              A = gn(g * 9 + 2.1, x * 9 + r, y * 9),
              _ = (0.82 + 0.18 * m) * (0.92 + 0.08 * A) * (0.76 + 0.24 * zi(b * 0.6 + 0.62, 0, 1)),
              M = zi(1 - x / 0.2, 0, 1);
            ((_ *= 1 - 0.42 * M * M * (0.55 + 0.45 * A)),
              (_ = 1 + (_ - 1) * n),
              (d[v * 3] *= _),
              (d[v * 3 + 1] *= _ * (1 - 0.05 * M * n)),
              (d[v * 3 + 2] *= _ * (1 - 0.12 * M * n)));
          }
        }
        let h = new Mesh(u, c.mat);
        ((h.castShadow = c.cast), (h.receiveShadow = !0), o.add(h));
      }
      let a = PROP_SIZES[this.name] || [1, 1, 1, '', 'metal'],
        l = e || [a[0], a[1], a[2]];
      return (
        (o.userData.size = l),
        (o.userData.colliders = t || [
          {
            min: [-l[0] / 2, 0, -l[2] / 2],
            max: [l[0] / 2, l[1], l[2] / 2],
            surface: s || a[4],
          },
        ]),
        o
      );
    }
  },
  X3 = new Map();
function wf(i, e) {
  let t = X3.get(i);
  return (t || ((t = e()), X3.set(i, t)), t.clone(!0));
}
var j3 = (i, e, t) => {
  let n = zi((t - i) / (e - i), 0, 1);
  return n * n * (3 - 2 * n);
};
export { At, Ge, Ja, Kn, M1, Mo, Y3, _f, eo, ev, gn, gr, j3, ja, to, tt, us, vn, vr, wf, zi };
