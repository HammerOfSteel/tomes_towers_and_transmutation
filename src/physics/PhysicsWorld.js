import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
/** Wraps a Rapier3D world, owning initialization and the fixed-timestep step.
 *
 * Call `await physicsWorld.init()` before using any other method.
 * Call `step(dt)` once per frame (before moving kinematic bodies).
 */
export class PhysicsWorld {
    world;
    async init() {
        await RAPIER.init();
        this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    }
    /** Step the simulation by dt seconds. */
    step(dt) {
        this.world.timestep = dt;
        this.world.step();
    }
    // ── Factory helpers ────────────────────────────────────────────────────────
    /** Create a fixed (immovable) box collider centred at `position`.
     *  `halfExtents` maps to the box half-widths on each axis. */
    createStaticBox(position, halfExtents) {
        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z);
        const body = this.world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
        this.world.createCollider(colliderDesc, body);
        return body;
    }
    /** Create a fixed box collider with an arbitrary orientation.
     *  `rotation` is a THREE.Quaternion; `halfExtents` are in the body's local frame.
     *  Used for arc wall segments that must be tangent to the circular chamber. */
    createStaticRotatedBox(position, rotation, halfExtents) {
        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(position.x, position.y, position.z)
            .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
        const body = this.world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
        this.world.createCollider(colliderDesc, body);
        return body;
    }
    /** Create a kinematic-position-based capsule body for the player.
     *  `halfHeight` = half the height of the cylindrical portion.
     *  `radius`     = hemisphere radius.
     *  Total capsule height = 2*halfHeight + 2*radius. */
    createKinematicCapsule(position, halfHeight, radius) {
        const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z);
        const body = this.world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
        const collider = this.world.createCollider(colliderDesc, body);
        return { body, collider };
    }
    /** Create a KinematicCharacterController with the given skin offset. */
    createCharacterController(offset) {
        return this.world.createCharacterController(offset);
    }
    /**
     * Create a large flat static plane centred at y = `elevation`.
     * Used as the exterior ground surface so the player doesn't fall infinitely.
     * The plane is 1000×1000 units — effectively infinite for our world sizes.
     */
    createGroundPlane(elevation = 0) {
        return this.createStaticBox(new THREE.Vector3(0, elevation - 0.5, 0), new THREE.Vector3(500, 0.5, 500));
    }
    /** Raw Rapier world — use sparingly; prefer the factory helpers above. */
    get rapierWorld() {
        return this.world;
    }
    /**
     * Cast a ray against static (fixed) colliders only — walls, tiles, floors.
     * Kinematic bodies (player, enemies) are excluded so projectiles pass through them.
     * Returns the time-of-impact (= distance along the ray in world units) of the
     * first hit, or null if the ray travels `maxDist` without hitting anything solid.
     */
    castRayVsWalls(origin, dir, maxDist) {
        const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
        const hit = this.world.castRay(ray, maxDist, true, // solidShape — treat solid interiors as hits
        undefined, // filterFlags
        undefined, // filterGroups (all groups)
        undefined, // excludeCollider
        undefined, // excludeRigidBody
        (collider) => {
            const body = collider.parent();
            return body !== null && body.bodyType() === RAPIER.RigidBodyType.Fixed;
        });
        return hit !== null ? hit.timeOfImpact : null;
    }
}
