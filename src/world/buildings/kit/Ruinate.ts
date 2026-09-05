import * as THREE from 'three';
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

/** Real-world placement info for one abstract wall block. */
export interface BlockPlacement {
  center: THREE.Vector3;
  width: number;
  height: number;
  depth: number;
  /** Outward-facing unit normal (away from the building interior). */
  outwardNormal: THREE.Vector3;
}

export type BlockPlacementLookup = (block: RuinateBlock) => BlockPlacement;

export interface RubbleOptions {
  seed: number;
  /**
   * Default 0.4: roughly 40% of lost block volume survives as visible chunks,
   * with the rest assumed crushed finer, scattered farther away, or cleared.
   */
  survivingVolumeFraction?: number;
  /** Target chunk count per pile. Actual count varies slightly by seed. */
  chunksPerPile?: number;
}

export interface RafterRemnantOptions {
  seed: number;
  /** Default 0.5 per the brief's "~50%". */
  survivalRate?: number;
  rafterLength: number;
  crossSection?: { width: number; height: number };
}

export interface VegetationHook {
  id: string;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  course: number;
  index: number;
}

export interface CrackOptions {
  seed: number;
  /**
   * Clamped to a visible minimum to avoid sub-pixel faux-detail on masonry.
   */
  grooveWidth?: number;
  grooveDepth?: number;
}

interface NormalizedWall {
  blockGrid: RuinateBlock[][];
  highestExemptByColumn: number[];
}

interface CollapsedSpan {
  start: number;
  end: number;
  removedBlocks: RuinateBlock[];
  lowestRemovedBlocks: RuinateBlock[];
}

const DEFAULT_DAMAGE_INTENSITY = 0.4;
const DEFAULT_STRUCTURAL_RESISTANCE = 0.35;
const DEFAULT_RUBBLE_SURVIVING_VOLUME_FRACTION = 0.4;
const DEFAULT_RUBBLE_CHUNKS_PER_PILE = 4;
const DEFAULT_RAFTER_SURVIVAL_RATE = 0.5;
const DEFAULT_RAFTER_WIDTH = 0.12;
const DEFAULT_RAFTER_HEIGHT = 0.18;
const MIN_RAFTER_LENGTH = 0.1;
const MIN_RAFTER_CROSS_SECTION = 0.02;
const DEFAULT_IVY_DENSITY = 0.65;
const DEFAULT_CRACK_GROOVE_WIDTH = 0.05;
const DEFAULT_CRACK_GROOVE_DEPTH = 0.02;
const MIN_CRACK_GROOVE_WIDTH = 0.04;
const MIN_CRACK_GROOVE_DEPTH = 0.015;
const GEOMETRY_EPSILON = 1e-4;
const FIELD_STREAM_SALT = 0x9E37_79B9;
const OUTER_LEAF_SALT = 0xA24B_AED4;
const INNER_LEAF_SALT = 0x51C6_8E19;
const RUBBLE_STREAM_SALT = 0xD37B_1A5E;
const RAFTER_STREAM_SALT = 0x57A9_0E3B;
const IVY_STREAM_SALT = 0x1B1F_AE7D;
const CRACK_STREAM_SALT = 0x73C4_EE11;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

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
  const seenBlockIds = new Set<string>();

  for (const block of wall.blocks) {
    if (!Number.isInteger(block.course) || block.course < 0 || block.course >= wall.numCourses) {
      throw new Error(`ruinateCourses(): block ${block.id} has out-of-range course ${block.course}`);
    }
    if (!Number.isInteger(block.index) || block.index < 0 || block.index >= wall.blocksPerCourse) {
      throw new Error(`ruinateCourses(): block ${block.id} has out-of-range index ${block.index}`);
    }
    if (seenBlockIds.has(block.id)) {
      throw new Error(`ruinateCourses(): duplicate block id "${block.id}"`);
    }
    seenBlockIds.add(block.id);
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

function positiveOrMinimum(value: number, minimum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.abs(value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function sanitizeVector3(vector: { x: number; y: number; z: number }, fallback: THREE.Vector3): THREE.Vector3 {
  const x = Number.isFinite(vector.x) ? vector.x : fallback.x;
  const y = Number.isFinite(vector.y) ? vector.y : fallback.y;
  const z = Number.isFinite(vector.z) ? vector.z : fallback.z;
  return new THREE.Vector3(x, y, z);
}

function normalizePlacement(block: RuinateBlock, lookup: BlockPlacementLookup): BlockPlacement {
  const placement = lookup(block);
  const center = sanitizeVector3(placement.center, new THREE.Vector3());
  const outwardNormal = sanitizeVector3(placement.outwardNormal, new THREE.Vector3(0, 0, 1));
  if (outwardNormal.lengthSq() < GEOMETRY_EPSILON) {
    outwardNormal.set(0, 0, 1);
  } else {
    outwardNormal.normalize();
  }

  return {
    center,
    width: positiveOrMinimum(placement.width, GEOMETRY_EPSILON),
    height: positiveOrMinimum(placement.height, GEOMETRY_EPSILON),
    depth: positiveOrMinimum(placement.depth, GEOMETRY_EPSILON),
    outwardNormal,
  };
}

function spanSalt(start: number, end: number): number {
  return ((((start + 1) * 0x1F12_3BB5) ^ ((end + 1) * 0x6C8E_9CF5)) >>> 0);
}

function averageVectors(vectors: readonly THREE.Vector3[], fallback = new THREE.Vector3()): THREE.Vector3 {
  if (vectors.length === 0) return fallback.clone();
  const sum = vectors.reduce((accumulator, vector) => accumulator.add(vector), new THREE.Vector3());
  return sum.multiplyScalar(1 / vectors.length);
}

function wallTangentFromNormal(outwardNormal: THREE.Vector3): THREE.Vector3 {
  const tangent = new THREE.Vector3().crossVectors(WORLD_UP, outwardNormal);
  if (tangent.lengthSq() < GEOMETRY_EPSILON) {
    tangent.set(1, 0, 0);
  } else {
    tangent.normalize();
  }
  return tangent;
}

function collectCollapsedSpans(wall: WallCourseModel, result: RuinateResult, normalized: NormalizedWall): CollapsedSpan[] {
  const spans: CollapsedSpan[] = [];
  let spanStart = -1;

  for (let index = 0; index <= wall.blocksPerCourse; index++) {
    const isCollapsedColumn = index < wall.blocksPerCourse
      && result.breakHeightByColumn[index]! < wall.numCourses - 1;
    if (isCollapsedColumn && spanStart === -1) {
      spanStart = index;
      continue;
    }
    if (isCollapsedColumn || spanStart === -1) continue;

    const start = spanStart;
    const end = index - 1;
    const removedBlocks: RuinateBlock[] = [];
    const lowestRemovedBlocks: RuinateBlock[] = [];

    for (let column = start; column <= end; column++) {
      const lowestRemovedCourse = result.breakHeightByColumn[column]! + 1;
      if (lowestRemovedCourse < wall.numCourses) {
        lowestRemovedBlocks.push(normalized.blockGrid[lowestRemovedCourse]![column]!);
      }
      for (let course = Math.max(0, lowestRemovedCourse); course < wall.numCourses; course++) {
        const block = normalized.blockGrid[course]![column]!;
        if (result.removedBlockIds.has(block.id)) {
          removedBlocks.push(block);
        }
      }
    }

    if (removedBlocks.length > 0) {
      spans.push({ start, end, removedBlocks, lowestRemovedBlocks });
    }
    spanStart = -1;
  }

  return spans;
}

function createAngularRubbleGeometry(width: number, height: number, depth: number, rand: () => number): THREE.BufferGeometry {
  const halfWidth = positiveOrMinimum(width, GEOMETRY_EPSILON) * 0.5;
  const halfHeight = positiveOrMinimum(height, GEOMETRY_EPSILON) * 0.5;
  const halfDepth = positiveOrMinimum(depth, GEOMETRY_EPSILON) * 0.5;
  const cornerScales = () => 0.78 + (rand() * 0.44);
  const corners = [
    new THREE.Vector3(-halfWidth * cornerScales(), -halfHeight * cornerScales(), -halfDepth * cornerScales()),
    new THREE.Vector3(halfWidth * cornerScales(), -halfHeight * cornerScales(), -halfDepth * cornerScales()),
    new THREE.Vector3(halfWidth * cornerScales(), halfHeight * cornerScales(), -halfDepth * cornerScales()),
    new THREE.Vector3(-halfWidth * cornerScales(), halfHeight * cornerScales(), -halfDepth * cornerScales()),
    new THREE.Vector3(-halfWidth * cornerScales(), -halfHeight * cornerScales(), halfDepth * cornerScales()),
    new THREE.Vector3(halfWidth * cornerScales(), -halfHeight * cornerScales(), halfDepth * cornerScales()),
    new THREE.Vector3(halfWidth * cornerScales(), halfHeight * cornerScales(), halfDepth * cornerScales()),
    new THREE.Vector3(-halfWidth * cornerScales(), halfHeight * cornerScales(), halfDepth * cornerScales()),
  ];
  const faces = [
    4, 5, 6, 4, 6, 7,
    0, 2, 1, 0, 3, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
    3, 7, 6, 3, 6, 2,
    0, 1, 5, 0, 5, 4,
  ];
  const positions = new Float32Array(faces.length * 3);

  faces.forEach((cornerIndex, index) => {
    const corner = corners[cornerIndex]!;
    positions[(index * 3)] = corner.x;
    positions[(index * 3) + 1] = corner.y;
    positions[(index * 3) + 2] = corner.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCrackSegmentMesh(
  start: THREE.Vector3,
  end: THREE.Vector3,
  outwardNormal: THREE.Vector3,
  material: THREE.Material,
  grooveWidth: number,
  grooveDepth: number,
  name: string,
): THREE.Mesh | null {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < GEOMETRY_EPSILON) return null;
  direction.normalize();

  const widthAxis = new THREE.Vector3().crossVectors(outwardNormal, direction);
  if (widthAxis.lengthSq() < GEOMETRY_EPSILON) return null;
  widthAxis.normalize();

  const geometry = new THREE.BoxGeometry(length, grooveWidth, grooveDepth);
  const mesh = new THREE.Mesh(geometry, material);
  const rotation = new THREE.Matrix4().makeBasis(direction, widthAxis, outwardNormal);
  mesh.quaternion.setFromRotationMatrix(rotation);
  mesh.position.copy(start).lerp(end, 0.5).addScaledVector(outwardNormal, -grooveDepth * 0.5);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
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

/** Build same-material masonry debris piles from the wall blocks removed by ruin. */
export function buildRubbleFromLostBlocks(
  wall: WallCourseModel,
  result: RuinateResult,
  placementLookup: BlockPlacementLookup,
  material: THREE.Material,
  options: RubbleOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rubble';

  const normalized = normalizeWall(wall);
  const spans = collectCollapsedSpans(wall, result, normalized);
  const survivingVolumeFraction = clamp01(
    options.survivingVolumeFraction ?? DEFAULT_RUBBLE_SURVIVING_VOLUME_FRACTION,
  );
  const chunkTarget = Math.max(
    1,
    Math.round(finiteOr(options.chunksPerPile ?? DEFAULT_RUBBLE_CHUNKS_PER_PILE, DEFAULT_RUBBLE_CHUNKS_PER_PILE)),
  );
  if (spans.length === 0 || survivingVolumeFraction <= GEOMETRY_EPSILON) {
    return group;
  }

  for (const span of spans) {
    const pileRand = mulberry32(mixSeed((options.seed >>> 0), RUBBLE_STREAM_SALT ^ spanSalt(span.start, span.end)));
    const removedPlacements = span.removedBlocks.map(block => normalizePlacement(block, placementLookup));
    const anchorPlacements = (span.lowestRemovedBlocks.length > 0 ? span.lowestRemovedBlocks : span.removedBlocks)
      .map(block => normalizePlacement(block, placementLookup));
    const totalLostVolume = removedPlacements.reduce(
      (sum, placement) => sum + (placement.width * placement.height * placement.depth),
      0,
    );
    const visibleVolume = totalLostVolume * survivingVolumeFraction;
    if (visibleVolume <= GEOMETRY_EPSILON || anchorPlacements.length === 0) continue;

    const averageWidth = anchorPlacements.reduce((sum, placement) => sum + placement.width, 0) / anchorPlacements.length;
    const averageHeight = anchorPlacements.reduce((sum, placement) => sum + placement.height, 0) / anchorPlacements.length;
    const averageDepth = anchorPlacements.reduce((sum, placement) => sum + placement.depth, 0) / anchorPlacements.length;
    const averageNormal = averageVectors(anchorPlacements.map(placement => placement.outwardNormal), new THREE.Vector3(0, 0, 1));
    if (averageNormal.lengthSq() < GEOMETRY_EPSILON) {
      averageNormal.set(0, 0, 1);
    } else {
      averageNormal.normalize();
    }
    const tangent = wallTangentFromNormal(averageNormal);
    const baseFoot = averageVectors(
      anchorPlacements.map(placement => placement.center.clone()
        .addScaledVector(placement.outwardNormal, placement.depth * 0.5)
        .addScaledVector(WORLD_UP, -placement.height * 0.5)),
    ).addScaledVector(averageNormal, averageDepth * 0.05);
    const pileGroup = new THREE.Group();
    pileGroup.name = `rubble-pile-span-${span.start}-${span.end}`;
    pileGroup.position.copy(baseFoot);

    const chunkCount = Math.max(1, Math.round(chunkTarget * (0.8 + (pileRand() * 0.45))));
    const weights = Array.from({ length: chunkCount }, () => 0.6 + pileRand());
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const spanWidth = Math.max(averageWidth, ((span.end - span.start) + 1) * averageWidth * 0.65);

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      const chunkVolume = visibleVolume * (weights[chunkIndex]! / totalWeight);
      const baseExtent = Math.cbrt(chunkVolume);
      const chunkWidth = Math.min(
        averageWidth * 0.95,
        Math.max(averageWidth * 0.18, baseExtent * (0.75 + (pileRand() * 0.55))),
      );
      const chunkHeight = Math.min(
        averageHeight * 0.9,
        Math.max(averageHeight * 0.18, baseExtent * (0.55 + (pileRand() * 0.45))),
      );
      const chunkDepth = Math.min(
        averageDepth * 0.95,
        Math.max(averageDepth * 0.18, baseExtent * (0.65 + (pileRand() * 0.4))),
      );
      const geometry = createAngularRubbleGeometry(chunkWidth, chunkHeight, chunkDepth, pileRand);
      const mesh = new THREE.Mesh(geometry, material);
      const lateralRatio = chunkCount === 1 ? 0 : ((chunkIndex / (chunkCount - 1)) - 0.5);
      const lateralOffset = (lateralRatio * spanWidth * 0.55) + ((pileRand() - 0.5) * averageWidth * 0.18);
      const verticalOffset = (chunkHeight * 0.5) + (pileRand() * averageHeight * 0.12);
      const outwardOffset = (pileRand() - 0.25) * averageDepth * 0.18;

      mesh.name = `rubble-chunk-span-${span.start}-${span.end}-${chunkIndex}`;
      mesh.position.copy(
        tangent.clone().multiplyScalar(lateralOffset)
          .add(averageNormal.clone().multiplyScalar(outwardOffset))
          .add(WORLD_UP.clone().multiplyScalar(verticalOffset)),
      );
      mesh.rotation.set(
        (pileRand() - 0.5) * 0.55,
        pileRand() * Math.PI * 2,
        (pileRand() - 0.5) * 0.35,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pileGroup.add(mesh);
    }

    group.add(pileGroup);
  }

  return group;
}

/** Build a seeded partial row of exposed rafters with deterministic deletion. */
export function buildRafterRemnants(
  rafterCount: number,
  spacing: number,
  material: THREE.Material,
  options: RafterRemnantOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rafter-remnants';

  const normalizedRafterCount = Math.max(0, Math.floor(finiteOr(rafterCount, 0)));
  const clampedSurvivalRate = clamp01(options.survivalRate ?? DEFAULT_RAFTER_SURVIVAL_RATE);
  const targetCount = Math.min(
    normalizedRafterCount,
    Math.max(0, Math.round(normalizedRafterCount * clampedSurvivalRate)),
  );
  if (normalizedRafterCount === 0 || targetCount === 0) return group;

  const geometry = new THREE.BoxGeometry(
    positiveOrMinimum(options.crossSection?.width ?? DEFAULT_RAFTER_WIDTH, MIN_RAFTER_CROSS_SECTION),
    positiveOrMinimum(options.crossSection?.height ?? DEFAULT_RAFTER_HEIGHT, MIN_RAFTER_CROSS_SECTION),
    positiveOrMinimum(options.rafterLength, MIN_RAFTER_LENGTH),
  );
  const height = positiveOrMinimum(options.crossSection?.height ?? DEFAULT_RAFTER_HEIGHT, MIN_RAFTER_CROSS_SECTION);
  const spacingValue = finiteOr(spacing, 0);
  const rand = mulberry32(mixSeed((options.seed >>> 0), RAFTER_STREAM_SALT));
  const keptIndices = new Set(
    Array.from({ length: normalizedRafterCount }, (_unused, index) => ({ index, roll: rand() }))
      .sort((left, right) => left.roll - right.roll || left.index - right.index)
      .slice(0, targetCount)
      .map(entry => entry.index),
  );

  for (let index = 0; index < normalizedRafterCount; index++) {
    if (!keptIndices.has(index)) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `rafter-${index}`;
    mesh.position.set(spacingValue * index, height * 0.5, 0);
    mesh.rotation.x = (rand() - 0.5) * 0.12;
    mesh.rotation.z = (rand() - 0.5) * 0.08;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

/** Build future vegetation hook metadata on real break-line block edges. */
export function buildIvyAttachmentPoints(
  wall: WallCourseModel,
  result: RuinateResult,
  placementLookup: BlockPlacementLookup,
  options: { seed: number; density?: number },
): VegetationHook[] {
  const normalized = normalizeWall(wall);
  const spans = collectCollapsedSpans(wall, result, normalized);
  const density = clamp01(options.density ?? DEFAULT_IVY_DENSITY);
  if (spans.length === 0 || density <= 0) return [];

  const hooks: VegetationHook[] = [];
  for (const span of spans) {
    const spanRand = mulberry32(mixSeed((options.seed >>> 0), IVY_STREAM_SALT ^ spanSalt(span.start, span.end)));
    const candidates: VegetationHook[] = [];

    for (let index = span.start; index <= span.end; index++) {
      const breakHeight = result.breakHeightByColumn[index]!;
      if (breakHeight < 0 || breakHeight >= wall.numCourses - 1) continue;

      const block = normalized.blockGrid[breakHeight]![index]!;
      const placement = normalizePlacement(block, placementLookup);
      const normal = placement.outwardNormal.clone();
      const tangent = wallTangentFromNormal(normal);
      const leftHeight = index > 0 ? result.breakHeightByColumn[index - 1]! : breakHeight;
      const rightHeight = index < wall.blocksPerCourse - 1 ? result.breakHeightByColumn[index + 1]! : breakHeight;
      let lateralSign = spanRand() < 0.5 ? -1 : 1;
      if (leftHeight < breakHeight && rightHeight >= breakHeight) lateralSign = -1;
      if (rightHeight < breakHeight && leftHeight >= breakHeight) lateralSign = 1;

      candidates.push({
        id: `ivy-hook-c${breakHeight}-i${index}`,
        position: placement.center.clone()
          .addScaledVector(normal, placement.depth * 0.52)
          .addScaledVector(WORLD_UP, placement.height * 0.28)
          .addScaledVector(tangent, lateralSign * placement.width * (0.12 + (spanRand() * 0.12))),
        normal,
        course: breakHeight,
        index,
      });
    }

    const selected = candidates.filter(() => spanRand() <= density);
    if (selected.length === 0 && candidates.length > 0) {
      selected.push(candidates[Math.min(candidates.length - 1, Math.floor(spanRand() * candidates.length))]!);
    }
    hooks.push(...selected);
  }

  return hooks;
}

/** Build jagged groove geometry along surviving wall faces near break lines. */
export function buildCrackCurves(
  wall: WallCourseModel,
  result: RuinateResult,
  placementLookup: BlockPlacementLookup,
  material: THREE.Material,
  options: CrackOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'crack-curves';

  const normalized = normalizeWall(wall);
  const spans = collectCollapsedSpans(wall, result, normalized);
  if (spans.length === 0) return group;

  const grooveWidth = positiveOrMinimum(
    options.grooveWidth ?? DEFAULT_CRACK_GROOVE_WIDTH,
    MIN_CRACK_GROOVE_WIDTH,
  ) + GEOMETRY_EPSILON;
  const grooveDepth = positiveOrMinimum(
    options.grooveDepth ?? DEFAULT_CRACK_GROOVE_DEPTH,
    MIN_CRACK_GROOVE_DEPTH,
  ) + GEOMETRY_EPSILON;

  for (const span of spans) {
    const eligibleColumns = Array.from({ length: ((span.end - span.start) + 1) }, (_unused, offset) => {
      const index = span.start + offset;
      return { index, breakHeight: result.breakHeightByColumn[index]! };
    }).filter(candidate => candidate.breakHeight >= 0 && candidate.breakHeight < wall.numCourses - 1);
    if (eligibleColumns.length === 0) continue;

    const spanCenter = (span.start + span.end) * 0.5;
    const anchorColumn = eligibleColumns.reduce((best, candidate) => {
      if (candidate.breakHeight !== best.breakHeight) {
        return candidate.breakHeight > best.breakHeight ? candidate : best;
      }
      return Math.abs(candidate.index - spanCenter) < Math.abs(best.index - spanCenter) ? candidate : best;
    });
    const anchorBlock = normalized.blockGrid[anchorColumn.breakHeight]![anchorColumn.index]!;
    const placement = normalizePlacement(anchorBlock, placementLookup);
    const basePlacement = normalizePlacement(normalized.blockGrid[0]![anchorColumn.index]!, placementLookup);
    const normal = placement.outwardNormal.clone();
    const tangent = wallTangentFromNormal(normal);
    const crackRand = mulberry32(mixSeed((options.seed >>> 0), CRACK_STREAM_SALT ^ spanSalt(span.start, span.end)));
    const crackGroup = new THREE.Group();
    crackGroup.name = `crack-span-${span.start}-${span.end}`;

    const points: THREE.Vector3[] = [
      placement.center.clone()
        .addScaledVector(normal, placement.depth * 0.501)
        .addScaledVector(WORLD_UP, placement.height * 0.32)
        .addScaledVector(tangent, (anchorColumn.index - spanCenter) * placement.width * 0.12),
    ];
    const minPointY = (basePlacement.center.y - (basePlacement.height * 0.5)) + (grooveWidth * 0.55);
    const availableDrop = Math.max(0, points[0]!.y - minPointY);
    if (availableDrop <= GEOMETRY_EPSILON) continue;
    const minimumSegmentDrop = Math.max(placement.height * 0.12, grooveWidth * 0.75);
    const segmentCount = Math.max(
      1,
      Math.min(
        3 + Math.floor(crackRand() * 3),
        Math.max(1, Math.floor((availableDrop + GEOMETRY_EPSILON) / minimumSegmentDrop)),
      ),
    );
    let lateralSign = crackRand() < 0.5 ? -1 : 1;

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
      const lastPoint = points[points.length - 1]!;
      const remainingSegments = segmentCount - segmentIndex;
      const remainingDrop = Math.max(0, lastPoint.y - minPointY);
      if (remainingDrop <= GEOMETRY_EPSILON) break;

      const desiredDrop = placement.height * (0.28 + (crackRand() * 0.28));
      const reservedForTail = minimumSegmentDrop * Math.max(0, remainingSegments - 1);
      const maxDropThisStep = Math.max(minimumSegmentDrop, remainingDrop - reservedForTail);
      const verticalDrop = remainingSegments === 1
        ? remainingDrop
        : Math.min(desiredDrop, maxDropThisStep);
      const nextPoint = lastPoint.clone()
        .addScaledVector(WORLD_UP, -verticalDrop)
        .addScaledVector(tangent, placement.width * (0.08 + (crackRand() * 0.18)) * lateralSign);
      nextPoint.y = Math.max(minPointY, nextPoint.y);
      points.push(nextPoint);
      lateralSign *= -1;
      if (crackRand() < 0.25) lateralSign *= -1;
    }

    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
      const segment = createCrackSegmentMesh(
        points[segmentIndex]!,
        points[segmentIndex + 1]!,
        normal,
        material,
        grooveWidth,
        grooveDepth,
        `crack-segment-span-${span.start}-${span.end}-${segmentIndex}`,
      );
      if (segment) crackGroup.add(segment);
    }

    if (crackGroup.children.length > 0) {
      crackGroup.userData.pathPoints = points.map(point => point.toArray());
      group.add(crackGroup);
    }
  }

  return group;
}
