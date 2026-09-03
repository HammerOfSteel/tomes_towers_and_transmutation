/**
 * StoneTowerEntrance.ts — ground-floor archway entrance for the elven
 * stone-tower kit (docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md). Always present (a
 * tower always has a way in) -- only the STYLE varies by seed, built
 * once per tower and attached to `buildTowerBase()`'s plinth front
 * face.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { StoneTowerPalette } from './StoneTowerKit';

export type EntranceStyle = 'plain_arch' | 'flanked_pillars';
const ALL_STYLES: EntranceStyle[] = ['plain_arch', 'flanked_pillars'];

/** Deterministic seeded choice between the 2 entrance styles. */
export function pickEntranceStyle(seed: number): EntranceStyle {
  const rand = mulberry32((seed ^ 0x444F4F52) >>> 0); // 'DOOR'-ish tag
  return ALL_STYLES[Math.floor(rand() * ALL_STYLES.length)]!;
}

/**
 * Builds a person-scale pointed-arch doorway (a larger version of
 * StoneTowerWindows.ts's pointed_arch shape, sized for entry rather
 * than light) with a dark recessed "open doorway" box and a
 * moonstone-accented point.
 */
function _buildArch(radius: number, doorH: number, doorW: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const pointH = doorH * 0.3;
  const doorMat = new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.9 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.1), doorMat);
  door.position.set(0, doorH / 2, radius * 0.99);
  g.add(door);
  const point = new THREE.Mesh(new THREE.ConeGeometry(doorW * 0.55, pointH, 3), palette.moonstone);
  point.position.set(0, doorH + pointH / 2, radius * 0.99);
  point.rotation.y = Math.PI / 4;
  g.add(point);
  return g;
}

/** Builds a complete entrance for the given style, at ground level
 * (y=0) on the base/plinth's front (+Z) face. `seed` drives modest
 * per-tower size jitter so entrances don't look identical across
 * every elven tower regardless of style. */
export function buildEntrance(style: EntranceStyle, radius: number, seed: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed ^ 0x454E5452); // 'ENTR'-ish tag
  const doorH = radius * (0.75 + rand() * 0.15);
  const doorW = radius * (0.32 + rand() * 0.08);

  const arch = _buildArch(radius, doorH, doorW, palette);
  g.add(arch);

  if (style === 'flanked_pillars') {
    const pillarR = doorW * 0.14;
    const pillarH = doorH * 0.95;
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(pillarR, pillarR * 1.1, pillarH, 8), palette.stone);
      pillar.position.set(side * (doorW * 0.5 + pillarR * 1.3), pillarH / 2, radius * 0.97);
      pillar.castShadow = pillar.receiveShadow = true;
      g.add(pillar);
    }
  }

  return g;
}
