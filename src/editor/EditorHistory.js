/**
 * EditorHistory.ts — command-pattern undo/redo stack for the level editors.
 */
const MAX_HISTORY = 100;
export class EditorHistory {
    _stack = [];
    _cursor = -1;
    get undoCount() { return this._cursor + 1; }
    get canUndo() { return this._cursor >= 0; }
    get canRedo() { return this._cursor < this._stack.length - 1; }
    push(cmd) {
        // Drop any redo history beyond cursor
        this._stack = this._stack.slice(0, this._cursor + 1);
        this._stack.push(cmd);
        this._cursor++;
        if (this._stack.length > MAX_HISTORY) {
            this._stack.shift();
            this._cursor--;
        }
    }
    undo() {
        if (!this.canUndo)
            return;
        this._stack[this._cursor].undo();
        this._cursor--;
    }
    redo() {
        if (!this.canRedo)
            return;
        this._cursor++;
        this._stack[this._cursor].redo();
    }
    clear() {
        this._stack = [];
        this._cursor = -1;
    }
}
