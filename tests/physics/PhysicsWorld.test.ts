import { describe, it, expect, beforeAll } from 'vitest';
import { PhysicsWorld } from '@/physics/PhysicsWorld';

describe('PhysicsWorld.createStaticTrimesh', () => {
  let physics: PhysicsWorld;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });

  it('creates a fixed rigid body with a trimesh collider from vertex/index buffers', () => {
    // A single flat quad (two triangles) at y=0, spanning x:[0,1], z:[0,1].
    const vertices = new Float32Array([
      0, 0, 0,   1, 0, 0,   0, 0, 1,   1, 0, 1,
    ]);
    const indices = new Uint32Array([0, 1, 2,  1, 3, 2]);

    const bodiesBefore = physics.rapierWorld.bodies.len();
    const body = physics.createStaticTrimesh(vertices, indices);

    expect(physics.rapierWorld.bodies.len()).toBe(bodiesBefore + 1);
    expect(body.bodyType()).toBe(1); // RAPIER.RigidBodyType.Fixed === 1
    expect(body.numColliders()).toBe(1);

    const collider = body.collider(0);
    expect(collider).toBeTruthy();
  });
});
