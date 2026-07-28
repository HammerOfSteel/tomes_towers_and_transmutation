/**
 * customRoomOverrides.ts — AL-4 (Asset Library → Game Runtime)
 *
 * Lets designers override procedurally generated dungeon rooms with room
 * layouts saved from the Overworld Studio Asset Library.
 *
 * A library entry qualifies as an override when:
 *   - entry.type === 'room'
 *   - entry.isCustom === true
 *   - it targets a room instance, either by tag `room:<instanceId>` or by
 *     `data.id === <instanceId>`
 *
 * To keep generated dungeon topology intact, an override is only applied when
 * the saved layout has the same width/depth as the generated room. Doors keep
 * their generated `targetId` wiring; everything else (tiles, spawns,
 * interactables, staircases, floorType, wall height) comes from the override.
 *
 * Debug:
 *   window.__customRoomOverridesApplied — ids of rooms overridden on last call
 */

import type { Blueprint } from './blueprint';
import { validateBlueprint } from './blueprint';

const LIBRARY_KEY = 'ttt_asset_library';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Read all custom room layout entries keyed by the room instance id they target. */
export function readCustomRoomOverrides(): Map<string, Blueprint> {
  const result = new Map<string, Blueprint>();
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
    if (entry.type !== 'room' || entry.isCustom !== true) continue;

    const data = entry.data;
    if (!isPlainObject(data)) continue;

    let blueprint: Blueprint;
    try {
      blueprint = validateBlueprint(data);
    } catch {
      continue; // malformed saved layout — ignore
    }

    const targets = new Set<string>();
    if (Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        if (typeof tag === 'string' && tag.startsWith('room:')) {
          const id = tag.slice('room:'.length).trim();
          if (id) targets.add(id);
        }
      }
    }
    targets.add(blueprint.id);

    for (const target of targets) {
      if (!result.has(target)) result.set(target, blueprint);
    }
  }

  return result;
}

/**
 * Apply library room overrides in-place to a generated room map.
 * Returns the ids of the rooms that were replaced.
 */
export function applyCustomRoomOverrides(rooms: Map<string, Blueprint>): string[] {
  const overrides = readCustomRoomOverrides();
  const applied: string[] = [];
  if (overrides.size === 0) {
    if (typeof window !== 'undefined') (window as any).__customRoomOverridesApplied = applied;
    return applied;
  }

  for (const [instanceId, generated] of rooms) {
    const custom = overrides.get(instanceId);
    if (!custom) continue;
    // Topology guard: only swap layouts of identical footprint so the
    // generated door wiring stays valid.
    if (custom.width !== generated.width || custom.depth !== generated.depth) continue;

    rooms.set(instanceId, {
      ...custom,
      id: instanceId,
      floor: generated.floor,
      // Keep the generator's door wiring — the override only supplies content.
      doors: generated.doors,
      staircases: generated.staircases,
    });
    applied.push(instanceId);
  }

  if (typeof window !== 'undefined') (window as any).__customRoomOverridesApplied = applied;
  if (applied.length > 0) {
    console.log(`[customRoomOverrides] applied ${applied.length} custom room layout(s): ${applied.join(', ')}`);
  }
  return applied;
}