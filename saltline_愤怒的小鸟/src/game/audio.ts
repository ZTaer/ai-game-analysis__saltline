import type { Material } from './types';
/** All sound is synthesized locally; no audio files or network requests. */
export class SynthAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastImpact = 0;
  volume = 0.55;
  muted = false;
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -15;
      compressor.ratio.value = 5;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }
  setVolume(v: number) {
    this.volume = v;
    this.updateVolume();
  }
  setMuted(v: boolean) {
    this.muted = v;
    this.updateVolume();
  }
  private updateVolume() {
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.025);
  }
  private tone(
    freq: number,
    end: number,
    duration: number,
    gain = 0.15,
    type: OscillatorType = 'sine',
    delay = 0,
  ) {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + delay,
      osc = this.ctx.createOscillator(),
      amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }
  private burst(freq: number, duration: number, gain: number, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || !this.master || !this.noise || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime,
      source = this.ctx.createBufferSource(),
      filter = this.ctx.createBiquadFilter(),
      amp = this.ctx.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(t, Math.random());
    source.stop(t + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      amp.disconnect();
    };
  }
  pull(power: number) {
    this.tone(150 + power * 230, 220 + power * 160, 0.08, 0.035, 'triangle');
  }
  launch() {
    this.tone(260, 95, 0.23, 0.24, 'triangle');
    this.burst(1800, 0.23, 0.2, 'bandpass');
    this.tone(750, 1200, 0.3, 0.08, 'sine', 0.05);
  }
  impact(material: Material | 'pig' | 'bird', power: number) {
    if (!this.ctx || this.ctx.currentTime - this.lastImpact < 0.035) return;
    this.lastImpact = this.ctx.currentTime;
    const g = Math.min(0.42, 0.06 + power * 0.025),
      variation = 0.9 + Math.random() * 0.2;
    if (material === 'glass') {
      [1500, 2340, 3200].forEach((f, i) =>
        this.tone(f * variation, f * 0.8, 0.17 + i * 0.06, g / 3),
      );
      this.burst(5000, 0.13, g / 2, 'highpass');
    } else if (material === 'pig') {
      this.tone(320, 110, 0.22, g, 'triangle');
      this.tone(430, 180, 0.18, g / 2, 'sine', 0.08);
    } else {
      this.tone(material === 'stone' ? 95 : 180, 45, 0.14, g, 'triangle');
      this.burst(material === 'stone' ? 750 : 1800, 0.14, g);
    }
  }
  explode() {
    this.burst(900, 0.8, 0.7);
    this.tone(100, 24, 0.6, 0.65);
    this.burst(2400, 0.23, 0.3);
  }
  boost() {
    this.burst(2200, 0.28, 0.3, 'bandpass');
    this.tone(400, 1700, 0.22, 0.12, 'sawtooth');
  }
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, i) =>
      this.tone(n, n, 0.5, 0.14, 'triangle', i * 0.13),
    );
  }
  lose() {
    [330, 277, 220].forEach((n, i) => this.tone(n, n * 0.98, 0.35, 0.12, 'triangle', i * 0.16));
  }
  dispose() {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
