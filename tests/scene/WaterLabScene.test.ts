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
    // Use the princess rig, not the DNA creature fallback — this is what
    // enterWaterLab() actually applies in production (main.ts calls
    // applyPrincess by default), and it has different proportions than the
    // creature rig, which matters for the visual-submersion regression
    // test below (a creature-rig-only test previously passed even with the
    // real bug still present).
    const { defaultDna } = await import('@/princess-creator/dna');
    await player.applyPrincess(defaultDna('human'));
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

  it('keeps the active visual rig visibly above the water surface while floating (regression: setSubmersion(1.0) sank the whole rig ~0.68 WU, burying the head/shoulders under the drawn water surface even though SWIM_FLOAT_DEPTH looked fine on the physics origin alone)', () => {
    // Same settle as above — by now the player should be floating at
    // SWIM_FLOAT_DEPTH with swim mode engaged.
    expect(player.isSwimming).toBe(true);
    const activeRoot: THREE.Object3D =
      (player as any)._creatureRig?.root ?? (player as any)._princessInstance?.root
      ?? (player as any)._charController?.scene ?? (player as any).bodyMesh;
    const box = new THREE.Box3().setFromObject(activeRoot);
    // WATER_LAB_SURFACE_Y is 0 — the rig's highest point must clear it by a
    // real margin. 0.15 only broke the *hair-tip* through the surface (the
    // "just the very top of her head" follow-up complaint); the whole head
    // needs to clear so she reads as actually swimming, not drowning at the
    // neck, from isometric/WoW camera angles (OOT/SM64-style readability).
    expect(box.max.y).toBeGreaterThan(0.5);
  });
});
