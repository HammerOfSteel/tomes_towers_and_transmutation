# Settlement Integration
> 🚧 In Progress — Place generated settlements from OW-A/B into the 3D overworld at correct realm map positions.

> ⚠️ **This is P1 in [STUDIO-LIVE-PARITY.md](./STUDIO-LIVE-PARITY.md)** —
> depends on P0 (Realm/Terrain unification) landing first. **SI-5 (LOD) is
> explicitly paused** until then — don't build LOD against a settlement
> layout/position that P1 may still change.

## Status: 🚧 In Progress — SI-1 through SI-6 all shipped as pure, tested
data-transform/mesh/geometry modules (`SettlementSpawner.ts`,
`SettlementRoadMesh.ts`, `SettlementPopulator.ts`, `SettlementBoundary.ts`,
`SettlementLOD.ts`) operating on the Studio's `RealmSettlement` shape.

**Important, discovered this session (same pattern as dungeon/cave
integration):** the live game's `OverworldScene.ts` already has its own
**separate, more complete** settlement pipeline built directly against
`WorldData`'s `SettlementEntry`/`SettlementPlan` (from `SettlementGenerator.ts`)
— buildings, per-settlement road tiles, inter-settlement roads, and
role-distributed NPC spawning (village/town/city role mixes) are **already
live and working**, independently of these SI-1/2/3 pure modules. Those
modules remain valuable as a Studio-side preview/design tool and as tested
reference algorithms, but they are not literally called by
`OverworldScene.ts`.

What genuinely was *not* live yet — and is the real remaining gap — is SI-4's
boundary-crossing behaviour (toast/audio/collision) and SI-5's
distance-based LOD, since the live settlement code had no boundary or LOD
concept at all until this session.

### Building placement & interiors ✅ (shipped)
See `docs/superpowers/specs/2026-07-28-building-placement-and-interiors-design.md`
and `docs/superpowers/plans/2026-07-28-building-placement-and-interiors-plan.md`
for the full design/plan.
- [x] Settlement layout is now footprint-aware — buildings use their real
  `getFootprint()` dimensions (not a fixed placeholder size) for placement,
  overlap-avoidance (`_noOverlap()`), and road-clearance checks; settlements
  are allowed to grow larger/more spread out to fit real footprints instead
  of clipping/shrinking buildings to preserve the old tight layout
  (`src/world/buildings/BuildingTypes.ts`, `SettlementGenerator.ts`)
- [x] Building interiors now route through `sceneManager.loadDungeon()` and
  `buildingToDungeonPlan()`, the same dungeon-style architecture as real
  dungeons and the greenhouse — the old bespoke overlay-mount interior system
  (`_mountInterior`/`_unmountInterior`/`enterBuildingInterior`/
  `_switchBuildingFloor`/`leaveBuildingInterior`/`INTERIOR_Y`) has been fully
  removed from `main.ts`
- [x] Multi-floor buildings get real staircases (`StaircaseEntry` wiring with
  `.direction: 'up'/'down'`, matching `TowerGenerator.ts`'s convention) with
  working stair-step geometry and `getStaircaseTrigger()`/`getStaircaseHint()`
  support, instead of plain doors invisible to staircase-specific APIs
- [x] Fixed a latent player-fall-through-floor bug: a redundant hardcoded
  post-`loadDungeon()` teleport in `main.ts` (present for dungeons/greenhouse
  too, just usually masked by larger room sizes) was overriding
  `executeRoomSwap()`'s own correct centered spawn point
- [x] `tests/e2e/building-floors.spec.ts` covers single-floor and multi-floor
  building entry/exit/floor-navigation end-to-end (7/7 passing)

### This session — SI-4 boundary crossing ✅ (partial — toast only)
- [x] `OverworldScene.ts`: each live settlement's boundary radius is now
  computed at build time (farthest building from centre, in world units, +4u
  margin — same formula as `SettlementBoundary.ts`'s `settlementBoundaryRadius`,
  reimplemented against the live `SettlementPlan` shape since it differs from
  the Studio's `SettlementSpawnPlan`)
- [x] `checkSettlementBoundaryCrossing(pos)` — call once per frame; returns
  `{ name, crossing: 'entering' | 'exiting' }` the frame the player crosses a
  settlement's boundary, `null` otherwise; tracks a single "currently inside"
  settlement index frame-to-frame
- [x] `main.ts` — wired into the main per-frame update loop: shows an
  "Entering [Name]" / "Leaving [Name]" story toast via the existing
  `_storyToast` helper
- [ ] Collision walls — still needs a physics-collider generator pass (no
  such system exists for settlements yet); out of scope for this pass
- [ ] Ambient audio zone swap — still needs the audio bus/mixer wired to the
  same crossing event; out of scope for this pass
- No dedicated unit test added — `checkSettlementBoundaryCrossing()`'s
  distance-vs-radius logic is trivial and tightly coupled to full
  `OverworldScene` construction (no existing test file for this class,
  consistent with its other proximity methods like `nearDungeonEntrance`)

### Still not started for the live pipeline
- [ ] SI-5 LOD (billboard swap / NPC spawn-despawn by distance) — no
  live wiring yet; `SettlementLOD.ts`'s thresholds exist but aren't called
  from `OverworldScene.ts`
- [ ] Per-faction cobblestone road variant (SI-2 noted this as a text-factory
  follow-up, still open)

### Settlement visual fidelity (roads, spacing, rotation, race decor) — planned
> 📋 See `docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md` for
> the full plan. Root cause: `planSettlement()`'s building-density fix
> (`SettlementGenerator.ts`, PR #38) correctly increased building counts to
> match Studio's ward map, but downstream `Math.round()`-ing every building
> to an integer WorldGrid tile collapses `fillWard()`'s real pixel-space
> spacing, roads render as isolated per-tile quads instead of a continuous
> street ribbon, and building rotation is copied through un-snapped
> (arbitrary angle instead of cardinal 0/90/180/270°).
- [x] Phase 1 (technical fixes): sub-tile continuous building offset,
  cardinal rotation snapping, continuous road-ribbon rendering — no
  footprint/spacing-constant changes, purely a rendering-layer fix shared
  by both the Settlement Lab and the live overworld. **Done** — verified via
  unit tests + Playwright screenshot re-check (village and city types both
  show visible building gaps, ribbon streets with lamp posts, cardinal
  rotations).
- [ ] Phase 2a (this pass): park-ward feature clusters — 9 faction-distinct,
  thematically correct centerpieces (Slime Pool, Sacred Grove, Graveyard,
  Burrow Commons, etc. — see plan §4.0/§4.0a), not palette-swapped copies of
  a shared shape. `park` wards currently render nothing at all.
- [ ] Phase 2b/2c (separately scoped, follow-up): faction-specific building
  silhouettes for market/patriciate wards (Fox Den, Lich Tower, Wraith
  Bazaar, Night Market, etc.) + generic prop shape library (market stalls,
  wells, fences, banners) for craftsmen/slum/market clutter, batched
  through the existing mesh-merge batching to avoid a draw-call regression.
- [ ] Phase 3 (stretch, re-evaluate after Phase 1): iso-camera roof
  occlusion/fade near the player.
- [ ] Phase 4: spot-check the live overworld benefits from Phase 1 the same
  way the Lab does (shared code path, no separate implementation expected).

## Goal
When the player walks toward a settlement dot on the realm map, they find actual 3D buildings there — matching the faction and layout generated by the settlement tool.


## Tasks

### SI-1 — Settlement Spawner ✅
- [x] `SettlementSpawner.ts`: given a `RealmSettlement` (x, y, name, faction, size), places a building cluster at world position
- [x] World position: realm cell `(x, y) → (x * TERRAIN_TILE_SIZE, y * TERRAIN_TILE_SIZE)` — same coordinate space as RI-1's terrain grid, so a settlement always lands on its matching terrain tile (equivalent to the spec's `(x/realmW)*WORLD_SIZE` formula, expressed in RI-1's per-cell units instead of a separate `WORLD_SIZE` constant)
- [x] Uses `factionBuildingDna()` (PROC-B, `src/world/buildings/BuildingDNA.ts`) to build a per-building `BuildingDNA`; the caller turns each into a mesh with `buildBuilding(dna)` — this module only produces DNA + placement, same separation of concerns as RI-1's `TileDNA` + `buildTile()`
- [x] Ground height: accepts an injected `heightAt?: RiverHeightSampler` (reuses RI-3's `makeHeightSampler()` type) instead of raycasting — there's no live THREE.Scene inside a pure module to raycast against; the renderer that instantiates the buildings is expected to sample/raycast per building using this same interface
- [x] Deterministic seed: derived by hashing the settlement's realm-cell coords + name when no explicit seed is given, so a given realm seed always produces the same settlement layout (satisfies SI-6's determinism requirement)
- [x] Deliberately does **not** reuse the Studio's full ward/Voronoi/road system (`generateSettlementModel` in `overworld-studio.ts`) — that produces a much richer local street layout than a realm-map placement needs; instead uses a simpler concentric-ring layout with a size-appropriate building mix (village/town/city counts). See code comments in `SettlementSpawner.ts` for the full rationale.
- [x] Unit tests: `tests/world/SettlementSpawner.test.ts` (15 tests) — determinism (seeded + derived), position formula, faction mapping (including the `human`→`human_rural/town/noble` split and `undead`→`undead_common` rename), building-count scaling by size, no-overlap placement, centre well/plaza marker.

### SI-2 — Street + Path Mesh ✅
- [x] Settlement roads → quad-strip ribbon at ground level (`src/world/SettlementRoadMesh.ts`). Deviation: since SI-1 doesn't reuse the Studio's Chaikin-smoothed road network (see SI-1 notes), there's no such network to draw — instead generates a spoke layout (one straight road per building, from the settlement centre), the natural road network for SI-1's concentric-ring placement
- [x] Road width by type: main road 2 WU (anchor buildings: guild/inn/tavern/chapel/well/gate) vs. alley 1 WU (everything else) — matches the spec's widths exactly
- [x] Road material: reuses the existing `cobblestoneTexture()` (`src/world/buildings/TextureFactory.ts`, lazy/canvas-based, safe to import as a runtime value — no top-level DOM side effects like `overworld-studio.ts`); per-faction cobblestone variant not yet done (texture factory doesn't have faction variants currently — would need its own follow-up)
- [x] Unit tests: `tests/world/SettlementRoadMesh.test.ts` (7 tests) — one segment per non-centre building, segments start at settlement centre, width-by-anchor-kind, determinism, mesh-per-segment with UVs, height-sampler usage, no-crash on minimal settlements

### SI-3 — NPC Population ✅ (data transform only)
- [x] `SettlementPopulator.ts`: generates `NpcDNA[]` from a `SettlementSpawnPlan` (SI-1) — keyed off *building kind* rather than ward type, since SI-1 doesn't model wards (see file header for the full mapping rationale):
  - `shop` building → 2-3 merchants
  - `watchtower` / `gate` building → 1-2 guards
  - `inn` / `tavern` building → 1 innkeeper + 1-2 wanderers (mapped to the `mysterious` role — no dedicated "wanderer" `NpcRole` exists)
  - town/city plan → 1 quest-giver (placed at the `guild` building if present, else settlement centre)
- [x] Faction → species mapping (`FACTION_TO_SPECIES`): `SettlementFaction` (9 values) → `GameSpecies` (7 values) isn't 1:1 — dwarven/orcish → human, vampire → undead, fae → elf (documented deviation, no dedicated NPC bodytypes for those factions yet)
- [x] Deterministic seed (derived from plan name + position when omitted), same pattern as SI-1
- [x] Unit tests: `tests/world/SettlementPopulator.test.ts` (10 tests) — determinism, village has no triggered NPCs (no shop/inn/watchtower in the village mix), town/city get a quest-giver, merchant/guard/innkeeper+wanderer counts match their trigger buildings, species mapping, finite world positions
- [ ] Not yet done: actually calling `buildNpc(dna)` to spawn instances (needs a live scene/renderer — this module only produces the DNA + placement list, mirroring SI-1's `buildBuilding()` separation), idle wander behaviour (a runtime/AI concern, not a data transform)

### SI-4 — Settlement Boundary ✅ (geometry only)
- [x] Boundary geometry (`src/world/SettlementBoundary.ts`): `settlementBoundaryRadius()` derives the radius from the farthest placed building + a margin, `isInsideSettlementBoundary()` tests a world position, `crossedSettlementBoundary()` detects an entering/exiting transition between two positions (e.g. last-frame vs. this-frame player position)
- [ ] Collision walls — needs a live physics/collider system (Rapier, per `OverworldScene.ts`'s existing pattern) to actually place; this module only provides the boundary geometry that a collider generator would consume
- [ ] Ambient audio zone swap — needs the audio bus/mixer; `crossedSettlementBoundary()`'s `'entering'`/`'exiting'` return value is exactly the trigger such a system would listen for
- [ ] "Entering [Name]" toast — needs the UI toast queue; same trigger as above (`plan.name` + the crossing event)
- [x] Unit tests: `tests/world/SettlementBoundary.test.ts` (7 tests) — radius formula, radius scaling with settlement size, inside/outside test (default + explicit radius), entering/exiting/no-crossing detection

### SI-5 — Level of Detail ✅ (thresholds only)
- [x] Distance thresholds (`src/world/SettlementLOD.ts`): `settlementLodTier(distance)` returns `'hidden'` beyond 80u, `'billboard'` between 40-80u, `'full'` within 40u; `shouldSpawnSettlementNpcs(distance)` returns true within 20u — pure functions the renderer calls each frame per settlement/player distance
- [ ] Actual billboard sprite swap, full-geometry show/hide, and NPC spawn/despawn — needs the live scene + render loop; this module only provides the tier decision
- [x] Unit tests: `tests/world/SettlementLOD.test.ts` (5 tests) — tier boundaries at exactly 40u/80u, NPC-spawn boundary at exactly 20u

### SI-6 — Tests ✅ (covered across the SI-1/2/3/4/5 unit tests above)
- [x] Same realm seed → same settlement positions every run — covered by the determinism tests in `SettlementSpawner.test.ts`, `SettlementPopulator.test.ts`, and `SettlementRoadMesh.test.ts` (same seed/plan in ⇒ `toEqual` identical output out)
- [x] All 3 settlement sizes (village/town/city) spawn without Three.js errors — `SettlementSpawner.test.ts` parametrizes village/town/city and asserts valid finite placements; `SettlementRoadMesh.test.ts` builds real `THREE.Mesh`/`THREE.Group` output and asserts `dispose()` doesn't throw

## Dependencies
- Requires: PROC-B `buildBuilding()` + `buildNpc()` ✅ (both already exist: `src/world/buildings/BuildingBuilder.ts` `buildBuilding()`, `src/npc-creator/builder.ts` `buildNpcSync()`)
- Requires: RI-1 terrain mesh (need ground height)
- Feeds: quest givers (05-content), NPC interactions
