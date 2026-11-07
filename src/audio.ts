import { bus, type SfxName } from './game/events';
import { loadSettings, saveSettings, type Settings } from './game/save';

/** Procedural WebAudio sound effects. No audio files are needed or downloaded. */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  settings: Settings = loadSettings();
  private last: Partial<Record<SfxName, number>> = {};

  constructor() {
    bus.on('sfx', (n: SfxName) => this.play(n));
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.muted ? 0 : this.settings.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  update(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    if (this.master) this.master.gain.value = this.settings.muted ? 0 : this.settings.volume;
    return this.settings;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number; delay?: number; attack?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t0 + dur);
    const vol = opts.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol = 0.2, freq = 1200, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(ctx.currentTime + delay);
  }

  play(name: SfxName): void {
    if (this.settings.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = performance.now();
    const gap = name === 'mine' || name === 'laser' || name === 'hit' ? 70 : 25;
    if (now - (this.last[name] ?? 0) < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'click': this.tone(620, 0.06, { type: 'triangle', vol: 0.08 }); break;
      case 'mine': this.tone(180, 0.18, { type: 'sawtooth', vol: 0.06, slide: 0.6 }); this.noise(0.12, 0.05, 2200); break;
      case 'pulse': this.tone(120, 0.4, { type: 'sawtooth', vol: 0.12, slide: 3 }); this.noise(0.3, 0.1, 3000); break;
      case 'sell': this.tone(880, 0.09, { type: 'triangle', vol: 0.12 }); this.tone(1320, 0.14, { type: 'triangle', vol: 0.12, delay: 0.07 }); break;
      case 'buy': this.tone(520, 0.08, { type: 'triangle', vol: 0.12 }); this.tone(390, 0.12, { type: 'triangle', vol: 0.1, delay: 0.06 }); break;
      case 'upgrade': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'sine', vol: 0.13, delay: i * 0.06 })); break;
      case 'error': this.tone(160, 0.18, { type: 'square', vol: 0.09, slide: 0.7 }); break;
      case 'jump': this.tone(90, 0.9, { type: 'sawtooth', vol: 0.12, slide: 8 }); this.noise(0.8, 0.08, 1500); break;
      case 'laser': this.tone(1100, 0.16, { type: 'square', vol: 0.07, slide: 0.25 }); break;
      case 'hit': this.noise(0.18, 0.2, 700); this.tone(110, 0.2, { type: 'square', vol: 0.12, slide: 0.5 }); break;
      case 'explode': this.noise(0.7, 0.3, 500); this.tone(70, 0.6, { type: 'sawtooth', vol: 0.18, slide: 0.4 }); break;
      case 'discover': [440, 554, 659, 880, 1109].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.1, delay: i * 0.09 })); break;
      case 'research': [392, 523, 659].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.12, delay: i * 0.1 })); break;
      case 'mission': [523, 659, 784].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.13, delay: i * 0.08 })); this.tone(1047, 0.5, { type: 'sine', vol: 0.1, delay: 0.26 }); break;
      case 'scan': this.tone(300, 0.7, { type: 'sine', vol: 0.1, slide: 4 }); break;
      case 'alert': this.tone(440, 0.15, { type: 'square', vol: 0.09 }); this.tone(440, 0.15, { type: 'square', vol: 0.09, delay: 0.22 }); this.tone(330, 0.3, { type: 'square', vol: 0.09, delay: 0.44 }); break;
      case 'achievement': [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.4, { type: 'sine', vol: 0.12, delay: i * 0.08 })); break;
      case 'shield': this.tone(300, 0.4, { type: 'sine', vol: 0.12, slide: 2.4 }); break;
    }
  }
}

export const audio = new AudioEngine();
