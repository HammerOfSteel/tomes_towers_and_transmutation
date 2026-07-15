/**
 * DiscoveryTracker — persists the player's exploration state.
 *
 * Tracks which dungeons/settlements have been found and serialises to
 * localStorage so the world feels persistent across sessions.
 */

export class DiscoveryTracker {
  discoveredDungeons:    Set<number> = new Set();
  discoveredSettlements: Set<number> = new Set();
  /** Dungeons the player has entered at least once (treated as "cleared"). */
  clearedDungeons:       Set<number> = new Set();

  markDungeonFound(id: number): void    { this.discoveredDungeons.add(id); }
  markSettlementFound(id: number): void { this.discoveredSettlements.add(id); }
  markDungeonCleared(id: number): void  { this.clearedDungeons.add(id); }

  isDungeonFound(id: number): boolean    { return this.discoveredDungeons.has(id); }
  isSettlementFound(id: number): boolean { return this.discoveredSettlements.has(id); }
  isDungeonCleared(id: number): boolean  { return this.clearedDungeons.has(id); }

  serialize(): string {
    return JSON.stringify({
      d: [...this.discoveredDungeons],
      s: [...this.discoveredSettlements],
    });
  }

  static deserialize(raw: string): DiscoveryTracker {
    const t = new DiscoveryTracker();
    try {
      const obj = JSON.parse(raw) as { d?: number[]; s?: number[] };
      if (Array.isArray(obj.d)) obj.d.forEach(id => t.discoveredDungeons.add(id));
      if (Array.isArray(obj.s)) obj.s.forEach(id => t.discoveredSettlements.add(id));
    } catch { /* corrupt save — start fresh */ }
    return t;
  }

  static loadFromStorage(key = 'ow_discovery'): DiscoveryTracker {
    const raw = localStorage.getItem(key);
    return raw ? DiscoveryTracker.deserialize(raw) : new DiscoveryTracker();
  }

  saveToStorage(key = 'ow_discovery'): void {
    localStorage.setItem(key, this.serialize());
  }
}
