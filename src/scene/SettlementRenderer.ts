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
import { mergeGroupMeshesByMaterial } from './MeshMergeUtils';
import { makeLampPost } from './LampPostFactory';

// Matches OverworldScene's local constants.
const T  = 2;            // tile side length in world units
const SH = LEVEL_HEIGHT; // world-unit height increment per elevation level

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
   *  this call.  Not turned into geometry — caller batches across settlements. */
  roadTiles:       SettlementRoadTile[];
  /** Positioned lamp-post groups, not added to any scene. */
  lampGroups:      THREE.Group[];
  /** Parallel PointLight array; same order/length as lampGroups. */
  lampLights:      THREE.PointLight[];
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
    const wx = (b.col - ghw) * T;
    const wz = (b.row - ghh) * T;
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

  return { buildingGroups, buildingRecords, roadTiles, lampGroups, lampLights };
}
