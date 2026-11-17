import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Crown,
  Diamond,
  Flame,
  Flower2,
  Heart,
  Leaf,
  Moon,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Shield,
  Snowflake,
  Sparkles,
  Sun,
  Swords,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { GameEngine } from "./game/engine";
import type { Season, Snapshot } from "./game/types";

const initial: Snapshot = {
  mode: "loading",
  season: "spring",
  ready: false,
  error: null,
  health: 100,
  maxHealth: 100,
  xp: 0,
  xpNext: 10,
  level: 1,
  time: 0,
  duration: 240,
  kills: 0,
  combo: 0,
  bestCombo: 0,
  damage: 0,
  dashCooldown: 0,
  pulseCooldown: 0,
  shrines: 0,
  shrineProgress: 0,
  nearShrine: false,
  bossHealth: 0,
  bossMaxHealth: 0,
  bossName: "",
  wave: 1,
  spells: [],
  choices: [],
  notification: "",
  muted: false,
  quality: "high",
  fps: 0,
  player: { x: 0, z: 0 },
  enemies: [],
  shrinePositions: [],
};
const chapters = {
  spring: {
    chapter: "第一章",
    title: "春生之庭",
    english: "THE BLOOMING SANCTUARY",
    symbol: "春",
    description: "花落无声。沉睡的古老咒语，却已苏醒。",
    detail: "苔石 · 花雨 · 失落圣所",
    theme: "花木之灵",
    epigraph: "让每一次新生，成为你的力量。",
  },
  winter: {
    chapter: "第二章",
    title: "凛冬遗迹",
    english: "THE FROZEN CATHEDRAL",
    symbol: "冬",
    description: "循着冰原的微光，唤醒长夜尽头的回响。",
    detail: "霜雪 · 冰晶 · 永夜回廊",
    theme: "永霜守望者",
    epigraph: "最寒冷的长夜，也有不灭的火。",
  },
};
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
function ArcaneMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M32 3 59 18v28L32 61 5 46V18L32 3Z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="m32 11 20 35H12L32 11Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="m32 53-20-35h40L32 53Z" stroke="currentColor" strokeWidth="1" />
      <circle cx="32" cy="32" r="10" stroke="currentColor" />
      <path d="M32 23v18m-9-9h18" stroke="currentColor" />
      <circle cx="32" cy="32" r="3" fill="currentColor" />
    </svg>
  );
}
function SpellIcon({ name, size = 22 }: { name: string; size?: number }) {
  const icons: Record<string, typeof Sparkles> = {
    bolt: Zap,
    frost: Snowflake,
    snow: Snowflake,
    orbit: Orbit,
    meteor: Flame,
    flame: Flame,
    chain: Zap,
    bloom: Flower2,
    heart: Heart,
    shield: Shield,
    speed: Wind,
    wind: Wind,
    damage: Swords,
    magnet: Orbit,
    heal: Heart,
    fire: Flame,
    ice: Snowflake,
    lightning: Zap,
    flower: Flower2,
    spark: Sparkles,
  };
  const key = Object.keys(icons).find((k) => name.toLowerCase().includes(k));
  const Icon = key ? icons[key] : Sparkles;
  return <Icon size={size} strokeWidth={1.5} />;
}
function MiniMap({ snapshot: s }: { snapshot: Snapshot }) {
  return (
    <div className="minimap" aria-label="关卡地图，菱形代表祭坛">
      <div className="map-label">
        <span>区域图</span>
        <span>N</span>
      </div>
      <svg
        viewBox="0 0 112 112"
        role="img"
        aria-label={`${s.shrines} 座祭坛已激活`}
      >
        <defs>
          <radialGradient id="map-shade">
            <stop offset="0" stopColor="#152e29" />
            <stop offset="1" stopColor="#0b1b19" />
          </radialGradient>
        </defs>
        <circle
          cx="56"
          cy="56"
          r="48"
          fill="url(#map-shade)"
          stroke="#c9c2a333"
        />
        <circle
          cx="56"
          cy="56"
          r="31"
          fill="none"
          stroke="#c9c2a31b"
          strokeDasharray="2 5"
        />
        <path d="M8 56h96M56 8v96" stroke="#c9c2a31b" />
        <path d="M56 11v5M11 56h5M96 56h5M56 96v5" stroke="#c9c2a388" />
        {s.enemies.slice(0, 80).map((e, i) => (
          <circle
            key={i}
            cx={56 + e.x * 1.95}
            cy={56 + e.z * 1.95}
            r="1.25"
            fill="#d7796c"
            opacity=".85"
          />
        ))}
        {s.shrinePositions.map((p, i) => (
          <g
            key={i}
            transform={`translate(${56 + p.x * 1.95},${56 + p.z * 1.95})`}
          >
            <path
              d="m0-4 4 4-4 4-4-4Z"
              fill={p.active ? "#d9bd75" : "#152722"}
              stroke={p.active ? "#ebd798" : "#cfccba"}
              strokeWidth="1.2"
            />
            {p.active && <circle r="1" fill="#12231c" />}
          </g>
        ))}
        <circle
          cx={56 + s.player.x * 1.95}
          cy={56 + s.player.z * 1.95}
          r="5"
          fill="#f5eed2"
          opacity=".16"
        />
        <circle
          cx={56 + s.player.x * 1.95}
          cy={56 + s.player.z * 1.95}
          r="2.2"
          fill="#f5eed2"
        />
      </svg>
      <span className="map-coordinate">
        {Math.round(s.player.x).toString().padStart(2, "0")} /{" "}
        {Math.round(s.player.z).toString().padStart(2, "0")}
      </span>
    </div>
  );
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<GameEngine | null>(null);
  const [s, setSnapshot] = useState<Snapshot>(initial);
  const [panel, setPanel] = useState<"guide" | "settings" | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, active: false });
  const [best, setBest] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      setBest(JSON.parse(localStorage.getItem("wildspell.best.v1") || "{}"));
    } catch {
      /* Storage is optional. */
    }
    let live = true;
    const instance = new GameEngine(canvas.current!, (snapshot) => {
      if (live) setSnapshot({ ...snapshot });
    });
    game.current = instance;
    instance
      .init()
      .then(async () => {
        if (
          live &&
          import.meta.env.DEV &&
          new URLSearchParams(location.search).has("qa")
        ) {
          const { runSmoke } = await import("./game/smoke");
          if (live) runSmoke(instance);
        }
      })
      .catch((e: unknown) => {
        if (live)
          setSnapshot((prev) => ({
            ...prev,
            error: e instanceof Error ? e.message : String(e),
            mode: "loading",
          }));
      });
    return () => {
      live = false;
      instance.dispose();
      if (game.current === instance) game.current = null;
    };
  }, []);
  useEffect(() => {
    if (s.mode !== "victory" && s.mode !== "dead") return;
    setBest((prev) => {
      const next = {
        ...prev,
        [s.season]: Math.max(prev[s.season] || 0, s.kills),
      };
      try {
        localStorage.setItem("wildspell.best.v1", JSON.stringify(next));
      } catch {
        /* Storage is optional. */
      }
      return next;
    });
  }, [s.mode, s.season, s.kills]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (panel && e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPanel(null);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [panel]);
  useEffect(() => {
    if (s.mode !== "playing") setStick({ x: 0, y: 0, active: false });
    const overlay = document.querySelector<HTMLElement>(".overlay:last-child");
    if (!overlay) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        overlay.querySelectorAll<HTMLElement>(
          'button:not(:disabled),[href],input,select,[tabindex="0"]',
        ),
      );
    const frame = requestAnimationFrame(() =>
      focusable()[0]?.focus({ preventScroll: true }),
    );
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !overlay.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !overlay.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trap, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", trap, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [s.mode, panel]);
  const start = (season = s.season) => {
    setPanel(null);
    game.current?.start(season);
  };
  const openPanel = (value: "guide" | "settings") => {
    if (s.mode === "playing") game.current?.pause();
    setPanel(value);
  };
  const select = (season: Season) => {
    if (s.season !== season) game.current?.selectSeason(season);
  };
  const joystick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / 38,
      y = (e.clientY - r.top - r.height / 2) / 38;
    const d = Math.hypot(x, y);
    if (d > 1) {
      x /= d;
      y /= d;
    }
    setStick({ x: x * 32, y: y * 32, active: true });
    game.current?.setTouchMove(x, y);
  };
  const releaseStick = () => {
    setStick({ x: 0, y: 0, active: false });
    game.current?.setTouchMove(0, 0);
  };
  const inGame = ["playing", "paused", "upgrade", "dead", "victory"].includes(
    s.mode,
  );
  const chapter = chapters[s.season];
  return (
    <main className={`game-shell season-${s.season} mode-${s.mode}`}>
      <canvas
        ref={canvas}
        className="world-canvas"
        aria-label="咒野三维游戏场景"
      />
      <div className="scene-vignette" />
      {s.mode === "loading" && (
        <div className="loading-screen">
          <div className="loading-seal">
            <ArcaneMark size={78} />
          </div>
          <span className="eyebrow">W I L D S P E L L</span>
          <h1>{s.error ? "旅途尚未开启" : "唤醒季节的回响"}</h1>
          {s.error ? (
            <>
              <p className="load-error">{s.error}</p>
              <button
                className="primary-button"
                onClick={() => location.reload()}
              >
                重新载入 <RotateCcw size={17} />
              </button>
              <p className="muted-copy">请使用支持 WebGL 2 的现代浏览器。</p>
            </>
          ) : (
            <>
              <p>石阶、花雨与古老咒语，正在苏醒。</p>
              <div className="loading-line">
                <i />
              </div>
            </>
          )}
        </div>
      )}

      {s.mode === "menu" && (
        <div className="title-screen">
          <header className="title-header">
            <div className="brand-lockup">
              <ArcaneMark size={31} />
              <span>
                WILDSPELL <em>CHRONICLES OF SEASONS</em>
              </span>
            </div>
            <div className="header-actions">
              <button
                className="text-button"
                onClick={() => openPanel("guide")}
              >
                <BookOpen size={15} />
                <span>旅人手记</span>
              </button>
              <button
                className="icon-button"
                aria-label="设置"
                onClick={() => openPanel("settings")}
              >
                <Settings2 size={18} />
              </button>
              <button
                className="icon-button"
                aria-label={s.muted ? "开启声音" : "关闭声音"}
                onClick={() => game.current?.setMuted(!s.muted)}
              >
                {s.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
          </header>
          <div className="title-content">
            <div className="overline">
              <span className="gold-line" /> 一场关于季节与咒语的远征
            </div>
            <h1 className="game-title">
              咒<span>野</span>
              <span className="game-title-en">WILDSPELL</span>
            </h1>
            <p className="title-description">
              以微光为引，以咒语为刃。
              <br />
              踏入失落的庭院，让荒野记住你的名字。
            </p>
            <div className="title-chapters-label">
              <span>选择你的旅程</span>
              <span>02 CHAPTERS</span>
            </div>
            <div className="chapter-select">
              {(["spring", "winter"] as Season[]).map((season, i) => (
                <button
                  key={season}
                  className={`chapter-card ${season} ${s.season === season ? "selected" : ""}`}
                  onClick={() => select(season)}
                  aria-pressed={s.season === season}
                >
                  <div className="chapter-card-top">
                    <span className="chapter-index">0{i + 1}</span>
                    {season === "spring" ? (
                      <Flower2 size={29} strokeWidth={1} />
                    ) : (
                      <Snowflake size={29} strokeWidth={1} />
                    )}
                  </div>
                  <div className="chapter-card-name">
                    <span>{chapters[season].title}</span>
                    {s.season === season ? (
                      <span className="selected-dot" />
                    ) : (
                      <ArrowUpRight size={14} />
                    )}
                  </div>
                  <span className="chapter-card-caption">
                    {chapters[season].detail}
                  </span>
                  <span className="chapter-character" aria-hidden="true">
                    {chapters[season].symbol}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="primary-button deploy-button"
              onClick={() => start()}
              disabled={!s.ready}
            >
              <span>
                开始远征<small>BEGIN YOUR JOURNEY</small>
              </span>
              <ArrowRight size={24} strokeWidth={1.2} />
            </button>
            <div className="menu-hint">
              <span>
                <i className="status-dot" /> 单人法术生存
              </span>
              <span>自动施法 · 自由构筑</span>
            </div>
          </div>
          <aside className="scene-caption">
            <span className="vertical-rule" />
            <div className="scene-caption-top">
              {chapter.chapter} <span> / </span>{" "}
              {s.season === "spring" ? "VERNAL EQUINOX" : "WINTER SOLSTICE"}
            </div>
            <h2>{chapter.title}</h2>
            <p>{chapter.description}</p>
            <span className="scene-caption-bottom">
              {s.season === "spring" ? <Sun size={14} /> : <Moon size={14} />}{" "}
              {s.season === "spring" ? "花雨 · 16°C" : "小雪 · −12°C"}
              <i />
              {best[s.season] ? `最佳驱散 ${best[s.season]}` : "未书写的篇章"}
            </span>
          </aside>
          <footer className="title-footer">
            <span className="title-footer-intro">
              以四季为卷，以法术为诗。
              <small className="studio-credit">万我工作室 · 研发与维护</small>
            </span>
            <span>
              WASD 移动 <b>·</b> SPACE 闪避 <b>·</b> Q 奥术脉冲
            </span>
            <span>
              SEASONAL DEMO <i>01.00</i>
            </span>
          </footer>
        </div>
      )}

      {inGame && (
        <div
          className={`hud ${s.mode !== "playing" ? "hud-soft" : ""}`}
          aria-label="游戏状态"
        >
          <div className="hud-top-left">
            <div className="portrait-medallion">
              <ArcaneMark size={34} />
              <span>{s.level}</span>
            </div>
            <div className="vitals">
              <div className="vitals-name">
                <span>巡季者</span>
                <small>THE WAYFARER</small>
              </div>
              <div className="health-line">
                <div
                  className="health-fill"
                  style={{ width: `${clamp(s.health / s.maxHealth) * 100}%` }}
                />
                <span className="health-shine" />
              </div>
              <div className="vitals-meta">
                <span>
                  <Heart size={10} />
                  {Math.ceil(s.health)} <i>/ {s.maxHealth}</i>
                </span>
                <span>LV. {s.level.toString().padStart(2, "0")}</span>
              </div>
            </div>
          </div>
          <div className="hud-top-center">
            <div className="hud-stage">
              {s.season === "spring" ? (
                <Flower2 size={15} />
              ) : (
                <Snowflake size={15} />
              )}
              <span>{chapter.title}</span>
              <i />
              <span className="hud-time">{formatTime(s.time)}</span>
            </div>
            <div className="hud-objective">
              {s.shrines < 3 ? "唤醒三座古老祭坛" : "击败苏醒的守望者"}
              <div className="shrine-pips">
                {[0, 1, 2].map((i) => (
                  <Diamond
                    key={i}
                    size={11}
                    className={i < s.shrines ? "lit" : ""}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="hud-top-right">
            <div className="kill-counter">
              <Swords size={18} strokeWidth={1.5} />
              <strong>{s.kills.toString().padStart(3, "0")}</strong>
              <span>驱散</span>
            </div>
            <button
              className="icon-button"
              aria-label={s.muted ? "开启声音" : "关闭声音"}
              onClick={() => game.current?.setMuted(!s.muted)}
            >
              {s.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              className="icon-button pause-button"
              aria-label="暂停游戏"
              onClick={() => game.current?.pause()}
            >
              <Pause size={16} />
            </button>
          </div>
          {s.bossMaxHealth > 0 && s.bossHealth > 0 && (
            <div className="boss-hud">
              <span>
                <Crown size={13} />
                {s.bossName}
              </span>
              <div className="boss-health">
                <i
                  style={{
                    width: `${clamp(s.bossHealth / s.bossMaxHealth) * 100}%`,
                  }}
                />
              </div>
              <small>古老的守望者</small>
            </div>
          )}
          {!!s.notification && (
            <div className="game-notification" key={s.notification}>
              <span />
              <p>{s.notification}</p>
              <span />
            </div>
          )}
          {s.combo >= 5 && (
            <div className="combo-display">
              <small>灵息连锁</small>
              <strong>
                {s.combo}
                <em>×</em>
              </strong>
            </div>
          )}
          {s.nearShrine && s.shrines < 3 && (
            <div className="shrine-attune">
              <ArcaneMark size={24} />
              <div>
                <span>正在共鸣</span>
                <div className="attune-track">
                  <i style={{ width: `${clamp(s.shrineProgress) * 100}%` }} />
                </div>
                <small>留在祭坛附近，唤醒古老的力量</small>
              </div>
            </div>
          )}
          <div className="hud-bottom-left">
            <span className="overline small">你的咒语</span>
            <div className="spell-loadout">
              {s.spells.map((spell) => (
                <div
                  key={spell.id}
                  className="spell-slot"
                  style={{ "--spell-color": spell.color } as CSSProperties}
                  title={`${spell.name} · 等级 ${spell.level}`}
                >
                  <SpellIcon name={spell.id} />
                  <span>{spell.level}</span>
                  <div className="spell-tooltip">
                    {spell.name}
                    <small>等级 {spell.level}</small>
                  </div>
                </div>
              ))}
              {Array.from(
                { length: Math.max(0, 6 - s.spells.length) },
                (_, i) => (
                  <div className="spell-slot empty" key={`empty${i}`}>
                    <span>·</span>
                  </div>
                ),
              )}
            </div>
            <div className="auto-cast">
              <span className="status-dot" />
              自动施法已启用
            </div>
          </div>
          <div className="hud-bottom-center">
            <div className="abilities">
              <button
                className={`ability ${s.dashCooldown > 0 ? "cooling" : ""}`}
                onClick={() => game.current?.dash()}
                disabled={s.mode !== "playing" || s.dashCooldown > 0}
                title="空格：向移动方向闪避"
              >
                <span
                  className="ability-cooldown"
                  style={{ height: `${clamp(s.dashCooldown / 3) * 100}%` }}
                />
                <Wind size={21} strokeWidth={1.4} />
                <span>
                  {s.dashCooldown > 0 ? s.dashCooldown.toFixed(1) : "闪避"}
                </span>
                <kbd>SPACE</kbd>
              </button>
              <button
                className={`ability ${s.pulseCooldown > 0 ? "cooling" : ""}`}
                onClick={() => game.current?.pulse()}
                disabled={s.mode !== "playing" || s.pulseCooldown > 0}
                title="Q：释放奥术脉冲，击退周围敌人"
              >
                <span
                  className="ability-cooldown"
                  style={{ height: `${clamp(s.pulseCooldown / 12) * 100}%` }}
                />
                <Orbit size={21} strokeWidth={1.4} />
                <span>
                  {s.pulseCooldown > 0
                    ? Math.ceil(s.pulseCooldown)
                    : "奥术脉冲"}
                </span>
                <kbd>Q</kbd>
              </button>
            </div>
            <div className="xp-row">
              <span>灵息</span>
              <div className="xp-track">
                <i style={{ width: `${clamp(s.xp / s.xpNext) * 100}%` }} />
              </div>
              <span>LV.{s.level + 1}</span>
            </div>
          </div>
          <MiniMap snapshot={s} />
          <div className="hud-bottom-foot">
            <span>{chapter.english}</span>
            <span>{s.fps ? `${Math.round(s.fps)} FPS` : "WILDSPELL"}</span>
          </div>
          <div className="touch-controls">
            <div
              className={`touch-stick ${stick.active ? "active" : ""}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                joystick(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) joystick(e);
              }}
              onPointerUp={releaseStick}
              onPointerCancel={releaseStick}
              aria-label="移动摇杆"
            >
              <i
                style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
              />
            </div>
          </div>
        </div>
      )}

      {s.mode === "upgrade" && !panel && (
        <div className="overlay upgrade-overlay">
          <div className="upgrade-heading">
            <div className="overline">THE WILD ANSWERS</div>
            <Sparkles size={25} strokeWidth={1} />
            <h2>荒野的馈赠</h2>
            <p>灵息汇聚，选择一道咒语，书写新的可能。</p>
            <span className="level-badge">
              LEVEL {s.level.toString().padStart(2, "0")}
            </span>
          </div>
          <div className="upgrade-cards">
            {s.choices.map((choice, i) => (
              <button
                className={`upgrade-card rarity-${choice.rarity}`}
                key={choice.id}
                onClick={() => game.current?.chooseUpgrade(choice.id)}
                style={
                  {
                    "--spell-color": choice.color,
                    "--card-index": i,
                  } as CSSProperties
                }
              >
                <div className="upgrade-topline">
                  <span>{choice.rarity}</span>
                  <kbd>{i + 1}</kbd>
                </div>
                <div className="upgrade-icon">
                  <SpellIcon name={choice.icon || choice.id} size={38} />
                  <span />
                </div>
                <span className="upgrade-subtitle">{choice.subtitle}</span>
                <h3>{choice.name}</h3>
                <p>{choice.description}</p>
                <div className="upgrade-choose">
                  铭刻咒语
                  <ArrowRight size={18} />
                </div>
              </button>
            ))}
          </div>
          <div className="overlay-footnote">
            选择一项继续远征 <span>·</span> 按 1 / 2 / 3 快速选择
          </div>
        </div>
      )}

      {s.mode === "paused" && !panel && (
        <div className="overlay">
          <div className="pause-panel">
            <ArcaneMark size={48} />
            <div className="overline">A MOMENT OF STILLNESS</div>
            <h2>稍作停留</h2>
            <p>风雪会等你，故事亦然。</p>
            <div className="pause-status">
              <span>{chapter.title}</span>
              <i />
              <span>{formatTime(s.time)}</span>
              <i />
              <span>LV. {s.level}</span>
            </div>
            <button
              className="primary-button"
              onClick={() => game.current?.resume()}
            >
              继续远征
              <Play size={18} />
            </button>
            <button className="menu-row" onClick={() => openPanel("settings")}>
              <Settings2 size={17} />
              <span>旅途设置</span>
              <ChevronRight size={15} />
            </button>
            <button className="menu-row" onClick={() => openPanel("guide")}>
              <BookOpen size={17} />
              <span>旅人手记</span>
              <ChevronRight size={15} />
            </button>
            <button
              className="menu-row"
              onClick={() => game.current?.returnToMenu()}
            >
              <ArrowUpRight size={17} />
              <span>返回庭院</span>
              <span className="row-note">本次进度不保留</span>
            </button>
            <div className="overlay-footnote">ESC 继续游戏</div>
          </div>
        </div>
      )}

      {(s.mode === "victory" || s.mode === "dead") && !panel && (
        <div
          className={`overlay result-overlay ${s.mode === "victory" ? "is-victory" : ""}`}
        >
          <div className="result-panel">
            <div className="result-emblem">
              {s.mode === "victory" ? (
                <ArcaneMark size={68} />
              ) : (
                <Leaf size={54} strokeWidth={0.7} />
              )}
            </div>
            <div className="overline">
              {s.mode === "victory"
                ? "A CHAPTER REMEMBERED"
                : "EVERY ENDING IS A BEGINNING"}
            </div>
            <h2>
              {s.mode === "victory"
                ? s.season === "spring"
                  ? "春光，再度苏醒"
                  : "长夜，终将破晓"
                : "落叶终会归来"}
            </h2>
            <p>
              {s.mode === "victory"
                ? chapter.epigraph
                : "暂歇的只是脚步，荒野仍在等候你的回响。"}
            </p>
            <div className="result-chapter">
              <span />
              {chapter.title}
              <span />
            </div>
            <div className="result-stats">
              <div>
                <strong>{formatTime(s.time)}</strong>
                <span>远征时长</span>
              </div>
              <div>
                <strong>{s.kills}</strong>
                <span>驱散之敌</span>
              </div>
              <div>
                <strong>{s.level}</strong>
                <span>咒术等级</span>
              </div>
              <div>
                <strong>{s.bestCombo}</strong>
                <span>最高连锁</span>
              </div>
            </div>
            <div className="result-spells">
              {s.spells.map((spell) => (
                <div
                  key={spell.id}
                  style={{ color: spell.color }}
                  title={spell.name}
                >
                  <SpellIcon name={spell.id} size={20} />
                  <span>{spell.level}</span>
                </div>
              ))}
            </div>
            <div className="result-actions">
              {s.mode === "victory" && s.season === "spring" ? (
                <button
                  className="primary-button"
                  onClick={() => start("winter")}
                >
                  下一章 · 凛冬遗迹
                  <ArrowRight size={19} />
                </button>
              ) : (
                <button className="primary-button" onClick={() => start()}>
                  {s.mode === "victory" ? "再写一段传奇" : "再启远征"}
                  <RotateCcw size={18} />
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => game.current?.returnToMenu()}
              >
                返回庭院
              </button>
            </div>
            <div className="result-note">
              {s.mode === "victory"
                ? "你的足迹，已成为荒野的一部分。"
                : `${s.shrines} / 3 座祭坛已唤醒 · 每一次重来，都是新的构筑。`}
            </div>
          </div>
        </div>
      )}

      {panel && (
        <div className="overlay information-overlay">
          <section
            className={`information-panel ${panel === "guide" ? "guide-panel" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-title"
          >
            <button
              className="icon-button panel-close"
              aria-label="关闭面板"
              onClick={() => setPanel(null)}
            >
              <X size={21} />
            </button>
            <div className="overline">
              {panel === "guide"
                ? "THE WAYFARER’S JOURNAL"
                : "MAKE THE JOURNEY YOURS"}
            </div>
            <h2 id="panel-title">
              {panel === "guide" ? "旅人手记" : "旅途设置"}
            </h2>
            {panel === "guide" ? (
              <>
                <p className="panel-intro">
                  法术会为你寻找敌人。你只需决定，下一步走向哪里。
                </p>
                <div className="guide-objectives">
                  <div>
                    <span>01</span>
                    <h3>收集灵息</h3>
                    <p>
                      击败来袭的生物，靠近拾取灵息。升级时，从三项随机馈赠中选择一项。
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <h3>唤醒祭坛</h3>
                    <p>
                      寻找地图上的三枚菱形，在祭坛光环中停留共鸣。离开光环会中断。
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <h3>迎战守望者</h3>
                    <p>
                      唤醒全部祭坛后，击败季节的守望者。组合不同元素，找到你的法术流派。
                    </p>
                  </div>
                </div>
                <div className="controls-grid">
                  <div>
                    <span>
                      <kbd>W</kbd>
                      <kbd>A</kbd>
                      <kbd>S</kbd>
                      <kbd>D</kbd>
                    </span>
                    <strong>移动</strong>
                    <small>方向键亦可</small>
                  </div>
                  <div>
                    <span>
                      <kbd>SPACE</kbd>
                    </span>
                    <strong>闪避</strong>
                    <small>沿移动方向快速位移</small>
                  </div>
                  <div>
                    <span>
                      <kbd>Q</kbd>
                    </span>
                    <strong>奥术脉冲</strong>
                    <small>击退身边的敌人</small>
                  </div>
                  <div>
                    <span>
                      <kbd>ESC</kbd>
                    </span>
                    <strong>暂停</strong>
                    <small>留一点时间给风景</small>
                  </div>
                </div>
                <div className="guide-tip">
                  <Sparkles size={20} />
                  <p>
                    <strong>一位老旅人的叮嘱</strong>
                    保持移动，利用石柱阻隔敌群。烈焰、冰霜与雷电都能成为你的伙伴。
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setPanel(null)}
                >
                  我已准备好
                  <ArrowRight size={18} />
                </button>
              </>
            ) : (
              <>
                <p className="panel-intro">让微光、风声与法术，恰如其分。</p>
                <div className="setting-row">
                  <div>
                    <span>声音与氛围</span>
                    <small>合成配乐、环境音与战斗音效</small>
                  </div>
                  <button
                    className={`toggle ${!s.muted ? "on" : ""}`}
                    aria-label="开启声音"
                    aria-pressed={!s.muted}
                    onClick={() => game.current?.setMuted(!s.muted)}
                  >
                    <i />
                  </button>
                </div>
                <div className="setting-row quality-row">
                  <div>
                    <span>画面品质</span>
                    <small>平衡模式适合轻薄本与低功耗设备</small>
                  </div>
                  <div className="segmented">
                    <button
                      className={s.quality === "medium" ? "active" : ""}
                      onClick={() => game.current?.setQuality("medium")}
                    >
                      平衡
                    </button>
                    <button
                      className={s.quality === "high" ? "active" : ""}
                      onClick={() => game.current?.setQuality("high")}
                    >
                      精致{s.quality === "high" && <Check size={12} />}
                    </button>
                  </div>
                </div>
                <div className="settings-note">
                  <Leaf size={17} />
                  <p>
                    所有场景、角色与声音均实时生成。戴上耳机，听见季节的细节。
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setPanel(null)}
                >
                  完成
                  <Check size={18} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
