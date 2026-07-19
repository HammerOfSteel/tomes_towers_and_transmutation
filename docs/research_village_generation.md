# Procedural Settlement Generation — Research & Investigation Plan

> **Status:** RESEARCH PHASE — This document tracks what we need to investigate
> before deciding on implementation. Nothing in here is a final plan.
>
> **Goal:** Watabou-quality organic village/city/settlement generation that:
> - Integrates with the existing heightmap + river + biome terrain
> - Has a dedicated **"Overworld Studio"** page — a fun, creative tool for procedural
>   generation the same way Watabou's generators are fun to play with
>   (instant re-roll, live preview, sliders that feel good, results you want to screenshot)
> - Supports interactive editing: draw roads, warp, nudge districts, place landmarks
> - Feels alive with semantic coherence (chapel on hill, inn at crossroads, etc.)
>
> **Note on UX:** The reference to the princess atelier is about the *feeling*, not the code.
> Watabou's generators feel like toys you want to keep playing with — instant regeneration,
> every parameter gives immediate visible results, the output looks beautiful at every seed.
> That's the UX north star. The specific HTML/Three.js structure can be whatever works best.
>
> **References inspiring this:**
> - [watabou village-generator](https://watabou.github.io/village-generator/)
> - [watabou city-generator](https://watabou.github.io/city-generator/)
> - [watabou dwellings](https://watabou.github.io/dwellings/)
> - [watabou perilous-shores](https://watabou.github.io/perilous-shores/) (regional with terrain)
> - [redblobgames mapgen4](https://www.redblobgames.com/maps/mapgen4/) (interactive painting, TypeScript)
> - [watabou TownGeneratorOS](https://github.com/watabou/TownGeneratorOS) (open-source city algorithm)

---

## KEY FINDINGS SO FAR (2026-07-19)

> Updated after initial source study. These are now *answers*, not open questions.

**Architecture:** Follow Azgaar FMG's 4-layer pattern (State / Generator / Editor / Renderer).
This is the right separation and matches both TownGeneratorOS and mapgen4.

**Core algorithm:** Watabou's Voronoi approach (TownGeneratorOS) for towns and cities.
Village-scale (<15 buildings): roads-first approach (still needs research R1.3).

**Rendering:** Canvas 2D for overhead view (not THREE.js, not SVG for a game tool).
Two-canvas approach: bottom = map render, top = painting input layer.

**Libraries confirmed:**
- `delaunator` + `d3-delaunay` — the Voronoi foundation
- `fast-2d-poisson-disk-sampling` — better seed distribution
- `simplex-noise` (already in project) — warp/organic displacement

**Painting interaction (from mapgen4):** 128×128 Float32Array for terrain/warp brush.
Road drawing uses a different interaction: click → spline control points → Chaikin smooth.

**The #1 constraint:** Generation must feel instant (< 200ms ideally < 100ms).
This drives the decision to use a Web Worker for generation.

**The #1 open question:** Voronoi-for-towns vs roads-first-for-villages — confirm by R1.3.

**Azgaar FMG is the definitive reference** for architecture, not just inspiration.
It uses TypeScript + Vite + Vitest + Playwright — identical to our stack.

---

## PART 1 — Research TODOs

These are open questions that need investigation before any implementation decisions.

### R1 — Core Algorithm Questions

- [ ] **R1.1** Study mapgen4's `dual-mesh` data structure in detail.
  - What are the tradeoffs vs a plain Voronoi implementation?
  - Can it replace the tile-grid SettlementGenerator without breaking the physics layer?
  - Read: https://github.com/redblobgames/mapgen4/tree/main/dual-mesh

- [ ] **R1.2** Study watabou's TownGeneratorOS spiral seeding + Lloyd relaxation.
  - The formula `a = sa + sqrt(i)*5, r = 10 + i*(2+rand)` — what does varying the
    constants do visually? What are the sweet spots for a village vs a town vs a city?
  - Source: already read in `Model.hx` (see Part 2 below)

- [ ] **R1.3** How does watabou's village generator actually work?
  - It's not open-source, but Patreon posts describe it. Research:
    - "villages are made of roads, not buildings" — what exactly does that mean algorithmically?
    - How are the winding roads generated? L-system? Random walk? Agent-based?
    - Read his Patreon posts tagged "village generator":
      https://www.patreon.com/watawatabou?filters[tag]=village%20generator

- [ ] **R1.4** CityBound and UrbanFormGen — academic city generation.
  - Are there any TypeScript/JS implementations of Parish-Müller road networks?
  - Compare: Parish-Müller CGA vs Watabou's ward approach — which is simpler to implement?

- [x] **R1.5** ✅ How does mapgen4 handle the "paint terrain" interaction?
  - **Answer:** 128×128 Float32Array as elevation buffer. `paintAt()` fills a circle
    with lerped target elevation. Completely decoupled from rendering via `onUpdate()` callback.
  - The pipeline: pointer event → modify Float32Array → callback → Worker → regenerate → render
  - Shift held = slow mode. Apple Pencil pressure = scale radius.
  - **For TT&T:** Use this exact pattern for warp/terrain adjustment.
    For road drawing, use click-to-add-control-points → Catmull-Rom spline instead.

- [x] **R1.6** ✅ Lot subdivision within each ward.
  - Watabou's `Ward` base class: each ward type has a `createGeometry()` method
  - Ward subdivides its Voronoi polygon into building lots using perpendicular cuts from street edge
  - We already have `LotSubdivider` logic in `InteriorGenerator.ts` — the same principle applies
  - **For TT&T:** Port the perpendicular-cut approach from TownGeneratorOS Ward.hx

- [x] **R1.7** ✅ Road smoothing — right spline type.
  - Watabou: Chaikin corner-cutting (`smoothVertexEq(3)` = 3 passes)
  - mapgen4: Catmull-Rom for rivers (already available as `THREE.CatmullRomCurve3`)
  - Chaikin is simpler and sufficient for roads. Catmull-Rom is better for rivers.
  - **For TT&T:** Use Chaikin for roads (3 iterations), CatmullRom for rivers

### R2 — Library Evaluation

- [x] **R2.1** ✅ `delaunator` evaluation.
  - ISC license, 3KB, TypeScript types first-class, 4M+ weekly installs
  - `delaunay.update()` works for real-time Lloyd relaxation
  - **Decision: USE IT.** It's the standard for fast Delaunay in JS.

- [x] **R2.2** ✅ `d3-delaunay` evaluation.
  - ISC license, wraps delaunator, adds `voronoi.cellPolygon(i)`, `delaunay.find(x,y)`
  - Works in Web Workers (no DOM dependency)
  - **Decision: USE IT alongside delaunator.** The higher-level API is worth 5KB extra.

- [ ] **R2.3** mapgen4's `dual-mesh` library — investigate if it's extractable.
  - The dual-mesh tracks both Delaunay triangles AND Voronoi polygons in one flat typed array
  - This is used for both terrain AND road networks in mapgen4
  - Could this replace our tile-grid world structure entirely?
  - License: Apache-2.0 ✓
  - Read: https://github.com/redblobgames/mapgen4/tree/main/dual-mesh

- [ ] **R2.4** Polygon clipping libraries (needed for ward intersection with terrain bounds).
  - `polybool` (MIT), `polygon-clipping` (MIT), `martinez` (MIT)
  - Watabou implements his own `Polygon` + clip — too complex to port
  - Which NPM polygon-clipping library is most robust for concave polygons?

- [ ] **R2.5** `pathfinding.js` or similar for road routing through terrain.
  - The "road avoids steep slopes" feature needs a terrain-aware pathfinder
  - Options: A* on the tile grid (existing), or Dijkstra on the Voronoi edge graph
  - Can the existing `SpatialHash` in the codebase help here?

- [x] **R2.6** ✅ SVG vs Canvas 2D vs THREE.js for the 2D overhead editor view.
  - **Azgaar uses SVG** → crisp, scalable, interactive (CSS hover, click events on elements)
  - **mapgen4 uses WebGL** + Canvas 2D for painting input (two separate layers)
  - **Watabou uses OpenFL canvas** (essentially Canvas 2D)
  - **Decision: Canvas 2D for the overhead view** — simpler than SVG for a game tool,
    no DOM hierarchy to manage. Use a second canvas overlay for painting tools.
    THREE.js is NOT needed for the 2D overhead (overkill).

### R3 — UI/UX Pattern Research

- [x] **R3.1** ✅ What makes Watabou's tools feel like fun creative toys?
  - **Instant regeneration** — no loading spinner, no progress bar, the map appears in < 100ms
  - **Every parameter = visible change** — moving a slider redraws immediately
  - **Nothing is hidden** — the full set of controls is visible at once (not buried in menus)
  - **Output looks good at ANY seed** — no "bad seeds" that produce ugly results
  - **Keyboard-first** — 1-4 for sizes, Q/W/E/R for tools (muscle memory = speed)
  - **Always exportable** — PNG/SVG/JSON always accessible (you never lose what you made)
  - **Serendipity is rewarded** — one click of 🎲 gives you something unexpected and good
  - **Key implication:** The Overworld Studio must generate in < 200ms (ideally < 100ms)
    or the "toy" feeling dies. This is the hardest constraint and drives everything else.

- [ ] **R3.2** Study Watabou's UI interaction model.
  - Click = regenerate with new seed
  - Shift+click = lock/unlock specific features
  - Keyboard shortcuts for terrain type, wall toggle, etc.
  - Export as PNG, SVG, JSON
  - What makes his UI feel lightweight and fun vs heavy and daunting?
  - Read his keyboard shortcuts doc:
    https://watabou.itch.io/village-generator/devlog/426543/keyboard-shortcuts

- [ ] **R3.3** mapgen4's painting interaction — deeply understand it.
  - `painting.ts` implements brush painting that modifies terrain elevation in real-time
  - Key insight: painting writes to a buffer → worker thread → regenerate → render
  - The 3-thread pipeline (main → worker → render) is what makes it real-time
  - Can we use a similar pipeline for a settlement road-drawing tool?

- [ ] **R3.4** "Warp" and organic deformation tools — what are they exactly?
  - Watabou's city generator has a warp/deform slider
  - How is this typically implemented? Options:
    - Perlin noise displacement of seed points before Voronoi
    - Radial force fields pushing Voronoi cells
    - Direct spring-mesh relaxation with noise
  - Find a clear description of the right approach

- [ ] **R3.5** What does a "good" procedural map editor UI look like?
  - Study tools: Azgaar's Fantasy Map Generator (open source, JS)
    https://github.com/Azgaar/Fantasy-Map-Generator
  - Study: Inconvergent's map tools (https://inconvergent.net/)
  - Study: Redblob's interactive map demos (https://www.redblobgames.com/maps/)
  - What patterns are shared across all the good ones?

- [ ] **R3.6** "Named place" override system for the editor.
  - Watabou lets you name settlements and lock specific building placements
  - How would this work in TT&T? JSON blueprint → overrides procedural generation
  - Look at how fantasy map tools (Azgaar, Campaign Cartographer) handle named locations
  - The existing `resolveNamedNpc()` system is a precedent — extend this pattern

### R4 — Integration Questions

- [ ] **R4.1** How does settlement generation interact with the existing tile grid?
  - The current world grid is W×H tiles, T=2 WU each
  - A Voronoi settlement would work in world-space (WU), not tile-space
  - How do we convert Voronoi polygon positions to tile indices for road/building placement?
  - Do we need to? Or can buildings just use world-space coordinates?

- [ ] **R4.2** Physics/collision for Voronoi-placed buildings.
  - The current system uses tile-grid for physics collision detection
  - Voronoi placements would be at non-grid positions
  - Does Rapier3D handle arbitrary world-position static bodies fine?
  - Yes it does — this is probably fine. Verify with a quick test.

- [ ] **R4.3** River and ford integration.
  - The existing `WorldGen.ts` generates rivers + ford crossing points
  - A village generator needs to know: "where is the ford?" (= road route)
  - What data is currently exposed on `WorldData` about river paths?
  - Is the ford tile accessible from SettlementGenerator?

- [ ] **R4.4** NPC spawning in Voronoi settlements.
  - `NPCSpawner.spawnForSettlement()` currently uses `settlement.plan.buildings`
  - For a Voronoi settlement, what is the equivalent structure?
  - Can NPCs have "home ward" assignments (innkeeper stays in inn ward, etc.)?

- [ ] **R4.5** Performance budget.
  - Watabou's city generator runs in milliseconds (OpenFL/Haxe compiled to JS)
  - mapgen4 uses a Web Worker for map generation to avoid blocking the main thread
  - How long does current `SettlementGenerator` take? Measure it.
  - Budget target: < 50ms settlement generation, non-blocking via Worker
  - At what point do we need a Worker vs inline?

---

## PART 2 — What We Already Know (from source study)

### ✅ Complete Urban Layout Taxonomy (2026-07-19)

Research sources: Wikipedia (Grid plan, Urban morphology, City block, Urban block),
Scott Turner's Here Dragons Abound (road network generation),
Martin O'Leary's Generating Fantasy Maps, Amit Patel's Polygon Map Generation.

---

#### The Six Street Network Archetypes

| # | Name | Origin | Geometry | Game scale |
|---|---|---|---|---|
| 1 | **Organic** | Medieval European, Welsh, Arab | Voronoi edges = streets, irregular blocks | village, small town |
| 2 | **Grid** | Roman castrum, American frontier, Chinese | Perpendicular streets, square/rect blocks | town, city |
| 3 | **Radial** | Baroque (Paris, Washington DC, Karlsruhe) | Streets radiate from central hub or monument | city |
| 4 | **Linear** | English/Welsh strip village (Strassendorf) | One main road, buildings either side | village, hamlet |
| 5 | **Terraced rows** | British industrial town, Welsh valley | Parallel rows of connected houses | town, industrial |
| 6 | **Superblock/Modernist** | CIAM, Soviet, East Asian | Large arterial grid, internal cul-de-sac networks | city |

---

#### Building Arrangement Types (what fills each block)

| Type | Description | Where |
|---|---|---|
| **Perimeter block** | Buildings around block edge, hollow interior courtyard | Barcelona Eixample, Vienna, Helsinki, Paris haussmanian |
| **Terraced row** | Continuous wall-to-wall strip, no gaps | Welsh/English industrial town, London Georgian |
| **Organic cluster** | Irregular footprints, setback varies, alleys between | Old medieval town, Arab medina, organic village |
| **Tower in park** | Point towers, large open ground plane | Modernist housing estates, Soviet microrayon |
| **Courtyard compound** | Single building enclosing a private court | Chinese hutong, Japanese machiya, Arab hosh |
| **Detached suburban** | Free-standing buildings, setback from all sides | Suburb, garden city, North American residential |
| **Grid lot** | Buildings aligned to street grid, front setback uniform | American main street, colonial town |

---

#### Village Morphology Types (specifically relevant)

Based on historical settlement geography (English, Welsh, French, Dutch):

| Type | Pattern | Character | Welsh relevance |
|---|---|---|---|
| **Nucleated** | Buildings cluster around green/church/pub | Cosy, community feel | Very common in Welsh lowland |
| **Linear/Street** | Single road, buildings either side | Ribbon along valley road | Very common in Welsh valleys |
| **Polyfocal** | Two or three distinct clusters joined | Grew from farm hamlets merging | Common upland Welsh |
| **Dispersed/Farmstead** | Individual farmsteads, no cluster | Isolated homesteads + tracks | Common upland Welsh |
| **Planned Medieval** | Grid or semi-grid, planted by lord | Bastide, burgage tenure | Edward I Welsh castles |
| **Coastal/Harbour** | Buildings face water, harbour = focus | Fishing village | Welsh coastal |

---

#### Town Morphology Types

| Type | Pattern | Examples | Generator approach |
|---|---|---|---|
| **Organic medieval** | Grew by accretion, irregular | Bruges, Siena, York | Watabou Voronoi (current) |
| **Bastide** | Planned grid, market square, fortified | Monpazier, Carcassonne, Caernarfon | Grid + wall + central plaza |
| **Market town** | Organic with wide market street or square | English market towns | Wide central road = market |
| **Cathedral town** | Built around cathedral close | Salisbury, Wells | Cathedral as dominant feature |
| **River town** | Built along river bank, bridge = origin | Most Welsh border towns | Linear along water edge |
| **Colonial grid** | Spanish Laws of the Indies: central plaza + 8 streets from corners | Latin America | Plaza + radial streets |

---

#### City Morphology Types

| Type | Pattern | Examples | Generator approach |
|---|---|---|---|
| **Organic + layers** | Old core + expansion rings | London, Rome, Istanbul | Concentric zone growth |
| **Haussmann grand** | Wide boulevards + diagonal avenues, perimeter blocks | Paris, Brussels, Barcelona | Diagonal arteries + grid |
| **American grid** | Pure orthogonal, numbered streets | Manhattan, Chicago, Melbourne | Regular grid, variable block size |
| **Baroque radial** | Radial avenues from palace/monument | Versailles, Washington DC, Karlsruhe | Hub + spokes + connecting ring |
| **Garden city** | Green belts, curved organic streets | Letchworth, Welwyn | Curvilinear + generous parks |
| **Soviet microrayon** | Superblocks, towers in park, no street wall | Moscow outskirts, Warsaw | Superblock grid + tower points |
| **Asian superblock** | Very large blocks (500m+) with internal street hierarchy | Beijing hutong, Tokyo, Osaka | Inner grid within outer grid |

---

#### Key Design Principles (from research)

1. **Conzen's three elements**: streets, plots (lots), buildings — each layer adds to the next
2. **Streets are the negative space** — blocks are defined by what's between buildings, not the buildings
3. **Density gradient** — always denser at centre, sparser at edge (regardless of layout type)
4. **Semantic coherence** drives legibility — church on hill, market at crossroads, slum by edge
5. **Historical layering** — most real cities have organic old core + planned expansion
6. **Perimeter block** = highest density without towers; hollow interior = private amenity
7. **Terraced rows** = most efficient land use for medium density, very British/Welsh

---

Source: https://github.com/watabou/TownGeneratorOS

```
1. Spiral-distribute N seed points outward from origin:
   a = startAngle + sqrt(i)*5
   r = 10 + i*(2 + rand)
   → Natural density: dense centre, sparse outward

2. Bowyer-Watson Delaunay → dual Voronoi
   Each seed becomes a "patch" (ward/city block polygon)

3. Lloyd relaxation on central 3 patches × 3 iterations
   → Central patches become more convex and organic

4. Mark inner N patches as "within city"; outer = farmland

5. CurtainWall polygon around inner patches
   → Gates = 2–4 points on wall where main roads will cross

6. Ward type assignment per patch using rateLocation():
   Market → closest to centre  |  Cathedral → highest point
   Castle → outermost inner    |  Craftsmen → anywhere
   Slum   → outer ring         |  Farm → outside wall

7. Street topology: a graph from Voronoi edges
   Pathfind (A*/Dijkstra) from each gate to plaza → streets
   Pathfind from outer ring to gates → roads

8. Smooth streets: Chaikin corner-cutting × 3 passes
   (smoothVertexEq in Haxe = Chaikin algorithm)
```

---

### ✅ mapgen4 Painting Interaction (Apache-2.0, TypeScript)

Source: https://github.com/redblobgames/mapgen4

**Core insight: the painting interaction is just a 128×128 Float32Array.**

```typescript
// The entire painting state is:
const elevation = new Float32Array(128 * 128);  // -1.0 = deep ocean, +1.0 = mountain

// paintAt() fills a circle in that array with a lerped elevation value:
function paintAt(tool, x0, y0, size, deltaTimeMs) {
  // x0, y0 are 0-1 normalized coordinates
  // Circular brush with innerRadius, outerRadius, rate
  // strength = 1 - clamp((distance - innerRadius) / (outerRadius - innerRadius))
  // elevation[p] = lerp(previousElevation[p], tool.elevation, strength * factor)
}

// Tools: ocean(-0.25), shallow(-0.05), valley(+0.05), mountain(+1.0)
// Sizes: tiny(r=2.5), small(r=6), medium(r=10), large(r=16)
// Shift held = rate/4 (slow mode)
// Apple Pencil pressure → scale radius by sqrt(pressure) * 2
```

**Event pipeline:** `pointerdown → stamp previousElevation → pointermove → paintAt() → onUpdate() callback → Worker regenerates map → render`

The `onUpdate()` callback is the key decoupling point — painting writes to the buffer and calls a callback; the callback posts to a Worker; the Worker runs the Voronoi/terrain generation; the result is sent back and rendered.

**What this means for us:** For terrain warp/adjust in the Overworld Studio, we use this exact pattern (128×128 Float32Array + circular brush). For road drawing, we use a different approach: click-to-add control points → Catmull-Rom spline.

---

### ✅ Azgaar's Fantasy Map Generator Architecture (custom license, JS/TS)

Source: https://github.com/Azgaar/Fantasy-Map-Generator  
Live: https://azgaar.github.io/Fantasy-Map-Generator

**This is the most complete reference for the Overworld Studio architecture.**

Stack: **TypeScript + Vite + Vitest + Playwright** — identical to TT&T.

**4-layer architecture (FMG 2.0 pattern):**
```
1. STATE     — world data (`grid` + `pack` objects), serializable JSON
              grid = Voronoi structure
              pack = aggregate state (burgs, states, cultures, roads, etc.)

2. GENERATORS— procedural simulation logic (Model)
              MUST NOT touch DOM or SVG
              Idempotent: same seed → same output

3. EDITORS   — user-driven mutations (Controllers)
              "Interactive generators" — they mutate state the same way generators do
              All tools live here: draw road, place landmark, change ward type, warp

4. RENDERERS — visualization into SVG (View)
              Pure visualization: reads state, never writes it
              Stateless and idempotent
```

**Data flow:**
```
seed + settings
      ↓
   GENERATOR
      ↓
  world state (JSON)
      ↓
  RENDERER → SVG/Canvas
      ↑
  EDITOR (user mutates state)
      ↑
  RENDERER re-runs
```

**Domain vocabulary (directly applicable to TT&T settlements):**
- `grid` = Voronoi cells (the underlying geometry)
- `pack.burgs` = settlements/landmarks (inn, chapel, smithy…)
- `pack.states` = factions/ownership (which group controls this settlement?)
- `cell` = smallest Voronoi polygon unit (= a "ward" in TT&T terminology)

**SVG rendering** — Azgaar renders to `<svg>` in the DOM, not Canvas 2D or WebGL.
- This gives crisp, scalable overhead maps
- But the rendering has the "flat" vector look that Watabou also uses
- For TT&T's overhead view, we could do the same (SVG) OR Canvas 2D

**Key sharp edges to watch:**
- Azgaar has a massive 9,000-line `index.html` — we should NOT do this
- Their global `window.pack` / `window.grid` state is technical debt we can avoid

---

### ✅ Available Libraries (confirmed, evaluated)

| Library | License | Size | NPM installs/wk | Decision |
|---|---|---|---|---|
| `delaunator` (mapbox) | ISC | 3KB | 4M+ | ✅ USE — fastest Delaunay in JS |
| `d3-delaunay` (d3) | ISC | ~8KB | 1M+ | ✅ USE for higher-level Voronoi API |
| mapgen4 `dual-mesh` | Apache-2.0 | ~5KB | — | 🔍 Evaluate extraction |
| `fast-2d-poisson-disk-sampling` | MIT | 2KB | 60k/wk | ✅ USE — better seed distribution |
| `simplex-noise` | MIT | 3KB | already in project | ✅ USE for warp displacement |
| `polygon-clipping` (Martinez) | MIT | 12KB | 300k/wk | 🔍 Evaluate (needed for cell clipping) |

`delaunator` + `d3-delaunay` together = the Voronoi foundation.  
`delaunator` gives raw triangulation. `d3-delaunay` wraps it with Voronoi cells, nearest-cell query, and polygon iteration.

---

## PART 3 — Open Questions Before Implementation

Answer these before writing any code:

1. **Do we want a pure Voronoi approach (Watabou city-style) or a roads-first approach
   (Watabou village-style)?** The two feel very different and need different algorithms.
   A village of 8 buildings feels better with roads-first.
   A town of 40 buildings feels better with Voronoi ward districts.
   → Maybe we need BOTH and choose by settlement size.

2. **Should the "Overworld Studio" editor be a separate HTML page (like princess-creator.html)
   or integrated into world-editor.html?** The world editor already exists but is complex.
   A separate focused page might be better UX.

3. **What is the right coordinate system for the editor?**
   World-space WU? A normalised [0,1] space that maps to the settlement bounding box?
   Tile-space? This decision cascades through everything.

4. **How far do we take the interactive editor for v1?**
   Minimum: regenerate + screenshot export
   Good: regenerate + named landmark placement + JSON export
   Amazing: full warp/deform + road drawing + ward coloring + 3D preview

5. **Does the 3D overworld need to match the 2D editor exactly?**
   Or is the 2D editor just for inspiration/planning and the 3D is an approximation?
   Watabou's generators are top-down 2D — the player never walks through them.
   TT&T is 3D — the player walks through. This tension is the hardest design problem.

---

## PART 4 — Research Backlog (ordered by priority)

```
[x] DONE: Study Watabou TownGeneratorOS source (Voronoi + ward algorithm)
[x] DONE: Study mapgen4 painting.ts (brush interaction pipeline)
[x] DONE: Study Azgaar FMG architecture (CONTEXT.md + README)
[x] DONE: Evaluate delaunator + d3-delaunay libraries

[ ] HIGH: Play with mapgen4 live (https://www.redblobgames.com/maps/mapgen4/)
    → Feel the brush latency — is < 200ms generation perceptible?
    → Try the different tool sizes — which feel natural?
    → This is the benchmark for what our Overworld Studio must feel like

[ ] HIGH: Play with Azgaar's FMG live (https://azgaar.github.io/Fantasy-Map-Generator)
    → Study the warp interaction (how does it feel to drag-warp a settlement?)
    → Study road drawing (what's the UX for adding a new road?)
    → Study the ward/burg editor (how do you change a settlement type?)
    → This is the feature benchmark for our editor tools

[ ] HIGH: Read Watabou's village generator Patreon posts (R1.3)
    → https://www.patreon.com/watawatabou?filters[tag]=village%20generator
    → This answers: is it L-system? random walk? agent-based road growth?
    → Critical before deciding Voronoi vs roads-first

[ ] HIGH: Study Azgaar FMG road generation source
    → https://github.com/Azgaar/Fantasy-Map-Generator/src/generators/
    → How does it route roads between settlements through the Voronoi graph?
    → This is the most directly reusable piece of code we can find

[ ] HIGH: Prototype: can we generate a settlement Voronoi in < 100ms?
    → `npm install delaunator d3-delaunay`
    → Write a 50-line proof-of-concept: 15 seed points → Voronoi → draw to Canvas 2D
    → Measure generation time → answers R4.5 definitively

[ ] MEDIUM: Read all redblobgames Delaunay+Voronoi map articles
    → https://www.redblobgames.com/x/1722-b-rep-triangle-meshes/ (dual mesh)
    → https://www.redblobgames.com/x/1723-procedural-river-growing/ (rivers)
    → https://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/
      (THE foundational article for Voronoi-based game maps — must read)

[ ] MEDIUM: Investigate R4.3 — ford/river data in WorldData
    → Where are ford crossing points stored?
    → The settlement generator needs this as an attraction point for road routing

[ ] LOW: Research medieval village morphology for Welsh setting
    → Nucleated (around green) = best match for cozy village feel
    → Linear (along road) = good for wayside settlements
    → This informs the "village type" parameter in the generator

[ ] LOW: Study the Dwellings generator (https://watabou.github.io/dwellings/)
    → How does Watabou generate house floor plans?
    → Compare with our InteriorGenerator.ts approach
```

---

## PART 5 — UI Concept Sketch (NOT final — needs R3 research first)

Based on the princess atelier pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OVERWORLD STUDIO — settlement:  [village ▼]   seed: [445176186]  [🎲 New] │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐  ┌─────────────────────┐│
│  │                                                │  │  TOOLS              ││
│  │   2D overhead map (Canvas 2D or THREE.js       │  │  [R] Road draw      ││
│  │      orthographic)                             │  │  [W] Ward type      ││
│  │                                                │  │  [P] Point nudge    ││
│  │   • coloured ward polygons                     │  │  [L] Landmark       ││
│  │   • road polylines (curved)                    │  │  [D] Delete         ││
│  │   • building footprint rectangles              │  │                     ││
│  │   • wall polygon (if walled)                   │  │  SETTLEMENT         ││
│  │   • terrain hachures / biome tint              │  │  Type: [village ▼]  ││
│  │                                                │  │  Pop:  [40–80]      ││
│  │   Interaction:                                 │  │  Walls: [off]       ││
│  │   • Left drag = pan                            │  │  Warp:  [▓░░░░]     ││
│  │   • Scroll = zoom                              │  │                     ││
│  │   • Click ward = select + show type picker     │  │  LANDMARKS          ││
│  │   • Click+drag road = nudge control point      │  │  ☐ Market           ││
│  │   • Brush = draw new road                      │  │  ☐ Chapel           ││
│  │                                                │  │  ☐ Inn              ││
│  │   [3D Preview ↗]  (opens world-editor at pos)  │  │  ☐ Smithy           ││
│  └────────────────────────────────────────────────┘  │                     ││
│                                                       │  [EXPORT JSON]      ││
│                                                       │  [EXPORT SVG]       ││
│                                                       │  [PLACE IN WORLD]   ││
│                                                       └─────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key UI ideas to validate through research (R3):**
- Is Canvas 2D or THREE.js ortho better for the 2D overhead view?
- How does Watabou handle ward selection/click?
- What does "warp" feel like as an interactive slider?
- Does the road-draw tool need snap-to-terrain?

---

## PART 6 — What We Should NOT Decide Yet

These are things that seem obvious but need research to get right:

- **Do NOT choose Voronoi vs roads-first yet** — depends on R1.3
- **Do NOT choose the coordinate system yet** — depends on R4.1
- **Do NOT choose Canvas vs THREE.js for the editor yet** — depends on R2.6
- **Do NOT write any generation code yet** — the research todos will likely change the approach
- **Do NOT add more libraries yet** — evaluate delaunator + d3-delaunay first (R2.1/R2.2)
