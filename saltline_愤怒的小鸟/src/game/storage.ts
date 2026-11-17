export interface Progress {
  best: number[];
  stars: number[];
  unlocked: number;
}
const key = 'green-valley.progress.v1';
export function readProgress(): Progress {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      best: Array.from({ length: 6 }, (_, i) => Math.max(0, Number(v.best?.[i]) || 0)),
      stars: Array.from({ length: 6 }, (_, i) =>
        Math.min(3, Math.max(0, Number(v.stars?.[i]) || 0)),
      ),
      unlocked: Math.min(5, Math.max(0, Math.floor(Number(v.unlocked) || 0))),
    };
  } catch {
    return { best: [], stars: [], unlocked: 0 };
  }
}
export function saveResult(level: number, score: number, stars: number): Progress {
  const p = readProgress();
  p.best[level] = Math.max(p.best[level] || 0, score);
  p.stars[level] = Math.max(p.stars[level] || 0, stars);
  p.unlocked = Math.max(p.unlocked, Math.min(5, level + 1));
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    /* Private mode still permits play. */
  }
  return p;
}
