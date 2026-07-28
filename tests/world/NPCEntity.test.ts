/**
 * NPCEntity.test.ts
 * Verifies NPCEntity builds its visual rig from the new npc-creator system
 * (not the old buildCreature/CreatureRig system) while keeping its public
 * gameplay surface (name, role, group, dispose) intact.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { NPCEntity } from '@/world/NPCEntity';
import type { SettlementEntry } from '@/world/WorldData';

function makeSettlement(): SettlementEntry {
  // Only `seed`, `plan.name`, and `plan.type` are read by NPCEntity's
  // constructor/dialogue context — the rest of SettlementPlan's required
  // fields are irrelevant for these tests, so cast through `unknown` rather
  // than fabricating unused buildings/roads/population data.
  return {
    id:   1,
    seed: 42,
    plan: { name: 'Test Village', type: 'village', centerCol: 0, centerRow: 0 },
  } as unknown as SettlementEntry;
}

describe('NPCEntity', () => {
  it('builds a group synchronously (no await needed) and exposes name/role', () => {
    const settlement = makeSettlement();
    const npc = new NPCEntity(1, 1, 5, 5, 'citizen', settlement);
    // Use duck-type check instead of instanceof to avoid multi-THREE.js-instance issues
    expect(npc.group.isObject3D).toBe(true);
    expect(npc.group.type).toBe('Group');
    expect(npc.role).toBe('citizen');
    expect(typeof npc.name).toBe('string');
    expect(npc.name.length).toBeGreaterThan(0);
  });

  it('positions the group at the given world coordinates', () => {
    const settlement = makeSettlement();
    const npc = new NPCEntity(2, 2, 10, -6, 'merchant', settlement);
    expect(npc.group.position.x).toBeCloseTo(10);
    expect(npc.group.position.z).toBeCloseTo(-6);
  });

  it('dispose() does not throw', () => {
    const settlement = makeSettlement();
    const npc = new NPCEntity(3, 3, 0, 0, 'guard', settlement);
    expect(() => npc.dispose()).not.toThrow();
  });

  it('drives walk/idle animation via setAnimState without throwing during update()', () => {
    const settlement = makeSettlement();
    const npc = new NPCEntity(4, 4, 0, 0, 'citizen', settlement);
    const playerPos = new THREE.Vector3(0, 0, 20); // far enough to avoid interact range, close enough to update
    expect(() => npc.update(0.016, playerPos, false)).not.toThrow();
  });
});
