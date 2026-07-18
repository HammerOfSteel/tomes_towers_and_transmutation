import { describe, expect, it } from 'vitest';
import { cellToWorld } from '@/levels/blueprint';
import { EditorGrid } from '@/editor/EditorGrid';
// ── Fixtures ──────────────────────────────────────────────────────────────
/** A minimal valid Blueprint for round-trip tests. */
const SAMPLE_BP = {
    id: 'sample',
    version: 1,
    width: 5,
    depth: 5,
    cellSize: 2,
    wallHeight: 3,
    floor: 0,
    tiles: [
        { x: 0, z: 0, type: 'wall' }, { x: 1, z: 0, type: 'wall' },
        { x: 2, z: 0, type: 'wall' }, { x: 3, z: 0, type: 'wall' },
        { x: 4, z: 0, type: 'wall' },
        { x: 0, z: 1, type: 'wall' }, { x: 4, z: 1, type: 'wall' },
        { x: 0, z: 2, type: 'wall' }, { x: 4, z: 2, type: 'wall' },
        { x: 0, z: 3, type: 'wall' }, { x: 4, z: 3, type: 'wall' },
        { x: 0, z: 4, type: 'wall' }, { x: 1, z: 4, type: 'wall' },
        { x: 2, z: 4, type: 'wall' }, { x: 3, z: 4, type: 'wall' },
        { x: 4, z: 4, type: 'wall' },
    ],
    doors: [],
    spawns: [],
    interactables: [],
    staircases: [],
};
// ── Constructor ───────────────────────────────────────────────────────────
describe('EditorGrid constructor', () => {
    it('builds border walls automatically for a 5×5 grid', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        const bp = g.toBlueprint();
        const keys = new Set(bp.tiles.map((t) => `${t.x},${t.z}`));
        // All four edges
        for (let x = 0; x < 5; x++) {
            expect(keys.has(`${x},0`), `north wall at x=${x}`).toBe(true);
            expect(keys.has(`${x},4`), `south wall at x=${x}`).toBe(true);
        }
        for (let z = 1; z < 4; z++) {
            expect(keys.has(`0,${z}`), `west wall at z=${z}`).toBe(true);
            expect(keys.has(`4,${z}`), `east wall at z=${z}`).toBe(true);
        }
        // Interior should be empty
        expect(keys.has('2,2')).toBe(false);
    });
    it('clamps minimum size to 3×3', () => {
        const g = new EditorGrid('r', 1, 1, 0);
        expect(g.width).toBe(3);
        expect(g.depth).toBe(3);
    });
    it('truncates non-integer floor values', () => {
        const g = new EditorGrid('r', 5, 5, 1.7);
        expect(g.floor).toBe(1);
    });
});
// ── fromBlueprint / toBlueprint round-trip ────────────────────────────────
describe('EditorGrid.fromBlueprint / toBlueprint', () => {
    it('preserves all tiles from the source blueprint', () => {
        const g = EditorGrid.fromBlueprint(SAMPLE_BP);
        const bp = g.toBlueprint();
        expect(bp.tiles).toHaveLength(SAMPLE_BP.tiles.length);
    });
    it('preserves id, width, depth, floor', () => {
        const g = EditorGrid.fromBlueprint(SAMPLE_BP);
        const bp = g.toBlueprint();
        expect(bp.id).toBe(SAMPLE_BP.id);
        expect(bp.width).toBe(SAMPLE_BP.width);
        expect(bp.depth).toBe(SAMPLE_BP.depth);
        expect(bp.floor).toBe(SAMPLE_BP.floor);
    });
    it('preserves doors, spawns, interactables, staircases', () => {
        const rich = {
            ...SAMPLE_BP,
            id: 'rich',
            doors: [{ x: 2, z: 0, facing: 'north', targetId: 'other' }],
            spawns: [{ x: 2, z: 2, type: 'slime' }],
            interactables: [{ x: 1, z: 2, type: 'bookshelf', content: 'Tome I' }],
            staircases: [{ x: 3, z: 2, facing: 'east', direction: 'up', targetId: null }],
        };
        const g = EditorGrid.fromBlueprint(rich);
        const bp = g.toBlueprint();
        expect(bp.doors).toHaveLength(1);
        expect(bp.spawns).toHaveLength(1);
        expect(bp.interactables).toHaveLength(1);
        expect(bp.staircases).toHaveLength(1);
    });
});
// ── place ─────────────────────────────────────────────────────────────────
describe('EditorGrid.place', () => {
    it('places a wall tile at a given cell', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(2, 2, 'wall');
        const bp = g.toBlueprint();
        expect(bp.tiles.some((t) => t.x === 2 && t.z === 2 && t.type === 'wall')).toBe(true);
    });
    it('places a pillar tile', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(2, 2, 'pillar');
        expect(g.toBlueprint().tiles.some((t) => t.x === 2 && t.z === 2 && t.type === 'pillar')).toBe(true);
    });
    it('places a door with facing and targetId', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(2, 0, 'door', { facing: 'north', targetId: 'room_b' });
        const bp = g.toBlueprint();
        expect(bp.doors).toHaveLength(1);
        expect(bp.doors[0]).toMatchObject({ x: 2, z: 0, facing: 'north', targetId: 'room_b' });
    });
    it('places a spawn', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(2, 2, 'spawn');
        expect(g.toBlueprint().spawns.some((s) => s.x === 2 && s.z === 2)).toBe(true);
    });
    it('places a bookshelf with content', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(1, 2, 'bookshelf', { content: 'A great book.' });
        const bp = g.toBlueprint();
        expect(bp.interactables.some((i) => i.x === 1 && i.z === 2 && i.content === 'A great book.')).toBe(true);
    });
    it('places a staircase with direction and facing', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(3, 0, 'staircase', { facing: 'north', direction: 'up', targetId: 'floor_1' });
        const bp = g.toBlueprint();
        expect(bp.staircases).toHaveLength(1);
        expect(bp.staircases[0]).toMatchObject({ direction: 'up', facing: 'north', targetId: 'floor_1' });
    });
    it('clears any existing entity before placing a new one at the same cell', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(2, 2, 'wall');
        g.place(2, 2, 'spawn');
        const bp = g.toBlueprint();
        expect(bp.tiles.some((t) => t.x === 2 && t.z === 2)).toBe(false);
        expect(bp.spawns.some((s) => s.x === 2 && s.z === 2)).toBe(true);
    });
    it('ignores out-of-bounds placement without throwing', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        const before = g.toBlueprint().tiles.length;
        expect(() => g.place(99, 99, 'wall')).not.toThrow();
        expect(g.toBlueprint().tiles.length).toBe(before);
    });
    it("'erase' kind removes only the entity, not neighbouring cells", () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(2, 2, 'spawn');
        g.place(2, 2, 'erase');
        expect(g.toBlueprint().spawns).toHaveLength(0);
        // Border walls should still exist
        expect(g.toBlueprint().tiles.length).toBeGreaterThan(0);
    });
});
// ── erase ─────────────────────────────────────────────────────────────────
describe('EditorGrid.erase', () => {
    it('removes all entity types at a cell', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        g.place(2, 2, 'spawn');
        g.erase(2, 2);
        expect(g.toBlueprint().spawns).toHaveLength(0);
    });
    it('does not throw when erasing an empty cell', () => {
        const g = new EditorGrid('r', 5, 5, 0);
        expect(() => g.erase(2, 2)).not.toThrow();
    });
});
// ── resize ────────────────────────────────────────────────────────────────
describe('EditorGrid.resize', () => {
    it('removes cells that fall outside the new bounds', () => {
        const g = new EditorGrid('r', 7, 7, 0);
        g.place(6, 6, 'spawn');
        g.resize(5, 5);
        expect(g.toBlueprint().spawns).toHaveLength(0);
    });
    it('keeps cells that are still within bounds', () => {
        const g = new EditorGrid('r', 7, 7, 0);
        g.place(2, 2, 'spawn');
        g.resize(5, 5);
        expect(g.toBlueprint().spawns.some((s) => s.x === 2 && s.z === 2)).toBe(true);
    });
    it('updates width and depth accessors', () => {
        const g = new EditorGrid('r', 7, 7, 0);
        g.resize(5, 9);
        expect(g.width).toBe(5);
        expect(g.depth).toBe(9);
    });
});
// ── serialize / deserialize ───────────────────────────────────────────────
describe('EditorGrid serialize / deserialize', () => {
    it('round-trips id, floor, and placed entities', () => {
        const g = new EditorGrid('level_2b', 5, 5, -1);
        g.place(1, 1, 'spawn');
        g.place(3, 2, 'bookshelf', { content: 'Scroll of Rebinding' });
        const json = g.serialize();
        const g2 = EditorGrid.deserialize(json);
        expect(g2.id).toBe('level_2b');
        expect(g2.floor).toBe(-1);
        const bp = g2.toBlueprint();
        expect(bp.spawns.some((s) => s.x === 1 && s.z === 1)).toBe(true);
        expect(bp.interactables.some((i) => i.content === 'Scroll of Rebinding')).toBe(true);
    });
    it('throws when deserializing malformed JSON', () => {
        expect(() => EditorGrid.deserialize('not json')).toThrow();
    });
});
// ── validate ──────────────────────────────────────────────────────────────
describe('EditorGrid.validate', () => {
    it('returns null for a default (border-walled) grid', () => {
        const g = new EditorGrid('room', 5, 5, 0);
        expect(g.validate()).toBeNull();
    });
    it('returns an error string for an invalid state', () => {
        // Force a bad id type via the mutable setter to get a validation failure
        const g = new EditorGrid('room', 5, 5, 0);
        g.id = ''; // empty id should fail validation
        const err = g.validate();
        expect(typeof err).toBe('string');
        expect(err.length).toBeGreaterThan(0);
    });
});
// ── Grid coordinate snapping (cellToWorld) ────────────────────────────────
describe('Grid coordinate snapping', () => {
    it('cell (0,0) is within 0.001 units of the expected top-left cell centre', () => {
        const g = new EditorGrid('r', 7, 7, 0);
        const bp = g.toBlueprint();
        const { x, z } = cellToWorld(0, 0, bp);
        const expectedX = -(bp.width * bp.cellSize) / 2 + bp.cellSize / 2;
        const expectedZ = -(bp.depth * bp.cellSize) / 2 + bp.cellSize / 2;
        expect(Math.abs(x - expectedX)).toBeLessThan(0.001);
        expect(Math.abs(z - expectedZ)).toBeLessThan(0.001);
    });
    it('cell (w-1, d-1) is within 0.001 units of the expected bottom-right cell centre', () => {
        const g = new EditorGrid('r', 7, 7, 0);
        const bp = g.toBlueprint();
        const { x, z } = cellToWorld(bp.width - 1, bp.depth - 1, bp);
        const expectedX = (bp.width * bp.cellSize) / 2 - bp.cellSize / 2;
        const expectedZ = (bp.depth * bp.cellSize) / 2 - bp.cellSize / 2;
        expect(Math.abs(x - expectedX)).toBeLessThan(0.001);
        expect(Math.abs(z - expectedZ)).toBeLessThan(0.001);
    });
});
