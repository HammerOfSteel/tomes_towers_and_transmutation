import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFaeGrounding } from '@/world/buildings/fae/FaeGrounding';
import { rectanglePoints, type OctagonFace, rectangleFaces } from '@/world/buildings/StoneTowerShape';

function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color });
}

function countMeshes(group: THREE.Object3D): number {
  let n = 0;
  group.traverse((o) => { if (o instanceof THREE.Mesh) n++; });
  return n;
}

function allVerticesFinite(group: THREE.Object3D): boolean {
  let ok = true;
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) ok = false;
    }
  });
  return ok;
}

describe('buildFaeGrounding — root-flare foundation at terrain contact', () => {
  const points = rectanglePoints(2, 1.5);
  const faces: OctagonFace[] = rectangleFaces(2, 1.5);

  function build(seed = 3, stepsFace?: OctagonFace) {
    return buildFaeGrounding({
      points,
      rootMaterial: mat('#5a4530'),
      mossMaterial: mat('#3d6b30'),
      stoneMaterial: mat('#8a8a86'),
      seed,
      stepsFace,
    });
  }

  it('exposes a root plinth course, a root flare, moss pads, and embedded stones', () => {
    const g = build();
    expect(g.getObjectByName('fae-plinth-course')).toBeTruthy();
    expect(g.getObjectByName('fae-root-flare')).toBeTruthy();
    expect(g.getObjectByName('fae-moss-pads')).toBeTruthy();
    expect(g.getObjectByName('fae-embedded-stones')).toBeTruthy();
    // Each named layer is merged down to one draw call per material
    // (mergeGroupMeshesByMaterial), so the count is small by design --
    // the doctrine-relevant check is that all distinct layers exist.
    expect(countMeshes(g)).toBeGreaterThanOrEqual(4);
  });

  it('the root flare sits at or below y=0 (ground level), never floating above it', () => {
    const g = build();
    const flare = g.getObjectByName('fae-root-flare')!;
    const box = new THREE.Box3().setFromObject(flare);
    expect(box.min.y).toBeLessThanOrEqual(0.02);
  });

  it('all vertex positions are finite', () => {
    expect(allVerticesFinite(build())).toBe(true);
  });

  it('every mesh carries a uv attribute (guards the merge-drop bug class)', () => {
    const g = build();
    let ok = true;
    g.traverse((o) => { if (o instanceof THREE.Mesh && !o.geometry.getAttribute('uv')) ok = false; });
    expect(ok).toBe(true);
  });

  it('adds named front steps when stepsFace is provided', () => {
    const g = build(3, faces[0]);
    expect(g.getObjectByName('fae-front-steps')).toBeTruthy();
  });

  it('two different seeds produce different root-flare mesh geometry (not a single deterministic blob)', () => {
    const a = build(1);
    const b = build(99);
    const flareA = a.getObjectByName('fae-root-flare')!;
    const flareB = b.getObjectByName('fae-root-flare')!;
    let meshA: THREE.Mesh | undefined;
    let meshB: THREE.Mesh | undefined;
    flareA.traverse((o) => { if (!meshA && o instanceof THREE.Mesh) meshA = o; });
    flareB.traverse((o) => { if (!meshB && o instanceof THREE.Mesh) meshB = o; });
    expect(meshA).toBeTruthy();
    expect(meshB).toBeTruthy();
    const posA = meshA!.geometry.getAttribute('position');
    const posB = meshB!.geometry.getAttribute('position');
    let identical = posA.count === posB.count;
    if (identical) {
      for (let i = 0; i < posA.count; i++) {
        if (posA.getX(i) !== posB.getX(i) || posA.getY(i) !== posB.getY(i) || posA.getZ(i) !== posB.getZ(i)) {
          identical = false;
          break;
        }
      }
    }
    expect(identical).toBe(false);
  });
});
