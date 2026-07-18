# INTEGRATION — Consuming Princesses from the Main Game

> The creator is standalone; integration is one-directional (game imports
> creator modules/output, never vice versa).

## 1. Three consumption paths

### A. `PrincessFactory` (recommended — live procedural) — SHIPPED
```ts
import { buildPrincess } from '@/princess-creator/factory';

const p = buildPrincess(dnaOrShareCode, { targetHeight: 1.6 });
scene.add(p.root);
// per frame: p.update(t, dt)   — idle/walk/emotes + secondary motion
p.playEmote('twirl');           // wave | twirl | dance | cast
p.setWalking(true);
// or pass { animate: false } and drive p.rig joints yourself
p.dispose();                    // frees geometries + material kit
```
- `factory.ts` is a thin façade over compose/synth/parts/materials with zero
  DOM/UI imports — safe to import from game code (unit-tested per species,
  incl. `targetHeight` game-unit scaling and a dispose-balance leak guard).
- The game's existing `AnimationRetargeter`/controller can drive `rig`
  (same pivot-Group convention as `src/creatures` rigs).

### B. GLB export (static / DCC path)
Exported `.glb` from the tool → `assets/` pipeline like any other model.
Includes `KHR_materials_transmission` for slime (check target viewer support;
fallback: alpha-blend material). Pivot groups arrive as named `Object3D`s with
`userData.pivotRole` tags.

### C. DNA strings as content
`.princess.json` / `P1.` codes are tiny and diff-friendly — commit named NPCs
(e.g. `assets/princesses/maribel.princess.json`), spawn via factory at
runtime. This is the Spore "tiny recipe" payoff: a cast of characters in a few
KB of reviewable text.

## 2. Scale & orientation conventions

- Creator units: princess ≈ 8–10 u tall (POC scale). Factory accepts
  `targetHeight` (meters) and rescales root; game standard: **1.6 u** for the
  playable princess, ~1.2 u for NPC chibis.
- +Z forward, +Y up, origin at floor center between feet — matches game
  character convention.

## 3. Determinism guarantee

Same DNA ⇒ identical princess (all randomness is seeded from `dna.seed`).
Safe for multiplayer-less determinism, save files, and content diffing.

## 4. Suggested game hooks (future)

- New-game flow: replace/augment the campfire GLB picker with "create your
  princess" (factory path A).
- Recruited monster princesses: archetype variants as rare recruits (slime
  princess in the Menagerie…).
- Portrait PNGs from the exporter for dialogue UI.
- Stats hook: parts → small stat modifiers (Spore-style), via a pure
  `statsForDna(dna)` in game code — the creator stays cosmetic.

## 5. Dev-server niceties (optional, later)

A `/api/save-princess` vite middleware (same pattern as the level editor's
`/api/save-level`) could write `.princess.json` straight into `assets/
princesses/` during dev sessions. Not required for the standalone tool.
