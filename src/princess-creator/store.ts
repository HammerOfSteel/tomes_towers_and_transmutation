// ── Observable DNA store with undo/redo ──────────────────────────────────────
//
//  - set(path, value): dot-path edits ("body.headSize", "colors.primary")
//  - notifications are coalesced to one per animation frame
//  - color/name-only changes are flagged non-structural (retint, no rebuild)
//  - slider drags: beginDrag()/endDrag() collapse a scrub into ONE history entry

import type { PrincessDNA } from './types';
import { cloneDna, sanitizeDna } from './dna';

export interface ChangeEvent {
  dna: PrincessDNA;
  structural: boolean;
  archetypeChanged: boolean;
}

type Listener = (ev: ChangeEvent) => void;

const HISTORY_CAP = 100;

/** Paths that only retint / relabel — no geometry rebuild needed. */
function isCosmeticPath(path: string): boolean {
  return path.startsWith('colors.') || path === 'name' || path === 'seed';
}

export class DnaStore {
  private current: PrincessDNA;
  private listeners = new Set<Listener>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private pendingStructural = false;
  private pendingArchetype = false;
  private flushScheduled = false;
  private dragSnapshot: string | null = null;

  constructor(initial: PrincessDNA) {
    this.current = cloneDna(initial);
  }

  get dna(): PrincessDNA {
    return this.current;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Dot-path setter. history: 'push' (default) | 'none' (drag frames). */
  set(path: string, value: unknown, history: 'push' | 'none' = 'push'): void {
    if (history === 'push' && this.dragSnapshot === null) this.pushHistory();
    const segments = path.split('.');
    let target: Record<string, unknown> = this.current as unknown as Record<string, unknown>;
    for (let i = 0; i < segments.length - 1; i++) {
      target = target[segments[i]] as Record<string, unknown>;
    }
    target[segments[segments.length - 1]] = value;
    this.current = sanitizeDna(this.current);
    this.queue(!isCosmeticPath(path), false);
  }

  /** Replace the whole DNA (randomize, import, gallery load, archetype swap). */
  setDna(dna: PrincessDNA, opts: { history?: boolean } = {}): void {
    const archetypeChanged = dna.archetype !== this.current.archetype;
    if (opts.history !== false) this.pushHistory();
    this.current = sanitizeDna(cloneDna(dna));
    this.queue(true, archetypeChanged);
  }

  /** Begin a slider scrub: snapshot once; set(..., 'none') during the drag. */
  beginDrag(): void {
    if (this.dragSnapshot === null) this.dragSnapshot = JSON.stringify(this.current);
  }

  /** End a scrub: the pre-drag snapshot becomes one undo entry (if changed). */
  endDrag(): void {
    if (this.dragSnapshot !== null && this.dragSnapshot !== JSON.stringify(this.current)) {
      this.undoStack.push(this.dragSnapshot);
      if (this.undoStack.length > HISTORY_CAP) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.dragSnapshot = null;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.current));
    this.restore(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.current));
    this.restore(next);
  }

  private restore(json: string): void {
    const before = this.current.archetype;
    this.current = sanitizeDna(JSON.parse(json));
    this.queue(true, this.current.archetype !== before);
  }

  private pushHistory(): void {
    this.undoStack.push(JSON.stringify(this.current));
    if (this.undoStack.length > HISTORY_CAP) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private queue(structural: boolean, archetypeChanged: boolean): void {
    this.pendingStructural ||= structural;
    this.pendingArchetype ||= archetypeChanged;
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    const flush = (): void => {
      this.flushScheduled = false;
      const ev: ChangeEvent = {
        dna: this.current,
        structural: this.pendingStructural,
        archetypeChanged: this.pendingArchetype,
      };
      this.pendingStructural = false;
      this.pendingArchetype = false;
      for (const fn of this.listeners) fn(ev);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else setTimeout(flush, 0);
  }
}
