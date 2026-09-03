/**
 * StoneTowerWindows.ts — window type x size catalog for the elven
 * stone-tower kit (docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md). Re-rolled per
 * floor (not fixed per tower), so a single tower's several windows can
 * show different types/sizes -- matching real hand-built towers where
 * windows were added/replaced at different times.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { StoneTowerPalette } from './StoneTowerKit';

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

/** Strategy: the existing pointed-arch window (glass box + moonstone
 * cone point), unchanged visually from before this feature pass --
 * only now sized by `SIZE_SCALE`. */
function _buildPointedArch(size: WindowSize, radius: number, ringHeight: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const scale = SIZE_SCALE[size];
  const archBodyH = ringHeight * 0.35 * scale;
  const archBodyW = radius * 0.3 * scale;
  const archPointH = archBodyH * 0.5;
  const glassMat = new THREE.MeshStandardMaterial({ color: GLASS_COLOR, roughness: 0.4 });
  const archBody = new THREE.Mesh(new THREE.BoxGeometry(archBodyW, archBodyH, 0.06), glassMat);
  archBody.position.set(0, ringHeight * 0.5, radius * 0.99);
  g.add(archBody);
  const archPoint = new THREE.Mesh(new THREE.ConeGeometry(archBodyW * 0.5, archPointH, 3), palette.moonstone);
  archPoint.position.set(0, ringHeight * 0.5 + archBodyH / 2 + archPointH / 2, radius * 0.99);
  archPoint.rotation.y = Math.PI / 4;
  g.add(archPoint);
  return g;
}

/** Strategy: a round "oculus" window -- a stone-ring torus frame
 * around a disc of glass. Real Romanesque/Gothic feature, a distinct
 * silhouette from the pointed arch. */
function _buildOculus(size: WindowSize, radius: number, ringHeight: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const scale = SIZE_SCALE[size];
  const outerR = radius * 0.16 * scale;
  const glassMat = new THREE.MeshStandardMaterial({ color: GLASS_COLOR, roughness: 0.4 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(outerR * 0.8, outerR * 0.8, 0.05, 12), glassMat);
  glass.rotation.x = Math.PI / 2;
  glass.position.set(0, ringHeight * 0.5, radius * 0.99);
  g.add(glass);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(outerR * 0.85, outerR * 0.18, 6, 14), palette.stone);
  frame.position.set(0, ringHeight * 0.5, radius * 0.99);
  g.add(frame);
  return g;
}

/** Strategy: a squared window with a horizontal + vertical stone
 * mullion bar splitting it into 4 panes -- a real late-medieval/
 * early-modern window type, reads as more "furnished" than a plain
 * arrow-slit-like arch. */
function _buildCrossMullion(size: WindowSize, radius: number, ringHeight: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const scale = SIZE_SCALE[size];
  const bodyH = ringHeight * 0.32 * scale;
  const bodyW = radius * 0.34 * scale;
  const glassMat = new THREE.MeshStandardMaterial({ color: GLASS_COLOR, roughness: 0.4 });
  const pane = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, 0.05), glassMat);
  pane.position.set(0, ringHeight * 0.5, radius * 0.99);
  g.add(pane);
  const barThickness = Math.min(bodyW, bodyH) * 0.08;
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(barThickness, bodyH, 0.08), palette.stone);
  vBar.position.set(0, ringHeight * 0.5, radius * 0.995);
  g.add(vBar);
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(bodyW, barThickness, 0.08), palette.stone);
  hBar.position.set(0, ringHeight * 0.5, radius * 0.995);
  g.add(hBar);
  return g;
}

/** Dispatches to whichever window type is requested, at the given
 * size, positioned at the ring's standard window slot (z = radius *
 * 0.99, matching all 3 strategies' shared convention). */
export function buildWindow(
  style: WindowStyle, radius: number, ringHeight: number, palette: StoneTowerPalette,
): THREE.Group {
  switch (style.type) {
    case 'pointed_arch': return _buildPointedArch(style.size, radius, ringHeight, palette);
    case 'oculus': return _buildOculus(style.size, radius, ringHeight, palette);
    case 'cross_mullion': return _buildCrossMullion(style.size, radius, ringHeight, palette);
  }
}
