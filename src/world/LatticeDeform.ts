// ── LatticeDeform — bilinear cage/lattice deformation ────────────────────────
//
//  Phase 5 of the "organic world tiles" roadmap
//  (TODO/organic_world_tiles_todo.md): the "store every vertex as a
//  fraction of the module's own bounding box, then rebuild from a target
//  cell's own corner positions" technique -- lets a hand-authored module
//  (a fence segment, a building footprint, ...) fit an irregular
//  quadrilateral cell instead of only uniform-scaling. Scoped to 2D
//  (bilinear, 4-corner footprint) deformation -- see design spec for why
//  3D/trilinear whole-module deformation is a documented future extension,
//  not attempted here. Deliberately standalone and pure (no THREE.js/prop
//  dependency) -- see
//  docs/superpowers/specs/2026-09-02-lattice-deform-design.md for why this
//  ships as infrastructure only, with no live prop-system integration yet.

export interface LatticePoint2D {
  x: number;
  z: number;
}

/** A target quadrilateral's own 4 corners, in this roadmap's established
 *  [NW, NE, SE, SW] winding (matches DualGridCaseTable.ts, ShorelineCornerField.ts). */
export interface LatticeQuad {
  nw: LatticePoint2D;
  ne: LatticePoint2D;
  se: LatticePoint2D;
  sw: LatticePoint2D;
}

/**
 * Bilinearly interpolates a point at fractional position (fx, fz) -- fx=0
 * is the quad's own west (NW/SW) side, fx=1 is its east (NE/SE) side; fz=0
 * is its north (NW/NE) side, fz=1 is its south (SE/SW) side -- within
 * `quad`. `fx`/`fz` are conventionally in [0, 1] (a module's own
 * AABB-relative vertex position) but are not clamped -- extrapolating
 * slightly outside that range is a valid, if unusual, use.
 */
export function bilinearDeform(fx: number, fz: number, quad: LatticeQuad): LatticePoint2D {
  const topX = quad.nw.x + (quad.ne.x - quad.nw.x) * fx;
  const topZ = quad.nw.z + (quad.ne.z - quad.nw.z) * fx;
  const botX = quad.sw.x + (quad.se.x - quad.sw.x) * fx;
  const botZ = quad.sw.z + (quad.se.z - quad.sw.z) * fx;
  return {
    x: topX + (botX - topX) * fz,
    z: topZ + (botZ - topZ) * fz,
  };
}

/** One vertex of a hand-authored module, expressed as a fraction of the
 *  module's own axis-aligned bounding box (see bilinearDeform's doc). */
export interface LatticeModuleVertex {
  fx: number;
  fz: number;
}

/**
 * Deforms every vertex of a module (each given as an AABB-fraction) into
 * `quad`'s own irregular footprint, in one call.
 */
export function deformModule(vertices: readonly LatticeModuleVertex[], quad: LatticeQuad): LatticePoint2D[] {
  return vertices.map(v => bilinearDeform(v.fx, v.fz, quad));
}
