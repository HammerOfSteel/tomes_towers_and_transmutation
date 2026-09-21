import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import { CHUNK_SIZE, type ChunkCoord } from '@/world/ChunkManager';
import { generateChunkScatterCandidates, type ChunkGridInfo } from '@/world/NatureScatterPoints';

// Same constants OverworldScene.ts uses (T=2 tile side length; GHW/GHH derived
// from a WorldGrid's width/height the same way OverworldScene's constructor does).
const T = 2;
const GHW = 50;
const GHH = 50;
const GRID: ChunkGridInfo = { GHW, GHH, T, chunkSize: CHUNK_SIZE };

/** Replicates _buildChunkScatter()'s EXACT pre-refactor inline formula (tree loop,
 *  then rock loop, sharing one `rand` stream) — this is the golden-fixture
 *  reference the extracted function must reproduce exactly. See this plan's
 *  "Physics/visual position parity" section. */
function goldenTreeAndRockPoints(coord: ChunkCoord, worldSeed: number) {
  const chunkWorldSize = T * CHUNK_SIZE;
  const colStart = coord.cx * CHUNK_SIZE + Math.floor(GHW);
  const rowStart = coord.cz * CHUNK_SIZE + Math.floor(GHH);
  const originX = (colStart - GHW) * T;
  const originZ = (rowStart - GHH) * T;
  const rand = mulberry32((worldSeed ^ 0x5C47_7E12) ^ (coord.cx * 92821) ^ (coord.cz * 68917));

  const treePts = poissonDisk(chunkWorldSize, chunkWorldSize, 5.5, rand)
    .map(([px, pz]) => ({ wx: originX + px, wz: originZ + pz }));
  const rockPts = poissonDisk(chunkWorldSize, chunkWorldSize, 8, rand)
    .map(([px, pz]) => ({ wx: originX + px, wz: originZ + pz }));
  return { treePts, rockPts };
}

function goldenBushPoints(coord: ChunkCoord, worldSeed: number) {
  const chunkWorldSize = T * CHUNK_SIZE;
  const colStart = coord.cx * CHUNK_SIZE + Math.floor(GHW);
  const rowStart = coord.cz * CHUNK_SIZE + Math.floor(GHH);
  const originX = (colStart - GHW) * T;
  const originZ = (rowStart - GHH) * T;
  const rand = mulberry32((worldSeed ^ 0x8B21_44F7) ^ (coord.cx * 51749) ^ (coord.cz * 40361));
  return poissonDisk(chunkWorldSize, chunkWorldSize, 3.2, rand)
    .map(([px, pz]) => ({ wx: originX + px, wz: originZ + pz }));
}

describe('generateChunkScatterCandidates', () => {
  it('reproduces the golden tree+rock fixture for chunk (0,0), sharing one rand stream', () => {
    const coord: ChunkCoord = { cx: 0, cz: 0 };
    const worldSeed = 123;
    const golden = goldenTreeAndRockPoints(coord, worldSeed);

    const trees = generateChunkScatterCandidates(coord, worldSeed, 'tree', GRID);
    const rocks = generateChunkScatterCandidates(coord, worldSeed, 'rock', GRID, trees.at(-1)?.rand);

    expect(trees.map(t => [t.wx, t.wz])).toEqual(golden.treePts.map(p => [p.wx, p.wz]));
    expect(rocks.map(r => [r.wx, r.wz])).toEqual(golden.rockPts.map(p => [p.wx, p.wz]));
  });

  it('reproduces the golden tree+rock fixture for chunk (2,-1)', () => {
    const coord: ChunkCoord = { cx: 2, cz: -1 };
    const worldSeed = 777;
    const golden = goldenTreeAndRockPoints(coord, worldSeed);

    const trees = generateChunkScatterCandidates(coord, worldSeed, 'tree', GRID);
    const rocks = generateChunkScatterCandidates(coord, worldSeed, 'rock', GRID, trees.at(-1)?.rand);

    expect(trees.map(t => [t.wx, t.wz])).toEqual(golden.treePts.map(p => [p.wx, p.wz]));
    expect(rocks.map(r => [r.wx, r.wz])).toEqual(golden.rockPts.map(p => [p.wx, p.wz]));
  });

  it('reproduces the golden bush fixture independently seeded', () => {
    const coord: ChunkCoord = { cx: 0, cz: 0 };
    const worldSeed = 123;
    const golden = goldenBushPoints(coord, worldSeed);
    const bushes = generateChunkScatterCandidates(coord, worldSeed, 'bush', GRID);
    expect(bushes.map(b => [b.wx, b.wz])).toEqual(golden.map(p => [p.wx, p.wz]));
  });

  it('is deterministic for a fixed coord/seed/kind', () => {
    const coord: ChunkCoord = { cx: 1, cz: 1 };
    const a = generateChunkScatterCandidates(coord, 5, 'tree', GRID);
    const b = generateChunkScatterCandidates(coord, 5, 'tree', GRID);
    expect(a.map(p => [p.wx, p.wz])).toEqual(b.map(p => [p.wx, p.wz]));
  });

  it('different chunk coords produce different point sets', () => {
    const a = generateChunkScatterCandidates({ cx: 0, cz: 0 }, 5, 'tree', GRID);
    const b = generateChunkScatterCandidates({ cx: 1, cz: 0 }, 5, 'tree', GRID);
    expect(a.map(p => [p.wx, p.wz])).not.toEqual(b.map(p => [p.wx, p.wz]));
  });
});
