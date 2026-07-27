/**
 * WorldGen.ts — PROC-A5
 *
 * Top-level procedural world-generation coordinator.
 * Given a world seed, produces a deterministic PlacementPlan describing
 * where every building, NPC, enemy, and prop should appear.
 *
 * The game calls this at world-load time.  Creative mode calls the same
 * function then lets the designer override individual placements.
 *
 * No Three.js imports here — this is pure data generation.
 * The actual `build*(dna)` calls happen at scene-enter time.
 */
// ── RNG ───────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s += 0x6D2B79F5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// ── Settlement names ──────────────────────────────────────────────────────────
const SETTLEMENT_PREFIXES = ['Ash', 'Bright', 'Cold', 'Dark', 'Elder', 'Fell', 'Grey', 'High', 'Iron', 'Low', 'Mill', 'Old', 'Stone', 'Swift', 'Thorn'];
const SETTLEMENT_SUFFIXES = ['bridge', 'brook', 'cliff', 'cross', 'dale', 'ford', 'gate', 'haven', 'holm', 'keep', 'moor', 'stead', 'ton', 'vale', 'worth'];
function settlementName(seed) {
    const r = mulberry32(seed);
    return SETTLEMENT_PREFIXES[Math.floor(r() * SETTLEMENT_PREFIXES.length)] +
        SETTLEMENT_SUFFIXES[Math.floor(r() * SETTLEMENT_SUFFIXES.length)];
}
// ── Building generation ───────────────────────────────────────────────────────
const BUILDING_KINDS = ['house', 'house', 'house', 'inn', 'shop', 'guild', 'well', 'ruin'];
const BUILDING_STYLES = ['thatched', 'stone', 'timber', 'arcane'];
function generateSettlementBuildings(settlementSeed, centerX, centerZ, count) {
    const r = mulberry32(settlementSeed ^ 0xBEEF_1234);
    const buildings = [];
    for (let i = 0; i < count; i++) {
        const angle = r() * Math.PI * 2;
        const radius = 8 + r() * 20;
        const kind = BUILDING_KINDS[Math.floor(r() * BUILDING_KINDS.length)];
        const style = BUILDING_STYLES[Math.floor(r() * BUILDING_STYLES.length)];
        const floors = ([1, 1, 1, 2, 2, 3][Math.floor(r() * 6)] ?? 1);
        buildings.push({
            id: `bld-${settlementSeed}-${i}`,
            kind,
            style,
            floors,
            pos: { x: centerX + Math.cos(angle) * radius, y: 0, z: centerZ + Math.sin(angle) * radius },
            rotation: r() * Math.PI * 2,
            seed: (settlementSeed ^ (i * 0x9E3779B9)) >>> 0,
            hasInterior: kind !== 'well',
        });
    }
    return buildings;
}
// ── NPC generation ────────────────────────────────────────────────────────────
const NPC_ROLES = ['merchant', 'guard', 'innkeeper', 'quest_giver', 'scholar', 'elder'];
const NPC_SPECIES = ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'];
function generateSettlementNpcs(settlementId, settlementSeed, centerX, centerZ, count) {
    const r = mulberry32(settlementSeed ^ 0xCAFE_BABE);
    const npcs = [];
    for (let i = 0; i < count; i++) {
        const angle = r() * Math.PI * 2;
        const radius = 4 + r() * 15;
        const role = NPC_ROLES[Math.floor(r() * NPC_ROLES.length)];
        const species = NPC_SPECIES[Math.floor(r() * NPC_SPECIES.length)];
        npcs.push({
            id: `npc-${settlementSeed}-${i}`,
            species,
            role,
            pos: { x: centerX + Math.cos(angle) * radius, y: 0, z: centerZ + Math.sin(angle) * radius },
            seed: (settlementSeed ^ (i * 0xDEAD_BEEF)) >>> 0,
            settlementId,
        });
    }
    return npcs;
}
// ── Enemy generation ──────────────────────────────────────────────────────────
const ENEMY_ROLES = ['melee', 'melee', 'ranged', 'caster', 'swarm'];
function generateWildEnemies(worldSeed, count, worldRadius) {
    const r = mulberry32(worldSeed ^ 0xF00D_BABE);
    const enemies = [];
    for (let i = 0; i < count; i++) {
        const angle = r() * Math.PI * 2;
        const radius = worldRadius * 0.3 + r() * worldRadius * 0.6;
        const tier = ([1, 1, 2, 2, 3][Math.floor(r() * 5)] ?? 1);
        const species = NPC_SPECIES[Math.floor(r() * NPC_SPECIES.length)];
        const role = ENEMY_ROLES[Math.floor(r() * ENEMY_ROLES.length)];
        enemies.push({
            id: `enemy-${worldSeed}-${i}`,
            species,
            combatRole: role,
            tier,
            pos: { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius },
            seed: (worldSeed ^ (i * 0xABCD_1234)) >>> 0,
            patrolRadius: 5 + r() * 10,
        });
    }
    return enemies;
}
/**
 * Generate a complete PlacementPlan from a seed.
 * Same seed always produces the same plan.
 */
export function generateWorldPlan(seed, opts = {}) {
    const { settlementCount = 3, buildingsPerSettlement = 6, npcsPerSettlement = 4, wildEnemyCount = 12, worldRadius = 120, } = opts;
    const r = mulberry32(seed ^ 0x1234_ABCD);
    const settlements = [];
    for (let i = 0; i < settlementCount; i++) {
        const angle = r() * Math.PI * 2;
        const radius = worldRadius * 0.25 + r() * worldRadius * 0.55;
        const centerX = Math.cos(angle) * radius;
        const centerZ = Math.sin(angle) * radius;
        const settlementSeed = (seed ^ ((i + 1) * 0x9E37_79B9)) >>> 0;
        const id = `settlement-${settlementSeed}`;
        const type = ['hamlet', 'village', 'town', 'city'][Math.floor(r() * 4)];
        const buildingCount = buildingsPerSettlement + Math.floor(r() * 4);
        const npcCount = npcsPerSettlement + Math.floor(r() * 3);
        settlements.push({
            id,
            name: settlementName(settlementSeed),
            type,
            pos: { x: centerX, y: 0, z: centerZ },
            seed: settlementSeed,
            buildings: generateSettlementBuildings(settlementSeed, centerX, centerZ, buildingCount),
            npcs: generateSettlementNpcs(id, settlementSeed, centerX, centerZ, npcCount),
        });
    }
    return {
        seed,
        generatedAt: Date.now(),
        settlements,
        wildEnemies: generateWildEnemies(seed, wildEnemyCount, worldRadius),
        overworldProps: [], // PROC-B3: props added once PropBuilder is implemented
    };
}
