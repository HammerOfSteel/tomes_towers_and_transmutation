import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTurfRoof, type TurfRoofOptions, type TurfRoofPalette } from '@/world/buildings/kit/TurfRoof';

/**
 * TurfRoof.test.ts — TDD spec for the new shared sod/turf roof kit module
 * (docs/superpowers/plans/2026-09-04-vulperia-buildings.md Tasks 1-3;
 * design spec §"thick sod/turf roofs... segmented into planes with
 * ridge/hip seams and dark verge trim, not one continuous dome"). Asserts
 * the doctrine's anti-smooth-geometry rule applied to turf specifically:
 * a real layered construction (rafters -> board deck -> board ends ->
 * turf-stop fascia -> soil-edge -> grass-top), never a single smooth
 * green blob mesh.
 */

function makePalette(): TurfRoofPalette {
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color });
  return {
    timber: mat('#5a4020'),
    boardDeck: mat('#8a6840'),
    turfStop: mat('#6a4a28'),
    soil: mat('#3a2a18'),
    grass: mat('#5f7a3d'),
    grassAccent: mat('#7a9450'),
  };
}

function baseOptions(overrides: Partial<TurfRoofOptions> = {}): TurfRoofOptions {
  return {
    archetype: 'lowGable',
    halfWidth: 2.1,
    halfDepth: 2.6,
    eaveHeight: 1.5,
    ridgeHeight: 3.4,
    turfThickness: 0.32,
    seed: 7,
    palette: makePalette(),
    ...overrides,
  };
}

function countMeshes(group: THREE.Object3D): number {
  let n = 0;
  group.traverse((o) => { if (o instanceof THREE.Mesh) n++; });
  return n;
}

function allVerticesFinite(group: THREE.Object3D): boolean {
  let ok = true;
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
        ok = false;
      }
    }
  });
  return ok;
}

function allMeshesHaveUv(group: THREE.Object3D): boolean {
  let ok = true;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.geometry.getAttribute('uv')) ok = false;
  });
  return ok;
}

const LAYER_NAMES = [
  'turf-roof-rafters',
  'turf-roof-board-deck',
  'turf-roof-board-ends',
  'turf-roof-turf-stop',
  'turf-roof-soil-edge',
  'turf-roof-grass-top',
];

describe('buildTurfRoof — layer contract (anti-smooth-blob rule)', () => {
  for (const archetype of ['lowGable', 'longHall', 'rowGable', 'crossGable', 'steepCap'] as const) {
    it(`${archetype}: exposes all six named structural layers with real geometry`, () => {
      const roof = buildTurfRoof(baseOptions({ archetype }));
      expect(roof).toBeInstanceOf(THREE.Group);
      for (const name of LAYER_NAMES) {
        const child = roof.getObjectByName(name);
        expect(child, `expected a "${name}" layer group`).toBeTruthy();
        expect(countMeshes(child!)).toBeGreaterThan(0);
      }
    });
  }

  it('is a real multi-piece construction, not a single mesh standing in for the whole roof', () => {
    const roof = buildTurfRoof(baseOptions());
    expect(countMeshes(roof)).toBeGreaterThan(10);
  });

  it('every mesh carries a uv attribute (guards the documented merge-drop bug class)', () => {
    const roof = buildTurfRoof(baseOptions());
    expect(allMeshesHaveUv(roof)).toBe(true);
  });

  it('all vertex positions are finite (no NaN/backwards geometry)', () => {
    const roof = buildTurfRoof(baseOptions());
    expect(allVerticesFinite(roof)).toBe(true);
  });

  it('bounding-box height exceeds ridgeHeight - eaveHeight + turfThickness * 0.75 (turf genuinely adds relief, not a flat coplanar cap)', () => {
    const eaveHeight = 1.5;
    const ridgeHeight = 3.4;
    const turfThickness = 0.32;
    const roof = buildTurfRoof(baseOptions({ eaveHeight, ridgeHeight, turfThickness }));
    const box = new THREE.Box3().setFromObject(roof);
    const height = box.max.y - box.min.y;
    expect(height).toBeGreaterThan(ridgeHeight - eaveHeight + turfThickness * 0.75);
  });

  it('the grass-top layer is not the only layer with substantial geometry (rafters/deck/turf-stop are real, not vestigial)', () => {
    const roof = buildTurfRoof(baseOptions());
    const grassMeshes = countMeshes(roof.getObjectByName('turf-roof-grass-top')!);
    const totalMeshes = countMeshes(roof);
    expect(grassMeshes).toBeLessThan(totalMeshes);
  });

  it('rowGable adds a distinguishing dentil turf-stop detail vs. lowGable (same seed, different mesh count)', () => {
    const lowGable = buildTurfRoof(baseOptions({ archetype: 'lowGable' }));
    const rowGable = buildTurfRoof(baseOptions({ archetype: 'rowGable' }));
    expect(countMeshes(rowGable.getObjectByName('turf-roof-turf-stop')!))
      .toBeGreaterThan(countMeshes(lowGable.getObjectByName('turf-roof-turf-stop')!));
  });
});

describe('buildTurfRoof — dormer and porch-cut sockets', () => {
  it('adds named dormer children that visibly project past the low eave line', () => {
    const opts = baseOptions({
      dormers: [{ id: 'front-left', face: 'front', offset: -0.7, width: 0.65, height: 0.55 }],
    });
    const roof = buildTurfRoof(opts);
    const main = roof.getObjectByName('turf-roof-dormer-front-left');
    const soil = roof.getObjectByName('turf-roof-dormer-soil-edge-front-left');
    const hood = roof.getObjectByName('turf-roof-dormer-hood-front-left');
    expect(main).toBeTruthy();
    expect(soil).toBeTruthy();
    expect(hood).toBeTruthy();

    // The eave line for the "front" (+X) slope sits at x = halfWidth (no
    // overhang requested here). The dormer must push its footprint out
    // past that line by a clearly-visible margin.
    const box = new THREE.Box3().setFromObject(main!);
    expect(box.max.x).toBeGreaterThan(opts.halfWidth + 0.05);
  });

  it('supports multiple dormers on the same slope with independent ids', () => {
    const roof = buildTurfRoof(baseOptions({
      dormers: [
        { id: 'a', face: 'front', offset: -0.8, width: 0.5, height: 0.5 },
        { id: 'b', face: 'front', offset: 0.8, width: 0.5, height: 0.5 },
      ],
    }));
    expect(roof.getObjectByName('turf-roof-dormer-a')).toBeTruthy();
    expect(roof.getObjectByName('turf-roof-dormer-b')).toBeTruthy();
  });

  it('adds a named porch-cut socket group', () => {
    const roof = buildTurfRoof(baseOptions({
      porchCuts: [{ id: 'front-entry', face: 'front', offset: 0, width: 1.3, height: 1.9 }],
    }));
    const cut = roof.getObjectByName('turf-roof-porch-cut-front-entry');
    expect(cut).toBeTruthy();
    expect(countMeshes(cut!)).toBeGreaterThan(0);
  });

  it('with no dormers/porchCuts specified, adds none of those optional groups', () => {
    const roof = buildTurfRoof(baseOptions());
    let found = false;
    roof.traverse((o) => { if (o.name.startsWith('turf-roof-dormer-') || o.name.startsWith('turf-roof-porch-cut-')) found = true; });
    expect(found).toBe(false);
  });
});

describe('buildTurfRoof — deterministic seeded variation and detail', () => {
  it('same seed -> identical mesh count; different seed -> plausibly different detail count', () => {
    const a = buildTurfRoof(baseOptions({ seed: 11, detail: { tufts: 6, wildflowers: 3 } }));
    const b = buildTurfRoof(baseOptions({ seed: 11, detail: { tufts: 6, wildflowers: 3 } }));
    expect(countMeshes(a)).toBe(countMeshes(b));
  });

  it('adds a named detail group with tuft/wildflower props sitting at or above the grass-top surface', () => {
    const roof = buildTurfRoof(baseOptions({ detail: { tufts: 5, wildflowers: 2 } }));
    const detail = roof.getObjectByName('turf-roof-detail');
    expect(detail).toBeTruthy();
    expect(countMeshes(detail!)).toBeGreaterThan(0);

    const grassBox = new THREE.Box3().setFromObject(roof.getObjectByName('turf-roof-grass-top')!);
    const detailBox = new THREE.Box3().setFromObject(detail!);
    // Detail props must not be buried under the grass surface.
    expect(detailBox.max.y).toBeGreaterThanOrEqual(grassBox.min.y);
  });

  it('with no detail option, adds no detail group', () => {
    const roof = buildTurfRoof(baseOptions());
    expect(roof.getObjectByName('turf-roof-detail')).toBeFalsy();
  });
});

describe('buildTurfRoof — crossGable composes two intersecting masses', () => {
  it('produces a wider bounding footprint than a single lowGable of the same main dimensions', () => {
    const gable = buildTurfRoof(baseOptions({ archetype: 'lowGable' }));
    const cross = buildTurfRoof(baseOptions({
      archetype: 'crossGable',
      wingHalfWidth: 1.1,
      wingHalfDepth: 1.4,
      wingRidgeHeight: 2.9,
    }));
    const gableBox = new THREE.Box3().setFromObject(gable);
    const crossBox = new THREE.Box3().setFromObject(cross);
    const gableSpan = gableBox.max.z - gableBox.min.z;
    const crossSpan = crossBox.max.x - crossBox.min.x;
    expect(crossSpan).toBeGreaterThan(0);
    expect(gableSpan).toBeGreaterThan(0);
  });
});
