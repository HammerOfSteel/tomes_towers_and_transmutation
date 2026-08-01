/**
 * NatureAssetBuilder.ts — shared procedural canvas-texture factory for
 * overworld nature props (tree canopies, bush foliage, rock surfaces).
 *
 * Follows the same THREE.CanvasTexture pattern already used elsewhere in
 * this codebase (src/showroom.ts's makeCheckerFloor, FloatingDialogue3D.ts's
 * speech-bubble textures) — a small offscreen 2D canvas painted with
 * deterministic noise, wrapped as a texture. No external image files.
 */
import * as THREE from 'three';

const TEX_SIZE = 64;

/** Simple deterministic PRNG (mulberry32-style) local to this module — avoids a
 * hard dependency on core/prng.ts's exact API surface for this narrow use. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Build a deterministic 64x64 mottled-noise CanvasTexture: a base color with
 * randomized per-blob brightness variation, giving foliage/stone materials a
 * less flat-shaded look without external texture files.
 *
 * @param baseColorHex  0xRRGGBB base color.
 * @param variance      0..1 — how much per-blob brightness can deviate from the base.
 * @param seed          deterministic seed — same seed always produces the same texture.
 */
export function makeMottledCanvasTexture(
  baseColorHex: number,
  variance: number,
  seed: number,
): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = TEX_SIZE;
  cv.height = TEX_SIZE;
  const ctx = cv.getContext('2d')!;
  const [br, bg, bb] = hexToRgb(baseColorHex);

  const rng = makeRng(seed);

  // Base fill.
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Scatter mottled blobs — coarse patches of slightly lighter/darker tone.
  const blobCount = 18;
  for (let i = 0; i < blobCount; i++) {
    const cx = rng() * TEX_SIZE;
    const cy = rng() * TEX_SIZE;
    const radius = 4 + rng() * 10;
    const delta = (rng() * 2 - 1) * variance * 255;
    const r = clamp255(br + delta);
    const g = clamp255(bg + delta);
    const b = clamp255(bb + delta);
    ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
