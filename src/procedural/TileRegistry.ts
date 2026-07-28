/**
 * TileRegistry.ts — TV-4 (Procedural Tile Designer data layer)
 *
 * Central lookup mapping `(biome, variant)` → `TileDNA`, with support for
 * designer overrides scoped to specific named locations (e.g. "this room's
 * floor should always use the mossy dungeon_stone variant" or "settlement X
 * should render worn cobble instead of new").
 *
 * This mirrors EntityRegistry's role for NPCs/enemies/props/buildings but
 * for tile data rather than full builder functions — tiles don't have a
 * per-kind builder module yet (TV-3), so this registry only manages the DNA
 * layer for now.
 *
 * Usage:
 *   tileRegistry.register(makeTileDNA('grassland', 'lush', 1234));
 *   const dna = tileRegistry.resolve('grassland', 'lush', 1234);
 *   const overridden = tileRegistry.resolveForLocation('grassland', 'lush', 1234, 'settlement-42');
 */

import type { TileBiome, TileDNA } from './TileDNA';
import { makeTileDNA, tileDnaKey } from './TileDNA';

interface LocationOverrideEntry {
  locationId: string;
  dna: TileDNA;
}

export class TileRegistry {
  /** Base registry: (biome:variant) → TileDNA. Last registration wins. */
  private readonly _base = new Map<string, TileDNA>();

  /** Location-scoped overrides: (biome:variant) → list of per-location overrides. */
  private readonly _overrides = new Map<string, LocationOverrideEntry[]>();

  /** Register (or replace) the base TileDNA for a biome+variant pair. */
  register(dna: TileDNA): void {
    this._base.set(tileDnaKey(dna.biome, dna.variant), dna);
  }

  /** Register a designer override scoped to a specific named location. */
  registerForLocation(locationId: string, dna: TileDNA): void {
    const key = tileDnaKey(dna.biome, dna.variant);
    const list = this._overrides.get(key) ?? [];
    const existingIdx = list.findIndex(e => e.locationId === locationId);
    if (existingIdx >= 0) list[existingIdx] = { locationId, dna };
    else list.push({ locationId, dna });
    this._overrides.set(key, list);
  }

  /** Remove a location-scoped override, if any. */
  clearLocationOverride(biome: TileBiome, variant: string, locationId: string): void {
    const key = tileDnaKey(biome, variant);
    const list = this._overrides.get(key);
    if (!list) return;
    const next = list.filter(e => e.locationId !== locationId);
    if (next.length > 0) this._overrides.set(key, next);
    else this._overrides.delete(key);
  }

  /**
   * Resolve the TileDNA for a biome+variant, falling back to a deterministic
   * default (built from `seed`) when no explicit registration exists.
   */
  resolve(biome: TileBiome, variant: string, seed: number): TileDNA {
    const existing = this._base.get(tileDnaKey(biome, variant));
    return existing ?? makeTileDNA(biome, variant, seed);
  }

  /**
   * Resolve the TileDNA for a biome+variant scoped to a specific location,
   * preferring a location-specific override over the base registration.
   */
  resolveForLocation(biome: TileBiome, variant: string, seed: number, locationId: string): TileDNA {
    const key = tileDnaKey(biome, variant);
    const overrideEntry = this._overrides.get(key)?.find(e => e.locationId === locationId);
    if (overrideEntry) return overrideEntry.dna;
    return this.resolve(biome, variant, seed);
  }

  /** All base-registered DNAs (no location overrides), for inspection/tests. */
  getAllBase(): readonly TileDNA[] {
    return [...this._base.values()];
  }

  /** All location overrides registered for a given biome+variant. */
  getLocationOverrides(biome: TileBiome, variant: string): readonly LocationOverrideEntry[] {
    return this._overrides.get(tileDnaKey(biome, variant)) ?? [];
  }

  get size(): number { return this._base.size; }

  clear(): void {
    this._base.clear();
    this._overrides.clear();
  }
}

/** Module-level singleton used by world generation + Studio tile designer (once shipped). */
export const tileRegistry = new TileRegistry();