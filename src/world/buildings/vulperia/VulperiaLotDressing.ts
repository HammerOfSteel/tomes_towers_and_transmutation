import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { buildLanternCage } from '../kit/LanternKit';
import type { VulperiaPalette } from './VulperiaPalette';
import { pickVulperiaWeighted, tagVulperiaSeed } from './VulperiaPalette';

/**
 * VulperiaLotDressing.ts — deterministic warren ground-prop placement
 * (design spec `2026-09-04-vulperia-buildings-design.md`'s per-kind
 * "Ornament / props" rows: planter barrels, twig den markers, crate
 * stacks, low fences, fox-tail pennants, lantern posts). Mirrors
 * `UndeadLotDressing.ts`'s fixed-lane placement scheme (props march
 * around the four footprint sides, skipping a clearance lane on the
 * front/+Z face so nothing ever blocks the doorway) with a vulperia
 * prop palette instead of a funerary one.
 */

type LotSide = 'left' | 'right' | 'back' | 'front';
type PropKind = 'planter' | 'den-marker' | 'crate-stack' | 'fence' | 'lantern-post' | 'pennant';

export interface VulperiaLotDressingOptions {
  halfW: number;
  halfD: number;
  palette: VulperiaPalette;
  seed: number;
  entranceHalfWidth?: number;
  propCount?: number;
}

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
      if (laneLen <= 0.05) return [(t * 2 - 1) * usableW, -(halfD + margin)];
      const totalLen = laneLen * 2;
      const d = t * totalLen;
      const x = d < laneLen ? -usableW + d : clear + (d - laneLen);
      return [x, halfD + margin];
    }
  }
}

function buildPlanterBarrel(palette: VulperiaPalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'planter-barrel';
  const radius = 0.16 + rand() * 0.03;
  const height = 0.22 + rand() * 0.04;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, height, 10), palette.darkTimber);
  barrel.name = 'barrel';
  barrel.position.y = height / 2;
  barrel.castShadow = barrel.receiveShadow = true;
  group.add(barrel);
  const foliage = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.9, 0.22, 6), palette.turfGrass);
  foliage.name = 'foliage';
  foliage.position.y = height + 0.09;
  foliage.castShadow = foliage.receiveShadow = true;
  group.add(foliage);
  return group;
}

function buildDenMarker(palette: VulperiaPalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'twig-den-marker';
  const height = 0.5 + rand() * 0.2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, height, 6), palette.timber);
  post.name = 'twig-post';
  post.position.y = height / 2;
  post.rotation.z = (rand() - 0.5) * 0.15;
  post.castShadow = post.receiveShadow = true;
  group.add(post);
  for (let i = 0; i < 3; i++) {
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.18, 5), palette.darkTimber);
    twig.name = `twig-${i}`;
    twig.position.set(0, height * (0.55 + i * 0.15), 0);
    twig.rotation.z = Math.PI / 2 + (rand() - 0.5) * 0.6;
    twig.rotation.y = rand() * Math.PI;
    twig.castShadow = twig.receiveShadow = true;
    group.add(twig);
  }
  return group;
}

function buildCrateStack(palette: VulperiaPalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'crate-stack';
  const count = 2 + Math.floor(rand() * 2);
  let y = 0;
  for (let i = 0; i < count; i++) {
    const size = 0.24 - i * 0.02;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.85, size), palette.timber);
    crate.name = `crate-${i}`;
    crate.position.set((rand() - 0.5) * 0.04, y + size * 0.425, (rand() - 0.5) * 0.04);
    crate.rotation.y = rand() * 0.4 - 0.2;
    crate.castShadow = crate.receiveShadow = true;
    group.add(crate);
    y += size * 0.85;
  }
  return group;
}

function buildLowFence(palette: VulperiaPalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'low-fence';
  const railCount = 3;
  const length = 0.7;
  for (let i = 0; i < railCount; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.035), palette.timber);
    post.name = `fence-post-${i}`;
    post.position.set(-length / 2 + (i / (railCount - 1)) * length, 0.14, 0);
    post.castShadow = post.receiveShadow = true;
    group.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.03, 0.03), palette.darkTimber);
  rail.name = 'fence-rail';
  rail.position.y = 0.22;
  rail.castShadow = rail.receiveShadow = true;
  group.add(rail);
  void rand;
  return group;
}

function buildLanternPost(palette: VulperiaPalette, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lantern-post-assembly';
  const postHeight = 0.95;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, postHeight, 8), palette.timber);
  post.name = 'post-shaft';
  post.position.y = postHeight / 2;
  post.castShadow = post.receiveShadow = true;
  group.add(post);

  const cage = buildLanternCage({ material: palette.bronze, paneMaterial: palette.glazing, lit: seed % 4 !== 0 });
  cage.name = 'lantern-cage';
  cage.position.y = postHeight + 0.08;
  group.add(cage);
  return group;
}

function buildPennant(palette: VulperiaPalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fox-tail-pennant';
  const poleHeight = 0.75 + rand() * 0.15;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, poleHeight, 6), palette.timber);
  pole.name = 'pennant-pole';
  pole.position.y = poleHeight / 2;
  pole.castShadow = pole.receiveShadow = true;
  group.add(pole);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 6), palette.greenAccent);
  tail.name = 'pennant-tail';
  tail.rotation.z = Math.PI / 2;
  tail.position.set(0.16, poleHeight * 0.85, 0);
  tail.castShadow = tail.receiveShadow = true;
  group.add(tail);
  return group;
}

/**
 * Builds a full ring of deterministic warren ground props
 * (`vulperia-lot-dressing` root, with named `vulperia-<kind>-N` children)
 * around a rectangular footprint of half-width `halfW` and half-depth
 * `halfD`, skipping the `entranceHalfWidth`-wide clearance lane centred
 * on the +Z (front) doorway.
 */
export function buildVulperiaLotDressing(options: VulperiaLotDressingOptions): THREE.Group {
  const { halfW, halfD, palette, seed } = options;
  const entranceHalfWidth = options.entranceHalfWidth ?? Math.min(halfW * 0.5, 0.55);
  const margin = 0.45;
  const rand = mulberry32(tagVulperiaSeed(seed, 'LOTD'));

  const group = new THREE.Group();
  group.name = 'vulperia-lot-dressing';

  const propCount = options.propCount ?? Math.max(3, Math.min(8, Math.round((halfW + halfD) * 1.3)));
  const sides: LotSide[] = ['left', 'right', 'back', 'front'];

  for (let i = 0; i < propCount; i++) {
    const side = sides[i % sides.length]!;
    const t = (i / propCount + rand() * 0.15) % 1;
    const [x, z] = slotPosition(side, t, halfW, halfD, margin, entranceHalfWidth);

    const kind = pickVulperiaWeighted<PropKind>(rand, [
      ['planter', 0.28],
      ['den-marker', 0.22],
      ['crate-stack', 0.2],
      ['fence', 0.14],
      ['lantern-post', 0.1],
      ['pennant', 0.06],
    ]);

    let prop: THREE.Group;
    switch (kind) {
      case 'planter': prop = buildPlanterBarrel(palette, rand); break;
      case 'den-marker': prop = buildDenMarker(palette, rand); break;
      case 'crate-stack': prop = buildCrateStack(palette, rand); break;
      case 'fence': prop = buildLowFence(palette, rand); prop.rotation.y = side === 'left' || side === 'right' ? Math.PI / 2 : 0; break;
      case 'lantern-post': prop = buildLanternPost(palette, seed + i); break;
      case 'pennant': default: prop = buildPennant(palette, rand); break;
    }
    prop.name = `vulperia-${kind}-${i}`;
    prop.position.x += x;
    prop.position.z += z;
    group.add(prop);
  }

  return group;
}
