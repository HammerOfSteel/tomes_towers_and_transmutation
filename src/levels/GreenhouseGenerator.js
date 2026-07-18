// ── GreenhouseGenerator ────────────────────────────────────────────────────────
//
//  Generates the "Ruined Greenhouse" interior as a DungeonPlan with a single
//  circular chamber (11×11 grid, approximate radius 4 cells).
//
//  Room features:
//    • Circular wall boundary — wall tiles fill every cell with r² > 16
//    • Greenhouse orb at centre (5, 5)
//    • Two lecterns with plant lore at opposite quadrants
//    • Three slime spawns scattered inside the circle
//    • One exit door on the south wall (targetId: null → onExitTrigger → overworld)
import { BLUEPRINT_VERSION, } from './blueprint';
// ── Constants ─────────────────────────────────────────────────────────────────
const W = 11; // grid width  (X)
const D = 11; // grid depth  (Z)
const CX = 5; // centre column
const CZ = 5; // centre row
const R2 = 16; // radius² — cells with dx²+dz² > R2 become walls
const ROOM_ID = 'greenhouse_interior';
// ── Helpers ───────────────────────────────────────────────────────────────────
/** True if the cell at (x, z) is inside the circular floor area. */
function isFloor(x, z) {
    const dx = x - CX;
    const dz = z - CZ;
    return dx * dx + dz * dz <= R2;
}
// ── Generator ─────────────────────────────────────────────────────────────────
/**
 * Build a single-room DungeonPlan for the Ruined Greenhouse interior.
 *
 * @param _seed - Reserved for future procedural variation (currently unused).
 */
export function generateGreenhouse(_seed) {
    // Build wall tiles — every cell outside the circle
    const tiles = [];
    for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
            if (!isFloor(x, z)) {
                tiles.push({ x, z, type: 'wall' });
            }
        }
    }
    const room = {
        id: ROOM_ID,
        version: BLUEPRINT_VERSION,
        width: W,
        depth: D,
        cellSize: 2,
        wallHeight: 3.5,
        floorType: 'grass',
        floor: 0,
        tiles,
        doors: [
            // South exit — leads back to the overworld
            { x: CX, z: D - 1, facing: 'south', targetId: null },
        ],
        staircases: [],
        spawns: [
            // Three slimes scattered across the chamber
            { x: 3, z: 3, type: 'slime' },
            { x: 7, z: 4, type: 'slime' },
            { x: 4, z: 8, type: 'slime' },
        ],
        interactables: [
            // The Greenhouse Orb — centrepiece of the chamber
            {
                x: CX,
                z: CZ,
                type: 'greenhouse_orb',
                content: 'A crystalline orb pulses with slow green light.  Ancient runes etched '
                    + 'around its base speak of a garden that grew without sun — tended by '
                    + 'creatures of living water and curious mind.',
            },
            // Plant lore lecterns in the NW and NE quadrants
            {
                x: 2,
                z: 3,
                type: 'lectern',
                content: '"On the Cultivation of Sapient Fungi: given adequate moonlight and '
                    + 'the song of a willing slime, the Moonspore Bloom may be coaxed to '
                    + 'yield its spores without harm to the colony."',
                rotation: 90,
            },
            {
                x: 8,
                z: 3,
                type: 'lectern',
                content: '"The Slimewort vine requires no soil — only warmth, moisture, and '
                    + 'the patient presence of a creature that neither fears nor hungers.  '
                    + 'Plant it near a friendly slime and return after seven rains."',
                rotation: 270,
            },
        ],
    };
    const rooms = new Map();
    rooms.set(ROOM_ID, room);
    return { rooms, startRoomId: ROOM_ID, seed: _seed };
}
