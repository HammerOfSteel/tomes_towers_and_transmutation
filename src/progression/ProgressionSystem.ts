// ── ProgressionSystem ─────────────────────────────────────────────────────

// ── Stat types ────────────────────────────────────────────────────────────

export interface PlayerStats {
  /** Melee attack damage multiplier base (+1 per point applied in SpellSystem/CombatSystem). */
  power: number;
  /** Spell damage + projectile range multiplier. */
  attunement: number;
  /** Max HP bonus (+5 HP per point above 1, applied at level-up/spend time). */
  vitality: number;
  /** Movement speed fraction +4% per point; dodge cooldown −5% per point. */
  swiftness: number;
  /** Party member cap bonus (+1 per point). Minion damage +5% per point. */
  dominion: number;
  /** Crit chance +4% per point; resource yield ×(1 + cunning*0.1). */
  cunning: number;
}

const BASE_STATS: PlayerStats = {
  power: 1, attunement: 1, vitality: 1, swiftness: 1, dominion: 1, cunning: 1,
};

/** XP required to reach the NEXT level from `level`. Formula: 100 × level². */
export function xpThreshold(level: number): number {
  return 100 * level * level;
}

// ── Talent-derived modifier fields ────────────────────────────────────────
// Set by TalentSystem when nodes are purchased; read by other game systems.

export interface TalentModifiers {
  meleeDamageMult: number;     // Blade Dancer path
  spellDamageMult: number;     // Arcanist path
  aoeRadiusMult: number;       // Arcanist resonant field
  extraPartySlots: number;     // Conductor path (int)
  herbYieldMult: number;       // Naturalist path
  buildCostMult: number;       // Artificer path
  potionPotencyMult: number;   // Apothecary path
  // Passive flags
  hasCurseTouch: boolean;      // WL_1
  hasSoulDrain: boolean;       // WL_2
  hasVoidWeave: boolean;       // cross_ar_wl
  hasDeathPact: boolean;       // cross_wl_co
  hasSpellBlade: boolean;      // cross_bd_ar
}

const BASE_MODS: TalentModifiers = {
  meleeDamageMult: 1, spellDamageMult: 1, aoeRadiusMult: 1,
  extraPartySlots: 0, herbYieldMult: 1, buildCostMult: 1, potionPotencyMult: 1,
  hasCurseTouch: false, hasSoulDrain: false,
  hasVoidWeave: false, hasDeathPact: false, hasSpellBlade: false,
};

// ── Main class ────────────────────────────────────────────────────────────

/** Tracks spells, XP, level, stats, and talent modifier state. */
export class ProgressionSystem {
  private readonly _readBooks = new Set<string>();
  private readonly _unlockedSpells = new Set<string>();
  /** 4 equipped spell slots (0–3). Slot 0 always holds magic_bolt. */
  private readonly _equippedSlots: (string | null)[] = ['magic_bolt', null, null, null];

  // ── XP / levelling ────────────────────────────────────────────────────
  private _xp = 0;
  private _level = 1;
  private _statPoints = 0;
  private _talentPoints = 0;

  // ── Core stats ────────────────────────────────────────────────────────
  private _stats: PlayerStats = { ...BASE_STATS };

  // ── Talent modifiers (written by TalentSystem) ────────────────────────
  mods: TalentModifiers = { ...BASE_MODS };

  /** Callback fired when the player levels up. Receives the new level. */
  onLevelUp: ((newLevel: number) => void) | null = null;

  constructor() {
    // magic_bolt is the starter spell — always unlocked, no book required.
    this._unlockedSpells.add('magic_bolt');
  }

  // ── XP & Levelling ────────────────────────────────────────────────────

  /** Grant XP; auto-levels up when threshold is crossed.
   *  @returns true if one or more level-ups occurred. */
  grantXP(amount: number): boolean {
    if (amount <= 0) return false;
    this._xp += amount;
    let levelled = false;
    while (this._xp >= xpThreshold(this._level) && this._level < 30) {
      this._xp -= xpThreshold(this._level);
      this._level++;
      this._statPoints++;
      this._talentPoints++;
      levelled = true;
      this.onLevelUp?.(this._level);
    }
    return levelled;
  }

  get xp(): number { return this._xp; }
  get level(): number { return this._level; }
  get statPoints(): number { return this._statPoints; }
  get talentPoints(): number { return this._talentPoints; }

  /** XP fraction toward next level (0–1). */
  get xpProgress(): number {
    const needed = xpThreshold(this._level);
    return needed > 0 ? Math.min(1, this._xp / needed) : 1;
  }

  /** Consume a talent point (called by TalentSystem). */
  spendTalentPoint(n = 1): boolean {
    if (this._talentPoints < n) return false;
    this._talentPoints -= n;
    return true;
  }

  // ── Core Stats ────────────────────────────────────────────────────────

  get stats(): Readonly<PlayerStats> { return this._stats; }

  /** Spend 1 stat point on `stat`. Returns true if successful. */
  spendStat(stat: keyof PlayerStats): boolean {
    if (this._statPoints <= 0) return false;
    this._stats[stat]++;
    this._statPoints--;
    return true;
  }

  /** Directly increase a stat by `amount` without spending a stat point.
   *  Used for starting boon grants and external boosts. */
  boostStat(stat: keyof PlayerStats, amount: number): void {
    this._stats[stat] = Math.max(1, this._stats[stat] + amount);
  }

  // ── Derived stat helpers ───────────────────────────────────────────────

  /** Base max HP boosted by Vitality: 10 + (vitality − 1) × 5. */
  get derivedMaxHp(): number {
    return 10 + (this._stats.vitality - 1) * 5;
  }

  /** Spell damage multiplier: (1 + (attunement − 1) × 0.08) × talent mod. */
  get derivedSpellDamageMult(): number {
    const statBonus = 1 + (this._stats.attunement - 1) * 0.08;
    return statBonus * this.mods.spellDamageMult;
  }

  /** Melee damage multiplier: (1 + (power − 1) × 0.1) × talent mod. */
  get derivedMeleeDamageMult(): number {
    const statBonus = 1 + (this._stats.power - 1) * 0.10;
    return statBonus * this.mods.meleeDamageMult;
  }

  /** Move speed multiplier: 1 + (swiftness − 1) × 0.04. */
  get derivedSpeedMult(): number {
    return 1 + (this._stats.swiftness - 1) * 0.04;
  }

  /** Dodge cooldown multiplier (lower = faster): 1 − (swiftness − 1) × 0.05, min 0.4. */
  get derivedDodgeCooldownMult(): number {
    return Math.max(0.4, 1 - (this._stats.swiftness - 1) * 0.05);
  }

  /** Total party cap: 5 + dominion − 1 + talent extra slots. */
  get derivedPartyCap(): number {
    return 5 + (this._stats.dominion - 1) + this.mods.extraPartySlots;
  }

  /** Crit chance 0–1: (cunning − 1) × 0.04. */
  get derivedCritChance(): number {
    return (this._stats.cunning - 1) * 0.04;
  }

  /** Resource yield multiplier: 1 + (cunning − 1) × 0.1. */
  get derivedResourceYield(): number {
    return 1 + (this._stats.cunning - 1) * 0.1;
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
