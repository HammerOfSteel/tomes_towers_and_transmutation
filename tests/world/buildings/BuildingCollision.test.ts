import { describe, it, expect } from 'vitest';
import { closestDistanceToBuildingFootprint } from '@/world/buildings/BuildingCollision';

describe('closestDistanceToBuildingFootprint', () => {
  it('returns 0 for a point inside the (unrotated) footprint', () => {
    const d = closestDistanceToBuildingFootprint(
      { x: 1, z: 1 }, { x: 0, z: 0 }, { w: 4, d: 6 }, 0,
    );
    expect(d).toBe(0);
  });

  it('returns the straight-line gap for a point outside an unrotated footprint', () => {
    // Footprint half-extents: w/2=2, d/2=3. Point at (5, 0) is 3 units
    // past the +X wall (5 - 2 = 3), directly out along X (z stays inside).
    const d = closestDistanceToBuildingFootprint(
      { x: 5, z: 0 }, { x: 0, z: 0 }, { w: 4, d: 6 }, 0,
    );
    expect(d).toBeCloseTo(3, 6);
  });

  it('accounts for a 90-degree rotation swapping the effective width/depth axes', () => {
    // Footprint w=4 (half=2), d=6 (half=3), rotated 90 degrees around Y,
    // centered at (10, 10). World point (10, 15) is offset (0, +5) in world
    // space. Verified by hand against three.js's Object3D.rotation.y
    // convention (wx = lx*cos(θ)+lz*sin(θ), wz = -lx*sin(θ)+lz*cos(θ)):
    // this offset corresponds to local point (lx, lz) = (-5, 0), which
    // clamps to the box's local half-extents (hw=2, hd=3) at (-2, 0),
    // giving a distance of 3.
    const d = closestDistanceToBuildingFootprint(
      { x: 10, z: 15 }, { x: 10, z: 10 }, { w: 4, d: 6 }, Math.PI / 2,
    );
    expect(d).toBeCloseTo(3, 6);
  });

  it('returns 0 for a point on the footprint boundary', () => {
    const d = closestDistanceToBuildingFootprint(
      { x: 2, z: 0 }, { x: 0, z: 0 }, { w: 4, d: 6 }, 0,
    );
    expect(d).toBeCloseTo(0, 6);
  });
});
