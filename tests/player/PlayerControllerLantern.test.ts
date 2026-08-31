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

describe('PlayerController lantern toggle', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('isLanternOn starts false', () => {
    expect(player.isLanternOn).toBe(false);
  });

  it('setting the _lanternToggle userData flag flips isLanternOn on next update()', () => {
    player.group.userData['_lanternToggle'] = true;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(player.isLanternOn).toBe(true);
  });

  it('consumes the _lanternToggle flag exactly once (deleted after read)', () => {
    player.group.userData['_lanternToggle'] = true;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(player.group.userData['_lanternToggle']).toBeUndefined();
    // Flip isLanternOn back off directly (simulating something else changing it) —
    // a second update() with no flag re-set must NOT touch it.
    player.isLanternOn = false;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(player.isLanternOn).toBe(false);
  });

  it('toggling on makes the lantern light and prop visible; toggling off hides them', () => {
    // Access private fields via `as any`, matching the existing codebase test convention
    // (see PlayerControllerSwimming.test.ts's `(player as any).velocity.x` usage) — TypeScript
    // `private` is compile-time only, so this is safe and avoids a fragile "find the first
    // PointLight in group.children" search (the player group also holds an unrelated
    // `_swimGlowLight` PointLight).
    const light = (player as unknown as { _lanternLight: THREE.PointLight })._lanternLight;
    const prop = (player as unknown as { _lanternProp: THREE.Group })._lanternProp;
    expect(light.visible).toBe(false);
    expect(prop.visible).toBe(false);

    player.group.userData['_lanternToggle'] = true;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(light.visible).toBe(true);
    expect(prop.visible).toBe(true);

    player.group.userData['_lanternToggle'] = false;
    physics.step(1 / 60);
    player.update(neutralInput(), 1 / 60, 'isometric');
    expect(light.visible).toBe(false);
    expect(prop.visible).toBe(false);
  });
});
