import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import type { InputState } from '@/core/InputManager';

function neutralInput(): InputState {
  return {
    moveForward: false, moveBackward: false, moveLeft: false, moveRight: false,
    jump: false, run: false, dodge: false, interact: false,
    turnDragHeld: false,
  } as InputState;
}

describe('PlayerController.setSwimming', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('exposes isSwimming reflecting the last setSwimming call', () => {
    expect(player.isSwimming).toBe(false);
    player.setSwimming(true);
    expect(player.isSwimming).toBe(true);
    player.setSwimming(false);
    expect(player.isSwimming).toBe(false);
  });

  it('clamps horizontal speed to SWIM_SPEED (slower than WALK_SPEED) while swimming', () => {
    player.setSwimming(true);
    const input = { ...neutralInput(), moveForward: true, run: true };
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 60);
      player.update(input, 1 / 60, 'isometric');
    }
    const hSpeed = Math.sqrt((player as any).velocity.x ** 2 + (player as any).velocity.z ** 2);
    expect(hSpeed).toBeLessThan(5); // WALK_SPEED — even with run held, swim caps below walk
    expect(hSpeed).toBeGreaterThan(0);
  });

  it('disables jump while swimming (velocity.y never gets a jump impulse)', () => {
    player.setSwimming(true);
    const input = { ...neutralInput(), jump: true };
    physics.step(1 / 60);
    player.update(input, 1 / 60, 'isometric');
    expect((player as any).velocity.y).toBeLessThan(11); // JUMP_VELOCITY — no jump impulse applied
  });

  it('restores normal gravity behavior once swimming is turned off', () => {
    player.setSwimming(true);
    for (let i = 0; i < 10; i++) {
      physics.step(1 / 60);
      player.update(neutralInput(), 1 / 60, 'isometric');
    }
    player.setSwimming(false);
    const before = (player as any).velocity.y;
    for (let i = 0; i < 10; i++) {
      physics.step(1 / 60);
      player.update(neutralInput(), 1 / 60, 'isometric');
    }
    // Normal gravity (GRAVITY_FALL) should now be pulling velocity.y down
    // faster than the gentle swim-float ease did.
    expect((player as any).velocity.y).toBeLessThan(before);
  });
});
