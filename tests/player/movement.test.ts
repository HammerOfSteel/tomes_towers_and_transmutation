import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  calculateMoveDirection,
  calculateWoWMoveDirection,
  ISO_FORWARD,
  ISO_BACKWARD,
  ISO_LEFT,
  ISO_RIGHT,
} from '@/player/PlayerController';

// Helper — all movement vectors should be unit length (or zero)
const approxUnit = (v: THREE.Vector3) => expect(v.length()).toBeCloseTo(1, 5);
const approxZero = (v: THREE.Vector3) => expect(v.lengthSq()).toBeCloseTo(0, 5);

describe('calculateMoveDirection (isometric input mapping)', () => {
  // ── Single key ─────────────────────────────────────────────────────────────

  it('W key returns ISO_FORWARD direction', () => {
    const dir = calculateMoveDirection({
      moveForward: true,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
    });
    expect(dir.x).toBeCloseTo(ISO_FORWARD.x, 5);
    expect(dir.z).toBeCloseTo(ISO_FORWARD.z, 5);
    expect(dir.y).toBe(0);
    approxUnit(dir);
  });

  it('S key returns ISO_BACKWARD direction', () => {
    const dir = calculateMoveDirection({
      moveForward: false,
      moveBackward: true,
      moveLeft: false,
      moveRight: false,
    });
    expect(dir.x).toBeCloseTo(ISO_BACKWARD.x, 5);
    expect(dir.z).toBeCloseTo(ISO_BACKWARD.z, 5);
    approxUnit(dir);
  });

  it('A key returns ISO_LEFT direction', () => {
    const dir = calculateMoveDirection({
      moveForward: false,
      moveBackward: false,
      moveLeft: true,
      moveRight: false,
    });
    expect(dir.x).toBeCloseTo(ISO_LEFT.x, 5);
    expect(dir.z).toBeCloseTo(ISO_LEFT.z, 5);
    approxUnit(dir);
  });

  it('D key returns ISO_RIGHT direction', () => {
    const dir = calculateMoveDirection({
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: true,
    });
    expect(dir.x).toBeCloseTo(ISO_RIGHT.x, 5);
    expect(dir.z).toBeCloseTo(ISO_RIGHT.z, 5);
    approxUnit(dir);
  });

  // ── Diagonal keys ──────────────────────────────────────────────────────────

  it('W+D produces a normalized diagonal pointing forward-right', () => {
    const dir = calculateMoveDirection({
      moveForward: true,
      moveBackward: false,
      moveLeft: false,
      moveRight: true,
    });
    approxUnit(dir);
    // W is (-1,0,-1) norm; D is (+1,0,-1) norm; sum → (0,0,-2) → (0,0,-1)
    expect(dir.x).toBeCloseTo(0, 4);
    expect(dir.z).toBeCloseTo(-1, 4);
    expect(dir.y).toBe(0);
  });

  it('W+A produces a normalized diagonal pointing forward-left', () => {
    const dir = calculateMoveDirection({
      moveForward: true,
      moveBackward: false,
      moveLeft: true,
      moveRight: false,
    });
    approxUnit(dir);
    // W is (-1,0,-1) norm; A is (-1,0,+1) norm; sum → (-2,0,0) → (-1,0,0)
    expect(dir.x).toBeCloseTo(-1, 4);
    expect(dir.z).toBeCloseTo(0, 4);
  });

  // ── Opposing keys cancel ───────────────────────────────────────────────────

  it('W+S cancel to zero vector', () => {
    const dir = calculateMoveDirection({
      moveForward: true,
      moveBackward: true,
      moveLeft: false,
      moveRight: false,
    });
    approxZero(dir);
  });

  it('A+D cancel to zero vector', () => {
    const dir = calculateMoveDirection({
      moveForward: false,
      moveBackward: false,
      moveLeft: true,
      moveRight: true,
    });
    approxZero(dir);
  });

  // ── No input ───────────────────────────────────────────────────────────────

  it('no keys returns zero vector', () => {
    const dir = calculateMoveDirection({
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
    });
    approxZero(dir);
  });

  // ── y-axis is always zero ──────────────────────────────────────────────────

  it('movement direction never has a y component', () => {
    const cases = [
      { moveForward: true,  moveBackward: false, moveLeft: false, moveRight: false },
      { moveForward: false, moveBackward: false, moveLeft: true,  moveRight: true  },
      { moveForward: true,  moveBackward: false, moveLeft: true,  moveRight: false },
    ];
    for (const c of cases) {
      expect(calculateMoveDirection(c).y).toBe(0);
    }
  });
});

describe('calculateWoWMoveDirection (camera-relative input mapping)', () => {
  it('W key with yaw=0 returns forward = (0,0,1)', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false },
      0,
    );
    expect(dir.x).toBeCloseTo(0, 5);
    expect(dir.z).toBeCloseTo(1, 5);
    expect(dir.y).toBe(0);
  });

  it('S key with yaw=0 returns backward = (0,0,-1)', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: false, moveBackward: true, moveLeft: false, moveRight: false },
      0,
    );
    expect(dir.x).toBeCloseTo(0, 5);
    expect(dir.z).toBeCloseTo(-1, 5);
  });

  it('W key rotates with yaw — yaw=PI/2 returns forward = (1,0,0)', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false },
      Math.PI / 2,
    );
    expect(dir.x).toBeCloseTo(1, 5);
    expect(dir.z).toBeCloseTo(0, 5);
  });

  it('W+S cancel to zero vector regardless of yaw', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: true, moveBackward: true, moveLeft: false, moveRight: false },
      1.234,
    );
    expect(dir.lengthSq()).toBeCloseTo(0, 5);
  });

  it('no keys returns zero vector', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false },
      0,
    );
    expect(dir.lengthSq()).toBeCloseTo(0, 5);
  });

  it('result is always unit length when moving', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false },
      0.9,
    );
    expect(dir.length()).toBeCloseTo(1, 5);
  });

  // ── Strafing (right-mouse-look held) ────────────────────────────────────

  it('A/D are ignored (no strafe) when strafing=false, matching turn-in-place mode', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: false, moveBackward: false, moveLeft: true, moveRight: true },
      0,
      false,
    );
    expect(dir.lengthSq()).toBeCloseTo(0, 5);
  });

  it('D key strafes right when strafing=true — yaw=0 returns (1,0,0)', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: false, moveBackward: false, moveLeft: false, moveRight: true },
      0,
      true,
    );
    expect(dir.x).toBeCloseTo(1, 5);
    expect(dir.z).toBeCloseTo(0, 5);
  });

  it('A key strafes left when strafing=true — yaw=0 returns (-1,0,0)', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: false, moveBackward: false, moveLeft: true, moveRight: false },
      0,
      true,
    );
    expect(dir.x).toBeCloseTo(-1, 5);
    expect(dir.z).toBeCloseTo(0, 5);
  });

  it('A+D cancel to zero vector when strafing=true', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: false, moveBackward: false, moveLeft: true, moveRight: true },
      0,
      true,
    );
    expect(dir.lengthSq()).toBeCloseTo(0, 5);
  });

  it('W+D strafing=true produces a normalized forward-right diagonal', () => {
    const dir = calculateWoWMoveDirection(
      { moveForward: true, moveBackward: false, moveLeft: false, moveRight: true },
      0,
      true,
    );
    expect(dir.length()).toBeCloseTo(1, 5);
    expect(dir.x).toBeGreaterThan(0);
    expect(dir.z).toBeGreaterThan(0);
  });
});

