// ── Animator: idle / walk / emotes / blink on the shared rig contract ───────
//
//  Stateless recompute: every frame sets joint rotations from scratch, so
//  archetype swaps and emote interruptions can never leave stale poses.
//  Per-archetype flavor comes from dna.motion (energy/bounce/idleStyle) and
//  each synth/part's own tick hooks — this file never branches on archetype.

import type { PrincessDNA } from './types';
import type { BuildResult } from './synth/contracts';

export type EmoteId = 'wave' | 'twirl' | 'dance' | 'cast';
export const EMOTES: readonly EmoteId[] = ['wave', 'twirl', 'dance', 'cast'];

const EMOTE_DURATION: Record<EmoteId, number> = {
  wave: 2.2, twirl: 1.9, dance: 2.6, cast: 2.0,
};

/** smooth in (15%) / out (25%) envelope. */
function envelope(u: number): number {
  const inn = Math.min(1, u / 0.15);
  const out = Math.min(1, (1 - u) / 0.25);
  const s = (x: number): number => x * x * (3 - 2 * x);
  return s(Math.max(0, Math.min(inn, out)));
}

export class Animator {
  private result: BuildResult | null = null;
  private dna: PrincessDNA | null = null;
  private walking = false;
  private emote: { id: EmoteId; start: number } | null = null;
  private nextBlink = 2.5;
  private blinkStart = -1;
  /** Fired at the flourish moment of the 'cast' emote (stage sparkles). */
  onCastBurst: (() => void) | null = null;
  private castFired = false;

  bind(result: BuildResult, dna: PrincessDNA): void {
    this.result = result;
    this.dna = dna;
  }

  setWalking(on: boolean): void {
    this.walking = on;
  }

  get isWalking(): boolean {
    return this.walking;
  }

  playEmote(id: EmoteId): void {
    this.emote = { id, start: -1 }; // start stamped on next update
    this.castFired = false;
  }

  update(t: number): void {
    if (!this.result || !this.dna) return;
    const { rig, hooks } = this.result;
    const m = this.dna.motion;
    const energy = 0.4 + m.energy * 0.9;

    // ── Reset the pose-affecting transforms we own ──
    rig.root.rotation.set(0, 0, 0);
    rig.root.position.y = rig.baseY;
    rig.torso.rotation.set(0, 0, 0);

    const breath = Math.sin(t * 2.2) * 0.028;
    rig.torso.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);

    if (this.walking) {
      const phase = t * (3.6 + m.energy * 5.5);
      rig.root.position.y = rig.baseY + Math.abs(Math.sin(phase)) * (0.25 + m.bounce * 0.75);
      rig.torso.rotation.z = Math.sin(phase) * 0.05;
      rig.torso.rotation.y = Math.sin(phase) * 0.1;
      rig.neck.rotation.set(Math.sin(phase * 2) * 0.05 + 0.06, 0, -Math.sin(phase) * 0.04);
      for (let i = 0; i < 2; i++) {
        const lp = phase + (i === 0 ? 0 : Math.PI);
        rig.hips[i].rotation.set(Math.sin(lp) * 0.55 * energy, 0, 0);
        rig.knees[i].rotation.set(Math.max(0, -Math.cos(lp)) * 0.95 * energy, 0, 0);
        const ap = lp + Math.PI;
        const side = i === 0 ? 1 : -1;
        rig.shoulders[i].rotation.set(Math.sin(ap) * 0.5 * energy, 0, side * 0.4);
        rig.elbows[i].rotation.set(-0.3 + Math.sin(ap) * 0.2, 0, side * -0.08);
      }
    } else {
      // ── Idle ──
      const style = m.idleStyle;
      if (style === 'float') {
        rig.root.position.y = rig.baseY + 0.16 + Math.sin(t * 1.6) * 0.12;
      } else if (style === 'bob') {
        rig.root.position.y = rig.baseY + Math.abs(Math.sin(t * 2.6)) * 0.14 * (0.5 + m.bounce);
      }
      if (style === 'sway' || style === 'float') {
        rig.torso.rotation.z = Math.sin(t * 1.3) * 0.035;
      }
      rig.neck.rotation.set(
        Math.cos(t * 0.45) * 0.04,
        Math.sin(t * 0.7) * 0.22,
        Math.cos(t * 0.5) * 0.07,
      );
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? 1 : -1;
        const legDangle = style === 'float' ? 0.18 : 0;
        rig.hips[i].rotation.set(0.08 + legDangle, side * 0.18, side * 0.06);
        rig.knees[i].rotation.set(style === 'float' ? 0.25 : 0, 0, 0);
        // Polite hands resting over the dress
        rig.shoulders[i].rotation.set(0.12, 0, side * 0.52);
        rig.elbows[i].rotation.set(-0.35, 0, side * -0.15);
      }
      if (style === 'rattle') {
        const j = (f: number, o: number): number => Math.sin(t * f + o) * 0.009;
        rig.torso.rotation.z += j(37, 0);
        rig.neck.rotation.z += j(53, 1);
        for (let i = 0; i < 2; i++) {
          rig.shoulders[i].rotation.z += j(43, i * 2);
          rig.hips[i].rotation.z += j(47, i * 3);
        }
      }
    }

    // ── Emote overlay ──
    if (this.emote) {
      if (this.emote.start < 0) this.emote.start = t;
      const id = this.emote.id;
      const dur = EMOTE_DURATION[id];
      const u = (t - this.emote.start) / dur;
      if (u >= 1) {
        this.emote = null;
      } else {
        const e = envelope(u);
        if (id === 'wave') {
          rig.shoulders[1].rotation.z = -2.35 * e;
          rig.shoulders[1].rotation.x = -0.15 * e;
          rig.elbows[1].rotation.z = Math.sin(t * 11) * 0.55 * e;
          rig.neck.rotation.z = 0.12 * e;
        } else if (id === 'twirl') {
          const s = (x: number): number => x * x * (3 - 2 * x);
          rig.root.rotation.y = s(u) * Math.PI * 4;
          rig.shoulders[0].rotation.z = 1.5 * e;
          rig.shoulders[1].rotation.z = -1.5 * e;
          rig.root.position.y += Math.sin(u * Math.PI) * 0.5;
        } else if (id === 'dance') {
          rig.root.position.y += Math.abs(Math.sin(t * 6.2)) * 0.5 * e;
          rig.torso.rotation.z += Math.sin(t * 6.2) * 0.09 * e;
          for (let i = 0; i < 2; i++) {
            const side = i === 0 ? 1 : -1;
            rig.shoulders[i].rotation.x = Math.sin(t * 6.2 + i * Math.PI) * 0.9 * e - 0.4 * e;
            rig.shoulders[i].rotation.z = side * (0.6 + Math.sin(t * 3.1) * 0.25) * e;
            rig.elbows[i].rotation.x = -0.6 * e;
          }
          rig.neck.rotation.z += Math.sin(t * 3.1) * 0.12 * e;
        } else {
          // cast
          for (let i = 0; i < 2; i++) {
            rig.shoulders[i].rotation.x = -1.25 * e;
            rig.shoulders[i].rotation.z = (i === 0 ? 1 : -1) * 0.18 * e;
            rig.elbows[i].rotation.x = -0.35 * e;
          }
          rig.neck.rotation.x = -0.12 * e;
          if (!this.castFired && u > 0.45) {
            this.castFired = true;
            this.onCastBurst?.();
          }
        }
      }
    }

    // ── Blink ──
    if (hooks.setBlink) {
      if (this.blinkStart < 0 && t >= this.nextBlink) this.blinkStart = t;
      if (this.blinkStart >= 0) {
        const bu = (t - this.blinkStart) / 0.24;
        if (bu >= 1) {
          this.blinkStart = -1;
          this.nextBlink = t + 2.5 + Math.random() * 2.5;
          hooks.setBlink(0);
        } else {
          hooks.setBlink(Math.sin(bu * Math.PI));
        }
      }
    }
  }
}
