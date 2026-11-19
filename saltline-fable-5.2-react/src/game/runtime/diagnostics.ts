/** 收集原版 __errors/__fatal 调试状态；保留 console 输出，并只恢复自己安装的 console.error 包装。 */
import { listen } from './resources.ts';
export function installDiagnostics(originalConsoleError: typeof console.error) {
  window.__frames = 0;
  window.__ready = false;
  window.__fatal = null;
  window.__errors = [];
  function reportFatal(error: unknown) {
    window.__fatal = String(error);
    console.error('[fatal] ' + error);
    let panel = document.getElementById('fatal');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'fatal';
      document.getElementById('app')!.appendChild(panel);
    }
    panel.textContent = 'Saltline could not start: ' + error;
  }
  listen(window, 'error', (i: ErrorEvent) => {
    window.__errors.push(String(i.message));
  });
  {
    let i = originalConsoleError.bind(console);
    console.error = (...e: unknown[]) => {
      try {
        window.__errors.push(
          e
            .map((t) => (t && (t as { stack?: unknown }).stack) || String(t))
            .join(' ')
            .slice(0, 400),
        );
      } catch {}
      i(...e);
    };
  }
  const capturedConsoleError = console.error;
  return {
    reportFatal,
    restoreConsole() {
      if (console.error === capturedConsoleError) console.error = originalConsoleError;
    },
  };
}
