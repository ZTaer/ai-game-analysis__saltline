// 展示注册表使用 getter 保留实时绑定；读取时取得导出值，避免在注册时提前求值。
export function defineExports(target, entries) {
  for (const key in entries)
    Object.defineProperty(target, key, { get: entries[key], enumerable: true });
}
