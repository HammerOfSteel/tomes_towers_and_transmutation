# PROC-D — Creative Mode Integration
> Expose all procedural builders in the DevLab sandbox. Custom blueprints override world gen defaults.
> Full detail: see `CREATIVE_MODE_TODO.md` (being archived → `TODO/archive/`).

## Status: ✅ Core done (C1-C10), remaining: builder integration + new-species bot scenario

## What's Already Built (C1-C10)
- `CreativeModeState`: fly/noclip/godMode/frozenEnemies flags
- Creative movement: fly, speed multiplier, no-clip, teleport-to-floor
- Creative HUD: status bar, quick tools panel, 8-slot hotbar, asset browser overlay, skin selector
- In-world placement: ghost preview, select/move/clone, undo/redo, grid snap, Ctrl+S save
- Character/skin picker (K key) — all models including princess gallery
- Dev Backrooms: portal system, `BackroomManager`, 7 planned rooms (spell_lab, combat_arena, npc_sandbox, asset_showcase, biome_lab, dungeon_prototype, sound_room)
- Spell Crafting Lab (C7): dummy targets, spell workbench, stats overlay, balance export
- Dev Labs menu: all tools accessible from pause menu, stripped in prod via `import.meta.env.DEV`
- Quest & Scenario Design mode (C10): spawn palette, NPC dialogue editor, quest builder
- Save/export: `Ctrl+S` → `public/editor-output/<zone>/`, template protection

## 🔲 Remaining

### CD-1 — DevLab with Procedural Builders (was the original CD-1)
- [ ] Tabs: 🗺 World | 👤 Characters | 🏠 Buildings | 👾 Enemies | 🎭 Creatures | 📚 Library
- [ ] Each tab surfaces the PROC-B builder for that type with live preview
- [ ] Spawn any `buildNpc(dna)` / `buildBuilding(dna)` / `buildEnemy(dna)` at cursor in creative mode

### CD-2 — Custom Blueprint Overrides
- [ ] Library entries with `isCustom = true` override world gen for named locations
- [ ] `WorldOverrides.json` per world seed — loaded by `WorldGen.ts` before procedural generation

### CD-3 — New Species Integration
- [ ] Creative mode skin picker: show all 21 princess species grouped by game species (NS8)
- [ ] `scenarios/princess-creator.ts` bot scenario (see `07-testing/bot-testing.md`)

### Dev Labs Missing Tools
- [ ] Performance Monitor tab: FPS, draw calls, memory in real time
- [ ] Quest Debug tab: force-complete any quest, unlock items
- [ ] NPC State Inspector: show all NPC states in real time
- [ ] Export World State: dump current world to JSON for bug reports
