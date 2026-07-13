// ── TamingGame — "The Princess's Song" ────────────────────────────────────────
//
//  3-round word-picking bard-spell mini-game for recruiting fleeing slimes.
//
//  Visual design (NO modal overlay):
//    • Bottom HUD strip — world stays fully visible; 4 runic spell-card buttons
//    • Three.js song circle — counter-rotating torus rings + orbiting gold rune
//      spheres + vertical light beam at the slime's position
//    • Slime hypnosis — gentle Y-spin, floating bob, pulsing lavender colour
//    • Floating reaction text — projected from 3D slime position, drifts up
//
//  Usage:
//    const taming = new TamingGame(scene, camera);   // once at startup
//    taming.onSuccess = (slime) => party.recruit(slime);
//    taming.onFail    = () => { /* slime bolts */ };
//    taming.begin(slime);
//    // call taming.update(dt) every frame

import * as THREE from 'three';
import type { SlimeEnemy } from '@/enemy/SlimeEnemy';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SlimePersonality = 'bold' | 'gentle' | 'curious' | 'lonely';

type Phase = 'idle' | 'choosing' | 'reacting' | 'success' | 'fail';

interface SongWord {
  button: string;
  verse:  string;
  scores: Record<SlimePersonality, number>;
}

// ── Song word data ─────────────────────────────────────────────────────────────

const SONG_ROUNDS: SongWord[][] = [
  // Round 0 — Greeting
  [
    { button: 'Brave wanderer',     verse: '"Brave wanderer\u2026"',     scores: { bold: 25, curious: 15, gentle: -10, lonely:  -5 } },
    { button: 'Gentle spirit',      verse: '"Gentle spirit\u2026"',      scores: { gentle: 25, lonely: 15, bold: -10, curious:   5 } },
    { button: 'Curious little one', verse: '"Curious little one\u2026"', scores: { curious: 25, bold: 10, gentle:   5, lonely:  -5 } },
    { button: 'Lonely heart',       verse: '"Lonely heart\u2026"',       scores: { lonely: 25, gentle: 15, bold: -15, curious:   5 } },
  ],
  // Round 1 — Promise
  [
    { button: "I'll walk beside you",   verse: "I'll walk beside you\u2026",   scores: { lonely: 25, gentle: 20, bold:  -5, curious:  5 } },
    { button: "We'll see new worlds",   verse: "we'll see new worlds\u2026",   scores: { curious: 25, bold: 15, gentle: -5, lonely:   5 } },
    { button: "I'll keep you safe",     verse: "I'll keep you safe\u2026",     scores: { gentle: 25, lonely: 20, bold: -10, curious: -5 } },
    { button: "Together we'll be bold", verse: "together we'll be bold\u2026", scores: { bold: 25, curious: 15, gentle: -10, lonely:   5 } },
  ],
  // Round 2 — Closing flourish
  [
    { button: 'Into the light, forever',  verse: '\u2026into the light, forever. \u266a"',    scores: { lonely: 25, gentle: 15, bold:  -5, curious: 10 } },
    { button: 'Through storm and shadow', verse: '\u2026through storm and shadow. \u266a"',   scores: { bold: 25, curious: 15, gentle: -15, lonely:  -5 } },
    { button: 'In peace, always',         verse: '\u2026in peace, always. \u266a"',           scores: { gentle: 25, lonely: 20, bold: -15, curious:  -5 } },
    { button: 'Ever forward, ever free',  verse: '\u2026ever forward, ever free. \u266a"',    scores: { curious: 25, bold: 20, gentle:  -5, lonely:   -5 } },
  ],
];

const SCORE_THRESHOLD = 45;

const REACTION_TEXTS: Record<string, [string, string]> = {
  great:   ['\u2736 The creature glows with joy!',   '#ffdd44'],
  good:    ['\u2736 It sways with gentle interest\u2026', '#88ff88'],
  neutral: ['\u2736 It listens, uncertain\u2026',         '#88aaff'],
  bad:     ['\u2736 It recoils from the melody\u2026',    '#ff6666'],
};

// ── Three.js Song Circle ───────────────────────────────────────────────────────

class SongCircle {
  readonly group: THREE.Group;
  private readonly _outer: THREE.Mesh;
  private readonly _inner: THREE.Mesh;
  private readonly _runes: THREE.Mesh[];
  private _timer = 0;
  private _pulseT = 0;
  private _pulseColor = 0x8844cc;

  constructor(pos: THREE.Vector3) {
    this.group = new THREE.Group();
    this.group.position.set(pos.x, pos.y + 0.05, pos.z);

    // Outer torus ring — flat on XZ plane
    const og = new THREE.TorusGeometry(1.5, 0.045, 8, 56);
    const om = new THREE.MeshBasicMaterial({ color: 0x8844cc });
    this._outer = new THREE.Mesh(og, om);
    this._outer.rotation.x = Math.PI / 2;
    this.group.add(this._outer);

    // Inner torus — counter-rotation, cyan
    const ig = new THREE.TorusGeometry(0.85, 0.03, 8, 40);
    const im = new THREE.MeshBasicMaterial({ color: 0x44aaff });
    this._inner = new THREE.Mesh(ig, im);
    this._inner.rotation.x = Math.PI / 2;
    this.group.add(this._inner);

    // 6 orbiting golden rune spheres
    const rg = new THREE.SphereGeometry(0.075, 6, 5);
    this._runes = Array.from({ length: 6 }, () => {
      const mesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffdd44 }));
      this.group.add(mesh);
      return mesh;
    });

    // Vertical light beam
    const bg = new THREE.CylinderGeometry(0.025, 0.025, 2.8, 6);
    const bm = new THREE.MeshBasicMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.35 });
    const beam = new THREE.Mesh(bg, bm);
    beam.position.y = 1.4;
    this.group.add(beam);
  }

  update(dt: number): void {
    this._timer += dt;
    const t = this._timer;

    this._outer.rotation.z += 0.45 * dt;
    this._inner.rotation.z -= 0.75 * dt;

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t * 0.9;
      this._runes[i].position.set(
        Math.cos(a) * 1.15,
        0.12 + Math.sin(t * 2.2 + i * 1.1) * 0.07,
        Math.sin(a) * 1.15,
      );
    }

    // Decay pulse
    if (this._pulseT > 0) {
      this._pulseT = Math.max(0, this._pulseT - dt * 3.0);
      const s = 1 + this._pulseT * 0.35;
      this._outer.scale.setScalar(s);
      this._inner.scale.setScalar(s);
      (this._outer.material as THREE.MeshBasicMaterial).color.setHex(
        this._pulseT > 0.05 ? this._pulseColor : 0x8844cc,
      );
    }
  }

  pulse(quality: 'great' | 'good' | 'neutral' | 'bad'): void {
    this._pulseT = 1.0;
    this._pulseColor =
      quality === 'great'   ? 0xffdd44 :
      quality === 'good'    ? 0x44ff88 :
      quality === 'neutral' ? 0x4488ff : 0xff4444;
  }

  setResonance(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction));
    (this._inner.material as THREE.MeshBasicMaterial).color.setHSL(f * 0.38, 0.9, 0.5);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}

// ── TamingGame ────────────────────────────────────────────────────────────────

export class TamingGame {
  private _slime: SlimeEnemy | null = null;
  private _circle: SongCircle | null = null;
  private _strip: HTMLDivElement | null = null;
  private _verseEl: HTMLElement | null = null;
  private _resFill: HTMLElement | null = null;
  private _choicesEl: HTMLElement | null = null;
  private _dotsEl: HTMLElement | null = null;

  private _phase: Phase = 'idle';
  private _round = 0;
  private _totalScore = 0;
  private _reactionTimer = 0;
  private _verseLines: string[] = [];

  onSuccess: ((slime: SlimeEnemy) => void) | null = null;
  onFail: (() => void) | null = null;

  constructor(
    private readonly _scene?: THREE.Scene,
    private readonly _camera?: THREE.Camera,
  ) {}

  get active(): boolean { return this._phase !== 'idle'; }

  // ── Public API ─────────────────────────────────────────────────────────────

  begin(slime: SlimeEnemy): void {
    if (this._phase !== 'idle') return;
    this._slime = slime;
    slime.startTaming();
    this._phase = 'choosing';
    this._round = 0;
    this._totalScore = 0;
    this._verseLines = [];

    if (this._scene) {
      this._circle = new SongCircle(slime.worldPosition);
      this._scene.add(this._circle.group);
    }

    this._buildStrip();
    this._showRound();
  }

  update(dt: number): void {
    this._circle?.update(dt);

    if (this._phase === 'reacting') {
      this._reactionTimer -= dt;
      if (this._reactionTimer <= 0) {
        this._round++;
        if (this._round >= SONG_ROUNDS.length) {
          this._handleFinalResult();
        } else {
          this._phase = 'choosing';
          this._showRound();
        }
      }
    } else if (this._phase === 'success' || this._phase === 'fail') {
      this._reactionTimer -= dt;
      if (this._reactionTimer <= 0) this.close();
    }
  }

  close(): void {
    this._slime?.stopTaming();
    if (this._circle && this._scene) {
      this._circle.dispose(this._scene);
      this._circle = null;
    }
    this._strip?.remove();
    this._strip = null;
    this._verseEl = null;
    this._resFill = null;
    this._choicesEl = null;
    this._dotsEl = null;
    this._slime = null;
    this._phase = 'idle';
  }

  // ── Private — game logic ──────────────────────────────────────────────────

  private _onWordChosen(wordIndex: number): void {
    if (this._phase !== 'choosing' || !this._slime) return;
    const word = SONG_ROUNDS[this._round][wordIndex];
    const score = word.scores[this._slime.personality];
    this._totalScore += score;
    this._verseLines[this._round] = word.verse;

    const quality: 'great' | 'good' | 'neutral' | 'bad' =
      score >= 20 ? 'great' :
      score >= 8  ? 'good'  :
      score >= 0  ? 'neutral' : 'bad';

    this._slime.tameReact(quality);
    this._circle?.pulse(quality);

    const [txt, col] = REACTION_TEXTS[quality];
    this._spawnFloatingText(txt, col);
    this._updateVerse();
    this._updateResonance();
    this._updateDots();
    this._disableChoices();

    this._phase = 'reacting';
    this._reactionTimer = 1.4;
  }

  private _handleFinalResult(): void {
    if (!this._slime) return;
    if (this._totalScore >= SCORE_THRESHOLD) {
      this._phase = 'success';
      this._reactionTimer = 1.8;
      this._showOutcome(true);
      this.onSuccess?.(this._slime);
    } else {
      this._phase = 'fail';
      this._reactionTimer = 1.2;
      this._showOutcome(false);
      this.onFail?.();
    }
  }

  // ── Private — bottom HUD strip ────────────────────────────────────────────

  private _buildStrip(): void {
    const strip = document.createElement('div');
    strip.id = 'taming-strip';
    Object.assign(strip.style, {
      position: 'fixed',
      bottom: '0', left: '0', right: '0',
      background: 'linear-gradient(to bottom, transparent 0%, rgba(5,2,14,0.97) 30%)',
      padding: '4px 5% 22px',
      zIndex: '800',
      fontFamily: '"Palatino Linotype", Palatino, serif',
      color: '#d4c8e8',
      userSelect: 'none',
    });

    // Meta row — title + round dots
    const metaRow = document.createElement('div');
    Object.assign(metaRow.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '3px',
    });
    const titleEl = document.createElement('span');
    titleEl.textContent = '\u266a  The Princess\u2019s Song';
    Object.assign(titleEl.style, {
      fontSize: '11px', letterSpacing: '2px', color: '#7755aa', opacity: '0.85',
    });
    metaRow.appendChild(titleEl);

    const dotsEl = document.createElement('div');
    Object.assign(dotsEl.style, { display: 'flex', gap: '6px' });
    for (let i = 0; i < SONG_ROUNDS.length; i++) {
      const d = document.createElement('div');
      Object.assign(d.style, {
        width: '8px', height: '8px', borderRadius: '50%',
        background: '#1a0e2e', border: '1px solid #4422aa',
        transition: 'background 0.3s, border-color 0.3s',
      });
      d.dataset['dot'] = String(i);
      dotsEl.appendChild(d);
    }
    this._dotsEl = dotsEl;
    metaRow.appendChild(dotsEl);
    strip.appendChild(metaRow);

    // Verse display
    const verseEl = document.createElement('div');
    verseEl.textContent = '\u2026';
    Object.assign(verseEl.style, {
      fontStyle: 'italic', fontSize: '13px', color: '#9980bb',
      marginBottom: '6px', minHeight: '20px', lineHeight: '1.5', letterSpacing: '0.3px',
    });
    this._verseEl = verseEl;
    strip.appendChild(verseEl);

    // Resonance bar
    const resRow = document.createElement('div');
    Object.assign(resRow.style, {
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
    });
    const resNote = document.createElement('span');
    resNote.textContent = '\u266b';
    Object.assign(resNote.style, { color: '#6644aa', fontSize: '14px' });
    const resBg = document.createElement('div');
    Object.assign(resBg.style, {
      flex: '1', height: '4px', background: '#0e0820', borderRadius: '2px', overflow: 'hidden',
    });
    const resFill = document.createElement('div');
    Object.assign(resFill.style, {
      height: '100%', width: '0%',
      background: 'linear-gradient(90deg, #6644aa, #cc99ff)',
      borderRadius: '2px', transition: 'width 0.5s ease, background 0.5s ease',
    });
    resBg.appendChild(resFill);
    this._resFill = resFill;
    resRow.append(resNote, resBg);
    strip.appendChild(resRow);

    // Choices container
    const choicesEl = document.createElement('div');
    Object.assign(choicesEl.style, { display: 'flex', gap: '10px', flexWrap: 'wrap' });
    this._choicesEl = choicesEl;
    strip.appendChild(choicesEl);

    document.body.appendChild(strip);
    this._strip = strip;
  }

  private _showRound(): void {
    if (!this._choicesEl) return;
    this._choicesEl.innerHTML = '';

    SONG_ROUNDS[this._round].forEach((word, i) => {
      const btn = document.createElement('button');
      btn.textContent = word.button;
      Object.assign(btn.style, {
        flex: '1 1 calc(25% - 8px)', minWidth: '130px',
        padding: '10px 14px',
        background: 'rgba(10,4,22,0.88)',
        border: '1px solid #5533aa',
        borderRadius: '6px',
        color: '#c8b8e8',
        fontFamily: 'inherit', fontSize: '13px', letterSpacing: '0.5px',
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.08s',
        boxShadow: '0 0 8px rgba(100,60,180,0.2)',
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(44,18,72,0.92)';
        btn.style.borderColor = '#aa77ff';
        btn.style.boxShadow = '0 0 18px rgba(150,90,255,0.55)';
      });
      btn.addEventListener('mouseleave', () => {
        if (btn.disabled) return;
        btn.style.background = 'rgba(10,4,22,0.88)';
        btn.style.borderColor = '#5533aa';
        btn.style.boxShadow = '0 0 8px rgba(100,60,180,0.2)';
      });
      btn.addEventListener('click', () => {
        btn.style.transform = 'scale(0.93)';
        btn.style.boxShadow = '0 0 30px rgba(200,140,255,0.9)';
        setTimeout(() => { btn.style.transform = ''; }, 110);
        this._onWordChosen(i);
      });
      this._choicesEl!.appendChild(btn);
    });
  }

  private _disableChoices(): void {
    if (!this._choicesEl) return;
    this._choicesEl.querySelectorAll('button').forEach(b => {
      (b as HTMLButtonElement).disabled = true;
      (b as HTMLButtonElement).style.opacity = '0.3';
      (b as HTMLButtonElement).style.cursor = 'default';
      (b as HTMLButtonElement).style.boxShadow = 'none';
    });
  }

  private _updateVerse(): void {
    if (this._verseEl) this._verseEl.textContent = this._verseLines.join(' ');
  }

  private _updateResonance(): void {
    if (!this._resFill) return;
    const pct = Math.max(0, Math.min(100, (this._totalScore / SCORE_THRESHOLD) * 100));
    const onTrack = this._totalScore >= (SCORE_THRESHOLD / SONG_ROUNDS.length) * (this._round + 1);
    this._resFill.style.width = `${pct}%`;
    this._resFill.style.background = onTrack
      ? 'linear-gradient(90deg, #6644aa, #66ddaa)'
      : 'linear-gradient(90deg, #6622aa, #cc4466)';
    this._circle?.setResonance(pct / 100);
  }

  private _updateDots(): void {
    if (!this._dotsEl) return;
    this._dotsEl.querySelectorAll<HTMLElement>('[data-dot]').forEach(d => {
      if (parseInt(d.dataset['dot']!) <= this._round) {
        d.style.background = '#8855cc';
        d.style.borderColor = '#bb88ff';
      }
    });
  }

  private _showOutcome(success: boolean): void {
    if (!this._choicesEl) return;
    this._choicesEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.textContent = success
      ? '\u2736  A new friend joins the song!  \u2736'
      : '\u266a  The melody fades away\u2026';
    Object.assign(msg.style, {
      width: '100%', textAlign: 'center',
      fontSize: '16px', letterSpacing: '2px', padding: '10px 0',
      color: success ? '#88ffbb' : '#cc4466',
      textShadow: success
        ? '0 0 16px rgba(80,220,120,0.7)'
        : '0 0 12px rgba(200,50,80,0.5)',
    });
    this._choicesEl.appendChild(msg);
  }

  /** Project slime's 3D position to screen space and spawn a drifting label. */
  private _spawnFloatingText(text: string, color: string): void {
    if (!this._slime || !this._camera) return;

    const wp = this._slime.worldPosition.clone();
    wp.y += 1.8;
    wp.project(this._camera);

    const x = ((wp.x + 1) / 2) * window.innerWidth;
    const y = ((1 - wp.y) / 2) * window.innerHeight;

    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      position: 'fixed',
      left: `${x}px`, top: `${y}px`,
      transform: 'translateX(-50%)',
      color,
      fontFamily: '"Palatino Linotype", Palatino, serif',
      fontSize: '15px', fontStyle: 'italic',
      pointerEvents: 'none', zIndex: '900',
      opacity: '1',
      transition: 'opacity 0.9s ease, top 0.9s ease',
      whiteSpace: 'nowrap',
      textShadow: `0 0 10px ${color}`,
    });
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.style.top = `${y - 52}px`;
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 1000);
  }
}
