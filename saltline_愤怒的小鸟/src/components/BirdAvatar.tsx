import { useEffect, useRef } from 'react';
import { drawBird } from '../game/render';
import type { BirdKind } from '../game/types';
export default function BirdAvatar({ kind, size = 52 }: { kind: BirdKind; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!.getContext('2d')!;
    c.clearRect(0, 0, 128, 128);
    drawBird(c, 65, 70, 38, kind);
  }, [kind]);
  return (
    <canvas
      aria-hidden="true"
      ref={ref}
      width={128}
      height={128}
      style={{ width: size, height: size }}
    />
  );
}
