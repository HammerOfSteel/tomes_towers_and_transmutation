# Performance (Phase G1 + F4)
> 60fps target on M1 / GTX 1060 equivalent. Profile first, fix second.

## Status: 🔲 Not started

## Budget Targets (to define)
| Category | Target | Measurement |
|---|---|---|
| Draw calls | ≤ 300 | Chrome DevTools Performance panel |
| Triangles | ≤ 500k visible | `renderer.info.render.triangles` |
| JS frame time | ≤ 8ms | DevTools flame chart |
| Texture memory | ≤ 256MB | Chrome Memory heap |
| GC pauses | < 1/minute | Chrome Memory timeline |

## Tasks

### GP-1 — Frame Budget Audit
- [ ] Profile with Chrome DevTools on overworld + dungeon scenes
- [ ] Identify top 3 CPU bottlenecks
- [ ] Identify top 3 GPU bottlenecks (draw calls, shader complexity)

### GP-2 — InstancedMesh
- [ ] Trees, rocks, grass clumps: use `THREE.InstancedMesh` (same DNA = same geometry)
- [ ] Dungeon tiles: `InstancedMesh` per tile type
- [ ] Target: same-DNA entities = 1 draw call regardless of count

### GP-3 — LOD
- [ ] `THREE.LOD` on procedural buildings (simplified LOD at 50u+)
- [ ] Trees: billboard at 80u+, full at < 30u

### GP-4 — Memory Leaks
- [ ] Run Chrome heap snapshot before + after 5-minute play
- [ ] Diff > 50MB → find and fix leak (likely: textures not disposed on scene change)
- [ ] `dispose()` checklist: geometry, material, texture for every scene teardown

### GP-5 — Chunk Loading
- [ ] Verify chunk loading/unloading doesn't spike frame time
- [ ] Load chunks async (background worker or `requestIdleCallback`)

### GP-6 — Test (perf guard)
- [ ] `OverworldScene` with 500 instanced trees renders in < 16ms (mocked RAF)
- [ ] Playwright: capture `renderer.info` after 30s session, assert triangles ≤ budget
