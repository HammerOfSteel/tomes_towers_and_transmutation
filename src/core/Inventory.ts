/**
 * Inventory — tracks consumable resources and gold.
 *
 * Resources: gold, ore, timber, essence (all integer counts ≥ 0).
 * Persisted to localStorage under 'ttt-inventory'.
 *
 * Phase 7e: Resource Economy
 */

export type ResourceType = 'gold' | 'ore' | 'timber' | 'essence';

export interface InventoryData {
  gold:    number;
  ore:     number;
  timber:  number;
  essence: number;
}

const STORAGE_KEY = 'ttt-inventory';

const EMPTY: InventoryData = { gold: 0, ore: 0, timber: 0, essence: 0 };

export class Inventory {
  private _data: InventoryData;

  /** Callback fired whenever any resource amount changes. */
  onChange: (() => void) | null = null;

  constructor() {
    this._data = this._load();
  }

  // ── Read ────────────────────────────────────────────────────────────────

  get(type: ResourceType): number {
    return this._data[type];
  }

  snapshot(): Readonly<InventoryData> {
    return { ...this._data };
  }

  // ── Write ───────────────────────────────────────────────────────────────

  /**
   * Add `amount` (>0) of a resource. Silently ignores ≤0 amounts.
   * Returns the new total.
   */
  add(type: ResourceType, amount: number): number {
    if (amount <= 0) return this._data[type];
    this._data[type] += Math.floor(amount);
    this._persist();
    this.onChange?.();
    return this._data[type];
  }

  /**
   * Spend `amount` of a resource.
   * Returns `true` and deducts if sufficient; returns `false` and does NOT
   * deduct if insufficient. Overspend is never allowed.
   */
  spend(type: ResourceType, amount: number): boolean {
    if (amount <= 0) return true;
    const need = Math.floor(amount);
    if (this._data[type] < need) return false;
    this._data[type] -= need;
    this._persist();
    this.onChange?.();
    return true;
  }

  /**
   * Spend multiple resources atomically.  Either all succeed or none are
   * deducted (all-or-nothing check first, then deduct).
   */
  spendMulti(costs: Partial<InventoryData>): boolean {
    // Validate first — no deduction if any resource is insufficient
    for (const [key, amt] of Object.entries(costs) as [ResourceType, number][]) {
      if ((amt ?? 0) > this._data[key]) return false;
    }
    for (const [key, amt] of Object.entries(costs) as [ResourceType, number][]) {
      this._data[key] -= Math.floor(amt ?? 0);
    }
    this._persist();
    this.onChange?.();
    return true;
  }

  /** Wipe all resources (used on new-game). */
  reset(): void {
    this._data = { ...EMPTY };
    this._persist();
    this.onChange?.();
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private _persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch { /* quota exceeded — ignore */ }
  }

  private _load(): InventoryData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...EMPTY };
      const parsed = JSON.parse(raw) as Partial<InventoryData>;
      return {
        gold:    Math.max(0, Math.floor(parsed.gold    ?? 0)),
        ore:     Math.max(0, Math.floor(parsed.ore     ?? 0)),
        timber:  Math.max(0, Math.floor(parsed.timber  ?? 0)),
        essence: Math.max(0, Math.floor(parsed.essence ?? 0)),
      };
    } catch {
      return { ...EMPTY };
    }
  }

  toJSON(): InventoryData  { return { ...this._data }; }
  fromJSON(d: InventoryData): void {
    this._data = {
      gold:    Math.max(0, Math.floor(d.gold    ?? 0)),
      ore:     Math.max(0, Math.floor(d.ore     ?? 0)),
      timber:  Math.max(0, Math.floor(d.timber  ?? 0)),
      essence: Math.max(0, Math.floor(d.essence ?? 0)),
    };
    this._persist();
    this.onChange?.();
  }
}
