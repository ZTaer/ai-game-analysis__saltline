import type { Body } from 'matter-js';
export type BirdKind = 'red' | 'yellow' | 'bomb';
export type Material = 'wood' | 'glass' | 'stone';
export type Phase = 'ready' | 'aiming' | 'flying' | 'won' | 'lost';
export interface BlockSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  material: Material;
  angle?: number;
}
export interface PigSpec {
  x: number;
  y: number;
  r?: number;
  helmet?: boolean;
}
export interface Level {
  name: string;
  subtitle: string;
  hint: string;
  birds: BirdKind[];
  blocks: BlockSpec[];
  pigs: PigSpec[];
  thresholds: [number, number];
  palette: number;
}
export interface Entity {
  body: Body;
  type: 'block' | 'pig' | 'bird';
  material?: Material;
  bird?: BirdKind;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  hit: number;
  dead: boolean;
  helmet?: boolean;
}
export interface Snapshot {
  phase: Phase;
  score: number;
  pigs: number;
  totalPigs: number;
  birdIndex: number;
  birds: BirdKind[];
  ability: boolean;
  stars: number;
  power: number;
}
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  angle: number;
  spin: number;
  kind: 'chip' | 'dust' | 'feather';
}
export interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}
export const WORLD = {
  width: 1600,
  height: 900,
  ground: 735,
  sling: { x: 270, y: 575 },
  maxPull: 105,
};
export const BIRDS: Record<
  BirdKind,
  { name: string; title: string; color: string; description: string }
> = {
  red: {
    name: '红怒',
    title: '全能先锋',
    color: '#df5145',
    description: '扎实的一击。瞄准建筑底部，让重力帮你完成剩下的事。',
  },
  yellow: {
    name: '疾风',
    title: '空中加速',
    color: '#efbe37',
    description: '飞行中点击场景或按空格加速，轻松穿透木质支柱。',
  },
  bomb: {
    name: '黑火',
    title: '范围爆破',
    color: '#39414b',
    description: '飞行中点击场景或按空格引爆。撞击后也会延时爆炸。',
  },
};
