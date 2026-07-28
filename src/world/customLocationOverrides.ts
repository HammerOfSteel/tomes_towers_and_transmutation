/**
 * customLocationOverrides.ts — AL-4 (Asset Library → Game Runtime)
 *
 * Applies designer-authored named-location overrides from the Overworld Studio
 * Asset Library to procedurally placed overworld dungeon/cave entrances.
 *
 * A library entry qualifies when:
 *   - entry.type === 'dungeon' or 'cave'
 *   - entry.isCustom === true
 *   - it targets a placed entrance, either by tag `dungeon:<id>` / `cave:<id>`
 *     or by numeric `data.dungeonId`
 *
 * Grid placement (col/row) is NEVER overridden — the placer owns terrain
 * validity. Only presentation//content fields are replaced: name, type, seed,
 * floorCount.
 *
 * Debug:
 *   window.__customLocationOverridesApplied — ids overridden on last call
 */

import type { DungeonEntry } from './WorldData';
import type { DungeonType } from './DungeonType';
import { DUNGEON_TYPE_CONFIGS } from './DungeonType';

const LIBRARY_KEY = 'ttt_asset_library';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isDungeonType(value: unknown): value is DungeonType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DUNGEON_TYPE_CONFIGS, value);
}

/** Fields a library entry may override on a placed dungeon entrance. */
export interface LocationOverride {
  name?:       string;
  type?:       DungeonType;
  seed?:       number;
  floorCount?: number;
}

/** Read all custom location overrides keyed by the dungeon entry id they target. */
export function readCustomLocationOverrides(): Map<number, LocationOverride> {
  const result = new Map<number, LocationOverride>();
  if (typeof localStorage === 'undefined') return result;

  let parsed: { entries?: unknown[] } | null = null;
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return result;
    parsed = JSON.parse(raw) as { entries?: unknown[] } | null;
  } catch {
    return result;
  }

  if (!parsed || !Array.isArray(parsed.entries)) return result;

  for (const entry of parsed.entries) {
    if (!isPlainObject(entry)) continue;
    if (entry.type !== 'dungeon' && entry.type !== 'cave') continue;
    if (entry.isCustom !== true) continue;

    const data = entry.data;
    if (!isPlainObject(data)) continue;

    // Resolve target id — tag first, then data.dungeonId
    const targets = new Set<number>();
    if (Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        if (typeof tag !== 'string') continue;
        const m = /^(?:dungeon|cave):(\d+)$/.exec(tag);
        if (m) targets.add(Number(m[1]));
      }
    }
    if (typeof data.dungeonId === 'number' && Number.isInteger(data.dungeonId)) {
      targets.add(data.dungeonId);
    }
    if (targets.size === 0) continue;

    const override: LocationOverride = {};
    if (typeof data.name === 'string' && data.name.trim()) override.name = data.name.trim();
    if (isDungeonType(data.type)) override.type = data.type;
    if (typeof data.seed === 'number' && Number.isFinite(data.seed)) override.seed = data.seed >>> 0;
    if (typeof data.floorCount === 'number' && Number.isInteger(data.floorCount) && data.floorCount > 0) {
      override.floorCount = data.floorCount;
    }
    if (Object.keys(override).length === 0) continue;

    for (const id of targets) {
      if (!result.has(id)) result.set(id, override);
    }
  }

  return result;
}

/**
 * Apply library location overrides in-place to placed dungeon entries.
 * Returns the ids of the entries that were modified.
 */
export function applyCustomLocationOverrides(dungeons: DungeonEntry[]): number[] {
  const overrides = readCustomLocationOverrides();
  const applied: number[] = [];

  if (overrides.size > 0) {
    for (const entry of dungeons) {
      const override = overrides.get(entry.id);
      if (!override) continue;
      if (override.name       !== undefined) entry.name       = override.name;
      if (override.type       !== undefined) entry.type       = override.type;
      if (override.seed       !== undefined) entry.seed       = override.seed;
      if (override.floorCount !== undefined) entry.floorCount = override.floorCount;
      applied.push(entry.id);
    }
  }

  if (typeof window !== 'undefined') (window as any).__customLocationOverridesApplied = applied;
  if (applied.length > 0) {
    console.log(`[customLocationOverrides] applied ${applied.length} custom location override(s): ${applied.join(', ')}`);
  }
  return applied;
}