import { describe, expect, it } from 'vitest';
import {
  ruinateCourses,
  ruinateTwoLeafWall,
  type RuinateBlock,
  type RuinateResult,
  type WallCourseModel,
} from '@/world/buildings/kit/Ruinate';

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
