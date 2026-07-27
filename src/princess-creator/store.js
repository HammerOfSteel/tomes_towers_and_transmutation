// ── Observable DNA store with undo/redo ──────────────────────────────────────
//
//  - set(path, value): dot-path edits ("body.headSize", "colors.primary")
//  - notifications are coalesced to one per animation frame
//  - color/name-only changes are flagged non-structural (retint, no rebuild)
//  - slider drags: beginDrag()/endDrag() collapse a scrub into ONE history entry
import { cloneDna, sanitizeDna } from './dna';
const HISTORY_CAP = 100;
/** Paths that only retint / relabel — no geometry rebuild needed. */
function isCosmeticPath(path) {
    return path.startsWith('colors.') || path === 'name' || path === 'seed';
}
export class DnaStore {
    current;
    listeners = new Set();
    undoStack = [];
    redoStack = [];
    pendingStructural = false;
    pendingArchetype = false;
    flushScheduled = false;
    dragSnapshot = null;
    constructor(initial) {
        this.current = cloneDna(initial);
    }
    get dna() {
        return this.current;
    }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    /** Dot-path setter. history: 'push' (default) | 'none' (drag frames). */
    set(path, value, history = 'push') {
        if (history === 'push' && this.dragSnapshot === null)
            this.pushHistory();
        const segments = path.split('.');
        let target = this.current;
        for (let i = 0; i < segments.length - 1; i++) {
            target = target[segments[i]];
        }
        target[segments[segments.length - 1]] = value;
        this.current = sanitizeDna(this.current);
        this.queue(!isCosmeticPath(path), false);
    }
    /** Replace the whole DNA (randomize, import, gallery load, archetype swap). */
    setDna(dna, opts = {}) {
        const archetypeChanged = dna.archetype !== this.current.archetype;
        if (opts.history !== false)
            this.pushHistory();
        this.current = sanitizeDna(cloneDna(dna));
        this.queue(true, archetypeChanged);
    }
    /** Begin a slider scrub: snapshot once; set(..., 'none') during the drag. */
    beginDrag() {
        if (this.dragSnapshot === null)
            this.dragSnapshot = JSON.stringify(this.current);
    }
    /** End a scrub: the pre-drag snapshot becomes one undo entry (if changed). */
    endDrag() {
        if (this.dragSnapshot !== null && this.dragSnapshot !== JSON.stringify(this.current)) {
            this.undoStack.push(this.dragSnapshot);
            if (this.undoStack.length > HISTORY_CAP)
                this.undoStack.shift();
            this.redoStack.length = 0;
        }
        this.dragSnapshot = null;
    }
    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }
    undo() {
        const prev = this.undoStack.pop();
        if (!prev)
            return;
        this.redoStack.push(JSON.stringify(this.current));
        this.restore(prev);
    }
    redo() {
        const next = this.redoStack.pop();
        if (!next)
            return;
        this.undoStack.push(JSON.stringify(this.current));
        this.restore(next);
    }
    restore(json) {
        const before = this.current.archetype;
        this.current = sanitizeDna(JSON.parse(json));
        this.queue(true, this.current.archetype !== before);
    }
    pushHistory() {
        this.undoStack.push(JSON.stringify(this.current));
        if (this.undoStack.length > HISTORY_CAP)
            this.undoStack.shift();
        this.redoStack.length = 0;
    }
    queue(structural, archetypeChanged) {
        this.pendingStructural ||= structural;
        this.pendingArchetype ||= archetypeChanged;
        if (this.flushScheduled)
            return;
        this.flushScheduled = true;
        const flush = () => {
            this.flushScheduled = false;
            const ev = {
                dna: this.current,
                structural: this.pendingStructural,
                archetypeChanged: this.pendingArchetype,
            };
            this.pendingStructural = false;
            this.pendingArchetype = false;
            for (const fn of this.listeners)
                fn(ev);
        };
        if (typeof requestAnimationFrame === 'function')
            requestAnimationFrame(flush);
        else
            setTimeout(flush, 0);
    }
}
