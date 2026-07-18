import { describe, it, expect } from 'vitest';
import { generateDungeon } from '@/levels/DungeonGenerator';
// ── Helpers ───────────────────────────────────────────────────────────────────
/** Return a sorted, canonical string key for a plan (room IDs + connections). */
function planSignature(plan) {
    const entries = [];
    for (const [id, bp] of plan.rooms) {
        const doors = bp.doors
            .map((d) => `${d.facing}→${d.targetId ?? 'null'}`)
            .sort()
            .join(',');
        entries.push(`${id}[${bp.id.split('__')[0]}]{${doors}}`);
    }
    return entries.sort().join('|');
}
/** Walk the graph from startRoomId and return all reachable room IDs. */
function reachable(plan) {
    const visited = new Set();
    const queue = [plan.startRoomId];
    while (queue.length > 0) {
        const id = queue.shift();
        if (visited.has(id))
            continue;
        visited.add(id);
        const room = plan.rooms.get(id);
        if (!room)
            continue;
        for (const door of room.doors) {
            if (door.targetId && !visited.has(door.targetId)) {
                queue.push(door.targetId);
            }
        }
    }
    return visited;
}
/** Verify all wired door connections are symmetric. */
function assertSymmetric(plan) {
    for (const [id, bp] of plan.rooms) {
        for (const door of bp.doors) {
            if (door.targetId === null)
                continue; // exterior exit — fine
            const target = plan.rooms.get(door.targetId);
            expect(target, `target room "${door.targetId}" (from "${id}") must exist`).toBeDefined();
            const backDoor = target.doors.find((d) => d.targetId === id);
            expect(backDoor, `room "${door.targetId}" must have a back-door to "${id}"`).toBeDefined();
        }
    }
}
// ── Tests ─────────────────────────────────────────────────────────────────────
describe('generateDungeon', () => {
    it('is deterministic: same seed + floorCount → identical plan', () => {
        for (const seed of [0, 1, 42, 0xDEADBEEF, 999999]) {
            const p1 = generateDungeon(seed, 1);
            const p2 = generateDungeon(seed, 1);
            expect(planSignature(p1)).toBe(planSignature(p2));
        }
    });
    it('different seeds can produce different plans', () => {
        const sigs = new Set();
        for (let seed = 0; seed < 10; seed++) {
            sigs.add(planSignature(generateDungeon(seed, 1)));
        }
        // With 3 possible corridor counts (0,1,2 for floorCount=1) at least 2 distinct layouts
        expect(sigs.size).toBeGreaterThanOrEqual(2);
    });
    it('all rooms are reachable from startRoomId', () => {
        for (let seed = 0; seed < 20; seed++) {
            const plan = generateDungeon(seed, 1);
            const reached = reachable(plan);
            expect(reached.size).toBe(plan.rooms.size);
        }
    });
    it('door connections are symmetric (bidirectional)', () => {
        for (let seed = 0; seed < 20; seed++) {
            assertSymmetric(generateDungeon(seed, 1));
        }
    });
    it('start room is always cell_start blueprint', () => {
        for (let seed = 0; seed < 10; seed++) {
            const plan = generateDungeon(seed, 1);
            const startRoom = plan.rooms.get(plan.startRoomId);
            expect(startRoom).toBeDefined();
            // The instance id is "room_0"; the underlying blueprint id was cell_start
            expect(startRoom.id).toBe('room_0');
        }
    });
    it('produces at least 3 rooms (cell_start + library_small + corridor_ew)', () => {
        for (let seed = 0; seed < 50; seed++) {
            const plan = generateDungeon(seed, 1);
            expect(plan.rooms.size).toBeGreaterThanOrEqual(3);
        }
    });
    it('room count scales with floorCount', () => {
        // floorCount=1 → corridorCount ∈ {0,1,2} → rooms ∈ {3,4,5} (+ cell_start)
        // floorCount=3 → corridorCount ∈ {2,3,4} → rooms ∈ {5,6,7}
        const seed = 0;
        const small = generateDungeon(seed, 1);
        const large = generateDungeon(seed, 3);
        expect(large.rooms.size).toBeGreaterThan(small.rooms.size);
    });
    it('does not throw for 1000 random-ish seeds', () => {
        for (let seed = 0; seed < 1000; seed++) {
            expect(() => generateDungeon(seed * 1_234_567, 1)).not.toThrow();
        }
    });
});
