/**
 * ConsumableInventory — stores crafted potions and manages 3 equipment token slots.
 *
 * Potions: stacked by ID (e.g. potion_heal_minor → 3).
 * Equipment tokens: 3 physical slots; equipping applies a stat delta to
 *   ProgressionSystem via boostStat(); unequipping reverses it.
 *
 * Persisted to localStorage under 'ttt-consumables'.
 */
export const POTION_DEFS = {
    potion_heal_minor: {
        id: 'potion_heal_minor', name: 'Minor Healing Draught', icon: '🧪',
        healAmount: 15, buffDurationMs: 0, effectLabel: 'Restores 15 HP',
    },
    potion_heal_major: {
        id: 'potion_heal_major', name: 'Major Healing Draught', icon: '🧪',
        healAmount: 40, buffDurationMs: 0, effectLabel: 'Restores 40 HP',
    },
    potion_swiftness: {
        id: 'potion_swiftness', name: 'Swiftness Brew', icon: '💨',
        healAmount: 0, buffDurationMs: 30_000, effectLabel: '+30% move speed for 30s',
    },
    potion_power: {
        id: 'potion_power', name: 'Power Tincture', icon: '💪',
        healAmount: 0, buffDurationMs: 20_000, effectLabel: '+50% melee damage for 20s',
    },
    potion_mystery: {
        id: 'potion_mystery', name: 'Mystery Concoction', icon: '❓',
        healAmount: 0, buffDurationMs: 0, effectLabel: 'Unknown effect…',
    },
};
export const TOKEN_DEFS = {
    token_iron_blade: {
        id: 'token_iron_blade', name: 'Iron Blade Token', icon: '⚔️',
        description: '+5 Power while equipped',
        statKey: 'power', statDelta: 5,
    },
    token_arcane_focus: {
        id: 'token_arcane_focus', name: 'Arcane Focus Token', icon: '🔮',
        description: '+3 Attunement while equipped',
        statKey: 'attunement', statDelta: 3,
    },
    token_vitality_band: {
        id: 'token_vitality_band', name: 'Vitality Band Token', icon: '💎',
        description: '+4 Vitality while equipped',
        statKey: 'vitality', statDelta: 4,
    },
};
// ── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ttt-consumables';
// ── ConsumableInventory ───────────────────────────────────────────────────────
export class ConsumableInventory {
    _potions = new Map();
    /** 3 equipment slots; null = empty. */
    _equippedTokens = [null, null, null];
    /** Active timed buffs (potions with duration). */
    activeBuffs = [];
    /** Called when a potion is used; passes buff info if timed. */
    onBuff = null;
    /** Called when HP should be restored. */
    onHeal = null;
    /** Called when any inventory state changes (for HUD refresh). */
    onChange = null;
    constructor() {
        this._load();
    }
    // ── Potions ──────────────────────────────────────────────────────────────
    addPotion(id, count = 1) {
        if (count <= 0)
            return;
        this._potions.set(id, (this._potions.get(id) ?? 0) + count);
        this._save();
        this.onChange?.();
    }
    getPotionCount(id) {
        return this._potions.get(id) ?? 0;
    }
    /** All held potions as {id, count} pairs (only non-zero). */
    getPotionList() {
        const result = [];
        for (const [id, count] of this._potions) {
            if (count > 0) {
                const def = POTION_DEFS[id];
                if (def)
                    result.push({ id, count, def });
            }
        }
        return result;
    }
    /**
     * Use one of `id`. Returns false if not in inventory.
     * Fires onHeal for instant heals, or onBuff for timed effects.
     */
    usePotion(id) {
        const count = this._potions.get(id) ?? 0;
        if (count <= 0)
            return false;
        const def = POTION_DEFS[id];
        if (!def)
            return false;
        this._potions.set(id, count - 1);
        this._save();
        this.onChange?.();
        if (def.healAmount > 0) {
            this.onHeal?.(def.healAmount);
        }
        if (def.buffDurationMs > 0) {
            const buff = {
                id,
                label: def.name,
                color: id === 'potion_swiftness' ? '#44ddff' : id === 'potion_power' ? '#ff8844' : '#aaaaff',
                expiresAt: Date.now() + def.buffDurationMs,
            };
            this.activeBuffs.push(buff);
            this.onBuff?.(buff);
        }
        return true;
    }
    /** Called each frame to expire old buffs. Returns any that just expired. */
    tickBuffs() {
        const now = Date.now();
        const expired = [];
        for (let i = this.activeBuffs.length - 1; i >= 0; i--) {
            if (this.activeBuffs[i].expiresAt <= now) {
                expired.push(...this.activeBuffs.splice(i, 1));
            }
        }
        return expired;
    }
    // ── Equipment tokens ─────────────────────────────────────────────────────
    get equippedTokens() { return this._equippedTokens; }
    addToken(id) {
        // Tokens are added to a stash — caller can equip from CraftingUI
        // (for simplicity we auto-equip into the first free slot)
        const free = this._equippedTokens.indexOf(null);
        if (free !== -1) {
            this._equippedTokens[free] = id;
            this._save();
            this.onChange?.();
        }
    }
    equipToken(slotIndex, tokenId, prog) {
        if (slotIndex < 0 || slotIndex > 2)
            return;
        this.unequipToken(slotIndex, prog);
        const def = TOKEN_DEFS[tokenId];
        if (!def)
            return;
        this._equippedTokens[slotIndex] = tokenId;
        prog.boostStat(def.statKey, def.statDelta);
        this._save();
        this.onChange?.();
    }
    unequipToken(slotIndex, prog) {
        const current = this._equippedTokens[slotIndex];
        if (!current)
            return;
        const def = TOKEN_DEFS[current];
        if (def)
            prog.boostStat(def.statKey, -def.statDelta);
        this._equippedTokens[slotIndex] = null;
        this._save();
        this.onChange?.();
    }
    // ── Persistence ──────────────────────────────────────────────────────────
    _save() {
        try {
            const data = {
                potions: Object.fromEntries(this._potions),
                equippedTokens: [...this._equippedTokens],
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
        catch { /* quota exceeded — ignore */ }
    }
    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw)
                return;
            const data = JSON.parse(raw);
            if (data.potions) {
                for (const [id, count] of Object.entries(data.potions)) {
                    if (typeof count === 'number' && count > 0) {
                        this._potions.set(id, count);
                    }
                }
            }
            if (Array.isArray(data.equippedTokens)) {
                for (let i = 0; i < 3; i++) {
                    this._equippedTokens[i] = data.equippedTokens[i] ?? null;
                }
            }
        }
        catch { /* corrupt save — ignore */ }
    }
    /** Wipe everything (used on new game). */
    reset() {
        this._potions.clear();
        this._equippedTokens = [null, null, null];
        this.activeBuffs.length = 0;
        this._save();
        this.onChange?.();
    }
}
