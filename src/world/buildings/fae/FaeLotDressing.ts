import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { buildLanternCage } from '../kit/LanternKit';
import type { FaePalette } from './FaePalette';
import { pickFaeWeighted, tagFaeSeed } from './FaePalette';

/**
 * FaeLotDressing.ts — deterministic storybook ground-prop placement
 * (design spec `2026-09-04-fae-buildings-design.md`'s per-kind
 * "Ornament / props" rows: flower boxes, tiny mushroom clusters, vine
 * trellises, bunting lines, lantern posts). Mirrors
 * `VulperiaLotDressing.ts`'s fixed-lane placement scheme (props march
 * around the four footprint sides, skipping a clearance lane on the
 * front/+Z face so nothing ever blocks the doorway) with a fae prop
 * palette instead of a warren one.
 */

type LotSide = 'left' | 'right' | 'back' | 'front';
type PropKind = 'flower-box' | 'mushroom-cluster' | 'vine-trellis' | 'lantern-post' | 'bunting-line';

export interface FaeLotDressingOptions {
  halfW: number;
  halfD: number;
  palette: FaePalette;
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

/** A small planted box overflowing with petal-cone "flowers" — the
 * window-box-on-the-ground version of the fae reference art's flower
 * boxes, for lots that want the motif without a wall to hang it on. */
function buildFlowerBox(palette: FaePalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'flower-box';
  const width = 0.32 + rand() * 0.08;
  const boxHeight = 0.14;
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, boxHeight, width * 0.62), palette.darkBark);
  box.name = 'box';
  box.position.y = boxHeight / 2;
  box.castShadow = box.receiveShadow = true;
  group.add(box);

  const bloomCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < bloomCount; i++) {
    const bloom = new THREE.Mesh(new THREE.ConeGeometry(0.035 + rand() * 0.015, 0.09 + rand() * 0.03, 5), palette.petal);
    bloom.name = `bloom-${i}`;
    bloom.position.set(
      (rand() - 0.5) * width * 0.75,
      boxHeight + 0.03,
      (rand() - 0.5) * width * 0.4,
    );
    bloom.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
    bloom.castShadow = bloom.receiveShadow = true;
    group.add(bloom);
  }
  return group;
}

/** A tiny cluster of stalk-and-cap mushrooms -- the fungal-forest-floor
 * accent the fae reference art scatters at every doorstep. */
function buildMushroomCluster(palette: FaePalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mushroom-cluster';
  const count = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const mushroom = new THREE.Group();
    mushroom.name = `mushroom-${i}`;
    const stalkHeight = 0.06 + rand() * 0.05;
    const stalkRadius = 0.012 + rand() * 0.006;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(stalkRadius, stalkRadius * 1.2, stalkHeight, 6), palette.gill);
    stalk.name = 'stalk';
    stalk.position.y = stalkHeight / 2;
    stalk.castShadow = stalk.receiveShadow = true;
    mushroom.add(stalk);

    const capRadius = stalkRadius * (2.6 + rand() * 1.4);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(capRadius, capRadius * 0.9, 8), palette.cap);
    cap.name = 'cap';
    cap.position.y = stalkHeight + capRadius * 0.3;
    cap.castShadow = cap.receiveShadow = true;
    mushroom.add(cap);

    mushroom.position.set((rand() - 0.5) * 0.16, 0, (rand() - 0.5) * 0.16);
    mushroom.rotation.y = rand() * Math.PI;
    group.add(mushroom);
  }
  return group;
}

/** A short post with draped vine tendrils curling down its length --
 * built from short overlapping tapered cylinder segments so the curl
 * reads as a real bent branch of parts, never a smooth bent tube. */
function buildVineTrellis(palette: FaePalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vine-trellis';
  const postHeight = 0.55 + rand() * 0.15;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, postHeight, 6), palette.darkBark);
  post.name = 'post';
  post.position.y = postHeight / 2;
  post.castShadow = post.receiveShadow = true;
  group.add(post);

  const segmentCount = 5;
  let segY = postHeight * 0.85;
  let segAngle = 0;
  for (let i = 0; i < segmentCount; i++) {
    const segLen = 0.08 + rand() * 0.03;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, segLen, 5), palette.vine);
    seg.name = `vine-segment-${i}`;
    segAngle += 0.35 + rand() * 0.25;
    seg.position.set(Math.sin(segAngle) * 0.05 * i, segY, Math.cos(segAngle) * 0.05 * i * 0.4 + 0.04);
    seg.rotation.z = segAngle;
    seg.castShadow = seg.receiveShadow = true;
    group.add(seg);
    segY -= segLen * 0.75;
  }
  return group;
}

function buildLanternPost(palette: FaePalette, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lantern-post-assembly';
  const postHeight = 0.85;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, postHeight, 8), palette.darkBark);
  post.name = 'post-shaft';
  post.position.y = postHeight / 2;
  post.castShadow = post.receiveShadow = true;
  group.add(post);

  const cage = buildLanternCage({ material: palette.bronze, paneMaterial: palette.glow, lit: seed % 4 !== 0 });
  cage.name = 'lantern-cage';
  cage.position.y = postHeight + 0.08;
  group.add(cage);
  return group;
}

/** Two short posts joined by a sagging line of small petal-pennant
 * bunting flags -- the "dense handmade props" festival read. */
function buildBuntingLine(palette: FaePalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bunting-line';
  const span = 0.55 + rand() * 0.2;
  const postHeight = 0.4 + rand() * 0.08;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, postHeight, 6), palette.darkBark);
    post.name = `bunting-post-${side}`;
    post.position.set((span / 2) * side, postHeight / 2, 0);
    post.castShadow = post.receiveShadow = true;
    group.add(post);
  }

  const flagCount = 6;
  for (let i = 0; i < flagCount; i++) {
    const t = i / (flagCount - 1);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 4), palette.petal);
    flag.name = `bunting-flag-${i}`;
    const sag = Math.sin(t * Math.PI) * 0.06;
    flag.position.set((t * 2 - 1) * (span / 2), postHeight - sag, 0);
    flag.rotation.x = Math.PI;
    flag.rotation.y = rand() * 0.3;
    flag.castShadow = flag.receiveShadow = true;
    group.add(flag);
  }
  return group;
}

/**
 * Builds a full ring of deterministic storybook ground props
 * (`fae-lot-dressing` root, with named `fae-<kind>-N` children) around a
 * rectangular footprint of half-width `halfW` and half-depth `halfD`,
 * skipping the `entranceHalfWidth`-wide clearance lane centred on the
 * +Z (front) doorway.
 */
export function buildFaeLotDressing(options: FaeLotDressingOptions): THREE.Group {
  const { halfW, halfD, palette, seed } = options;
  const entranceHalfWidth = options.entranceHalfWidth ?? Math.min(halfW * 0.5, 0.55);
  const margin = 0.4;
  const rand = mulberry32(tagFaeSeed(seed, 'LOTD'));

  const group = new THREE.Group();
  group.name = 'fae-lot-dressing';

  const propCount = options.propCount ?? Math.max(3, Math.min(8, Math.round((halfW + halfD) * 1.3)));
  const sides: LotSide[] = ['left', 'right', 'back', 'front'];

  for (let i = 0; i < propCount; i++) {
    const side = sides[i % sides.length]!;
    const t = (i / propCount + rand() * 0.15) % 1;
    const [x, z] = slotPosition(side, t, halfW, halfD, margin, entranceHalfWidth);

    const kind = pickFaeWeighted<PropKind>(rand, [
      ['flower-box', 0.28],
      ['mushroom-cluster', 0.26],
      ['vine-trellis', 0.18],
      ['lantern-post', 0.14],
      ['bunting-line', 0.14],
    ]);

    let prop: THREE.Group;
    switch (kind) {
      case 'flower-box': prop = buildFlowerBox(palette, rand); break;
      case 'mushroom-cluster': prop = buildMushroomCluster(palette, rand); break;
      case 'vine-trellis': prop = buildVineTrellis(palette, rand); break;
      case 'lantern-post': prop = buildLanternPost(palette, seed + i); break;
      case 'bunting-line': default: prop = buildBuntingLine(palette, rand); prop.rotation.y = side === 'left' || side === 'right' ? Math.PI / 2 : 0; break;
    }
    prop.name = `fae-${kind}-${i}`;
    prop.position.x += x;
    prop.position.z += z;
    group.add(prop);
  }

  return group;
}
