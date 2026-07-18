/**
 * BuildingAll.test.ts — Comprehensive building system tests.
 *
 * Covers:
 *   - All 21 BuildingKinds build without throwing
 *   - All 13 BuildingStyles applied to 'house' without throwing
 *   - All 13 Faction presets × 5 key kinds without throwing
 *   - Style overlays don't crash (vampiric/elven/dwarven/gothic/nordic/fae/orcish)
 *   - Key proportional checks (bounds, children present)
 *   - Determinism (same seed = same child count)
 */

import { describe, it, expect } from 'vitest';
import { buildBuilding } from '@/world/buildings/BuildingBuilder';
import {
  STYLE_COLORS, FACTION_PRESETS, factionBuildingDna,
  type BuildingKind, type BuildingStyle, type BuildingSize, type Faction, type BuildingDNA,
} from '@/world/buildings/BuildingDNA';
import * as THREE from 'three';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_KINDS: BuildingKind[] = [
  'house', 'shop', 'inn', 'guild',
  'terraced', 'cottage', 'villa', 'tavern',
  'blacksmith', 'apothecary', 'watchtower', 'tower', 'gate',
  'chapel', 'tent', 'market_stall',
  'ruin', 'well', 'barn',
];

const ALL_STYLES: BuildingStyle[] = [
  'thatched', 'stone', 'timber', 'arcane',
  'nordic', 'tudor', 'gothic',
  'elven', 'dwarven', 'vampiric',
  'nomadic', 'fae', 'orcish',
];

const ALL_FACTIONS: Faction[] = [
  'human_rural', 'human_town', 'human_noble',
  'elven', 'dwarven', 'vampire', 'undead_common',
  'draconic', 'celestial', 'vulperia', 'slime', 'fae', 'orcish',
];

const KEY_KINDS_FOR_FACTIONS: BuildingKind[] = [
  'house', 'cottage', 'watchtower', 'chapel', 'blacksmith',
];

function makeDna(kind: BuildingKind, overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed: 42,
    buildingKind: kind, size: 'small', floors: 2,
    style: 'stone', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['stone'], rotation: 0,
    terrace: 'none', features: [],
    ...overrides,
  };
}

// ── 1. All 21 kinds build without throwing ────────────────────────────────────

describe('All BuildingKinds', () => {
  for (const kind of ALL_KINDS) {
    it(`${kind}: builds without throwing`, () => {
      expect(() => buildBuilding(makeDna(kind))).not.toThrow();
    });

    it(`${kind}: returns a THREE.Group as exteriorGroup`, () => {
      const inst = buildBuilding(makeDna(kind));
      expect(inst.exteriorGroup).toBeInstanceOf(THREE.Group);
    });

    it(`${kind}: exteriorGroup has at least 1 child`, () => {
      const inst = buildBuilding(makeDna(kind));
      expect(inst.exteriorGroup.children.length).toBeGreaterThan(0);
    });

    it(`${kind}: bounds are positive numbers`, () => {
      const { bounds } = buildBuilding(makeDna(kind));
      expect(bounds.halfWidth).toBeGreaterThan(0);
      expect(bounds.halfDepth).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });
  }
});

// ── 2. All 13 styles applied to 'house' ───────────────────────────────────────

describe('All BuildingStyles on house', () => {
  for (const style of ALL_STYLES) {
    it(`style=${style}: builds without throwing`, () => {
      expect(() => buildBuilding(makeDna('house', {
        style,
        colors: STYLE_COLORS[style] ?? STYLE_COLORS['stone'],
      }))).not.toThrow();
    });
  }
});

// ── 3. Style overlays on key buildings ───────────────────────────────────────

const OVERLAY_STYLES: BuildingStyle[] = ['vampiric', 'elven', 'dwarven', 'gothic', 'nordic', 'fae', 'orcish', 'nomadic'];
const OVERLAY_KINDS:  BuildingKind[]  = ['house', 'villa', 'watchtower', 'cottage', 'tavern'];

describe('Style overlays (vampiric/elven/dwarven/etc.)', () => {
  for (const style of OVERLAY_STYLES) {
    for (const kind of OVERLAY_KINDS) {
      it(`${style} on ${kind}: no throw`, () => {
        expect(() => buildBuilding(makeDna(kind, {
          style,
          colors: STYLE_COLORS[style] ?? STYLE_COLORS['stone'],
        }))).not.toThrow();
      });
    }
  }
});

// ── 4. Faction presets ────────────────────────────────────────────────────────

describe('Faction presets', () => {
  for (const faction of ALL_FACTIONS) {
    it(`faction=${faction}: preset exists and has required fields`, () => {
      const preset = FACTION_PRESETS[faction];
      expect(preset).toBeTruthy();
      expect(preset.style).toBeTruthy();
      expect(preset.colors.walls).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    for (const kind of KEY_KINDS_FOR_FACTIONS) {
      it(`factionBuildingDna(${kind}, ${faction}): builds without throwing`, () => {
        const dna = factionBuildingDna(kind, faction, 12345);
        expect(() => buildBuilding(dna)).not.toThrow();
      });
    }
  }
});

// ── 5. Key faction × kind showcase combos ────────────────────────────────────

describe('Key faction showcase combos (from BUILDINGS.md)', () => {
  const combos: Array<[BuildingKind, Faction, string]> = [
    ['villa',      'vampire',      'vampire manor'],
    ['cottage',    'elven',        'elven cottage'],
    ['blacksmith', 'dwarven',      'dwarven forge'],
    ['watchtower', 'draconic',     'draconic keep'],
    ['chapel',     'celestial',    'celestial temple'],
    ['cottage',    'vulperia',     'vulperia den'],
    ['tent',       'slime',        'slime bubble'],
    ['watchtower', 'vampire',      'blood tower'],
    ['cottage',    'human_rural',  'rural cottage'],
    ['guild',      'human_noble',  'noble guildhall'],
    ['chapel',     'orcish',       'orcish shrine'],
    ['tower',      'arcane' as any,'mage tower — uses factionBuildingDna fallback'],
  ];

  for (const [kind, faction, label] of combos) {
    it(`${label}: builds without throwing`, () => {
      const dna = typeof faction === 'string' && faction in FACTION_PRESETS
        ? factionBuildingDna(kind, faction as Faction, 99999)
        : makeDna(kind, { style: faction as BuildingStyle, colors: STYLE_COLORS[faction as BuildingStyle] ?? STYLE_COLORS['stone'] });
      expect(() => buildBuilding(dna)).not.toThrow();
      const inst = buildBuilding(dna);
      expect(inst.exteriorGroup.children.length).toBeGreaterThan(0);
    });
  }
});

// ── 6. Determinism ────────────────────────────────────────────────────────────

describe('Determinism', () => {
  it('same seed → same child count for all kinds', () => {
    for (const kind of ALL_KINDS) {
      const a = buildBuilding(makeDna(kind, { seed: 7777 }));
      const b = buildBuilding(makeDna(kind, { seed: 7777 }));
      expect(a.exteriorGroup.children.length).toBe(b.exteriorGroup.children.length);
    }
  });

  it('different seeds → possibly different child counts', () => {
    // Just verify both succeed without throwing
    const a = buildBuilding(makeDna('house', { seed: 1 }));
    const b = buildBuilding(makeDna('house', { seed: 999999 }));
    expect(a.exteriorGroup).toBeInstanceOf(THREE.Group);
    expect(b.exteriorGroup).toBeInstanceOf(THREE.Group);
  });
});

// ── 7. floor count variants ───────────────────────────────────────────────────

describe('Floor variants', () => {
  for (const floors of [1, 2, 3, 4] as const) {
    it(`${floors}-floor house builds without throwing`, () => {
      expect(() => buildBuilding(makeDna('house', { floors }))).not.toThrow();
    });
    it(`${floors}-floor watchtower builds without throwing`, () => {
      expect(() => buildBuilding(makeDna('watchtower', { floors }))).not.toThrow();
    });
  }
});

// ── 8. All condition variants ─────────────────────────────────────────────────

describe('Condition variants on house', () => {
  for (const condition of ['pristine', 'weathered', 'damaged', 'ruined'] as const) {
    it(`condition=${condition}: no throw`, () => {
      expect(() => buildBuilding(makeDna('house', { condition }))).not.toThrow();
    });
  }
});

// ── 9. Size variants ──────────────────────────────────────────────────────────

describe('Size variants', () => {
  const sizes: BuildingSize[] = ['tiny', 'small', 'medium', 'large'];
  for (const size of sizes) {
    it(`size=${size} on house: no throw`, () => {
      expect(() => buildBuilding(makeDna('house', { size }))).not.toThrow();
    });
    it(`size=${size} on chapel: no throw`, () => {
      expect(() => buildBuilding(makeDna('chapel', { size }))).not.toThrow();
    });
  }
});

// ── 10. Terrace modes ─────────────────────────────────────────────────────────

describe('Terrace modes', () => {
  for (const terrace of ['none', 'left', 'right', 'both'] as const) {
    it(`terraced(${terrace}): no throw`, () => {
      expect(() => buildBuilding(makeDna('terraced', { terrace }))).not.toThrow();
    });
  }
});
