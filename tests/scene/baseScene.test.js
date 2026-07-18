import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseScene } from '@/scene/BaseScene';
// ── THREE.js stub ──────────────────────────────────────────────────────────
// BaseScene uses THREE geometry; stub the minimum needed.
vi.mock('three', () => {
    class Vec3 {
        x;
        y;
        z;
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        distanceTo(o) { const dx = this.x - o.x; const dz = this.z - o.z; return Math.sqrt(dx * dx + dz * dz); }
    }
    const mat = () => ({ emissiveIntensity: 0, dispose: () => { } });
    const geo = () => ({ dispose: () => { } });
    const mesh = () => ({ position: new Vec3(), rotation: { y: 0 }, castShadow: false,
        material: mat(), geometry: geo(), traverse: () => { } });
    class Grp {
        position = new Vec3();
        children = [];
        add(...items) { this.children.push(...items); }
        remove(item) { const i = this.children.indexOf(item); if (i >= 0)
            this.children.splice(i, 1); }
        traverse(fn) { fn(this); this.children.forEach(c => { if (c.traverse)
            c.traverse(fn); }); }
    }
    return {
        Group: Grp,
        Mesh: class {
            constructor() { return mesh(); }
        },
        MeshStandardMaterial: class {
            constructor() { return mat(); }
        },
        BoxGeometry: class {
            constructor() { return geo(); }
        },
        CylinderGeometry: class {
            constructor() { return geo(); }
        },
        SphereGeometry: class {
            constructor() { return geo(); }
        },
        PlaneGeometry: class {
            constructor() { return geo(); }
        },
        Vector3: Vec3,
        Material: class {
            dispose() { }
        },
    };
});
// ── localStorage stub ──────────────────────────────────────────────────────
const storageMock = (() => {
    let store = {};
    return {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = v; },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; },
    };
})();
vi.stubGlobal('localStorage', storageMock);
// ── Helpers ────────────────────────────────────────────────────────────────
function makeScene() {
    const added = [];
    const removed = [];
    const scene = {
        add: (...x) => added.push(...x),
        remove: (...x) => removed.push(...x),
        _added: added,
        _removed: removed,
    };
    return scene;
}
// ── Tests ──────────────────────────────────────────────────────────────────
describe('BaseScene', () => {
    let scene;
    let base;
    beforeEach(() => {
        localStorage.clear();
        scene = makeScene();
        base = new BaseScene(scene);
    });
    it('starts with no structures', () => {
        expect(base.structures.length).toBe(0);
    });
    it('placing a structure adds it to the list', () => {
        const s = base.place('barrier_wall', 4, 6);
        expect(s).not.toBeNull();
        expect(base.structures.length).toBe(1);
        expect(base.structures[0].type).toBe('barrier_wall');
    });
    it('snaps position to 2 WU grid', () => {
        // Math.round(3/2)*2 = Math.round(1.5)*2 = 2*2 = 4
        // Math.round(5/2)*2 = Math.round(2.5)*2 = 3*2 = 6
        const s = base.place('barrier_wall', 3, 5);
        expect(s.wx).toBe(4);
        expect(s.wz).toBe(6);
    });
    it('blocks overlapping placement at same snapped cell', () => {
        base.place('barrier_wall', 4, 6);
        const second = base.place('watch_perch', 4, 6);
        expect(second).toBeNull();
        expect(base.structures.length).toBe(1);
    });
    it('allows placement at different cells', () => {
        base.place('barrier_wall', 4, 6);
        base.place('watch_perch', 8, 10);
        expect(base.structures.length).toBe(2);
    });
    it('placement deducts resources (caller responsibility) — structure is added', () => {
        // BaseScene.place() does NOT deduct resources itself — that is done by
        // the construction-mode caller.  Just verify placement returns the entry.
        const s = base.place('healing_fountain', 0, 0);
        expect(s).not.toBeNull();
    });
    it('remove deletes structure from list', () => {
        const s = base.place('barrier_wall', 4, 6);
        base.remove(s.id);
        expect(base.structures.length).toBe(0);
    });
    it('remove is safe for unknown id', () => {
        base.place('barrier_wall', 4, 6);
        expect(() => base.remove('no_such_id')).not.toThrow();
        expect(base.structures.length).toBe(1);
    });
    it('persists structures across instances', () => {
        base.place('ward_stone', 2, 8);
        base.place('watch_perch', 10, 4);
        const base2 = new BaseScene(scene);
        expect(base2.structures.length).toBe(2);
        expect(base2.structures.map(s => s.type).sort()).toEqual(['ward_stone', 'watch_perch'].sort());
    });
    it('nearWatchPerch returns null when no perch nearby', async () => {
        const { Vector3 } = await import('three');
        const pos = new Vector3(0, 0, 0);
        expect(base.nearWatchPerch(pos)).toBeNull();
    });
    it('nearWatchPerch returns perch within range', async () => {
        const { Vector3 } = await import('three');
        base.place('watch_perch', 2, 2);
        const pos = new Vector3(2, 0, 2);
        expect(base.nearWatchPerch(pos)).not.toBeNull();
    });
    it('onWardStonePlaced callback fires on place', () => {
        const calls = [];
        base.onWardStonePlaced = (_p, _r, id) => calls.push(id);
        const s = base.place('ward_stone', 4, 4);
        expect(calls).toContain(s.id);
    });
    it('onWardStoneRemoved callback fires on remove', () => {
        const removed = [];
        base.onWardStoneRemoved = (id) => removed.push(id);
        const s = base.place('ward_stone', 4, 4);
        base.remove(s.id);
        expect(removed).toContain(s.id);
    });
});
