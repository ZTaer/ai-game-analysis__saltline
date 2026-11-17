import { WORLD } from './types';
import { getViewport, clientToCanvas, screenToWorld } from './viewport';
import type { BirdKind, Entity } from './types';
import { GameWorld, launchVelocity } from './physics';
type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
function oval(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  stroke?: string,
  width = 2,
) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  }
}
function path(c: Ctx, points: number[][], fill: string, stroke?: string, width = 2) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.lineWidth = width;
    c.strokeStyle = stroke;
    c.stroke();
  }
}
function line(c: Ctx, points: number[][], color: string, width: number) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}
function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

export function drawBird(
  c: Ctx,
  x: number,
  y: number,
  r: number,
  kind: BirdKind,
  angle = 0,
  blink = false,
) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(r / 26, r / 26);
  const outline = '#423d31',
    fill = kind === 'red' ? '#df5548' : kind === 'yellow' ? '#f1c541' : '#424956';
  path(
    c,
    [
      [-20, 7],
      [-36, 1],
      [-30, 12],
      [-38, 15],
      [-20, 17],
    ],
    '#41413b',
  );
  if (kind === 'yellow')
    path(
      c,
      [
        [-27, 22],
        [0, -31],
        [28, 22],
      ],
      fill,
      outline,
      2.5,
    );
  else oval(c, 0, 0, 27, 26, fill, outline, 2.5);
  if (kind === 'bomb') {
    line(
      c,
      [
        [0, -24],
        [3, -35],
        [8, -37],
      ],
      '#403a30',
      5,
    );
    oval(c, 8, -37, 4, 4, '#f0b94b');
  } else
    path(
      c,
      [
        [-10, -22],
        [-14, -35],
        [-2, -29],
        [2, -36],
        [10, -23],
      ],
      fill,
      outline,
      2,
    );
  oval(c, -4, 15, 17, 10, kind === 'bomb' ? '#84909a' : '#f5dfb5');
  oval(c, -16, -2, 5, 8, kind === 'red' ? '#bd443e' : kind === 'yellow' ? '#d6a527' : '#303943');
  if (blink)
    line(
      c,
      [
        [-3, -3],
        [18, -3],
      ],
      outline,
      3,
    );
  else {
    oval(c, 0, -4, 8, 10, '#fff9e8', outline, 1.5);
    oval(c, 15, -5, 7, 9, '#fff9e8', outline, 1.5);
    oval(c, 3, -3, 2.5, 4, outline);
    oval(c, 18, -4, 2.5, 4, outline);
  }
  path(
    c,
    [
      [7, 2],
      [29, 9],
      [7, 14],
    ],
    '#efb343',
    outline,
    1.8,
  );
  line(
    c,
    [
      [-9, -16],
      [6, -11],
    ],
    outline,
    5,
  );
  line(
    c,
    [
      [13, -11],
      [24, -16],
    ],
    outline,
    5,
  );
  c.restore();
}
function drawPig(c: Ctx, e: Entity, t: number) {
  const r = e.w / 2;
  c.save();
  c.translate(e.body.position.x, e.body.position.y);
  c.rotate(e.body.angle);
  c.scale(r / 24, r / 24);
  oval(c, -14, -20, 7, 10, '#91b85d', '#466543');
  oval(c, 12, -21, 7, 10, '#91b85d', '#466543');
  oval(c, -14, -21, 3, 5, '#657f44');
  oval(c, 12, -22, 3, 5, '#657f44');
  oval(c, 0, 0, 25, 24, e.hit > 0.2 ? '#d4e88b' : '#99c65f', '#466543', 2.5);
  oval(c, -12, -4, 5, 9, '#abd779');
  const blink = Math.sin(t * 1.6 + e.body.id) > 0.997;
  if (blink) {
    line(
      c,
      [
        [-16, -8],
        [-6, -8],
      ],
      '#354d32',
      2,
    );
    line(
      c,
      [
        [6, -8],
        [16, -8],
      ],
      '#354d32',
      2,
    );
  } else {
    oval(c, -10, -7, 6, 7, '#fffbe9');
    oval(c, 11, -7, 6, 7, '#fffbe9');
    oval(c, -9, -6, 2, 3, '#36472e');
    oval(c, 10, -6, 2, 3, '#36472e');
  }
  oval(c, 2, 7, 14, 10, '#b9d77c', '#668842', 1.5);
  oval(c, -3, 7, 3, 4, '#638240');
  oval(c, 7, 7, 3, 4, '#638240');
  if (e.helmet) {
    c.beginPath();
    c.arc(0, -6, 26, Math.PI, TAU);
    c.fillStyle = '#697e80';
    c.fill();
    line(
      c,
      [
        [-27, -6],
        [27, -6],
      ],
      '#415958',
      4,
    );
    line(
      c,
      [
        [-4, -29],
        [-4, -9],
      ],
      '#9eafaa',
      4,
    );
  }
  if (e.hp / e.maxHp < 0.6) {
    line(
      c,
      [
        [-18, 2],
        [-11, 6],
      ],
      '#657a41',
      2,
    );
    oval(c, 16, 3, 4, 2, '#769a51');
  }
  c.restore();
}
function drawBlock(c: Ctx, e: Entity) {
  const { x, y } = e.body.position,
    w = e.w,
    h = e.h,
    wood = e.material === 'wood',
    glass = e.material === 'glass';
  c.save();
  c.translate(x, y);
  c.rotate(e.body.angle);
  const grad = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  grad.addColorStop(0, wood ? '#e2b06a' : glass ? '#caeef0' : '#b4beba');
  grad.addColorStop(1, wood ? '#bc7d43' : glass ? '#88c8d3' : '#84938e');
  c.fillStyle = grad;
  c.strokeStyle = wood ? '#885c37' : glass ? '#62a1ac' : '#5e736d';
  c.lineWidth = 2.5;
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, 2);
  c.fill();
  c.stroke();
  c.strokeStyle = wood ? '#f5d397' : glass ? '#e9ffff' : '#d1d8cc';
  c.lineWidth = 2;
  c.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
  if (wood) {
    const vertical = h > w;
    c.save();
    if (vertical) c.rotate(Math.PI / 2);
    const a = vertical ? h : w,
      b = vertical ? w : h;
    line(
      c,
      [
        [-a / 2 + 8, -b / 2 + 8],
        [-a * 0.1, -b / 2 + 7],
        [a / 2 - 10, -b / 2 + 9],
      ],
      '#b9854c',
      1,
    );
    line(
      c,
      [
        [-a / 2 + 15, b / 2 - 7],
        [a * 0.1, b / 2 - 8],
        [a / 2 - 7, b / 2 - 6],
      ],
      '#b9854c',
      1,
    );
    oval(c, a * 0.15, 0, 7, 2, '#c89150', '#ad793f', 1);
    for (const xx of [-a / 2 + 8, a / 2 - 8]) oval(c, xx, 0, 2, 2, '#876344');
    c.restore();
  } else if (glass) {
    c.save();
    c.beginPath();
    c.rect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    c.clip();
    line(
      c,
      [
        [-w / 2, -h / 2 + 20],
        [w / 2, h / 2 - 20],
      ],
      '#efffff88',
      7,
    );
    line(
      c,
      [
        [-w / 2 + 10, -h / 2],
        [w / 2 + 10, h / 2],
      ],
      '#efffff66',
      2,
    );
    c.restore();
  } else {
    for (let i = 0; i < 4; i++)
      oval(
        c,
        Math.sin(i * 8 + e.body.id) * w * 0.3,
        Math.cos(i * 5 + e.body.id) * h * 0.3,
        2,
        1,
        '#6d827b',
      );
  }
  if (e.hp / e.maxHp < 0.65) {
    line(
      c,
      [
        [-w * 0.2, -h / 2],
        [0, -h * 0.1],
        [-w * 0.1, h * 0.08],
        [w * 0.2, h / 2],
      ],
      glass ? '#528f9c' : '#6f5b43',
      1.7,
    );
  }
  if (e.hit > 0) {
    c.fillStyle = `rgba(255,255,240,${e.hit * 0.3})`;
    c.fillRect(-w / 2, -h / 2, w, h);
  }
  c.restore();
}

export class SceneRenderer {
  private ctx: Ctx;
  private scenery: HTMLCanvasElement;
  private observer: ResizeObserver;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private dpr = 1;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(
    public canvas: HTMLCanvasElement,
    palette: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.scenery = document.createElement('canvas');
    this.scenery.width = 1600;
    this.scenery.height = 900;
    this.paintScenery(palette);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    // Layout dimensions stay landscape when the mobile stage is visually rotated.
    const width = this.canvas.clientWidth,
      height = this.canvas.clientHeight;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    const viewport = getViewport(width, height);
    this.scale = viewport.scale;
    this.offsetX = viewport.offsetX;
    this.offsetY = viewport.offsetY;
  }
  point(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const { x, y } = clientToCanvas(
      clientX,
      clientY,
      r,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
    );
    return screenToWorld(x, y, {
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    });
  }
  private paintScenery(palette: number) {
    const c = this.scenery.getContext('2d')!,
      rnd = seeded(147),
      warm = palette === 2;
    const sky = c.createLinearGradient(0, 0, 0, 740);
    sky.addColorStop(0, warm ? '#b8cdd0' : '#bedbdc');
    sky.addColorStop(0.65, warm ? '#f0dbbd' : '#e2e9d4');
    sky.addColorStop(1, '#f6eccb');
    c.fillStyle = sky;
    c.fillRect(0, 0, 1600, 900);
    const glow = c.createRadialGradient(1270, 180, 30, 1270, 180, 270);
    glow.addColorStop(0, '#fff9dd90');
    glow.addColorStop(1, '#fff9dd00');
    c.fillStyle = glow;
    c.fillRect(950, 0, 650, 500);
    oval(c, 1270, 180, 57, 57, '#fff7d8');
    const cloud = (x: number, y: number, s: number) => {
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      oval(c, 0, 0, 80, 17, '#f7f7eabb');
      oval(c, -35, -12, 30, 24, '#f7f7eabb');
      oval(c, 6, -23, 42, 33, '#f7f7eabb');
      oval(c, 48, -7, 36, 21, '#f7f7eabb');
      c.restore();
    };
    cloud(220, 190, 1);
    cloud(630, 132, 0.65);
    cloud(1050, 290, 0.6);
    cloud(1450, 100, 0.6);
    cloud(70, 350, 0.5);
    path(
      c,
      [
        [0, 532],
        [160, 368],
        [310, 520],
        [530, 322],
        [720, 520],
        [900, 403],
        [1100, 540],
        [1280, 348],
        [1500, 535],
        [1600, 480],
        [1600, 800],
        [0, 800],
      ],
      '#a6c2b8',
    );
    path(
      c,
      [
        [160, 368],
        [205, 464],
        [180, 447],
        [160, 466],
        [141, 450],
        [117, 470],
      ],
      '#d4ded0',
    );
    path(
      c,
      [
        [530, 322],
        [588, 411],
        [547, 394],
        [525, 415],
        [503, 397],
        [467, 420],
      ],
      '#d4ded0',
    );
    c.beginPath();
    c.moveTo(0, 570);
    c.bezierCurveTo(270, 390, 420, 680, 650, 540);
    c.bezierCurveTo(940, 350, 1060, 640, 1350, 485);
    c.bezierCurveTo(1460, 460, 1530, 480, 1600, 520);
    c.lineTo(1600, 850);
    c.lineTo(0, 850);
    c.fillStyle = '#90b5a0';
    c.fill();
    c.beginPath();
    c.moveTo(0, 665);
    c.bezierCurveTo(250, 470, 390, 570, 650, 655);
    c.bezierCurveTo(1000, 750, 1060, 445, 1600, 635);
    c.lineTo(1600, 850);
    c.lineTo(0, 850);
    c.fillStyle = '#779d7c';
    c.fill();
    // Tiny hillside farmhouse, fields and cypress trees establish depth.
    path(
      c,
      [
        [713, 569],
        [713, 537],
        [754, 537],
        [754, 569],
      ],
      '#e0d6b6',
    );
    path(
      c,
      [
        [705, 538],
        [733, 515],
        [763, 538],
      ],
      '#888d75',
    );
    c.fillStyle = '#758d79';
    c.fillRect(731, 550, 9, 19);
    for (let i = 0; i < 5; i++)
      line(
        c,
        [
          [1100 + i * 30, 565],
          [1250 + i * 35, 615],
        ],
        '#adc095',
        2,
      );
    for (let i = 0; i < 30; i++) {
      const x = rnd() * 1600,
        y = 595 + rnd() * 65;
      line(
        c,
        [
          [x, y],
          [x, y - 20],
        ],
        '#6c8c70',
        3,
      );
      oval(c, x, y - 28, 7, 22, '#6a9279');
    }
    c.beginPath();
    c.moveTo(0, 690);
    c.bezierCurveTo(260, 635, 540, 700, 770, 687);
    c.bezierCurveTo(1090, 672, 1300, 670, 1600, 693);
    c.lineTo(1600, 800);
    c.lineTo(0, 800);
    c.fillStyle = '#638956';
    c.fill();
    // Foreground meadow and exposed earth.
    const earth = c.createLinearGradient(0, 735, 0, 900);
    earth.addColorStop(0, '#beac7c');
    earth.addColorStop(1, '#a59470');
    c.fillStyle = earth;
    c.fillRect(0, 735, 1600, 165);
    path(
      c,
      [
        [0, 735],
        [1600, 735],
        [1600, 758],
        [1460, 752],
        [1330, 761],
        [1150, 750],
        [950, 759],
        [700, 749],
        [460, 760],
        [200, 752],
        [0, 759],
      ],
      '#54794b',
    );
    c.fillStyle = '#7b9a52';
    c.fillRect(0, 727, 1600, 13);
    line(
      c,
      [
        [0, 728],
        [1600, 728],
      ],
      '#a7bb6a',
      3,
    );
    for (let i = 0; i < 240; i++) {
      const x = rnd() * 1600,
        y = 766 + rnd() * 133;
      oval(c, x, y, 1 + rnd() * 4, 1 + rnd() * 2, rnd() > 0.5 ? '#93846266' : '#e1d1aa66');
    }
    for (let i = 0; i < 100; i++) {
      const x = rnd() * 1600,
        y = 727;
      line(
        c,
        [
          [x - 4, y],
          [x - 7, y - 8],
          [x, y - 2],
          [x + 3, y - 12],
        ],
        i % 2 ? '#5b7e44' : '#86a154',
        1.8,
      );
    }
    // Leafy framing, with hand-drawn branches and warm flowers.
    const tree = (x: number, y: number, s: number) => {
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      line(
        c,
        [
          [0, 0],
          [-9, -100],
          [20, -170],
        ],
        '#657450',
        10,
      );
      line(
        c,
        [
          [-6, -75],
          [-43, -120],
        ],
        '#657450',
        6,
      );
      oval(c, 0, -150, 48, 40, '#6f9154');
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        oval(
          c,
          Math.sin(a) * 53,
          -150 + Math.cos(a) * 43,
          35,
          25,
          ['#66864e', '#6f9154', '#7b9a58'][i % 3],
        );
      }
      c.restore();
    };
    tree(52, 728, 1.1);
    tree(1568, 728, 1.6);
    for (const x of [75, 390, 820, 1470]) {
      line(
        c,
        [
          [x, 728],
          [x + 4, 709],
        ],
        '#526d3e',
        2,
      );
      for (let j = 0; j < 5; j++)
        oval(
          c,
          x + 4 + Math.cos((j * TAU) / 5) * 4,
          708 + Math.sin((j * TAU) / 5) * 4,
          3,
          3,
          '#f2dfa2',
        );
      oval(c, x + 4, 708, 2, 2, '#ceaa54');
    }
    // Foreground pebbles and little clover patches.
    for (let i = 0; i < 12; i++) {
      const x = rnd() * 1600,
        y = 790 + rnd() * 70;
      oval(c, x, y, 12 + rnd() * 18, 4 + rnd() * 5, '#8b906d');
      line(
        c,
        [
          [x - 7, y - 2],
          [x + 4, y - 4],
        ],
        '#b1af85',
        2,
      );
    }
    for (let i = 0; i < 8; i++) {
      const x = rnd() * 1600;
      oval(c, x, 885, 70, 18, '#66814b');
      oval(c, x + 30, 878, 45, 23, '#718e50');
    }
  }
  draw(world: GameWorld) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const width = this.canvas.width / this.dpr,
      height = this.canvas.height / this.dpr;
    c.fillStyle = world.level.palette === 2 ? '#b8cdd0' : '#bedbdc';
    c.fillRect(0, 0, width, height);
    const sceneBottom = this.offsetY + 900 * this.scale;
    c.fillStyle = '#a59470';
    c.fillRect(0, sceneBottom - 1, width, Math.max(0, height - sceneBottom + 1));
    // Extend the landscape at extreme aspect ratios rather than adding letterbox bars.
    if (this.offsetX > 0) {
      c.drawImage(this.scenery, 0, 0, 1, 900, 0, this.offsetY, this.offsetX + 1, 900 * this.scale);
      c.drawImage(
        this.scenery,
        1599,
        0,
        1,
        900,
        width - this.offsetX - 1,
        this.offsetY,
        this.offsetX + 1,
        900 * this.scale,
      );
    }
    c.translate(this.offsetX, this.offsetY);
    c.scale(this.scale, this.scale);
    c.save();
    c.beginPath();
    c.rect(0, 0, 1600, 900);
    c.clip();
    if (!this.reduced && world.shake > 0.1)
      c.translate(
        Math.sin(world.time * 91) * world.shake,
        Math.cos(world.time * 83) * world.shake * 0.5,
      );
    c.drawImage(this.scenery, 0, 0);
    // Distant birds in the sky.
    for (let i = 0; i < 3; i++) {
      const x = 770 + i * 27 + Math.sin(world.time * 0.15) * 20,
        y = 245 + Math.sin(i * 2) * 14;
      line(
        c,
        [
          [x - 6, y - 3],
          [x, y],
          [x + 6, y - 3],
        ],
        '#789a92',
        1.5,
      );
    }
    // Ground shadows help read the physical contact points.
    for (const e of world.entities)
      if (!e.dead) {
        const p = e.body.position,
          height = Math.max(0, 735 - p.y);
        oval(
          c,
          p.x,
          737,
          Math.max(8, e.w * 0.5 - height * 0.02),
          4,
          `rgba(50,65,36,${Math.max(0.03, 0.17 - height * 0.0003)})`,
        );
      }
    // Waiting birds.
    for (let i = world.birdIndex + 1; i < world.level.birds.length; i++)
      drawBird(
        c,
        190 - (i - world.birdIndex - 1) * 63,
        706,
        21,
        world.level.birds[i],
        0,
        Math.sin(world.time + i * 3) > 0.996,
      );
    // Slingshot back fork.
    line(
      c,
      [
        [267, 727],
        [265, 633],
        [241, 549],
      ],
      '#5e4934',
      19,
    );
    line(
      c,
      [
        [267, 719],
        [265, 635],
        [241, 550],
      ],
      '#aa7a47',
      12,
    );
    line(
      c,
      [
        [270, 635],
        [305, 553],
      ],
      '#5e4934',
      18,
    );
    line(
      c,
      [
        [270, 635],
        [305, 553],
      ],
      '#b78a51',
      11,
    );
    line(
      c,
      [
        [263, 650],
        [269, 692],
      ],
      '#d4ab70',
      3,
    );
    for (let i = 0; i < 3; i++)
      line(
        c,
        [
          [232, 552 + i * 4],
          [249, 548 + i * 4],
        ],
        '#d9c090',
        3,
      );
    const loaded = world.phase === 'ready' || world.phase === 'aiming';
    const pos = loaded ? world.active.body.position : WORLD.sling;
    line(
      c,
      [
        [302, 556],
        [pos.x, pos.y + 5],
      ],
      '#655144',
      8,
    );
    line(
      c,
      [
        [302, 554],
        [pos.x, pos.y + 3],
      ],
      '#a08a6c',
      3,
    );
    // Dotted previous flight path.
    world.trail.forEach((p, i) =>
      oval(c, p.x, p.y, 2.5, 2.5, `rgba(255,253,232,${0.18 + (i / world.trail.length) * 0.4})`),
    );
    if (world.phase === 'aiming') {
      const v = launchVelocity(pos);
      let px = pos.x,
        py = pos.y,
        vx = v.x,
        vy = v.y;
      for (let i = 0; i < 110; i++) {
        vx *= 0.9996;
        vy = vy * 0.9996 + 0.18055;
        px += vx * 0.5;
        py += vy * 0.5;
        if (py > 730) break;
        if (i % 5 === 0)
          oval(
            c,
            px,
            py,
            Math.max(1.5, 4 - i * 0.022),
            Math.max(1.5, 4 - i * 0.022),
            `rgba(255,255,241,${0.9 - i * 0.006})`,
          );
      }
      c.beginPath();
      c.arc(WORLD.sling.x, WORLD.sling.y, 118, 0.6, Math.PI * 1.65);
      c.strokeStyle = '#fff9e942';
      c.lineWidth = 1;
      c.setLineDash([3, 7]);
      c.stroke();
      c.setLineDash([]);
    }
    for (const e of world.entities) if (!e.dead && e.type === 'block') drawBlock(c, e);
    for (const e of world.entities) if (!e.dead && e.type === 'pig') drawPig(c, e, world.time);
    for (const e of world.entities)
      if (!e.dead && e.type === 'bird')
        drawBird(
          c,
          e.body.position.x,
          e.body.position.y,
          e.w / 2,
          e.bird!,
          loaded && e === world.active ? 0 : e.body.angle,
          Math.sin(world.time * 1.7) > 0.998,
        );
    line(
      c,
      [
        [240, 556],
        [pos.x - 9, pos.y + 8],
      ],
      '#66503e',
      8,
    );
    line(
      c,
      [
        [240, 554],
        [pos.x - 9, pos.y + 6],
      ],
      '#a58c69',
      2.5,
    );
    if (world.phase === 'ready') {
      const pulse = this.reduced ? 1 : Math.sin(world.time * 3) * 0.5 + 0.5;
      c.beginPath();
      c.arc(pos.x, pos.y, 38 + pulse * 5, 0, TAU);
      c.strokeStyle = `rgba(255,253,231,${0.3 + pulse * 0.3})`;
      c.lineWidth = 2;
      c.setLineDash([5, 7]);
      c.stroke();
      c.setLineDash([]);
    }
    for (const p of world.particles) {
      c.save();
      c.globalAlpha = Math.min(1, p.life * 2);
      c.translate(p.x, p.y);
      c.rotate(p.angle);
      if (p.kind === 'dust') oval(c, 0, 0, p.size, p.size, p.color);
      else {
        c.fillStyle = p.color;
        c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
      }
      c.restore();
    }
    if (world.explosion > 0) {
      const k = 1 - world.explosion;
      c.beginPath();
      c.arc(world.explosionAt.x, world.explosionAt.y, 30 + k * 230, 0, TAU);
      c.strokeStyle = `rgba(255,230,161,${world.explosion})`;
      c.lineWidth = 12 * world.explosion;
      c.stroke();
    }
    for (const text of world.texts) {
      c.save();
      c.globalAlpha = Math.min(1, text.life * 2);
      c.font = '800 24px system-ui';
      c.textAlign = 'center';
      c.strokeStyle = '#44604860';
      c.lineWidth = 4;
      c.strokeText(text.text, text.x, text.y);
      c.fillStyle = text.color;
      c.fillText(text.text, text.x, text.y);
      c.restore();
    }
    c.restore();
  }
  dispose() {
    this.observer.disconnect();
  }
}
