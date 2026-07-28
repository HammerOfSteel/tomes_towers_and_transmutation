/**
 * WorldPackage.ts — OW-F4 / AL-4
 *
 * Parsing + import helpers for the World Package JSON exported by the
 * Overworld Studio realm tab.
 *
 * A world package bundles:
 *   - the generated realm (cells, rivers, settlements, dungeons)
 *   - deterministic settlement/dungeon descriptors
 *   - `customAssets`: every designer-authored (`isCustom`) Asset Library entry,
 *     so runtime override lookups keep working after import elsewhere.
 *
 * Debug:
 *   window.__owStudioLastWorldPackageImport
 */

import type { AssetLibrary, LibraryEntry } from './AssetLibrary';

export const WORLD_PACKAGE_KIND = 'ttt_world_package';
export const WORLD_PACKAGE_VERSION = 1;

export interface WorldPackageSummary {
  seed:         number;
  settlements:  number;
  dungeons:     number;
  customAssets: number;
}

export interface WorldPackageImportResult {
  ok:       boolean;
  /** Human-readable failure reason when `ok === false`. */
  error?:   string;
  summary?: WorldPackageSummary;
  /** Library entries actually restored (fresh ids, isCustom = true). */
  imported: LibraryEntry[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Validate that an arbitrary parsed JSON value looks like a world package. */
export function isWorldPackage(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  if (value.kind !== WORLD_PACKAGE_KIND) return false;
  if (value.version !== WORLD_PACKAGE_VERSION) return false;
  if (typeof value.seed !== 'number') return false;
  return true;
}

/** Summarise a world package without importing anything. */
export function summariseWorldPackage(pkg: Record<string, unknown>): WorldPackageSummary {
  const count = (key: string) => (Array.isArray(pkg[key]) ? (pkg[key] as unknown[]).length : 0);
  return {
    seed:         typeof pkg.seed === 'number' ? pkg.seed : 0,
    settlements:  count('settlements'),
    dungeons:     count('dungeons'),
    customAssets: count('customAssets'),
  };
}

/**
 * Restore the `customAssets` of a world package into the given library.
 * Each entry is imported through `library.importEntry()`, which assigns a fresh
 * id and marks it custom, so importing twice never clobbers local work.
 */
export function importWorldPackage(
  raw: unknown,
  library: Pick<AssetLibrary, 'importEntry'>,
): WorldPackageImportResult {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'Invalid JSON', imported: [] };
    }
  }

  if (!isWorldPackage(parsed)) {
    return { ok: false, error: 'Not a TT&T world package (v1)', imported: [] };
  }

  const imported: LibraryEntry[] = [];
  const customAssets = Array.isArray(parsed.customAssets) ? parsed.customAssets : [];
  for (const snapshot of customAssets) {
    const entry = library.importEntry(snapshot);
    if (entry) imported.push(entry);
  }

  const summary = summariseWorldPackage(parsed);
  if (typeof window !== 'undefined') {
    (window as any).__owStudioLastWorldPackageImport = { ...summary, restored: imported.length };
  }
  console.log(
    `[WorldPackage] imported seed ${summary.seed} — ${imported.length}/${customAssets.length} custom asset(s) restored`,
  );

  return { ok: true, summary, imported };
}