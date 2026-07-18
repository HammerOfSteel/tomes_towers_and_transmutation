/**
 * towerVersioning.ts
 *
 * Pure, DOM-free functions for the Tower Room Editor version control system.
 * All state lives in the storage layer (localStorage by default) and the
 * caller-supplied floorItems map — no globals, no side-effects beyond storage.
 *
 * Designed to be tested without a browser environment.
 */
export const TOWER_VERSION_KEY = 'ttt_tower_versions_v1';
export const TOWER_VERSION_MAX = 30;
// ── Coordinate helpers ────────────────────────────────────────────────────────
/** World-unit grid size (17×17). */
export const GRID = 17;
/** World-units per cell. */
export const CELL = 1.0;
/** Grid centre index. */
export const GRID_CX = Math.floor(GRID / 2); // 8
/**
 * Convert a TowerFloorDef ScatterEntry grid index → editor world-unit position.
 * (gridX − 8) × CELL
 */
export function gridToWorld(gridCoord) {
    return (gridCoord - GRID_CX) * CELL;
}
/**
 * Convert an editor world-unit position → TowerFloorDef grid index.
 * round(worldCoord / CELL) + 8
 */
export function worldToGrid(worldCoord) {
    return Math.round(worldCoord / CELL) + GRID_CX;
}
// ── Storage helpers ───────────────────────────────────────────────────────────
export function loadVersions(storage) {
    try {
        const raw = storage.getItem(TOWER_VERSION_KEY);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
export function saveVersions(storage, versions) {
    storage.setItem(TOWER_VERSION_KEY, JSON.stringify(versions));
}
// ── Core operations ───────────────────────────────────────────────────────────
/**
 * Snapshot the current floor items map as a new version.
 * Mutates and persists the versions array. Returns the new version record.
 */
export function createVersion(storage, floorItems, label) {
    const versions = loadVersions(storage);
    const nextNum = (versions[versions.length - 1]?.version ?? 0) + 1;
    const resolvedLabel = (label ?? '').trim() || `Save #${nextNum}`;
    const floors = {};
    for (const [k, v] of floorItems) {
        floors[k] = v.map(i => ({ ...i }));
    }
    const newVersion = {
        version: nextNum,
        label: resolvedLabel,
        savedAt: Date.now(),
        floors,
    };
    versions.push(newVersion);
    // Enforce cap — remove oldest when over limit
    if (versions.length > TOWER_VERSION_MAX) {
        versions.splice(0, versions.length - TOWER_VERSION_MAX);
    }
    saveVersions(storage, versions);
    return newVersion;
}
/**
 * Restore a version into the provided floor items map (mutates in-place).
 * Returns the number of floors restored.
 */
export function restoreVersion(v, floorItems) {
    floorItems.clear();
    let count = 0;
    for (const [k, items] of Object.entries(v.floors)) {
        floorItems.set(parseInt(k, 10), items.map(i => ({ ...i })));
        count++;
    }
    return count;
}
/**
 * Delete a single version by its version number.
 * Returns true if the version was found and removed.
 */
export function deleteVersion(storage, versionNumber) {
    const versions = loadVersions(storage);
    const idx = versions.findIndex(v => v.version === versionNumber);
    if (idx === -1)
        return false;
    versions.splice(idx, 1);
    saveVersions(storage, versions);
    return true;
}
