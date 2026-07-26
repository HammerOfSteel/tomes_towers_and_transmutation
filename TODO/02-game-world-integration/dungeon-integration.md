# Dungeon Integration
> ⚠️ GAP — Place dungeon entrances on the realm overworld map and wire up loading.

## Status: ⚠️ Not planned

## Goal
Dungeons generated in OW-B appear as entrance props at their realm map positions, carry meaningful **site-family identity**, and feed the title pillars through knowledge, materials, recruits, and defense intelligence. Walking up to the entrance and pressing E loads the dungeon.

## Tasks

### DI-1 — Dungeon Entrance Prop
- [ ] `buildDungeonEntrance(faction): THREE.Group` — procedural stone arch or door matching faction
- [ ] Variants: tower_door (existing), dungeon_cave_mouth, ruin_arch, keep_gate
- [ ] Interaction trigger zone: 2 WU radius, `[E] Enter Dungeon` prompt

### DI-2 — Realm Map Placement
- [ ] `RealmData` extended: `dungeons: Array<{x, y, seed, type, faction}>`
- [ ] OW-A generator places 2-4 dungeon markers per realm (near settlements, at biome boundaries)
- [ ] Dungeon entrance rendered at correct world position on terrain

### DI-2b — Site-Family Identity & Reward Bias
- [ ] Extend dungeon metadata with site-family tags, for example:
  - `tower_floor`
  - `library_ruin`
  - `alchemy_vault`
  - `tomb_barrow`
  - `beast_lair`
  - `mine_works`
  - `observatory_ruin`
  - `surface_threat`
- [ ] Add reward-bias tags:
  - `knowledge_rich`
  - `volatile_materials`
  - `beast_capture_opportunity`
  - `defense_intel`
  - `candidate_archive`
  - school bias tags where relevant
- [ ] Add metadata fields for:
  - likely book families
  - likely reagent/material families
  - elite recruit opportunity flag
  - defense-intel source flag
- [ ] Ensure site-family identity is available both to runtime scene loading and future content seeding

### DI-3 — Scene Transition
- [ ] Enter → black fade → load `DungeonScene` with matching seed
- [ ] Exit → black fade → return to overworld at entrance position
- [ ] `SceneRouter.ts` (or existing `SceneManager`): handles dungeon ↔ overworld transition
- [ ] Player position and inventory preserved across transitions

### DI-4 — Dungeon Map Marker
- [ ] Dungeon entrance shows on `OWMinimap.ts` as ⚔ icon
- [ ] Discovered dungeons persist to save data
- [ ] Optional later marker differentiation by site family or intel value

### DI-4b — Quest / Candidate / Defense Hooks
- [ ] Support quest-tagged dungeon entrances (species arc, general quest, or faction quest destinations)
- [ ] Support candidate-archive-tagged sites for prior-candidate content
- [ ] Support defense-intel-producing sites whose completion improves tower forecasts or counters
- [ ] Support elite recruit opportunity tags so companion-focused players can route expeditions intentionally

### DI-5 — Tests
- [ ] Entrance triggers scene transition without error
- [ ] Return from dungeon places player at entrance position
- [ ] Site-family and reward-bias metadata persist through scene transition
- [ ] Quest-tagged and candidate-tagged sites serialize/deserialize correctly

## Dependencies
- Requires: OW-B dungeon generator ✅ (blueprint produced)
- Requires: RI-1 terrain mesh (entrance placed on terrain)
- Requires: `SceneRouter` or extension of `SceneManager`
