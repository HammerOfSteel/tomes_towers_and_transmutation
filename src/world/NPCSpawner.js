/**
 * NPCSpawner.ts — PROC-B1h
 *
 * Resolves and builds NPCs for a settlement.
 *
 * Priority:
 *   1. Named override from gallery (designer placed a specific NPC here)
 *   2. Procedural default from getDefaultNpcDna()
 *
 * Usage (called by OverworldScene._spawnSettlementNPCs):
 *
 *   const npcs = await NPCSpawner.spawnForSettlement(settlement, seed);
 *   for (const { inst, worldX, worldZ } of npcs) {
 *     inst.root.position.set(worldX, 0, worldZ);
 *     scene.add(inst.root);
 *   }
 */
import { buildNpc } from '@/npc-creator/builder';
import { getDefaultNpcDna } from '@/npc-creator/defaults/NpcDefaults';
import { resolveNamedNpc } from '@/npc-creator/gallery';
import { mulberry32 } from '@/core/prng';
import { generateNameForSpecies } from '@/world/NameGenerator';
// ── Role tables per settlement type ──────────────────────────────────────────
const DEFAULT_ROLES = [
    'merchant', 'innkeeper', 'guard', 'guard',
    'quest_giver', 'scholar', 'elder', 'mysterious',
];
// ── Main API ──────────────────────────────────────────────────────────────────
/**
 * Resolve and build all NPCs for a settlement.
 * Named overrides take priority over procedural generation.
 */
export async function spawnForSettlement(input) {
    const { id, seed, centerX, centerZ, npcCount } = input;
    const r = mulberry32(seed ^ 0xA1B20034);
    const roles = input.roles ?? DEFAULT_ROLES;
    const species = input.species ?? ['human', 'human', 'vulperia', 'elf', 'undead', 'slime', 'celestial', 'draconic'];
    const result = [];
    for (let i = 0; i < npcCount; i++) {
        const npcSeed = (seed ^ (i * 0x9E37_79B9)) >>> 0;
        const role = roles[i % roles.length];
        const sp = species[Math.floor(r() * species.length)];
        const locationId = `${id}/${role}/${i}`;
        // 1. Check for named override
        let dna = resolveNamedNpc(locationId);
        // 2. Fall back to procedural default
        if (!dna) {
            dna = getDefaultNpcDna(sp, role, npcSeed);
        }
        // 3. Generate a name if not set
        if (!dna.name) {
            dna = { ...dna, name: generateNameForSpecies('any') };
        }
        // 4. Build the NPC rig
        console.log(`[NPCSpawner] building NPC ${i + 1}/${npcCount}: ${dna.name} (${dna.species}/${dna.role})`);
        try {
            const inst = await buildNpc(dna);
            // Scatter around settlement center
            const angle = r() * Math.PI * 2;
            const radius = 5 + r() * 18;
            const wx = centerX + Math.cos(angle) * radius;
            const wz = centerZ + Math.sin(angle) * radius;
            result.push({ inst, dna, worldX: wx, worldZ: wz, role });
        }
        catch (e) {
            console.error(`[NPCSpawner] failed to build NPC ${dna.name}:`, e);
        }
    }
    return result;
}
