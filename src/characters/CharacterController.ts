/**
 * CharacterController — animation state machine for a loaded character model.
 *
 * Wraps a `LoadedChar` and drives its `AnimationMixer` through a set of
 * named states.  Clip matching is done by fuzzy name search so the same
 * controller works across KayKit, fox, slime, FBX packs, and any future
 * pack without configuration changes.
 *
 * States are divided into:
 *   LOOPING  — idle, walk, run, jump_air, levitate, fly
 *   ONE-SHOT — jump_start, jump_land, spawn_air, spawn_ground, attack,
 *              cast, hit, die, interact, pickup
 *              These play once then crossfade back to a provided base state.
 *
 * Usage:
 *   const loaded = await loadCharModel(def);
 *   const ctrl   = new CharacterController(loaded);
 *   // in render loop:
 *   ctrl.update(dt);
 *   ctrl.setState('walk');
 *   ctrl.playOnce('jump_start', 'jump_air');
 */

import * as THREE         from 'three';
import type { LoadedChar } from '@/characters/CharacterLoader';

// ── State type ────────────────────────────────────────────────────────────────

/** Looping states — sustained until changed. */
export type CharAnimLoopState  = 'idle' | 'walk' | 'run' | 'jump_air' | 'levitate' | 'fly';
/** One-shot states — play once then auto-return to a base state. */
export type CharAnimOnceState  =
  | 'jump_start' | 'jump_land'
  | 'spawn_air'  | 'spawn_ground'
  | 'attack'     | 'cast'
  | 'hit'        | 'die'
  | 'interact'   | 'pickup';

export type CharAnimState = CharAnimLoopState | CharAnimOnceState;

// ── Clip-name candidates ──────────────────────────────────────────────────────

const STATE_CLIP_NAMES: Record<CharAnimState, readonly string[]> = {
  // ── Looping ──────────────────────────────────────────────────────────────
  idle:          ['Idle_A', 'Idle_B', 'Idle', 'idle', 'Stand', 'Rest'],
  walk:          ['Walking_A', 'Walking_B', 'Walking_C', 'Walk', 'walk', 'Walking', 'Move'],
  run:           ['Running_A', 'Running_B', 'Run', 'run', 'Running', 'Sprint'],
  jump_air:      ['Jump_Idle', 'Jump_Loop', 'JumpIdle', 'JumpLoop', 'Fall', 'fall', 'Float', 'Hover', 'Levitate'],
  levitate:      ['Fall', 'fall', 'Jump_Idle', 'Jump_Loop', 'JumpIdle', 'Float', 'Hover', 'Levitate'],
  fly:           ['Jump_Idle', 'Jump_Loop', 'JumpIdle', 'Fall', 'Running_A', 'Running_B', 'Run', 'run', 'Flying', 'Fly', 'Glide'],
  // ── One-shot ─────────────────────────────────────────────────────────────
  jump_start:    ['Jump_Start', 'JumpStart', 'Jump_Take_Off', 'JumpTakeoff', 'Jump'],
  jump_land:     ['Jump_Land', 'JumpLand', 'Jump_Landing', 'Land'],
  spawn_air:     ['Spawn_Air', 'SpawnAir', 'Appear_Air', 'Appear', 'Teleport_In'],
  spawn_ground:  ['Spawn_Ground', 'SpawnGround', 'Appear_Ground', 'Rise'],
  attack:        ['Attack', 'attack', 'AttackMelee', 'Attack_1', 'Slash', 'Strike'],
  cast:          ['Throw', 'throw', 'Use_Item', 'UseItem', 'Cast', 'cast', 'Magic'],
  hit:           ['Hit_A', 'Hit_B', 'Hit', 'hit', 'Hurt', 'Damage', 'TakeHit'],
  die:           ['Death_A', 'Death_B', 'Death', 'Die', 'die', 'Dead', 'Dying'],
  interact:      ['Interact', 'interact', 'Use', 'Examine', 'Activate'],
  pickup:        ['PickUp', 'Pickup', 'pickup', 'Pick_Up', 'Grab'],
};

/** One-shot states that play exactly once and should NOT loop. */
const ONE_SHOT_STATES = new Set<CharAnimState>([
  'jump_start', 'jump_land', 'spawn_air', 'spawn_ground',
  'attack', 'cast', 'hit', 'die', 'interact', 'pickup',
]);

/** Approximate clip durations for one-shot states (seconds). Used for auto-return timing. */
const ONE_SHOT_DURATION: Partial<Record<CharAnimState, number>> = {
  jump_start: 0.45,
  jump_land:  0.35,
  spawn_air:  0.6,
  spawn_ground: 0.6,
  attack:     0.55,
  cast:       0.5,
  hit:        0.4,
  die:        1.2,   // stays in final pose — caller must handle transition
  interact:   0.7,
  pickup:     0.65,
};

function findClip(
  clips: THREE.AnimationClip[],
  state: CharAnimState,
): THREE.AnimationClip | null {
  const candidates = STATE_CLIP_NAMES[state];
  for (const name of candidates) {
    const clip = clips.find((c) => c.name === name);
    if (clip) return clip;
  }
  const lc = candidates.map((n) => n.toLowerCase());
  for (const l of lc) {
    const clip = clips.find((c) => c.name.toLowerCase().startsWith(l));
    if (clip) return clip;
  }
  for (const l of lc) {
    const clip = clips.find((c) => c.name.toLowerCase().includes(l));
    if (clip) return clip;
  }
  return null;
}

// ── CharacterController class ─────────────────────────────────────────────────

export class CharacterController {
  private readonly _mixer:   THREE.AnimationMixer | null;
  private readonly _clips:   THREE.AnimationClip[];
  readonly scene:            THREE.Group;

  private _loopState:        CharAnimLoopState = 'idle';
  private _currentAction:    THREE.AnimationAction | null = null;
  /** Timer that blocks new setState calls while a one-shot is playing. */
  private _oneShotTimer      = 0;
  /** Looping state to return to after the one-shot finishes. */
  private _oneShotReturnTo:  CharAnimLoopState = 'idle';
  /** Callback fired when a one-shot finishes. */
  private _oneShotCb:        (() => void) | null = null;

  crossFadeDuration = 0.18;

  constructor(loaded: LoadedChar) {
    this.scene   = loaded.scene;
    this._mixer  = loaded.mixer;
    this._clips  = loaded.clips;
    if (this._mixer) this._playLoop('idle');
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get loopState(): CharAnimLoopState { return this._loopState; }
  get isPlayingOneShot(): boolean     { return this._oneShotTimer > 0; }

  /**
   * Transition to a sustained looping state.
   * Blocked while a one-shot is playing (unless `force` is true or state is 'die').
   */
  setState(next: CharAnimLoopState, crossFadeSec?: number, force = false): void {
    if (this._oneShotTimer > 0 && !force && next !== 'idle') return;
    if (next === this._loopState && this._oneShotTimer <= 0) return;
    this._loopState = next;
    this._playLoop(next, crossFadeSec ?? this.crossFadeDuration);
  }

  /**
   * Play a one-shot animation then crossfade back to `returnTo`.
   * If the state's clip is not found, falls through immediately to returnTo.
   *
   * @param state     Which one-shot clip to play.
   * @param returnTo  Loop state to return to when the one-shot ends.
   * @param onEnd     Optional callback when the one-shot finishes.
   */
  playOnce(
    state:    CharAnimOnceState,
    returnTo: CharAnimLoopState = 'idle',
    onEnd?:   () => void,
  ): void {
    const clip = findClip(this._clips, state);
    if (!clip || !this._mixer) {
      // No clip found — go straight to returnTo
      this._playLoop(returnTo);
      onEnd?.();
      return;
    }

    const duration = ONE_SHOT_DURATION[state] ?? clip.duration ?? 0.5;

    // For 'die': no return — character stays in final frame
    if (state === 'die') {
      this._oneShotTimer = -1; // permanent block
    } else {
      this._oneShotTimer    = duration;
      this._oneShotReturnTo = returnTo;
      this._oneShotCb       = onEnd ?? null;
    }

    const action = this._mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = (state === 'die');
    action.timeScale = 1;

    if (this._currentAction && this._currentAction !== action) {
      action.reset().play();
      this._currentAction.crossFadeTo(action, this.crossFadeDuration, false);
    } else {
      action.reset().play();
    }
    this._currentAction = action;
  }

  /** Advance the animation mixer.  Call once per frame with the frame delta. */
  update(dt: number): void {
    this._mixer?.update(dt);

    if (this._oneShotTimer > 0) {
      this._oneShotTimer -= dt;
      if (this._oneShotTimer <= 0) {
        const cb = this._oneShotCb;
        this._oneShotCb = null;
        this._playLoop(this._oneShotReturnTo);
        cb?.();
      }
    }
  }

  dispose(): void {
    this._mixer?.stopAllAction();
  }

  getClip(state: CharAnimState): THREE.AnimationClip | null {
    return findClip(this._clips, state);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _playLoop(state: CharAnimLoopState, crossFadeSec = 0): void {
    if (!this._mixer) return;
    const clip = findClip(this._clips, state);
    if (!clip) return;

    const next = this._mixer.clipAction(clip);
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.timeScale = 1;

    if (this._currentAction && this._currentAction !== next) {
      if (crossFadeSec > 0) {
        next.reset().play();
        this._currentAction.crossFadeTo(next, crossFadeSec, false);
      } else {
        this._currentAction.stop();
        next.reset().play();
      }
    } else if (!this._currentAction) {
      next.reset().play();
    }
    this._currentAction = next;
  }
}
