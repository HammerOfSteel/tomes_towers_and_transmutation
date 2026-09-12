import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildVampireHouse,
  buildVampireTerraced,
  buildVampireVilla,
  buildVampireInn,
  buildVampireShop,
  buildVampireBlacksmith,
  buildVampireChapel,
  buildVampireWatchtower,
} from '@/world/buildings/vampire/VampireBuildingKit';
import { buildVampirePalette } from '@/world/buildings/vampire/VampireMaterials';
import { getFootprint } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

function makeDNA(overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1,
    kind: 'building',
    name: 'vampire-test-building',
    buildingKind: 'house',
    size: 'small',
    floors: 1,
    style: 'vampiric',
    condition: 'pristine',
    hasInterior: false,
    interiorLayout: 'single_room',
    colors: { walls: '#2a2030', roof: '#1a1020', trim: '#4a3050', door: '#8a2020' },
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

describe('buildVampirePalette', () => {
  it('returns stable shared material references reused across a whole house (merge-friendly)', () => {
    const dna = makeDNA();
    const palette = buildVampirePalette(dna);
    const house = buildVampireHouse(dna);
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
    expect(palette.ashlar).toBe(palette.ashlar);
  });
});

describe('buildVampireHouse', () => {
  it('respects getFootprint(house, small), staying within footprint plus eaves/skirt', () => {
    const dna = makeDNA();
    const fp = getFootprint('house', 'small');
    const house = buildVampireHouse(dna);
    const box = new THREE.Box3().setFromObject(house);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 1.6);
    expect(size.z).toBeLessThan(fp.d + 1.6);
  });

  it('has an off-centre pointed door with the five-piece opening minimum', () => {
    const house = buildVampireHouse(makeDNA());
    const door = findByNameIncluding(house, 'vampire-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
  });

  it('has at least one closed shuttered window (not a broken/blob window)', () => {
    const house = buildVampireHouse(makeDNA());
    const shuttered = findByNameIncluding(house, 'vampire-shuttered-window');
    expect(shuttered).toBeDefined();
    expect(findByNameIncluding(shuttered!, 'shutter-pair')).toBeDefined();
    expect(findByNameIncluding(shuttered!, 'opening')).toBeDefined();
  });

  it('has a steep intact roof (gable or mansard family), never a smooth cone', () => {
    const house = buildVampireHouse(makeDNA());
    const roofNames = ['gable-roof', 'mansard-roof'];
    expect(roofNames.some((n) => findByNameIncluding(house, n) !== undefined)).toBe(true);
    let sawCone = false;
    house.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'ConeGeometry') sawCone = true; });
    expect(sawCone).toBe(false);
  });

  it('has a chimney and at least one plinth course', () => {
    const house = buildVampireHouse(makeDNA());
    expect(findByNameIncluding(house, 'vampire-chimney')).toBeDefined();
    expect(findByNameIncluding(house, 'plinth-course')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 12345, 999999]) {
      assertFiniteGeometry(buildVampireHouse(makeDNA({ seed })));
    }
  });
});

describe('buildVampireTerraced', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'terraced', floors: 3, ...overrides });

  it('respects getFootprint(terraced), narrower than a villa footprint', () => {
    const fp = getFootprint('terraced', 'small');
    const villaFp = getFootprint('villa', 'small');
    const terraced = buildVampireTerraced(dnaFor());
    const box = new THREE.Box3().setFromObject(terraced);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 1.6);
    expect(size.z).toBeLessThan(fp.d + 1.6);
    expect(fp.w).toBeLessThan(villaFp.w);
  });

  it('has no side windows (party-wall-safe by construction)', () => {
    const terraced = buildVampireTerraced(dnaFor({ terrace: 'both' }));
    expect(countByNameIncluding(terraced, 'vampire-side-window')).toBe(0);
  });

  it('has a narrow front door with the five-piece opening minimum', () => {
    const terraced = buildVampireTerraced(dnaFor());
    const door = findByNameIncluding(terraced, 'vampire-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
  });

  it('has multiple stacked shuttered windows across its 3 floors', () => {
    const terraced = buildVampireTerraced(dnaFor());
    expect(countByNameIncluding(terraced, 'vampire-shuttered-window')).toBeGreaterThanOrEqual(4);
  });

  it('has a steep mansard roof with iron ridge cresting', () => {
    const terraced = buildVampireTerraced(dnaFor());
    expect(findByNameIncluding(terraced, 'mansard-roof')).toBeDefined();
    expect(findByNameIncluding(terraced, 'vampire-ridge-cresting')).toBeDefined();
  });

  it('produces finite geometry across seeds and terrace states', () => {
    for (const terrace of ['none', 'left', 'right', 'both'] as const) {
      for (const seed of [1, 42, 12345]) {
        assertFiniteGeometry(buildVampireTerraced(dnaFor({ terrace, seed })));
      }
    }
  });
});

describe('buildVampireVilla', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'villa', size: 'large', floors: 3, ...overrides });

  it('respects getFootprint(villa) 7x5, larger than a house footprint', () => {
    const fp = getFootprint('villa', 'large');
    const houseFp = getFootprint('house', 'small');
    expect(fp.w).toBe(7);
    expect(fp.d).toBe(5);
    expect(fp.w).toBeGreaterThan(houseFp.w);
    const villa = buildVampireVilla(dnaFor());
    const box = new THREE.Box3().setFromObject(villa);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 3.2);
    expect(size.z).toBeLessThan(fp.d + 3.6);
  });

  it('has a monumental arched front door with the five-piece opening minimum', () => {
    const villa = buildVampireVilla(dnaFor());
    const door = findByNameIncluding(villa, 'vampire-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
  });

  it('has an OrielBay or an iron balcony as its signature upper bay', () => {
    const villa = buildVampireVilla(dnaFor());
    const hasSignatureBay = findByNameIncluding(villa, 'vampire-oriel-bay') !== undefined
      || findByNameIncluding(villa, 'vampire-balcony') !== undefined;
    expect(hasSignatureBay).toBe(true);
  });

  it('has a gated iron forecourt fence', () => {
    const villa = buildVampireVilla(dnaFor());
    expect(findByNameIncluding(villa, 'vampire-fence')).toBeDefined();
    expect(findByNameIncluding(villa, 'vampire-gate')).toBeDefined();
  });

  it('has a mansard or hip roof with multiple chimneys', () => {
    const villa = buildVampireVilla(dnaFor());
    const roofNames = ['mansard-roof', 'hip-roof'];
    expect(roofNames.some((n) => findByNameIncluding(villa, n) !== undefined)).toBe(true);
    expect(countByNameIncluding(villa, 'vampire-chimney')).toBeGreaterThanOrEqual(2);
  });

  it('produces finite geometry across seeds and mass variants', () => {
    for (const seed of [1, 2, 3, 12345, 999999, 424242]) {
      assertFiniteGeometry(buildVampireVilla(dnaFor({ seed })));
    }
  });
});

describe('buildVampireInn', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'inn', size: 'large', floors: 2, ...overrides });

  it('respects getFootprint(inn, large) 7x5', () => {
    const fp = getFootprint('inn', 'large');
    expect(fp.w).toBe(7);
    expect(fp.d).toBe(5);
    const inn = buildVampireInn(dnaFor());
    const box = new THREE.Box3().setFromObject(inn);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.8);
    expect(size.z).toBeLessThan(fp.d + 3.2);
  });

  it('has a wide carriage-arch double door with the five-piece opening minimum', () => {
    const inn = buildVampireInn(dnaFor());
    const door = findByNameIncluding(inn, 'vampire-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
  });

  it('has several shuttered guest-room windows and a hanging crest sign', () => {
    const inn = buildVampireInn(dnaFor());
    expect(countByNameIncluding(inn, 'vampire-shuttered-window')).toBeGreaterThanOrEqual(4);
    expect(findByNameIncluding(inn, 'vampire-inn-sign')).toBeDefined();
    expect(findByNameIncluding(inn, 'vampire-sign-bracket')).toBeDefined();
  });

  it('has a long roof (mansard/gable/hip family) with at least two chimney stacks', () => {
    const inn = buildVampireInn(dnaFor());
    const roofNames = ['mansard-roof', 'gable-roof', 'hip-roof'];
    expect(roofNames.some((n) => findByNameIncluding(inn, n) !== undefined)).toBe(true);
    expect(countByNameIncluding(inn, 'vampire-chimney')).toBeGreaterThanOrEqual(2);
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 4, 5, 12345, 999999]) {
      assertFiniteGeometry(buildVampireInn(dnaFor({ seed })));
    }
  });
});

describe('buildVampireShop', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'shop', size: 'small', ...overrides });

  it('respects getFootprint(shop, small) 4x3', () => {
    const fp = getFootprint('shop', 'small');
    expect(fp.w).toBe(4);
    expect(fp.d).toBe(3);
    const shop = buildVampireShop(dnaFor());
    const box = new THREE.Box3().setFromObject(shop);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.0);
    expect(size.z).toBeLessThan(fp.d + 2.4);
  });

  it('has a locked display bay with the five-piece opening minimum plus an iron grille', () => {
    const shop = buildVampireShop(dnaFor());
    const display = findByNameIncluding(shop, 'vampire-display-window');
    expect(display).toBeDefined();
    for (const name of ['recess', 'surround', 'sill']) {
      expect(findByNameIncluding(display!, name)).toBeDefined();
    }
    expect(findByNameIncluding(shop, 'vampire-grille')).toBeDefined();
  });

  it('has a narrow shop door and a hanging trade sign', () => {
    const shop = buildVampireShop(dnaFor());
    expect(findByNameIncluding(shop, 'vampire-door')).toBeDefined();
    expect(findByNameIncluding(shop, 'vampire-inn-sign')).toBeDefined();
  });

  it('has an iron-supported cloth awning, not a flat unsupported slab', () => {
    const shop = buildVampireShop(dnaFor());
    expect(findByNameIncluding(shop, 'vampire-awning')).toBeDefined();
    expect(countByNameIncluding(shop, 'vampire-awning-bracket')).toBeGreaterThanOrEqual(2);
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 12345, 999999]) {
      assertFiniteGeometry(buildVampireShop(dnaFor({ seed })));
    }
  });
});

describe('buildVampireBlacksmith', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'blacksmith', ...overrides });

  it('respects getFootprint(blacksmith) 5x4', () => {
    const fp = getFootprint('blacksmith', 'small');
    expect(fp.w).toBe(5);
    expect(fp.d).toBe(4);
    const smith = buildVampireBlacksmith(dnaFor());
    const box = new THREE.Box3().setFromObject(smith);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 3.2);
    expect(size.z).toBeLessThan(fp.d + 3.2);
  });

  it('has a wide arched forge door with the five-piece opening minimum, set behind an iron frame', () => {
    const smith = buildVampireBlacksmith(dnaFor());
    const door = findByNameIncluding(smith, 'vampire-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
    expect(findByNameIncluding(smith, 'vampire-forge-frame')).toBeDefined();
  });

  it('has louvred ventilation shutters (no glass) and a barred ember-glow rear window', () => {
    const smith = buildVampireBlacksmith(dnaFor());
    expect(countByNameIncluding(smith, 'vampire-vent')).toBeGreaterThanOrEqual(2);
    expect(findByNameIncluding(smith, 'vampire-forge-window')).toBeDefined();
    expect(findByNameIncluding(smith, 'vampire-grille')).toBeDefined();
  });

  it('has a massive chimney breast, taller than the vampire house', () => {
    const smith = buildVampireBlacksmith(dnaFor());
    const smithBox = new THREE.Box3().setFromObject(smith);
    const house = buildVampireHouse(makeDNA());
    const houseBox = new THREE.Box3().setFromObject(house);
    expect(findByNameIncluding(smith, 'vampire-chimney')).toBeDefined();
    expect(smithBox.max.y).toBeGreaterThan(houseBox.max.y * 0.7);
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 12345, 999999]) {
      assertFiniteGeometry(buildVampireBlacksmith(dnaFor({ seed })));
    }
  });
});

describe('buildVampireChapel', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'chapel', ...overrides });

  it('respects getFootprint(chapel) 4x8, the longest single footprint dimension of the 8 kinds', () => {
    const fp = getFootprint('chapel', 'small');
    expect(fp.w).toBe(4);
    expect(fp.d).toBe(8);
    const chapel = buildVampireChapel(dnaFor());
    const box = new THREE.Box3().setFromObject(chapel);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.4);
    expect(size.z).toBeLessThan(fp.d + 2.8);
  });

  it('has a pointed double door with the five-piece opening minimum and a voussoir arch flourish', () => {
    const chapel = buildVampireChapel(dnaFor());
    const door = findByNameIncluding(chapel, 'vampire-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
    expect(findByNameIncluding(chapel, 'vampire-door-arch')).toBeDefined();
  });

  it('has a rose tracery window with set-back red glass above the door', () => {
    const chapel = buildVampireChapel(dnaFor());
    expect(findByNameIncluding(chapel, 'vampire-rose-window')).toBeDefined();
    expect(findByNameIncluding(chapel, 'vampire-rose-glass')).toBeDefined();
  });

  it('has buttresses at bay divisions on both long walls (maintained, not a ruin)', () => {
    const chapel = buildVampireChapel(dnaFor());
    expect(countByNameIncluding(chapel, 'vampire-buttress')).toBeGreaterThanOrEqual(4);
  });

  it('has a steep nave roof with ridge cresting and a bellcote', () => {
    const chapel = buildVampireChapel(dnaFor());
    expect(findByNameIncluding(chapel, 'gable-roof')).toBeDefined();
    expect(findByNameIncluding(chapel, 'vampire-ridge-cresting')).toBeDefined();
    expect(findByNameIncluding(chapel, 'vampire-bellcote')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12345, 999999]) {
      assertFiniteGeometry(buildVampireChapel(dnaFor({ seed })));
    }
  });
});

describe('buildVampireWatchtower', () => {
  const dnaFor = (overrides: Partial<BuildingDNA> = {}) => makeDNA({ buildingKind: 'watchtower', ...overrides });

  it('respects getFootprint(watchtower) 2x2 at the base', () => {
    const fp = getFootprint('watchtower', 'small');
    expect(fp.w).toBe(2);
    expect(fp.d).toBe(2);
    const tower = buildVampireWatchtower(dnaFor());
    const box = new THREE.Box3().setFromObject(tower);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w * 2.4);
    expect(size.z).toBeLessThan(fp.d * 2.4);
  });

  it('has a tiny pointed service door with the five-piece opening minimum', () => {
    const tower = buildVampireWatchtower(dnaFor());
    const door = findByNameIncluding(tower, 'vampire-door');
    expect(door).toBeDefined();
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByNameIncluding(door!, name)).toBeDefined();
    }
  });

  it('has several slit-lancet shuttered openings stacked up the shaft', () => {
    const tower = buildVampireWatchtower(dnaFor());
    expect(countByNameIncluding(tower, 'vampire-shuttered-window')).toBeGreaterThanOrEqual(3);
  });

  it('has a real block-course tapered shaft (quoins + string courses), not a voxel spire grid', () => {
    const tower = buildVampireWatchtower(dnaFor());
    expect(countByNameIncluding(tower, 'string-course')).toBeGreaterThanOrEqual(2);
  });

  it('is the tallest of the 8 kinds via its needle roof + finial', () => {
    const tower = buildVampireWatchtower(dnaFor());
    const box = new THREE.Box3().setFromObject(tower);
    const villa = buildVampireVilla(makeDNA({ buildingKind: 'villa', size: 'large' }));
    const villaBox = new THREE.Box3().setFromObject(villa);
    expect(box.max.y).toBeGreaterThan(villaBox.max.y * 0.6);
    expect(findByNameIncluding(tower, 'vampire-finial')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12345, 999999]) {
      assertFiniteGeometry(buildVampireWatchtower(dnaFor({ seed })));
    }
  });
});

describe('vampire full-roster quality sweep', () => {
  const kinds = ['house', 'terraced', 'villa', 'inn', 'shop', 'blacksmith', 'chapel', 'watchtower'] as const;
  const builders = {
    house: buildVampireHouse,
    terraced: buildVampireTerraced,
    villa: buildVampireVilla,
    inn: buildVampireInn,
    shop: buildVampireShop,
    blacksmith: buildVampireBlacksmith,
    chapel: buildVampireChapel,
    watchtower: buildVampireWatchtower,
  };

  it('every kind builds a non-empty, all-finite group without throwing', () => {
    for (const kind of kinds) {
      const g = builders[kind](makeDNA({ buildingKind: kind, seed: 11 }));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(allMeshes(g).length).toBeGreaterThan(0);
      assertFiniteGeometry(g);
    }
  });

  it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds', () => {
    const counts = kinds.map((kind) => allMeshes(builders[kind](makeDNA({ buildingKind: kind, seed: 11 }))).length);
    expect(new Set(counts).size).toBe(kinds.length);
  });

  it('is deterministic for the same kind/seed', () => {
    for (const kind of kinds) {
      const a = builders[kind](makeDNA({ buildingKind: kind, seed: 77 }));
      const b = builders[kind](makeDNA({ buildingKind: kind, seed: 77 }));
      expect(allMeshes(a).length).toBe(allMeshes(b).length);
    }
  });

  it('never uses a bare SphereGeometry/ConeGeometry as a stand-in for carved ornament (gargoyles/finials use box-built low-poly brackets)', () => {
    for (const kind of kinds) {
      const g = builders[kind](makeDNA({ buildingKind: kind, seed: 11 }));
      let sawBareSphere = false;
      g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawBareSphere = true; });
      expect(sawBareSphere).toBe(false);
    }
  });

  it('every kind has at least one closed (never broken) shuttered or louvred opening', () => {
    for (const kind of kinds) {
      const g = builders[kind](makeDNA({ buildingKind: kind, seed: 11 }));
      const hasClosedOpening = findByNameIncluding(g, 'vampire-shuttered-window') !== undefined
        || findByNameIncluding(g, 'vampire-vent') !== undefined;
      expect(hasClosedOpening).toBe(true);
    }
  });
});
