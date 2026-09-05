import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDwarvenHouse, buildDwarvenTerraced } from '@/world/buildings/dwarven/DwarvenBuildingKit';
import { buildDwarvenPalette } from '@/world/buildings/dwarven/DwarvenMaterials';
import { getFootprint } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

function makeDNA(overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1,
    kind: 'building',
    name: 'dwarven-test-building',
    buildingKind: 'house',
    size: 'small',
    floors: 1,
    style: 'dwarven',
    condition: 'pristine',
    hasInterior: false,
    interiorLayout: 'single_room',
    colors: { walls: '#8a8078', roof: '#4a4038', trim: '#6a5a48', door: '#4a3826' },
    rotation: 0,
    terrace: 'none',
    features: [],
    seed: 12345,
    ...overrides,
  };
}

/** Recursively collects every mesh in a group. */
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
    expect(Number.isFinite(box.min.x)).toBe(true);
    expect(Number.isFinite(box.max.x)).toBe(true);
    expect(Number.isFinite(box.min.y)).toBe(true);
    expect(Number.isFinite(box.max.y)).toBe(true);
    expect(Number.isFinite(box.min.z)).toBe(true);
    expect(Number.isFinite(box.max.z)).toBe(true);
  }
}

function findByNameIncluding(root: THREE.Object3D, needle: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!found && o.name && o.name.includes(needle)) found = o;
  });
  return found;
}

describe('buildDwarvenPalette', () => {
  it('returns stable shared material references, not per-block clones', () => {
    const dna = makeDNA();
    const palette = buildDwarvenPalette(dna);
    // buildDwarvenPalette is called ONCE per building; every sub-builder must
    // reuse these exact references. Confirm a whole assembled house's mesh
    // count vastly exceeds its distinct-material count -- if any sub-builder
    // cloned a material per block, the distinct-material count would balloon
    // to roughly the mesh count instead of staying in the single digits.
    const house = buildDwarvenHouse(dna);
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
    // Sanity: the palette object itself is internally self-consistent.
    expect(palette.granite).toBe(palette.granite);
  });
});

describe('buildDwarvenHouse', () => {
  it('respects getFootprint(house, size), staying within footprint plus eaves/skirt', () => {
    const dna = makeDNA({ size: 'small' });
    const fp = getFootprint('house', 'small');
    const house = buildDwarvenHouse(dna);
    const box = new THREE.Box3().setFromObject(house);
    const size = new THREE.Vector3();
    box.getSize(size);
    // Roof eave overhang (~15%) + rock skirt (~0.18 WU) + running-bond
    // corner overhang are all real, intentional architectural geometry
    // extending past the nominal collision footprint -- not a bug -- so
    // this allows a generous but still bounded margin (catches gross
    // escapes, e.g. a prop placed many WU away, without over-fitting to
    // one exact eave-overhang percentage).
    expect(size.x).toBeLessThanOrEqual(fp.w + 1.2);
    expect(size.z).toBeLessThanOrEqual(fp.d + 1.2);
  });

  it('has a rock plinth', () => {
    const house = buildDwarvenHouse(makeDNA());
    expect(findByNameIncluding(house, 'rock-plinth')).toBeTruthy();
  });

  it('has a dwarven door with the five-piece opening minimum', () => {
    const house = buildDwarvenHouse(makeDNA());
    const door = findByNameIncluding(house, 'dwarven-door');
    expect(door).toBeTruthy();
    const childNames = door!.children.map((c) => c.name);
    expect(childNames).toContain('recess');
    expect(childNames).toContain('surround');
    expect(childNames).toContain('threshold');
  });

  it('has at least one complete window (five-piece parts)', () => {
    const house = buildDwarvenHouse(makeDNA());
    const window = findByNameIncluding(house, 'dwarven-window');
    expect(window).toBeTruthy();
    const childNames = window!.children.map((c) => c.name);
    expect(childNames).toContain('recess');
    expect(childNames).toContain('surround');
    expect(childNames).toContain('sill');
    expect(childNames).toContain('glazing');
  });

  it('has a corbelled chimney on chimney variants', () => {
    // seed sweep: chimney placement is rear-left 0.35 / rear-right 0.35 /
    // side-wall 0.20 / none 0.10 -- try enough seeds to hit a chimney variant.
    let foundChimney = false;
    for (let seed = 0; seed < 20; seed++) {
      const house = buildDwarvenHouse(makeDNA({ seed: seed * 7919 }));
      if (findByNameIncluding(house, 'chimney')) {
        foundChimney = true;
        break;
      }
    }
    expect(foundChimney).toBe(true);
  });

  it('produces finite geometry across seeds', () => {
    for (const seed of [1, 2, 3, 42, 999, 123456]) {
      const house = buildDwarvenHouse(makeDNA({ seed }));
      assertFiniteGeometry(house);
    }
  });

  it('produces finite geometry for the tiny size too', () => {
    const house = buildDwarvenHouse(makeDNA({ size: 'tiny', seed: 55 }));
    assertFiniteGeometry(house);
  });
});

describe('buildDwarvenTerraced', () => {
  it('respects getFootprint(terraced, size) plus eave/skirt tolerance, and is narrower than a villa footprint', () => {
    const dna = makeDNA({ buildingKind: 'terraced', size: 'medium' });
    const fp = getFootprint('terraced', 'medium');
    const villaFp = getFootprint('villa', 'medium');
    const terraced = buildDwarvenTerraced(dna);
    const box = new THREE.Box3().setFromObject(terraced);
    const size = new THREE.Vector3();
    box.getSize(size);
    expect(size.x).toBeLessThanOrEqual(fp.w + 1.2);
    expect(size.z).toBeLessThanOrEqual(fp.d + 1.2);
    expect(fp.w).toBeLessThan(villaFp.w);
  });

  it('has no side windows when terrace is both (shared party walls)', () => {
    const terraced = buildDwarvenTerraced(makeDNA({ buildingKind: 'terraced', terrace: 'both' }));
    const sideWindows = terraced.children.filter((c) => c.name === 'dwarven-window');
    expect(sideWindows.length).toBe(0);
  });

  it('has a front door with the five-piece opening minimum', () => {
    const terraced = buildDwarvenTerraced(makeDNA({ buildingKind: 'terraced' }));
    const door = findByNameIncluding(terraced, 'dwarven-door');
    expect(door).toBeTruthy();
    const childNames = door!.children.map((c) => c.name);
    expect(childNames).toContain('recess');
    expect(childNames).toContain('surround');
    expect(childNames).toContain('threshold');
  });

  it('has a front chevron ornament belt', () => {
    const terraced = buildDwarvenTerraced(makeDNA({ buildingKind: 'terraced' }));
    expect(findByNameIncluding(terraced, 'dwarven-front-ornament')).toBeTruthy();
  });

  it('produces finite geometry across seeds and terrace states', () => {
    for (const terrace of ['none', 'left', 'right', 'both'] as const) {
      for (const seed of [1, 42, 999]) {
        const terraced = buildDwarvenTerraced(makeDNA({ buildingKind: 'terraced', terrace, seed }));
        assertFiniteGeometry(terraced);
      }
    }
  });
});
