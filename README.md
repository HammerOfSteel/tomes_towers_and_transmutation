# Tomes, Towers & Transmutation

> *A captive princess. A dusty library of forbidden magic. An oblivious wizard captor. Revenge.*

**Tomes, Towers & Transmutation** is a narrative-driven isometric action-RPG built entirely in the browser using Three.js, Rapier3D physics, and TypeScript. No game engine — pure WebGL. Four species of captive princess (human, undead, vulperia, and slime) each escape a wizard's tower, claim it, and deliver a disproportionate act of revenge.

**Current status:** Active development — `DEMO_RELEASE` branch targets a public alpha on itch.io.

---

## What You Can Do Right Now

- Start a new game — narrative campfire intro with the wizard's talking fire-salamander familiar
- Play all 4 species with unique dialogue, abilities, and story arcs
- Explore a procedurally-generated 9-floor wizard's tower
- Fight 28+ enemy types from 6 asset packs (KayKit + Kenney + custom Meshy models)
- Cast 12+ spells across 6 elements — fire, ice, lightning, arcane, shadow, nature
- Build a monster army by sparing enemies at low HP
- Unlock and spend talent points on a 30-node constellation per species
- Trigger Arcanist Solmor's 3-stage dialogue tree
- Enter **Creative Mode** (Ctrl+Shift+C in dev builds) — Minecraft-style world editor
- Run the **Game Bot** — autonomous Playwright-driven test agent

---

## Highlights

| Feature | Details |
|---|---|
| **Combat** | ALttP-style real-time — melee arcs, aimed spells, dodge-rolls with i-frames, hit-stop, screen shake |
| **4 playable species** | Human / Undead / Vulperia (fox) / Slime — each with unique passives, abilities, talent paths, and a full 4-act story |
| **Procedural tower** | 9+ floors, seeded BSP rooms, encounter pools, floor title cards, staircase flavour text |
| **Asset integration** | 4,517 GLB models from 48 kits (KayKit + Kenney) loaded lazily — tree/rock/dungeon/settlement props |
| **Monster recruitment** | Spare enemies below 15% HP → add to party (PatrolBehavior FSM, TacticalBrute tier-2 AI) |
| **Creative Mode** | Fly mode, asset browser, drag-place, undo/redo, spawn palette, backroom portals, quest builder |
| **Game Bot** | `npm run bot` — Playwright scenarios: creative-smoke, quest-chain, explore-floor, bot-place-forest… |
| **Princess Atelier** | Standalone Spore-style creator — 21 species, DNA share codes, 24-clip animation set (`/princess-creator.html`) |
| **Princess Atelier** | Standalone Spore-style character creator — 21 species, DNA share codes, 24-clip animation set, game-ready export (`/princess-creator.html`) |
| **In-house level editor** | Toggleable world editor with blueprint versioning and asset-kit prop placement |
| **Species talent trees** | 30 nodes per species (Blade Dancer / Arcanist / Warlock / … paths) + 4 species-gated signature nodes |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Renderer | [Three.js 0.170](https://threejs.org/) (WebGL 2) |
| Physics | [Rapier3D](https://rapier.rs/) (WASM, kinematic character controller) |
| Language | TypeScript 5.6 (strict mode) |
| Build | [Vite 6](https://vitejs.dev/) |
| Testing | Vitest (1,558 unit tests) + Playwright (E2E specs) |
| UI / Dialogue | HTML/CSS overlays on canvas — DaisyUI v3 for tooling pages |
| Level format | JSON blueprints with `EditorVersioning` snapshots |
| 3D assets | 48 KayKit/Kenney GLB kits, loaded lazily from `/assets-index/<kit>.json` |

---

## Getting Started

```bash
git clone https://github.com/HammerOfSteel/tomes_towers_and_transmutation.git
cd tomes_towers_and_transmutation
npm install
npm run dev          # → http://localhost:5173
```

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm v9+

### Install & Run

```bash
npm install
npm run dev       # → http://localhost:5173
```

### Run Tests

```bash
npm test                    # 1,558 unit tests (Vitest)
npm run test:e2e            # Playwright E2E specs (requires dev server)
npm run bot -- --scenario creative-smoke --headed   # game bot
```

---

## Controls

| Action | Key |
|---|---|
| Move | WASD |
| Melee attack | Left-click |
| Cast equipped spell | Right-click |
| Dodge roll | F |
| Interact / talk | E |
| Spell slots 1–4 | 1 / 2 / 3 / 4 |
| Abilities | Q / R / Z / X |
| Quest journal | J |
| Pause | Escape |
| Creative mode (dev) | Ctrl+Shift+C |

---

## Project Structure

```
src/
  core/          GameLoop, InputManager, camera, physics helpers
  player/        PlayerController, abilities, spells, dodge
  enemy/         SlimeEnemy, PatrolBehavior, TacticalBrute, AggroSystem
  levels/        SceneManager, BlueprintRenderer, TowerFloorDef, encounter pools
  creative/      CreativeMode, HUD, AssetBrowser, Backrooms, SpawnPalette
  world/         OverworldScene, NPCEntity, StoryRunner, StoryQuestLine, Solmor
  ui/            HUD, QuestJournal, TalentTree, DamageNumbers, PickupVFX
  progression/   ProgressionSystem, TalentSystem, AbilitySystem
  rendering/     ProceduralProps, LightingSystem, ParticleSystem, shaders
tests/
  combat/        AbilitySystem, SpellSystem, StoryRunner, SolmorDialogue
  levels/        Blueprint, Encounter, WaveSpawner, EnemyLoader
  creative/      CreativeModeState, CreativeHUD DOM (34 tests)
  e2e/           Playwright: startup, tower-prologue, save-load, quest-journal…
  bot/           GameBot, BotLauncher, 9 scenarios
public/
  assets-index/  48 kit JSON files (4,517 total GLB references, lazy-loaded)
```
│   ├── physics/       # Rapier3D setup and helpers
│   ├── player/        # Player controller, combat, spells
│   ├── enemies/       # Enemy AI state machines
│   ├── levels/        # Blueprint renderer, procedural generator
│   ├── editor/        # In-game level editor (dev tool)
│   ├── ui/            # HTML overlay components
│   └── shaders/       # GLSL vertex/fragment shaders
├── levels/            # Exported JSON blueprint files
├── tests/             # Unit tests (Vitest)
├── docs/              # Extended design documentation
├── GDD.md             # Game Design Document
├── ARCHITECTURE.md    # Technical architecture & rules
├── TODO.md            # Phased implementation roadmap
├── CONTRIBUTING.md    # Dev workflow & conventions
└── README.md          # This file
```

---

## Development Phases

| Phase | Goal | Status |
|---|---|---|
| 1 | Isometric sandbox & physics | ✅ Complete |
| 2 | ALttP action combat | ✅ Complete |
| 3 | Modular blueprint system | ✅ Complete |
| 4 | Level designer (dev tool) | ✅ Complete |
| 4.5 | UI suite (menus, HUD, spellbook) | ✅ Complete |
| 5 | Procedural generation & spell discovery | ✅ Complete |
| 6 | Overworld & monster minions | 🔄 In Progress |
| 7 | The OP power fantasy | ⬜ Not started |
| 8 | Asset replacement & final boss | ⬜ Not started |

Full details in [TODO.md](TODO.md).

---

## Documentation

| Doc | Purpose |
|---|---|
| [GDD.md](GDD.md) | Core game design — concept, loop, narrative |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical rules and dual-design system |
| [TODO.md](TODO.md) | Phased roadmap with per-phase playtests |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Code style, branch strategy, test requirements |
| [docs/MAGIC_SYSTEM.md](docs/MAGIC_SYSTEM.md) | Spell catalogue, progression, shader design |
| [docs/WORLD_DESIGN.md](docs/WORLD_DESIGN.md) | Tower, overworld, and environment design |
| [docs/ENEMY_DESIGN.md](docs/ENEMY_DESIGN.md) | Enemy types, AI states, recruitment |
| [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) | Procedural art style guide and shader conventions |
| [TESTING_AND_TOOLS.md](TESTING_AND_TOOLS.md) | All test suites, `__lab` / `__game` APIs, AI agent workflow |
| [docs/BLUEPRINT_SCHEMA.md](docs/BLUEPRINT_SCHEMA.md) | JSON level format specification |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch strategy, commit conventions, and the test-first rule.

---

## License

TBD — private project.
