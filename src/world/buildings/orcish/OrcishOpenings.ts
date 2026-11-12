import * as THREE from 'three';
import {
  buildDoorOpening,
  buildWindowOpening,
  type DivisionStyle,
  type OpeningShape,
} from '../kit/OpeningParts';

/**
 * OrcishOpenings.ts — rough Romanesque/tusk-arch door/window presets over
 * the shared `OpeningParts.ts` five-piece opening primitives (doctrine's
 * FIVE-PIECE OPENING MINIMUM: recess, proud surround, sill, mullion,
 * set-back opaque glazing). Mirrors `DwarvenOpenings.ts`'s translation
 * pattern: this module does not duplicate opening geometry, it only
 * converts the design spec's `archRatio ~ 0.5` ("squat Romanesque/tusk
 * arch") language into `straightHeight`/`pointHeight`/`frameWidth`/
 * `recessDepth`/`frameProud` inputs for `buildWindowOpening()`/
 * `buildDoorOpening()`.
 *
 * `archRatio` is `pointHeight / (width / 2)` -- the arch's rise as a
 * fraction of its own half-width, matching the dwarven module's
 * convention so both races read as "squat", never a tall elven lancet.
 */
export interface OrcishOpeningPalette {
  timber: THREE.Material;
  glazing: THREE.Material;
  trim: THREE.Material;
  recess?: THREE.Material;
  forgeEmissive?: THREE.Material;
}

export interface OrcishWindowOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: OrcishOpeningPalette;
  shape?: OpeningShape;
  archRatio?: number;
  divisionStyle?: DivisionStyle;
}

export interface OrcishDoorOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: OrcishOpeningPalette;
  archRatio?: number;
}

const MIN_ARCH_RATIO = 0.42;
const MAX_ARCH_RATIO = 0.58;
const DEFAULT_ARCH_RATIO = 0.5; // design spec: "rough Romanesque arches (archRatio ~ 0.5)"

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function archRatioOf(opts: { archRatio?: number }): number {
  return clamp(opts.archRatio ?? DEFAULT_ARCH_RATIO, MIN_ARCH_RATIO, MAX_ARCH_RATIO);
}

export function buildOrcishWindow(opts: OrcishWindowOptions): THREE.Group {
  const shape: OpeningShape = opts.shape ?? 'arch';
  const archRatio = archRatioOf(opts);
  const pointHeight = shape === 'round' ? 0 : Math.min(opts.height * 0.5, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.5, opts.height - pointHeight);
  const frameWidth = Math.max(0.05, opts.width * 0.18);
  const recessDepth = Math.max(0.05, opts.width * 0.22);
  const frameProud = Math.max(0.02, opts.width * 0.07); // doctrine "lash/frame/surround +0.04"-ish scale

  return buildWindowOpening({
    width: opts.width,
    straightHeight,
    pointHeight,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.trim,
    glazingMaterial: opts.palette.glazing,
    recessMaterial: opts.palette.recess,
    openingShape: shape,
    divisionStyle: opts.divisionStyle ?? 'cross', // design spec: "windows get... a bar or crossed bone"
  });
}

export function buildOrcishDoor(opts: OrcishDoorOptions): THREE.Group {
  const archRatio = archRatioOf(opts);
  const pointHeight = Math.min(opts.height * 0.35, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.65, opts.height - pointHeight);
  const frameWidth = Math.max(0.06, opts.width * 0.16);
  const recessDepth = Math.max(0.08, opts.width * 0.2);
  const frameProud = Math.max(0.03, opts.width * 0.07);

  return buildDoorOpening({
    width: opts.width,
    straightHeight,
    pointHeight,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.trim,
    recessMaterial: opts.palette.recess ?? opts.palette.glazing,
    woodMaterial: opts.palette.timber,
  });
}

export interface OrcishForgeMouthOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: OrcishOpeningPalette;
  archRatio?: number;
}

/**
 * The blacksmith's large tusk-arch forge opening. Reuses the standard
 * five-piece window/arch recess for the tusk-stone piers, surround, sill,
 * and crossed-bar division, but drives the "glazing" slot with
 * `palette.forgeEmissive` (a glowing throat) when supplied, falling back
 * to plain dark glazing (design spec: "orange forge emissive plane set
 * inside the hearth", blacksmith heat-state axis).
 */
export function buildOrcishForgeMouth(opts: OrcishForgeMouthOptions): THREE.Group {
  const throatMaterial = opts.palette.forgeEmissive ?? opts.palette.glazing;
  return buildOrcishWindow({
    width: opts.width,
    height: opts.height,
    wallZ: opts.wallZ,
    palette: { ...opts.palette, glazing: throatMaterial },
    shape: 'arch',
    archRatio: opts.archRatio ?? 0.5,
    divisionStyle: 'cross',
  });
}
