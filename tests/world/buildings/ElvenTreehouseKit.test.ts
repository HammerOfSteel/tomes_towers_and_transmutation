/**
 * ElvenTreehouseKit.test.ts — the elven living-tree home, rebuilt on the
 * stone-tower kit's real block-course/carved-opening construction
 * technique (docs/superpowers/specs/
 * 2026-09-03-elven-treehouse-tower-kit-rebuild.md), replacing the prior
 * round's BlockKit-voxel-occupancy approach per direct user feedback.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildElvenTreehouseHome } from '@/world/buildings/ElvenTreehouseKit';
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

function makeDna(kind: BuildingKind, seed: number, floors: 1 | 2 | 3 | 4 = 2): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed,
    buildingKind: kind, size: 'medium', floors,
    style: 'thatched', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['elven'], rotation: 0, faction: 'elven',
    terrace: 'none', features: [],
  };
}

describe('buildElvenTreehouseHome', () => {
  it('produces valid, non-NaN geometry across a seed sweep for every elven kind that uses it', () => {
    for (const kind of ['house', 'terraced', 'villa', 'inn', 'blacksmith'] as BuildingKind[]) {
      for (let seed = 0; seed < 8; seed++) {
        const g = buildElvenTreehouseHome(makeDna(kind, seed));
        expect(hasNaN(g)).toBe(false);
        expect(countVerts(g)).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic for the same seed and varies with a different seed', () => {
    const g1 = buildElvenTreehouseHome(makeDna('house', 42));
    const g2 = buildElvenTreehouseHome(makeDna('house', 42));
    const g3 = buildElvenTreehouseHome(makeDna('house', 43));
    expect(countVerts(g1)).toBe(countVerts(g2));
    expect(countVerts(g1)).not.toBe(countVerts(g3));
  });

  it('builds walls from many discrete real block meshes (BoxGeometry, matching the tower\'s Strategy G) -- not a BlockKit voxel-occupancy grid', () => {
    const g = buildElvenTreehouseHome(makeDna('house', 7));
    let boxCount = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') boxCount++;
    });
    // Strategy G's wall/quoins always produce many real BoxGeometry
    // blocks -- BlockKit's meshBlockGrid() (the old technique) never
    // produces a named 'BoxGeometry' primitive at all (always a plain,
    // generic BufferGeometry for its merged voxel output), so a healthy
    // count here is direct proof this house's main structure uses the
    // tower's real block-course technique, not the old voxel grid.
    expect(boxCount).toBeGreaterThan(10);
  });

  it('respects dna.floors exactly (1, 2, or 3 floors -> that many wall rings), unlike the tower\'s own fixed 3-6 floor count', () => {
    function countRings(g: THREE.Group): number {
      // Each floor ring is a THREE.Group child added directly under the
      // root (see buildTowerWallRing's own return shape); the base and
      // roof are also direct children, so rings are identified by name
      // absence of 'elven-stone-tower-balcony' AND not being index 0
      // (the base) or the last roof-cap child -- simplest robust proxy:
      // count children whose own subtree contains a BoxGeometry mesh
      // AND are not named balcony/quoins-only. Given ambiguity, assert
      // via total child count instead: base(1) + floors + roof(1) +
      // optional balcony(0-1).
      return g.children.length;
    }
    const oneFloor = buildElvenTreehouseHome(makeDna('house', 3, 1));
    const threeFloor = buildElvenTreehouseHome(makeDna('house', 3, 3));
    // threeFloor must have exactly 2 more direct children than oneFloor
    // (2 extra floor rings), all else being equal for the same seed.
    expect(countRings(threeFloor)).toBe(countRings(oneFloor) + 2);
  });

  it('varies its roof archetype across seeds (living/classic/pagoda), unlike the old always-living behavior', () => {
    // Structure from buildTowerKitCore: [base, ring0, ..., ring(floors-1),
    // roof, (optional balcony)] -- the roof is always at index floors+1.
    // Both buildClassicRoofCap and buildPagodaRoofCap (which embeds a
    // full classic cap for its own upper tier) always end with a
    // SphereGeometry apex finial ball -- buildLivingRoofCap never
    // produces one (its geometry is entirely a single merged BlockKit
    // grid mesh). Checking only the roof child's own subtree (not the
    // whole building) avoids a false positive from _buildVineProp's
    // unrelated small SphereGeometry leaf decorations elsewhere on the
    // wall rings.
    let sawApexBall = false;
    let sawNoApexBall = false;
    for (let seed = 0; seed < 30; seed++) {
      const dna = makeDna('house', seed, 2);
      const g = buildElvenTreehouseHome(dna);
      const roof = g.children[dna.floors + 1]!;
      let hasApexBall = false;
      roof.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') hasApexBall = true; });
      if (hasApexBall) sawApexBall = true; else sawNoApexBall = true;
    }
    // sawApexBall true means at least one seed produced classic/pagoda;
    // sawNoApexBall true means at least one seed produced the living
    // canopy -- together, proof of genuine variety.
    expect(sawApexBall).toBe(true);
    expect(sawNoApexBall).toBe(true);
  });

  it('has a carved entrance doorway (reusing buildTowerBase unchanged) -- a genuine recessed opening, not a flat surface', () => {
    // Note: the entrance opening moved to kit/OpeningParts.ts's
    // buildDoorOpening(), which routes its recess mesh through
    // finishArchitecturalGeometry() (Bevels.ts) -- this intentionally
    // rebakes ExtrudeGeometry into a plain BufferGeometry for correct
    // creased-normal shading, so `.geometry.type` no longer survives as a
    // marker. Instead, verify the real structural property the test cares
    // about directly: a named 'recess' group exists and sits measurably
    // behind the wall face (genuine depth), not flush with it.
    const g = buildElvenTreehouseHome(makeDna('house', 5));
    let recess: THREE.Object3D | undefined;
    g.traverse((o) => { if (o.name === 'recess') recess = o; });
    expect(recess).toBeDefined();
    expect(Math.abs(recess!.position.z)).toBeGreaterThan(0.1);
  });
});
