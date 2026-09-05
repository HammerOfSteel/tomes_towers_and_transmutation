import { mulberry32 } from '../../../core/prng';

/** Structural tags that make a block resistant to (or fully exempt from) removal. */
export interface RuinateBlockTags {
  corner?: boolean;
  buttress?: boolean;
  /** Fully exempt from removal regardless of damage field value (e.g. a keystone). */
  exempt?: boolean;
}

/** One block position in an abstract coursed wall. `course` is 0 = lowest/ground
 * course. `index` is left-to-right position within that course. */
export interface RuinateBlock {
  id: string;
  course: number;
  index: number;
  tags?: RuinateBlockTags;
}

/** An abstract rectangular coursed wall: `numCourses` rows, each with the same
 * `blocksPerCourse` count. `leaf` distinguishes inner/outer wythes for two-leaf
 * wall support. */
export interface WallCourseModel {
  numCourses: number;
  blocksPerCourse: number;
  blocks: RuinateBlock[];
  leaf?: 'inner' | 'outer';
}

export interface RuinateOptions {
  seed: number;
  /** 0-1 overall proportion of the wall targeted for removal. Default 0.4. */
  damageIntensity?: number;
  /**
   * Multiplier reducing effective damage for corner/buttress blocks.
   * Default 0.35: structurally tagged blocks still can fail, but are
   * roughly 65% less likely than comparable mid-span blocks to be selected
   * as the block that begins a column break.
   */
  structuralResistance?: number;
}

export interface RuinateResult {
  survivingBlockIds: Set<string>;
  removedBlockIds: Set<string>;
  /** Per-column topmost surviving course index, or -1 if the column is gone. */
  breakHeightByColumn: number[];
  /** Convenience: [course][index] occupancy grid mirroring breakHeightByColumn. */
  occupancyMask: boolean[][];
  seed: number;
}

interface NormalizedWall {
  blockGrid: RuinateBlock[][];
  highestExemptByColumn: number[];
}

const DEFAULT_DAMAGE_INTENSITY = 0.4;
const DEFAULT_STRUCTURAL_RESISTANCE = 0.35;
const FIELD_STREAM_SALT = 0x9E37_79B9;
const OUTER_LEAF_SALT = 0xA24B_AED4;
const INNER_LEAF_SALT = 0x51C6_8E19;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const clamped = clamp01(t);
  return clamped * clamped * (3 - 2 * clamped);
}

function mixSeed(seed: number, salt: number): number {
  let mixed = (seed ^ salt) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85EB_CA6B);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xC2B2_AE35);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function sampleInterpolated(values: readonly number[], x: number): number {
  if (values.length === 1) return values[0] ?? 0.5;
  const scaled = clamp01(x) * (values.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(values.length - 1, leftIndex + 1);
  const t = smoothstep(scaled - leftIndex);
  return lerp(values[leftIndex]!, values[rightIndex]!, t);
}

function normalizeWall(wall: WallCourseModel): NormalizedWall {
  if (!Number.isInteger(wall.numCourses) || wall.numCourses <= 0) {
    throw new Error(`ruinateCourses(): numCourses must be a positive integer, got ${wall.numCourses}`);
  }
  if (!Number.isInteger(wall.blocksPerCourse) || wall.blocksPerCourse <= 0) {
    throw new Error(`ruinateCourses(): blocksPerCourse must be a positive integer, got ${wall.blocksPerCourse}`);
  }
  const expectedBlockCount = wall.numCourses * wall.blocksPerCourse;
  if (wall.blocks.length !== expectedBlockCount) {
    throw new Error(
      `ruinateCourses(): expected ${expectedBlockCount} blocks for a rectangular wall, got ${wall.blocks.length}`,
    );
  }

  const blockGrid = Array.from({ length: wall.numCourses }, () => Array<RuinateBlock>(wall.blocksPerCourse));
  const highestExemptByColumn = Array<number>(wall.blocksPerCourse).fill(-1);

  for (const block of wall.blocks) {
    if (!Number.isInteger(block.course) || block.course < 0 || block.course >= wall.numCourses) {
      throw new Error(`ruinateCourses(): block ${block.id} has out-of-range course ${block.course}`);
    }
    if (!Number.isInteger(block.index) || block.index < 0 || block.index >= wall.blocksPerCourse) {
      throw new Error(`ruinateCourses(): block ${block.id} has out-of-range index ${block.index}`);
    }
    if (blockGrid[block.course]![block.index] !== undefined) {
      throw new Error(`ruinateCourses(): duplicate block at course ${block.course}, index ${block.index}`);
    }

    blockGrid[block.course]![block.index] = block;
    if (block.tags?.exempt) {
      highestExemptByColumn[block.index] = Math.max(highestExemptByColumn[block.index]!, block.course);
    }
  }

  for (let course = 0; course < wall.numCourses; course++) {
    for (let index = 0; index < wall.blocksPerCourse; index++) {
      if (blockGrid[course]![index] === undefined) {
        throw new Error(`ruinateCourses(): missing block at course ${course}, index ${index}`);
      }
    }
  }

  return {
    blockGrid,
    highestExemptByColumn,
  };
}

function buildDamageField(blocksPerCourse: number, seed: number): number[] {
  if (blocksPerCourse === 1) return [0.5];

  const rand = mulberry32(mixSeed(seed, FIELD_STREAM_SALT));
  const lowOctave = Array.from({ length: Math.max(4, Math.ceil(blocksPerCourse / 4) + 1) }, () => rand());
  const midOctave = Array.from({ length: Math.max(6, Math.ceil(blocksPerCourse / 2) + 1) }, () => rand());
  const wavePhase = rand() * Math.PI * 2;
  const waveFrequency = 0.75 + rand() * 1.5;
  const lobeCenter = rand();
  const lobeWidth = 0.14 + rand() * 0.2;
  const lobeAmplitude = 0.08 + rand() * 0.1;
  const widthTilt = (rand() - 0.5) * 0.25;

  const rawField = Array.from({ length: blocksPerCourse }, (_unused, index) => {
    const x = index / (blocksPerCourse - 1);
    const low = sampleInterpolated(lowOctave, x);
    const mid = sampleInterpolated(midOctave, x);
    const wave = 0.5 + 0.5 * Math.sin(wavePhase + x * Math.PI * 2 * waveFrequency);
    const lobeDistance = x - lobeCenter;
    const lobe = Math.exp(-(lobeDistance * lobeDistance) / (2 * lobeWidth * lobeWidth));
    // Tuned for stepped local coherence: a dominant low octave, a weaker
    // mid octave, a light sinusoidal wobble, and one broad local lobe.
    return (low * 0.55)
      + (mid * 0.25)
      + (wave * 0.12)
      + (lobe * lobeAmplitude)
      + (widthTilt * (x - 0.5));
  });
  const smoothedField = rawField.map((value, index) => {
    const left = rawField[Math.max(0, index - 1)]!;
    const right = rawField[Math.min(rawField.length - 1, index + 1)]!;
    return (left * 0.25) + (value * 0.5) + (right * 0.25);
  });

  const minField = Math.min(...smoothedField);
  const maxField = Math.max(...smoothedField);
  if (Math.abs(maxField - minField) < 1e-6) return Array(blocksPerCourse).fill(0.5);

  return smoothedField.map(value => 0.18 + (0.7 * (value - minField)) / (maxField - minField));
}

function removalProbability(
  block: RuinateBlock,
  numCourses: number,
  columnDamage: number,
  options: Required<Pick<RuinateOptions, 'damageIntensity' | 'structuralResistance'>>,
): number {
  if (block.tags?.exempt) return 0;

  const heightRatio = (block.course + 0.5) / numCourses;
  const expectedBreakRatio = clamp01(
    1 - (options.damageIntensity * (0.25 + (0.75 * columnDamage))),
  );
  const aboveBreakPressure = Math.max(0, heightRatio - expectedBreakRatio);
  const topDownBias = options.damageIntensity * columnDamage * Math.pow(heightRatio, 2.2) * 0.12;
  let probability = clamp01((aboveBreakPressure * 1.6) + topDownBias);

  if (block.tags?.corner || block.tags?.buttress) {
    probability *= options.structuralResistance;
  }
  return clamp01(probability);
}

/**
 * Decide which blocks in a rectangular coursed wall survive a ruin pass.
 *
 * Invariant: columns never contain floating survivors above a gap. We first
 * sample a deterministic candidate-removal mask, then collapse each column to a
 * single contiguous surviving stack by finding the first removed non-exempt
 * block from the bottom. Any block above that break is removed. Exempt blocks
 * clamp the break upward so they always survive; this also preserves support
 * beneath them instead of leaving an unsupported exempt fragment.
 */
export function ruinateCourses(wall: WallCourseModel, options: RuinateOptions): RuinateResult {
  const normalized = normalizeWall(wall);
  const damageIntensity = clamp01(options.damageIntensity ?? DEFAULT_DAMAGE_INTENSITY);
  const structuralResistance = clamp01(options.structuralResistance ?? DEFAULT_STRUCTURAL_RESISTANCE);
  const damageField = buildDamageField(wall.blocksPerCourse, options.seed);
  const rollRand = mulberry32(options.seed >>> 0);
  const candidateRemoved = Array.from(
    { length: wall.numCourses },
    () => Array<boolean>(wall.blocksPerCourse).fill(false),
  );

  for (let course = 0; course < wall.numCourses; course++) {
    for (let index = 0; index < wall.blocksPerCourse; index++) {
      const block = normalized.blockGrid[course]![index]!;
      const probability = removalProbability(
        block,
        wall.numCourses,
        damageField[index]!,
        { damageIntensity, structuralResistance },
      );
      const roll = rollRand();
      candidateRemoved[course]![index] = roll < probability;
    }
  }

  const breakHeightByColumn = Array<number>(wall.blocksPerCourse).fill(wall.numCourses - 1);
  for (let index = 0; index < wall.blocksPerCourse; index++) {
    let breakHeight = wall.numCourses - 1;
    for (let course = 0; course < wall.numCourses; course++) {
      if (candidateRemoved[course]![index]) {
        breakHeight = course - 1;
        break;
      }
    }
    breakHeightByColumn[index] = Math.max(breakHeight, normalized.highestExemptByColumn[index]!);
  }

  const occupancyMask = Array.from(
    { length: wall.numCourses },
    (_unused, course) => Array.from(
      { length: wall.blocksPerCourse },
      (_unused2, index) => course <= breakHeightByColumn[index]!,
    ),
  );
  const survivingBlockIds = new Set<string>();
  const removedBlockIds = new Set<string>();

  for (let course = 0; course < wall.numCourses; course++) {
    for (let index = 0; index < wall.blocksPerCourse; index++) {
      const block = normalized.blockGrid[course]![index]!;
      if (occupancyMask[course]![index]) {
        survivingBlockIds.add(block.id);
      } else {
        removedBlockIds.add(block.id);
      }
    }
  }

  return {
    survivingBlockIds,
    removedBlockIds,
    breakHeightByColumn,
    occupancyMask,
    seed: options.seed >>> 0,
  };
}

/** Ruinate inner and outer leaves with deterministic but decorrelated seeds. */
export function ruinateTwoLeafWall(
  outer: WallCourseModel,
  inner: WallCourseModel,
  options: RuinateOptions,
): { outer: RuinateResult; inner: RuinateResult } {
  const outerSeed = mixSeed(options.seed, OUTER_LEAF_SALT);
  const innerSeed = mixSeed(options.seed, INNER_LEAF_SALT);

  return {
    outer: ruinateCourses(outer, { ...options, seed: outerSeed }),
    inner: ruinateCourses(inner, { ...options, seed: innerSeed }),
  };
}
