# Technical Architecture

This document captures the binding technical decisions for *Tomes, Towers & Transmutation*. When a decision here conflicts with a preference, this document wins. Changes require updating this file and noting the reason.

---

## Core Constraints

### Asset Pipeline
**Phase 1–7 (code-first):** No binary assets — all geometry, textures, and audio generated in code.

**Phase 8+ (current — DEMO_RELEASE):** GLB assets are now in the repository under `public/assets/`. The `assetMode` setting in `WorldGenConfig` controls whether code-first or asset-based rendering is used per-zone. Default is `code` for all zones; `kenney` enables GLB prop replacement where implemented.

| Domain | Code-first | Asset mode (`kenney`) |
|---|---|---|
| Characters | DNA creature rigs | `charManifest.ts` GLBs (117 models, 28 enemies) |
| Environment | Procedural THREE.js geometry | Procedurally generated THREE.js geometry |
| Audio | Web Audio API synthesis | `public/music/` MP3 tracks |
| Textures | GLSL procedural shaders | Still code-first in all modes |

GLB files are loaded **lazily** from `public/assets-index/<kitId>.json` (48 JSON files, one per kit). Each entry has `{ path, name, category, gameScale }`. Assets never block the main thread — they upgrade visuals asynchronously after the room loads.

See [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) for the full style guide.

---

## The Dual-Design System

All room layouts are defined as JSON blueprints (see [docs/BLUEPRINT_SCHEMA.md](docs/BLUEPRINT_SCHEMA.md)). These blueprints feed two pathways:

```
JSON Blueprints
     │
     ├──▶ Procedural Generator   (runtime: stitches blueprints by seed)
     │
     └──▶ Level Editor (dev tool) (runtime: drag-and-drop, exports blueprints back to JSON)
```

1. **Procedural Generator** — Scripts piece together modular blueprints based on an integer seed. The same seed always produces the same world. Used for all in-game play.
2. **Level Designer (Dev Tool)** — A toggleable overlay UI (Edit Mode) where developers place blueprint modules on a grid, preview the result, and export the layout as a new blueprint JSON. This feeds back into the generator's pool.

The generator is the canonical runtime path. The editor is a development accelerator.

---

## System Architecture

### High-Level Module Boundaries

```
src/
├── core/
│   ├── GameLoop.ts        — requestAnimationFrame loop; ticks physics then renders
│   ├── SceneManager.ts    — loads/unloads Three.js scenes (room transitions)
│   └── InputManager.ts    — keyboard + mouse state; emits typed events
│
├── physics/
│   ├── PhysicsWorld.ts    — wraps RAPIER.World; owns step() and body registry
│   └── helpers.ts         — conversion utils (RAPIER ↔ THREE vectors)
│
├── player/
│   ├── PlayerController.ts  — kinematic character: movement, wall-slide, dodge, squash/stretch
│   └── SpellSystem.ts       — spell slot management, projectile spawning
│
├── enemy/
│   ├── SlimeEnemy.ts        — base enemy: physics capsule, FSM, EnemyRig animation, pool revive
│   ├── PatrolBehavior.ts    — tier-1 patrol+chase FSM; TacticalBrute tier-2 FSM
│   ├── AggroSystem.ts       — shout broadcast, alert radius, clear-all on room teardown
│   └── EnemyLoader.ts       — loads GLB enemy models, 28 entries in ENEMY_MANIFEST
│
├── levels/
│   ├── SceneManager.ts      — room load/unload, door transitions, encounter spawning, wave FSM
│   ├── BlueprintRenderer.ts — JSON blueprint → Three.js geometry + Rapier physics bodies
│   ├── TowerFloorDef.ts     — per-floor defs: lighting, encounters, scatter props, lore books
│   ├── RoomEncounterDef.ts  — typed encounter pools (8 archetypes, swarm wave support)
│   └── blueprints/          — JSON room definitions
│
├── creative/
│   ├── CreativeMode.ts      — orchestrator: enter/exit, key routing, backrooms
│   ├── CreativePlacementSystem.ts  — right-click place, multi-select, align/distribute, undo/redo
│   ├── CreativeAssetBrowser.ts     — 48-kit lazy-load inventory, Code tab spawns
│   ├── SpawnPalette.ts      — spawn item definitions (enemies, NPCs, waves, zones, interactables)
│   └── backroomScenes.ts    — 3D scene builders for 7 backrooms + spell workbench
│
├── world/
│   ├── StoryQuestLine.ts    — per-species 4-act story data (16 beats × 4 species)
│   ├── StoryRunner.ts       — runtime FSM: tick objectives, fire callbacks, advance acts
│   ├── SolmorDialogueTree.ts — 3-stage wizard dialogue with species-aware text
│   ├── SolmorPresence.ts    — 3D toad-wizard model near tower entrance
│   ├── NPCEntity.ts         — overworld NPC: wander/idle/interact FSM, quest generation
│   └── NPCDialogue.ts       — greeting + quest-hint banks for all NPC roles (9 roles)
│
├── progression/
│   ├── ProgressionSystem.ts — XP/level, TalentModifiers, spell grants
│   ├── TalentSystem.ts      — 30-node constellation + 4 species-gated signature nodes
│   └── AbilitySystem.ts     — 4-slot ability bar, mana pool, cooldown tracker
│
├── ui/
│   ├── HUD.ts               — HP/mana/abilities/dodge/XP/quest tracker
│   ├── QuestJournal.ts      — tabbed journal ([J] key): Species Quests | World Quests
│   ├── TalentTree.ts        — star-map UI with species gating + particle unlock VFX
│   ├── DamageNumbers.ts     — floating combat text (damage/heal/crit)
│   ├── EnemyHealthBars.ts   — proximity-gated enemy HP bars
│   ├── PickupVFX.ts         — world-space item pickup pop animation
│   └── TalentUnlockVFX.ts   — DOM particle burst + Web Audio chime on talent purchase
│
└── shaders/                 — GLSL vertex/fragment shaders
```

### Data Flow

```
InputManager (WASD/mouse/abilities)
    │
    ▼
PlayerController ──▶ PhysicsWorld.step()  (culled at 30u radius)
    │                       │
    │               (collision callbacks)
    │                       ▼
    │             SlimeEnemy.update() ─── PatrolBehavior / TacticalBrute FSM
    │                       │
    ▼                       ▼
SpellSystem        SceneManager ──▶ _checkRoomCleared ──▶ _spawnClearReward
    │                       │
    ▼                       ▼
AbilitySystem    StoryRunner.tick() ──▶ QuestJournal / ObjectiveTracker
    │
    ▼
THREE.WebGLRenderer (bloom post-processing, DayNightSystem fog)
```

---

## Key Technical Decisions

### Physics: Kinematic Character Controller
The player uses Rapier's `KinematicCharacterController` — not a rigid body. This gives tight, game-feel-first movement control (wall-sliding, no physics jitter) at the cost of less "realistic" collisions. Enemies use dynamic rigid bodies.

### Camera: Isometric Lock
The camera uses a `PerspectiveCamera` at a high-FOV (~60°) positioned at a fixed isometric angle (`[1, 1.5, 1]` normalized direction). It never rotates — it only translates to follow the player. This is a deliberate simplification.

### Seed-Deterministic Generation
All randomness in level generation passes through a seeded PRNG (`mulberry32` or equivalent). `Math.random()` is **banned** — use the seeded generator. This ensures reproducibility and sharable seeds.

### Performance Budget (Phase 1–7)
Target: **60fps on a mid-range laptop** (integrated graphics).

| Budget Item | Limit |
|---|---|
| Draw calls per frame | < 200 |
| Active Rapier bodies | < 150 |
| Simultaneous particle systems | ≤ 8 |
| Shadow map resolution | 1024×1024 |
| Enemies in scene at once | ≤ 30 |

Violations of these budgets must be measured (not assumed) and justified.

### Testing Boundary
Unit tests **must not** instantiate `THREE.WebGLRenderer` or `RAPIER.World`. These are expensive and browser-dependent. Mock or stub at the module boundary. Pure logic (damage math, blueprint parsing, generator output, FSM transitions) must be covered by tests without renderer dependencies.

---

## Architectural Decision Log

| Date | Decision | Rationale |
|---|---|---|
| Project start | Rapier3D over Cannon.js or Ammo.js | WASM-based, actively maintained, first-class JS bindings |
| Project start | Vite over webpack/parcel | Fastest HMR, native ESM, minimal config |
| Project start | No game engine (Three.js direct) | Full control, no black-box overhead, intentional scope |
| Project start | JSON blueprints over code-driven rooms | Human-readable, editor-exportable, testable |
| Project start | `MeshPhysicalMaterial` with clearcoat for creatures | Toy-plastic look; better lighting than MeshToon; no toon outlines needed at isometric scale. Re-evaluate at Phase 8 |
| Phase 4.5 | DNA-based creature system (`CreatureDNA`, `CreatureBuilder`, `CreatureAnimator`) | All creature geometry is procedural + data-driven; same DNA object drives CC preview and in-game rig |
| Phase 4.5 | `creature-lab.html` as isolated visual sandbox | Allows fast iteration on creature geometry outside the game loop; Playwright E2E tests target it directly |