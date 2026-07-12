import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  calculateMoveDirection,
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
