/**
 * dungeon.startup.smoke.test.ts — F2 smoke test: BlueprintRenderer loads without throw.
 *
 * Tests that renderBlueprint() completes without error using the existing
 * cell_start blueprint definition (the simplest room shape).
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

function makePhysics() {
  return {
    createStaticBox: vi.fn().mockReturnValue(0),
    createHeightfield: vi.fn().mockReturnValue(0),
    removeBody: vi.fn(),
    removeRigidBody: vi.fn(),
    world: { step: vi.fn(), removeRigidBody: vi.fn(), removeCollider: vi.fn() },
  } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DungeonRenderer — startup smoke', () => {
  it('renderBlueprint with cell_start completes without throwing', async () => {
    const { renderBlueprint } = await import('@/levels/BlueprintRenderer');
    const { validateBlueprint } = await import('@/levels/blueprint');
    const cellStartRaw = (await import('@/levels/blueprints/cell_start.json')).default;

    const bp      = validateBlueprint(cellStartRaw);
    const physics = makePhysics();

    expect(() => renderBlueprint(bp, physics, {})).not.toThrow();
  });

  it('renderBlueprint returns an object with a group and dispose', async () => {
    const { renderBlueprint } = await import('@/levels/BlueprintRenderer');
    const { validateBlueprint } = await import('@/levels/blueprint');
    const cellStartRaw = (await import('@/levels/blueprints/cell_start.json')).default;

    const bp      = validateBlueprint(cellStartRaw);
    const physics = makePhysics();
    const result  = renderBlueprint(bp, physics, {});

    expect(result).toHaveProperty('group');
    expect(result).toHaveProperty('dispose');
    expect(typeof result.dispose).toBe('function');
    // dispose requires physics.removeRigidBody — confirm it's a function (truthy mock)
    expect(physics.removeRigidBody).toBeDefined();
  });

  it('SceneManager constructs without throwing', async () => {
    const { SceneManager } = await import('@/levels/SceneManager');
    const scene  = new THREE.Scene();
    const player = { group: { position: new THREE.Vector3() }, health: { takeDamage: vi.fn() } } as any;
    expect(() => new SceneManager(scene, makePhysics(), player)).not.toThrow();
  });
});
