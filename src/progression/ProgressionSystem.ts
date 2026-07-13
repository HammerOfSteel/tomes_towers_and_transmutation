// ── ProgressionSystem ─────────────────────────────────────────────────────

/** Tracks which books the player has read and which spells have been unlocked.
 *  In-memory only for now — persists for the duration of the current run. */
export class ProgressionSystem {
  private readonly _readBooks = new Set<string>();
  private readonly _unlockedSpells = new Set<string>();

  /** Mark a book as read.  If `spellUnlock` is supplied and this is the first
   *  time the book has been read, the spell is added to the unlocked set.
   *  @returns `true` if this was a first read, `false` if already read. */
  markRead(bookId: string, spellUnlock?: string): boolean {
    if (this._readBooks.has(bookId)) return false;
    this._readBooks.add(bookId);
    if (spellUnlock) this._unlockedSpells.add(spellUnlock);
    return true;
  }

  /** Whether the player has read the book with this id. */
  hasRead(bookId: string): boolean {
    return this._readBooks.has(bookId);
  }

  /** Whether a specific spell has been unlocked. */
  isSpellUnlocked(spellName: string): boolean {
    return this._unlockedSpells.has(spellName);
  }

  /** All unlocked spell keys, sorted alphabetically. */
  getUnlockedSpells(): string[] {
    return [...this._unlockedSpells].sort();
  }

  /** Number of unique books read this run. */
  get readCount(): number {
    return this._readBooks.size;
  }
}
