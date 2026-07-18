/**
 * InteriorGenerator.test.ts — PROC-C3 tests
 * generateInterior produces valid THREE.js scenes for all building kinds.
 */

import { describe, it, expect } from 'vitest';
import { generateInterior, generatePlan, deriveBlueprints, Occupancy } from '@/world/buildings/InteriorGenerator';
import { STYLE_COLORS, factionBuildingDna, type BuildingKind, type BuildingStyle } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';
import * as THREE from 'three';

const KINDS: BuildingKind[] = [
  'house', 'cottage', 'villa', 'terraced',
  'shop', 'inn', 'tavern', 'apothecary',
  'blacksmith', 'chapel', 'guild',
];

function makeDna(kind: BuildingKind, style: BuildingStyle = 'timber'): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed: 42,
    buildingKind: kind, size: 'medium', floors: 2,
    style, condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS[style] ?? STYLE_COLORS['stone']!,
    rotation: 0, terrace: 'none', features: [],
  };
}

describe('generatePlan', () => {
  for (const kind of KINDS) {
    it(`${kind}: generates a valid plan`, () => {
      const plan = generatePlan(makeDna(kind));
      expect(plan.w).toBeGreaterThan(4);
      expect(plan.d).toBeGreaterThan(4);
      expect(plan.grid).toBeInstanceOf(Uint8Array);
      expect(plan.grid.length).toBe(plan.w * plan.d);
      expect(plan.rooms.length).toBeGreaterThan(0);
    });

    it(`${kind}: plan has at least one floor tile`, () => {
      const plan = generatePlan(makeDna(kind));
      const hasFloor = plan.grid.some(t => t === 0);
      expect(hasFloor).toBe(true);
    });
  }
});

describe('deriveBlueprints', () => {
  it('produces a blueprint per room', () => {
    const plan = generatePlan(makeDna('house'));
    const blueprints = deriveBlueprints(plan);
    expect(blueprints.length).toBe(plan.rooms.length);
  });

  it('all blueprints have wallTiles', () => {
    const plan = generatePlan(makeDna('house'));
    const blueprints = deriveBlueprints(plan);
    for (const bp of blueprints) {
      expect(bp.wallTiles.length).toBeGreaterThan(0);
    }
  });

  it('wallTile faces are valid directions', () => {
    const plan = generatePlan(makeDna('inn'));
    const blueprints = deriveBlueprints(plan);
    const validFaces = new Set(['N', 'E', 'S', 'W']);
    for (const bp of blueprints) {
      for (const wt of bp.wallTiles) {
        expect(validFaces.has(wt.face)).toBe(true);
      }
    }
  });
});

describe('Occupancy', () => {
  it('wall tiles are not placeable', () => {
    const plan = generatePlan(makeDna('house'));
    const occ  = new Occupancy(plan);
    // Find a wall tile
    for (let i = 0; i < plan.grid.length; i++) {
      if (plan.grid[i] === 1) {
        const tx = i % plan.w;
        const tz = Math.floor(i / plan.w);
        expect(occ.placeable(tx, tz)).toBe(false);
        break;
      }
    }
  });

  it('floor tiles are placeable (initially)', () => {
    const plan = generatePlan(makeDna('house'));
    const occ  = new Occupancy(plan);
    // Find a floor tile not adjacent to a door
    let found = false;
    for (let i = 0; i < plan.grid.length; i++) {
      if (plan.grid[i] === 0) {
        const tx = i % plan.w;
        const tz = Math.floor(i / plan.w);
        if (occ.placeable(tx, tz)) { found = true; break; }
      }
    }
    expect(found).toBe(true);
  });

  it('fill() blocks tiles', () => {
    const plan = generatePlan(makeDna('house'));
    const occ  = new Occupancy(plan);
    const bp   = deriveBlueprints(plan)[0]!;
    const wt   = bp.wallTiles.find(w => occ.placeable(w.tx, w.tz));
    if (wt) {
      occ.fill(wt.tx, wt.tz);
      expect(occ.placeable(wt.tx, wt.tz)).toBe(false);
    }
  });
});

describe('generateInterior', () => {
  for (const kind of KINDS) {
    it(`${kind}: generates without throwing`, () => {
      expect(() => generateInterior(makeDna(kind))).not.toThrow();
    });

    it(`${kind}: returns a THREE.Group`, () => {
      const scene = generateInterior(makeDna(kind));
      expect(scene.group).toBeInstanceOf(THREE.Group);
    });

    it(`${kind}: group has children (floor + walls + props)`, () => {
      const scene = generateInterior(makeDna(kind));
      expect(scene.group.children.length).toBeGreaterThan(0);
    });
  }

  it('deterministic: same seed → same child count', () => {
    const a = generateInterior(makeDna('house'));
    const b = generateInterior(makeDna('house'));
    expect(a.group.children.length).toBe(b.group.children.length);
  });

  it('vampiric style generates without throwing', () => {
    expect(() => generateInterior(makeDna('villa', 'vampiric'))).not.toThrow();
  });

  it('arcane style generates without throwing', () => {
    expect(() => generateInterior(makeDna('apothecary', 'arcane'))).not.toThrow();
  });

  it('gothic chapel generates without throwing', () => {
    expect(() => generateInterior(makeDna('chapel', 'gothic'))).not.toThrow();
  });
});

describe('generateInterior — multi-floor', () => {
  it('floor 0 of 1-floor cottage has no stair triggers', () => {
    const dna = makeDna('cottage');
    dna.floors = 1;
    const scene = generateInterior(dna, 0);
    expect(scene.stairUpPos).toBeUndefined();
    expect(scene.stairDownPos).toBeUndefined();
    expect(scene.totalFloors).toBe(1);
    expect(scene.floorIndex).toBe(0);
  });

  it('floor 0 of 2-floor inn has stairUpPos but no stairDownPos', () => {
    const dna = makeDna('inn');
    dna.floors = 2;
    const scene = generateInterior(dna, 0);
    expect(scene.stairUpPos).toBeDefined();
    expect(scene.stairDownPos).toBeUndefined();
  });

  it('floor 1 of 2-floor inn has stairDownPos but no stairUpPos', () => {
    const dna = makeDna('inn');
    dna.floors = 2;
    const scene = generateInterior(dna, 1);
    expect(scene.stairDownPos).toBeDefined();
    expect(scene.stairUpPos).toBeUndefined();
  });

  it('middle floor (1 of 3) has both stair triggers', () => {
    const dna = makeDna('villa');
    dna.floors = 3;
    const scene = generateInterior(dna, 1);
    expect(scene.stairUpPos).toBeDefined();
    expect(scene.stairDownPos).toBeDefined();
  });

  it('different floors report correct floorIndex', () => {
    const dna = makeDna('inn');
    dna.floors = 3;
    expect(generateInterior(dna, 0).floorIndex).toBe(0);
    expect(generateInterior(dna, 1).floorIndex).toBe(1);
    expect(generateInterior(dna, 2).floorIndex).toBe(2);
  });

  it('stair trigger positions are finite numbers', () => {
    const dna = makeDna('inn');
    dna.floors = 2;
    const scene = generateInterior(dna, 0);
    const s = scene.stairUpPos!;
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Number.isFinite(s.y)).toBe(true);
    expect(Number.isFinite(s.z)).toBe(true);
  });

  it('all kinds with floors=2 produce stairUpPos on floor 0', () => {
    for (const kind of KINDS) {
      const dna = makeDna(kind as any);
      dna.floors = 2;
      const scene = generateInterior(dna, 0);
      expect(scene.stairUpPos).toBeDefined();
    }
  });
});

describe('generateInterior — faction presets', () => {
  const FACTION_KIND_PAIRS: Array<[string, BuildingKind]> = [
    ['human_rural', 'house'],
    ['elven',       'cottage'],
    ['dwarven',     'blacksmith'],
    ['vampire',     'villa'],
    ['celestial',   'chapel'],
    ['vulperia',    'shop'],
  ];

  for (const [faction, kind] of FACTION_KIND_PAIRS) {
    it(`${faction}/${kind}: generates without throwing`, () => {
      const dna = factionBuildingDna(kind, faction as any, 12345);
      expect(() => generateInterior(dna)).not.toThrow();
      const scene = generateInterior(dna);
      expect(scene.group.children.length).toBeGreaterThan(0);
    });
  }
});
