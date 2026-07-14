# Tomes, Towers & Transmutation

> *A captive princess. A dusty library of forbidden magic. An oblivious wizard captor. Revenge.*

**Tomes, Towers & Transmutation** is a narrative-driven isometric action-RPG built entirely in the browser. No game engine — just Three.js, Rapier3D physics, and raw WebGL shaders. A captive princess teaches herself magic from her captor's own textbooks, escapes, claims the tower, recruits a monster army, and delivers an overwhelmingly disproportionate act of revenge.

---

## Highlights

| Feature | Details |
|---|---|
| **Combat** | ALttP-style real-time combat — sweeping melee arcs, aimed spell projectiles, dodge-rolls, i-frames |
| **Procedural everything** | Geometry, textures, VFX — all generated in code (no external assets until Phase 8) |
| **Tower as dungeon** | Procedurally generated multi-floor tower interior via seeded BSP/cellular-automata |
| **Monster recruitment** | Spare enemies below 10% HP to add them to your party |
| **Power fantasy arc** | Intentionally exponential power curve — the final boss is a narrative punchline |
| **In-house level editor** | Toggleable dev tool to build/export rooms as JSON blueprints |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Renderer | [Three.js](https://threejs.org/) (WebGL) |
| Physics | [Rapier3D](https://rapier.rs/) (WASM) |
| Build tooling | [Vite](https://vitejs.dev/) |
| Art (phases 1–7) | Procedural primitives + custom GLSL shaders |
| UI / Dialogue | HTML/CSS overlay on canvas |
| Level format | JSON blueprints |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm v9+ (or pnpm / yarn)

### Install & Run

```bash
# clone
git clone https://github.com/HammerOfSteel/tomes_towers_and_transmutation.git
cd tomes_towers_and_transmutation

# install deps (once a package.json exists — see Phase 1)
npm install

# start dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Run Tests

```bash
npm test
```

---

## Project Structure

```
tomes_towers_and_transmutation/
├── src/
│   ├── core/          # Engine bootstrapping, game loop
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
