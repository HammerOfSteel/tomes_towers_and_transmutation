/**
 * TileBuilder.test.ts — TV-3 (builder)
 * buildTile builds all 5 categories without throwing.
 */

import { describe, it, expect } from 'vitest';
import { buildTile } from '@/procedural/TileBuilder';
import { makeTileDNA } from '@/procedural/TileDNA';
import type { TileCategory } from '@/procedural/TileDNA';
import * as THREE from 'three';

const CATEGORIES: TileCategory[] = ['ground', 'wall', 'ceiling', 'feature', 'transition'];

describe('buildTile — all categories', () => {
  for (const category of CATEGORIES) {
    it(`builds ${category} without throwing`, () => {
      const dna = makeTileDNA('grassland', 'lush', 1, { category });
      const built = buildTile(dna);
      expect(built.root).toBeInstanceOf(THREE.Group);
      expect(built.dna).toBe(dna);
      expect(typeof built.dispose).toBe('function');
      expect(built.root.children.length).toBeGreaterThan(0);
    });
  }

  it('dispose() releases geometry/material without throwing', () => {
    const built = buildTile(makeTileDNA('dungeon_stone', 'mossy', 2));
    expect(() => built.dispose()).not.toThrow();
  });

  it('applies dna.roughness to the material when present', () => {
    const dna = makeTileDNA('desert', 'sand', 3, { roughness: 0.2 });
    const built = buildTile(dna);
    const mesh = built.root.children[0] as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.roughness).toBe(0.2);
  });

  it('honours colorOverride over the palette default', () => {
    const dna = makeTileDNA('grassland', 'lush', 1, { colorOverride: '#ff00ff' });
    const built = buildTile(dna);
    const mesh = built.root.children[0] as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(`#${mat.color.getHexString()}`).toBe('#ff00ff');
  });

  it('scales geometry footprint with dna.size', () => {
    const small = buildTile(makeTileDNA('grassland', 'lush', 1, { size: 1 }));
    const large = buildTile(makeTileDNA('grassland', 'lush', 1, { size: 4 }));
    const smallMesh = small.root.children[0] as THREE.Mesh;
    const largeMesh = large.root.children[0] as THREE.Mesh;
    smallMesh.geometry.computeBoundingBox();
    largeMesh.geometry.computeBoundingBox();
    const smallSize = smallMesh.geometry.boundingBox!.max.x - smallMesh.geometry.boundingBox!.min.x;
    const largeSize = largeMesh.geometry.boundingBox!.max.x - largeMesh.geometry.boundingBox!.min.x;
    expect(largeSize).toBeGreaterThan(smallSize);
  });
});
