# Dungeon Integration
> ⚠️ GAP — Place dungeon entrances on the realm overworld map and wire up loading.

## Status: ⚠️ Not planned

## Goal
Dungeons generated in OW-B appear as entrance props at their realm map positions. Walking up to the entrance and pressing E loads the dungeon.

## Tasks

### DI-1 — Dungeon Entrance Prop
- [ ] `buildDungeonEntrance(faction): THREE.Group` — procedural stone arch or door matching faction
- [ ] Variants: tower_door (existing), dungeon_cave_mouth, ruin_arch, keep_gate
- [ ] Interaction trigger zone: 2 WU radius, `[E] Enter Dungeon` prompt

### DI-2 — Realm Map Placement
- [ ] `RealmData` extended: `dungeons: Array<{x, y, seed, type, faction}>`
- [ ] OW-A generator places 2-4 dungeon markers per realm (near settlements, at biome boundaries)
- [ ] Dungeon entrance rendered at correct world position on terrain

### DI-3 — Scene Transition
- [ ] Enter → black fade → load `DungeonScene` with matching seed
- [ ] Exit → black fade → return to overworld at entrance position
- [ ] `SceneRouter.ts` (or existing `SceneManager`): handles dungeon ↔ overworld transition
- [ ] Player position and inventory preserved across transitions

### DI-4 — Dungeon Map Marker
- [ ] Dungeon entrance shows on `OWMinimap.ts` as ⚔ icon
- [ ] Discovered dungeons persist to save data

### DI-5 — Tests
- [ ] Entrance triggers scene transition without error
- [ ] Return from dungeon places player at entrance position

## Dependencies
- Requires: OW-B dungeon generator ✅ (blueprint produced)
- Requires: RI-1 terrain mesh (entrance placed on terrain)
- Requires: `SceneRouter` or extension of `SceneManager`
