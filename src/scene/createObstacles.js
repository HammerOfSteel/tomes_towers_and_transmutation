import * as THREE from 'three';
import { PALETTE } from '@/shaders/palette';
/** A handful of boxes scattered around the spawn area so the player can
 *  immediately test wall-sliding and collision from the first playtest. */
const OBSTACLE_DEFS = [
    { position: [6, 0.5, 1], size: [2, 1, 2] },
    { position: [-5, 1, -3], size: [2, 2, 2] },
    { position: [0, 0.5, 8], size: [5, 1, 2] },
    { position: [4, 0.75, -5], size: [1.5, 1.5, 1.5] },
    { position: [-8, 1.5, 3], size: [1, 3, 3] },
    { position: [3, 0.5, -2], size: [1, 1, 1] },
    // L-shaped wall stub for testing wall-slide at an angle
    { position: [-3, 0.5, 6], size: [4, 1, 0.5] },
    { position: [-3, 0.5, 7.75], size: [0.5, 1, 3] },
];
const sharedMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.STONE_MID });
/** Instantiates all obstacle meshes and their static physics colliders.
 *  Returns the meshes array so the caller can add them to the scene. */
export function createObstacles(physics) {
    return OBSTACLE_DEFS.map(({ position: [px, py, pz], size: [sx, sy, sz] }) => {
        // Three.js mesh
        const geo = new THREE.BoxGeometry(sx, sy, sz);
        const mesh = new THREE.Mesh(geo, sharedMaterial);
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Rapier static collider (half-extents)
        physics.createStaticBox(new THREE.Vector3(px, py, pz), new THREE.Vector3(sx / 2, sy / 2, sz / 2));
        return mesh;
    });
}
