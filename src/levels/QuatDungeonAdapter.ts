/**
 * Real-asset resolver for dungeon (non-tower) rendering — Sub-task 3 of the
 * 3D Asset Integration initiative.
 *
 * Sources walls, floors, doors, stairs, and pillars from
 * `modular_dungeons/obj_kit` (a true kit-of-parts pack, unlike the
 * monolithic-mesh building pack Sub-task 2 used) to swap in for
 * `BlueprintRenderer.ts`'s procedural `BoxGeometry`/`CylinderGeometry`/
 * `PlaneGeometry` primitives.
 *
 * See `docs/asset-integration/2026-09-26-dungeons-research.md` for the full
 * 92-piece catalog and measured dimensions this module's constants are
 * derived from, and
 * `docs/superpowers/plans/2026-09-26-external-assets-dungeons.md` for the
 * implementation plan.
 *
 * Scope for this pass (per the research doc's §5.4 recommendation): only
 * `Wall` / `Wall_Half` / `Floor_Standard` / one door style / `Stairs_2` /
 * `Column_Round`. Broken/overgrown/hole wall variants and the 2-storey
 * `Wall_ArchGothic`/`Wall_ArchRound` combo pieces are deferred to a
 * follow-up once this base swap is verified correct in practice.
 */
import * as THREE from 'three';
import type { Blueprint } from './blueprint';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';

// ── Manifest IDs used this pass ────────────────────────────────────────────

export const DUNGEON_KIT = {
  wall:        'modular_dungeons/obj_kit/Wall',
  wallHalf:    'modular_dungeons/obj_kit/Wall_Half',
  floor:       'modular_dungeons/obj_kit/Floor_Standard',
  door:        'modular_dungeons/obj_kit/Doors_GothicArch',
  // `Stairs` (not `Stairs_2`) chosen for consistent axis semantics with
  // `Wall`/`Floor_Standard` (x = cell-width axis, z = run/approach axis) —
  // `Stairs_2` measured with those two axes swapped (research doc §2),
  // which would make automatic orientation-by-facing unreliable. `Stairs`
  // has a shorter native rise (~0.92m vs ~1.78m), so more pieces stack per
  // room, but the placement math stays simple and correct.
  stairs:      'modular_dungeons/obj_kit/Stairs',
  column:      'modular_dungeons/obj_kit/Column_Round',
} as const;

export type DungeonKitPiece = keyof typeof DUNGEON_KIT;

/** Resolved templates for every piece in `DUNGEON_KIT`, keyed the same way.
 *  A null value means that specific piece failed to load — callers fall
 *  back to procedural geometry for just that piece type (hard fallback
 *  rule; see `loadDungeonKit()`'s doc comment). */
export type DungeonKit = Record<DungeonKitPiece, THREE.Object3D | null>;

// ── Measured constants (docs/asset-integration/2026-09-26-dungeons-research.md) ─

/** Native wall/column height (single storey), measured live via
 *  `THREE.Box3.setFromObject()` on the loaded `Wall`/`Column_Round`
 *  pieces (both ≈2.0m and ≈3.99m/2 respectively — see research doc §2).
 *  Every shipped `Blueprint.wallHeight` (3 or 4) is scaled against this,
 *  not a guessed constant — see `computeWallScale()`. */
export const NATIVE_WALL_HEIGHT = 2.0;

/** Native horizontal module size of `Wall`/`Floor_Standard`/etc. — measured
 *  ≈2.0m on every horizontal axis, already matching every shipped
 *  blueprint's `cellSize: 2` (research doc §2/§3). Kept as a named
 *  constant (rather than assuming 1.0 scale) so a future kit update or a
 *  blueprint with a different `cellSize` still computes the correct
 *  ratio instead of silently drifting. */
export const NATIVE_CELL = 2.0;

/** Native rise of one `Stairs` piece, measured ≈0.92m (research doc §2).
 *  Used by `computeStairStepCount()` to determine how many pieces must be
 *  stacked to span a given staircase's total rise. */
export const NATIVE_STAIR_RISE = 0.922;

/** Per-room scale factor for wall/column/pillar pieces, derived
 *  arithmetically from the room's own declared `cellSize`/`wallHeight`
 *  rather than a single hardcoded multiplier — see the research doc §3
 *  and §4 for why this avoids repeating the settlement-building
 *  door-scale mistake (that fix was an unverified guess reverse-
 *  engineered from a screenshot; this one is exact ratio arithmetic on
 *  numbers the Blueprint already declares). */
export function computeWallScale(bp: Pick<Blueprint, 'cellSize' | 'wallHeight'>): { x: number; y: number; z: number } {
  const xz = bp.cellSize / NATIVE_CELL;
  const y = bp.wallHeight / NATIVE_WALL_HEIGHT;
  return { x: xz, y, z: xz };
}

/** How many `Stairs` pieces must be stacked to span a given total rise
 *  (minimum 2, so even a short staircase gets at least a visually
 *  complete look rather than one truncated piece). Pass the staircase's
 *  actual computed total rise (`STEPS * stepH` in `buildStaircase()`),
 *  not `wallHeight` directly — the existing procedural staircase's rise
 *  is capped independently of `wallHeight` (see `buildStaircase()`'s
 *  `stepH` calc), so real-asset stacking must match that same value to
 *  stay physics-collider-accurate. */
export function computeStairStepCount(totalRise: number): number {
  return Math.max(2, Math.ceil(totalRise / NATIVE_STAIR_RISE));
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

/** Loads every piece this pass uses, once, up front — callers should await
 *  this before rendering a room's tiles so every `clone()` call below has
 *  its template ready synchronously. A null entry means that specific
 *  piece failed to load; the caller falls back to procedural geometry for
 *  just that piece type (partial real-asset rendering is not the hard-rule
 *  violation — mixing real+procedural for the SAME tile/cell is; mixing
 *  piece TYPES within a room because one type failed to load is an
 *  acceptable, expected degradation). */
export async function loadDungeonKit(): Promise<DungeonKit> {
  const entries = await Promise.all(
    (Object.keys(DUNGEON_KIT) as DungeonKitPiece[]).map(
      async (key) => [key, await loadDungeonPiece(DUNGEON_KIT[key])] as const,
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
