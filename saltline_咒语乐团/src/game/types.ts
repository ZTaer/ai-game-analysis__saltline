import type * as THREE from "three";
export type Season = "spring" | "winter";
export type Mode =
  | "loading"
  | "menu"
  | "playing"
  | "paused"
  | "upgrade"
  | "victory"
  | "dead";
export type SpellId = "bolt" | "frost" | "orbit" | "meteor" | "chain" | "bloom";
export interface Upgrade {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  rarity: "普通" | "稀有" | "史诗";
  color: string;
}
export interface SpellState {
  id: SpellId;
  name: string;
  level: number;
  color: string;
  icon: string;
}
export interface Snapshot {
  mode: Mode;
  season: Season;
  ready: boolean;
  error: string | null;
  health: number;
  maxHealth: number;
  xp: number;
  xpNext: number;
  level: number;
  time: number;
  duration: number;
  kills: number;
  combo: number;
  bestCombo: number;
  damage: number;
  dashCooldown: number;
  pulseCooldown: number;
  shrines: number;
  shrineProgress: number;
  nearShrine: boolean;
  bossHealth: number;
  bossMaxHealth: number;
  bossName: string;
  wave: number;
  spells: SpellState[];
  choices: Upgrade[];
  notification: string;
  muted: boolean;
  quality: "high" | "medium";
  fps: number;
  player: { x: number; z: number };
  enemies: { x: number; z: number }[];
  shrinePositions: { x: number; z: number; active: boolean }[];
}
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
  height?: number;
}
export interface PhysicsProp {
  mesh: THREE.Object3D;
  halfSize: [number, number, number];
  mass?: number;
}
export interface WorldView {
  group: THREE.Group;
  obstacles: Obstacle[];
  props: PhysicsProp[];
  shrinePositions: { x: number; z: number }[];
  update: (dt: number, time: number, player: THREE.Vector3) => void;
  setShrine: (index: number, progress: number, active: boolean) => void;
  dispose: () => void;
}
