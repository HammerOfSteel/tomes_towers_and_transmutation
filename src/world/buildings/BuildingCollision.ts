/**
 * BuildingCollision.ts — pure geometry helpers for building physics
 * collision sizing and door-proximity checks. No THREE.js/Rapier
 * dependency (plain numbers only) so it's trivially unit-testable.
 */

/** A 2D point in world-space XZ coordinates (Y is ignored — buildings are
 *  always upright). */
export interface XZPoint {
  x: number;
  z: number;
}

/**
 * Distance from `p` to the nearest point on a building's rotated
 * rectangular footprint (XZ plane only).
 *
 * The footprint is a `footprint.w` (width, local X) × `footprint.d` (depth,
 * local Z) rectangle centered at `center`, rotated by `rotationY` radians
 * around Y — matching `THREE.Object3D.rotation.y` (0 = local +Z axis
 * aligned with world +Z; buildings are authored with their door facing
 * local +Z).
 *
 * Returns 0 if `p` is inside or exactly on the footprint boundary.
 */
export function closestDistanceToBuildingFootprint(
  p: XZPoint,
  center: XZPoint,
  footprint: { w: number; d: number },
  rotationY: number,
): number {
  const dx = p.x - center.x;
  const dz = p.z - center.z;

  // Rotate the world-space offset into the building's local (unrotated)
  // frame: local = R(-rotationY) * worldOffset (the inverse of the
  // rotation matrix used to place the building, since rotation matrices
  // are orthogonal — inverse == transpose).
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;

  const hw = footprint.w / 2;
  const hd = footprint.d / 2;

  // Clamp to the box's local half-extents — closest point on/in the box.
  const cx = Math.max(-hw, Math.min(hw, lx));
  const cz = Math.max(-hd, Math.min(hd, lz));

  const ox = lx - cx;
  const oz = lz - cz;
  return Math.hypot(ox, oz);
}
