/**
 * StoneTowerWindows.ts — window type x size catalog for the elven
 * stone-tower kit (docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md). Re-rolled per
 * floor (not fixed per tower), so a single tower's several windows can
 * show different types/sizes -- matching real hand-built towers where
 * windows were added/replaced at different times.
 *
 * All 3 types share StoneTowerOpenings.ts's recessed-frame-plus-cavity
 * technique for real carved depth (a proud stone frame surrounding a
 * genuinely receded dark cavity), matching the reference tabletop-kit
 * image's carved archways -- NOT a flat glass box/disc glued onto the
 * wall surface with zero depth (the original implementation's flaw,
 * flagged as looking like disconnected "basic base geometry" against
 * the wall's real block-course construction).
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { StoneTowerPalette } from './StoneTowerKit';
import { buildRecessedArchOpening, type RecessedArchOptions } from './StoneTowerOpenings';

export type WindowType = 'pointed_arch' | 'oculus' | 'cross_mullion';
export type WindowSize = 'small' | 'medium' | 'large';

export interface WindowStyle {
  type: WindowType;
  size: WindowSize;
}

const ALL_TYPES: WindowType[] = ['pointed_arch', 'oculus', 'cross_mullion'];
const ALL_SIZES: WindowSize[] = ['small', 'medium', 'large'];

/** Scalar multiplier applied to the base window dimensions per size. */
const SIZE_SCALE: Record<WindowSize, number> = { small: 0.7, medium: 1.0, large: 1.35 };

/** Deterministic seeded choice of window type + size, independent of
 * each other (9 equally-likely combinations). */
export function pickWindowStyle(seed: number): WindowStyle {
  const rand = mulberry32((seed ^ 0x57494E44) >>> 0); // 'WIND'-ish tag
  const type = ALL_TYPES[Math.floor(rand() * ALL_TYPES.length)]!;
  const size = ALL_SIZES[Math.floor(rand() * ALL_SIZES.length)]!;
  return { type, size };
}

const GLASS_COLOR = '#1a2a1a';

/**
 * Strategy: a carved pointed-arch window, built from
 * StoneTowerOpenings.ts's shared recessed-frame-plus-cavity technique,
 * topped with a small moonstone oculus accent inset near the arch's
 * point -- the reference image's recurring "window within a window"
 * motif.
 */
function _buildPointedArch(size: WindowSize, radius: number, ringHeight: number, palette: StoneTowerPalette): THREE.Group {
  const scale = SIZE_SCALE[size];
  const opts: RecessedArchOptions = {
    width: radius * 0.26 * scale,
    straightHeight: ringHeight * 0.28 * scale,
    pointHeight: ringHeight * 0.14 * scale,
    recessDepth: radius * 0.1,
    frameWidth: radius * 0.045,
    frameProud: radius * 0.03,
  };
  const glassMat = new THREE.MeshStandardMaterial({ color: GLASS_COLOR, roughness: 0.4 });
  const g = buildRecessedArchOpening(opts, radius, glassMat, palette.stone);
  g.position.y = ringHeight * 0.35;

  // Small moonstone oculus accent inset near the arch's point, proud of
  // the frame like a keystone ornament -- matches the reference image's
  // recurring "round window inset near an arch's peak" detail.
  const accentR = opts.width * 0.16;
  const accent = new THREE.Mesh(new THREE.CylinderGeometry(accentR, accentR, radius * 0.02, 8), palette.moonstone);
  accent.rotation.x = Math.PI / 2;
  accent.position.set(0, g.position.y + opts.straightHeight + opts.pointHeight * 0.55, radius + opts.frameProud * 0.6);
  g.add(accent);

  return g;
}

/**
 * Strategy: a round "oculus" window -- a proud stone-ring torus frame
 * around a genuinely recessed disc of glass. Real Romanesque/Gothic
 * feature, a distinct silhouette from the pointed arch.
 */
function _buildOculus(size: WindowSize, radius: number, ringHeight: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const scale = SIZE_SCALE[size];
  const outerR = radius * 0.16 * scale;
  const recessDepth = radius * 0.08;
  const glassMat = new THREE.MeshStandardMaterial({ color: GLASS_COLOR, roughness: 0.4 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(outerR * 0.8, outerR * 0.8, 0.05, 12), glassMat);
  glass.rotation.x = Math.PI / 2;
  glass.position.set(0, ringHeight * 0.5, radius - recessDepth);
  g.add(glass);
  const frameProud = radius * 0.03;
  const frame = new THREE.Mesh(new THREE.TorusGeometry(outerR * 0.85, outerR * 0.18, 6, 14), palette.stone);
  frame.position.set(0, ringHeight * 0.5, radius + frameProud);
  frame.castShadow = frame.receiveShadow = true;
  g.add(frame);
  return g;
}

/**
 * Strategy: a squared window (StoneTowerOpenings.ts's arch shape with
 * `pointHeight=0`, i.e. a plain rectangle) with a proud horizontal +
 * vertical stone mullion bar splitting it into 4 panes -- a real
 * late-medieval/early-modern window type, reads as more "furnished"
 * than a plain arrow-slit-like arch.
 */
function _buildCrossMullion(size: WindowSize, radius: number, ringHeight: number, palette: StoneTowerPalette): THREE.Group {
  const scale = SIZE_SCALE[size];
  const opts: RecessedArchOptions = {
    width: radius * 0.3 * scale,
    straightHeight: ringHeight * 0.24 * scale,
    pointHeight: 0,
    recessDepth: radius * 0.1,
    frameWidth: radius * 0.045,
    frameProud: radius * 0.03,
  };
  const glassMat = new THREE.MeshStandardMaterial({ color: GLASS_COLOR, roughness: 0.4 });
  const g = buildRecessedArchOpening(opts, radius, glassMat, palette.stone);
  g.position.y = ringHeight * 0.35;

  const barThickness = Math.min(opts.width, opts.straightHeight) * 0.09;
  const barProud = radius + opts.frameProud * 0.7;
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(barThickness, opts.straightHeight, barThickness), palette.stone);
  vBar.position.set(0, g.position.y + opts.straightHeight / 2, barProud);
  g.add(vBar);
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(opts.width, barThickness, barThickness), palette.stone);
  hBar.position.set(0, g.position.y + opts.straightHeight / 2, barProud);
  g.add(hBar);
  return g;
}

/** Dispatches to whichever window type is requested, at the given
 * size, positioned at the ring's standard window slot (z = radius,
 * matching all 3 strategies' shared convention). */
export function buildWindow(
  style: WindowStyle, radius: number, ringHeight: number, palette: StoneTowerPalette,
): THREE.Group {
  switch (style.type) {
    case 'pointed_arch': return _buildPointedArch(style.size, radius, ringHeight, palette);
    case 'oculus': return _buildOculus(style.size, radius, ringHeight, palette);
    case 'cross_mullion': return _buildCrossMullion(style.size, radius, ringHeight, palette);
  }
}
