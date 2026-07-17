/**
 * EditorHistory.ts — command-pattern undo/redo stack for the level editors.
 */

export interface EditorCommand {
  type: string;
  undo: () => void;
  redo: () => void;
}

const MAX_HISTORY = 100;

export class EditorHistory {
  private _stack:   EditorCommand[] = [];
  private _cursor   = -1;

  get undoCount(): number  { return this._cursor + 1; }
  get canUndo():   boolean { return this._cursor >= 0; }
  get canRedo():   boolean { return this._cursor < this._stack.length - 1; }

  push(cmd: EditorCommand): void {
    // Drop any redo history beyond cursor
    this._stack = this._stack.slice(0, this._cursor + 1);
    this._stack.push(cmd);
    this._cursor++;
    if (this._stack.length > MAX_HISTORY) {
      this._stack.shift();
      this._cursor--;
    }
  }

  undo(): void {
    if (!this.canUndo) return;
    this._stack[this._cursor]!.undo();
    this._cursor--;
  }

  redo(): void {
    if (!this.canRedo) return;
    this._cursor++;
    this._stack[this._cursor]!.redo();
  }

  clear(): void {
    this._stack  = [];
    this._cursor = -1;
  }
}
