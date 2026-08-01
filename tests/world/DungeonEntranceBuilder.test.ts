/**
 * DungeonEntranceBuilder.test.ts — 02-game-world-integration (DI-1)
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildDungeonEntrance, entranceVariantForSiteFamily, isNearDungeonEntrance,
  DUNGEON_ENTRANCE_TRIGGER_RADIUS,
  type DungeonEntranceVariant,
} from '@/world/DungeonEntranceBuilder';
import type { SettlementFaction } from '@/overworld-studio';
import type { DungeonSiteFamily } from '@/world/DungeonSiteMetadata';

const VARIANTS: DungeonEntranceVariant[] = ['dungeon_cave_mouth', 'ruin_arch', 'keep_gate'];
const FACTIONS: SettlementFaction[] = [
  'human', 'elven', 'dwarven', 'orcish', 'vampire', 'undead', 'vulperia', 'slime', 'fae',
];

describe('entranceVariantForSiteFamily', () => {
  it('maps tower_floor to null (uses the existing GLB tower door)', () => {
    expect(entranceVariantForSiteFamily('tower_floor')).toBeNull();
  });

  it('maps every other site family to a valid procedural variant', () => {
    const families: DungeonSiteFamily[] = [
      'library_ruin', 'alchemy_vault', 'tomb_barrow', 'beast_lair',
      'mine_works', 'observatory_ruin', 'surface_threat',
    ];
    for (const family of families) {
      expect(VARIANTS).toContain(entranceVariantForSiteFamily(family));
    }
  });
});

describe('buildDungeonEntrance', () => {
  for (const variant of VARIANTS) {
    for (const faction of FACTIONS) {
      it(`builds ${variant} for faction=${faction} without Three.js errors`, () => {
        const built = buildDungeonEntrance(faction, variant);
        expect(built.root).toBeInstanceOf(THREE.Group);
        expect(built.root.children.length).toBeGreaterThan(0);
        expect(built.root.userData['dungeonEntranceVariant']).toBe(variant);
        expect(built.root.userData['dungeonEntranceFaction']).toBe(faction);
        expect(() => built.dispose()).not.toThrow();
      });
    }
  }

  it('produces the same structure for the same variant/faction (deterministic)', () => {
    const a = buildDungeonEntrance('elven', 'ruin_arch');
    const b = buildDungeonEntrance('elven', 'ruin_arch');
    expect(a.root.children.length).toBe(b.root.children.length);
    a.dispose();
    b.dispose();
  });
});

describe('isNearDungeonEntrance', () => {
  it('is true within the default trigger radius', () => {
    const entrance = { x: 10, z: 10 };
    expect(isNearDungeonEntrance({ x: 10, z: 10 }, entrance)).toBe(true);
    expect(isNearDungeonEntrance({ x: 10 + DUNGEON_ENTRANCE_TRIGGER_RADIUS, z: 10 }, entrance)).toBe(true);
  });

  it('is false beyond the default trigger radius', () => {
    const entrance = { x: 10, z: 10 };
    expect(isNearDungeonEntrance({ x: 10 + DUNGEON_ENTRANCE_TRIGGER_RADIUS + 0.5, z: 10 }, entrance)).toBe(false);
  });

  it('respects a custom radius', () => {
    const entrance = { x: 0, z: 0 };
    expect(isNearDungeonEntrance({ x: 5, z: 0 }, entrance, 10)).toBe(true);
    expect(isNearDungeonEntrance({ x: 5, z: 0 }, entrance, 1)).toBe(false);
  });
});
