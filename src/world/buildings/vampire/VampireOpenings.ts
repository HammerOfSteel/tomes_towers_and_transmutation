import * as THREE from 'three';
import {
  buildDoorOpening,
  buildWindowOpening,
  type DivisionStyle,
  type OpeningShape,
} from '../kit/OpeningParts';
import { buildShutterPair, type ShutterState } from '../kit/Shutter';

/**
 * VampireOpenings.ts — tall Gothic-Revival lancet door/window presets over
 * the shared `OpeningParts.ts` five-piece opening primitives, plus the
 * combined "shuttered window" preset that is vampire's signature closed
 * (never broken) fenestration language (design spec: "Windows are CLOSED
 * (shuttered/louvred/barred) rather than broken").
 *
 * `archRatio` here is defined the same way as `DwarvenOpenings.ts`:
 * `pointHeight / (width / 2)`, the arch's rise as a fraction of its own
 * half-width. Vampire's aristocratic lancet character clamps this to
 * [1.4, 1.7] -- tall and pointed, never a dwarven-style shouldered arch.
 */
export interface VampireOpeningPalette {
  stone: THREE.Material;
  glazing: THREE.Material;
  wood: THREE.Material;
  iron?: THREE.Material;
  recess?: THREE.Material;
}

export interface VampireWindowOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: VampireOpeningPalette;
  shape?: OpeningShape;
  archRatio?: number;
  divisionStyle?: DivisionStyle;
}

export interface VampireShutteredWindowOptions extends VampireWindowOptions {
  shutterState?: ShutterState;
  leftShutterState?: ShutterState;
  rightShutterState?: ShutterState;
}

export interface VampireDoorOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: VampireOpeningPalette;
  archRatio?: number;
}

export interface VampireOculusOptions {
  diameter: number;
  wallZ: number;
  palette: VampireOpeningPalette;
  divisionStyle?: DivisionStyle;
}

const MIN_ARCH_RATIO = 1.4;
const MAX_ARCH_RATIO = 1.7;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function archRatioOf(opts: { archRatio?: number }): number {
  return clamp(opts.archRatio ?? 1.55, MIN_ARCH_RATIO, MAX_ARCH_RATIO);
}

export function buildVampireWindow(opts: VampireWindowOptions): THREE.Group {
  const shape: OpeningShape = opts.shape ?? 'arch';
  const archRatio = archRatioOf(opts);
  const pointHeight = shape === 'round' ? 0 : Math.min(opts.height * 0.62, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.38, opts.height - pointHeight);
  const frameWidth = Math.max(0.05, opts.width * 0.14);
  const recessDepth = Math.max(0.06, opts.width * 0.2);
  const frameProud = Math.max(0.025, opts.width * 0.07);

  return buildWindowOpening({
    width: opts.width,
    straightHeight,
    pointHeight,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.stone,
    glazingMaterial: opts.palette.glazing,
    recessMaterial: opts.palette.recess,
    openingShape: shape,
    divisionStyle: opts.divisionStyle ?? 'vertical',
  });
}

/**
 * The primary vampire window preset: a real lancet opening with a closed
 * shutter pair mounted proud of the frame, at the same wall position. The
 * returned group has two named children -- `opening` (the five-piece
 * window) and `shutters` (the `Shutter.ts` leaf pair) -- so callers/tests
 * can address either independently.
 */
export function buildVampireShutteredWindow(opts: VampireShutteredWindowOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vampire-shuttered-window';

  const opening = buildVampireWindow(opts);
  opening.name = 'opening';
  group.add(opening);

  const shutters = buildShutterPair({
    width: opts.width * 1.08,
    height: opts.height * 0.92,
    material: opts.palette.wood,
    hingeMaterial: opts.palette.iron ?? opts.palette.wood,
    state: opts.shutterState ?? 'closed_louvred',
    leftState: opts.leftShutterState,
    rightState: opts.rightShutterState,
    wallZ: opts.wallZ,
  });
  // Kept named 'shutter-pair' (Shutter.ts's own default) rather than
  // renamed to something opaque, so callers/tests can find the shutter
  // assembly either by its exact name or by a `.includes('shutter-pair')`
  // substring check.
  shutters.position.y = opts.height * 0.04;
  group.add(shutters);

  return group;
}

export function buildVampireDoor(opts: VampireDoorOptions): THREE.Group {
  const archRatio = archRatioOf(opts);
  const pointHeight = Math.min(opts.height * 0.42, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.58, opts.height - pointHeight);
  const frameWidth = Math.max(0.06, opts.width * 0.13);
  const recessDepth = Math.max(0.08, opts.width * 0.18);
  const frameProud = Math.max(0.03, opts.width * 0.07);

  return buildDoorOpening({
    width: opts.width,
    straightHeight,
    pointHeight,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.stone,
    recessMaterial: opts.palette.recess ?? opts.palette.glazing,
    woodMaterial: opts.palette.wood,
  });
}

export function buildVampireOculus(opts: VampireOculusOptions): THREE.Group {
  return buildVampireWindow({
    width: opts.diameter,
    height: opts.diameter,
    wallZ: opts.wallZ,
    palette: opts.palette,
    shape: 'round',
    divisionStyle: opts.divisionStyle ?? 'cross',
  });
}
