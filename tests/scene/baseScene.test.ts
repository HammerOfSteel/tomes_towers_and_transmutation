import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseScene } from '@/scene/BaseScene';

// ── THREE.js stub ──────────────────────────────────────────────────────────
// BaseScene uses THREE geometry; stub the minimum needed.

vi.mock('three', () => {
  class Vec3 {
    x: number; y: number; z: number;
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
    distanceTo(o: Vec3) { const dx=this.x-o.x; const dz=this.z-o.z; return Math.sqrt(dx*dx+dz*dz); }
  }
  const mat = () => ({ emissiveIntensity: 0, dispose: () => {} });
  const geo = () => ({ dispose: () => {} });
  const mesh = () => ({ position: new Vec3(), rotation: { y: 0 }, castShadow: false,
                         material: mat(), geometry: geo(), traverse: () => {} });
  class Grp {
    position = new Vec3();
    children: unknown[] = [];
    add(...items: unknown[]) { this.children.push(...items); }
    remove(item: unknown) { const i = this.children.indexOf(item); if (i >= 0) this.children.splice(i,1); }
    traverse(fn: (o: unknown) => void) { fn(this); this.children.forEach(c => { if ((c as Grp).traverse) (c as Grp).traverse(fn); }); }
  }
  return {
    Group: Grp,
    Mesh: class { constructor() { return mesh(); } },
    MeshStandardMaterial: class { constructor() { return mat(); } },
    BoxGeometry: class { constructor() { return geo(); } },
    CylinderGeometry: class { constructor() { return geo(); } },
    SphereGeometry: class { constructor() { return geo(); } },
    PlaneGeometry: class { constructor() { return geo(); } },
    Vector3: Vec3,
    Material: class { dispose() {} },
  };
});

// ── localStorage stub ──────────────────────────────────────────────────────

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear:      () => { store = {}; },
  };
})();
vi.stubGlobal('localStorage', storageMock);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeScene() {
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const scene = {
    add:    (...x: unknown[]) => added.push(...x),
    remove: (...x: unknown[]) => removed.push(...x),
    _added: added,
    _removed: removed,
  };
  return scene as unknown as import('three').Scene & { _added: unknown[]; _removed: unknown[] };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BaseScene', () => {
  let scene: ReturnType<typeof makeScene>;
  let base: BaseScene;

  beforeEach(() => {
    localStorage.clear();
    scene = makeScene();
    base  = new BaseScene(scene as unknown as import('three').Scene);
  });

  it('starts with no structures', () => {
    expect(base.structures.length).toBe(0);
  });

  it('placing a structure adds it to the list', () => {
    const s = base.place('barrier_wall', 4, 6);
    expect(s).not.toBeNull();
    expect(base.structures.length).toBe(1);
    expect(base.structures[0]!.type).toBe('barrier_wall');
  });

  it('snaps position to 2 WU grid', () => {
    // Math.round(3/2)*2 = Math.round(1.5)*2 = 2*2 = 4
    // Math.round(5/2)*2 = Math.round(2.5)*2 = 3*2 = 6
    const s = base.place('barrier_wall', 3, 5);
    expect(s!.wx).toBe(4);
    expect(s!.wz).toBe(6);
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
    const s = base.place('barrier_wall', 4, 6)!;
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

    const base2 = new BaseScene(scene as unknown as import('three').Scene);
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
    const calls: string[] = [];
    base.onWardStonePlaced = (_p, _r, id) => calls.push(id);
    const s = base.place('ward_stone', 4, 4)!;
    expect(calls).toContain(s.id);
  });

  it('onWardStoneRemoved callback fires on remove', () => {
    const removed: string[] = [];
    base.onWardStoneRemoved = (id) => removed.push(id);
    const s = base.place('ward_stone', 4, 4)!;
    base.remove(s.id);
    expect(removed).toContain(s.id);
  });
});
