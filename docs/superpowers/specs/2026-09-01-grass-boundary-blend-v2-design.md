# Grass Boundary-Blend v2 + Savanna Distinctiveness Design Spec

Status: approved autonomously (user gave direct follow-up feedback after the v1
boundary-blending fix shipped; when asked whether to also touch savanna's preset
values now vs. reviewing screenshot coordinates together first, user was unavailable
and said "work autonomously and make good decisions" — chose the recommended option,
"make savanna visually distinct too"). User should review this spec when available.

## 1. Problem

User feedback (with a new screenshot) after the FPS fix + v1 boundary blending shipped:

> "FPS is much better now. ... The light of it though and color difference between
> biomes etc is still an issue as you can tell by the shift of that stark light green
> grass to the dark green one, its nice to have some differences in hue or color but
> this is too stark still, plus the grass still appears to show in the savanna in the
> screenshot"

Two of the three original issues are confirmed fixed (FPS, and savanna grass being
"a bug" was already ruled out as working-as-designed). The boundary-blending fix that
shipped is not enough — root-caused as two compounding gaps in v1's design (see
`2026-09-01-grass-biome-boundary-blending-design.md`):

1. **v1's transition band is too narrow to read as gradual.** `computeEdgeBlend()`
   samples 8 neighbor points at a SINGLE fixed distance (`EDGE_BAND_WU = 2.5`) and
   returns `differentCount / 8`. For a roughly-straight boundary line, this only
   produces a nonzero result within ~2.5 WU of the line on either side — beyond that,
   none of the 8 fixed-distance samples can reach the other biome, so blend snaps to
   exactly 0. The total affected width (~5 WU) is small enough, especially at typical
   camera framing, to still read as an abrupt wall with a thin soft fringe rather than
   a true gradient.

2. **v1 blends toward a shared generic `dryColor` (a tan/khaki), not the actual
   neighboring biome's own color.** This was a known, explicitly-flagged non-goal in
   v1 (§3 of the prior spec: "Flagged as a possible future refinement, not built
   now."). Pushing both sides of a boundary toward the same tan is visually a
   "muddy seam" rather than a continuous hue gradient — it doesn't reduce the
   perceived jump between e.g. bright yellow-green grassland and near-black forest,
   because forest's own low `dryAmount` (0.1) means even a `max(vColorVar * 0.1,
   edgeBlend)` mix rarely pulls it far from its own dark base color except in the
   narrowest sliver right at the line.

Separately, the user has now raised "grass still shows in savanna" twice despite the
earlier `debugCellAt()` investigation confirming savanna is intentionally one of the
5 grass-bearing biomes (not a bug). The likely reading: savanna's grass currently
looks too similar/lush to grassland's to visually register as "its own distinct dry
biome" — reinforcing the impression that grass is spilling in "everywhere" rather
than being a deliberate, distinct per-biome look.

## 2. Approach

### 2a. Widen + smooth `computeEdgeBlend()` via directional ray-marching

Replace the single-fixed-distance 8-sample snapshot with an 8-direction ray march, each
marching outward in `EDGE_RAY_STEP_WU` increments up to a new, wider
`EDGE_BAND_WU = 8` (~4 tiles, up from 2.5 — chosen to span a few real steps of player
movement so the fade is visible as a gradient, not a snap, while still remaining a
minority of a biome's typical footprint so a biome's interior stays fully saturated):

```ts
function computeEdgeBlend(wg, x, z, biome, bandWidthWU): { blend: number; neighborBiome: GrassBiome | null } {
  // distance-0 case: the candidate's own cell already differs (e.g. jitter placed it
  // just over a cell boundary) — trivially at the boundary, no marching needed.
  const own = biomeAt(x, z);
  if (own !== null && own !== biome) return { blend: 1, neighborBiome: own as GrassBiome };

  let nearestDist = Infinity;
  let nearestBiome: GrassBiome | null = null;
  for (const [dx, dz] of EDGE_SAMPLE_DIRECTIONS) {
    for (let t = EDGE_RAY_STEP_WU; t <= bandWidthWU; t += EDGE_RAY_STEP_WU) {
      const b = biomeAt(x + dx * t, z + dz * t);
      if (b === null) break;              // ran off the grid this direction — stop, don't count
      if (b !== biome) {                   // found a boundary crossing in this direction
        if (t < nearestDist) { nearestDist = t; nearestBiome = b as GrassBiome; }
        break;
      }
    }
  }
  if (nearestDist === Infinity) return { blend: 0, neighborBiome: null };
  return { blend: Math.max(0, 1 - nearestDist / bandWidthWU), neighborBiome: nearestBiome };
}
```

This keeps every existing v1 test's *intent* passing unchanged (interior → 0, fully
surrounded → 1 via the distance-0 case, partial → strictly between 0 and 1, map edges
never falsely read as a boundary, deterministic) — call sites move from a bare number
to `.blend`, and gain access to `.neighborBiome` for §2b. `EDGE_RAY_STEP_WU = 1` (1
grid tile) keeps the extra cost bounded: 8 directions × up to 8 steps = 64 `wg.get()`
calls per candidate worst case (up from 8) — still cheap, O(1) lookups, and this only
runs during `GrassField` rebuilds (gated by `REBUILD_HYSTERESIS = 8` WU of player
movement), never per-frame.

### 2b. Blend toward the ACTUAL neighboring biome's grass color (building v1's §3 follow-up)

Now that `computeEdgeBlend()` identifies which specific biome is nearest, replace the
shared-`dryColor`-push at edges with a genuine cross-fade toward that neighbor's own
color:

- At placement time, when `neighborBiome` is a grass-bearing biome, look up
  `GRASS_PRESETS[neighborBiome]` and compute a single averaged neighbor color
  (`mix(baseColor, tipColor, 0.5)` in linear-ish sRGB hex → `THREE.Color`) — one
  representative color per instance rather than a full second base/tip gradient pair,
  since this only ever affects a thin edge band and the artistic difference between
  "exact tip/base neighbor gradient" and "one averaged neighbor tone" is negligible at
  that scale, for roughly half the extra per-instance data.
- When `neighborBiome` is null (deep interior) OR not a grass-bearing biome (e.g. the
  boundary is against beach/desert/mountain, which have no grass preset to blend
  toward), default the packed neighbor color to the blade's OWN averaged color — inert,
  since `edgeBlend` is 0 in the interior case, and a reasonable graceful fallback (no
  color pull at all) for the no-preset-neighbor case rather than inventing a color for
  a biome that was never designed to have one.
- New instanced attribute `aNeighborColor` (`vec3`, 3 floats/instance) carries this
  through; fragment shader splits the previously-combined single `mix()` into two
  sequential ones so interior dry-tint variance and edge-boundary color pull stay
  independent, cleaner concerns:
  ```glsl
  // interior dry-tint variance (unrelated to biome edges) — small random dry patches
  // within a single biome's own territory, exactly as before this change.
  color = mix(color, uDryColor, vColorVar * uDryAmount);
  // near a biome boundary (vEdgeBlend -> 1), blend toward the ACTUAL neighboring
  // biome's own grass color instead of a generic shared tan — a true, continuous hue
  // gradient between whichever two biomes meet here.
  color = mix(color, vNeighborColor, vEdgeBlend);
  ```
  This is the exact v1 §3 refinement, now justified since the wider band alone doesn't
  fully address "too stark" — a wider band of a still-generic tan mix would just be a
  WIDER muddy seam, not a better one.

### 2c. Savanna: read as its own distinct, sparse/dry biome

Reduce `savanna`'s `densityPerUnit2` (15 → 9) and `height` (0.4 → 0.28) — visibly
sparser, shorter tufts with more bare ground showing through, the classic "dry
savanna" look, distinct from grassland's denser, taller, fuller field. Colors are left
as-is (`baseColor`/`tipColor` are already a distinct olive/gold, not green) — the
"looks the same as grassland" impression was most likely a symptom of §2a/§2b's bugs
(a boundary artificially brightened/homogenized by the old narrow shared-tan push),
not the base palette itself, so this is a conservative, narrowly-targeted change
rather than speculatively re-tuning colors with no strong evidence they're the actual
cause.

## 3. Non-goals

- Re-tuning any other biome's colors, height, or density (grassland/tundra/forest/
  taiga untouched this pass) — only savanna, per the specific repeated feedback.
- A full per-vertex base+tip neighbor gradient (rejected in favor of one averaged
  neighbor tone — see §2b).
- Changing `EDGE_SAMPLE_DIRECTIONS` (still 8,45° apart) or adding true 2D nearest-
  neighbor-cell search — directional ray-marching is a cheap, adequate approximation;
  a full distance-field search is a possible future refinement if the 8-direction
  approximation proves visually insufficient at sharp corners.
- Any change to `classifyBiome()`/`_domainWarp()` or where biome boundaries are drawn.

## 4. Testing

- Rewrite `computeEdgeBlend()`'s existing 5 unit tests for the new `{ blend,
  neighborBiome }` return shape (same test intents: interior → blend 0, surrounded →
  blend 1 + correct neighborBiome, partial → between 0 and 1, out-of-bounds skipped,
  deterministic) — plus new tests: neighborBiome is correctly identified nearest-first,
  and a wider-band case that confirms non-zero blend now extends further than the old
  2.5 WU cutoff.
- `selectGrassPlacements()`: update to consume `.blend`/`.neighborBiome`; existing
  density-fade test should still pass unchanged (same thinning logic, just now driven
  by the object's `.blend` field); new test confirms the packed neighbor color for an
  interior placement equals the blade's own averaged color (inert default).
- `packGrassInstanceBuffers()`: extend to pack `neighborColor: Float32Array` (3
  components/instance), test carries r/g/b through correctly.
- Savanna preset test: assert the new `densityPerUnit2`/`height` values.
- Manual visual verification (screenshot before/after at the same real biome seam
  used for v1) — same established pattern, since jsdom/vitest cannot render real GLSL.
