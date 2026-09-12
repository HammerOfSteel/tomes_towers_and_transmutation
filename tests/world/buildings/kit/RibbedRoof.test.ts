/**
 * RibbedRoof.test.ts — hide roof archetypes (docs/superpowers/specs/
 * 2026-09-04-orcish-buildings-design.md section 5:
 * `[SHARED KIT] RibbedRoof.ts`/`HideRoof.ts`: "yurt domes, conical hide
 * caps, longhouse gables, awnings, and smoke crowns built from ribs +
 * panels"). Every roof surface must show real ribs/rafters BEFORE the
 * hide skin (doctrine Rule 3: a smooth cone/dome roof with no visible
 * ribs is a banned blob), consuming `LashedTimber` (ribs/rafters) and
 * `HidePanel` (sagging skin) rather than a flat/smooth primitive.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildConicalHideRoof,
  buildDomedHideRoof,
  buildLonghouseHideRoof,
  buildRibbedAwning,
} from '@/world/buildings/kit/RibbedRoof';

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

function countByNameIncluding(root: THREE.Object3D, needle: string): number {
  let n = 0;
  root.traverse((o) => { if (o.name && o.name.includes(needle)) n++; });
  return n;
}

/** Triangle count under the (exact-named) subgroup `groupName` -- used to
 * confirm "more instances" for rib/bay/rafter subgroups that are merged
 * via `mergeGroupMeshesByMaterial()` into one draw-call mesh per material,
 * which collapses their individual per-instance names (mirrors the same
 * fix applied to LashedTimber.test.ts's `buildPostFrame` assertions). */
function triCountInSubgroup(root: THREE.Object3D, groupName: string): number {
  const sub = root.getObjectByName(groupName);
  if (!sub) return 0;
  let t = 0;
  sub.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const geo = (o as THREE.Mesh).geometry;
      t += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    }
  });
  return t;
}

function boundsOf(root: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(root);
}

const hide = new THREE.MeshStandardMaterial({ color: '#3a2818' });
const rib = new THREE.MeshStandardMaterial({ color: '#4a3826' });

describe('buildConicalHideRoof', () => {
  it('builds a ring of ribs converging to an apex, with hide bay panels between them', () => {
    // Ribs/bays share one material each and are merged into a single
    // draw-call mesh per subgroup, so assert via triangle-count scaling
    // with ribCount (proportional to instance count), not raw mesh count.
    const few = buildConicalHideRoof({ baseRadius: 2.2, apexHeight: 1.8, ribCount: 4, seed: 3, hideMaterial: hide, ribMaterial: rib });
    const many = buildConicalHideRoof({ baseRadius: 2.2, apexHeight: 1.8, ribCount: 8, seed: 3, hideMaterial: hide, ribMaterial: rib });
    expect(triCountInSubgroup(many, 'roof-ribs')).toBeGreaterThan(triCountInSubgroup(few, 'roof-ribs'));
    expect(triCountInSubgroup(many, 'roof-hide-bays')).toBeGreaterThan(triCountInSubgroup(few, 'roof-hide-bays'));
    expect(triCountInSubgroup(many, 'roof-ribs')).toBeGreaterThan(0);
    expect(triCountInSubgroup(many, 'roof-hide-bays')).toBeGreaterThan(0);
  });

  it('apex sits well above the base ring (real height, not flat)', () => {
    const roofGroup = buildConicalHideRoof({ baseRadius: 2.2, apexHeight: 1.8, ribCount: 8, seed: 3, hideMaterial: hide, ribMaterial: rib });
    const box = boundsOf(roofGroup);
    expect(box.max.y - box.min.y).toBeGreaterThan(1.5);
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildConicalHideRoof({ baseRadius: 2.2, apexHeight: 1.8, ribCount: 8, seed: 3, hideMaterial: hide, ribMaterial: rib }))).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const a = buildConicalHideRoof({ baseRadius: 2.2, apexHeight: 1.8, ribCount: 8, seed: 3, hideMaterial: hide, ribMaterial: rib });
    const b = buildConicalHideRoof({ baseRadius: 2.2, apexHeight: 1.8, ribCount: 8, seed: 3, hideMaterial: hide, ribMaterial: rib });
    expect(boundsOf(a).max).toEqual(boundsOf(b).max);
  });
});

describe('buildDomedHideRoof', () => {
  it('builds ribs to a crown ring plus a rounded cap above it (two-stage silhouette)', () => {
    const few = buildDomedHideRoof({ baseRadius: 2.4, height: 2.0, ribCount: 6, seed: 7, hideMaterial: hide, ribMaterial: rib });
    const many = buildDomedHideRoof({ baseRadius: 2.4, height: 2.0, ribCount: 11, seed: 7, hideMaterial: hide, ribMaterial: rib });
    expect(triCountInSubgroup(many, 'roof-ribs')).toBeGreaterThan(triCountInSubgroup(few, 'roof-ribs'));
    expect(countByNameIncluding(many, 'crown-ring')).toBeGreaterThanOrEqual(1);
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildDomedHideRoof({ baseRadius: 2.4, height: 2.0, ribCount: 11, seed: 7, hideMaterial: hide, ribMaterial: rib }))).toBe(false);
  });

  it('exposes a crown socket anchor for a finial/spike prop', () => {
    const roofGroup = buildDomedHideRoof({ baseRadius: 2.4, height: 2.0, ribCount: 11, seed: 7, hideMaterial: hide, ribMaterial: rib });
    const socket = roofGroup.getObjectByName('crown-socket');
    expect(socket).toBeDefined();
  });
});

describe('buildLonghouseHideRoof', () => {
  it('builds rafters on both slopes plus two hide panes and a ridge cap', () => {
    const roofGroup = buildLonghouseHideRoof({
      width: 5, length: 7, wallTopY: 5.6, ridgeHeight: 1.2, rafterCount: 9, seed: 4, hideMaterial: hide, ribMaterial: rib,
    });
    // Rafters share one material and are merged into a single draw-call
    // mesh, so assert their presence/scaling via triangle count.
    const fewer = buildLonghouseHideRoof({
      width: 5, length: 7, wallTopY: 5.6, ridgeHeight: 1.2, rafterCount: 4, seed: 4, hideMaterial: hide, ribMaterial: rib,
    });
    expect(triCountInSubgroup(roofGroup, 'roof-rafters')).toBeGreaterThan(triCountInSubgroup(fewer, 'roof-rafters'));
    expect(triCountInSubgroup(roofGroup, 'roof-rafters')).toBeGreaterThan(0);
    expect(countByNameIncluding(roofGroup, 'roof-hide-pane')).toBe(2);
    expect(countByNameIncluding(roofGroup, 'ridge-cap')).toBeGreaterThanOrEqual(1);
  });

  it('rafter tails overhang past the eave (silhouette break, not flush)', () => {
    const roofGroup = buildLonghouseHideRoof({
      width: 5, length: 7, wallTopY: 5.6, ridgeHeight: 1.2, rafterCount: 9, seed: 4, hideMaterial: hide, ribMaterial: rib, overhang: 0.35,
    });
    const box = boundsOf(roofGroup);
    expect(box.max.x).toBeGreaterThan(2.5 + 0.2);
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildLonghouseHideRoof({
      width: 5, length: 7, wallTopY: 5.6, ridgeHeight: 1.2, rafterCount: 9, seed: 4, hideMaterial: hide, ribMaterial: rib,
    }))).toBe(false);
  });
});

describe('buildRibbedAwning', () => {
  it('builds rib poles under a single sagging hide pane with a thickened front edge', () => {
    const fewer = buildRibbedAwning({
      width: 2.0, depth: 1.4, frontHeight: 2.2, backHeight: 2.6, ribCount: 2, seed: 9, hideMaterial: hide, ribMaterial: rib,
    });
    const awning = buildRibbedAwning({
      width: 2.0, depth: 1.4, frontHeight: 2.2, backHeight: 2.6, ribCount: 4, seed: 9, hideMaterial: hide, ribMaterial: rib,
    });
    // Ribs share one material and are merged into a single draw-call mesh.
    expect(triCountInSubgroup(awning, 'awning-ribs')).toBeGreaterThan(triCountInSubgroup(fewer, 'awning-ribs'));
    expect(triCountInSubgroup(awning, 'awning-ribs')).toBeGreaterThan(0);
    expect(countByNameIncluding(awning, 'awning-hide')).toBeGreaterThanOrEqual(1);
    expect(countByNameIncluding(awning, 'awning-edge-return')).toBeGreaterThanOrEqual(1);
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildRibbedAwning({
      width: 2.0, depth: 1.4, frontHeight: 2.2, backHeight: 2.6, ribCount: 4, seed: 9, hideMaterial: hide, ribMaterial: rib,
    }))).toBe(false);
  });
});
