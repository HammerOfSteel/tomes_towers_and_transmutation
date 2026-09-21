/**
 * NatureAssetBuilder.ts — shared procedural canvas-texture factories for
 * overworld nature props. Three distinct texture families, assigned per
 * PART-TYPE (not per-archetype) per the approved design spec: bark
 * (`makeBarkCanvasTexture()`, trunks), foliage/mottled
 * (`makeMottledCanvasTexture()`, canopy blobs/bushes — the original single
 * family, kept as-is), and rock-facet (`makeRockFacetCanvasTexture()`,
 * rock-chunks). See
 * docs/superpowers/specs/2026-09-21-procedural-nature-asset-kit-design.md §3.3.
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

/**
 * Build a deterministic 64x64 vertical streaky/fibrous bark CanvasTexture —
 * the "trunk" texture family, distinct from `makeMottledCanvasTexture()`'s
 * round-blob "foliage" family (see design spec's "distinct texture families
 * per part-type" decision).
 *
 * @param baseColorHex  0xRRGGBB base color.
 * @param variance      0..1 — how much each stripe's brightness can deviate from the base.
 * @param seed          deterministic seed — same seed always produces the same texture.
 */
export function makeBarkCanvasTexture(
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

  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Thin vertical stripes of varying brightness — reads as fibrous bark
  // grain instead of the foliage family's round mottled patches.
  const stripeCount = 22;
  for (let i = 0; i < stripeCount; i++) {
    const x = rng() * TEX_SIZE;
    const w = 1 + rng() * 2.5;
    const delta = (rng() * 2 - 1) * variance * 255;
    const r = clamp255(br + delta);
    const g = clamp255(bg + delta);
    const b = clamp255(bb + delta);
    ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
    ctx.fillRect(x, 0, w, TEX_SIZE);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a deterministic 64x64 angular/speckled rock-facet CanvasTexture —
 * the "rock-chunk" texture family. Draws small hard-edged polygon speckles
 * instead of `makeMottledCanvasTexture()`'s round blobs, so it reads as
 * mineral/crystalline facets rather than organic mottling.
 *
 * @param baseColorHex  0xRRGGBB base color.
 * @param variance      0..1 — how much each speckle's brightness can deviate from the base.
 * @param seed          deterministic seed — same seed always produces the same texture.
 */
export function makeRockFacetCanvasTexture(
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

  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const speckleCount = 26;
  for (let i = 0; i < speckleCount; i++) {
    const cx = rng() * TEX_SIZE;
    const cy = rng() * TEX_SIZE;
    const radius = 2 + rng() * 5;
    const delta = (rng() * 2 - 1) * variance * 255;
    const cr = clamp255(br + delta);
    const cg = clamp255(bg + delta);
    const cb = clamp255(bb + delta);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.65)`;
    ctx.beginPath();
    // Hard-edged 3- or 4-sided facet instead of arc() — reads angular, not round.
    const sides = 3 + Math.floor(rng() * 2);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + rng() * 0.4;
      const px = cx + Math.cos(a) * radius;
      const py = cy + Math.sin(a) * radius;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
