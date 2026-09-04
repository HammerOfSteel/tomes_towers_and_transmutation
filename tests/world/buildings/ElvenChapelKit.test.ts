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
});
