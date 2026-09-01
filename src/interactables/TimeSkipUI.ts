// ── TimeSkipUI — "Time Warp" spell UI ─────────────────────────────────────────
//
//  Non-modal bottom HUD strip (styled after TamingGame's "Princess's Song"
//  strip) that lets the player pick a preset time of day, then plays a
//  spinning time-vortex VFX while TimeSystem.instance.hour eases forward
//  toward the chosen target over a fixed real-time window.
//
//  Design: docs/superpowers/specs/2026-09-01-timeskip-spell-design.md
//
//  Usage:
//    const timeSkipUI = new TimeSkipUI(scene);   // once at startup
//    timeSkipUI.onToast = (text) => _storyToast(text, 'beat');
//    // from the time_warp spell's onTimeSkip callback:
//    timeSkipUI.begin(player.group.position);
//    // call timeSkipUI.update(dt) every frame, BEFORE _dayNight.update(...)

import * as THREE from 'three';
import { TimeSystem } from '@/world/TimeSystem';

type Phase = 'idle' | 'choosing' | 'warping';

interface TimePreset {
  key: string;
  label: string;
  glyph: string;
  hour: number;
  toast: string;
}

// Hour anchors chosen to land on strongly-saturated DayNightSystem phase
// colours rather than mid-transition blends — see design spec for the
// hour-19-for-dusk reasoning (DayNightSystem's dusk->night branch gives a
// pure, un-blended dusk phase exactly at hour 19).
const PRESETS: TimePreset[] = [
  { key: 'dawn',     label: 'Dawn',     glyph: '🌅', hour: 6,  toast: 'Time flows to dawn\u2026' },
  { key: 'noon',     label: 'Noon',     glyph: '☀️', hour: 12, toast: 'Time flows to noon\u2026' },
  { key: 'dusk',     label: 'Dusk',     glyph: '🌇', hour: 19, toast: 'Time flows to dusk\u2026' },
  { key: 'midnight', label: 'Midnight', glyph: '🌙', hour: 0,  toast: 'Time flows to midnight\u2026' },
];

const WARP_DURATION = 2.5; // seconds — fixed real-time window for the warp animation

function _easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** Advance `from` toward `to` by fraction `t` in [0, 1], always moving
 *  forward — wraps past 24 if `to` is numerically behind `from` so the
 *  clock never appears to run backward mid-animation. */
function _lerpHourForward(from: number, to: number, t: number): number {
  const to24 = to >= from ? to : to + 24;
  return (from + (to24 - from) * t) % 24;
}

// ── Time Vortex VFX — spinning clock-face rune ring ───────────────────────────

class TimeVortexVfx {
  readonly group: THREE.Group;
  private readonly _rim: THREE.Mesh;
  private readonly _hand: THREE.Mesh;
  /** Radians/sec — TimeSkipUI ramps this up while the warp is in flight. */
  spinSpeed = 1.2;

  constructor(pos: THREE.Vector3) {
    this.group = new THREE.Group();
    this.group.position.set(pos.x, pos.y + 1.6, pos.z);

    // Clock rim — flat golden torus, lying in the XZ plane
    const rimGeo = new THREE.TorusGeometry(0.55, 0.035, 8, 32);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
    this._rim = new THREE.Mesh(rimGeo, rimMat);
    this._rim.rotation.x = Math.PI / 2;
    this.group.add(this._rim);

    // 12 fixed hour-tick marks around the rim — pale blue, like clock numerals
    const tickGeo = new THREE.SphereGeometry(0.03, 5, 4);
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(tickGeo, new THREE.MeshBasicMaterial({ color: 0xbcd8ff }));
      const a = (i / 12) * Math.PI * 2;
      mesh.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      this.group.add(mesh);
    }

    // Sweeping clock hand, pivoting at the rim's centre
    const handGeo = new THREE.BoxGeometry(0.045, 0.02, 0.44);
    handGeo.translate(0, 0, 0.22);
    const handMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
    this._hand = new THREE.Mesh(handGeo, handMat);
    this.group.add(this._hand);
  }

  update(dt: number): void {
    this._rim.rotation.z += 0.35 * dt;
    this._hand.rotation.y += this.spinSpeed * dt;
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

// ── TimeSkipUI ─────────────────────────────────────────────────────────────────

export class TimeSkipUI {
  private _phase: Phase = 'idle';
  private _vortex: TimeVortexVfx | null = null;
  private _strip: HTMLDivElement | null = null;
  private _fromHour = 0;
  private _toHour = 0;
  private _elapsed = 0;
  private _activePreset: TimePreset | null = null;

  /** Fired once, with the preset's toast text, when a warp finishes landing. */
  onToast: ((text: string) => void) | null = null;

  private readonly _onKeydown = (e: KeyboardEvent): void => {
    // Escape only cancels the *picker* — once warping has started, let it
    // finish (the strip is already gone by then, so there's nothing to cancel).
    if (e.code === 'Escape' && this._phase === 'choosing') this.close();
  };

  constructor(private readonly _scene?: THREE.Scene) {
    window.addEventListener('keydown', this._onKeydown);
  }

  get active(): boolean { return this._phase !== 'idle'; }

  // ── Public API ─────────────────────────────────────────────────────────────

  begin(origin: THREE.Vector3): void {
    if (this._phase !== 'idle') return;
    this._phase = 'choosing';

    if (this._scene) {
      this._vortex = new TimeVortexVfx(origin);
      this._scene.add(this._vortex.group);
    }

    this._buildStrip();
  }

  update(dt: number): void {
    this._vortex?.update(dt);

    if (this._phase !== 'warping') return;

    this._elapsed += dt;
    const t = Math.min(this._elapsed / WARP_DURATION, 1);
    // Write the hour field directly for intermediate frames — setHour()'s
    // synchronous localStorage write is fine for a single call, but this
    // runs every frame for ~2.5s (~150 calls at 60fps); hammering
    // localStorage.setItem() that often caused a measurable render-loop
    // stall in live testing. Nobody needs a mid-warp value to survive a
    // crash/reload, so only the final landing value (below) is persisted.
    TimeSystem.instance.hour = _lerpHourForward(this._fromHour, this._toHour, _easeInOut(t));

    // Spin fastest at the midpoint of the warp, slowest at the ends —
    // matches the ease-in/out "spinning up, then settling" feel.
    if (this._vortex) this._vortex.spinSpeed = 1.2 + (1 - Math.abs(t - 0.5) * 2) * 6;

    if (t >= 1) {
      TimeSystem.instance.setHour(this._toHour); // exact landing value, no float drift
      this.onToast?.(this._activePreset?.toast ?? '');
      this.close();
    }
  }

  close(): void {
    if (this._vortex && this._scene) this._vortex.dispose(this._scene);
    this._vortex = null;
    this._strip?.remove();
    this._strip = null;
    this._phase = 'idle';
    this._activePreset = null;
  }

  /** Remove the window keydown listener. Call once at app teardown (mirrors
   *  how other window-listener-holding UI classes in this codebase expect
   *  to be torn down, e.g. QuestAcceptModal). */
  dispose(): void {
    window.removeEventListener('keydown', this._onKeydown);
    this.close();
  }

  // ── Private — picker logic ───────────────────────────────────────────────

  private _onPresetChosen(preset: TimePreset): void {
    if (this._phase !== 'choosing') return;
    this._fromHour = TimeSystem.instance.hour;
    this._toHour = preset.hour;
    this._activePreset = preset;
    this._elapsed = 0;
    this._phase = 'warping';

    // Strip closes immediately on selection — the vortex VFX + racing sky
    // is the feedback from here on, not the strip.
    this._strip?.remove();
    this._strip = null;
  }

  // ── Private — bottom HUD strip ────────────────────────────────────────────

  private _buildStrip(): void {
    const strip = document.createElement('div');
    strip.id = 'timeskip-strip';
    Object.assign(strip.style, {
      position: 'fixed',
      bottom: '0', left: '0', right: '0',
      background: 'linear-gradient(to bottom, transparent 0%, rgba(10,8,2,0.97) 30%)',
      padding: '4px 5% 22px',
      zIndex: '800',
      fontFamily: '"Palatino Linotype", Palatino, serif',
      color: '#e8dcc8',
      userSelect: 'none',
    });

    const titleEl = document.createElement('div');
    titleEl.textContent = '⏳  Time Warp — choose a time of day';
    Object.assign(titleEl.style, {
      fontSize: '11px', letterSpacing: '2px', color: '#aa8855', opacity: '0.85',
      marginBottom: '8px',
    });
    strip.appendChild(titleEl);

    const choicesEl = document.createElement('div');
    Object.assign(choicesEl.style, { display: 'flex', gap: '10px', flexWrap: 'wrap' });

    PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.textContent = `${preset.glyph}  ${preset.label}`;
      Object.assign(btn.style, {
        flex: '1 1 calc(25% - 8px)', minWidth: '130px',
        padding: '10px 14px',
        background: 'rgba(22,14,4,0.88)',
        border: '1px solid #aa7733',
        borderRadius: '6px',
        color: '#e8d8b8',
        fontFamily: 'inherit', fontSize: '13px', letterSpacing: '0.5px',
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.08s',
        boxShadow: '0 0 8px rgba(180,120,40,0.2)',
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(60,36,8,0.92)';
        btn.style.borderColor = '#ffaa55';
        btn.style.boxShadow = '0 0 18px rgba(255,170,85,0.55)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(22,14,4,0.88)';
        btn.style.borderColor = '#aa7733';
        btn.style.boxShadow = '0 0 8px rgba(180,120,40,0.2)';
      });
      btn.addEventListener('click', () => {
        btn.style.transform = 'scale(0.93)';
        setTimeout(() => { btn.style.transform = ''; }, 110);
        this._onPresetChosen(preset);
      });
      choicesEl.appendChild(btn);
    });

    strip.appendChild(choicesEl);
    document.body.appendChild(strip);
    this._strip = strip;
  }
}
