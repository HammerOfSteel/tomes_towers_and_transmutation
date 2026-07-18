import * as THREE from 'three';
/** Convert a Rapier translation ({x,y,z}) to a Three.js Vector3. */
export function rapierToThree(v) {
    return new THREE.Vector3(v.x, v.y, v.z);
}
/** Copy a Rapier translation into an existing Three.js Vector3 (avoids allocation). */
export function rapierToThreeInto(v, out) {
    return out.set(v.x, v.y, v.z);
}
/** Convert a Three.js Vector3 to a plain Rapier-compatible {x,y,z} object. */
export function threeToRapier(v) {
    return { x: v.x, y: v.y, z: v.z };
}
