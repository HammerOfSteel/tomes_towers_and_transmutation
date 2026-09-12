import * as THREE from 'three';
import {
  buildDoorOpening,
  buildWindowOpening,
  type DivisionStyle,
  type OpeningShape,
} from '../kit/OpeningParts';
import { buildLouvredVent } from '../kit/PipeworkVent';

/**
 * DwarvenOpenings.ts — low Romanesque/shouldered-arch and oculus door/window
 * presets over the shared `OpeningParts.ts` five-piece opening primitives.
 * This module does not duplicate opening geometry: it only translates the
 * design spec's `archRatio` language (0.50-0.65, a squat/rounded arch
 * character) plus dwarven proportion defaults into the lower-level
 * `straightHeight`/`pointHeight`/`frameWidth`/`recessDepth`/`frameProud`
 * inputs `buildWindowOpening()`/`buildDoorOpening()` already expect.
 *
 * `archRatio` here is defined as `pointHeight / (width / 2)` — the arch's
 * rise as a fraction of its own half-width, so 0.5 reads as a shallow
 * segmental/shouldered arch and 0.65 reads as a fuller rounded arch, never
 * a tall elven lancet.
 */
export interface DwarvenOpeningPalette {
  stone: THREE.Material;
  glazing: THREE.Material;
  wood: THREE.Material;
  recess?: THREE.Material;
  iron?: THREE.Material;
  forgeEmissive?: THREE.Material;
}

export interface DwarvenWindowOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: DwarvenOpeningPalette;
  shape?: OpeningShape;
  archRatio?: number;
  divisionStyle?: DivisionStyle;
}

export interface DwarvenDoorOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: DwarvenOpeningPalette;
  archRatio?: number;
}

export interface DwarvenOculusOptions {
  diameter: number;
  wallZ: number;
  palette: DwarvenOpeningPalette;
  divisionStyle?: DivisionStyle;
}

const MIN_ARCH_RATIO = 0.5;
const MAX_ARCH_RATIO = 0.65;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function archRatioOf(opts: { archRatio?: number }): number {
  return clamp(opts.archRatio ?? 0.55, MIN_ARCH_RATIO, MAX_ARCH_RATIO);
}

export function buildDwarvenWindow(opts: DwarvenWindowOptions): THREE.Group {
  const shape: OpeningShape = opts.shape ?? 'arch';
  const archRatio = archRatioOf(opts);
  const pointHeight = shape === 'round' ? 0 : Math.min(opts.height * 0.55, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.45, opts.height - pointHeight);
  const frameWidth = Math.max(0.05, opts.width * 0.16);
  const recessDepth = Math.max(0.05, opts.width * 0.22);
  const frameProud = Math.max(0.02, opts.width * 0.09);

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

export function buildDwarvenOculus(opts: DwarvenOculusOptions): THREE.Group {
  return buildDwarvenWindow({
    width: opts.diameter,
    height: opts.diameter,
    wallZ: opts.wallZ,
    palette: opts.palette,
    shape: 'round',
    divisionStyle: opts.divisionStyle ?? 'cross',
  });
}

export function buildDwarvenDoor(opts: DwarvenDoorOptions): THREE.Group {
  const archRatio = archRatioOf(opts);
  const pointHeight = Math.min(opts.height * 0.4, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.6, opts.height - pointHeight);
  const frameWidth = Math.max(0.06, opts.width * 0.14);
  const recessDepth = Math.max(0.08, opts.width * 0.2);
  const frameProud = Math.max(0.03, opts.width * 0.08);

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

export interface DwarvenVentSlitOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: DwarvenOpeningPalette;
  shape?: OpeningShape;
  archRatio?: number;
  /** Louvre slat tilt in degrees; forwarded to `PipeworkVent.buildLouvredVent`. */
  louvreAngleDeg?: number;
}

/**
 * A small stone-framed vent slit (house rear vent / blacksmith side vents /
 * watchtower lookout slots). Reuses the standard five-piece window recess
 * for its structural frame (`recess`/`surround`/`sill`/`division`), then
 * swaps the flat glazing pane for a real louvred-vent assembly
 * (`PipeworkVent.buildLouvredVent`) at the same set-back depth -- so the
 * opening still reads as a genuine punched hole with proud stone dressing,
 * not a blob/box placeholder, while the "glass" pane becomes functional
 * grillework per the design spec's "grille bars"/"louvred" language.
 */
export function buildDwarvenVentSlit(opts: DwarvenVentSlitOptions): THREE.Group {
  const shape: OpeningShape = opts.shape ?? 'round';
  const opening = buildDwarvenWindow({
    width: opts.width,
    height: opts.height,
    wallZ: opts.wallZ,
    palette: opts.palette,
    shape,
    archRatio: opts.archRatio,
    divisionStyle: 'cross',
  });

  const glazing = opening.children.find((c) => c.name === 'glazing');
  if (glazing) {
    const box = new THREE.Box3().setFromObject(glazing);
    const size = new THREE.Vector3();
    box.getSize(size);
    const louvre = buildLouvredVent({
      width: Math.max(0.06, size.x),
      height: Math.max(0.06, size.y),
      material: opts.palette.iron ?? opts.palette.stone,
      louvreAngleDeg: opts.louvreAngleDeg,
    });
    louvre.name = 'vent-louvre';
    louvre.position.copy(glazing.position);
    opening.remove(glazing);
    opening.add(louvre);
  }
  return opening;
}

export interface DwarvenForgeMouthOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: DwarvenOpeningPalette;
  archRatio?: number;
}

/**
 * The blacksmith's large shouldered forge opening. Reuses the standard
 * five-piece window/arch recess for the side piers, iron lintel surround,
 * sill, and grate-bar division, but drives the "glazing" slot with
 * `palette.forgeEmissive` (a glowing throat) when supplied, falling back to
 * plain dark glazing for the design spec's "cool/pristine" heat-state axis
 * so the preset never requires an emissive material to be present.
 */
export function buildDwarvenForgeMouth(opts: DwarvenForgeMouthOptions): THREE.Group {
  const throatMaterial = opts.palette.forgeEmissive ?? opts.palette.glazing;
  return buildDwarvenWindow({
    width: opts.width,
    height: opts.height,
    wallZ: opts.wallZ,
    palette: { ...opts.palette, glazing: throatMaterial },
    shape: 'arch',
    archRatio: opts.archRatio ?? 0.6,
    divisionStyle: 'cross',
  });
}
