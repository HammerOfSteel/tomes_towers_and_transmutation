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

describe('PlayerController dive mechanics', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('holding jump while swimming eases the player down toward DIVE_TARGET_DEPTH (3.0 WU) below the surface', () => {
    player.setSwimming(true, 0); // water surface at world Y = 0
    const diveInput = { ...neutralInput(), jump: true };
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      player.update(diveInput, 1 / 60, 'isometric');
    }
    const y = (player as any)._pos.y;
    expect(y).toBeLessThan(-2.5);
    expect(y).toBeGreaterThan(-3.5);
  });

  it('releasing jump after diving eases the player back up toward the surface float depth (SWIM_FLOAT_DEPTH = 0.35 WU)', () => {
    player.setSwimming(true, 0);
    const diveInput = { ...neutralInput(), jump: true };
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      player.update(diveInput, 1 / 60, 'isometric');
    }
    const floatInput = neutralInput();
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      player.update(floatInput, 1 / 60, 'isometric');
    }
    const y = (player as any)._pos.y;
    expect(y).toBeGreaterThan(-1.0);
    expect(y).toBeLessThan(0.5);
  });

  it('underwaterDepthFraction is 0 when not swimming', () => {
    expect(player.underwaterDepthFraction).toBe(0);
    player.setSwimming(true, 0);
    player.setSwimming(false);
    expect(player.underwaterDepthFraction).toBe(0);
  });

  it('underwaterDepthFraction ramps from 0 toward 1 as the player dives, capped at 1', () => {
    player.setSwimming(true, 0);
    expect(player.underwaterDepthFraction).toBe(0); // spawned above the surface (y=5)
    const diveInput = { ...neutralInput(), jump: true };
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      player.update(diveInput, 1 / 60, 'isometric');
    }
    expect(player.underwaterDepthFraction).toBeGreaterThan(0.8);
    expect(player.underwaterDepthFraction).toBeLessThanOrEqual(1);
  });
});
