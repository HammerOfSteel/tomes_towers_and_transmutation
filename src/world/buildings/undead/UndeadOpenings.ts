import * as THREE from 'three';
import {
  buildDoorOpening,
  buildWindowOpening,
  type DivisionStyle,
  type OpeningShape,
} from '../kit/OpeningParts';

/**
 * UndeadOpenings.ts — tomb/arcade/ruin opening presets over the shared
 * `OpeningParts.ts` five-piece opening primitives (design spec
 * `2026-09-04-undead-buildings-design.md`: "Undead openings are tomb/
 * arcade/ruin openings" using rounder, more equilateral arches than
 * vampire's tall lancets -- `archRatio` clamped to [0.85, 1.15], centred
 * on 1.0 (equilateral), vs. vampire's [1.4, 1.7]).
 *
 * Undead adds an extra "grille-bars" child group (many thin vertical iron
 * bars, doctrine-compliant since it sits ON TOP of the mandatory five-piece
 * opening rather than replacing any of its parts) for the "barred lantern
 * window"/"iron-grille arch door" facade modules the design spec calls for
 * — deliberately NOT reusing `Shutter.ts` (closed/maintained shutters are
 * vampire's language, not undead's exposed-decay one).
 */
export interface UndeadOpeningPalette {
  stone: THREE.Material;
  glazing: THREE.Material;
  wood: THREE.Material;
  iron: THREE.Material;
  recess?: THREE.Material;
}

export interface UndeadWindowOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadOpeningPalette;
  shape?: OpeningShape;
  archRatio?: number;
  divisionStyle?: DivisionStyle;
}

export interface UndeadGrilleWindowOptions extends UndeadWindowOptions {
  /** Number of thin vertical grille bars across the aperture. Default 5. */
  barCount?: number;
}

export interface UndeadDoorOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadOpeningPalette;
  archRatio?: number;
}

export interface UndeadOculusOptions {
  diameter: number;
  wallZ: number;
  palette: UndeadOpeningPalette;
  divisionStyle?: DivisionStyle;
}

const MIN_ARCH_RATIO = 0.85;
const MAX_ARCH_RATIO = 1.15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function archRatioOf(opts: { archRatio?: number }): number {
  return clamp(opts.archRatio ?? 1.0, MIN_ARCH_RATIO, MAX_ARCH_RATIO);
}

export function buildUndeadWindow(opts: UndeadWindowOptions): THREE.Group {
  const shape: OpeningShape = opts.shape ?? 'arch';
  const archRatio = archRatioOf(opts);
  const pointHeight = shape === 'round' ? 0 : Math.min(opts.height * 0.5, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.5, opts.height - pointHeight);
  const frameWidth = Math.max(0.05, opts.width * 0.15);
  const recessDepth = Math.max(0.07, opts.width * 0.22);
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
 * Adds a bank of thin vertical iron grille bars across the aperture, as an
 * additional named child (`grille-bars`) at the division depth layer --
 * the "iron-grille" undead window/door language (barred lantern windows,
 * crypt door grilles) called for throughout the design spec's opening
 * schedules, distinct from vampire's closed shutter-pair convention.
 */
function buildGrilleBars(width: number, height: number, wallZ: number, barCount: number, material: THREE.Material): THREE.Group {
  const bars = new THREE.Group();
  bars.name = 'grille-bars';
  const clearWidth = width * 0.82;
  const barThickness = Math.max(0.012, width * 0.018);
  const barDepth = 0.014;
  const count = Math.max(3, barCount);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(barThickness, height * 0.88, barDepth), material);
    bar.name = `grille-bar-${i}`;
    bar.position.set(-clearWidth / 2 + t * clearWidth, height * 0.44, wallZ - 0.09);
    bar.castShadow = bar.receiveShadow = true;
    bars.add(bar);
  }
  return bars;
}

/**
 * The primary undead barred window preset: a real tomb/lantern opening
 * with a named `opening` child (the five-piece window) plus a named
 * `grille-bars` child. Used for the "barred lantern window" facade module.
 */
export function buildUndeadGrilleWindow(opts: UndeadGrilleWindowOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'undead-grille-window';

  const opening = buildUndeadWindow(opts);
  opening.name = 'opening';
  group.add(opening);

  group.add(buildGrilleBars(opts.width, opts.height, opts.wallZ, opts.barCount ?? 5, opts.palette.iron));
  return group;
}

export function buildUndeadDoor(opts: UndeadDoorOptions): THREE.Group {
  const archRatio = archRatioOf(opts);
  const pointHeight = Math.min(opts.height * 0.3, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.7, opts.height - pointHeight);
  const frameWidth = Math.max(0.06, opts.width * 0.14);
  const recessDepth = Math.max(0.09, opts.width * 0.2);
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

/**
 * The "iron-grille crypt door" preset: a real door assembly (recess,
 * surround, threshold, planked leaf) plus a `grille-bars` overlay so the
 * door reads as a barred crypt gate rather than a plain plank door.
 */
export function buildUndeadGrilleDoor(opts: UndeadDoorOptions & { barCount?: number }): THREE.Group {
  const group = new THREE.Group();
  group.name = 'undead-grille-door';

  const opening = buildUndeadDoor(opts);
  opening.name = 'opening';
  group.add(opening);

  group.add(buildGrilleBars(opts.width, opts.height, opts.wallZ, opts.barCount ?? 7, opts.palette.iron));
  return group;
}

export function buildUndeadOculus(opts: UndeadOculusOptions): THREE.Group {
  return buildUndeadWindow({
    width: opts.diameter,
    height: opts.diameter,
    wallZ: opts.wallZ,
    palette: opts.palette,
    shape: 'round',
    divisionStyle: opts.divisionStyle ?? 'cross',
  });
}

/**
 * A "sealed slab" opening: uses the same five-piece opening machinery
 * (real recess/surround/sill/division geometry, per the doctrine's
 * no-back-geometry rule) but with the glazing material swapped to the
 * same stone material as the surround, so the aperture reads as a
 * bricked-up/sealed tomb slab rather than an open or glazed window --
 * still real recessed geometry, never a deleted face.
 */
export function buildUndeadSealedSlab(opts: UndeadWindowOptions): THREE.Group {
  return buildUndeadWindow({
    ...opts,
    palette: { ...opts.palette, glazing: opts.palette.stone },
  });
}
