import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { buildMonument, pickMonumentVariant, MONUMENT_VARIANTS } from '../kit/MonumentKit';
import { buildRailSection } from '../kit/Railing';
import { buildLanternCage } from '../kit/LanternKit';
import type { UndeadPalette } from './UndeadNecropolisPalette';

/**
 * UndeadLotDressing.ts — deterministic cemetery ground-prop placement
 * (doctrine Tier 3 consumer; design spec `2026-09-04-undead-buildings-
 * design.md`'s "lot dressing": grave markers, low iron rails, lantern
 * posts, and paving/rubble scattered around every footprint). Props are
 * placed in fixed lanes along each of the four footprint sides so the
 * entrance clearance rectangle on the +Z (front, entrance) face is never
 * touched by construction rather than by a rejection-sample afterthought.
 */

function tagLotSeed(seed: number): number {
  let h = seed >>> 0;
  const tag = 'LOTD';
  for (let i = 0; i < tag.length; i++) {
    h = (h ^ (tag.charCodeAt(i) << ((i % 4) * 8))) >>> 0;
  }
  return h >>> 0;
}

function pickWeighted<T>(rand: () => number, options: Array<[T, number]>): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of options) {
    r -= weight;
    if (r <= 0) return value;
  }
  return options[options.length - 1]![0];
}

type LotSide = 'left' | 'right' | 'back' | 'front';
type PropKind = 'monument' | 'rail' | 'lantern-post' | 'paver' | 'rubble';

export interface UndeadLotDressingOptions {
  /** Building footprint half-width (X) and half-depth (Z). */
  halfW: number;
  halfD: number;
  palette: UndeadPalette;
  seed: number;
  /** Half-width of the door clearance lane on the +Z front face, centred on x=0. Default derived from halfW. */
  entranceHalfWidth?: number;
  /** Number of ground props to place. Default derived from footprint perimeter. */
  propCount?: number;
}

/** A slot's (x, z) ground position for a given side + lane fraction `t` in [0, 1]. The
 * 'front' side skips the entrance clearance band by construction (two lanes either side
 * of it), so props on that side never overlap the doorway. */
function slotPosition(side: LotSide, t: number, halfW: number, halfD: number, margin: number, entranceHalfWidth: number): [number, number] {
  const usableW = halfW * 0.88;
  const usableD = halfD * 0.88;
  switch (side) {
    case 'left':
      return [-(halfW + margin), (t * 2 - 1) * usableD];
    case 'right':
      return [halfW + margin, (t * 2 - 1) * usableD];
    case 'back':
      return [(t * 2 - 1) * usableW, -(halfD + margin)];
    case 'front': {
      const clear = Math.min(entranceHalfWidth, usableW - 0.05);
      const laneLen = Math.max(0, usableW - clear);
      if (laneLen <= 0.05) {
        // No room for a front lane without touching the doorway -- push
        // this slot to the back side instead of ever encroaching on it.
        return [(t * 2 - 1) * usableW, -(halfD + margin)];
      }
      const totalLen = laneLen * 2;
      const d = t * totalLen;
      const x = d < laneLen ? -usableW + d : clear + (d - laneLen);
      return [x, halfD + margin];
    }
  }
}

function buildLanternPost(palette: UndeadPalette, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lantern-post-assembly';
  const postHeight = 1.05;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, postHeight, 8), palette.stone);
  post.name = 'post-shaft';
  post.position.y = postHeight / 2;
  post.castShadow = post.receiveShadow = true;
  group.add(post);

  const cage = buildLanternCage({ material: palette.iron, paneMaterial: palette.lanternGlow, lit: seed % 5 !== 0 });
  cage.name = 'lantern-cage';
  cage.position.y = postHeight + 0.08;
  group.add(cage);

  return group;
}

function buildRubblePile(palette: UndeadPalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rubble-pile';
  const chunkCount = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < chunkCount; i++) {
    const size = 0.08 + rand() * 0.1;
    const chunk = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.7, size), rand() > 0.5 ? palette.stone : palette.spolia);
    chunk.name = `chunk-${i}`;
    chunk.position.set((rand() - 0.5) * 0.25, size * 0.35, (rand() - 0.5) * 0.25);
    chunk.rotation.set(rand() * 0.3, rand() * Math.PI, rand() * 0.3);
    chunk.castShadow = chunk.receiveShadow = true;
    group.add(chunk);
  }
  return group;
}

function buildPaverSlab(palette: UndeadPalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'paver-slab';
  const w = 0.4 + rand() * 0.15;
  const d = 0.4 + rand() * 0.15;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), palette.darkStone);
  slab.name = 'slab';
  slab.position.y = 0.025;
  slab.rotation.y = rand() * Math.PI;
  slab.castShadow = slab.receiveShadow = true;
  group.add(slab);
  return group;
}

/**
 * Builds a full ring of deterministic cemetery ground props (`undead-lot-
 * dressing` root, with named `undead-monument-N` / `undead-rail-N` /
 * `undead-lantern-post-N` / `undead-paver-N` / `undead-rubble-N` children)
 * around a rectangular footprint of half-width `halfW` and half-depth
 * `halfD`, entirely skipping the `entranceHalfWidth`-wide clearance lane
 * centred on the +Z (front) doorway.
 */
export function buildUndeadLotDressing(options: UndeadLotDressingOptions): THREE.Group {
  const { halfW, halfD, palette, seed } = options;
  const entranceHalfWidth = options.entranceHalfWidth ?? Math.min(halfW * 0.5, 0.55);
  const margin = 0.4;
  const rand = mulberry32(tagLotSeed(seed));

  const group = new THREE.Group();
  group.name = 'undead-lot-dressing';

  const propCount = options.propCount ?? Math.max(3, Math.min(9, Math.round((halfW + halfD) * 1.4)));
  const sides: LotSide[] = ['left', 'right', 'back', 'front'];

  for (let i = 0; i < propCount; i++) {
    const side = sides[i % sides.length]!;
    const t = (i / propCount + rand() * 0.15) % 1;
    const [x, z] = slotPosition(side, t, halfW, halfD, margin, entranceHalfWidth);

    const kind = pickWeighted<PropKind>(rand, [
      ['monument', 0.4],
      ['rail', 0.22],
      ['lantern-post', 0.16],
      ['paver', 0.14],
      ['rubble', 0.08],
    ]);

    let prop: THREE.Group;
    switch (kind) {
      case 'monument': {
        const variant = pickMonumentVariant(rand, MONUMENT_VARIANTS.map((v) => [v, 1] as [typeof v, number]));
        prop = buildMonument({ variant, material: palette.stone, plinthMaterial: palette.darkStone, seed: seed + i });
        prop.name = `undead-monument-${i}`;
        break;
      }
      case 'rail': {
        prop = buildRailSection({
          length: 0.6 + rand() * 0.5,
          material: palette.iron,
          finialMaterial: palette.iron,
          brokenFraction: rand() > 0.6 ? 0.2 : 0,
          seed: seed + i,
        });
        prop.name = `undead-rail-${i}`;
        prop.rotation.y = side === 'left' || side === 'right' ? Math.PI / 2 : 0;
        break;
      }
      case 'lantern-post': {
        prop = buildLanternPost(palette, seed + i);
        prop.name = `undead-lantern-post-${i}`;
        break;
      }
      case 'paver': {
        prop = buildPaverSlab(palette, rand);
        prop.name = `undead-paver-${i}`;
        break;
      }
      case 'rubble':
      default: {
        prop = buildRubblePile(palette, rand);
        prop.name = `undead-rubble-${i}`;
        break;
      }
    }

    prop.position.x += x;
    prop.position.z += z;
    group.add(prop);
  }

  return group;
}
