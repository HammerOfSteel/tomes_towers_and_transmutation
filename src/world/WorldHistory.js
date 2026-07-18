/**
 * WorldHistory — 50-turn history simulation for the generated world.
 *
 * Produces named factions and world events (raids, trade, anomalies) that
 * NPCs can reference in dialogue.  Run once at world-gen time and stored
 * alongside WorldData.
 *
 * History is flavour — it never hard-gates gameplay.
 */
import { mulberry32 } from '@/core/prng';
// ── Name tables ────────────────────────────────────────────────────────────────
const FACTION_ADJ = ['Crimson', 'Silver', 'Iron', 'Golden', 'Shadow', 'Ember', 'Jade', 'Ivory', 'Obsidian', 'Amber'];
const FACTION_NOUN = ['Sigil', 'Circle', 'Hand', 'Covenant', 'Banner', 'Veil', 'Path', 'Throne', 'Chain', 'Flame'];
const FACTION_TYPE_NAMES = {
    mages_guild: 'Conclave',
    merchants: 'Guild',
    bandits: 'Brotherhood',
    forest_spirits: 'Grove',
    undead_cult: 'Shroud',
};
function factionName(rand, type) {
    const adj = FACTION_ADJ[Math.floor(rand() * FACTION_ADJ.length)];
    const noun = FACTION_NOUN[Math.floor(rand() * FACTION_NOUN.length)];
    const sfx = FACTION_TYPE_NAMES[type];
    return `The ${adj} ${noun} ${sfx}`;
}
// ── Event description templates ────────────────────────────────────────────────
const RAID_DESCS = [
    'launched a midnight raid',
    'stormed the outer walls',
    'burned the granaries',
    'drove out the local militia',
];
const TRADE_DESCS = [
    'established a regular caravan route',
    'signed a trade charter',
    'opened a shared market',
    'agreed to tithe-free commerce',
];
const ANOMALY_DESCS = [
    'a rift tore open in the sky',
    'strange runes appeared on the stones',
    'the shadows began speaking',
    'time stuttered for three hours',
];
const MONSTER_DESCS = [
    'a vast slime horde swept through',
    'creatures of darkness emerged',
    'wild beasts attacked without warning',
    'an undead shamble crossed the valley',
];
function pickDesc(arr, rand) {
    return arr[Math.floor(rand() * arr.length)] ?? arr[0];
}
// ── Main simulation ────────────────────────────────────────────────────────────
export function simulateWorldHistory(data, seed) {
    const rand = mulberry32(seed ^ 0x48_15_70_A1);
    const factions = [];
    const events = [];
    const { settlements, dungeons } = data;
    // ── Create one faction per settlement (capped at 8) ──────────────────────
    const FACTION_TYPES = [
        'merchants', 'mages_guild', 'bandits', 'forest_spirits',
        'undead_cult', 'merchants', 'bandits', 'mages_guild',
    ];
    const maxFactions = Math.min(settlements.length, 8);
    for (let i = 0; i < maxFactions; i++) {
        const s = settlements[i];
        const type = FACTION_TYPES[i % FACTION_TYPES.length];
        factions.push({
            id: i + 1,
            name: factionName(rand, type),
            type,
            homeSettlementId: s.id,
            strength: 0.3 + rand() * 0.5,
        });
    }
    // ── Turns 0–5: Founding ───────────────────────────────────────────────────
    for (const s of settlements) {
        const { plan } = s;
        events.push({
            turn: Math.floor(rand() * 6),
            type: 'settlement_founded',
            col: plan.centerCol,
            row: plan.centerRow,
            description: `${plan.name} was founded, its first stones laid by wandering settlers.`,
        });
    }
    for (const d of dungeons) {
        if (factions.length === 0)
            break;
        const f = factions[Math.floor(rand() * factions.length)];
        events.push({
            turn: Math.floor(rand() * 6),
            type: 'dungeon_discovered',
            col: d.col,
            row: d.row,
            factionA: f.id,
            description: `${f.name} first charted the entrance to ${d.name}.`,
        });
    }
    // ── Turns 6–25: Conflict ─────────────────────────────────────────────────
    for (let turn = 6; turn <= 25; turn++) {
        for (const fa of factions) {
            if (fa.strength < 0.5)
                continue;
            if (rand() > 0.20)
                continue; // 20% chance of action
            // Find a target faction (different home settlement)
            const targets = factions.filter(fb => fb.id !== fa.id &&
                Math.abs(fb.homeSettlementId - fa.homeSettlementId) <= 4);
            if (targets.length === 0)
                continue;
            const fb = targets[Math.floor(rand() * targets.length)];
            const targetS = settlements.find(s => s.id === fb.homeSettlementId);
            if (!targetS)
                continue;
            fb.strength = Math.max(0, fb.strength - 0.1);
            events.push({
                turn,
                type: 'faction_raid',
                col: targetS.plan.centerCol,
                row: targetS.plan.centerRow,
                factionA: fa.id,
                factionB: fb.id,
                description: `${fa.name} ${pickDesc(RAID_DESCS, rand)} on ${targetS.plan.name}.`,
            });
        }
        // Random monster sighting
        if (rand() < 0.12 && settlements.length > 0) {
            const s = settlements[Math.floor(rand() * settlements.length)];
            events.push({
                turn,
                type: 'monster_sighting',
                col: s.plan.centerCol + Math.floor((rand() - 0.5) * 20),
                row: s.plan.centerRow + Math.floor((rand() - 0.5) * 20),
                description: `Near ${s.plan.name}, ${pickDesc(MONSTER_DESCS, rand)}.`,
            });
        }
    }
    // ── Turns 26–40: Trade ────────────────────────────────────────────────────
    for (let turn = 26; turn <= 40; turn++) {
        if (rand() < 0.35 && settlements.length >= 2) {
            const ia = Math.floor(rand() * settlements.length);
            let ib = Math.floor(rand() * settlements.length);
            if (ib === ia)
                ib = (ib + 1) % settlements.length;
            const sa = settlements[ia];
            const sb = settlements[ib];
            events.push({
                turn,
                type: 'trade_route_established',
                col: Math.round((sa.plan.centerCol + sb.plan.centerCol) / 2),
                row: Math.round((sa.plan.centerRow + sb.plan.centerRow) / 2),
                description: `${sa.plan.name} and ${sb.plan.name} ${pickDesc(TRADE_DESCS, rand)}.`,
            });
        }
    }
    // ── Turns 41–49: Magical Anomalies ────────────────────────────────────────
    const anomalyCount = Math.min(3, dungeons.length);
    for (let i = 0; i < anomalyCount; i++) {
        const d = dungeons[Math.floor(rand() * dungeons.length)];
        events.push({
            turn: 41 + Math.floor(rand() * 9),
            type: 'magical_anomaly',
            col: d.col,
            row: d.row,
            description: `Near ${d.name}, ${pickDesc(ANOMALY_DESCS, rand)}.`,
        });
    }
    events.sort((a, b) => a.turn - b.turn);
    return { factions, events };
}
// ── Query helpers ─────────────────────────────────────────────────────────────
/** Events within `radiusTiles` of (col, row), optionally filtered by type. */
export function eventsNear(events, col, row, radiusTiles, type) {
    const r2 = radiusTiles * radiusTiles;
    return events.filter(e => {
        const dc = e.col - col;
        const dr = e.row - row;
        return dc * dc + dr * dr <= r2 && (type == null || e.type === type);
    });
}
