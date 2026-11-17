import type { Season } from "./types";

type SoundName =
  | "cast"
  | "hit"
  | "kill"
  | "hurt"
  | "dash"
  | "pulse"
  | "level"
  | "shrine"
  | "boss"
  | "victory"
  | "step"
  | "pickup";
const frequencies = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Audio is synthesized locally. The audio graph starts only after a gesture. */
export class SynthAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private muted = false;
  private season: Season = "spring";
  private clock = 0;
  private noteAt = 0;
  private chordAt = 0;
  private noteIndex = 0;
  private chordIndex = 0;
  private last: Partial<Record<SoundName, number>> = {};
  private voices = 0;
  private destroyed = false;

  async unlock(): Promise<void> {
    if (this.destroyed) return;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor({ latencyHint: "interactive" });
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 16;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.18;
      this.master.connect(limiter);
      limiter.connect(c.destination);
      this.effects = c.createGain();
      this.effects.gain.value = 0.7;
      this.effects.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0.42;
      this.music.connect(this.master);
      this.reverb = c.createConvolver();
      const impulse = c.createBuffer(
        2,
        Math.ceil(c.sampleRate * 2.5),
        c.sampleRate,
      );
      for (let ch = 0; ch < 2; ch++) {
        const a = impulse.getChannelData(ch);
        for (let j = 0; j < a.length; j++)
          a[j] =
            (Math.random() * 2 - 1) * Math.pow(1 - j / a.length, 3.4) * 0.6;
      }
      this.reverb.buffer = impulse;
      const wet = c.createGain();
      wet.gain.value = 0.24;
      this.reverb.connect(wet);
      wet.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
      const samples = this.noise.getChannelData(0);
      let brown = 0;
      for (let j = 0; j < samples.length; j++) {
        brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.025;
        samples[j] = brown * 4;
      }
      this.wind = c.createBufferSource();
      this.wind.buffer = this.noise;
      this.wind.loop = true;
      this.windFilter = c.createBiquadFilter();
      this.windFilter.type = "lowpass";
      this.windFilter.frequency.value = 650;
      const windGain = c.createGain();
      windGain.gain.value = 0.12;
      this.wind.connect(this.windFilter);
      this.windFilter.connect(windGain);
      windGain.connect(this.music);
      this.wind.start();
    }
    try {
      if (this.ctx.state === "suspended") await this.ctx.resume();
    } catch {
      /* Silent play remains available if audio is denied. */
    }
  }

  setSeason(season: Season): void {
    if (this.season !== season) {
      this.season = season;
      this.chordIndex = 0;
      this.noteIndex = 0;
      this.chordAt = this.clock + 0.5;
      this.noteAt = this.clock + 0.3;
    }
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.6,
        this.ctx.currentTime,
        0.08,
      );
  }

  private tone(
    hz: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    toHz?: number,
    delay = 0,
    music = false,
  ): void {
    if (
      !this.ctx ||
      !this.master ||
      this.ctx.state !== "running" ||
      this.voices >= 40
    )
      return;
    const c = this.ctx,
      t = c.currentTime + delay;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, hz), t);
    if (toHz)
      o.frequency.exponentialRampToValueAtTime(
        Math.max(20, toHz),
        t + duration,
      );
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, volume),
      t + (music ? 0.025 : 0.007),
    );
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(music ? this.music! : this.effects!);
    if (this.reverb) g.connect(this.reverb);
    this.voices++;
    o.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      o.disconnect();
      g.disconnect();
    };
    o.start(t);
    o.stop(t + duration + 0.03);
  }

  private whoosh(
    duration: number,
    volume: number,
    frequency: number,
    toFrequency: number,
    delay = 0,
  ): void {
    if (
      !this.ctx ||
      !this.noise ||
      !this.effects ||
      this.voices >= 40 ||
      this.ctx.state !== "running"
    )
      return;
    const c = this.ctx,
      t = c.currentTime + delay,
      o = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    o.buffer = this.noise;
    f.type = "bandpass";
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(frequency, t);
    f.frequency.exponentialRampToValueAtTime(toFrequency, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(f);
    f.connect(g);
    g.connect(this.effects);
    if (this.reverb) g.connect(this.reverb);
    this.voices++;
    o.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      o.disconnect();
      f.disconnect();
      g.disconnect();
    };
    o.start(t, Math.random());
    o.stop(t + duration + 0.02);
  }

  play(name: SoundName, intensity = 1): void {
    if (!this.ctx || this.muted || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const cooldown: Partial<Record<SoundName, number>> = {
      cast: 0.08,
      hit: 0.065,
      kill: 0.09,
      pickup: 0.075,
      step: 0.25,
      hurt: 0.28,
    };
    if (t - (this.last[name] ?? -10) < (cooldown[name] ?? 0.08)) return;
    this.last[name] = t;
    const v = Math.max(0.15, Math.min(1.5, intensity)),
      r = 0.92 + Math.random() * 0.16;
    switch (name) {
      case "cast":
        this.tone(510 * r, 0.16, 0.035 * v, "sine", 950 * r);
        this.whoosh(0.15, 0.06 * v, 1800, 650);
        break;
      case "hit":
        this.tone(150 * r, 0.12, 0.055 * v, "triangle", 65);
        this.whoosh(0.13, 0.12 * v, 900, 180);
        break;
      case "kill":
        this.tone(280 * r, 0.17, 0.045 * v, "triangle", 55);
        this.tone(780 * r, 0.24, 0.023 * v, "sine", 390);
        this.whoosh(0.2, 0.13 * v, 1800, 140);
        break;
      case "hurt":
        this.tone(110, 0.23, 0.1 * v, "triangle", 43);
        this.whoosh(0.22, 0.18 * v, 430, 110);
        break;
      case "dash":
        this.whoosh(0.3, 0.23 * v, 400, 3600);
        this.tone(220, 0.25, 0.025 * v, "sine", 890);
        break;
      case "pulse":
        this.tone(58, 0.7, 0.16 * v, "sine", 31);
        this.tone(440, 0.6, 0.045 * v, "triangle", 90);
        this.whoosh(0.65, 0.3 * v, 2300, 120);
        break;
      case "level":
        for (let j = 0; j < 5; j++)
          this.tone(
            frequencies(60 + [0, 4, 7, 12, 16][j]),
            0.65,
            0.07 * v,
            "sine",
            undefined,
            j * 0.085,
          );
        break;
      case "shrine":
        for (let j = 0; j < 6; j++)
          this.bell(
            frequencies(48 + [0, 7, 12, 16, 19, 24][j]),
            0.09 * v,
            j * 0.12,
          );
        this.whoosh(1.2, 0.15 * v, 400, 2000);
        break;
      case "boss":
        this.tone(49, 2.4, 0.13, "sine", 36);
        this.tone(73.4, 2.1, 0.07, "triangle", 55);
        this.whoosh(1.7, 0.2, 300, 110);
        break;
      case "victory":
        for (let j = 0; j < 8; j++)
          this.bell(
            frequencies(60 + [0, 4, 7, 12, 7, 12, 16, 19][j]),
            0.09,
            j * 0.19,
          );
        break;
      case "step":
        this.whoosh(0.09, 0.05 * v, this.season === "spring" ? 450 : 1800, 120);
        break;
      case "pickup":
        this.tone(
          frequencies(76 + Math.floor(Math.random() * 3) * 2),
          0.16,
          0.023 * v,
          "sine",
          undefined,
          0,
        );
        break;
    }
  }

  private bell(hz: number, volume: number, delay = 0): void {
    this.tone(hz, 1.7, volume, "sine", undefined, delay, true);
    this.tone(hz * 2.002, 0.7, volume * 0.3, "sine", undefined, delay, true);
    this.tone(hz * 3.01, 0.35, volume * 0.12, "sine", undefined, delay, true);
  }

  update(dt: number, threat: number): void {
    this.clock += Math.min(dt, 0.1);
    if (!this.ctx || this.muted || this.ctx.state !== "running") return;
    if (this.windFilter)
      this.windFilter.frequency.setTargetAtTime(
        (this.season === "winter" ? 950 : 530) +
          Math.sin(this.clock * 0.21) * 170,
        this.ctx.currentTime,
        0.6,
      );
    const winter = this.season === "winter";
    const roots = winter ? [45, 41, 48, 43] : [48, 53, 45, 55];
    const root = roots[this.chordIndex % roots.length];
    if (this.clock >= this.chordAt) {
      const notes = winter ? [0, 7, 10, 14] : [0, 7, 12, 16];
      notes.forEach((n, j) =>
        this.tone(
          frequencies(root + n),
          5.8,
          0.026,
          "sine",
          undefined,
          j * 0.12,
          true,
        ),
      );
      this.chordAt = this.clock + 7;
      this.chordIndex++;
    }
    if (this.clock >= this.noteAt) {
      const melody = winter
        ? [12, 19, 22, 19, 14, 10, 7, 14]
        : [12, 16, 19, 24, 19, 16, 7, 14];
      this.bell(
        frequencies(root + melody[this.noteIndex % melody.length]),
        winter ? 0.035 : 0.045,
      );
      if (threat > 0.6 && this.noteIndex % 4 === 0)
        this.tone(
          frequencies(root - 12),
          0.32,
          0.065,
          "sine",
          frequencies(root - 24),
          0,
          true,
        );
      this.noteIndex++;
      this.noteAt =
        this.clock +
        (winter ? 0.84 : 0.66) +
        (this.noteIndex % 4 === 0 ? 0.42 : 0);
    }
  }
  dispose(): void {
    this.destroyed = true;
    try {
      this.wind?.stop();
    } catch {
      /* Already stopped. */
    }
    this.wind?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.voices = 0;
  }
}
