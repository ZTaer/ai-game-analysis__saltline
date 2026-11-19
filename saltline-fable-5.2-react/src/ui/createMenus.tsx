import type {
  MenuState,
  MenuScreen,
  SettingsTab,
  MenuActions,
  MenuStore,
  MenuContext,
  GameSettings,
  ChangeSetting,
  DeathResult,
  DebriefResult,
} from './types.ts';
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { applySettings, formatTime, readSettings, saveSettings } from './settings.ts';
import {
  DebriefScreen,
  DeathScreen,
  LocationCard,
  PauseScreen,
  TitleScreen,
} from './MenuScreens.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';

// React 订阅的是菜单快照；context 中的逐帧玩家/武器状态不会触发这个 store。
function MenuContents({
  store,
  context,
  settings,
  changeSetting,
}: {
  store: MenuStore;
  context: MenuContext;
  settings: GameSettings;
  changeSetting: ChangeSetting;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <>
      <div className="m-veil" />
      <div className="m-bars">
        <i />
        <i />
      </div>
      <TitleScreen />
      <PauseScreen lookMode={state.lookMode} />
      <DeathScreen result={state.dead} />
      <DebriefScreen result={state.debrief} />
      <SettingsPanel
        state={state}
        settings={settings}
        qualityName={context.quality?.name}
        changeSetting={changeSetting}
      />
      <LocationCard visible={state.locationVisible} />
    </>
  );
}

/**
 * 把任务状态机的同步菜单接口衔接到 React。
 * JSX 管内容，宿主节点管显隐/焦点/原生点击；UI 本身不决定胜负与任务切换。
 *
 * @param {object} context 已创建输入、音频、渲染与玩家的游戏上下文。
 * @param {Object<string, Function>} actions 状态机提供的 deploy/resume/retry 等动作。
 * @returns {object} 菜单控制器；gameFlow 调用 show/setDead/setDebrief，运行时调用 dispose。
 */
export function createMenus(context: MenuContext, actions: MenuActions) {
  const host = document.createElement('div');
  host.className = 'menu';
  host.dataset.screen = 'none';
  document.getElementById('ui')!.appendChild(host);
  const settings = readSettings();
  const fullscreenTarget = document.getElementById('app') || document.documentElement;
  const fullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement || null;
  let state: MenuState = {
    screen: 'none',
    panelOpen: false,
    tab: 'settings',
    locationVisible: false,
    lookMode: '',
    dead: { time: 0, relays: 0, total: 3 },
    debrief: { time: 0, accuracy: 0, kills: 0, retries: 0, rating: 'Clean' },
    fullscreenAvailable: !!(
      fullscreenTarget &&
      ((fullscreenTarget.requestFullscreen as
        typeof fullscreenTarget.requestFullscreen | undefined) ||
        fullscreenTarget.webkitRequestFullscreen) &&
      document.fullscreenEnabled !== false &&
      document.webkitFullscreenEnabled !== false
    ),
    fullscreenLabel: 'Enter fullscreen',
  };
  let disposed = false;
  let previousFocus: HTMLElement | null = null;
  const focusTimers = new Set<ReturnType<typeof setTimeout>>();
  const subscribers = new Set<() => void>();
  // 每次更新都创建新快照，满足 useSyncExternalStore 按引用判断变化的约定。
  const store = {
    getSnapshot: () => state,
    subscribe(callback: () => void) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
  function update(patch: Partial<MenuState>) {
    if (disposed) return;
    state = { ...state, ...patch };
    host.dataset.screen = state.screen;
    host.classList.toggle('open', state.screen !== 'none');
    host.classList.toggle('panel-open', state.panelOpen);
    // 调用方紧接着可能查询控件并移动焦点，因此提交完成后再从 update 返回。
    flushSync(() => subscribers.forEach((callback) => callback()));
  }
  // 新设置通常复用这条链：修改值 → 应用到引擎 → 更新控件 → 保存偏好。
  function changeSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    settings[key] = value;
    applySettings(context, settings, key);
    update({});
    saveSettings(settings);
  }
  function focusPrimary() {
    const button = host.querySelector<HTMLButtonElement>(
      `.m-screen[data-s="${state.screen}"] .btn.primary`,
    );
    try {
      button?.focus({ preventScroll: true });
    } catch {}
  }
  function restoreFocus() {
    if (previousFocus?.focus && host.contains(previousFocus)) previousFocus.focus();
    else focusPrimary();
  }
  function openPanel(tab: SettingsTab = 'settings') {
    previousFocus = document.activeElement as HTMLElement | null;
    update({ panelOpen: true, tab });
    try {
      host.querySelector<HTMLElement>('.panel')!.focus({ preventScroll: true });
    } catch {}
  }
  // 返回是否真正关闭了面板，供暂停逻辑决定同一次 Esc 是否还应恢复游戏。
  function closePanel() {
    if (!state.panelOpen) return false;
    update({ panelOpen: false });
    restoreFocus();
    return true;
  }
  function unavailableFullscreen() {
    update({ fullscreenLabel: 'Fullscreen is not available here' });
  }
  function toggleFullscreen() {
    try {
      if (fullscreenElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen)!.call(document);
        return;
      }
      const request = (fullscreenTarget.requestFullscreen ||
        fullscreenTarget.webkitRequestFullscreen)!.call(fullscreenTarget);
      request?.catch?.(unavailableFullscreen);
    } catch {
      unavailableFullscreen();
    }
  }
  function onFullscreenChange() {
    update({
      fullscreenLabel: fullscreenElement() ? 'Exit fullscreen' : 'Enter fullscreen',
    });
  }
  // 保留宿主上的原生点击委托：鼠标锁定、全屏与音频恢复需要用户操作触发。
  // data-act/data-tab/data-q 是 JSX 与此处路由的协议；改按钮标识需同步分支。
  function onClick(event: MouseEvent) {
    const button = (event.target as Element).closest('button');
    if (!button || !host.contains(button)) return;
    context.events.emit('ui:click', {});
    if (button.dataset.q as GameSettings['quality'])
      return changeSetting('quality', button.dataset.q as GameSettings['quality']);
    if (button.dataset.tab) return update({ tab: button.dataset.tab as SettingsTab });
    const action = button.dataset.act as
      | keyof MenuActions
      | 'settings'
      | 'controls'
      | 'close-panel'
      | 'invert'
      | 'fullscreen'
      | undefined;
    if (action === 'settings' || action === 'controls') openPanel(action);
    else if (action === 'close-panel') closePanel();
    else if (action === 'invert') changeSetting('invertY', !settings.invertY);
    else if (action === 'fullscreen') toggleFullscreen();
    else if (action && actions[action]) actions[action]!(event);
  }
  function onMouseOver(event: MouseEvent) {
    const button = (event.target as Element).closest('button');
    if (button && event.relatedTarget && !button.contains(event.relatedTarget as Node))
      context.events.emit('ui:hover', {});
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.code === 'Escape' && state.panelOpen) {
      closePanel();
      event.stopPropagation();
      event.preventDefault();
    }
    // 只在当前可见面板内循环焦点，避免 Tab 落入隐藏页面或背后的游戏画布。
    if (event.code === 'Tab' && state.panelOpen) {
      const focusable = [
        ...host
          .querySelector<HTMLElement>('.panel')!
          .querySelectorAll<HTMLElement>('button, input'),
      ].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    }
  }

  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <MenuContents
        store={store}
        context={context}
        settings={settings}
        changeSetting={changeSetting}
      />,
    ),
  );
  host.addEventListener('click', onClick);
  host.addEventListener('mouseover', onMouseOver);
  host.addEventListener('keydown', onKeyDown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  return {
    root: host,
    settings,
    fmtTime: formatTime,
    get screen() {
      return state.screen;
    },
    get panelOpen() {
      return state.panelOpen;
    },
    closePanel,
    /** 切换已有页面，保留设置；延迟聚焦用于等待显隐样式生效。 */
    show(screen: MenuScreen) {
      if (screen === state.screen) return;
      const wasPanelOpen = state.panelOpen;
      update({ screen, panelOpen: false });
      if (wasPanelOpen) restoreFocus();
      if (screen !== 'none') {
        const timer = setTimeout(() => {
          focusTimers.delete(timer);
          if (!disposed) focusPrimary();
        }, 30);
        focusTimers.add(timer);
      } else if (document.activeElement && host.contains(document.activeElement))
        (document.activeElement as HTMLElement).blur();
    },
    locationCard(visible: boolean) {
      update({ locationVisible: !!visible });
    },
    setLookMode(lookMode: string) {
      update({ lookMode: lookMode || '' });
    },
    setDead(result: DeathResult) {
      update({ dead: result });
    },
    setDebrief(result: DebriefResult) {
      update({ debrief: result });
    },
    applySettings(changed?: keyof GameSettings) {
      applySettings(context, settings, changed);
    },
    // 宿主事件、全屏事件及焦点计时器属于此菜单实例，必须与 React 根一起释放。
    dispose() {
      if (disposed) return;
      disposed = true;
      focusTimers.forEach(clearTimeout);
      focusTimers.clear();
      host.removeEventListener('click', onClick);
      host.removeEventListener('mouseover', onMouseOver);
      host.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      root.unmount();
      host.remove();
      subscribers.clear();
    },
  };
}
