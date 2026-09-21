/**
 * NatureScatterPoints.ts — shared, chunk-scoped deterministic scatter-point
 * generator for trees/rocks/bushes.
 *
 * Extracted verbatim from `OverworldScene.ts`'s `_buildChunkScatter()` (tree
 * + rock loops) and `_buildChunkBushes()` (bush loop) so that BOTH the
 * physics-collider path (which still walks `_buildChunkScatter()`'s returned
 * group for `userData.scatterKind` tags) and the new player-radius visual
 * instancing path (`NaturePropField`/`NaturePropManager`, Task 5) derive
 * positions from ONE formula. Before this extraction, a visual-only
 * placement algorithm risked drifting out of sync with the chunk-seeded
 * poisson-disk positions colliders actually use — see
 * docs/superpowers/plans/2026-09-21-procedural-nature-asset-kit.md's
 * "Physics/visual position parity" section for the full rationale.
 */
import { poissonDisk } from '@/core/poissonDisk';
import { mulberry32 } from '@/core/prng';
import type { ChunkCoord } from '@/world/ChunkManager';

export type NatureScatterKind = 'tree' | 'rock' | 'bush';

interface ScatterParams {
  minDist: number;
  seedXor: number;
  cxMul: number;
  czMul: number;
}

/** Per-kind poisson-disk minDist + chunk-seed formula. Originally tree/rock
 *  shared ONE advancing rand stream in `_buildChunkScatter()` (tree loop
 *  runs to completion including its per-point territory-prop-override rolls
 *  and tree-building rand draws, THEN the rock loop's `poissonDisk()` call
 *  continues on that same, now-unpredictable-length-consumed stream). Task 6
 *  (nature-prop instancing wiring) deliberately DROPPED that shared-stream
 *  design: the new player-radius visual path (`NaturePropField.ts`) has no
 *  way to replicate the collider path's exact per-point rand consumption
 *  (territory-prop rolls, bespoke-builder-specific draws), so continuing to
 *  share a stream would silently desync rock POSITIONS (not just cosmetic
 *  details) between the visual and collider paths — reintroducing exactly
 *  the physics/visual mismatch this whole extraction exists to prevent.
 *  Rock now gets its own independent, freshly-seeded stream
 *  (`0xD1F3_2C6B`-xor'd), exactly like bush already had — this guarantees
 *  the collider path (`_buildChunkScatter()`) and the visual path
 *  (`selectNaturePropPlacements()`) produce byte-identical rock positions
 *  for the same (coord, worldSeed) simply by both calling this function
 *  with no `existingRand`, regardless of what either path's own per-point
 *  loop body does afterward. This is a deliberate, one-time world-layout
 *  change (rock placement shifts from pre-Task-6 saves/seeds) — flagged in
 *  Task 6's playtest-gate summary. */
const SCATTER_PARAMS: Record<NatureScatterKind, ScatterParams> = {
  tree: { minDist: 5.5, seedXor: 0x5C47_7E12, cxMul: 92821, czMul: 68917 },
  rock: { minDist: 8,   seedXor: 0xD1F3_2C6B, cxMul: 83621, czMul: 59083 },
  bush: { minDist: 3.2, seedXor: 0x8B21_44F7, cxMul: 51749, czMul: 40361 },
};

export interface ChunkGridInfo {
  GHW: number;
  GHH: number;
  T: number;
  chunkSize: number;
}

export interface ChunkScatterCandidate {
  wx: number;
  wz: number;
  /** The advancing `rand()` stream for this chunk/kind — callers that need
   *  to continue rolling per-candidate values (archetype pick, recipe
   *  assembly, whole-asset yaw, rock radius, etc.) use this SAME instance so
   *  their own rand() calls land at the exact point in the stream the
   *  original single-pass builder loops did. All candidates for a given
   *  `generateChunkScatterCandidates()` call share one `rand` reference. */
  rand: () => number;
}

/**
 * Regenerates one chunk's deterministic tree/rock/bush candidate points —
 * IDENTICAL to what `_buildChunkScatter()`/`_buildChunkBushes()` compute
 * inline today for the same `coord`/`worldSeed`/`kind`. Pure, chunk-scoped,
 * callable for a chunk regardless of whether it's actually loaded in
 * `ChunkManager`.
 *
 * Every kind (`'tree'`, `'rock'`, `'bush'`) now uses its OWN independent,
 * freshly-seeded rand stream (see `SCATTER_PARAMS`'s doc comment for why
 * rock's stream was decoupled from tree's in Task 6) — calling this with the
 * same `(coord, worldSeed, kind)` from two different call sites (the
 * collider path and the visual instancing path) always reproduces the exact
 * same candidate list, with no cross-call-site rand-consumption bookkeeping
 * required. `existingRand` remains available for callers that want to
 * deliberately continue an existing stream (none of this project's current
 * callers do), primarily so tests can exercise stream-chaining behavior.
 */
export function generateChunkScatterCandidates(
  coord: ChunkCoord,
  worldSeed: number,
  kind: NatureScatterKind,
  grid: ChunkGridInfo,
  existingRand?: () => number,
): ChunkScatterCandidate[] {
  const { minDist, seedXor, cxMul, czMul } = SCATTER_PARAMS[kind];
  const { GHW, GHH, T, chunkSize } = grid;
  const chunkWorldSize = T * chunkSize;
  const colStart = coord.cx * chunkSize + Math.floor(GHW);
  const rowStart = coord.cz * chunkSize + Math.floor(GHH);
  const originX = (colStart - GHW) * T;
  const originZ = (rowStart - GHH) * T;

  const rand = existingRand ?? mulberry32((worldSeed ^ seedXor) ^ (coord.cx * cxMul) ^ (coord.cz * czMul));
  const pts = poissonDisk(chunkWorldSize, chunkWorldSize, minDist, rand);
  return pts.map(([px, pz]) => ({ wx: originX + px, wz: originZ + pz, rand }));
}
