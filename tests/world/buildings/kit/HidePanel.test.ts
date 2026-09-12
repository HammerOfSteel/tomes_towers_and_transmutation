/**
 * HidePanel.test.ts — framed stretched-hide panels (docs/superpowers/specs/
 * 2026-09-04-orcish-buildings-design.md section 5: `[SHARED KIT]
 * HidePanel.ts`/`StretchedSkin.ts`). Doctrine requirement: "ribs first,
 * skin second" -- a smooth cone/dome with no visible frame is a banned
 * blob (doctrine Rule 3), so every panel must expose real proud ribs, a
 * skin set back/separate from them, genuine sag between ribs, and
 * thickened free edges (Rule 3's "extruded thickness + chamfer/return on
 * every free edge").
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHidePanel, buildRibbedHideWall } from '@/world/buildings/kit/HidePanel';
import { rectangleFaces } from '@/world/buildings/StoneTowerShape';

function hasNaN(root: THREE.Object3D): boolean {
  let bad = false;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const pos = (o as THREE.Mesh).geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) if (!Number.isFinite(pos.array[i])) bad = true;
    }
  });
  return bad;
}

function findAllByNameIncluding(root: THREE.Object3D, needle: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name && o.name.includes(needle)) found.push(o); });
  return found;
}

describe('buildHidePanel', () => {
  const skin = new THREE.MeshStandardMaterial({ color: '#4a3020' });
  const rib = new THREE.MeshStandardMaterial({ color: '#3a2c1a' });

  it('has at least two proud ribs', () => {
    const panel = buildHidePanel({ width: 2, height: 1.6, skinMaterial: skin, ribMaterial: rib });
    const ribs = findAllByNameIncluding(panel, 'rib');
    expect(ribs.length).toBeGreaterThanOrEqual(2);
  });

  it('ribs sit proud of the skin plane (frame first, skin second)', () => {
    const panel = buildHidePanel({ width: 2, height: 1.6, skinMaterial: skin, ribMaterial: rib });
    const ribs = findAllByNameIncluding(panel, 'rib');
    const skinMesh = findAllByNameIncluding(panel, 'skin')[0]!;
    const ribZ = (ribs[0] as THREE.Mesh).position.z;
    const skinBox = new THREE.Box3().setFromObject(skinMesh);
    // Rib's local z (proud offset) must be greater than the skin's own max z
    // (skin sits at/behind z=0, ribs stand out in front of it).
    expect(ribZ).toBeGreaterThan(skinBox.max.z - 0.001);
  });

  it('the skin sags between ribs (not a flat coplanar plane)', () => {
    const panel = buildHidePanel({ width: 2, height: 1.6, sag: 0.08, skinMaterial: skin, ribMaterial: rib });
    const skinMesh = findAllByNameIncluding(panel, 'skin')[0] as THREE.Mesh;
    const pos = skinMesh.geometry.attributes.position;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minZ = Math.min(minZ, pos.getZ(i));
      maxZ = Math.max(maxZ, pos.getZ(i));
    }
    // Real curvature: the sagged surface must have meaningfully varying z,
    // not a uniform flat plane.
    expect(maxZ - minZ).toBeGreaterThan(0.04);
  });

  it('has thickened/chamfered free edges (edge-return geometry), not a bare flat plane', () => {
    const panel = buildHidePanel({ width: 2, height: 1.6, skinMaterial: skin, ribMaterial: rib });
    const edges = findAllByNameIncluding(panel, 'edge-return');
    expect(edges.length).toBeGreaterThan(0);
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildHidePanel({ width: 2, height: 1.6, skinMaterial: skin, ribMaterial: rib }))).toBe(false);
  });

  it('honours ribCount (more ribs -> more rib meshes)', () => {
    const few = buildHidePanel({ width: 2, height: 1.6, ribCount: 2, skinMaterial: skin, ribMaterial: rib });
    const many = buildHidePanel({ width: 2, height: 1.6, ribCount: 5, skinMaterial: skin, ribMaterial: rib });
    expect(findAllByNameIncluding(many, 'rib').length).toBeGreaterThan(findAllByNameIncluding(few, 'rib').length);
  });
});

describe('buildRibbedHideWall', () => {
  const skin = new THREE.MeshStandardMaterial({ color: '#4a3020' });
  const rib = new THREE.MeshStandardMaterial({ color: '#3a2c1a' });
  const faces = rectangleFaces(2, 1.5);

  it('builds one ribbed hide panel per face', () => {
    const wall = buildRibbedHideWall(faces, 1.8, 5, skin, rib);
    expect(findAllByNameIncluding(wall, 'skin').length).toBe(faces.length);
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildRibbedHideWall(faces, 1.8, 5, skin, rib))).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const w1 = buildRibbedHideWall(faces, 1.8, 5, skin, rib);
    const w2 = buildRibbedHideWall(faces, 1.8, 5, skin, rib);
    expect(findAllByNameIncluding(w1, 'rib').length).toBe(findAllByNameIncluding(w2, 'rib').length);
  });
});
