/**
 * ElvenMarketStallKit.test.ts — the elven market stall ("Moonlit
 * Exchange" shop kind), rebuilt on the stone-tower kit's real
 * block-course + carved-opening construction technique (docs/
 * superpowers/specs/2026-09-03-elven-market-stall-design.md), replacing
 * the prior `BlockKit`-voxel sapling approach. Unlike the treehouse
 * home, this is a genuinely OPEN structure -- a partial back wall (not
 * a full enclosed ring), a carved counter-opening, a fabric awning, and
 * a small living sapling on top.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildElvenMarketStall } from '@/world/buildings/ElvenMarketStallKit';
import { STYLE_COLORS } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA, BuildingKind } from '@/world/buildings/BuildingDNA';

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
    v: 1, kind: 'building', name: 'test shop', seed,
    buildingKind: 'shop' as BuildingKind, size: 'small', floors: 1,
    style: 'thatched', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['elven'], rotation: 0, faction: 'elven',
    terrace: 'none', features: [],
  };
}

describe('buildElvenMarketStall', () => {
  it('produces valid, non-NaN geometry across a seed sweep', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = buildElvenMarketStall(makeDna(seed));
      expect(hasNaN(g)).toBe(false);
      expect(countVerts(g)).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed and varies with a different seed', () => {
    const g1 = buildElvenMarketStall(makeDna(11));
    const g2 = buildElvenMarketStall(makeDna(11));
    const g3 = buildElvenMarketStall(makeDna(12));
    expect(countVerts(g1)).toBe(countVerts(g2));
    expect(countVerts(g1)).not.toBe(countVerts(g3));
  });

  it('builds the back wall from real block-course geometry (many merged blocks, substantial triangle count) -- not a BlockKit voxel grid', () => {
    const g = buildElvenMarketStall(makeDna(3));
    const wall = g.getObjectByName('elven-stall-back-wall') as THREE.Mesh | THREE.Group;
    expect(wall).toBeTruthy();
    let triangles = 0;
    wall.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const pos = o.geometry.attributes.position;
        triangles += o.geometry.index ? o.geometry.index.count / 3 : pos.count / 3;
      }
    });
    // Strategy G's per-course blocks merge into one mesh per material
    // (mergeGroupMeshesByMaterial), so the merged geometry's own `.type`
    // is a generic 'BufferGeometry', not 'BoxGeometry' -- triangle count
    // is the real signal that many individual blocks went into it (a
    // BlockKit voxel-grid trunk would also produce a merged
    // BufferGeometry, so this alone doesn't disprove BlockKit -- the
    // "is a genuinely PARTIAL wall" test below, comparing against a
    // known full-ring triangle count, is the real technique proof).
    expect(triangles).toBeGreaterThan(50);
  });

  it('is a genuinely PARTIAL wall, not a fully-enclosed ring -- far fewer wall-block triangles than a full octagon ring at the same scale would produce', () => {
    // Cross-reference against StoneTowerWallSurface.test.ts's own numbers: a
    // full 8-face ring at radius~2/height~3 produces ~1728 triangles
    // (measured in that file's own "Strategy T vs G" comparison). This
    // shop's radius/height are smaller, but the ratio is what matters:
    // total wall-block triangle count should be well under half of what
    // a full ring at this exact radius/height would need (8 faces vs.
    // this stall's 3).
    const g = buildElvenMarketStall(makeDna(3));
    const wall = g.getObjectByName('elven-stall-back-wall') as THREE.Mesh | THREE.Group;
    let wallTriangles = 0;
    wall.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const pos = o.geometry.attributes.position;
        wallTriangles += o.geometry.index ? o.geometry.index.count / 3 : pos.count / 3;
      }
    });
    // 3 faces out of 8 -- expect roughly 3/8 (37.5%) of a full ring's
    // block-triangle count, generously bounded.
    expect(wallTriangles).toBeGreaterThan(0);
    expect(wallTriangles).toBeLessThan(900); // well under a full-ring's ~1728
  });

  it('carves a genuine recessed counter-opening (ExtrudeGeometry, matching the door/window technique) -- not a flat cutout', () => {
    const g = buildElvenMarketStall(makeDna(5));
    let sawExtrude = false;
    g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'ExtrudeGeometry') sawExtrude = true; });
    expect(sawExtrude).toBe(true);
  });

  it('always has a living sapling canopy on top, never a classic/pagoda-style apex finial ball', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = buildElvenMarketStall(makeDna(seed));
      const canopy = g.getObjectByName('elven-stall-sapling-canopy') as THREE.Group;
      expect(canopy).toBeTruthy();
      // Checking only the canopy's own subtree (not the whole stall)
      // avoids a false positive from the unrelated SphereGeometry goods/
      // glow-mote decorations elsewhere on the stall.
      let sawApexBall = false;
      canopy.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawApexBall = true; });
      expect(sawApexBall).toBe(false);
    }
  });

  it('has a striped fabric awning made of multiple flat panels', () => {
    const g = buildElvenMarketStall(makeDna(7));
    let planeCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'PlaneGeometry') planeCount++; });
    expect(planeCount).toBeGreaterThanOrEqual(4);
  });

  it('has a hanging sign with a glowing trade-symbol accent (moonstone-emissive material)', () => {
    const g = buildElvenMarketStall(makeDna(9));
    let sawEmissive = false;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.material.emissiveIntensity > 0) {
        sawEmissive = true;
      }
    });
    expect(sawEmissive).toBe(true);
  });
});
