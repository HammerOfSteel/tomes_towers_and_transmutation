/**
 * LashedTimber.test.ts — the orcish equivalent of `buildWallSurfaceBlocks()`
 * (docs/superpowers/specs/2026-09-04-orcish-buildings-design.md section 5):
 * discrete tapered-log courses (not a single wall-sized box/grid mesh),
 * staggered seams, visible end-grain caps, plus posts/braces/lashing bands
 * for the doctrine's depth-ladder joint vocabulary.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildTaperedLog,
  buildLogCourseWall,
  buildPostFrame,
  buildCrossBrace,
  buildLashingBand,
} from '@/world/buildings/kit/LashedTimber';
import { rectangleFaces, octagonFaces } from '@/world/buildings/StoneTowerShape';

function countMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
  return n;
}

function hasNaN(root: THREE.Object3D): boolean {
  let bad = false;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const pos = (o as THREE.Mesh).geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) if (!Number.isFinite(pos.array[i])) bad = true;
    }
  });
  return bad;
}

function boundsOf(root: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(root);
}

describe('buildTaperedLog', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#5a4530' });

  it('builds a single tapered cylindrical member with distinct top/base radii (not a uniform cylinder)', () => {
    const log = buildTaperedLog({ length: 1, radiusBase: 0.1, radiusTop: 0.07, material: mat });
    expect(log).toBeInstanceOf(THREE.Mesh);
    const geo = (log as THREE.Mesh).geometry as THREE.CylinderGeometry;
    expect(geo.parameters.radiusBottom).toBeCloseTo(0.1, 5);
    expect(geo.parameters.radiusTop).toBeCloseTo(0.07, 5);
  });

  it('carries a uv attribute (regression: hand-rolled geometry without uv silently breaks mergeGeometries)', () => {
    const log = buildTaperedLog({ length: 1, radiusBase: 0.1, radiusTop: 0.07, material: mat });
    expect((log as THREE.Mesh).geometry.attributes.uv).toBeTruthy();
  });

  it('produces finite geometry', () => {
    const log = buildTaperedLog({ length: 1.3, radiusBase: 0.12, radiusTop: 0.08, material: mat });
    expect(hasNaN(log)).toBe(false);
  });
});

describe('buildLogCourseWall', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#5a4530' });
  const faces = rectangleFaces(2, 1.5);

  it('is built from many individual log members, not one wall-sized box/grid mesh', () => {
    const wall = buildLogCourseWall(faces, 2, 42, mat);
    // Before the shared mergeGroupMeshesByMaterial() pass collapses draw
    // calls, the underlying construction must be many discrete log
    // segments -- verified via triangle count far exceeding a single box
    // (12 tris) or single per-face prism.
    let tris = 0;
    wall.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const pos = (o as THREE.Mesh).geometry.attributes.position;
        const g = (o as THREE.Mesh).geometry;
        tris += g.index ? g.index.count / 3 : pos.count / 3;
      }
    });
    expect(tris).toBeGreaterThan(200);
  });

  it('produces finite, non-NaN geometry', () => {
    const wall = buildLogCourseWall(faces, 2, 42, mat);
    expect(hasNaN(wall)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const w1 = buildLogCourseWall(faces, 2, 42, mat);
    const w2 = buildLogCourseWall(faces, 2, 42, mat);
    expect(countMeshes(w1)).toBe(countMeshes(w2));
  });

  it('merges into very few draw calls regardless of log count (shared material bucketing)', () => {
    const wall = buildLogCourseWall(faces, 2, 42, mat, { logsPerFace: 4, courseHeight: 0.35 });
    expect(countMeshes(wall)).toBeLessThan(5);
  });

  it('honours logsPerFace/courseHeight options (more logs -> more triangles)', () => {
    function triCount(g: THREE.Group): number {
      let t = 0;
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const geo = (o as THREE.Mesh).geometry;
          t += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
        }
      });
      return t;
    }
    const coarse = buildLogCourseWall(faces, 2, 42, mat, { logsPerFace: 2, courseHeight: 1 });
    const fine = buildLogCourseWall(faces, 2, 42, mat, { logsPerFace: 5, courseHeight: 0.3 });
    expect(triCount(fine)).toBeGreaterThan(triCount(coarse));
  });

  it('works on an octagon face list too (not rectangle-only)', () => {
    const octFaces = octagonFaces(2);
    const wall = buildLogCourseWall(octFaces, 2, 7, mat);
    expect(hasNaN(wall)).toBe(false);
    expect(countMeshes(wall)).toBeGreaterThan(0);
  });

  it('stays roughly within the given faces footprint (no wildly escaped logs)', () => {
    // A small running-bond corner-wraparound overhang is expected/documented
    // behavior (same as buildWallSurfaceBlocks()'s own known corner overhang),
    // not a bug -- generous but still bounded margin.
    const wall = buildLogCourseWall(faces, 2, 42, mat);
    const box = boundsOf(wall);
    expect(box.max.x).toBeLessThan(2.7);
    expect(box.min.x).toBeGreaterThan(-2.7);
    expect(box.max.z).toBeLessThan(2.2);
    expect(box.min.z).toBeGreaterThan(-2.2);
  });
});

describe('buildPostFrame', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#4a3826' });
  const faces = rectangleFaces(2, 1.5);

  function triCount(g: THREE.Group): number {
    let t = 0;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const geo = (o as THREE.Mesh).geometry;
        t += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      }
    });
    return t;
  }

  it('places multiple upright tapered posts along the given faces', () => {
    // Posts share one material and are merged (mergeGroupMeshesByMaterial),
    // so assert via triangle count (proportional to post count), not raw
    // mesh count -- mirrors buildLogCourseWall's own merged-mesh-count test.
    const posts = buildPostFrame(faces, 2.5, 11, mat);
    expect(triCount(posts)).toBeGreaterThan(4 * 8 * 2); // >4 posts * 8 radial segs * ~2 tris/quad
  });

  it('is deterministic for the same seed', () => {
    const p1 = buildPostFrame(faces, 2.5, 11, mat);
    const p2 = buildPostFrame(faces, 2.5, 11, mat);
    expect(triCount(p1)).toBe(triCount(p2));
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildPostFrame(faces, 2.5, 11, mat))).toBe(false);
  });

  it('honours postSpacing (tighter spacing -> more posts)', () => {
    const sparse = buildPostFrame(faces, 2.5, 11, mat, { postSpacing: 2.0 });
    const dense = buildPostFrame(faces, 2.5, 11, mat, { postSpacing: 0.5 });
    expect(triCount(dense)).toBeGreaterThan(triCount(sparse));
  });
});

describe('buildCrossBrace', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#4a3826' });

  it('builds a single tapered log spanning two arbitrary 3D points', () => {
    const brace = buildCrossBrace(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 2, 0.3), 0.05, mat);
    expect(hasNaN(brace)).toBe(false);
    const box = new THREE.Box3().setFromObject(brace);
    // Spans roughly from A to B.
    expect(box.min.y).toBeLessThan(0.3);
    expect(box.max.y).toBeGreaterThan(1.7);
  });
});

describe('buildLashingBand', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#2a1c10' });
  const faces = rectangleFaces(2, 1.5);

  it('wraps a proud band around the given faces at height y', () => {
    const band = buildLashingBand(faces, 1.2, mat);
    expect(countMeshes(band)).toBeGreaterThan(0);
    expect(hasNaN(band)).toBe(false);
  });

  it('sits proud of the wall face (per depth ladder), not flush/coplanar', () => {
    const band = buildLashingBand(faces, 1.2, mat);
    let anyProud = false;
    band.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const box = new THREE.Box3().setFromObject(o);
        // Rectangle half-extents are 2/1.5 -- a proud band on the +X face
        // must protrude past x=2.
        if (box.max.x > 2.001 || box.min.x < -2.001 || box.max.z > 1.501 || box.min.z < -1.501) anyProud = true;
      }
    });
    expect(anyProud).toBe(true);
  });
});
