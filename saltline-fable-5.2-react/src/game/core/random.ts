export interface Random {
  (): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(values: readonly T[]): T;
  sign(): number;
  fork(): Random;
}
/**
 * Saltline / core/random
 * 可复现的伪随机序列；地图/模型生成依赖种子与调用顺序。
 */
/**
 * @param {number} [i=1337] 转换为无符号 32 位整数的初始种子。
 * @returns {Function} 每次返回 [0, 1)；附带 range/int/pick/sign/fork 方法。
 * range(min,max) 不含最大值，int(min,max) 包含两端；pick 要求非空数组。
 * fork 会消耗父序列一次，再返回独立子序列；重排生成调用会改变程序化资源外观。
 */
function createRandom(i = 1337): Random {
  let e = i >>> 0,
    t = (() => {
      ((e |= 0), (e = (e + 1831565813) | 0));
      let n = Math.imul(e ^ (e >>> 15), 1 | e);
      return (
        (n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n),
        ((n ^ (n >>> 14)) >>> 0) / 4294967296
      );
    }) as Random;
  return (
    (t.range = (n: number, s: number) => n + (s - n) * t()),
    (t.int = (n: number, s: number) => Math.floor(n + (s - n + 1) * t())),
    (t.pick = <T>(n: readonly T[]) => n[Math.floor(t() * n.length)]),
    (t.sign = () => (t() < 0.5 ? -1 : 1)),
    (t.fork = () => createRandom(Math.floor(t() * 4294967296))),
    t
  );
}
export { createRandom };
