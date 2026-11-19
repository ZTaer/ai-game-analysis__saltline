import type { BootScreen } from '../types.ts';
/**
 * 加载界面适配器：更新文本与阶段进度，并让出一个浏览器任务供页面绘制。
 * 此处故意使用原生 setTimeout：卸载后 Promise 也必须结算，随后 assertActive 才能终止后续创建并释放资源。
 */
export function createBootScreen(assertActive: () => void): BootScreen {
  const element = document.getElementById('boot')!;
  const bootMessage = document.getElementById('boot-msg');
  const bootFill = document.getElementById('boot-fill');
  const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  async function updateBootProgress(message: string, progress: number) {
    assertActive();
    if (bootMessage) {
      bootMessage.textContent = message;
    }
    if (bootFill) {
      bootFill.style.width = Math.round(progress * 100) + '%';
    }
    await nextTask();
    assertActive();
  }
  return {
    element,
    update: updateBootProgress,
  };
}
