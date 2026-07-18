/**
 * EditorVersioning.ts — localStorage version history for editor level docs.
 *
 * Each (type, id) pair keeps up to MAX_VERSIONS snapshots.
 * The immutable "base template" is stored separately under `_base` and is
 * never overwritten after the first save — it is always the initial state.
 *
 * Usage:
 *   EditorVersioning.save(doc, 'added east wing')
 *   EditorVersioning.listVersions('tower_floor', 'default')
 *   EditorVersioning.restore(entry)  // returns the LevelDoc
 *   EditorVersioning.getBase('tower_floor', 'default')  // original template
 */

import type { LevelDoc, EditorType } from './EditorSchema';

export interface EditorVersionEntry {
  version: number;     // monotonically increasing
  label:   string;     // human name
  savedAt: number;     // Date.now()
  doc:     LevelDoc;
}

const VERSION_KEY_PREFIX = 'ttt_ed_versions_';
const BASE_KEY_PREFIX    = 'ttt_ed_base_';
export const MAX_VERSIONS = 25;

function _versionKey(type: string, id: string): string {
  return VERSION_KEY_PREFIX + type + '__' + id;
}
function _baseKey(type: string, id: string): string {
  return BASE_KEY_PREFIX + type + '__' + id;
}

export const EditorVersioning = {
  /**
   * Save a new version snapshot.
   * On the very first save, also writes the immutable base template.
   * Returns the new entry.
   */
  save(doc: LevelDoc, label?: string): EditorVersionEntry {
    const existing = this.listVersions(doc.type, doc.id);
    const nextVer  = (existing[0]?.version ?? 0) + 1;
    const entry: EditorVersionEntry = {
      version: nextVer,
      label:   label?.trim() || `v${nextVer} — ${_timestamp()}`,
      savedAt: Date.now(),
      doc,
    };
    const next = [entry, ...existing].slice(0, MAX_VERSIONS);
    try {
      localStorage.setItem(_versionKey(doc.type, doc.id), JSON.stringify(next));
      // First ever save → write immutable base template
      if (!localStorage.getItem(_baseKey(doc.type, doc.id))) {
        localStorage.setItem(_baseKey(doc.type, doc.id), JSON.stringify(doc));
      }
    } catch { /* localStorage quota — ignore */ }
    return entry;
  },

  /** Return all saved versions for a (type, id), newest first. */
  listVersions(type: EditorType | string, id: string): EditorVersionEntry[] {
    try {
      const raw = localStorage.getItem(_versionKey(type, id));
      return raw ? (JSON.parse(raw) as EditorVersionEntry[]) : [];
    } catch { return []; }
  },

  /** Return the immutable base template (first-ever saved doc), or null. */
  getBase(type: EditorType | string, id: string): LevelDoc | null {
    try {
      const raw = localStorage.getItem(_baseKey(type, id));
      return raw ? (JSON.parse(raw) as LevelDoc) : null;
    } catch { return null; }
  },

  /** Restore a version entry — just returns the doc, caller applies it. */
  restore(entry: EditorVersionEntry): LevelDoc {
    return entry.doc;
  },

  /** Delete all versions + base for a (type, id). */
  clear(type: EditorType | string, id: string): void {
    localStorage.removeItem(_versionKey(type, id));
    localStorage.removeItem(_baseKey(type, id));
  },

  /** How many versions are stored for (type, id). */
  count(type: EditorType | string, id: string): number {
    return this.listVersions(type, id).length;
  },
};

function _timestamp(): string {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
