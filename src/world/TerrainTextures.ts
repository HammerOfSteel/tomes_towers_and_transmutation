/**
 * TerrainTextures.ts — real tileable canvas textures for ground (non-road,
 * non-water) terrain tiles, sampled via world-space-projected UV so they
 * read as continuous surface detail across every tile boundary instead of
 * a stamped checkerboard (same technique as BlockKit.ts's buildings and
 * RoadTextures.ts's roads). See
 * docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md §3.1.
 *
 * `mountain` and `river_bank` reuse the already-shipped `graniteTexture()`/
 * `earthTexture()` factories as-is (bare rock and packed dirt already read
 * correctly at ground scale) — only the other 8 variants get new canvases.
 */

import * as THREE from 'three';
import { _wrap, _jitterPixels, earthTexture, graniteTexture } from './buildings/FactionBlockTextures';

export const GROUND_TERRAIN_VARIANTS = [
  'beach', 'desert', 'savanna', 'grassland', 'forest',
  'taiga', 'tundra', 'snow', 'mountain', 'river_bank',
] as const;

const _canvases = new Map<string, HTMLCanvasElement>();

function _newCanvas(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  return { c, g };
}

function _buildBeachCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#e8dcae';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 18, [1, 0.95, 0.7]);
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(200,190,160,${0.15 + Math.random() * 0.15})`;
    g.beginPath();
    g.ellipse(x, y, 3 + Math.random() * 4, 2 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(110,95,65,${0.2 + Math.random() * 0.2})`;
    g.beginPath();
    g.arc(x, y, 1 + Math.random() * 1.5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function _buildDesertCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#cc9a52';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 22, [1, 0.9, 0.55]);
  g.strokeStyle = 'rgba(140,95,40,0.30)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 36;
      y += (Math.random() - 0.5) * 36;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

function _buildSavannaCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#b8a05c';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 20, [1, 0.92, 0.55]);
  g.strokeStyle = 'rgba(90,75,35,0.35)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 4, y - 6 - Math.random() * 8);
    g.stroke();
  }
  return c;
}

function _buildGrasslandCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#4f8a3a';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 16, [0.8, 1, 0.6]);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const dark = Math.random() < 0.5;
    g.strokeStyle = dark ? 'rgba(60,110,40,0.40)' : 'rgba(120,170,80,0.30)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y - 5 - Math.random() * 6);
    g.stroke();
  }
  return c;
}

function _buildForestCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#3e5a2c';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 20, [0.9, 1, 0.6]);
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const brown = Math.random() < 0.5;
    g.fillStyle = brown ? `rgba(90,70,40,${0.15 + Math.random() * 0.15})` : `rgba(60,90,45,${0.15 + Math.random() * 0.15})`;
    g.beginPath();
    g.ellipse(x, y, 4 + Math.random() * 5, 2.5 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function _buildTaigaCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#374a34';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 14, [0.85, 1, 0.7]);
  g.strokeStyle = 'rgba(30,40,25,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6);
    g.stroke();
  }
  return c;
}

function _buildTundraCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#8a978c';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 14, [0.9, 1, 1]);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(230,235,230,${0.12 + Math.random() * 0.13})`;
    g.beginPath();
    g.arc(x, y, 1 + Math.random() * 2, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function _buildSnowCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#eef2f6';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 10, [0.85, 0.9, 1]);
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(190,205,220,${0.08 + Math.random() * 0.1})`;
    g.beginPath();
    g.ellipse(x, y, 8 + Math.random() * 14, 5 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function _canvasFor(variant: string): HTMLCanvasElement {
  const cached = _canvases.get(variant);
  if (cached) return cached;
  let c: HTMLCanvasElement;
  switch (variant) {
    case 'beach':     c = _buildBeachCanvas(); break;
    case 'desert':    c = _buildDesertCanvas(); break;
    case 'savanna':   c = _buildSavannaCanvas(); break;
    case 'grassland': c = _buildGrasslandCanvas(); break;
    case 'forest':    c = _buildForestCanvas(); break;
    case 'taiga':     c = _buildTaigaCanvas(); break;
    case 'tundra':    c = _buildTundraCanvas(); break;
    case 'snow':      c = _buildSnowCanvas(); break;
    default:          c = _buildGrasslandCanvas(); break; // unreachable via terrainVariantTexture's own switch, kept for type safety
  }
  _canvases.set(variant, c);
  return c;
}

/** Real tileable canvas texture for a covered ground variant (see
 *  GROUND_TERRAIN_VARIANTS). `repX`/`repY` default to 1 since
 *  TerrainGeometryBuilder's world-space UV projection already carries the
 *  tiling period — callers only need to override for deliberate retuning. */
export function terrainVariantTexture(variant: string, repX = 1, repY = 1): THREE.CanvasTexture {
  if (variant === 'mountain')   return _wrap(graniteTexture(1, 1), repX, repY);
  if (variant === 'river_bank') return _wrap(earthTexture(1, 1), repX, repY);
  return _wrap(new THREE.CanvasTexture(_canvasFor(variant)), repX, repY);
}
