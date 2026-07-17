/**
 * EditorSerializer.ts — save/load/export for all level editor types.
 */
import type { LevelDoc, EditorType } from './EditorSchema';
import { EDITOR_SCHEMA_VERSION } from './EditorSchema';
import type { EditorCore } from './EditorCore';

const LS_AUTOSAVE_PREFIX = 'ttt_editor_autosave_';

export class EditorSerializer {
  constructor(
    private readonly core: EditorCore,
    private readonly getExtraFields: () => Partial<LevelDoc>,
  ) {}

  /** Build a complete LevelDoc from current editor state. */
  build(type: EditorType, id: string, name: string): LevelDoc {
    return {
      schema:  EDITOR_SCHEMA_VERSION,
      type,
      id,
      name,
      objects: this.core.getObjects(),
      spawns:  this.core.getSpawns(),
      exits:   this.core.getExits(),
      ...this.getExtraFields(),
    } as LevelDoc;
  }

  /** Save to browser download as .ttt-level.json */
  download(doc: LevelDoc): void {
    const json = JSON.stringify(doc, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${doc.id}.ttt-level.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Auto-save to localStorage. */
  autosave(doc: LevelDoc): void {
    try {
      const key = LS_AUTOSAVE_PREFIX + doc.type + '_' + doc.id;
      localStorage.setItem(key, JSON.stringify({ doc, savedAt: Date.now() }));
    } catch { /* quota exceeded — ignore */ }
  }

  /** Load from a File object (from <input type=file>). */
  async loadFile(file: File): Promise<LevelDoc> {
    const text = await file.text();
    const doc  = JSON.parse(text) as LevelDoc;
    if (doc.schema !== EDITOR_SCHEMA_VERSION) {
      console.warn(`[EditorSerializer] Schema version mismatch: got ${doc.schema}, expected ${EDITOR_SCHEMA_VERSION}`);
    }
    return doc;
  }

  /** Load the most recent auto-save for a given type+id, or null. */
  loadAutosave(type: EditorType, id: string): LevelDoc | null {
    try {
      const key  = LS_AUTOSAVE_PREFIX + type + '_' + id;
      const raw  = localStorage.getItem(key);
      if (!raw) return null;
      return (JSON.parse(raw) as { doc: LevelDoc }).doc;
    } catch {
      return null;
    }
  }

  /** Export as copy-pasteable TypeScript const. */
  exportToTS(doc: LevelDoc): string {
    const varName = doc.id.replace(/[^a-zA-Z0-9_]/g, '_');
    return `export const ${varName} = ${JSON.stringify(doc, null, 2)} as const;\n`;
  }

  /** Apply a loaded doc to the editor core. */
  async applyToCore(doc: LevelDoc): Promise<void> {
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
