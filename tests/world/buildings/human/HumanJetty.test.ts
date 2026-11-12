import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHumanJetty } from '@/world/buildings/human/HumanJetty';

function makeMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#4a2818' });
}

describe('buildHumanJetty', () => {
  it('projects the bressummer/joists past the lower wall by 0.28-0.45 WU and returns a matching facadeOffset', () => {
    const timber = makeMaterial();
    const { group, facadeOffset } = buildHumanJetty({
      width: 3.6,
      floorY: 3.2,
      seed: 4,
      timberMaterial: timber,
    });

    expect(facadeOffset).toBeGreaterThanOrEqual(0.28);
    expect(facadeOffset).toBeLessThanOrEqual(0.45);

    const bressummer = group.getObjectByName('bressummer') as THREE.Mesh;
    expect(bressummer).toBeTruthy();
    const box = new THREE.Box3().setFromObject(bressummer);
    expect(box.max.z).toBeCloseTo(facadeOffset, 2);

    // Real exposed joist-end stubs, not implied by the bressummer alone.
    const joists = group.getObjectByName('joist')!;
    expect(joists.children.filter((c) => c.name.startsWith('joist-')).length).toBeGreaterThanOrEqual(2);
    const firstJoist = joists.children.find((c) => c.name.startsWith('joist-')) as THREE.Mesh;
    const joistBox = new THREE.Box3().setFromObject(firstJoist);
    // Joist ends poke out PAST the bressummer's own front face.
    expect(joistBox.max.z).toBeGreaterThan(box.max.z);
  });

  it('spaces joist ends within the doctrine 0.28-0.40 WU range', () => {
    const timber = makeMaterial();
    const { group } = buildHumanJetty({ width: 3.2, floorY: 3.2, seed: 9, timberMaterial: timber });
    const joists = group.getObjectByName('joist')!;
    const xs = joists.children.filter((c) => c.name.startsWith('joist-')).map((c) => c.position.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      const spacing = xs[i]! - xs[i - 1]!;
      expect(spacing).toBeGreaterThanOrEqual(0.2);
      expect(spacing).toBeLessThanOrEqual(0.42);
    }
  });

  it('emits corbel brackets and corner knee braces as real diagonal geometry, not a flat plane', () => {
    const timber = makeMaterial();
    const { group } = buildHumanJetty({ width: 3.6, floorY: 3.2, seed: 12, timberMaterial: timber });
    const joists = group.getObjectByName('joist')!;
    const corbels = joists.children.filter((c) => c.name.startsWith('corbel-'));
    expect(corbels.length).toBeGreaterThan(0);

    const kneeGroup = group.getObjectByName('knee-brace')!;
    expect(kneeGroup.children.length).toBe(2);
    for (const brace of kneeGroup.children) {
      expect(brace.rotation.x).not.toBe(0);
    }
  });

  it('includes a dark underside shadow board spanning the projected depth', () => {
    const timber = makeMaterial();
    const { group, facadeOffset } = buildHumanJetty({ width: 3.6, floorY: 3.2, seed: 3, timberMaterial: timber });
    const shadowBoard = group.getObjectByName('shadow-board') as THREE.Mesh;
    expect(shadowBoard).toBeTruthy();
    const box = new THREE.Box3().setFromObject(shadowBoard);
    expect(box.max.z - box.min.z).toBeCloseTo(facadeOffset, 2);
  });

  it('is deterministic for the same seed', () => {
    const timber = makeMaterial();
    const build = () => buildHumanJetty({ width: 3.6, floorY: 3.2, seed: 77, timberMaterial: timber });
    const flatten = (g: THREE.Object3D) => {
      const out: number[] = [];
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh) out.push(obj.position.x, obj.position.y, obj.position.z);
      });
      return out;
    };
    expect(flatten(build().group)).toEqual(flatten(build().group));
  });
});
