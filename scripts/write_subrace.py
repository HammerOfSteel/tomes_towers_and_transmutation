#!/usr/bin/env python3
"""CC-1: Sub-race system — writes new content into CreatureDNA.ts, CreatureBuilder.ts, CharacterCreation.ts."""

import pathlib, sys, re

ROOT = pathlib.Path(__file__).parent.parent
CREATURES_DIR = ROOT / "src" / "creatures"
UI_DIR = ROOT / "src" / "ui"

# ─────────────────────────────────────────────────────────────────────────────
# 1.  CreatureDNA.ts — add SubRace type + SUBRACE_DEFS + update interface
# ─────────────────────────────────────────────────────────────────────────────

dna_path = CREATURES_DIR / "CreatureDNA.ts"
dna_src = dna_path.read_text(encoding="utf-8")

# 1a. Replace the type exports block to add SubRace + EarShape
OLD_TYPES = """\
export type Archetype  = 'biped' | 'quadruped' | 'amoeba' | 'avian' | 'serpent';
export type FaceType   = 'cute' | 'angry' | 'cyclops' | 'blank' | 'skull' | 'compound';
export type MouthType  = 'smile' | 'frown' | 'beak' | 'fangs' | 'none';
export type Expression = 'neutral' | 'happy' | 'angry' | 'scared';
export type PropId     ="""

NEW_TYPES = """\
export type Archetype  = 'biped' | 'quadruped' | 'amoeba' | 'avian' | 'serpent';
export type SubRace    =
  | 'none'                                        // non-biped / unknown
  | 'human' | 'elf' | 'high_elf'
  | 'goblin' | 'orc' | 'troll'
  | 'pixie' | 'fae' | 'gnome'
  | 'undead' | 'draconic' | 'celestial';
export type EarShape   = 'none' | 'round' | 'pointed' | 'large';
export type HeadStyle  = 'normal' | 'large' | 'small' | 'elongated';
export type FaceType   = 'cute' | 'angry' | 'cyclops' | 'blank' | 'skull' | 'compound';
export type MouthType  = 'smile' | 'frown' | 'beak' | 'fangs' | 'none';
export type Expression = 'neutral' | 'happy' | 'angry' | 'scared';
export type PropId     ="""\

dna_src = dna_src.replace(OLD_TYPES, NEW_TYPES)

# 1b. Add subRace field to CreatureDNA interface
OLD_INTERFACE_START = """\
export interface CreatureDNA {
  archetype: Archetype;
  colors: {"""

NEW_INTERFACE_START = """\
export interface CreatureDNA {
  archetype: Archetype;
  subRace:   SubRace;
  colors: {"""

dna_src = dna_src.replace(OLD_INTERFACE_START, NEW_INTERFACE_START)

# 1c. Update DEFAULT_PLAYER_DNA to add subRace + remove robe
OLD_DEFAULT = """\
export const DEFAULT_PLAYER_DNA: CreatureDNA = {
  archetype: 'biped',
  colors: { primary: 0xf5c89a, secondary: 0x4a2080, emissive: 0x6030c0, emissiveIntensity: 0.04 },
  proportions: {
    global: 1.0, torso: [1, 1, 1], headSize: 1.0,
    limbLength: 1.0, limbWidth: 1.0, neckLength: 1.0,
    tailLength: 0.0, wingSpan: 1.5, segmentCount: 5,
  },
  face: { type: 'cute', eyeColor: 0x2a1a4a, mouthType: 'smile', expression: 'neutral' },
  material: { roughness: 0.55, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 },
  props: ['robe'],
};"""

NEW_DEFAULT = """\
export const DEFAULT_PLAYER_DNA: CreatureDNA = {
  archetype: 'biped',
  subRace:   'human',
  colors: { primary: 0xf5c89a, secondary: 0x4a2080, emissive: 0x6030c0, emissiveIntensity: 0.04 },
  proportions: {
    global: 1.0, torso: [1, 1, 1], headSize: 1.0,
    limbLength: 1.0, limbWidth: 1.0, neckLength: 1.0,
    tailLength: 0.0, wingSpan: 1.5, segmentCount: 5,
  },
  face: { type: 'cute', eyeColor: 0x2a1a4a, mouthType: 'smile', expression: 'neutral' },
  material: { roughness: 0.55, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 },
  props: [],
};

// ── Sub-race definitions ──────────────────────────────────────────────────────

export interface SubRaceDef {
  label:      string;
  icon:       string;
  hint:       string;
  earShape:   EarShape;
  headStyle:  HeadStyle;
  proportions?: Partial<CreatureDNA['proportions']>;
  colors?:     Partial<CreatureDNA['colors']>;
  face?:       Partial<CreatureDNA['face']>;
  props?:      PropId[];
}

export const SUBRACE_DEFS: Record<SubRace, SubRaceDef> = {
  none:      { label: 'Unknown',   icon: '?',  hint: 'Indeterminate form.',
               earShape: 'round',   headStyle: 'normal' },
  human:     { label: 'Human',     icon: '👤', hint: 'Versatile and adaptable.',
               earShape: 'round',   headStyle: 'normal' },
  elf:       { label: 'Elf',       icon: '🧝', hint: 'Slender, long-lived, and sharp of ear.',
               earShape: 'pointed', headStyle: 'elongated',
               proportions: { limbLength: 1.15, global: 0.95, headSize: 0.92, neckLength: 1.1 },
               colors:      { primary: 0xd8e0c8 },
               face:        { type: 'cute', mouthType: 'smile' } },
  high_elf:  { label: 'High Elf',  icon: '⭐', hint: 'Ancient bloodline, luminous bearing.',
               earShape: 'pointed', headStyle: 'elongated',
               proportions: { limbLength: 1.2, global: 1.0, headSize: 0.88, neckLength: 1.2 },
               colors:      { primary: 0xe8f0e0, emissive: 0xc0e0ff, emissiveIntensity: 0.06 },
               face:        { type: 'cute', mouthType: 'smile' } },
  goblin:    { label: 'Goblin',    icon: '👺', hint: 'Short, clever, and mischievous.',
               earShape: 'large',   headStyle: 'large',
               proportions: { global: 0.78, headSize: 1.35, limbLength: 0.88, limbWidth: 0.85 },
               colors:      { primary: 0x88a050 },
               face:        { type: 'angry', mouthType: 'fangs' } },
  orc:       { label: 'Orc',       icon: '💪', hint: 'Broad, strong, and battle-forged.',
               earShape: 'round',   headStyle: 'normal',
               proportions: { global: 1.08, limbWidth: 1.3, headSize: 1.05 },
               colors:      { primary: 0x708050 },
               face:        { type: 'angry', mouthType: 'fangs' } },
  troll:     { label: 'Troll',     icon: '🧌', hint: 'Massive and regenerative.',
               earShape: 'large',   headStyle: 'large',
               proportions: { global: 1.3, headSize: 1.4, limbWidth: 1.45, limbLength: 1.05 },
               colors:      { primary: 0x6a7060 },
               face:        { type: 'angry', mouthType: 'frown' } },
  pixie:     { label: 'Pixie',     icon: '🧚', hint: 'Tiny, fast, and full of tricks.',
               earShape: 'pointed', headStyle: 'large',
               proportions: { global: 0.52, headSize: 1.5, limbLength: 0.9 },
               colors:      { primary: 0xf0d0ff, emissive: 0xe080ff, emissiveIntensity: 0.12 },
               face:        { type: 'cute', mouthType: 'smile' },
               props:       ['wings_bat'] },
  fae:       { label: 'Fae',       icon: '🌿', hint: 'Nature-bound, mercurial, and enchanting.',
               earShape: 'pointed', headStyle: 'large',
               proportions: { global: 0.72, headSize: 1.25, limbLength: 1.05 },
               colors:      { primary: 0xa0d880, emissive: 0x60ff80, emissiveIntensity: 0.1 },
               face:        { type: 'cute', mouthType: 'smile' },
               props:       ['wings_bat', 'aura'] },
  gnome:     { label: 'Gnome',     icon: '🍄', hint: 'Inventive, stout, and surprising.',
               earShape: 'round',   headStyle: 'large',
               proportions: { global: 0.72, headSize: 1.3, limbLength: 0.85 },
               colors:      { primary: 0xf0c890 } },
  undead:    { label: 'Undead',    icon: '💀', hint: 'Returned from beyond — cold and tireless.',
               earShape: 'none',    headStyle: 'normal',
               colors:      { primary: 0xc0b8a8, secondary: 0x302820 },
               face:        { type: 'skull', mouthType: 'fangs' },
               props:       ['aura'] },
  draconic:  { label: 'Draconic',  icon: '🐉', hint: 'Dragon-blooded. Scales, fire, and pride.',
               earShape: 'none',    headStyle: 'normal',
               colors:      { primary: 0x904020, secondary: 0x602010, emissive: 0xff4000, emissiveIntensity: 0.08 },
               face:        { type: 'angry', mouthType: 'fangs' },
               props:       ['horns_small'] },
  celestial: { label: 'Celestial', icon: '✨', hint: 'Descended from starlight. Radiant and serene.',
               earShape: 'pointed', headStyle: 'elongated',
               proportions: { global: 1.0, limbLength: 1.1, headSize: 0.9 },
               colors:      { primary: 0xfff0d8, secondary: 0xd0c0f0, emissive: 0xffd080, emissiveIntensity: 0.12 },
               face:        { type: 'cute', mouthType: 'smile' },
               props:       ['aura', 'crown'] },
};

/** Subraces available when archetype === 'biped'. */
export const BIPED_SUBRACES: SubRace[] = [
  'human', 'elf', 'high_elf', 'goblin', 'orc', 'troll',
  'pixie', 'fae', 'gnome', 'undead', 'draconic', 'celestial',
];"""

dna_src = dna_src.replace(OLD_DEFAULT, NEW_DEFAULT)

# 1d. Update ARCHETYPE_DEFAULTS to add subRace defaults
OLD_ARCH_DEFAULTS = "export const ARCHETYPE_DEFAULTS: Partial<Record<Archetype, Partial<CreatureDNA>>> = {"
NEW_ARCH_DEFAULTS = "export const ARCHETYPE_DEFAULTS: Partial<Record<Archetype, Partial<CreatureDNA>>> = {"

# 1e. Update dnaForArchetype to also set subRace
OLD_FOR_ARCH = """\
export function dnaForArchetype(arch: Archetype): CreatureDNA {
  const base = cloneDNA(DEFAULT_PLAYER_DNA);
  base.archetype = arch;
  const over = ARCHETYPE_DEFAULTS[arch];
  if (!over) return base;
  if (over.colors)      Object.assign(base.colors,      over.colors);
  if (over.proportions) Object.assign(base.proportions, over.proportions);
  if (over.face)        Object.assign(base.face,        over.face);
  if (over.props !== undefined) base.props = [...over.props];
  return base;
}"""

NEW_FOR_ARCH = """\
export function dnaForArchetype(arch: Archetype): CreatureDNA {
  const base = cloneDNA(DEFAULT_PLAYER_DNA);
  base.archetype = arch;
  // Non-biped archetypes have no sub-race.
  if (arch !== 'biped') base.subRace = 'none';
  const over = ARCHETYPE_DEFAULTS[arch];
  if (!over) return base;
  if (over.colors)      Object.assign(base.colors,      over.colors);
  if (over.proportions) Object.assign(base.proportions, over.proportions);
  if (over.face)        Object.assign(base.face,        over.face);
  if (over.props !== undefined) base.props = [...over.props];
  return base;
}

/** Apply a sub-race's defaults on top of an existing DNA (biped only). */
export function dnaForSubRace(subRace: SubRace, base: CreatureDNA): CreatureDNA {
  const dna = cloneDNA(base);
  dna.subRace = subRace;
  if (subRace === 'none') return dna;
  const def = SUBRACE_DEFS[subRace];
  if (def.proportions) Object.assign(dna.proportions, def.proportions);
  if (def.colors)      Object.assign(dna.colors,      def.colors);
  if (def.face)        Object.assign(dna.face,        def.face);
  if (def.props !== undefined) dna.props = [...def.props];
  return dna;
}"""

dna_src = dna_src.replace(OLD_FOR_ARCH, NEW_FOR_ARCH)

# 1f. Update base64ToDna to inject subRace for old saves
OLD_SERIAL = """\
export function dnaToBase64(dna: CreatureDNA): string { return btoa(JSON.stringify(dna)); }
export function base64ToDna(b64: string): CreatureDNA  { return JSON.parse(atob(b64)) as CreatureDNA; }"""

NEW_SERIAL = """\
export function dnaToBase64(dna: CreatureDNA): string { return btoa(JSON.stringify(dna)); }
export function base64ToDna(b64: string): CreatureDNA {
  const dna = JSON.parse(atob(b64)) as CreatureDNA;
  // Backwards-compat: old saves have no subRace field.
  if (dna.subRace === undefined) dna.subRace = dna.archetype === 'biped' ? 'human' : 'none';
  return dna;
}"""

dna_src = dna_src.replace(OLD_SERIAL, NEW_SERIAL)

dna_path.write_text(dna_src, encoding="utf-8")
print("✅  CreatureDNA.ts updated")

# ─────────────────────────────────────────────────────────────────────────────
# 2.  CreatureBuilder.ts — add ear geometry in _biped based on subrace
# ─────────────────────────────────────────────────────────────────────────────

builder_path = CREATURES_DIR / "CreatureBuilder.ts"
builder_src = builder_path.read_text(encoding="utf-8")

# 2a. Update imports to include SubRace types
OLD_BUILDER_IMPORT = "import type { CreatureDNA, PropId } from './CreatureDNA';"
NEW_BUILDER_IMPORT = "import type { CreatureDNA, PropId, EarShape } from './CreatureDNA';\nimport { SUBRACE_DEFS } from './CreatureDNA';"
builder_src = builder_src.replace(OLD_BUILDER_IMPORT, NEW_BUILDER_IMPORT)

# 2b. Add _ears() helper after _faceplane function
OLD_HEADGEO_FUNC = """\
function _headgeo(ftype: string, hs: number): THREE.BufferGeometry {"""

NEW_EAR_FUNC = """\
function _ears(
  earShape: EarShape, hs: number, head: THREE.Group,
  mat: THREE.MeshPhysicalMaterial, ms: THREE.Mesh[],
): void {
  if (earShape === 'none' || earShape === 'round') return; // round ears = no visible geometry
  if (earShape === 'pointed') {
    // Slender pointy elven/pixie/fae ears — thin cones angled outward
    for (const s of [-1, 1] as const) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.045 * hs, 0.22 * hs, 5), mat);
      m.position.set(s * 0.2 * hs, 0.08 * hs, 0);
      m.rotation.z = s * 1.2;
      head.add(m); ms.push(m);
    }
  } else if (earShape === 'large') {
    // Wide flat goblin / troll ears — flattened sphere halves
    for (const s of [-1, 1] as const) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13 * hs, 8, 6, 0, Math.PI), mat);
      m.position.set(s * 0.22 * hs, 0, 0);
      m.rotation.y = s * Math.PI / 2;
      m.rotation.z = s * 0.2;
      head.add(m); ms.push(m);
    }
  }
}

function _headgeo(ftype: string, hs: number): THREE.BufferGeometry {"""

builder_src = builder_src.replace(OLD_HEADGEO_FUNC, NEW_EAR_FUNC)

# 2c. In _biped, after head group is created and face plane added, call _ears
# Find the face plane call and add ears after it
OLD_BIPED_FACE = """\
  // Head
  const hs = p.headSize;
  const headGroup = new THREE.Group();
  bones.head = headGroup; neck.add(headGroup);
  const headMesh = new THREE.Mesh(_headgeo(dna.face.type, hs), pm);
  headGroup.add(headMesh); ms.push(headMesh);
  const { tex, plane: facePlane } = _faceplane(dna, hs);
  headGroup.add(facePlane); ms.push(facePlane);"""

NEW_BIPED_FACE = """\
  // Head
  const hs = p.headSize;
  const headGroup = new THREE.Group();
  bones.head = headGroup; neck.add(headGroup);
  // Sub-race head size modifier
  const srDef = dna.subRace !== 'none' ? SUBRACE_DEFS[dna.subRace] : null;
  const headScale = srDef?.headStyle === 'large' ? 1.18 : srDef?.headStyle === 'small' ? 0.82 : srDef?.headStyle === 'elongated' ? 1.0 : 1.0;
  headGroup.scale.setScalar(headScale);
  const headMesh = new THREE.Mesh(_headgeo(dna.face.type, hs), pm);
  headGroup.add(headMesh); ms.push(headMesh);
  const { tex, plane: facePlane } = _faceplane(dna, hs);
  headGroup.add(facePlane); ms.push(facePlane);
  // Sub-race ears
  _ears(srDef?.earShape ?? 'round', hs, headGroup, sm, ms);"""

builder_src = builder_src.replace(OLD_BIPED_FACE, NEW_BIPED_FACE)

builder_path.write_text(builder_src, encoding="utf-8")
print("✅  CreatureBuilder.ts updated")

# ─────────────────────────────────────────────────────────────────────────────
# 3.  CharacterCreation.ts — add sub-race selector row + wire it up
# ─────────────────────────────────────────────────────────────────────────────

cc_path = UI_DIR / "CharacterCreation.ts"
cc_src = cc_path.read_text(encoding="utf-8")

# 3a. Update DNA imports to add SubRace, BIPED_SUBRACES, SUBRACE_DEFS, dnaForSubRace
OLD_CC_IMPORT = """\
import {
  type CreatureDNA, type Archetype, type FaceType, type MouthType, type PropId,
  DEFAULT_PLAYER_DNA, dnaForArchetype, cloneDNA, numToHex, hexToNum, dnaToBase64,
} from '@/creatures/CreatureDNA';"""

NEW_CC_IMPORT = """\
import {
  type CreatureDNA, type Archetype, type FaceType, type MouthType, type PropId,
  type SubRace,
  DEFAULT_PLAYER_DNA, dnaForArchetype, dnaForSubRace, cloneDNA,
  numToHex, hexToNum, dnaToBase64,
  BIPED_SUBRACES, SUBRACE_DEFS,
} from '@/creatures/CreatureDNA';"""

cc_src = cc_src.replace(OLD_CC_IMPORT, NEW_CC_IMPORT)

# 3b. Add CSS for subrace row (insert before .cc-prop-grid)
OLD_CC_CSS_PROP = """.cc-prop-grid { display: flex; flex-wrap: wrap; gap: 5px; }"""
NEW_CC_CSS_PROP = """\
.cc-subrace-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.cc-subrace-chip { font-size: .72rem; padding: 3px 8px; border-radius: 14px;
  border: 1px solid #2e1f50; color: #8070b0; cursor: pointer; user-select: none;
  background: transparent; transition: all .12s; white-space: nowrap; }
.cc-subrace-chip:hover { border-color: #5040a0; color: #c0b0e0; }
.cc-subrace-chip.cc-chip--on { background: #2a1858; border-color: #7050cc; color: #d4c8f8; }
.cc-prop-grid { display: flex; flex-wrap: wrap; gap: 5px; }"""

cc_src = cc_src.replace(OLD_CC_CSS_PROP, NEW_CC_CSS_PROP)

# 3c. Add _subRaceRow and _subRaceChips fields to the class
OLD_CC_FIELDS = """\
  private readonly _archChips   = new Map<Archetype, HTMLElement>();
  private readonly _boonCards   = new Map<string, HTMLElement>();
  private readonly _faceChips   = new Map<string, HTMLElement>();
  private readonly _mouthChips  = new Map<string, HTMLElement>();
  private readonly _propChips   = new Map<string, HTMLElement>();"""

NEW_CC_FIELDS = """\
  private readonly _archChips     = new Map<Archetype, HTMLElement>();
  private readonly _subRaceChips  = new Map<SubRace, HTMLElement>();
  private          _subRaceRow!:    HTMLElement;
  private readonly _boonCards     = new Map<string, HTMLElement>();
  private readonly _faceChips     = new Map<string, HTMLElement>();
  private readonly _mouthChips    = new Map<string, HTMLElement>();
  private readonly _propChips     = new Map<string, HTMLElement>();"""

cc_src = cc_src.replace(OLD_CC_FIELDS, NEW_CC_FIELDS)

# 3d. Update archetype chip click handler to show/hide subrace row + reset subrace
OLD_ARCH_CLICK = """\
      chip.onclick = () => { this._dna = dnaForArchetype(a.id); this._syncControls(); this._preview?.setDNA(this._dna); };"""

NEW_ARCH_CLICK = """\
      chip.onclick = () => {
        this._dna = dnaForArchetype(a.id);
        this._subRaceRow.style.display = a.id === 'biped' ? 'flex' : 'none';
        this._syncControls();
        this._preview?.setDNA(this._dna);
      };"""

cc_src = cc_src.replace(OLD_ARCH_CLICK, NEW_ARCH_CLICK)

# 3e. Add sub-race row after the archetype section, before boon section
OLD_ARCH_SECTION_END = """\
    archSec.append(archTitle, archChips);

    // Boon"""

NEW_ARCH_SECTION_END = """\
    archSec.append(archTitle, archChips);

    // Sub-race selector (biped only)
    const subRaceLabel = document.createElement('div');
    subRaceLabel.className = 'cc-label'; subRaceLabel.textContent = 'Species';
    subRaceLabel.style.marginTop = '4px';
    this._subRaceRow = document.createElement('div');
    this._subRaceRow.className = 'cc-subrace-row';
    this._subRaceRow.style.display = this._dna.archetype === 'biped' ? 'flex' : 'none';
    for (const sr of BIPED_SUBRACES) {
      const def = SUBRACE_DEFS[sr];
      const chip = document.createElement('div');
      chip.className = 'cc-subrace-chip';
      chip.textContent = def.icon + ' ' + def.label;
      chip.title = def.hint;
      chip.onclick = () => {
        this._dna = dnaForSubRace(sr, this._dna);
        this._syncControls();
        this._preview?.setDNA(this._dna);
      };
      this._subRaceChips.set(sr, chip);
      this._subRaceRow.appendChild(chip);
    }
    archSec.append(subRaceLabel, this._subRaceRow);

    // Boon"""

cc_src = cc_src.replace(OLD_ARCH_SECTION_END, NEW_ARCH_SECTION_END)

# 3f. Update _syncControls to sync sub-race chips
# Find the existing _syncControls method and add subrace sync
OLD_SYNC_ARCH = """\
    this._archChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === this._dna.archetype));"""

NEW_SYNC_ARCH = """\
    this._archChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === this._dna.archetype));
    this._subRaceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === this._dna.subRace));
    this._subRaceRow.style.display = this._dna.archetype === 'biped' ? 'flex' : 'none';"""

cc_src = cc_src.replace(OLD_SYNC_ARCH, NEW_SYNC_ARCH)

cc_path.write_text(cc_src, encoding="utf-8")
print("✅  CharacterCreation.ts updated")

print("\nAll done. Run: npx tsc --noEmit")
