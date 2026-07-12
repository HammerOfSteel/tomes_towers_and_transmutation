import * as THREE from 'three';

/** Convert a Rapier translation ({x,y,z}) to a Three.js Vector3. */
export function rapierToThree(v: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** Copy a Rapier translation into an existing Three.js Vector3 (avoids allocation). */
export function rapierToThreeInto(
  v: { x: number; y: number; z: number },
  out: THREE.Vector3,
): THREE.Vector3 {
  return out.set(v.x, v.y, v.z);
}

/** Convert a Three.js Vector3 to a plain Rapier-compatible {x,y,z} object. */
export function threeToRapier(v: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: v.y, z: v.z };
}
