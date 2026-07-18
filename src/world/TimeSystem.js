/**
 * TimeSystem — lightweight in-game clock.
 *
 * 1 real second = 2 in-game minutes  (configurable via REAL_TO_GAME_RATIO).
 * Persists the current hour to localStorage so NPCs maintain schedule continuity.
 *
 * Usage:
 *   const clock = TimeSystem.instance;
 *   clock.update(dt);           // call each frame
 *   clock.hour                  // 0–23 float (e.g. 14.5 = 2:30 pm)
 *   clock.schedulePhase         // 'work' | 'home' | 'wander'
 */
const LS_KEY = 'ttt-time-hour';
const REAL_TO_GAME_RATIO = 120; // 1 real s → 2 in-game minutes (120 s/h)
export class TimeSystem {
    static _inst = null;
    /** Singleton accessor. */
    static get instance() {
        if (!TimeSystem._inst)
            TimeSystem._inst = new TimeSystem();
        return TimeSystem._inst;
    }
    /** Current in-game hour [0, 24). */
    hour;
    constructor() {
        const saved = parseFloat(localStorage.getItem(LS_KEY) ?? '');
        this.hour = isFinite(saved) ? saved % 24 : 8; // default: 8 am
    }
    /** Advance the clock by `dt` real seconds. */
    update(dt) {
        // Convert real seconds to in-game hours
        this.hour = (this.hour + (dt / REAL_TO_GAME_RATIO) * (60 / 60)) % 24;
        // Persist every ~10 s to avoid too-frequent localStorage writes
        if (Math.random() < 0.01)
            localStorage.setItem(LS_KEY, String(this.hour));
    }
    /**
     * Current NPC schedule phase:
     *  'work'   — 8:00–17:59  stay near work-spot (role-based point within settlement)
     *  'wander' — 6:00–7:59 and 18:00–21:59  loose wander around the settlement
     *  'home'   — 22:00–5:59  return to home position, minimal movement
     */
    get schedulePhase() {
        const h = this.hour;
        if (h >= 8 && h < 18)
            return 'work';
        if (h >= 22 || h < 6)
            return 'home';
        return 'wander';
    }
    /** Formatted time string, e.g. "14:30". */
    get formatted() {
        const hh = Math.floor(this.hour);
        const mm = Math.floor((this.hour % 1) * 60);
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
}
