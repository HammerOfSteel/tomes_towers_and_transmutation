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

  it('settles toward the float depth without oscillating (critically damped, not bobbing)', () => {
    // Start well below the float target (e.g. just off the deep floor) so
    // there's a real distance for the buoyancy spring to settle over.
    player.teleport(new THREE.Vector3(0, -3, 0));
    player.setSwimming(true, 0);
    let significantSignFlips = 0;
    let lastSign = 0;
    for (let i = 0; i < 300; i++) {
      physics.step(1 / 60);
      player.update(neutralInput(), 1 / 60, 'isometric');
      const v = (player as any).velocity.y;
      const s = Math.sign(v);
      // Ignore reversals at negligible velocity — that's just the final
      // asymptotic settle crossing exactly zero once, not visible bobbing.
      // A real (previously-underdamped) bob reverses direction repeatedly
      // at velocities an order of magnitude larger than this.
      if (lastSign !== 0 && s !== 0 && s !== lastSign && Math.abs(v) > 0.01) {
        significantSignFlips++;
      }
      lastSign = s || lastSign;
    }
    // A critically/over-damped approach to the target should not visibly
    // reverse direction — velocity.y should only ever go from
    // negative-or-zero (rising toward target) to positive-or-zero and
    // settle, never flip sign repeatedly at meaningful magnitude the way
    // the old underdamped spring bobbed back and forth.
    expect(significantSignFlips).toBe(0);
    // And it should actually converge near the target, not park somewhere
    // else entirely.
    const finalY = (player as any)._pos.y;
    expect(finalY).toBeCloseTo(-0.55, 1); // SWIM_FLOAT_DEPTH below surface (0)
  });
});
