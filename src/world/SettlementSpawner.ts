/**
 * SettlementSpawner.ts — 02-game-world-integration (SI-1)
 *
 * Pure data transform: a realm-map settlement record (OW-A `RealmSettlement`
 * — grid position + faction + size) → a deterministic list of building
 * placements (`BuildingDNA` + world position/rotation) that the (future)
 * settlement renderer can turn into actual `THREE.Group`s via
 * `buildBuilding(dna)` (`src/world/buildings/BuildingBuilder.ts`).
 *
 * Deliberately only imports *types* from `overworld-studio.ts` — see
 * RealmToTerrain.ts for the reasoning (that file wires up DOM elements at
 * module scope for the standalone Studio page, so importing any runtime
 * value/function from it would crash outside that page). Type-only imports
 * are erased at compile time, so this stays safe to import from game
 * runtime code (`OverworldScene.ts`, tests, etc.).
 *
 * Deviation from the literal ward/road system in `overworld-studio.ts`
 * (`generateSettlementModel`: Voronoi wards, Chaikin-smoothed roads, gates,
 * walls): that generator lives inside the DOM-coupled Studio file and
 * produces a much richer *local* street-level layout than placing a
 * settlement on the realm map needs. This module instead uses a simpler,
 * self-contained concentric-ring placement — same spirit as SI-1's "places
 * building cluster at world position" without requiring the full ward
 * pipeline. SI-2 (street mesh) and SI-3 (NPC population) are separate
 * follow-up modules that can layer on top of this output (`buildings[]`
 * positions) once a real renderer consumes it.
 *
 * World position uses the same coordinate space as RI-1
 * (`RealmToTerrain.ts`): one realm cell == `TERRAIN_TILE_SIZE` world units,
 * so a settlement at realm cell (x, y) lands exactly on the matching
 * terrain tile.
 */

import type { RealmSettlement, SettlementFaction } from '@/overworld-studio';
import { mulberry32 } from '@/core/prng';
import { TERRAIN_TILE_SIZE } from './RealmToTerrain';
import type { RiverHeightSampler } from './RealmRiverMesh';
import {
  factionBuildingDna,
  getFootprint,
  type BuildingDNA,
  type BuildingKind,
  type BuildingSize,
  type Faction,
} from './buildings/BuildingDNA';

/** World-space XZ position. */
export interface WorldPos2 { x: number; z: number; }

export interface SettlementBuildingPlacement {
  dna: BuildingDNA;
  position: WorldPos2;
  rotation: number;
}

export interface SettlementSpawnPlan {
  name: string;
  size: RealmSettlement['size'];
  faction: SettlementFaction;
  /** Settlement centre in world space (ground plane, y from `heightAt` if provided). */
  position: WorldPos2;
  buildings: SettlementBuildingPlacement[];
}

// ── SI-1 — world position ────────────────────────────────────────────────────

/**
 * Realm cell (x, y) → world-space (x, z), matching RI-1's
 * `realmCellToTileDNA` grid → world mapping (`col * TERRAIN_TILE_SIZE`).
 */
export function settlementWorldPosition(settlement: Pick<RealmSettlement, 'x' | 'y'>): WorldPos2 {
  return { x: settlement.x * TERRAIN_TILE_SIZE, z: settlement.y * TERRAIN_TILE_SIZE };
}

// ── SI-1 — faction mapping ───────────────────────────────────────────────────

/**
 * Realm-map `SettlementFaction` (9 values, one "human") → the building
 * system's `Faction` (13 values, human split into rural/town/noble by
 * settlement size). Non-human factions map 1:1 except `undead` →
 * `undead_common` (naming mismatch between the two modules).
 */
export function settlementToBuildingFaction(
  faction: SettlementFaction,
  size: RealmSettlement['size'],
): Faction {
  if (faction === 'human') {
    if (size === 'village') return 'human_rural';
    if (size === 'town') return 'human_town';
    return 'human_noble';
  }
  if (faction === 'undead') return 'undead_common';
  return faction;
}

// ── SI-1 — building mix per settlement size ──────────────────────────────────

interface MixEntry { kind: BuildingKind; size: BuildingSize; count: number; }

/**
 * How many buildings of each kind a settlement of a given size gets.
 * Deliberately simple counts (not a full ward simulation) — see module
 * header. `well` is a de facto plaza marker, always placed at the centre.
 */
const BUILDING_MIX: Record<RealmSettlement['size'], MixEntry[]> = {
  village: [
    { kind: 'well', size: 'tiny', count: 1 },
    { kind: 'house', size: 'small', count: 4 },
    { kind: 'cottage', size: 'small', count: 2 },
    { kind: 'barn', size: 'medium', count: 1 },
  ],
  town: [
    { kind: 'well', size: 'tiny', count: 1 },
    { kind: 'house', size: 'small', count: 8 },
    { kind: 'shop', size: 'small', count: 3 },
    { kind: 'inn', size: 'medium', count: 1 },
    { kind: 'guild', size: 'medium', count: 1 },
    { kind: 'blacksmith', size: 'medium', count: 1 },
    { kind: 'barn', size: 'medium', count: 2 },
  ],
  city: [
    { kind: 'well', size: 'tiny', count: 1 },
    { kind: 'house', size: 'small', count: 14 },
    { kind: 'terraced', size: 'small', count: 6 },
    { kind: 'shop', size: 'small', count: 5 },
    { kind: 'inn', size: 'medium', count: 2 },
    { kind: 'tavern', size: 'large', count: 1 },
    { kind: 'guild', size: 'medium', count: 2 },
    { kind: 'chapel', size: 'large', count: 1 },
    { kind: 'blacksmith', size: 'medium', count: 1 },
    { kind: 'watchtower', size: 'small', count: 2 },
    { kind: 'villa', size: 'large', count: 1 },
  ],
};

/** Approx. buildings placed per concentric ring, growing outward. */
const RING_CAPACITY = [1, 6, 10, 14, 18, 22];

// ── SI-1 — concentric-ring placement ─────────────────────────────────────────

/**
 * Places `count` buildings on concentric rings around the origin.
 * Ring 0 (single slot) is reserved for the first item (e.g. the well/plaza
 * marker); subsequent rings fill up to `RING_CAPACITY[ring]` slots each,
 * spaced evenly in angle with a seeded jitter, at a radius that grows with
 * the largest footprint placed so far to avoid overlap.
 */
function ringSlots(count: number, rand: () => number, ringSpacing: number): Array<{ radius: number; angle: number }> {
  const slots: Array<{ radius: number; angle: number }> = [];
  let ring = 0;
  let placed = 0;
  while (placed < count) {
    const capacity = RING_CAPACITY[Math.min(ring, RING_CAPACITY.length - 1)];
    const inRing = Math.min(capacity, count - placed);
    const radius = ring === 0 ? 0 : ring * ringSpacing;
    const angleOffset = rand() * Math.PI * 2;
    for (let i = 0; i < inRing; i++) {
      const angle = angleOffset + (i / inRing) * Math.PI * 2 + (rand() - 0.5) * 0.3;
      slots.push({ radius, angle });
    }
    placed += inRing;
    ring += 1;
  }
  return slots;
}

// ── SI-1 — main entry point ──────────────────────────────────────────────────

export interface SpawnSettlementOptions {
  /**
   * Deterministic seed. If omitted, derived by hashing the settlement's
   * realm-cell coordinates + name, so the same realm always yields the same
   * settlement layout (SI-6) without requiring `RealmSettlement` itself to
   * carry a seed field.
   */
  seed?: number;
  /** World-space ground-height sampler (e.g. RI-1/RI-3's `makeHeightSampler`). Defaults to flat (y = 0). */
  heightAt?: RiverHeightSampler;
}

function hashSettlement(settlement: RealmSettlement): number {
  let h = 0x9e3779b9 ^ (settlement.x * 374761393) ^ (settlement.y * 668265263);
  for (let i = 0; i < settlement.name.length; i++) {
    h = Math.imul(h ^ settlement.name.charCodeAt(i), 2654435761);
  }
  return h >>> 0;
}

/**
 * SI-1 — given a realm settlement record, produce a deterministic building
 * placement plan in world space. Pure function — no Three.js, no DOM.
 */
export function spawnSettlement(
  settlement: RealmSettlement,
  options: SpawnSettlementOptions = {},
): SettlementSpawnPlan {
  const seed = options.seed ?? hashSettlement(settlement);
  const rand = mulberry32(seed);
  const centre = settlementWorldPosition(settlement);
  const buildingFaction = settlementToBuildingFaction(settlement.faction, settlement.size);
  const mix = BUILDING_MIX[settlement.size];

  const totalCount = mix.reduce((sum, m) => sum + m.count, 0);
  const maxFootprint = Math.max(
    ...mix.map(m => {
      const fp = getFootprint(m.kind, m.size);
      return Math.max(fp.w, fp.d);
    }),
  );
  const ringSpacing = maxFootprint * 1.6;
  const slots = ringSlots(totalCount, rand, ringSpacing);

  const buildings: SettlementBuildingPlacement[] = [];
  let slotIndex = 0;
  for (const entry of mix) {
    for (let i = 0; i < entry.count; i++) {
      const slot = slots[slotIndex++];
      const dna = factionBuildingDna(entry.kind, buildingFaction, (seed + slotIndex) >>> 0, entry.size);
      const px = centre.x + Math.cos(slot.angle) * slot.radius;
      const pz = centre.z + Math.sin(slot.angle) * slot.radius;
      const rotation = slot.radius === 0 ? 0 : slot.angle + Math.PI; // face inward toward the centre
      dna.rotation = rotation;
      buildings.push({ dna, position: { x: px, z: pz }, rotation });
    }
  }

  return {
    name: settlement.name,
    size: settlement.size,
    faction: settlement.faction,
    position: centre,
    buildings,
  };
}
