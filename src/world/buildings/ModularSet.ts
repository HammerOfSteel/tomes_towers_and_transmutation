/**
 * ModularSet.ts — PROC-C1b
 * Vocabulary of reusable building geometry pieces.
 * All built from THREE.js primitives — no external assets.
 */

import * as THREE from 'three';
import type { BuildingColors, BuildingCondition } from './BuildingDNA';
import { mulberry32 } from '@/core/prng';

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

// ── Window-box planter ────────────────────────────────────────────────────────
// Phase 2e.10 human greebling — a small BlockKit-scale decorative cluster
// (a built wooden trough + a handful of jittered foliage/flower blobs)
// meant to sit just under a ground-floor window, centred at local origin
// with the trough's *front* face at z=0 (caller offsets to the window).

const FOLIAGE_PALETTE = ['#3a6b2e', '#4a7a38', '#5a8a44', '#2f5a26'];
const FLOWER_PALETTE   = ['#c0405a', '#d0a030', '#c8c8d8', '#8a4ac0'];

export function windowBoxPlanter(colors: BuildingColors, seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry32(seed ^ 0xB0C0FF00);

  const troughW = 0.85, troughH = 0.22, troughD = 0.24;
  const troughMat = makeBuildingMat(colors.trim, 0.9);
  const trough = new THREE.Mesh(new THREE.BoxGeometry(troughW, troughH, troughD), troughMat);
  trough.castShadow = trough.receiveShadow = true;
  g.add(trough);

  // A thin soil band peeking over the trough rim, so foliage doesn't look
  // like it floats directly on the wood lip.
  const soil = new THREE.Mesh(
    new THREE.BoxGeometry(troughW * 0.92, 0.05, troughD * 0.8),
    makeBuildingMat('#3a2c1c', 0.95),
  );
  soil.position.y = troughH / 2 + 0.02;
  g.add(soil);

  const numFoliage = 3 + Math.floor(r() * 3); // 3..5 blobs
  for (let i = 0; i < numFoliage; i++) {
    const t = numFoliage === 1 ? 0.5 : i / (numFoliage - 1);
    const fx = (t - 0.5) * troughW * 0.82 + (r() - 0.5) * 0.05;
    const radius = 0.09 + r() * 0.06;
    const foliageMat = makeBuildingMat(FOLIAGE_PALETTE[Math.floor(r() * FOLIAGE_PALETTE.length)]!, 0.95);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(radius, 6, 5), foliageMat);
    blob.position.set(fx, troughH / 2 + radius * 0.65, (r() - 0.5) * 0.06);
    blob.scale.y = 0.85 + r() * 0.3;
    blob.castShadow = true;
    g.add(blob);

    // Occasional small flower accent poking out of a foliage blob.
    if (r() > 0.45) {
      const flowerMat = makeBuildingMat(FLOWER_PALETTE[Math.floor(r() * FLOWER_PALETTE.length)]!, 0.6);
      const flower = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.32, 5, 4), flowerMat);
      flower.position.set(fx + (r() - 0.5) * 0.04, troughH / 2 + radius * 1.4, (r() - 0.5) * 0.05);
      g.add(flower);
    }
  }

  return g;
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
