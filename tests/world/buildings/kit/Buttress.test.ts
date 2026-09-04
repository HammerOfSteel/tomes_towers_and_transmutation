import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { depthFor } from '@/world/buildings/kit/DepthLadder';

async function loadButtressModule() {
  return import('../../../../src/world/buildings/kit/Buttress');
}

async function loadBuildButtress() {
  const module = await loadButtressModule();
  return module.buildButtress as (
    options: {
      height: number;
      width?: number;
      stages?: number;
      depth?: number;
      cap?: 'flat' | 'gablet' | 'pinnacle';
      brokenTopHeight?: number;
      seed?: number;
    },
    material: THREE.Material,
  ) => THREE.Group;
}

function makeStoneMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 1 });
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function collectNamedObjects<T extends THREE.Object3D>(root: THREE.Object3D, pattern: RegExp): T[] {
  const matches: T[] = [];
  root.traverse((child) => {
    if (pattern.test(child.name)) matches.push(child as T);
  });
  return matches;
}

function collectRoleObjects<T extends THREE.Object3D>(root: THREE.Object3D, role: string): T[] {
  const matches: T[] = [];
  root.traverse((child) => {
    if (child.userData.role === role) matches.push(child as T);
  });
  return matches;
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function worldSize(object: THREE.Object3D): THREE.Vector3 {
  return worldBox(object).getSize(new THREE.Vector3());
}

function worldVertices(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const vertices: THREE.Vector3[] = [];
  const vertex = new THREE.Vector3();
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      vertices.push(vertex.clone().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld));
    }
  }
  return vertices;
}

function topBandSpread(root: THREE.Object3D, bandHeight: number): { width: number; depth: number; yVariation: number } {
  const vertices = worldVertices(root);
  const maxY = Math.max(...vertices.map(vertex => vertex.y));
  const band = vertices.filter(vertex => vertex.y >= maxY - bandHeight);
  const xs = band.map(vertex => vertex.x);
  const ys = band.map(vertex => vertex.y);
  const zs = band.map(vertex => vertex.z);

  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
    yVariation: Math.max(...ys) - Math.min(...ys),
  };
}

function assertFiniteGeometry(root: THREE.Object3D): void {
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      expect(Number.isFinite(position.getX(index))).toBe(true);
      expect(Number.isFinite(position.getY(index))).toBe(true);
      expect(Number.isFinite(position.getZ(index))).toBe(true);
    }
  }
}

describe('buildButtress', () => {
  it('builds a finite three-stage buttress with weathered set-offs and a predictable overall height', async () => {
    const buildButtress = await loadBuildButtress();
    const buttress = buildButtress({ height: 4 }, makeStoneMaterial());
    const box = worldBox(buttress);
    const stageNames = collectNamedObjects<THREE.Object3D>(buttress, /^buttress-stage-\d+$/).map(child => child.name).sort();
    const weatheredCaps = collectNamedObjects<THREE.Mesh>(buttress, /^weathered-cap-\d+$/).sort((a, b) => a.name.localeCompare(b.name));

    expect(buttress).toBeInstanceOf(THREE.Group);
    expect([
      box.min.x,
      box.min.y,
      box.min.z,
      box.max.x,
      box.max.y,
      box.max.z,
    ].every(Number.isFinite)).toBe(true);
    expect(worldSize(buttress).y).toBeCloseTo(4.08, 2);
    expect(stageNames).toEqual([
      'buttress-stage-0',
      'buttress-stage-1',
      'buttress-stage-2',
    ]);
    expect(weatheredCaps).toHaveLength(2);
    assertFiniteGeometry(buttress);

    const stage0 = buttress.getObjectByName('buttress-stage-0');
    const stage1 = buttress.getObjectByName('buttress-stage-1');
    const stage2 = buttress.getObjectByName('buttress-stage-2');
    expect(stage0).toBeTruthy();
    expect(stage1).toBeTruthy();
    expect(stage2).toBeTruthy();
    if (!stage0 || !stage1 || !stage2) return;

    const stage0Size = worldSize(stage0);
    const stage1Size = worldSize(stage1);
    const stage2Size = worldSize(stage2);

    expect(stage1Size.x).toBeLessThan(stage0Size.x);
    expect(stage1Size.z).toBeLessThan(stage0Size.z);
    expect(stage2Size.x).toBeLessThan(stage1Size.x);
    expect(stage2Size.z).toBeLessThan(stage1Size.z);

    const stage0Box = worldBox(stage0);
    const stage1Box = worldBox(stage1);
    const stage2Box = worldBox(stage2);
    const cap0Box = worldBox(weatheredCaps[0]!);
    const cap1Box = worldBox(weatheredCaps[1]!);
    const cap0Size = worldSize(weatheredCaps[0]!);
    const cap1Size = worldSize(weatheredCaps[1]!);

    expect(cap0Box.min.y).toBeCloseTo(stage0Box.max.y, 3);
    expect(cap0Box.max.y).toBeCloseTo(stage1Box.min.y, 3);
    expect(cap1Box.min.y).toBeCloseTo(stage1Box.max.y, 3);
    expect(cap1Box.max.y).toBeCloseTo(stage2Box.min.y, 3);
    expect(cap0Size.x).toBeGreaterThan(stage1Size.x);
    expect(cap0Size.z).toBeGreaterThan(stage1Size.z);
    expect(cap1Size.x).toBeGreaterThan(stage2Size.x);
    expect(cap1Size.z).toBeGreaterThan(stage2Size.z);
    expect(cap0Size.y).toBeGreaterThan(0.1);
    expect(cap1Size.y).toBeGreaterThan(0.1);
  });

  it('sizes gablet caps from the topmost stage footprint rather than a fixed absolute dimension', async () => {
    const buildButtress = await loadBuildButtress();
    const material = makeStoneMaterial();
    const narrow = buildButtress({ height: 4, width: 0.7, stages: 3, depth: 0.34, cap: 'gablet', seed: 3 }, material);
    const broad = buildButtress({ height: 4.6, width: 1.2, stages: 5, depth: 0.46, cap: 'gablet', seed: 3 }, material);

    const narrowTopStage = narrow.getObjectByName('buttress-stage-2');
    const broadTopStage = broad.getObjectByName('buttress-stage-4');
    const narrowGablet = narrow.getObjectByName('gablet-cap');
    const broadGablet = broad.getObjectByName('gablet-cap');

    expect(narrowTopStage).toBeTruthy();
    expect(broadTopStage).toBeTruthy();
    expect(narrowGablet).toBeTruthy();
    expect(broadGablet).toBeTruthy();
    if (!narrowTopStage || !broadTopStage || !narrowGablet || !broadGablet) return;

    const narrowTopSize = worldSize(narrowTopStage);
    const broadTopSize = worldSize(broadTopStage);
    const narrowGabletSize = worldSize(narrowGablet);
    const broadGabletSize = worldSize(broadGablet);

    expect(worldBox(narrowGablet).min.y).toBeCloseTo(worldBox(narrowTopStage).max.y, 3);
    expect(worldBox(broadGablet).min.y).toBeCloseTo(worldBox(broadTopStage).max.y, 3);

    const widthRatios = [
      narrowGabletSize.x / narrowTopSize.x,
      broadGabletSize.x / broadTopSize.x,
    ];
    const depthRatios = [
      narrowGabletSize.z / narrowTopSize.z,
      broadGabletSize.z / broadTopSize.z,
    ];

    expect(Math.abs(widthRatios[0]! - widthRatios[1]!)).toBeLessThan(0.08);
    expect(Math.abs(depthRatios[0]! - depthRatios[1]!)).toBeLessThan(0.08);
    expect(narrowGabletSize.x).toBeLessThan(broadGabletSize.x);
    expect(narrowGabletSize.z).toBeLessThan(broadGabletSize.z);
  });

  it('gives pinnacle caps a tighter top silhouette than gablet caps', async () => {
    const buildButtress = await loadBuildButtress();
    const options = { height: 4.2, width: 0.95, stages: 4, depth: 0.44, seed: 9 };
    const gablet = buildButtress({ ...options, cap: 'gablet' }, makeStoneMaterial());
    const pinnacle = buildButtress({ ...options, cap: 'pinnacle' }, makeStoneMaterial());

    const gabletCap = gablet.getObjectByName('gablet-cap');
    const pinnacleCap = pinnacle.getObjectByName('pinnacle-cap');
    expect(gabletCap).toBeTruthy();
    expect(pinnacleCap).toBeTruthy();
    if (!gabletCap || !pinnacleCap) return;

    const gabletTopBand = topBandSpread(gabletCap, 0.03);
    const pinnacleTopBand = topBandSpread(pinnacleCap, 0.03);

    expect(gabletTopBand.depth).toBeGreaterThan(0.1);
    expect(pinnacleTopBand.depth).toBeLessThan(gabletTopBand.depth * 0.5);
    expect(pinnacleTopBand.width).toBeLessThan(gabletTopBand.width);
  });

  it('supports broken-top variants with capped height, no designed cap, and a genuinely jagged break line', async () => {
    const buildButtress = await loadBuildButtress();
    const brokenTopHeight = 3.05;
    const buttress = buildButtress({
      height: 4,
      width: 0.8,
      stages: 4,
      depth: 0.42,
      cap: 'gablet',
      brokenTopHeight,
      seed: 17,
    }, makeStoneMaterial());

    const box = worldBox(buttress);
    expect(box.max.y - box.min.y).toBeCloseTo(brokenTopHeight, 2);
    expect(buttress.getObjectByName('gablet-cap')).toBeFalsy();
    expect(buttress.getObjectByName('pinnacle-cap')).toBeFalsy();
    expect(buttress.getObjectByName('flat-cap')).toBeFalsy();

    const brokenTop = collectRoleObjects<THREE.Object3D>(buttress, 'broken-top')[0];
    expect(brokenTop).toBeTruthy();
    if (!brokenTop) return;
    expect(brokenTop.name).toMatch(/-broken$/);

    const breakBand = topBandSpread(brokenTop, 0.1);
    expect(breakBand.yVariation).toBeGreaterThan(0.04);
  });

  it('still tapers inward for unusually narrow and shallow buttresses', async () => {
    const buildButtress = await loadBuildButtress();
    const buttress = buildButtress({
      height: 2.8,
      width: 0.15,
      depth: 0.1,
      stages: 4,
      seed: 5,
    }, makeStoneMaterial());

    const stages = [0, 1, 2, 3]
      .map(index => buttress.getObjectByName(`buttress-stage-${index}`))
      .filter((stage): stage is THREE.Object3D => Boolean(stage));

    expect(stages).toHaveLength(4);

    const sizes = stages.map(stage => worldSize(stage));
    for (let index = 1; index < sizes.length; index++) {
      expect(sizes[index]!.x).toBeLessThan(sizes[index - 1]!.x);
      expect(sizes[index]!.z).toBeLessThan(sizes[index - 1]!.z);
    }
  });

  it('keeps a jagged ruin break when brokenTopHeight lands on an internal segment boundary', async () => {
    const buildButtress = await loadBuildButtress();
    const intact = buildButtress({
      height: 4,
      width: 0.8,
      depth: 0.34,
      stages: 3,
    }, makeStoneMaterial());
    const firstStage = intact.getObjectByName('buttress-stage-0');
    expect(firstStage).toBeTruthy();
    if (!firstStage) return;

    const boundaryHeight = worldBox(firstStage).max.y;
    const broken = buildButtress({
      height: 4,
      width: 0.8,
      depth: 0.34,
      stages: 3,
      cap: 'pinnacle',
      brokenTopHeight: boundaryHeight,
      seed: 29,
    }, makeStoneMaterial());

    expect(worldSize(broken).y).toBeCloseTo(boundaryHeight, 2);
    expect(broken.getObjectByName('pinnacle-cap')).toBeFalsy();

    const brokenParts = collectRoleObjects<THREE.Object3D>(broken, 'broken-top');
    expect(brokenParts).toHaveLength(1);
    expect(brokenParts[0]!.name).toMatch(/-broken$/);
    const breakBand = topBandSpread(brokenParts[0]!, 0.08);
    expect(breakBand.yVariation).toBeGreaterThan(0.03);
  });

  it('defaults base projection to the buttress depth ladder and respects explicit overrides', async () => {
    const buildButtress = await loadBuildButtress();
    const defaultDepthButtress = buildButtress({ height: 4 }, makeStoneMaterial());
    const customDepthButtress = buildButtress({ height: 4, depth: 0.46 }, makeStoneMaterial());

    const defaultStage = defaultDepthButtress.getObjectByName('buttress-stage-0');
    const customStage = customDepthButtress.getObjectByName('buttress-stage-0');
    expect(defaultStage).toBeTruthy();
    expect(customStage).toBeTruthy();
    if (!defaultStage || !customStage) return;

    expect(worldSize(defaultStage).z).toBeCloseTo(depthFor('BUTTRESS'), 2);
    expect(worldSize(customStage).z).toBeCloseTo(0.46, 2);
  });
});
