import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildUndeadHouse,
  buildUndeadTerraced,
  buildUndeadVilla,
  buildUndeadInn,
  buildUndeadShop,
  buildUndeadBlacksmith,
  buildUndeadChapel,
  buildUndeadWatchtower,
} from '@/world/buildings/undead/UndeadNecropolisKit';
import { getFootprint } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA, BuildingKind } from '@/world/buildings/BuildingDNA';

function makeDNA(overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1,
    kind: 'building',
    name: 'undead-test-building',
    buildingKind: 'house',
    size: 'small',
    floors: 1,
    style: 'stone',
    condition: 'ruined',
    hasInterior: false,
    interiorLayout: 'single_room',
    colors: { walls: '#5a5048', roof: '#383028', trim: '#2a2020', door: '#1a1a18' },
    rotation: 0,
    terrace: 'none',
    features: [],
    seed: 424242,
    ...overrides,
  } as BuildingDNA;
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

describe('buildUndeadHouse', () => {
  it('respects getFootprint(house, small), staying within footprint plus eaves/skirt', () => {
    const fp = getFootprint('house', 'small');
    const house = buildUndeadHouse(makeDNA());
    const box = new THREE.Box3().setFromObject(house);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.2);
    expect(size.z).toBeLessThan(fp.d + 2.2);
  });

  it('has an off-centre crypt door with a real five-piece/grille opening, not a blob', () => {
    const house = buildUndeadHouse(makeDNA());
    const door = findByNameIncluding(house, 'undead-house-door');
    expect(door).toBeDefined();
    const hasOpeningParts = ['recess', 'surround'].every((n) => findByNameIncluding(door!, n) !== undefined);
    expect(hasOpeningParts).toBe(true);
  });

  it('has ground-contact lot dressing and a plinth', () => {
    const house = buildUndeadHouse(makeDNA());
    expect(findByNameIncluding(house, 'undead-lot-dressing')).toBeDefined();
    expect(findByNameIncluding(house, 'plinth-course')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 12345, 999999]) {
      assertFiniteGeometry(buildUndeadHouse(makeDNA({ seed })));
    }
  });
});

describe('buildUndeadTerraced', () => {
  it('has at least two crypt doors across the front (a row, not a single house)', () => {
    const terraced = buildUndeadTerraced(makeDNA({ buildingKind: 'terraced', size: 'small' }));
    let doorCount = 0;
    terraced.traverse((o) => { if (o.name.startsWith('undead-terraced-door-')) doorCount++; });
    expect(doorCount).toBeGreaterThanOrEqual(2);
  });

  it('has at least one bay that differs from the others (an oculus among plaques)', () => {
    const terraced = buildUndeadTerraced(makeDNA({ buildingKind: 'terraced', size: 'small' }));
    expect(findByNameIncluding(terraced, 'undead-terraced-oculus-0')).toBeDefined();
    expect(findByNameIncluding(terraced, 'undead-terraced-plaque-1')).toBeDefined();
  });

  it('has a frieze band tying the row together', () => {
    const terraced = buildUndeadTerraced(makeDNA({ buildingKind: 'terraced', size: 'small' }));
    expect(findByNameIncluding(terraced, 'undead-terraced-frieze')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3]) {
      assertFiniteGeometry(buildUndeadTerraced(makeDNA({ buildingKind: 'terraced', seed })));
    }
  });
});

describe('buildUndeadVilla', () => {
  it('has a grand front door with a voussoir hood', () => {
    const villa = buildUndeadVilla(makeDNA({ buildingKind: 'villa', size: 'large', floors: 2 }));
    expect(findByNameIncluding(villa, 'undead-villa-door')).toBeDefined();
    expect(findByNameIncluding(villa, 'voussoir-hood')).toBeDefined();
  });

  it('has upper columbarium/lantern bays and side plaque niches', () => {
    const villa = buildUndeadVilla(makeDNA({ buildingKind: 'villa', size: 'large', floors: 2 }));
    let bayCount = 0;
    let sideCount = 0;
    villa.traverse((o) => {
      if (o.name.startsWith('undead-villa-bay-')) bayCount++;
      if (o.name.startsWith('undead-villa-side-niche-')) sideCount++;
    });
    expect(bayCount).toBeGreaterThan(0);
    expect(sideCount).toBeGreaterThan(0);
  });

  it('has a mismatched spolia repair patch (asymmetry/maintained decay)', () => {
    const villa = buildUndeadVilla(makeDNA({ buildingKind: 'villa', size: 'large', floors: 2 }));
    expect(findByNameIncluding(villa, 'undead-villa-patch')).toBeDefined();
  });

  it('produces finite geometry for 2 and 3 floors', () => {
    assertFiniteGeometry(buildUndeadVilla(makeDNA({ buildingKind: 'villa', size: 'large', floors: 2 })));
    assertFiniteGeometry(buildUndeadVilla(makeDNA({ buildingKind: 'villa', size: 'large', floors: 3 })));
  });
});

describe('buildUndeadInn', () => {
  it('has a three-bay front arcade: entry plus two bier niches', () => {
    const inn = buildUndeadInn(makeDNA({ buildingKind: 'inn', size: 'large' }));
    expect(findByNameIncluding(inn, 'undead-inn-entry')).toBeDefined();
    expect(findByNameIncluding(inn, 'undead-inn-arcade-niche-0')).toBeDefined();
    expect(findByNameIncluding(inn, 'undead-inn-arcade-niche-2')).toBeDefined();
  });

  it('has an upper columbarium band and a rear service arch', () => {
    const inn = buildUndeadInn(makeDNA({ buildingKind: 'inn', size: 'large' }));
    expect(findByNameIncluding(inn, 'undead-inn-columbarium')).toBeDefined();
    expect(findByNameIncluding(inn, 'undead-inn-rear-arch')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3]) {
      assertFiniteGeometry(buildUndeadInn(makeDNA({ buildingKind: 'inn', size: 'large', seed })));
    }
  });
});

describe('buildUndeadShop', () => {
  it('has a sarcophagus counter and a wide front arch, no closed front wall', () => {
    const shop = buildUndeadShop(makeDNA({ buildingKind: 'shop', size: 'small' }));
    expect(findByNameIncluding(shop, 'undead-shop-counter')).toBeDefined();
    expect(findByNameIncluding(shop, 'undead-shop-front-arch')).toBeDefined();
  });

  it('has a rear reliquary display niche', () => {
    const shop = buildUndeadShop(makeDNA({ buildingKind: 'shop', size: 'small' }));
    expect(findByNameIncluding(shop, 'undead-shop-rear-niche')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3]) {
      assertFiniteGeometry(buildUndeadShop(makeDNA({ buildingKind: 'shop', seed })));
    }
  });
});

describe('buildUndeadBlacksmith', () => {
  it('has a crematory stack and a broad forge arch', () => {
    const blacksmith = buildUndeadBlacksmith(makeDNA({ buildingKind: 'blacksmith', size: 'medium' }));
    expect(findByNameIncluding(blacksmith, 'undead-blacksmith-stack')).toBeDefined();
    expect(findByNameIncluding(blacksmith, 'undead-blacksmith-forge-arch')).toBeDefined();
  });

  it('has a yard boundary rail and a shored roof corner', () => {
    const blacksmith = buildUndeadBlacksmith(makeDNA({ buildingKind: 'blacksmith', size: 'medium' }));
    expect(findByNameIncluding(blacksmith, 'undead-blacksmith-yard-rail')).toBeDefined();
    expect(findByNameIncluding(blacksmith, 'undead-blacksmith-shored-corner')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3]) {
      assertFiniteGeometry(buildUndeadBlacksmith(makeDNA({ buildingKind: 'blacksmith', seed })));
    }
  });
});

describe('buildUndeadChapel', () => {
  it('has a grand gated front door and side buttresses', () => {
    const chapel = buildUndeadChapel(makeDNA({ buildingKind: 'chapel', size: 'small' }));
    expect(findByNameIncluding(chapel, 'undead-chapel-door')).toBeDefined();
    let buttressCount = 0;
    chapel.traverse((o) => { if (o.name.startsWith('undead-chapel-buttress-')) buttressCount++; });
    expect(buttressCount).toBeGreaterThanOrEqual(4);
  });

  it('has a bellcote and a broken pediment (curated damage, not missing roof)', () => {
    const chapel = buildUndeadChapel(makeDNA({ buildingKind: 'chapel', size: 'small' }));
    expect(findByNameIncluding(chapel, 'undead-chapel-bellcote')).toBeDefined();
    expect(findByNameIncluding(chapel, 'undead-chapel-pediment')).toBeDefined();
  });

  it('has a forecourt gate and paired obelisks', () => {
    const chapel = buildUndeadChapel(makeDNA({ buildingKind: 'chapel', size: 'small' }));
    expect(findByNameIncluding(chapel, 'undead-chapel-forecourt-gate')).toBeDefined();
    expect(findByNameIncluding(chapel, 'undead-chapel-obelisk--1')).toBeDefined();
    expect(findByNameIncluding(chapel, 'undead-chapel-obelisk-1')).toBeDefined();
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3]) {
      assertFiniteGeometry(buildUndeadChapel(makeDNA({ buildingKind: 'chapel', seed })));
    }
  });
});

describe('buildUndeadWatchtower', () => {
  it('has a stacked tapered shaft with at least 3 tiers', () => {
    const tower = buildUndeadWatchtower(makeDNA({ buildingKind: 'watchtower', size: 'tiny' }));
    let tierCount = 0;
    tower.traverse((o) => { if (o.name.startsWith('undead-watchtower-tier-')) tierCount++; });
    expect(tierCount).toBeGreaterThanOrEqual(3);
  });

  it('has a rail platform crown and an obelisk finial (no floating orb)', () => {
    const tower = buildUndeadWatchtower(makeDNA({ buildingKind: 'watchtower', size: 'tiny' }));
    let railCount = 0;
    tower.traverse((o) => { if (o.name.startsWith('undead-watchtower-crown-rail-')) railCount++; });
    expect(railCount).toBeGreaterThanOrEqual(4);
    expect(findByNameIncluding(tower, 'undead-watchtower-finial')).toBeDefined();
    let sawOrb = false;
    tower.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'IcosahedronGeometry') sawOrb = true;
    });
    expect(sawOrb).toBe(false);
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3]) {
      assertFiniteGeometry(buildUndeadWatchtower(makeDNA({ buildingKind: 'watchtower', seed })));
    }
  });
});

describe('undead full-roster quality sweep', () => {
  const kinds = ['house', 'terraced', 'villa', 'inn', 'shop', 'blacksmith', 'chapel', 'watchtower'] as const satisfies readonly BuildingKind[];
  const builders: Record<(typeof kinds)[number], (dna: BuildingDNA) => THREE.Group> = {
    house: buildUndeadHouse,
    terraced: buildUndeadTerraced,
    villa: buildUndeadVilla,
    inn: buildUndeadInn,
    shop: buildUndeadShop,
    blacksmith: buildUndeadBlacksmith,
    chapel: buildUndeadChapel,
    watchtower: buildUndeadWatchtower,
  };

  function dnaFor(kind: (typeof kinds)[number], seed: number): BuildingDNA {
    const sizeByKind: Partial<Record<(typeof kinds)[number], BuildingDNA['size']>> = {
      villa: 'large',
      inn: 'large',
      blacksmith: 'medium',
      watchtower: 'tiny',
    };
    return makeDNA({ buildingKind: kind, size: sizeByKind[kind] ?? 'small', floors: kind === 'villa' ? 2 : 1, seed });
  }

  it('every kind builds a non-empty, all-finite group without throwing', () => {
    for (const kind of kinds) {
      const g = builders[kind](dnaFor(kind, 11));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(allMeshes(g).length).toBeGreaterThan(0);
      assertFiniteGeometry(g);
    }
  });

  it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds', () => {
    const counts = kinds.map((kind) => allMeshes(builders[kind](dnaFor(kind, 11))).length);
    expect(new Set(counts).size).toBe(kinds.length);
  });

  it('is deterministic for the same kind/seed', () => {
    for (const kind of kinds) {
      const a = builders[kind](dnaFor(kind, 77));
      const b = builders[kind](dnaFor(kind, 77));
      expect(allMeshes(a).length).toBe(allMeshes(b).length);
    }
  });

  it('varies mesh counts or bounding boxes across seeds for every kind', () => {
    for (const kind of kinds) {
      const seeds = [1, 2, 3, 42, 999];
      const signatures = seeds.map((seed) => {
        const g = builders[kind](dnaFor(kind, seed));
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        return `${allMeshes(g).length}:${size.x.toFixed(2)}:${size.y.toFixed(2)}:${size.z.toFixed(2)}`;
      });
      expect(new Set(signatures).size).toBeGreaterThan(1);
    }
  });

  it('every kind has real ground-contact lot dressing (never a floating building)', () => {
    for (const kind of kinds) {
      const g = builders[kind](dnaFor(kind, 11));
      expect(findByNameIncluding(g, 'undead-lot-dressing')).toBeDefined();
    }
  });

  it('never uses a bare IcosahedronGeometry glow-orb stand-in (the legacy villa bug)', () => {
    for (const kind of kinds) {
      const g = builders[kind](dnaFor(kind, 11));
      let sawOrb = false;
      g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'IcosahedronGeometry') sawOrb = true; });
      expect(sawOrb).toBe(false);
    }
  });
});
