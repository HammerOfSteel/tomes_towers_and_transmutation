// ── CanvasSkin ──────────────────────────────────────────────────────────────
//  Generates procedural body-skin pattern CanvasTextures from DNA color block.
//  Used by CreatureBuilder to texture body part materials.
//  All drawing uses the 2D Canvas API — no assets loaded.
//  CC-7: body skin patterns (separate from face skinPattern in CanvasFace.ts)

import * as THREE from 'three';
import type { SkinPattern } from './CreatureDNA';

const CACHE = new Map<string, THREE.CanvasTexture>();

/** Returns a cached CanvasTexture for the given pattern parameters. */
export function makeSkinTexture(
  baseColor:    number,
  patternColor: number,
  pattern:      SkinPattern,
  scale:        number,
  opacity:      number,
): THREE.CanvasTexture {
  const key = `${baseColor}_${patternColor}_${pattern}_${scale.toFixed(2)}_${opacity.toFixed(2)}`;
  const cached = CACHE.get(key);
  if (cached) return cached;

  const SZ = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d')!;

  // Fill base colour
  ctx.fillStyle = _hex(baseColor);
  ctx.fillRect(0, 0, SZ, SZ);

  if (pattern !== 'none') {
    ctx.globalAlpha = opacity;
    ctx.fillStyle   = _hex(patternColor);
    _drawPattern(ctx, SZ, pattern, scale);
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2 * scale, 2 * scale);
  CACHE.set(key, tex);
  return tex;
}

/** Clear the texture cache — call when the builder tears down a creature. */
export function clearSkinCache(): void {
  CACHE.forEach(t => t.dispose());
  CACHE.clear();
}

// ── Pattern drawers ──────────────────────────────────────────────────────────

function _hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function _drawPattern(ctx: CanvasRenderingContext2D, sz: number, pattern: SkinPattern, scale: number): void {
  switch (pattern) {
    case 'stripes':  _stripes(ctx, sz, scale);  break;
    case 'spots':    _spots(ctx, sz, scale);    break;
    case 'scales':   _scales(ctx, sz, scale);   break;
    case 'gradient': _gradient(ctx, sz);        break;
    case 'cracks':   _cracks(ctx, sz, scale);   break;
    case 'fur':      _fur(ctx, sz, scale);      break;
  }
}

function _stripes(ctx: CanvasRenderingContext2D, sz: number, scale: number): void {
  const w = Math.max(2, Math.round(sz / (6 * scale)));
  for (let x = 0; x < sz; x += w * 2) {
    ctx.fillRect(x, 0, w, sz);
  }
}

function _spots(ctx: CanvasRenderingContext2D, sz: number, scale: number): void {
  const r = Math.max(2, sz / (8 * scale));
  const step = r * 3;
  for (let y = r; y < sz + r; y += step) {
    for (let x = r; x < sz + r; x += step) {
      const ox = ((y / step | 0) % 2) * (step / 2);
      ctx.beginPath();
      ctx.arc((x + ox) % sz, y % sz, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function _scales(ctx: CanvasRenderingContext2D, sz: number, scale: number): void {
  const rw = Math.max(3, sz / (5 * scale));
  const rh = rw * 0.7;
  for (let row = 0; row * rh < sz + rh; row++) {
    const offset = (row % 2) * rw;
    for (let col = -1; col * rw < sz + rw; col++) {
      const x = col * rw * 2 + offset;
      const y = row * rh;
      ctx.beginPath();
      ctx.ellipse(x + rw, y + rh * 0.5, rw * 0.95, rh * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function _gradient(ctx: CanvasRenderingContext2D, sz: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, sz);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sz, sz);
}

function _cracks(ctx: CanvasRenderingContext2D, sz: number, scale: number): void {
  const segs = Math.round(8 * scale);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = Math.max(1, 1.5 / scale);
  ctx.globalAlpha *= 0.7;
  for (let i = 0; i < segs; i++) {
    const x = _lcg(i * 13) * sz;
    const y = _lcg(i * 7 + 3) * sz;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 3; j++) {
      ctx.lineTo(x + (_lcg(i * 5 + j * 11) - 0.5) * sz * 0.35,
                 y + (_lcg(i * 3 + j * 7) - 0.5) * sz * 0.35);
    }
    ctx.stroke();
  }
}

function _fur(ctx: CanvasRenderingContext2D, sz: number, scale: number): void {
  const count = Math.round(80 * scale);
  ctx.lineWidth = Math.max(0.6, 1.2 / scale);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.globalAlpha *= 0.5;
  for (let i = 0; i < count; i++) {
    const x = _lcg(i * 11) * sz;
    const y = _lcg(i * 7) * sz;
    const len = (_lcg(i * 3 + 1) * 0.5 + 0.3) * sz * 0.1;
    const angle = _lcg(i * 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
}

/** Deterministic pseudo-random [0,1) from integer seed (LCG). */
function _lcg(n: number): number {
  return ((Math.imul(1664525, n | 0) + 1013904223) >>> 0) / 4294967296;
}
