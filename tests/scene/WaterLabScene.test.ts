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
