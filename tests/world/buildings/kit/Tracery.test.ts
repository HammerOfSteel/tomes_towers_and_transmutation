import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { finishArchitecturalGeometry, trimExtrudeSettings } from '../../../../src/world/buildings/kit/Bevels';

async function loadTraceryModule() {
  return import('../../../../src/world/buildings/kit/Tracery');
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function assertFiniteGeometry(root: THREE.Object3D): void {
  for (const mesh of collectMeshes(root)) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(Number.isFinite(positions.getX(i))).toBe(true);
      expect(Number.isFinite(positions.getY(i))).toBe(true);
      expect(Number.isFinite(positions.getZ(i))).toBe(true);
    }
  }
}

function signedTriangleVolume(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  return a.dot(b.clone().cross(c)) / 6;
}

function meshVolume(mesh: THREE.Mesh): number {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i)).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, index.getX(i + 1)).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, index.getX(i + 2)).applyMatrix4(mesh.matrixWorld);
      volume += signedTriangleVolume(a, b, c);
    }
    return Math.abs(volume);
  }

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, i + 1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, i + 2).applyMatrix4(mesh.matrixWorld);
    volume += signedTriangleVolume(a, b, c);
  }

  return Math.abs(volume);
}

function objectVolume(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  return collectMeshes(root).reduce((sum, mesh) => sum + meshVolume(mesh), 0);
}

function buildSolidDiscVolume(radius: number, depth: number): number {
  const circle = new THREE.Shape();
  circle.absarc(0, 0, radius, 0, Math.PI * 2);
  const geometry = finishArchitecturalGeometry(new THREE.ExtrudeGeometry(circle, {
    ...trimExtrudeSettings(depth / 2),
    depth,
    bevelEnabled: true,
    steps: 1,
    curveSegments: 48,
  }));
  geometry.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  return meshVolume(mesh);
}

function signature(root: THREE.Object3D): string[] {
  root.updateMatrixWorld(true);
  return collectMeshes(root)
    .map((mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      return [
        mesh.name,
        mesh.position.x.toFixed(4),
        mesh.position.y.toFixed(4),
        mesh.position.z.toFixed(4),
        mesh.rotation.x.toFixed(4),
        mesh.rotation.y.toFixed(4),
        mesh.rotation.z.toFixed(4),
        size.x.toFixed(4),
        size.y.toFixed(4),
        size.z.toFixed(4),
      ].join(':');
    })
    .sort();
}

function brokenFragments(root: THREE.Object3D): THREE.Mesh[] {
  return collectMeshes(root).filter((mesh) => mesh.userData.role === 'broken-tracery-fragment');
}

describe('Tracery kit', () => {
  it('builds a pierced trefoil stone frame rather than a solid disc', async () => {
    const { buildTrefoil } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#b8b1a2' });
    const trefoil = buildTrefoil(0.8, { material });
    const box = new THREE.Box3().setFromObject(trefoil).getSize(new THREE.Vector3());

    expect(trefoil.name).toBe('trefoil');
    expect(collectMeshes(trefoil)).toHaveLength(1);
    expect(collectMeshes(trefoil)[0]!.material).toBe(material);
    assertFiniteGeometry(trefoil);
    expect(objectVolume(trefoil)).toBeLessThan(buildSolidDiscVolume(0.8, box.z) * 0.82);
  });

  it('builds a pierced quatrefoil stone frame rather than a solid disc', async () => {
    const { buildQuatrefoil } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#b8b1a2' });
    const quatrefoil = buildQuatrefoil(0.85, { material });
    const box = new THREE.Box3().setFromObject(quatrefoil).getSize(new THREE.Vector3());

    expect(quatrefoil.name).toBe('quatrefoil');
    expect(collectMeshes(quatrefoil)).toHaveLength(1);
    expect(collectMeshes(quatrefoil)[0]!.material).toBe(material);
    assertFiniteGeometry(quatrefoil);
    expect(objectVolume(quatrefoil)).toBeLessThan(buildSolidDiscVolume(0.85, box.z) * 0.8);
  });

  it('builds a pierced rose window with named rings and spokes that all share one material reference', async () => {
    const { buildRoseWindow } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#9da2aa' });
    const rose = buildRoseWindow({ lobes: 8, radius: 1, ringCount: 2 }, material);
    const ringParts = rose.children.filter((child) => /^ring-\d+$/.test(child.name));
    const spokeParts = rose.children.filter((child) => /^spoke-\d+$/.test(child.name));
    const depth = new THREE.Box3().setFromObject(rose).getSize(new THREE.Vector3()).z;

    expect(ringParts).toHaveLength(2);
    expect(spokeParts).toHaveLength(8);
    expect(spokeParts.map((part) => part.name).sort()).toEqual([
      'spoke-0',
      'spoke-1',
      'spoke-2',
      'spoke-3',
      'spoke-4',
      'spoke-5',
      'spoke-6',
      'spoke-7',
    ]);

    for (const mesh of collectMeshes(rose)) {
      expect(mesh.material).toBe(material);
    }

    assertFiniteGeometry(rose);
    expect(objectVolume(rose)).toBeLessThan(buildSolidDiscVolume(1, depth) * 0.72);
  });

  it('keeps rose-window geometry finite for common Gothic lobe counts', async () => {
    const { buildRoseWindow } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#8f96a0' });

    for (const lobes of [6, 8, 12]) {
      const rose = buildRoseWindow({ lobes, radius: 1, ringCount: 3 }, material);
      expect(rose.children.filter((child) => /^spoke-\d+$/.test(child.name))).toHaveLength(lobes);
      assertFiniteGeometry(rose);
    }
  });

  it('emits optional broken tracery fragments while the default build stays intact', async () => {
    const { buildRoseWindow } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#8a8f98' });
    const options = { lobes: 8, radius: 1, ringCount: 3 };

    const intact = buildRoseWindow(options, material);
    const broken = buildRoseWindow({ ...options, brokenEmission: true, seed: 19 }, material);

    expect(brokenFragments(intact)).toHaveLength(0);
    expect(brokenFragments(broken).length).toBeGreaterThan(0);
    expect(signature(broken)).not.toEqual(signature(intact));

    for (const fragment of brokenFragments(broken)) {
      expect(fragment.material).toBe(material);
    }
  });

  it('selects the same broken segments for the same seed and different ones for a different seed', async () => {
    const { buildRoseWindow } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#8a8f98' });
    const options = { lobes: 8, radius: 1, ringCount: 3, brokenEmission: true };

    const roseA = buildRoseWindow({ ...options, seed: 3 }, material);
    const roseB = buildRoseWindow({ ...options, seed: 3 }, material);
    const roseC = buildRoseWindow({ ...options, seed: 11 }, material);

    const brokenNamesA = brokenFragments(roseA).map((mesh) => mesh.name).sort();
    const brokenNamesB = brokenFragments(roseB).map((mesh) => mesh.name).sort();
    const brokenNamesC = brokenFragments(roseC).map((mesh) => mesh.name).sort();

    expect(signature(roseA)).toEqual(signature(roseB));
    expect(brokenNamesA).toEqual(brokenNamesB);
    expect(signature(roseC)).not.toEqual(signature(roseA));
    expect(brokenNamesC).not.toEqual(brokenNamesA);
  });
});
