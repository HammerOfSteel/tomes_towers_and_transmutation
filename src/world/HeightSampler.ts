/**
 * Generic world-space height-sampling function type, shared by any system
 * that needs to query ground height at an arbitrary (x, z) — settlement
 * building placement, road-ribbon rendering, etc. Relocated out of the
 * now-deleted `RealmRiverMesh.ts` (Phase 3 hydrology unification), where
 * it lived despite having no river-specific meaning.
 */
export type RiverHeightSampler = (worldX: number, worldZ: number) => number;
