# Princess Creator — Documentation Index

> A standalone, Spore-style procedural character creator for the cute princess
> archetypes of *Tomes, Towers & Transmutation*: **Human**, **Fox**, **Slime**,
> and **Skeleton**. One DNA recipe in, one living chibi princess out.

The tool lives at **`princess-creator.html`** (Vite entry) with all source in
**`src/princess-creator/`**. It is deliberately isolated from the game runtime:
no imports from `src/core`, `src/player`, `src/levels`, etc. The only shared
dependency is `three`. The game consumes its output (DNA strings / GLB / the
`PrincessFactory` module) — never the other way around.

## Quickstart

```bash
npm install
npm run dev
# open http://localhost:5173/princess-creator.html
```

## Documents

| Doc | Purpose |
|---|---|
| [RESEARCH.md](RESEARCH.md) | How Spore actually did it (sources), community implementations, and the technique we chose per system |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module map, data flow, the `BodySynthesizer` contract, rebuild strategy, performance budget |
| [DNA_SCHEMA.md](DNA_SCHEMA.md) | The versioned `PrincessDNA` format, ranges, defaults, share-code encoding, migration rules |
| [PARTS_CATALOG.md](PARTS_CATALOG.md) | Socket system, part categories, morph params, per-archetype material adaptation, part authoring guide |
| [UX_SPEC.md](UX_SPEC.md) | Editor layout, interactions, test-drive mode, gallery, exports, keyboard shortcuts |
| [SPECIES.md](SPECIES.md) | The princess multiverse: 12 Wave-1 species, classes, subtypes, auras + Wave-2 backlog |
| [PRINCESS_CREATOR_TODO.md](PRINCESS_CREATOR_TODO.md) | **The master phased roadmap** — phases 0–8 with tasks, subtasks and acceptance checks |
| [INTEGRATION.md](INTEGRATION.md) | How the main game consumes DNA / GLB / `PrincessFactory`; scale conventions |

## Design pillars (the short version)

1. **Magic crayons, not Maya.** Like Spore: few, high-impact, constrained
   controls that make *every* output look good. Sliders have curated ranges;
   randomize is tuned, not uniform noise.
2. **One DNA to rule them all.** Every princess is a small, versioned,
   serializable recipe (JSON ⇄ base64url share code). If it's not in the DNA,
   it doesn't exist.
3. **Four archetypes, one family.** Human / Fox / Slime / Skeleton share the
   same chibi skeleton-rig contract, socket set, face language and palette
   system, so they read as one game's cast — while each keeps a signature
   construction (marching-cubes jelly, bone segments, fluffy low-poly fur,
   smooth toon skin).
4. **Alive by default.** The preview is never a statue: breathing, blinking,
   idle sway, tail/cape/pigtail secondary motion, and test-drive emotes.
5. **Standalone, integration-ready.** Zero game-runtime imports. Exports:
   DNA share code, `.princess.json`, PNG portrait, GLB. The game later imports
   `PrincessFactory` (or loads GLBs) — see INTEGRATION.md.

## Status

Phase tracker lives in [PRINCESS_CREATOR_TODO.md](PRINCESS_CREATOR_TODO.md).
Session 1 (2026-07-18): docs suite, scaffold, DNA core, four body
synthesizers, parts, palettes, animation, randomizer, share codes, gallery,
exports, tests. Session 2: Phase 7 direct manipulation (hover glow,
wheel-scale, drag/tear-off) + Phase 8 Wave-1 species system — 12 species,
classes, kitsune subtypes, auras, DNA v2 (see SPECIES.md).
