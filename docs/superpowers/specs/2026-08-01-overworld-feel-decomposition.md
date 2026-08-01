# Overworld Feel & Art Improvements — Branch Decomposition

**Branch:** `cline_work-04_overworld_feel`
**Status:** Approved by user (branch-level go-ahead); phase-by-phase design docs follow this one.
**Context:** User request, verbatim intent captured 2026-08-01: ground tiles are flat/textureless
and geometrically identical; want more grass/dirt/stone variety and Townscaper-style organic mesh
variety, following the existing DNA/modular pattern (`TileDNA`/`BuildingDNA`); lay groundwork for
biome variety; expand nature assets (trees/bushes) with better texture, informed by
`TODO/01-overworld-studio/game-inventory.md`; add gatherable resource nodes with a WoW-style feel
(placement system already exists — needs a visual/interaction pass); add lamps/fires along roads
since night is too dark; replace the flat water quad with a proper water system (shoreline/shader
quality inspired by Zelda: Link's Awakening remake) plus partial/full character submersion
(inspired by Mario 64-style water planes).

## Why decomposed instead of one spec

Six subsystems, each independently shippable/testable, with only light sequencing dependencies
(nature assets before gatherables; ground tiles before "biome groundwork" makes sense structurally
but isn't a hard blocker). Bundling them into one plan risks an unreviewable diff and makes partial
progress hard to land. Each phase gets its own focused design doc + implementation plan + commit(s),
all on this same branch, merged incrementally to `main` only when the whole branch's scope is done
(per user's existing workflow: work on `cline_work-0N`, then merge to `main`, then branch again).

## Phase sequence

1. **Ground tile variety** (`SPEC: 2026-08-01-ground-tile-variety-design.md`, next to be written) —
   texture-quality shading + geometric variety (organic/soft vs angular tile mesh shapes) for
   grass/dirt/stone, extending the existing `TileDNA`/`TileBuilder`/`TileRegistry` system rather
   than replacing it. Lays groundwork for biome variety (more `TileBiome` entries pluggable later).
2. **Nature asset variety** — more tree/bush/rock DNA variants with richer procedural texture
   (canvas-shader based, consistent with the project's zero-external-asset "Code-First" policy
   documented in `TODO/03-procedural-pipeline/environment-art-system.md`).
3. **Gatherable resource nodes** — `ResourceNodePlacer.ts` already computes ore/timber/essence node
   positions; this phase adds the missing piece: visible in-world meshes at those positions plus
   a WoW-style interact-to-harvest flow (approach, prompt, gather animation/cooldown, respawn timer).
4. **Night lighting** — lamps/braziers along settlement roads and settlement edges, using the
   existing road polyline data from `SettlementGenerator.ts`, with point-light halos.
5. **Water system** — replace the single flat semi-transparent quad (`_buildWaterMesh` in
   `OverworldScene.ts`) with a proper animated water shader (rippling/scrolling normal-like effect
   via vertex displacement + fresnel-ish shading, since the project avoids external texture files)
   plus a submersion feel: player capsule partially/fully sinks and applies a swim-move state when
   water depth exceeds a threshold, mirroring the "half-submerged / full swim" feel of Zelda/Mario 64
   without requiring a full buoyancy-physics simulation.

## Sequencing rationale

Ground tiles first (foundation everything else visually sits on) → nature assets (props that sit on
the ground) → gatherables (specialized nature-asset variant with interaction) → lighting (depends on
having roads, which already exist) → water last (the most novel/isolated subsystem, safest to attempt
once the team has re-established rhythm on the smaller wins).

## Out of scope for this decomposition doc

Detailed technical design for each phase — those live in their own per-phase spec files, written
and approved (autonomously, per user's explicit "work autonomously" authorization for this session)
immediately before that phase's implementation begins.
