# Procedural Asset Designer
> Visual designer UI for DNA-based entity creation (NPC, Building, Enemy, Prop).
> Same concept as `princess-creator.html` — but for all entity types.
> References PROC-B for implementation details.

## Status: 🚧 Referenced in PROC-B; NPC creator groundwork exists, but standalone designer surfaces are still missing

## Principle
One designer pattern, multiple entity types:
```
[Type selector] [DNA sliders/pickers] [Live 3D preview] [Save to Library]
```

## Per-Entity Designer

### NPC Designer (`npc-creator.html`) 🚧
- [ ] Standalone `npc-creator.html` surface still needs to be built
- [ ] Species picker for current supported game species: human / undead / vulperia / slime / elf / celestial / draconic
- [ ] Role picker should match current `NpcRole` source contract: merchant / elder / quest_giver / scholar / guard / innkeeper / mysterious
- [ ] Appearance controls should layer on top of the existing `NpcDNA` contract (`bodyPreset`, `colors`, accessories, personality, name)
- [ ] Live Three.js preview should reuse the existing `buildNpc(dna)` pipeline
- [ ] Save UI should target the existing NPC gallery/share-code persistence groundwork before broader Asset Library integration

### Building Designer (`building-creator.html`) 🔲
- Archetype: house/inn/shop/forge/temple/guard_post
- Faction style: human/elven/dwarven/orcish/fae
- Size: S/M/L
- Colour scheme picker
- Roofline variant picker
- Live Three.js preview (isometric camera)
- Floor plan preview (2D canvas)
- Save → AssetLibrary

### Enemy Designer (inside `creature-lab.html`) 🔲
- Extend existing creature-lab with enemy-specific controls
- Species, combat role, tier, weapon type
- Behaviour profile: patrol/aggressive/ranged/boss
- Visual: colours, armour, size
- Save → AssetLibrary

### Prop Designer 🔲
- Category: furniture/decoration/container/interactive
- Material/colour
- Scale
- Interaction type (none/lootable/readable/usable)
- Save → AssetLibrary

## Dependencies
- Requires: PROC-A entity registry ✅
- Requires: individual `build*()` functions per type
- Feeds: Asset Library (`asset-library.md`)
