import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';

describe('PlayerController.setSubmersion', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('shifts the active rig root downward proportionally to depthFraction', () => {
    const rigRoot = (player as any)._creatureRig.root as THREE.Object3D;
    const baseY = rigRoot.position.y;

    player.setSubmersion(0.4);
    const submergedY = rigRoot.position.y;
    expect(submergedY).toBeLessThan(baseY);

    player.setSubmersion(0);
    expect(rigRoot.position.y).toBeCloseTo(baseY, 5);
  });

  it('does not compound offset across repeated calls at the same depth', () => {
    const rigRoot = (player as any)._creatureRig.root as THREE.Object3D;
    player.setSubmersion(0.4);
    const first = rigRoot.position.y;
    player.setSubmersion(0.4);
    const second = rigRoot.position.y;
    expect(second).toBeCloseTo(first, 5);
    player.setSubmersion(0); // reset for other tests
  });

  it('adds a submerged-only PointLight as a child of the active rig, fading in with depth', () => {
    player.setSubmersion(0);
    const rigRoot = (player as any)._creatureRig.root as THREE.Object3D;
    const glow = (player as any)._submergedGlow as THREE.PointLight;
    expect(glow).toBeInstanceOf(THREE.PointLight);
    expect(rigRoot.children).toContain(glow);
    expect(glow.intensity).toBe(0); // dry — no glow

    player.setSubmersion(1.0);
    expect(glow.intensity).toBeGreaterThan(0);

    player.setSubmersion(0); // reset for other tests
    expect(glow.intensity).toBe(0);
  });
});
