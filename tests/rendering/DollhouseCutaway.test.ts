import { describe, it, expect } from 'vitest';
import {
  shouldCutForDollhouse,
  applyDollhouseCut,
  DOLLHOUSE_CAM_DIR_XZ,
  DEFAULT_CUT_THRESHOLD,
  type CuttableMesh,
} from '@/rendering/DollhouseCutaway';

describe('DollhouseCutaway', () => {
  it('DOLLHOUSE_CAM_DIR_XZ is a unit vector derived from the fixed iso camera offset (14, 20, 14)', () => {
    const len = Math.hypot(DOLLHOUSE_CAM_DIR_XZ.x, DOLLHOUSE_CAM_DIR_XZ.z);
    expect(len).toBeCloseTo(1, 10);
    expect(DOLLHOUSE_CAM_DIR_XZ.x).toBeCloseTo(DOLLHOUSE_CAM_DIR_XZ.z, 10); // 14 == 14 → equal components
    expect(DOLLHOUSE_CAM_DIR_XZ.x).toBeGreaterThan(0);
  });

  it('DEFAULT_CUT_THRESHOLD is 0 (exact half-split)', () => {
    expect(DEFAULT_CUT_THRESHOLD).toBe(0);
  });

  it('returns true for a position on the camera-facing (near) side of the room', () => {
    // Room centred at origin; point at (+2, +2) is toward the camera (+14, +20, +14)
    expect(shouldCutForDollhouse({ x: 2, z: 2 }, { x: 0, z: 0 })).toBe(true);
  });

  it('returns false for a position on the far side of the room', () => {
    expect(shouldCutForDollhouse({ x: -2, z: -2 }, { x: 0, z: 0 })).toBe(false);
  });

  it('returns false exactly on the threshold plane (strict > comparison)', () => {
    // (2, -2) relative to origin: dot = 2*0.707 + -2*0.707 = 0
    expect(shouldCutForDollhouse({ x: 2, z: -2 }, { x: 0, z: 0 })).toBe(false);
  });

  it('classifies relative to a non-origin room centre', () => {
    // Room centred at (10, 10); point at (12, 12) is near-side relative to THAT centre
    expect(shouldCutForDollhouse({ x: 12, z: 12 }, { x: 10, z: 10 })).toBe(true);
    expect(shouldCutForDollhouse({ x: 8, z: 8 }, { x: 10, z: 10 })).toBe(false);
  });

  it('respects a custom threshold', () => {
    // Small near-side offset, cut with threshold 0 but not with threshold 5
    expect(shouldCutForDollhouse({ x: 1, z: 1 }, { x: 0, z: 0 }, 0)).toBe(true);
    expect(shouldCutForDollhouse({ x: 1, z: 1 }, { x: 0, z: 0 }, 5)).toBe(false);
  });

  it('samples roughly half of a ring of points as cut (circular room case)', () => {
    const N = 36;
    let cutCount = 0;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const pos = { x: Math.cos(angle) * 5, z: Math.sin(angle) * 5 };
      if (shouldCutForDollhouse(pos, { x: 0, z: 0 })) cutCount++;
    }
    expect(cutCount).toBeGreaterThan(N * 0.4);
    expect(cutCount).toBeLessThan(N * 0.6);
  });

  it('applyDollhouseCut hides and tags a near-side mesh, returns true', () => {
    const mesh: CuttableMesh = { position: { x: 2, z: 2 }, visible: true, userData: {} };
    const result = applyDollhouseCut(mesh, { x: 0, z: 0 });
    expect(result).toBe(true);
    expect(mesh.visible).toBe(false);
    expect(mesh.userData.dollhouseCut).toBe(true);
  });

  it('applyDollhouseCut leaves a far-side mesh untouched, returns false', () => {
    const mesh: CuttableMesh = { position: { x: -2, z: -2 }, visible: true, userData: {} };
    const result = applyDollhouseCut(mesh, { x: 0, z: 0 });
    expect(result).toBe(false);
    expect(mesh.visible).toBe(true);
    expect(mesh.userData.dollhouseCut).toBeUndefined();
  });
});
