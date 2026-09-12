import { rectangleFaces, type OctagonFace } from '../StoneTowerShape';

/**
 * MassComposer.ts — shared kit module for multi-mass building composition
 * (docs/superpowers/specs/2026-09-04-modular-building-kit-doctrine.md's
 * Tier 2 table: "main block + cross wing + porch + dormers + chimney,
 * L/T/cruciform plans. Fixes the 'single box' reading at the massing
 * level."). Scoped here to the sub-case every current design spec
 * actually asks for -- one main rectangular mass plus one flush-attached
 * rectangular wing, either offset toward a corner (L-plan) or centered
 * (T-plan) -- rather than the full porch/dormer/cruciform generality the
 * doctrine table names; extend this file (not fork it) if a future race
 * needs those.
 */

export type WingSide = 'left' | 'right' | 'front' | 'back';

export interface WingSpec {
  width: number;
  depth: number;
  height: number;
  /** Which edge of the main mass the wing projects flush from. */
  side: WingSide;
  /**
   * Where along that edge the wing is centered, from 0 (one corner) to 1
   * (the other corner). Defaults to 0.5 (centered -- a T-plan). Pass an
   * offset value (e.g. 0.15/0.85) for an L-plan wing pushed toward one
   * corner.
   */
  alongFraction?: number;
}

export interface ComposeMassesOptions {
  mainWidth: number;
  mainDepth: number;
  mainHeight: number;
  wing: WingSpec;
}

export interface MassSpec {
  name: 'main' | 'wing';
  /** Footprint corner points, already translated into the shared
   * building-local coordinate space -- pass straight through to
   * buildWallSurfaceBlocks()'s `facesOverride` or buildFloorCap()'s /
   * buildQuoins()'s `pointsOverride`. */
  points: [number, number][];
  faces: OctagonFace[];
  height: number;
  /** This mass's own footprint center, in the same shared coordinate
   * space -- useful for placing openings/roofs/props relative to a wing
   * that isn't centered on the origin. */
  center: [number, number];
}

export interface ComposedMasses {
  main: MassSpec;
  wing: MassSpec;
}

function translatedRectangle(halfW: number, halfD: number, centerX: number, centerZ: number): [number, number][] {
  return [
    [halfW + centerX, halfD + centerZ],
    [halfW + centerX, -halfD + centerZ],
    [-halfW + centerX, -halfD + centerZ],
    [-halfW + centerX, halfD + centerZ],
  ];
}

function translatedRectangleFaces(halfW: number, halfD: number, centerX: number, centerZ: number): OctagonFace[] {
  // rectangleFaces() already returns points+normalAngle for an
  // origin-centered rectangle; normalAngle is a direction (unaffected by
  // translation), so only the corner points need offsetting.
  return rectangleFaces(halfW, halfD).map(face => ({
    a: [face.a[0] + centerX, face.a[1] + centerZ],
    b: [face.b[0] + centerX, face.b[1] + centerZ],
    normalAngle: face.normalAngle,
  }));
}

/**
 * Composes a main rectangular mass (centered on the origin) with one
 * rectangular wing flush-attached to one of its four edges, offset along
 * that edge by `wing.alongFraction` (default 0.5 = centered/T-plan;
 * an offset value gives an L-plan wing pushed toward one corner).
 */
export function composeMainAndWing(options: ComposeMassesOptions): ComposedMasses {
  const mainHalfW = options.mainWidth / 2;
  const mainHalfD = options.mainDepth / 2;
  const wingHalfW = options.wing.width / 2;
  const wingHalfD = options.wing.depth / 2;
  const alongFraction = options.wing.alongFraction ?? 0.5;

  const main: MassSpec = {
    name: 'main',
    points: translatedRectangle(mainHalfW, mainHalfD, 0, 0),
    faces: translatedRectangleFaces(mainHalfW, mainHalfD, 0, 0),
    height: options.mainHeight,
    center: [0, 0],
  };

  let wingCenterX: number;
  let wingCenterZ: number;
  switch (options.wing.side) {
    case 'right':
      wingCenterX = mainHalfW + wingHalfW;
      wingCenterZ = lerp(-mainHalfD + wingHalfD, mainHalfD - wingHalfD, alongFraction);
      break;
    case 'left':
      wingCenterX = -(mainHalfW + wingHalfW);
      wingCenterZ = lerp(-mainHalfD + wingHalfD, mainHalfD - wingHalfD, alongFraction);
      break;
    case 'front':
      wingCenterZ = mainHalfD + wingHalfD;
      wingCenterX = lerp(-mainHalfW + wingHalfW, mainHalfW - wingHalfW, alongFraction);
      break;
    case 'back':
      wingCenterZ = -(mainHalfD + wingHalfD);
      wingCenterX = lerp(-mainHalfW + wingHalfW, mainHalfW - wingHalfW, alongFraction);
      break;
  }

  const wing: MassSpec = {
    name: 'wing',
    points: translatedRectangle(wingHalfW, wingHalfD, wingCenterX, wingCenterZ),
    faces: translatedRectangleFaces(wingHalfW, wingHalfD, wingCenterX, wingCenterZ),
    height: options.wing.height,
    center: [wingCenterX, wingCenterZ],
  };

  return { main, wing };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
