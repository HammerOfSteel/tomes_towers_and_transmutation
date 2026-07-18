/**
 * types.ts — PROC-B3a
 * PropDNA: data model for a procedural prop/furniture/dungeon-dressing item.
 */

import type { ProceduralDNA } from '@/procedural/ProceduralDNA';

// ── Prop kind (shape archetype) ───────────────────────────────────────────────

export type PropKind =
  | 'chest'       // lockable storage box
  | 'bookshelf'   // tall vertical book storage
  | 'table'       // horizontal flat surface
  | 'chair'       // seat
  | 'cauldron'    // round vessel for brewing
  | 'lantern'     // light source on post or wall
  | 'pillar'      // vertical structural column
  | 'rug'         // flat floor decoration
  | 'door'        // openable barrier
  | 'statue'      // decorative figure
  | 'barrel'      // cylindrical storage
  | 'crate';      // rectangular wooden box

// ── Material ──────────────────────────────────────────────────────────────────

export type PropMaterial = 'stone' | 'wood' | 'bone' | 'crystal' | 'iron' | 'clay';

// ── Theme (drives which rooms / palettes this prop appears in) ────────────────

export type PropTheme =
  | 'dungeon'      // floor 0 — entrance hall / study
  | 'library'      // floor 1 — books and scrolls
  | 'alchemy'      // floor 2 / basement — cauldrons and reagents
  | 'observatory'  // floor 3 — telescopes and star charts
  | 'overworld'    // outdoor environment
  | 'residential'; // settlement interiors

// ── Condition ─────────────────────────────────────────────────────────────────

export type PropCondition = 'pristine' | 'weathered' | 'damaged' | 'ruined';

// ── Color scheme ──────────────────────────────────────────────────────────────

export interface PropColors {
  base:    string;   // main body hex
  detail:  string;   // trim / lock / handle
  glow?:   string;   // emissive tint (lanterns, crystals)
}

// ── Core DNA ──────────────────────────────────────────────────────────────────

export interface PropDNA extends ProceduralDNA {
  readonly kind: 'prop';
  propKind:    PropKind;
  material:    PropMaterial;
  theme:       PropTheme;
  condition:   PropCondition;
  /** Uniform scale multiplier: 0.5 = tiny, 1 = normal, 1.5 = large. */
  size:        number;
  colors:      PropColors;
  /** Whether the player can interact with this prop ([E] prompt). */
  interactive: boolean;
  /** Whether to emit light (lanterns, magic items). */
  glow:        boolean;
  /** Glow intensity [0–1] when glow=true. */
  glowIntensity: number;
}

// ── Collision metadata attached to built groups ───────────────────────────────

export interface PropCollisionMeta {
  /** Half-extents of the axis-aligned bounding box for collision. */
  halfExtents: { x: number; y: number; z: number };
  /** Centre offset from group origin. */
  offset: { x: number; y: number; z: number };
  /** True = this prop blocks movement. False = decorative only. */
  solid: boolean;
  /** Interaction zone radius (only when PropDNA.interactive = true). */
  interactRadius?: number;
}

// ── Material → base color ─────────────────────────────────────────────────────

export const MATERIAL_COLORS: Record<PropMaterial, PropColors> = {
  stone:   { base: '#6a6460', detail: '#3a3430' },
  wood:    { base: '#8b6040', detail: '#4a2820' },
  bone:    { base: '#d8d0b8', detail: '#a89878' },
  crystal: { base: '#80c0e8', detail: '#4080c0', glow: '#40a0ff' },
  iron:    { base: '#5a5860', detail: '#2a2830' },
  clay:    { base: '#a07850', detail: '#6a4830' },
};

// ── Prop kind → default material ─────────────────────────────────────────────

export const KIND_DEFAULT_MATERIAL: Record<PropKind, PropMaterial> = {
  chest:     'wood',
  bookshelf: 'wood',
  table:     'wood',
  chair:     'wood',
  cauldron:  'iron',
  lantern:   'iron',
  pillar:    'stone',
  rug:       'clay',    // soft/textile-ish
  door:      'wood',
  statue:    'stone',
  barrel:    'wood',
  crate:     'wood',
};

// ── Prop kind → solid flag ────────────────────────────────────────────────────

export const KIND_SOLID: Record<PropKind, boolean> = {
  chest:     true,
  bookshelf: true,
  table:     true,
  chair:     true,
  cauldron:  true,
  lantern:   false,
  pillar:    true,
  rug:       false,
  door:      true,
  statue:    true,
  barrel:    true,
  crate:     true,
};
