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
  'river_floor', 'lake_floor', 'ocean_floor',
] as const;

/** Biomes that get more than one large-scale texture variant, and how many
 *  (index 0 is always the existing base canvas — no behavior change for
 *  biomes not listed here or callers passing region-agnostic keys).
 *  Chosen for biomes where "patchier vs. lusher" reads as a genuine,
 *  plausible large-scale sub-region difference; omitted biomes (desert,
 *  snow, mountain, beach, etc.) already read as fairly visually uniform at
 *  region scale, matching the same reasoning MICRO_PATCH_VARIANTS in
 *  TerrainGeometryBuilder.ts already uses for the micro-patch list. */
export const REGION_TEXTURE_VARIANT_COUNT: Partial<Record<string, number>> = {
  grassland: 3,
  forest: 2,
  savanna: 2,
  tundra: 2,
};

/** World-space size (WU) of one region cell for region-scale texture-variant
 *  selection — coarser than a tile (T=2 WU) so a variant change reads as a
 *  genuine multi-tile sub-region rather than tile-by-tile noise. 8 tiles'
 *  worth per axis. */
export const REGION_CELL_WU = 16;

function _regionHash(regionX: number, regionZ: number): number {
  let h = (regionX * 2654435761 + regionZ * 40503) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Deterministic region-scale texture-variant KEY for a biome at a given
 * absolute world position. Returns the plain `biome` string (no behavior
 * change) if that biome has no REGION_TEXTURE_VARIANT_COUNT entry, or
 * `${biome}~${idx}` for idx in [1, count) — idx 0 always collapses back to
 * the plain biome string so the existing single-variant rendering path is
 * untouched for the common case.
 */
export function regionTextureVariantKey(biome: string, worldX: number, worldZ: number): string {
  const count = REGION_TEXTURE_VARIANT_COUNT[biome];
  if (!count || count <= 1) return biome;
  const regionX = Math.floor(worldX / REGION_CELL_WU);
  const regionZ = Math.floor(worldZ / REGION_CELL_WU);
  const idx = Math.floor(_regionHash(regionX, regionZ) * count);
  return idx === 0 ? biome : `${biome}~${idx}`;
}

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

/** Sandy/pebbly riverbed, with subtle current-ripple streaks along one axis to
 *  suggest flowing (not still) water — the vertex-color RIVER/BIOME_WATER tint
 *  multiplies over this in the fragment stage, same as every other variant. */
function _buildRiverFloorCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#c2a877';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 16, [1, 0.95, 0.8]);
  // Current-ripple streaks — mostly horizontal, suggesting flow direction.
  g.strokeStyle = 'rgba(150,120,80,0.25)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 30; i++) {
    const y = Math.random() * 256;
    const x0 = Math.random() * 256;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x0 + 20 + Math.random() * 30, y + (Math.random() - 0.5) * 4);
    g.stroke();
  }
  // Small rounded pebbles.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(110,95,70,${0.25 + Math.random() * 0.2})`;
    g.beginPath();
    g.arc(x, y, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Silty/muddy lakebed — darker, calmer than a river floor (still water, no
 *  directional streaks), with occasional sediment/algae patches. */
function _buildLakeFloorCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#5c5230';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 14, [0.85, 0.9, 0.6]);
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(70,80,45,${0.15 + Math.random() * 0.2})`;
    g.beginPath();
    g.ellipse(x, y, 5 + Math.random() * 7, 4 + Math.random() * 5, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Pale sandy ocean floor with light shell/rock fleck detail — the existing
 *  BIOME_WATER_SHALLOW/BIOME_WATER vertex tint (already computed per-tile via the
 *  existing shallow/deep depth threshold) differentiates shallow vs. deep ocean
 *  floor color for free via the same tint*map multiply every variant already uses,
 *  so this single texture serves both depth bands. */
function _buildOceanFloorCanvas(): HTMLCanvasElement {
  const { c, g } = _newCanvas();
  g.fillStyle = '#d8cf9e';
  g.fillRect(0, 0, 256, 256);
  _jitterPixels(g, 256, 14, [1, 1, 0.9]);
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(235,228,200,${0.2 + Math.random() * 0.2})`;
    g.beginPath();
    g.arc(x, y, 1 + Math.random() * 2, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Generic brightness recolor applied on top of any base canvas for region
 *  variant index >= 1 — reusable across every biome without bespoke
 *  per-biome authoring. idx 1 reads darker/lusher, idx 2 (if a biome ever
 *  configures 4 variants) reads lighter/drier; deliberately a simple,
 *  cheap post-process rather than new canvas content. */
function _applyRegionVariantTint(c: HTMLCanvasElement, idx: number): HTMLCanvasElement {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const mul = idx % 2 === 1 ? 0.85 : 1.15;
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i]     = Math.min(255, img.data[i]!     * mul);
    img.data[i + 1] = Math.min(255, img.data[i + 1]! * mul);
    img.data[i + 2] = Math.min(255, img.data[i + 2]! * mul);
  }
  g.putImageData(img, 0, 0);
  return c;
}

function _canvasFor(variant: string): HTMLCanvasElement {
  const cached = _canvases.get(variant);
  if (cached) return cached;
  const tildeIdx = variant.indexOf('~');
  const base = tildeIdx === -1 ? variant : variant.slice(0, tildeIdx);
  const regionIdx = tildeIdx === -1 ? 0 : parseInt(variant.slice(tildeIdx + 1), 10);
  let c: HTMLCanvasElement;
  switch (base) {
    case 'beach':     c = _buildBeachCanvas(); break;
    case 'desert':    c = _buildDesertCanvas(); break;
    case 'savanna':   c = _buildSavannaCanvas(); break;
    case 'grassland': c = _buildGrasslandCanvas(); break;
    case 'forest':    c = _buildForestCanvas(); break;
    case 'taiga':     c = _buildTaigaCanvas(); break;
    case 'tundra':    c = _buildTundraCanvas(); break;
    case 'snow':      c = _buildSnowCanvas(); break;
    case 'river_floor': c = _buildRiverFloorCanvas(); break;
    case 'lake_floor':  c = _buildLakeFloorCanvas(); break;
    case 'ocean_floor': c = _buildOceanFloorCanvas(); break;
    default:          c = _buildGrasslandCanvas(); break; // unreachable via terrainVariantTexture's own switch, kept for type safety
  }
  if (regionIdx > 0) c = _applyRegionVariantTint(c, regionIdx);
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
