/**
 * PropPlacer.ts — PROC-B3e/f
 *
 * Decorates a dungeon room with procedural props.
 * Called by SceneManager after room geometry is loaded.
 *
 * Floor themes drive which prop kinds appear:
 *   floor 0 (-1 basement) = alchemy   floors 0 = dungeon
 *   floor 1 = library                 floors 2 = alchemy
 *   floor 3 = observatory             floors 4+ = dungeon
 *
 * Usage:
 *   const props = PropPlacer.decorateRoom({ floorIndex, width, depth, seed });
 *   for (const { built, x, z, rotation } of props) {
 *     built.root.position.set(x, 0, z);
 *     built.root.rotation.y = rotation;
 *     scene.add(built.root);
 *   }
 */

import { buildProp }         from '@/prop-creator/builder';
import type { BuiltProp }    from '@/prop-creator/builder';
import type { PropDNA, PropKind, PropTheme, PropMaterial } from '@/prop-creator/types';
import { MATERIAL_COLORS, KIND_DEFAULT_MATERIAL } from '@/prop-creator/types';
import { mulberry32 }        from '@/core/prng';

// ── Floor → theme ─────────────────────────────────────────────────────────────

export function themeForFloor(floorIndex: number): PropTheme {
  if (floorIndex === -1) return 'alchemy';
  switch (floorIndex) {
    case 0:  return 'dungeon';
    case 1:  return 'library';
    case 2:  return 'alchemy';
    case 3:  return 'observatory';
    default: return 'dungeon';
  }
}

// ── Theme → prop kind tables ──────────────────────────────────────────────────

const THEME_KINDS: Record<PropTheme, PropKind[]> = {
  dungeon:     ['chest', 'barrel', 'crate', 'pillar', 'statue', 'lantern', 'rug'],
  library:     ['bookshelf', 'table', 'chair', 'lantern', 'rug', 'barrel', 'chest'],
  alchemy:     ['cauldron', 'barrel', 'crate', 'table', 'lantern', 'pillar', 'chest'],
  observatory: ['table', 'chair', 'lantern', 'pillar', 'statue', 'crate'],
  overworld:   ['barrel', 'crate', 'statue', 'pillar', 'lantern'],
  residential: ['table', 'chair', 'rug', 'lantern', 'barrel', 'bookshelf', 'chest'],
};

const THEME_MATERIALS: Record<PropTheme, PropMaterial[]> = {
  dungeon:     ['stone', 'wood', 'iron'],
  library:     ['wood', 'wood', 'iron'],
  alchemy:     ['iron', 'clay', 'crystal'],
  observatory: ['stone', 'crystal', 'iron'],
  overworld:   ['stone', 'wood', 'iron'],
  residential: ['wood', 'clay', 'stone'],
};

// ── Room decoration ───────────────────────────────────────────────────────────

export interface RoomDecorInput {
  floorIndex: number;
  /** Room half-width in world units. */
  halfWidth:  number;
  /** Room half-depth in world units. */
  halfDepth:  number;
  seed:       number;
  /** Max number of props to place. Defaults to 6. */
  maxProps?:  number;
  /** Override theme (omit = derived from floorIndex). */
  theme?:     PropTheme;
}

export interface PlacedProp {
  built:    BuiltProp;
  x:        number;
  z:        number;
  rotation: number;
}

/**
 * Decorate a room with procedural props.
 * Returns an array of placed props; caller adds `built.root` to the scene.
 */
export function decorateRoom(input: RoomDecorInput): PlacedProp[] {
  const {
    floorIndex,
    halfWidth,
    halfDepth,
    seed,
    maxProps = 6,
  } = input;

  const theme    = input.theme ?? themeForFloor(floorIndex);
  const r        = mulberry32(seed ^ 0xA80BD3C0);
  const kinds    = THEME_KINDS[theme]    ?? THEME_KINDS['dungeon'];
  const materials = THEME_MATERIALS[theme] ?? THEME_MATERIALS['dungeon'];
  const placed: PlacedProp[] = [];

  // Place props along the walls and in corners
  const positions = generatePropPositions(halfWidth, halfDepth, maxProps, r);

  for (let i = 0; i < Math.min(positions.length, maxProps); i++) {
    const [x, z] = positions[i];
    const kind     = kinds[Math.floor(r() * kinds.length)];
    const material = materials[Math.floor(r() * materials.length)];
    const colors   = {
      ...MATERIAL_COLORS[material],
      glow: material === 'crystal' ? '#80c8ff' : kind === 'lantern' ? '#ffaa40' : kind === 'cauldron' ? '#40ff80' : undefined,
    };

    const dna: PropDNA = {
      v:            1,
      kind:         'prop',
      name:         `${material} ${kind}`,
      seed:         (seed ^ (i * 0x9E37_79B9)) >>> 0,
      propKind:     kind,
      material,
      theme,
      condition:    r() < 0.15 ? 'damaged' : 'weathered',
      size:         0.85 + r() * 0.3,
      colors,
      interactive:  kind === 'chest' || kind === 'door',
      glow:         kind === 'lantern' || kind === 'cauldron' || material === 'crystal',
      glowIntensity: kind === 'lantern' ? 0.9 : 0.5,
    };

    try {
      const built   = buildProp(dna);
      const rotation = (Math.floor(r() * 4) * Math.PI) / 2;
      placed.push({ built, x, z, rotation });
    } catch (e) {
      console.warn('[PropPlacer] failed to build prop:', e);
    }
  }

  return placed;
}

// ── Position generation ───────────────────────────────────────────────────────

/**
 * Generate prop positions scattered near walls, avoiding the centre path.
 */
function generatePropPositions(
  hw: number, hd: number, count: number, r: () => number,
): [number, number][] {
  const positions: [number, number][] = [];
  const margin = 0.8;   // distance from wall
  const inner  = 1.2;   // clear zone around centre

  for (let attempt = 0; attempt < count * 8 && positions.length < count; attempt++) {
    const x = (r() * 2 - 1) * (hw - margin);
    const z = (r() * 2 - 1) * (hd - margin);

    // Skip centre (keep walkable path clear)
    if (Math.abs(x) < inner && Math.abs(z) < inner) continue;
    // Skip if too close to another prop
    if (positions.some(([px, pz]) => Math.hypot(x - px, z - pz) < 0.9)) continue;

    positions.push([x, z]);
  }

  return positions;
}
