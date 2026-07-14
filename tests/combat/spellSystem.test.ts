/**
 * Phase 7d — SpellSystem unit tests
 * Tests: cooldown, nova_burst AOE range, chain_arc bounce limit, isReady gate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Minimal Three.js stub ──────────────────────────────────────────────────
vi.mock('three', () => {
  class Vector3 {
    x: number; y: number; z: number;
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    distanceTo(v: Vector3) {
      const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    copy(v: Vector3) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    subVectors(a: Vector3, b: Vector3) {
      this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this;
    }
    normalize() {
      const l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) || 1;
      this.x /= l; this.y /= l; this.z /= l; return this;
    }
    multiplyScalar(s: number) { this.x *= s; this.y *= s; this.z *= s; return this; }
    add(v: Vector3) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
    setY(y: number) { this.y = y; return this; }
    addScaledVector(v: Vector3, s: number) {
      this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this;
    }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    lerpVectors(a: Vector3, b: Vector3, t: number) {
      this.x = a.x + (b.x - a.x) * t;
      this.y = a.y + (b.y - a.y) * t;
      this.z = a.z + (b.z - a.z) * t;
      return this;
    }
    addVectors(a: Vector3, b: Vector3) {
      this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this;
    }
  }

  const disposeStub = vi.fn();
  const makeGeometry = () => ({ dispose: disposeStub });
  const makeMaterial = () => ({ opacity: 1, transparent: false, emissiveIntensity: 1, dispose: disposeStub });
  const makeMesh = () => ({
    position: new Vector3(),
    rotation: { x: 0, y: 0, z: 0 },
    quaternion: { setFromUnitVectors: vi.fn() },
    material: makeMaterial(),
    geometry: makeGeometry(),
    scale: { setScalar: vi.fn(), x: 1, y: 1, z: 1 },
  });

  return {
    Vector3,
    Scene: class { add = vi.fn(); remove = vi.fn(); },
    Mesh: vi.fn(() => makeMesh()),
    MeshStandardMaterial: vi.fn(() => makeMaterial()),
    MeshBasicMaterial: vi.fn(() => makeMaterial()),
    SphereGeometry: vi.fn(() => makeGeometry()),
    TorusGeometry: vi.fn(() => makeGeometry()),
    CylinderGeometry: vi.fn(() => makeGeometry()),
    Color: vi.fn(() => ({})),
    Group: class {
      position = new Vector3();
      children: unknown[] = [];
    },
  };
});

// ── Damageable stub ────────────────────────────────────────────────────────
import * as THREE from 'three';

function makeEnemy(x: number, z: number): {
  worldPosition: THREE.Vector3;
  isDead: boolean;
  takeDamage: ReturnType<typeof vi.fn>;
  forceFlee: ReturnType<typeof vi.fn>;
} {
  return {
    worldPosition: new THREE.Vector3(x, 0, z),
    isDead: false,
    takeDamage: vi.fn(() => 1),
    forceFlee: vi.fn(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────
import { SpellSystem } from '@/combat/SpellSystem';

describe('SpellSystem', () => {
  let sys: SpellSystem;
  let scene: THREE.Scene;
  const origin = new THREE.Vector3(0, 0, 0);
  const aim    = new THREE.Vector3(5, 0, 0);

  beforeEach(() => {
    sys = new SpellSystem();
    scene = new THREE.Scene();
  });

  // ── isReady / cooldownFraction ────────────────────────────────────────
  it('isReady returns true before first cast', () => {
    expect(sys.isReady('nova_burst')).toBe(true);
    expect(sys.cooldownFraction('nova_burst')).toBe(0);
  });

  it('isReady returns false immediately after cast', () => {
    const enemies = [makeEnemy(0, 0)]; // within 12u
    sys.cast('nova_burst', origin, aim, enemies, scene);
    expect(sys.isReady('nova_burst')).toBe(false);
    expect(sys.cooldownFraction('nova_burst')).toBe(1);
  });

  it('cooldownFraction decreases after time passes', () => {
    sys.cast('nova_burst', origin, aim, [makeEnemy(0, 0)], scene);
    // Advance 7.5s out of 15s total
    sys.update(7.5, scene, [], origin);
    const frac = sys.cooldownFraction('nova_burst');
    expect(frac).toBeGreaterThan(0);
    expect(frac).toBeLessThan(1);
    // Should be roughly 0.5 (7.5s elapsed / 15s cooldown)
    expect(frac).toBeCloseTo(0.5, 1);
  });

  it('isReady returns true after full cooldown elapses', () => {
    sys.cast('nova_burst', origin, aim, [makeEnemy(0, 0)], scene);
    sys.update(15.1, scene, [], origin);
    expect(sys.isReady('nova_burst')).toBe(true);
    expect(sys.cooldownFraction('nova_burst')).toBe(0);
  });

  it('cast returns false when spell is on cooldown', () => {
    const enemies = [makeEnemy(0, 0)];
    expect(sys.cast('nova_burst', origin, aim, enemies, scene)).toBe(true);
    expect(sys.cast('nova_burst', origin, aim, enemies, scene)).toBe(false);
  });

  // ── nova_burst AOE range ───────────────────────────────────────────────
  it('nova_burst hits enemies within 12u radius', () => {
    const close = makeEnemy(5, 0);   // 5u away
    const edge  = makeEnemy(11, 0);  // 11u away — within range
    sys.cast('nova_burst', origin, aim, [close, edge], scene);
    expect(close.takeDamage).toHaveBeenCalled();
    expect(edge.takeDamage).toHaveBeenCalled();
  });

  it('nova_burst does NOT hit enemies beyond 12u radius', () => {
    const far = makeEnemy(15, 0);   // 15u away
    sys.cast('nova_burst', origin, aim, [far], scene);
    expect(far.takeDamage).not.toHaveBeenCalled();
  });

  it('nova_burst skips dead enemies', () => {
    const dead = makeEnemy(2, 0);
    (dead as { isDead: boolean }).isDead = true;
    sys.cast('nova_burst', origin, aim, [dead], scene);
    expect(dead.takeDamage).not.toHaveBeenCalled();
  });

  // ── chain_arc bounce limit ─────────────────────────────────────────────
  it('chain_arc hits at most 3 enemies (max bounces)', () => {
    const enemies = [
      makeEnemy(1, 0),
      makeEnemy(2, 0),
      makeEnemy(3, 0),
      makeEnemy(4, 0),
    ];
    sys.cast('chain_arc', origin, aim, enemies, scene);
    const hitCount = enemies.filter(e => (e.takeDamage as ReturnType<typeof vi.fn>).mock.calls.length > 0).length;
    expect(hitCount).toBeLessThanOrEqual(3);
  });

  // ── intimidate via onForceFlee callback ───────────────────────────────
  it('intimidate calls onForceFlee for nearby enemies', () => {
    const near = makeEnemy(5, 0);
    let fled: unknown[] = [];
    sys.cast('intimidate', origin, aim, [near], scene, undefined, {
      onForceFlee: (targets) => { fled = targets; },
    });
    expect(fled.length).toBeGreaterThan(0);
  });

  // ── battleHymnActive ─────────────────────────────────────────────────
  it('battleHymnActive is false before casting battle_hymn', () => {
    expect(sys.battleHymnActive).toBe(false);
  });

  it('battleHymnActive becomes true after casting battle_hymn', () => {
    sys.cast('battle_hymn', origin, aim, [], scene);
    expect(sys.battleHymnActive).toBe(true);
  });
});
