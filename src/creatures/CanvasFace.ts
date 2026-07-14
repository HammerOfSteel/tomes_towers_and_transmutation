// ── CanvasFace ───────────────────────────────────────────────────────────────
//
//  Procedural anime-style face textures drawn on an offscreen canvas.
//  Applied to a PlaneGeometry face-plate attached to the head bone.
//  All drawing uses the 2D Canvas API — no assets loaded.

import * as THREE from 'three';
import type { FaceType, MouthType, Expression } from './CreatureDNA';

export interface FaceSpec {
  faceType:   FaceType;
  eyeColor:   number;
  mouthType:  MouthType;
  expression: Expression;
}

const SZ = 128;

export function makeFaceTexture(spec: FaceSpec): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  _draw(cv, spec);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export function updateFaceTexture(tex: THREE.CanvasTexture, spec: FaceSpec): void {
  _draw(tex.image as HTMLCanvasElement, spec);
  tex.needsUpdate = true;
}

function _draw(cv: HTMLCanvasElement, spec: FaceSpec): void {
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, SZ, SZ);
  const cx = SZ / 2, cy = SZ / 2;
  const eyeHex = '#' + spec.eyeColor.toString(16).padStart(6, '0');
  switch (spec.faceType) {
    case 'cute':     _cute(ctx, cx, cy, eyeHex, spec.mouthType, spec.expression); break;
    case 'angry':    _angry(ctx, cx, cy, eyeHex, spec.mouthType); break;
    case 'cyclops':  _cyclops(ctx, cx, cy, eyeHex, spec.mouthType); break;
    case 'skull':    _skull(ctx, cx, cy); break;
    case 'compound': _compound(ctx, cx, cy, eyeHex); break;
    case 'blank':    break;
  }
}

function _rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}

function _cute(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  eyeHex: string, mouth: MouthType, expr: Expression,
): void {
  const ey = cy - 8;
  for (const ex of [cx - 22, cx + 22]) {
    ctx.fillStyle = '#fffaf0'; _rrect(ctx, ex - 10, ey - 11, 20, 22, 7); ctx.fill();
    ctx.fillStyle = eyeHex;   _rrect(ctx, ex - 7,  ey - 5,  14, 16, 6); ctx.fill();
    ctx.fillStyle = '#111';   _rrect(ctx, ex - 4,  ey - 1,  8,  10, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(ex - 3, ey - 2, 3, 4, -0.3, 0, Math.PI * 2); ctx.fill();
    if (expr === 'angry') {
      ctx.strokeStyle = '#2a1000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ex - 10, ey - 14); ctx.lineTo(ex + 10, ey - 18); ctx.stroke();
    } else if (expr === 'scared') {
      ctx.strokeStyle = '#2a1000'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ex - 10, ey - 18); ctx.lineTo(ex + 10, ey - 14); ctx.stroke();
    }
  }
  if (expr === 'happy' || expr === 'neutral') {
    ctx.fillStyle = 'rgba(255,140,120,0.28)';
    ctx.beginPath(); ctx.ellipse(cx - 28, cy + 8, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 28, cy + 8, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  _mouth(ctx, cx, cy + 20, mouth, expr);
}

function _angry(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, eyeHex: string, mouth: MouthType,
): void {
  const pairs: [number, number][] = [[cx - 22, 1], [cx + 22, -1]];
  for (const [ex, side] of pairs) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(ex - 11, cy - 5);
    ctx.lineTo(ex + 11, cy - 12 * side * 0.5 - 5);
    ctx.lineTo(ex + 11, cy + 6);
    ctx.lineTo(ex - 11, cy + 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = eyeHex;
    ctx.beginPath(); ctx.ellipse(ex, cy - 1, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(ex, cy - 1, 2.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#200'; ctx.lineWidth = 4;
    ctx.beginPath();
    if (side > 0) { ctx.moveTo(ex - 12, cy - 16); ctx.lineTo(ex + 10, cy - 9); }
    else          { ctx.moveTo(ex - 10, cy - 9);  ctx.lineTo(ex + 12, cy - 16); }
    ctx.stroke();
  }
  _mouth(ctx, cx, cy + 20, mouth, 'angry');
}

function _cyclops(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, eyeHex: string, mouth: MouthType,
): void {
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.ellipse(cx, cy - 8, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = eyeHex;   ctx.beginPath(); ctx.ellipse(cx, cy - 8, 19, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';   ctx.beginPath(); ctx.ellipse(cx, cy - 8, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.ellipse(cx - 6, cy - 14, 5, 7, -0.4, 0, Math.PI * 2); ctx.fill();
  _mouth(ctx, cx, cy + 24, mouth, 'neutral');
}

function _skull(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  for (const ex of [cx - 20, cx + 20]) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath(); ctx.ellipse(ex, cy - 6, 14, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(60,0,80,0.5)';
    ctx.beginPath(); ctx.ellipse(ex - 3, cy - 9, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath(); ctx.moveTo(cx - 6, cy + 8); ctx.lineTo(cx + 6, cy + 8); ctx.lineTo(cx, cy + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fffef0';
  for (let i = 0; i < 5; i++) ctx.fillRect(cx - 18 + i * 8, cy + 18, 7, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - 19, cy + 17, 38, 2);
}

function _compound(ctx: CanvasRenderingContext2D, cx: number, cy: number, eyeHex: string): void {
  for (const [ex, ey] of [[cx - 24, cy - 10], [cx + 24, cy - 10]] as [number, number][]) {
    const n = 6, r = 18;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const px = ex - r + (i / (n - 1)) * r * 2;
        const py = ey - r * 0.6 + (j / (n - 1)) * r * 1.2;
        ctx.fillStyle = eyeHex;
        ctx.globalAlpha = 0.6 + (i + j) / (n * 2 - 2) * 0.4;
        ctx.beginPath(); ctx.ellipse(px, py, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = '#40200a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 10, cy + 26); ctx.lineTo(cx - 20, cy + 38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 10, cy + 26); ctx.lineTo(cx + 20, cy + 38); ctx.stroke();
}

function _mouth(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, mouth: MouthType, expr: Expression,
): void {
  ctx.strokeStyle = '#2a1000'; ctx.fillStyle = '#c04040'; ctx.lineWidth = 3;
  switch (mouth) {
    case 'smile': {
      const arc = expr === 'angry' ? -0.4 : 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy - arc * 10, 12, arc > 0 ? 0.1 : Math.PI + 0.1, arc > 0 ? Math.PI - 0.1 : -0.1);
      ctx.stroke(); break;
    }
    case 'frown': {
      ctx.beginPath(); ctx.arc(cx, cy + 10, 10, Math.PI + 0.2, -0.2); ctx.stroke(); break;
    }
    case 'beak': {
      ctx.fillStyle = '#e0a030';
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 3); ctx.lineTo(cx + 8, cy - 3); ctx.lineTo(cx, cy + 8);
      ctx.closePath(); ctx.fill(); break;
    }
    case 'fangs': {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx + 12, cy + 6);
      ctx.lineTo(cx - 12, cy + 6); ctx.closePath(); ctx.fill();
      for (const fx of [cx - 8, cx + 2]) {
        ctx.beginPath(); ctx.moveTo(fx, cy + 6); ctx.lineTo(fx + 3, cy + 14); ctx.lineTo(fx + 6, cy + 6); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = '#cc2a00'; ctx.lineWidth = 2; ctx.strokeRect(cx - 12, cy, 24, 6); break;
    }
  }
}
