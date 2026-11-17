import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { GameWorld, STEP } from '../game/physics';
import { SceneRenderer } from '../game/render';
import { LEVELS } from '../game/levels';
import { WORLD } from '../game/types';
import type { Snapshot } from '../game/types';
import type { SynthAudio } from '../game/audio';
export interface GameHandle {
  ability: () => void;
}
interface Props {
  level: number;
  paused: boolean;
  audio: SynthAudio;
  onSnapshot: (s: Snapshot) => void;
  onBlur: () => void;
}
export const GameCanvas = forwardRef<GameHandle, Props>(function GameCanvas(
  { level, paused, audio, onSnapshot, onBlur },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null),
    worldRef = useRef<GameWorld | null>(null);
  const state = useRef({ paused, onSnapshot, onBlur });
  state.current = { paused, onSnapshot, onBlur };
  useImperativeHandle(
    ref,
    () => ({
      ability: () => worldRef.current?.useAbility(),
    }),
    [],
  );
  useEffect(() => {
    const node = canvas.current!,
      world = new GameWorld(LEVELS[level], audio),
      render = new SceneRenderer(node, LEVELS[level].palette);
    worldRef.current = world;
    state.current.onSnapshot(world.snapshot());
    let raf = 0,
      last = 0,
      accumulator = 0,
      publish = 0,
      dragging = false,
      pullTick = 0;
    const frame = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.08) : 0;
      last = now;
      if (!state.current.paused) {
        accumulator += dt;
        while (accumulator >= STEP / 1000) {
          world.step();
          accumulator -= STEP / 1000;
        }
      } else accumulator = 0;
      render.draw(world);
      if (now - publish > 70) {
        state.current.onSnapshot(world.snapshot());
        publish = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const down = (e: PointerEvent) => {
      if (state.current.paused || e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      node.focus({ preventScroll: true });
      void audio.unlock().catch(() => {});
      if (world.phase === 'flying') {
        world.useAbility();
        return;
      }
      const p = render.point(e.clientX, e.clientY),
        b = world.active.body.position;
      if (
        (world.phase === 'ready' || world.phase === 'aiming') &&
        Math.hypot(p.x - b.x, p.y - b.y) < 90
      ) {
        dragging = true;
        node.setPointerCapture(e.pointerId);
        world.aim(p.x, p.y);
      }
    };
    const move = (e: PointerEvent) => {
      if (!dragging || state.current.paused) return;
      const p = render.point(e.clientX, e.clientY);
      world.aim(p.x, p.y);
      if (performance.now() - pullTick > 90) {
        audio.pull(world.power);
        pullTick = performance.now();
      }
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
      if (state.current.paused) world.cancelAim();
      else world.release();
    };
    const cancel = () => {
      dragging = false;
      world.cancelAim();
    };
    const key = (e: KeyboardEvent) => {
      if (
        state.current.paused ||
        ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      )
        return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key))
        e.preventDefault();
      if (e.repeat && e.key === ' ') return;
      if (e.key === ' ') {
        void audio.unlock().catch(() => {});
        if (world.phase === 'flying') world.useAbility();
        else {
          if (world.phase === 'ready') world.aim(WORLD.sling.x - 94, WORLD.sling.y + 47);
          world.release();
        }
      }
      if (e.key.startsWith('Arrow') && (world.phase === 'ready' || world.phase === 'aiming')) {
        if (world.phase === 'ready') world.aim(WORLD.sling.x - 75, WORLD.sling.y + 40);
        const p = world.active.body.position;
        world.aim(
          p.x + (e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0),
          p.y + (e.key === 'ArrowUp' ? -5 : e.key === 'ArrowDown' ? 5 : 0),
        );
      }
    };
    const visibility = () => {
      if (document.hidden) {
        cancel();
        state.current.onBlur();
      }
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', cancel);
    node.addEventListener('lostpointercapture', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', visibility);
      world.dispose();
      render.dispose();
      worldRef.current = null;
    };
  }, [level, audio]);
  return (
    <canvas
      ref={canvas}
      className="game-canvas"
      tabIndex={0}
      aria-label="弹弓游戏场景。拖动小鸟松手发射；也可用方向键瞄准、空格发射或使用技能。"
    />
  );
});
