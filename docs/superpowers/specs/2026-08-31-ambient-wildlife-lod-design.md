# Ambient Wildlife Distance LOD — Design Spec

Status: approved autonomously (user unavailable at design time; explicit
standing authorization to proceed with documented rationale — see
`docs/superpowers/plans/2026-08-31-ambient-wildlife.md`'s own precedent).
Scoped as the "chunk-manager LOD polish" item from Phase 9's three-part
stretch list (ambient creature spawns ✅ shipped, world editor paint mode
— not yet started, chunk-manager LOD polish — this document).

## 1. Problem

Phase 9's roadmap line item asks for chunk-manager-adjacent level-of-detail
polish. Auditing what's already in place:

- `ChunkManager.ts` (RI-4) already implements real chunk-level LOD in the
  coarse sense that matters most: a load radius, a separate (larger)
  unload radius for load/unload hysteresis, and a `maxLoadsPerUpdate`
  budget so a chunk-boundary crossing can't hitch the frame. This was
  confirmed already-shipped earlier in this session.
- Terrain and scatter (tree/rock/bush) meshes are already static-batched
  per chunk (`_mergeGroupMeshesByMaterial()`), keeping draw calls an order
  of magnitude below the unbatched per-primitive count
  (`OverworldScene.drawcall-batching.test.ts`'s asserted `<8000` mesh
  budget). There's no per-frame CPU cost here — it's static geometry.
- Grass (`GrassField.ts`) already self-limits to a small (~24 WU) radius
  around the player with its own distance fade, independent of chunk
  streaming.

The one piece of chunk-streamed content that DOES pay a real, unconditional
per-frame cost regardless of camera distance is the ambient wildlife system
just shipped this session (`AmbientWildlife.ts` / `OverworldScene.ts`'s
`_activeAmbientCreatures`): every currently-loaded creature (up to
`MAX_ACTIVE_AMBIENT_CREATURES = 24`) runs its full idle/wander/flee FSM
tick AND skeletal animation (`animateCreature()`, which walks/updates bone
transforms) every single frame — even when it's on the far side of a
loaded chunk, well outside the camera's actual view. This is real,
measurable, avoidable work with zero gameplay-correctness stakes (ambient
creatures are purely cosmetic — freezing one 60 WU away is imperceptible).

Terrain/scatter geometry LOD (swapping in lower-poly meshes or billboards
at distance — the literal "3 detail levels" line from the old
`RealmToTerrain.ts`-era roadmap note) is explicitly OUT of scope here: it
was written for the abandoned `RealmToTerrain`/`RealmRiverMesh` pipeline,
there's no live measured perf problem motivating it on the live pipeline
today, and building alternate lower-poly terrain generation is a
substantially larger, separate project that shouldn't be speculatively
built without evidence it's needed.

## 2. Goal

Skip the expensive parts of `AmbientCreature.update()` (behavior-FSM tick +
skeletal animation) for any creature farther than a fixed distance from the
player, instead of running the full simulation for all 24 possible
creatures every frame regardless of visibility. Far creatures simply hold
their current position/pose — no visible discontinuity, since by
definition they're not being watched at that distance.

## 3. Approach

Add one pure, tiny, fully unit-testable LOD-tier function alongside the
existing behavior FSM in `AmbientWildlife.ts`:

```ts
export type AmbientLODTier = 'near' | 'far';
export const LOD_FAR_DISTANCE_WU = 45; // world units

export function computeAmbientLOD(distanceToPlayer: number): AmbientLODTier {
  return distanceToPlayer > LOD_FAR_DISTANCE_WU ? 'far' : 'near';
}
```

`45 WU` is chosen with the same reasoning as `GrassField`'s own `~24 WU`
fade radius (this game's fixed isometric camera, `ISO_OFFSET = (14, 20,
14)`, keeps the visible ground radius fairly tight) plus real margin so a
creature never visibly freezes mid-frame inside the player's actual view —
it's comfortably past where a creature would be legible on screen at all.

Wire it into `AmbientCreature.update()`: compute `distanceToPlayer` (already
computed inside `tickAmbientBehavior` via `playerDist`, but needed one step
earlier here to decide whether to call the tick at all), and when the tier
is `'far'`, return immediately after that cheap distance check — skipping
`tickAmbientBehavior()` (avoids the trig/allocation in flee-direction
math) and `animateCreature()` (avoids the bone-transform walk) entirely.
Position/rotation and `_behavior` state are left untouched, so a creature
that walks back into range resumes exactly where it left off (no
teleport, no state loss) — this is a pure early-return, not a separate
code path that could drift from the near-tier behavior.

No `ChunkManager.ts` changes — deliberately kept out. `ChunkManager` is
already a solid, narrowly-scoped, heavily-tested pure module; adding an
LOD-tier query there for a single consumer (ambient wildlife) would widen
its public surface for no real reuse benefit yet. If a second consumer
(e.g. future NPC/enemy LOD) shows up later, that's the point to reconsider
moving the tier concept into `ChunkManager` itself.

**Edge case, reviewed and accepted:** `FLEE_EXIT_RADIUS = 9` is far smaller
than `LOD_FAR_DISTANCE_WU = 45`, so under normal player movement a fleeing
creature always exits `'flee'` back to `'idle'` (via the existing
hysteresis in `tickAmbientBehavior`) long before the player gets far enough
away to freeze it. A creature could only get frozen mid-flee via an
artificial instant teleport (e.g. a debug/test `teleportPlayer` jump) that
skips over the 9–45 WU band in one step; if that happens, the creature
simply resumes fleeing (still correct, just stale) once the player is
back in range. Accepted as a harmless, debug-only edge case — not worth
extra machinery to special-case.

## 4. Testing

- Unit tests for `computeAmbientLOD()`: exact boundary (`=45` is `'near'`,
  `>45` is `'far'`), well inside/outside both tiers.
- Extend `AmbientCreature` tests: a creature given a player position >45 WU
  away across many `update()` calls does not move and does not throw;
  a creature that starts far and then has the player move close resumes
  normal wander/flee behavior with no teleport (position picks up from
  wherever it was frozen, not from spawn).
- Re-run the existing `OverworldScene` regression suite (Task 5's targeted
  files) to confirm no behavior change for near-tier creatures.

## 5. Non-goals (explicitly deferred)

- Terrain/scatter mesh geometry LOD (full/medium/billboard tiers) — no
  live measured perf problem; would need new lower-poly generation, a
  separate, much larger project.
- NPC/enemy update LOD — different risk profile (gameplay-affecting, not
  purely cosmetic); out of scope for this pass.
- Any `ChunkManager.ts` public API changes.
