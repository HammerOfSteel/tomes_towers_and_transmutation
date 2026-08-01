# PROC-B — Creator Tool Ecosystem
> Each entity type gets: a `build*(dna)` function + a standalone atelier tool + game runtime wiring.

## Status: 🚧 In progress (NPC runtime groundwork shipped; standalone atelier pages still partial/missing)

## B1 — NPC Creator (`npc-creator.html`)
### Atelier
- [ ] `npc-creator.html` page with species/role/appearance controls
- [ ] Live Three.js preview (reuse renderer pattern from princess-creator)
- [ ] Save blueprint to gallery UI/export JSON
- [x] NPC DNA contract, defaults, and gallery/share-code persistence groundwork already exist in `src/npc-creator/`
### Game Runtime
- [x] `buildNpc(dna): NpcInstance` — procedural NPC rig built on the existing princess/commoner builder pipeline
- [x] Current supported species contract is implemented in source: human / undead / vulperia / slime / elf / celestial / draconic
- [x] `src/world/NPCSpawner.ts` resolves named overrides/default DNA and places generated NPCs around settlement centers
- [x] Named NPC override storage exists via `src/npc-creator/gallery.ts`
- [ ] Deeper role-specific visual variants: guard (armour), merchant (bag/stall), quest-giver (scroll), wanderer (cloak)
- [ ] `NpcController.ts` — idle wander + interaction detection

## B2 — Enemy Creator (extends `creature-lab.html`)
### Atelier
- [ ] Add "Enemy" mode to creature-lab: role/tier/weapon type controls
- [ ] Behaviour profile preview (show attack range, patrol radius)
### Game Runtime
- [ ] `buildEnemy(dna): THREE.Group` — already partially done ✅
- [ ] `EnemyLoader.ts` — already uses `buildProceduralEnemyRig()` ✅
- [ ] Remaining: full roster of DNA entries for all 20 enemy types (see `enemy-system.md`)

## B3 — Building Creator (`building-creator.html`)
### Atelier
- [ ] `building-creator.html` — archetype/faction/size/colour controls
- [ ] Isometric 3D preview
- [ ] Floor plan 2D preview (feeds OW-D)
- [ ] Save blueprint to gallery
### Game Runtime
- [ ] `buildBuilding(dna): THREE.Group` — procedural building
- [ ] Archetypes: house_s/m/l, inn, shop, forge, temple, guard_post, manor, tower_ruin
- [ ] Faction styles: human/elven/dwarven/orcish/fae (roof shape, colour palette, decoration)
- [ ] `BuildingCollider.ts` — walkable ground floor, blocked walls

## B4 — Prop Creator (integrated into building/dungeon creators)
### Runtime
- [ ] `buildProp(dna): THREE.Group` — extends existing prop functions
- [ ] Unified DNA: `PropDNA` with category, material, scale, interaction type
- [ ] Register all existing `buildXxx()` functions through registry

## B5 — Creature Creator (`creature-lab.html`) 
### Atelier
- [ ] Already exists: `creature-lab.html` 🚧
- [ ] Add: export DNA as share code, save to gallery
### Game Runtime
- [ ] `buildCreature(dna): THREE.Group` — non-enemy creatures (familiar, mount, ambient wildlife)
- [ ] Ambient spawner: places ambient creatures in overworld biomes

## Dependencies
- Requires: PROC-A registry ✅
- Feeds: `02-game-world-integration/` (all builders used by world gen)
