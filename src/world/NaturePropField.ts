/**
 * NaturePropField.ts — player-radius `THREE.InstancedMesh` fields for
 * trees/rocks/bushes, directly mirroring `GrassField.ts`'s existing
 * architecture (one field per unique geometry/material combo, hysteresis-
 * gated rebuild, no per-chunk instance-slot bookkeeping).
 *
 * Position generation (`selectNaturePropPlacements()`) reuses
 * `generateChunkScatterCandidates()` (Task 3) so every visual instance
 * lands at the exact same world position `_buildChunkScatter()`'s (now
 * collider-only) placeholder objects use for the same chunk — see
 * docs/superpowers/plans/2026-09-21-procedural-nature-asset-kit.md's
 * "Physics/visual position parity" section.
 */
import * as THREE from 'three';
import type { WorldGrid } from '@/world/WorldGrid';
import { CHUNK_SIZE, chunksWithinRadius, worldToChunkCoord, type ChunkCoord } from '@/world/ChunkManager';
import { generateChunkScatterCandidates, type NatureScatterKind } from '@/world/NatureScatterPoints';
import { isScatterAllowed } from '@/world/ScatterRules';
import { pickTreeArchetype, pickRockArchetype, pickCactusVariant } from '@/world/NatureAssetDNA';
import { ARCHETYPE_RECIPES, assembleFromRecipe } from '@/world/NatureAssetRecipes';
import { getPartVariantPool, type PartType } from '@/world/NaturePartPools';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';

/** Wider than GrassField's GRASS_RADIUS (24) — trees/rocks/bushes are sparse
 *  enough (5.5-8 WU minDist vs. grass's sub-1WU spacing) that a larger visible
 *  radius costs far fewer instances than widening grass would. */
export const NATURE_PROP_RADIUS = 48;
export const NATURE_PROP_REBUILD_HYSTERESIS = 12;

export interface NaturePropGridInfo {
  GHW: number;
  GHH: number;
  T: number;
  /** Tower flat-zone radius, in tiles — same `_FR` OverworldScene derives as
   *  `Math.round(GHW * 0.28)`. Used to reproduce the exact tower clear-zone
   *  and bush inner/outer bounds `_buildChunkScatter()`/`_buildChunkBushes()`
   *  applied around scatter candidates. */
  FR: number;
}

export interface NaturePropInstance {
  /** World position of the whole assembled asset (tree/rock/bush root) —
   *  NOT this individual part's final position. */
  worldPosition: THREE.Vector3;
  /** This part's local offset from the asset root, per `assembleFromRecipe()`. */
  localOffset: THREE.Vector3;
  /** Whole-asset yaw (the old per-tree/rock `rand() * 2π` rotation). */
  rotationY: number;
  /** This part's own local rotation, per `assembleFromRecipe()`. */
  localRotation: THREE.Euler;
  scale: THREE.Vector3;
}

/** Builds the `partType|variantIndex|materialKey` grouping key used both here
 *  and by `NaturePropManager` to route each assembled part to its own field. */
function partGroupKey(partType: PartType, variantIndex: number, materialKey: string): string {
  return `${partType}|${variantIndex}|${materialKey}`;
}

/**
 * Scans chunk coordinates overlapping a player-centered `radius` square,
 * regenerates each one's deterministic scatter candidates via
 * `generateChunkScatterCandidates()`, filters through the same
 * tower-clear-zone / bush-bounds / `isScatterAllowed()` rules
 * `_buildChunkScatter()`/`_buildChunkBushes()` used to apply inline, picks
 * an archetype via `NatureAssetDNA`, and assembles it via
 * `assembleFromRecipe()`. Returns one `NaturePropInstance` per assembled
 * PART (not per tree), grouped by `partGroupKey()` so the caller can hand
 * each group straight to one `NaturePropField`'s instance buffer.
 */
export function selectNaturePropPlacements(
  wg: WorldGrid,
  playerX: number,
  playerZ: number,
  radius: number,
  seed: number,
  kind: NatureScatterKind,
  gridInfo: NaturePropGridInfo,
): Map<string, NaturePropInstance[]> {
  const groups = new Map<string, NaturePropInstance[]>();
  const { GHW, GHH, T, FR } = gridInfo;
  const chunkWorldSize = T * CHUNK_SIZE;
  const centerCoord = worldToChunkCoord(playerX, playerZ, T, CHUNK_SIZE);
  const chunkRadius = Math.ceil(radius / chunkWorldSize) + 1; // +1 guards against a candidate near a chunk edge falling just outside a too-tight radius
  const coords: ChunkCoord[] = chunksWithinRadius(centerCoord, chunkRadius);

  // Same per-kind distance bounds `_buildChunkScatter()`/`_buildChunkBushes()`
  // applied inline (tower clear-zone for tree/rock, inner+outer band for bush).
  const innerBound = kind === 'tree' ? FR * T + 5 : kind === 'rock' ? FR * T + 6 : FR * T + 4;
  const outerBound = kind === 'bush' ? GHW * T * 0.90 : Infinity;

  for (const coord of coords) {
    const candidates = generateChunkScatterCandidates(coord, seed, kind, { GHW, GHH, T, chunkSize: CHUNK_SIZE });
    for (const { wx, wz, rand } of candidates) {
      const dFromOrigin = Math.sqrt(wx * wx + wz * wz);
      if (dFromOrigin < innerBound || dFromOrigin > outerBound) continue;
      if (kind === 'bush') {
        // Same 1-in-~3 acceptance thinning `_buildChunkBushes()` applied —
        // bushes' tighter 3.2 minDist would otherwise be too dense.
        if (rand() > 0.35) continue;
      }

      const d2 = (wx - playerX) ** 2 + (wz - playerZ) ** 2;
      if (d2 > radius * radius) continue;
      const col = Math.floor(wx / T + GHW);
      const row = Math.floor(wz / T + GHH);
      if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;
      const cell = wg.get(col, row);
      if (!isScatterAllowed(cell, kind)) continue;

      const archetypeKey = kind === 'tree' ? (
          pickTreeArchetype(cell.biome, wx, wz) === 'cactus'
            ? `cactus-${pickCactusVariant(wx, wz)}`
            : pickTreeArchetype(cell.biome, wx, wz)
        )
        : kind === 'rock' ? `rock-${pickRockArchetype(wx, wz)}`
        : 'bush';
      const recipe = ARCHETYPE_RECIPES[archetypeKey];
      if (!recipe) continue;
      const assembled = assembleFromRecipe(recipe, rand);
      const wholeYaw = rand() * Math.PI * 2;

      for (const part of assembled) {
        const key = partGroupKey(part.partType, part.variantIndex, part.materialKey);
        const arr = groups.get(key) ?? [];
        arr.push({
          worldPosition: new THREE.Vector3(wx, cell.elevation * LEVEL_HEIGHT, wz),
          localOffset: part.position,
          rotationY: wholeYaw,
          localRotation: part.rotation,
          scale: part.scale,
        });
        groups.set(key, arr);
      }
    }
  }
  return groups;
}

/** One InstancedMesh for a single (partType, variantIndex, materialKey) combo —
 *  directly mirrors `GrassField`'s constructor/update/dispose shape.
 *  `maxInstances` is a hard capacity ceiling (mirrors `GrassPreset.maxBlades`);
 *  placements beyond it are dropped (same truncation convention as
 *  `GrassField.update()`'s `Math.min(placements.length, maxBlades)`).
 *  Does NOT own or dispose its `geometry` — that's a shared, pool-cached
 *  reference from `NaturePartPools.ts` (built once, reused by every field
 *  that happens to need that same geometry variant); only this field's own
 *  `material` is field-owned and disposed. */
export class NaturePropField {
  readonly mesh: THREE.InstancedMesh;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private readonly _maxInstances: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, _maxInstances);
    this.mesh.frustumCulled = false; // instances can span well beyond any static local bounds
    this.mesh.count = 0;
  }

  /** Rebuilds this field's instance-matrix buffer from a fresh placement list. */
  rebuild(instances: NaturePropInstance[]): void {
    const count = Math.min(instances.length, this._maxInstances);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const yawEuler = new THREE.Euler();
    const worldPos = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const inst = instances[i]!;
      e.set(inst.localRotation.x, inst.localRotation.y + inst.rotationY, inst.localRotation.z);
      q.setFromEuler(e);
      yawEuler.set(0, inst.rotationY, 0);
      worldPos.copy(inst.localOffset).applyEuler(yawEuler).add(inst.worldPosition);
      m.compose(worldPos, q, inst.scale);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Disposes only this field's own material — `mesh.geometry` is a
   *  pool-shared reference owned by `NaturePartPools.ts` and must survive. */
  dispose(): void {
    (this.mesh.material as THREE.Material).dispose();
  }
}

export type NatureMaterialLookup = (materialKey: string, rand: () => number) => THREE.Material;

/**
 * Owns one `NaturePropField` per unique `(partType, variantIndex,
 * materialKey)` key across trees/rocks/bushes combined, mirroring
 * `OverworldScene`'s `_grassFields: GrassField[]` ownership pattern (one
 * array of field-like objects, added/removed from the scene together,
 * updated together per frame).
 *
 * Deliberately has no THREE.Material/texture-family knowledge of its own —
 * it receives a `materialLookup` callback (wired to `OverworldScene`'s
 * `_natureMaterialFor()` in Task 6) so texture-family assignment stays in
 * `NatureAssetBuilder.ts`/`OverworldScene.ts`, per the design spec's
 * part-type/texture-family separation.
 */
export class NaturePropManager {
  private readonly _fields = new Map<string, NaturePropField>();
  private _lastX = Infinity;
  private _lastZ = Infinity;

  constructor(
    private readonly _wg: WorldGrid,
    private readonly _seed: number,
    private readonly _gridInfo: NaturePropGridInfo,
    private readonly _materialLookup: NatureMaterialLookup,
    private readonly _radius = NATURE_PROP_RADIUS,
    private readonly _maxInstancesPerField = 4000,
  ) {}

  /** All meshes currently owned — for scene.add/remove wiring. */
  get meshes(): THREE.InstancedMesh[] {
    return [...this._fields.values()].map(f => f.mesh);
  }

  /** Rebuild every field's instance buffer only once the player has moved
   *  past `NATURE_PROP_REBUILD_HYSTERESIS`, mirroring `GrassField.update()`'s
   *  own hysteresis gate. */
  update(playerX: number, playerZ: number): void {
    const dx = playerX - this._lastX;
    const dz = playerZ - this._lastZ;
    if (Number.isFinite(this._lastX) && Math.sqrt(dx * dx + dz * dz) < NATURE_PROP_REBUILD_HYSTERESIS) return;
    this._lastX = playerX;
    this._lastZ = playerZ;

    const allGroups = new Map<string, NaturePropInstance[]>();
    for (const kind of ['tree', 'rock', 'bush'] as const) {
      const groups = selectNaturePropPlacements(this._wg, playerX, playerZ, this._radius, this._seed, kind, this._gridInfo);
      for (const [key, arr] of groups) {
        const existing = allGroups.get(key);
        if (existing) existing.push(...arr); else allGroups.set(key, arr);
      }
    }

    for (const [key, instances] of allGroups) {
      let field = this._fields.get(key);
      if (!field) {
        const [partType, variantIndexStr, materialKey] = key.split('|') as [PartType, string, string];
        const geometry = getPartVariantPool(partType)[Number(variantIndexStr)]!;
        const rand = () => Math.random();
        const material = this._materialLookup(materialKey, rand);
        field = new NaturePropField(geometry, material, this._maxInstancesPerField);
        this._fields.set(key, field);
      }
      field.rebuild(instances);
    }
    // A field whose key doesn't appear in this rebuild simply keeps its last
    // instance buffer (still in the scene) until the next rebuild that DOES
    // produce entries for it — matches GrassField's own "stale until the
    // next qualifying rebuild" behavior rather than a live per-frame diff.
  }

  dispose(): void {
    for (const f of this._fields.values()) f.dispose();
    this._fields.clear();
  }
}
