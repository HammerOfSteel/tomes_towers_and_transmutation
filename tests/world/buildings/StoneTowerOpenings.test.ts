/**
 * StoneTowerOpenings.test.ts — shared recessed carved-opening geometry
 * (real depth: a proud stone frame surrounding a receded dark cavity)
 * for the elven stone-tower kit's windows and entrance. Replaces the
 * flat glass-box-plus-floating-cone look flagged as looking like
 * "basic base geometry" that doesn't match the wall's real block
 * construction.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildArchShape, buildRecessedArchOpening } from '@/world/buildings/StoneTowerOpenings';

function hasNaN(obj: THREE.Object3D): boolean {
  let bad = false;
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) {
        if (!Number.isFinite(pos.array[i])) bad = true;
      }
    }
  });
  return bad;
}

function countVerts(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => { if (o instanceof THREE.Mesh) n += o.geometry.attributes.position.count; });
  return n;
}

function lineXAtY(start: THREE.Vector2, end: THREE.Vector2, y: number): number {
  const t = (y - start.y) / (end.y - start.y);
  return start.x + (end.x - start.x) * t;
}

function closestPointToY(points: THREE.Vector2[], targetY: number, predicate: (point: THREE.Vector2) => boolean): THREE.Vector2 | undefined {
  const matches = points.filter(predicate);
  return matches.reduce<THREE.Vector2 | undefined>((best, point) => {
    if (!best) return point;
    return Math.abs(point.y - targetY) < Math.abs(best.y - targetY) ? point : best;
  }, undefined);
}

describe('buildArchShape', () => {
  it('produces a valid THREE.Shape with the expected pointed-arch outline', () => {
    const shape = buildArchShape(1, 2, 0.6);
    const pts = shape.getPoints();
    expect(pts.length).toBeGreaterThan(3);
    // The apex point (top of the arch) must be centered (x=0) and above the straight section.
    const apex = pts.reduce((best, p) => (p.y > best.y ? p : best), pts[0]!);
    expect(Math.abs(apex.x)).toBeLessThan(0.05);
    expect(apex.y).toBeCloseTo(2.6, 1);
  });

  it('pointHeight=0 degenerates to a plain rectangle (reused for square/mullion openings)', () => {
    const shape = buildArchShape(1, 2, 0);
    const pts = shape.getPoints();
    const maxY = Math.max(...pts.map((p) => p.y));
    expect(maxY).toBeCloseTo(2, 1);
  });

  it('uses curved sides near the apex instead of the old straight triangular point', () => {
    const shape = buildArchShape(1, 2, 0.6);
    const pts = shape.getPoints(64);
    const apex = pts.reduce((best, p) => (p.y > best.y ? p : best), pts[0]!);
    const spring = new THREE.Vector2(-1, 2);
    const leftArcPoint = closestPointToY(
      pts,
      2 + (apex.y - 2) * 0.35,
      (p) => p.x < 0 && p.y > 2 && p.y < apex.y - 0.02,
    );

    expect(leftArcPoint).toBeDefined();
    if (!leftArcPoint) return;

    const straightLineX = lineXAtY(spring, apex, leftArcPoint.y);
    expect(Math.abs(leftArcPoint.x - straightLineX)).toBeGreaterThan(0.01);
  });

  it('uses a shouldered/depressed-arch compromise for shallow pointHeight: a narrower Romanesque cap with flat shoulders instead of forcing an unrealistic full-span arch', () => {
    // For this shallow case (halfWidth=1, straightHeight=2, pointHeight=0.6),
    // the curvedWidth becomes Math.min(2, 0.6*2) = 1.2, and shoulders exist.
    const shape = buildArchShape(1, 2, 0.6);
    const pts = shape.getPoints(128);
    const straightHeight = 2;
    const fullWidth = 2;
    const expectedCurvedHalfWidth = 0.6; // curvedWidth = 1.2, half = 0.6
    const yTolerance = 0.02;

    // Points at the springing line (y ≈ straightHeight, within tolerance)
    const springPoints = pts.filter((p) => Math.abs(p.y - straightHeight) < yTolerance);
    expect(springPoints.length).toBeGreaterThan(0);

    // At the shoulder region (y ≈ straightHeight), there should be:
    // 1. Points with |x| ≈ fullWidth/2 (1.0) — the outer edge of the shoulder
    const outerShoulderPoints = springPoints.filter((p) => Math.abs(Math.abs(p.x) - fullWidth / 2) < 0.15);
    expect(outerShoulderPoints.length).toBeGreaterThan(0);

    // 2. Points with |x| ≈ expectedCurvedHalfWidth (0.6) — where shoulder meets curved cap
    const innerShoulderPoints = springPoints.filter((p) => Math.abs(Math.abs(p.x) - expectedCurvedHalfWidth) < 0.15);
    expect(innerShoulderPoints.length).toBeGreaterThan(0);

    // 3. Above the springing line (y > straightHeight + small margin), all points
    // should have |x| < expectedCurvedHalfWidth (inside the curved cap, not shoulder)
    const aboveSpringPoints = pts.filter((p) => p.y > straightHeight + 0.01);
    expect(aboveSpringPoints.length).toBeGreaterThan(0);
    const tooWideAboveSpring = aboveSpringPoints.filter((p) => Math.abs(p.x) > expectedCurvedHalfWidth + 0.05);
    expect(tooWideAboveSpring.length).toBe(0);
  });
});

describe('buildRecessedArchOpening', () => {
  const cavityMat = new THREE.MeshStandardMaterial({ color: '#0a0a0a' });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });
  const opts = { width: 0.8, straightHeight: 1.2, pointHeight: 0.5, recessDepth: 0.12, frameWidth: 0.1, frameProud: 0.05 };

  it('produces valid, non-NaN geometry with at least 2 meshes (frame + cavity)', () => {
    const g = buildRecessedArchOpening(opts, 2, cavityMat, frameMat);
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBeGreaterThanOrEqual(2);
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic', () => {
    const g1 = buildRecessedArchOpening(opts, 2, cavityMat, frameMat);
    const g2 = buildRecessedArchOpening(opts, 2, cavityMat, frameMat);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('the frame is proud of (farther out than) the wall surface, and the cavity is recessed behind it -- real depth, not a flat decal', () => {
    const g = buildRecessedArchOpening(opts, 2, cavityMat, frameMat);
    let frameMaxZ = -Infinity;
    let cavityMinZ = Infinity;
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.attributes.position;
      const isFrame = o.material === frameMat;
      const isCavity = o.material === cavityMat;
      for (let i = 0; i < pos.count; i++) {
        const worldZ = pos.getZ(i) + o.position.z;
        if (isFrame) frameMaxZ = Math.max(frameMaxZ, worldZ);
        if (isCavity) cavityMinZ = Math.min(cavityMinZ, worldZ);
      }
    });
    const radius = 2;
    // Frame must extend beyond the wall surface (proud).
    expect(frameMaxZ).toBeGreaterThan(radius);
    // Cavity's farthest-back point must sit well behind the wall surface (recessed).
    expect(cavityMinZ).toBeLessThan(radius - opts.recessDepth * 0.5);
    // And genuinely behind the frame's own frontmost point -- proof of real
    // depth between the two pieces, not two coplanar decals.
    expect(cavityMinZ).toBeLessThan(frameMaxZ);
  });

  it('scales with width/height options (a larger opening has a taller/wider bounding box)', () => {
    const small = buildRecessedArchOpening(opts, 2, cavityMat, frameMat);
    const large = buildRecessedArchOpening({ ...opts, width: 1.6, straightHeight: 2.4 }, 2, cavityMat, frameMat);
    const smallBox = new THREE.Box3().setFromObject(small);
    const largeBox = new THREE.Box3().setFromObject(large);
    expect(largeBox.max.x - largeBox.min.x).toBeGreaterThan(smallBox.max.x - smallBox.min.x);
    expect(largeBox.max.y - largeBox.min.y).toBeGreaterThan(smallBox.max.y - smallBox.min.y);
  });
});
