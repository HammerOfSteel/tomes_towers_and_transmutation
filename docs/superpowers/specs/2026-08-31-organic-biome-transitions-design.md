# Organic Biome Transitions (Phase 4) — Design

## 1. Context

`docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 4 calls for two things:

1. Domain-warping `RealmGenerator.ts`'s biome-classification sample coordinate so biome borders
   read as naturally uneven coastlines/tree-lines rather than perfect noise-contour lines.
2. Giving `RealmToTerrain.ts`'s `isBiomeTransition` flag an actual blended-color rendering
   treatment at biome borders.

**Item 2 is already effectively delivered** by the ground sub-tile system shipped
2026-09-01 (`docs/superpowers/specs/2026-09-01-ground-subtile-system-design.md`):
`_subTileGroundVariant()`'s border-dithering already pulls a tile's outermost sub-tiles toward a
differing neighbor's own texture variant at biome borders, live in the actual game (not just a
stored flag with no consumer). Re-implementing a second, separate "blended transition tile"
mechanism on top of that would be redundant. **This pass covers item 1 only.**

Also worth noting: `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md`'s Studio↔live gap this
phase's original text warned about has *already been closed* (confirmed by reading the current
code, not assumed) — `WorldGenerator.ts`'s live `buildWorldGrid()` calls the exact same
`generateRealmData()`/`classifyBiome()` Overworld Studio uses, via `RealmToWorldGrid.ts`. So this
change automatically benefits both Overworld Studio's preview and the live game, with no dual
implementation needed.

## 2. Problem

`classifyBiome(elev, moist, temp)` (`src/world/RealmGenerator.ts`) is a pure threshold function
over three independently-sampled fBm noise fields. Thresholding smooth noise fields produces
fairly regular, contour-like boundaries — recognizable as "generated," not organic. This affects
every biome edge: coastlines (ocean/beach/land), mountain treelines, and climate-zone borders
(desert/savanna/grassland/forest/etc.).

## 3. Design — Domain Warping

Add one new low-frequency noise field, `noiseW`, seeded independently
(`createNoise2D(seed ^ 0xFEEDFACE)`, following this file's existing `seed ^ 0x<hex>` convention
for `noiseM`/`noiseT`/`noiseR`). Before the per-cell loop samples the continent mask, elevation,
ridge, and moisture/temperature noise, compute a small `(warpDx, warpDy)` displacement from
`noiseW` and add it to the cell's `(nx, ny)` sample coordinate:

```ts
/** Broad, low-frequency displacement applied to a biome-sampling coordinate
 *  before every noise lookup that feeds classifyBiome() — makes noise-
 *  contour-shaped biome borders (coastlines, treelines, climate-zone
 *  edges) read as organically wobbly instead of a perfect iso-contour.
 *  Pure function of (nx, ny, roughness) plus the seeded noiseW field —
 *  exported for direct unit testing (same pattern as subTileBumpJitter/
 *  _subTileGroundVariant in TerrainGeometryBuilder.ts). */
export function _domainWarp(
  nx: number, ny: number, roughness: number,
  noiseW: (x: number, y: number) => number,
): { wx: number; wy: number } {
  const WARP_FREQ = 0.6; // well below the elevation noise's own scale (1.8–3.0) — broad, sweeping wobble, not speckle
  const warpAmount = 0.03 + roughness * 0.05; // 0.03–0.08, scales with the existing roughness knob
  const dx = noiseW(nx * WARP_FREQ, ny * WARP_FREQ) * warpAmount;
  // Offset sample point (not just a different noise field) decorrelates
  // dy from dx using the same single noiseW field — same "+offset for
  // decorrelation" convention already used for moisture (nx+5,ny+5) and
  // temperature (nx+10,ny+10) sampling below.
  const dy = noiseW(nx * WARP_FREQ + 31.7, ny * WARP_FREQ + 47.3) * warpAmount;
  return { wx: nx + dx, wy: ny + dy };
}
```

Call site (inside `generateRealmData()`'s per-cell loop): replace the mask/elevation/ridge/
moisture/temperature-noise sample coordinate with `(wx, wy)` from `_domainWarp(nx, ny, roughness,
noiseW)`, computed once per cell. **`latT` (the latitude term feeding temperature) keeps using
the true, unwarped `ny`** — latitude represents the cell's real position on the map for
climate-banding purposes, not a noise-sample target, so warping it would be physically
meaningless (a cell's "how far from the equator" fact doesn't wobble).

Concretely, in the existing per-cell closure:

```ts
const nx = cx / W, ny = cy / H;
const { wx, wy } = _domainWarp(nx, ny, roughness, noiseW);

// Elevation: continent mask + fBm noise — now sampled at the warped coordinate
const mVal   = Math.min(1, mask(wx, wy));
const noise  = fbmR(noiseE, wx, wy, oct, scale);
const ridge  = Math.abs(fbmR(noiseR, wx*1.3, wy*1.3, 3, 3.0) - 0.5) * 2;
const elev   = Math.min(1, mVal * (noise * 0.75 + ridge * 0.25 * roughness + 0.2));

// Moisture — also warped
const moist  = fbmR(noiseM, wx+5, wy+5, 3, 1.8);

// Temperature: latitude uses the TRUE ny; elevation/noise terms use the warped coordinate
const latT   = 1 - Math.abs(ny - 0.5) * 1.5;      // unwarped — real map position
const elvT   = 1 - Math.max(0, elev - 0.4) * 2.0; // derived from warped elev, so already organic
const tNoise = fbmR(noiseT, wx+10, wy+10, 2, 1.2) * 0.12;
const temp   = Math.max(0, Math.min(1, latT*0.65 + elvT*0.35 + tNoise + climateBias));

return { elevation: elev, moisture: moist, biome: classifyBiome(elev, moist, temp) };
```

Note this changes **zero classification thresholds** — `classifyBiome()` itself is untouched.
Only which noise value gets fed into it changes. Because `mask()`'s internal shape functions
(circle/ellipse/pangaea-jitter) are pure functions of whatever `(nx, ny)`-equivalent they're
called with, passing them `(wx, wy)` instead of `(nx, ny)` automatically makes coastlines wobble
too, with no changes needed inside any of the four shape-mask branches themselves.

## 4. Determinism & Edge Behavior

- `noiseW` is seeded from `seed` like every other noise field here — same seed always produces
  the same warp field, so realms stay fully reproducible.
- No clamping of `(wx, wy)` to `[0, 1]` is needed: every consumer (`mask()`'s shape functions,
  `fbmR`) is a continuous function with a well-defined, reasonable result for coordinates
  slightly outside `[0, 1]` (this is standard for Simplex/fBm noise and the existing mask
  distance-based shape functions) — small warp amounts (≤0.08) never push a coordinate far
  enough out of range to produce a visible artifact.

## 5. Testing

- `_domainWarp()` unit tests (mirroring `subTileBumpJitter`'s existing test shape): determinism
  (same inputs → same output), bounded displacement (`|wx - nx| <= 0.03 + roughness*0.05` and
  same for `wy`, across a range of `roughness` values), and "produces more than one distinct
  displacement across many positions" (not a degenerate constant).
- A `generateRealmData()`-level wiring test: for a fixed seed/shape/climate, pick a cell and
  confirm its actual `elevation`/`moisture` value differs from what the pre-warp formula would
  have produced at the same raw `(nx, ny)` (computed inline in the test by replicating the
  un-warped calculation with the same noise instances) — proves the warp is actually wired into
  the real generation path, not just correct in isolation. This mirrors the "confirm the wiring
  passes the correct data, not re-prove the underlying pure function" precedent already used for
  the ground sub-tile system's own geometry-level tests.
- A determinism regression test: `generateRealmData(seed, ...)` called twice with the same seed
  produces byte-identical `cells` (guards against accidentally introducing any non-deterministic
  source when adding `noiseW`).

## 6. Explicitly Out of Scope

- Re-building a separate "transition tile" rendering mechanism — already covered by the shipped
  ground sub-tile system (§1).
- Any change to `classifyBiome()`'s thresholds.
- Warping any other consumer of `(nx, ny)` outside `generateRealmData()`'s own cell loop (e.g.
  settlement siting, river/lake placement) — those are separate systems with their own sampling,
  out of scope for this pass.
