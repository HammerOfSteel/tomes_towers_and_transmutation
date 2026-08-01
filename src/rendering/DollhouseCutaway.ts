/**
 * DollhouseCutaway.ts
 *
 * Pure, dependency-free geometry helper for the "dollhouse" static wall
 * cutaway used by indoor room rendering (BlueprintRenderer, InteriorGenerator).
 *
 * The game's camera (CameraRig) is a fixed isometric rig that never rotates,
 * so which side of a room faces the camera is a static, precomputable fact.
 * This module classifies a wall/decor position as "near side" (hide it) or
 * "far side" (keep it) relative to its room's XZ centroid.
 *
 * See docs/superpowers/specs/2026-07-29-indoor-dollhouse-occlusion-design.md
 */

import { ISO_OFFSET } from '@/core/CameraRig';

export interface XZ {
  x: number;
  z: number;
}

/** Structural THREE.Mesh subset — kept dependency-free from three.js. */
export interface CuttableMesh {
  position: XZ;
  visible: boolean;
  userData: Record<string, unknown>;
}

const _len = Math.hypot(ISO_OFFSET.x, ISO_OFFSET.z);

/** Normalized XZ camera direction — precomputed once from the fixed iso rig. */
export const DOLLHOUSE_CAM_DIR_XZ: XZ = Object.freeze({
  x: ISO_OFFSET.x / _len,
  z: ISO_OFFSET.z / _len,
});

/** Default split threshold — an exact half-split of the room. Exposed as a
 *  named constant so behavior can be tuned without touching call sites. */
export const DEFAULT_CUT_THRESHOLD = 0;

/**
 * Returns true if `pos` sits on the camera-facing (near) side of a room
 * whose horizontal centre is `roomCenterXZ` — i.e. should be hidden for the
 * dollhouse cutaway effect. Boundary case (`dot === threshold`) resolves to
 * false (kept visible).
 */
export function shouldCutForDollhouse(
  pos: XZ,
  roomCenterXZ: XZ,
  threshold: number = DEFAULT_CUT_THRESHOLD,
): boolean {
  const dx = pos.x - roomCenterXZ.x;
  const dz = pos.z - roomCenterXZ.z;
  const dot = dx * DOLLHOUSE_CAM_DIR_XZ.x + dz * DOLLHOUSE_CAM_DIR_XZ.z;
  return dot > threshold;
}

/**
 * Applies the cutaway rule to a mesh in place: hides it and tags
 * `userData.dollhouseCut = true` if it's on the near side. No-op (returns
 * false, leaves mesh untouched) if it's on the far side.
 */
export function applyDollhouseCut(
  mesh: CuttableMesh,
  roomCenterXZ: XZ,
  threshold: number = DEFAULT_CUT_THRESHOLD,
): boolean {
  if (!shouldCutForDollhouse(mesh.position, roomCenterXZ, threshold)) return false;
  mesh.visible = false;
  mesh.userData.dollhouseCut = true;
  return true;
}
