// ── SandboxArena ──────────────────────────────────────────────────────────────
//
//  Generates a DungeonPlan containing a single large, open, enemy-free
//  arena room.  Used exclusively by the Dev Sandbox mode.
//
//  Room layout: 14×14 grid, cellSize=2 → 28×28 world units.
//  All perimeter tiles are walls; interior is open floor.
function buildSandboxBlueprint() {
    const W = 14;
    const D = 14;
    const tiles = [];
    // Perimeter walls
    for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
            if (x === 0 || x === W - 1 || z === 0 || z === D - 1) {
                tiles.push({ x, z, type: 'wall' });
            }
        }
    }
    return {
        id: 'sandbox_arena',
        version: 1,
        width: W,
        depth: D,
        cellSize: 2,
        wallHeight: 4,
        tiles,
        doors: [],
        spawns: [],
        staircases: [],
        interactables: [],
        floor: 0,
    };
}
/** Returns a DungeonPlan with a single open 14×14 arena room. */
export function generateSandboxArena() {
    const bp = buildSandboxBlueprint();
    const rooms = new Map([[bp.id, bp]]);
    return { rooms, startRoomId: bp.id, seed: 0xDE75A1D };
}
