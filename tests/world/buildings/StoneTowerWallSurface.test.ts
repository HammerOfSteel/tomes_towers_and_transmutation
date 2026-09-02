/**
 * StoneTowerWallSurface.test.ts — the two swappable wall-surface
 * strategies for the elven stone-tower kit POC (textured prism vs. real
 * block geometry). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildWallSurfaceTextured, buildWallSurfaceBlocks, buildWallSurface, WALL_STRATEGY } from '@/world/buildings/StoneTowerWallSurface';

function countTriangles(group: THREE.Group): number {
  let tris = 0;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      tris += o.geometry.index ? o.geometry.index.count / 3 : pos.count / 3;
    }
  });
  return tris;
}

function hasNaN(group: THREE.Group): boolean {
  let bad = false;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) {
        if (!Number.isFinite(pos.array[i])) bad = true;
      }
    }
  });
  return bad;
}

describe('buildWallSurfaceTextured (Strategy T)', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it('produces a group with at least one mesh', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBeGreaterThan(0);
  });

  it('produces finite, non-NaN geometry', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    expect(hasNaN(g)).toBe(false);
  });

  it('is cheap: an 8-sided prism has at most a few dozen triangles', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    expect(countTriangles(g)).toBeLessThan(50);
  });

  it('is deterministic', () => {
    const g1 = buildWallSurfaceTextured(2, 3, mat);
    const g2 = buildWallSurfaceTextured(2, 3, mat);
    expect(countTriangles(g1)).toBe(countTriangles(g2));
  });
});

describe('buildWallSurfaceBlocks (Strategy G)', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it('produces finite, non-NaN geometry', () => {
    const g = buildWallSurfaceBlocks(2, 3, 42, mat);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildWallSurfaceBlocks(2, 3, 42, mat);
    const g2 = buildWallSurfaceBlocks(2, 3, 42, mat);
    expect(countTriangles(g1)).toBe(countTriangles(g2));
  });

  it('different seeds still produce the same triangle count (jitter affects size/position, not block count)', () => {
    const g1 = buildWallSurfaceBlocks(2, 3, 1, mat);
    const g2 = buildWallSurfaceBlocks(2, 3, 2, mat);
    expect(countTriangles(g1)).toBe(countTriangles(g2));
  });

  it('merges into very few draw calls regardless of block count (mergeGroupMeshesByMaterial ran)', () => {
    const g = buildWallSurfaceBlocks(2, 3, 42, mat, { blocksPerFace: 4, courseHeight: 0.3 });
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    // Many blocks (8 faces * 4 blocks/face * 10 courses = 320) must merge
    // down to a small handful of meshes (one shared material -> ~1 merged
    // mesh), not stay as 320 separate draw calls.
    expect(meshCount).toBeLessThan(5);
  });

  it('honours blocksPerFace/courseHeight options (more blocks -> more triangles)', () => {
    const coarse = buildWallSurfaceBlocks(2, 3, 42, mat, { blocksPerFace: 2, courseHeight: 1 });
    const fine = buildWallSurfaceBlocks(2, 3, 42, mat, { blocksPerFace: 4, courseHeight: 0.3 });
    expect(countTriangles(fine)).toBeGreaterThan(countTriangles(coarse));
  });
});

describe('buildWallSurface dispatcher', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it("'textured' dispatches to the cheap prism strategy", () => {
    const dispatched = buildWallSurface('textured', 2, 3, 42, mat);
    const direct = buildWallSurfaceTextured(2, 3, mat);
    expect(countTriangles(dispatched)).toBe(countTriangles(direct));
  });

  it("'blocks' dispatches to the real-geometry strategy", () => {
    const dispatched = buildWallSurface('blocks', 2, 3, 42, mat);
    const direct = buildWallSurfaceBlocks(2, 3, 42, mat);
    expect(countTriangles(dispatched)).toBe(countTriangles(direct));
  });

  it('WALL_STRATEGY (the shipped default) is "blocks" per the user\'s explicit preference for real geometry', () => {
    expect(WALL_STRATEGY).toBe('blocks');
  });
});

describe('Strategy T vs Strategy G -- measured comparison (answers "is real geometry too expensive?")', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it('records triangle count and generation time for both strategies at realistic tower-ring dimensions', () => {
    const radius = 2, height = 2.9; // one FLOOR_HEIGHT*0.9-ish ring
    const tStart = performance.now();
    const gTextured = buildWallSurfaceTextured(radius, height, mat);
    const tTexturedMs = performance.now() - tStart;

    const gStart = performance.now();
    const gBlocks = buildWallSurfaceBlocks(radius, height, 42, mat);
    const gBlocksMs = performance.now() - gStart;

    const trisTextured = countTriangles(gTextured);
    const trisBlocks = countTriangles(gBlocks);

    // eslint-disable-next-line no-console
    console.log(
      `[StoneTowerWallSurface T-vs-G] textured: ${trisTextured} tris in ${tTexturedMs.toFixed(2)}ms | ` +
      `blocks: ${trisBlocks} tris in ${gBlocksMs.toFixed(2)}ms (one wall ring, radius=${radius}, height=${height})`,
    );

    // Real assertions (not just logging): G has strictly more triangles
    // than T (expected -- that's the whole point of real geometry), but
    // both must still complete well within a single frame budget even at
    // this small unit-test scale (generous absolute ceiling, not a tight
    // flaky threshold) -- and G's per-ring triangle count must stay in a
    // sane range (not accidentally quadratic/exploding).
    expect(trisBlocks).toBeGreaterThan(trisTextured);
    expect(gBlocksMs).toBeLessThan(500);
    expect(trisBlocks).toBeLessThan(2000); // one ring; a whole tower stacks ~5 of these
  });
});
