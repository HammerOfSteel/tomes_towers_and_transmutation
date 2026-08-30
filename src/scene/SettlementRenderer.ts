/**
 * SettlementRenderer.ts — scene-agnostic renderer for a single SettlementPlan.
 *
 * Extracts the per-settlement building/road/lamp placement logic from
 * OverworldScene._buildSettlements() into a pure function that returns
 * ready-to-use THREE objects without touching any THREE.Scene directly.
 *
 * Task 6 will refactor _buildSettlements() to delegate to this function.
 */

import * as THREE from 'three';
import type { WorldGrid } from '@/world/WorldGrid';
import type { SettlementPlan } from '@/world/SettlementGenerator';
import type { BuildingDNA, Faction } from '@/world/buildings/BuildingDNA';
import { buildBuilding } from '@/world/buildings/BuildingBuilder';
import {
  createSettlementBuildingDna,
} from '@/world/buildings/BuildingTypeMap';
import { selectLampRoadTiles } from '@/world/LampPlacement';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { cobblestoneTexture } from '@/world/buildings/TextureFactory';
import { CORNER_JITTER_MAX } from '@/world/TerrainGeometryBuilder';
import { mergeGroupMeshesByMaterial } from './MeshMergeUtils';
import { makeLampPost } from './LampPostFactory';
import { buildParkFeature } from '@/world/props/WardFeatureClusters';

// Matches OverworldScene's local constants.
const T  = 2;            // tile side length in world units
const SH = LEVEL_HEIGHT; // world-unit height increment per elevation level
/** Vertical offset above the terrain top face, avoids z-fighting — matches
 *  SettlementRoadMesh.ts's ROAD_HEIGHT_OFFSET. Must clear
 *  TerrainGeometryBuilder's CORNER_JITTER_MAX (the terrain top face's own
 *  per-corner cosmetic jitter) or road geometry can visibly clip through/
 *  under the jittered ground at random corners — this was the root cause
 *  of the "roads glitch into the ground" bug report. */
const ROAD_HEIGHT_OFFSET = CORNER_JITTER_MAX + 0.02;

// ── Public types ──────────────────────────────────────────────────────────────

export interface SettlementRenderContext {
  /** Called once per successfully-created building with its DNA, world-space
   *  position, and Y-rotation (radians). */
  registerBuildingCollider: (dna: BuildingDNA, pos: THREE.Vector3, rotationY: number) => void;
  /** Convert the plan's studio-side faction string to a runtime Faction.
   *  Pass `mapStudioFactionToRuntimeFaction` from BuildingTypeMap.ts here. */
  mapFaction: (studioFaction: string) => Faction;
}

export interface SettlementBuildingRecord {
  dna:       BuildingDNA;
  pos:       THREE.Vector3;
  rotationY: number;
  isAnchor:  boolean;
  /** Grid column of the original PlacedBuilding (used for cross-reference). */
  col:       number;
  /** Grid row of the original PlacedBuilding (used for cross-reference). */
  row:       number;
}

export interface SettlementRoadTile {
  col: number;
  row: number;
}

export interface SettlementRenderResult {
  /** Positioned, material-merged THREE.Groups for each building.
   *  Not added to any scene — caller decides placement. */
  buildingGroups:  THREE.Group[];
  /** Parallel bookkeeping for buildings; same length as buildingGroups. */
  buildingRecords: SettlementBuildingRecord[];
  /** Raw (col, row) positions of this settlement's road tiles, deduped within
   *  this call.  Not turned into geometry — caller batches across settlements.
   *  NOTE: when building road-tile geometry, the caller must add a small
   *  positive Y offset (`+0.02` in the original `_buildSettlements()`) on top
   *  of `elevation * SH` to avoid z-fighting with the terrain mesh. */
  roadTiles:       SettlementRoadTile[];
  /** Positioned lamp-post groups, not added to any scene. */
  lampGroups:      THREE.Group[];
  /** Parallel PointLight array; same order/length as lampGroups. */
  lampLights:      THREE.PointLight[];
  /** Continuous quad-strip ribbon meshes built from `plan.roadRibbons`
   *  (real streets, not the flat per-tile `roadTiles` quads above). Already
   *  textured and positioned in world space — caller just adds to scene. */
  roadRibbonMeshes: THREE.Mesh[];
  /** Positioned, material-merged non-building "feature cluster" groups —
   *  one per plan.wardFeatures entry (e.g. a park ward's Sacred Grove/
   *  Slime Pool/Graveyard centerpiece). Not added to any scene. */
  featureGroups: THREE.Group[];
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Build all THREE objects for one SettlementPlan and return them.
 *
 * @param plan  The settlement to render.
 * @param wg    WorldGrid used to read per-tile elevation.
 * @param ghw   Grid-half-width  — wx = (col - ghw) * T
 * @param ghh   Grid-half-height — wz = (row - ghh) * T
 * @param ctx   Callbacks for collider registration and faction mapping.
 */
export function renderSettlementPlan(
  plan: SettlementPlan,
  wg:   WorldGrid,
  ghw:  number,
  ghh:  number,
  ctx:  SettlementRenderContext,
): SettlementRenderResult {
  const buildingGroups:  THREE.Group[]                  = [];
  const buildingRecords: SettlementBuildingRecord[]     = [];
  const roadTiles:       SettlementRoadTile[]           = [];
  const lampGroups:      THREE.Group[]                  = [];
  const lampLights:      THREE.PointLight[]             = [];

  const runtimeFaction = ctx.mapFaction(plan.faction);

  // ── Buildings ──────────────────────────────────────────────────────────────
  for (const b of plan.buildings) {
    const wx = (b.col - ghw + b.offsetX) * T;
    const wz = (b.row - ghh + b.offsetZ) * T;
    const wy = wg.get(b.col, b.row).elevation * SH;

    const dna = createSettlementBuildingDna(b, plan.type, runtimeFaction);
    if (!dna) continue;

    const inst = buildBuilding(dna);
    const grp  = inst.exteriorGroup;
    grp.position.set(wx, wy, wz);
    grp.rotation.y = b.rotation;
    mergeGroupMeshesByMaterial(grp);

    const pos = new THREE.Vector3(wx, wy, wz);
    buildingGroups.push(grp);
    buildingRecords.push({ dna, pos, rotationY: b.rotation, isAnchor: b.isAnchor, col: b.col, row: b.row });
    ctx.registerBuildingCollider(dna, pos, b.rotation);
  }

  // ── Road tiles (deduped within this settlement) ───────────────────────────
  const sqSeen = new Set<string>();
  for (const r of plan.roads) {
    const k = `${r.col},${r.row}`;
    if (sqSeen.has(k)) continue;
    sqSeen.add(k);
    roadTiles.push({ col: r.col, row: r.row });
  }

  // ── Lamp posts ────────────────────────────────────────────────────────────
  const centreElev = wg.get(plan.centerCol, plan.centerRow).elevation;
  const lampTiles  = selectLampRoadTiles(plan.roads, 4);
  for (const t of lampTiles) {
    const wx    = (t.col - ghw) * T + 0.6;
    const wz    = (t.row - ghh) * T;
    const group = makeLampPost();
    const light = group.children[group.children.length - 1] as THREE.PointLight;
    group.position.set(wx, centreElev * SH, wz);
    lampGroups.push(group);
    lampLights.push(light);
  }

  const roadRibbonMeshes = buildRoadRibbonMeshes(plan, wg, ghw, ghh);

  // ── Ward feature clusters (e.g. park ward's Sacred Grove/Slime Pool) ─────
  const featureGroups: THREE.Group[] = [];
  for (const f of plan.wardFeatures) {
    const wx = (f.col - ghw + f.offsetX) * T;
    const wz = (f.row - ghh + f.offsetZ) * T;
    const wy = wg.get(f.col, f.row).elevation * SH;
    const grp = buildParkFeature(runtimeFaction, f.seed);
    grp.position.set(wx, wy, wz);
    mergeGroupMeshesByMaterial(grp);
    featureGroups.push(grp);
  }

  return { buildingGroups, buildingRecords, roadTiles, lampGroups, lampLights, roadRibbonMeshes, featureGroups };
}

/**
 * Build continuous quad-strip ribbon meshes from `plan.roadRibbons`
 * (RoadRibbon.points are fractional grid-tile units relative to the
 * settlement centre) — same width-varying quad-strip technique as
 * `SettlementRoadMesh.ts`, textured with the existing
 * cobblestone canvas texture. One mesh per ribbon (a settlement typically
 * has a handful of roads, so per-ribbon meshes are fine without merging).
 */
function buildRoadRibbonMeshes(plan: SettlementPlan, wg: WorldGrid, ghw: number, ghh: number): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const ribbon of plan.roadRibbons) {
    if (ribbon.points.length < 2) continue;
    const halfWidth = ribbon.width / 2;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let cumulativeLength = 0;

    // World-space position + terrain elevation for one ribbon point.
    const worldPoint = (p: { x: number; z: number }) => {
      const wx = (p.x + plan.centerCol - ghw) * T;
      const wz = (p.z + plan.centerRow - ghh) * T;
      const col = Math.round(p.x + plan.centerCol);
      const row = Math.round(p.z + plan.centerRow);
      const wy = wg.get(col, row).elevation * SH + ROAD_HEIGHT_OFFSET;
      return { wx, wy, wz };
    };

    let prevWorld = worldPoint(ribbon.points[0]!);
    for (let i = 0; i < ribbon.points.length - 1; i++) {
      const a = prevWorld;
      const nextWorld = worldPoint(ribbon.points[i + 1]!);
      const b = nextWorld;
      const dx = b.wx - a.wx, dz = b.wz - a.wz;
      const segLen = Math.hypot(dx, dz);
      prevWorld = nextWorld;
      if (segLen < 1e-6) continue;

      const dirX = dx / segLen, dirZ = dz / segLen;
      const rightX = -dirZ, rightZ = dirX;
      const base = positions.length / 3;

      positions.push(
        a.wx + rightX * halfWidth, a.wy, a.wz + rightZ * halfWidth,
        a.wx - rightX * halfWidth, a.wy, a.wz - rightZ * halfWidth,
        b.wx + rightX * halfWidth, b.wy, b.wz + rightZ * halfWidth,
        b.wx - rightX * halfWidth, b.wy, b.wz - rightZ * halfWidth,
      );
      const v0 = cumulativeLength * 0.5;
      cumulativeLength += segLen;
      const v1 = cumulativeLength * 0.5;
      uvs.push(0, v0, 1, v0, 0, v1, 1, v1);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    if (positions.length === 0) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const uvRepeat = Math.max(1, Math.round(cumulativeLength * 0.5));
    const material = new THREE.MeshStandardMaterial({
      map: cobblestoneTexture(1, uvRepeat), roughness: 0.9, metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.userData['roadWidth'] = ribbon.width;
    meshes.push(mesh);
  }
  return meshes;
}
