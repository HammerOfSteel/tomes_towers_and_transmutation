/**
 * LightingSystem — Phase 7.5c
 *
 * Manages all dynamic scene lights:
 *   • Torch PointLights with seeded per-torch flicker
 *   • Transient spell-cast pulse lights (decay over ~0.4 s)
 *   • Scene ambiance presets (dungeon / library / observatory / greenhouse)
 *
 * Usage:
 *   const lighting = new LightingSystem(scene);
 *
 *   // After loading a blueprint:
 *   lighting.clearTorches();
 *   lighting.addTorchesForBlueprint(blueprint);
 *
 *   // On spell cast:
 *   lighting.addSpellPulse(hitPos, 0x44aaff);
 *
 *   // Game loop:
 *   lighting.update(dt);
 *
 *   // On scene teardown:
 *   lighting.dispose();
 */

import * as THREE from 'three';
import type { Blueprint } from '@/levels/blueprint';

// ── Constants ─────────────────────────────────────────────────────────────────

const TORCH_INTENSITY   = 1.2;
const TORCH_DISTANCE    = 8.0;   // world units
const TORCH_DECAY       = 2;     // quadratic falloff
const TORCH_COLOR       = 0xff8833;  // warm amber
const TORCH_FLICK_AMP   = 0.18;  // ±18% brightness flicker
const TORCH_Y_FRAC      = 0.65;  // torch height = wallHeight * this

const PULSE_DURATION    = 0.4;   // seconds for spell pulse to decay
const PULSE_START_INT   = 3.0;

/** mulberry32 — fast seeded PRNG (no dependency on global PRNG state). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Torch entry ───────────────────────────────────────────────────────────────

interface TorchEntry {
  light: THREE.PointLight;
  baseIntensity: number;
  flickerFreq: number;   // radians per second
  flickerPhase: number;  // initial phase offset
}

// ── Pulse entry ───────────────────────────────────────────────────────────────

interface PulseEntry {
  light: THREE.PointLight;
  elapsed: number;
}

// ── Preset definitions ────────────────────────────────────────────────────────

export type LightPreset = 'dungeon' | 'library' | 'observatory' | 'greenhouse' | 'exterior_night' | 'none';

interface PresetParams {
  ambientColor: number;
  ambientIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  torchColor: number;
}

const PRESETS: Record<LightPreset, PresetParams> = {
  dungeon: {
    ambientColor: 0x331a00, ambientIntensity: 0.6,
    fogColor: 0x0a0a0f, fogNear: 30, fogFar: 60,
    torchColor: 0xff7722,
  },
  library: {
    ambientColor: 0x2a1a00, ambientIntensity: 0.65,
    fogColor: 0x100800, fogNear: 25, fogFar: 55,
    torchColor: 0xffaa44,
  },
  observatory: {
    ambientColor: 0x050510, ambientIntensity: 0.55,
    fogColor: 0x0c0820, fogNear: 30, fogFar: 100,
    torchColor: 0x8888ff,
  },
  greenhouse: {
    ambientColor: 0x0a1a08, ambientIntensity: 0.7,
    fogColor: 0x0a1408, fogNear: 20, fogFar: 50,
    torchColor: 0x88dd44,
  },
  exterior_night: {
    ambientColor: 0x020510, ambientIntensity: 0.4,
    fogColor: 0x010208, fogNear: 50, fogFar: 200,
    torchColor: 0x4466cc,
  },
  none: {
    ambientColor: 0x000000, ambientIntensity: 0,
    fogColor: 0x0a0a0f, fogNear: 30, fogFar: 60,
    torchColor: TORCH_COLOR,
  },
};

// ── LightingSystem ────────────────────────────────────────────────────────────

export class LightingSystem {
  private readonly _scene: THREE.Scene;
  private readonly _torches: TorchEntry[] = [];
  private readonly _pulses:  PulseEntry[]  = [];
  private readonly _ambientLight: THREE.AmbientLight;

  /** Total elapsed time in seconds — used for flicker phase. */
  private _t = 0;

  /** Ambient fade — lerps intensity from _ambientFadeFrom → _ambientFadeTo over duration. */
  private _ambientFadeFrom = 0;
  private _ambientFadeTo   = 0;
  private _ambientFadeDuration = 0;
  private _ambientFadeElapsed  = 0;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    // Interior ambient fill light (separate from the global hemisphere)
    this._ambientLight = new THREE.AmbientLight(0x331a00, 0.6);
    this._scene.add(this._ambientLight);
  }

  // ── Torch management ────────────────────────────────────────────────────

  /**
   * Auto-place torch PointLights at the corners (and, for wide rooms, mid-walls)
   * of a blueprint.  Room geometry is centred at the origin in world space.
   */
  addTorchesForBlueprint(bp: Blueprint): void {
    const rng     = mulberry32(bp.id.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
    const halfW   = (bp.width  * bp.cellSize) / 2;
    const halfD   = (bp.depth  * bp.cellSize) / 2;
    const torchY  = bp.wallHeight * TORCH_Y_FRAC;
    const cs      = bp.cellSize;

    // Inset from corners by 1 cell so torches clear the corner pillars
    const inset = cs * 1.2;

    const positions: Array<[number, number, number]> = [
      [-halfW + inset, torchY, -halfD + inset],
      [ halfW - inset, torchY, -halfD + inset],
      [-halfW + inset, torchY,  halfD - inset],
      [ halfW - inset, torchY,  halfD - inset],
    ];

    // For rooms wider than 6 cells, add mid-wall torches on each long side
    if (bp.width > 6) {
      positions.push([ 0, torchY, -halfD + inset]);
      positions.push([ 0, torchY,  halfD - inset]);
    }
    if (bp.depth > 6) {
      positions.push([-halfW + inset, torchY, 0]);
      positions.push([ halfW - inset, torchY, 0]);
    }

    for (const [x, y, z] of positions) {
      this._addTorch(x, y, z, rng);
    }
  }

  /** Remove all torch lights from the scene (call before loading a new room). */
  clearTorches(): void {
    for (const t of this._torches) this._scene.remove(t.light);
    this._torches.length = 0;
  }

  /**
   * World-space positions of all currently active torches.
   * Useful for placing particle fire emitters at the same locations.
   */
  get torchPositions(): THREE.Vector3[] {
    return this._torches.map(t => t.light.position.clone());
  }

  // ── Spell pulse ─────────────────────────────────────────────────────────

  /**
   * Spawn a short-lived PointLight at `pos` in the spell's `color`.
   * Light decays from PULSE_START_INT → 0 over PULSE_DURATION seconds.
   */
  addSpellPulse(pos: THREE.Vector3, color: number): void {
    const light = new THREE.PointLight(color, PULSE_START_INT, 12, 2);
    light.position.copy(pos);
    this._scene.add(light);
    this._pulses.push({ light, elapsed: 0 });
  }

  /**
   * Fade the ambient light intensity from `fromIntensity` → preset normal over
   * `duration` seconds. Call when entering an unvisited room for the first time.
   */
  fadeAmbientIn(fromIntensity: number, duration: number): void {
    this._ambientFadeFrom     = fromIntensity;
    this._ambientFadeTo       = this._ambientLight.intensity;
    this._ambientFadeDuration = duration;
    this._ambientFadeElapsed  = 0;
    this._ambientLight.intensity = fromIntensity;
  }

  // ── Scene preset ─────────────────────────────────────────────────────────

  /**
   * Apply an ambiance preset: sets the interior ambient light color/intensity
   * and updates scene fog to match the mood.
   */
  applyPreset(preset: LightPreset): void {
    const p = PRESETS[preset];
    this._ambientLight.color.setHex(p.ambientColor);
    this._ambientLight.intensity = p.ambientIntensity;
    this._scene.fog = new THREE.Fog(p.fogColor, p.fogNear, p.fogFar);
    // Update active torch colors to match preset
    for (const t of this._torches) t.light.color.setHex(p.torchColor);
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  update(dt: number): void {
    this._t += dt;

    // Flicker active torches
    for (const t of this._torches) {
      const flicker = Math.sin(this._t * t.flickerFreq + t.flickerPhase) * TORCH_FLICK_AMP;
      t.light.intensity = Math.max(0.1, t.baseIntensity + flicker);
    }

    // Decay spell pulses
    for (let i = this._pulses.length - 1; i >= 0; i--) {
      const p = this._pulses[i];
      p.elapsed += dt;
      const frac = 1 - p.elapsed / PULSE_DURATION;
      if (frac <= 0) {
        this._scene.remove(p.light);
        this._pulses.splice(i, 1);
      } else {
        p.light.intensity = PULSE_START_INT * frac * frac; // quadratic falloff
      }
    }

    // Ambient fade-in for first-visit rooms
    if (this._ambientFadeElapsed < this._ambientFadeDuration && this._ambientFadeDuration > 0) {
      this._ambientFadeElapsed += dt;
      const t = Math.min(1, this._ambientFadeElapsed / this._ambientFadeDuration);
      // Ease-out cubic so the room "blooms" into view
      const ease = 1 - Math.pow(1 - t, 3);
      this._ambientLight.intensity = this._ambientFadeFrom + (this._ambientFadeTo - this._ambientFadeFrom) * ease;
    }
  }

  // ── Teardown ─────────────────────────────────────────────────────────────

  dispose(): void {
    this.clearTorches();
    for (const p of this._pulses) this._scene.remove(p.light);
    this._pulses.length = 0;
    this._scene.remove(this._ambientLight);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _addTorch(x: number, y: number, z: number, rng: () => number): void {
    const light = new THREE.PointLight(TORCH_COLOR, TORCH_INTENSITY, TORCH_DISTANCE, TORCH_DECAY);
    light.position.set(x, y, z);
    this._scene.add(light);
    this._torches.push({
      light,
      baseIntensity: TORCH_INTENSITY,
      // freq: 3–7 rad/s (visible flicker at ~0.5–1.1 Hz without aliasing)
      flickerFreq:  3 + rng() * 4,
      flickerPhase: rng() * Math.PI * 2,
    });
  }
}
