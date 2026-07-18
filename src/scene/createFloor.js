import * as THREE from 'three';
import { stoneFloorVert, stoneFloorFrag } from '@/shaders/stoneFloor';
/** Creates the flat procedural floor: a Three.js mesh with the stone-noise
 *  shader and a matching static Rapier box collider.
 *
 *  @param size   Width and depth of the floor in world units.
 *  @param physics PhysicsWorld to register the static collider with.
 */
export function createFloor(size, physics) {
    // ── Geometry ──────────────────────────────────────────────────────────────
    // PlaneGeometry lies in the XY plane — rotate 90° to lay flat on XZ.
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    // ── Material (procedural stone noise shader) ───────────────────────────────
    const mat = new THREE.ShaderMaterial({
        vertexShader: stoneFloorVert,
        fragmentShader: stoneFloorFrag,
        side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.position.y = 0;
    // ── Physics collider ───────────────────────────────────────────────────────
    // A flat 5cm-thick box spanning the full floor area.
    physics.createStaticBox(new THREE.Vector3(0, -0.025, 0), new THREE.Vector3(size / 2, 0.025, size / 2));
    return { mesh };
}
