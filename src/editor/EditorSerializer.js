import { EDITOR_SCHEMA_VERSION } from './EditorSchema';
const LS_AUTOSAVE_PREFIX = 'ttt_editor_autosave_';
export class EditorSerializer {
    core;
    getExtraFields;
    constructor(core, getExtraFields) {
        this.core = core;
        this.getExtraFields = getExtraFields;
    }
    /** Build a complete LevelDoc from current editor state. */
    build(type, id, name) {
        return {
            schema: EDITOR_SCHEMA_VERSION,
            type,
            id,
            name,
            objects: this.core.getObjects(),
            spawns: this.core.getSpawns(),
            exits: this.core.getExits(),
            ...this.getExtraFields(),
        };
    }
    /** Save to browser download as .ttt-level.json */
    download(doc) {
        const json = JSON.stringify(doc, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${doc.id}.ttt-level.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }
    /** Auto-save to localStorage. */
    autosave(doc) {
        try {
            const key = LS_AUTOSAVE_PREFIX + doc.type + '_' + doc.id;
            localStorage.setItem(key, JSON.stringify({ doc, savedAt: Date.now() }));
        }
        catch { /* quota exceeded — ignore */ }
    }
    /**
     * L6: Save to game output directory via the Vite dev-server plugin endpoint.
     * In production this is a no-op (the fetch will fail silently).
     * The game reads from `public/editor-output/<type>/<id>.ttt-level.json`.
     */
    async saveToGame(doc) {
        try {
            const res = await fetch('/api/save-level', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: doc.type, id: doc.id, content: JSON.stringify(doc, null, 2) }),
            });
            return res.ok;
        }
        catch {
            return false; // production build or dev server unavailable
        }
    }
    /** Load from a File object (from <input type=file>). */
    async loadFile(file) {
        const text = await file.text();
        const doc = JSON.parse(text);
        if (doc.schema !== EDITOR_SCHEMA_VERSION) {
            console.warn(`[EditorSerializer] Schema version mismatch: got ${doc.schema}, expected ${EDITOR_SCHEMA_VERSION}`);
        }
        return doc;
    }
    /** Load the most recent auto-save for a given type+id, or null. */
    loadAutosave(type, id) {
        try {
            const key = LS_AUTOSAVE_PREFIX + type + '_' + id;
            const raw = localStorage.getItem(key);
            if (!raw)
                return null;
            return JSON.parse(raw).doc;
        }
        catch {
            return null;
        }
    }
    /** Export as copy-pasteable TypeScript const. */
    exportToTS(doc) {
        const varName = doc.id.replace(/[^a-zA-Z0-9_]/g, '_');
        return `export const ${varName} = ${JSON.stringify(doc, null, 2)} as const;\n`;
    }
    /** Apply a loaded doc to the editor core. */
    async applyToCore(doc) {
        this.core.clearAll();
        await this.core.loadObjects(doc.objects);
        for (const spawn of doc.spawns) {
            this.core.placeSpawn(spawn.type, new (await import('three')).Vector3(spawn.x, spawn.y, spawn.z));
        }
        for (const exit of doc.exits) {
            this.core.placeExit(exit.type, new (await import('three')).Vector3(exit.x, exit.y, exit.z));
        }
    }
}
