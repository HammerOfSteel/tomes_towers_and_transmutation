# PROC-B — Creator Tool Ecosystem
> Each entity type gets: a `build*(dna)` function + a standalone atelier tool + game runtime wiring.

## Status: 🚧 In progress (NPC + Building partially started)

## B1 — NPC Creator (`npc-creator.html`)
### Atelier
- [ ] `npc-creator.html` page with species/role/appearance controls
- [ ] Live Three.js preview (reuse renderer pattern from princess-creator)
- [ ] Save blueprint to gallery (localStorage + export JSON)
### Game Runtime
- [ ] `buildNpc(dna): THREE.Group` — procedural NPC rig
- [ ] Species variants: human/elf/dwarf/orc/vulperia/undead/slime/celestial/draconic
- [ ] Role variants: guard (armour), merchant (bag/stall), quest-giver (scroll), wanderer (cloak)
- [ ] `NpcController.ts` — idle wander + interaction detection
- [ ] `src/world/NpcSpawner.ts` — places NPCs at settlement ward positions

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
