import { ControlsGuide } from './Controls.jsx';
import { QUALITY_OPTIONS } from './settings.js';

/**
 * 受控设置面板：滑块把数值交给 changeSetting，由适配器统一应用与保存。
 * 按钮通过 data-* 交给宿主委托，保持全屏/音频操作处于原生点击上下文。
 * settings.volume 使用 0～1，音量滑块显示 0～100；fov 的单位为度。
 */
export function SettingsPanel({ state, settings, qualityName, changeSetting }) {
  // auto 没有独立画质按钮，当前设备实际选中的档位用于高亮与说明。
  const selectedQuality = settings.quality === 'auto' ? qualityName : settings.quality;
  return (
    <div
      className="panel"
      role="dialog"
      aria-modal="true"
      aria-label="Settings and controls"
      tabIndex={-1}
      hidden={!state.panelOpen}
    >
      <header className="panel-h">
        <div className="tabs" role="tablist">
          <button
            className="tab"
            role="tab"
            data-tab="settings"
            aria-selected={state.tab === 'settings'}
          >
            Settings
          </button>
          <button
            className="tab"
            role="tab"
            data-tab="controls"
            aria-selected={state.tab === 'controls'}
          >
            Controls
          </button>
        </div>
        <button className="btn small" data-act="close-panel">
          Close
        </button>
      </header>
      <div className="panel-b" data-pane="settings" hidden={state.tab !== 'settings'}>
        <div className="row">
          <label id="l-q">Graphics quality</label>
          <div className="seg" role="group" aria-labelledby="l-q">
            {QUALITY_OPTIONS.map((quality) => (
              <button key={quality} data-q={quality} aria-pressed={quality === selectedQuality}>
                {quality}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <label htmlFor="s-sens">Mouse sensitivity</label>
          <div className="slider">
            <input
              id="s-sens"
              type="range"
              min="0.2"
              max="3"
              step="0.05"
              value={settings.sens}
              onChange={(event) => changeSetting('sens', +event.target.value)}
            />
            <output data-o="sens">{settings.sens.toFixed(2)}×</output>
          </div>
        </div>
        <div className="row">
          <label id="l-inv">Invert Y</label>
          <button
            className="toggle"
            data-act="invert"
            aria-labelledby="l-inv"
            aria-pressed={settings.invertY}
          >
            <i />
            <span>{settings.invertY ? 'On' : 'Off'}</span>
          </button>
        </div>
        <div className="row">
          <label htmlFor="s-vol">Master volume</label>
          <div className="slider">
            <input
              id="s-vol"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(settings.volume * 100)}
              onChange={(event) => changeSetting('volume', +event.target.value / 100)}
            />
            <output data-o="vol">{Math.round(settings.volume * 100)}%</output>
          </div>
        </div>
        <div className="row">
          <label htmlFor="s-fov">Field of view</label>
          <div className="slider">
            <input
              id="s-fov"
              type="range"
              min="60"
              max="95"
              step="1"
              value={settings.fov}
              onChange={(event) => changeSetting('fov', +event.target.value)}
            />
            <output data-o="fov">{Math.round(settings.fov)}°</output>
          </div>
        </div>
        <div className="row" data-row="fs" hidden={!state.fullscreenAvailable}>
          <label id="l-fs">Display</label>
          <button className="btn small" data-act="fullscreen" aria-labelledby="l-fs fs-t">
            <span id="fs-t">{state.fullscreenLabel}</span>
          </button>
        </div>
        <p className="panel-note" data-f="qnote">
          {settings.quality === 'auto'
            ? `Quality was picked for this device (${selectedQuality || 'default'}). Lower it if the frame rate struggles.`
            : 'Quality changes apply at once; shadows and reflections may take a moment to rebuild.'}
        </p>
      </div>
      <div className="panel-b" data-pane="controls" hidden={state.tab !== 'controls'}>
        <ControlsGuide />
      </div>
    </div>
  );
}
