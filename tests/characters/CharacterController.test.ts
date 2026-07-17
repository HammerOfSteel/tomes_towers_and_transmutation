/**
 * Tests for CharacterController — Phase 1 (updated for expanded state machine)
 */
import { describe, it, expect, beforeEach }   from 'vitest';
import * as THREE                              from 'three';
import { CharacterController }                 from '@/characters/CharacterController';
import type { LoadedChar }                       from '@/characters/CharacterLoader';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeClip(name: string, duration = 1): THREE.AnimationClip {
  const track = new THREE.QuaternionKeyframeTrack(
    'Root.quaternion', [0, duration], [0, 0, 0, 1, 0, 0, 0, 1],
  );
  return new THREE.AnimationClip(name, duration, [track]);
}

function makeLoadedChar(clipNames: string[]): LoadedChar {
  const scene  = new THREE.Group();
  const clips  = clipNames.map(makeClip);
  const mixer  = clips.length > 0 ? new THREE.AnimationMixer(scene) : null;
  return { scene, mixer, clips, format: 'glb' };
}

// ── Construction ──────────────────────────────────────────────────────────────

describe('CharacterController — construction', () => {
  it('creates without error when no clips are available', () => {
    const loaded = makeLoadedChar([]);
    expect(() => new CharacterController(loaded)).not.toThrow();
  });

  it('creates without error with a full KayKit clip set', () => {
    const loaded = makeLoadedChar([
      'Idle_A', 'Walking_A', 'Running_A',
      'Attack', 'Hit_A', 'Death_A',
      'Jump_Start', 'Jump_Idle', 'Jump_Land',
      'Spawn_Air', 'Throw',
    ]);
    expect(() => new CharacterController(loaded)).not.toThrow();
  });

  it('exposes the scene from the LoadedChar', () => {
    const loaded = makeLoadedChar(['Idle']);
    const ctrl   = new CharacterController(loaded);
    expect(ctrl.scene).toBe(loaded.scene);
  });

  it('starts in idle loopState', () => {
    const loaded = makeLoadedChar(['Idle', 'Walk']);
    const ctrl   = new CharacterController(loaded);
    expect(ctrl.loopState).toBe('idle');
  });

  it('is NOT playing a one-shot on construction', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle_A']));
    expect(ctrl.isPlayingOneShot).toBe(false);
  });
});

// ── setState (looping states) ─────────────────────────────────────────────────

describe('CharacterController — setState (looping)', () => {
  let ctrl: CharacterController;

  beforeEach(() => {
    ctrl = new CharacterController(
      makeLoadedChar(['Idle', 'Walk', 'Run', 'Jump_Idle', 'Levitate']),
    );
  });

  it('transitions to walk state', () => {
    ctrl.setState('walk');
    expect(ctrl.loopState).toBe('walk');
  });

  it('transitions to run state', () => {
    ctrl.setState('run');
    expect(ctrl.loopState).toBe('run');
  });

  it('transitions to jump_air state', () => {
    ctrl.setState('jump_air');
    expect(ctrl.loopState).toBe('jump_air');
  });

  it('transitions to levitate state', () => {
    ctrl.setState('levitate');
    expect(ctrl.loopState).toBe('levitate');
  });

  it('is a no-op when already in the target state', () => {
    ctrl.setState('walk');
    ctrl.setState('walk');
    expect(ctrl.loopState).toBe('walk');
  });

  it('does not throw when transitioning to a state with no matching clip', () => {
    const c = new CharacterController(makeLoadedChar(['Idle']));
    expect(() => c.setState('run')).not.toThrow();
    expect(c.loopState).toBe('run');
  });
});

// ── playOnce (one-shot states) ────────────────────────────────────────────────

describe('CharacterController — playOnce', () => {
  it('does not throw when no clip found, calls onEnd immediately', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle']));
    let called = false;
    expect(() => ctrl.playOnce('attack', 'idle', () => { called = true; })).not.toThrow();
    expect(called).toBe(true);   // fallthrough — no clip found
  });

  it('marks isPlayingOneShot while the timer is active', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle', 'Attack']));
    ctrl.playOnce('attack', 'idle');
    expect(ctrl.isPlayingOneShot).toBe(true);
  });

  it('resets to returnTo state after one-shot timer expires', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle', 'Attack']));
    ctrl.playOnce('attack', 'idle');
    // Advance well beyond the attack duration (0.55s)
    for (let i = 0; i < 60; i++) ctrl.update(0.016);
    expect(ctrl.isPlayingOneShot).toBe(false);
    expect(ctrl.loopState).toBe('idle');
  });

  it('calls onEnd callback when one-shot finishes', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle', 'Throw']));
    let cbFired = false;
    ctrl.playOnce('cast', 'idle', () => { cbFired = true; });
    for (let i = 0; i < 60; i++) ctrl.update(0.016);
    expect(cbFired).toBe(true);
  });

  it('spawn_air plays without error', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle', 'Spawn_Air']));
    expect(() => ctrl.playOnce('spawn_air', 'idle')).not.toThrow();
    expect(ctrl.isPlayingOneShot).toBe(true);
  });

  it('setState is blocked while one-shot plays', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle', 'Hit_A']));
    ctrl.playOnce('hit', 'idle');
    ctrl.setState('run');
    // loop state should still be 'idle' (blocked)
    expect(ctrl.loopState).toBe('idle');
  });
});

// ── Clip resolution ───────────────────────────────────────────────────────────

describe('CharacterController — getClip', () => {
  it('resolves KayKit clip names to states', () => {
    const ctrl = new CharacterController(
      makeLoadedChar(['Idle_A', 'Walking_A', 'Running_A', 'Attack', 'Hit_A', 'Death_A',
                      'Jump_Start', 'Jump_Idle', 'Jump_Land', 'Spawn_Air', 'Throw']),
    );
    expect(ctrl.getClip('idle')?.name).toBe('Idle_A');
    expect(ctrl.getClip('walk')?.name).toBe('Walking_A');
    expect(ctrl.getClip('run')?.name).toBe('Running_A');
    expect(ctrl.getClip('attack')?.name).toBe('Attack');
    expect(ctrl.getClip('hit')?.name).toBe('Hit_A');
    expect(ctrl.getClip('die')?.name).toBe('Death_A');
    expect(ctrl.getClip('jump_start')?.name).toBe('Jump_Start');
    expect(ctrl.getClip('jump_air')?.name).toBe('Jump_Idle');
    expect(ctrl.getClip('jump_land')?.name).toBe('Jump_Land');
    expect(ctrl.getClip('spawn_air')?.name).toBe('Spawn_Air');
    expect(ctrl.getClip('cast')?.name).toBe('Throw');
  });

  it('returns null for states without a matching clip', () => {
    const ctrl = new CharacterController(makeLoadedChar([]));
    expect(ctrl.getClip('walk')).toBeNull();
  });

  it('matches Walk via case-insensitive substring when exact name differs', () => {
    const ctrl = new CharacterController(makeLoadedChar(['walk_forward']));
    expect(ctrl.getClip('walk')).not.toBeNull();
  });

  it('matches die via Dying alias', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Dying']));
    expect(ctrl.getClip('die')).not.toBeNull();
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('CharacterController — update', () => {
  it('advances the mixer without error', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle_A', 'Walking_A']));
    expect(() => ctrl.update(0.016)).not.toThrow();
  });

  it('does not throw when there is no mixer (no clips)', () => {
    const ctrl = new CharacterController(makeLoadedChar([]));
    expect(() => ctrl.update(0.016)).not.toThrow();
  });
});

// ── dispose ───────────────────────────────────────────────────────────────────

describe('CharacterController — dispose', () => {
  it('can be called without error', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle_A']));
    ctrl.setState('walk');
    expect(() => ctrl.dispose()).not.toThrow();
  });

  it('can be called when there is no mixer', () => {
    const ctrl = new CharacterController(makeLoadedChar([]));
    expect(() => ctrl.dispose()).not.toThrow();
  });
});

