import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGothicArchShape } from '../../../../src/world/buildings/kit/GothicArch';

async function loadBuildVoussoirArch() {
  const module = await import('../../../../src/world/buildings/kit/VoussoirArch');
  return module.buildVoussoirArch as (options: Record<string, unknown>) => THREE.Group;
}

async function loadVoussoirArchModule() {
  return import('../../../../src/world/buildings/kit/VoussoirArch');
}

function collectMeshes(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
}

function highestPoint(points: THREE.Vector2[]): THREE.Vector2 {
  return points.reduce((best, point) => (point.y > best.y ? point : best), points[0]!);
}

function frontFaceZ(mesh: THREE.Mesh): number {
  mesh.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(mesh).max.z;
}

function signature(group: THREE.Group): string[] {
  group.updateMatrixWorld(true);
  return collectMeshes(group)
    .map((mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      return [
        mesh.name,
        mesh.position.x.toFixed(4),
        mesh.position.y.toFixed(4),
        mesh.position.z.toFixed(4),
        mesh.rotation.z.toFixed(4),
        size.x.toFixed(4),
        size.y.toFixed(4),
        size.z.toFixed(4),
      ].join(':');
    })
    .sort();
}

function collectBrokenMeshes(group: THREE.Group): THREE.Mesh[] {
  return collectMeshes(group).filter((mesh) => mesh.userData.role === 'broken-voussoir');
}

describe('buildVoussoirArch', () => {
  it('matches GothicArch curve metrics for the same span, spring line, and arch ratio', async () => {
    const module = await loadVoussoirArchModule();
    const gothicShape = buildGothicArchShape({ width: 2.4, springHeight: 1.5, archRatio: 1.1 });
    const gothicApex = highestPoint(gothicShape.getPoints(128));
    const metrics = module.getArchMetrics(2.4, 1.1);
    const leftArc = gothicShape.curves.find((curve) => curve instanceof THREE.EllipseCurve);

    expect(leftArc).toBeInstanceOf(THREE.EllipseCurve);
    if (!(leftArc instanceof THREE.EllipseCurve)) return;

    expect(leftArc.aX).toBeCloseTo(metrics.centerOffset, 10);
    expect(leftArc.aY).toBeCloseTo(1.5, 10);
    expect(leftArc.xRadius).toBeCloseTo(metrics.radius, 10);
    expect(leftArc.yRadius).toBeCloseTo(metrics.radius, 10);
    expect(Math.PI - leftArc.aEndAngle).toBeCloseTo(metrics.halfSweep, 10);
    expect(1.5 + metrics.rise).toBeCloseTo(gothicApex.y, 1);
  });

  it('builds separate left and right voussoirs plus one proud keystone sharing the same material reference', async () => {
    const buildVoussoirArch = await loadBuildVoussoirArch();
    const material = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

    const arch = buildVoussoirArch({
      width: 2.4,
      springHeight: 1.5,
      archRatio: 1.1,
      voussoirCount: 4,
      radialThickness: 0.28,
      blockDepth: 0.18,
      depth: 0.04,
      keystoneProud: 0.03,
      material,
      seed: 7,
    });

    const meshes = collectMeshes(arch);
    expect(meshes).toHaveLength(9);
    expect(meshes.map((mesh) => mesh.name).sort()).toEqual([
      'keystone',
      'voussoir-left-0',
      'voussoir-left-1',
      'voussoir-left-2',
      'voussoir-left-3',
      'voussoir-right-0',
      'voussoir-right-1',
      'voussoir-right-2',
      'voussoir-right-3',
    ]);
    expect(new Set(meshes.map((mesh) => mesh.uuid)).size).toBe(meshes.length);

    for (const mesh of meshes) {
      expect(mesh.material).toBe(material);
    }

    const keystone = arch.getObjectByName('keystone');
    const leftTop = arch.getObjectByName('voussoir-left-3');
    const rightTop = arch.getObjectByName('voussoir-right-3');
    expect(keystone).toBeInstanceOf(THREE.Mesh);
    expect(leftTop).toBeInstanceOf(THREE.Mesh);
    expect(rightTop).toBeInstanceOf(THREE.Mesh);
    if (!(keystone instanceof THREE.Mesh) || !(leftTop instanceof THREE.Mesh) || !(rightTop instanceof THREE.Mesh)) return;

    const flankFront = (frontFaceZ(leftTop) + frontFaceZ(rightTop)) / 2;
    expect(frontFaceZ(keystone) - flankFront).toBeCloseTo(0.03, 2);
  });

  it('keeps all geometry finite across representative arch parameters', async () => {
    const buildVoussoirArch = await loadBuildVoussoirArch();
    const material = new THREE.MeshStandardMaterial({ color: '#b2b7be' });

    const variants = [
      { width: 1.8, springHeight: 1.2, archRatio: 0.5, voussoirCount: 3, seed: 1 },
      { width: 2.6, springHeight: 1.6, archRatio: 1.0, voussoirCount: 5, seed: 2 },
      { width: 1.3, springHeight: 0.9, archRatio: 1.7, voussoirCount: 4, seed: 3 },
      { width: 1.4, springHeight: 1.0, archRatio: 0.3, voussoirCount: 4, seed: 4 },
    ];

    for (const variant of variants) {
      const arch = buildVoussoirArch({
        ...variant,
        radialThickness: 0.24,
        blockDepth: 0.15,
        material,
      });
      arch.updateMatrixWorld(true);

      for (const mesh of collectMeshes(arch)) {
        const positions = mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          expect(Number.isFinite(positions.getX(i))).toBe(true);
          expect(Number.isFinite(positions.getY(i))).toBe(true);
          expect(Number.isFinite(positions.getZ(i))).toBe(true);
        }
      }
    }
  });

  it('omits the keystone first and then removes upper voussoirs before lower springers as survival falls', async () => {
    const buildVoussoirArch = await loadBuildVoussoirArch();
    const material = new THREE.MeshStandardMaterial({ color: '#8d949c' });

    const full = buildVoussoirArch({
      width: 2.4,
      springHeight: 1.5,
      archRatio: 1.0,
      voussoirCount: 4,
      survivalFraction: 1,
      material,
      seed: 12,
    });
    const ruined = buildVoussoirArch({
      width: 2.4,
      springHeight: 1.5,
      archRatio: 1.0,
      voussoirCount: 4,
      survivalFraction: 0.5,
      material,
      seed: 12,
    });

    expect(collectMeshes(ruined).length).toBeLessThan(collectMeshes(full).length);
    expect(full.getObjectByName('keystone')).toBeTruthy();
    expect(ruined.getObjectByName('keystone')).toBeFalsy();

    expect(ruined.getObjectByName('voussoir-left-0')).toBeTruthy();
    expect(ruined.getObjectByName('voussoir-left-1')).toBeTruthy();
    expect(ruined.getObjectByName('voussoir-right-0')).toBeTruthy();
    expect(ruined.getObjectByName('voussoir-right-1')).toBeTruthy();

    expect(ruined.getObjectByName('voussoir-left-2')).toBeFalsy();
    expect(ruined.getObjectByName('voussoir-left-3')).toBeFalsy();
    expect(ruined.getObjectByName('voussoir-right-2')).toBeFalsy();
    expect(ruined.getObjectByName('voussoir-right-3')).toBeFalsy();
  });

  it('emits distinct broken fragments for omitted upper stones when broken emission is enabled', async () => {
    const buildVoussoirArch = await loadBuildVoussoirArch();
    const material = new THREE.MeshStandardMaterial({ color: '#8d949c' });
    const options = {
      width: 2.4,
      springHeight: 1.5,
      archRatio: 1.0,
      voussoirCount: 4,
      survivalFraction: 0.5,
      material,
      seed: 12,
    };

    const intact = buildVoussoirArch({ ...options, survivalFraction: 1 });
    const ruined = buildVoussoirArch({
      ...options,
      brokenEmission: true,
    });

    const brokenMeshes = collectBrokenMeshes(ruined);
    expect(brokenMeshes.map((mesh) => mesh.name).sort()).toEqual([
      'keystone-broken',
      'voussoir-broken-left-2',
      'voussoir-broken-left-3',
      'voussoir-broken-right-2',
      'voussoir-broken-right-3',
    ]);

    for (const mesh of brokenMeshes) {
      expect(mesh.material).toBe(material);
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i))).toBe(true);
        expect(Number.isFinite(positions.getY(i))).toBe(true);
        expect(Number.isFinite(positions.getZ(i))).toBe(true);
      }

      const intactName = mesh.name === 'keystone-broken'
        ? 'keystone'
        : mesh.name.replace('voussoir-broken-', 'voussoir-');
      const intactMesh = intact.getObjectByName(intactName);
      expect(intactMesh).toBeInstanceOf(THREE.Mesh);
      if (!(intactMesh instanceof THREE.Mesh)) continue;

      expect(mesh.position.distanceTo(intactMesh.position)).toBeGreaterThan(0.05);
      expect(Math.abs(mesh.rotation.z - intactMesh.rotation.z)).toBeGreaterThan(0.05);
    }
  });

  it('keeps clean gaps by default when upper stones are omitted', async () => {
    const buildVoussoirArch = await loadBuildVoussoirArch();
    const material = new THREE.MeshStandardMaterial({ color: '#8d949c' });

    const ruined = buildVoussoirArch({
      width: 2.4,
      springHeight: 1.5,
      archRatio: 1.0,
      voussoirCount: 4,
      survivalFraction: 0.5,
      material,
      seed: 12,
    });

    expect(collectBrokenMeshes(ruined)).toHaveLength(0);
  });

  it('can emit a broken keystone fragment when only the keystone is lost', async () => {
    const buildVoussoirArch = await loadBuildVoussoirArch();
    const material = new THREE.MeshStandardMaterial({ color: '#8d949c' });

    const ruined = buildVoussoirArch({
      width: 2.4,
      springHeight: 1.5,
      archRatio: 1.0,
      voussoirCount: 4,
      survivalFraction: 0.99,
      brokenEmission: true,
      material,
      seed: 12,
    });

    const brokenKeystone = ruined.getObjectByName('keystone-broken');
    expect(ruined.getObjectByName('keystone')).toBeFalsy();
    expect(brokenKeystone).toBeInstanceOf(THREE.Mesh);
    expect((brokenKeystone as THREE.Mesh).userData.role).toBe('broken-voussoir');
  });

  it('is deterministic for the same seed and changes masonry jitter for different seeds without changing structure', async () => {
    const buildVoussoirArch = await loadBuildVoussoirArch();
    const material = new THREE.MeshStandardMaterial({ color: '#9fa4ab' });
    const options = {
      width: 2.1,
      springHeight: 1.35,
      archRatio: 1.2,
      voussoirCount: 4,
      radialThickness: 0.26,
      blockDepth: 0.16,
      material,
      survivalFraction: 1,
    };

    const archA = buildVoussoirArch({ ...options, seed: 99 });
    const archB = buildVoussoirArch({ ...options, seed: 99 });
    const archC = buildVoussoirArch({ ...options, seed: 123 });

    expect(signature(archA)).toEqual(signature(archB));
    expect(signature(archC).map((entry) => entry.split(':')[0])).toEqual(signature(archA).map((entry) => entry.split(':')[0]));
    expect(signature(archC)).not.toEqual(signature(archA));
  });
});
