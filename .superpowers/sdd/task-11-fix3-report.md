# Task 11 Fix 3 Report — Tracery spoke/ring contact proof

## Scope
- Rewrote the rose-window contact proof in `tests/world/buildings/kit/Tracery.test.ts`.
- Kept production geometry in `src/world/buildings/kit/Tracery.ts` unchanged.
- Preserved the legacy arc-vs-chord comparison as supporting context, but moved the main connectivity claim onto a real cross-shape check.

## What the new test checks
The new headline test is:

- `proves rose spoke flare edges meet both neighboring ring segments while the spoke center stays in the intentional gap`

It uses the real production helpers already exposed through `__traceryTestUtils`:
- `createRoseWindowLayout()`
- `buildRoseSpokeConnectorShape()`
- `buildRoseRingSegmentShape()`
- `polarPoint()`

For three production layouts:
- `lobes=6, ringCount=1`
- `lobes=8, ringCount=2`
- `lobes=12, ringCount=2`

The test samples one spoke (`slotIndex = 0`) and, for each ring belt:
1. Computes the spoke center angle and flare-edge angles.
2. Verifies the **same shared-boundary point** at `sharedRadius` lies on both the spoke connector boundary and the corresponding neighboring ring segment boundary at each flare edge.
3. Samples just **inside the spoke** at `sharedRadius - 5% beltThickness` to confirm spoke material exists immediately inside both shared boundary points.
4. Samples just **inside the neighboring ring band** at `sharedRadius + 5% bandThickness` to confirm each flare edge lands inside the correct adjacent ring segment immediately outside those same boundary points.
5. Samples the **same outer radius at the spoke center angle** and asserts that point is **not** inside either neighboring ring segment.

That negative/control check is intentional: the spoke center sits in the gap between ring segments by design, so only the flare edges are supposed to touch ring material.

## Point-in-polygon method
The test implements an explicit even-odd ray-casting check against `shape.getPoints(N)` output.

### Outer contour
- Convert the `THREE.Shape` contour to a polygon with `shape.getPoints(2048)`.
- Before ray casting, treat boundary points as inside by measuring point-to-segment distance for every polygon edge and accepting any distance `<= 1e-6`.
- Otherwise cast a horizontal ray and toggle `inside` on every scanline crossing:
  - edge crosses if `(y1 > py) !== (y2 > py)`
  - crossing x is `((x2 - x1) * (py - y1)) / (y2 - y1) + x1`
  - toggle when `px < crossingX`

### Holes
- Each hole path is also sampled with `hole.getPoints(2048)`.
- A point is inside the full shape only if it is inside the outer contour and **not** inside any hole polygon.

This is a plain test-local implementation; it does not rely on hidden three.js internals.

## Sample numeric results
Representative samples from the final geometry:

| Layout | Ring | Shared boundary radius | Spoke sample radius | Ring sample radius | Left edge angle | Right edge angle | Left/right shared boundary valid on both shapes | Left/right spoke inside | Left/right neighbor ring inside | Center-angle point inside neighbor ring |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| lobes=6, ringCount=1 | 0 | 0.638800 | 0.613860 | 0.656860 | -99.300° | -80.700° | true / true | true / true | true / true | false / false |
| lobes=8, ringCount=2 | 0 | 0.389400 | 0.376930 | 0.398430 | -96.975° | -83.025° | true / true | true / true | true / true | false / false |
| lobes=8, ringCount=2 | 1 | 0.819400 | 0.806930 | 0.828430 | -96.975° | -83.025° | true / true | true / true | true / true | false / false |
| lobes=12, ringCount=2 | 0 | 0.389400 | 0.376930 | 0.398430 | -94.650° | -85.350° | true / true | true / true | true / true | false / false |

Example called out explicitly:
- For `lobes=8, ringCount=2, ringIndex=0`, the shared boundary radius is `0.389400`. At `-96.975°`, that exact boundary point registered on both the spoke and the left neighboring ring boundary: `true` / `true`.
- At `-83.025°`, the exact shared boundary point likewise registered on both the spoke and the right neighboring ring boundary: `true` / `true`.
- Just outside that boundary, the flare-edge ring samples at radius `0.398430` were inside the left and right neighboring ring segments: `true` / `true`.
- The center-angle control sample at angle `-90°` and the same radius was inside either neighboring ring segment: `false` / `false`.

## Supporting legacy comparison retained
The separate legacy-context test remains:
- `keeps the arc-based spoke shared-radius profile tighter than the legacy straight-chord connector`

For `lobes=8, ringCount=2`, shared-radius outline distances were:
- arc-based spoke: `[0, 2.94e-9, 2.94e-9, 0, 2.94e-9, 2.94e-9, ~0]`
- legacy chord-based spoke: `[0, 0.0019241492, 0.0030801652, 0.0034657584, 0.0030801652, 0.0019241492, ~0]`

That comparison is now contextual only; the real connectivity proof is the cross-shape point-in-polygon test above.

## Verification
### Vitest
Command:
```bash
npx vitest run tests/world/buildings/kit/Tracery.test.ts
```
Result:
```text
✓ tests/world/buildings/kit/Tracery.test.ts (8 tests)
Tests 8 passed (8)
```

### TypeScript
Command:
```bash
npx tsc --noEmit 2>&1 | grep -i tracery
```
Result:
```text
(no output)
```
No new Tracery-related type errors were introduced.
