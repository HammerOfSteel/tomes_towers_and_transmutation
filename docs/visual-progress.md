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

## Phase 2 — Buildings  _(planned)_

Building assembly with `retro-fantasy-kit` walls, roofs, floors and town-kit
decorations (lanterns, fountains, hedges).

---

## Phase 3 — Dungeon Interior  _(planned)_

Dungeon corridor and room GLBs from the dungeon kit replacing procedural blocks.

---

## Phase 4 — Polish & InstancedMesh  _(planned)_

InstancedMesh optimisation pass for clutter and river tiles, shadow-map quality
improvements and post-processing.

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
