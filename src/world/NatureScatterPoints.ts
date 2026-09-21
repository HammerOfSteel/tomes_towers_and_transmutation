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

/** Per-kind poisson-disk minDist + chunk-seed formula — copied verbatim from
 *  `_buildChunkScatter()`'s tree (5.5)/rock (8) calls (both sharing ONE
 *  `0x5C47_7E12`-xor'd, `cx*92821 ^ cz*68917`-seeded `rand` stream — the tree
 *  loop runs to completion, THEN the rock loop continues consuming the same
 *  advancing stream) and `_buildChunkBushes()`'s bush (3.2) call (its own,
 *  independently-seeded `0x8B21_44F7`-xor'd stream). */
const SCATTER_PARAMS: Record<NatureScatterKind, ScatterParams> = {
  tree: { minDist: 5.5, seedXor: 0x5C47_7E12, cxMul: 92821, czMul: 68917 },
  rock: { minDist: 8,   seedXor: 0x5C47_7E12, cxMul: 92821, czMul: 68917 },
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
 * `'tree'` and `'rock'` share ONE `rand()` stream per chunk in the original
 * code (the tree loop's `poissonDisk()` call consumes `rand()` internally,
 * then the rock loop's call continues on the SAME stream) — so calling this
 * for `'rock'` after `'tree'` for the same chunk MUST pass the `rand`
 * instance returned by the last `'tree'` candidate (via `existingRand`) to
 * reproduce the original interleaving exactly. Passing no `existingRand`
 * constructs a fresh stream from `worldSeed`/`coord`/`kind` (used for the
 * first `'tree'` call of a chunk, and always for `'bush'`, which has its own
 * independent seed).
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
