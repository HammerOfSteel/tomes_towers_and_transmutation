/**
 * BaseBuilder.ts — PROC-A3
 *
 * Abstract base builder interface for all procedural entity builders.
 * Concrete builders (buildNpc, buildEnemy, buildProp, buildBuilding)
 * implement this contract so the EntityRegistry can call them uniformly.
 */

import type * as THREE from 'three';
import type { ProceduralDNA } from '../ProceduralDNA';

// ── Built instance contract ───────────────────────────────────────────────────

/**
 * A built procedural entity.  Returned by every `build*(dna)` function.
 * The game and atelier tools interact with entities exclusively via this interface.
 */
export interface BuiltEntity<TDNA extends ProceduralDNA = ProceduralDNA> {
  /** Three.js root group — add to scene with `scene.add(entity.root)`. */
  root: THREE.Group;
  /** The DNA this instance was built from. */
  dna:  TDNA;
  /**
   * Per-frame update.  Call every frame while the entity is in scene.
   * `t` = elapsed seconds since epoch, `dt` = delta seconds this frame.
   */
  update(t: number, dt: number): void;
  /** Remove geometry + materials from GPU memory. Call when removing from scene. */
  dispose(): void;
}

// ── Builder function signature ────────────────────────────────────────────────

/**
 * A builder takes a DNA and returns a BuiltEntity.
 * This is the single function signature every procedural builder must satisfy.
 */
export type BuilderFn<TDNA extends ProceduralDNA = ProceduralDNA> =
  (dna: TDNA) => BuiltEntity<TDNA>;

// ── Options common to all builders ────────────────────────────────────────────

export interface BuilderOptions {
  /**
   * Target height in world units.  Builder scales the result so the full
   * entity fits within this height.  0 = use default scale.
   */
  targetHeight?: number;
  /**
   * Skip animation setup (useful for static LOD or thumbnail renders).
   * Default: false (animations enabled).
   */
  noAnimation?: boolean;
}
