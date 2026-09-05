import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BuildingDNA, BuildingSize } from '@/world/buildings/BuildingDNA';
import { FLOOR_HEIGHT, factionBuildingDna, getFootprint } from '@/world/buildings/BuildingDNA';
import { pickSlimeHostShell, type SlimeHostShellKind } from '@/world/buildings/slime/SlimeHostShells';
import { buildSlimeHouse, buildSlimeTerraced } from '@/world/buildings/slime/SlimeBuildingKit';

const SIZE_BY_KIND: Record<'house' | 'terraced', BuildingSize> = {
  house: 'small',
  terraced: 'tiny',
};

const FLOORS_BY_KIND: Record<'house' | 'terraced', 1 | 2> = {
  house: 1,
  terraced: 2,
};

function makeDna(kind: 'house' | 'terraced', seed: number): BuildingDNA {
  const dna = factionBuildingDna(kind, 'slime', seed, SIZE_BY_KIND[kind], FLOORS_BY_KIND[kind]);
  if (kind === 'terraced') return { ...dna, terrace: 'both' };
  return dna;
}

function findSeed(
  kind: SlimeHostShellKind,
  predicate: (shell: ReturnType<typeof pickSlimeHostShell>) => boolean,
): number {
  for (let seed = 1; seed < 2048; seed++) {
    const shell = pickSlimeHostShell(kind, seed);
    if (predicate(shell)) return seed;
  }
  throw new Error(`No seed found for ${kind}`);
}

function findVariantSeed(
  kind: 'house' | 'terraced',
  predicate: (group: THREE.Group) => boolean,
): number {
  for (let seed = 1; seed < 4096; seed++) {
    const group = kind === 'house'
      ? buildSlimeHouse(makeDna(kind, seed))
      : buildSlimeTerraced(makeDna(kind, seed));
    if (predicate(group)) return seed;
  }
  throw new Error(`No variant seed found for ${kind}`);
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function hasOnlyFinitePositions(root: THREE.Object3D): boolean {
  return collectMeshes(root).every(mesh => {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count * 3; index++) {
      if (!Number.isFinite(position.array[index])) return false;
    }
    return true;
  });
}

function collectGroups(root: THREE.Object3D, predicate: (group: THREE.Group) => boolean): THREE.Group[] {
  const groups: THREE.Group[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Group && predicate(object)) groups.push(object);
  });
  return groups;
}

function collectNamedGroups(root: THREE.Object3D, prefix: string): THREE.Group[] {
  return collectGroups(root, group => group.name.startsWith(prefix));
}

function requireGroup<T extends THREE.Object3D = THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  expect(object, `${name} should exist`).toBeTruthy();
  return object as T;
}

function openingOverlayCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse(object => {
    if (typeof object.userData.overlayType === 'string') count++;
    else if (typeof object.userData.overlayRole === 'string' && object.userData.overlayRole.includes('opening')) count++;
  });
  return count;
}

function hostBox(root: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(requireGroup(root, 'slime-host-shell'));
}

const HOUSE_SEED = findSeed('house', shell => shell.isGenericShell);
const HOUSE_REUSED_HOST_SEED = findSeed('house', shell => !shell.isGenericShell);
const HOUSE_DORMER_SEED = findVariantSeed('house', group => group.userData.kindVariation?.halfLoftDormer === true);
const TERRACED_SEED = findSeed('terraced', shell => shell.isGenericShell);
const TERRACED_MULTI_BAY_SEED = findVariantSeed('terraced', group => group.userData.kindVariation?.rowLength !== 'single-lot');
const TERRACED_ALLEY_BRIDGE_SEED = findVariantSeed('terraced', group => group.userData.kindVariation?.circulation === 'alley-puddle-bridge');
const TERRACED_STAIR_SEED = findVariantSeed('terraced', group => group.userData.kindVariation?.specialBay === 'exposed-stair-remnant');
const TERRACED_SIGN_SEED = findVariantSeed('terraced', group => group.userData.kindVariation?.specialBay === 'small-sign-bracket');
const TERRACED_ROOF_GAP_SEED = findVariantSeed('terraced', group => group.userData.kindVariation?.partyWallCondition === 'roof-gap-between-units');

describe('SlimeResidential', () => {
  it('builds finite residential groups with distinct footprint proportions and shared slime overlays', () => {
    const house = buildSlimeHouse(makeDna('house', HOUSE_SEED));
    const terraced = buildSlimeTerraced(makeDna('terraced', TERRACED_SEED));

    for (const group of [house, terraced]) {
      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.children.length).toBeGreaterThan(0);
      expect(collectMeshes(group).length).toBeGreaterThan(0);
      expect(hasOnlyFinitePositions(group)).toBe(true);
      expect(collectGroups(group, candidate => candidate.userData.moduleType === 'puddle-skirt-tiles').length).toBeGreaterThan(0);
      expect(openingOverlayCount(group)).toBeGreaterThan(0);
    }

    const houseFootprint = getFootprint('house', 'small');
    const terracedFootprint = getFootprint('terraced', 'tiny');
    const houseSize = hostBox(house).getSize(new THREE.Vector3());
    const terracedSize = hostBox(terraced).getSize(new THREE.Vector3());

    expect(houseFootprint.w).toBeGreaterThan(terracedFootprint.w);
    expect(houseFootprint.d).toBeLessThan(terracedFootprint.d);
    expect(houseSize.x).toBeGreaterThan(terracedSize.x);
    expect(houseSize.z).toBeLessThan(terracedSize.z);
  });

  it('gives houses one primary door, cottage-scale windows, a door puddle path, and cottage props', () => {
    const house = buildSlimeHouse(makeDna('house', HOUSE_SEED));
    const host = requireGroup(house, 'slime-host-shell');
    const doors = collectNamedGroups(host, 'door-opening-');
    const windows = collectNamedGroups(host, 'window-opening-');

    expect(doors).toHaveLength(1);
    expect(windows.length).toBeGreaterThanOrEqual(1);

    const windowBoxes = windows.map(window => new THREE.Box3().setFromObject(window));
    const widestWindow = Math.max(...windowBoxes.map(box => box.max.x - box.min.x));
    const tallestWindow = Math.max(...windowBoxes.map(box => box.max.y - box.min.y));
    expect(widestWindow).toBeLessThanOrEqual(0.85);
    expect(tallestWindow).toBeLessThanOrEqual(1.15);

    const path = requireGroup(house, 'house-door-puddle-path');
    const pathBox = new THREE.Box3().setFromObject(path);
    const box = hostBox(house);
    expect(pathBox.max.z).toBeGreaterThan(box.max.z + 0.08);
    expect(pathBox.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(pathBox.max.y).toBeLessThanOrEqual(0.12);

    expect(requireGroup(house, 'house-ooze-pebbles')).toBeTruthy();
    expect(requireGroup(house, 'house-crate-shelf')).toBeTruthy();
    expect(requireGroup(house, 'house-core-lantern')).toBeTruthy();
  });

  it('gives terraced houses two storeys, party-wall markers, and row-base detailing', () => {
    const terraced = buildSlimeTerraced(makeDna('terraced', TERRACED_SEED));
    const host = requireGroup(terraced, 'slime-host-shell');
    const size = hostBox(terraced).getSize(new THREE.Vector3());

    expect(size.y).toBeGreaterThan(FLOOR_HEIGHT * 1.8);

    const upperWindows = collectNamedGroups(host, 'window-opening-').filter(window => {
      const box = new THREE.Box3().setFromObject(window);
      return box.min.y >= FLOOR_HEIGHT;
    });
    expect(upperWindows.length).toBeGreaterThanOrEqual(2);

    expect(requireGroup(terraced, 'terraced-base-gutter')).toBeTruthy();
    expect(requireGroup(terraced, 'terraced-party-wall-marker-left')).toBeTruthy();
    expect(requireGroup(terraced, 'terraced-party-wall-marker-right')).toBeTruthy();
  });

  it('keeps house props on or above ground even when the reused host shell hangs below the root origin', () => {
    const house = buildSlimeHouse(makeDna('house', HOUSE_REUSED_HOST_SEED));

    for (const name of [
      'house-door-puddle-path',
      'house-ooze-pebbles',
      'house-crate-shelf',
      'house-core-lantern',
    ]) {
      const box = new THREE.Box3().setFromObject(requireGroup(house, name));
      expect(box.min.y, `${name} should not sink below ground`).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it('adds a dormer remnant when the house variation rolls a half-loft survivor', () => {
    const house = buildSlimeHouse(makeDna('house', HOUSE_DORMER_SEED));
    expect(house.userData.kindVariation.halfLoftDormer).toBe(true);
    expect(requireGroup(house, 'house-dormer-remnant')).toBeTruthy();
  });

  it('adds extra bay illusions when terraced rows roll multi-bay frontage', () => {
    const terraced = buildSlimeTerraced(makeDna('terraced', TERRACED_MULTI_BAY_SEED));
    const rowLength = terraced.userData.kindVariation.rowLength as string;
    const extraBays = collectGroups(terraced, group => group.name.startsWith('terraced-row-bay-'));

    expect(rowLength).not.toBe('single-lot');
    expect(extraBays.length).toBe(rowLength === 'three-bay-illusion' ? 2 : 1);
  });

  it('realizes terraced circulation and special-bay rolls with explicit extra geometry', () => {
    const bridgeRow = buildSlimeTerraced(makeDna('terraced', TERRACED_ALLEY_BRIDGE_SEED));
    expect(bridgeRow.userData.kindVariation.circulation).toBe('alley-puddle-bridge');
    expect(requireGroup(bridgeRow, 'terraced-alley-puddle-bridge')).toBeTruthy();

    const stairRow = buildSlimeTerraced(makeDna('terraced', TERRACED_STAIR_SEED));
    expect(stairRow.userData.kindVariation.specialBay).toBe('exposed-stair-remnant');
    expect(requireGroup(stairRow, 'terraced-stair-remnant')).toBeTruthy();

    const plaqueRow = buildSlimeTerraced(makeDna('terraced', TERRACED_SIGN_SEED));
    expect(plaqueRow.userData.kindVariation.specialBay).toBe('small-sign-bracket');
    expect(requireGroup(plaqueRow, 'terraced-address-plaque')).toBeTruthy();
  });

  it('adds an explicit roof-gap read when terraced rows roll a gap between units', () => {
    const terraced = buildSlimeTerraced(makeDna('terraced', TERRACED_ROOF_GAP_SEED));
    expect(terraced.userData.kindVariation.partyWallCondition).toBe('roof-gap-between-units');
    expect(requireGroup(terraced, 'terraced-roof-gap-marker')).toBeTruthy();
  });
});
