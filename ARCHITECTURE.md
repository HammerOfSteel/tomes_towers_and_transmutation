# Technical Architecture

This document captures the binding technical decisions for *Tomes, Towers & Transmutation*. When a decision here conflicts with a preference, this document wins. Changes require updating this file and noting the reason.

---

## Core Constraints

### The "No Asset" Rule
Until Phase 8, **no binary assets are allowed in the repository**: no `.obj`, `.gltf`, `.glb`, `.png`, `.jpg`, `.mp3`, or `.wav` files.

| Domain | Allowed Approach |
|---|---|
| Characters | Compound Three.js primitives (`CapsuleGeometry` + `SphereGeometry` etc.) |
| Textures | Procedural GLSL fragment shaders (Perlin/Simplex noise, grid functions) |
| Rune markings | Canvas API → `CanvasTexture` (runtime generated, not committed) |
| VFX | Three.js `Points` with custom `ShaderMaterial` |
| Audio | Web Audio API synthesis — no audio files |

Rationale: Forces stylistic consistency, keeps the repo lightweight, and eliminates asset pipeline complexity until the game's structure is proven.

See [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) for the full procedural style guide.

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
│   ├── PlayerController.ts  — kinematic character: movement, wall-slide, dodge
│   ├── CombatSystem.ts      — melee arc, hitbox lifecycle, i-frames
│   └── SpellSystem.ts       — spell slot management, projectile spawning
│
├── enemies/
│   ├── EnemyManager.ts      — spawning, despawning, party list
│   ├── StateMachine.ts      — generic FSM (Idle/Alert/Chase/Attack/Flee/Recruit)
│   └── types/               — per-enemy config: stats, geometry, AI overrides
│
├── levels/
│   ├── BlueprintRenderer.ts — parses JSON blueprint → Three.js geometry + Rapier bodies
│   ├── DungeonGenerator.ts  — stitches blueprints into floors using a seed
│   └── blueprintMigration.ts — upgrades old schema versions to current
│
├── editor/
│   ├── EditMode.ts          — toggles editor UI; intercepts input when active
│   └── EditorUI.ts          — grid snapping, placement, export/import
│
├── ui/
│   ├── HUD.ts               — HP bar, spell slots, party count
│   ├── BookReader.ts        — "Arcane for Dummies" overlay; triggers progression
│   └── CharacterCreation.ts — DNA-driven character creator UI (archetype, morph sliders, outfit, props)
│
├── creatures/
│   ├── CreatureDNA.ts       — creature DNA type (archetype, proportions, colors, face, outfit, props)
│   ├── CreatureBuilder.ts   — procedural geometry builder; one function per archetype
│   └── CreatureAnimator.ts  — per-archetype idle/walk/run animation driver
│
└── shaders/
    ├── palette.ts           — canonical color constants
    ├── noise.glsl           — shared noise functions (imported by shaders)
    └── [spell/surface shaders] — one file per material type
```

### Data Flow

```
InputManager
    │ typed events
    ▼
PlayerController ──▶ PhysicsWorld.step()
    │                       │
    │               (collision callbacks)
    │                       │
    ▼                       ▼
CombatSystem ◀──── EnemyManager
    │
    ▼
SpellSystem ──▶ ProjectilePool
    │
    ▼
SceneManager.render() ──▶ THREE.WebGLRenderer
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