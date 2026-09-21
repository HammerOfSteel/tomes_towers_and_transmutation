# Design: fix black cracks/holes at diagonal elevation jumps (sub-task 2.1)

**Phase**: Overworld/Outdoor Polish, Phase 2. **Sub-task**: 2.1 (crack fix
only — organic geometry softening is 2.2, textures are 2.3; see
`docs/superpowers/specs/2026-09-23-terrain-seam-and-organic-polish-research.md`
for the full research this design is based on).

## Problem

`TerrainTerracing.ts` only enforces the "no adjacent tiles differ by more
than 1 elevation level" invariant across **orthogonal** neighbors
(N/S/E/W). Two tiles that are only **diagonally** adjacent can still
differ by 2 levels after terracing converges (a valid, reachable fixed
point — see research doc §1.2 for a concrete worked example). Since a
tile corner is shared by up to 4 tiles including one diagonal pair,
`TerrainGeometryBuilder.ts`'s `_tileCornerLevels()` (which clamps each
tile's *own* view of a shared corner to `[selfElevation - 1,
selfElevation]`) computes **different world-Y values for the same
physical corner** depending on which of the 4 tiles is asked — a literal
vertical gap in both the visual mesh and the physics collider (they share
one buffer, per this file's own header comment).

## Fix

Extend `TerrainTerracing.ts`'s neighbor set from the current 4
(`NEIGHBOR_OFFSETS_4`) to 8 (add the 4 diagonal offsets: `[1,1], [1,-1],
[-1,1], [-1,-1]`), so the pass's own invariant — "no two tiles sharing a
corner ever differ by more than 1 level" — becomes actually true instead
of only true for the orthogonal subset of corner-sharing pairs. This
directly closes the gap: after this change, `_rawCornerElevation`'s true
(unclamped) value for any corner can never fall outside any contributing
tile's own `[self-1, self]` clamp window, so the clamp in
`_tileCornerLevels()` becomes a no-op everywhere and all tiles touching a
corner agree on its rendered height by construction.

No changes needed to `TerrainGeometryBuilder.ts`, `TerrainKit.ts`, or the
ramp classifier itself — the fix is entirely in the terracing pass's
neighbor coverage, consistent with that pass's own stated purpose (its
header comment already claims "no multi-level cliff drop can exist" after
it runs; this makes that claim true for diagonals too, not just
orthogonals).

**Renamed constant**: `NEIGHBOR_OFFSETS_4` → `NEIGHBOR_OFFSETS_8` (name
must reflect the actual neighbor count; used in exactly one place, so the
rename is a pure find/replace with no other call-site impact).

## Behavior change (expected, minor)

A tile that is >1 level below a *diagonal* neighbor but was previously
within 1 level of every *orthogonal* neighbor will now also get raised.
This is a strict subset of "was already going to get raised by the
existing pass for some other reason in the general staircase case" for
most real terrain, and only fires for the specific 2×2-diagonal-jump
pattern — expect a small number of additional tiles raised by 1 level
near steep terrain, i.e. very slightly gentler diagonal slopes overall.
This is the intended fix, not a bug: any diagonal step steep enough to
need raising is exactly the case producing the black-crack holes today.

## Testing

- **Unit** (`tests/world/TerrainTerracing.test.ts`): a new case
  reproducing the exact 2×2 diagonal-jump scenario from the research doc
  (`A=E+2, B=C=E+1, D=E`), asserting `A` gets raised to `D+1` (closing the
  diagonal gap) in addition to the existing orthogonal-chain cases (kept
  unchanged — this is a superset, not a behavior change for those cases).
- **Regression** (`tests/world/TerrainGeometryBuilder.test.ts`): a new
  property-style test building several seeded/randomized grids, running
  `terraceElevation()` then `buildTerrainGeometryData()`, and asserting
  that for every grid corner shared by 2+ tiles, every contributing tile's
  independently-computed clamped corner elevation (via the same
  `_tileCornerLevels()` logic, or equivalently, every rendered vertex at
  that world (x, y-candidates, z) position) agrees — i.e. no two tiles
  ever disagree on a shared corner's height. This is the direct
  regression test for the bug itself, independent of any specific
  worked example.
- **Full suite** re-run (`TerrainTerracing.test.ts`,
  `TerrainGeometryBuilder.test.ts`, `RealmToWorldGrid` chain) to confirm
  no regression in existing terracing/elevation behavior.
- **Human playtest gate**: user regenerates a world (any seed/shape) and
  confirms no black wedge/crack gaps are visible near mountains/towers/
  slopes, and walking near a slope no longer falls through the floor.

## Out of scope (deferred to 2.2/2.3)

- Rounding/chamfering hard slope edges into organic curves (2.2).
- Any texture change (2.3).
- The separate `_cornerTouchesUnpulledTile` interaction flagged as
  "worth a spot-check" in the research doc — will be covered by the
  regression test above (if it were a live second bug, the property test
  would also catch it as a corner disagreement); no separate design
  needed unless that test surfaces something.
