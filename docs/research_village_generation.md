# Procedural Settlement Generation — Research & Investigation Plan

> **Status:** RESEARCH PHASE — This document tracks what we need to investigate
> before deciding on implementation. Nothing in here is a final plan.
>
> **Goal:** Watabou-quality organic village/city/settlement generation that:
> - Integrates with the existing heightmap + river + biome terrain
> - Has a UI similar to the princess atelier — an "Overworld Studio" page
> - Supports interactive editing: draw roads, warp, nudge districts, place landmarks
> - Feels alive with semantic coherence (chapel on hill, inn at crossroads, etc.)
>
> **References inspiring this:**
> - [watabou village-generator](https://watabou.github.io/village-generator/)
> - [watabou city-generator](https://watabou.github.io/city-generator/)
> - [watabou dwellings](https://watabou.github.io/dwellings/)
> - [watabou perilous-shores](https://watabou.github.io/perilous-shores/) (regional with terrain)
> - [redblobgames mapgen4](https://www.redblobgames.com/maps/mapgen4/) (interactive painting, TypeScript)
> - [watabou TownGeneratorOS](https://github.com/watabou/TownGeneratorOS) (open-source city algorithm)

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

- [ ] **R1.5** How does mapgen4 handle the "paint terrain" interaction?
  - `painting.ts` uses pointer events + brush radius to modify elevation
  - Can this same brush-painting pattern work for a "draw road" or "mark ward" tool?
  - Is there a canvas-based painting library worth using or should it be raw canvas 2D?

- [ ] **R1.6** Lot subdivision — what algorithm does Watabou use inside each ward?
  - TownGeneratorOS has a `Ward` base class and specialized subclasses
  - How does each ward type subdivide itself into building lots?
  - Is there open TypeScript code for recursive lot subdivision?
  - Research: Müller 2006 CGA Shape Grammar (read the paper abstract at minimum)

- [ ] **R1.7** Road smoothing — what is the right spline type?
  - Watabou's source calls `smoothVertexEq(3)` — that's Chaikin's algorithm (corner cutting)
  - mapgen4 uses Catmull-Rom for rivers
  - THREE.js has `CatmullRomCurve3` and `SplineCurve`
  - Which gives the most "medieval road" feel at the overworld scale?

### R2 — Library Evaluation

- [ ] **R2.1** `delaunator` (mapbox, ISC license) — already identified as the right Voronoi library.
  - Evaluate: `npm install delaunator` — does it tree-shake well? Size impact?
  - Check if it has TypeScript types (it does, first-class via tsconfig)
  - Key API: `Delaunator.from(points)` → `triangles` + `halfedges` → derive Voronoi regions
  - How well does `delaunay.update()` work for real-time editing?

- [ ] **R2.2** `d3-delaunay` (d3, ISC license) — higher-level wrapper around delaunator.
  - Adds: Voronoi cell polygons, `find(x,y)` nearest seed, `contains(i,x,y)`
  - Is the higher-level API worth the extra size vs raw delaunator?
  - Does it work in a Web Worker (needed for non-blocking generation)?

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

- [ ] **R2.6** SVG vs Canvas 2D vs THREE.js for the 2D overhead editor view.
  - Watabou uses OpenFL (Flash-like canvas framework)
  - mapgen4 uses WebGL for rendering, canvas 2D for painting input
  - The princess atelier uses Three.js (WebGL) — should the settlement editor match?
  - Or should it be a separate 2D HTML Canvas for the overhead view?
  - Research: Can you get a Watabou-quality 2D vector look from THREE.js?
    (orthographic camera + custom line materials or SVG overlay)

### R3 — UI/UX Pattern Research

- [ ] **R3.1** Study the princess atelier UI pattern in detail.
  - What works: single HTML page, Three.js canvas left, control panel right
  - What could be improved: panel responsiveness, mobile
  - How would this pattern adapt for a 2D overhead map editor?
  - The settlement editor needs both 2D overhead AND 3D preview views

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

### Watabou City Generator Algorithm (TownGeneratorOS — GPL-3.0)

Read the actual source at https://github.com/watabou/TownGeneratorOS

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
   → Wall = convex hull of inner patches (with random protrusions)
   → Gates = 2–4 points on wall where main roads will cross

6. Ward type assignment per patch using rateLocation():
   Market   → closest to centre
   Cathedral→ highest "elevation" (in the 2D sense: distance from edge)
   Castle   → outermost inner patch
   Craftsmen→ anywhere (most common type)
   Slum     → outer ring
   Farm     → outside wall

7. Street topology: a graph from Voronoi edges
   Pathfind from each gate to the plaza → streets
   Pathfind from outer ring to gates → roads

8. Smooth streets: Chaikin corner-cutting × 3 passes
```

### mapgen4 (Apache-2.0, TypeScript — redblobgames)

Live at https://www.redblobgames.com/maps/mapgen4/
Source at https://github.com/redblobgames/mapgen4

Key features:
- **Dual-mesh data structure**: single flat typed array tracking both Delaunay triangles AND Voronoi cells simultaneously
- **Painting interaction**: brush → modify elevation buffer → post to Worker → re-run generation → re-render
- **Libraries used**: `delaunator` (Voronoi), `fast-2d-poisson-disk-sampling` (seed point distribution), `simplex-noise`, WebGL renderer
- **All TypeScript** — directly adaptable for TT&T
- **Apache-2.0 license** — can be used freely in commercial projects

Key files to study:
- `painting.ts` — brush interaction, the "draw terrain" UX
- `map.ts` — elevation, moisture, biome assignment on the Voronoi mesh
- `dual-mesh/` — the core data structure (subrepo)
- `worker.ts` — off-main-thread generation pipeline

### Available Libraries (already confirmed)

| Library | License | Size | Role |
|---|---|---|---|
| `delaunator` (mapbox) | ISC | 3KB | Fast Delaunay + Voronoi dual |
| `d3-delaunay` (d3) | ISC | ~8KB | Higher-level Voronoi (find/contains) |
| `mapgen4` dual-mesh | Apache-2.0 | ~5KB | Compact Delaunay+Voronoi data structure |
| `fast-2d-poisson-disk-sampling` | MIT | 2KB | Better seed distribution than pure random |
| `simplex-noise` | MIT | already in project | Warp/organic displacement |
| `polygon-clipping` (Martinez) | MIT | 12KB | Clip Voronoi cells to world bounds |

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
[ ] HIGH: Play with mapgen4 interactively (https://www.redblobgames.com/maps/mapgen4/)
    → specifically the "paint terrain" interaction — can you feel the brush latency?
    → study: how does it handle the road-drawing feature mentioned in the README?
    → note: "drawing your own rivers" feature is referenced but not yet in mapgen4

[ ] HIGH: Study Azgaar's Fantasy Map Generator source
    → https://github.com/Azgaar/Fantasy-Map-Generator
    → It's the most complete open-source fantasy map tool in JS
    → Has: voronoi cells, roads, labels, cultures, religions, trade routes, biomes
    → Has: an interactive editor with warp, nudge, road-drawing

[ ] HIGH: Read all redblobgames map generation articles
    → https://www.redblobgames.com/maps/mapgen4/ (mapgen4 blog posts)
    → https://www.redblobgames.com/x/1722-b-rep-triangle-meshes/ (dual mesh)
    → https://www.redblobgames.com/x/1723-procedural-river-growing/ (river generation)
    → His articles are the best explanations of Delaunay-based map generation anywhere

[ ] MEDIUM: Read Watabou's village generator Patreon posts
    → URL: https://www.patreon.com/watawatabou?filters[tag]=village%20generator
    → These explain the "roads first" approach in his own words

[ ] MEDIUM: Research "space syntax" for urban layout realism
    → Real cities have patterns: axial lines, integration values, depth from entrance
    → Even simple versions (main road is longest, secondary roads branch off it) help
    → Paper: Hillier & Hanson (1984) "The Social Logic of Space"

[ ] LOW: Evaluate Azgaar's warp implementation
    → The "warp" in Azgaar is Perlin noise offset applied to Voronoi seed points
    → How much warp looks "organic" vs "broken"?
    → Is the noise applied once or continuously?

[ ] LOW: Research medieval village morphology for design accuracy
    → What did real English, Welsh, French villages look like in layout?
    → Common types: nucleated (around green), linear (along road), dispersed (farmsteads)
    → The game's Welsh/fantasy setting fits "nucleated with green" + "linear on road"

[ ] LOW: Study the Dwellings generator (building floor plans)
    → https://watabou.github.io/dwellings/
    → The interiors we generated with InteriorGenerator are similar
    → How does Watabou generate individual house plans? Compare with our approach
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
