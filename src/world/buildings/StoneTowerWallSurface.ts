/**
 * StoneTowerWallSurface.ts — the two swappable wall-surface strategies
 * for the elven stone-tower kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): a cheap textured
 * octagonal prism (Strategy T) vs. real protruding stone-block geometry
 * per course (Strategy G, added in a later task). Both share the
 * `buildWallSurface()` dispatcher's signature so the tower-assembly code
 * (StoneTowerKit.ts) is agnostic to which is active.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';
import { octagonFaces, type OctagonFace } from './StoneTowerShape';

/**
 * Strategy T: a plain 8-sided extruded prism (matches
 * StoneTowerShape.ts's octagon cross-section exactly, since
 * THREE.CylinderGeometry with radialSegments=8 produces the identical
 * regular octagon -- verified: both use x=r*sin(theta), z=r*cos(theta)).
 * Cheapest possible wall surface; relies entirely on the material's
 * texture map for the coursed-stone look.
 *
 * `vertexScales`, when given, can't be expressed as true per-vertex
 * jitter on a single CylinderGeometry (it has one uniform radius) --
 * as a documented, accepted simplification (Strategy T is the
 * non-default comparison-only strategy), this uses the AVERAGE of the
 * 8 scales as an overall radius nudge instead.
 */
export function buildWallSurfaceTextured(
  radius: number, height: number, material: THREE.Material, vertexScales?: number[],
): THREE.Group {
  const effectiveRadius = vertexScales !== undefined
    ? radius * (vertexScales.reduce((s, v) => s + v, 0) / vertexScales.length)
    : radius;
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(effectiveRadius, effectiveRadius, height, 8, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = height / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/** Options for Strategy G's per-course block subdivision. */
export interface WallBlockOptions {
  /** World units per course (row of blocks). Default 0.5. */
  courseHeight?: number;
  /** How many blocks split each octagon face's width. Default 3. */
  blocksPerFace?: number;
  /** 0-1 fraction of per-block size/protrusion variance. Default 0.15. */
  jitter?: number;
  /**
   * Build blocks for only these faces instead of the full 8-face octagon
   * (e.g. a market stall's partial back wall, not a fully enclosed
   * ring) -- when given, used verbatim instead of calling
   * `octagonFaces(radius, vertexScales)` internally. Omitted (the
   * default) reproduces the exact prior full-ring behavior unchanged.
   */
  facesOverride?: OctagonFace[];
}

/**
 * Strategy G: each course (a horizontal band) is built from individual
 * slightly-protruding stone blocks arranged around the octagon's
 * circumference -- a polar-coordinate sibling of BlockKit's own "many
 * small solid pieces read as hand-built" philosophy, using plain
 * THREE.BoxGeometry rather than a Cartesian voxel grid (an octagon
 * doesn't fit BlockKit's axis-aligned cells). Alternating courses shift
 * by half a block width (running-bond coursing, matching real masonry
 * and this codebase's own `_buildBrickCanvas()` convention in
 * TextureFactory.ts). All blocks share ONE material object reference
 * (never cloned) so `mergeGroupMeshesByMaterial()` -- which buckets by
 * material identity -- merges the whole tower ring into a single draw
 * call regardless of block count; visual variation comes from geometry
 * (size/protrusion jitter), not per-block material cloning.
 *
 * `vertexScales`, when given (8 entries, one per octagon corner), is
 * forwarded to `octagonFaces()` so each course's blocks actually
 * follow the jittered outline (StoneTowerSilhouette.ts's per-floor
 * jitter) instead of a plain regular octagon -- omitted reproduces
 * the exact prior (regular-octagon) behaviour.
 *
 * `opts.facesOverride`, when given, builds blocks for only that face
 * subset (e.g. a market stall's partial back wall) instead of the full
 * 8-face ring -- see `WallBlockOptions.facesOverride`'s own doc comment.
 */
export function buildWallSurfaceBlocks(
  radius: number, height: number, seed: number, material: THREE.Material,
  opts: WallBlockOptions = {},
  vertexScales?: number[],
): THREE.Group {
  const g = new THREE.Group();
  const courseHeight = opts.courseHeight ?? 0.5;
  const blocksPerFace = opts.blocksPerFace ?? 3;
  const jitter = opts.jitter ?? 0.15;
  const rand = mulberry32(seed);
  const faces = opts.facesOverride ?? octagonFaces(radius, vertexScales);
  const numCourses = Math.max(1, Math.round(height / courseHeight));
  const actualCourseH = height / numCourses;
  const blockDepth = 0.18;

  for (let course = 0; course < numCourses; course++) {
    const y = course * actualCourseH + actualCourseH / 2;
    const rowOffset = course % 2 === 1 ? 0.5 / blocksPerFace : 0;
    for (const face of faces) {
      const [ax, az] = face.a;
      const [bx, bz] = face.b;
      const faceLen = Math.hypot(bx - ax, bz - az);
      const blockW = (faceLen / blocksPerFace) * 0.92; // leave a mortar gap
      const outwardX = Math.sin(face.normalAngle);
      const outwardZ = Math.cos(face.normalAngle);
      for (let bi = 0; bi < blocksPerFace; bi++) {
        let t = (bi + 0.5) / blocksPerFace + rowOffset;
        t = ((t % 1) + 1) % 1; // wrap into [0,1)
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const sizeJ = 1 + (rand() - 0.5) * jitter;
        const protrudeJ = (rand() - 0.5) * jitter * blockDepth;
        const geo = new THREE.BoxGeometry(blockW * sizeJ, actualCourseH * 0.88, blockDepth);
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(px + outwardX * protrudeJ, y, pz + outwardZ * protrudeJ);
        mesh.rotation.y = face.normalAngle;
        mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
      }
    }
  }
  mergeGroupMeshesByMaterial(g);
  return g;
}

/** Which wall-surface strategy is actually shipped/live. 'blocks'
 * (Strategy G, real geometry) per the user's explicit preference --
 * past texture-only attempts in this project have looked "too basic."
 * 'textured' (Strategy T) is fully implemented and tested above for
 * direct comparison. */
export type WallStrategy = 'textured' | 'blocks';
export const WALL_STRATEGY: WallStrategy = 'blocks';

/** Dispatches to whichever wall-surface strategy is requested -- lets
 * the tower-assembly code (StoneTowerKit.ts) stay agnostic to which is
 * active. `vertexScales`, when given, is forwarded to whichever
 * strategy is active (see each strategy's own doc comment for how it
 * uses -- or approximates -- per-vertex jitter). */
export function buildWallSurface(
  strategy: WallStrategy, radius: number, height: number, seed: number, material: THREE.Material,
  vertexScales?: number[],
): THREE.Group {
  return strategy === 'textured'
    ? buildWallSurfaceTextured(radius, height, material, vertexScales)
    : buildWallSurfaceBlocks(radius, height, seed, material, {}, vertexScales);
}
