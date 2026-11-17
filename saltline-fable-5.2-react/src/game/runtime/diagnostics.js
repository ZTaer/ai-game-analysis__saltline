/** 收集原版 __errors/__fatal 调试状态；保留 console 输出，并只恢复自己安装的 console.error 包装。 */
import { listen } from './resources.js';
export function installDiagnostics(originalConsoleError) {
  window.__frames = 0;
  window.__ready = false;
  window.__fatal = null;
  window.__errors = [];
  function reportFatal(error) {
    window.__fatal = String(error);
    console.error('[fatal] ' + error);
    let panel = document.getElementById('fatal');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'fatal';
      document.getElementById('app').appendChild(panel);
    }
    panel.textContent = 'Saltline could not start: ' + error;
  }
  listen(window, 'error', (i) => {
    window.__errors.push(String(i.message));
  });
  {
    let i = originalConsoleError.bind(console);
    console.error = (...e) => {
      try {
        window.__errors.push(
          e
            .map((t) => (t && t.stack) || String(t))
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
