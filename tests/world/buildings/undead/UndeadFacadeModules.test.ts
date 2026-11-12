import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildCryptDoor,
  buildBarredLanternWindow,
  buildPlaqueNiche,
  buildReliquaryNiche,
  buildShoredCrack,
  buildSpoliaPatch,
  buildColumbariumBand,
} from '@/world/buildings/undead/UndeadFacadeModules';
import { buildUndeadPalette } from '@/world/buildings/undead/UndeadNecropolisPalette';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

function makeDna(): BuildingDNA {
  return {
    seed: 777,
    faction: 'undead_common',
    buildingKind: 'house',
    size: 'small',
    style: 'stone',
    condition: 'ruined',
    floors: 1,
    colors: { walls: '#5a5048', roof: '#383028', trim: '#2a2020', door: '#1a1a18' },
  } as BuildingDNA;
}

function assertFiniteGeometry(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const pos = child.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });
}

describe('buildCryptDoor', () => {
  it('iron-grille variant has an opening plus grille bars', () => {
    const palette = buildUndeadPalette(makeDna());
    const door = buildCryptDoor({ width: 0.85, height: 1.65, wallZ: 1.5, palette, variant: 'iron-grille' });
    expect(door.getObjectByName('opening')).toBeTruthy();
    expect(door.getObjectByName('grille-bars')).toBeTruthy();
    assertFiniteGeometry(door);
  });

  it('sealed-slab variant has a real recessed opening with no grille', () => {
    const palette = buildUndeadPalette(makeDna());
    const door = buildCryptDoor({ width: 0.85, height: 1.65, wallZ: 1.5, palette, variant: 'sealed-slab' });
    expect(door.getObjectByName('opening')).toBeTruthy();
    expect(door.getObjectByName('grille-bars')).toBeFalsy();
    assertFiniteGeometry(door);
  });

  it('planked-repair variant adds extra iron repair straps', () => {
    const palette = buildUndeadPalette(makeDna());
    const door = buildCryptDoor({ width: 0.85, height: 1.65, wallZ: 1.5, palette, variant: 'planked-repair', seed: 3 });
    const straps = door.children.filter((c) => c.name.startsWith('repair-strap-'));
    expect(straps.length).toBeGreaterThanOrEqual(2);
    assertFiniteGeometry(door);
  });
});

describe('buildBarredLanternWindow', () => {
  it('produces a real window opening plus grille bars', () => {
    const palette = buildUndeadPalette(makeDna());
    const win = buildBarredLanternWindow({ width: 0.45, height: 0.85, wallZ: 1.2, palette });
    expect(win.getObjectByName('opening')).toBeTruthy();
    expect(win.getObjectByName('grille-bars')).toBeTruthy();
    assertFiniteGeometry(win);
  });
});

describe('buildPlaqueNiche', () => {
  it('has a recess, a proud surround, and a proud plaque as three distinct depth layers', () => {
    const palette = buildUndeadPalette(makeDna());
    const niche = buildPlaqueNiche({ width: 0.5, height: 0.6, wallZ: 1, palette });
    const recess = niche.getObjectByName('recess')!;
    const surround = niche.getObjectByName('surround')!;
    const plaque = niche.getObjectByName('plaque')!;
    expect(recess).toBeTruthy();
    expect(surround).toBeTruthy();
    expect(plaque).toBeTruthy();
    // Plaque sits proud of the recess floor; surround sits proud of the wall.
    expect(plaque.position.z).toBeGreaterThan(recess.position.z);
    assertFiniteGeometry(niche);
  });
});

describe('buildReliquaryNiche', () => {
  it('has a recess/surround shell, a shelf, and an urn -- no flat plaque', () => {
    const palette = buildUndeadPalette(makeDna());
    const niche = buildReliquaryNiche({ width: 0.65, height: 0.8, wallZ: 1, palette });
    expect(niche.getObjectByName('shelf')).toBeTruthy();
    expect(niche.getObjectByName('reliquary-urn')).toBeTruthy();
    assertFiniteGeometry(niche);
  });
});

describe('buildShoredCrack', () => {
  it('has a crack groove plus a diagonal timber brace and foot pad', () => {
    const palette = buildUndeadPalette(makeDna());
    const shored = buildShoredCrack({ width: 1.2, height: 1.8, wallZ: 1, palette, seed: 9 });
    expect(shored.getObjectByName('crack-groove')).toBeTruthy();
    expect(shored.getObjectByName('shoring-brace')).toBeTruthy();
    expect(shored.getObjectByName('shoring-foot')).toBeTruthy();
    assertFiniteGeometry(shored);
  });
});

describe('buildSpoliaPatch', () => {
  it('produces 2-3 separate mismatched blocks standing proud of the wall plane', () => {
    const palette = buildUndeadPalette(makeDna());
    const patch = buildSpoliaPatch({ width: 1, height: 0.8, wallZ: 1, palette, seed: 4 });
    const blocks = patch.children.filter((c) => c.name.startsWith('spolia-block-'));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks.length).toBeLessThanOrEqual(3);
    for (const block of blocks) {
      expect(block.position.z).toBeGreaterThan(1); // proud of wallZ=1
    }
    assertFiniteGeometry(patch);
  });
});

describe('buildColumbariumBand', () => {
  it('tiles a grid of named niche cells', () => {
    const palette = buildUndeadPalette(makeDna());
    const band = buildColumbariumBand({ width: 1.8, height: 1.2, wallZ: 1, palette, rows: 2, cols: 3 });
    const cells = band.children.filter((c) => c.name.startsWith('columbarium-cell-'));
    expect(cells.length).toBe(6);
    assertFiniteGeometry(band);
  });
});
