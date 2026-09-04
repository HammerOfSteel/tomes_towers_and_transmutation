# Task 8 Report: Facade split grammar

## What I implemented
- Added `src/world/buildings/kit/FacadeGrammar.ts`, a pure TypeScript layout module that outputs bay placement data only.
- Added `tests/world/buildings/kit/FacadeGrammar.test.ts` using TDD.
- Implemented deterministic facade layout for `fixed`, `repeat`, and `float` segment kinds.
- Implemented seeded weighted repeat-candidate selection using `mulberry32`.
- Implemented exactly one deterministic `special` repeat bay per facade when any repeat bays exist.
- Implemented explicit overflow handling when `fixed + minimum repeats` exceed the facade width.
- Added a tolerance fix after review so large facades with many small repeat bays do not fail due to accumulated floating-point drift.

## API design
```ts
type WeightedModuleCandidate = { id: string; weight?: number };

type SegmentSpec =
  | { kind: 'fixed'; id: string; width: number }
  | { kind: 'repeat'; width: number; min?: number; max?: number; id?: string; weight?: number; candidates?: readonly WeightedModuleCandidate[] }
  | { kind: 'float'; id?: string };

interface FacadeBay {
  id: string;
  kind: 'fixed' | 'repeat' | 'float';
  x: number;
  width: number;
  special?: boolean;
}

interface BayLayout {
  totalWidth: number;
  bays: FacadeBay[];
}

function layoutFacade(totalWidth: number, spec: readonly SegmentSpec[], seed: number): BayLayout;
```

## Behavioral choices
- **Minimum repeats:** default `min = 0`. Repeat groups are optional unless explicitly constrained.
- **Overflow handling:** throw `RangeError` when `sum(fixed widths) + sum(repeat min widths)` exceeds `totalWidth`. This keeps impossible grammars explicit instead of silently dropping required bays.
- **Repeat allocation:** greedy left-to-right. Each repeat segment takes as many whole modules as fit while preserving downstream minimum widths.
- **Special bay semantics:** exactly one placed `repeat` bay is flagged with `special: true` per facade if at least one repeat bay exists. The bay remains width-stable; the consumer can render it differently.
- **Float handling:** all leftover width is assigned to float segment(s), split evenly across multiple floats, with the last float absorbing rounding residue.

## TDD evidence
### RED
Command:
```bash
npx vitest run tests/world/buildings/kit/FacadeGrammar.test.ts
```
Output:
```text
FAIL  tests/world/buildings/kit/FacadeGrammar.test.ts
Error: Failed to resolve import "../../../../src/world/buildings/kit/FacadeGrammar"
```
Reason: the module did not exist yet.

### GREEN
Command:
```bash
npx vitest run tests/world/buildings/kit/FacadeGrammar.test.ts
```
Output:
```text
✓ tests/world/buildings/kit/FacadeGrammar.test.ts (6 tests)
Test Files  1 passed (1)
Tests  6 passed (6)
```

## Files changed
- `src/world/buildings/kit/FacadeGrammar.ts`
- `tests/world/buildings/kit/FacadeGrammar.test.ts`
- `.superpowers/sdd/task-8-report.md`

## Self-review findings
- Complete for requested scope: fixed/repeat/float segments, exact-fill layout, deterministic seeding, weighted selection, special-bay marking, overflow error, and no three.js dependency.
- Tests prove the same spec fills both `7.3` and `9.1` exactly while preserving fixed module widths.
- Tests prove repeat widths remain fixed, filler absorbs leftovers, higher weights win more often statistically, and one special repeat bay is emitted.
- Added a regression test for large-width floating-point drift after code review identified the absolute-tolerance bug.

## Concerns
- Repeat allocation across multiple distinct repeat segments is intentionally greedy and left-to-right, not fairness-based. That matches the current implementation contract, but a future consuming system may want a richer policy if multiple repeat groups need balanced sharing.
