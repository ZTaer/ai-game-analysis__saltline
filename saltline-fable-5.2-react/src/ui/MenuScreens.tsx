import type { DeathResult, DebriefResult } from './types.ts';
/** 菜单页面：标题、暂停、死亡、结算和地点卡；显示状态由 createMenus 管理。 */
import { ControlsLegend } from './Controls.tsx';
import { formatTime } from './settings.ts';

// data-s 对应菜单状态，data-act 交给 createMenus 路由；页面只描述内容与结构。
export function TitleScreen() {
  return (
    <section className="m-screen m-title" data-s="title" aria-label="Saltline">
      <div className="m-title-main">
        <div className="m-eyebrow">
          <span className="m-tag">B4</span>
          <span>Port Authority Breach Unit</span>
          <span className="m-dim">Saltline Terminal · 05:42</span>
        </div>
        <h1 className="m-word">SALTLINE</h1>
        <p className="m-premise">
          The port’s security net has gone feral. Cut its three uplinks. Reach the boat.
        </p>
        <div className="m-actions">
          <button className="btn primary" data-act="deploy">
            Deploy
          </button>
          <button className="btn" data-act="settings">
            Settings
          </button>
          <button className="btn m-only-narrow" data-act="controls">
            Controls
          </button>
        </div>
        <p className="m-note">
          Every surface, machine and sound is generated in your browser. Nothing is downloaded.
        </p>
      </div>
      <ControlsLegend />
      <p className="m-studio-credit" lang="zh-CN">
        万我工作室 · React 工程化重构与维护
      </p>
    </section>
  );
}

/** @param {{lookMode: string}} props 输入系统提供的当前视角控制提示。 */
export function PauseScreen({ lookMode }: { lookMode: string }) {
  return (
    <section className="m-screen m-card" data-s="paused" aria-label="Paused">
      <div className="m-k">Operation on hold</div>
      <h2 className="m-h">Paused</h2>
      <p className="m-line" data-f="lookmode">
        {lookMode}
      </p>
      <div className="m-actions col">
        <button className="btn primary" data-act="resume">
          Resume
        </button>
        <button className="btn" data-act="settings">
          Settings
        </button>
        <button className="btn" data-act="controls">
          Controls
        </button>
        <button className="btn" data-act="restart">
          Restart mission
        </button>
      </div>
    </section>
  );
}

/** @param {{result: {time: number, relays: number, total: number}}} props 时间单位为秒。 */
export function DeathScreen({ result }: { result: DeathResult }) {
  return (
    <section className="m-screen m-card m-dead" data-s="dead" aria-label="Signal lost">
      <div className="m-k">Breacher down</div>
      <h2 className="m-h">Signal lost</h2>
      <dl className="m-stats">
        <div>
          <dt>Time survived</dt>
          <dd data-f="dead-time">{formatTime(result.time)}</dd>
        </div>
        <div>
          <dt>Relays cut</dt>
          <dd data-f="dead-relays">
            {result.relays}/{result.total}
          </dd>
        </div>
      </dl>
      <div className="m-actions col">
        <button className="btn primary" data-act="retry">
          Retry
        </button>
      </div>
    </section>
  );
}

/**
 * 结算数值与评级由任务状态机计算；accuracy 为 0～1，未开火时为 null。
 * 组件只负责显示，不在 React 更新时重新计算得分。
 */
export function DebriefScreen({ result }: { result: DebriefResult }) {
  return (
    <section className="m-screen m-card m-debrief" data-s="complete" aria-label="Debrief">
      <div className="m-k">Berth 4 · Debrief</div>
      <h2 className="m-h">Saltline is dark</h2>
      <div className="m-rating">
        <span>Rating</span>
        <b data-f="rating">{result.rating}</b>
      </div>
      <dl className="m-stats">
        <div>
          <dt>Time</dt>
          <dd data-f="time">{formatTime(result.time)}</dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd data-f="acc">
            {result.accuracy == null ? '—' : `${Math.round(result.accuracy * 100)}%`}
          </dd>
        </div>
        <div>
          <dt>Machines destroyed</dt>
          <dd data-f="kills">{result.kills}</dd>
        </div>
        <div>
          <dt>Retries</dt>
          <dd data-f="retries">{result.retries}</dd>
        </div>
      </dl>
      <div className="m-actions col">
        <button className="btn primary" data-act="redeploy">
          Redeploy
        </button>
      </div>
    </section>
  );
}

// 介绍阶段的位置字幕卡始终保留节点，用 class 切换以沿用 CSS 过渡。
export function LocationCard({ visible }: { visible: boolean }) {
  return (
    <div className={`loc-card${visible ? ' on' : ''}`} aria-hidden="true">
      <i />
      <b>Saltline Terminal · Berth 4 · 05:42</b>
      <span>Port Authority Breach Unit — one breacher, no backup</span>
    </div>
  );
}
