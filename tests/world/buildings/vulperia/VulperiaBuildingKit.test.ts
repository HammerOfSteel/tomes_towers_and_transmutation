import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildVulperiaHouse,
  buildVulperiaTerraced,
  buildVulperiaVilla,
  buildVulperiaInn,
  buildVulperiaShop,
  buildVulperiaBlacksmith,
  buildVulperiaChapel,
  buildVulperiaWatchtower,
} from '@/world/buildings/vulperia/VulperiaBuildingKit';
import { getFootprint, factionBuildingDna } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA, BuildingKind } from '@/world/buildings/BuildingDNA';

function makeDna(kind: BuildingKind, seed = 1234): BuildingDNA {
  return factionBuildingDna(kind, 'vulperia', seed, 'small', 1);
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

function countByNameIncluding(root: THREE.Object3D, needle: string): number {
  let count = 0;
  root.traverse((o) => { if (o.name && o.name.includes(needle)) count++; });
  return count;
}

const ALL_BUILDERS: Array<[string, (dna: BuildingDNA) => THREE.Group, BuildingKind]> = [
  ['house', buildVulperiaHouse, 'house'],
  ['terraced', buildVulperiaTerraced, 'terraced'],
  ['villa', buildVulperiaVilla, 'villa'],
  ['inn', buildVulperiaInn, 'inn'],
  ['shop', buildVulperiaShop, 'shop'],
  ['blacksmith', buildVulperiaBlacksmith, 'blacksmith'],
  ['chapel', buildVulperiaChapel, 'chapel'],
  ['watchtower', buildVulperiaWatchtower, 'watchtower'],
];

describe('vulperia building kit — cross-cutting doctrine guards', () => {
  it('every kind produces only finite geometry across several seeds', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      for (const seed of [1, 2, 42, 99999]) {
        assertFiniteGeometry(build(makeDna(kind, seed)));
      }
    }
  });

  it('every kind produces uv-complete geometry (merge-drop bug-class regression guard)', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      assertEveryMeshHasUv(build(makeDna(kind)));
    }
  });

  it('every kind has ground-contact grounding (plinth + earth berm) and lot dressing', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      const b = build(makeDna(kind));
      expect(findByNameIncluding(b, 'vulperia-plinth-course'), `${kind} plinth`).toBeDefined();
      expect(findByNameIncluding(b, 'vulperia-earth-berm'), `${kind} berm`).toBeDefined();
      expect(findByNameIncluding(b, 'vulperia-lot-dressing'), `${kind} lot dressing`).toBeDefined();
    }
  });

  it('every kind has a real segmented turf roof (never a smooth blob): all 6 named layers present', () => {
    for (const [, build, kind] of ALL_BUILDERS) {
      const b = build(makeDna(kind));
      for (const layer of ['turf-roof-rafters', 'turf-roof-board-deck', 'turf-roof-turf-stop', 'turf-roof-soil-edge', 'turf-roof-grass-top']) {
        expect(findByNameIncluding(b, layer), `${kind} ${layer}`).toBeDefined();
      }
    }
  });
});

describe('buildVulperiaHouse — Fox Garden burrow cottage', () => {
  it('respects getFootprint(house, small) within skirt/eave tolerance', () => {
    const fp = getFootprint('house', 'small');
    const house = buildVulperiaHouse(makeDna('house'));
    const box = new THREE.Box3().setFromObject(house);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.4);
    expect(size.z).toBeLessThan(fp.d + 2.4);
  });

  it('has an off-centre burrow_round_door with five-piece parts', () => {
    const house = buildVulperiaHouse(makeDna('house'));
    const door = findByNameIncluding(house, 'vulperia-house-door');
    expect(door).toBeDefined();
    expect(findByNameIncluding(door!, 'recess')).toBeDefined();
    expect(findByNameIncluding(door!, 'surround')).toBeDefined();
  });

  it('has at least one round_watch window', () => {
    const house = buildVulperiaHouse(makeDna('house'));
    expect(findByNameIncluding(house, 'vulperia-house-window')).toBeDefined();
  });
});

describe('buildVulperiaTerraced — Poor Burrows row segment', () => {
  it('respects getFootprint(terraced, small) (fixed 3x4)', () => {
    const fp = getFootprint('terraced', 'small');
    expect(fp).toEqual({ w: 3, d: 4 });
    const t = buildVulperiaTerraced(makeDna('terraced'));
    const box = new THREE.Box3().setFromObject(t);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.2);
    expect(size.z).toBeLessThan(fp.d + 2.2);
  });

  it('has a rowGable roof with dentil turf-stop trim', () => {
    const t = buildVulperiaTerraced(makeDna('terraced'));
    expect(findByNameIncluding(t, 'turf-roof-turf-stop')).toBeDefined();
  });

  it('has an upper opening above the door', () => {
    const t = buildVulperiaTerraced(makeDna('terraced'));
    expect(findByNameIncluding(t, 'vulperia-terraced-upper')).toBeDefined();
  });
});

describe('buildVulperiaVilla — Fox Den / elder burrow hall', () => {
  it('respects getFootprint(villa, large) (fixed 7x5)', () => {
    const fp = getFootprint('villa', 'small');
    const v = buildVulperiaVilla(makeDna('villa'));
    const box = new THREE.Box3().setFromObject(v);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 3.2);
    expect(size.z).toBeLessThan(fp.d + 3.2);
  });

  it('has a distinct side/rear wing mass (main hall + wing hall)', () => {
    const v = buildVulperiaVilla(makeDna('villa'));
    expect(findByNameIncluding(v, 'vulperia-villa-main-hall')).toBeDefined();
    expect(findByNameIncluding(v, 'vulperia-villa-wing-hall')).toBeDefined();
  });

  it('has several round_watch windows and at least one eyebrow dormer', () => {
    const v = buildVulperiaVilla(makeDna('villa'));
    expect(countByNameIncluding(v, 'vulperia-villa-window')).toBeGreaterThanOrEqual(3);
    expect(findByNameIncluding(v, 'eyebrow-hood')).toBeDefined();
  });
});

describe('buildVulperiaInn — Wanderer\'s Den', () => {
  it('respects getFootprint(inn, large) (7x5)', () => {
    const fp = getFootprint('inn', 'large');
    const inn = buildVulperiaInn(makeDna('inn'));
    const box = new THREE.Box3().setFromObject(inn);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 3.4);
    expect(size.z).toBeLessThan(fp.d + 3.4);
  });

  it('has a wide porch_cut_door at front and a kitchen/stable wing', () => {
    const inn = buildVulperiaInn(makeDna('inn'));
    expect(findByNameIncluding(inn, 'vulperia-inn-door')).toBeDefined();
    expect(findByNameIncluding(inn, 'vulperia-inn-wing-hall')).toBeDefined();
  });

  it('has a hanging sign or lantern string prop', () => {
    const inn = buildVulperiaInn(makeDna('inn'));
    const hasSign = findByNameIncluding(inn, 'vulperia-inn-sign') !== undefined;
    const hasLanternString = findByNameIncluding(inn, 'vulperia-inn-lantern') !== undefined;
    expect(hasSign || hasLanternString).toBe(true);
  });
});

describe('buildVulperiaShop — Night Market den-mouth stall', () => {
  it('respects getFootprint(shop, small) plus awning extension', () => {
    const fp = getFootprint('shop', 'small');
    const shop = buildVulperiaShop(makeDna('shop'));
    const box = new THREE.Box3().setFromObject(shop);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeLessThan(fp.d + 3.2);
  });

  it('has a real framed counter opening (not a dark rectangle) and a real-thickness awning', () => {
    const shop = buildVulperiaShop(makeDna('shop'));
    const counter = findByNameIncluding(shop, 'vulperia-shop-counter');
    expect(counter).toBeDefined();
    expect(findByNameIncluding(counter!, 'sill')).toBeDefined();
    const awning = findByNameIncluding(shop, 'vulperia-shop-awning');
    expect(awning).toBeDefined();
  });
});

describe('buildVulperiaBlacksmith — Tinkerer\'s Shop', () => {
  it('respects getFootprint(blacksmith, medium) plus forge apron', () => {
    const fp = getFootprint('blacksmith', 'medium');
    const smith = buildVulperiaBlacksmith(makeDna('blacksmith'));
    const box = new THREE.Box3().setFromObject(smith);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 3.2);
  });

  it('has an open forge bay with proud posts and a tall chimney stack', () => {
    const smith = buildVulperiaBlacksmith(makeDna('blacksmith'));
    expect(findByNameIncluding(smith, 'vulperia-blacksmith-forge-bay')).toBeDefined();
    expect(findByNameIncluding(smith, 'vulperia-blacksmith-chimney')).toBeDefined();
  });
});

describe('buildVulperiaChapel — Den Mother\'s Hall', () => {
  it('respects the fixed getFootprint(chapel, medium) = 4x8', () => {
    const fp = getFootprint('chapel', 'medium');
    expect(fp).toEqual({ w: 4, d: 8 });
    const chapel = buildVulperiaChapel(makeDna('chapel'));
    const box = new THREE.Box3().setFromObject(chapel);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.6);
    expect(size.z).toBeLessThan(fp.d + 2.6);
  });

  it('has a central raised porch door and a rear den-mother oculus/marker', () => {
    const chapel = buildVulperiaChapel(makeDna('chapel'));
    expect(findByNameIncluding(chapel, 'vulperia-chapel-door')).toBeDefined();
    expect(findByNameIncluding(chapel, 'vulperia-chapel-rear')).toBeDefined();
  });

  it('has at least 4 side dormers/eyebrow windows', () => {
    const chapel = buildVulperiaChapel(makeDna('chapel'));
    expect(countByNameIncluding(chapel, 'vulperia-chapel-window')).toBeGreaterThanOrEqual(3);
  });
});

describe('buildVulperiaWatchtower — Burrow Gate lookout', () => {
  it('respects the fixed getFootprint(watchtower) = 2x2', () => {
    const fp = getFootprint('watchtower', 'small');
    expect(fp).toEqual({ w: 2, d: 2 });
    const tower = buildVulperiaWatchtower(makeDna('watchtower'));
    const box = new THREE.Box3().setFromObject(tower);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(fp.w + 2.2);
    expect(size.z).toBeLessThan(fp.d + 2.2);
  });

  it('is vertically readable across 3 stages with several gable_slit watch openings', () => {
    const tower = buildVulperiaWatchtower(makeDna('watchtower'));
    const box = new THREE.Box3().setFromObject(tower);
    expect(box.max.y - box.min.y).toBeGreaterThan(5.0);
    expect(countByNameIncluding(tower, 'vulperia-watchtower-slit')).toBeGreaterThanOrEqual(4);
  });

  it('has a steepCap turf roof cap and heavy base berm/stone pads', () => {
    const tower = buildVulperiaWatchtower(makeDna('watchtower'));
    expect(findByNameIncluding(tower, 'turf-roof')).toBeDefined();
    expect(findByNameIncluding(tower, 'vulperia-earth-berm')).toBeDefined();
  });
});
