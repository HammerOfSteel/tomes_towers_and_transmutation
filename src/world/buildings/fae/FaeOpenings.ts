import * as THREE from 'three';
import {
  buildDoorOpening,
  buildWindowOpening,
  type DivisionStyle,
} from '../kit/OpeningParts';
import { depthFor } from '../kit/DepthLadder';

/**
 * FaeOpenings.ts — fae opening presets over the shared `OpeningParts.ts`
 * five-piece opening primitives
 * (docs/superpowers/specs/2026-09-04-fae-buildings-design.md: "oversized
 * apertures" -- windows/doors sized roughly 30-45% of the facade width,
 * warmly glowing, read as a tall petal-lancet arch or a round "moon
 * window" oculus, never a flat dark box/circle). Every preset here still
 * goes through the mandatory five-piece opening (recess, proud surround,
 * sill, mullion/division, set-back glazing) -- oversized only means the
 * proportions are generous, never that a part gets skipped.
 *
 * Adds two fae-specific overlay flourishes layered ON TOP of the
 * mandatory five-piece opening (doctrine-compliant -- never replacing a
 * required part):
 *  - `buildFaePetalWindow` — a ring of small proud petal-shaped blocks
 *    around the surround, the "vivid flower/petal fantasy house" motif
 *    the reference art calls for.
 *  - `buildFaeOculusWindow` — a round "moon window" with a twig-cross
 *    division, for gable/attic-level openings.
 */
export interface FaeOpeningPalette {
  bark: THREE.Material;
  glow: THREE.Material;
  petal: THREE.Material;
  door: THREE.Material;
}

export interface FaeWindowOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: FaeOpeningPalette;
  divisionStyle?: DivisionStyle;
}

export interface FaeDoorOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: FaeOpeningPalette;
}

export interface FaeOculusOptions {
  diameter: number;
  wallZ: number;
  palette: FaeOpeningPalette;
}

/** A tall petal-lancet window -- a high `pointHeight` relative to width
 * gives the pointed, "grown out of the stump" lancet silhouette fae's
 * oversized windows want, reusing the existing arch-opening pipeline
 * rather than a new primitive. */
export function buildFaeWindow(opts: FaeWindowOptions): THREE.Group {
  const pointHeight = Math.min(opts.height * 0.42, opts.width * 0.55);
  const straightHeight = Math.max(opts.height * 0.58, opts.height - pointHeight);
  const frameWidth = Math.max(0.05, opts.width * 0.16);
  const recessDepth = Math.max(0.09, opts.width * 0.22);
  const frameProud = Math.max(0.03, opts.width * 0.08);

  return buildWindowOpening({
    width: opts.width,
    straightHeight,
    pointHeight,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.bark,
    glazingMaterial: opts.palette.glow,
    openingShape: 'arch',
    divisionStyle: opts.divisionStyle ?? 'cross',
  });
}

/** The oversized front door -- a tall petal-lancet arch, warmly glowing
 * behind a planked leaf, sized to the design spec's "30-45% of facade
 * width" oversized-door language. */
export function buildFaeDoor(opts: FaeDoorOptions): THREE.Group {
  const pointHeight = Math.min(opts.height * 0.34, opts.width * 0.5);
  const straightHeight = Math.max(opts.height * 0.66, opts.height - pointHeight);
  const frameWidth = Math.max(0.07, opts.width * 0.15);
  const recessDepth = Math.max(0.1, opts.width * 0.24);
  const frameProud = Math.max(0.035, opts.width * 0.08);

  return buildDoorOpening({
    width: opts.width,
    straightHeight,
    pointHeight,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.bark,
    recessMaterial: opts.palette.glow,
    woodMaterial: opts.palette.door,
  });
}

/** A round "moon window" oculus -- gable/attic-level opening with a
 * twig-cross division, the fae counterpart to a rose window. */
export function buildFaeOculusWindow(opts: FaeOculusOptions): THREE.Group {
  const frameWidth = Math.max(0.045, opts.diameter * 0.18);
  const recessDepth = Math.max(0.08, opts.diameter * 0.26);
  const frameProud = Math.max(0.025, opts.diameter * 0.09);

  return buildWindowOpening({
    width: opts.diameter,
    straightHeight: opts.diameter * 0.5,
    pointHeight: 0,
    recessDepth,
    frameWidth,
    frameProud,
    wallZ: opts.wallZ,
    stoneMaterial: opts.palette.bark,
    glazingMaterial: opts.palette.glow,
    openingShape: 'round',
    divisionStyle: 'cross',
  });
}

/** Wraps `buildFaeWindow` with a ring of small proud petal-shaped blocks
 * around the surround -- the "vivid flower/petal fantasy house" flourish
 * the reference art calls for, layered ON TOP of (never replacing) the
 * mandatory five-piece opening. */
export function buildFaePetalWindow(opts: FaeWindowOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-petal-window';

  const opening = buildFaeWindow(opts);
  opening.name = 'opening';
  group.add(opening);

  const petalCount = 7;
  const ringRadius = opts.width * 0.62;
  const petalDepth = depthFor('TRIM');
  const centerY = opts.height * 0.5;
  for (let i = 0; i < petalCount; i++) {
    // Fan the petals around the upper half of the opening (a garland over
    // the arch, not a full uninterrupted ring, which reads better against
    // a flat wall than petals crowding the sill).
    const angle = Math.PI * 0.12 + (i / (petalCount - 1)) * Math.PI * 0.76;
    const petal = new THREE.Mesh(
      new THREE.ConeGeometry(opts.width * 0.07, opts.width * 0.16, 5),
      opts.palette.petal,
    );
    petal.name = `petal-${i}`;
    petal.position.set(
      Math.cos(angle) * ringRadius,
      centerY + Math.sin(angle) * ringRadius * 0.9,
      opts.wallZ + petalDepth,
    );
    petal.rotation.z = angle - Math.PI / 2;
    petal.rotation.x = Math.PI * 0.05;
    petal.castShadow = petal.receiveShadow = true;
    group.add(petal);
  }

  return group;
}
