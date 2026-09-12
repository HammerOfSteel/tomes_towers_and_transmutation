import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVulperiaGrounding } from '@/world/buildings/vulperia/VulperiaGrounding';
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

describe('buildVulperiaGrounding — berm/skirt at terrain contact', () => {
  const points = rectanglePoints(2, 1.5);
  const faces: OctagonFace[] = rectangleFaces(2, 1.5);

  it('exposes a stone plinth course, an earth berm, and a grass berm cap', () => {
    const g = buildVulperiaGrounding({
      points,
      stoneMaterial: mat('#5a5048'),
      earthMaterial: mat('#4a3520'),
      grassMaterial: mat('#3d6b35'),
      seed: 3,
    });
    expect(g.getObjectByName('vulperia-plinth-course')).toBeTruthy();
    expect(g.getObjectByName('vulperia-earth-berm')).toBeTruthy();
    expect(g.getObjectByName('vulperia-grass-berm-cap')).toBeTruthy();
    // Each named layer is merged down to one draw call per material
    // (mergeGroupMeshesByMaterial), so the count is small by design --
    // the doctrine-relevant check is that all three distinct layers exist.
    expect(countMeshes(g)).toBeGreaterThanOrEqual(3);
  });

  it('the berm sits at or below y=0 (ground level), never floating above it', () => {
    const g = buildVulperiaGrounding({
      points, stoneMaterial: mat('#5a5048'), earthMaterial: mat('#4a3520'), grassMaterial: mat('#3d6b35'), seed: 3,
    });
    const berm = g.getObjectByName('vulperia-earth-berm')!;
    const box = new THREE.Box3().setFromObject(berm);
    expect(box.min.y).toBeLessThanOrEqual(0.02);
  });

  it('all vertex positions are finite', () => {
    const g = buildVulperiaGrounding({
      points, stoneMaterial: mat('#5a5048'), earthMaterial: mat('#4a3520'), grassMaterial: mat('#3d6b35'), seed: 3,
    });
    expect(allVerticesFinite(g)).toBe(true);
  });

  it('every mesh carries a uv attribute (guards the merge-drop bug class)', () => {
    const g = buildVulperiaGrounding({
      points, stoneMaterial: mat('#5a5048'), earthMaterial: mat('#4a3520'), grassMaterial: mat('#3d6b35'), seed: 3,
    });
    let ok = true;
    g.traverse((o) => { if (o instanceof THREE.Mesh && !o.geometry.getAttribute('uv')) ok = false; });
    expect(ok).toBe(true);
  });

  it('adds named front steps when stepsFace is provided', () => {
    const g = buildVulperiaGrounding({
      points, stoneMaterial: mat('#5a5048'), earthMaterial: mat('#4a3520'), grassMaterial: mat('#3d6b35'), seed: 3,
      stepsFace: faces[0],
    });
    expect(g.getObjectByName('vulperia-front-steps')).toBeTruthy();
  });

  it('two different seeds produce different berm mesh geometry (not a single deterministic blob)', () => {
    const a = buildVulperiaGrounding({ points, stoneMaterial: mat('#5a5048'), earthMaterial: mat('#4a3520'), grassMaterial: mat('#3d6b35'), seed: 1 });
    const b = buildVulperiaGrounding({ points, stoneMaterial: mat('#5a5048'), earthMaterial: mat('#4a3520'), grassMaterial: mat('#3d6b35'), seed: 99 });
    // Layers are merged per-material (mergeGroupMeshesByMaterial bakes
    // world transforms into vertices and resets .position to origin), so
    // compare the merged geometry's own vertex data instead of mesh
    // transforms to confirm the seeded jitter actually varies output.
    const bermA = a.getObjectByName('vulperia-earth-berm')!;
    const bermB = b.getObjectByName('vulperia-earth-berm')!;
    let meshA: THREE.Mesh | undefined;
    let meshB: THREE.Mesh | undefined;
    bermA.traverse((o) => { if (!meshA && o instanceof THREE.Mesh) meshA = o; });
    bermB.traverse((o) => { if (!meshB && o instanceof THREE.Mesh) meshB = o; });
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
