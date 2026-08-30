/**
 * BuildingBuilder.test.ts — PROC-C tests
 * All 9 building kinds build without error, correct bounds.
 */

import { describe, it, expect } from 'vitest';
import { buildBuilding, addChimney } from '@/world/buildings/BuildingBuilder';
import type { BuildingDNA, BuildingKind, BuildingSize, BuildingStyle } from '@/world/buildings/BuildingDNA';
import { STYLE_COLORS, SIZE_FOOTPRINT, FLOOR_HEIGHT, getFootprint } from '@/world/buildings/BuildingDNA';
import * as THREE from 'three';

const ALL_KINDS: BuildingKind[] = [
  'house', 'shop', 'inn', 'guild',
  'terraced', 'cottage', 'villa', 'tavern',
  'blacksmith', 'apothecary', 'watchtower',
  'chapel', 'tent', 'market_stall',
  'ruin', 'well', 'barn',
];
const ALL_STYLES: BuildingStyle[] = ['thatched', 'stone', 'timber', 'arcane'];
const ALL_SIZES: BuildingSize[] = ['tiny', 'small', 'medium', 'large'];

function makeDna(kind: BuildingKind, overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed: 99,
    buildingKind: kind, size: 'small', floors: 1,
    style: 'thatched', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['thatched'], rotation: 0,
    terrace: 'none', features: [],
    ...overrides,
  };
}

describe('BuildingBuilder — all 7 kinds', () => {
  for (const kind of ALL_KINDS) {
    it(`builds ${kind} without throwing`, () => {
      const inst = buildBuilding(makeDna(kind));
      expect(inst.exteriorGroup).toBeInstanceOf(THREE.Group);
      expect(inst.dna.buildingKind).toBe(kind);
      expect(typeof inst.dispose).toBe('function');
    });

    it(`${kind}: exteriorGroup has children`, () => {
      const inst = buildBuilding(makeDna(kind));
      expect(inst.exteriorGroup.children.length).toBeGreaterThan(0);
    });

    it(`${kind}: bounds have positive extents`, () => {
      const { bounds } = buildBuilding(makeDna(kind));
      expect(bounds.halfWidth).toBeGreaterThan(0);
      expect(bounds.halfDepth).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });
  }
});

describe('BuildingBuilder — styles', () => {
  for (const style of ALL_STYLES) {
    it(`${style} style builds without throwing`, () => {
      expect(() => buildBuilding(makeDna('house', { style, colors: STYLE_COLORS[style] }))).not.toThrow();
    });
  }
});

describe('BuildingBuilder — sizes', () => {
  for (const size of ALL_SIZES) {
    it(`${size} size produces correct footprint`, () => {
      const inst = buildBuilding(makeDna('house', { size }));
      const fp   = SIZE_FOOTPRINT[size];
      expect(inst.bounds.halfWidth).toBeCloseTo(fp.w / 2, 1);
      expect(inst.bounds.halfDepth).toBeCloseTo(fp.d / 2, 1);
    });
  }
});

describe('BuildingBuilder — floors', () => {
  it('2-floor building is taller than 1-floor', () => {
    const one = buildBuilding(makeDna('house', { floors: 1 }));
    const two = buildBuilding(makeDna('house', { floors: 2 }));
    expect(two.bounds.height).toBeGreaterThan(one.bounds.height);
  });

  it('height scales with FLOOR_HEIGHT', () => {
    const inst = buildBuilding(makeDna('house', { floors: 2 }));
    expect(inst.bounds.height).toBeGreaterThanOrEqual(FLOOR_HEIGHT * 2);
  });
});

describe('BuildingBuilder — conditions', () => {
  it('ruined house builds without throwing', () => {
    expect(() => buildBuilding(makeDna('house', { condition: 'ruined' }))).not.toThrow();
  });

  it('pristine inn builds without throwing', () => {
    expect(() => buildBuilding(makeDna('inn', { condition: 'pristine' }))).not.toThrow();
  });
});

describe('BuildingBuilder — userData', () => {
  it('root userData contains buildingKind', () => {
    const inst = buildBuilding(makeDna('shop'));
    expect(inst.exteriorGroup.userData['buildingKind']).toBe('shop');
  });

  it('rotation is applied to group', () => {
    const inst = buildBuilding(makeDna('house', { rotation: Math.PI / 2 }));
    expect(inst.exteriorGroup.rotation.y).toBeCloseTo(Math.PI / 2, 4);
  });
});

describe('BuildingBuilder — determinism', () => {
  it('same seed → identical child count', () => {
    const a = buildBuilding(makeDna('house', { seed: 42 }));
    const b = buildBuilding(makeDna('house', { seed: 42 }));
    expect(a.exteriorGroup.children.length).toBe(b.exteriorGroup.children.length);
  });

  it('different seeds → potentially different child counts', () => {
    const a = buildBuilding(makeDna('house', { seed: 1 }));
    const b = buildBuilding(makeDna('house', { seed: 999 }));
    // Both should succeed — outcomes may vary
    expect(a.exteriorGroup).toBeInstanceOf(THREE.Group);
    expect(b.exteriorGroup).toBeInstanceOf(THREE.Group);
  });
});

describe('BuildingBuilder — chimney: block-stack rebuild (Phase 2e.10 human greebling)', () => {
  // Previously addChimney() built its main shaft as a single smooth
  // BoxGeometry (one long box) — flagged as needing a "block stack"
  // rebuild by the settlement-visual-fidelity plan (§2e.10), consistent
  // with how every non-human faction's masonry is built from small
  // stacked block courses rather than one deformed/smooth primitive.
  function countChimneyMeshes(seed: number): number {
    const g = new THREE.Group();
    addChimney(g, 0, 0, 0, seed);
    let n = 0;
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; });
    return n;
  }

  it('builds the shaft from multiple stacked block courses, not one smooth box', () => {
    // Old behaviour was exactly 3 meshes (shaft, corbel, pot). A block-stack
    // shaft of >=3 courses plus corbel+pot must be strictly more.
    expect(countChimneyMeshes(1)).toBeGreaterThan(3);
  });

  it('no single shaft mesh spans the full chimney height (i.e. it is coursed)', () => {
    const g = new THREE.Group();
    addChimney(g, 0, 0, 0, 7);
    const heights: number[] = [];
    g.traverse(o => {
      if (!(o as THREE.Mesh).isMesh) return;
      const box = new THREE.Box3().setFromObject(o as THREE.Mesh);
      heights.push(box.max.y - box.min.y);
    });
    const totalBox = new THREE.Box3().setFromObject(g);
    const totalHeight = totalBox.max.y - totalBox.min.y;
    // Every individual mesh must be shorter than ~70% of the whole chimney's
    // height — a single monolithic shaft would violate this.
    for (const h of heights) {
      expect(h).toBeLessThan(totalHeight * 0.7);
    }
  });

  it('preserves the overall chimney silhouette height within a reasonable band', () => {
    // Sanity guard: the rebuild must not drastically shrink/grow the
    // chimney vs. the original single-box proportions (shaft ~FLOOR_HEIGHT
    // * 0.55, plus corbel + pot).
    const g = new THREE.Group();
    addChimney(g, 0, 0, 0, 3);
    const box = new THREE.Box3().setFromObject(g);
    const totalH = box.max.y - box.min.y;
    expect(totalH).toBeGreaterThan(FLOOR_HEIGHT * 0.5);
    expect(totalH).toBeLessThan(FLOOR_HEIGHT * 1.1);
  });

  it('is deterministic for a fixed seed (same mesh count + bounds)', () => {
    const g1 = new THREE.Group();
    addChimney(g1, 0, 0, 0, 55);
    const g2 = new THREE.Group();
    addChimney(g2, 0, 0, 0, 55);
    let n1 = 0, n2 = 0;
    g1.traverse(o => { if ((o as THREE.Mesh).isMesh) n1++; });
    g2.traverse(o => { if ((o as THREE.Mesh).isMesh) n2++; });
    expect(n1).toBe(n2);
    const b1 = new THREE.Box3().setFromObject(g1);
    const b2 = new THREE.Box3().setFromObject(g2);
    expect(b1.max.toArray()).toEqual(b2.max.toArray());
  });
});

describe('BuildingBuilder — window-box planters (Phase 2e.10 human greebling)', () => {
  // House/shop/inn/guild (buildHouseOrShop) previously had no ground-level
  // greebling at all — cottage already had hanging flower baskets, but the
  // most common human building type had nothing. Confirm at least one
  // seed across a spread produces a recognisable planter box mesh
  // (BoxGeometry roughly window-box sized) near a ground-floor window.
  it('at least one seed in a spread attaches a window-box planter to a house', () => {
    let foundPlanter = false;
    for (let seed = 0; seed < 30 && !foundPlanter; seed++) {
      const inst = buildBuilding({
        v: 1, kind: 'building', name: 'test house', seed,
        buildingKind: 'house', size: 'small', floors: 1,
        style: 'timber', condition: 'pristine',
        hasInterior: true, interiorLayout: 'single_room',
        colors: STYLE_COLORS['timber'], rotation: 0,
        terrace: 'none', features: [],
      });
      inst.exteriorGroup.traverse(obj => {
        if (foundPlanter) return;
        if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).geometry instanceof THREE.BoxGeometry) {
          const geo = (obj as THREE.Mesh).geometry as THREE.BoxGeometry;
          const p = geo.parameters;
          // Trough box dimensions from windowBoxPlanter(): 0.85 x 0.22 x 0.24.
          if (Math.abs(p.width - 0.85) < 0.01 && Math.abs(p.height - 0.22) < 0.01) {
            foundPlanter = true;
          }
        }
      });
    }
    expect(foundPlanter).toBe(true);
  });
});

describe('BuildingBuilder — blacksmith roof coverage', () => {
  // Regression test: buildBlacksmith()'s roof used to be sized `d * 0.7` and
  // shifted back by `-d * 0.15`, so its front edge sat at local z ≈ +0.20d —
  // well short of the open forge archway (posts + lintel) at z = +0.5d. That
  // left the front ~30% of the building's depth, including the entire open
  // archway, with no roof overhead at all: visibly a "hole" in the building
  // from outside (reported via screenshot as "roof doesn't cover the
  // building" + "missing wall", the open forge front having no wall panel
  // by design compounded the effect). The roof must now span the full
  // depth (plus its eave overhang) so it covers the open archway too.
  it('roof mesh extends at least to the open archway (front, z = +d/2)', () => {
    const inst = buildBuilding(makeDna('blacksmith', { size: 'small' }));
    const { d } = getFootprint('blacksmith', 'small');

    // The roof is the only mesh built by pitchedRoof()/thatchedRoof(),
    // which always emits exactly 6 vertices (front/back eave corners +
    // front/back ridge peaks) — a more precise selector than height alone,
    // since some non-roof meshes (e.g. the front lintel beam) sit almost as
    // high as the wall top and would otherwise be mistaken for the roof.
    let maxRoofZ = -Infinity;
    inst.exteriorGroup.traverse(obj => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const posAttr = mesh.geometry.getAttribute('position');
      if (!posAttr || posAttr.count !== 6) return;
      const box = new THREE.Box3().setFromObject(mesh);
      maxRoofZ = Math.max(maxRoofZ, box.max.z);
    });

    expect(maxRoofZ).toBeGreaterThan(-Infinity); // sanity: a roof mesh was found
    // Must reach (with some margin) the open archway at z = +d/2.
    expect(maxRoofZ).toBeGreaterThanOrEqual(d / 2 - 0.05);
  });
});
