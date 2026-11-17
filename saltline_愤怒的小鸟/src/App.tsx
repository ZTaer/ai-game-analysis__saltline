import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  Check,
  CircleHelp,
  Crosshair,
  Expand,
  Flag,
  Grid2X2,
  House,
  LockKeyhole,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Star,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { GameCanvas } from './components/GameCanvas';
import type { GameHandle } from './components/GameCanvas';
import BirdAvatar from './components/BirdAvatar';
import TitleScreen from './components/TitleScreen';
import { LEVELS } from './game/levels';
import { BIRDS } from './game/types';
import type { Snapshot } from './game/types';
import { SynthAudio } from './game/audio';
import { readProgress, saveResult } from './game/storage';
type Panel = 'levels' | 'help' | 'settings' | null;
const initial: Snapshot = {
  phase: 'ready',
  score: 0,
  pigs: 2,
  totalPigs: 2,
  birdIndex: 0,
  birds: ['red', 'red', 'red'],
  ability: false,
  stars: 0,
  power: 0,
};
function Stars({ count = 0, large = false }: { count?: number; large?: boolean }) {
  return (
    <span className={`stars ${large ? 'large' : ''}`}>
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          size={large ? 45 : 16}
          className={n <= count ? 'filled' : ''}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}
export default function App() {
  const [titleScreen, setTitleScreen] = useState(true),
    [level, setLevel] = useState(0),
    [round, setRound] = useState(0),
    [snapshot, setSnapshot] = useState<Snapshot>(initial),
    [paused, setPaused] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [progress, setProgress] = useState(readProgress),
    [volume, setVolume] = useState(0.55),
    [muted, setMuted] = useState(false),
    [full, setFull] = useState(false),
    [notice, setNotice] = useState('');
  const audioRef = useRef<SynthAudio | null>(null);
  if (!audioRef.current) audioRef.current = new SynthAudio();
  const audio = audioRef.current;
  const game = useRef<GameHandle>(null),
    stage = useRef<HTMLDivElement>(null),
    saved = useRef(false),
    dialog = useRef<HTMLDivElement>(null);
  const data = LEVELS[level],
    ended = snapshot.phase === 'won' || snapshot.phase === 'lost',
    modalOpen = !!panel || paused || ended;
  const currentBird = data.birds[snapshot.birdIndex] || 'red';
  const restart = useCallback(() => {
    saved.current = false;
    setRound((n) => n + 1);
    setTitleScreen(false);
    setPaused(false);
    setPanel(null);
    setSnapshot({
      ...initial,
      birds: LEVELS[level].birds,
      totalPigs: LEVELS[level].pigs.length,
      pigs: LEVELS[level].pigs.length,
    });
  }, [level]);
  const select = (n: number) => {
    void audio.unlock().catch(() => {});
    setTitleScreen(false);
    saved.current = false;
    setLevel(n);
    setRound((r) => r + 1);
    setSnapshot({
      ...initial,
      birds: LEVELS[n].birds,
      totalPigs: LEVELS[n].pigs.length,
      pigs: LEVELS[n].pigs.length,
    });
    setPanel(null);
    setPaused(false);
  };
  const receive = useCallback((s: Snapshot) => setSnapshot(s), []);
  useEffect(() => {
    if (snapshot.phase === 'won' && !saved.current) {
      saved.current = true;
      setProgress(saveResult(level, snapshot.score, snapshot.stars));
    }
  }, [snapshot.phase, snapshot.score, snapshot.stars, level]);
  useEffect(() => {
    audio.setVolume(volume);
    audio.setMuted(muted);
  }, [volume, muted, audio]);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.code === 'Escape') {
        if (panel) setPanel(null);
        else if (!ended && !titleScreen) setPaused((v) => !v);
      }
      if (e.code === 'KeyP' && !panel && !ended && !titleScreen) setPaused((v) => !v);
      if (e.code === 'KeyR' && !panel && !titleScreen) restart();
      if (e.code === 'KeyF' && !e.repeat) void fullscreen();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [panel, ended, restart, titleScreen]);
  useEffect(() => {
    if (!modalOpen) return;
    const before = document.activeElement as HTMLElement;
    const id = requestAnimationFrame(() =>
      dialog.current?.querySelector<HTMLElement>('button')?.focus(),
    );
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialog.current) return;
      const items = Array.from(
        dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]'),
      );
      if (!items.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', trap);
      before?.focus?.({ preventScroll: true });
    };
  }, [modalOpen, panel]);
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      setNotice('当前浏览器不支持全屏，请使用浏览器全屏模式。');
      setTimeout(() => setNotice(''), 4000);
    }
  };
  const begin = () => {
    void audio.unlock().catch(() => {});
    restart();
    setTimeout(() => stage.current?.querySelector<HTMLCanvasElement>('.game-canvas')?.focus(), 0);
  };
  const home = () => {
    setPanel(null);
    setPaused(false);
    setTitleScreen(true);
  };
  const toggleMute = () => {
    void audio.unlock().catch(() => {});
    setMuted((v) => !v);
  };
  const closePanel = () => setPanel(null);
  return (
    <main className="app-shell">
      <div
        className={`game-stage ${titleScreen ? 'at-title' : ''} ${modalOpen ? 'has-dialog' : ''}`}
        ref={stage}
      >
        <GameCanvas
          key={`${level}:${round}`}
          level={level}
          paused={titleScreen || paused || !!panel || ended}
          audio={audio}
          onSnapshot={receive}
          onBlur={() => {
            if (!titleScreen && !ended) setPaused(true);
          }}
          ref={game}
        />
        <div className="stage-vignette" />
        {!titleScreen && (
          <>
            <div className="stage-top">
              <div className="level-tag">
                <span className="level-number">{String(level + 1).padStart(2, '0')}</span>
                <span>
                  <small>GREEN VALLEY</small>
                  <strong>{data.name}</strong>
                </span>
              </div>
              <div className="scoreboard">
                <div>
                  <small>本局得分</small>
                  <strong>{String(snapshot.score).padStart(5, '0')}</strong>
                </div>
                <span className="score-divider" />
                <div className="target-count">
                  <Target size={20} />
                  <span>
                    <strong>
                      {snapshot.totalPigs - snapshot.pigs}
                      <i> / {snapshot.totalPigs}</i>
                    </strong>
                    <small>目标已清除</small>
                  </span>
                </div>
              </div>
              <div className="stage-actions">
                <button onClick={() => setPanel('levels')} aria-label="关卡地图" title="关卡地图">
                  <Grid2X2 />
                </button>
                <button
                  onClick={toggleMute}
                  aria-label={muted ? '开启声音' : '关闭声音'}
                  title="声音"
                >
                  {muted ? <VolumeX /> : <Volume2 />}
                </button>
                <button onClick={restart} aria-label="重新开始" title="重新开始 · R">
                  <RotateCcw />
                </button>
                <button onClick={() => setPaused(true)} aria-label="暂停游戏" title="暂停 · P">
                  <Pause />
                </button>
                <button
                  className="fullscreen-button"
                  onClick={fullscreen}
                  aria-label="切换全屏"
                  title="全屏"
                >
                  {full ? <Maximize2 /> : <Expand />}
                </button>
              </div>
            </div>
            <div className="stage-bottom">
              <div className="flock-hud" aria-label="剩余小鸟">
                <div className="bird-roster">
                  {data.birds.map((bird, i) => (
                    <div
                      key={i}
                      className={`bird-slot ${i === snapshot.birdIndex ? 'active' : ''} ${i < snapshot.birdIndex ? 'used' : ''}`}
                      title={BIRDS[bird].name}
                    >
                      <BirdAvatar kind={bird} size={44} />
                      {i < snapshot.birdIndex && <Check size={13} />}
                    </div>
                  ))}
                </div>
                <span className="flock-name">
                  {BIRDS[currentBird].name}
                  <small>{BIRDS[currentBird].title}</small>
                </span>
              </div>
              <div className="play-hint">
                {snapshot.phase === 'ready' ? (
                  <>
                    <MousePointer2 size={15} />
                    <span>拖住小鸟 · 向后拉 · 松手发射</span>
                  </>
                ) : snapshot.phase === 'aiming' ? (
                  <>
                    <Crosshair size={16} />
                    <span>发射力度</span>
                    <span className="power-meter">
                      <i style={{ width: `${snapshot.power * 100}%` }} />
                    </span>
                    <b>{Math.round(snapshot.power * 100)}%</b>
                  </>
                ) : snapshot.ability ? (
                  <button className="ability-prompt" onClick={() => game.current?.ability()}>
                    <Zap size={16} />
                    {currentBird === 'bomb' ? '点击引爆' : '点击加速'}
                    <kbd>SPACE</kbd>
                  </button>
                ) : snapshot.phase === 'flying' ? (
                  <>
                    <Sparkles size={16} />
                    <span>让重力，完成剩下的事。</span>
                  </>
                ) : (
                  <span>这一发，值得回味。</span>
                )}
              </div>
              <button
                className="help-trigger"
                onClick={() => setPanel('help')}
                aria-label="玩法指南"
                title="玩法指南"
              >
                <CircleHelp size={19} />
                <span>玩法</span>
              </button>
            </div>
          </>
        )}
        {titleScreen && (
          <TitleScreen
            level={level}
            muted={muted}
            full={full}
            onStart={begin}
            onLevels={() => setPanel('levels')}
            onSettings={() => setPanel('settings')}
            onHelp={() => setPanel('help')}
            onMute={toggleMute}
            onFullscreen={() => void fullscreen()}
          />
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {modalOpen && (
          <div className="modal-backdrop">
            <div
              className={`dialog ${panel === 'levels' ? 'wide' : ''}`}
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dialog-title"
            >
              {panel ? (
                <>
                  <button
                    className="dialog-close icon-button"
                    onClick={closePanel}
                    aria-label="关闭窗口"
                  >
                    <X size={20} />
                  </button>
                  {panel === 'levels' ? (
                    <>
                      <span className="dialog-kicker">EXPLORE THE VALLEY</span>
                      <h2 id="dialog-title">下一站，去哪里？</h2>
                      <p>六片风景，六座堡垒。每一次发射，都有新的可能。</p>
                      <div className="level-grid">
                        {LEVELS.map((l, i) => {
                          const locked = i > progress.unlocked;
                          return (
                            <button
                              key={l.name}
                              className={`level-card ${i === level ? 'selected' : ''}`}
                              disabled={locked}
                              onClick={() => select(i)}
                            >
                              <div className={`level-art art-${i}`}>
                                <span className="mini-sun" />
                                <div className="mini-hill" />
                                <span className="mini-tower">▥</span>
                                <b>{String(i + 1).padStart(2, '0')}</b>
                                {locked && (
                                  <span className="lock">
                                    <LockKeyhole size={22} />
                                  </span>
                                )}
                              </div>
                              <span className="level-card-body">
                                <strong>
                                  {l.name}
                                  {i === level && <Check size={14} />}
                                </strong>
                                <span>
                                  <Stars count={progress.stars[i] || 0} />
                                  <small>
                                    {locked
                                      ? '通关前一关解锁'
                                      : progress.best[i]
                                        ? `${progress.best[i].toLocaleString()} 分`
                                        : '等待你的第一发'}
                                  </small>
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="map-progress">
                        <Flag size={16} /> 已完成 {progress.stars.filter((n) => n > 0).length} / 6
                        关{' '}
                        <span>
                          <Star size={15} /> {progress.stars.reduce((a, b) => a + b, 0)} / 18
                        </span>
                      </div>
                    </>
                  ) : panel === 'settings' ? (
                    <>
                      <span className="dialog-kicker">MAKE YOURSELF AT HOME</span>
                      <h2 id="dialog-title">听见每一次碰撞</h2>
                      <p>弹弓的回弹、木头的碎裂，还有胜利的小小旋律。</p>
                      <div className="sound-visual">
                        <AudioLines size={62} strokeWidth={1} />
                      </div>
                      <label className="volume-label" htmlFor="volume">
                        <span>音效音量</span>
                        <b>{Math.round(volume * 100)}%</b>
                      </label>
                      <input
                        id="volume"
                        aria-label="音效音量"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(e) => {
                          void audio.unlock().catch(() => {});
                          setVolume(Number(e.target.value));
                        }}
                      />
                      <button className="setting-row" onClick={toggleMute}>
                        <span>
                          {muted ? <VolumeX size={19} /> : <Volume2 size={19} />} 游戏声音
                        </span>
                        <span className={`toggle ${muted ? '' : 'on'}`}>
                          <i />
                        </span>
                      </button>
                      <p className="small-note">音效在浏览器中实时合成，无需下载音频素材。</p>
                      <button
                        className="primary-button"
                        onClick={() => {
                          void audio
                            .unlock()
                            .then(() => audio.launch())
                            .catch(() => {});
                        }}
                      >
                        试听弹弓音效 <Volume2 size={17} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="dialog-kicker">A LITTLE FIELD GUIDE</span>
                      <h2 id="dialog-title">瞄准。松手。好戏开场。</h2>
                      <p>清除全部绿猪即可过关。剩余每只小鸟额外奖励 10,000 分。</p>
                      <div className="help-steps">
                        <div>
                          <b>01</b>
                          <span>
                            <strong>拉开弹弓</strong>
                            <small>
                              按住小鸟向后拖动，虚线预览弹道。松手即可发射。手机竖屏会自动横向显示，横放手机即可正常横屏操作。
                            </small>
                          </span>
                        </div>
                        <div>
                          <b>02</b>
                          <span>
                            <strong>找准薄弱处</strong>
                            <small>击中支柱，利用重力与连锁倒塌。玻璃易碎，石头最坚硬。</small>
                          </span>
                        </div>
                        <div>
                          <b>03</b>
                          <span>
                            <strong>抓住出手时机</strong>
                            <small>黄色小鸟点击加速；黑色小鸟点击爆炸，撞击后也会自动引爆。</small>
                          </span>
                        </div>
                      </div>
                      <div className="keyboard-guide">
                        <span>
                          <kbd>← ↑ ↓ →</kbd> 调整拉弓
                        </span>
                        <span>
                          <kbd>空格</kbd> 发射 / 技能
                        </span>
                        <span>
                          <kbd>P</kbd> 暂停
                        </span>
                        <span>
                          <kbd>R</kbd> 重试
                        </span>
                      </div>
                      <button className="primary-button" onClick={closePanel}>
                        准备好出发 <ArrowRight size={18} />
                      </button>
                    </>
                  )}
                </>
              ) : ended ? (
                <>
                  <span className="result-icon">
                    {snapshot.phase === 'won' ? (
                      <Trophy size={30} />
                    ) : (
                      <BirdAvatar kind={currentBird} size={62} />
                    )}
                  </span>
                  <span className="dialog-kicker">
                    {snapshot.phase === 'won' ? 'A LITTLE VICTORY' : 'ONE MORE SHOT'}
                  </span>
                  <h2 id="dialog-title">
                    {snapshot.phase === 'won'
                      ? level === 5
                        ? '鸟蛋，终于回家了！'
                        : '漂亮，堡垒拿下！'
                      : '差一点，再来一发。'}
                  </h2>
                  <p>{snapshot.phase === 'won' ? '每一只勇敢的小鸟，都值得一颗星。' : data.hint}</p>
                  {snapshot.phase === 'won' && <Stars count={snapshot.stars} large />}
                  <div className="result-score">
                    <small>本局得分</small>
                    <strong>{snapshot.score.toLocaleString()}</strong>
                    <span>历史最佳 {(progress.best[level] || 0).toLocaleString()}</span>
                  </div>
                  <div className="result-actions">
                    <button className="secondary-button" onClick={restart}>
                      <RotateCcw size={17} /> 再玩一次
                    </button>
                    {snapshot.phase === 'won' && level < 5 ? (
                      <button className="primary-button" onClick={() => select(level + 1)}>
                        下一片绿野 <ArrowRight size={17} />
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={() => (snapshot.phase === 'lost' ? restart() : setPanel('levels'))}
                      >
                        {snapshot.phase === 'lost' ? '再次挑战' : '回到关卡地图'}{' '}
                        <ArrowRight size={17} />
                      </button>
                    )}
                  </div>
                  <button className="text-button centered" onClick={() => setPanel('levels')}>
                    <Grid2X2 size={15} /> 查看关卡地图
                  </button>
                </>
              ) : (
                <>
                  <span className="result-icon">
                    <Pause size={28} />
                  </span>
                  <span className="dialog-kicker">TAKE A LITTLE BREATHER</span>
                  <h2 id="dialog-title">山谷，等你回来。</h2>
                  <p>休息一下，好点子总在放松的时候出现。</p>
                  <button className="primary-button" onClick={() => setPaused(false)}>
                    <Play size={17} /> 继续冒险
                  </button>
                  <div className="pause-actions">
                    <button className="text-button" onClick={restart}>
                      <RotateCcw size={16} /> 重新开始
                    </button>
                    <button className="text-button" onClick={() => setPanel('levels')}>
                      <Grid2X2 size={16} /> 关卡地图
                    </button>
                    <button className="text-button" onClick={() => setPanel('settings')}>
                      <Settings2 size={16} /> 声音设置
                    </button>
                    <button className="text-button" onClick={() => setPanel('help')}>
                      <CircleHelp size={16} /> 玩法指南
                    </button>
                    <button className="text-button" onClick={home}>
                      <House size={16} /> 返回主菜单
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="sr-only" aria-live="polite">
        {ended
          ? snapshot.phase === 'won'
            ? `过关，获得${snapshot.stars}颗星，${snapshot.score}分`
            : '挑战结束，可以重新开始'
          : ''}
      </div>
    </main>
  );
}
