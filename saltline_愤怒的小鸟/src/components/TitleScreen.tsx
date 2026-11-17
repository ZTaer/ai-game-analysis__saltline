import {
  ArrowRight,
  CircleHelp,
  Expand,
  Grid2X2,
  Maximize2,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import BirdAvatar from './BirdAvatar';
import { LEVELS } from '../game/levels';

interface Props {
  level: number;
  muted: boolean;
  full: boolean;
  onStart: () => void;
  onLevels: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onMute: () => void;
  onFullscreen: () => void;
}

export default function TitleScreen(props: Props) {
  return (
    <section className="title-screen" aria-label="游戏主菜单">
      <div className="title-shade" />
      <div className="title-toolbar">
        <button onClick={props.onMute} aria-label={props.muted ? '开启声音' : '关闭声音'}>
          {props.muted ? <VolumeX /> : <Volume2 />}
        </button>
        <button onClick={props.onSettings} aria-label="声音设置">
          <Settings2 />
        </button>
        <button onClick={props.onHelp} aria-label="玩法指南">
          <CircleHelp />
        </button>
        <button onClick={props.onFullscreen} aria-label="切换全屏">
          {props.full ? <Maximize2 /> : <Expand />}
        </button>
      </div>
      <div className="title-content">
        <div className="title-flock" aria-hidden="true">
          <BirdAvatar kind="bomb" size={108} />
          <BirdAvatar kind="red" size={160} />
          <BirdAvatar kind="yellow" size={114} />
        </div>
        <div className="title-eyebrow">
          <span /> THE GREEN VALLEY EXPEDITION
        </div>
        <h1>愤怒的小鸟</h1>
        <div className="title-chapter">
          <i />
          <span>绿 野 行 动</span>
          <i />
        </div>
        <p>拉开弹弓，把我们的鸟蛋带回家。</p>
        <div className="title-actions">
          <button className="start-button" onClick={props.onStart}>
            开始行动 <ArrowRight size={23} />
          </button>
          <button className="map-button" onClick={props.onLevels}>
            <Grid2X2 size={20} /> 选择关卡
          </button>
        </div>
        <span className="title-save">
          第 {String(props.level + 1).padStart(2, '0')} 关 · {LEVELS[props.level].name}
        </span>
      </div>
      <div className="title-footer">
        <span>
          拖拽发射 <i /> 空格释放技能
        </span>
        <span>六片绿野 · 一场冒险</span>
      </div>
    </section>
  );
}
