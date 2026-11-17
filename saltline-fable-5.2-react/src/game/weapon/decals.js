/**
 * 枪械文字与铭牌：Canvas 绘制纹理，再按指定位置贴到模型表面。
 * 字体就绪时机、UV 和文字内容均会影响固定帧画面对照。
 */
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
var hm = {
    model: [8, 8, 330, 84],
    maker: [8, 100, 560, 40],
    cal: [8, 146, 560, 40],
    prop: [8, 192, 700, 40],
    safe: [8, 240, 90, 34],
    semi: [110, 240, 90, 34],
    auto: [212, 240, 90, 34],
    rack: [8, 290, 300, 110],
    warn: [330, 290, 420, 110],
    optic: [580, 8, 300, 60],
    light: [580, 76, 300, 60],
    dots: [320, 240, 60, 34],
    r2: [8, 420, 56, 40],
    r4: [72, 420, 56, 40],
    r6: [136, 420, 56, 40],
    r8: [200, 420, 56, 40],
    r10: [264, 420, 56, 40],
    r12: [328, 420, 56, 40],
  },
  Uf = 1024,
  Nf = 512;
function createDecalTexture() {
  let i = document.createElement('canvas');
  ((i.width = Uf), (i.height = Nf));
  let e = i.getContext('2d');
  (e.clearRect(0, 0, Uf, Nf), (e.textBaseline = 'middle'));
  let t = (u, h, f, p, d = 'left') => {
      let [v, g, x, y] = hm[u];
      ((e.font = f),
        (e.fillStyle = p),
        (e.textAlign = d),
        e.fillText(h, d === 'left' ? v + 2 : v + x / 2, g + y / 2 + 1, x - 4));
    },
    n = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif',
    s = '"IBM Plex Mono", "Courier New", monospace',
    o = '"Big Shoulders Display", "Barlow Condensed", Impact, sans-serif',
    r = 'rgba(196,198,194,0.92)';
  (t('model', 'PAC-9', `700 78px ${o}`, r),
    t('maker', 'LONGSHORE ARMS WORKS  \xB7  SALTLINE', `600 30px ${n}`, r),
    t('cal', 'CAL 5.8\xD740   SN PA-004217', `500 27px ${s}`, r),
    t('prop', 'PROPERTY OF PORT AUTHORITY \u2014 BERTH 4 ARMOURY', `600 28px ${n}`, r),
    t('safe', 'S', `700 30px ${n}`, r, 'center'),
    t('semi', '1', `700 30px ${n}`, r, 'center'),
    t('auto', 'A', `700 30px ${n}`, 'rgba(205,60,40,0.95)', 'center'),
    t('rack', 'B4-07', `800 104px ${o}`, 'rgba(214,206,170,0.9)', 'center'));
  for (let u of [2, 4, 6, 8, 10, 12])
    t('r' + u, 'T' + u, `600 30px ${s}`, 'rgba(190,192,188,0.85)', 'center');
  (t('optic', 'HX-2 REFLEX', `700 44px ${n}`, r, 'center'),
    t('light', '900 LM  IPX8', `600 40px ${n}`, r, 'center'));
  {
    let [u, h] = hm.warn;
    ((e.fillStyle = r),
      (e.textAlign = 'left'),
      (e.font = `600 24px ${n}`),
      [
        'WARNING \u2014 CLEAR CHAMBER BEFORE',
        'STOWAGE. AUTHORISED BREACH',
        'PERSONNEL ONLY. PA-REG 44/7',
      ].forEach((f, p) => e.fillText(f, u + 2, h + 20 + p * 34)));
  }
  {
    let [u, h, f, p] = hm.dots;
    ((e.fillStyle = r),
      e.beginPath(),
      e.arc(u + 12, h + p / 2, 7, 0, 7),
      e.fill(),
      (e.fillStyle = 'rgba(205,60,40,0.95)'),
      e.beginPath(),
      e.arc(u + 40, h + p / 2, 7, 0, 7),
      e.fill());
  }
  e.globalCompositeOperation = 'destination-out';
  let a = 7,
    l = () => ((a = (a * 16807) % 2147483647), a / 2147483647);
  for (let u = 0; u < 2600; u++) {
    e.fillStyle = `rgba(0,0,0,${0.25 + l() * 0.6})`;
    let h = l() < 0.9 ? 1 + l() * 1.5 : 2 + l() * 5;
    e.fillRect(l() * Uf, l() * Nf, h, h * (0.4 + l()));
  }
  let c = new CanvasTexture(i);
  return (
    (c.colorSpace = SRGBColorSpace),
    (c.anisotropy = 8),
    (c.generateMipmaps = !0),
    (c.minFilter = LinearMipmapLinearFilter),
    c
  );
}
function createRifleDecals(i) {
  let e = [],
    t = [],
    n = [],
    s = [];
  for (let [l, c, u, h, f, p, d = 0] of i) {
    let [v, g, x, y] = hm[l],
      b = (f * x) / y,
      m = v / Uf,
      A = (v + x) / Uf,
      _ = 1 - g / Nf,
      M = 1 - (g + y) / Nf,
      E = e.length / 3,
      w;
    if (
      (p === 'L'
        ? (w = [
            [c, u - f / 2, -(h + b / 2)],
            [c, u - f / 2, -(h - b / 2)],
            [c, u + f / 2, -(h - b / 2)],
            [c, u + f / 2, -(h + b / 2)],
          ])
        : p === 'R'
          ? (w = [
              [c, u - f / 2, -(h - b / 2)],
              [c, u - f / 2, -(h + b / 2)],
              [c, u + f / 2, -(h + b / 2)],
              [c, u + f / 2, -(h - b / 2)],
            ])
          : (w = [
              [c - b / 2, u, -(h - f / 2)],
              [c + b / 2, u, -(h - f / 2)],
              [c + b / 2, u, -(h + f / 2)],
              [c - b / 2, u, -(h + f / 2)],
            ]),
      d)
    ) {
      let z = Math.cos(d),
        H = Math.sin(d),
        O = u,
        q = -h;
      for (let U of w) {
        let T = U[1] - O,
          D = U[2] - q;
        ((U[1] = O + T * z - D * H), (U[2] = q + T * H + D * z));
      }
    }
    for (let z of w) e.push(z[0], z[1], z[2]);
    t.push(m, M, A, M, A, _, m, _);
    let S = p === 'L' ? [-1, 0, 0] : p === 'R' ? [1, 0, 0] : [0, 1, 0];
    for (let z = 0; z < 4; z++) n.push(S[0], S[1], S[2]);
    s.push(E, E + 1, E + 2, E, E + 2, E + 3);
  }
  let o = new BufferGeometry();
  (o.setAttribute('position', new Float32BufferAttribute(e, 3)),
    o.setAttribute('uv', new Float32BufferAttribute(t, 2)),
    o.setAttribute('normal', new Float32BufferAttribute(n, 3)),
    o.setIndex(s));
  let r = new MeshStandardMaterial({
      map: createDecalTexture(),
      transparent: !0,
      roughness: 0.62,
      metalness: 0,
      depthWrite: !1,
      polygonOffset: !0,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      side: DoubleSide,
    }),
    a = new Mesh(o, r);
  return ((a.renderOrder = 2), a);
}
export { createRifleDecals };
