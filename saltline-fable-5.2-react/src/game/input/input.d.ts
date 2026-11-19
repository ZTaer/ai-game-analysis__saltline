import type { GameContext, InputSystem } from '../types.ts';
/** 输入控制器仍为 JavaScript；此处描述启动/UI 所消费的公开接口。 */
export function createInput(context: GameContext): InputSystem;
