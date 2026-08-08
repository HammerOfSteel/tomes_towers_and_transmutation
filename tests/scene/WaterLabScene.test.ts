import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { ParticleSystem } from '@/rendering/ParticleSystem';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { WaterLabScene } from '@/scene/WaterLabScene';

describe('WaterLabScene water variant', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let player: PlayerController;
  let particles: ParticleSystem;
  let lab: WaterLabScene;

  beforeAll(async () => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    particles = new ParticleSystem(scene);
    lab = new WaterLabScene(scene, physics, player, particles);
  });

  it('defaults to the stylized (see-through) variant on enter()', () => {
    lab.enter();
    const waterMesh = scene.children.find(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && (c.material as THREE.ShaderMaterial).uniforms?.uTime !== undefined,
    );
    expect(waterMesh).toBeDefined();
    expect((waterMesh!.material as THREE.ShaderMaterial).transparent).toBe(true);
  });

  it('switches to reflective and flow-refractive variants without throwing', () => {
    expect(() => lab.setWaterVariant('reflective')).not.toThrow();
    expect(() => lab.setWaterVariant('flow-refractive')).not.toThrow();
    expect(() => lab.setWaterVariant('stylized')).not.toThrow();
    lab.exit();
  });
});

describe('WaterLabScene swim/wade hysteresis', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let player: PlayerController;
  let particles: ParticleSystem;
  let lab: WaterLabScene;

  beforeAll(async () => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    particles = new ParticleSystem(scene);
    lab = new WaterLabScene(scene, physics, player, particles);
    lab.enter();
  });

  it('does not flicker swim state once the buoyancy float settles (regression: previous underdamped spring + single-threshold check caused a hunting loop)', () => {
    // Teleport onto the deep floor (well past the enter threshold) so swim
    // mode engages, then let buoyancy settle toward its float depth.
    player.teleport(new THREE.Vector3(0, -1.2, 0));
    let sawSwim = false;
    let flickerCount = 0;
    let lastSwimming: boolean | null = null;
    for (let i = 0; i < 300; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(
        { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any,
        1 / 60,
        'isometric',
      );
      const swimming = player.isSwimming;
      if (swimming) sawSwim = true;
      // Only count transitions after the first ~30 frames (allow the
      // initial dive-in transient to settle) — a hunting loop would keep
      // flickering indefinitely, while a one-time settle transition is fine.
      if (i > 30 && lastSwimming !== null && swimming !== lastSwimming) flickerCount++;
      lastSwimming = swimming;
    }
    expect(sawSwim).toBe(true);
    expect(flickerCount).toBe(0);
  });
});
