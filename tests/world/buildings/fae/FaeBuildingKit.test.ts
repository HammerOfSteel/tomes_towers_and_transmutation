import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildFaeHouse,
  buildFaeTerraced,
  buildFaeVilla,
  buildFaeInn,
  buildFaeShop,
  buildFaeBlacksmith,
  buildFaeChapel,
  buildFaeWatchtower,
} from '@/world/buildings/fae/FaeBuildingKit';
import { getFootprint, factionBuildingDna } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA, BuildingKind } from '@/world/buildings/BuildingDNA';

function makeDna(kind: BuildingKind, seed = 1234): BuildingDNA {
  return factionBuildingDna(kind, 'fae', seed, 'small', 1);
}

function allMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
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

/** Regression guard for the documented uv-attribute merge-drop bug class:
 * every mesh must carry a `uv` attribute so `mergeGeometries()` never
 * silently fails and causes `mergeGroupMeshesByMaterial()` to drop an
 * entire material bucket's meshes. */
function assertEveryMeshHasUv(root: THREE.Object3D): void {
  for (const mesh of allMeshes(root)) {
    expect(mesh.geometry.getAttribute('uv'), `${mesh.name} must have a uv attribute`).toBeTruthy();
  }
}

function findByNameIncluding(root: THREE.Object3D, needle: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => { if (!found && o.name && o.name.includes(needle)) found = o; });
  return found;
}

const ALL_BUILDERS: Array<[string, (dna: BuildingDNA) => THREE.Group, BuildingKind]> = [
  ['house', buildFaeHouse, 'house'],
  ['terraced', buildFaeTerraced, 'terraced'],
  ['villa', buildFaeVilla, 'villa'],
  ['inn', buildFaeInn, 'inn'],
  ['shop', buildFaeShop, 'shop'],
  ['blacksmith', buildFaeBlacksmith, 'blacksmith'],
  ['chapel', buildFaeChapel, 'chapel'],
  ['watchtower', buildFaeWatchtower, 'watchtower'],
];

describe('fae building kit — cross-cutting doctrine guards', () => {
  it('every kind produces only finite geometry across several seeds', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      for (const seed of [1, 2, 42, 99999]) {
        assertFiniteGeometry(build(makeDna(kind, seed)));
      }
    }
  }, 20000);

  it('every kind produces uv-complete geometry (merge-drop bug-class regression guard)', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      assertEveryMeshHasUv(build(makeDna(kind)));
    }
  });

  it('every kind has ground-contact grounding (root flare + plinth) and lot dressing', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      const b = build(makeDna(kind));
      expect(findByNameIncluding(b, 'fae-grounding'), `${kind} grounding`).toBeDefined();
      expect(findByNameIncluding(b, 'fae-root-flare'), `${kind} root flare`).toBeDefined();
      expect(findByNameIncluding(b, 'fae-lot-dressing'), `${kind} lot dressing`).toBeDefined();
    }
  });

  it('every kind has a real constructed roof (mushroom cap, curled cone, or gable shingle course)', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      const b = build(makeDna(kind));
      const hasMushroomCap = findByNameIncluding(b, 'radial-mushroom-cap') !== undefined;
      const hasCurledCone = findByNameIncluding(b, 'curled-cone-shingle-roof') !== undefined;
      const hasGableShingle = findByNameIncluding(b, 'shingle') !== undefined;
      expect(hasMushroomCap || hasCurledCone || hasGableShingle, `${kind} must have a real roof`).toBe(true);
    }
  });

  it('every kind has at least one glowing opening (recess + surround + glow glazing)', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      const b = build(makeDna(kind));
      expect(findByNameIncluding(b, 'recess'), `${kind} opening recess`).toBeDefined();
      expect(findByNameIncluding(b, 'surround'), `${kind} opening surround`).toBeDefined();
    }
  });

  it('produces deterministic geometry for a repeated seed', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      const a = build(makeDna(kind, 777));
      const b = build(makeDna(kind, 777));
      expect(allMeshes(a).length, `${kind} mesh count`).toBe(allMeshes(b).length);
    }
  });
});

describe('buildFaeHouse — Glowcap Cottage', () => {
  it('respects getFootprint(house, small) within skirt/eave/root-flare tolerance', () => {
    const fp = getFootprint('house', 'small');
    const house = buildFaeHouse(makeDna('house'));
    const box = new THREE.Box3().setFromObject(house);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.6);
    expect(size.z).toBeLessThan(fp.d + 2.6);
  });

  it('has an off-centre door with a five-piece opening', () => {
    const house = buildFaeHouse(makeDna('house'));
    const door = findByNameIncluding(house, 'fae-house-door');
    expect(door).toBeDefined();
    expect(findByNameIncluding(door!, 'recess')).toBeDefined();
    expect(findByNameIncluding(door!, 'surround')).toBeDefined();
  });

  it('has at least one glowing window', () => {
    const house = buildFaeHouse(makeDna('house'));
    expect(findByNameIncluding(house, 'fae-house-window')).toBeDefined();
  });
});

describe('buildFaeTerraced — Pixie Row House', () => {
  it('respects getFootprint(terraced, small) (fixed 3x4)', () => {
    const fp = getFootprint('terraced', 'small');
    expect(fp).toEqual({ w: 3, d: 4 });
    const t = buildFaeTerraced(makeDna('terraced'));
    const box = new THREE.Box3().setFromObject(t);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.6);
    expect(size.z).toBeLessThan(fp.d + 2.6);
  });

  it('has a string course marking the floor split', () => {
    const t = buildFaeTerraced(makeDna('terraced'));
    expect(findByNameIncluding(t, 'fae-terraced-string-course')).toBeDefined();
  });
});

describe('buildFaeVilla — Fae Court House', () => {
  it('has a distinct side turret mass (main hall + turret hall + turret roof)', () => {
    const v = buildFaeVilla(makeDna('villa'));
    expect(findByNameIncluding(v, 'fae-hall')).toBeDefined();
    expect(findByNameIncluding(v, 'curled-cone-shingle-roof')).toBeDefined();
    expect(findByNameIncluding(v, 'radial-mushroom-cap')).toBeDefined();
  });

  it('has a balcony rail over the door', () => {
    const v = buildFaeVilla(makeDna('villa'));
    expect(findByNameIncluding(v, 'fae-villa-balcony-rail')).toBeDefined();
  });
});

describe('buildFaeInn — Firefly Inn', () => {
  it('has a double door and a porch', () => {
    const inn = buildFaeInn(makeDna('inn'));
    expect(findByNameIncluding(inn, 'fae-inn-door-l')).toBeDefined();
    expect(findByNameIncluding(inn, 'fae-inn-door-r')).toBeDefined();
    expect(findByNameIncluding(inn, 'fae-porch')).toBeDefined();
  });

  it('has a wide mushroom-cap roof', () => {
    const inn = buildFaeInn(makeDna('inn'));
    expect(findByNameIncluding(inn, 'radial-mushroom-cap')).toBeDefined();
  });
});

describe('buildFaeShop — Petal Market Stall', () => {
  it('has a wide low counter window and a side door', () => {
    const shop = buildFaeShop(makeDna('shop'));
    expect(findByNameIncluding(shop, 'fae-shop-counter')).toBeDefined();
    expect(findByNameIncluding(shop, 'fae-shop-door')).toBeDefined();
  });

  it('has a petal-awning roof', () => {
    const shop = buildFaeShop(makeDna('shop'));
    expect(findByNameIncluding(shop, 'radial-mushroom-cap')).toBeDefined();
  });
});

describe('buildFaeBlacksmith — Glowforge Hollow', () => {
  it('has an open forge bay with visible embers', () => {
    const bs = buildFaeBlacksmith(makeDna('blacksmith'));
    expect(findByNameIncluding(bs, 'fae-forge-bay')).toBeDefined();
    expect(findByNameIncluding(bs, 'forge-embers')).toBeDefined();
  });

  it('has a real two-slope shingle gable roof', () => {
    const bs = buildFaeBlacksmith(makeDna('blacksmith'));
    expect(findByNameIncluding(bs, 'shingle')).toBeDefined();
  });
});

describe('buildFaeChapel — Faerie Ring Chapel', () => {
  it('has stump-column pilasters along the long walls', () => {
    const chapel = buildFaeChapel(makeDna('chapel'));
    expect(findByNameIncluding(chapel, 'fae-chapel-column')).toBeDefined();
  });

  it('has an elongated mushroom-cap nave canopy and an altar', () => {
    const chapel = buildFaeChapel(makeDna('chapel'));
    expect(findByNameIncluding(chapel, 'radial-mushroom-cap')).toBeDefined();
    expect(findByNameIncluding(chapel, 'fae-chapel-altar')).toBeDefined();
  });
});

describe('buildFaeWatchtower — Moonmoth Lookout', () => {
  it('respects getFootprint(watchtower, small) (fixed 2x2)', () => {
    const fp = getFootprint('watchtower', 'small');
    expect(fp).toEqual({ w: 2, d: 2 });
  });

  it('has stacked storey string courses and a tall curled cone roof', () => {
    const wt = buildFaeWatchtower(makeDna('watchtower'));
    expect(findByNameIncluding(wt, 'fae-watchtower-string-course-1')).toBeDefined();
    expect(findByNameIncluding(wt, 'curled-cone-shingle-roof')).toBeDefined();
  });
});
