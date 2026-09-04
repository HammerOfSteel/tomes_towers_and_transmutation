/**
 * StoneTowerShape.test.ts — shared octagon cross-section math for the
 * elven stone-tower kit POC. See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import { octagonPoints, octagonFaces, rectanglePoints, rectangleFaces, facePointAt } from '@/world/buildings/StoneTowerShape';

describe('octagonPoints', () => {
  it('returns exactly 8 points', () => {
    expect(octagonPoints(2)).toHaveLength(8);
  });

  it('every point sits at exactly the given radius from the origin', () => {
    const pts = octagonPoints(2.5);
    for (const [x, z] of pts) {
      expect(Math.hypot(x, z)).toBeCloseTo(2.5, 9);
    }
  });

  it('the first point is at local +Z (angle 0): (0, radius)', () => {
    const [first] = octagonPoints(3);
    expect(first![0]).toBeCloseTo(0, 9);
    expect(first![1]).toBeCloseTo(3, 9);
  });

  it('is deterministic', () => {
    expect(octagonPoints(2)).toEqual(octagonPoints(2));
  });

  it('vertexScales scales only the specified corner, leaving others at the base radius', () => {
    const base = octagonPoints(2);
    const scales = [1, 1, 1.3, 1, 1, 1, 1, 1];
    const scaled = octagonPoints(2, scales);
    expect(Math.hypot(scaled[2]![0], scaled[2]![1])).toBeCloseTo(2 * 1.3, 9);
    for (const i of [0, 1, 3, 4, 5, 6, 7]) {
      expect(scaled[i]).toEqual(base[i]);
    }
  });

  it('omitting vertexScales reproduces the exact unscaled output', () => {
    expect(octagonPoints(2)).toEqual(octagonPoints(2, undefined));
  });

  it('a vertexScales array with an incorrect length throws', () => {
    expect(() => octagonPoints(2, [1, 1, 1])).toThrow();
  });
});

describe('octagonFaces', () => {
  it('returns exactly 8 faces', () => {
    expect(octagonFaces(2)).toHaveLength(8);
  });

  it("each face's a/b endpoints match consecutive octagonPoints entries", () => {
    const pts = octagonPoints(2);
    const faces = octagonFaces(2);
    for (let i = 0; i < 8; i++) {
      expect(faces[i]!.a).toEqual(pts[i]);
      expect(faces[i]!.b).toEqual(pts[(i + 1) % 8]);
    }
  });

  it("each face's midpoint sits at the regular-octagon apothem distance (radius * cos(PI/8))", () => {
    const radius = 2;
    const faces = octagonFaces(radius);
    const expectedApothem = radius * Math.cos(Math.PI / 8);
    for (const face of faces) {
      const midX = (face.a[0] + face.b[0]) / 2;
      const midZ = (face.a[1] + face.b[1]) / 2;
      expect(Math.hypot(midX, midZ)).toBeCloseTo(expectedApothem, 9);
    }
  });

  it("normalAngle matches the module's x=r*sin(angle), z=r*cos(angle) convention (round-tripping through the face midpoint)", () => {
    const radius = 2;
    const faces = octagonFaces(radius);
    for (const face of faces) {
      const midX = (face.a[0] + face.b[0]) / 2;
      const midZ = (face.a[1] + face.b[1]) / 2;
      const apothem = radius * Math.cos(Math.PI / 8);
      expect(apothem * Math.sin(face.normalAngle)).toBeCloseTo(midX, 9);
      expect(apothem * Math.cos(face.normalAngle)).toBeCloseTo(midZ, 9);
    }
  });

  it('vertexScales threads through to face endpoints matching the scaled octagonPoints output', () => {
    const radius = 2;
    const scales = [1, 1.2, 1, 1, 0.8, 1, 1, 1];
    const pts = octagonPoints(radius, scales);
    const faces = octagonFaces(radius, scales);
    for (let i = 0; i < 8; i++) {
      expect(faces[i]!.a).toEqual(pts[i]);
      expect(faces[i]!.b).toEqual(pts[(i + 1) % 8]);
    }
  });
});

describe('rectanglePoints', () => {
  it('returns exactly 4 corners at (+-halfW, +-halfD), winding matching octagonPoints (produces a +Y floor-cap normal)', () => {
    const pts = rectanglePoints(2, 4);
    expect(pts).toEqual([[2, 4], [2, -4], [-2, -4], [-2, 4]]);
  });
});

describe('rectangleFaces', () => {
  it('returns 4 faces with normalAngle 0 (front, +Z), PI/2 (right, +X), PI (back, -Z), -PI/2 (left, -X), matching octagonFaces\' own atan2(midX, midZ) convention', () => {
    const faces = rectangleFaces(2, 4);
    expect(faces).toHaveLength(4);
    expect(faces[0]!.normalAngle).toBeCloseTo(Math.PI / 2, 5);   // right (+X wall)
    expect(faces[1]!.normalAngle).toBeCloseTo(Math.PI, 5);        // back (-Z wall, apse-facing)
    expect(faces[2]!.normalAngle).toBeCloseTo(-Math.PI / 2, 5);   // left (-X wall)
    expect(faces[3]!.normalAngle).toBeCloseTo(0, 5);              // front (+Z wall, entrance)
  });

  it('each face\'s a/b corners match consecutive rectanglePoints entries', () => {
    const pts = rectanglePoints(2, 4);
    const faces = rectangleFaces(2, 4);
    for (let i = 0; i < 4; i++) {
      expect(faces[i]!.a).toEqual(pts[i]);
      expect(faces[i]!.b).toEqual(pts[(i + 1) % 4]);
    }
  });
});

describe('facePointAt', () => {
  it('returns face.a at t=0 and face.b at t=1', () => {
    const faces = rectangleFaces(2, 4);
    const face = faces[0]!; // right wall, a=[2,4], b=[2,-4]
    expect(facePointAt(face, 0)).toEqual([2, 4]);
    expect(facePointAt(face, 1)).toEqual([2, -4]);
  });

  it('linearly interpolates at t=0.5 (the face midpoint)', () => {
    const faces = rectangleFaces(2, 4);
    const face = faces[0]!;
    const [x, z] = facePointAt(face, 0.5);
    expect(x).toBeCloseTo(2, 5);
    expect(z).toBeCloseTo(0, 5);
  });

  it('at t=0.3 matches manual interpolation for a non-axis-aligned face', () => {
    // Use an octagon face (diagonal a/b) to prove this isn't rectangle-specific.
    const faces = octagonFaces(2);
    const face = faces[0]!;
    const [ax, az] = face.a;
    const [bx, bz] = face.b;
    const [x, z] = facePointAt(face, 0.3);
    expect(x).toBeCloseTo(ax + (bx - ax) * 0.3, 5);
    expect(z).toBeCloseTo(az + (bz - az) * 0.3, 5);
  });
});
