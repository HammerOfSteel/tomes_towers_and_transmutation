/**
 * Real-asset resolver for dungeon (non-tower) rendering — Sub-task 3 of the
 * 3D Asset Integration initiative.
 *
 * Supports TWO independent modular kits, selected per-room via
 * `Blueprint.dungeonKit` ('medieval' | 'scifi', default 'medieval'):
 *
 *  - 'medieval' — `modular_dungeons/obj_kit` (92 pieces, OBJ+MTL,
 *    kit-of-parts). Native module size ≈2.0m on every horizontal axis,
 *    matching every shipped blueprint's `cellSize: 2` almost exactly.
 *  - 'scifi'    — `modular_dungeons/ultimate_modular_scifi` (91 pieces,
 *    GLB). Native WALL module is 4.0m wide (spans two 2m grid cells) with
 *    a taller ~4.43m storey height; floor tiles are 2.0m, matching the
 *    medieval kit and every shipped blueprint's `cellSize`.
 *
 * Per-room kit selection is how "mixed-kit" dungeons work: a single
 * DungeonPlan's rooms can each declare a different kit, and each room
 * stays internally consistent (real assets are still always all-or-
 * nothing per room per the hard fallback rule — never two kits' pieces,
 * or a kit piece and a procedural placeholder, in the same tile).
 *
 * See `docs/asset-integration/2026-09-26-dungeons-research.md` for the
 * full medieval-kit catalog + measured dimensions, and
 * `docs/superpowers/plans/2026-09-26-external-assets-dungeons.md` for the
 * implementation plan this module was built against.
 *
 * Scope for this pass (per the research doc's §5.4 recommendation): only
 * one wall/floor/door/stairs/column style per kit. Broken/overgrown/hole
 * wall variants, window inserts, and decorative detail props are deferred
 * to a follow-up once this base swap is verified correct in practice.
 */
import * as THREE from 'three';
import type { Blueprint } from './blueprint';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';

// ── Kit identity ────────────────────────────────────────────────────────────

export type DungeonKitId = 'medieval' | 'scifi';

export const DEFAULT_DUNGEON_KIT_ID: DungeonKitId = 'medieval';

// ── Manifest IDs per kit ─────────────────────────────────────────────────────

const MEDIEVAL_KIT_MANIFEST = {
  wall:        'modular_dungeons/obj_kit/Wall',
  wallHalf:    'modular_dungeons/obj_kit/Wall_Half',
  floor:       'modular_dungeons/obj_kit/Floor_Standard',
  door:        'modular_dungeons/obj_kit/Doors_GothicArch',
  // `Stairs` (not `Stairs_2`) chosen for consistent axis semantics with
  // `Wall`/`Floor_Standard` (x = cell-width axis, z = run/approach axis) —
  // `Stairs_2` measured with those two axes swapped (research doc §2).
  stairs:      'modular_dungeons/obj_kit/Stairs',
  column:      'modular_dungeons/obj_kit/Column_Round',
} as const;

const SCIFI_KIT_MANIFEST = {
  wall:        'modular_dungeons/ultimate_modular_scifi/Wall_Empty',
  floor:       'modular_dungeons/ultimate_modular_scifi/FloorTile_Basic',
  door:        'modular_dungeons/ultimate_modular_scifi/Door_Single',
  stairs:      'modular_dungeons/ultimate_modular_scifi/Staircase',
  column:      'modular_dungeons/ultimate_modular_scifi/Column_1',
} as const;

export type DungeonKitPiece = 'wall' | 'wallHalf' | 'floor' | 'door' | 'stairs' | 'column';

/** Resolved templates for every piece a kit uses, keyed by role. A null
 *  value means that specific piece failed to load — callers fall back to
 *  procedural geometry for just that piece type (hard fallback rule; see
 *  `loadDungeonKit()`'s doc comment). `wallHalf` is only populated for the
 *  medieval kit (the scifi kit has no half-wall piece in this pass's
 *  scope). */
export type DungeonKit = Partial<Record<DungeonKitPiece, THREE.Object3D | null>>;

// ── Measured constants (docs/asset-integration/2026-09-26-dungeons-research.md
//    for medieval; live-measured via Playwright for scifi — see the 3D Asset
//    Integration checkpoint history) ───────────────────────────────────────

interface KitGeometryProfile {
  /** Native X-extent of one wall piece (its run-direction length). Medieval
   *  measures ≈2.0m (one grid cell); scifi measures 4.0m (two grid cells —
   *  compressed via non-uniform X scale down to one cell's footprint in
   *  this pass; see `computeWallScale()`'s doc comment for the tradeoff). */
  nativeWallWidth: number;
  /** Native Y-extent (single-storey wall/column height). */
  nativeWallHeight: number;
  /** Native horizontal module size of the floor piece. Both kits measure
   *  2.0m, matching every shipped blueprint's `cellSize: 2`. */
  nativeCell: number;
  /** How stair pieces span a room's total vertical rise. 'stack' repeats a
   *  short single-step piece `computeStairStepCount()` times (medieval's
   *  `Stairs`, native rise 0.922m/piece). 'single-scaled' uniformly
   *  Y-scales ONE complete-flight piece to match the room's exact total
   *  rise (scifi's `Staircase`, a pre-modeled full flight). */
  stairMode: 'stack' | 'single-scaled';
  /** 'stack' mode: native rise per piece. 'single-scaled' mode: native
   *  total Y-extent of the one flight piece. */
  nativeStairRise: number;
}

const KIT_GEOMETRY: Record<DungeonKitId, KitGeometryProfile> = {
  medieval: {
    nativeWallWidth:  2.0,
    nativeWallHeight: 2.0,
    nativeCell:       2.0,
    stairMode:        'stack',
    nativeStairRise:  0.922,
  },
  scifi: {
    nativeWallWidth:  4.0,
    nativeWallHeight: 4.4309,
    nativeCell:       2.0,
    stairMode:        'single-scaled',
    nativeStairRise:  1.4539,
  },
};

/** @deprecated kept for any lingering direct references — prefer
 *  `KIT_GEOMETRY.medieval.*` or `computeWallScale(bp, 'medieval')`. */
export const NATIVE_WALL_HEIGHT = KIT_GEOMETRY.medieval.nativeWallHeight;
export const NATIVE_CELL = KIT_GEOMETRY.medieval.nativeCell;
export const NATIVE_STAIR_RISE = KIT_GEOMETRY.medieval.nativeStairRise;

/** Per-room scale factor for wall/column/pillar pieces, derived
 *  arithmetically from the room's own declared `cellSize`/`wallHeight`
 *  rather than a single hardcoded multiplier (research doc §3/§4).
 *
 *  X is the wall's run-direction scale: `cellSize / nativeWallWidth`. For
 *  the medieval kit this is ≈1.0 (native module already matches one
 *  cell). For the scifi kit this is 0.5 — its `Wall_*` pieces are
 *  natively 4m (two cells) wide, so they're compressed to fit one cell's
 *  footprint per placed tile rather than requiring `BlueprintRenderer`
 *  to pair up adjacent wall tiles into 2-cell spans (deferred follow-up:
 *  placing scifi walls at native scale across paired cells would avoid
 *  this compression, at the cost of new adjacency-pairing logic).
 *  Z keeps the same factor (wall thickness scales with the run-length
 *  compression too, staying visually proportionate). Y is the storey
 *  height scale: `wallHeight / nativeWallHeight`. */
export function computeWallScale(
  bp: Pick<Blueprint, 'cellSize' | 'wallHeight'>,
  kitId: DungeonKitId = DEFAULT_DUNGEON_KIT_ID,
): { x: number; y: number; z: number } {
  const geo = KIT_GEOMETRY[kitId];
  const xz = bp.cellSize / geo.nativeWallWidth;
  const y = bp.wallHeight / geo.nativeWallHeight;
  return { x: xz, y, z: xz };
}

/** 'stack' mode only: how many pieces must be stacked to span a given
 *  total rise (minimum 2). Not meaningful for 'single-scaled' kits —
 *  callers must branch on `getStairMode(kitId)` first. */
export function computeStairStepCount(
  totalRise: number,
  kitId: DungeonKitId = DEFAULT_DUNGEON_KIT_ID,
): number {
  return Math.max(2, Math.ceil(totalRise / KIT_GEOMETRY[kitId].nativeStairRise));
}

/** Per-room scale factor for the floor tile piece — kept SEPARATE from
 *  `computeWallScale()` because the two kits' wall and floor pieces don't
 *  necessarily share a native module size: the scifi kit's `Wall_*`
 *  pieces are 4.0m wide (two cells) while its `FloorTile_Basic` is 2.0m
 *  (one cell, same as the medieval kit's `Floor_Standard`). Reusing
 *  `computeWallScale()`'s X/Z factor for floor tiles would silently
 *  under-scale scifi floors by half, opening visible gaps between them. */
export function computeFloorScale(
  bp: Pick<Blueprint, 'cellSize'>,
  kitId: DungeonKitId = DEFAULT_DUNGEON_KIT_ID,
): { x: number; z: number } {
  const xz = bp.cellSize / KIT_GEOMETRY[kitId].nativeCell;
  return { x: xz, z: xz };
}

export function getStairMode(kitId: DungeonKitId): KitGeometryProfile['stairMode'] {
  return KIT_GEOMETRY[kitId].stairMode;
}

export function getNativeStairRise(kitId: DungeonKitId): number {
  return KIT_GEOMETRY[kitId].nativeStairRise;
}

// ── Async load ──────────────────────────────────────────────────────────────

const _cache = new Map<string, Promise<THREE.Object3D | null>>();

/** Load a dungeon-kit piece by manifest id, returning the UNSCALED loaded
 *  object — scaling/positioning/rotation is the caller's job per-placement
 *  (a single loaded template is cloned many times per room, following the
 *  "load once, clone many" pattern used by every other real-asset
 *  resolver in this initiative). Returns null on load failure — callers
 *  must fall back to the existing procedural geometry (hard fallback
 *  rule), never render both for the same tile. Failures are cached too,
 *  so a broken manifest reference doesn't retry on every single tile in a
 *  room. */
export async function loadDungeonPiece(id: string): Promise<THREE.Object3D | null> {
  let pending = _cache.get(id);
  if (!pending) {
    pending = (async () => {
      const quatDef = QUAT_MODELS.find(m => m.id === id);
      if (!quatDef) {
        console.warn(`[QuatDungeonAdapter] manifest drift — no entry for "${id}"`);
        return null;
      }
      try {
        const loaded = await loadQuatAsset(quatDef);
        return loaded.scene;
      } catch (err) {
        console.warn(`[QuatDungeonAdapter] failed to load "${id}"`, err);
        return null;
      }
    })();
    _cache.set(id, pending);
  }
  return pending;
}

/** Loads every piece the given kit uses, once, up front — callers should
 *  await this before rendering a room's tiles so every `clone()` call
 *  below has its template ready synchronously. A null entry means that
 *  specific piece failed to load; the caller falls back to procedural
 *  geometry for just that piece type (partial real-asset rendering is not
 *  the hard-rule violation — mixing real+procedural for the SAME
 *  tile/cell is; mixing piece TYPES within a room because one type failed
 *  to load is an acceptable, expected degradation). */
export async function loadDungeonKit(
  kitId: DungeonKitId = DEFAULT_DUNGEON_KIT_ID,
): Promise<DungeonKit> {
  const manifest = kitId === 'scifi' ? SCIFI_KIT_MANIFEST : MEDIEVAL_KIT_MANIFEST;
  const entries = await Promise.all(
    (Object.keys(manifest) as (keyof typeof manifest)[]).map(
      async (key) => [key, await loadDungeonPiece(manifest[key])] as const,
    ),
  );
  return Object.fromEntries(entries) as DungeonKit;
}

/** Clones a loaded template piece for one placement. Templates are shared
 *  (loaded once); every placement needs its own `Object3D` instance so
 *  position/rotation/scale don't collide across tiles. */
export function cloneDungeonPiece(template: THREE.Object3D): THREE.Object3D {
  return template.clone(true);
}
