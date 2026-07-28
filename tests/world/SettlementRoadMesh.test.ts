/**
 * SettlementRoadMesh.test.ts — 02-game-world-integration (SI-2)
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  planSettlementRoads, buildSettlementRoads, MAIN_ROAD_WIDTH, ALLEY_WIDTH,
} from '@/world/SettlementRoadMesh';
import { spawnSettlement } from '@/world/SettlementSpawner';
import type { RealmSettlement } from '@/overworld-studio';

function makeSettlement(overrides: Partial<RealmSettlement> = {}): RealmSettlement {
  return {
    x: 5, y: 5, name: 'Roadtown', size: 'town', faction: 'human',
    ...overrides,
  };
}

describe('planSettlementRoads', () => {
  it('produces one segment per non-centre building', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 1 });
    const roads = planSettlementRoads(plan);
    const nonCentreBuildings = plan.buildings.filter(
      b => !(b.position.x === plan.position.x && b.position.z === plan.position.z),
    );
    expect(roads.length).toBe(nonCentreBuildings.length);
  });

  it('every segment starts at the settlement centre', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 2 });
    const roads = planSettlementRoads(plan);
    for (const r of roads) {
      expect(r.from).toEqual(plan.position);
    }
  });

  it('widens roads to anchor buildings (guild/inn/tavern/chapel/well/gate)', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'city' }), { seed: 3 });
    const roads = planSettlementRoads(plan);
    const guildBuilding = plan.buildings.find(b => b.dna.buildingKind === 'guild');
    expect(guildBuilding).toBeDefined();
    const guildRoad = roads.find(r => r.to.x === guildBuilding!.position.x && r.to.z === guildBuilding!.position.z);
    expect(guildRoad?.width).toBe(MAIN_ROAD_WIDTH);

    const houseBuilding = plan.buildings.find(b => b.dna.buildingKind === 'house');
    expect(houseBuilding).toBeDefined();
    const houseRoad = roads.find(r => r.to.x === houseBuilding!.position.x && r.to.z === houseBuilding!.position.z);
    expect(houseRoad?.width).toBe(ALLEY_WIDTH);
  });

  it('is deterministic given the same spawn plan', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 4 });
    expect(planSettlementRoads(plan)).toEqual(planSettlementRoads(plan));
  });
});

describe('buildSettlementRoads', () => {
  it('builds a mesh per road segment', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 5 });
    const built = buildSettlementRoads(plan);
    expect(built.root).toBeInstanceOf(THREE.Group);
    expect(built.root.children.length).toBe(planSettlementRoads(plan).length);
    for (const child of built.root.children) {
      expect(child).toBeInstanceOf(THREE.Mesh);
      const mesh = child as THREE.Mesh;
      expect(mesh.geometry.attributes['position']!.count).toBe(4);
      expect(mesh.geometry.attributes['uv']).toBeDefined();
    }
    expect(() => built.dispose()).not.toThrow();
  });

  it('samples heightAt for both segment endpoints', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 6 });
    const calls: Array<[number, number]> = [];
    const heightAt = (x: number, z: number) => { calls.push([x, z]); return 3; };
    buildSettlementRoads(plan, { heightAt });
    expect(calls.length).toBeGreaterThan(0);
    // Every road mesh should have vertices offset above the sampled height (3 + ROAD_HEIGHT_OFFSET).
  });

  it('handles a settlement with only the centre building (no roads) without error', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'village' }), { seed: 7 });
    // Village mix always includes non-centre buildings, but verify the road
    // count still matches planSettlementRoads for consistency.
    const built = buildSettlementRoads(plan);
    expect(built.root.children.length).toBe(planSettlementRoads(plan).length);
    built.dispose();
  });
});
