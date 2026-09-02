/**
 * StoneTowerRoofCap.ts — the two roof-cap variants for the elven
 * stone-tower kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): a classic conical
 * shingle roof (this task), and a living-canopy cap where the stone
 * shaft transitions into actual foliage (added in the next task) --
 * the clearest "hybrid stone + living tree" moment in the whole kit.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { createBlockGrid, setBlock, meshBlockGrid, BLOCK_UNIT } from './BlockKit';

/**
 * Classic conical shingle roof cap. A slight eave overhang (radius
 * *1.15) matches real tower-roof construction (the roof oversails the
 * wall below it). Relies on the material's own texture map (this kit's
 * caller passes a slateTexture()-mapped material) for shingle detail --
 * unlike the wall surface, this spec scoped the texture-vs-geometry
 * comparison to the wall only (see design spec's Testing section), so
 * the roof stays a single low-poly cone.
 */
export function buildClassicRoofCap(radius: number, coneHeight: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(radius * 1.15, coneHeight, 8);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = coneHeight / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/** Materials for the living-canopy roof cap. */
export interface LivingCapPalette {
  leaf: THREE.Material;
  bark: THREE.Material;
}

/**
 * Living-canopy roof cap: the stone shaft transitions into an actual
 * foliage crown -- the clearest "hybrid stone + living tree" moment in
 * the kit. Deliberately a small, dedicated BlockKit grid (NOT a call
 * into the existing buildElvenTrunkGrid(), which is coupled to being an
 * entire trunk-to-canopy shape and isn't designed to be composed as a
 * cap sitting on a separate stone shaft) -- 3 tiers: a narrow bark
 * "neck" matching the shaft below, a wide central bulge, and a leaf
 * taper to a near-point at the top. Deliberately simple (a single
 * circular-cross-section bulge per tier, no satellite lobes/branches)
 * to avoid the "muddy brown blob" failure mode documented elsewhere in
 * this codebase's elven trunk code -- this is a small cap, not a whole
 * tree, so it doesn't need that system's full complexity.
 */
export function buildLivingRoofCap(seed: number, radius: number, palette: LivingCapPalette): THREE.Group {
  const grid = createBlockGrid();
  const rand = mulberry32(seed);
  const bw = Math.max(3, Math.round((radius * 2.4) / BLOCK_UNIT));
  const bd = bw;
  const bh = Math.max(3, Math.round((radius * 2.0) / BLOCK_UNIT));
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz);

  function tierRadiusFrac(level: number): number {
    const t = level / Math.max(1, bh - 1);
    if (t < 0.3) return 0.5 + (t / 0.3) * 0.5;        // 0.5 -> 1.0 (flare out from the neck)
    if (t < 0.7) return 1.0;                          // full bulge
    return 1.0 - ((t - 0.7) / 0.3) * 0.85;             // 1.0 -> 0.15 (taper to near-point)
  }

  for (let by = 0; by < bh; by++) {
    const tierR = maxR * tierRadiusFrac(by);
    const isNeck = by < bh * 0.15;
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const d = Math.hypot(bx - cx, bz - cz);
        if (d <= tierR + (rand() - 0.5) * 0.4) {
          setBlock(grid, bx, by, bz, isNeck ? 'bark' : 'leaf');
        }
      }
    }
  }

  const mesh = meshBlockGrid(grid, { bark: palette.bark, leaf: palette.leaf });
  mesh.position.x -= cx * BLOCK_UNIT;
  mesh.position.z -= cz * BLOCK_UNIT;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Materials for whichever roof-cap variant buildTowerRoofCap() picks. */
export interface RoofCapPalette {
  shingle: THREE.Material;
  leaf: THREE.Material;
  bark: THREE.Material;
}

/**
 * Picks a roof-cap style (classic conical shingle vs. living canopy)
 * from `seed`: 40% living, 60% classic -- most towers keep the classic
 * silhouette, with the living cap as a distinctive rarer variant.
 */
export function buildTowerRoofCap(seed: number, radius: number, coneHeight: number, palette: RoofCapPalette): THREE.Group {
  const rand = mulberry32(seed);
  const useLiving = rand() < 0.4;
  return useLiving
    ? buildLivingRoofCap(seed ^ 0x1DEA, radius, { leaf: palette.leaf, bark: palette.bark })
    : buildClassicRoofCap(radius, coneHeight, palette.shingle);
}
