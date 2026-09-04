import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildGothicArchShape,
  GOTHIC_ARCH_ROMANESQUE_RATIO,
  GOTHIC_ARCH_EQUILATERAL_RATIO,
  GOTHIC_ARCH_LANCET_RATIO,
} from '../../../../src/world/buildings/kit/GothicArch';

function highestPoint(points: THREE.Vector2[]): THREE.Vector2 {
  return points.reduce((best, point) => (point.y > best.y ? point : best), points[0]!);
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

describe('buildGothicArchShape', () => {
  it('builds a true curved pointed arch with a centered finite apex', () => {
    const shape = buildGothicArchShape({ width: 1, springHeight: 1.6, archRatio: 1.7 });
    const points = shape.getPoints(64);
    const apex = highestPoint(points);
    const spring = new THREE.Vector2(-0.5, 1.6);
    const leftArcPoint = closestPointToY(
      points,
      1.6 + (apex.y - 1.6) * 0.35,
      (point) => point.x < 0 && point.y > 1.6 && point.y < apex.y - 0.02,
    );

    expect(leftArcPoint).toBeDefined();
    if (!leftArcPoint) return;

    const straightLineX = lineXAtY(spring, apex, leftArcPoint.y);
    expect(Math.abs(leftArcPoint.x - straightLineX)).toBeGreaterThan(0.01);

    const apexMatches = points.filter((point) => Math.abs(point.y - apex.y) < 1e-6);
    const uniqueApexMatches = new Set(apexMatches.map((point) => {
      const x = Math.abs(point.x) < 1e-3 ? 0 : Number(point.x.toFixed(3));
      return `${x},${Number(point.y.toFixed(3))}`;
    }));
    expect(uniqueApexMatches.size).toBe(1);
    expect(Math.abs(apex.x)).toBeLessThan(0.02);
    expect(Number.isFinite(apex.y)).toBe(true);

    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('raises the apex as archRatio increases for the same width and spring line', () => {
    const romanesque = buildGothicArchShape({ width: 1, springHeight: 1.6, archRatio: GOTHIC_ARCH_ROMANESQUE_RATIO });
    const equilateral = buildGothicArchShape({ width: 1, springHeight: 1.6, archRatio: GOTHIC_ARCH_EQUILATERAL_RATIO });
    const lancet = buildGothicArchShape({ width: 1, springHeight: 1.6, archRatio: GOTHIC_ARCH_LANCET_RATIO });

    const romanesqueApex = highestPoint(romanesque.getPoints(64));
    const equilateralApex = highestPoint(equilateral.getPoints(64));
    const lancetApex = highestPoint(lancet.getPoints(64));

    expect(romanesqueApex.y).toBeLessThan(equilateralApex.y);
    expect(equilateralApex.y).toBeLessThan(lancetApex.y);
  });
});
