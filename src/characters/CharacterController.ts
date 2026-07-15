/**
 * CharacterController — animation state machine for a loaded character model.
 *
 * Wraps a `LoadedChar` and drives its `AnimationMixer` through a small set of
 * named states (idle, walk, run, attack, hit, die).  Clip matching is done by
 * fuzzy name search so the same controller works across KayKit, fox, slime,
 * FBX packs, and any future pack without configuration changes.
 *
 * Usage:
 *   const loaded = await loadCharModel(def);
 *   const ctrl   = new CharacterController(loaded);
 *   // in render loop:
 *   ctrl.update(dt);
 *   ctrl.setState('walk');
 */

import * as THREE         from 'three';
import type { LoadedChar } from '@/characters/CharacterLoader';

// ── State type ────────────────────────────────────────────────────────────────

export type CharAnimState = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'die';

// ── Clip-name matching ────────────────────────────────────────────────────────

/** Ordered candidate names for each state.  First match wins. */
const STATE_CLIP_NAMES: Record<CharAnimState, readonly string[]> = {
  // KayKit names first (Idle_A, Running_A, Walking_A), then generic names.
  // NOTE: 'T-Pose' intentionally omitted — the rig has an exact 'T-Pose' clip
  // which would otherwise win the idle exact-match pass.
  idle:   ['Idle_A', 'Idle_B', 'Idle', 'idle', 'Stand', 'Rest'],
  walk:   ['Walking_A', 'Walking_B', 'Walking_C', 'Walk', 'walk',
           'WalkForward', 'Walk_N', 'Walking', 'Move'],
  run:    ['Running_A', 'Running_B', 'Run', 'run', 'RunForward',
           'Run_N', 'Running', 'Sprint'],
  attack: ['Attack', 'attack', 'AttackMelee', 'Attack_1', 'Attack1',
           'AttackCombo', 'Slash', 'Strike'],
  hit:    ['Hit_A', 'Hit_B', 'Hit', 'hit', 'Hurt', 'Damage', 'TakeHit', 'HitReact'],
  die:    ['Death_A', 'Death_B', 'Death', 'Die', 'die', 'Dead', 'Dying', 'Fall'],
};

/**
 * Find the best clip from `clips` for `state` using a case-insensitive
 * substring search against the candidate list.  Returns null if nothing
 * matches.
 */
function findClip(
  clips: THREE.AnimationClip[],
  state: CharAnimState,
): THREE.AnimationClip | null {
  const candidates = STATE_CLIP_NAMES[state];

  // 1. Exact match first (fastest, handles KayKit naming directly)
  for (const name of candidates) {
    const clip = clips.find((c) => c.name === name);
    if (clip) return clip;
  }

  // 2. Case-insensitive prefix match
  const lowerCandidates = candidates.map((n) => n.toLowerCase());
  for (const lc of lowerCandidates) {
    const clip = clips.find((c) => c.name.toLowerCase().startsWith(lc));
    if (clip) return clip;
  }

  // 3. Substring match
  for (const lc of lowerCandidates) {
    const clip = clips.find((c) => c.name.toLowerCase().includes(lc));
    if (clip) return clip;
  }

  return null;
}

// ── CharacterController class ─────────────────────────────────────────────────

export class CharacterController {
  private readonly _mixer:   THREE.AnimationMixer | null;
  private readonly _clips:   THREE.AnimationClip[];
  private readonly _scene:   THREE.Group;

  private _state:            CharAnimState = 'idle';
  private _currentAction:    THREE.AnimationAction | null = null;

  /**
   * Default crossfade duration in seconds.  Shorter = snappier transitions.
   */
  crossFadeDuration = 0.2;

  constructor(loaded: LoadedChar) {
    this._scene  = loaded.scene;
    this._mixer  = loaded.mixer;
    this._clips  = loaded.clips;

    // Start idle automatically if the clip exists
    if (this._mixer) {
      this._play('idle');
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get scene(): THREE.Group   { return this._scene; }
  get state(): CharAnimState { return this._state;  }

  /**
   * Transition to `nextState` with an optional crossfade.
   * No-op if already in the same state.
   */
  setState(nextState: CharAnimState, crossFadeSec?: number): void {
    if (nextState === this._state) return;
    this._state = nextState;
    this._play(nextState, crossFadeSec ?? this.crossFadeDuration);
  }

  /** Advance the animation mixer.  Call once per frame with the frame delta. */
  update(dt: number): void {
    this._mixer?.update(dt);
  }

  /** Stop all animations and release mixer actions. */
  dispose(): void {
    this._mixer?.stopAllAction();
  }

  /**
   * Return the clip matching `state`, or null.
   * Useful for inspecting what was resolved at load time.
   */
  getClip(state: CharAnimState): THREE.AnimationClip | null {
    return findClip(this._clips, state);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _play(state: CharAnimState, crossFadeSec = 0): void {
    if (!this._mixer) return;

    const clip = findClip(this._clips, state);
    if (!clip) return;   // No matching clip — keep whatever is playing

    const nextAction = this._mixer.clipAction(clip);
    // Always ensure the action loops and never freezes on the last frame
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;

    if (this._currentAction && this._currentAction !== nextAction) {
      if (crossFadeSec > 0) {
        nextAction.reset().play();
        // warping=false: don't adjust playback speed — prevents timeScale → 0 freeze
        this._currentAction.crossFadeTo(nextAction, crossFadeSec, false);
      } else {
        this._currentAction.stop();
        nextAction.reset().play();
      }
    } else if (!this._currentAction) {
      nextAction.reset().play();
    }

    this._currentAction = nextAction;
  }
}
