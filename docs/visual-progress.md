# Visual Progress — Asset Upgrade Screenshots

Screenshots are captured automatically by the Playwright test suite and written
to `tests/e2e/screenshots/`.  Run the tests with:

```
npm run dev          # keep the dev server running in one terminal
npx playwright test  # run all Playwright tests in another
```

All Phase 0 and Phase 1 tests save screenshots with the prefix `assets-`.

---

## Phase 0 — Infrastructure & Tree GLBs

| File | Test # | Description |
|------|--------|-------------|
| `assets-01-before.png` | 1 (GLB serving) | Dev-server response headers for tree GLB |
| `assets-03a-before.png` | 3 | Procedural cone trees before upgrade |
| `assets-03b-after.png` | 3 | Kenney GLB trees after `upgradeTreesWithAssets()` |
| `assets-05a-before.png` | 5 | Player visible before upgrade |
| `assets-05b-after.png` | 5 | Player still visible after upgrade |

---

## Phase 1 — Terrain Decoration

### 7. Rock upgrade
| File | Description |
|------|-------------|
| `assets-phase1-07-before.png` | Exterior before upgrade |
| `assets-phase1-07a-rock-area.png` | Player teleported to rock zone (x=42) |
| `assets-phase1-07b-rocks-glb.png` | Kenney GLB rocks after `upgradeRocksWithAssets()` |

### 8. Ground clutter (grass, flowers, mushrooms)
| File | Description |
|------|-------------|
| `assets-phase1-08-exterior.png` | Exterior view |
| `assets-phase1-08-clutter.png` | Grass / flowers scattered via `addGroundClutter()` |

### 9. River tiles
| File | Description |
|------|-------------|
| `assets-phase1-09-before.png` | Before: semi-transparent water mesh |
| `assets-phase1-09a-water-procedural.png` | Procedural water |
| `assets-phase1-09b-river-tiles.png` | After: `replaceWaterWithRiverTiles()` — auto-tiled GLBs |

### 10. Tower upgrade
| File | Description |
|------|-------------|
| `assets-phase1-10-exterior.png` | Default exterior view |
| `assets-phase1-10a-tower-before.png` | Procedural octagonal tower |
| `assets-phase1-10b-tower-glb.png` | Castle-kit tower modules after `upgradeTowerWithAssets()` |

### 11. Full world — all Phase 1 assets
| File | Description |
|------|-------------|
| `assets-phase1-11-world-before.png` | World before any upgrade |
| `assets-phase1-11-world-all-assets.png` | All Phase 1 assets active (rocks + clutter + river + tower) |

---

## Phase 2 — Settlement Decoration

Town-kit props scattered around settlements: lanterns at road corners, a fountain
at the settlement centre (towns / cities), market stalls and carts along roads,
hedges along the settlement perimeter, and coloured banners near market areas.

### 12. Settlement fountain and lanterns
| File | Description |
|------|-------------|
| `assets-phase2-12-settlement-before.png` | Settlement before prop decoration |
| `assets-phase2-12-settlement-near-before.png` | Close to settlement centre before load |
| `assets-phase2-12-settlement-props.png` | Fountain + lanterns visible at town centre |

### 13. Market stalls and carts
| File | Description |
|------|-------------|
| `assets-phase2-13-stalls-before.png` | Before stalls and carts loaded |
| `assets-phase2-13-stalls-after.png` | Stalls + carts scattered near road tiles |

### 14. Phase 1 + Phase 2 combined
| File | Description |
|------|-------------|
| `assets-phase2-14-combined-before.png` | Before any assets |
| `assets-phase2-14-combined-all.png` | All Phase 1 terrain + Phase 2 settlement props |

---

## Phase 3 — Dungeon Entrance Upgrade

Kenney dungeon-kit GLBs (`gate.glb`, `gate-door.glb`, `gate-metal-bars.glb`,
`corridor-end.glb`, `stairs.glb`) replace the procedural entrance meshes.
Physics trigger radius is unchanged — only the visual group children are swapped.

### 15. Dungeon entrance GLBs
| File | Description |
|------|-------------|
| `assets-phase3-15-dungeon-before.png` | Procedural entrance before upgrade |
| `assets-phase3-15-dungeon-after.png` | GLB entrance after upgrade |

### 16. Dungeon trigger proximity
| File | Description |
|------|-------------|
| `assets-phase3-16-trigger-before.png` | Before teleporting to dungeon entrance |
| `assets-phase3-16-trigger-near.png` | Player near upgraded entrance |

---

## Phase 4 — Polish & InstancedMesh  _(planned)_

InstancedMesh optimisation pass for clutter and river tiles, shadow-map quality
improvements and post-processing.

---

## Procedural Grass — Batch 1+2 (Grassland, Savanna, Forest, Taiga, Tundra)

Wind-animated 3D grass blades (bezier-curved instanced geometry, SSS/AO shading, distance
fade) render within a 24-WU player-centered radius on all 5 grass-bearing biomes, each with
its own preset (blade dimensions, color, density, wind response) tuned to that biome's
character — see `docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md`
(batch 1) and `docs/superpowers/specs/2026-08-31-procedural-grass-batch2-design.md` (batch 2).

---

## Ambient Wildlife — Phase 9 Batch 1 (Rabbits, Goats)

Peaceful, chunk-scoped ambient wildlife — rabbits (forest/grassland/taiga) and goats
(mountain) — wander near their spawn point and flee when the player approaches. No combat, no
health, purely cosmetic. Birds/flight are a planned follow-up batch — see
`docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md`. Creatures beyond 45 WU
of the player are frozen (no behavior tick, no animation) instead of fully simulated —
see `docs/superpowers/specs/2026-08-31-ambient-wildlife-lod-design.md` (Phase 9's
"chunk-manager LOD polish" stretch item).

---

## Overworld Editor — Paint Mode (Dev Tool)

The dev-only Overworld Editor (`\` to open, dev mode only) can now paint
trees and rocks by click-and-drag instead of single-click-only placement
— select "Paint: Trees" (`6`) or "Paint: Rocks" (`7`) and drag across the
ground. Not player-facing. See
`docs/superpowers/specs/2026-08-31-overworld-editor-paint-mode-design.md`.

---

## Trampled-Grass Trail

Walking through grass now visibly flattens it, leaving a soft trail that fades back to
upright over a few seconds (a decaying "trample" grid sampled by the grass shader — see
`docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md`). Player-only for now;
ambient wildlife/enemies don't yet leave trails. Also fixed grass being roughly 2x too
tall, and a real bug where wind sway silently used the same fixed values for all 5
biomes instead of each biome's own tuned preset.

A follow-up fix replaced the trample effect's GPU sampling technique after it caused a
severe FPS regression on real hardware (a vertex texture fetch — a well-known
performance trap, invisible in automated testing) — see
`docs/superpowers/specs/2026-09-01-trample-vtf-perf-fix.md`.

---

## Grass Biome-Boundary Blending

Grass now thins out gradually and shifts toward a shared warm dry-tint near biome
boundaries (e.g. grassland meeting savanna) instead of stopping in a hard wall with a
stark color jump — see
`docs/superpowers/specs/2026-09-01-grass-biome-boundary-blending-design.md`.

**v2 follow-up** (user feedback: the boundary was still too narrow/abrupt and the
shared-tan push didn't meaningfully soften a bright grassland vs. near-black forest
seam): `computeEdgeBlend()` now ray-marches out to a much wider `EDGE_BAND_WU` (8 WU,
up from 2.5) and identifies the SPECIFIC neighboring biome rather than just a 0..1
fraction. Grass blades near a boundary now blend toward that actual neighbor's own
averaged grass color instead of a generic tan, giving a true, continuous hue gradient
between whichever two biomes meet (e.g. grassland's green fading into forest's dark
green). Savanna was also made visibly sparser and shorter (`densityPerUnit2: 15→9`,
`height: 0.4→0.28`) so it reads as its own distinct dry-grass biome instead of looking
like a slightly-yellower grassland. See
`docs/superpowers/specs/2026-09-01-grass-boundary-blend-v2-design.md`.

---

## Nature/Terrain Polish Round (wildlife, roads)

Continuing feedback after grass boundary blending: ambient wildlife (rabbits, goats)
previously froze their height at spawn and visually clipped through/floated above
terrain as they wandered — fixed with a new `getTerrainHeightAt()` query, re-evaluated
every frame, matching the player's own continuous terrain-following.

Intercity/settlement roads previously looked flat and "like a drawn line" on straight
stretches (turns already looked good). Reused the ground biome sub-tile system's two
techniques directly: per-sub-tile-lattice-point height bump (`subTileBumpJitter()`,
same function ground tiles use) instead of a smoothly interpolated flat plane, and a
new per-sub-tile vertex-color brightness tint (`roadSubTileTint()`) for subtle
worn/dusty patch variety on top of each road's existing texture. See
`docs/superpowers/specs/2026-09-01-road-subtile-reuse-design.md`.

---

## Asset Pack Reference

All GLBs live in `public/assets/`:

| Pack | Folder | Count |
|------|--------|-------|
| Nature kit | `nature/` | 329 |
| Buildings kit | `buildings/` | 105 |
| Fantasy town kit | `town/` | 167 |
| Castle kit | `castle/` | 76 |
| Dungeon kit | `dungeon/` | 39 |

See [docs/assets_index.md](assets_index.md) for the full GLB inventory.
