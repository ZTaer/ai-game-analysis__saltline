/**
 * Saltline / core/events
 * 游戏内同步事件总线：输入/战斗/任务发布事件，音频与 HUD 等系统订阅。
 */
/**
 * 回调按订阅顺序同步调用，共享同一个载荷对象；需要延迟处理的订阅者自行复制数据。
 * 某个回调抛错会记录错误并继续通知后续订阅者，避免一个反馈模块中断整次广播。
 * @returns {object} on 返回取消订阅函数；clear 用于整个游戏实例销毁。
 */
export interface EventBus<Events extends object = Record<string, unknown>> {
  clear(): void;
  on<K extends Extract<keyof Events, string>>(
    event: K,
    callback: (payload: Events[K]) => void,
  ): () => void;
  off<K extends Extract<keyof Events, string>>(
    event: K,
    callback: (payload: Events[K]) => void,
  ): void;
  emit<K extends Extract<keyof Events, string>>(event: K, payload: Events[K]): void;
}
function createEventBus<Events extends object = Record<string, unknown>>(): EventBus<Events> {
  // 存储层擦除不同事件载荷的类型；外部 on/emit 始终由同一个事件映射约束。
  let i = new Map<keyof Events, Array<(payload: never) => void>>();
  return {
    clear() {
      i.clear();
    },
    /** @param {string} e 事件名。@param {Function} t 接收事件载荷的回调。 */
    on(e, t) {
      return (
        i.has(e) || i.set(e, []),
        i.get(e)!.push(t as (payload: never) => void),
        () => this.off(e, t)
      );
    },
    off(e, t) {
      let n = i.get(e);
      if (n) {
        let s = n.indexOf(t as (payload: never) => void);
        s >= 0 && n.splice(s, 1);
      }
    },
    // 遍历原订阅数组而非副本；顺序及广播中订阅变动的语义沿用原版。
    emit(e, t) {
      let n = i.get(e);
      if (n)
        for (let s = 0; s < n.length; s++)
          try {
            n[s](t as never);
          } catch (o) {
            console.error(`[events] handler for "${e}" threw`, o);
          }
    },
  };
}
export { createEventBus };
