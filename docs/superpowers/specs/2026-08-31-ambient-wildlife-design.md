# Ambient Wildlife (Phase 9 Batch 1) — Design

## 0. Process Note

This is the first of Phase 9's 3 independent stretch items (per
`docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 9 section and
`TODO/03-procedural-pipeline/PROC-C-world-generation.md`'s WG-3). The user confirmed (via
`ask_user`, unavailable to answer interactively this round) proceeding autonomously: "The user
is not available to respond and will review your work later. Work autonomously and make good
decisions." This spec documents every scoping decision inline for their later review, following
the same pattern used for grass batches 1/2 earlier this session.

**A pre-check found RI-4 (chunk-manager live wiring, also listed under Phase 9) is already
done** — `OverworldScene.update()` already calls `this._chunkManager.update(pos.x, pos.z)` every
frame (confirmed by direct code read). The roadmap's Phase 9 write-up was written before this
was verified against the actual RI-4 TODO item's literal wording ("wiring `chunkManager.update()`
... from the scene tick"), which is specifically about wiring the *Studio* `RealmToTerrain.ts`/
`RealmRiverMesh.ts` pipeline — a parallel implementation that was superseded by the live
`WorldGenerator.ts`/`TerrainGeometryBuilder.ts` grid pipeline once STUDIO↔LIVE biome-generation
parity was achieved in an earlier session. That specific checkbox is now moot; no work item
remains there. This spec covers Phase 9's remaining, still-genuinely-open item: **per-biome
ambient creature spawns** (WG-3). The other 2 Phase 9 items (LOD, world editor paint mode) are
each separate follow-up specs.

## 1. Context

`PROC-C-world-generation.md`'s WG-3 asks for `generateOverworldAmbient(realmData)` producing
per-biome ambient spawn lists — forest deer/rabbits, bog frogs/will-o-wisps, mountain
eagles/goats — built from `buildCreature(dna)` (the same procedural creature-rig system already
used for the player, enemies, and NPCs). The WG-3 spec predates this project's current 11-biome
taxonomy (`deep_ocean | ocean | beach | desert | savanna | grassland | forest | taiga | tundra |
snow | mountain`, from `WorldGrid.ts`) — "bog" isn't a biome in the current system, so this batch
substitutes reasonable current-biome equivalents rather than reproducing WG-3's exact wording.

**Purpose:** purely cosmetic ambient life — makes biomes feel inhabited/alive. Non-hostile,
non-combat, no player interaction beyond fleeing when approached. Explicitly NOT tied to WG-4's
"reward ecology"/material-distribution concerns (already correctly deferred to a future
crafting/economy session per the roadmap's own note) or to any hunting/taming/companion system.

**Confirmed reusable infrastructure** (found via direct code read):
- `CreatureDNA.ts`'s `Archetype` union already includes `'quadruped'` (used for
  four-legged creatures) — `dnaForArchetype('quadruped')` returns a working default DNA, though
  its out-of-the-box look (angry face, red slit eyes, fangs, dark green coloring) reads as a
  monster, not peaceful wildlife — this batch overrides `face`/`colors`/`proportions` per species
  rather than using the raw quadruped default.
- `CreatureBuilder.ts`'s `buildCreature(dna): CreatureRig` builds the actual 3D rig from any DNA,
  archetype-agnostic — the exact function WG-3 itself calls for.
- `CreatureAnimator.ts`'s `animateCreature(rig, {state, time, velocity})` drives idle/walk poses
  from a simple state string + time + velocity — no combat-specific state needed.
- `ScatterRules.ts`'s `isScatterAllowed(cell, kind)` already centralizes the water/road/
  settlement/occupied-tile exclusions shared by every other scatter kind (tree/bush/rock/grass);
  this batch adds `'ambient'` as a new `ScatterKind` sharing those same exclusions.
- `OverworldScene.ts`'s existing chunk-streaming lifecycle (`TerrainChunkData`, `_loadTerrainChunk()`/
  `_unloadTerrainChunk()`) is the natural home for spawn/despawn — ambient creatures must be
  chunk-scoped (not spawned world-wide upfront like `_enemies`/`_spawnCamps`), since an ambient
  wildlife population needs to scale with however large the loaded area is, not the whole map.

## 2. Scope Decision — 2 Species, Ground-Only, This Batch

**Decision:** this batch covers exactly 2 species — **rabbit** (small quadruped, timid) and
**goat** (medium quadruped, sturdy) — across the biomes where they fit. **Birds/flight (`avian`
archetype) are explicitly deferred** to a follow-up batch.

**Rationale:** flight AI (3D wander including altitude, takeoff/landing, perch points) is a
meaningfully different and more complex behavior than ground-based wander — mixing both into one
pass would roughly double this batch's real design/testing surface for marginal added value in a
"lowest priority, stretch" item. Two ground-based species, sharing one wander/flee behavior
class, is a tight, provable, and directly extensible first slice — matching this session's
established multi-batch pattern (grass batch 1→2, territory dressing batch 1 of 9 factions).

**Per-biome species mapping** (adapting WG-3's examples to the current biome taxonomy):

| Biome | Species | Rationale |
|---|---|---|
| forest | rabbit | WG-3's own example. |
| grassland | rabbit | Open plains — same peaceful prey animal, most common biome. |
| taiga | rabbit | Cold-forest equivalent; sparser spawn density than forest/grassland (see §4). |
| mountain | goat | WG-3's own example (mountain goats). |
| savanna, tundra, desert, beach, snow, ocean, deep_ocean | *(none, this batch)* | Savanna substitutes for WG-3's "bog" slot conceptually but is deliberately left for a follow-up batch rather than inventing a 3rd species under time pressure; the water/sand/ice biomes have no ground-wildlife precedent in WG-3 to begin with. |

## 3. Behavior — Simple Wander/Flee FSM (Not `PatrolBehavior`)

A new, dedicated `AmbientCreatureBehavior` class — deliberately NOT reusing `PatrolBehavior.ts`
(which has `chase`/`attack`/`retreat` combat states baked into its FSM design; forcing peaceful
wildlife through a combat-shaped state machine would mean carrying dead states forever). 3 states:

- **`idle`**: standing still, playing the idle animation, for a random 2-5s dwell time.
- **`wander`**: walks in a straight line toward a random point within `WANDER_RADIUS` (8 WU) of
  the creature's original spawn point, playing the walk animation; transitions back to `idle` on
  arrival.
- **`flee`**: entered whenever the player is within `FLEE_TRIGGER_RADIUS` (6 WU); the creature
  runs directly away from the player's current position (walk animation, faster speed) until the
  player is beyond `FLEE_TRIGGER_RADIUS * 1.5` (hysteresis, avoiding rapid flee/idle flicker at
  the boundary), then returns to `idle`.

No health, no damage, no death, no combat — a fled/idle/wandering creature is never harmed and
never harms the player. This is a pure ambiance system, matching §1's explicit non-goal framing.

## 4. Spawning — Chunk-Scoped, Biome-Gated, Density-Tuned Per Species

Mirrors `_buildChunkScatter()`'s existing tree/rock/grass pattern exactly: a seeded Poisson-disk
scatter within each newly-loaded chunk's world-space bounds, gated by
`isScatterAllowed(cell, 'ambient')` plus a biome→species lookup (§2's table). Spacing (Poisson
minimum distance) is deliberately much sparser than grass/trees, since ambient creatures are a
rare "spot the wildlife" treat, not dense scenery:

- **forest/grassland**: `AMBIENT_SPACING = 40` WU (rabbits) — occasional sightings, not a
  rabbit on every corner.
- **taiga**: `AMBIENT_SPACING = 70` WU (rabbits) — half the density of forest/grassland,
  matching the harsher climate's real-world sparser wildlife.
- **mountain**: `AMBIENT_SPACING = 55` WU (goats) — rarer than rabbits (larger animal, smaller
  viable habitat band — mountain tiles are inherently less common than grassland).

**Population cap:** a global `MAX_ACTIVE_AMBIENT_CREATURES = 24` across all currently-loaded
chunks (checked at spawn time — a chunk simply spawns fewer than its Poisson candidates would
otherwise yield once the cap is hit), bounding worst-case per-frame AI/animation cost regardless
of how many chunks happen to be loaded at once (e.g. a very large `worldSize` with a wide load
radius). This mirrors the existing `_slimeIM`'s "128 slots; enemies never exceed that" style
fixed ceiling, scaled down since ambient creatures need individual (non-instanced) rigs for
per-creature wander state — 24 is comfortably below what SlimeEnemy-style individually-updated
entities already cost in this scene today.

## 5. Visual Tuning — Overriding `dnaForArchetype('quadruped')`'s Monster Look

Both species start from `dnaForArchetype('quadruped')` then override:

- **Rabbit**: `proportions.global: 0.4` (small), `face: { type: 'cute', eyeColor: 0x2a1a0a,
  mouthType: 'none', expression: 'neutral', eyeShape: 'round', browStyle: 'none' }`,
  `colors: { primary: 0xc9b896, secondary: 0x8a7a5c, emissiveIntensity: 0 }` (soft tan/brown fur,
  no glow — glow reads as magical/threatening, wrong for a rabbit).
- **Goat**: `proportions.global: 0.75` (mid-size, smaller than the player), `face: { type:
  'blank', eyeColor: 0x3a2a1a, mouthType: 'none', expression: 'neutral', eyeShape: 'round',
  browStyle: 'none' }`, `colors: { primary: 0xe8e0d0, secondary: 0x9a8a70, emissiveIntensity: 0 }`
  (pale cream/tan coat, sturdy mountain-goat coloring).

## 6. Architecture

New file `src/world/AmbientWildlife.ts`, split pure/testable-logic from THREE-dependent rendering
(the same split established for `GrassField.ts`/`TerritoryDressing.ts`):

- **Pure logic**: `AMBIENT_SPECIES: Record<'rabbit'|'goat', AmbientSpeciesDef>` (spacing, DNA
  overrides), `AMBIENT_BIOME_SPECIES: Partial<Record<BiomeId, 'rabbit'|'goat'>>` (§2's table),
  `selectAmbientSpawnPoints(wg, chunkBounds, biome, species, spacing, seed): {x,z}[]` (Poisson-disk,
  biome/`isScatterAllowed('ambient')`-gated — mirrors `_buildChunkScatter()`'s existing tree/rock
  loop structure directly, so no new placement algorithm is invented).
- **`AmbientCreatureBehavior`** (pure, no THREE): the §3 FSM — `tick(dt, ownPos, playerPos):
  {state, targetPos}` — fully unit-testable state-transition logic with plain `{x,z}` positions,
  no THREE.Vector3 dependency (mirrors `PatrolBehavior`'s own output-object convention where
  practical, but with a 3-state, no-combat contract).
- **`AmbientCreature`** (THREE-dependent): owns one `CreatureRig` (from `buildCreature(dna)`),
  one `AmbientCreatureBehavior`, applies `animateCreature()` + walks `rig.root` (the rig's
  positionable group) toward `targetPos` at `WANDER_SPEED`/`FLEE_SPEED`. Uses
  `computeQuadNaturalFootY(rig)` (the same helper `PlayerController.ts` already uses to ground
  its own quadruped-form rig) to offset `rig.root.position.y` so the creature's feet sit on the
  terrain surface, not floating or clipped into it. `update(playerPos, dt)` / `dispose()` —
  mirrors `SlimeEnemy`'s own public-method shape (`constructor`, `update(playerPos, dt)`,
  `dispose()`) for consistency with this codebase's other per-frame-updated entities.

`OverworldScene.ts` wiring: `TerrainChunkData` gains an `ambientCreatures: AmbientCreature[]`
field, populated in `_loadTerrainChunk()` (alongside the existing scatter build) and disposed in
`_unloadTerrainChunk()`. A new `_activeAmbientCreatures: AmbientCreature[]` running list (mirrors
`_enemies`) is appended to on load / spliced-from on unload, iterated once per frame in
`update()` for the wander/flee tick — capped at `MAX_ACTIVE_AMBIENT_CREATURES` globally (§4).

## 7. Testing

- `AmbientCreatureBehavior`: deterministic-seed unit tests for all 3 state transitions (idle→
  wander after dwell time, wander→idle on arrival, any-state→flee when player enters
  `FLEE_TRIGGER_RADIUS`, flee→idle once player exits `FLEE_TRIGGER_RADIUS * 1.5` — the hysteresis
  band explicitly tested to confirm no flicker at the exact boundary).
- `selectAmbientSpawnPoints()`: biome-gated (no spawns on a non-matching biome, mirroring
  `selectGrassPlacements`'s existing biome-isolation test pattern), respects `isScatterAllowed`
  exclusions (water/road/settlement/occupied), deterministic for a fixed seed.
- `AMBIENT_SPECIES`/`AMBIENT_BIOME_SPECIES` table shape tests (mirrors `GRASS_PRESETS`'s own
  table-shape test pattern).
- `OverworldScene` integration: a loaded chunk over a forest/grassland/taiga/mountain area
  produces at least one ambient creature of the expected species; the global
  `MAX_ACTIVE_AMBIENT_CREATURES` cap is respected even when many chunks are loaded at once;
  unloading a chunk disposes its creatures and removes them from the active list.
- e2e verification (one-off Playwright spec, matching the `procedural-grass.spec.ts`/
  `lantern-spell.spec.ts` convention): teleport near a forest/mountain tile, confirm a creature
  is visible with no console errors, confirm it flees when the player approaches.

## 8. Explicitly Out of Scope (This Batch)

- Avian (bird/eagle) ambient creatures — flight AI deferred to a follow-up batch.
- Savanna/tundra/desert ambient life — no species assigned this batch (see §2).
- Any combat, health, death, hunting, taming, or companion-recruitment interaction.
- Any sound design (ambient wildlife SFX) — visual-only this batch.
- WG-4's reward-ecology/material-distribution system — a separate, already-deferred concern
  (crafting/economy, not terrain/rendering).
- Any Overworld Studio dev-sandbox preview of ambient wildlife — targets the live
  `OverworldScene` only, matching this session's established live-first priority.
