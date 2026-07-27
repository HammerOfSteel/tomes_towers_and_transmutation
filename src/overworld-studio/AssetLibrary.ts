/**
 * AssetLibrary.ts
 *
 * Persistent, browsable gallery of all generated entity types produced by
 * Overworld Studio generators. Stores buildings, dungeons, settlements, and
 * caves as library entries in localStorage.
 *
 * Important detail:
 *   Some generator outputs are not plain JSON objects (for example DungeonPlan
 *   uses a Map for rooms). The library therefore stores runtime entries in
 *   memory, but encodes/decodes non-JSON structures when persisting or
 *   exporting.
 *
 * Usage:
 *   import { assetLibrary } from '@/overworld-studio/AssetLibrary';
 *   assetLibrary.add({ id, type, name, ... });
 *   const buildings = assetLibrary.getByType('building');
 *
 * Debug flags:
 *   window.__assetLibrarySize   — current entry count
 *   console.log('[AssetLibrary] ...')
 */

export type AssetType = 'building' | 'dungeon' | 'settlement' | 'cave' | 'room' | 'npc' | 'realm';

export interface LibraryEntry {
  id:        string;
  type:      AssetType;
  name:      string;
  seed:      number;
  createdAt: number;
  tags:      string[];
  /** true = user has edited / overrides the procedural default for this location */
  isCustom:  boolean;
  /** Runtime generator output (may contain Maps, arrays, nested objects, etc.) */
  data:      unknown;
  /** data:image/png;base64,… thumbnail or null */
  thumbnail: string | null;
}

interface StoredLibraryEntry extends Omit<LibraryEntry, 'data'> {
  data: unknown;
}

interface StoredSnapshot {
  version: 1;
  entries: StoredLibraryEntry[];
}

type EncodedMap = {
  __tttType: 'Map';
  entries: [string, unknown][];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function makeEntryId(type: AssetType, seed: number): string {
  return `${type}_${seed}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAssetType(value: unknown): value is AssetType {
  return value === 'building'
    || value === 'dungeon'
    || value === 'settlement'
    || value === 'cave'
    || value === 'room'
    || value === 'npc'
    || value === 'realm';
}

function encodeValue(value: unknown): unknown {
  if (value instanceof Map) {
    return {
      __tttType: 'Map',
      entries: Array.from(value.entries()).map(([k, v]) => [String(k), encodeValue(v)]),
    } satisfies EncodedMap;
  }
  if (Array.isArray(value)) {
    return value.map(encodeValue);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeValue(v);
    return out;
  }
  return value;
}

function decodeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeValue);
  }
  if (isPlainObject(value)) {
    if (value.__tttType === 'Map' && Array.isArray(value.entries)) {
      return new Map(
        value.entries.map((pair) => {
          const [k, v] = pair as [string, unknown];
          return [k, decodeValue(v)];
        }),
      );
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v);
    return out;
  }
  return value;
}

export class AssetLibrary {
  private readonly _key: string;
  private _entries: LibraryEntry[];

  constructor(storageKey = 'ttt_asset_library') {
    this._key     = storageKey;
    this._entries = [];
    this._load();
    console.log(`[AssetLibrary] initialised — ${this._entries.length} entries from storage`);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /** All entries sorted newest-first. */
  getAll(): readonly LibraryEntry[] {
    return [...this._entries].sort((a, b) => b.createdAt - a.createdAt);
  }

  getByType(type: AssetType): LibraryEntry[] {
    return this._entries
      .filter(e => e.type === type)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Case-insensitive substring search on entry name.
   * Empty query returns all entries (newest-first).
   */
  search(query: string): LibraryEntry[] {
    const q = query.trim().toLowerCase();
    const all = [...this._entries].sort((a, b) => b.createdAt - a.createdAt);
    if (!q) return all;
    return all.filter(e => e.name.toLowerCase().includes(q));
  }

  get size(): number { return this._entries.length; }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Upsert by id — adds new entry or replaces existing with same id. */
  add(entry: LibraryEntry): void {
    const idx = this._entries.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
      this._entries[idx] = entry;
    } else {
      this._entries.push(entry);
    }
    this._save();
    console.log(`[AssetLibrary] saved "${entry.name}" (${entry.type}) — total: ${this._entries.length}`);
    (window as any).__assetLibrarySize = this._entries.length;
  }

  remove(id: string): void {
    const before = this._entries.length;
    this._entries = this._entries.filter(e => e.id !== id);
    if (this._entries.length !== before) {
      this._save();
      console.log(`[AssetLibrary] removed ${id} — total: ${this._entries.length}`);
      (window as any).__assetLibrarySize = this._entries.length;
    }
  }

  clear(): void {
    this._entries = [];
    this._save();
    console.log('[AssetLibrary] cleared');
    (window as any).__assetLibrarySize = 0;
  }

  /** Return a portable JSON-safe snapshot of a single entry for export/download. */
  exportEntry(id: string): StoredLibraryEntry | null {
    const entry = this._entries.find(e => e.id === id);
    if (!entry) return null;
    return {
      ...entry,
      data: encodeValue(entry.data),
    };
  }

  /**
   * Duplicate an entry with a fresh id/timestamp and optional name override.
   * Returns the newly-created runtime entry or null if source id was not found.
   */
  duplicate(id: string, nameOverride?: string): LibraryEntry | null {
    const entry = this._entries.find(e => e.id === id);
    if (!entry) return null;
    const copy: LibraryEntry = {
      ...entry,
      id: makeEntryId(entry.type, entry.seed),
      name: nameOverride?.trim() || `${entry.name} Copy`,
      createdAt: Date.now(),
      isCustom: true,
      data: decodeValue(encodeValue(entry.data)),
    };
    this._entries.push(copy);
    this._save();
    console.log(`[AssetLibrary] duplicated "${entry.name}" -> "${copy.name}" — total: ${this._entries.length}`);
    (window as any).__assetLibrarySize = this._entries.length;
    return copy;
  }

  /**
   * Import a single exported library entry snapshot.
   * Imported assets are treated as custom local assets and receive a fresh id.
   */
  importEntry(snapshot: unknown): LibraryEntry | null {
    if (!isPlainObject(snapshot)) return null;
    if (!isAssetType(snapshot.type)) return null;

    const seed = typeof snapshot.seed === 'number' ? snapshot.seed : 0;
    const name = typeof snapshot.name === 'string' && snapshot.name.trim()
      ? snapshot.name.trim()
      : `Imported ${snapshot.type}`;
    const tags = Array.isArray(snapshot.tags)
      ? snapshot.tags.filter((t): t is string => typeof t === 'string')
      : [];
    const thumbnail = typeof snapshot.thumbnail === 'string' ? snapshot.thumbnail : null;

    const entry: LibraryEntry = {
      id: makeEntryId(snapshot.type, seed),
      type: snapshot.type,
      name,
      seed,
      createdAt: Date.now(),
      tags,
      isCustom: true,
      data: decodeValue(snapshot.data),
      thumbnail,
    };

    this._entries.push(entry);
    this._save();
    console.log(`[AssetLibrary] imported "${entry.name}" (${entry.type}) — total: ${this._entries.length}`);
    (window as any).__assetLibrarySize = this._entries.length;
    return entry;
  }

  /** Rename an existing entry. Empty names are rejected. */
  rename(id: string, nextName: string): LibraryEntry | null {
    const trimmed = nextName.trim();
    if (!trimmed) return null;
    const idx = this._entries.findIndex(e => e.id === id);
    if (idx < 0) return null;
    const updated: LibraryEntry = {
      ...this._entries[idx]!,
      name: trimmed,
      isCustom: true,
    };
    this._entries[idx] = updated;
    this._save();
    console.log(`[AssetLibrary] renamed ${id} -> "${trimmed}"`);
    (window as any).__assetLibrarySize = this._entries.length;
    return updated;
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  toJSON(): StoredSnapshot {
    return {
      version: 1,
      entries: this._entries.map((entry) => ({
        ...entry,
        data: encodeValue(entry.data),
      })),
    };
  }

  fromJSON(json: unknown): void {
    try {
      const snap = json as StoredSnapshot;
      if (snap?.version === 1 && Array.isArray(snap.entries)) {
        this._entries = snap.entries.map((entry) => ({
          ...entry,
          data: decodeValue(entry.data),
        }));
        console.log(`[AssetLibrary] loaded ${this._entries.length} entries from snapshot`);
        (window as any).__assetLibrarySize = this._entries.length;
      }
    } catch (e) {
      console.error('[AssetLibrary] fromJSON failed:', e);
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private _save(): void {
    try {
      localStorage.setItem(this._key, JSON.stringify(this.toJSON()));
    } catch (e) {
      console.warn('[AssetLibrary] localStorage save failed:', e);
    }
  }

  private _load(): void {
    try {
      const raw = localStorage.getItem(this._key);
      if (raw) this.fromJSON(JSON.parse(raw));
    } catch (e) {
      console.warn('[AssetLibrary] localStorage load failed:', e);
    }
  }
}

/** Module-level singleton used by all Studio generators. */
export const assetLibrary = new AssetLibrary();