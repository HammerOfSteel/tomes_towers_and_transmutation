/**
 * towerBootstrap.ts
 *
 * Converts TOWER_FLOOR_DEFS game data into the editor's TowerFloorDoc format
 * so the editor can "Load from Game" even before any manual saves exist.
 *
 * The conversion maps InteractableType → closest available GLB asset path.
 * Assets that aren't extracted yet are listed as notes in the doc name.
 */

import { TOWER_FLOOR_DEFS } from '@/levels/TowerFloorDef';
import type { TowerFloorDoc, PlacedObject, ExitMarker } from './EditorSchema';
import { EDITOR_SCHEMA_VERSION } from './EditorSchema';

// ── InteractableType → GLB asset path (extracted kits only) ─────────────────
// Add more mappings as more kits are extracted.
const INTERACTABLE_TO_ASSET: Record<string, string> = {
  barrel:     '/assets/kaykit_dungeon/barrel_large.gltf',
  crate:      '/assets/kaykit_dungeon/crates_stacked.gltf',
  chest:      '/assets/kaykit_dungeon/chest.gltf',
  bookshelf:  '/assets/furniture/bookcaseClosed.glb',
  lectern:    '/assets/kaykit_dungeon/pillar.gltf',     // placeholder
  cauldron:   '/assets/kaykit_dungeon/barrel_large.gltf', // placeholder
  candelabra: '/assets/kaykit_dungeon/torch_lit.gltf',
  torch:      '/assets/kaykit_dungeon/torch_lit.gltf',
  pillar:     '/assets/kaykit_dungeon/pillar.gltf',
  table:      '/assets/furniture/table.glb',
  chair:      '/assets/furniture/chair.glb',
};

const FALLBACK_ASSET = '/assets/kaykit_dungeon/pillar.gltf';

function _makeId(prefix: string, n: number): string {
  return `${prefix}_${String(n).padStart(3, '0')}`;
}

/**
 * Build a TowerFloorDoc for one floor from TOWER_FLOOR_DEFS.
 * `floorIndex` matches TowerFloorDef.floorIndex (−1 = basement, 0–9 = floors).
 */
export function bootstrapTowerFloor(floorIndex: number): TowerFloorDoc | null {
  const def = TOWER_FLOOR_DEFS.find(d => d.floorIndex === floorIndex);
  if (!def) return null;

  const objects: PlacedObject[] = [];
  const exits: ExitMarker[]     = [];
  let objCounter = 0;

  // ── chamberScatter items → PlacedObjects ──────────────────────────────────
  if (def.chamberScatter) {
    for (const s of def.chamberScatter) {
      const asset = INTERACTABLE_TO_ASSET[s.type] ?? FALLBACK_ASSET;
      const ry    = (s.rotation ?? 0) * (Math.PI / 2); // Rotation 0–3 → radians
      objects.push({
        id:    _makeId('obj', ++objCounter),
        asset,
        x: s.x,
        y: 0,
        z: s.z,
        ry,
        scale: 1,
        meta: {},
      });
    }
  }

  // ── chamberPillars → 8 evenly-spaced pillar objects ───────────────────────
  if (def.chamberPillars) {
    const R = 5;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      objects.push({
        id:    _makeId('pillar', ++objCounter),
        asset: '/assets/kaykit_dungeon/pillar.gltf',
        x: Math.cos(angle) * R,
        y: 0,
        z: Math.sin(angle) * R,
        ry: angle,
        scale: 1,
        meta: {},
      });
    }
  }

  // ── chamberCandelabras → 4 cardinal candelabra objects ────────────────────
  if (def.chamberCandelabras) {
    const positions = [
      { x:  4, z:  0 },
      { x: -4, z:  0 },
      { x:  0, z:  4 },
      { x:  0, z: -4 },
    ];
    for (const p of positions) {
      objects.push({
        id:    _makeId('candelabra', ++objCounter),
        asset: '/assets/kaykit_dungeon/torch_lit.gltf',
        x: p.x, y: 0, z: p.z,
        ry: 0,
        scale: 1,
        meta: {},
      });
    }
  }

  // ── Tower exit → exit marker ───────────────────────────────────────────────
  if (def.exteriorExitSlot !== undefined) {
    exits.push({
      id:   'exit_tower',
      type: 'tower_exit',
      x: 8, y: 0, z: 8,
    });
  }

  // ── Stair exits ───────────────────────────────────────────────────────────
  if (floorIndex > -1) {
    exits.push({ id: 'exit_down', type: 'stair_down', x: -7, y: 0, z: 0, targetFloorIndex: floorIndex - 1 });
  }
  exits.push({ id: 'exit_up', type: 'stair_up', x: 7, y: 0, z: 0, targetFloorIndex: floorIndex + 1 });

  return {
    schema:      EDITOR_SCHEMA_VERSION,
    type:        'tower_floor',
    id:          'default',
    name:        def.name,
    objects,
    spawns: [{
      id: 'player_start', type: 'player_start',
      x: 0, y: 0, z: 0,
    }],
    exits,
    floorIndex:  def.floorIndex,
    gridSize:    2,
    size:        { w: def.chamberRadius * 2 + 3, d: def.chamberRadius * 2 + 3 },
    properties: {
      lightPreset:    def.floorType,
      encounterPool:  def.encounterPool ? JSON.stringify(def.encounterPool) : undefined,
    },
  };
}

/**
 * Bootstrap all tower floors as separate docs.
 * Returns them in floor order: basement (-1), F0 (0) … F9 (9).
 */
export function bootstrapAllTowerFloors(): TowerFloorDoc[] {
  return TOWER_FLOOR_DEFS
    .slice()
    .sort((a, b) => a.floorIndex - b.floorIndex)
    .map(d => bootstrapTowerFloor(d.floorIndex)!)
    .filter(Boolean);
}
