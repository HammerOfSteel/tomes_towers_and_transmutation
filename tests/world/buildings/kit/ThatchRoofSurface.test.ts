import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildThatchRoofSurface, buildThatchGableRoof } from '@/world/buildings/kit/ThatchRoofSurface';

function makeMaterial(color: string) {
  return new THREE.MeshStandardMaterial({ color });
}

describe('buildThatchRoofSurface', () => {
  it('returns named bands/ridge-cap/eave-roll/verge/wisps groups, all real extruded solids', () => {
    const surface = buildThatchRoofSurface(3.2, 2.8, 5, makeMaterial('#8b7040'));

    const bands = surface.getObjectByName('bands');
    const ridgeCap = surface.getObjectByName('ridge-cap');
    const eaveRoll = surface.getObjectByName('eave-roll');
    const verge = surface.getObjectByName('verge');
    const wisps = surface.getObjectByName('wisps');

    expect(bands, 'bands group').toBeTruthy();
    expect(ridgeCap, 'ridge-cap group').toBeTruthy();
    expect(eaveRoll, 'eave-roll group').toBeTruthy();
    expect(verge, 'verge group').toBeTruthy();
    expect(wisps, 'wisps group').toBeTruthy();

    let meshCount = 0;
    surface.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount++;
        // Never a flat plane standing in for a readable roof feature --
        // every emitted piece must have real depth on every axis.
        obj.geometry.computeBoundingBox();
        const box = obj.geometry.boundingBox!;
        const dims = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
        expect(dims.every((d) => d > 0.001), `${obj.name} should not be a flat plane`).toBe(true);
      }
    });
    expect(meshCount).toBeGreaterThan(0);
  });

  it('builds a thick rolled eave strictly thicker than 0.15 WU', () => {
    const surface = buildThatchRoofSurface(3.2, 2.8, 5, makeMaterial('#8b7040'));
    const eaveRoll = surface.getObjectByName('eave-roll')!;
    const box = new THREE.Box3().setFromObject(eaveRoll);
    const thickness = box.max.z - box.min.z;
    expect(thickness).toBeGreaterThan(0.15);
  });

  it('pegs the ridge cap with distinct wooden peg meshes', () => {
    const surface = buildThatchRoofSurface(3.2, 2.8, 5, makeMaterial('#8b7040'));
    const ridgeCap = surface.getObjectByName('ridge-cap')!;
    let pegCount = 0;
    ridgeCap.traverse((obj) => {
      if (obj.name.startsWith('peg-')) pegCount++;
    });
    expect(pegCount).toBeGreaterThan(0);
  });

  it('emits at least 40 loose straw wisps for a typical roof-panel size', () => {
    const surface = buildThatchRoofSurface(3.2, 2.8, 5, makeMaterial('#8b7040'));
    const wisps = surface.getObjectByName('wisps')!;
    expect(wisps.children.length).toBeGreaterThanOrEqual(40);
  });

  it('emits verge trim along both gable edges', () => {
    const surface = buildThatchRoofSurface(3.2, 2.8, 5, makeMaterial('#8b7040'));
    const verge = surface.getObjectByName('verge')!;
    const box = new THREE.Box3().setFromObject(verge);
    expect(box.max.x - box.min.x).toBeGreaterThan(3.0);
  });

  it('is deterministic for the same seed', () => {
    const build = () => buildThatchRoofSurface(3.2, 2.8, 5, makeMaterial('#8b7040'));
    const flatten = (g: THREE.Object3D) => {
      const positions: number[] = [];
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh) positions.push(obj.position.x, obj.position.y, obj.position.z);
      });
      return positions;
    };
    expect(flatten(build())).toEqual(flatten(build()));
  });
});

describe('buildThatchGableRoof', () => {
  it('assembles two thatch slopes meeting at a ridge plus solid gable-end closures', () => {
    const material = makeMaterial('#8b7040');
    const roof = buildThatchGableRoof(2.0, 1.5, 1.8, 7, material);

    const east = roof.getObjectByName('thatch-slope-east');
    const west = roof.getObjectByName('thatch-slope-west');
    expect(east, 'east slope').toBeTruthy();
    expect(west, 'west slope').toBeTruthy();
    // Each slope still carries its own full thatch surface substructure.
    expect(east!.getObjectByName('bands')).toBeTruthy();
    expect(east!.getObjectByName('ridge-cap')).toBeTruthy();

    expect(roof.getObjectByName('gable-end-front')).toBeTruthy();
    expect(roof.getObjectByName('gable-end-back')).toBeTruthy();

    // The overall roof should be a real 3D volume reaching up to roughly
    // the ridge height, not a flat plane.
    const box = new THREE.Box3().setFromObject(roof);
    expect(box.max.y).toBeGreaterThan(1.5);
    expect(box.max.x - box.min.x).toBeGreaterThan(3.5); // eave overhang past 2*halfWidth
  });

  it('is deterministic for the same seed', () => {
    const material = makeMaterial('#8b7040');
    const flatten = (g: THREE.Object3D) => {
      const positions: number[] = [];
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh) positions.push(obj.position.x, obj.position.y, obj.position.z);
      });
      return positions;
    };
    expect(flatten(buildThatchGableRoof(2.0, 1.5, 1.8, 7, material))).toEqual(
      flatten(buildThatchGableRoof(2.0, 1.5, 1.8, 7, material)),
    );
  });
});
