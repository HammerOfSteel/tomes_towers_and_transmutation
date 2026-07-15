/**
 * Tests for CharacterController — Phase 1
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

  it('creates without error with a full clip set', () => {
    const loaded = makeLoadedChar(['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death']);
    expect(() => new CharacterController(loaded)).not.toThrow();
  });

  it('exposes the scene from the LoadedChar', () => {
    const loaded = makeLoadedChar(['Idle']);
    const ctrl   = new CharacterController(loaded);
    expect(ctrl.scene).toBe(loaded.scene);
  });

  it('starts in idle state', () => {
    const loaded = makeLoadedChar(['Idle', 'Walk']);
    const ctrl   = new CharacterController(loaded);
    expect(ctrl.state).toBe('idle');
  });
});

// ── setState ──────────────────────────────────────────────────────────────────

describe('CharacterController — setState', () => {
  let ctrl: CharacterController;

  beforeEach(() => {
    ctrl = new CharacterController(
      makeLoadedChar(['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death']),
    );
  });

  it('transitions to walk state', () => {
    ctrl.setState('walk');
    expect(ctrl.state).toBe('walk');
  });

  it('transitions to run state', () => {
    ctrl.setState('run');
    expect(ctrl.state).toBe('run');
  });

  it('transitions to attack state', () => {
    ctrl.setState('attack');
    expect(ctrl.state).toBe('attack');
  });

  it('transitions to die state', () => {
    ctrl.setState('die');
    expect(ctrl.state).toBe('die');
  });

  it('is a no-op when already in the target state', () => {
    ctrl.setState('walk');
    ctrl.setState('walk');  // second call should not throw
    expect(ctrl.state).toBe('walk');
  });

  it('does not throw when transitioning to a state with no matching clip', () => {
    const loaded = makeLoadedChar(['Idle']); // only idle
    const c = new CharacterController(loaded);
    expect(() => c.setState('attack')).not.toThrow();
    expect(c.state).toBe('attack');
  });
});

// ── Clip resolution ───────────────────────────────────────────────────────────

describe('CharacterController — getClip', () => {
  it('returns the correct clip for each state', () => {
    const ctrl = new CharacterController(
      makeLoadedChar(['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death']),
    );
    expect(ctrl.getClip('idle')?.name).toBe('Idle');
    expect(ctrl.getClip('walk')?.name).toBe('Walk');
    expect(ctrl.getClip('run')?.name).toBe('Run');
    expect(ctrl.getClip('attack')?.name).toBe('Attack');
    expect(ctrl.getClip('hit')?.name).toBe('Hit');
    expect(ctrl.getClip('die')?.name).toBe('Death');
  });

  it('returns null for states without a matching clip', () => {
    const ctrl = new CharacterController(makeLoadedChar([]));
    expect(ctrl.getClip('walk')).toBeNull();
  });

  it('matches Walk via case-insensitive substring when exact name differs', () => {
    const ctrl = new CharacterController(makeLoadedChar(['walk_forward']));
    // "walk_forward" contains "walk" → should match
    expect(ctrl.getClip('walk')).not.toBeNull();
  });

  it('matches Death via Dying alias', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Dying']));
    expect(ctrl.getClip('die')).not.toBeNull();
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('CharacterController — update', () => {
  it('advances the mixer without error', () => {
    const ctrl = new CharacterController(makeLoadedChar(['Idle', 'Walk']));
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
    const ctrl = new CharacterController(makeLoadedChar(['Idle']));
    ctrl.setState('walk');
    expect(() => ctrl.dispose()).not.toThrow();
  });

  it('can be called when there is no mixer', () => {
    const ctrl = new CharacterController(makeLoadedChar([]));
    expect(() => ctrl.dispose()).not.toThrow();
  });
});
