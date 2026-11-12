/**
 * LashedTimber.ts — the orcish equivalent of `buildWallSurfaceBlocks()`
 * (docs/superpowers/specs/2026-09-04-orcish-buildings-design.md, section 5:
 * "Kit modules consumed" -> `[SHARED KIT] LashedTimber.ts`). Applies the
 * same "many discrete, readable units" discipline the user praised in the
 * stone block-course wall to a different material language: tapered logs,
 * lashing bands, posts, and cross braces, rather than cut stone.
 *
 * Every wall is built from individual per-course tapered-log segments
 * (never a single wall-sized box or BlockKit voxel grid), with a running
 * (running-bond-equivalent) seam stagger between courses so seams never
 * line up vertically, plus real end-grain caps (the log's own flat
 * cylinder-end faces) exposed at the small per-log mortar-equivalent gap.
 *
 * All log geometry uses stock `THREE.CylinderGeometry`, which always
 * carries a `uv` attribute -- this deliberately avoids the hand-rolled-
 * `BufferGeometry`-without-`uv` merge-drop bug class documented in
 * `MeshMergeUtils.ts` (see doctrine Part 9 / prior StoneTowerFloorCap.ts,
 * SlimeAccretionKit.ts and Ruinate.ts incidents).
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';
import type { OctagonFace } from '../StoneTowerShape';

/** Orients `obj`'s local +Y axis to point along `direction` (world space,
 * pre-parent-transform) using a quaternion -- avoids ambiguous Euler-order
 * reasoning for logs that must run along an arbitrary tangent/diagonal. */
function orientAlong(obj: THREE.Object3D, direction: THREE.Vector3): void {
  const dir = direction.clone().normalize();
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}

export interface TaperedLogOptions {
  length: number;
  radiusBase: number;
  radiusTop: number;
  material: THREE.Material;
  radialSegments?: number;
}

/** Builds one tapered log segment, standing along local +Y (length axis),
 * centered at its own midpoint -- the base primitive every other export in
 * this module composes. `THREE.CylinderGeometry` renders real flat end
 * caps by default (openEnded=false), which is exactly the "end-grain cap"
 * doctrine requirement once two log segments are placed end-to-end with a
 * small gap. */
export function buildTaperedLog(options: TaperedLogOptions): THREE.Mesh {
  const { length, radiusBase, radiusTop, material, radialSegments = 8 } = options;
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBase, length, radialSegments, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface LogCourseWallOptions {
  /** World units per course (a horizontal row of end-to-end logs). Default 0.38. */
  courseHeight?: number;
  /** How many log segments split each face's length. Default 3. */
  logsPerFace?: number;
  /** 0-1 fraction of per-log size/protrusion/length variance. Default 0.18. */
  jitter?: number;
  /** Log radius at its thicker (base) end. Default 0.1. */
  logRadius?: number;
  /** Top-end radius as a fraction of the base radius (the taper). Default 0.8. */
  taperRatio?: number;
}

/**
 * Builds a "log-course" wall: each course (horizontal band) is a run of
 * individual tapered logs laid end-to-end along the face tangent, each
 * log rotated onto its side (length running horizontally) and protruding
 * a small jittered amount past the wall plane -- the orcish sibling of
 * `buildWallSurfaceBlocks()`'s per-course stone blocks. Alternating
 * courses offset by half a log length (running-bond-equivalent stagger),
 * so seams between adjacent logs never line up vertically between
 * courses. A small per-log gap (kept short of the full face-length
 * division) exposes each log's own flat end-grain cap where it meets its
 * neighbour, rather than an unbroken merged run.
 *
 * All logs share ONE material reference (never cloned), then the whole
 * group is passed through `mergeGroupMeshesByMaterial()` so a whole
 * building's wall collapses to a small handful of draw calls regardless
 * of log count, matching `buildWallSurfaceBlocks()`'s own convention.
 */
export function buildLogCourseWall(
  faces: OctagonFace[],
  height: number,
  seed: number,
  material: THREE.Material,
  opts: LogCourseWallOptions = {},
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'lashed-timber-wall';
  const courseHeight = opts.courseHeight ?? 0.38;
  const logsPerFace = opts.logsPerFace ?? 3;
  const jitter = opts.jitter ?? 0.18;
  const logRadius = opts.logRadius ?? 0.1;
  const taperRatio = opts.taperRatio ?? 0.8;
  const rand = mulberry32(seed >>> 0);
  const numCourses = Math.max(1, Math.round(height / courseHeight));
  const actualCourseH = height / numCourses;

  for (let course = 0; course < numCourses; course++) {
    const y = course * actualCourseH + actualCourseH / 2;
    const rowOffset = course % 2 === 1 ? 0.5 / logsPerFace : 0;
    for (const face of faces) {
      const [ax, az] = face.a;
      const [bx, bz] = face.b;
      const faceLen = Math.hypot(bx - ax, bz - az);
      const segLen = (faceLen / logsPerFace) * 0.88; // leave a gap exposing end-grain caps
      const outwardX = Math.sin(face.normalAngle);
      const outwardZ = Math.cos(face.normalAngle);
      const tangent = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
      for (let li = 0; li < logsPerFace; li++) {
        let t = (li + 0.5) / logsPerFace + rowOffset;
        t = ((t % 1) + 1) % 1; // wrap into [0,1)
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const sizeJ = 1 + (rand() - 0.5) * jitter;
        const lenJ = 1 + (rand() - 0.5) * jitter * 0.6;
        const protrudeJ = logRadius * 0.3 + (rand() - 0.5) * jitter * logRadius;
        const log = buildTaperedLog({
          length: segLen * lenJ,
          radiusBase: logRadius * sizeJ,
          radiusTop: logRadius * sizeJ * taperRatio,
          material,
        });
        // Lay the log on its side (length along tangent) via quaternion,
        // then nudge it outward along the face normal so it protrudes
        // proud of the theoretical wall plane -- same "small jittered
        // protrusion" read as the stone block-course wall.
        orientAlong(log, tangent);
        log.position.set(px + outwardX * protrudeJ, y, pz + outwardZ * protrudeJ);
        g.add(log);
      }
    }
  }
  mergeGroupMeshesByMaterial(g);
  return g;
}

export interface PostFrameOptions {
  /** Target spacing between posts along a face, in world units. Default 1.0. */
  postSpacing?: number;
  /** Post radius at its base. Default 0.09. */
  postRadius?: number;
  /** Taper ratio (top/base radius). Default 0.85. */
  taperRatio?: number;
  /** Max crooked lean, in radians, applied as a small random tilt (doctrine "crooked posts +-1.5deg"). Default ~1.5deg. */
  maxLeanRad?: number;
}

/**
 * Places upright tapered log posts along each face at roughly regular
 * intervals (design spec: "posts every 0.9-1.1 WU"), each with a small
 * random crooked lean -- the doctrine's "purposeful roughness" jitter,
 * never a whole-mesh noise deformation. Posts stand proud of the wall
 * plane (structural member depth) along the face's own outward normal.
 */
export function buildPostFrame(
  faces: OctagonFace[],
  height: number,
  seed: number,
  material: THREE.Material,
  opts: PostFrameOptions = {},
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'lashed-timber-posts';
  const postSpacing = opts.postSpacing ?? 1.0;
  const postRadius = opts.postRadius ?? 0.09;
  const taperRatio = opts.taperRatio ?? 0.85;
  const maxLeanRad = opts.maxLeanRad ?? (1.5 * Math.PI) / 180;
  const rand = mulberry32(seed >>> 0);

  for (const face of faces) {
    const [ax, az] = face.a;
    const [bx, bz] = face.b;
    const faceLen = Math.hypot(bx - ax, bz - az);
    const postCount = Math.max(2, Math.round(faceLen / postSpacing) + 1);
    const outwardX = Math.sin(face.normalAngle);
    const outwardZ = Math.cos(face.normalAngle);
    for (let i = 0; i < postCount; i++) {
      const t = postCount === 1 ? 0.5 : i / (postCount - 1);
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const post = buildTaperedLog({
        length: height,
        radiusBase: postRadius,
        radiusTop: postRadius * taperRatio,
        material,
      });
      post.position.set(px + outwardX * postRadius * 0.6, height / 2, pz + outwardZ * postRadius * 0.6);
      // Small crooked lean around a random horizontal axis -- keeps the
      // post standing (not tipped over), just imperfect.
      post.rotation.x = (rand() - 0.5) * 2 * maxLeanRad;
      post.rotation.z = (rand() - 0.5) * 2 * maxLeanRad;
      g.add(post);
    }
  }
  mergeGroupMeshesByMaterial(g);
  return g;
}

/**
 * Builds a single tapered log spanning two arbitrary world-space points
 * (a diagonal cross brace or splayed leg) -- used by the watchtower's
 * splayed legs/braces and any lean-to bracing. `radius` is the base
 * radius; the far end tapers to 80% of it.
 */
export function buildCrossBrace(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const length = from.distanceTo(to);
  const log = buildTaperedLog({ length, radiusBase: radius, radiusTop: radius * 0.8, material });
  const mid = from.clone().add(to).multiplyScalar(0.5);
  log.position.copy(mid);
  orientAlong(log, to.clone().sub(from));
  return log;
}

export interface LashingBandOptions {
  /** Band (strap) thickness along the wall's vertical axis. Default 0.05. */
  bandHeight?: number;
  /** How far the band's outer face sits proud past the wall plane. Default 0.045 (depth-ladder FRAME-ish). */
  proud?: number;
  /** Band thickness (radial depth of the wrap). Default 0.03. */
  thickness?: number;
}

/**
 * Wraps a proud rope/hide lashing band around the given faces at height
 * `y` -- the orcish joint vocabulary standing in for masonry string
 * courses (doctrine: "visible rope/hide bands at post-beam intersections,
 * roof-rib bases, log-course seams"). Built as one box per face (a real
 * strap, not a texture), positioned so its outer face protrudes past the
 * wall plane along that face's own outward normal.
 */
export function buildLashingBand(
  faces: OctagonFace[],
  y: number,
  material: THREE.Material,
  opts: LashingBandOptions = {},
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'lashing-band';
  const bandHeight = opts.bandHeight ?? 0.05;
  const proud = opts.proud ?? 0.045;
  const thickness = opts.thickness ?? 0.03;

  for (const face of faces) {
    const [ax, az] = face.a;
    const [bx, bz] = face.b;
    const faceLen = Math.hypot(bx - ax, bz - az);
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    const outwardX = Math.sin(face.normalAngle);
    const outwardZ = Math.cos(face.normalAngle);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(faceLen * 0.98, bandHeight, thickness), material);
    strap.name = 'lashing-strap';
    strap.rotation.y = face.normalAngle;
    strap.position.set(midX + outwardX * proud, y, midZ + outwardZ * proud);
    strap.castShadow = true;
    strap.receiveShadow = true;
    g.add(strap);
  }
  mergeGroupMeshesByMaterial(g);
  return g;
}
