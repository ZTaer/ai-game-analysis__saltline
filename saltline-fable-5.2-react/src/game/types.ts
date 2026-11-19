import type * as THREE from 'three';
import type { QualityPreset } from './config.ts';
import type { EventBus } from './core/events.ts';
import type { Random } from './core/random.ts';

/** JavaScript 引擎与 TypeScript 启动/UI 层之间的公开契约。
 * 这里只列调用边界所需的接口；子系统内部实现仍留在 JavaScript。
 * 新增跨模块调用时先补接口，不能依靠任意属性索引绕过检查。
 */
export interface UpdateSystem {
  update?(deltaSeconds: number): unknown;
  stub?: boolean;
}
export interface InputSystem extends UpdateSystem {
  sensitivity: number;
  invertY?: boolean;
  endFrame(): void;
  exitLock(): void;
}
export interface AudioSystem extends UpdateSystem {
  setVolume?(volume: number): void;
}
export interface PlayerSystem extends UpdateSystem {
  setFov?(degrees: number): void;
}
export interface WeaponSystem extends UpdateSystem {
  setVisible?(visible: boolean): void;
  setWetness?(wetness: number): void;
}
export interface MaterialSystem extends UpdateSystem {
  get(name: string): THREE.Material;
}
export interface LevelSystem extends UpdateSystem {
  playerStart: { pos: THREE.Vector3; yaw: number };
  objectives: unknown[];
  enemySpawns: unknown[];
  zones: unknown[];
  interiorBoxes: Array<{ min: THREE.Vector3; max: THREE.Vector3 }>;
  cinematicPath: Array<{ pos: number[]; look: number[] }>;
  extraction: { pos: THREE.Vector3; radius: number };
  groundSurfaceAt(...args: unknown[]): string;
}
export interface RenderSystem {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  viewCamera: THREE.PerspectiveCamera;
  exposure: number;
  frame(deltaSeconds: number): void;
  onLevelReady(): void | Promise<void>;
  setQuality?(quality: QualityPreset): void;
  stats?(): Record<string, unknown>;
}
export type GameState = 'title' | 'intro' | 'playing' | 'paused' | 'dead' | 'complete' | 'showcase';
export interface GameSystem {
  state: GameState;
  update(deltaSeconds: number): unknown;
  start(options?: { skipIntro?: boolean }): void;
  menus?: { dispose(): void };
}
export interface ShowcaseInfo {
  cam?: number[];
  target?: number[];
  update?(dt: number): void;
}
export interface GameContext {
  THREE: typeof THREE;
  params: Record<string, string>;
  events: EventBus;
  rng: Random;
  time: { t: number; dt: number; frame: number; real: number };
  quality: QualityPreset;
  renderer: THREE.WebGLRenderer;
  render: RenderSystem;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  viewCamera: THREE.PerspectiveCamera;
  physics: { build(): void };
  props: unknown;
  input: InputSystem;
  audio: AudioSystem;
  player: PlayerSystem;
  weapon: WeaponSystem;
  enemies: UpdateSystem;
  hud: UpdateSystem;
  fx: UpdateSystem;
  mats: MaterialSystem;
  ground: UpdateSystem;
  backdrop: UpdateSystem;
  level: LevelSystem;
  combat: unknown;
  game: GameSystem;
  showcase: string | null;
  showcaseInfo: ShowcaseInfo;
  bench?: { frame(realDeltaSeconds: number): void };
}
/** 启动时系统依次创建，清理必须接受尚未装配完整的上下文。 */
export type BootContext = Partial<GameContext>;
export interface GameHandle {
  ready: Promise<void>;
  dispose(): void;
}
export interface BootScreen {
  element: HTMLElement;
  update(message: string, progress: number): Promise<void>;
}
export interface BootLifecycle {
  assertActive(): void;
  setContext(context: BootContext): void;
  reportFatal(error: unknown): void;
  bootScreen: BootScreen;
}
export interface ShotOptions {
  cam?: string;
  fov?: string | number;
  exposure?: string | number;
}
export interface ShotCamera {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}
export interface FrameOptions {
  params: Record<string, string>;
  showcaseName: string | null;
  getShotCamera(): ShotCamera | null;
  frameStats: { averageFrameSeconds: number };
}
