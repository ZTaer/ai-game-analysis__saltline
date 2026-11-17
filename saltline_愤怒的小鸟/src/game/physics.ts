import Matter from 'matter-js';
import type { Body, IEventCollision, Engine } from 'matter-js';
import { WORLD } from './types';
import type {
  BirdKind,
  Entity,
  FloatingText,
  Level,
  Material,
  Particle,
  Phase,
  Snapshot,
} from './types';
import type { SynthAudio } from './audio';
const { Bodies, Body: RigidBody, Composite, Engine: PhysicsEngine, Events, Sleeping } = Matter;
export const MATERIALS = {
  wood: { density: 0.0018, friction: 0.68, restitution: 0.05, hp: 80, color: '#bf8147' },
  glass: { density: 0.0014, friction: 0.45, restitution: 0.07, hp: 30, color: '#9dd9df' },
  stone: { density: 0.0037, friction: 0.8, restitution: 0.015, hp: 190, color: '#8d9c9f' },
};
export const STEP = 1000 / 120;
export function launchVelocity(point: { x: number; y: number }) {
  return { x: (WORLD.sling.x - point.x) * 0.18, y: (WORLD.sling.y - point.y) * 0.18 };
}
export function clampPull(x: number, y: number) {
  const dx = x - WORLD.sling.x,
    dy = y - WORLD.sling.y,
    k = Math.min(1, WORLD.maxPull / Math.hypot(dx, dy));
  return { x: WORLD.sling.x + dx * k, y: WORLD.sling.y + dy * k };
}
export class GameWorld {
  engine: Engine;
  entities: Entity[] = [];
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  trail: { x: number; y: number }[] = [];
  phase: Phase = 'ready';
  score = 0;
  birdIndex = 0;
  stars = 0;
  abilityUsed = false;
  time = 0;
  shotTime = 0;
  shake = 0;
  explosion = 0;
  explosionAt = { x: 0, y: 0 };
  active!: Entity;
  private queued = new Set<Entity>();
  private byId = new Map<number, Entity>();
  private stillTime = 0;
  private winDelay = 0;
  private bombFuse = -1;
  private tick = 0;
  constructor(
    public level: Level,
    private audio?: SynthAudio,
  ) {
    this.engine = PhysicsEngine.create({
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 10,
      constraintIterations: 4,
    });
    this.engine.gravity.y = 1.3;
    Composite.add(this.engine.world, [
      Bodies.rectangle(800, WORLD.ground + 60, 2400, 120, {
        isStatic: true,
        friction: 0.85,
        label: 'ground',
      }),
      Bodies.rectangle(-150, 0, 100, 2000, { isStatic: true }),
    ]);
    for (const b of level.blocks) {
      const m = MATERIALS[b.material];
      const body = Bodies.rectangle(b.x, b.y, b.w, b.h, {
        ...m,
        angle: b.angle || 0,
        chamfer: { radius: 1 },
        frictionStatic: 0.9,
        sleepThreshold: 90,
        label: b.material,
      });
      this.add({
        body,
        type: 'block',
        material: b.material,
        w: b.w,
        h: b.h,
        hp: m.hp,
        maxHp: m.hp,
        hit: 0,
        dead: false,
      });
    }
    for (const p of level.pigs) {
      const r = p.r || 24,
        hp = p.helmet ? 100 : 48;
      this.add({
        body: Bodies.circle(p.x, p.y, r, {
          density: 0.002,
          friction: 0.7,
          restitution: 0.08,
          sleepThreshold: 90,
        }),
        type: 'pig',
        w: r * 2,
        h: r * 2,
        hp,
        maxHp: hp,
        hit: 0,
        dead: false,
        helmet: p.helmet,
      });
    }
    Events.on(this.engine, 'collisionStart', (event: IEventCollision<Engine>) =>
      this.collide(event),
    );
    this.loadBird();
  }
  private add(entity: Entity) {
    this.entities.push(entity);
    this.byId.set(entity.body.id, entity);
    Composite.add(this.engine.world, entity.body);
    return entity;
  }
  private loadBird() {
    const kind = this.level.birds[this.birdIndex],
      r = kind === 'bomb' ? 29 : 26;
    // Create dynamically first: Matter needs finite original mass/inertia to restore on launch.
    const body = Bodies.circle(WORLD.sling.x, WORLD.sling.y, r, {
      density: kind === 'bomb' ? 0.008 : 0.006,
      friction: 0.65,
      frictionAir: 0.0008,
      restitution: 0.22,
      label: 'bird',
    });
    RigidBody.setStatic(body, true);
    this.active = this.add({
      body,
      type: 'bird',
      bird: kind,
      w: r * 2,
      h: r * 2,
      hp: 9999,
      maxHp: 9999,
      hit: 0,
      dead: false,
    });
    this.phase = 'ready';
    this.abilityUsed = false;
    this.bombFuse = -1;
    this.stillTime = 0;
    this.trail = [];
  }
  get pigs() {
    return this.entities.filter((e) => e.type === 'pig' && !e.dead).length;
  }
  get power() {
    return (
      Math.hypot(
        this.active.body.position.x - WORLD.sling.x,
        this.active.body.position.y - WORLD.sling.y,
      ) / WORLD.maxPull
    );
  }
  snapshot(): Snapshot {
    return {
      phase: this.phase,
      score: this.score,
      pigs: this.pigs,
      totalPigs: this.level.pigs.length,
      birdIndex: this.birdIndex,
      birds: this.level.birds,
      ability: this.phase === 'flying' && this.active.bird !== 'red' && !this.abilityUsed,
      stars: this.stars,
      power: this.phase === 'aiming' ? this.power : 0,
    };
  }
  aim(x: number, y: number) {
    if (this.phase !== 'ready' && this.phase !== 'aiming') return;
    this.phase = 'aiming';
    RigidBody.setPosition(this.active.body, clampPull(x, y));
  }
  cancelAim() {
    if (this.phase === 'aiming') {
      RigidBody.setPosition(this.active.body, WORLD.sling);
      this.phase = 'ready';
    }
  }
  release() {
    if (this.phase !== 'aiming') return;
    if (this.power < 0.1) {
      this.cancelAim();
      return;
    }
    const velocity = launchVelocity(this.active.body.position);
    RigidBody.setStatic(this.active.body, false);
    Sleeping.set(this.active.body, false);
    RigidBody.setVelocity(this.active.body, velocity);
    RigidBody.setAngularVelocity(this.active.body, -0.015);
    this.phase = 'flying';
    this.shotTime = 0;
    this.stillTime = 0;
    this.audio?.launch();
  }
  useAbility() {
    if (this.phase !== 'flying' || this.abilityUsed || this.active.bird === 'red') return;
    this.abilityUsed = true;
    if (this.active.bird === 'bomb') this.detonate();
    else {
      const v = this.active.body.velocity;
      RigidBody.setVelocity(this.active.body, {
        x: Math.min(30, Math.max(15, v.x * 1.65)),
        y: v.y * 0.8,
      });
      this.audio?.boost();
      this.burst(this.active, '#f6cd45', 18);
    }
  }
  private collide(event: IEventCollision<Engine>) {
    if (this.phase !== 'flying' || this.time < 0.7) return;
    for (const pair of event.pairs) {
      const a = pair.bodyA,
        b = pair.bodyB,
        ea = this.byId.get(a.id),
        eb = this.byId.get(b.id);
      const n = pair.collision.normal,
        speed = Math.abs((a.velocity.x - b.velocity.x) * n.x + (a.velocity.y - b.velocity.y) * n.y);
      if (
        (a === this.active.body || b === this.active.body) &&
        this.active.bird === 'bomb' &&
        this.bombFuse < 0 &&
        !this.abilityUsed &&
        speed > 1
      )
        this.bombFuse = 0.85;
      if (speed < 1.35) continue;
      for (const [target, other] of [
        [ea, b],
        [eb, a],
      ] as [Entity | undefined, Body][]) {
        if (!target || target.dead || target.type === 'bird') continue;
        const mass = other.isStatic ? target.body.mass : other.mass;
        const scale = target.material === 'stone' ? 0.32 : target.material === 'glass' ? 1.4 : 1;
        this.damage(target, (speed - 1.1) * Math.sqrt(Math.min(16, mass)) * 11 * scale);
      }
      const audible =
        ea?.material || eb?.material || (ea?.type === 'pig' || eb?.type === 'pig' ? 'pig' : 'bird');
      this.audio?.impact(audible, speed);
      this.shake = Math.max(this.shake, Math.min(7, speed * 0.3));
    }
  }
  private damage(e: Entity, amount: number) {
    e.hp -= amount;
    e.hit = 1;
    if (e.hp <= 0) this.queued.add(e);
  }
  private burst(e: Entity, color: string, count: number) {
    for (let j = 0; j < count; j++) {
      const life = 0.5 + Math.random() * 0.7;
      this.particles.push({
        x: e.body.position.x + (Math.random() - 0.5) * e.w * 0.6,
        y: e.body.position.y + (Math.random() - 0.5) * e.h * 0.6,
        vx: (Math.random() - 0.5) * 210 + e.body.velocity.x * 12,
        vy: -50 - Math.random() * 190,
        life,
        maxLife: life,
        size: 3 + Math.random() * 7,
        color,
        angle: Math.random() * 6,
        spin: (Math.random() - 0.5) * 12,
        kind: e.type === 'pig' ? 'dust' : 'chip',
      });
    }
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);
  }
  private remove(e: Entity) {
    if (e.dead) return;
    e.dead = true;
    Composite.remove(this.engine.world, e.body);
    this.byId.delete(e.body.id);
    const points = e.type === 'pig' ? 5000 : 500;
    if (e.type !== 'bird') {
      this.score += points;
      this.texts.push({
        x: e.body.position.x,
        y: e.body.position.y - 25,
        text: '+' + points.toLocaleString(),
        life: 1.2,
        color: e.type === 'pig' ? '#44652f' : '#fff7df',
      });
    }
    this.burst(
      e,
      e.type === 'pig' ? '#9cbf67' : e.material ? MATERIALS[e.material].color : '#4e5050',
      e.type === 'pig' ? 24 : 13,
    );
    if (e.type === 'pig') this.audio?.impact('pig', 9);
  }
  private detonate() {
    const pos = this.active.body.position;
    this.explosionAt = { ...pos };
    this.explosion = 1;
    this.shake = 15;
    this.audio?.explode();
    this.bombFuse = -1;
    for (const e of this.entities) {
      if (e.dead || e === this.active) continue;
      const dx = e.body.position.x - pos.x,
        dy = e.body.position.y - pos.y,
        dist = Math.hypot(dx, dy),
        k = Math.max(0, 1 - dist / 245);
      if (!k) continue;
      Sleeping.set(e.body, false);
      RigidBody.setVelocity(e.body, {
        x: e.body.velocity.x + (dx / Math.max(20, dist)) * k * 20,
        y: e.body.velocity.y + (dy / Math.max(20, dist)) * k * 20 - k * 4,
      });
      this.damage(e, k * (e.material === 'stone' ? 240 : 320));
    }
    this.burst(this.active, '#f4b35c', 55);
    this.remove(this.active);
  }
  step(dt = STEP / 1000) {
    this.time += dt;
    this.tick++;
    PhysicsEngine.update(this.engine, dt * 1000);
    for (const e of this.queued) this.remove(e);
    this.queued.clear();
    for (const e of this.entities) {
      e.hit = Math.max(0, e.hit - dt * 5);
      if (!e.dead && e.type !== 'bird' && (e.body.position.y > 1000 || e.body.position.x > 1700))
        this.remove(e);
    }
    this.shake *= Math.exp(-dt * 12);
    this.explosion = Math.max(0, this.explosion - dt * 2.5);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      p.angle += p.spin * dt;
      if (p.y > WORLD.ground) {
        p.y = WORLD.ground;
        p.vy *= -0.25;
        p.vx *= 0.8;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * 35;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.phase !== 'flying') return;
    this.shotTime += dt;
    if (this.bombFuse >= 0) {
      this.bombFuse -= dt;
      if (this.bombFuse <= 0 && !this.abilityUsed) {
        this.abilityUsed = true;
        this.detonate();
      }
    }
    if (!this.active.dead && this.tick % 8 === 0 && this.shotTime < 6) {
      this.trail.push({ ...this.active.body.position });
      if (this.trail.length > 75) this.trail.shift();
    }
    if (this.pigs === 0) {
      this.winDelay += dt;
      if (this.winDelay > 1.5) {
        const bonus = (this.level.birds.length - this.birdIndex - 1) * 10000;
        this.score += bonus;
        this.stars =
          this.score >= this.level.thresholds[1]
            ? 3
            : this.score >= this.level.thresholds[0]
              ? 2
              : 1;
        this.phase = 'won';
        this.audio?.win();
      }
      return;
    }
    const moving = this.entities.some(
      (e) => !e.dead && !e.body.isStatic && (e.body.speed > 0.45 || e.body.angularSpeed > 0.03),
    );
    this.stillTime = moving ? 0 : this.stillTime + dt;
    const escaped =
      this.active.body.position.x > 1680 ||
      this.active.body.position.x < -80 ||
      this.active.body.position.y > 1050;
    if (
      this.shotTime > 1.8 &&
      (this.stillTime > 0.8 || this.shotTime > 12 || (escaped && this.shotTime > 4))
    ) {
      if (!this.active.dead) {
        Composite.remove(this.engine.world, this.active.body);
        this.active.dead = true;
      }
      if (this.birdIndex < this.level.birds.length - 1) {
        this.birdIndex++;
        this.loadBird();
      } else {
        this.phase = 'lost';
        this.audio?.lose();
      }
    }
  }
  dispose() {
    Events.off(this.engine, 'collisionStart');
    Composite.clear(this.engine.world, false);
    PhysicsEngine.clear(this.engine);
  }
}
