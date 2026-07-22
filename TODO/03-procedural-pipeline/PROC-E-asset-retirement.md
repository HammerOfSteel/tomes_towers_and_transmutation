# PROC-E — Asset Pipeline Retirement
> Remove all GLB/external asset loading paths. Code-first only. **Do last — after all builders are verified.**

## Status: 🔲 Not started (blocked on PROC-B)

## What to Remove
- [ ] `ENEMY_MANIFEST` and all `loadEnemyModel()` / GLB load paths in `EnemyLoader.ts`
- [ ] `charManifest.ts` enemy entries
- [ ] `loadCharacterAsset()` fallback GLB paths
- [ ] `SolmorPresence.ts` — loads `wizards/toad/mesh.glb` → replace with `buildNpc(solmorDNA)`
- [ ] Any remaining `GLTFLoader` usage outside of explicitly opted-in "Kenney asset mode"
- [ ] `assetManifest.ts` GLB entries for enemies/NPCs

## What to Keep
- Player character model loading (always asset-based per GDD decision)
- Kenney asset mode (optional Settings toggle, `assetMode = 'kenney'`)
- Audio loading (MP3/OGG)

## Verification
- [ ] `grep -r 'GLTFLoader\|loadGLB\|\.glb' src/` returns only asset-mode paths + player
- [ ] All enemy/NPC encounters work with procedural rigs
- [ ] No broken loading errors in console

## Solmor Replacement (high priority)
- [ ] `buildSolmor(): THREE.Group` — robed figure, tall, staff, distinctive silhouette
- [ ] `SolmorPresence.ts` uses `buildSolmor()` instead of mesh.glb
- [ ] Solmor DNA: tall human, wizard robe (deep blue), staff prop, silver hair

## Dependencies
- Requires: PROC-B all builders done + verified in-game ✅
- Must be the last PROC step
