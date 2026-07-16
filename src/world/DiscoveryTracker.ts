/**
 * DiscoveryTracker — persists the player's exploration state.
 *
 * Tracks which dungeons/settlements have been found and serialises to
 * localStorage so the world feels persistent across sessions.
 *
 * Camp keys are "wx:wz" rounded to 1 decimal — stable across world reloads
 * because camps are seeded deterministically from world seed + Poisson disk.
 */

export class DiscoveryTracker {
  discoveredDungeons:    Set<number> = new Set();
  discoveredSettlements: Set<number> = new Set();
  /** Dungeons the player has entered at least once (treated as "cleared"). */
  clearedDungeons:       Set<number> = new Set();
  /** Enemy camps whose enemies have all been killed (key = "wx:wz"). */
  clearedCamps:          Set<string> = new Set();

  markDungeonFound(id: number): void    { this.discoveredDungeons.add(id); }
  markSettlementFound(id: number): void { this.discoveredSettlements.add(id); }
  markDungeonCleared(id: number): void  { this.clearedDungeons.add(id); }
  markCampCleared(wx: number, wz: number): void {
    this.clearedCamps.add(`${wx.toFixed(1)}:${wz.toFixed(1)}`);
  }

  isDungeonFound(id: number): boolean    { return this.discoveredDungeons.has(id); }
  isSettlementFound(id: number): boolean { return this.discoveredSettlements.has(id); }
  isDungeonCleared(id: number): boolean  { return this.clearedDungeons.has(id); }
  isCampCleared(wx: number, wz: number): boolean {
    return this.clearedCamps.has(`${wx.toFixed(1)}:${wz.toFixed(1)}`);
  }

  serialize(): string {
    return JSON.stringify({
      d:  [...this.discoveredDungeons],
      s:  [...this.discoveredSettlements],
      cc: [...this.clearedCamps],
    });
  }

  static deserialize(raw: string): DiscoveryTracker {
    const t = new DiscoveryTracker();
    try {
      const obj = JSON.parse(raw) as { d?: number[]; s?: number[]; cc?: string[] };
      if (Array.isArray(obj.d))  obj.d.forEach(id  => t.discoveredDungeons.add(id));
      if (Array.isArray(obj.s))  obj.s.forEach(id  => t.discoveredSettlements.add(id));
      if (Array.isArray(obj.cc)) obj.cc.forEach(key => t.clearedCamps.add(key));
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