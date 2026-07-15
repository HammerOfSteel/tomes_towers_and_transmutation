/**
 * ProceduralProps — Phase 7.5b
 *
 * Factory functions that return `THREE.Group` objects for in-world props.
 * Each prop is assembled from standard Three.js geometries (no CSG needed).
 *
 * All geometry is cached via GeometryCache where shared between instances;
 * material references are passed in so the caller controls appearance.
 *
 * Available builders:
 *   buildCauldron(mat, glowMat)  — Lathe-profile bowl, torus rim, 3 legs, liquid
 *   buildGoblet(mat)             — Lathe goblet/chalice silhouette
 *   buildArch(mat, width?, ht?)  — Two box piers + half-torus arch span
 *   buildBookStack(mat)          — Thin layered quads with ragged height
 *   buildLantern(mat, coreMat)   — Cage box + inner light core sphere
 */

import * as THREE from 'three';
import { GeometryCache } from '@/rendering/GeometryCache';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convenience: create a mesh, set castShadow, add to group, return mesh. */
function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  grp: THREE.Group,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  grp.add(m);
  return m;
}

// ── Cauldron ──────────────────────────────────────────────────────────────────

/**
 * A proper cauldron built from a lathe-profile bowl, torus rim, and 3 legs.
 *
 *       ___________   ← torus rim
 *      /   liquid  \  ← circle face (glowMat)
 *     | bowl (lathe)|
 *      \___________/
 *       | |    | |    ← 3 legs (cylinder)
 *
 * Origin is at the base of the legs (floor level).
 */
export function buildCauldron(
  ironMat: THREE.Material,
  glowMat: THREE.Material,
): THREE.Group {
  const grp = new THREE.Group();

  // Bowl — lathe profile curve (outer silhouette, half-section)
  const bowlGeo = GeometryCache.get('prop_cauldron_bowl', () => {
    const profile: THREE.Vector2[] = [];
    // Profile points: bottom-center → outer bottom → side → rim
    profile.push(new THREE.Vector2(0.00, 0.00));   // center base
    profile.push(new THREE.Vector2(0.35, 0.05));   // outer base corner
    profile.push(new THREE.Vector2(0.90, 0.30));   // lower belly
    profile.push(new THREE.Vector2(1.05, 0.65));   // mid belly (widest)
    profile.push(new THREE.Vector2(1.00, 1.00));   // upper bowl
    profile.push(new THREE.Vector2(1.05, 1.10));   // slight flare to rim
    return new THREE.LatheGeometry(profile, 16);
  });

  const bowl = mesh(bowlGeo, ironMat, grp);
  bowl.position.y = 0.3;   // legs lift bowl off floor

  // Rim ring
  const rimGeo = GeometryCache.get('prop_cauldron_rim', () =>
    new THREE.TorusGeometry(1.05, 0.07, 8, 20),
  );
  const rimMesh = mesh(rimGeo, ironMat, grp);
  rimMesh.position.y = 1.40;
  rimMesh.rotation.x = Math.PI / 2;

  // Glowing liquid surface
  const liquidGeo = GeometryCache.get('prop_cauldron_liquid', () => {
    const g = new THREE.CircleGeometry(0.90, 16);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const liquidMesh = new THREE.Mesh(liquidGeo, glowMat);
  liquidMesh.position.y = 1.41;
  grp.add(liquidMesh);

  // Three legs
  const legGeo = GeometryCache.get('prop_cauldron_leg', () =>
    new THREE.CylinderGeometry(0.07, 0.09, 0.35, 6),
  );
  for (let li = 0; li < 3; li++) {
    const angle = (li / 3) * Math.PI * 2;
    const leg = mesh(legGeo, ironMat, grp);
    leg.position.set(Math.cos(angle) * 0.80, 0.175, Math.sin(angle) * 0.80);
  }

  return grp;
}

// ── Goblet / Chalice ──────────────────────────────────────────────────────────

/**
 * A decorative goblet built from a lathe profile.
 * Scaled to about 0.4 WU tall — suitable for a desk/altar prop.
 */
export function buildGoblet(mat: THREE.Material): THREE.Group {
  const grp = new THREE.Group();

  const gobletGeo = GeometryCache.get('prop_goblet', () => {
    const pts: THREE.Vector2[] = [
      new THREE.Vector2(0.00, 0.00),   // foot center
      new THREE.Vector2(0.22, 0.01),   // foot edge
      new THREE.Vector2(0.20, 0.04),   // foot top
      new THREE.Vector2(0.08, 0.10),   // stem narrow
      new THREE.Vector2(0.07, 0.24),   // stem top
      new THREE.Vector2(0.15, 0.27),   // cup base
      new THREE.Vector2(0.28, 0.30),   // cup lower bowl
      new THREE.Vector2(0.33, 0.37),   // cup widest
      new THREE.Vector2(0.30, 0.40),   // cup rim
    ];
    return new THREE.LatheGeometry(pts, 12);
  });

  mesh(gobletGeo, mat, grp);
  return grp;
}

// ── Arch ─────────────────────────────────────────────────────────────────────

/**
 * A doorway arch: two rectangular stone piers + a half-torus arch span.
 *
 * @param mat      Stone material.
 * @param width    Inner opening width in WU (default 2.0).
 * @param height   Total arch height in WU (default 3.5).
 */
export function buildArch(
  mat: THREE.Material,
  width = 2.0,
  height = 3.5,
): THREE.Group {
  const grp = new THREE.Group();

  const pierW = 0.5;
  const pierH = height - width / 2;  // pier height below the arch curve
  const archR = width / 2 + pierW / 2;

  // Left pier
  const pierGeo = GeometryCache.get(
    `prop_arch_pier_${pierW.toFixed(2)}x${pierH.toFixed(2)}`,
    () => new THREE.BoxGeometry(pierW, pierH, pierW),
  );
  const leftPier = mesh(pierGeo, mat, grp);
  leftPier.position.set(-(width / 2 + pierW / 2), pierH / 2, 0);

  // Right pier
  const rightPier = mesh(pierGeo, mat, grp);
  rightPier.position.set(width / 2 + pierW / 2, pierH / 2, 0);

  // Half-torus arch span (top 180°)
  const spanGeo = GeometryCache.get(
    `prop_arch_span_r${archR.toFixed(2)}`,
    () => new THREE.TorusGeometry(archR, pierW / 2, 8, 16, Math.PI),
  );
  const span = mesh(spanGeo, mat, grp);
  span.position.y = pierH;
  span.rotation.z = Math.PI;   // open side faces down

  return grp;
}

// ── Book stack ────────────────────────────────────────────────────────────────

/**
 * A small stack of 3–5 slightly offset books on a surface.
 * Height ≈ 0.45 WU.
 */
export function buildBookStack(mat: THREE.Material): THREE.Group {
  const grp = new THREE.Group();

  const BOOKS = [
    { w: 0.55, h: 0.12, d: 0.40, y: 0.06,  rx: 0,    rz: 0 },
    { w: 0.50, h: 0.10, d: 0.36, y: 0.17, rx: 0,    rz: 0.05 },
    { w: 0.48, h: 0.10, d: 0.38, y: 0.27, rx: 0.03, rz: -0.04 },
    { w: 0.52, h: 0.10, d: 0.42, y: 0.37, rx: 0,    rz: 0.08 },
  ];

  for (const b of BOOKS) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = b.y;
    m.rotation.x = b.rx;
    m.rotation.z = b.rz;
    m.castShadow = true;
    grp.add(m);
  }

  return grp;
}

// ── Lantern ───────────────────────────────────────────────────────────────────

/**
 * A hanging lantern cage with a glowing inner sphere.
 * Scaled to ≈ 0.5 WU tall.
 *
 * @param cageMat   Metal cage material.
 * @param coreMat   Emissive inner flame material.
 */
export function buildLantern(
  cageMat: THREE.Material,
  coreMat: THREE.Material,
): THREE.Group {
  const grp = new THREE.Group();

  // Cage — thin-walled box with open faces (wireframe visual; MeshStandard handles it)
  const cageGeo = GeometryCache.get('prop_lantern_cage', () =>
    new THREE.BoxGeometry(0.25, 0.35, 0.25),
  );
  mesh(cageGeo, cageMat, grp);

  // Inner flame sphere
  const flameGeo = GeometryCache.get('prop_lantern_flame', () =>
    new THREE.SphereGeometry(0.08, 6, 6),
  );
  const flame = new THREE.Mesh(flameGeo, coreMat);
  flame.position.y = 0.02;
  grp.add(flame);

  // Hook stem
  const hookGeo = GeometryCache.get('prop_lantern_hook', () =>
    new THREE.CylinderGeometry(0.015, 0.015, 0.18, 4),
  );
  const hook = mesh(hookGeo, cageMat, grp);
  hook.position.y = 0.265;

  return grp;
}
