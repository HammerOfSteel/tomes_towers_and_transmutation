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

- [ ] Add `CreativeModeState` to game state manager
  - `active: boolean`
  - `flyEnabled: boolean`
  - `noClip: boolean`
  - `godMode: boolean` (infinite health/mana, no death)
  - `currentSkin: string`
  - `frozenEnemies: boolean`
- [ ] `enterCreativeMode(spawnFloor?)` function — teleports player to top tower room (F9 Observatory), activates flag
- [ ] `exitCreativeMode()` — returns to last normal-mode position, restores HP/mana to pre-creative values, deactivates flag
- [ ] Guard all creative-only APIs behind `if (!CREATIVE_MODE_ACTIVE) return` in prod
- [ ] Dev Labs menu entry in pause screen (hidden in prod builds via `import.meta.env.DEV`)

---

## Phase C2 — Creative Movement

- [ ] **Fly mode** — hold Space to ascend, Shift to descend; WASD moves horizontally relative to camera yaw; no gravity
- [ ] **Speed multiplier** — `[` / `]` keys cycle through 1× / 3× / 10× / 50× movement speed
- [ ] **No-clip toggle** — `N` key, disables collision so you can phase through walls and floors
- [ ] **Teleport to floor** — quick-select overlay (`T` key) shows all tower floors + overworld + backrooms; click to teleport instantly
- [ ] Smooth lerp camera when teleporting (0.3s ease)
- [ ] Camera orbit unlocked — free look, no collision-based push-back

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

- [ ] **Status bar** — top strip: mode tag, current zone name, speed, noclip status, coordinates
- [ ] **Quick Tools panel** — floating right-side mini panel, toggled with `E` key
- [ ] **Asset Hotbar** — bottom 8-slot bar; drag assets from the asset browser into slots; press 1–8 to select; left-click to place in world
- [ ] **Asset Browser overlay** — `B` key opens full-screen asset browser (same kit tree as model-review but inline); selecting an asset puts it in the active hotbar slot
- [ ] **Skin Selector** — `K` key opens character picker showing all available character models; click to switch instantly
- [ ] **Inspector tooltip** — hovering an object shows its id, asset path, position, scale in a small tooltip
- [ ] Creative mode indicator badge on screen (cannot be dismissed — clear visual reminder you're in creative)

---

## Phase C4 — In-World Placement Tools

These work the same as the model-review editor but while walking around inside the game:

- [ ] **Place mode** — active hotbar slot shows a ghost preview of the asset attached to cursor; click to place; `R` rotates in 45° snapped steps; `+`/`-` scales; `G` toggles grid snap
- [ ] **Select / Move** — click an existing object to select it; drag to reposition; `Delete` to remove
- [ ] **Clone** — `Ctrl+D` duplicates selected object
- [ ] **Undo / Redo** — `Ctrl+Z` / `Ctrl+Y`, persists within session
- [ ] **Save to game** — `Ctrl+S` saves placed objects to `public/editor-output/<zone>/default.ttt-level.json` (same endpoint as model-review editor)
- [ ] **Grid overlay** — `G` key toggles visible floor grid aligned to current zone's cell size
- [ ] Selection highlight outline (same shader as regular selection)

---

## Phase C5 — Character & Skin System

- [ ] `CharacterRegistry` — list of all available skins (player wizards + NPCs + enemies as playable characters)
- [ ] Skin picker UI (triggered by `K`) — grid of character thumbnails; click to hot-swap the player model
- [ ] Stats stay the same regardless of skin (purely cosmetic in creative mode)
- [ ] "I am the slime" mode — can switch to Slimey or any enemy character
- [ ] Skin preference persisted in localStorage per creative session
- [ ] Walk/idle/cast animations carry over to new skin if animation names match; graceful fallback if not

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
- [ ] Physical portals placed in the tower (basement has "The Backroom Door" — a hidden maintenance hatch)
- [ ] Portal object renders a swirling void effect
- [ ] Entering a portal transitions to the backroom; a matching return portal is always present
- [ ] Backrooms exist outside the world timeline — no quests, no save impact, time frozen
- [ ] `BackroomManager` class handles portal registration, scene switching, return stack

---

## Phase C7 — Spell Crafting Lab (Backroom Detail)

The most important backroom for game development and spell balancing:

- [ ] **Dummy targets** — 3 summonable golems with configurable HP (100 / 1000 / 10000); show floating damage numbers
- [ ] **Spell workbench** — UI to compose spell components (element + shape + modifier) and cast the result
- [ ] **Stats overlay** — real-time DPS, cast time, mana cost, AoE radius, status effect duration
- [ ] **Replay last cast** — `R` key re-casts the last tested spell
- [ ] **Balance export** — generates a JSON snippet with the spell's measured stats for copy-paste into SpellRegistry
- [ ] **Effect visualiser** — slow-motion option (0.1× game speed) to inspect spell VFX frame by frame

---

## Phase C8 — Creative Mode Save / Export

Creative mode changes should feed back into the game properly:

- [ ] Object placements auto-saved to `public/editor-output/<zone>/<id>.ttt-level.json` on `Ctrl+S`
- [ ] Same version-control system as model-review (EditorVersioning — localStorage snapshots, up to 25)
- [ ] "Publish to game" button — marks the current save as the canonical game version (same as saving from model-review)
- [ ] Base template protection — first save is always the immutable base; always revertable
- [ ] Creative mode changes do NOT affect the active game save (separate data path)

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

- [ ] Dev Labs accessible from pause menu (shown only in dev builds)
- [ ] Each tool opens in the appropriate context (in-game overlay vs new tab)
- [ ] All Dev Labs tools stripped from prod build via tree-shaking (`import.meta.env.DEV` guards)

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
