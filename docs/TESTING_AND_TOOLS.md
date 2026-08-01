# Testing & Developer Tools

This document is the single reference for every automated test suite, dev tool, and
debug API in the project. It is written to be useful both for human developers and for
AI coding agents (e.g. GitHub Copilot, LM Studio + Cline) that need to verify changes
or investigate visual regressions.

---

## Quick Reference

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server at `http://localhost:5173` |
| `npm test` | Run all 249 Vitest unit tests (no server needed) |
| `npm run test:watch` | Vitest in watch mode |
| `npx tsc --noEmit` | Type-check without building |
| `npm run test:e2e` | Run all Playwright E2E tests (requires dev server) |
| `npx playwright test tests/e2e/creature-visual.test.ts` | Creature visual suite only |
| `npx playwright test tests/e2e/exterior.test.ts` | Overworld E2E suite only |
| `npm run test:e2e:report` | Open the Playwright HTML report in a browser |
| `npm run coverage` | Vitest coverage report |

**E2E prerequisite:** `npm run dev` must already be running in a separate terminal.
Playwright connects to `http://localhost:5173` (configured in `playwright.config.ts`).

---

## 1. Unit Tests — Vitest

**Framework:** Vitest 3 + jsdom  
**Config:** `vitest.config.ts`  
**Location:** `tests/` (all `*.test.ts` files, recursive)  
**Count:** 249 tests, 16 suites

### Constraint
Unit tests **must not** instantiate `THREE.WebGLRenderer` or `RAPIER.World`.
All Three.js / Rapier dependencies are mocked at the module boundary.
Pure logic only: math, generators, state machines, serialization.

### Suites

| File | Suite | What it covers |
|---|---|---|
| `tests/core/prng.test.ts` | `mulberry32` | Seeded PRNG determinism, range, coverage |
| `tests/core/poissonDisk.test.ts` | `poissonDisk` | No-overlap guarantee, determinism, bounds, 50-seed stress |
| `tests/core/InputManager.test.ts` | InputManager | Key mapping, action dispatch |
| `tests/core/CameraRig.test.ts` | CameraRig | Follow logic, offset math |
| `tests/combat/Health.test.ts` | Health | Damage, heal, i-frames, death threshold (17 tests) |
| `tests/combat/spellSystem.test.ts` | SpellSystem | Cooldown, nova_burst radius, chain_arc bounce cap, battle_hymn flag |
| `tests/combat/partyManager.test.ts` | PartyManager | Recruit cap, dismiss, pruneDead (8 tests) |
| `tests/player/movement.test.ts` | Movement | Velocity clamping, wall-slide direction (10 tests) |
| `tests/editor/EditorGrid.test.ts` | EditorGrid | Blueprint round-trip, grid snapping, export validation |
| `tests/levels/blueprint.test.ts` | validateBlueprint | Schema acceptance/rejection, staircase fields, round-trip JSON |
| `tests/levels/dungeonGenerator.test.ts` | generateDungeon | Determinism, connectivity, symmetry, 1000-seed stability |
| `tests/levels/towerGenerator.test.ts` | TowerFloorDef + generateTower | 11-floor structure, staircase chain, key fixture placement (25 tests) |
| `tests/levels/greenhouseGenerator.test.ts` | generateGreenhouse | Circular chamber, door, lectern placement (12 tests) |
| `tests/interactables/tamingGame.test.ts` | TamingGame | 3-round word-pick, personality scoring, threshold (8 tests) |
| `tests/progression/ProgressionSystem.test.ts` | ProgressionSystem | XP accumulation, level-up trigger, stat delta |
| `tests/progression/talentSystem.test.ts` | TalentSystem | Node registry, buyNode prereq checks, cross-path gates (35 tests) |

### Tips for AI agents
- After any logic change run `npm test` and confirm "249 passed".
- If you add a new module, add a corresponding test file in the matching `tests/` subdirectory.
- The `tests/levels/` suites are the most complex — read `src/levels/TowerFloorDef.ts` and
  `src/levels/TowerGenerator.ts` before touching them.
- `mulberry32` PRNG is the only allowed randomness source — `Math.random()` is banned.

---

## 2. E2E Tests — Playwright

**Framework:** @playwright/test 1.61  
**Config:** `playwright.config.ts`  
**Location:** `tests/e2e/`  
**Server:** `http://localhost:5173` (must be running: `npm run dev`)

Playwright tests drive the real browser, interact with the `window.__lab` and
`window.__game` APIs, and capture screenshots as the primary evidence of correctness.

Screenshots are saved to `tests/e2e/screenshots/` and are committed to the repo so
regressions are visible in git diffs.

### 2a. Overworld E2E — `exterior.test.ts`

Tests physical correctness of the overworld scene using `window.__game`.

| Test | What it checks |
|---|---|
| `gameMode becomes "exterior"` | `switchToExterior()` flips scene mode |
| `no dungeon geometry in exterior` | No JS errors; screenshot confirms clean exterior |
| `player group is visible` | `window.__game.playerVisible()` |
| `player stays above terrain` | Physics grounding; y-position never goes below −0.5 |
| `terrain physics settles` | Height-settled screenshot at t=2s |
| `no fall-through` | Player rests on terrain at start |
| `tower entrance is visible` | Tower mesh present in scene |
| `tower zone visible from spawn` | screenshot confirmation |
| `exterior → interior round trip (7a, 7b)` | Travel to tower door and re-enter |
| `spawn height is correct` | `getPlayerPos().y` is within ±0.2 of expected |
| `tower 01–06` series | Tower interior entrance, near-door, entry, prompt visibility |

**Helpers** in `tests/e2e/helpers.ts`:
- `loadPage(page)` — navigates to `localhost:5173`
- `startGame(page)` — clicks through main menu to start game
- `goExterior(page, snapName)` — calls `switchToExterior`, takes screenshot
- `getPlayerPos(page)` — returns `{x,y,z}` from `window.__game`
- `getGameMode(page)` — returns `'interior' | 'exterior' | 'telescope'`
- `teleportPlayer(page, x, y, z)` — instant teleport for spatial assertions
- `isNearTower(page)` — proximity check to tower entrance
- `waitForGrounded(page)` — polls until `playerPos.y` stabilises

### 2b. Creature Visual Suite — `creature-visual.test.ts`

Uses `window.__lab` (the Creature Lab sandbox). Captures screenshots for visual review.
Does **not** make assertions on pixel data — screenshots are the deliverable.

| Describe block | Screenshots produced |
|---|---|
| All archetypes overview | `all-front`, `all-iso`, `all-side`, `all-back` |
| Individual archetypes (4 angles each) | `arch-{biped,quadruped,avian,serpent,amoeba}-{front,iso,side,back}` |
| Walk animation per archetype | `arch-{archetype}-walk-iso` |
| Leg clothing close-ups | `leg-{none,trousers,skirt,shorts,loincloth,robe_skirt}-{front,side}` + `legs-all-{front,side}` |
| Top clothing | `tops-all-front`, `tops-all-side` |
| Over-clothing | `over-all-iso`, `over-all-front` |
| Morph extremes | `morphs-front`, `morphs-side` |
| Props — wings | `props-wings-front`, `props-wings-back` |
| Animation states | `anim-{idle,walk,run}-iso` |

**Running a subset:**
```bash
npx playwright test tests/e2e/creature-visual.test.ts --grep "Individual archetypes"
npx playwright test tests/e2e/creature-visual.test.ts --grep "biped"
```

### 2c. Animation Quality Suite — `animation-quality.test.ts`

Captures animation frame-strips using `freezeAt(t)` to freeze the renderer at a specific
animation time. Each strip is 8 frames across a 1.75s window.

| What it captures |
|---|
| Idle / walk / run frames for each archetype (15 strips × 8 frames) |
| Serpent full 360° orbit at 12 angles (walk state) |
| All-archetypes mid-stride comparison |

Output: `tests/e2e/screenshots/animation/report.html` — a self-contained HTML filmstrip viewer.

### 2d. Concept Art Review — `concept-art-review.test.ts`

Reads any `concept_art/*.png` and `princess_*_reference.png` files, embeds them as
base64, and produces a side-by-side comparison HTML report.

Output: `tests/e2e/screenshots/concept-review/report.html`  
(~105 MB self-contained HTML — do not commit; listed in `.gitignore`)

---

## 3. The Creature Lab (`creature-lab.html`)

The Creature Lab is a standalone Three.js sandbox for building and previewing creatures
visually, independent of the game. Open it directly in the browser:

```
http://localhost:5173/creature-lab.html
```

It auto-starts showing all 5 archetypes side by side with idle animation and slow
auto-rotation. You can drag to rotate. All creature-visual Playwright tests target this page.

### `window.__lab` API

The lab exposes a debug API on `window.__lab` used by Playwright tests. It is also useful
for manual debugging from the browser console.

```typescript
// Show all 5 archetypes side by side (default view)
window.__lab.showAll()

// Show a single archetype by name
window.__lab.showCreature('biped')
window.__lab.showCreature('serpent')
window.__lab.showCreature('amoeba')

// Show a single creature from a full DNA object
window.__lab.showCreature({
  archetype: 'biped',
  colors: { primary: 0x8844cc, secondary: 0x221133, emissive: 0x4422aa, emissiveIntensity: 0.08 },
  proportions: { global: 1, torso: [1,1,1], headSize: 1, limbLength: 1, limbWidth: 1,
    neckLength: 1, tailLength: 1, wingSpan: 1, segmentCount: 8,
    shoulderWidth: 1, hipWidth: 1, bellySize: 0, neckThickness: 1 },
  face: { type: 'cute', eyeColor: 0xffdd44, mouthType: 'smile', expression: 'neutral' },
  material: { roughness: 0.55, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
  props: ['wings_bat', 'hair_long'],
  outfit: { top: 'tunic', legs: 'trousers', over: 'none' },
}, 'my_biped')

// Show outfit comparison grids
window.__lab.showLegOutfits()   // all leg options
window.__lab.showTopOutfits()   // all top options
window.__lab.showOverOutfits()  // all capes/robes
window.__lab.showMorphs()       // biped proportion extremes

// Camera / angle control
window.__lab.setAngle(0)    // face-on front view
window.__lab.setAngle(45)   // isometric
window.__lab.setAngle(90)   // side view
window.__lab.setAngle(180)  // back view
window.__lab.resumeRotation()  // resume auto-rotate

// Animation control
window.__lab.setAnimState('idle')
window.__lab.setAnimState('walk')
window.__lab.setAnimState('run')

// Freeze animation at a specific time (for screenshot reproducibility)
window.__lab.freezeAt(0.5)    // freeze at t=0.5s
window.__lab.freezeAt(1.25)   // mid-walk frame
window.__lab.thawTime()       // resume live animation

// Camera position override (for special angles)
window.__lab.setCamera(0.4, 1.5, 3.2, 1.1)  // default CC preview angle
window.__lab.setCamera(0, 3, 0.01, 0.8)      // near-top-down

// Introspect current rigs
window.__lab.getRigInfo()
// returns: [{ label, posX, posY, boneKeys: ['torso','head','armL','armR',...] }]

// Capture current canvas as data URL
window.__lab.snapshot()
```

---

## 4. The `window.__game` API (Main Game)

The main game (`index.html`) exposes a debug API on `window.__game` used by the
exterior E2E tests. This is NOT the creature lab — it is the live game runtime.

```typescript
window.__game.playerVisible()           // boolean
window.__game.getPlayerPos()            // { x, y, z }
window.__game.getGameMode()             // 'interior' | 'exterior' | 'telescope'
window.__game.switchToExterior()        // programmatically go to overworld
window.__game.teleportPlayer(x, y, z)  // instant teleport
window.__game.isNearTower()             // proximity boolean
```

---

## 5. CreatureDNA — Shape + Props Reference

All creature geometry is driven by the `CreatureDNA` type in `src/creatures/CreatureDNA.ts`.
Understanding this type is essential for writing tests or prompting new creature work.

### Archetypes
`'biped' | 'quadruped' | 'avian' | 'serpent' | 'amoeba'`

### Key proportions fields (biped-relevant)
| Field | Effect | Default |
|---|---|---|
| `global` | Uniform scale | 1.0 |
| `torso[0]` | Body width (X) | 1.0 |
| `torso[1]` | Body height (Y) — "Torso H" slider | 1.0 |
| `torso[2]` | Body depth (Z) | 1.0 |
| `headSize` | Head sphere radius multiplier | 1.0 |
| `limbLength` | Arm length | 1.0 |
| `limbWidth` | Limb thickness | 1.0 |
| `legLength` | Leg length (independent of arms) | 1.0 (optional) |
| `shoulderWidth` | Shoulder spread | 1.0 |
| `hipWidth` | Hip spread | 1.0 |
| `bellySize` | Belly sphere prominence | 0.0 |
| `neckThickness` | Neck radius | 1.0 |
| `segmentCount` | Segment count (serpent/amoeba) | 8–9 |

### Props (physical features — `PropId`)
`'horns_small' | 'horns_large' | 'tail_stub' | 'tail_long' | 'wings_bat' | 'crown' | 'robe' | 'armor_light' | 'aura' | 'hair_short' | 'hair_long' | 'hair_bun'`

### Outfit slots
```typescript
outfit: {
  top:  'none' | 'tunic' | 'robe_top' | 'armor_chest' | 'wrap'
  legs: 'none' | 'trousers' | 'skirt' | 'shorts' | 'loincloth' | 'robe_skirt'
  over: 'none' | 'robe_full' | 'cape' | 'cloak'
}
```

### Face types
`'cute' | 'angry' | 'cyclops' | 'skull' | 'compound' | 'blank'`

### Sub-races (biped only)
`'human' | 'elf' | 'high_elf' | 'goblin' | 'orc' | 'troll' | 'pixie' | 'undead' | 'draconic' | 'celestial' | 'fae' | 'gnome' | 'none'`

---

## 6. Workflow for AI Agents (Cline / LM Studio)

If you are an AI agent taking over work on this project, follow this sequence:

### Before making changes
1. Read `ARCHITECTURE.md` — especially the No-Asset Rule and the Testing Boundary.
2. Read `TODO.md` — check which phase is in progress and what the next task is.
3. Read `src/creatures/CreatureDNA.ts` if touching any creature-related code.
4. Run `npm test` and confirm **249 tests pass** before starting.

### After making changes
1. `npx tsc --noEmit` — zero errors required.
2. `npm test` — 249 tests must still pass.
3. If you changed creature geometry: run the creature visual suite and check screenshots:
   ```bash
   npx playwright test tests/e2e/creature-visual.test.ts
   # then view: tests/e2e/screenshots/creatures/
   ```
4. If you changed overworld/physics: run:
   ```bash
   npx playwright test tests/e2e/exterior.test.ts
   ```
5. Commit with a descriptive message. Keep commits atomic (one concern per commit).

### Common gotchas
- `Math.random()` is **banned**. Use `mulberry32` seeded PRNG from `src/core/prng.ts`.
- No binary files in the repo (no `.png`, `.glb`, etc.) until Phase 8.
- The `window.__lab` API is only available on `creature-lab.html` — not `index.html`.
- E2E tests require `npm run dev` to be running. They will silently time out if the server is not up.
- The `POC/` folder contains an unrelated proof-of-concept and its `node_modules/` — ignore it. Its test files appear in Vitest output as "failed" (no test suite) but this is expected noise.
- `torso` in `CreatureDNA` is `[tx, ty, tz]` — a scaling vector, not a position.
  The "Torso H" slider maps to `torso[1]` (ty), not a separate `torsoHeight` field.

### Reading screenshots
All screenshots are PNG files in `tests/e2e/screenshots/`. They are the primary
visual regression signal. Git diff will not show pixel differences — open them manually
or use `npm run test:e2e:report` to view the Playwright HTML report.

Key directories:
- `screenshots/creatures/` — per-archetype + per-outfit reference shots
- `screenshots/animation/report.html` — frame-strip filmstrip viewer (open in browser)
- `screenshots/concept-review/report.html` — concept-art vs in-game comparison (not committed)

---

## 7. Source Files Quick Map

| Area | Key files |
|---|---|
| Creature DNA + types | `src/creatures/CreatureDNA.ts` |
| Creature geometry builder | `src/creatures/CreatureBuilder.ts` |
| Creature animation | `src/creatures/CreatureAnimator.ts` |
| Character creation UI | `src/ui/CharacterCreation.ts` |
| Creature Lab page | `src/creature-lab.ts`, `creature-lab.html` |
| Tower floor definitions | `src/levels/TowerFloorDef.ts` |
| Tower procedural generator | `src/levels/TowerGenerator.ts` |
| Overworld scene | `src/scene/OverworldScene.ts` |
| Physics world | `src/physics/PhysicsWorld.ts` |
| Input manager | `src/core/InputManager.ts` |
| Seeded PRNG | `src/core/prng.ts` |
| Blueprint schema + renderer | `src/levels/BlueprintRenderer.ts` |
| Progression / talents | `src/core/ProgressionSystem.ts`, `src/core/TalentSystem.ts` |
