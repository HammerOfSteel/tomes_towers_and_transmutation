import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as RuinateModule from '@/world/buildings/kit/Ruinate';
import {
  ruinateCourses,
  ruinateTwoLeafWall,
  type RuinateBlock,
  type RuinateResult,
  type WallCourseModel,
} from '@/world/buildings/kit/Ruinate';

interface BlockPlacementLike {
  center: THREE.Vector3;
  width: number;
  height: number;
  depth: number;
  outwardNormal: THREE.Vector3;
}

type BlockPlacementLookupLike = (block: RuinateBlock) => BlockPlacementLike;

interface GeometryExportsLike {
  buildRubbleFromLostBlocks?: (
    wall: WallCourseModel,
    result: RuinateResult,
    placementLookup: BlockPlacementLookupLike,
    material: THREE.Material,
    options: { seed: number; survivingVolumeFraction?: number; chunksPerPile?: number },
  ) => THREE.Group;
  buildRafterRemnants?: (
    rafterCount: number,
    spacing: number,
    material: THREE.Material,
    options: {
      seed: number;
      survivalRate?: number;
      rafterLength: number;
      crossSection?: { width: number; height: number };
    },
  ) => THREE.Group;
  buildIvyAttachmentPoints?: (
    wall: WallCourseModel,
    result: RuinateResult,
    placementLookup: BlockPlacementLookupLike,
    options: { seed: number; density?: number },
  ) => Array<{
    id: string;
    position: THREE.Vector3;
    normal: THREE.Vector3;
    course: number;
    index: number;
  }>;
  buildCrackCurves?: (
    wall: WallCourseModel,
    result: RuinateResult,
    placementLookup: BlockPlacementLookupLike,
    material: THREE.Material,
    options: { seed: number; grooveWidth?: number; grooveDepth?: number },
  ) => THREE.Group;
}

const geometryExports = RuinateModule as unknown as GeometryExportsLike;

interface BuildWallOptions {
  numCourses?: number;
  blocksPerCourse?: number;
  buttressIndices?: number[];
  exemptBlocks?: Array<{ course: number; index: number }>;
  leaf?: 'inner' | 'outer';
}

function buildTaggedWall(options: BuildWallOptions = {}): WallCourseModel {
  const numCourses = options.numCourses ?? 10;
  const blocksPerCourse = options.blocksPerCourse ?? 14;
  const buttressIndices = options.buttressIndices ?? [4, 9].filter(index => index > 0 && index < blocksPerCourse - 1);
  const exemptBlocks = new Set(
    (options.exemptBlocks ?? [{ course: 4, index: Math.min(7, blocksPerCourse - 1) }])
      .map(({ course, index }) => `${course}:${index}`),
  );
  const cornerIndices = new Set([0, blocksPerCourse - 1]);
  const buttressIndexSet = new Set(buttressIndices);
  const blocks: RuinateBlock[] = [];

  for (let course = 0; course < numCourses; course++) {
    for (let index = 0; index < blocksPerCourse; index++) {
      const tags: NonNullable<RuinateBlock['tags']> = {};
      if (cornerIndices.has(index)) tags.corner = true;
      if (buttressIndexSet.has(index)) tags.buttress = true;
      if (exemptBlocks.has(`${course}:${index}`)) tags.exempt = true;
      blocks.push({
        id: `${options.leaf ?? 'wall'}-c${course}-i${index}`,
        course,
        index,
        tags: Object.keys(tags).length > 0 ? tags : undefined,
      });
    }
  }

  return {
    numCourses,
    blocksPerCourse,
    blocks,
    leaf: options.leaf,
  };
}

function buildUpperHalfButtressWall(tagUpperHalf: boolean): WallCourseModel {
  const numCourses = 10;
  const blocksPerCourse = 12;
  const blocks: RuinateBlock[] = [];

  for (let course = 0; course < numCourses; course++) {
    for (let index = 0; index < blocksPerCourse; index++) {
      const tags: NonNullable<RuinateBlock['tags']> = {};
      if (index === 0 || index === blocksPerCourse - 1) tags.corner = true;
      if (tagUpperHalf && index === 5 && course >= 5) tags.buttress = true;
      blocks.push({
        id: `partial-c${course}-i${index}`,
        course,
        index,
        tags: Object.keys(tags).length > 0 ? tags : undefined,
      });
    }
  }

  return { numCourses, blocksPerCourse, blocks };
}

function buildTwoCourseSingleColumnWall(blockIds: readonly [string, string]): WallCourseModel {
  return {
    numCourses: 2,
    blocksPerCourse: 1,
    blocks: [
      { id: blockIds[0], course: 0, index: 0 },
      { id: blockIds[1], course: 1, index: 0 },
    ],
  };
}

function removalRate(
  result: RuinateResult,
  wall: WallCourseModel,
  predicate: (block: RuinateBlock) => boolean,
): number {
  let total = 0;
  let removed = 0;
  for (const block of wall.blocks) {
    if (!predicate(block)) continue;
    total++;
    if (result.removedBlockIds.has(block.id)) removed++;
  }
  return total === 0 ? 0 : removed / total;
}

function sortedIds(ids: Set<string>): string[] {
  return [...ids].sort();
}

function buildPlacementLookup(
  wall: WallCourseModel,
  options: {
    blockWidth?: number;
    blockHeight?: number;
    blockDepth?: number;
    courseGap?: number;
    indexGap?: number;
    outwardNormal?: THREE.Vector3;
  } = {},
): {
  lookup: BlockPlacementLookupLike;
  placementsById: Map<string, BlockPlacementLike>;
} {
  const blockWidth = options.blockWidth ?? 1.2;
  const blockHeight = options.blockHeight ?? 0.72;
  const blockDepth = options.blockDepth ?? 0.48;
  const courseGap = options.courseGap ?? 0.08;
  const indexGap = options.indexGap ?? 0.06;
  const outwardNormal = (options.outwardNormal?.clone() ?? new THREE.Vector3(0, 0, 1)).normalize();
  const xOffset = ((wall.blocksPerCourse - 1) * (blockWidth + indexGap)) / 2;
  const placementsById = new Map<string, BlockPlacementLike>();

  for (const block of wall.blocks) {
    placementsById.set(block.id, {
      center: new THREE.Vector3(
        (block.index * (blockWidth + indexGap)) - xOffset,
        (block.course * (blockHeight + courseGap)) + (blockHeight * 0.5),
        0,
      ),
      width: blockWidth,
      height: blockHeight,
      depth: blockDepth,
      outwardNormal: outwardNormal.clone(),
    });
  }

  return {
    lookup: (block: RuinateBlock) => {
      const placement = placementsById.get(block.id);
      if (!placement) {
        throw new Error(`Missing placement for block ${block.id}`);
      }
      return {
        center: placement.center.clone(),
        width: placement.width,
        height: placement.height,
        depth: placement.depth,
        outwardNormal: placement.outwardNormal.clone(),
      };
    },
    placementsById,
  };
}

function collectMeshNodes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(node => {
    if (node instanceof THREE.Mesh) meshes.push(node);
  });
  return meshes;
}

function extractUniqueCorners(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const position = geometry.getAttribute('position');
  const corners = new Map<string, THREE.Vector3>();

  for (let index = 0; index < position.count; index++) {
    const corner = new THREE.Vector3(
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    );
    corners.set(
      `${corner.x.toFixed(4)}:${corner.y.toFixed(4)}:${corner.z.toFixed(4)}`,
      corner,
    );
  }

  return [...corners.values()];
}

function geometrySignature(geometry: THREE.BufferGeometry): string {
  return extractUniqueCorners(geometry)
    .map(corner => `${corner.x.toFixed(4)},${corner.y.toFixed(4)},${corner.z.toFixed(4)}`)
    .sort()
    .join('|');
}

function buildPlacementBasis(placement: BlockPlacementLike): {
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
} {
  const up = new THREE.Vector3(0, 1, 0);
  const normal = placement.outwardNormal.clone().normalize();
  const tangent = new THREE.Vector3().crossVectors(up, normal);
  if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
  tangent.normalize();
  return { normal, tangent, up };
}

function findCollapsedSpans(
  wall: WallCourseModel,
  result: RuinateResult,
): Array<{
  start: number;
  end: number;
  removedBlocks: RuinateBlock[];
  baseRemovedBlocks: RuinateBlock[];
}> {
  const blocksByCell = new Map<string, RuinateBlock>(
    wall.blocks.map(block => [`${block.course}:${block.index}`, block]),
  );
  const spans: Array<{
    start: number;
    end: number;
    removedBlocks: RuinateBlock[];
    baseRemovedBlocks: RuinateBlock[];
  }> = [];

  let spanStart = -1;
  for (let index = 0; index <= wall.blocksPerCourse; index++) {
    const isDamaged = index < wall.blocksPerCourse
      && result.breakHeightByColumn[index]! < wall.numCourses - 1;
    if (isDamaged && spanStart === -1) {
      spanStart = index;
      continue;
    }
    if (isDamaged || spanStart === -1) continue;

    const start = spanStart;
    const end = index - 1;
    const removedBlocks = wall.blocks.filter(
      block => block.index >= start
        && block.index <= end
        && result.removedBlockIds.has(block.id),
    );
    const baseRemovedBlocks: RuinateBlock[] = [];
    for (let column = start; column <= end; column++) {
      const removedCourse = result.breakHeightByColumn[column]! + 1;
      const block = blocksByCell.get(`${removedCourse}:${column}`);
      if (block) baseRemovedBlocks.push(block);
    }
    spans.push({ start, end, removedBlocks, baseRemovedBlocks });
    spanStart = -1;
  }

  return spans;
}

function expectContiguousMask(result: RuinateResult, wall: WallCourseModel): void {
  expect(result.breakHeightByColumn).toHaveLength(wall.blocksPerCourse);
  expect(result.occupancyMask).toHaveLength(wall.numCourses);
  result.occupancyMask.forEach(row => expect(row).toHaveLength(wall.blocksPerCourse));

  const blocksByCell = new Map<string, RuinateBlock>(
    wall.blocks.map(block => [`${block.course}:${block.index}`, block]),
  );

  for (let index = 0; index < wall.blocksPerCourse; index++) {
    const breakHeight = result.breakHeightByColumn[index]!;
    for (let course = 0; course < wall.numCourses; course++) {
      const occupied = result.occupancyMask[course]![index]!;
      const block = blocksByCell.get(`${course}:${index}`);
      expect(block).toBeDefined();
      expect(occupied).toBe(course <= breakHeight);
      expect(result.survivingBlockIds.has(block!.id)).toBe(occupied);
      expect(result.removedBlockIds.has(block!.id)).toBe(!occupied);
    }
  }
}

function expectSteppedSilhouette(breakHeights: number[], wall: WallCourseModel): void {
  expect(new Set(breakHeights).size).toBeGreaterThan(1);

  const diffs = breakHeights.slice(1).map((height, index) => Math.abs(height - breakHeights[index]!));
  const totalDiff = diffs.reduce((sum, diff) => sum + diff, 0);
  const smallDiffCount = diffs.filter(diff => diff <= 2).length;
  const silhouetteRange = Math.max(...breakHeights) - Math.min(...breakHeights);
  const theoreticalMax = wall.numCourses * Math.max(0, wall.blocksPerCourse - 1);

  expect(totalDiff).toBeGreaterThan(4);
  expect(totalDiff).toBeLessThan(theoreticalMax * 0.6);
  expect(smallDiffCount).toBeGreaterThanOrEqual(Math.ceil(diffs.length * 0.6));
  expect(silhouetteRange).toBeGreaterThanOrEqual(3);
}

function structuralAdvantageMargin(result: RuinateResult, wall: WallCourseModel): number {
  const structuralRemoval = removalRate(
    result,
    wall,
    block => !block.tags?.exempt && !!(block.tags?.corner || block.tags?.buttress),
  );
  const midSpanRemoval = removalRate(
    result,
    wall,
    block => !block.tags?.exempt && !block.tags?.corner && !block.tags?.buttress,
  );
  return midSpanRemoval - structuralRemoval;
}

describe('ruinateCourses', () => {
  it('throws when duplicate block ids would make Set-based results ambiguous', () => {
    const wall = buildTwoCourseSingleColumnWall(['dup', 'dup']);

    expect(() => ruinateCourses(wall, { seed: 0, damageIntensity: 1 })).toThrowError(
      'ruinateCourses(): duplicate block id "dup"',
    );
  });

  it('still ruinate a single-column wall normally when block ids are unique', () => {
    const wall = buildTwoCourseSingleColumnWall(['lower', 'upper']);
    const result = ruinateCourses(wall, { seed: 0, damageIntensity: 1 });

    expect(result.breakHeightByColumn).toEqual([0]);
    expect(result.occupancyMask).toEqual([
      [true],
      [false],
    ]);
    expect(result.survivingBlockIds).toEqual(new Set(['lower']));
    expect(result.removedBlockIds).toEqual(new Set(['upper']));
  });

  it('removes a meaningfully lower fraction of structural blocks than mid-span blocks across many seeds', () => {
    const wall = buildTaggedWall();
    let structuralRemoved = 0;
    let structuralTotal = 0;
    let midSpanRemoved = 0;
    let midSpanTotal = 0;

    for (let seed = 0; seed < 48; seed++) {
      const result = ruinateCourses(wall, { seed, damageIntensity: 0.6 });
      for (const block of wall.blocks) {
        if (block.tags?.exempt) continue;
        if (block.tags?.corner || block.tags?.buttress) {
          structuralTotal++;
          if (result.removedBlockIds.has(block.id)) structuralRemoved++;
        } else {
          midSpanTotal++;
          if (result.removedBlockIds.has(block.id)) midSpanRemoved++;
        }
      }
    }

    const structuralRemovalRate = structuralRemoved / structuralTotal;
    const midSpanRemovalRate = midSpanRemoved / midSpanTotal;

    expect(structuralRemovalRate).toBeLessThan(midSpanRemovalRate - 0.11);
  });

  it('never removes exempt blocks even under maximum damage across many seeds', () => {
    const wall = buildTaggedWall({ exemptBlocks: [{ course: 4, index: 7 }] });
    const exemptId = wall.blocks.find(block => block.tags?.exempt)?.id;
    expect(exemptId).toBeDefined();

    for (let seed = 0; seed < 64; seed++) {
      const result = ruinateCourses(wall, { seed, damageIntensity: 1 });
      expect(result.survivingBlockIds.has(exemptId!)).toBe(true);
      expect(result.removedBlockIds.has(exemptId!)).toBe(false);
    }
  });

  it('does not let upper-course structural tags directly reinforce lower untagged blocks in the same column', () => {
    const controlWall = buildUpperHalfButtressWall(false);
    const taggedWall = buildUpperHalfButtressWall(true);
    const targetId = 'partial-c1-i5';

    for (let seed = 0; seed < 200; seed++) {
      const control = ruinateCourses(controlWall, { seed, damageIntensity: 1 });
      const tagged = ruinateCourses(taggedWall, { seed, damageIntensity: 1 });
      expect(tagged.removedBlockIds.has(targetId)).toBe(control.removedBlockIds.has(targetId));
    }
  });

  it('uses the highest exempt block in a column to clamp contiguous survival support', () => {
    const wall = buildTaggedWall({
      numCourses: 5,
      blocksPerCourse: 3,
      buttressIndices: [],
      exemptBlocks: [
        { course: 1, index: 1 },
        { course: 4, index: 1 },
      ],
    });
    const result = ruinateCourses(wall, { seed: 22, damageIntensity: 1 });

    expect(result.breakHeightByColumn[1]).toBe(4);
    expect(result.occupancyMask.map(row => row[1])).toEqual([true, true, true, true, true]);
    expect(result.removedBlockIds.has('wall-c4-i1')).toBe(false);
    expect(result.removedBlockIds.has('wall-c1-i1')).toBe(false);
  });

  it('produces a stepped coherent silhouette instead of a flat or maximally noisy break line', () => {
    const wall = buildTaggedWall();
    const result = ruinateCourses(wall, { seed: 0xC0FFEE, damageIntensity: 0.58 });

    expectSteppedSilhouette(result.breakHeightByColumn, wall);
  });

  it('keeps occupancy contiguous from the ground up to each break height with no floating blocks', () => {
    const wall = buildTaggedWall();
    const result = ruinateCourses(wall, { seed: 73, damageIntensity: 0.62 });

    expectContiguousMask(result, wall);
  });

  it('is deterministic for the same seed and changes for a different seed', () => {
    const wall = buildTaggedWall();
    const resultA = ruinateCourses(wall, { seed: 314159, damageIntensity: 0.57 });
    const resultB = ruinateCourses(wall, { seed: 314159, damageIntensity: 0.57 });
    const resultC = ruinateCourses(wall, { seed: 271828, damageIntensity: 0.57 });

    expect(resultA.breakHeightByColumn).toEqual([6, 6, 7, 7, 9, 9, 9, 8, 8, 8, 8, 8, 7, 9]);
    expect(resultA.removedBlockIds.size).toBe(17);
    expect(resultA.survivingBlockIds.size).toBe(123);

    expect(resultA.breakHeightByColumn).toEqual(resultB.breakHeightByColumn);
    expect(resultA.occupancyMask).toEqual(resultB.occupancyMask);
    expect(sortedIds(resultA.survivingBlockIds)).toEqual(sortedIds(resultB.survivingBlockIds));
    expect(sortedIds(resultA.removedBlockIds)).toEqual(sortedIds(resultB.removedBlockIds));

    const sameBreakHeights = JSON.stringify(resultA.breakHeightByColumn) === JSON.stringify(resultC.breakHeightByColumn);
    const sameRemovedIds = JSON.stringify(sortedIds(resultA.removedBlockIds)) === JSON.stringify(sortedIds(resultC.removedBlockIds));
    expect(sameBreakHeights && sameRemovedIds).toBe(false);
  });

  it('removes measurably more blocks at higher damage intensity for the same seed', () => {
    const wall = buildTaggedWall();
    const lowDamage = ruinateCourses(wall, { seed: 9001, damageIntensity: 0.15 });
    const highDamage = ruinateCourses(wall, { seed: 9001, damageIntensity: 0.8 });

    expect(highDamage.removedBlockIds.size).toBeGreaterThan(lowDamage.removedBlockIds.size + wall.blocksPerCourse);
  });

  it('decorrelates inner and outer leaves while preserving structure-aware stepped occupancy', () => {
    const outer = buildTaggedWall({ leaf: 'outer' });
    const inner = buildTaggedWall({ leaf: 'inner' });
    const result = ruinateTwoLeafWall(outer, inner, { seed: 8080, damageIntensity: 0.6 });
    const differingColumns = result.outer.breakHeightByColumn
      .filter((height, index) => height !== result.inner.breakHeightByColumn[index]).length;
    let outerMarginTotal = 0;
    let innerMarginTotal = 0;

    expect(differingColumns).toBeGreaterThanOrEqual(2);
    expect(result.outer.breakHeightByColumn).not.toEqual(result.inner.breakHeightByColumn);

    expectSteppedSilhouette(result.outer.breakHeightByColumn, outer);
    expectSteppedSilhouette(result.inner.breakHeightByColumn, inner);
    expectContiguousMask(result.outer, outer);
    expectContiguousMask(result.inner, inner);

    for (let seed = 0; seed < 96; seed++) {
      const aggregated = ruinateTwoLeafWall(outer, inner, { seed, damageIntensity: 0.6 });
      outerMarginTotal += structuralAdvantageMargin(aggregated.outer, outer);
      innerMarginTotal += structuralAdvantageMargin(aggregated.inner, inner);
    }

    expect(outerMarginTotal / 96).toBeGreaterThan(0.09);
    expect(innerMarginTotal / 96).toBeGreaterThan(0.09);
  });

  it('keeps the wall intact at zero damage and handles a single-column wall sensibly', () => {
    const intactWall = buildTaggedWall();
    const intact = ruinateCourses(intactWall, { seed: 19, damageIntensity: 0 });

    expect(intact.removedBlockIds.size).toBe(0);
    expect(intact.survivingBlockIds.size).toBe(intactWall.blocks.length);
    expect(intact.breakHeightByColumn).toEqual(Array(intactWall.blocksPerCourse).fill(intactWall.numCourses - 1));

    const narrowWall = buildTaggedWall({
      numCourses: 3,
      blocksPerCourse: 1,
      buttressIndices: [],
      exemptBlocks: [{ course: 1, index: 0 }],
    });
    let erodedTopCount = 0;

    for (let seed = 0; seed < 64; seed++) {
      const narrow = ruinateCourses(narrowWall, { seed, damageIntensity: 1 });
      const breakHeight = narrow.breakHeightByColumn[0]!;

      if (breakHeight === 1) erodedTopCount++;
      expect(breakHeight).toBeGreaterThanOrEqual(1);
      expect(breakHeight).toBeLessThanOrEqual(2);
      expect(narrow.survivingBlockIds.has('wall-c1-i0')).toBe(true);
      expectContiguousMask(narrow, narrowWall);
    }

    expect(erodedTopCount).toBeGreaterThan(0);
    expect(erodedTopCount).toBeLessThan(64);
  });
});

describe('ruin geometry helpers', () => {
  it('builds same-material named rubble piles near collapsed spans using angular non-identical fragments', () => {
    const wall = buildTaggedWall();
    const result = ruinateCourses(wall, { seed: 314159, damageIntensity: 0.57 });
    const spans = findCollapsedSpans(wall, result);
    const { lookup, placementsById } = buildPlacementLookup(wall);
    const material = new THREE.MeshStandardMaterial({ color: 0x91816f, roughness: 0.92 });
    const buildRubbleFromLostBlocks = geometryExports.buildRubbleFromLostBlocks;

    expect(buildRubbleFromLostBlocks).toBeTypeOf('function');

    const rubble = buildRubbleFromLostBlocks!(
      wall,
      result,
      lookup,
      material,
      { seed: 12345, survivingVolumeFraction: 0.45, chunksPerPile: 4 },
    );

    rubble.updateMatrixWorld(true);
    expect(rubble.children).toHaveLength(spans.length);

    spans.forEach((span, spanIndex) => {
      const pile = rubble.children[spanIndex] as THREE.Group;
      expect(pile.name).toBe(`rubble-pile-span-${span.start}-${span.end}`);

      const expectedFoot = span.baseRemovedBlocks
        .map(block => placementsById.get(block.id)!)
        .reduce((sum, placement) => {
          const foot = placement.center.clone()
            .addScaledVector(placement.outwardNormal, placement.depth * 0.5)
            .addScaledVector(new THREE.Vector3(0, 1, 0), -placement.height * 0.5);
          return sum.add(foot);
        }, new THREE.Vector3())
        .multiplyScalar(1 / span.baseRemovedBlocks.length);
      const averageBlockWidth = span.baseRemovedBlocks
        .map(block => placementsById.get(block.id)!.width)
        .reduce((sum, width) => sum + width, 0) / span.baseRemovedBlocks.length;
      const pileWorld = pile.getWorldPosition(new THREE.Vector3());

      expect(pileWorld.distanceTo(expectedFoot)).toBeLessThanOrEqual(averageBlockWidth * 0.75);
    });

    const chunkMeshes = collectMeshNodes(rubble);
    expect(chunkMeshes.length).toBeGreaterThanOrEqual(spans.length * 3);
    chunkMeshes.forEach(mesh => expect(mesh.material).toBe(material));

    const firstChunkCorners = extractUniqueCorners(chunkMeshes[0]!.geometry);
    const firstChunkFaceCount = chunkMeshes[0]!.geometry.getAttribute('position').count / 3;
    const uniqueAbsX = new Set(firstChunkCorners.map(corner => Math.abs(corner.x).toFixed(4))).size;
    const uniqueAbsY = new Set(firstChunkCorners.map(corner => Math.abs(corner.y).toFixed(4))).size;
    const uniqueAbsZ = new Set(firstChunkCorners.map(corner => Math.abs(corner.z).toFixed(4))).size;

    expect(firstChunkCorners).toHaveLength(8);
    expect(firstChunkFaceCount).toBe(12);
    expect(Math.max(uniqueAbsX, uniqueAbsY, uniqueAbsZ)).toBeGreaterThan(1);
    expect(geometrySignature(chunkMeshes[0]!.geometry)).not.toBe(geometrySignature(chunkMeshes[1]!.geometry));
  });

  it('deletes a seeded half-ish rafter set deterministically and changes pattern with a new seed', () => {
    const buildRafterRemnants = geometryExports.buildRafterRemnants;
    const material = new THREE.MeshStandardMaterial({ color: 0x4f3c2e, roughness: 0.88 });

    expect(buildRafterRemnants).toBeTypeOf('function');

    const raftersA = buildRafterRemnants!(11, 0.8, material, {
      seed: 77,
      survivalRate: 0.5,
      rafterLength: 3.6,
      crossSection: { width: 0.12, height: 0.18 },
    });
    const raftersB = buildRafterRemnants!(11, 0.8, material, {
      seed: 77,
      survivalRate: 0.5,
      rafterLength: 3.6,
      crossSection: { width: 0.12, height: 0.18 },
    });
    const raftersC = buildRafterRemnants!(11, 0.8, material, {
      seed: 78,
      survivalRate: 0.5,
      rafterLength: 3.6,
      crossSection: { width: 0.12, height: 0.18 },
    });
    const empty = buildRafterRemnants!(0, 0.8, material, {
      seed: 77,
      survivalRate: 0.5,
      rafterLength: 3.6,
    });

    const positionsFor = (group: THREE.Group) => group.children
      .map(child => (child as THREE.Mesh).position.x)
      .sort((left, right) => left - right);

    expect(raftersA.children).toHaveLength(6);
    expect(positionsFor(raftersA)).toEqual(positionsFor(raftersB));
    expect(positionsFor(raftersA)).not.toEqual(positionsFor(raftersC));
    expect(empty.children).toHaveLength(0);
  });

  it('places ivy hooks on real break-line edges with outward-facing normals from placements', () => {
    const wall = buildTaggedWall();
    const result = ruinateCourses(wall, { seed: 314159, damageIntensity: 0.57 });
    const { lookup, placementsById } = buildPlacementLookup(wall);
    const buildIvyAttachmentPoints = geometryExports.buildIvyAttachmentPoints;

    expect(buildIvyAttachmentPoints).toBeTypeOf('function');

    const hooks = buildIvyAttachmentPoints!(wall, result, lookup, { seed: 2024, density: 1 });
    expect(hooks.length).toBeGreaterThan(0);

    for (const hook of hooks) {
      const block = wall.blocks.find(candidate => candidate.course === hook.course && candidate.index === hook.index);
      expect(block).toBeDefined();

      const placement = placementsById.get(block!.id)!;
      const { normal, tangent, up } = buildPlacementBasis(placement);
      const offset = hook.position.clone().sub(placement.center);

      expect(result.breakHeightByColumn[hook.index]).toBe(hook.course);
      expect(offset.dot(normal)).toBeGreaterThan(placement.depth * 0.45);
      expect(offset.dot(up)).toBeGreaterThan(placement.height * 0.15);
      expect(Math.abs(offset.dot(tangent))).toBeLessThanOrEqual(placement.width * 0.45);
      expect(hook.normal.length()).toBeCloseTo(1, 6);
      expect(hook.normal.dot(normal)).toBeGreaterThan(0.99);
    }
  });

  it('builds visible jagged crack grooves instead of flat decals', () => {
    const wall = buildTaggedWall();
    const result = ruinateCourses(wall, { seed: 314159, damageIntensity: 0.57 });
    const { lookup } = buildPlacementLookup(wall);
    const material = new THREE.MeshStandardMaterial({ color: 0x8f8b83, roughness: 0.9 });
    const buildCrackCurves = geometryExports.buildCrackCurves;

    expect(buildCrackCurves).toBeTypeOf('function');

    const cracks = buildCrackCurves!(
      wall,
      result,
      lookup,
      material,
      { seed: 444, grooveWidth: 0.05, grooveDepth: 0.02 },
    );

    cracks.updateMatrixWorld(true);
    expect(cracks.children.length).toBeGreaterThan(0);

    const segmentMeshes = collectMeshNodes(cracks);
    expect(segmentMeshes.length).toBeGreaterThanOrEqual(3);
    segmentMeshes.forEach(mesh => expect(mesh.material).toBe(material));

    const firstSegmentGeometry = segmentMeshes[0]!.geometry;
    firstSegmentGeometry.computeBoundingBox();
    const firstSegmentSize = new THREE.Vector3();
    firstSegmentGeometry.boundingBox!.getSize(firstSegmentSize);

    expect(firstSegmentSize.y).toBeGreaterThanOrEqual(0.05);
    expect(firstSegmentSize.z).toBeGreaterThanOrEqual(0.02);

    const firstCrack = cracks.children[0] as THREE.Group;
    expect(firstCrack.children.length).toBeGreaterThanOrEqual(3);

    const crackSamples = firstCrack.children.slice(0, 3)
      .map(child => child.getWorldPosition(new THREE.Vector3()));
    const crossMagnitude = new THREE.Vector3()
      .crossVectors(
        crackSamples[1]!.clone().sub(crackSamples[0]!),
        crackSamples[2]!.clone().sub(crackSamples[0]!),
      )
      .length();

    expect(crossMagnitude).toBeGreaterThan(0.005);
  });

  it('keeps crack groove geometry above the surviving wall base on short collapsed walls', () => {
    const wall = buildTaggedWall({
      numCourses: 3,
      blocksPerCourse: 1,
      buttressIndices: [],
      exemptBlocks: [],
    });
    const result = ruinateCourses(wall, { seed: 0, damageIntensity: 1 });
    const { lookup, placementsById } = buildPlacementLookup(wall);
    const material = new THREE.MeshStandardMaterial({ color: 0x8f8b83, roughness: 0.9 });
    const buildCrackCurves = geometryExports.buildCrackCurves;

    expect(buildCrackCurves).toBeTypeOf('function');
    expect(result.breakHeightByColumn).toEqual([0]);

    const cracks = buildCrackCurves!(
      wall,
      result,
      lookup,
      material,
      { seed: 0, grooveWidth: 0.05, grooveDepth: 0.02 },
    );
    cracks.updateMatrixWorld(true);

    const survivingBlock = wall.blocks.find(block => block.course === 0 && block.index === 0)!;
    const survivingPlacement = placementsById.get(survivingBlock.id)!;
    const survivingBaseY = survivingPlacement.center.y - (survivingPlacement.height * 0.5);
    const minCrackY = Math.min(...collectMeshNodes(cracks).map(mesh => {
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).min.y;
    }));

    expect(minCrackY).toBeGreaterThanOrEqual(survivingBaseY - 1e-6);
  });

  it('emits no rubble, ivy, or cracks when no blocks were lost', () => {
    const wall = buildTaggedWall();
    const intact = ruinateCourses(wall, { seed: 19, damageIntensity: 0 });
    const { lookup } = buildPlacementLookup(wall);
    const material = new THREE.MeshStandardMaterial({ color: 0x7a7366, roughness: 0.94 });

    expect(geometryExports.buildRubbleFromLostBlocks).toBeTypeOf('function');
    expect(geometryExports.buildIvyAttachmentPoints).toBeTypeOf('function');
    expect(geometryExports.buildCrackCurves).toBeTypeOf('function');

    const rubble = geometryExports.buildRubbleFromLostBlocks!(
      wall,
      intact,
      lookup,
      material,
      { seed: 1, chunksPerPile: 4 },
    );
    const hooks = geometryExports.buildIvyAttachmentPoints!(wall, intact, lookup, { seed: 1, density: 1 });
    const cracks = geometryExports.buildCrackCurves!(
      wall,
      intact,
      lookup,
      material,
      { seed: 1, grooveWidth: 0.05, grooveDepth: 0.02 },
    );

    expect(collectMeshNodes(rubble)).toHaveLength(0);
    expect(hooks).toEqual([]);
    expect(collectMeshNodes(cracks)).toHaveLength(0);
  });
});
