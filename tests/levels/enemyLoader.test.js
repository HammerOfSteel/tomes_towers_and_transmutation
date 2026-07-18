import { describe, it, expect } from 'vitest';
import { ENEMY_MANIFEST, getEnemyManifestEntry, getEnemyModelDef, } from '@/enemy/EnemyLoader';
import { CHAR_MODELS } from '@/characters/charManifest';
import { ENCOUNTER_POOLS } from '@/levels/RoomEncounterDef';
// ── ENEMY_MANIFEST structural tests ──────────────────────────────────────────
describe('ENEMY_MANIFEST — structural validity', () => {
    it('has at least 10 entries', () => {
        expect(ENEMY_MANIFEST.length).toBeGreaterThanOrEqual(10);
    });
    it('all enemyIds are unique', () => {
        const ids = ENEMY_MANIFEST.map(e => e.enemyId);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it('all model ids reference real entries in charManifest', () => {
        const missing = [];
        for (const entry of ENEMY_MANIFEST) {
            const def = CHAR_MODELS.find(m => m.id === entry.id);
            if (!def)
                missing.push(`${entry.enemyId} → "${entry.id}" not in charManifest`);
        }
        expect(missing, `Missing model refs:\n${missing.join('\n')}`).toHaveLength(0);
    });
    it('all referenced charManifest models have role "enemy"', () => {
        const nonEnemy = [];
        for (const entry of ENEMY_MANIFEST) {
            const def = CHAR_MODELS.find(m => m.id === entry.id);
            if (def && !def.roles.includes('enemy')) {
                nonEnemy.push(`${entry.enemyId}: model "${entry.id}" has roles [${def.roles.join(',')}]`);
            }
        }
        expect(nonEnemy, `Non-enemy roles:\n${nonEnemy.join('\n')}`).toHaveLength(0);
    });
    it('tier is 1, 2, 3, or "boss"', () => {
        const valid = new Set([1, 2, 3, 'boss']);
        for (const e of ENEMY_MANIFEST) {
            expect(valid.has(e.tier), `${e.enemyId}: invalid tier ${e.tier}`).toBe(true);
        }
    });
    it('species is a valid EnemySpecies', () => {
        const valid = new Set(['undead', 'beast', 'elemental', 'fae', 'humanoid', 'construct']);
        for (const e of ENEMY_MANIFEST) {
            expect(valid.has(e.species), `${e.enemyId}: invalid species "${e.species}"`).toBe(true);
        }
    });
});
// ── Lookup helpers ────────────────────────────────────────────────────────────
describe('getEnemyManifestEntry', () => {
    it('returns correct entry for known id', () => {
        const entry = getEnemyManifestEntry('skeleton_warrior');
        expect(entry).toBeDefined();
        expect(entry.species).toBe('undead');
        expect(entry.tier).toBe(1);
    });
    it('returns undefined for unknown id', () => {
        expect(getEnemyManifestEntry('__nonexistent__')).toBeUndefined();
    });
});
describe('getEnemyModelDef', () => {
    it('returns a CharModelDef for known enemy id', () => {
        const def = getEnemyModelDef('skeleton_warrior');
        expect(def).toBeDefined();
        expect(def.format).toBe('glb');
        expect(def.animated).toBe(true);
    });
    it('returns undefined for unknown enemy id', () => {
        expect(getEnemyModelDef('__nonexistent__')).toBeUndefined();
    });
});
// ── RoomEncounterDef × ENEMY_MANIFEST cross-validation ───────────────────────
describe('RoomEncounterDef × ENEMY_MANIFEST — enemy IDs cross-reference', () => {
    // Collect all enemyIds used in encounter pools that have a real manifest entry.
    // EnemyIds without a manifest entry are TODO placeholders (FBX packs not yet
    // integrated, Ultimate Monsters zip, etc.) — they are WARNED not failed.
    it('known encounter enemyIds resolve to a CharModelDef', () => {
        const notResolved = [];
        const notInManifest = [];
        for (const [floor, pool] of Object.entries(ENCOUNTER_POOLS)) {
            for (const enc of pool) {
                for (const group of enc.enemies) {
                    const entry = getEnemyManifestEntry(group.enemyId);
                    if (!entry) {
                        notInManifest.push(`floor ${floor} / "${enc.id}": "${group.enemyId}" not in ENEMY_MANIFEST`);
                        continue;
                    }
                    const def = getEnemyModelDef(group.enemyId);
                    if (!def) {
                        notResolved.push(`floor ${floor} / "${enc.id}": "${group.enemyId}" in manifest but no CharModelDef`);
                    }
                }
            }
        }
        // Non-manifest entries are expected (TODO packs) — log but don't fail.
        if (notInManifest.length > 0) {
            console.warn(`[EnemyLoader test] ${notInManifest.length} encounter enemyIds not yet in ENEMY_MANIFEST ` +
                `(TODO — add when pack is integrated):\n` +
                notInManifest.map(s => `  ${s}`).join('\n'));
        }
        // CharModelDef resolution failures ARE hard errors.
        expect(notResolved, `enemyIds in ENEMY_MANIFEST but no charManifest entry:\n${notResolved.join('\n')}`).toHaveLength(0);
    });
});
