import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { SettlementLabScene } from '@/scene/SettlementLabScene';

describe('SettlementLabScene', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let player: PlayerController;
  let lab: SettlementLabScene;

  beforeAll(async () => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    lab = new SettlementLabScene(scene, physics, player);
  });

  it('enter() populates the scene with at least one building mesh and does not throw', () => {
    const baseline = scene.children.length;
    expect(() => lab.enter()).not.toThrow();
    // Ground + buildings + road tiles + lamp groups should all be added
    expect(scene.children.length).toBeGreaterThan(baseline);
    // At least one THREE.Group from buildings or lamps
    const hasGroup = scene.children.some(c => c instanceof THREE.Group);
    expect(hasGroup).toBe(true);
  });

  it('exit() removes everything enter()/regenerate added and returns scene to pre-enter state', () => {
    // Already entered from previous test — record the pre-exit count should be > 0
    const beforeExit = scene.children.length;
    expect(beforeExit).toBeGreaterThan(0);

    lab.exit();

    // After exit the scene should be empty (baseline was 0 before enter)
    expect(scene.children.length).toBe(0);
  });

  it('a second regeneration does not accumulate objects from the first (no leak)', async () => {
    // Fresh setup
    const scene2 = new THREE.Scene();
    const physics2 = new PhysicsWorld();
    await physics2.init();
    const lab2 = new SettlementLabScene(scene2, physics2, player);

    lab2.enter();
    const afterFirstEnter = scene2.children.length;
    expect(afterFirstEnter).toBeGreaterThan(0);

    // Trigger a second regeneration via the panel's regenerate button
    const panel = (lab2 as unknown as { _panel: { rootEl: HTMLElement } })._panel;
    document.body.appendChild(panel.rootEl);
    const regenBtn = panel.rootEl.querySelector('[data-action="regenerate"]') as HTMLButtonElement;
    regenBtn.click();

    // After regen (same default seed/type/faction/layout as the initial
    // enter() call), the scene child count must be EXACTLY the same — any
    // growth at all would indicate a leaked building/road/lamp object from
    // the previous settlement not being cleared before the new one is built.
    const afterSecondRegen = scene2.children.length;
    expect(afterSecondRegen).toBe(afterFirstEnter);

    lab2.exit();
    expect(scene2.children.length).toBe(0);
  });

  it('update(dt) does not throw', () => {
    const scene3 = new THREE.Scene();
    const lab3 = new SettlementLabScene(scene3, physics, player);
    expect(() => lab3.update(1 / 60)).not.toThrow();
  });
});
