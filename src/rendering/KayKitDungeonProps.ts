/**
 * KayKitDungeonProps — injects KayKit Dungeon Remastered atmospheric props
 * into a loaded dungeon room: wall torches, corner pillars, scattered barrels
 * and crates.  Call once after each room loads via SceneManager.onRoomLoaded.
 *
 * Props are added to a THREE.Group returned by addPropsToRoom(); the caller
 * is responsible for adding/removing that group from the scene.
 */

import * as THREE from 'three';
import type { Blueprint } from '@/levels/blueprint';
import type { AssetLoader } from '@/assets/AssetLoader';

// ── Asset paths (KayKit Dungeon Remastered — GLTF format) ────────────────────

const TORCH_LIT   = '/assets/kaykit_dungeon/torch_lit.gltf';
const TORCH_MOUNT = '/assets/kaykit_dungeon/torch_mounted.gltf';
const PILLAR      = '/assets/kaykit_dungeon/pillar.gltf';
const PILLAR_DEC  = '/assets/kaykit_dungeon/pillar_decorated.gltf';
const BARREL      = '/assets/kaykit_dungeon/barrel_large.gltf';
const BARREL_SML  = '/assets/kaykit_dungeon/barrel_small.gltf';
const BARREL_STCK = '/assets/kaykit_dungeon/barrel_small_stack.gltf';
const CRATES      = '/assets/kaykit_dungeon/crates_stacked.gltf';
const CHEST       = '/assets/kaykit_dungeon/chest.gltf';
const CHEST_GOLD  = '/assets/kaykit_dungeon/chest_gold.gltf';

const ALL_PATHS = [
  TORCH_LIT, TORCH_MOUNT, PILLAR, PILLAR_DEC,
  BARREL, BARREL_SML, BARREL_STCK, CRATES, CHEST, CHEST_GOLD,
];

/** Tiny seeded RNG so props are deterministic per room. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
    z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}

/** Preload all dungeon prop assets. Call once; safe to call multiple times. */
export async function preloadDungeonProps(loader: AssetLoader): Promise<void> {
  await loader.preload(ALL_PATHS);
}

/**
 * Populate a room with KayKit dungeon atmospheric props.
 * @param bp      Validated Blueprint for the current room.
 * @param loader  Shared AssetLoader instance.
 * @param roomId  Unique room ID (used to seed deterministic RNG).
 * @returns       A THREE.Group containing all placed props; add to scene.
 */
export function addPropsToRoom(
  bp: Blueprint,
  loader: AssetLoader,
  roomId: string,
): THREE.Group {
  const group = new THREE.Group();
  group.name  = `dungeonProps_${roomId}`;

  const rng   = mulberry32(roomId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  const bpW   = bp.width  * bp.cellSize;  // world-space room width
  const bpD   = bp.depth  * bp.cellSize;  // world-space room depth
  const half  = (x: number) => x * 0.5;

  // ── 1. Wall torches — 2-4 per room, near walls ────────────────────────────
  const torchCount = 2 + Math.floor(rng() * 3); // 2..4
  for (let i = 0; i < torchCount; i++) {
    const useMounted = rng() > 0.4;
    const model = loader.getClone(useMounted ? TORCH_MOUNT : TORCH_LIT);
    if (!model) continue;
    model.scale.setScalar(0.8);

    // Place along a wall edge (alternating N/S/E/W sides)
    const side = i % 4;
    let tx = 0, tz = 0, ry = 0;
    const margin = 0.6;
    const spread = rng() * 0.6 - 0.3;
    switch (side) {
      case 0: tx = spread * bpW; tz = -half(bpD) + margin; ry = 0;            break; // S wall
      case 1: tx = spread * bpW; tz =  half(bpD) - margin; ry = Math.PI;      break; // N wall
      case 2: tx = -half(bpW) + margin; tz = spread * bpD; ry = Math.PI / 2;  break; // W wall
      case 3: tx =  half(bpW) - margin; tz = spread * bpD; ry = -Math.PI / 2; break; // E wall
    }
    model.position.set(tx, 1.8, tz);
    model.rotation.y = ry;
    group.add(model);
  }

  // ── 2. Corner pillars — 0 or 1 per corner (for larger rooms) ─────────────
  if (bpW >= 8 && bpD >= 8) {
    const corners: [number, number][] = [
      [-half(bpW) + 1.0, -half(bpD) + 1.0],
      [ half(bpW) - 1.0, -half(bpD) + 1.0],
      [-half(bpW) + 1.0,  half(bpD) - 1.0],
      [ half(bpW) - 1.0,  half(bpD) - 1.0],
    ];
    for (const [cx, cz] of corners) {
      if (rng() < 0.65) {
        const model = loader.getClone(rng() > 0.5 ? PILLAR_DEC : PILLAR);
        if (!model) continue;
        model.scale.setScalar(0.9);
        model.position.set(cx, 0, cz);
        group.add(model);
      }
    }
  }

  // ── 3. Scattered barrels/crates (1–3 clusters in corners or along walls) ──
  const clusterCount = 1 + Math.floor(rng() * 2); // 1..2
  for (let i = 0; i < clusterCount; i++) {
    // Pick a random wall corner area
    const side = Math.floor(rng() * 4);
    const ox = (side === 0 || side === 2) ? -half(bpW) + 1.5 + rng() * 0.8 :  half(bpW) - 1.5 - rng() * 0.8;
    const oz = (side < 2)                 ? -half(bpD) + 1.5 + rng() * 0.8 :  half(bpD) - 1.5 - rng() * 0.8;

    const propPaths = [BARREL, BARREL_SML, BARREL_STCK, CRATES];
    const propPath  = propPaths[Math.floor(rng() * propPaths.length)]!;
    const model = loader.getClone(propPath);
    if (!model) continue;
    model.scale.setScalar(0.8);
    model.position.set(ox, 0, oz);
    model.rotation.y = rng() * Math.PI * 2;
    group.add(model);
  }

  return group;
}

/** KayKit scale constants for reference — models are in 1-unit scale. */
export const KAYKIT_DUNGEON_SCALE = {
  torch:  0.8,
  pillar: 0.9,
  barrel: 0.8,
  chest:  0.75,
};
