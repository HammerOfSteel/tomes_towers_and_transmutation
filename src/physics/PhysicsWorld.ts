import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/** Wraps a Rapier3D world, owning initialization and the fixed-timestep step.
 *
 * Call `await physicsWorld.init()` before using any other method.
 * Call `step(dt)` once per frame (before moving kinematic bodies).
 */
export class PhysicsWorld {
  private world!: RAPIER.World;

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  /** Step the simulation by dt seconds. */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  // ── Factory helpers ────────────────────────────────────────────────────────

  /** Create a fixed (immovable) box collider centred at `position`.
   *  `halfExtents` maps to the box half-widths on each axis. */
  createStaticBox(position: THREE.Vector3, halfExtents: THREE.Vector3): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z,
    );
    this.world.createCollider(colliderDesc, body);
    return body;
  }

  /** Create a kinematic-position-based capsule body for the player.
   *  `halfHeight` = half the height of the cylindrical portion.
   *  `radius`     = hemisphere radius.
   *  Total capsule height = 2*halfHeight + 2*radius. */
  createKinematicCapsule(
    position: THREE.Vector3,
    halfHeight: number,
    radius: number,
  ): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  /** Create a KinematicCharacterController with the given skin offset. */
  createCharacterController(offset: number): RAPIER.KinematicCharacterController {
    return this.world.createCharacterController(offset);
  }

  /**
   * Create a large flat static plane centred at y = `elevation`.
   * Used as the exterior ground surface so the player doesn't fall infinitely.
   * The plane is 1000×1000 units — effectively infinite for our world sizes.
   */
  createGroundPlane(elevation = 0): RAPIER.RigidBody {
    return this.createStaticBox(
      new THREE.Vector3(0, elevation - 0.5, 0),
      new THREE.Vector3(500, 0.5, 500),
    );
  }

  /** Raw Rapier world — use sparingly; prefer the factory helpers above. */
  get rapierWorld(): RAPIER.World {
    return this.world;
  }
}
