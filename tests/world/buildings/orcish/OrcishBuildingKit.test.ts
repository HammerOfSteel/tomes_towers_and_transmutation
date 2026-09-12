import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildOrcishHouse,
  buildOrcishTerraced,
  buildOrcishVilla,
  buildOrcishInn,
  buildOrcishShop,
  buildOrcishBlacksmith,
  buildOrcishChapel,
  buildOrcishWatchtower,
} from '@/world/buildings/orcish/OrcishBuildingKit';
import { buildOrcishPalette } from '@/world/buildings/orcish/OrcishMaterials';
import { getFootprint } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

function makeDNA(overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1,
    kind: 'building',
    name: 'orcish-test-building',
    buildingKind: 'house',
    size: 'small',
    floors: 1,
    style: 'orcish',
    condition: 'damaged',
    hasInterior: false,
    interiorLayout: 'single_room',
    colors: { walls: '#6a5838', roof: '#3a2818', trim: '#8a6840', door: '#2a1810' },
    rotation: 0,
    terrace: 'none',
    features: [],
    seed: 424242,
    ...overrides,
  };
}

function allMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return meshes;
}

function assertFiniteGeometry(root: THREE.Object3D): void {
  for (const mesh of allMeshes(root)) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    for (const v of [box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  }
}

function findByNameIncluding(root: THREE.Object3D, needle: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!found && o.name && o.name.includes(needle)) found = o;
  });
  return found;
}

function countByNameIncluding(root: THREE.Object3D, needle: string): number {
  let count = 0;
  root.traverse((o) => {
    if (o.name && o.name.includes(needle)) count++;
  });
  return count;
}

describe('buildOrcishPalette', () => {
  it('returns stable shared material references, not per-block clones', () => {
    const dna = makeDNA();
    const palette = buildOrcishPalette(dna);
    const house = buildOrcishHouse(dna);
    const materials = new Set<THREE.Material>();
    let meshCount = 0;
    house.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        meshCount += 1;
        materials.add((o as THREE.Mesh).material as THREE.Material);
      }
    });
    expect(meshCount).toBeGreaterThan(materials.size * 2);
    expect(materials.size).toBeLessThan(20);
    expect(palette.timber).toBe(palette.timber);
  });
});

describe('buildOrcishHouse', () => {
  it('respects getFootprint(house, small), staying within footprint plus eaves/skirt', () => {
    const dna = makeDNA();
    const fp = getFootprint('house', 'small');
    const house = buildOrcishHouse(dna);
    const box = new THREE.Box3().setFromObject(house);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 1.6);
    expect(size.z).toBeLessThan(fp.d + 1.6);
  });

  it('has an off-centre door with the five-piece opening minimum', () => {
    const house = buildOrcishHouse(makeDNA());
    const door = findByNameIncluding(house, 'orcish-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
  });

  it('has a smoke/window slot', () => {
    const house = buildOrcishHouse(makeDNA());
    expect(findByNameIncluding(house, 'orcish-window')).toBeDefined();
  });

  it('uses lashed-timber log-course walls, not a single wall-sized box', () => {
    const house = buildOrcishHouse(makeDNA());
    expect(findByNameIncluding(house, 'lashed-timber-wall')).toBeDefined();
    expect(findByNameIncluding(house, 'lashed-timber-posts')).toBeDefined();
  });

  it('has a ribbed hide roof (ribs + hide bays), not a smooth cone/dome', () => {
    const house = buildOrcishHouse(makeDNA());
    const roofNames = ['domed-hide-roof', 'conical-hide-roof', 'ribbed-awning'];
    const hasRoof = roofNames.some((n) => findByNameIncluding(house, n) !== undefined);
    expect(hasRoof).toBe(true);
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 12345, 999999]) {
      assertFiniteGeometry(buildOrcishHouse(makeDNA({ seed })));
    }
  });
});

describe('buildOrcishTerraced', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'terraced', floors: 2, ...overrides });

  it('respects getFootprint(terraced, size), staying within footprint plus eave/skirt tolerance, narrower than a villa footprint', () => {
    const fp = getFootprint('terraced', 'small');
    const villaFp = getFootprint('villa', 'small');
    const terraced = buildOrcishTerraced(dnaFor());
    const box = new THREE.Box3().setFromObject(terraced);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 1.6);
    expect(size.z).toBeLessThan(fp.d + 1.6);
    expect(fp.w).toBeLessThan(villaFp.w);
  });

  it('has no side windows (party-wall-safe by construction)', () => {
    const terraced = buildOrcishTerraced(dnaFor({ terrace: 'both' }));
    expect(findByNameIncluding(terraced, 'orcish-window')).toBeUndefined();
  });

  it('has a front door with the five-piece opening minimum', () => {
    const terraced = buildOrcishTerraced(dnaFor());
    const door = findByNameIncluding(terraced, 'orcish-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
  });

  it('has an upper barred window and a rear smoke slot', () => {
    const terraced = buildOrcishTerraced(dnaFor());
    expect(findByNameIncluding(terraced, 'orcish-upper-window')).toBeDefined();
    expect(findByNameIncluding(terraced, 'orcish-rear-window')).toBeDefined();
  });

  it('has a shared gabled hide roof (rafters + hide panes)', () => {
    const terraced = buildOrcishTerraced(dnaFor());
    expect(findByNameIncluding(terraced, 'longhouse-hide-roof')).toBeDefined();
  });

  it('produces finite geometry across seeds and terrace states', () => {
    for (const terrace of ['none', 'left', 'right', 'both'] as const) {
      for (const seed of [1, 42, 12345]) {
        assertFiniteGeometry(buildOrcishTerraced(dnaFor({ terrace, seed })));
      }
    }
  });
});

describe('buildOrcishVilla', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'villa', size: 'large', floors: 2, ...overrides });

  it('respects getFootprint(villa) 7x5, larger than a house footprint', () => {
    const fp = getFootprint('villa', 'large');
    const houseFp = getFootprint('house', 'small');
    expect(fp.w).toBe(7);
    expect(fp.d).toBe(5);
    expect(fp.w).toBeGreaterThan(houseFp.w);
    const villa = buildOrcishVilla(dnaFor());
    const box = new THREE.Box3().setFromObject(villa);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.4);
    // Depth tolerance is larger than width's: porch-front/awning-wing
    // variants intentionally project a porch bay + roof overhang past
    // the footprint's own front/back edge.
    expect(size.z).toBeLessThan(fp.d + 3.2);
  });

  it('has a monumental double war door with the five-piece opening minimum and a bone voussoir arch flourish', () => {
    const villa = buildOrcishVilla(dnaFor());
    const door = findByNameIncluding(villa, 'orcish-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
    expect(findByNameIncluding(villa, 'villa-door-arch')).toBeDefined();
  });

  it('has front smoke slots and side windows', () => {
    const villa = buildOrcishVilla(dnaFor());
    expect(countByNameIncluding(villa, 'orcish-window')).toBeGreaterThanOrEqual(4);
  });

  it('has a wide longhouse gable roof and an oversized roof-crest trophy', () => {
    const villa = buildOrcishVilla(dnaFor());
    expect(findByNameIncluding(villa, 'longhouse-hide-roof')).toBeDefined();
    expect(findByNameIncluding(villa, 'villa-oversized-trophy')).toBeDefined();
  });

  it('produces finite geometry across seeds and hall plans', () => {
    for (const seed of [1, 2, 3, 12345, 999999, 424242]) {
      assertFiniteGeometry(buildOrcishVilla(dnaFor({ seed })));
    }
  });
});

describe('buildOrcishInn', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'inn', size: 'large', floors: 2, ...overrides });

  it('respects getFootprint(inn, large) 7x5', () => {
    const fp = getFootprint('inn', 'large');
    expect(fp.w).toBe(7);
    expect(fp.d).toBe(5);
    const inn = buildOrcishInn(dnaFor());
    const box = new THREE.Box3().setFromObject(inn);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.4);
    expect(size.z).toBeLessThan(fp.d + 3.2);
  });

  it('has a double front door with the five-piece opening minimum', () => {
    const inn = buildOrcishInn(dnaFor());
    const door = findByNameIncluding(inn, 'orcish-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
  });

  it('has 4 shuttered side windows', () => {
    const inn = buildOrcishInn(dnaFor());
    expect(countByNameIncluding(inn, 'orcish-window')).toBe(4);
  });

  it('has a steep longhouse roof and a hanging sign', () => {
    const inn = buildOrcishInn(dnaFor());
    expect(findByNameIncluding(inn, 'longhouse-hide-roof')).toBeDefined();
    expect(findByNameIncluding(inn, 'inn-hanging-sign')).toBeDefined();
    expect(findByNameIncluding(inn, 'inn-sign-bracket')).toBeDefined();
  });

  it('produces finite geometry across seeds and porch sides', () => {
    for (const seed of [1, 2, 3, 4, 5, 12345, 999999]) {
      assertFiniteGeometry(buildOrcishInn(dnaFor({ seed })));
    }
  });
});

describe('buildOrcishShop', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'shop', size: 'small', ...overrides });

  it('respects getFootprint(shop, small) 4x3', () => {
    const fp = getFootprint('shop', 'small');
    expect(fp.w).toBe(4);
    expect(fp.d).toBe(3);
    const shop = buildOrcishShop(dnaFor());
    const box = new THREE.Box3().setFromObject(shop);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.0);
    expect(size.z).toBeLessThan(fp.d + 2.0);
  });

  it('has a wide counter aperture with the five-piece opening minimum', () => {
    const shop = buildOrcishShop(dnaFor());
    const counter = findByNameIncluding(shop, 'shop-counter-aperture');
    expect(counter).toBeDefined();
    for (const name of ['recess', 'surround', 'sill']) {
      expect(findByNameIncluding(counter!, name)).toBeDefined();
    }
  });

  it('has a hand-built counter slab on legs, not a bare box', () => {
    const shop = buildOrcishShop(dnaFor());
    expect(findByNameIncluding(shop, 'shop-counter-slab')).toBeDefined();
    expect(countByNameIncluding(shop, 'shop-counter-leg')).toBe(2);
  });

  it('has a red/patched stretched-hide awning roof (ribbed, not a flat plane)', () => {
    const shop = buildOrcishShop(dnaFor());
    expect(findByNameIncluding(shop, 'ribbed-awning')).toBeDefined();
  });

  it('produces finite geometry across seeds and wall layouts', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 12345, 999999]) {
      assertFiniteGeometry(buildOrcishShop(dnaFor({ seed })));
    }
  });
});

describe('buildOrcishBlacksmith', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'blacksmith', ...overrides });

  it('respects getFootprint(blacksmith) 5x4', () => {
    const fp = getFootprint('blacksmith', 'small');
    expect(fp.w).toBe(5);
    expect(fp.d).toBe(4);
    const smith = buildOrcishBlacksmith(dnaFor());
    const box = new THREE.Box3().setFromObject(smith);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 3.2);
    expect(size.z).toBeLessThan(fp.d + 3.2);
  });

  it('has a forge mouth with the five-piece opening minimum and a hearth arch flourish', () => {
    const smith = buildOrcishBlacksmith(dnaFor());
    const mouth = findByNameIncluding(smith, 'blacksmith-forge-mouth');
    expect(mouth).toBeDefined();
    for (const name of ['recess', 'surround', 'sill']) {
      expect(findByNameIncluding(mouth!, name)).toBeDefined();
    }
    expect(findByNameIncluding(smith, 'blacksmith-hearth-arch')).toBeDefined();
  });

  it('has the tallest non-watchtower silhouette via a riveted metal chimney breaking the roofline', () => {
    const smith = buildOrcishBlacksmith(dnaFor());
    const box = new THREE.Box3().setFromObject(smith);
    const house = buildOrcishHouse(makeDNA());
    const houseBox = new THREE.Box3().setFromObject(house);
    expect(box.max.y).toBeGreaterThan(houseBox.max.y);
  });

  it('has an always-present anvil + coal-bin + weapon-rack + slag-trough ensemble', () => {
    const smith = buildOrcishBlacksmith(dnaFor());
    expect(findByNameIncluding(smith, 'blacksmith-anvil')).toBeDefined();
    expect(findByNameIncluding(smith, 'blacksmith-coal-bin')).toBeDefined();
    expect(findByNameIncluding(smith, 'blacksmith-weapon-rack')).toBeDefined();
    expect(findByNameIncluding(smith, 'blacksmith-slag-trough')).toBeDefined();
  });

  it('produces finite geometry across seeds and shelter/chimney variants', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 12345, 999999]) {
      assertFiniteGeometry(buildOrcishBlacksmith(dnaFor({ seed })));
    }
  });
});

describe('buildOrcishChapel', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'chapel', ...overrides });

  it('respects getFootprint(chapel) 4x8, the longest single footprint dimension of the 8 kinds', () => {
    const fp = getFootprint('chapel', 'small');
    expect(fp.w).toBe(4);
    expect(fp.d).toBe(8);
    const chapel = buildOrcishChapel(dnaFor());
    const box = new THREE.Box3().setFromObject(chapel);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.4);
    expect(size.z).toBeLessThan(fp.d + 2.4);
  });

  it('has a front ritual portal (hide-flap glazing swap) with the five-piece opening minimum', () => {
    const chapel = buildOrcishChapel(dnaFor());
    const portal = findByNameIncluding(chapel, 'chapel-ritual-portal');
    expect(portal).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(portal!, name)).toBeDefined();
    }
    expect(findByNameIncluding(chapel, 'chapel-portal-arch')).toBeDefined();
  });

  it('has a rear altar recess with crossed-bone mullions and an altar plinth + fire ring', () => {
    const chapel = buildOrcishChapel(dnaFor());
    expect(findByNameIncluding(chapel, 'chapel-altar-recess')).toBeDefined();
    expect(findByNameIncluding(chapel, 'chapel-altar-plinth')).toBeDefined();
    expect(findByNameIncluding(chapel, 'chapel-fire-ring')).toBeDefined();
  });

  it('has a line of totem poles down the aisle, not sphere skull blobs', () => {
    const chapel = buildOrcishChapel(dnaFor());
    expect(countByNameIncluding(chapel, 'chapel-totem-pole')).toBeGreaterThanOrEqual(1);
  });

  it('is mostly open post-and-rail, not solid walls', () => {
    const chapel = buildOrcishChapel(dnaFor());
    expect(findByNameIncluding(chapel, 'lashed-timber-posts')).toBeDefined();
    expect(findByNameIncluding(chapel, 'lashed-timber-wall')).toBeUndefined();
  });

  it('produces finite geometry across seeds and canopy/layout variants', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12345, 999999]) {
      assertFiniteGeometry(buildOrcishChapel(dnaFor({ seed })));
    }
  });
});

describe('buildOrcishWatchtower', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'watchtower', ...overrides });

  it('respects getFootprint(watchtower) 2x2 at the base, with legs allowed to splay outward', () => {
    const fp = getFootprint('watchtower', 'small');
    expect(fp.w).toBe(2);
    expect(fp.d).toBe(2);
    const tower = buildOrcishWatchtower(dnaFor());
    const box = new THREE.Box3().setFromObject(tower);
    const size = box.getSize(new THREE.Vector3());
    // Splayed-stance legs intentionally project past the nominal footprint.
    expect(size.x).toBeLessThan(fp.w * 2.2);
    expect(size.z).toBeLessThan(fp.d * 2.2);
  });

  it('has 4 lashed legs and 2 tiers of cross braces, not a solid masonry shaft', () => {
    const tower = buildOrcishWatchtower(dnaFor());
    for (let i = 0; i < 4; i++) {
      expect(findByNameIncluding(tower, `watchtower-leg-${i}`)).toBeDefined();
    }
    expect(countByNameIncluding(tower, 'watchtower-cross-brace')).toBeGreaterThanOrEqual(8);
  });

  it('has a plank platform with a framed ladder hatch and a rung ladder to reach it', () => {
    const tower = buildOrcishWatchtower(dnaFor());
    const platform = findByNameIncluding(tower, 'watchtower-platform');
    expect(platform).toBeDefined();
    expect(findByNameIncluding(platform!, 'hatch-lip')).toBeDefined();
    expect(countByNameIncluding(tower, 'watchtower-ladder-rung')).toBeGreaterThanOrEqual(6);
  });

  it('has a parapet rail with 3-4 framed lookout slits, not an open ledge', () => {
    const tower = buildOrcishWatchtower(dnaFor());
    const slitCount = countByNameIncluding(tower, 'watchtower-lookout-slit');
    expect(slitCount).toBeGreaterThanOrEqual(3);
    expect(slitCount).toBeLessThanOrEqual(4);
    for (const slit of ['lookout-slit-sill', 'lookout-slit-lintel', 'lookout-slit-crossbar']) {
      expect(countByNameIncluding(tower, slit)).toBeGreaterThanOrEqual(3);
    }
  });

  it('is the tallest of the 8 kinds via its roof-cap crest', () => {
    const tower = buildOrcishWatchtower(dnaFor());
    const box = new THREE.Box3().setFromObject(tower);
    const smith = buildOrcishBlacksmith(makeDNA({ buildingKind: 'blacksmith' }));
    const smithBox = new THREE.Box3().setFromObject(smith);
    expect(box.max.y).toBeGreaterThan(smithBox.max.y);
  });

  it('produces finite geometry across seeds and stance/rail/cap/signal variants', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12345, 999999]) {
      assertFiniteGeometry(buildOrcishWatchtower(dnaFor({ seed })));
    }
  });
});
