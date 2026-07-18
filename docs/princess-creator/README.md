# Princess Creator — Documentation Index

> A standalone, Spore-style procedural character creator for
> *Tomes, Towers & Transmutation*: **21 princess species** (human, elves, fae,
> undead, slime, lamia, orc…) built on **five body synthesizers** — smooth
> toon, low-poly fur, marching-cubes jelly, bone segments, serpent coil.
> One DNA recipe in, one living, fully-animated chibi princess out.

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
| [SPECIES.md](SPECIES.md) | The princess multiverse: the full 21-species roster, classes, subtypes, auras |
| [ANIMATIONS.md](ANIMATIONS.md) | The 24-clip game move set: format spec, species overrides, tuning, `.anim.json` export, runtime sampler |
| [PRINCESS_CREATOR_TODO.md](PRINCESS_CREATOR_TODO.md) | **The master phased roadmap** — phases 0–10 with tasks, subtasks, acceptance checks and a status-at-a-glance block |
| [INTEGRATION.md](INTEGRATION.md) | How the main game consumes DNA / GLB / `PrincessFactory`; scale conventions |

## Design pillars (the short version)

1. **Magic crayons, not Maya.** Like Spore: few, high-impact, constrained
   controls that make *every* output look good. Sliders have curated ranges;
   randomize is tuned, not uniform noise.
2. **One DNA to rule them all.** Every princess is a small, versioned,
   serializable recipe (JSON ⇄ base64url share code). If it's not in the DNA,
   it doesn't exist.
3. **One family, 21 species.** Five body technologies (smooth toon skin,
   fluffy low-poly fur, marching-cubes jelly, bone segments, serpent coil)
   share one chibi rig contract, socket set, face language and palette
   system, so the whole cast reads as one game — while every species keeps a
   signature construction and animation flavor (lamia slithers, slime melts,
   skeleton collapses into a bone pile).
4. **Alive by default.** The preview is never a statue: breathing, blinking,
   idle sway, tail/cape/pigtail secondary motion, and test-drive emotes.
5. **Standalone, integration-ready.** Zero game-runtime imports. Exports:
   DNA share code, `.princess.json`, PNG portrait, GLB. The game later imports
   `PrincessFactory` (or loads GLBs) — see INTEGRATION.md.

## Status — end of day 2026-07-18

**All tool phases (0–9) complete** — the creator is feature-complete for
game handoff. Tracker: [PRINCESS_CREATOR_TODO.md](PRINCESS_CREATOR_TODO.md).

- **Session 1** — docs suite, scaffold, DNA core, four body synthesizers,
  parts, palettes, base animation, randomizer, share codes, gallery, exports,
  tests.
- **Session 2** — Phase 7 direct manipulation (hover glow, wheel-scale,
  pull-to-sculpt, drag/tear-off, paint-drop, DNA-in-PNG portraits,
  `PrincessFactory`) + Phase 8 Wave 1: 12 species, classes, kitsune
  subtypes, auras, DNA v2.
- **Session 3** — the full 21-species roster: Fae/Ignis/Specter,
  Naiad/Moonborn/Verdant, Lamia (serpent synth #5), Orc & Troll.
- **Session 4** — Phase 9 animation system: 24 game clips (idle ×2, walk,
  run, attacks ×2, casts ×2, hits ×2, blocks ×2, jump set ×3, deaths ×2,
  victory/curtsy/stunned/read + emotes) with gameplay events, species
  overrides, in-tool tuning saved per species, and the versioned
  `princess-animations.anim.json` export ([ANIMATIONS.md](ANIMATIONS.md)).

**Next: Phase 10 — game-side integration** — spawn via factory, controller
states, combat events, stats hook, portraits, audio (task list at the bottom
of the TODO). Current work lives on `feature/princess-creator` (draft PR #1;
retarget its base to `main` when landing — the old base branch is already in
main).
