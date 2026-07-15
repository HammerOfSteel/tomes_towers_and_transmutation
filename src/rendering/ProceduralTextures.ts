/**
 * ProceduralTextures — Phase 7.5b
 *
 * Generates canvas-based procedural textures for the game's materials.
 * All textures are 256×256, created once and wrapped as `THREE.CanvasTexture`.
 *
 * Each function accepts an optional integer `seed` for deterministic output.
 *
 * Available textures:
 *   makeStoneTexture(seed?)   — Voronoi-crack stone; grey + warm hue variation
 *   makeWoodGrainTexture(seed?) — Ring-and-stripe wood; warm brown palette
 *   makeMossOverlay(seed?, intensity?) — Stipple moss spots; semi-transparent
 *   makeRuneEmissiveMap(seed?, tint?)  — Angular rune glyphs; dark background
 */

import * as THREE from 'three';

// ── Seeded PRNG (mulberry32, no external dep) ─────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

/** Create a 2D canvas of the given size. Works in browser and test (jsdom). */
function makeCanvas(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function getCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext('2d');
}

// ── Voronoi helper ────────────────────────────────────────────────────────────

/** Fast approximate Voronoi distances on a [0,1] grid (torus-wrapped). */
function voronoiField(
  width: number,
  height: number,
  numPoints: number,
  rand: () => number,
): Float32Array {
  const pts: [number, number][] = Array.from({ length: numPoints }, () => [
    rand() * width,
    rand() * height,
  ]);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minD = 1e9, min2 = 1e9;
      for (const [px, py] of pts) {
        const dx = Math.min(Math.abs(x - px), width - Math.abs(x - px));
        const dy = Math.min(Math.abs(y - py), height - Math.abs(y - py));
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minD) { min2 = minD; minD = d; }
        else if (d < min2) { min2 = d; }
      }
      // Edge brightness = distance-to-nearest - distance-to-second-nearest
      out[y * width + x] = min2 - minD;
    }
  }
  return out;
}

// ── Stone texture ─────────────────────────────────────────────────────────────

/**
 * Generates a 256×256 stone texture.
 *
 * Approach:
 *  1. Paint a mid-grey base with slight brightness variation.
 *  2. Compute Voronoi cells — dark edges = mortar lines / cracks.
 *  3. Overlay light/dark noise for surface roughness.
 *  4. Slight sepia/warm hue tint per cell.
 */
export function makeStoneTexture(seed = 42): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = makeCanvas(SIZE);
  const ctx = getCtx(canvas);
  const rand = mulberry32(seed);

  if (ctx) {
    // 1. Background: mid-grey gradient noise
    const imgData = ctx.createImageData(SIZE, SIZE);
    const d = imgData.data;
    const voronoi = voronoiField(SIZE, SIZE, 40, rand);

    // Find voronoi range for normalisation
    let vMax = 0;
    for (let i = 0; i < voronoi.length; i++) if (voronoi[i] > vMax) vMax = voronoi[i];

    for (let i = 0; i < SIZE * SIZE; i++) {
      // Base grey with low-frequency noise
      const noise = (rand() - 0.5) * 28;
      let grey = 130 + noise;

      // Voronoi edge → darken at mortar lines
      const v = voronoi[i] / (vMax + 0.01);
      const edgeDark = Math.max(0, 1 - v * 7) * 55;
      grey -= edgeDark;

      // Tiny surface pitting
      const pit = rand() < 0.015 ? -35 : 0;
      grey += pit;

      // Warm tone: slight reddish-orange hue drift per-pixel
      const r = Math.min(255, Math.max(0, grey + rand() * 10 - 3));
      const g = Math.min(255, Math.max(0, grey - 3));
      const b = Math.min(255, Math.max(0, grey - 10));

      d[i * 4    ] = r;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// ── Wood grain texture ────────────────────────────────────────────────────────

/**
 * Generates a 256×256 wood grain texture.
 *
 * Approach:
 *  1. Warm brown base with ring distortion (circular "annual rings").
 *  2. Horizontal sine-wave stripe variation for plank grain.
 *  3. Knot: dark oval with radiating ring distortion.
 */
export function makeWoodGrainTexture(seed = 7): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = makeCanvas(SIZE);
  const ctx = getCtx(canvas);
  const rand = mulberry32(seed);

  if (ctx) {
    const imgData = ctx.createImageData(SIZE, SIZE);
    const d = imgData.data;

    // Knot positions (0–3 per texture)
    const numKnots = 1 + Math.floor(rand() * 2);
    const knots: [number, number, number][] = Array.from({ length: numKnots }, () => [
      0.1 + rand() * 0.8,
      0.1 + rand() * 0.8,
      20 + rand() * 30,
    ]);

    const CENTER_X = (0.3 + rand() * 0.4) * SIZE;
    const CENTER_Y = (0.3 + rand() * 0.4) * SIZE;
    const RING_PERIOD = 18 + rand() * 12;

    for (let i = 0; i < SIZE * SIZE; i++) {
      const x = i % SIZE;
      const y = (i / SIZE) | 0;

      let dx = x - CENTER_X;
      let dy = y - CENTER_Y;

      for (const [kx, ky, kr] of knots) {
        const kkx = kx * SIZE - x;
        const kky = ky * SIZE - y;
        const kd = Math.sqrt(kkx * kkx + kky * kky) + 0.1;
        const influence = Math.exp(-kd / kr) * 18;
        dx += (kkx / kd) * influence;
        dy += (kky / kd) * influence;
      }

      const ringDist = Math.sqrt(dx * dx + dy * dy);
      const ringPhase = (ringDist / RING_PERIOD) * Math.PI * 2;
      const ringBand = Math.sin(ringPhase + rand() * 0.4) * 0.5 + 0.5;
      const stripe = Math.sin((y * 0.35 + rand() * 2) * 0.8) * 0.5 + 0.5;
      const grain = ringBand * 0.7 + stripe * 0.3;

      d[i * 4    ] = Math.min(255, Math.max(0, 60  + grain * 120 + (rand() - 0.5) * 15));
      d[i * 4 + 1] = Math.min(255, Math.max(0, 32  + grain *  88 + (rand() - 0.5) * 10));
      d[i * 4 + 2] = Math.min(255, Math.max(0, 12  + grain *  48 + (rand() - 0.5) *  8));
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1.5);
  return tex;
}

// ── Moss overlay ──────────────────────────────────────────────────────────────

/**
 * Generates a 256×256 moss overlay texture (transparent alpha channel).
 *
 * @param seed       Seed for stipple placement.
 * @param intensity  0.0 = barely visible, 1.0 = dense coverage (default 0.5).
 */
export function makeMossOverlay(seed = 99, intensity = 0.5): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = makeCanvas(SIZE);
  const ctx = getCtx(canvas);
  const rand = mulberry32(seed);

  if (ctx) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    const numPatches = Math.floor(30 + intensity * 80);
    for (let i = 0; i < numPatches; i++) {
      const cx = rand() * SIZE;
      const cy = rand() * SIZE;
      const r  = 4 + rand() * 18;
      const alpha = 0.25 + rand() * 0.5 * intensity;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0,   `rgba(60,120,40,${alpha})`);
      grad.addColorStop(0.6, `rgba(45,100,30,${(alpha * 0.6).toFixed(3)})`);
      grad.addColorStop(1,   `rgba(30,70,20,0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * (0.6 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const numDots = Math.floor(intensity * 400);
    for (let i = 0; i < numDots; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const r = 0.5 + rand() * 2.0;
      ctx.fillStyle = `rgba(40,90,25,${(0.4 + rand() * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// ── Rune emissive map ─────────────────────────────────────────────────────────

/**
 * Generates a 256×256 rune emissive map.
 * Dark background + procedural angular rune glyphs drawn as bright polylines.
 *
 * @param seed  Controls glyph positions + shapes.
 * @param tint  CSS colour string for glyph lines (default violet `#bb44ff`).
 */
export function makeRuneEmissiveMap(seed = 13, tint = '#bb44ff'): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = makeCanvas(SIZE);
  const ctx = getCtx(canvas);
  const rand = mulberry32(seed);

  if (ctx) {
    ctx.fillStyle = '#0a0014';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const numGlyphs = 4 + Math.floor(rand() * 5);

    for (let g = 0; g < numGlyphs; g++) {
      const cx = (0.1 + rand() * 0.8) * SIZE;
      const cy = (0.1 + rand() * 0.8) * SIZE;
      const scale = 10 + rand() * 20;
      const numStrokes = 2 + Math.floor(rand() * 4);

      ctx.strokeStyle = tint;
      ctx.lineWidth = 1.5 + rand() * 1.5;
      ctx.shadowColor = tint;
      ctx.shadowBlur = 6;
      ctx.globalAlpha = 0.6 + rand() * 0.4;

      for (let s = 0; s < numStrokes; s++) {
        const numPts = 2 + Math.floor(rand() * 4);
        ctx.beginPath();
        for (let p = 0; p < numPts; p++) {
          const angle = rand() * Math.PI * 2;
          const dist  = rand() * scale;
          const px = cx + Math.cos(angle) * dist;
          const py = cy + Math.sin(angle) * dist;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
