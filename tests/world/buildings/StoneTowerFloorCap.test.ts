/**
 * StoneTowerFloorCap.test.ts — the filled octagon disc primitive that
 * bridges tower-kit ring boundaries (docs/superpowers/specs/
 * 2026-09-04-tower-kit-floor-caps-and-roof-variety-design.md).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFloorCap } from '@/world/buildings/StoneTowerFloorCap';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';

function mat(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#888' });
}

describe('buildFloorCap', () => {
  it('builds a mesh named elven-tower-floor-cap with a face normal pointing +Y', () => {
    const cap = buildFloorCap(2, mat());
    expect(cap.name).toBe('elven-tower-floor-cap');
    cap.geometry.computeVertexNormals();
    const normals = cap.geometry.attributes.normal;
    expect(normals).toBeDefined();
    for (let i = 0; i < normals.count; i++) {
      expect(normals.getY(i)).toBeGreaterThan(0.9);
    }
  });

  it('lies flat at y=0 with all vertices within the given radius', () => {
    const cap = buildFloorCap(3, mat());
    const pos = cap.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBe(0);
      const dist = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(dist).toBeLessThanOrEqual(3 + 1e-6);
    }
  });

  it('has no NaN vertices and at least 8 triangles (one per octagon edge)', () => {
    const cap = buildFloorCap(1.5, mat());
    const pos = cap.geometry.attributes.position;
    for (let i = 0; i < pos.count * 3; i++) {
      expect(Number.isFinite(pos.array[i])).toBe(true);
    }
    const index = cap.geometry.getIndex();
    expect(index).not.toBeNull();
    expect(index!.count / 3).toBeGreaterThanOrEqual(8);
  });

  it('follows per-corner vertexScales jitter, matching octagonPoints()', () => {
    const scales = [1, 1, 1, 1, 1, 1, 1, 1.5]; // corner 7 pushed further out
    const cap = buildFloorCap(2, mat(), scales);
    const pos = cap.geometry.attributes.position;
    let maxDist = 0;
    for (let i = 0; i < pos.count; i++) {
      maxDist = Math.max(maxDist, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    expect(maxDist).toBeGreaterThan(2.9); // corner 7 at radius*1.5 = 3.0
  });

  it('has a uv attribute (2 components per vertex) matching every other tower-kit primitive', () => {
    // Regression guard: a missing uv attribute here caused
    // mergeGeometries() (called by mergeGroupMeshesByMaterial(), see the
    // dedicated regression test below) to fail silently whenever this
    // mesh shared a material bucket with uv-having geometry (every
    // other tower-kit primitive -- BoxGeometry wall blocks, quoins,
    // ExtrudeGeometry entrance -- all have uv) -- a real bug caught only
    // via live Playwright verification (affected buildings lost their
    // ENTIRE wall, not just the floor cap, since a failed merge drops
    // the whole material bucket, see MeshMergeUtils.ts).
    const cap = buildFloorCap(2, mat());
    const uv = cap.geometry.attributes.uv;
    expect(uv).toBeDefined();
    expect(uv.itemSize).toBe(2);
    expect(uv.count).toBe(cap.geometry.attributes.position.count);
  });

  it('merges cleanly via mergeGroupMeshesByMaterial() alongside uv-having geometry sharing the same material (regression guard)', () => {
    const sharedMat = mat();
    const g = new THREE.Group();
    const cap = buildFloorCap(2, sharedMat);
    g.add(cap);
    // A standard primitive that (like every real tower-kit wall block)
    // has position+normal+uv attributes, sharing the SAME material
    // reference -- this is exactly the scenario StoneTowerKit.ts's
    // buildTowerWallRing()/buildTowerBase() create (floor cap + wall
    // blocks + quoins, all on palette.stone), which
    // SettlementRenderer.ts later runs through this exact merge.
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sharedMat);
    g.add(box);

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
    try {
      mergeGroupMeshesByMaterial(g);
    } finally {
      console.error = originalError;
    }

    expect(errors).toEqual([]);
    // A successful merge leaves exactly one merged mesh (the floor cap
    // and box's own original meshes are pruned/disposed either way --
    // the real regression symptom was the merge FAILING and dropping
    // the whole bucket with nothing left in its place).
    const meshes = g.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(meshes.length).toBe(1);
    expect(meshes[0]!.geometry.attributes.position.count).toBeGreaterThan(0);
  });
});
