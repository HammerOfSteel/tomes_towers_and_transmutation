/**
 * RoadTextures.ts — maps a road "variant" key (a settlement faction id for
 * settlement-internal streets, or GENERIC_ROAD_VARIANT for open
 * inter-settlement roads) to a real tileable canvas texture.
 *
 * Reuses the existing faction/building texture factories
 * (FactionBlockTextures.ts) rather than authoring brand-new art assets, so
 * each race's own streets read as thematically distinct with zero new
 * asset work — see docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
 * Phase 2's "per-biome road styles" item (this covers the per-faction half
 * of that; a fuller per-biome, non-faction set is future Phase 8 work).
 */
import * as THREE from 'three';
import { cobblestoneTexture } from './buildings/TextureFactory';
import {
  earthTexture, graniteTexture, barkTexture, hideTexture,
  ashStoneTexture, obsidianTexture, toadstoolTexture,
} from './buildings/FactionBlockTextures';

/** Variant key used for open inter-settlement roads, which aren't owned by
 *  any one race. Prefixed with an underscore so it can never collide with
 *  a real settlement faction string. */
export const GENERIC_ROAD_VARIANT = '_open_road';

const _cache = new Map<string, THREE.CanvasTexture>();

/** Repeat count applied to every road texture — finer than a building
 *  wall's tiling since a road is a narrow, fast-traveled surface where a
 *  coarser tile would look stretched. */
const ROAD_TEXTURE_REPEAT = 4;

export function roadVariantTexture(variant: string): THREE.CanvasTexture {
  const cached = _cache.get(variant);
  if (cached) return cached;

  let tex: THREE.CanvasTexture;
  switch (variant) {
    case 'vulperia': tex = earthTexture(ROAD_TEXTURE_REPEAT, ROAD_TEXTURE_REPEAT); break;
    case 'dwarven':  tex = graniteTexture(ROAD_TEXTURE_REPEAT, ROAD_TEXTURE_REPEAT); break;
    case 'elven':    tex = barkTexture(ROAD_TEXTURE_REPEAT, ROAD_TEXTURE_REPEAT); break;
    case 'orcish':   tex = hideTexture(ROAD_TEXTURE_REPEAT, ROAD_TEXTURE_REPEAT); break;
    case 'undead':   tex = ashStoneTexture(ROAD_TEXTURE_REPEAT, ROAD_TEXTURE_REPEAT); break;
    case 'vampire':  tex = obsidianTexture(ROAD_TEXTURE_REPEAT, ROAD_TEXTURE_REPEAT); break;
    case 'fae':      tex = toadstoolTexture(ROAD_TEXTURE_REPEAT, ROAD_TEXTURE_REPEAT); break;
    case GENERIC_ROAD_VARIANT: tex = earthTexture(ROAD_TEXTURE_REPEAT * 2, ROAD_TEXTURE_REPEAT * 2); break;
    // human, slime, and any unrecognized variant fall back to the existing
    // default cobblestone look (matches current pre-Phase-2 visuals).
    default:         tex = cobblestoneTexture(ROAD_TEXTURE_REPEAT, ROAD_TEXTURE_REPEAT); break;
  }
  _cache.set(variant, tex);
  return tex;
}
