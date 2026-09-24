/**
 * Procedural WebAudio: short synth blips for game events and looping ambience
 * (rain, fire crackle, fluorescent hum). No audio files.
 */
type Sfx =
  | 'match'
  | 'hit'
  | 'hurt'
  | 'coin'
  | 'armor'
  | 'ink'
  | 'boom'
  | 'rocket'
  | 'prism'
  | 'door'
  | 'pickup'
  | 'swap'
  | 'alarm'
  | 'chest'
  | 'item'
  | 'invalid'
  | 'enemy'
  | 'death'
  | 'kill'
  | 'phase'
  | 'thunder'
  | 'step'
  | 'buy'
  | 'select'
  | 'ember'
  | 'chip'
  | 'mult'
  | 'strike'
  | 'phone'
  | 'keys'
  | 'flicker'
  | 'switch'
  | 'paper'
  | 'wake'
  | 'ash'
  | 'card';

export class Audio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  ambGain: GainNode | null = null;
  volume = 0.6;
  muted = false;
  private amb: { stop(): void } | null = null;
  private ambKind = '';
  private noiseBuf: AudioBuffer | null = null;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    this.ambGain = this.ctx.createGain();
    this.ambGain.gain.value = 0.35;
    this.ambGain.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.ambKind) {
      const k = this.ambKind;
      this.ambKind = '';
      this.ambience(k);
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && !this.muted) this.master.gain.value = v;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.2, slide = 0, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, filter: number, q = 1, delay = 0, type: BiquadFilterType = 'lowpass') {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filter;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  play(s: Sfx, pitch = 1) {
    if (!this.ctx || this.muted) return;
    switch (s) {
      case 'match':
        this.tone(520 * pitch, 0.09, 'square', 0.07);
        this.tone(780 * pitch, 0.08, 'square', 0.05, 0, 0.04);
        break;
      case 'hit':
        this.noise(0.09, 0.35, 1800 * pitch);
        this.tone(150 * pitch, 0.1, 'square', 0.12, 0.5);
        break;
      case 'hurt':
        this.tone(220, 0.25, 'sawtooth', 0.16, 0.4);
        this.noise(0.15, 0.3, 900);
        break;
      case 'coin':
        this.tone(988 * pitch, 0.06, 'square', 0.06);
        this.tone(1319 * pitch, 0.12, 'square', 0.06, 0, 0.05);
        break;
      case 'armor':
        this.tone(330 * pitch, 0.1, 'triangle', 0.14, 1.5);
        break;
      case 'ink':
        this.tone(660 * pitch, 0.12, 'sine', 0.12, 1.6);
        break;
      case 'boom':
        this.noise(0.5, 0.6, 500);
        this.tone(80, 0.45, 'sine', 0.3, 0.4);
        break;
      case 'rocket':
        this.noise(0.3, 0.3, 2500, 2, 0, 'bandpass');
        this.tone(400, 0.25, 'sawtooth', 0.06, 2.5);
        break;
      case 'prism':
        for (let k = 0; k < 5; k++) this.tone(660 * Math.pow(1.26, k), 0.14, 'triangle', 0.06, 0, k * 0.03);
        break;
      case 'door':
        this.noise(0.18, 0.2, 400);
        this.tone(110, 0.2, 'triangle', 0.1, 0.8);
        break;
      case 'pickup':
        this.tone(784, 0.07, 'square', 0.06);
        this.tone(1175, 0.1, 'square', 0.05, 0, 0.06);
        break;
      case 'alarm':
        this.tone(880, 0.06, 'square', 0.035);
        this.tone(660, 0.08, 'square', 0.035, 0, 0.08);
        break;
      case 'swap':
        this.noise(0.07, 0.12, 1800, 1.2, 0, 'bandpass');
        this.tone(520, 0.05, 'triangle', 0.04, 1.3);
        break;
      case 'chest':
        this.noise(0.22, 0.22, 320, 0.6);
        [659, 784, 988, 1319].forEach((f, k) => this.tone(f, 0.12, 'triangle', 0.05, 0, 0.12 + k * 0.05));
        break;
      case 'item':
        [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.22, 'square', 0.06, 0, k * 0.09));
        break;
      case 'invalid':
        this.tone(140, 0.12, 'square', 0.08, 0.8);
        break;
      case 'enemy':
        this.tone(180 * pitch, 0.12, 'sawtooth', 0.08, 0.7);
        break;
      case 'kill':
        this.noise(0.25, 0.3, 1200);
        this.tone(300, 0.3, 'square', 0.08, 0.3);
        break;
      case 'death':
        [392, 330, 262, 196].forEach((f, k) => this.tone(f, 0.35, 'triangle', 0.12, 0.9, k * 0.18));
        break;
      case 'phase':
        this.tone(90, 0.6, 'sawtooth', 0.15, 0.5);
        this.noise(0.5, 0.3, 300);
        break;
      case 'thunder':
        this.noise(1.6, 0.5, 220, 0.7);
        this.noise(0.6, 0.3, 900, 0.7, 0.05);
        break;
      case 'step':
        this.noise(0.05, 0.1, 700);
        break;
      case 'buy':
        this.tone(660, 0.06, 'square', 0.06);
        this.tone(990, 0.06, 'square', 0.06, 0, 0.06);
        this.tone(1320, 0.12, 'square', 0.06, 0, 0.12);
        break;
      case 'select':
        this.tone(880, 0.04, 'square', 0.04);
        break;
      case 'ember':
        this.noise(0.3, 0.35, 1400, 1.5, 0, 'bandpass');
        break;
      case 'chip':
        // One tile adds to the tally: a short blip that climbs with every tile of the move.
        this.tone(440 * pitch, 0.05, 'square', 0.045);
        break;
      case 'mult':
        this.tone(330 * pitch, 0.09, 'sawtooth', 0.06, 1.8);
        this.tone(660 * pitch, 0.06, 'square', 0.035, 0, 0.03);
        break;
      case 'strike':
        this.noise(0.22, 0.5, 900);
        this.tone(110 * pitch, 0.28, 'square', 0.16, 0.5);
        this.tone(55, 0.35, 'sine', 0.25, 0.7);
        break;
      case 'phone':
        for (let k = 0; k < 6; k++) this.tone(k % 2 ? 1180 : 940, 0.045, 'square', 0.03, 0, k * 0.05);
        break;
      case 'keys':
        for (let k = 0; k < 4; k++) this.noise(0.018, 0.05 + Math.random() * 0.05, 3500, 1, k * (0.05 + Math.random() * 0.06), 'highpass');
        break;
      case 'flicker':
        this.noise(0.05, 0.12, 5000, 1, 0, 'highpass');
        this.tone(120, 0.08, 'sawtooth', 0.05);
        break;
      case 'switch':
        this.noise(0.02, 0.3, 2500, 1, 0, 'highpass');
        this.tone(1800, 0.015, 'square', 0.05);
        break;
      case 'paper':
        this.noise(0.35, 0.18 * pitch, 3200, 0.8, 0, 'bandpass');
        this.noise(0.25, 0.12, 5200, 0.8, 0.12, 'bandpass');
        break;
      case 'wake':
        [392, 523, 659].forEach((f, k) => this.tone(f, 0.5, 'sine', 0.05, 0, k * 0.18));
        break;
      case 'ash':
        this.noise(1.4, 0.25, 1500, 0.5);
        this.tone(160, 1.2, 'sine', 0.08, 0.5);
        break;
      case 'card':
        this.noise(0.08, 0.2, 4000, 1, 0, 'bandpass');
        this.tone(1100 * pitch, 0.05, 'triangle', 0.04);
        break;
    }
  }

  /** Looping background texture per floor. */
  ambience(kind: string) {
    if (kind === this.ambKind) return;
    this.ambKind = kind;
    this.amb?.stop();
    this.amb = null;
    const ctx = this.ctx;
    if (!ctx || !this.ambGain || !this.noiseBuf) return;
    const nodes: AudioScheduledSourceNode[] = [];
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.ambGain);
    const rain = (gain: number, freq: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(out);
      src.start();
      nodes.push(src);
    };
    const hum = (freq: number, gain: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(out);
      o.start();
      nodes.push(o);
    };
    let crackle: number | null = null;
    if (kind === 'hub') {
      // The open space: fluorescent hum, air conditioning, keyboards and a phone now and then.
      rain(0.06, 700);
      hum(60, 0.014);
      hum(120, 0.008);
      crackle = window.setInterval(() => {
        const r = Math.random();
        if (r < 0.35) this.play('keys');
        else if (r < 0.37) this.play('phone');
      }, 700);
    } else if (kind === 'dark') {
      // The other side: the same hum, lower, with buzzing tubes.
      rain(0.05, 300);
      hum(50, 0.02);
      hum(100, 0.008);
      crackle = window.setInterval(() => {
        if (Math.random() < 0.08) this.play('flicker');
      }, 500);
    } else if (kind === 'office') {
      rain(0.18, 1800);
      hum(60, 0.012);
      hum(120, 0.006);
    } else if (kind === 'archive') {
      rain(0.32, 2600);
      rain(0.12, 500);
    } else if (kind === 'boiler') {
      rain(0.12, 180);
      hum(45, 0.03);
      crackle = window.setInterval(() => {
        if (Math.random() < 0.6) this.noise(0.03, 0.05 + Math.random() * 0.08, 3000, 1, 0, 'highpass');
      }, 90);
    } else if (kind === 'directorate') {
      rain(0.25, 2200);
      hum(55, 0.01);
    } else if (kind === 'title') {
      rain(0.2, 1600);
    }
    this.amb = {
      stop: () => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        }
        out.disconnect();
        if (crackle !== null) window.clearInterval(crackle);
      },
    };
  }
}
