/**
 * StoneTowerShape.test.ts — shared octagon cross-section math for the
 * elven stone-tower kit POC. See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import { octagonPoints, octagonFaces } from '@/world/buildings/StoneTowerShape';

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
