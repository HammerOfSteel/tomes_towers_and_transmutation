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
function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function encodeValue(value) {
    if (value instanceof Map) {
        return {
            __tttType: 'Map',
            entries: Array.from(value.entries()).map(([k, v]) => [String(k), encodeValue(v)]),
        };
    }
    if (Array.isArray(value)) {
        return value.map(encodeValue);
    }
    if (isPlainObject(value)) {
        const out = {};
        for (const [k, v] of Object.entries(value))
            out[k] = encodeValue(v);
        return out;
    }
    return value;
}
function decodeValue(value) {
    if (Array.isArray(value)) {
        return value.map(decodeValue);
    }
    if (isPlainObject(value)) {
        if (value.__tttType === 'Map' && Array.isArray(value.entries)) {
            return new Map(value.entries.map((pair) => {
                const [k, v] = pair;
                return [k, decodeValue(v)];
            }));
        }
        const out = {};
        for (const [k, v] of Object.entries(value))
            out[k] = decodeValue(v);
        return out;
    }
    return value;
}
export class AssetLibrary {
    _key;
    _entries;
    constructor(storageKey = 'ttt_asset_library') {
        this._key = storageKey;
        this._entries = [];
        this._load();
        console.log(`[AssetLibrary] initialised — ${this._entries.length} entries from storage`);
    }
    // ── Read ──────────────────────────────────────────────────────────────────
    /** All entries sorted newest-first. */
    getAll() {
        return [...this._entries].sort((a, b) => b.createdAt - a.createdAt);
    }
    getByType(type) {
        return this._entries
            .filter(e => e.type === type)
            .sort((a, b) => b.createdAt - a.createdAt);
    }
    /**
     * Case-insensitive substring search on entry name.
     * Empty query returns all entries (newest-first).
     */
    search(query) {
        const q = query.trim().toLowerCase();
        const all = [...this._entries].sort((a, b) => b.createdAt - a.createdAt);
        if (!q)
            return all;
        return all.filter(e => e.name.toLowerCase().includes(q));
    }
    get size() { return this._entries.length; }
    // ── Write ─────────────────────────────────────────────────────────────────
    /** Upsert by id — adds new entry or replaces existing with same id. */
    add(entry) {
        const idx = this._entries.findIndex(e => e.id === entry.id);
        if (idx >= 0) {
            this._entries[idx] = entry;
        }
        else {
            this._entries.push(entry);
        }
        this._save();
        console.log(`[AssetLibrary] saved "${entry.name}" (${entry.type}) — total: ${this._entries.length}`);
        window.__assetLibrarySize = this._entries.length;
    }
    remove(id) {
        const before = this._entries.length;
        this._entries = this._entries.filter(e => e.id !== id);
        if (this._entries.length !== before) {
            this._save();
            console.log(`[AssetLibrary] removed ${id} — total: ${this._entries.length}`);
            window.__assetLibrarySize = this._entries.length;
        }
    }
    clear() {
        this._entries = [];
        this._save();
        console.log('[AssetLibrary] cleared');
        window.__assetLibrarySize = 0;
    }
    /** Return a portable JSON-safe snapshot of a single entry for export/download. */
    exportEntry(id) {
        const entry = this._entries.find(e => e.id === id);
        if (!entry)
            return null;
        return {
            ...entry,
            data: encodeValue(entry.data),
        };
    }
    // ── Serialisation ─────────────────────────────────────────────────────────
    toJSON() {
        return {
            version: 1,
            entries: this._entries.map((entry) => ({
                ...entry,
                data: encodeValue(entry.data),
            })),
        };
    }
    fromJSON(json) {
        try {
            const snap = json;
            if (snap?.version === 1 && Array.isArray(snap.entries)) {
                this._entries = snap.entries.map((entry) => ({
                    ...entry,
                    data: decodeValue(entry.data),
                }));
                console.log(`[AssetLibrary] loaded ${this._entries.length} entries from snapshot`);
                window.__assetLibrarySize = this._entries.length;
            }
        }
        catch (e) {
            console.error('[AssetLibrary] fromJSON failed:', e);
        }
    }
    // ── Persistence ───────────────────────────────────────────────────────────
    _save() {
        try {
            localStorage.setItem(this._key, JSON.stringify(this.toJSON()));
        }
        catch (e) {
            console.warn('[AssetLibrary] localStorage save failed:', e);
        }
    }
    _load() {
        try {
            const raw = localStorage.getItem(this._key);
            if (raw)
                this.fromJSON(JSON.parse(raw));
        }
        catch (e) {
            console.warn('[AssetLibrary] localStorage load failed:', e);
        }
    }
}
/** Module-level singleton used by all Studio generators. */
export const assetLibrary = new AssetLibrary();
