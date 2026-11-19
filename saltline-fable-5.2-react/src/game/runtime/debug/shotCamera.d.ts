import type { GameContext, ShotOptions, ShotCamera } from '../../types.ts';
export function createShotCamera(context: GameContext): {
  setShot(options: ShotOptions): void;
  getCamera(): ShotCamera | null;
};
