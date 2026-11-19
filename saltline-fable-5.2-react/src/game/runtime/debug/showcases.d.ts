import type { GameContext, ShowcaseInfo, InputSystem, PlayerSystem } from '../../types.ts';
/** 原 JavaScript 展示模块的边界；不改变注册表 getter 或展示初始化顺序。 */
export const showcases: Record<
  string,
  { showcase(context: GameContext): ShowcaseInfo | void | Promise<ShowcaseInfo | void> }
>;
export function createShowcaseInput(): InputSystem;
export function createShowcasePlayer(context: GameContext): PlayerSystem;
