import type { QualityName } from '../game/config.ts';
import type { GameContext } from '../game/types.ts';

/** 已校验的用户偏好；存储键与字段名保持兼容旧版本。 */
export interface GameSettings {
  /** auto 按设备选档；test 仅用于 URL 调试，不写入用户设置。 */
  quality: 'auto' | Exclude<QualityName, 'test'>;
  /** 鼠标灵敏度倍率，0.2～3。 */
  sens: number;
  invertY: boolean;
  /** 主音量，0～1；设置界面转换为百分比。 */
  volume: number;
  /** 玩家基础视野，60～95 度。 */
  fov: number;
}
/** 字段和值必须对应，例如 volume 只接受 number，invertY 只接受 boolean。 */
export type ChangeSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
export type MenuScreen = 'none' | 'title' | 'paused' | 'dead' | 'complete';
export type SettingsTab = 'settings' | 'controls';
export interface DeathResult {
  time: number;
  relays: number;
  total: number;
}
export interface DebriefResult {
  time: number;
  accuracy: number | null;
  kills: number;
  retries: number;
  rating: string;
}
/** React 订阅的低频界面快照；逐帧玩家/场景数据不放入此状态。 */
export interface MenuState {
  screen: MenuScreen;
  panelOpen: boolean;
  tab: SettingsTab;
  locationVisible: boolean;
  lookMode: string;
  dead: DeathResult;
  debrief: DebriefResult;
  fullscreenAvailable: boolean;
  fullscreenLabel: string;
}
export interface MenuStore {
  getSnapshot(): MenuState;
  subscribe(callback: () => void): () => void;
}
export type MenuContext = Pick<
  GameContext,
  'params' | 'quality' | 'input' | 'audio' | 'player' | 'render' | 'events'
>;
export type MenuActions = Partial<
  Record<'deploy' | 'resume' | 'restart' | 'retry' | 'redeploy', (event: MouseEvent) => void>
>;
