# Creative Mode — TT&T Dev Feature Plan
> "Like Minecraft creative mode, but for a wizard RPG."

---

## Vision

Creative mode is a parallel game state accessible from the **Dev Labs** menu.
You start inside the actual game world — same renderer, same scene, same
character — but with god-level tools overlaid on a different HUD. No separate
editor app. No parallel UI. Just the game, with the gloves off.

The **Dev Backrooms** extend this with extra-dimensional pocket spaces: portals
you step through that drop you into testing arenas, spell labs, NPC sandboxes,
and showcase rooms that exist outside the main world timeline.

---

## Entry Points

| Where | How |
|---|---|
| Dev Labs (pause menu submenu) | Toggle `CREATIVE_MODE_ACTIVE` flag, respawn at top tower room |
| URL param `?creative=1` | Auto-enters creative on game load (dev builds only) |
| Console command | `__dev.creative()` from browser devtools |
| Keyboard shortcut | `Ctrl+Shift+C` (debug builds only, stripped in prod) |

---

## Phase C1 — Core Creative Flag & Entry

- [x] Add `CreativeModeState` to game state manager
  - `active: boolean`
  - `flyEnabled: boolean`
  - `noClip: boolean`
  - `godMode: boolean` (infinite health/mana, no death)
  - `currentSkin: string`
  - `frozenEnemies: boolean`
- [x] `enterCreativeMode(spawnFloor?)` function — teleports player to top tower room (F9 Observatory), activates flag
- [x] `exitCreativeMode()` — returns to last normal-mode position, restores HP/mana to pre-creative values, deactivates flag
- [x] Guard all creative-only APIs behind `if (!CREATIVE_MODE_ACTIVE) return` in prod
- [x] Dev Labs menu entry in pause screen (hidden in prod builds via `import.meta.env.DEV`)

---

## Phase C2 — Creative Movement

- [x] **Fly mode** — hold Space to ascend, Shift to descend; WASD moves horizontally relative to camera yaw; no gravity
- [x] **Speed multiplier** — `[` / `]` keys cycle through 1× / 3× / 10× / 50× movement speed
- [x] **No-clip toggle** — `N` key, disables collision so you can phase through walls and floors
- [x] **Teleport to floor** — quick-select overlay (`T` key) shows all tower floors + overworld + backrooms; click to teleport instantly
- [x] Smooth lerp camera when teleporting (0.3s ease)
- [x] Camera orbit unlocked — free look, no collision-based push-back

---

## Phase C3 — Creative HUD

Replace the gameplay HUD with a purpose-built creative overlay:

```
┌──────────────────────────────────────────────────────────────────┐
│  [CREATIVE MODE]  Floor: F9 Observatory  Speed: 3×  NoClip: OFF  │
├──────────────────────────────────────────────────────────────────┤
│  Viewport (full game scene)                                       │
│                                                                   │
│                                                                   │
│                                            ┌──────────────────┐  │
│                                            │  Quick Tools     │  │
│                                            │  🖊 Place Asset   │  │
│                                            │  🗑 Delete        │  │
│                                            │  📋 Clone        │  │
│                                            │  🔍 Inspect      │  │
│                                            │  🌐 Teleport     │  │
│                                            │  🧪 Backrooms    │  │
│                                            └──────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│  [Asset Hotbar]  slot1 slot2 slot3 slot4 slot5 slot6 slot7 slot8  │
└──────────────────────────────────────────────────────────────────┘
```

- [x] **Status bar** — top strip: mode tag, current zone name, speed, noclip status, coordinates
- [x] **Quick Tools panel** — floating right-side mini panel, toggled with `E` key
- [x] **Asset Hotbar** — bottom 8-slot bar; drag assets from the asset browser into slots; press 1–8 to select; left-click to place in world
- [x] **Asset Browser overlay** — `B` key opens full-screen asset browser (same kit tree as model-review but inline); selecting an asset puts it in the active hotbar slot
- [x] **Skin Selector** — `K` key opens character picker showing all available character models; click to switch instantly
- [x] **Inspector tooltip** — hovering an object shows its id, asset path, position, scale in a small tooltip
- [x] Creative mode indicator badge on screen (cannot be dismissed — clear visual reminder you're in creative)

---

## Phase C4 — In-World Placement Tools

These work the same as the model-review editor but while walking around inside the game:

- [x] **Place mode** — active hotbar slot shows a ghost preview of the asset attached to cursor; click to place; `R` rotates in 45° snapped steps; `+`/`-` scales; `G` toggles grid snap
- [x] **Select / Move** — click an existing object to select it; drag to reposition; `Delete` to remove
- [x] **Clone** — `Ctrl+D` duplicates selected object
- [x] **Undo / Redo** — `Ctrl+Z` / `Ctrl+Y`, persists within session
- [x] **Save to game** — `Ctrl+S` saves placed objects to `public/editor-output/<zone>/default.ttt-level.json` (same endpoint as model-review editor)
- [x] **Grid overlay** — `G` key toggles visible floor grid aligned to current zone's cell size
- [x] Selection highlight outline (same shader as regular selection)

---

## Phase C5 — Character & Skin System

- [x] `CharacterRegistry` — list of all available skins (player wizards + NPCs + enemies as playable characters)
- [x] Skin picker UI (triggered by `K`) — grid of character thumbnails; click to hot-swap the player model
- [x] Stats stay the same regardless of skin (purely cosmetic in creative mode)
- [x] "I am the slime" mode — can switch to Slimey or any enemy character
- [x] Skin preference persisted in localStorage per creative session
- [x] Walk/idle/cast animations carry over to new skin if animation names match; graceful fallback if not

---

## Phase C6 — Dev Backrooms

Extra-dimensional pocket spaces accessible via portals in the tower.

### Backroom Registry

Each backroom is defined by a `BackroomDef`:
```typescript
interface BackroomDef {
  id:          string;       // e.g. 'spell_lab'
  name:        string;       // "Spell Crafting Lab"
  icon:        string;       // emoji
  description: string;
  spawnPoint:  Vec3;
  scene:       string;       // scene ID or inline generator
  music?:      string;       // ambient track
  persistent:  boolean;      // saves object placement between visits
}
```

### Planned Backrooms

| ID | Name | Purpose |
|---|---|---|
| `spell_lab` | The Spell Crafting Lab | Test spell combinations, see damage numbers, effect durations, AoE shapes on dummy targets |
| `combat_arena` | Combat Testing Arena | Spawnable enemies at configurable tiers, dummy targets, damage output testing, AI behavior watching |
| `npc_sandbox` | NPC Sandbox | Place any NPC, trigger dialogues, test quest flags, inspect NPC state machine |
| `asset_showcase` | Asset Showcase Hall | All extracted 3D assets displayed on pedestals, grouped by kit — a live 3D version of the model-review viewer |
| `biome_lab` | Biome Lab | Configurable overworld biome slice for testing environment assets in context |
| `dungeon_prototype` | Dungeon Prototype Room | Empty dungeon room with all blueprint variants available; test prop placement in actual dungeon lighting |
| `sound_room` | The Sound Room | Trigger any SFX or music track, test spatial audio positioning |

### Backroom Portal System
- [x] Physical portals placed in the tower (basement has "The Backroom Door" — a hidden maintenance hatch)
- [x] Portal object renders a swirling void effect
- [x] Entering a portal transitions to the backroom; a matching return portal is always present
- [x] Backrooms exist outside the world timeline — no quests, no save impact, time frozen
- [x] `BackroomManager` class handles portal registration, scene switching, return stack

---

## Phase C7 — Spell Crafting Lab (Backroom Detail)

The most important backroom for game development and spell balancing:

- [x] **Dummy targets** — 3 summonable golems with configurable HP (100 / 1000 / 10000); show floating damage numbers
- [x] **Spell workbench** — UI to compose spell components (element + shape + modifier) and cast the result
- [x] **Stats overlay** — real-time DPS, cast time, mana cost, AoE radius, status effect duration
- [x] **Replay last cast** — `R` key re-casts the last tested spell (opens workbench pre-filled + fires immediately)
- [x] **Balance export** — generates a JSON snippet with the spell's measured stats for copy-paste into SpellRegistry
- [x] **Effect visualiser** — slow-motion option (0.1× game speed) to inspect spell VFX frame by frame

---

## Phase C8 — Creative Mode Save / Export

Creative mode changes should feed back into the game properly:

- [x] Object placements auto-saved to `public/editor-output/<zone>/<id>.ttt-level.json` on `Ctrl+S`
- [x] Same version-control system as model-review (EditorVersioning — localStorage snapshots, up to 25)
- [x] "Publish to game" button — marks the current save as the canonical game version (same as saving from model-review)
- [x] Base template protection — first save is always the immutable base; always revertable
- [x] Creative mode changes do NOT affect the active game save (separate data path)

---

## Phase C9 — Dev Labs Menu Integration

The Dev Labs menu is the gateway to all developer tools in the game:

```
DEV LABS
  ├── Creative Mode          → enters creative, teleports to F9
  ├── Backrooms              → opens backroom portal list
  ├── World Editor           → opens world-editor.html (existing)
  ├── Model Review           → opens model-review.html (existing)
  ├── Performance Monitor    → show FPS, draw calls, memory
  ├── Quest Debug            → force-complete any quest, unlock items
  ├── NPC State Inspector    → show all NPC states in real time
  ├── Seed Reset             → regenerate world with new or specific seed
  └── Export World State     → dump current world to JSON for bug reports
```

- [x] Dev Labs accessible from pause menu (shown only in dev builds)
- [x] Each tool opens in the appropriate context (in-game overlay vs new tab)
- [x] All Dev Labs tools stripped from prod build via tree-shaking (`import.meta.env.DEV` guards)

---

## Implementation Order

1. **C1** — Core flag + entry/exit (unblocks everything else)
2. **C2** — Creative movement (makes the mode usable immediately)
3. **C3** — Creative HUD skeleton (status bar + hotbar)
4. **C9** — Dev Labs menu entry (makes it accessible without console hacks)
5. **C4** — In-world placement (replaces model-review editor for day-to-day use)
6. **C5** — Skin switching (quick win, high fun)
7. **C6** — Backroom portal system + registry
8. **C7** — Spell Crafting Lab (most complex, most valuable)
9. **C3** — Full HUD (asset browser, inspector, all tools)
10. **C8** — Save/export wired to game output

---

## Notes

- The model-review.html and world-editor.html remain as power-tools for batch work and precise asset review, but creative mode replaces them for in-world placement.
- Creative mode is dev-only and MUST be stripped from release builds. Use `import.meta.env.DEV` guards everywhere, not runtime flags.
- The backroom concept is intentionally evocative — lean into the "extra-dimensional maintenance space" aesthetic (liminal lighting, low ambient music, grid floors).

---

## Phase C10 — Quest & Scenario Design ⬜
> *Build quests and encounters in creative mode using existing game systems.*
> Rule: **player-created content only** — never touches or overwrites game-defined quests.

- [x] **Spawn palette tab** in inventory `[C]` — separate from model assets, shows:
  - Enemy spawns (all enemy types with configurable tier 1–3 / boss)
  - NPC spawns (all NPC types)
  - Wave spawners (place a wave trigger zone on the floor)
  - Quest trigger zones (invisible volume that fires an event)
  - Interactable objects (bookshelf, chest, lectern, stall)
- [x] **Right-click spawn palette item → place marker** in the world (yellow ghost preview for spawns, cyan for NPCs, red zone for waves)
- [x] **Inspector for placed spawns** — click any placed spawn marker to edit:
  - Enemy: type, tier, count, patrol/static/ambush pattern
  - NPC: name, dialogue ID (type or select from existing dialogue IDs)
  - Wave: wave count, enemy composition, trigger radius
  - Interactable: type, content text, spell unlock (optional)
- [x] **NPC dialogue editor** — when an NPC spawn is selected in inspector, a "Edit Dialogue" button opens a small text editor:
  - Write dialogue lines (one per row)
  - Assign an ID (auto-generated or custom)
  - Saves to `public/editor-output/dialogue/<id>.json`
  - Player-created dialogues only — game NPC dialogues are read-only
- [x] **Quest builder panel** — `Q` key opens quest builder (only in creative):
  - Quest name, description
  - Objectives: list of `{ type, target, count }` pairs
    - `type`: kill / interact / collect / reach / talk
    - Target: enemy type / interactable ID / NPC ID / zone ID
  - Rewards: XP, items (from existing item registry)
  - Save as `public/editor-output/quests/<id>.json`
  - Cannot edit or overwrite game-defined quests (IDs are prefixed `player_`)
- [x] **Scenario runner** — test a placed quest/scenario:
  - "Play from here" button: exits creative, respawns player at current position, starts the placed scenario
  - Returns to creative when scenario is completed or player presses `Ctrl+Shift+C`
- [x] **Wave designer** — place a wave trigger zone, then configure waves:
  - Number of waves
  - Per-wave enemy list (type + count)
  - Spawn radius
  - Trigger condition (player enter zone / interact / timed)
- [x] **Scenario export** — export a full scenario (objects + spawns + quests) as a single `.ttt-scenario.json` file
- [x] **Scenario import** — load a `.ttt-scenario.json` into the current zone

---

## Phase C11 — Inspector & Selection Polish ⬜

- [x] **Hover tooltip** — when cursor is over a placed object, show a small tooltip: asset name, position (x/y/z), `[Click to select]`
- [x] **Selection outline** — selected object gets a subtle coloured outline (pure client-side, uses emissive highlight for now; replace with outline pass when render pipeline supports it)
- [x] **Multi-select** — hold Shift and left-click multiple objects; move/delete/clone applies to all selected
- [x] **Marquee select** — hold Shift and drag a rectangle to select all objects within it
- [x] **Align tools** — in inspector panel when multiple objects selected: align to X/Y/Z axis, distribute evenly

---

## Phase C12 — Backroom Scene Integration ⬜

- [x] **Scene transition on portal enter** — walking into a portal fades to black, unloads current zone, loads the backroom scene, fades in
- [x] **Return portal** always spawned at backroom entry point (same void effect, slightly different colour to distinguish)
- [x] **Scene isolation** — backroom scenes add to a dedicated group inside the main scene; main world geometry hidden on entry via `visible=false` rather than unload, preventing bleed without requiring a full separate renderer
- [x] **Backroom persistence** — if `BackroomDef.persistent` is true, placed objects survive between visits (saved to `public/editor-output/backrooms/<id>/`)
- [x] **Asset Showcase Hall** implemented:
  - All extracted kit folders scanned on entry
  - Each kit gets a row of pedestals with one representative asset from each kit
  - Can be browsed and assets picked directly into hotbar
- [x] **Dungeon Prototype Room** implemented:
  - Empty room using actual dungeon shader/lighting
  - All blueprint room templates available as spawn items from the spawn palette
