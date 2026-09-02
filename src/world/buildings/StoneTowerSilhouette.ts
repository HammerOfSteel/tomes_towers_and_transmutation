/**
 * StoneTowerSilhouette.ts — per-floor jitter/relax/drift math and
 * seed-selected sub-archetype silhouette profiles for the elven
 * stone-tower kit (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-variety-design.md). Pure functions, no
 * THREE.js dependency, matching StoneTowerShape.ts's own purity —
 * StoneTowerKit.ts is the only caller that converts these outputs into
 * real geometry/world-space transforms.
 *
 * Two independent techniques live here:
 *  1. `buildFloorVertexScales()` — per-corner, per-floor octagon-radius
 *     jitter, adapted from RelaxedMeshGrid.ts's "jitter then relax"
 *     technique (the actual Townscaper/Stalberg technique the user
 *     asked about) to this ring's own radial topology: instead of
 *     relaxing a 2D quad-mesh's interior points toward their
 *     neighbours' average, each of the octagon's 8 corners gets its
 *     own independent per-floor jitter, then relaxed along the
 *     *vertical* (floor) axis so adjacent floors' same corner flows
 *     smoothly instead of jumping randomly.
 *  2. `pickSilhouetteProfile()` + `buildFloorTransforms()` — 4 named
 *     sub-archetype silhouette curves (macro-shape variety), each
 *     just a different per-floor (radiusScale, offsetX, offsetZ,
 *     rotationOffset) curve feeding the exact same wall/roof-cap
 *     mesh-building code that already exists.
 */

import { mulberry32 } from '@/core/prng';

/** Max fractional per-vertex radius jitter (+/-) applied by
 * `buildFloorVertexScales()` — small enough that a tower always reads
 * as "an octagon that's slightly organic," never a broken/inconsistent
 * shape. */
export const OCTAGON_JITTER_MAX = 0.12;

const CORNERS = 8;

/** Deterministic per-(seed, corner, floor) jitter in [-1, 1), via an
 * independent mulberry32 draw per triple — same "derive a sub-seed by
 * XOR-mixing indices into the base seed" convention already used
 * throughout this kit (e.g. StoneTowerKit.ts's `seed ^ (0x9E1E ^ fl)`). */
function _cornerFloorJitter(seed: number, corner: number, floor: number): number {
  const subSeed = (seed ^ Math.imul(corner + 1, 0x9E3779B9) ^ Math.imul(floor + 1, 0x85EBCA6B)) >>> 0;
  const rand = mulberry32(subSeed);
  return rand() * 2 - 1;
}

/**
 * Raw (unrelaxed) per-floor, per-corner jitter — exported (test-only
 * convention: leading underscore, mirrors RelaxedMeshGrid.ts's own
 * `_buildJitteredLattice`/`_hash01`) so the relaxation step's actual
 * smoothing effect can be verified directly against its own input.
 */
export function _buildRawFloorVertexScales(seed: number, floorCount: number): number[][] {
  const out: number[][] = [];
  for (let fl = 0; fl < floorCount; fl++) {
    const floorScales: number[] = [];
    for (let corner = 0; corner < CORNERS; corner++) {
      floorScales.push(1 + _cornerFloorJitter(seed, corner, fl) * OCTAGON_JITTER_MAX);
    }
    out.push(floorScales);
  }
  return out;
}

/**
 * Per-floor octagon vertex-scale arrays (see StoneTowerShape.ts's
 * `octagonPoints(radius, vertexScales)`), one array of 8 per floor.
 * Each corner's raw jitter (`_buildRawFloorVertexScales`) is relaxed
 * along the floor axis: `relaxed[fl] = raw[fl]*0.5 +
 * avg(raw[fl-1], raw[fl+1])*0.5`, averaging against only whichever
 * neighbour(s) exist (the top and bottom floors average against their
 * single interior neighbour rather than being pinned/unperturbed —
 * unlike RelaxedMeshGrid.ts's boundary-pinned convention, a tower's
 * top/bottom floors are meant to look organic too, not like a
 * mathematically perfect regular octagon).
 */
export function buildFloorVertexScales(seed: number, floorCount: number): number[][] {
  const raw = _buildRawFloorVertexScales(seed, floorCount);
  if (floorCount <= 1) return raw;

  const relaxed: number[][] = raw.map(floor => [...floor]);
  for (let corner = 0; corner < CORNERS; corner++) {
    for (let fl = 0; fl < floorCount; fl++) {
      const prev = fl > 0 ? raw[fl - 1]![corner] : undefined;
      const next = fl < floorCount - 1 ? raw[fl + 1]![corner] : undefined;
      const self = raw[fl]![corner]!;
      if (prev !== undefined && next !== undefined) {
        relaxed[fl]![corner] = self * 0.5 + ((prev + next) / 2) * 0.5;
      } else if (prev !== undefined) {
        relaxed[fl]![corner] = self * 0.5 + prev * 0.5;
      } else if (next !== undefined) {
        relaxed[fl]![corner] = self * 0.5 + next * 0.5;
      }
    }
  }
  return relaxed;
}

// ── Sub-archetype silhouette profiles ────────────────────────────────────────

export type SilhouetteProfile = 'tapering' | 'tiered' | 'leaning' | 'waisted';
const ALL_PROFILES: SilhouetteProfile[] = ['tapering', 'tiered', 'leaning', 'waisted'];

/** Deterministic seeded choice among the 4 named silhouette profiles,
 * roughly evenly distributed across seeds. */
export function pickSilhouetteProfile(seed: number): SilhouetteProfile {
  const rand = mulberry32((seed ^ 0x50524F46) >>> 0); // 'PROF'-ish tag, arbitrary
  return ALL_PROFILES[Math.floor(rand() * ALL_PROFILES.length)]!;
}

/** One floor's silhouette transform: `radiusScale` multiplies the
 * floor's base radius (combined with StoneTowerKit.ts's own existing
 * per-floor micro-taper, not a replacement for it); `offsetX`/
 * `offsetZ` are FRACTIONS of the tower's radius (unitless — the
 * caller multiplies by its actual radius before use, keeping this
 * module free of any world-unit assumption); `rotationOffset` is in
 * radians. */
export interface FloorTransform {
  radiusScale: number;
  offsetX: number;
  offsetZ: number;
  rotationOffset: number;
}

/** Clamps (x, z)'s magnitude to at most `maxMag`, preserving direction. */
function _clampMagnitude(x: number, z: number, maxMag: number): [number, number] {
  const mag = Math.hypot(x, z);
  if (mag <= maxMag || mag === 0) return [x, z];
  const s = maxMag / mag;
  return [x * s, z * s];
}

/** Smooth, continuous taper from base to roofline (no stepping) —
 * precedent: Smeaton's Tower / lighthouse continuous taper. Small
 * seeded drift (clamped to a modest max lean) and small seeded
 * rotation accumulate floor-to-floor. */
const TAPERING_TAPER = 0.22;
const TAPERING_DRIFT_MAX = 0.12;
function _buildTaperingTransforms(seed: number, floorCount: number): FloorTransform[] {
  const rand = mulberry32((seed ^ 0x7A9E01) >>> 0);
  const driftAngle = rand() * Math.PI * 2;
  const out: FloorTransform[] = [];
  let ox = 0, oz = 0, rot = 0;
  for (let fl = 0; fl < floorCount; fl++) {
    const t = floorCount > 1 ? fl / (floorCount - 1) : 0;
    const radiusScale = 1 - t * TAPERING_TAPER;
    const driftStep = 0.015 + rand() * 0.01;
    [ox, oz] = _clampMagnitude(ox + Math.sin(driftAngle) * driftStep, oz + Math.cos(driftAngle) * driftStep, TAPERING_DRIFT_MAX);
    rot += (rand() - 0.5) * 0.05;
    out.push({ radiusScale, offsetX: ox, offsetZ: oz, rotationOffset: rot });
  }
  return out;
}

/** Stepped radius with a projecting "eave" ring every `bandSize`
 * floors (flat within a tier band, steps down at tier boundaries) —
 * precedent: pagodas (odd tier counts). Minimal drift/rotation —
 * tiered towers read as stacked/rigid, not leaning. */
const TIERED_BAND_SIZE = 2;
function _buildTieredTransforms(seed: number, floorCount: number): FloorTransform[] {
  const rand = mulberry32((seed ^ 0x71E4E5) >>> 0);
  const stepAmount = 0.12 + rand() * 0.06;
  const out: FloorTransform[] = [];
  let rot = 0;
  for (let fl = 0; fl < floorCount; fl++) {
    const tier = Math.floor(fl / TIERED_BAND_SIZE);
    const radiusScale = 1 - tier * stepAmount;
    rot += (rand() - 0.5) * 0.015;
    out.push({ radiusScale, offsetX: 0, offsetZ: 0, rotationOffset: rot });
  }
  return out;
}

/** Near-flat radius (minimal taper), but drift ramps up strongly
 * (quadratic ease-in) and consistently toward one seeded-random
 * direction by the top floor — a visible one-directional lean, not a
 * random walk. Precedent: Kilmacduagh round tower (leans ~1.7m out of
 * plumb). */
const LEANING_TAPER = 0.05;
function _buildLeaningTransforms(seed: number, floorCount: number): FloorTransform[] {
  const rand = mulberry32((seed ^ 0x1EA211) >>> 0);
  const leanAngle = rand() * Math.PI * 2;
  const maxLean = 0.35 + rand() * 0.15;
  const out: FloorTransform[] = [];
  for (let fl = 0; fl < floorCount; fl++) {
    const t = floorCount > 1 ? fl / (floorCount - 1) : 0;
    const radiusScale = 1 - t * LEANING_TAPER;
    const lean = t * t * maxLean; // eases in -- most lean accrues near the top
    out.push({ radiusScale, offsetX: Math.sin(leanAngle) * lean, offsetZ: Math.cos(leanAngle) * lean, rotationOffset: 0 });
  }
  return out;
}

/** Tapers inward through the lower-middle floors, then flares back
 * outward for the top 1-2 floors before the roofline (an hourglass/
 * overhanging-gallery silhouette) — precedent: machicolated defensive
 * galleries. Moderate drift, no rotation. */
function _buildWaistedTransforms(seed: number, floorCount: number): FloorTransform[] {
  const rand = mulberry32((seed ^ 0x0A15E7) >>> 0);
  const waistTaper = 0.22 + rand() * 0.08;
  const flareAmount = 0.15 + rand() * 0.1;
  const flareFloors = Math.min(2, Math.max(1, Math.floor(floorCount / 3)));
  const waistFloor = Math.max(1, floorCount - flareFloors - 1);
  const driftAngle = rand() * Math.PI * 2;
  const out: FloorTransform[] = [];
  let ox = 0, oz = 0;
  for (let fl = 0; fl < floorCount; fl++) {
    let radiusScale: number;
    if (fl <= waistFloor) {
      const t = waistFloor > 0 ? fl / waistFloor : 0;
      radiusScale = 1 - t * waistTaper;
    } else {
      const flareT = (fl - waistFloor) / Math.max(1, floorCount - 1 - waistFloor);
      radiusScale = (1 - waistTaper) + flareT * flareAmount;
    }
    ox += Math.sin(driftAngle) * 0.008;
    oz += Math.cos(driftAngle) * 0.008;
    out.push({ radiusScale, offsetX: ox, offsetZ: oz, rotationOffset: 0 });
  }
  return out;
}

/** Builds one full tower's per-floor silhouette transforms for the
 * given profile — see the individual `_build*Transforms` functions'
 * doc comments for each profile's shape and real-world precedent. */
export function buildFloorTransforms(profile: SilhouetteProfile, seed: number, floorCount: number): FloorTransform[] {
  switch (profile) {
    case 'tapering': return _buildTaperingTransforms(seed, floorCount);
    case 'tiered': return _buildTieredTransforms(seed, floorCount);
    case 'leaning': return _buildLeaningTransforms(seed, floorCount);
    case 'waisted': return _buildWaistedTransforms(seed, floorCount);
  }
}
