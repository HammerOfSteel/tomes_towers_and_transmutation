/**
 * FactionBlockTextures.ts — Phase 2e.11 of the settlement visual fidelity
 * plan (docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md).
 *
 * Per-faction canvas textures for the shared `BlockKit.ts` engine's
 * palette materials. Unlike `TextureFactory.ts`'s human wall/roof
 * textures — which are designed as large wall-scale compositions and
 * rely on each caller computing a `repeat` proportional to that wall's
 * width/height — `blockGeometry()` now emits a *world-space-projected*
 * UV (see `BlockKit.ts`'s `UV_TILE_WU` constant and the doc comment on
 * `pushSideQuad()`), so every texture here is designed as a small,
 * densely-detailed, seamlessly-tileable swatch sampled at a fixed
 * ~1.5 WU period: the same canvas is reused verbatim across every block
 * of a given material in a building, and it's the *world-space* offset
 * baked into each block's UV — not a per-building `repeat` — that keeps
 * neighbouring blocks from looking like an obviously-stamped checkerboard.
 *
 * Each texture follows the same lazily-built-and-cached-canvas convention
 * as `TextureFactory.ts`: one `HTMLCanvasElement` built once (non-
 * deterministic `Math.random()`, fine since it's a shared "wallpaper"
 * pattern, not a per-building-seed asset), wrapped by `xTexture(repX,
 * repY)` into a fresh `THREE.CanvasTexture` per call so independent call
 * sites can tile independently without rebuilding the canvas. `repX`/
 * `repY` default to 1 (identity) since BlockKit's own UV projection
 * already carries the tiling period — callers only need to override it
 * for deliberate stylistic retuning.
 *
 * Slime is deliberately absent: its translucent gel material is built
 * from emissive/transparent `MeshStandardMaterial` alone (see
 * `FactionBuildingVariants.ts`'s slime builder) and should stay a smooth
 * glassy blob, not a textured surface.
 */

import * as THREE from 'three';

// ── Canvas element cache (one per type, built lazily) ─────────────────────────

let _earthCanvas:     HTMLCanvasElement | null = null;
let _graniteCanvas:   HTMLCanvasElement | null = null;
let _barkCanvas:      HTMLCanvasElement | null = null;
let _hideCanvas:      HTMLCanvasElement | null = null;
let _ashStoneCanvas:  HTMLCanvasElement | null = null;
let _obsidianCanvas:  HTMLCanvasElement | null = null;
let _toadstoolCanvas: HTMLCanvasElement | null = null;

// ── Internal helper ───────────────────────────────────────────────────────────

export function _wrap(t: THREE.CanvasTexture, rx: number, ry: number): THREE.CanvasTexture {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function _jitterPixels(g: CanvasRenderingContext2D, size: number, amp: number, tint: [number, number, number] = [1, 1, 0.7]): void {
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    d[i]!   = Math.max(0, Math.min(255, d[i]!   + n * tint[0]));
    d[i+1]! = Math.max(0, Math.min(255, d[i+1]! + n * tint[1]));
    d[i+2]! = Math.max(0, Math.min(255, d[i+2]! + n * tint[2]));
  }
  g.putImageData(img, 0, 0);
}

// ── Earth/root — vulperia den mounds ─────────────────────────────────────────
// Packed dirt with darker root-tendril squiggles and lighter clay clumps.

function _buildEarthCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return c;

  g.fillStyle = '#7a5a38';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 26, [1, 0.9, 0.6]);

  // Clay clumps — soft irregular blobs, lighter than the base.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const rx = 6 + Math.random() * 14, ry = 5 + Math.random() * 10;
    g.fillStyle = `rgba(150,110,70,${0.10 + Math.random() * 0.12})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Root tendrils — dark, thin, branching squiggles.
  g.strokeStyle = 'rgba(40,26,14,0.35)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 18; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 4 + Math.floor(Math.random() * 4);
    for (let s = 0; s < steps; s++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

// ── Granite/mortar — dwarven halls ───────────────────────────────────────────
// Cool grey salt-and-pepper speckle with fine mortar joint lines (denser,
// smaller-grained than human's coursed stoneTexture — reads as monumental
// dressed masonry, not rubble).

function _buildGraniteCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return c;

  g.fillStyle = '#6f7278';
  g.fillRect(0, 0, 256, 256);

  // Salt-and-pepper speckle (the classic granite look).
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const dark = Math.random() < 0.5;
    g.fillStyle = dark ? 'rgba(30,32,36,0.5)' : 'rgba(210,212,214,0.45)';
    g.fillRect(x, y, 1.4, 1.4);
  }

  // Mortar joints — a dressed-block grid, coarser than the speckle.
  const bw = 64, bh = 36, mortar = 3;
  let y = 0, row = 0;
  while (y < 260) {
    const offset = row % 2 === 0 ? 0 : bw / 2;
    let x = -offset;
    while (x < 260) {
      g.strokeStyle = 'rgba(20,20,22,0.4)';
      g.lineWidth = mortar;
      g.strokeRect(x, y, bw, bh);
      x += bw;
    }
    y += bh;
    row++;
  }
  return c;
}

// ── Bark — elven living trunks ────────────────────────────────────────────────
// Vertical wood-grain striations with occasional knots.

function _buildBarkCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return c;

  g.fillStyle = '#4a3826';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 20, [1, 0.85, 0.6]);

  // Vertical striations of varying width/darkness — the grain.
  let x = 0;
  while (x < 256) {
    const w = 3 + Math.random() * 7;
    const dark = Math.random() * 0.3;
    g.fillStyle = `rgba(20,14,8,${dark})`;
    g.fillRect(x, 0, w * 0.4, 256);
    g.fillStyle = `rgba(120,90,60,${0.06 + Math.random() * 0.08})`;
    g.fillRect(x + w * 0.4, 0, w * 0.6, 256);
    x += w;
  }
  // A couple of knots.
  for (let i = 0; i < 3; i++) {
    const kx = Math.random() * 256, ky = Math.random() * 256, kr = 6 + Math.random() * 8;
    const grad = g.createRadialGradient(kx, ky, 0, kx, ky, kr);
    grad.addColorStop(0, 'rgba(15,10,6,0.55)');
    grad.addColorStop(1, 'rgba(15,10,6,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(kx, ky, kr, kr * 1.3, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

// ── Hide/bone — orcish patchwork huts ────────────────────────────────────────
// Mottled tanned-hide patches with visible cross-stitch seams.

function _buildHideCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return c;

  g.fillStyle = '#8a6a48';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 28, [1, 0.8, 0.55]);

  // Mottled patches — irregular polygons of slightly different hide tone.
  for (let i = 0; i < 10; i++) {
    const cx = Math.random() * 256, cy = Math.random() * 256;
    const rad = 18 + Math.random() * 22;
    const sides = 5 + Math.floor(Math.random() * 3);
    g.fillStyle = `rgba(${100 + Math.random() * 40},${70 + Math.random() * 30},${40 + Math.random() * 20},0.22)`;
    g.beginPath();
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const r = rad * (0.75 + Math.random() * 0.5);
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }
  // Cross-stitch seams — sinew lacing between patches.
  g.strokeStyle = 'rgba(220,200,160,0.35)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    const y = Math.random() * 256;
    g.beginPath();
    for (let x = 0; x < 256; x += 10) {
      g.moveTo(x, y + (x % 20 === 0 ? -3 : 3));
      g.lineTo(x + 6, y + (x % 20 === 0 ? 3 : -3));
    }
    g.stroke();
  }
  return c;
}

// ── Ash-stone — undead ossuary tiers ─────────────────────────────────────────
// Pale grey cracked stone with soot smudges and hairline fractures.

function _buildAshStoneCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return c;

  g.fillStyle = '#5c5a58';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 22, [1, 1, 1]);

  // Soot smudges — dark soft patches.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 10 + Math.random() * 20;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(20,20,20,0.28)');
    grad.addColorStop(1, 'rgba(20,20,20,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Hairline fracture cracks — thin jagged lines.
  g.strokeStyle = 'rgba(15,15,15,0.4)';
  g.lineWidth = 0.8;
  for (let i = 0; i < 10; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 5 + Math.floor(Math.random() * 5);
    for (let s = 0; s < steps; s++) {
      x += (Math.random() - 0.5) * 24;
      y += (Math.random() - 0.5) * 24;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

// ── Obsidian-vein — vampire spires ───────────────────────────────────────────
// Near-black glossy base with thin glowing-ember-red veins threading through.

function _buildObsidianCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return c;

  g.fillStyle = '#15121a';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 10, [1, 1, 1.2]);

  // Glossy highlight streaks.
  g.strokeStyle = 'rgba(120,110,140,0.10)';
  g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const y = Math.random() * 256;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y + (Math.random() - 0.5) * 40);
    g.stroke();
  }
  // Blood-red veins — thin branching cracks with a faint glow.
  for (let i = 0; i < 9; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.strokeStyle = 'rgba(160,20,30,0.55)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 5 + Math.floor(Math.random() * 5);
    for (let s = 0; s < steps; s++) {
      x += (Math.random() - 0.5) * 30;
      y += (Math.random() - 0.5) * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

// ── Toadstool-skin — fae mushroom stalks ─────────────────────────────────────
// Damp mottled fungal skin with soft round gill-spots.

function _buildToadstoolCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return c;

  g.fillStyle = '#c8a888';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 20, [0.8, 1, 0.8]);

  // Soft mottled spots — the classic toadstool-cap freckling.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 4 + Math.random() * 9;
    g.fillStyle = `rgba(255,250,240,${0.18 + Math.random() * 0.2})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.7 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Faint damp sheen streaks.
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const y = Math.random() * 256;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y + (Math.random() - 0.5) * 30);
    g.stroke();
  }
  return c;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Packed dirt with root tendrils and clay clumps — vulperia den mounds. */
export function earthTexture(repX = 1, repY = 1): THREE.CanvasTexture {
  if (!_earthCanvas) _earthCanvas = _buildEarthCanvas();
  return _wrap(new THREE.CanvasTexture(_earthCanvas), repX, repY);
}

/** Cool grey speckled granite with dressed-block mortar joints — dwarven halls. */
export function graniteTexture(repX = 1, repY = 1): THREE.CanvasTexture {
  if (!_graniteCanvas) _graniteCanvas = _buildGraniteCanvas();
  return _wrap(new THREE.CanvasTexture(_graniteCanvas), repX, repY);
}

/** Vertical wood-grain bark with knots — elven living trunks. */
export function barkTexture(repX = 1, repY = 1): THREE.CanvasTexture {
  if (!_barkCanvas) _barkCanvas = _buildBarkCanvas();
  return _wrap(new THREE.CanvasTexture(_barkCanvas), repX, repY);
}

/** Mottled stitched hide/leather patchwork — orcish huts. */
export function hideTexture(repX = 1, repY = 1): THREE.CanvasTexture {
  if (!_hideCanvas) _hideCanvas = _buildHideCanvas();
  return _wrap(new THREE.CanvasTexture(_hideCanvas), repX, repY);
}

/** Pale ash-grey cracked stone with soot smudges — undead ossuary tiers. */
export function ashStoneTexture(repX = 1, repY = 1): THREE.CanvasTexture {
  if (!_ashStoneCanvas) _ashStoneCanvas = _buildAshStoneCanvas();
  return _wrap(new THREE.CanvasTexture(_ashStoneCanvas), repX, repY);
}

/** Near-black glossy obsidian with glowing blood-red veins — vampire spires. */
export function obsidianTexture(repX = 1, repY = 1): THREE.CanvasTexture {
  if (!_obsidianCanvas) _obsidianCanvas = _buildObsidianCanvas();
  return _wrap(new THREE.CanvasTexture(_obsidianCanvas), repX, repY);
}

/** Damp mottled fungal skin with soft spotting — fae toadstool stalks. */
export function toadstoolTexture(repX = 1, repY = 1): THREE.CanvasTexture {
  if (!_toadstoolCanvas) _toadstoolCanvas = _buildToadstoolCanvas();
  return _wrap(new THREE.CanvasTexture(_toadstoolCanvas), repX, repY);
}
