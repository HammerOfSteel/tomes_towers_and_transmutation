/**
 * NatureAssetRecipes.ts — declarative archetype recipes + the generic
 * `assembleFromRecipe()` assembler that replaces OverworldScene's ~10
 * bespoke `_build*Tree()`/`_makeRock()`/`_makeBush()` methods.
 *
 * Each recipe is a small `{ partType, count, arrangement }` list consumed by
 * one shared assembler, instead of one hand-written builder method per
 * archetype. Part-type geometry variety comes from `NaturePartPools.ts`;
 * this module only decides HOW MANY of which part-type go where, not what
 * the geometry itself looks like — see
 * docs/superpowers/specs/2026-09-21-procedural-nature-asset-kit-design.md §3.2
 * and docs/superpowers/plans/2026-09-21-procedural-nature-asset-kit.md Task 2.
 *
 * Deliberately has NO THREE.Material/texture dependency (only THREE.Vector3/
 * Euler for pure geometric placement) — texture-family assignment happens in
 * NatureAssetBuilder.ts/OverworldScene.ts, kept separate per the design
 * spec's texture-family/part-type separation.
 */
import * as THREE from 'three';
import { getPartVariantPool, type PartType } from '@/world/NaturePartPools';

export type Arrangement = 'stacked' | 'radial-ring' | 'side-arms';

export interface RecipePart {
  partType: PartType;
  /** Material pool key — resolved to an actual THREE.Material by the caller
   *  (OverworldScene's `_natureMaterialFor()`), keeping this module free of
   *  any THREE.Material dependency. */
  materialKey: string;
  arrangement: Arrangement;
  /** Fixed count, or an inclusive [min, max] rolled per-assembly via `rand()`. */
  count: number | [number, number];
  /** World-unit XZ radius range for this part's unit geometry. */
  radiusRange: [number, number];
  /** World-unit height (Y scale) range. Omit to reuse `radiusRange` (near-spherical). */
  heightRange?: [number, number];
  /** Z-axis flatten multiplier (paddle/dome/slab shapes) — 1 = no flatten. */
  zFlatten?: number;
  /** For `radial-ring`: ring radius (distance from the trunk axis) range. */
  ringRadiusRange?: [number, number];
  /** For `stacked`: fraction of this part's own height that overlaps the part
   *  stacked below it (0.7 = next part starts 70% of the way up this one). */
  stackOverlap?: number;
  /** For `side-arms`: fraction of the accumulated stack height where this arm attaches. */
  attachHeightRange?: [number, number];
}

export interface AssetRecipe {
  parts: RecipePart[];
}

const lerp = (rand: () => number, r: [number, number]): number => r[0] + rand() * (r[1] - r[0]);

export const ARCHETYPE_RECIPES: Record<string, AssetRecipe> = {
  // ── Trees ──────────────────────────────────────────────────────────────
  conifer: {
    parts: [
      { partType: 'trunk', materialKey: 'tree-trunk', arrangement: 'stacked', count: 1, radiusRange: [0.12, 0.19], heightRange: [1.6, 2.8] },
      { partType: 'canopy-blob', materialKey: 'conifer-lower', arrangement: 'stacked', count: 1, radiusRange: [0.85, 1.4], heightRange: [1.6, 2.5], stackOverlap: 0.55 },
      { partType: 'canopy-blob', materialKey: 'conifer-upper', arrangement: 'stacked', count: 1, radiusRange: [0.55, 0.9], heightRange: [1.1, 1.7], stackOverlap: 0.6 },
    ],
  },
  deciduous: {
    parts: [
      { partType: 'trunk', materialKey: 'tree-trunk', arrangement: 'stacked', count: 1, radiusRange: [0.16, 0.24], heightRange: [1.3, 2.2] },
      { partType: 'canopy-blob', materialKey: 'deciduous', arrangement: 'radial-ring', count: 3, radiusRange: [0.65, 1.1], ringRadiusRange: [0.35, 0.6] },
    ],
  },
  sparse: {
    parts: [
      { partType: 'trunk', materialKey: 'sparse-trunk', arrangement: 'stacked', count: 1, radiusRange: [0.08, 0.12], heightRange: [1.8, 3.2] },
      { partType: 'canopy-blob', materialKey: 'sparse-foliage', arrangement: 'radial-ring', count: [2, 3], radiusRange: [0.25, 0.45], ringRadiusRange: [0.2, 0.5] },
    ],
  },
  acacia: {
    parts: [
      { partType: 'trunk', materialKey: 'acacia-trunk', arrangement: 'stacked', count: 1, radiusRange: [0.1, 0.15], heightRange: [1.3, 2.0] },
      { partType: 'canopy-blob', materialKey: 'acacia-canopy', arrangement: 'radial-ring', count: [5, 6], radiusRange: [0.55, 0.9], heightRange: [0.2, 0.35], ringRadiusRange: [0.85, 1.35] },
      { partType: 'canopy-blob', materialKey: 'acacia-canopy', arrangement: 'radial-ring', count: 1, radiusRange: [0.6, 0.95], heightRange: [0.22, 0.38], ringRadiusRange: [0, 0] },
    ],
  },
  joshuatree: {
    parts: [
      { partType: 'trunk', materialKey: 'joshuatree-trunk', arrangement: 'stacked', count: 1, radiusRange: [0.14, 0.19], heightRange: [1.2, 2.2] },
      { partType: 'branch-arm', materialKey: 'joshuatree-trunk', arrangement: 'side-arms', count: [1, 3], radiusRange: [0.08, 0.12], heightRange: [0.5, 1.0], attachHeightRange: [0.45, 0.85] },
      { partType: 'branch-arm', materialKey: 'joshuatree-spike', arrangement: 'radial-ring', count: [7, 11], radiusRange: [0.02, 0.03], heightRange: [0.16, 0.28], ringRadiusRange: [0.05, 0.12] },
    ],
  },
  'cactus-saguaro': {
    parts: [
      { partType: 'trunk', materialKey: 'cactus-saguaro', arrangement: 'stacked', count: 1, radiusRange: [0.16, 0.23], heightRange: [1.6, 3.0] },
      { partType: 'branch-arm', materialKey: 'cactus-saguaro', arrangement: 'side-arms', count: [0, 2], radiusRange: [0.11, 0.16], heightRange: [0.5, 1.0], attachHeightRange: [0.35, 0.7] },
    ],
  },
  'cactus-barrel': {
    parts: [
      { partType: 'trunk', materialKey: 'cactus-barrel', arrangement: 'stacked', count: 1, radiusRange: [0.32, 0.5], heightRange: [0.42, 0.8] },
      { partType: 'canopy-blob', materialKey: 'cactus-barrel', arrangement: 'stacked', count: 1, radiusRange: [0.28, 0.44], heightRange: [0.2, 0.3], stackOverlap: 0.9 },
    ],
  },
  'cactus-pricklypear': {
    parts: [
      { partType: 'canopy-blob', materialKey: 'cactus-pad', arrangement: 'stacked', count: [2, 4], radiusRange: [0.38, 0.6], heightRange: [0.42, 0.64], zFlatten: 0.26, stackOverlap: 0.35 },
    ],
  },

  // ── Rocks ──────────────────────────────────────────────────────────────
  'rock-boulder': {
    parts: [
      { partType: 'rock-chunk', materialKey: 'rock', arrangement: 'stacked', count: 1, radiusRange: [0.48, 1.32] },
    ],
  },
  'rock-slab': {
    parts: [
      { partType: 'rock-chunk', materialKey: 'rock', arrangement: 'stacked', count: 1, radiusRange: [0.6, 1.5], heightRange: [0.2, 0.5], zFlatten: 0.85 },
    ],
  },
  'rock-cluster': {
    parts: [
      { partType: 'rock-chunk', materialKey: 'rock', arrangement: 'radial-ring', count: 3, radiusRange: [0.2, 0.5], ringRadiusRange: [0.2, 0.35] },
    ],
  },

  // ── Bush ───────────────────────────────────────────────────────────────
  bush: {
    parts: [
      { partType: 'canopy-blob', materialKey: 'bush', arrangement: 'radial-ring', count: [2, 4], radiusRange: [0.22, 0.42], ringRadiusRange: [0, 0.22], heightRange: [0.16, 0.3] },
    ],
  },
};

/** One assembled part instance, ready for the caller to place into either a
 *  visible InstancedMesh (`NaturePropField`) or a plain `THREE.Group` (dev/
 *  test rendering, non-instanced fallback). Positions/rotations are LOCAL to
 *  the archetype's own origin — the caller positions the whole assembled
 *  asset in world space, mirroring `_makeTree()`'s old "unpositioned group"
 *  contract. */
export interface AssembledPart {
  partType: PartType;
  variantIndex: number;
  materialKey: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

/** Pure function: rolls one archetype instance's part list deterministically
 *  from `rand`. No THREE.Object3D/Mesh construction here — callers decide how
 *  to render. `variantIndex` is picked against each part-type's REAL pool size
 *  (via `getPartVariantPool().length`), never a hardcoded count, so a future
 *  change to `VARIANT_COUNTS` in `NaturePartPools.ts` can't silently produce
 *  out-of-range indices here. */
export function assembleFromRecipe(recipe: AssetRecipe, rand: () => number): AssembledPart[] {
  const parts: AssembledPart[] = [];
  let stackY = 0;

  for (const part of recipe.parts) {
    const count = Array.isArray(part.count)
      ? part.count[0] + Math.floor(rand() * (part.count[1] - part.count[0] + 1))
      : part.count;
    const poolSize = getPartVariantPool(part.partType).length;
    const zFlatten = part.zFlatten ?? 1;

    for (let i = 0; i < count; i++) {
      const variantIndex = Math.floor(rand() * poolSize);
      const radius = lerp(rand, part.radiusRange);
      const height = part.heightRange ? lerp(rand, part.heightRange) : radius;

      let position = new THREE.Vector3(0, 0, 0);
      let rotation = new THREE.Euler(0, 0, 0);

      if (part.arrangement === 'stacked') {
        const overlap = part.stackOverlap ?? 0.7;
        const y = stackY + height * 0.5;
        position = new THREE.Vector3(0, y, 0);
        stackY += height * overlap;
      } else if (part.arrangement === 'radial-ring') {
        const ringR = part.ringRadiusRange ? lerp(rand, part.ringRadiusRange) : 0;
        const angle = count > 1 ? (i / count) * Math.PI * 2 + rand() * 0.6 : rand() * Math.PI * 2;
        const baseY = stackY > 0 ? stackY : height * 0.5;
        position = new THREE.Vector3(Math.cos(angle) * ringR, baseY, Math.sin(angle) * ringR);
        rotation = new THREE.Euler(0, angle, 0);
      } else { // side-arms
        const side = i % 2 === 0 ? 1 : -1;
        const attachFrac = part.attachHeightRange ? lerp(rand, part.attachHeightRange) : 0.5;
        const attachY = stackY * attachFrac;
        position = new THREE.Vector3(side * (radius + 0.05), attachY + height * 0.5, 0);
        rotation = new THREE.Euler(0, 0, side * 0.35);
      }

      parts.push({
        partType: part.partType, variantIndex, materialKey: part.materialKey,
        position, rotation,
        scale: new THREE.Vector3(radius, height, radius * zFlatten),
      });
    }
  }
  return parts;
}
