/**
 * BuildingTypeMap — bridges the old BuildingType identifier system (used by
 * SettlementGenerator / WorldData) to the new BuildingDNA system.
 *
 * createSettlementBuildingDna() produces a deterministic BuildingDNA from:
 *  • PlacedBuilding.type  (old kind string)
 *  • PlacedBuilding.seed  (drives deterministic variation)
 *  • SettlementType       (village/town/city → style tier)
 */

import type { BuildingType }    from './BuildingTypes';
import type { SettlementType }  from '../SettlementGenerator';
import type { PlacedBuilding }  from '../SettlementGenerator';
import {
  STYLE_COLORS,
  type BuildingDNA,
  type BuildingKind,
  type BuildingStyle,
  type BuildingSize,
} from './BuildingDNA';
import { mulberry32 } from '@/core/prng';

// ── Kind mapping ─────────────────────────────────────────────────────────────

const KIND_MAP: Record<BuildingType, BuildingKind> = {
  cottage:      'cottage',
  inn:          'inn',
  market_stall: 'market_stall',
  smithy:       'blacksmith',
  tavern:       'tavern',
  temple:       'chapel',
  city_hall:    'guild',
  guard_tower:  'watchtower',
  well:         'well',
  market_cross: 'market_stall',
};

// ── Style selection by settlement tier ───────────────────────────────────────

type StyleTier = [primary: BuildingStyle, secondary: BuildingStyle];

const TIER_STYLES: Record<SettlementType, StyleTier> = {
  village: ['thatched', 'timber'],
  town:    ['timber',   'stone'],
  city:    ['stone',    'tudor'],
};

/** Certain kinds always use a specific style regardless of settlement tier. */
const STYLE_OVERRIDES: Partial<Record<BuildingType, BuildingStyle>> = {
  temple:      'gothic',
  city_hall:   'stone',
  guard_tower: 'stone',
  well:        'stone',
  smithy:      'stone',
};

// ── Size from old BuildingSpec footprint ──────────────────────────────────────
// SIZE_FOOTPRINT: tiny=4×4, small=6×5, medium=9×7, large=13×10 (world units)
// Old BUILDING_SPECS footprints (tiles × T=2 WU): cottage=4×4, inn=6×8, smithy=4×4
// Map to the closest size so buildings fit the settlement grid.

const SIZE_MAP: Partial<Record<BuildingType, BuildingSize>> = {
  cottage:      'tiny',    // 4×4 WU = old [2,2] tiles ✓
  inn:          'small',   // 6×5 WU ≈ old [3,4] tiles (6×8) — depth a bit short
  market_stall: 'tiny',
  smithy:       'tiny',    // 4×4 WU = old [2,2] tiles ✓
  tavern:       'small',   // 6×5 WU ≈ old [4,3] tiles (8×6)
  temple:       'medium',  // 9×7 WU ≈ old [4,4] tiles (8×8)
  city_hall:    'large',   // 13×10 WU ≈ old [6,4] tiles (12×8)
  guard_tower:  'tiny',    // 4×4 WU = old [2,2] tiles ✓
  well:         'tiny',
  market_cross: 'tiny',
};

// ── Floors from old BuildingSpec ──────────────────────────────────────────────

const FLOORS_MAP: Partial<Record<BuildingType, 1 | 2 | 3 | 4>> = {
  cottage:      1,
  inn:          2,
  market_stall: 1,
  smithy:       1,
  tavern:       2,
  temple:       2,
  city_hall:    3,
  guard_tower:  4,
  well:         1,
  market_cross: 1,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a PlacedBuilding + SettlementType → fully specified BuildingDNA.
 * Deterministic: same inputs → same DNA.
 */
export function createSettlementBuildingDna(
  b:              PlacedBuilding,
  settlementType: SettlementType,
): BuildingDNA {
  const rand = mulberry32(b.seed ^ 0x9E3779B9);

  const kind  = KIND_MAP[b.type]  ?? 'house';
  const size  = SIZE_MAP[b.type]  ?? 'medium';
  const floors = FLOORS_MAP[b.type] ?? 2;

  let style: BuildingStyle;
  if (STYLE_OVERRIDES[b.type]) {
    style = STYLE_OVERRIDES[b.type]!;
  } else {
    // 70/30 split: primary style vs secondary
    const [primary, secondary] = TIER_STYLES[settlementType];
    style = rand() < 0.7 ? primary : secondary;
  }

  const colors = STYLE_COLORS[style] ?? STYLE_COLORS['timber']!;

  return {
    v:              1,
    kind:           'building',
    name:           `${settlementType}_${b.type}_${b.seed}`,
    seed:           b.seed,
    buildingKind:   kind,
    size,
    floors:         floors as 1 | 2 | 3 | 4,
    style,
    condition:      rand() < 0.7 ? 'weathered' : 'pristine',
    hasInterior:    true,
    interiorLayout: 'single_room',
    colors,
    rotation:       0,
    terrace:        'none',
    features:       [],
  };
}
