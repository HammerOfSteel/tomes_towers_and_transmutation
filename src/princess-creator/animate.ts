// ── Animator: game-grade clip playback on the shared rig contract ───────────
//
//  A thin state machine over anim/clips + anim/player:
//  - `setState(id)`   — base loop (idle / walk / run / jump_idle / block_1 …)
//  - `play(id)`       — one-shot (attacks, casts, hits, deaths, emotes);
//                       returns to the base state when done, except holdLast
//                       clips (deaths) which freeze until something else plays
//  - species flavor comes from the resolved ClipSet (lamia slithers, slime
//    melts…) plus idle-style overlays (float hover, skeleton rattle) and the
//    ever-present breath/blink.
//
//  Game events (hit frames, cast_release, footsteps, liftoff/land) surface
//  through `onEvent`.

import type { PrincessDNA } from './types';
import type { BuildResult } from './synth/contracts';
import { resolveClips, STATE_IDS, type AnimId, type ClipSet, type TweakMap } from './anim/clips';
import { ClipPlayer } from './anim/player';

export type EmoteId = 'wave' | 'twirl' | 'dance' | 'cast';
export const EMOTES: readonly EmoteId[] = ['wave', 'twirl', 'dance', 'cast'];
const EMOTE_TO_CLIP: Record<EmoteId, AnimId> = {
  wave: 'wave', twirl: 'twirl', dance: 'dance', cast: 'cast_spell_1',
};

export class Animator {
  private result: BuildResult | null = null;
  private dna: PrincessDNA | null = null;
  private clipSet: ClipSet | null = null;
  private player = new ClipPlayer();
  private state: AnimId = 'idle';
  private oneShot: AnimId | null = null;
  private held = false;              // frozen on a holdLast final frame
  private nextBlink = 2.5;
  private blinkStart = -1;
  private lastNow = 0;
  /** Game/stage hooks: hit, cast_release, step, liftoff, land, parry… */
  onEvent: ((id: string) => void) | null = null;
  /** Legacy hook kept for the stage sparkle burst. */
  onCastBurst: (() => void) | null = null;

  constructor() {
    this.player.onEvent = (id) => {
      if (id === 'cast_release') this.onCastBurst?.();
      this.onEvent?.(id);
    };
  }

  bind(result: BuildResult, dna: PrincessDNA, tweaks: TweakMap = {}): void {
    this.result = result;
    this.dna = dna;
    this.clipSet = resolveClips(dna, tweaks);
    this.oneShot = null;
    this.held = false;
    this.player.play(this.clipSet[this.state] ?? this.clipSet.idle, this.lastNow);
  }

  get clips(): ClipSet | null { return this.clipSet; }
  get currentId(): AnimId { return this.oneShot ?? this.state; }
  /** The base loop we're in (ignores any one-shot riding on top). */
  get stateId(): AnimId { return this.state; }

  /** Base loop. Unknown/one-shot ids fall back to play(). */
  setState(id: AnimId): void {
    if (!this.clipSet) return;
    if (!STATE_IDS.includes(id)) { this.play(id); return; }
    this.state = id;
    this.oneShot = null;
    this.held = false;
    this.player.play(this.clipSet[id], this.lastNow);
  }

  /** One-shot; auto-returns to the current base state (unless holdLast). */
  play(id: AnimId): void {
    if (!this.clipSet) return;
    const clip = this.clipSet[id];
    if (!clip) return;
    if (clip.loop) { this.setState(id); return; }
    this.oneShot = id;
    this.held = false;
    this.player.play(clip, this.lastNow);
  }

  // ── Legacy API (main/factory/tests) ──
  setWalking(on: boolean): void {
    this.setState(on ? 'walk' : 'idle');
  }

  get isWalking(): boolean {
    return this.state === 'walk' || this.state === 'run';
  }

  playEmote(id: EmoteId | AnimId): void {
    const clipId = (EMOTE_TO_CLIP as Record<string, AnimId>)[id] ?? (id as AnimId);
    this.play(clipId);
  }

  update(t: number): void {
    this.lastNow = t;
    if (!this.result || !this.dna || !this.clipSet) return;
    const { rig, hooks } = this.result;

    // One-shot lifecycle
    if (this.oneShot && this.player.isFinished && !this.held) {
      const clip = this.clipSet[this.oneShot];
      if (clip.holdLast) {
        this.held = true; // stay dead until told otherwise
      } else {
        this.oneShot = null;
        this.player.play(this.clipSet[this.state], t);
      }
    }

    const pose = this.player.sample(t);

    // ── Apply pose to the rig ──
    const j = pose.joints;
    rig.torso.rotation.set(j.torso[0], j.torso[1], j.torso[2]);
    rig.neck.rotation.set(j.neck[0], j.neck[1], j.neck[2]);
    rig.shoulders[0].rotation.set(j.shoulderL[0], j.shoulderL[1], j.shoulderL[2]);
    rig.shoulders[1].rotation.set(j.shoulderR[0], j.shoulderR[1], j.shoulderR[2]);
    rig.elbows[0].rotation.set(j.elbowL[0], j.elbowL[1], j.elbowL[2]);
    rig.elbows[1].rotation.set(j.elbowR[0], j.elbowR[1], j.elbowR[2]);
    rig.hips[0].rotation.set(j.hipL[0], j.hipL[1], j.hipL[2]);
    rig.hips[1].rotation.set(j.hipR[0], j.hipR[1], j.hipR[2]);
    rig.knees[0].rotation.set(j.kneeL[0], j.kneeL[1], j.kneeL[2]);
    rig.knees[1].rotation.set(j.kneeR[0], j.kneeR[1], j.kneeR[2]);
    rig.root.rotation.set(pose.rootRot[0], pose.rootRot[1], pose.rootRot[2]);

    let rootY = rig.baseY + pose.rootY;
    let scale = pose.torsoScale;

    // ── Overlays: idle-style motion + breath (not while dead/held) ──
    if (!this.held) {
      const style = this.dna.motion.idleStyle;
      const grounded = this.currentId === 'idle' || this.currentId === 'idle_alt'
        || this.currentId === 'walk' || this.currentId === 'run' || this.currentId === 'read';
      if (grounded) {
        if (style === 'float') rootY += 0.16 + Math.sin(t * 1.6) * 0.12;
        else if (style === 'bob' && (this.currentId === 'idle' || this.currentId === 'idle_alt')) {
          rootY += Math.abs(Math.sin(t * 2.6)) * 0.14 * (0.5 + this.dna.motion.bounce);
        }
        if (style === 'rattle') {
          rig.torso.rotation.z += Math.sin(t * 37) * 0.009;
          rig.neck.rotation.z += Math.sin(t * 53 + 1) * 0.009;
        }
      }
      scale *= 1 + Math.sin(t * 2.2) * 0.028;
    }

    rig.root.position.y = rootY;
    rig.torso.scale.set(scale, 1 + (scale - 1) * 0.5, scale);

    // ── Blink (the dead don't blink) ──
    if (hooks.setBlink && !this.held) {
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
