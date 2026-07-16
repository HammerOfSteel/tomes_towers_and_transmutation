/**
 * AudioSystem — Web Audio API singleton with procedural ambient tones.
 *
 * Gain categories: music | sfx | ambient | ui
 * Each category has its own GainNode so volume sliders work independently.
 *
 * Ambient tones are fully procedural (no audio files):
 *   dungeon  — 80Hz drone + slow tremolo
 *   library  — warm 220Hz chord (1:5:3 harmonics)
 *   exterior — filtered white noise + LFO sweep (wind)
 *   storm    — lower drone + faster modulation
 *   greenhouse — open fifth 110Hz+165Hz
 *   observatory — cold 440Hz + sparse overtones
 */

export type AudioCategory = 'music' | 'sfx' | 'ambient' | 'ui';
export type AmbientScene  = 'dungeon' | 'library' | 'exterior' | 'storm' | 'greenhouse' | 'observatory' | 'off';

interface GainNodes {
  music:   GainNode;
  sfx:     GainNode;
  ambient: GainNode;
  ui:      GainNode;
}

interface AmbientVoice {
  osc:    OscillatorNode | null;
  noise:  AudioBufferSourceNode | null;
  filter: BiquadFilterNode | null;
  lfo:    OscillatorNode | null;
  lfoGain: GainNode | null;
  gainNode: GainNode;
  fadeTimer: number;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: AudioSystem | null = null;

export class AudioSystem {
  private readonly _ctx: AudioContext;
  private readonly _gains: GainNodes;
  private _ambientScene: AmbientScene = 'off';
  private _ambientVoices: AmbientVoice[] = [];

  static get instance(): AudioSystem {
    if (!_instance) _instance = new AudioSystem();
    return _instance;
  }

  private constructor() {
    this._ctx = new AudioContext();

    // Master gain chain: category → master → destination
    const mkGain = (val: number) => {
      const g = this._ctx.createGain();
      g.gain.value = val;
      g.connect(this._ctx.destination);
      return g;
    };

    this._gains = {
      music:   mkGain(0.45),
      sfx:     mkGain(0.7),
      ambient: mkGain(0.35),
      ui:      mkGain(0.5),
    };
  }

  // ── Volume control ────────────────────────────────────────────────────────

  setVolume(category: AudioCategory, value: number): void {
    this._gains[category].gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this._ctx.currentTime,
      0.05,
    );
  }

  getVolume(category: AudioCategory): number {
    return this._gains[category].gain.value;
  }

  setMasterVolume(value: number): void {
    for (const cat of Object.keys(this._gains) as AudioCategory[]) {
      this.setVolume(cat, value * this.getVolume(cat));
    }
  }

  // ── Ambient scene ─────────────────────────────────────────────────────────

  setAmbientScene(scene: AmbientScene): void {
    if (scene === this._ambientScene) return;
    this._ambientScene = scene;
    this._stopAmbient(0.8);
    if (scene !== 'off') {
      setTimeout(() => { if (this._ambientScene === scene) this._startAmbient(scene); }, 900);
    }
  }

  private _stopAmbient(fadeTime = 0.4): void {
    const now = this._ctx.currentTime;
    for (const v of this._ambientVoices) {
      v.gainNode.gain.setTargetAtTime(0, now, fadeTime / 3);
      setTimeout(() => {
        try { v.osc?.stop(); } catch {}
        try { v.noise?.stop(); } catch {}
        try { v.lfo?.stop(); } catch {}
        v.gainNode.disconnect();
      }, fadeTime * 1000 + 100);
    }
    this._ambientVoices = [];
  }

  private _startAmbient(scene: AmbientScene): void {
    switch (scene) {
      case 'dungeon':
        this._addDrone(80,  0.18, 0.8, 2.1);   // deep drone
        this._addDrone(160, 0.06, 1.5, 3.3);   // octave overtone
        break;

      case 'library':
        this._addDrone(220, 0.12, 0.4, 1.1);   // warm A3
        this._addDrone(330, 0.08, 0.3, 0.9);   // perfect fifth E4
        this._addDrone(550, 0.04, 0.5, 1.7);   // major third C#5
        break;

      case 'exterior':
        this._addWind(0.22, 400, 2000, 0.35);  // layered wind noise
        this._addWind(0.12, 200, 800,  0.18);
        this._addDrone(55,  0.06, 1.8, 5.0);   // low outdoor rumble
        break;

      case 'storm':
        this._addWind(0.35, 200, 3000, 0.5);   // heavy wind
        this._addWind(0.20, 100, 1000, 0.3);
        this._addDrone(40,  0.12, 2.0, 4.0);   // thunder rumble
        break;

      case 'greenhouse':
        this._addDrone(110, 0.10, 0.3, 0.7);   // open fifth
        this._addDrone(165, 0.08, 0.5, 1.3);
        this._addWind(0.06, 800, 4000, 0.1);   // airy high frequencies
        break;

      case 'observatory':
        this._addDrone(440, 0.05, 0.2, 0.4);   // cold A4
        this._addDrone(880, 0.03, 0.3, 0.6);   // sparse overtone
        this._addDrone(220, 0.04, 0.1, 0.2);   // sub octave
        break;
    }
  }

  private _addDrone(freq: number, amp: number, lfoRate: number, lfoDepth: number): void {
    const ctx = this._ctx;
    const g   = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.setTargetAtTime(amp, ctx.currentTime, 0.5);
    g.connect(this._gains.ambient);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const lfo     = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = lfoRate;
    lfoGain.gain.value  = lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(g);
    osc.start();
    lfo.start();

    this._ambientVoices.push({ osc, noise: null, filter: null, lfo, lfoGain, gainNode: g, fadeTimer: 0 });
  }

  private _addWind(amp: number, lowFreq: number, highFreq: number, lfoRate: number): void {
    const ctx = this._ctx;

    // White noise buffer (1s, looping)
    const bufLen = ctx.sampleRate;
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop   = true;

    const filter = ctx.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = (lowFreq + highFreq) / 2;
    filter.Q.value         = 0.5;

    const lfo     = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = lfoRate;
    lfoGain.gain.value  = (highFreq - lowFreq) / 2;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.setTargetAtTime(amp, ctx.currentTime, 0.8);

    noise.connect(filter);
    filter.connect(g);
    g.connect(this._gains.ambient);
    noise.start();
    lfo.start();

    this._ambientVoices.push({ osc: null, noise, filter, lfo, lfoGain, gainNode: g, fadeTimer: 0 });
  }

  // ── SFX — procedural synthesis ────────────────────────────────────────────

  /** Short impact click (footstep / UI confirm). */
  playClick(pitchShift = 0): void {
    this._resume();
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 220 * Math.pow(2, pitchShift / 12);
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(g);
    g.connect(this._gains.sfx);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }

  /** Spell cast ping (high sweep). */
  playSpellCast(color: number): void {
    this._resume();
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const g    = ctx.createGain();
    const base = 1200 + ((color >> 8) & 0xff) * 8;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(base * 3, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(g);
    g.connect(this._gains.sfx);
    osc.start();
    osc.stop(ctx.currentTime + 0.31);
  }

  /** Impact thud (melee hit). */
  playMeleeImpact(): void {
    this._resume();
    const ctx = this._ctx;
    const bufLen = Math.floor(ctx.sampleRate * 0.08);
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.2));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    src.connect(f);
    f.connect(g);
    g.connect(this._gains.sfx);
    src.start();
  }

  /** Slime death pop. */
  playSlimeDeath(): void {
    this._resume();
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(g);
    g.connect(this._gains.sfx);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  /** Level-up fanfare chord. */
  playLevelUp(): void {
    this._resume();
    const ctx   = this._ctx;
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      const t   = ctx.currentTime + i * 0.08;
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(g);
      g.connect(this._gains.sfx);
      osc.start(t);
      osc.stop(t + 0.56);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _resume(): void {
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  dispose(): void {
    this._stopAmbient(0.1);
    setTimeout(() => {
      this._ctx.close().catch(() => {});
      _instance = null;
    }, 200);
  }
}