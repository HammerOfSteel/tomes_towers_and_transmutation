/**
 * ModularSet.ts — PROC-C1b
 * Vocabulary of reusable building geometry pieces.
 * All built from THREE.js primitives — no external assets.
 */

import * as THREE from 'three';
import type { BuildingColors, BuildingCondition } from './BuildingDNA';

// ── Material factory ──────────────────────────────────────────────────────────

export function makeBuildingMat(
  hex: string,
  roughness = 0.85,
  condition: BuildingCondition = 'pristine',
): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
  // Condition darkens the material
  const mult = condition === 'ruined' ? 0.55 : condition === 'damaged' ? 0.72 : condition === 'weathered' ? 0.88 : 1.0;
  if (mult < 1) mat.color.multiplyScalar(mult);
  return mat;
}

function makeWireOverlay(hex: string): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.18 }));
}

// ── Wall segment ──────────────────────────────────────────────────────────────

/** Solid wall panel: `w` × `h` × 0.25 centred at origin. */
export function wallSegment(w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), mat);
  mesh.castShadow = true;
  return mesh;
}

// ── Window ────────────────────────────────────────────────────────────────────

/** Window cutout visual (no physics). */
export function windowPanel(colors: BuildingColors): THREE.Group {
  const g = new THREE.Group();
  // Frame
  const frameMat = makeBuildingMat(colors.trim);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.15), frameMat);
  g.add(frame);
  // Glass pane
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xd0e8ff, transparent: true, opacity: 0.4 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.06), glassMat);
  glass.position.z = 0.06;
  g.add(glass);
  // Cross bar
  const crossMat = makeBuildingMat(colors.trim);
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.09), crossMat);
  hBar.position.z = 0.1;
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.09), crossMat);
  vBar.position.z = 0.1;
  g.add(hBar, vBar);
  return g;
}

// ── Door ──────────────────────────────────────────────────────────────────────

export function doorPanel(colors: BuildingColors): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, 0.18), makeBuildingMat(colors.trim));
  g.add(frame);
  const door  = new THREE.Mesh(new THREE.BoxGeometry(0.88, 2.1, 0.1), makeBuildingMat(colors.door));
  door.position.z = 0.05;
  g.add(door);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), makeBuildingMat(colors.trim));
  handle.position.set(0.28, -0.15, 0.15);
  g.add(handle);
  return g;
}

// ── Roof variants ─────────────────────────────────────────────────────────────
// Ported from hiraeth/poc/stack-a BuildingFactory.ts (feat/city-assets-phase4)
// Uses explicit vertex arrays with correct CCW winding — no geometry artefacts.

/**
 * Pitched (gabled) roof — ridge runs along X axis.
 * `w` = building width (X), `d` = depth (Z), pitch = rise/run ratio.
 */
export function pitchedRoof(w: number, d: number, pitch = 0.55, mat: THREE.Material): THREE.Mesh {
  const hw = w / 2, hd = d / 2, rh = w * pitch;
  const pos = new Float32Array([
    -hw, 0, -hd,   // 0 front-left
     hw, 0, -hd,   // 1 front-right
     hw, 0,  hd,   // 2 back-right
    -hw, 0,  hd,   // 3 back-left
     0,  rh, -hd,  // 4 front ridge — gable peak at front
     0,  rh,  hd,  // 5 back ridge  — gable peak at back
  ]);
  const idx = new Uint16Array([
    // Left slope  (0, 3, 5, 4)
    0, 3, 5,  0, 5, 4,
    // Right slope (1, 4, 5, 2)
    1, 4, 5,  1, 5, 2,
    // Front gable (0, 4, 1)
    0, 4, 1,
    // Back gable  (3, 2, 5)
    3, 2, 5,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Hipped roof — 4 sloped faces, ridge shorter than depth, runs along X.
 * `hipFrac` controls how much the ends are cut in (0.25–0.35 looks good).
 */
export function hippedRoof(w: number, d: number, pitch = 0.50, hipFrac = 0.28, mat: THREE.Material): THREE.Mesh {
  const hw = w / 2, hd = d / 2;
  const rh  = w * pitch;
  const hip = d * hipFrac;   // end cut-in distance
  const rl  = hd - hip;      // half-ridge length

  const pos = new Float32Array([
    -hw, 0, -hd,   // 0 front-left
     hw, 0, -hd,   // 1 front-right
     hw, 0,  hd,   // 2 back-right
    -hw, 0,  hd,   // 3 back-left
    -hw, rh, -rl,  // 4 left-front ridge
     hw, rh, -rl,  // 5 right-front ridge
     hw, rh,  rl,  // 6 right-back ridge
    -hw, rh,  rl,  // 7 left-back ridge
  ]);
  const idx = new Uint16Array([
    // Front hip face (0,1,5,4)
    0, 1, 5,  0, 5, 4,
    // Back hip face  (3,7,6,2)
    3, 7, 6,  3, 6, 2,
    // Left end face  (0,4,7,3)
    0, 4, 7,  0, 7, 3,
    // Right end face (1,2,6,5)
    1, 2, 6,  1, 6, 5,
    // Ridge quad     (4,5,6,7)
    4, 5, 6,  4, 6, 7,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/** Thatched roof: pitched + straw-band overlays running along Z. */
export function thatchedRoof(w: number, d: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(pitchedRoof(w, d, 0.52, mat));
  // Straw bands — thin strips lying on the slope faces, running full depth (Z axis)
  const bandMat  = makeBuildingMat('#b09050');
  const rh       = w * 0.52;          // ridge height
  const hw       = w / 2;             // half-width
  const slopeLen = Math.sqrt(hw * hw + rh * rh);
  const angle    = Math.atan2(rh, hw); // slope angle from horizontal
  const numBands = Math.max(3, Math.floor(slopeLen / 0.85));

  for (let i = 0; i < numBands; i++) {
    const t  = (i + 0.5) / numBands;  // 0 = near eave, 1 = near ridge
    const bx = hw * (1 - t);           // X from centre: hw at eave, 0 at ridge
    const by = rh * t;                  // Y: 0 at eave, rh at ridge
    for (const side of [-1, 1] as const) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.14, d * 0.97), // strip runs along Z
        bandMat,
      );
      // Tilt band to lie flush against the sloped face
      band.rotation.z = -side * angle;
      band.position.set(side * bx, by, 0);
      g.add(band);
    }
  }
  return g;
}

// ── Chimney ───────────────────────────────────────────────────────────────────

export function chimney(h: number, mat: THREE.Material): THREE.Group {
  const g    = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.55), mat);
  body.position.y = h / 2;
  const cap  = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.75), mat);
  cap.position.y = h + 0.06;
  g.add(body, cap);
  return g;
}

// ── Corner post ───────────────────────────────────────────────────────────────

export function cornerPost(h: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.18), mat);
  mesh.position.y = h / 2;
  return mesh;
}

// ── Step ──────────────────────────────────────────────────────────────────────

export function doorStep(mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.6), mat);
  mesh.position.set(0, 0.1, 0.3);
  return mesh;
}

// ── Sign ──────────────────────────────────────────────────────────────────────

export function hangingSign(colors: BuildingColors): THREE.Group {
  const g    = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), makeBuildingMat(colors.trim));
  post.position.y = 0.27;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.28, 0.06), makeBuildingMat(colors.walls));
  board.position.y = -0.02;
  const outline = makeWireOverlay(colors.trim);
  outline.scale.set(0.65, 0.28, 0.06);
  g.add(post, board, outline);
  return g;
}
