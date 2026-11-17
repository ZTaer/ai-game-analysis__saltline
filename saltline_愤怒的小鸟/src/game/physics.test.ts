import { describe, it, expect } from 'vitest';
import Matter from 'matter-js';
import { GameWorld, clampPull, launchVelocity } from './physics';
import { LEVELS } from './levels';
import { WORLD } from './types';
import type { Level } from './types';
const advance = (world: GameWorld, seconds: number) => {
  for (let i = 0; i < seconds * 120; i++) world.step();
};
describe('physical world', () => {
  it.each(LEVELS.map((level, i) => [i, level] as const))(
    'level %s remains structurally stable before launch',
    (i, level) => {
      const w = new GameWorld(level);
      const initial = w.entities
        .filter((e) => e.type !== 'bird')
        .map((e) => ({ ...e.body.position }));
      advance(w, 4);
      const drift = w.entities
        .filter((e) => e.type !== 'bird')
        .map((e, j) =>
          Math.hypot(e.body.position.x - initial[j].x, e.body.position.y - initial[j].y),
        );
      expect(Math.max(...drift), `level ${i + 1} drift`).toBeLessThan(8);
      expect(w.pigs).toBe(level.pigs.length);
      expect(w.score).toBe(0);
      w.dispose();
    },
  );
  it('clamps pull distance and cancels taps without spending a bird', () => {
    const p = clampPull(-500, 1000);
    expect(Math.hypot(p.x - WORLD.sling.x, p.y - WORLD.sling.y)).toBeCloseTo(WORLD.maxPull);
    expect(Math.hypot(...Object.values(launchVelocity(p)))).toBeCloseTo(18.9);
    const w = new GameWorld(LEVELS[0]);
    w.aim(269, 575);
    w.release();
    expect(w.phase).toBe('ready');
    expect(w.birdIndex).toBe(0);
    w.dispose();
  });
  it('a launch flies ballistically, damages towers, and keeps finite bodies', () => {
    const w = new GameWorld(LEVELS[0]);
    advance(w, 1);
    w.aim(176, 622);
    w.release();
    advance(w, 0.5);
    expect(w.active.body.position.x).toBeGreaterThan(450);
    expect(w.active.body.position.y).toBeLessThan(575);
    advance(w, 8);
    expect(w.score).toBeGreaterThan(0);
    for (const e of w.entities) {
      expect(Number.isFinite(e.body.position.x)).toBe(true);
      expect(Number.isFinite(e.body.angle)).toBe(true);
    }
    w.dispose();
  });
  it('missed shots advance and eventually end in defeat', () => {
    const w = new GameWorld(LEVELS[0]);
    for (let shot = 0; shot < 3; shot++) {
      w.aim(330, 600);
      w.release();
      for (let i = 0; i < 1700 && w.phase === 'flying'; i++) w.step();
    }
    expect(w.phase).toBe('lost');
    expect(w.pigs).toBe(2);
    w.dispose();
  });
  it('bombs impart radial velocity, damage nearby bodies and can trigger only once', () => {
    const w = new GameWorld({ ...LEVELS[0], birds: ['bomb'] });
    advance(w, 1);
    w.aim(176, 622);
    w.release();
    Matter.Body.setPosition(w.active.body, { x: 1090, y: 600 });
    w.useAbility();
    expect(w.abilityUsed).toBe(true);
    expect(w.explosion).toBe(1);
    advance(w, 0.1);
    expect(w.score).toBeGreaterThan(0);
    const count = w.particles.length;
    w.useAbility();
    expect(w.particles.length).toBe(count);
    w.dispose();
  });
  it('awards unused bird bonus once, then preserves final score', () => {
    const easy: Level = {
      ...LEVELS[0],
      blocks: [],
      pigs: [{ x: 500, y: 711 }],
      birds: ['bomb', 'red'],
    };
    const w = new GameWorld(easy);
    advance(w, 1);
    w.aim(176, 622);
    w.release();
    Matter.Body.setPosition(w.active.body, { x: 500, y: 650 });
    w.useAbility();
    advance(w, 3);
    expect(w.phase).toBe('won');
    expect(w.score).toBe(15000);
    advance(w, 4);
    expect(w.score).toBe(15000);
    w.dispose();
  });
});
