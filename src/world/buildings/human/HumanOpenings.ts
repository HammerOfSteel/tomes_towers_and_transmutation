import * as THREE from 'three';
import {
  buildDoorOpening,
  buildWindowOpening,
  type DivisionStyle,
  type OpeningShape,
} from '../kit/OpeningParts';

/**
 * HumanOpenings.ts — human window/door/oculus presets over the shared
 * `OpeningParts.ts` five-piece opening primitives (docs/superpowers/specs/
 * 2026-09-04-human-buildings-design.md §"Openings are built objects").
 * Human openings are mostly rectangular/flat-lintel (timber-frame casements)
 * with a genuine arched minority (`archRatio≈0.9-1.0`) motivated by the
 * `multi_story_house.jpeg` reference's arched upper windows -- unlike
 * elven's tall pointed lancets or dwarven's squat Romanesque round arches,
 * a human window schedule mixes both per the spec's own per-kind weights
 * rather than fixing one archRatio for the whole race.
 *
 * This module does not duplicate opening geometry; it only translates
 * human proportion defaults into the lower-level
 * `straightHeight`/`pointHeight`/`frameWidth`/`recessDepth`/`frameProud`
 * inputs `buildWindowOpening()`/`buildDoorOpening()` already expect.
 */
export interface HumanOpeningPalette {
  /** Proud timber surround/frame (the common case: a timber-framed casement). */
  timber: THREE.Material;
  /** Stone surround for ground-floor/chapel/watchtower masonry openings. */
  stone?: THREE.Material;
  glazingMaterial: THREE.Material;
  /** Warm interior-lit glazing variant (inn/shop dusk windows). */
  litGlazing?: THREE.Material;
  wood: THREE.Material;
  /** Door strap-iron / shutter hinge tint. */
  iron?: THREE.Material;
  recess?: THREE.Material;
}

export interface HumanWindowOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: HumanOpeningPalette;
  shape?: OpeningShape;
  /** 0 = flat rectangular lintel (the common case); up to ~1.0 for the
   * arched minority. Clamped to [0, 1.05]. */
  archRatio?: number;
  divisionStyle?: DivisionStyle;
  /** Use the stone surround instead of the default timber one (ground
   * floor / chapel / watchtower masonry openings). */
  stoneSurround?: boolean;
  /** Use the warm lamp-lit glazing variant instead of plain dark glazing. */
  lit?: boolean;
}

export interface HumanDoorOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: HumanOpeningPalette;
  archRatio?: number;
  stoneSurround?: boolean;
}

export interface HumanOculusOptions {
  diameter: number;
  wallZ: number;
  palette: HumanOpeningPalette;
  divisionStyle?: DivisionStyle;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildHumanWindow(opts: HumanWindowOptions): THREE.Group {
  const shape: OpeningShape = opts.shape ?? 'arch';
  const archRatio = clamp(opts.archRatio ?? 0, 0, 1.05);
  const pointHeight = shape === 'round' ? 0 : Math.min(opts.height * 0.5, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.5, opts.height - pointHeight);
  const frameWidth = Math.max(0.05, opts.width * 0.14);
  const recessDepth = Math.max(0.12, opts.width * 0.24);
  const frameProud = Math.max(0.03, opts.width * 0.08);
  const surround = opts.stoneSurround ? (opts.palette.stone ?? opts.palette.timber) : opts.palette.timber;
  const glazing = opts.lit ? (opts.palette.litGlazing ?? opts.palette.glazingMaterial) : opts.palette.glazingMaterial;

  return buildWindowOpening({
    width: opts.width,
    straightHeight,
    pointHeight,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: surround,
    glazingMaterial: glazing,
    recessMaterial: opts.palette.recess,
    openingShape: shape,
    divisionStyle: opts.divisionStyle ?? 'vertical',
  });
}

export function buildHumanOculus(opts: HumanOculusOptions): THREE.Group {
  return buildHumanWindow({
    width: opts.diameter,
    height: opts.diameter,
    wallZ: opts.wallZ,
    palette: opts.palette,
    shape: 'round',
    divisionStyle: opts.divisionStyle ?? 'cross',
  });
}

export function buildHumanDoor(opts: HumanDoorOptions): THREE.Group {
  const archRatio = clamp(opts.archRatio ?? 0, 0, 1.0);
  const pointHeight = Math.min(opts.height * 0.35, (opts.width / 2) * archRatio);
  const straightHeight = Math.max(opts.height * 0.65, opts.height - pointHeight);
  const frameWidth = Math.max(0.06, opts.width * 0.12);
  const recessDepth = Math.max(0.12, opts.width * 0.2);
  const frameProud = Math.max(0.03, opts.width * 0.07);
  const surround = opts.stoneSurround ? (opts.palette.stone ?? opts.palette.timber) : opts.palette.timber;

  return buildDoorOpening({
    width: opts.width,
    straightHeight,
    pointHeight,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    // buildDoorOpening's single `stoneMaterial` slot drives the surround,
    // threshold, AND strap-iron tint together (see OpeningParts.ts's
    // buildArchSurround/buildThreshold/buildDoorLeaf) -- keep it as the
    // timber/stone surround material (matching DwarvenOpenings.ts's own
    // precedent) rather than iron, so the visible frame/threshold reads
    // correctly; strap tint is a minor secondary trade-off shared by every
    // race's door preset.
    stoneMaterial: surround,
    recessMaterial: opts.palette.recess ?? opts.palette.glazingMaterial,
    woodMaterial: opts.palette.wood,
  });
}
