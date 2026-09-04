/**
 * ElvenChapelKit.test.ts — the elven chapel/shrine (nave + apse +
 * bellcote + forecourt), built on the same real block-course + carved-
 * opening construction technique as the elven stone-tower kit (docs/
 * superpowers/specs/2026-09-04-elven-chapel-rebuild-design.md).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildElvenChapelShrine } from '@/world/buildings/ElvenChapelKit';
import { STYLE_COLORS } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

function hasNaN(group: THREE.Group): boolean {
  let bad = false;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) {
        if (!Number.isFinite(pos.array[i])) bad = true;
      }
    }
  });
  return bad;
}

function countVerts(group: THREE.Group): number {
  let n = 0;
  group.traverse((o) => { if (o instanceof THREE.Mesh) n += o.geometry.attributes.position.count; });
  return n;
}

function makeDna(seed: number): BuildingDNA {
  return {
    v: 1, kind: 'building', name: 'test chapel', seed,
    buildingKind: 'chapel', size: 'medium', floors: 1,
    style: 'elven', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['elven'], rotation: 0, faction: 'elven',
    terrace: 'none', features: [],
  };
}

describe('buildElvenChapelShrine', () => {
  it('produces valid, non-NaN geometry across a seed sweep', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = buildElvenChapelShrine(makeDna(seed));
      expect(hasNaN(g)).toBe(false);
      expect(countVerts(g)).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed and varies with a different seed', () => {
    const g1 = buildElvenChapelShrine(makeDna(42));
    const g2 = buildElvenChapelShrine(makeDna(42));
    const g3 = buildElvenChapelShrine(makeDna(43));
    expect(countVerts(g1)).toBe(countVerts(g2));
    expect(countVerts(g1)).not.toBe(countVerts(g3));
  });

  it('builds the nave from many discrete real blocks -- the wall\'s own merged mesh has far more vertices than a plain box, since it\'s assembled from many per-course blocks (mergeGroupMeshesByMaterial() merges them into one BufferGeometry, so a raw BoxGeometry-type count would undercount -- see MeshMergeUtils.ts\'s own documented "destroys the geometry type tag" quirk)', () => {
    const g = buildElvenChapelShrine(makeDna(7));
    let maxVertCount = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) maxVertCount = Math.max(maxVertCount, o.geometry.attributes.position.count);
    });
    // A plain box has 24 vertices; the nave's real merged per-course wall
    // is much larger (thousands of vertices from dozens of individual
    // blocks merged together).
    expect(maxVertCount).toBeGreaterThan(500);
  });

  it('has a carved entrance doorway (a genuine recessed opening, not a flat surface)', () => {
    const g = buildElvenChapelShrine(makeDna(5));
    let sawExtrude = false;
    g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'ExtrudeGeometry') sawExtrude = true; });
    expect(sawExtrude).toBe(true);
  });

  it('has a solid floor cap (no seethrough gap at the nave\'s own top)', () => {
    const g = buildElvenChapelShrine(makeDna(9));
    const cap = g.getObjectByName('elven-tower-floor-cap');
    expect(cap).toBeDefined();
  });

  it('has 4 quoin pillars for the nave\'s 4 real rectangular corners', () => {
    const g = buildElvenChapelShrine(makeDna(3));
    const quoins = g.getObjectByName('elven-chapel-nave-quoins');
    expect(quoins).toBeDefined();
    let meshCount = 0;
    quoins!.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBe(4);
  });

  it('has exactly 4 lancet (pointed-arch) windows, 2 per long side wall', () => {
    const g = buildElvenChapelShrine(makeDna(11));
    let windowCount = 0;
    g.traverse((o) => { if (o.name === 'elven-chapel-window') windowCount++; });
    expect(windowCount).toBe(4);
  });

  it('has a gabled roof reaching above the nave\'s own wall height', () => {
    const g = buildElvenChapelShrine(makeDna(4));
    const box = new THREE.Box3().setFromObject(g);
    // naveHeight = FLOOR_HEIGHT(3.2) * 1 * 1.4 = 4.48; the roof's ridge
    // must add real height above that.
    expect(box.max.y).toBeGreaterThan(4.48 + 1);
  });

  it('has an apse (small octagonal altar niche) docked against the nave\'s back wall, open toward the nave', () => {
    const g = buildElvenChapelShrine(makeDna(6));
    const apse = g.getObjectByName('elven-chapel-apse');
    expect(apse).toBeDefined();
    // Docked behind the nave: apse's own world position.z must be
    // negative (nave's back wall sits at z = -halfD; the apse projects
    // further in -Z from there).
    const worldPos = new THREE.Vector3();
    apse!.getWorldPosition(worldPos);
    expect(worldPos.z).toBeLessThan(0);
  });

  it('the apse always uses a living-canopy roof cap (never classic/pagoda), a deliberate sacred-altar identity choice', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = buildElvenChapelShrine(makeDna(seed));
      const apse = g.getObjectByName('elven-chapel-apse')!;
      let sawApexBall = false;
      apse.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawApexBall = true; });
      // buildClassicRoofCap/buildPagodaRoofCap always end with a
      // SphereGeometry apex finial ball; buildLivingRoofCap never does
      // (its geometry is a single merged BlockKit grid mesh) -- see
      // StoneTowerRoofCap.test.ts's own established discriminator.
      expect(sawApexBall).toBe(false);
    }
  });

  it('the sacred crystal sits inside the apse, on-axis (x approx 0), visible from the nave\'s own entrance', () => {
    const g = buildElvenChapelShrine(makeDna(8));
    const crystal = g.getObjectByName('elven-chapel-sacred-crystal');
    expect(crystal).toBeDefined();
    const worldPos = new THREE.Vector3();
    crystal!.getWorldPosition(worldPos);
    expect(Math.abs(worldPos.x)).toBeLessThan(0.1);
    expect(worldPos.z).toBeLessThan(0); // behind the nave, inside the apse
  });

  it('has a bellcote (pierced wall-slab) above the entrance gable, with at least 1 bell', () => {
    const g = buildElvenChapelShrine(makeDna(2));
    const bellcote = g.getObjectByName('elven-chapel-bellcote');
    expect(bellcote).toBeDefined();
    let bellCount = 0;
    bellcote!.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry' && o.name === 'elven-chapel-bell') bellCount++;
    });
    expect(bellCount).toBeGreaterThanOrEqual(1);
    expect(bellCount).toBeLessThanOrEqual(2);
  });

  it('the bellcote sits above the nave (y > naveHeight) and OUTSIDE (in front of) the entrance gable\'s own face plane (z > halfD=4) -- not hidden inside the wall/roof volume', () => {
    const g = buildElvenChapelShrine(makeDna(2));
    const bellcote = g.getObjectByName('elven-chapel-bellcote')!;
    const worldPos = new THREE.Vector3();
    bellcote.getWorldPosition(worldPos);
    expect(worldPos.y).toBeGreaterThan(4.48); // naveHeight for floors=1
    expect(worldPos.z).toBeGreaterThan(4); // strictly outside the gable's own face plane (halfD=4)
  });

  it('has a relocated forecourt of standing stones outside the nave, in front of the entrance', () => {
    const g = buildElvenChapelShrine(makeDna(1));
    const forecourt = g.getObjectByName('elven-chapel-forecourt');
    expect(forecourt).toBeDefined();
    const stones: THREE.Mesh[] = [];
    forecourt!.traverse((o) => { if (o instanceof THREE.Mesh) stones.push(o); });
    expect(stones.length).toBeGreaterThanOrEqual(4);
    // Every stone must sit fully outside the nave's own front wall
    // (halfD=4 for the fixed 4x8 footprint).
    for (const stone of stones) {
      const worldPos = new THREE.Vector3();
      stone.getWorldPosition(worldPos);
      expect(worldPos.z).toBeGreaterThan(4);
    }
  });
});
