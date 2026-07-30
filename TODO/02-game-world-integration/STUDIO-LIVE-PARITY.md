# Studio ↔ Live-Game Parity — Decision Record & Sequencing

> **Read this before touching any file in `01-overworld-studio/` or
> `02-game-world-integration/`.** It records what an architectural audit
> found (2026-08), the decision that came out of it, and the order tasks
> must ship in so nobody builds polish on top of a pipeline that's about to
> be replaced.

## The finding

Overworld Studio (the design/preview tool) and the live playable game were
assumed to share generation code. They mostly don't. An audit compared each
subsystem's Studio-side generator against its live-game equivalent:

| Subsystem | Studio code | Live code | Same algorithm? | Risk |
|---|---|---|---|---|
| Realm/Terrain | `generateRealmData()` (`overworld-studio.ts`) | `WorldGenerator.ts` (`buildWorldGrid`/`buildWorldData`) | ❌ No — different noise (Simplex+shape-masks vs. FBM), different grid size (96×72 vs 128×256+), different biome taxonomy (10 vs 5) | **Highest** |
| Settlements (layout + NPCs) | Voronoi + Lloyd-relaxation wards (`overworld-studio.ts`) | Poisson-disk placement (`SettlementPlacer.ts`) + `SettlementGenerator.ts` + independently reimplemented NPC spawner in `OverworldScene.ts` | ❌ No — two unrelated algorithms | High |
| Buildings | Saved as individual blueprints to Asset Library | Procedural per-settlement, no Asset Library lookup at all | ❌ No override path exists | Medium |
| Cave/Glade | `CaveGladePlacer.ts` (`RealmData` shape) | `CaveGladeWorldPlacer.ts` (`WorldGrid` shape) | ⚠️ Algorithmically equivalent (Poisson-disk + biome eligibility) but literally separate code, different biome taxonomies | Medium |
| Dungeon rooms | `DungeonGenerator.ts:generateDungeon()` | **Same function, literally shared** | ✅ Yes — same seed → identical rooms | Low |
| Dungeon entrance *placement* | Embedded in realm grid | `DungeonPlacer.ts` (Poisson-disk + tower clearance) | ❌ No — only siting differs, room content is identical either way | Low |

**AL-4 reality check** (asset-library.md claims vs. actual code):
- ✅ Room layouts, dungeon entrances, cave/glade entrances — genuinely wired live overrides exist (`customRoomOverrides.ts`, `customLocationOverrides.ts`)
- ❌ Settlement buildings — no override file exists
- ❌ Settlement NPCs — `WorldGen.ts`'s `readCustomSettlementNpcOverrides()` is a stub that always returns null; no backing implementation

## The decision

**Overworld Studio becomes the single source of truth.** The live game must
load and use actual Studio-generated realm/settlement data — not run a
second, independent generator that merely looks similar. This matches
`PROC-C`'s already-planned **WG-5 World Package Export**
(`exportWorldPackage(seed) → JSON bundle`, "imported by game runtime
directly, no re-generation needed") — that target architecture already
exists on paper, it's just never been connected to reality. This work
finishes wiring it up rather than inventing something new.

## Required sequencing

Work through these in order. Each tier is a separate spec → plan →
implementation cycle (see `writing-plans`/`brainstorming` skill flow) —
do not skip ahead.

### P0 — Realm/Terrain unification (foundation, blocks P1 and P3)
Live game loads an actual Studio-exported realm (a WG-5-style world
package) instead of running `WorldGenerator.ts`'s independent algorithm.
This is the highest-risk, highest-priority piece: nothing placed on top of
terrain (settlements, caves, dungeons) can be trusted to match Studio
preview until this lands.

### P1 — Settlement unification (depends on P0)
Once realm data is shared, settlement layout and NPC population converge
to one algorithm. Either the live game adopts Studio's ward/Voronoi model,
or a new shared placement module replaces both. `SettlementGenerator.ts`'s
independently-reimplemented NPC spawner gets retired in favor of one path.

### P2 — Building custom-override wiring (independent, small, start anytime)
Close AL-4's actual remaining gap: a custom building saved in the Asset
Library should be able to appear in a live settlement. No dependency on P0/P1.

### P3 — Cave/Glade unification (depends on P0)
Converge `CaveGladePlacer.ts` and `CaveGladeWorldPlacer.ts` into one
algorithm once realm/world-grid shapes converge under P0.

### P4 — Dungeon entrance-placement parity (low urgency)
Room content is already shared and correct. Only entrance *siting* differs
between Studio's embedded-in-realm-grid approach and live's Poisson-disk
placer. Lowest priority — cosmetic/positional only.

## Explicitly paused until P0/P1 land

These items are **blocked by design**, not just "still needed" — building
them now means polishing a pipeline that P0/P1 will replace:

- **SI-5** (settlement LOD) — `SettlementLOD.ts`'s thresholds exist but
  wiring them into `OverworldScene.ts` now would apply LOD to settlement
  positions/layouts that P1 may change entirely.
- **CG-4** (cave/glade floor scene transition) — fine to build once P3
  lands; building it against today's live placer risks rework.
- **DI-4b** (quest/loot/elite-recruit metadata consumption) — this is a
  cross-cutting change into quest/reward systems that don't exist yet
  either (see `05-content`/`06-game-systems` resequencing); no reason to
  rush it ahead of P0/P1.

## Where this replaces prior guidance

Several sub-todo docs (`realm-integration.md`, `settlement-integration.md`,
`cave-glade-integration.md`) describe RI-1–4/SI-1–6/CG-1–5 as "pure, tested
modules" ready to be "wired in." That description undersold the actual
work: wiring in isn't a small renderer hookup, it's replacing an
independent live algorithm with the Studio one. Those docs remain accurate
about what pure modules exist today; this doc is the authoritative record
of what still has to happen and in what order.
