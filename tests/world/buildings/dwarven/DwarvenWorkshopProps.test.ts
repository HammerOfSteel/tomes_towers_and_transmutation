import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDwarvenPalette } from '@/world/buildings/dwarven/DwarvenMaterials';
import { getFootprint } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';
import {
  buildBellows,
  buildQuenchTrough,
  buildAnvil,
  buildOreCoalBin,
  buildToolRack,
} from '@/world/buildings/dwarven/DwarvenWorkshopProps';

function makeDNA(overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1,
    kind: 'building',
    name: 'dwarven-test-building',
    buildingKind: 'blacksmith',
    size: 'medium',
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

/** A "bare placeholder primitive" reads as a single unnamed/generically-
 * named mesh with no siblings -- every real prop assembly here must have
 * multiple distinctly-named parts. */
function assertMultiPartNamedAssembly(group: THREE.Group, minParts: number): void {
  expect(group.children.length).toBeGreaterThanOrEqual(minParts);
  const names = new Set(group.children.map((c) => c.name));
  expect(names.size).toBe(group.children.length); // every part has a distinct name
  for (const name of names) {
    expect(name).toBeTruthy();
    expect(name).not.toMatch(/^(mesh|object3d|group)_?\d*$/i);
  }
}

describe('buildBellows', () => {
  it('is a multi-part named assembly: backboard, two bellows plates, hinge axle, straps, nozzle', () => {
    const palette = buildDwarvenPalette(makeDNA());
    const bellows = buildBellows({ width: 0.6, height: 0.8, seed: 1 }, palette);
    assertMultiPartNamedAssembly(bellows, 5);
    const names = bellows.children.map((c) => c.name);
    expect(names).toContain('bellows-backboard');
    expect(names).toContain('bellows-plate-a');
    expect(names).toContain('bellows-plate-b');
    expect(names).toContain('bellows-hinge-axle');
    expect(names).toContain('bellows-nozzle');
  });

  it('produces finite geometry', () => {
    const palette = buildDwarvenPalette(makeDNA());
    for (const seed of [1, 2, 42]) {
      assertFiniteGeometry(buildBellows({ width: 0.6, height: 0.8, seed }, palette));
    }
  });
});

describe('buildQuenchTrough', () => {
  it('is a multi-part named assembly: rim walls, water plane, drain slot, tongs rack', () => {
    const palette = buildDwarvenPalette(makeDNA());
    const trough = buildQuenchTrough({ width: 0.9, depth: 0.35, height: 0.35, seed: 1 }, palette);
    assertMultiPartNamedAssembly(trough, 4);
    const names = trough.children.map((c) => c.name);
    expect(names.some((n) => n.startsWith('trough-wall'))).toBe(true);
    expect(names).toContain('trough-water');
    expect(names).toContain('trough-drain');
    expect(names).toContain('tongs-rack');
  });

  it('produces finite geometry', () => {
    const palette = buildDwarvenPalette(makeDNA());
    for (const seed of [1, 2, 42]) {
      assertFiniteGeometry(buildQuenchTrough({ width: 0.9, depth: 0.35, height: 0.35, seed }, palette));
    }
  });
});

describe('buildAnvil', () => {
  it('is a multi-part named assembly: horn, waist, base', () => {
    const palette = buildDwarvenPalette(makeDNA());
    const anvil = buildAnvil({ seed: 1 }, palette);
    assertMultiPartNamedAssembly(anvil, 3);
    const names = anvil.children.map((c) => c.name);
    expect(names).toContain('anvil-horn');
    expect(names).toContain('anvil-waist');
    expect(names).toContain('anvil-base');
  });

  it('produces finite geometry', () => {
    const palette = buildDwarvenPalette(makeDNA());
    assertFiniteGeometry(buildAnvil({ seed: 1 }, palette));
  });
});

describe('buildOreCoalBin', () => {
  it('is a multi-part named assembly: planked crate, straps, and individual chunks', () => {
    const palette = buildDwarvenPalette(makeDNA());
    const bin = buildOreCoalBin({ width: 0.5, depth: 0.4, height: 0.3, seed: 1 }, palette);
    assertMultiPartNamedAssembly(bin, 3);
    const names = bin.children.map((c) => c.name);
    expect(names).toContain('bin-crate');
    expect(names.some((n) => n.startsWith('bin-chunk'))).toBe(true);
  });

  it('produces finite geometry across seeds', () => {
    const palette = buildDwarvenPalette(makeDNA());
    for (const seed of [1, 2, 42]) {
      assertFiniteGeometry(buildOreCoalBin({ width: 0.5, depth: 0.4, height: 0.3, seed }, palette));
    }
  });
});

describe('buildToolRack', () => {
  it('is a multi-part named assembly: posts, rail, and hanging tools', () => {
    const palette = buildDwarvenPalette(makeDNA());
    const rack = buildToolRack({ width: 0.8, height: 1.0, seed: 1 }, palette);
    assertMultiPartNamedAssembly(rack, 3);
  });

  it('produces finite geometry', () => {
    const palette = buildDwarvenPalette(makeDNA());
    assertFiniteGeometry(buildToolRack({ width: 0.8, height: 1.0, seed: 1 }, palette));
  });
});

describe('sanity: blacksmith footprint constant', () => {
  it('matches the design spec (5x4 WU)', () => {
    const fp = getFootprint('blacksmith', 'medium');
    expect(fp.w).toBe(5);
    expect(fp.d).toBe(4);
  });
});
