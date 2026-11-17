/**
 * Saltline / core/geometry
 * 场景、道具、武器共用的几何构建工具。
 * 长度按游戏世界单位（米）使用，旋转使用弧度；UV 按尺寸展开以保持纹理密度。
 * 部分方法原地修改输入几何；需要复用原始网格时由调用方先 clone()。
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  TubeGeometry,
  Vector3,
} from 'three';
/**
 * 合并兼容的 BufferGeometry；属性布局/索引状态不兼容时记录错误并返回 null。
 * @param {Array<import('three').BufferGeometry>} i 非空几何数组。
 * @param {boolean} [e=false] 是否为每个输入建立材质分组。
 */
function mergeGeometries(i, e = !1) {
  let t = i[0].index !== null,
    n = new Set(Object.keys(i[0].attributes)),
    s = new Set(Object.keys(i[0].morphAttributes)),
    o = {},
    r = {},
    a = i[0].morphTargetsRelative,
    l = new BufferGeometry(),
    c = 0;
  for (let u = 0; u < i.length; ++u) {
    let h = i[u],
      f = 0;
    if (t !== (h.index !== null))
      return (
        console.error(
          'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' +
            u +
            '. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.',
        ),
        null
      );
    for (let p in h.attributes) {
      if (!n.has(p))
        return (
          console.error(
            'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' +
              u +
              '. All geometries must have compatible attributes; make sure "' +
              p +
              '" attribute exists among all geometries, or in none of them.',
          ),
          null
        );
      (o[p] === void 0 && (o[p] = []), o[p].push(h.attributes[p]), f++);
    }
    if (f !== n.size)
      return (
        console.error(
          'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' +
            u +
            '. Make sure all geometries have the same number of attributes.',
        ),
        null
      );
    if (a !== h.morphTargetsRelative)
      return (
        console.error(
          'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' +
            u +
            '. .morphTargetsRelative must be consistent throughout all geometries.',
        ),
        null
      );
    for (let p in h.morphAttributes) {
      if (!s.has(p))
        return (
          console.error(
            'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' +
              u +
              '.  .morphAttributes must be consistent throughout all geometries.',
          ),
          null
        );
      (r[p] === void 0 && (r[p] = []), r[p].push(h.morphAttributes[p]));
    }
    if (e) {
      let p;
      if (t) p = h.index.count;
      else if (h.attributes.position !== void 0) p = h.attributes.position.count;
      else
        return (
          console.error(
            'THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index ' +
              u +
              '. The geometry must have either an index or a position attribute',
          ),
          null
        );
      (l.addGroup(c, p, u), (c += p));
    }
  }
  if (t) {
    let u = 0,
      h = [];
    for (let f = 0; f < i.length; ++f) {
      let p = i[f].index;
      for (let d = 0; d < p.count; ++d) h.push(p.getX(d) + u);
      u += i[f].attributes.position.count;
    }
    l.setIndex(h);
  }
  for (let u in o) {
    let h = mergeAttributes(o[u]);
    if (!h)
      return (
        console.error(
          'THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the ' +
            u +
            ' attribute.',
        ),
        null
      );
    l.setAttribute(u, h);
  }
  for (let u in r) {
    let h = r[u][0].length;
    if (h === 0) break;
    ((l.morphAttributes = l.morphAttributes || {}), (l.morphAttributes[u] = []));
    for (let f = 0; f < h; ++f) {
      let p = [];
      for (let v = 0; v < r[u].length; ++v) p.push(r[u][v][f]);
      let d = mergeAttributes(p);
      if (!d)
        return (
          console.error(
            'THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the ' +
              u +
              ' morphAttribute.',
          ),
          null
        );
      l.morphAttributes[u].push(d);
    }
  }
  return l;
}
/** 合并同类型、同 itemSize/normalized 的顶点属性；不兼容时返回 null。 */
function mergeAttributes(i) {
  let e,
    t,
    n,
    s = -1,
    o = 0;
  for (let c = 0; c < i.length; ++c) {
    let u = i[c];
    if ((e === void 0 && (e = u.array.constructor), e !== u.array.constructor))
      return (
        console.error(
          'THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.',
        ),
        null
      );
    if ((t === void 0 && (t = u.itemSize), t !== u.itemSize))
      return (
        console.error(
          'THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.',
        ),
        null
      );
    if ((n === void 0 && (n = u.normalized), n !== u.normalized))
      return (
        console.error(
          'THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.',
        ),
        null
      );
    if ((s === -1 && (s = u.gpuType), s !== u.gpuType))
      return (
        console.error(
          'THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.',
        ),
        null
      );
    o += u.count * t;
  }
  let r = new e(o),
    a = new BufferAttribute(r, t, n),
    l = 0;
  for (let c = 0; c < i.length; ++c) {
    let u = i[c];
    if (u.isInterleavedBufferAttribute) {
      let h = l / t;
      for (let f = 0, p = u.count; f < p; f++)
        for (let d = 0; d < t; d++) {
          let v = u.getComponent(f, d);
          a.setComponent(f + h, d, v);
        }
    } else r.set(u.array, l);
    l += u.count * t;
  }
  return (s !== void 0 && (a.gpuType = s), a);
}
var oa = new Vector3();
/** 参数依次为宽、高、深、原点位置；bottom 将底面放到 y=0，UV 按世界尺寸铺设。 */
function boxGeometry(i, e, t, n = 'center') {
  let s = new BoxGeometry(i, e, t),
    o = s.attributes.uv,
    r = s.attributes.position,
    a = s.attributes.normal;
  for (let l = 0; l < o.count; l++) {
    let c = Math.abs(a.getX(l)),
      u = Math.abs(a.getY(l)),
      h = r.getX(l),
      f = r.getY(l),
      p = r.getZ(l);
    c > 0.5 ? o.setXY(l, p, f) : u > 0.5 ? o.setXY(l, h, p) : o.setXY(l, h, f);
  }
  return (n === 'bottom' && s.translate(0, e / 2, 0), s);
}
/** 宽/高/深之后为倒角半径与原点位置；半径限制到半尺寸内以避免几何翻折。 */
function beveledBoxGeometry(i, e, t, n = 0.02, s = 'center') {
  n = Math.min(n, i / 2 - 1e-4, e / 2 - 1e-4, t / 2 - 1e-4);
  let o = new BoxGeometry(i, e, t, 3, 3, 3),
    r = o.attributes.position,
    a = o.attributes.normal,
    l = o.attributes.uv,
    c = i / 2,
    u = e / 2,
    h = t / 2,
    f = (p, d) => {
      let v = Math.abs(p),
        g = Math.sign(p);
      return v > d - 1e-5 ? g * d : g * (d - n);
    };
  for (let p = 0; p < r.count; p++) {
    let d = f(r.getX(p), c),
      v = f(r.getY(p), u),
      g = f(r.getZ(p), h),
      x = Math.max(-(c - n), Math.min(c - n, d)),
      y = Math.max(-(u - n), Math.min(u - n, v)),
      b = Math.max(-(h - n), Math.min(h - n, g));
    if ((oa.set(d - x, v - y, g - b), oa.lengthSq() > 1e-10)) {
      oa.normalize();
      let M = a.getX(p),
        E = a.getY(p),
        w = a.getZ(p);
      (Math.abs(d) > c - 1e-5 ? 1 : 0) +
        (Math.abs(v) > u - 1e-5 ? 1 : 0) +
        (Math.abs(g) > h - 1e-5 ? 1 : 0) >=
      2
        ? ((d = x + oa.x * n),
          (v = y + oa.y * n),
          (g = b + oa.z * n),
          a.setXYZ(p, oa.x, oa.y, oa.z))
        : a.setXYZ(p, M, E, w);
    }
    r.setXYZ(p, d, v, g);
    let m = Math.abs(a.getX(p)),
      A = Math.abs(a.getY(p)),
      _ = Math.abs(a.getZ(p));
    m >= A && m >= _ ? l.setXY(p, g, v) : A >= m && A >= _ ? l.setXY(p, d, g) : l.setXY(p, d, v);
  }
  return (s === 'bottom' && o.translate(0, e / 2, 0), o);
}
/** 参数依次为顶半径、底半径、高度、周向段数、是否开口、原点位置。 */
function cylinderGeometry(i, e, t, n = 16, s = !1, o = 'center') {
  let r = new CylinderGeometry(i, e, t, n, 1, s),
    a = r.attributes.uv,
    l = r.attributes.position,
    c = r.attributes.normal,
    u = Math.PI * (i + e);
  for (let h = 0; h < a.count; h++)
    Math.abs(c.getY(h)) > 0.9
      ? a.setXY(h, l.getX(h), l.getZ(h))
      : a.setXY(h, a.getX(h) * u, l.getY(h));
  return (o === 'bottom' && r.translate(0, t / 2, 0), r);
}
/** 沿路径生成管线：点列、半径、截面段数、闭合、曲线张力；纵向分段随路径长度增长。 */
function tubeGeometry(i, e = 0.03, t = 8, n = !1, s = 0) {
  let o = i.map((h) => (h.isVector3 ? h : new Vector3(h[0], h[1], h[2]))),
    r = new CatmullRomCurve3(o, n, 'catmullrom', s),
    a = r.getLength(),
    l = Math.max(2, Math.ceil(a / Math.max(0.08, e * 3))),
    c = new TubeGeometry(r, Math.min(l, 400), e, t, n),
    u = c.attributes.uv;
  for (let h = 0; h < u.count; h++) u.setXY(h, u.getX(h) * a, u.getY(h) * Math.PI * 2 * e);
  return c;
}
var ky = new Matrix4(),
  Fy = new Quaternion(),
  Uy = new Euler(),
  Ny = new Vector3(),
  Fg = new Vector3();
/** 原地应用变换并返回同一几何；p 为位置，r 为 XYZ 欧拉角（弧度），s 为标量或三轴缩放。 */
function transformGeometry(i, { p: e = [0, 0, 0], r: t = [0, 0, 0], s: n = 1 } = {}) {
  return (
    Uy.set(t[0], t[1], t[2]),
    Fy.setFromEuler(Uy),
    Ny.set(e[0], e[1], e[2]),
    typeof n == 'number' ? Fg.set(n, n, n) : Fg.set(n[0], n[1], n[2]),
    ky.compose(Ny, Fy, Fg),
    i.applyMatrix4(ky),
    i
  );
}
/** 原地写入 RGB 顶点色；e 可为 RGB 数组或接收局部坐标 (x,y,z) 的着色函数。 */
function colorGeometry(i, e) {
  let t = i.attributes.position,
    n = t.count,
    s = new Float32Array(n * 3);
  for (let o = 0; o < n; o++) {
    let r = typeof e == 'function' ? e(t.getX(o), t.getY(o), t.getZ(o)) : e;
    ((s[o * 3] = r[0]), (s[o * 3 + 1] = r[1]), (s[o * 3 + 2] = r[2]));
  }
  return (i.setAttribute('color', new BufferAttribute(s, 3)), i);
}
/**
 * 对输入补齐 UV/法线/缺失顶点色、移除非通用属性，再统一索引状态后合并。
 * 会修改传入几何的属性集合；保留蒙皮等额外属性的模型不要使用这条路径。
 */
function mergeColoredGeometries(i) {
  let e = i
    .filter(Boolean)
    .map(
      (l) => (
        l.attributes.uv ||
          l.setAttribute(
            'uv',
            new BufferAttribute(new Float32Array(l.attributes.position.count * 2), 2),
          ),
        l.attributes.normal || l.computeVertexNormals(),
        l
      ),
    );
  if (!e.length) return new BufferGeometry();
  let t = e.some((l) => l.attributes.color),
    n = e.map((l) => {
      let c = (l.index, l);
      if (t && !c.attributes.color) {
        let u = new Float32Array(c.attributes.position.count * 3).fill(1);
        c.setAttribute('color', new BufferAttribute(u, 3));
      }
      for (let u of Object.keys(c.attributes))
        ['position', 'normal', 'uv', 'color'].includes(u) || c.deleteAttribute(u);
      return c;
    }),
    s = n.every((l) => l.index),
    o = n.every((l) => !l.index),
    r = s || o ? n : n.map((l) => (l.index ? l.toNonIndexed() : l));
  return mergeGeometries(r, !1) || new BufferGeometry();
}
/**
 * 按材质、阴影开关和图层合批静态网格；顶点先烘焙到世界坐标。
 * noMerge/蒙皮/实例化/多材质节点保留独立网格并重挂到返回的 Group，原树会受影响。
 * @param {import('three').Object3D} i 待整理的场景子树。
 */
function mergeStaticMeshes(i, { castShadow: e = !0, receiveShadow: t = !0 } = {}) {
  i.updateMatrixWorld(!0);
  let n = new Map(),
    s = [];
  i.traverse((r) => {
    if (!r.isMesh) return;
    let a = r,
      l = !1;
    for (; a;) {
      if (a.userData && a.userData.noMerge) {
        l = !0;
        break;
      }
      a = a.parent;
    }
    if (l || r.isSkinnedMesh || r.isInstancedMesh || Array.isArray(r.material)) {
      s.push(r);
      return;
    }
    let c =
      r.material.uuid +
      (r.castShadow ? 'c' : 'n') +
      (r.receiveShadow ? 'r' : 'n') +
      ':' +
      r.layers.mask;
    n.has(c) ||
      n.set(c, {
        mat: r.material,
        geos: [],
        cast: r.castShadow,
        recv: r.receiveShadow,
        layers: r.layers.mask,
      });
    let u = r.geometry.clone();
    (u.applyMatrix4(r.matrixWorld), n.get(c).geos.push(u));
  });
  let o = new Group();
  for (let r of n.values()) {
    let a = new Mesh(mergeColoredGeometries(r.geos), r.mat);
    ((a.castShadow = r.cast && e),
      (a.receiveShadow = r.recv && t),
      (a.layers.mask = r.layers),
      o.add(a));
  }
  for (let r of s) {
    r.updateMatrixWorld(!0);
    let a = r.matrixWorld.clone();
    (o.add(r), r.matrix.copy(a), r.matrix.decompose(r.position, r.quaternion, r.scale));
  }
  return o;
}
/** 创建 Mesh 并统一阴影选项；使用传入的几何和材质实例，不复制或接管它们。 */
function createMesh(i, e, { cast: t = !0, recv: n = !0 } = {}) {
  let s = new Mesh(i, e);
  return ((s.castShadow = t), (s.receiveShadow = n), s);
}
export {
  beveledBoxGeometry,
  boxGeometry,
  colorGeometry,
  createMesh,
  cylinderGeometry,
  mergeColoredGeometries,
  mergeGeometries,
  mergeStaticMeshes,
  transformGeometry,
  tubeGeometry,
};
