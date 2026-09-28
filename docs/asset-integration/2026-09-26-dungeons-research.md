# Sub-task 3 Research — Dungeons (non-tower) real-asset swap

Sub-task order per `2026-09-23-wiring-design-spec.md` §7: (1) Monsters+
Animals — done. (2) Settlement buildings + interiors — done. **(3) Dungeons
(non-tower) — this doc.** (4) Towers. (5) Nature props.

High-level scope for this sub-task was already decided by the user during
the initiative's original spec pass (§4.3): dungeons get the deepest swap
of any category — walls, floors, doors, stairs, and arches all come from
`modular_dungeons/obj_kit` instead of procedural `BoxGeometry`/
`CylinderGeometry`/`PlaneGeometry`. `Blueprint`'s data model needs no
changes; only `BlueprintRenderer.ts`'s interpretation of it changes. This
doc does NOT re-litigate that call — it measures the actual kit geometry
against the existing grid to find where a naive 1:1 swap works and where
it doesn't, learning directly from the settlement-building scale mistake
(where whole-building height was calibrated but door-aperture proportion
was never separately checked before shipping).

## 1. What `modular_dungeons/obj_kit` actually contains (92 pieces)

Catalogued via `grep` on `src/assets/quaterniusManifest.ts`. Grouped by
function:

- **Walls**: `Wall`, `Wall_Half`, `Wall_Broken`, `Wall_Hole`,
  `Wall_Double_Broken`, `Wall_Double_Hole`, `Wall_Overgrown` (+ broken/hole
  variants), `Wall_ArchGothic`, `Wall_ArchRound` (+ variants).
- **Arches** (freestanding, not wall-embedded): `Arch_Gothic`,
  `Arch_Round`, plus `_RoundColumn` variants.
- **Doors**: `Doors_GothicArch`, `Doors_RoundArch`, and `_Covered`
  variants of each.
- **Floors**: `Floor_Standard`, `Floor_Standard_Half`, `Floor_SquareLarge`,
  `Floor_Squares`, `Floor_Diamond`, `Floor_Hole_Corner`,
  `Floor_Hole_Straight`, `Floor_Tree`.
- **Columns/supports**: `Column_Round`, `Column_Round_Short`,
  `Column_Square`, `Column_BridgeSupport`, `Support_Center`,
  `Support_Left`, `Support_Right`, `Support_Tall`.
- **Stairs**: `Stairs`, `Stairs_2`, `Trapdoor`.
- **Windows**: `Window_Bars` (+ variants), `Window_Open` (+ double).
- **Furniture/decor** (feeds the existing `PropPlacer.decorateRoom()`
  resolver — shared with §4.2, not duplicated): `Bookcase`, `Chest`,
  `Barrel`, `Crate`, `Torch`, `Candles`, `Pot1`–`Pot3` (+ broken),
  `Statue_Fox`, `Statue_Stag`, `Skull`, `BearTrap`, `Flag_*`.
- **Nature-dressing pieces** (overgrown look inside ruined sections):
  `Bush_*`, `Tree_1`–`3`, `DeadTree_1`–`3`, `Grass`, `Brick`/`Bricks`.
- **Ambiguous-purpose pieces**: `Rail_*`, `Curve_1`/`Curve_2` (+
  `Overgrown` variants), `BridgeSection`, `Cart` — likely for elevated/
  non-orthogonal layouts (bridges over pits, curved corridors) that the
  current `Blueprint` grid model doesn't represent. **Recommendation:
  exclude from Sub-task 3's initial scope** — no `TileEntry`/`DoorEntry`
  concept maps onto them today. Revisit only if a future blueprint adds a
  "bridge/chasm" tile type.
- **Outlier**: `Character_Animated` — not a dungeon-kit piece, ignore.

## 2. Measured native dimensions (this session, live in-browser)

Measured via `loadQuatAsset()` + `THREE.Box3.setFromObject()` in an
isolated Playwright/dev-server pass (port 5202, killed after use), the
exact technique proven during the settlement-building scale investigation.
All values in metres, `(width, height, depth)`:

| Piece | Size (x, y, z) | Notes |
|---|---|---|
| `Wall` | 2.00, 2.00, 0.29 | pivot at bottom-center (y: 0 → 2.0) |
| `Wall_Half` | 1.00, 2.00, 0.29 | half-width wall |
| `Wall_Hole` | 2.00, 2.00, 0.29 | same footprint as `Wall`, has a window-hole cut |
| `Wall_Double_Hole` | 1.99, 1.98, 0.57 | thicker, double-wall variant |
| `Wall_ArchGothic` | 4.00, 3.99, 0.29 | **2 cells wide × 2 storeys tall** (see §3) |
| `Wall_ArchRound` | 4.00, 3.99, 0.31 | same |
| `Window_Open` / `Window_Bars` | 1.99, 1.99, 0.30 | single-cell wall-height window insert |
| `Floor_Standard` | 1.99, 0.29 (thickness), 1.98 | exact 2×2 footprint |
| `Floor_Standard_Half` | 2.00, 0.12, 2.00 | thinner variant, same footprint |
| `Floor_SquareLarge` | 1.98, 0.11, 1.98 | same footprint, different surface pattern |
| `Floor_Squares` | 1.99, 0.12, 2.00 | same footprint, different surface pattern |
| `Arch_Gothic` | 3.09, 3.76, 0.49 | freestanding, spans ~1.5 cells |
| `Arch_Round` | 3.09, 3.53, 0.49 | freestanding, spans ~1.5 cells |
| `Doors_GothicArch` | 2.31, 3.21, 0.27 | wider than 1 cell (see §3) |
| `Doors_RoundArch` | 2.31, 2.97, 0.27 | same |
| `Stairs` | 2.02, 0.92, 2.15 | 2×2 footprint, low single-flight rise |
| `Stairs_2` | 2.15, 1.78, 2.02 | 2×2 footprint, taller flight (~2× `Stairs`) |
| `Column_Round` / `Column_Square` | 0.66 dia, 3.99, 0.66 dia | ~4m tall |
| `Support_Center` | 3.00, 4.11, 0.67 | spans 1.5 cells, ~4m tall |
| `Trapdoor` | 1.74, 0.22, 1.57 | floor-level, sub-2m footprint |

## 3. Grid-fit conclusions

**Horizontal (X/Z) fit is excellent — no scale correction needed.**
Every wall, window, and floor piece measures almost exactly 2.0m on its
horizontal axis/axes, matching `cellSize: 2` (used by every shipped
blueprint) essentially natively (±1.5% modelling tolerance — same
tolerance category as the buildings' native-scale measurements, i.e.
negligible, not the kind of order-of-magnitude mismatch the settlement
buildings had). This is the opposite finding to Sub-task 2: this kit was
built by the artist to a real grid module and needs no blanket "fudge
factor" multiplier on X/Z.

**Vertical fit needs a per-room scale factor, not a fixed one.** Native
wall height is 2.0m (one storey). Shipped blueprints use `wallHeight: 3`
(`cell_start`, `corridor_ns`, `corridor_ew`, `library_small`) or
`wallHeight: 4` (`library_large`). `Column_Round`/`Column_Square` measure
3.99m tall — i.e. the kit's columns are natively built for a 4m storey,
matching `library_large` almost exactly with zero scale, while the more
common `wallHeight: 3` rooms need walls/columns scaled by **3 / 2.0 =
1.5×** on Y only (X/Z stay at their already-correct native 1.0× scale).
This is a **derived, per-room, per-axis scale factor
(`wallHeight / 2.0` on Y, `cellSize / 2.0` on X/Z — the latter currently
always ≈1.0 since every blueprint uses `cellSize: 2`)**, not a single
hand-tuned constant like the building `DOOR_SCALE_CORRECTION`. This
avoids repeating the building mistake: here the correction is a
mathematically-justified ratio derived directly from the Blueprint's own
declared numbers, not a guess reverse-engineered from a screenshot.

**`Wall_ArchGothic`/`Wall_ArchRound` are 2×2 storey combo pieces** (4m
wide × ~4m tall) — these read as a "wall segment with a built-in arched
doorway", spanning what in `Blueprint` terms would be a 2-wide gap in a
`wallHeight: 4` room. Useful for `library_large` specifically; not
directly usable for `wallHeight: 3` rooms without the same 0.75× Y-scale
correction working in reverse (3/4 = 0.75×) — flagged as a lower priority
than the primary `Wall`/`Floor`/door pieces for this sub-task's first
pass.

**Doors are wider than one cell and read as inserts, not wall
replacements.** `Doors_GothicArch`/`Doors_RoundArch` measure 2.31m wide
— noticeably wider than the 2.0m `Wall` footprint they'd sit next to.
These pieces are best understood as **freestanding archway objects
placed centred on a `DoorEntry` cell, in front of/straddling the opening
left by skipping that cell's wall**, exactly mirroring the current
procedural door-frame code's approach (`postA`/`postB`/`lintelMesh`
straddling the gap) — not a like-for-like replacement of the `Wall`
piece's box footprint. No rescale needed; place at native scale, centred
on the door cell's world position, oriented via the existing
`isNS`-style facing logic.

**Floors are NOT currently tiled per-cell — this is a bigger implementation
than "swap the box".** `renderBlueprint()` today builds ONE large
`PlaneGeometry(width * cellSize, depth * cellSize)` for the whole room
footprint (`BlueprintRenderer.ts` ~line 236), not per-`TileEntry` (floor
cells are implicit — "all unlisted cells" per `blueprint.ts`'s doc
comment — there's no `FloorTileEntry` array to iterate). Swapping in
`Floor_Standard` requires the renderer to newly iterate every non-wall,
non-pillar cell in the `width × depth` bounding box and place one 2×2m
floor piece per cell — a real (small but non-trivial) new loop, not
reusing an existing per-tile loop. This must be sized into the
implementation plan's effort estimate, not assumed to be a drop-in swap.

**Stairs need 2–4 stacked pieces per staircase, not a 1:1 swap.** The
current procedural staircase (`buildStaircase()`) builds a continuous
7-step ramp spanning the full `wallHeight` (3–4m) in one shot. The kit's
`Stairs`/`Stairs_2` pieces only rise 0.92m/1.78m each — reaching a
`wallHeight: 3` room requires roughly 2× `Stairs_2` (or a mix), and a
`wallHeight: 4` room needs proportionally more. This means the real-asset
staircase resolver must **stack N pieces vertically and along the
approach axis** to span the same rise as the procedural version, with N
computed from `wallHeight`, not fixed — another piece of genuine new
logic, not a geometry swap.

## 4. No repeat of the settlement-building mistake — how this sub-task avoids it

The core failure mode from Sub-task 2 was: whole-object height was
calibrated and looked "roughly right" in isolation, but a *sub-feature*
(door aperture) was never separately measured before shipping, and the
eventual fix was an unverified, hand-guessed blanket multiplier. This
sub-task's research phase deliberately measured every piece category
(not just walls) up front, and the vertical-scale correction derived here
(`wallHeight / 2.0`) is arithmetic on values already declared in the
Blueprint data, not a guess — there is nothing left to "reverse-engineer
from a screenshot" for the wall/floor/column height axis. The remaining
genuinely open items (stair-piece stacking count, door-piece exact
placement offset) are flagged explicitly below as implementation-plan
line items requiring their own live Playwright verification pass before
being called done, not assumed correct on paper.

## 5. Open items to carry into the design/plan step

1. Corner/T-junction wall pieces: the kit's catalogue (per §1) has no
   distinct "corner wall" piece separate from `Wall`/`Wall_Half` — unlike
   some modular kits. Current procedural corner handling
   (`findWallCornerPilasterPoints()` + a pilaster cylinder at true inner
   corners) has no obvious real-asset equivalent piece to swap in.
   **Recommendation**: keep the existing procedural pilaster-cylinder
   logic as-is for corners (it already looks intentional — a rounded
   corner accent, not a raw box mitre) and only swap the straight-run
   `Wall` tiles + `Floor_*` cells + doors/stairs/arches to real assets in
   this sub-task's first pass. Revisit corner pieces only if the result
   looks wrong in practice.
2. Wall-top decorations (`BlueprintRenderer.ts`'s large per-floor-theme
   decor block, ~lines 355–590) reference `wallHeight`-relative positions
   assuming a flat-topped box wall. Real `Wall` pieces are visually
   different (may have their own cap/moulding) — decide whether wall-top
   decor keeps rendering as-is on top of real walls (likely fine, same Y
   position) or needs adjustment once seen live.
3. `PropPlacer.decorateRoom()` already resolves furniture/decor/lighting
   from real assets for building interiors (§4.2) — confirm the same
   resolver can be pointed at this kit's `Bookcase`/`Chest`/`Barrel`/
   `Torch`/etc. pieces with no changes to its interface, only its asset
   list.
4. Confirm whether `Wall_Broken`/`Wall_Hole`/`Wall_Overgrown` variants
   should be used for visual variety (matching the existing procedural
   per-floor-theme decoration variety) or excluded from the first pass
   for simplicity — leaning toward: **use only `Wall`/`Wall_Half` for the
   first implementation pass**, defer variety pieces to a follow-up once
   the base swap is verified correct, consistent with "get the base
   pattern right before adding variety" (the same order used for
   buildings).
