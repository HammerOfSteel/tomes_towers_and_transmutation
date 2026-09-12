import * as THREE from 'three';

/**
 * AssemblyLatticeDeform.ts — [SHARED KIT] bounded, post-assembly 3D
 * deformation of an already-built `THREE.Group`
 * (docs/superpowers/specs/2026-09-04-fae-buildings-design.md §"whimsy
 * without blobs": "organic silhouettes are allowed only because they are
 * assembled from legible parts ... and then OPTIONALLY DEFORMED AS A
 * BOUNDED ASSEMBLY"). `src/world/LatticeDeform.ts` already provides a 2D
 * bilinear footprint-fitting deform and explicitly flags "3D/trilinear
 * whole-module deformation" as future work -- this module is that
 * follow-up, scoped to what fae's leaning stump walls / curling roof
 * crowns / bellying cottage silhouettes actually need: a per-height lean
 * (optionally accelerating into a "curl" near the top) plus a radial
 * mid-height "belly" bulge, applied to every mesh already present in a
 * finished kit-of-parts assembly.
 *
 * This is deliberately NOT free-form sculpting: it only ever nudges
 * existing, already-legible geometry (walls built from real openings,
 * roofs built from real shingle courses, etc.) sideways/outward as a
 * whole, bounded by the assembly's own height range. It never resamples,
 * subdivides, or smooths a surface, so a five-piece opening or a shingle
 * course stays exactly as legible after deformation as before --
 * satisfying doctrine Rule 3's "deformed as a bounded assembly" carve-out
 * without regressing to a banned smooth blob.
 */

export interface AssemblyDeformProfile {
  /** World-unit sideways shift along local X at the assembly's top (fy=1), interpolated linearly from 0 at the bottom. */
  leanX?: number;
  /** World-unit sideways shift along local Z at the assembly's top. */
  leanZ?: number;
  /** Additional quadratic (fy^2-weighted) X shift layered on top of `leanX` -- makes the lean accelerate near the top, giving a storybook "curling over" look rather than a straight rigid lean. */
  curlX?: number;
  /** Additional quadratic Z shift, see `curlX`. */
  curlZ?: number;
  /** World-unit radial outward "belly" bulge amount at mid-height (weighted by `sin(fy * PI)`, so it is zero at both the bottom and the top and peaks at the assembly's vertical midpoint). */
  bulge?: number;
  /** Restricts the bulge direction to a single world axis instead of true radial. Defaults to `'both'` (radial from the assembly's own central vertical axis). */
  bulgeAxis?: 'both' | 'x' | 'z';
}

function isZeroProfile(profile: AssemblyDeformProfile): boolean {
  return !(profile.leanX || profile.leanZ || profile.curlX || profile.curlZ || profile.bulge);
}

/**
 * Deforms every mesh inside `group` in place, treating `group`'s own
 * local space as the deformation frame (so the same profile produces the
 * same relative shape regardless of where `group` itself sits/rotates in
 * a parent scene). An all-zero profile is a guaranteed exact no-op -- it
 * returns `group` untouched, without cloning or touching a single
 * geometry -- so callers can unconditionally pass a DNA-derived profile
 * without special-casing "no deformation this seed".
 *
 * Returns the same `group` reference (mutated in place) for convenient
 * call-site chaining, e.g. `return deformAssembly(hall, profile);`.
 */
export function deformAssembly(group: THREE.Group, profile: AssemblyDeformProfile): THREE.Group {
  if (isZeroProfile(profile)) return group;

  group.updateMatrixWorld(true);
  const groupInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();

  const meshes: THREE.Mesh[] = [];
  const box = new THREE.Box3();
  const scratch = new THREE.Vector3();

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push(object);
    const localToGroup = new THREE.Matrix4().multiplyMatrices(groupInverse, object.matrixWorld);
    const position = object.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      scratch.fromBufferAttribute(position, i).applyMatrix4(localToGroup);
      box.expandByPoint(scratch);
    }
  });

  if (meshes.length === 0 || !Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) return group;

  const height = Math.max(1e-6, box.max.y - box.min.y);
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  const leanX = profile.leanX ?? 0;
  const leanZ = profile.leanZ ?? 0;
  const curlX = profile.curlX ?? 0;
  const curlZ = profile.curlZ ?? 0;
  const bulge = profile.bulge ?? 0;
  const bulgeAxis = profile.bulgeAxis ?? 'both';
  const v = new THREE.Vector3();

  for (const mesh of meshes) {
    const localToGroup = new THREE.Matrix4().multiplyMatrices(groupInverse, mesh.matrixWorld);
    const groupToLocal = new THREE.Matrix4().copy(localToGroup).invert();
    const original = mesh.geometry;
    const deformed = original.clone();
    const position = deformed.getAttribute('position') as THREE.BufferAttribute;

    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(localToGroup);
      const fy = THREE.MathUtils.clamp((v.y - box.min.y) / height, 0, 1);

      let dx = leanX * fy + curlX * fy * fy;
      let dz = leanZ * fy + curlZ * fy * fy;

      if (bulge !== 0) {
        const rx = bulgeAxis === 'z' ? 0 : v.x - centerX;
        const rz = bulgeAxis === 'x' ? 0 : v.z - centerZ;
        const r = Math.hypot(rx, rz);
        if (r > 1e-6) {
          const bulgeAmount = bulge * Math.sin(fy * Math.PI);
          dx += (rx / r) * bulgeAmount;
          dz += (rz / r) * bulgeAmount;
        }
      }

      v.x += dx;
      v.z += dz;
      v.applyMatrix4(groupToLocal);
      position.setXYZ(i, v.x, v.y, v.z);
    }

    position.needsUpdate = true;
    deformed.computeVertexNormals();
    deformed.computeBoundingBox();
    deformed.computeBoundingSphere();
    mesh.geometry = deformed;
    original.dispose();
  }

  return group;
}
