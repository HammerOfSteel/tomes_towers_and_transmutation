import * as THREE from 'three';
import {
  buildDoorOpening,
  buildWindowOpening,
  type DivisionStyle,
} from '../kit/OpeningParts';
import { buildShutterPair } from '../kit/Shutter';
import { depthFor } from '../kit/DepthLadder';

/**
 * VulperiaOpenings.ts — fox-folk warren opening presets over the shared
 * `OpeningParts.ts` five-piece opening primitives (design spec
 * `2026-09-04-vulperia-buildings-design.md`: "many small framed openings" —
 * low, round/shallow-arched apertures that read as watchful, cosy, and
 * clever rather than tall/gothic (vampire's lancets) or equilateral/funerary
 * (undead's arcades). Every opening here clamps to a LOW aspect ratio
 * (height rarely exceeding ~1.3x width) and defaults to a round or very
 * shallow-arch profile.
 *
 * Adds three vulperia-specific overlay presets on top of the mandatory
 * five-piece opening, each layered ON TOP rather than replacing any
 * required part (doctrine-compliant):
 *  - `buildVulperiaRoundWatch` — a plain round watch-window (recess,
 *    surround, sill, cross division, glazing).
 *  - `buildVulperiaEyebrowDormerWindow` — a proud curved "eyebrow" hood
 *    lintel over a small window, echoing turf-roof eyebrow dormers at
 *    wall-level scale.
 *  - `buildVulperiaShutteredWindow` — a small framed window with a pair of
 *    hinged shutters (reuses the shared `Shutter.ts` module directly,
 *    since vulperia's "many small framed openings" language fits its
 *    "closed, not broken" shutter vocabulary just as well as vampire's).
 */
export interface VulperiaOpeningPalette {
  stone: THREE.Material;
  glazing: THREE.Material;
  wood: THREE.Material;
  /** Accent trim (green paint / bronze) for shutters and hoods. */
  accent: THREE.Material;
}

export interface VulperiaWindowOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: VulperiaOpeningPalette;
  divisionStyle?: DivisionStyle;
}

export interface VulperiaDoorOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: VulperiaOpeningPalette;
}

export interface VulperiaRoundWatchOptions {
  diameter: number;
  wallZ: number;
  palette: VulperiaOpeningPalette;
}

export interface VulperiaGableSlitOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: VulperiaOpeningPalette;
}

const MAX_ASPECT = 1.3;

/** A low, rounded/shallow-arch window opening -- vulperia's default
 * "many small framed openings" language, deliberately far from vampire's
 * tall lancets and undead's equilateral arcades. */
export function buildVulperiaWindow(opts: VulperiaWindowOptions): THREE.Group {
  const height = Math.min(opts.height, opts.width * MAX_ASPECT);
  const pointHeight = Math.min(height * 0.28, opts.width * 0.22);
  const straightHeight = Math.max(height * 0.72, height - pointHeight);
  const frameWidth = Math.max(0.045, opts.width * 0.16);
  const recessDepth = Math.max(0.08, opts.width * 0.2);
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
    openingShape: 'arch',
    divisionStyle: opts.divisionStyle ?? 'vertical',
  });
}

/** The burrow/porch door: a low, rounded (Romanesque, not gothic-pointed)
 * doorway with recess, surround, threshold, planked leaf and straps. */
export function buildVulperiaDoor(opts: VulperiaDoorOptions): THREE.Group {
  const height = Math.min(opts.height, opts.width * MAX_ASPECT * 1.35);
  const pointHeight = Math.min(height * 0.18, opts.width * 0.18);
  const straightHeight = Math.max(height * 0.82, height - pointHeight);
  const frameWidth = Math.max(0.06, opts.width * 0.15);
  const recessDepth = Math.max(0.09, opts.width * 0.22);
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
    recessMaterial: opts.palette.glazing,
    woodMaterial: opts.palette.wood,
  });
}

/** A round watch-window: the fox-folk "keeping watch" opening -- a plain
 * round five-piece opening with a cross division. */
export function buildVulperiaRoundWatch(opts: VulperiaRoundWatchOptions): THREE.Group {
  const frameWidth = Math.max(0.04, opts.diameter * 0.18);
  const recessDepth = Math.max(0.07, opts.diameter * 0.24);
  const frameProud = Math.max(0.02, opts.diameter * 0.08);

  return buildWindowOpening({
    width: opts.diameter,
    straightHeight: opts.diameter * 0.5,
    pointHeight: 0,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.stone,
    glazingMaterial: opts.palette.glazing,
    openingShape: 'round',
    divisionStyle: 'cross',
  });
}

/** A narrow, tall watching slit -- deliberately exempt from `MAX_ASPECT`
 * since the design spec calls for a genuinely narrow `0.22-0.32w x
 * 0.75-1.10h` profile (watchtower stages, terraced rear exits). Still a
 * full five-piece opening (recess/surround/sill/mullion/glazing), just
 * proportioned differently from the round/low window family above. */
export function buildVulperiaGableSlit(opts: VulperiaGableSlitOptions): THREE.Group {
  const frameWidth = Math.max(0.035, opts.width * 0.18);
  const recessDepth = Math.max(0.06, opts.width * 0.28);
  const frameProud = Math.max(0.02, opts.width * 0.09);

  return buildWindowOpening({
    width: opts.width,
    straightHeight: opts.height,
    pointHeight: 0,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.stone,
    glazingMaterial: opts.palette.glazing,
    openingShape: 'arch',
    divisionStyle: 'cross',
  });
}

/** Wraps a `buildVulperiaWindow` with a proud curved "eyebrow" hood board
 * above it -- turf-roof eyebrow-dormer language brought down to wall
 * scale, layered OVER the mandatory five-piece opening. */
export function buildVulperiaEyebrowDormerWindow(opts: VulperiaWindowOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-eyebrow-window';

  const opening = buildVulperiaWindow(opts);
  opening.name = 'opening';
  group.add(opening);

  const hoodWidth = opts.width * 1.35;
  const hoodHeight = 0.05;
  const hoodDepth = Math.max(0.1, opts.width * 0.3);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(hoodWidth, hoodHeight, hoodDepth), opts.palette.accent);
  hood.name = 'eyebrow-hood';
  hood.position.set(0, opts.height + hoodHeight * 0.6, opts.wallZ + hoodDepth * 0.35);
  hood.rotation.x = -0.18;
  hood.castShadow = true;
  hood.receiveShadow = true;
  group.add(hood);

  return group;
}

/** Wraps a `buildVulperiaWindow` with a hinged shutter pair (reuses the
 * shared `Shutter.ts` module directly -- vulperia's "many small framed
 * openings" fits its "closed, not broken" shutter vocabulary too). */
export function buildVulperiaShutteredWindow(opts: VulperiaWindowOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-shuttered-window';

  const opening = buildVulperiaWindow(opts);
  opening.name = 'opening';
  group.add(opening);

  const shutters = buildShutterPair({
    width: opts.width * 1.05,
    height: opts.height,
    material: opts.palette.accent,
    hingeMaterial: opts.palette.wood,
    wallZ: opts.wallZ + depthFor('FRAME'),
    gap: opts.width * 0.06,
  });
  group.add(shutters);

  return group;
}
