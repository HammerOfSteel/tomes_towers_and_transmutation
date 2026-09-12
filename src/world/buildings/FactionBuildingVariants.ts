/**
 * FactionBuildingVariants.ts — Phase 2b of the settlement visual fidelity plan
 * (docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md §4.0b).
 *
 * Phase 2a gave non-building ward features (park) genuine per-faction
 * geometry. This does the same for *buildings* — the ward-defining
 * structures (patriciate/church/market) that today all share the exact
 * same `BuildingKind` mesh (villa/chapel/shop) recolored per faction via
 * `FACTION_PRESETS`. A vulperia "Fox Den" should not be a villa painted
 * orange; it should not look like a walled building at all.
 *
 * `buildBuilding()` (BuildingBuilder.ts) checks `FACTION_BUILDING_VARIANTS`
 * first, keyed by (dna.faction, dna.buildingKind); when present it replaces
 * the generic kind builder + style-overlay entirely. Falls back to the
 * existing shared-shape system for any (faction, kind) pair not covered
 * here — this is intentionally incremental, not a full 9-faction x 11-ward
 * rewrite in one pass (see plan doc Phase 2b/2c scoping).
 *
 * Covers the three highest-visibility "signature" ward kinds — patriciate
 * (villa), church (chapel), market (shop) — for 8 of the 9 settlement
 * factions (all but human, whose thatched/timber/tudor rural/town/noble
 * split already reads as a normal fantasy village and wasn't part of the
 * complaint): vulperia (earthen burrow/den, no flat walls), slime
 * (translucent gelatinous blob, no walls at all), undead (bone/crypt
 * ossuary spires), elven (living-tree trunks + leaf canopies), dwarven
 * (squat carved-stone blocks + iron-banded vault doors), orcish (crude
 * lashed-hide huts + bone/skull totems), vampire (Gothic-Revival/Second-
 * Empire manors with mansard roofs, oriel bays, shuttered lancet windows
 * and wrought iron), fae (glowing mushroom caps + petal ornaments).
 * Remaining follow-up: extend to human sub-factions and to
 * the 8 ward kinds beyond patriciate/church/market (see plan doc Phase
 * 2b/2c scoping) for the generic prop shape library.
 */

import * as THREE from 'three';
import type { BuildingDNA, BuildingKind, Faction } from './BuildingDNA';
import { buildElvenStoneTower } from './StoneTowerKit';
import { buildElvenTreehouseHome } from './ElvenTreehouseKit';
import { buildElvenMarketStall } from './ElvenMarketStallKit';
import { buildElvenChapelShrine } from './ElvenChapelKit';
// Task 22 (docs/superpowers/plans/2026-09-04-dwarven-buildings.md): the real
// bespoke depth-laddered stone-masonry kit-of-parts builders, one per
// canonical BuildingKind, replacing this file's own legacy
// dwarvenBlock()/addBlockDwarvenHall() BlockKit stepped-tier hall (smooth
// coursed boxes + a vault-wheel door) removed in the same commit.
import {
  buildDwarvenHouse,
  buildDwarvenTerraced,
  buildDwarvenShop,
  buildDwarvenInn,
  buildDwarvenBlacksmith,
  buildDwarvenVilla,
  buildDwarvenChapel,
  buildDwarvenWatchtower,
} from './dwarven/DwarvenBuildingKit';
// docs/superpowers/plans/2026-09-04-orcish-buildings.md: the real bespoke
// lashed-timber/hide kit-of-parts builders, one per canonical BuildingKind
// (OrcishBuildingKit.ts), replacing this file's own legacy
// addBlockOrcishHut()/buildOrcishVilla()/buildOrcishChapel()/
// buildOrcishShop() BlockKit lashed hut (a single mismatched-patch
// occupancy-grid hut reused/rescaled for villa/chapel/shop only, with no
// house/terraced/inn/blacksmith/watchtower coverage at all) removed in the
// same commit. Aliased on import to the `OrcishKit` suffix, mirroring
// slime's own aliasing convention below.
import {
  buildOrcishHouse as buildOrcishKitHouse,
  buildOrcishTerraced as buildOrcishKitTerraced,
  buildOrcishShop as buildOrcishKitShop,
  buildOrcishInn as buildOrcishKitInn,
  buildOrcishBlacksmith as buildOrcishKitBlacksmith,
  buildOrcishVilla as buildOrcishKitVilla,
  buildOrcishChapel as buildOrcishKitChapel,
  buildOrcishWatchtower as buildOrcishKitWatchtower,
} from './orcish/OrcishBuildingKit';
// docs/superpowers/specs/2026-09-04-vampire-buildings-design.md +
// docs/superpowers/plans/2026-09-04-vampire-buildings.md: the real
// bespoke Gothic-Revival/Second-Empire kit-of-parts builders, one per
// canonical BuildingKind (VampireBuildingKit.ts — shuttered lancet
// windows, oriel bays, mansard/gable roofs, wrought-iron railings,
// ornate chimneys), replacing this file's own legacy
// addBlockVampireSpire()/buildVampireVilla()/buildVampireChapel()/
// buildVampireShop() BlockKit tapering obsidian spire (villa/chapel/shop
// only, no house/terraced/inn/blacksmith/watchtower coverage at all)
// removed in the same commit. Aliased on import to the `VampireKit`
// suffix, mirroring orcish/slime's own aliasing convention above.
import {
  buildVampireHouse as buildVampireKitHouse,
  buildVampireTerraced as buildVampireKitTerraced,
  buildVampireShop as buildVampireKitShop,
  buildVampireInn as buildVampireKitInn,
  buildVampireBlacksmith as buildVampireKitBlacksmith,
  buildVampireVilla as buildVampireKitVilla,
  buildVampireChapel as buildVampireKitChapel,
  buildVampireWatchtower as buildVampireKitWatchtower,
} from './vampire/VampireBuildingKit';
// docs/superpowers/specs/2026-09-04-undead-buildings-design.md +
// docs/superpowers/plans/2026-09-04-undead-buildings.md: the real
// bespoke communal/funerary/horizontal necropolis kit-of-parts builders,
// one per canonical BuildingKind (UndeadNecropolisKit.ts — tomb/arcade
// openings, classical friezes/pediments, spolia patches, shored cracks,
// columbarium bands, cemetery lot dressing), replacing this file's own
// legacy addBlockUndeadSpire()/buildUndeadVilla()/buildUndeadChapel()/
// buildUndeadShop() BlockKit decayed ossuary spire (villa/chapel/shop
// only, no house/terraced/inn/blacksmith/watchtower coverage at all).
// Aliased on import to the `UndeadKit` suffix, mirroring vampire/orcish/
// slime's own aliasing convention above.
import {
  buildUndeadHouse as buildUndeadKitHouse,
  buildUndeadTerraced as buildUndeadKitTerraced,
  buildUndeadShop as buildUndeadKitShop,
  buildUndeadInn as buildUndeadKitInn,
  buildUndeadBlacksmith as buildUndeadKitBlacksmith,
  buildUndeadVilla as buildUndeadKitVilla,
  buildUndeadChapel as buildUndeadKitChapel,
  buildUndeadWatchtower as buildUndeadKitWatchtower,
} from './undead/UndeadNecropolisKit';
// Task 15 (docs/superpowers/plans/2026-09-04-slime-buildings.md): the real
// gel-block/pseudopod kit-of-parts builders, one per canonical BuildingKind,
// replacing this file's own legacy buildSlimeVilla/buildSlimeChapel/
// buildSlimeShop blob functions below (raw Sphere/Cylinder primitives).
// Aliased on import because the old local functions still exist under the
// same names pending their Task 17 removal.
import {
  buildSlimeHouse as buildSlimeKitHouse,
  buildSlimeTerraced as buildSlimeKitTerraced,
  buildSlimeShop as buildSlimeKitShop,
  buildSlimeInn as buildSlimeKitInn,
  buildSlimeBlacksmith as buildSlimeKitBlacksmith,
  buildSlimeVilla as buildSlimeKitVilla,
  buildSlimeChapel as buildSlimeKitChapel,
  buildSlimeWatchtower as buildSlimeKitWatchtower,
} from './slime/SlimeBuildingKit';
// docs/superpowers/specs/2026-09-04-vulperia-buildings-design.md +
// docs/superpowers/plans/2026-09-04-vulperia-buildings.md: the real
// bespoke fox-folk warren kit-of-parts builders, one per canonical
// BuildingKind (VulperiaBuildingKit.ts — coursed cob/timber walls,
// five-piece framed openings, segmented sod/turf roofs with visible
// ridge/hip seams and dark verge trim built via the new shared
// `TurfRoof.ts` kit module, raised porches/dormers, rigorous berm/skirt
// grounding), replacing this file's own legacy `vulperiaMound()`/
// `buildVulperiaVilla()`/`buildVulperiaChapel()`/`buildVulperiaShop()`
// BlockKit earthen-mound builders (villa/chapel/shop only, no house/
// terraced/inn/blacksmith/watchtower coverage at all, and never a real
// constructed building per the design spec's explicit "move to modular
// constructed architecture" directive). `buildVulperiaDenMoundGrid()`
// itself (the BlockKit heightfield helper) is preserved and still used
// by WardFeatureClusters.ts for lore/ground-dressing den mounds outside
// the building kind system. Aliased on import to the `VulperiaKit`
// suffix, mirroring slime/dwarven/orcish/vampire/undead's own aliasing
// convention above.
import {
  buildVulperiaHouse as buildVulperiaKitHouse,
  buildVulperiaTerraced as buildVulperiaKitTerraced,
  buildVulperiaShop as buildVulperiaKitShop,
  buildVulperiaInn as buildVulperiaKitInn,
  buildVulperiaBlacksmith as buildVulperiaKitBlacksmith,
  buildVulperiaVilla as buildVulperiaKitVilla,
  buildVulperiaChapel as buildVulperiaKitChapel,
  buildVulperiaWatchtower as buildVulperiaKitWatchtower,
} from './vulperia/VulperiaBuildingKit';
import {
  buildFaeHouse as buildFaeKitHouse,
  buildFaeTerraced as buildFaeKitTerraced,
  buildFaeVilla as buildFaeKitVilla,
  buildFaeInn as buildFaeKitInn,
  buildFaeShop as buildFaeKitShop,
  buildFaeBlacksmith as buildFaeKitBlacksmith,
  buildFaeChapel as buildFaeKitChapel,
  buildFaeWatchtower as buildFaeKitWatchtower,
} from './fae/FaeBuildingKit';

// ── Shared helpers (mirrors WardFeatureClusters.ts's conventions) ────────────

// (Legacy `mat()`/`addMesh()` generic MeshStandardMaterial + box-mesh
// helpers and the `addDoorway()` disc/box doorway-opening stand-in removed
// once the last remaining callers — fae's old BlockKit toadstool-stalk-grid
// builders — migrated to FaeBuildingKit.ts's real depth-laddered five-piece
// openings; every race now either carves its doorway directly into the
// block grid or, where still primitive-based, uses its own inline doorway
// geometry.)

// (Legacy per-mesh-deformation "organic mound" primitive removed in Phase 2e
// §2e.3 — replaced by the grounded BlockKit heightfield mound,
// `addBlockDenMound()`/`buildVulperiaDenMoundGrid()`, below.)

// ── Vulperia — fox-folk warren architecture ─────────────────────────────────
// REMOVED (docs/superpowers/plans/2026-09-04-vulperia-buildings.md): the old
// addTimberRingSegments/addRoundDoor/addRoundWindow/glassLikeMat/
// addChimneyStack/addGrassTufts/addGardenFence/addPlanterBarrel/
// addBlockDenMound/vulperiaMound/buildVulperiaVilla/buildVulperiaChapel/
// buildVulperiaShop earthen-mound functions that used to live here have
// been fully replaced by src/world/buildings/vulperia/VulperiaBuildingKit.ts's
// real coursed cob/timber + segmented turf-roof kit-of-parts builders
// (imported above as buildVulperiaKit*), which now cover all 8 canonical
// kinds via the vulperia registry entry below. `buildVulperiaDenMoundGrid()`
// itself (FactionBlockProfiles.ts) is NOT removed -- it remains a genuine,
// separately-used BlockKit heightfield helper for lore/ground-dressing den
// mounds (FactionTerritoryProps.ts), just no longer for building kinds.
// Deleted (rather than left in place unused) because tsconfig's
// noUnusedLocals:true turns dead code into real new tsc errors, matching
// the precedent set by slime/dwarven/orcish/vampire/undead's own registry
// rewires above.

// ── Slime — translucent gelatinous blob architecture ─────────────────────────
// REMOVED (Task 15/17, docs/superpowers/plans/2026-09-04-slime-buildings.md):
// the old slimeBlobMaterial/buildSlimeBlobBase/buildSlimeVilla/
// buildSlimeChapel/buildSlimeShop raw Sphere/Cylinder "blob" functions that
// used to live here have been fully replaced by
// src/world/buildings/slime/SlimeBuildingKit.ts's real gel-block/pseudopod
// kit-of-parts builders (imported above as buildSlimeKit*), which now cover
// all 8 canonical kinds via the slime registry entry below. Deleted in the
// same pass as the Task 15 registry rewire (rather than deferred to a
// separate Task 17) because tsconfig's noUnusedLocals:true turns leaving
// them in place unused into real new tsc errors -- there is no benefit to
// keeping now-dead code around for an extra task cycle.

// docs/superpowers/specs/2026-09-04-undead-buildings-design.md +
// docs/superpowers/plans/2026-09-04-undead-buildings.md: the real
// bespoke communal/funerary/horizontal necropolis kit-of-parts builders,
// one per canonical BuildingKind (UndeadNecropolisKit.ts — tomb/arcade
// openings, table-tomb lid roofs, classical friezes/pediments, spolia
// patches, shored cracks, columbarium bands, cemetery lot dressing),
// replacing this file's own legacy addBlockUndeadSpire()/
// buildUndeadVilla()/buildUndeadChapel()/buildUndeadShop() BlockKit
// decayed ossuary spire (villa/chapel/shop only, no house/terraced/inn/
// blacksmith/watchtower coverage at all, and a private/vertical "lich
// tower" silhouette at odds with undead's communal/horizontal/decaying
// doctrine addendum). Aliased on import to the `UndeadKit` suffix,
// mirroring vampire/orcish/slime's own aliasing convention above.
// `buildUndeadTierGrid`/`undeadRoofTopY`/`UndeadTierOptions` remain
// exported, tested, reusable primitives in FactionBlockProfiles.ts for
// any future kind that wants them — not deleted, just no longer wired
// into a live undead builder here.

// ── Elven — living-tree architecture ──────────────────────────────────────────
// The Elder's Hall (patriciate/house/terraced/inn/blacksmith), Moonlit
// Exchange (market), and (2026-09-04) the Ancient Shrine (church/chapel)
// have all since moved to the tower kit's real block-course + carved-
// opening construction (see ElvenTreehouseKit.ts / ElvenMarketStallKit.ts /
// ElvenChapelKit.ts) -- `addBlockElvenTrunk()`/`buildElvenTrunkGrid()`
// (the BlockKit voxel-occupancy technique) had no remaining callers in
// this file once `buildElvenShop()` was rebuilt, and were removed as dead
// code. `buildElvenTrunkGrid`/`pickElvenEntranceStyle`/
// `pickElvenCanopyArchetype`/`carveTrunkWindows` remain exported, tested,
// reusable primitives in FactionBlockProfiles.ts/ElvenTrunkWindows.ts for
// any future kind that wants them -- not deleted, just no longer wired
// into a live elven builder here.

// ── Dwarven — bespoke depth-laddered stone masonry kit-of-parts ───────────────
// Guild Hall (patriciate), Stone Temple (church), Trade Vault (market), and
// all 5 other canonical kinds: real per-course stone masonry with a genuine
// depth ladder (recessed/proud geometry, never flat colour changes) and
// five-piece openings (recess/surround/sill/mullion/set-back glazing) on
// every window and door, built via src/world/buildings/dwarven/
// DwarvenBuildingKit.ts (docs/superpowers/plans/2026-09-04-dwarven-
// buildings.md) — replacing the earlier BlockKit stepped-tier hall
// (buildDwarvenHallGrid(), smooth coursed boxes + a vault-wheel door) that
// only covered villa/chapel/shop, reused as a stopgap for house/terraced/
// inn/blacksmith, and had no watchtower coverage at all. Dwarven is the
// second faction (after slime) with a bespoke builder for every canonical
// BuildingKind.

// ── Orcish — real bespoke lashed-timber/hide kit-of-parts builders live in
// OrcishBuildingKit.ts (docs/superpowers/plans/2026-09-04-orcish-buildings.
// md), imported above as buildOrcishKit*. The old addBlockOrcishHut()/
// buildOrcishVilla()/buildOrcishChapel()/buildOrcishShop() BlockKit lashed
// hut (a single mismatched-patch occupancy-grid hut reused/rescaled for
// villa/chapel/shop only, with no house/terraced/inn/blacksmith/watchtower
// coverage at all) was removed in the same commit that added the new kit.

// ── Vampire — real bespoke Gothic-Revival/Second-Empire kit-of-parts
// builders live in vampire/VampireBuildingKit.ts (docs/superpowers/specs/
// 2026-09-04-vampire-buildings-design.md + docs/superpowers/plans/
// 2026-09-04-vampire-buildings.md), imported above as buildVampireKit*.
// The old addBlockVampireSpire()/buildVampireVilla()/buildVampireChapel()/
// buildVampireShop() BlockKit tapering obsidian spire (villa/chapel/shop
// only, with no house/terraced/inn/blacksmith/watchtower coverage at all)
// was removed in the same commit that added the new kit.

// ── Fae — real bespoke storybook-organic kit-of-parts builders live in
// fae/FaeBuildingKit.ts (docs/superpowers/specs/
// 2026-09-04-fae-buildings-design.md + docs/superpowers/plans/
// 2026-09-04-fae-buildings.md), imported above as buildFaeKit*. The old
// addBlockFaeStalk()/buildFaeVilla()/buildFaeChapel()/buildFaeShop()
// BlockKit toadstool occupancy-grid stalk (villa/chapel/shop only, with
// no house/terraced/inn/blacksmith/watchtower coverage at all) was
// removed in the same commit that added the new kit, along with its
// `buildFaeStalkGrid()`/`faeCapTopY()`/`faeCapRimRadius()` helpers in
// FactionBlockProfiles.ts.


// ── Registry ──────────────────────────────────────────────────────────────────

export const FACTION_BUILDING_VARIANTS: Partial<Record<Faction, Partial<Record<BuildingKind, (dna: BuildingDNA) => THREE.Group>>>> = {
  vulperia: {
    // docs/superpowers/plans/2026-09-04-vulperia-buildings.md: vulperia is
    // the sixth faction (after slime/dwarven/orcish/vampire/undead) with a
    // real bespoke kit builder for every canonical kind
    // (VulperiaBuildingKit.ts's fox-folk warren construction — coursed
    // cob/timber walls, five-piece framed openings, segmented sod/turf
    // roofs with visible ridge/hip seams via the new shared TurfRoof.ts
    // kit module, raised porches/dormers, rigorous berm/skirt grounding),
    // replacing the earlier "earthen mound reused for villa/chapel/shop,
    // no house/terraced/inn/blacksmith/watchtower at all" stopgap.
    house:      buildVulperiaKitHouse,
    terraced:   buildVulperiaKitTerraced,
    shop:       buildVulperiaKitShop,
    inn:        buildVulperiaKitInn,
    blacksmith: buildVulperiaKitBlacksmith,
    villa:      buildVulperiaKitVilla,
    chapel:     buildVulperiaKitChapel,
    watchtower: buildVulperiaKitWatchtower,
    tower:      buildVulperiaKitWatchtower,
  },
  slime: {
    // Task 15 (docs/superpowers/plans/2026-09-04-slime-buildings.md): slime
    // is the first faction with a real bespoke kit builder for every
    // canonical kind (SlimeBuildingKit.ts's gel-block/pseudopod
    // construction), replacing the earlier "every kind reuses the villa
    // blob" stopgap. watchtower/tower previously had NO slime override at
    // all (fell through to the generic square box-stacked builder).
    house:      buildSlimeKitHouse,
    terraced:   buildSlimeKitTerraced,
    shop:       buildSlimeKitShop,
    inn:        buildSlimeKitInn,
    blacksmith: buildSlimeKitBlacksmith,
    villa:      buildSlimeKitVilla,
    chapel:     buildSlimeKitChapel,
    watchtower: buildSlimeKitWatchtower,
    tower:      buildSlimeKitWatchtower,
  },
  undead_common: {
    // docs/superpowers/plans/2026-09-04-undead-buildings.md: undead is
    // the fifth faction (after slime/dwarven/orcish/vampire) with a real
    // bespoke kit builder for every canonical kind
    // (UndeadNecropolisKit.ts's communal/funerary/horizontal necropolis
    // construction — tomb/arcade openings, table-tomb lid roofs,
    // classical friezes/pediments/spolia, cemetery lot dressing),
    // replacing the earlier "villa spire reused for house/terraced/inn/
    // blacksmith, no watchtower at all" stopgap.
    house:      buildUndeadKitHouse,
    terraced:   buildUndeadKitTerraced,
    shop:       buildUndeadKitShop,
    inn:        buildUndeadKitInn,
    blacksmith: buildUndeadKitBlacksmith,
    villa:      buildUndeadKitVilla,
    chapel:     buildUndeadKitChapel,
    watchtower: buildUndeadKitWatchtower,
    tower:      buildUndeadKitWatchtower,
  },
  elven: {
    villa:    buildElvenTreehouseHome,
    // 2026-09-04 follow-up (docs/superpowers/specs/
    // 2026-09-04-elven-chapel-rebuild-design.md): chapel moved from
    // buildElvenChapel (a ring of standing tree-stone monoliths + a
    // central glowing crystal) to buildElvenChapelShrine (a real
    // rectangular nave + small octagonal apse + bellcote + relocated
    // forecourt, all on the same real block-course + carved-opening
    // construction technique as the rest of the elven lineage) -- the
    // LAST elven building kind not yet on this technique.
    chapel:   buildElvenChapelShrine,
    // 2026-09-03 follow-up (docs/superpowers/specs/
    // 2026-09-03-elven-market-stall-design.md): shop moved from
    // `buildElvenShop` (a BlockKit voxel sapling) to
    // `buildElvenMarketStall` (real block-course + carved-opening
    // construction, same tower-kit family as villa/watchtower) --
    // continuing the same race-by-race, building-by-building cycle.
    shop:     buildElvenMarketStall,
    // `house` (gateward/farm wards) and `terraced` (slum ward) are real
    // BuildingKinds produced by WARD_TO_KIND (src/buildingToDungeonPlan.ts)
    // — every settlement's farm/gateward/slum buildings use them, so
    // without an override here they fell through to the generic default
    // builder and only got elven's STYLE_COLORS palette (pale sage walls/
    // roof tint), not elven geometry. Reusing buildElvenTreehouseHome is
    // safe: it derives its footprint from `dna.buildingKind`/`dna.size`
    // dynamically (via getFootprint()), so it scales correctly to these
    // smaller kinds rather than assuming villa's fixed 7x5.
    //
    // 2026-09-03 follow-up (docs/superpowers/specs/
    // 2026-09-03-elven-treehouse-tower-kit-rebuild.md): house/terraced/
    // villa/inn/blacksmith all moved from `buildElvenVilla` (a BlockKit
    // voxel-occupancy grid) to `buildElvenTreehouseHome` (real
    // per-course block + carved-recessed-opening construction, reusing
    // the elven stone-tower kit's own proven technique) per direct user
    // feedback: "we dont go with that old block design... more in style
    // with the tower for building the structure." `buildElvenShop` is
    // NOT touched by this round -- deferred to its own future pass in
    // the race-by-race cycle.
    house:    buildElvenTreehouseHome,
    terraced: buildElvenTreehouseHome,
    // Phase 2b increment 3: inn/blacksmith had no elven override either.
    inn:        buildElvenTreehouseHome,
    blacksmith: buildElvenTreehouseHome,
    // Phase 6 POC (docs/superpowers/specs/
    // 2026-09-02-elven-stone-tower-kit-design.md): watchtower/tower had
    // NO elven override at all (fell through to the generic square
    // box-stacked builder, purely a safety choice for this POC -- no
    // existing elven look to risk regressing). The new octagon-
    // cross-section stone-tower kit (hybrid stone + living-tree
    // architecture, "brick-by-brick" real geometry per the user's
    // explicit preference) lands here first, before any other elven
    // kind, as the proof-of-concept for the same technique applied
    // race-by-race in future rounds.
    watchtower: buildElvenStoneTower,
    tower:      buildElvenStoneTower,
  },
  dwarven: {
    // Task 22 (docs/superpowers/plans/2026-09-04-dwarven-buildings.md):
    // dwarven is the second faction (after slime) with a real bespoke kit
    // builder for every canonical kind (DwarvenBuildingKit.ts's
    // depth-laddered stone-masonry construction), replacing the earlier
    // "every kind reuses the villa BlockKit hall" stopgap. watchtower/tower
    // previously had NO dwarven override at all (fell through to the
    // generic square box-stacked builder).
    house:      buildDwarvenHouse,
    terraced:   buildDwarvenTerraced,
    shop:       buildDwarvenShop,
    inn:        buildDwarvenInn,
    blacksmith: buildDwarvenBlacksmith,
    villa:      buildDwarvenVilla,
    chapel:     buildDwarvenChapel,
    watchtower: buildDwarvenWatchtower,
    tower:      buildDwarvenWatchtower,
  },
  orcish: {
    // docs/superpowers/plans/2026-09-04-orcish-buildings.md: orcish is the
    // third faction (after slime/dwarven) with a real bespoke kit builder
    // for every canonical kind (OrcishBuildingKit.ts's lashed-timber +
    // hide-panel + bone/tusk trophy construction), replacing the earlier
    // "villa hut reused for house/terraced/inn/blacksmith, no watchtower
    // at all" stopgap.
    house:      buildOrcishKitHouse,
    terraced:   buildOrcishKitTerraced,
    shop:       buildOrcishKitShop,
    inn:        buildOrcishKitInn,
    blacksmith: buildOrcishKitBlacksmith,
    villa:      buildOrcishKitVilla,
    chapel:     buildOrcishKitChapel,
    watchtower: buildOrcishKitWatchtower,
    tower:      buildOrcishKitWatchtower,
  },
  vampire: {
    // docs/superpowers/plans/2026-09-04-vampire-buildings.md: vampire is
    // the fourth faction (after slime/dwarven/orcish) with a real bespoke
    // kit builder for every canonical kind (VampireBuildingKit.ts's
    // Gothic-Revival/Second-Empire manor construction — shuttered lancet
    // windows, oriel bays, mansard/gable roofs, wrought-iron railings),
    // replacing the earlier "villa spire reused for house/terraced/inn/
    // blacksmith, no watchtower at all" stopgap.
    house:      buildVampireKitHouse,
    terraced:   buildVampireKitTerraced,
    shop:       buildVampireKitShop,
    inn:        buildVampireKitInn,
    blacksmith: buildVampireKitBlacksmith,
    villa:      buildVampireKitVilla,
    chapel:     buildVampireKitChapel,
    watchtower: buildVampireKitWatchtower,
    tower:      buildVampireKitWatchtower,
  },
  fae: {
    // docs/superpowers/plans/2026-09-04-fae-buildings.md: fae is the
    // eighth faction (after slime/dwarven/orcish/vampire/undead/vulperia)
    // with a real bespoke kit builder for every canonical kind
    // (FaeBuildingKit.ts's storybook stump/fungal cottage construction —
    // coursed bark-strip walls with proud vertical rib overlays,
    // five-piece oversized-but-legible petal-lancet/oculus openings,
    // real ribbed-and-shingled mushroom-cap or curled tile-course cone
    // roofs via the new shared RadialMushroomCap.ts/
    // ShingleSurface.buildCurledConeShingleRoof(), bounded post-assembly
    // organic lean/bulge/twist via AssemblyLatticeDeform.ts, and
    // root-flare grounding), replacing the earlier "toadstool block-grid
    // reused for villa/chapel/shop, no house/terraced/inn/blacksmith/
    // watchtower at all" stopgap.
    house:      buildFaeKitHouse,
    terraced:   buildFaeKitTerraced,
    shop:       buildFaeKitShop,
    inn:        buildFaeKitInn,
    blacksmith: buildFaeKitBlacksmith,
    villa:      buildFaeKitVilla,
    chapel:     buildFaeKitChapel,
    watchtower: buildFaeKitWatchtower,
    tower:      buildFaeKitWatchtower,
  },
};

/** Look up a bespoke faction-building variant builder, if one exists. */
export function getFactionBuildingVariant(faction: Faction | undefined, kind: BuildingKind): ((dna: BuildingDNA) => THREE.Group) | null {
  if (!faction) return null;
  return FACTION_BUILDING_VARIANTS[faction]?.[kind] ?? null;
}
