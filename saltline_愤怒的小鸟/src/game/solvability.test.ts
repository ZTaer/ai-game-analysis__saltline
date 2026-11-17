import { it, expect } from 'vitest';
import { GameWorld } from './physics';
import { LEVELS } from './levels';
import { WORLD } from './types';
type Shot = { angle: number; length: number; abilityAt: number };
function run(level: number, shots: Shot[]) {
  const w = new GameWorld(LEVELS[level]);
  for (let i = 0; i < 120; i++) w.step();
  for (const shot of shots) {
    if (w.phase !== 'ready') break;
    const a = (shot.angle * Math.PI) / 180;
    w.aim(WORLD.sling.x - Math.cos(a) * shot.length, WORLD.sling.y + Math.sin(a) * shot.length);
    w.release();
    let triggered = false;
    for (let i = 0; i < 1750 && w.snapshot().phase === 'flying'; i++) {
      if (!triggered && w.shotTime >= shot.abilityAt) {
        w.useAbility();
        triggered = true;
      }
      w.step();
    }
  }
  const result = {
    phase: w.phase,
    score: w.score,
    remaining: w.pigs,
    metric: (LEVELS[level].pigs.length - w.pigs) * 50000 + w.score,
  };
  w.dispose();
  return result;
}
it('all six authored levels can be completed with their available birds', () => {
  for (let level = 0; level < LEVELS.length; level++) {
    let beam: { shots: Shot[]; metric: number }[] = [{ shots: [], metric: 0 }],
      won = false;
    for (let depth = 0; depth < LEVELS[level].birds.length && !won; depth++) {
      const next: typeof beam = [];
      const kind = LEVELS[level].birds[depth];
      for (const parent of beam) {
        for (const angle of [15, 25, 35, 45, 55, 65]) {
          for (const length of [90, 105]) {
            for (const abilityAt of kind === 'red'
              ? [99]
              : kind === 'yellow'
                ? [0.5, 1.1]
                : [1.05, 1.45, 99]) {
              const shots = [...parent.shots, { angle, length, abilityAt }],
                result = run(level, shots);
              if (result.phase === 'won') {
                console.log(
                  'Level',
                  level + 1,
                  'solution',
                  JSON.stringify(shots),
                  'score',
                  result.score,
                );
                won = true;
                break;
              }
              if (result.phase === 'ready') next.push({ shots, metric: result.metric });
            }
            if (won) break;
          }
          if (won) break;
        }
        if (won) break;
      }
      beam = next.sort((a, b) => b.metric - a.metric).slice(0, 3);
    }
    expect(won, `level ${level + 1} must be solvable`).toBe(true);
  }
}, 120000);
