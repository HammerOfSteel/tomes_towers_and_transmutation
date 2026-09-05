import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BuildingDNA, BuildingSize } from '@/world/buildings/BuildingDNA';
import { factionBuildingDna } from '@/world/buildings/BuildingDNA';
import {
  SLIME_HOST_SHELL_OPTIONS_BY_KIND,
  pickSlimeHostShell,
  type SlimeHostShellDescriptor,
  type SlimeHostShellKind,
} from '@/world/buildings/slime/SlimeHostShells';

const CANONICAL_KINDS = [
  'house',
  'terraced',
  'villa',
  'inn',
  'shop',
  'blacksmith',
  'chapel',
  'watchtower',
 ] as const satisfies readonly SlimeHostShellKind[];

const SIZE_BY_KIND: Record<SlimeHostShellKind, BuildingSize> = {
  house: 'small',
  terraced: 'tiny',
  villa: 'large',
  inn: 'large',
  shop: 'small',
  blacksmith: 'medium',
  chapel: 'medium',
  watchtower: 'small',
};

const FLOORS_BY_KIND: Record<SlimeHostShellKind, 1 | 2 | 3 | 4> = {
  house: 1,
  terraced: 2,
  villa: 3,
  inn: 2,
  shop: 1,
  blacksmith: 1,
  chapel: 1,
  watchtower: 4,
};

function makeDna(kind: SlimeHostShellKind, seed = 101): BuildingDNA {
  const dna = factionBuildingDna(kind, 'slime', seed, SIZE_BY_KIND[kind], FLOORS_BY_KIND[kind]);
  if (kind === 'terraced') {
    return { ...dna, terrace: 'both' };
  }
  return dna;
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function hasNaN(root: THREE.Object3D): boolean {
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count * 3; index++) {
      if (!Number.isFinite(position.array[index])) return true;
    }
  }
  return false;
}

function countVertices(root: THREE.Object3D): number {
  return collectMeshes(root).reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
}

function hasFivePieceOpening(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse(object => {
    if (!(object instanceof THREE.Group)) return;
    const childNames = new Set(object.children.map(child => child.name));
    const hasSharedPieces = childNames.has('recess')
      && childNames.has('surround')
      && childNames.has('division');
    const isWindow = childNames.has('sill') && childNames.has('glazing');
    const isDoor = childNames.has('threshold') && childNames.has('door-leaf');
    if (hasSharedPieces && (isWindow || isDoor)) {
      found = true;
    }
  });
  return found;
}

describe('SlimeHostShells', () => {
  it('exposes a normalized host-shell table for all eight canonical kinds', () => {
    expect(Object.keys(SLIME_HOST_SHELL_OPTIONS_BY_KIND).sort()).toEqual([...CANONICAL_KINDS].sort());

    for (const kind of CANONICAL_KINDS) {
      const options = SLIME_HOST_SHELL_OPTIONS_BY_KIND[kind];
      expect(options.length).toBeGreaterThan(0);
      const total = options.reduce((sum: number, option: SlimeHostShellDescriptor) => sum + option.weight, 0);
      expect(total).toBeCloseTo(1, 3);

      for (const option of options) {
        expect(option.shellId.length).toBeGreaterThan(0);
        expect(option.sourceLabel.length).toBeGreaterThan(0);
        expect(option.weight).toBeGreaterThan(0);
        expect(typeof option.build).toBe('function');
      }
    }
  });

  it('deterministically picks a shell id and returns a callable builder', () => {
    for (const kind of CANONICAL_KINDS) {
      const first = pickSlimeHostShell(kind, 77);
      const second = pickSlimeHostShell(kind, 77);
      expect(first.shellId).toBe(second.shellId);
      expect(first.sourceLabel).toBe(second.sourceLabel);
      expect(typeof first.build).toBe('function');

      const built = first.build(makeDna(kind, 77));
      expect(built).toBeInstanceOf(THREE.Group);
    }
  });

  it('does not collapse all eight kinds onto one identical host shell id', () => {
    const selected = new Set(CANONICAL_KINDS.map(kind => pickSlimeHostShell(kind, 19).shellId));
    expect(selected.size).toBeGreaterThan(1);
  });

  it('builds every generic shell option as a non-empty finite group with a real five-piece opening', () => {
    const seen = new Set<string>();
    const genericOptions = CANONICAL_KINDS
      .flatMap(kind => SLIME_HOST_SHELL_OPTIONS_BY_KIND[kind])
      .filter(option => option.shellId.startsWith('generic-'))
      .filter(option => {
        if (seen.has(option.shellId)) return false;
        seen.add(option.shellId);
        return true;
      });

    expect(genericOptions.length).toBeGreaterThan(0);

    for (const option of genericOptions) {
      const group = option.build(makeDna(option.kind, 113));
      expect(group.name.length).toBeGreaterThan(0);
      expect(collectMeshes(group).length).toBeGreaterThan(0);
      expect(countVertices(group)).toBeGreaterThan(0);
      expect(hasNaN(group)).toBe(false);
      expect(hasFivePieceOpening(group)).toBe(true);
    }
  });

  it('roughly matches the declared selection weights across a deterministic seed sample', () => {
    const sampleSize = 5000;
    const tolerance = 0.03;

    for (const kind of CANONICAL_KINDS) {
      const counts = new Map<string, number>();
      for (let seed = 0; seed < sampleSize; seed++) {
        const picked = pickSlimeHostShell(kind, seed);
        counts.set(picked.shellId, (counts.get(picked.shellId) ?? 0) + 1);
      }

      for (const option of SLIME_HOST_SHELL_OPTIONS_BY_KIND[kind]) {
        const actual = (counts.get(option.shellId) ?? 0) / sampleSize;
        expect(actual).toBeCloseTo(option.weight, option.weight === 1 ? 6 : 1);
        expect(Math.abs(actual - option.weight)).toBeLessThanOrEqual(tolerance);
      }
    }
  });
});
