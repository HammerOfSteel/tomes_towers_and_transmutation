/**
 * AssetLibrary.ts
 *
 * Persistent, browsable gallery of all generated entity types produced by
 * Overworld Studio generators.  Stores buildings, dungeons, settlements, and
 * caves as JSON-serialisable entries in localStorage.
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

export type AssetType = 'building' | 'dungeon' | 'settlement' | 'cave';

export interface LibraryEntry {
  id:        string;
  type:      AssetType;
  name:      string;
  seed:      number;
  createdAt: number;
  tags:      string[];
  /** true = user has edited / overrides the procedural default for this location */
  isCustom:  boolean;
  /** JSON-serialisable snapshot of the generator output */
  data:      unknown;
  /** data:image/png;base64,… thumbnail or null */
  thumbnail: string | null;
}

interface StoredSnapshot {
  version: 1;
  entries: LibraryEntry[];
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

  // ── Serialisation ─────────────────────────────────────────────────────────

  toJSON(): StoredSnapshot {
    return { version: 1, entries: this._entries };
  }

  fromJSON(json: unknown): void {
    try {
      const snap = json as StoredSnapshot;
      if (snap?.version === 1 && Array.isArray(snap.entries)) {
        this._entries = snap.entries;
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
