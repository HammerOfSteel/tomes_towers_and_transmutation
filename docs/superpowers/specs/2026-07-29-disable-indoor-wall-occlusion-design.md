# Disable Indoor Wall Occlusion (Dollhouse + Legacy Wall Hider)

## Problem

The indoor dollhouse-cutaway system (`DollhouseCutaway.ts`) and the legacy
dynamic wall occlusion system (`WallOcclusionManager.ts`) both run indoors at
the same time. This causes:

- Walls/pillars flickering or hiding unexpectedly while walking near them.
- Pillars in the "hidden" wall region still rendering (leaking through).
- No reliable visual distinction between "wall is hidden so you can see
  through it" and "wall is blocking your path" — makes navigating doorways
  vs. solid walls confusing.

Root cause: two independent hiding systems (one static/precomputed at
room-build time, one dynamic/per-frame) were left running concurrently after
the dollhouse feature shipped without the older system being retired.

## Decision

Remove both systems' call sites so indoor rooms always render all walls,
pillars, and doorframes with no hiding of any kind. This trades "can't see
inside a room from certain camera angles" for "fully predictable, glitch-free
rendering." The camera-rotation feature (tracked separately, see
`2026-07-29-camera-modes-design.md` or equivalent follow-up spec) is the
intended real fix for indoor visibility — letting the player rotate the view
instead of hiding geometry.

`DollhouseCutaway.ts`, `WallOcclusionManager.ts`, and their test suites are
**not deleted** — they stay in the repo, unused, in case they're revisited
later. Only the call sites that invoke them are removed.

Out of scope: outdoor `OcclusionManager.ts` (tree/rock/building fade-out) is
untouched — it is a different, already-working system.

## Changes

1. **`src/main.ts`**
   - Remove `import { WallOcclusionManager } from '@/rendering/WallOcclusionManager'`.
   - Remove `const _wallOccMgr = new WallOcclusionManager();` (line ~186).
   - Remove the per-frame `.update()` call and any `.reset()` call on room
     change tied to this instance.

2. **`src/building-viewer.ts`**
   - Remove the same `WallOcclusionManager` import, instantiation
     (`wallOccMgr`, line ~136), and any update/reset call sites in this
     standalone preview tool.

3. **`src/levels/BlueprintRenderer.ts`**
   - Remove `import { applyDollhouseCut } from '@/rendering/DollhouseCutaway'`.
   - Remove the `applyDollhouseCut(mesh, roomCenterXZ);` call (line ~663).

4. **`src/world/buildings/InteriorGenerator.ts`**
   - Remove `import { applyDollhouseCut } from '@/rendering/DollhouseCutaway'`.
   - Remove the `applyDollhouseCut(mesh, roomCenterXZ);` call (line ~545).
   - **Ceiling removal in this file is unrelated and stays as-is** — it's a
     structural simplification for the isometric view, not part of the
     wall-hiding complaint.

5. Leave `userData.isWall` / `userData.dollhouseCut` tagging on mesh objects
   in place where harmless (unused metadata) rather than chasing down every
   tag-setting call — only the *behavior* (hiding) needs to stop.

## Verification

- Existing unit test suites for `DollhouseCutaway.ts` and
  `WallOcclusionManager.ts` continue to pass unchanged (call-site removal
  only, no internal module changes).
- Manual/e2e check: walk into a building interior — all four walls, pillars,
  and doorframes render fully at all times; no flicker; no console logs from
  either system (since neither is instantiated anymore).
- Lint/build passes with no unused-import errors after call sites are
  removed.
