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
    discoveredDungeons = new Set();
    discoveredSettlements = new Set();
    /** Dungeons the player has entered at least once (treated as "cleared"). */
    clearedDungeons = new Set();
    /** Enemy camps whose enemies have all been killed (key = "wx:wz"). */
    clearedCamps = new Set();
    markDungeonFound(id) { this.discoveredDungeons.add(id); }
    markSettlementFound(id) { this.discoveredSettlements.add(id); }
    markDungeonCleared(id) { this.clearedDungeons.add(id); }
    markCampCleared(wx, wz) {
        this.clearedCamps.add(`${wx.toFixed(1)}:${wz.toFixed(1)}`);
    }
    isDungeonFound(id) { return this.discoveredDungeons.has(id); }
    isSettlementFound(id) { return this.discoveredSettlements.has(id); }
    isDungeonCleared(id) { return this.clearedDungeons.has(id); }
    isCampCleared(wx, wz) {
        return this.clearedCamps.has(`${wx.toFixed(1)}:${wz.toFixed(1)}`);
    }
    serialize() {
        return JSON.stringify({
            d: [...this.discoveredDungeons],
            s: [...this.discoveredSettlements],
            cc: [...this.clearedCamps],
        });
    }
    static deserialize(raw) {
        const t = new DiscoveryTracker();
        try {
            const obj = JSON.parse(raw);
            if (Array.isArray(obj.d))
                obj.d.forEach(id => t.discoveredDungeons.add(id));
            if (Array.isArray(obj.s))
                obj.s.forEach(id => t.discoveredSettlements.add(id));
            if (Array.isArray(obj.cc))
                obj.cc.forEach(key => t.clearedCamps.add(key));
        }
        catch { /* corrupt save — start fresh */ }
        return t;
    }
    static loadFromStorage(key = 'ow_discovery') {
        const raw = localStorage.getItem(key);
        return raw ? DiscoveryTracker.deserialize(raw) : new DiscoveryTracker();
    }
    saveToStorage(key = 'ow_discovery') {
        localStorage.setItem(key, this.serialize());
    }
}
