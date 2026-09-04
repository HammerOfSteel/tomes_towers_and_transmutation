/**
 * FacadeGrammar.ts — deterministic split-grammar bay layout for fixed-size
 * facade modules. This stays pure-logic on purpose: it outputs bay placement
 * data only, so later geometry builders can render fixed modules without ever
 * stretching their mouldings to match arbitrary facade widths.
 */

import { mulberry32 } from '../../../core/prng';

const EPSILON = 1e-9;
const CANDIDATE_TAG = 0x4641_4341; // 'FACA'
const SPECIAL_TAG = 0x5350_4543; // 'SPEC'

export interface WeightedModuleCandidate {
  id: string;
  weight?: number;
}

export interface FixedSegmentSpec {
  kind: 'fixed';
  id: string;
  width: number;
}

export interface FloatSegmentSpec {
  kind: 'float';
  id?: string;
}

export interface RepeatSegmentSpec {
  kind: 'repeat';
  width: number;
  min?: number;
  max?: number;
  id?: string;
  weight?: number;
  candidates?: readonly WeightedModuleCandidate[];
}

export type SegmentSpec = FixedSegmentSpec | RepeatSegmentSpec | FloatSegmentSpec;
export type BayKind = SegmentSpec['kind'];

export interface FacadeBay {
  id: string;
  kind: BayKind;
  x: number;
  width: number;
  special?: boolean;
}

export interface BayLayout {
  totalWidth: number;
  bays: FacadeBay[];
}

interface NormalizedRepeatSegmentSpec {
  kind: 'repeat';
  width: number;
  min: number;
  max: number;
  candidates: readonly WeightedModuleCandidate[];
}

export function layoutFacade(totalWidth: number, spec: readonly SegmentSpec[], seed: number): BayLayout {
  assertFiniteNonNegative(totalWidth, 'totalWidth');
  if (spec.length === 0) {
    return { totalWidth, bays: [] };
  }

  const normalizedSpecs = spec.map(normalizeSegment);
  const minimumRequiredWidth = normalizedSpecs.reduce((sum, segment) => {
    if (segment.kind === 'fixed') return sum + segment.width;
    if (segment.kind === 'repeat') return sum + segment.width * segment.min;
    return sum;
  }, 0);

  if (minimumRequiredWidth > totalWidth + EPSILON) {
    throw new RangeError(
      `Facade minimum required facade width ${minimumRequiredWidth} exceeds total width ${totalWidth}.`,
    );
  }

  const repeatCounts = allocateRepeatCounts(totalWidth, normalizedSpecs);
  const placedWithoutFloats = normalizedSpecs.reduce((sum, segment, index) => {
    if (segment.kind === 'fixed') return sum + segment.width;
    if (segment.kind === 'repeat') return sum + repeatCounts[index]! * segment.width;
    return sum;
  }, 0);
  const leftoverWidth = clampNearZero(totalWidth - placedWithoutFloats);
  const floatIndexes = normalizedSpecs.flatMap((segment, index) => (segment.kind === 'float' ? [index] : []));

  if (leftoverWidth > EPSILON && floatIndexes.length === 0) {
    throw new RangeError('Facade layout requires at least one float segment to absorb leftover width.');
  }

  const floatWidths = distributeFloatWidth(leftoverWidth, floatIndexes.length);
  const candidateRand = mulberry32((seed ^ CANDIDATE_TAG) >>> 0);
  const specialRand = mulberry32((seed ^ SPECIAL_TAG) >>> 0);
  const totalRepeatBays = repeatCounts.reduce((sum, count) => sum + count, 0);
  const specialRepeatOrdinal = totalRepeatBays > 0 ? Math.floor(specialRand() * totalRepeatBays) : -1;

  const bays: FacadeBay[] = [];
  let x = 0;
  let repeatOrdinal = 0;
  let floatOrdinal = 0;

  for (let index = 0; index < normalizedSpecs.length; index++) {
    const segment = normalizedSpecs[index]!;

    if (segment.kind === 'fixed') {
      bays.push({ id: segment.id, kind: 'fixed', x, width: segment.width });
      x += segment.width;
      continue;
    }

    if (segment.kind === 'repeat') {
      const repeatCount = repeatCounts[index] ?? 0;
      for (let instance = 0; instance < repeatCount; instance++) {
        const candidate = pickWeightedCandidate(segment.candidates, candidateRand);
        bays.push({
          id: candidate.id,
          kind: 'repeat',
          x,
          width: segment.width,
          special: repeatOrdinal === specialRepeatOrdinal || undefined,
        });
        x += segment.width;
        repeatOrdinal++;
      }
      continue;
    }

    const width = floatWidths[floatOrdinal] ?? 0;
    bays.push({
      id: segment.id ?? (floatWidths.length === 1 ? 'filler' : `filler-${floatOrdinal}`),
      kind: 'float',
      x,
      width,
    });
    x += width;
    floatOrdinal++;
  }

  const finalWidth = endOf(bays);
  if (Math.abs(finalWidth - totalWidth) > layoutTolerance(totalWidth, bays.length)) {
    throw new RangeError(`Facade layout ended at ${finalWidth} instead of total width ${totalWidth}.`);
  }

  return { totalWidth, bays };
}

function normalizeSegment(segment: SegmentSpec): FixedSegmentSpec | FloatSegmentSpec | NormalizedRepeatSegmentSpec {
  if (segment.kind === 'fixed') {
    assertFinitePositive(segment.width, `fixed segment "${segment.id}" width`);
    return segment;
  }

  if (segment.kind === 'float') {
    return segment;
  }

  assertFinitePositive(segment.width, 'repeat segment width');
  const min = segment.min ?? 0;
  const max = segment.max ?? Number.POSITIVE_INFINITY;
  assertWholeNonNegative(min, 'repeat segment min');
  if (Number.isFinite(max)) {
    assertWholeNonNegative(max, 'repeat segment max');
  }
  if (max < min) {
    throw new RangeError(`Repeat segment max ${max} cannot be less than min ${min}.`);
  }

  const candidates = normalizeCandidates(segment);
  return {
    kind: 'repeat',
    width: segment.width,
    min,
    max,
    candidates,
  };
}

function normalizeCandidates(segment: RepeatSegmentSpec): readonly WeightedModuleCandidate[] {
  if (segment.candidates?.length) {
    validateCandidates(segment.candidates);
    return segment.candidates;
  }

  if (!segment.id) {
    throw new TypeError('Repeat segment requires either an id or at least one weighted candidate.');
  }

  const weight = segment.weight ?? 1;
  validateCandidates([{ id: segment.id, weight }]);
  return [{ id: segment.id, weight }];
}

function validateCandidates(candidates: readonly WeightedModuleCandidate[]): void {
  for (const candidate of candidates) {
    if (!candidate.id) {
      throw new TypeError('Repeat candidates must have a non-empty id.');
    }

    const weight = candidate.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError(`Repeat candidate "${candidate.id}" must have a positive weight.`);
    }
  }
}

function allocateRepeatCounts(totalWidth: number, spec: readonly (FixedSegmentSpec | FloatSegmentSpec | NormalizedRepeatSegmentSpec)[]): number[] {
  const repeatCounts = Array(spec.length).fill(0) as number[];
  let usedWidth = 0;

  for (let index = 0; index < spec.length; index++) {
    const segment = spec[index]!;
    if (segment.kind === 'fixed') {
      usedWidth += segment.width;
      continue;
    }

    if (segment.kind === 'float') {
      continue;
    }

    // Repeat groups are intentionally greedy in declared order: each one takes
    // as many whole fixed-width instances as it can while still reserving the
    // minimum required width for later segments in the grammar.
    const minimumAfter = minimumWidthAfter(spec, index + 1);
    const availableForThisRepeat = totalWidth - usedWidth - minimumAfter;
    const repeatCount = Math.floor((availableForThisRepeat + EPSILON) / segment.width);
    repeatCounts[index] = Math.min(segment.max, Math.max(segment.min, repeatCount));
    usedWidth += repeatCounts[index]! * segment.width;
  }

  return repeatCounts;
}

function minimumWidthAfter(
  spec: readonly (FixedSegmentSpec | FloatSegmentSpec | NormalizedRepeatSegmentSpec)[],
  startIndex: number,
): number {
  return spec.slice(startIndex).reduce((sum, segment) => {
    if (segment.kind === 'fixed') return sum + segment.width;
    if (segment.kind === 'repeat') return sum + segment.width * segment.min;
    return sum;
  }, 0);
}

function distributeFloatWidth(leftoverWidth: number, floatCount: number): number[] {
  if (floatCount === 0) return [];
  const widths: number[] = [];
  let assigned = 0;

  for (let index = 0; index < floatCount; index++) {
    const width = index === floatCount - 1 ? clampNearZero(leftoverWidth - assigned) : leftoverWidth / floatCount;
    widths.push(width);
    assigned += width;
  }

  return widths;
}

function pickWeightedCandidate(candidates: readonly WeightedModuleCandidate[], rand: () => number): WeightedModuleCandidate {
  const totalWeight = candidates.reduce((sum, candidate) => sum + (candidate.weight ?? 1), 0);
  let cursor = rand() * totalWeight;

  for (const candidate of candidates) {
    cursor -= candidate.weight ?? 1;
    if (cursor <= 0) return candidate;
  }

  return candidates[candidates.length - 1]!;
}

function endOf(bays: readonly FacadeBay[]): number {
  const lastBay = bays.at(-1);
  return lastBay ? lastBay.x + lastBay.width : 0;
}

function clampNearZero(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : value;
}

function layoutTolerance(totalWidth: number, bayCount: number): number {
  return Math.max(1e-8, EPSILON * Math.max(1, totalWidth, bayCount));
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number.`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
}

function assertWholeNonNegative(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}
