# Race/Faction Biome Affinity for Settlements (Phase 5) — Design

## 1. Context

`docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 5 calls for settlements'
faction assignment to be biased by the surrounding biome, instead of `RealmGenerator.ts`'s current
fully-uniform `FACTIONS[Math.floor(rand() * FACTIONS.length)]` pick — so an elven settlement
noticeably favors forest/taiga, a dwarven one favors mountain/tundra, etc., matching the
architectural theming `docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md` already
gives each of the 9 factions (`SettlementFaction` in `src/overworld-studio.ts`: `human`, `elven`,
`dwarven`, `orcish`, `vampire`, `undead`, `vulperia`, `slime`, `fae`).

## 2. Two Pre-Existing Constraints Discovered During Design

1. **Settlement-eligible biomes are currently narrower than the full biome taxonomy.**
   `RealmGenerator.ts`'s `VALID` set (line ~252) only allows
   `{grassland, forest, savanna, taiga, desert}` — `mountain` and `tundra` are excluded (a
   pre-existing, unrelated design choice that predates this phase, not a Phase-1-era
   restriction). Confirmed by direct code read, not assumed.
2. **`SettlementPlacer.ts` (the live-game siting step downstream of `RealmGenerator.ts`) has its
   own, separate elevation gate**: `isValidTile()` requires `cell.elevation` (an integer level
   0-7) to be in `[1, 2]`, regardless of biome. Since `mountain` biome is only ever classified at
   `elevation > 0.70` (quantizing to level 5 or 6 — see `RealmToWorldGrid.ts`'s
   `quantizeElevation()`), a mountain-biome cell can *never* satisfy this gate as it stands today.
   Adding `mountain` to `VALID` alone would therefore be a no-op live-game-side.

**Resolution (confirmed with the user):** both are addressed, narrowly. `tundra` needs only the
`VALID` set change (it can already occur at low elevation via cold temperature, no elevation-gate
conflict). `mountain` needs both the `VALID` set change *and* a narrowly-scoped elevation-gate
relaxation — `isValidTile()` accepts levels 5-6 specifically when `cell.biome === 'mountain'`,
leaving the existing `[1, 2]` gate completely unchanged for every other biome/faction. This keeps
the blast radius of the elevation change to exactly the new mountain-biome case, with zero
behavior change for the 8 factions that don't need it.

**Dungeons/caves are explicitly out of scope.** Confirmed by direct code read: `DungeonPlacer.ts`
and `CaveGladePlacer.ts`/`CaveGladeWorldPlacer.ts` have no faction/race concept anywhere today.
Per the roadmap's own stated fallback ("if dungeons are faction-agnostic today, this sub-item may
be out of scope / deferred"), introducing one is a separate, much larger undertaking and is not
part of this pass.

## 3. Faction ↔ Biome Affinity Table

```ts
const BIOME_AFFINITY: Record<SettlementFaction, readonly RealmBiome[]> = {
  elven:    ['forest', 'taiga'],
  dwarven:  ['mountain', 'tundra'],
  vulperia: ['grassland', 'savanna'],
  vampire:  ['forest', 'mountain'],
  undead:   ['tundra', 'mountain', 'desert'],
  fae:      ['forest', 'grassland'],
  orcish:   ['savanna', 'desert'],
  slime:    ['grassland', 'forest'],
  human:    ['grassland', 'forest'],
};
```

Every one of the 7 settlement-eligible biomes (`grassland`, `forest`, `savanna`, `taiga`,
`desert`, `tundra`, `mountain`) has at least 2 factions with affinity — no biome is "orphaned"
with zero interested factions.

## 4. Weighted Random Pick

Replace the settlement-siting loop's uniform faction pick with a weighted one: every faction
starts at weight 1; any faction whose `BIOME_AFFINITY` entry includes the candidate cell's biome
gets weight 5 instead. Pick via cumulative-weight roulette using the same seeded `rand()` already
threaded through `generateRealmData()` (no new RNG stream, preserving determinism).

`FACTIONS` is currently declared *inside* `generateRealmData()`'s function body (a local `const`,
not depending on any of the function's parameters) — it moves to module scope alongside the new
`BIOME_AFFINITY` table, so `pickFaction()` can be a standalone, directly-testable function rather
than a closure:

```ts
const AFFINITY_WEIGHT = 5;

/** Weighted-random faction pick for a settlement candidate cell's biome —
 *  every faction has a baseline weight of 1, boosted to AFFINITY_WEIGHT
 *  for any faction whose BIOME_AFFINITY includes this biome. Bias, not a
 *  hard rule: every faction stays reachable. Exported for direct unit
 *  testing (same pattern as RealmGenerator.ts's _domainWarp). */
export function pickFaction(biome: RealmBiome, rand: () => number): SettlementFaction {
  const weights = FACTIONS.map(f => BIOME_AFFINITY[f].includes(biome) ? AFFINITY_WEIGHT : 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < FACTIONS.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return FACTIONS[i]!;
  }
  return FACTIONS[FACTIONS.length - 1]!; // floating-point fallback, never hit in practice
}
```

This is a bias, not a hard rule: on `taiga` (only `elven` has affinity), weights are
`[1,1,1,1,1,1,1,1,5]` (8 non-affinity factions at 1 + elven at 5 = 13 total) — elven lands
roughly 5/13 ≈ 38% of the time, a strong lean but far from guaranteed. On `forest` (5 factions
with affinity: elven, vampire, fae, slime, human), the same boost is diluted across more
factions, giving a gentler lean — a deliberate, self-balancing property of the weighting rather
than something that needs per-biome tuning.

## 5. `VALID` Set and Elevation-Gate Changes

`RealmGenerator.ts`:
```ts
const VALID = new Set<RealmBiome>(['grassland','forest','savanna','taiga','desert','tundra','mountain']);
```

`SettlementPlacer.ts`'s `isValidTile()`:
```ts
const cell = grid.get(col, row);
if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
if (cell.feature === 'river')                  return false;
const elevOk = cell.biome === 'mountain'
  ? (cell.elevation >= 5 && cell.elevation <= 6)  // mountain's own quantized elevation band
  : (cell.elevation >= 1 && cell.elevation <= 2); // unchanged for every other biome
if (!elevOk)                                    return false;
if (cell.content !== 'empty')                  return false;
```

## 6. Testing

- **Affinity bias, statistical:** across many seeds (e.g. 200+), the proportion of `taiga`-sited
  settlements assigned `elven` is measurably higher than the ~11% uniform baseline (9 factions).
  Same check for a couple of other single-affinity-heavy biomes.
- **Weighted-pick unit tests** (on the extracted `pickFaction`-equivalent helper, exported for
  testing): determinism, "affinity faction is picked more often than a non-affinity one over many
  rolls at the same biome", "every faction remains reachable (weight never literally zero)".
- **`VALID`/elevation-gate regression:** a settlement can now be sited on a `tundra` or `mountain`
  cell (previously impossible); every other biome's existing elevation-gate behavior (levels 1-2)
  is unchanged (explicit regression test, since this is the highest-risk part of this change).
- Existing `RealmGenerator.test.ts`/`SettlementPlacer` determinism tests must keep passing
  unmodified.

## 7. Explicitly Out of Scope

- Any faction/race concept for dungeons or caves/glades (§2).
- Changing settlement *size* classification logic (still `forest`/`grassland`-gated for `city`,
  untouched).
- Tuning the `AFFINITY_WEIGHT` constant beyond a single reasonable starting value — per the
  roadmap's own framing ("tune via playtesting, not fixed in stone"), further calibration is a
  follow-up, not part of this pass.
