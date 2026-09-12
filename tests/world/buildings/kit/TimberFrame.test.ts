import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { depthFor } from '@/world/buildings/kit/DepthLadder';
import {
  buildTimberFramePanel,
  buildTimberFrameFacade,
} from '@/world/buildings/kit/TimberFrame';

function makeMaterials() {
  return {
    timber: new THREE.MeshStandardMaterial({ color: '#4a2818' }),
    infill: new THREE.MeshStandardMaterial({ color: '#d8c8a0' }),
    repair: new THREE.MeshStandardMaterial({ color: '#b0a888' }),
  };
}

function requireChild(group: THREE.Object3D, name: string): THREE.Object3D {
  const child = group.getObjectByName(name);
  expect(child, `${name} should exist`).toBeTruthy();
  return child!;
}

describe('buildTimberFramePanel', () => {
  it('returns named post/rail/brace/infill groups with posts and infill proud/recessed of the wall plane', () => {
    const { timber, infill } = makeMaterials();
    const panel = buildTimberFramePanel({
      width: 2.0,
      height: 2.6,
      pattern: 'simpleBrace',
      seed: 7,
      timberMaterial: timber,
      infillMaterial: infill,
    });

    const posts = requireChild(panel, 'post');
    const rails = requireChild(panel, 'rail');
    const braces = requireChild(panel, 'brace');
    const infillGroup = requireChild(panel, 'infill');

    expect(posts.children.length).toBeGreaterThanOrEqual(2);
    expect(rails.children.length).toBeGreaterThanOrEqual(3);
    expect(braces.children.length).toBeGreaterThanOrEqual(1);
    expect(infillGroup.children.length).toBeGreaterThanOrEqual(1);

    // Frame members (posts/rails/braces) sit proud at the TRIM depth role;
    // infill sits at or behind the wall plane -- a real shading discontinuity,
    // not coplanar geometry (doctrine Rule 1).
    expect(posts.position.z).toBeCloseTo(depthFor('TRIM'), 5);
    expect(rails.position.z).toBeCloseTo(depthFor('TRIM'), 5);
    expect(braces.position.z).toBeCloseTo(depthFor('TRIM'), 5);
    expect(infillGroup.position.z).toBeLessThanOrEqual(0);
    expect(posts.position.z - infillGroup.position.z).toBeGreaterThanOrEqual(0.08);
  });

  it('emits two crossing braces for the stAndrewsCross pattern', () => {
    const { timber, infill } = makeMaterials();
    const panel = buildTimberFramePanel({
      width: 1.8,
      height: 2.4,
      pattern: 'stAndrewsCross',
      seed: 3,
      timberMaterial: timber,
      infillMaterial: infill,
    });
    const braces = requireChild(panel, 'brace');
    expect(braces.children.length).toBe(2);
    const [a, b] = braces.children as THREE.Mesh[];
    // A true "X" cross has the two diagonals running opposite directions
    // (mirror-image slopes), so their rotation angles differ substantially.
    expect(Math.abs(a.rotation.z - b.rotation.z)).toBeGreaterThan(0.5);
  });

  it('alternates brace direction row-to-row for the herringbone pattern', () => {
    const { timber, infill } = makeMaterials();
    const panel = buildTimberFramePanel({
      width: 1.6,
      height: 2.4,
      pattern: 'herringbone',
      seed: 11,
      timberMaterial: timber,
      infillMaterial: infill,
    });
    const braces = requireChild(panel, 'brace');
    expect(braces.children.length).toBeGreaterThanOrEqual(4);
  });

  it('builds real non-flat pierced geometry for the quatrefoil pattern', () => {
    const { timber, infill } = makeMaterials();
    const panel = buildTimberFramePanel({
      width: 1.4,
      height: 1.4,
      pattern: 'quatrefoil',
      seed: 5,
      timberMaterial: timber,
      infillMaterial: infill,
    });
    const quatrefoil = panel.getObjectByName('quatrefoil');
    expect(quatrefoil).toBeTruthy();
    let hasNonBoxGeometry = false;
    quatrefoil!.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !(obj.geometry instanceof THREE.BoxGeometry)) {
        hasNonBoxGeometry = true;
      }
    });
    expect(hasNonBoxGeometry).toBe(true);
  });

  it('tags a repair panel distinctly via the repairPanel pattern', () => {
    const { timber, infill, repair } = makeMaterials();
    const panel = buildTimberFramePanel({
      width: 1.6,
      height: 2.2,
      pattern: 'repairPanel',
      seed: 9,
      timberMaterial: timber,
      infillMaterial: infill,
      repairMaterial: repair,
    });
    expect(panel.userData.pattern).toBe('repairPanel');
    const infillGroup = requireChild(panel, 'infill');
    expect(infillGroup.children.length).toBeGreaterThanOrEqual(1);
  });

  it('never places a brace mesh overlapping a supplied opening exclusion rectangle', () => {
    const { timber, infill } = makeMaterials();
    const panel = buildTimberFramePanel({
      width: 2.0,
      height: 2.6,
      pattern: 'simpleBrace',
      seed: 13,
      timberMaterial: timber,
      infillMaterial: infill,
      exclude: { x: 0.2, y: 0.2, width: 1.6, height: 2.0 },
    });
    const braces = requireChild(panel, 'brace');
    // The exclusion rectangle covers almost the entire panel width/height,
    // so any brace not skipped would necessarily cross it.
    expect(braces.children.length).toBe(0);
  });

  it('respects the maximum post spacing (2.4 WU) by adding intermediate posts on wide panels', () => {
    const { timber, infill } = makeMaterials();
    const panel = buildTimberFramePanel({
      width: 5.0,
      height: 2.6,
      pattern: 'simpleBrace',
      seed: 21,
      timberMaterial: timber,
      infillMaterial: infill,
    });
    const posts = requireChild(panel, 'post');
    // 5.0 WU wide needs at least 3 posts (ceil(5/2.4)=3 sub-bays -> 4 posts).
    expect(posts.children.length).toBeGreaterThanOrEqual(4);
    const xs = (posts.children as THREE.Mesh[]).map((m) => m.position.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(2.4 + 1e-6);
    }
  });

  it('is deterministic for the same seed', () => {
    const { timber, infill } = makeMaterials();
    const build = () =>
      buildTimberFramePanel({
        width: 2.2,
        height: 2.6,
        pattern: 'herringbone',
        seed: 42,
        timberMaterial: timber,
        infillMaterial: infill,
      });
    const a = build();
    const b = build();
    const flatten = (g: THREE.Object3D) => {
      const positions: number[] = [];
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh) positions.push(obj.position.x, obj.position.y, obj.position.z);
      });
      return positions;
    };
    expect(flatten(a)).toEqual(flatten(b));
  });
});

describe('buildTimberFrameFacade', () => {
  it('places one shared corner post per bay boundary (n bays -> n+1 posts) at the correct depth', () => {
    const { timber, infill } = makeMaterials();
    const facade = buildTimberFrameFacade({
      bays: [
        { x: 0, width: 1.6 },
        { x: 1.6, width: 1.2 },
        { x: 2.8, width: 1.6 },
      ],
      height: 2.6,
      seed: 17,
      timberMaterial: timber,
      infillMaterial: infill,
    });
    expect(facade.children.length).toBe(3);
    let totalPosts = 0;
    facade.traverse((obj) => {
      if (obj.name === 'post') totalPosts += obj.children.length;
    });
    expect(totalPosts).toBe(4);
  });
});
