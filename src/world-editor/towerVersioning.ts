/**
 * towerVersioning.ts
 *
 * Pure, DOM-free functions for the Tower Room Editor version control system.
 * All state lives in the storage layer (localStorage by default) and the
 * caller-supplied floorItems map — no globals, no side-effects beyond storage.
 *
 * Designed to be tested without a browser environment.
 */

import type { InteractableType, Rotation } from '@/levels/blueprint';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TowerItem {
  /** InteractableType for gameplay items; 'prop' for decorative GLB models */
  type: InteractableType | 'prop';
  /** GLB path — only present when type === 'prop' */
  modelPath?: string;
  x: number;
  z: number;
  /** Height offset in world units (default 0 = on the floor) */
  y?: number;
  rotation: Rotation;
  /** Uniform scale applied to the 3D group (default 1) */
  scale?: number;
  /** Visual pitch override in degrees (X axis) */
  rotX?: number;
  /** Visual yaw override in degrees (Y axis) — if set, overrides rotation field for rendering */
  rotY?: number;
  /** Visual roll override in degrees (Z axis) */
  rotZ?: number;
}

export interface TowerVersion {
  version: number;
  label: string;
  savedAt: number;
  floors: Record<number, TowerItem[]>;
}

/** Minimal storage interface so tests can inject a fake. */
export interface VersionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

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
export function gridToWorld(gridCoord: number): number {
  return (gridCoord - GRID_CX) * CELL;
}

/**
 * Convert an editor world-unit position → TowerFloorDef grid index.
 * round(worldCoord / CELL) + 8
 */
export function worldToGrid(worldCoord: number): number {
  return Math.round(worldCoord / CELL) + GRID_CX;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

export function loadVersions(storage: VersionStorage): TowerVersion[] {
  try {
    const raw = storage.getItem(TOWER_VERSION_KEY);
    return raw ? (JSON.parse(raw) as TowerVersion[]) : [];
  } catch {
    return [];
  }
}

export function saveVersions(storage: VersionStorage, versions: TowerVersion[]): void {
  storage.setItem(TOWER_VERSION_KEY, JSON.stringify(versions));
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Snapshot the current floor items map as a new version.
 * Mutates and persists the versions array. Returns the new version record.
 */
export function createVersion(
  storage: VersionStorage,
  floorItems: Map<number, TowerItem[]>,
  label?: string,
): TowerVersion {
  const versions = loadVersions(storage);
  const nextNum  = (versions[versions.length - 1]?.version ?? 0) + 1;
  const resolvedLabel = (label ?? '').trim() || `Save #${nextNum}`;

  const floors: Record<number, TowerItem[]> = {};
  for (const [k, v] of floorItems) {
    floors[k] = v.map(i => ({ ...i }));
  }

  const newVersion: TowerVersion = {
    version:  nextNum,
    label:    resolvedLabel,
    savedAt:  Date.now(),
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
export function restoreVersion(
  v: TowerVersion,
  floorItems: Map<number, TowerItem[]>,
): number {
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
export function deleteVersion(storage: VersionStorage, versionNumber: number): boolean {
  const versions = loadVersions(storage);
  const idx = versions.findIndex(v => v.version === versionNumber);
  if (idx === -1) return false;
  versions.splice(idx, 1);
  saveVersions(storage, versions);
  return true;
}
