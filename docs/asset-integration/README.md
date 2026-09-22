# 3D Asset Integration

Docs for the **3D Asset Integration** initiative: supplementing (not
replacing) this game's existing procedural placement/construction systems
with real, pre-made 3D assets from a single creator — **Quaternius** — chosen
so every animal, monster, nature prop, building, interior, and dungeon piece
shares one consistent art style.

This is a distinct initiative from the recently-completed
Overworld/Outdoor Polish phases (see `TODO/organic_world_tiles_todo.md` and
`docs/superpowers/specs/2026-09-2*-terrain-elevation-*`). It lives in its own
top-level `docs/asset-integration/` folder — a sibling of
`docs/superpowers/specs/`, not nested under it — because it's a separate
long-running effort with its own doc trail, following the precedent set by
`TODO/organic_world_tiles_todo.md` getting its own top-level roadmap doc.

It also supersedes two abandoned prior attempts at external-asset
integration, kept here for historical reference:
- `docs/assets_index.md` + `docs/assets/info.md` (2026-07-15, Kenney/Quaternius
  survey against different source directories that no longer exist)
- `TODO/archive/ASSETS_TODO.md` + `TODO/archive/asset_models_todo.md`
  (environment-asset pass abandoned in favor of pure procedural generation;
  `src/assets/envManifest.ts` documents the reversal — "the game no longer
  ships external GLB asset kits"). Note the **character** pipeline from that
  era (`src/characters/charManifest.ts`, `CharacterLoader.ts`,
  `WizardLoader.ts`, `src/assets/AssetLoader.ts`) was *not* reverted and is
  a live, working precedent for the new import system this initiative needs.

## The 4-step plan

1. **Inventory** (this step) — full survey of every Quaternius pack: format,
   modular-vs-monolithic, animation/rig presence, texture completeness, and a
   first-pass map of where each asset category could plug into existing
   codebase systems. See
   [`2026-09-22-quaternius-asset-inventory.md`](./2026-09-22-quaternius-asset-inventory.md).
2. **Import system + dev asset-testing space** — not started. Will get its
   own design-notes/spec here once step 1 is reviewed.
3. **Wiring spec** (research → design notes → spec → plan, per the
   `research-driven-world-polish` skill) for hooking real assets into
   existing procedural placement systems without redoing them, including the
   dev-menu "external assets" on/off toggle (see the initiative's kickoff
   message for that requirement). Not started.
4. **Phased implementation**, each sub-task run through the full
   research-driven-world-polish cycle including a human playtest gate. Not
   started.

## Status
Step 1 (inventory) complete as of this commit. Steps 2–4 are pending explicit
user sign-off on the inventory findings below before any code is written.
