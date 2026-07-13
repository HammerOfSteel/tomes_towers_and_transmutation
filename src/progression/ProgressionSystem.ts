// ── ProgressionSystem ─────────────────────────────────────────────────────

/** Tracks which books the player has read and which spells have been unlocked.
 *  In-memory only for now — persists for the duration of the current run. */
export class ProgressionSystem {
  private readonly _readBooks = new Set<string>();
  private readonly _unlockedSpells = new Set<string>();
  /** 4 equipped spell slots (0–3). Slot 0 always holds magic_bolt. */
  private readonly _equippedSlots: (string | null)[] = ['magic_bolt', null, null, null];

  constructor() {
    // magic_bolt is the starter spell — always unlocked, no book required.
    this._unlockedSpells.add('magic_bolt');
  }

  /** Mark a book as read.  If `spellUnlock` is supplied and this is the first
   *  time the book has been read, the spell is added to the unlocked set and
   *  auto-equipped to the first empty slot (1–3, slot 0 is reserved).
   *  @returns `true` if this was a first read, `false` if already read. */
  markRead(bookId: string, spellUnlock?: string): boolean {
    if (this._readBooks.has(bookId)) return false;
    this._readBooks.add(bookId);
    if (spellUnlock) {
      this._unlockedSpells.add(spellUnlock);
      // Auto-equip to first empty slot, skipping slot 0 (magic_bolt reserved)
      const empty = this._equippedSlots.findIndex((s, i) => i > 0 && s === null);
      if (empty !== -1) this._equippedSlots[empty] = spellUnlock;
    }
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

  // ── Equipped slots ────────────────────────────────────────────────────────

  /** Assign a spell to a slot (0–3). */
  equipSpell(spellId: string, slot: number): void {
    if (slot < 0 || slot > 3) return;
    this._equippedSlots[slot] = spellId;
  }

  /** Clear a slot. */
  unequipSlot(slot: number): void {
    if (slot < 0 || slot > 3) return;
    this._equippedSlots[slot] = null;
  }

  /** Spell ID in the given slot, or null if empty. */
  getEquippedSlot(slot: number): string | null {
    return this._equippedSlots[slot] ?? null;
  }

  /** All 4 equipped slots as an array (may contain nulls). */
  getEquippedSlots(): (string | null)[] {
    return [...this._equippedSlots];
  }

  /** Dev/cheat: unlock a spell without reading a book, and auto-equip it. */
  grantSpell(spellId: string): void {
    this._unlockedSpells.add(spellId);
    // Equip to first empty slot if any
    const empty = this._equippedSlots.findIndex((s, i) => i > 0 && s === null);
    if (empty !== -1) this._equippedSlots[empty] = spellId;
    // If already in some slot, leave it alone
  }

  /** Number of unique books read this run. */
  get readCount(): number {
    return this._readBooks.size;
  }
}
