// ── CharacterCreation ────────────────────────────────────────────────────────
//
//  DNA-based character creation screen.  Every being type (biped, quadruped,
//  amoeba, avian, serpent) can be chosen — the player is NOT constrained to
//  a human shape.  Appearance is described by CreatureDNA and rendered live
//  via CreatureBuilder in a dedicated WebGLRenderer.

import * as THREE from 'three';
import {
  type CreatureDNA, type Archetype, type FaceType, type MouthType, type PropId,
  type SubRace, type OutfitTopId, type OutfitLegsId, type OutfitOverId,
  DEFAULT_PLAYER_DNA, dnaForArchetype, dnaForSubRace, cloneDNA,
  numToHex, hexToNum, dnaToBase64,
  BIPED_SUBRACES, SUBRACE_DEFS,
} from '@/creatures/CreatureDNA';
import { buildCreature, type CreatureRig } from '@/creatures/CreatureBuilder';
import { animateCreature }                 from '@/creatures/CreatureAnimator';
import { randomDNA, mutateDNA }            from '@/creatures/CreatureRandomiser';

// ── Public types ──────────────────────────────────────────────────────────────

export type StartingBoon = 'tome' | 'blood' | 'swift';

export interface CharacterConfig {
  name:   string;
  boon:   StartingBoon;
  slotId: number;
  dna:    CreatureDNA;
}

// ── Boon data ─────────────────────────────────────────────────────────────────

interface BoonDef { id: StartingBoon; icon: string; title: string; desc: string; effect: string; }
const BOONS: BoonDef[] = [
  { id: 'tome',  icon: '📖', title: 'Ancient Tome',    desc: 'A singed spellbook left in the cell.',            effect: 'Start with Flame Dart' },
  { id: 'blood', icon: '❤',  title: "Warrior's Blood", desc: 'Old lineage — harder to extinguish.',             effect: '+30 maximum HP' },
  { id: 'swift', icon: '💨', title: 'Swift Feet',      desc: 'A talent for movement and mischief.',             effect: 'Dodge −35%  •  Move +15%' },
];

// ── Archetype data ────────────────────────────────────────────────────────────

interface ArchDef { id: Archetype; icon: string; label: string; hint: string; }
const ARCHETYPES: ArchDef[] = [
  { id: 'biped',     icon: '🧙', label: 'Biped',     hint: 'Two-legged — arms, legs, full spellcasting posture.' },
  { id: 'quadruped', icon: '🐺', label: 'Quadruped', hint: 'Four-limbed beast — swift, imposing.' },
  { id: 'amoeba',    icon: '🫧', label: 'Amoeba',    hint: 'Amorphous blob — orbiting satellite masses.' },
  { id: 'avian',     icon: '🦅', label: 'Avian',     hint: 'Winged form — graceful, airborne aesthetic.' },
  { id: 'serpent',   icon: '🐍', label: 'Serpent',   hint: 'Segmented serpentine — sinuous and ancient.' },
];

// ── Prop data ─────────────────────────────────────────────────────────────────

interface PropDef { id: PropId; label: string; }
const PROP_DEFS: PropDef[] = [
  { id: 'crown',       label: 'Crown'      },
  { id: 'horns_small', label: 'Horns (S)'  },
  { id: 'horns_large', label: 'Horns (L)'  },
  { id: 'wings_bat',   label: 'Bat Wings'  },
  { id: 'tail_stub',   label: 'Tail (stub)'},
  { id: 'tail_long',   label: 'Tail (long)'},
  { id: 'aura',        label: 'Aura'       },
];

// ── CSS ───────────────────────────────────────────────────────────────────────

const CC_CSS = `
.cc-overlay {
  display: none; align-items: center; justify-content: center;
  position: fixed; inset: 0; z-index: 8500;
  background: rgba(4,3,10,.92); backdrop-filter: blur(6px);
  opacity: 0; transition: opacity .25s ease;
  font-family: 'Crimson Text','Georgia',serif; overflow-y: auto;
}
.cc-overlay.cc-open { opacity: 1; }
.cc-card {
  background: linear-gradient(160deg,#0e0b1a 0%,#07060f 100%);
  border: 1px solid #3a2860; border-radius: 4px; padding: 22px 24px 18px;
  width: min(98vw, 860px); display: flex; flex-direction: column; gap: 14px;
  box-shadow: 0 20px 80px rgba(0,0,0,.9); margin: auto;
}
.cc-title { font-size: 1.65rem; color: #e8d8b0; letter-spacing: .08em; text-align: center;
  text-shadow: 0 0 24px rgba(160,120,220,.5); margin-bottom: -8px; }
.cc-subtitle { font-size: .8rem; color: #5a4880; text-align: center; letter-spacing: .08em; text-transform: uppercase; }
.cc-main { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.cc-preview-col { flex: 0 0 240px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.cc-preview-canvas { display: block; width: 240px; height: 300px; border: 1px solid #2a1850;
  border-radius: 4px; cursor: grab; user-select: none; background: #0d0b18; }
.cc-preview-canvas:active { cursor: grabbing; }
.cc-drag-hint { font-size: .68rem; color: #3a2860; letter-spacing: .06em; text-transform: uppercase; }
.cc-dna-btn { background: transparent; border: 1px solid #2a1850; border-radius: 3px;
  color: #5a4880; font-size: .72rem; cursor: pointer; padding: 4px 10px; font-family: inherit;
  letter-spacing: .04em; transition: all .12s; }
.cc-dna-btn:hover { background: rgba(80,48,160,.1); color: #a080e0; border-color: #4a3870; }
.cc-dna-btn.cc-dna-btn--roll { background: rgba(90,60,160,.12); border-color: #4a3070; color: #c0a0f0; font-size: .8rem; }
.cc-dna-btn.cc-dna-btn--roll:hover { background: rgba(110,70,200,.25); color: #e0d0ff; }
.cc-controls-col { flex: 1 1 280px; min-width: 230px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 82vh; }
.cc-label { font-size: .76rem; color: #7a6a99; letter-spacing: .08em; text-transform: uppercase; display: block; margin-bottom: 4px; }
.cc-name-input { width: 100%; box-sizing: border-box;
  background: #07060f; border: 1px solid #2e1f50; border-radius: 3px;
  color: #e0d0ff; font-size: 1.02rem; font-family: inherit; padding: 7px 11px;
  outline: none; transition: border-color .15s; }
.cc-name-input:focus { border-color: #7050cc; box-shadow: 0 0 0 2px rgba(112,80,204,.18); }
.cc-section { display: flex; flex-direction: column; gap: 7px; }
.cc-section-title { font-size: .76rem; color: #5a4880; letter-spacing: .1em; text-transform: uppercase;
  border-bottom: 1px solid #1a1228; padding-bottom: 3px; }
.cc-chips { display: flex; gap: 5px; flex-wrap: wrap; }
.cc-chip { border: 1px solid #2a1850; border-radius: 3px; padding: 5px 9px;
  background: rgba(255,255,255,.02); cursor: pointer; transition: all .12s;
  font-size: .8rem; color: #7060a0; font-family: inherit; user-select: none; }
.cc-chip:hover { background: rgba(112,80,204,.08); border-color: #3a2860; }
.cc-chip.cc-chip--on { background: rgba(112,80,204,.18); border-color: #7050cc; color: #d4c0f0; }
.cc-boon { display: flex; align-items: flex-start; gap: 9px;
  background: rgba(255,255,255,.02); border: 1px solid #1e1530;
  border-radius: 3px; padding: 7px 10px; cursor: pointer; transition: all .12s; }
.cc-boon:hover { background: rgba(112,80,204,.07); border-color: #3a2860; }
.cc-boon.cc-boon--on { background: rgba(112,80,204,.14); border-color: #7050cc; }
.cc-boon-icon { font-size: 1.2rem; flex-shrink: 0; margin-top: 1px; }
.cc-boon-title { color: #d4c0f0; font-size: .9rem; }
.cc-boon-desc  { color: #6a5a80; font-size: .76rem; line-height: 1.4; }
.cc-boon-effect{ color: #a080e8; font-size: .72rem; margin-top: 1px; }
.cc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cc-row-lbl { font-size: .75rem; color: #7a6a99; min-width: 48px; flex-shrink: 0; }
.cc-color-input { width: 38px; height: 24px; border: 1px solid #2a1850; border-radius: 3px;
  padding: 2px; background: #07060f; cursor: pointer;
  -webkit-appearance: none; appearance: none; }
.cc-color-input::-webkit-color-swatch-wrapper { padding: 1px; }
.cc-color-input::-webkit-color-swatch { border: none; border-radius: 2px; }
.cc-slider { flex: 1; accent-color: #7050cc; cursor: pointer; min-width: 80px; }
.cc-slider-val { font-size: .72rem; color: #5a4880; min-width: 28px; text-align: right; }
.cc-subrace-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.cc-subrace-chip { font-size: .72rem; padding: 3px 8px; border-radius: 14px;
  border: 1px solid #2e1f50; color: #8070b0; cursor: pointer; user-select: none;
  background: transparent; transition: all .12s; white-space: nowrap; }
.cc-subrace-chip:hover { border-color: #5040a0; color: #c0b0e0; }
.cc-subrace-chip.cc-chip--on { background: #2a1858; border-color: #7050cc; color: #d4c8f8; }
.cc-prop-grid { display: flex; flex-wrap: wrap; gap: 5px; }
.cc-prop { display: flex; align-items: center; gap: 4px; cursor: pointer;
  font-size: .76rem; color: #7060a0; user-select: none; }
.cc-prop-box { width: 12px; height: 12px; border: 1.5px solid #3a2860; border-radius: 2px;
  background: transparent; flex-shrink: 0; transition: all .12s; }
.cc-prop:hover .cc-prop-box { border-color: #7050cc; }
.cc-prop.cc-prop--on .cc-prop-box { background: #7050cc; border-color: #9070e0; }
.cc-prop.cc-prop--on { color: #d4c0f0; }
.cc-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
.cc-btn { border: none; border-radius: 3px; cursor: pointer; font-family: inherit;
  font-size: .9rem; letter-spacing: .04em; padding: 9px 20px; transition: background .12s, transform .05s; }
.cc-btn:active { transform: scale(.97); }
.cc-btn--back { background: transparent; border: 1px solid #2e1f50; color: #7060a0; }
.cc-btn--back:hover { background: rgba(255,255,255,.04); border-color: #4a3870; }
.cc-btn--start { background: linear-gradient(135deg,#5030a0,#7050cc); color: #f0e8ff;
  font-weight: 600; box-shadow: 0 4px 18px rgba(80,48,160,.45); }
.cc-btn--start:hover { background: linear-gradient(135deg,#6040b8,#8060e0); }
`;

// ── CharacterPreview ──────────────────────────────────────────────────────────

const PW = 240, PH = 300;

class CharacterPreview {
  private readonly _renderer: THREE.WebGLRenderer;
  private readonly _scene:    THREE.Scene;
  private readonly _camera:   THREE.PerspectiveCamera;
  private _rig:   CreatureRig | null = null;
  private _rafId: number | null = null;
  private _rotY  = 0;
  private _drag  = false;
  private _prevX = 0;
  private _rotYStart = 0;

  constructor(canvas: HTMLCanvasElement, dna: CreatureDNA) {
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this._renderer.setSize(PW, PH);
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this._renderer.setClearColor(0x0d0b18);

    this._scene  = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(42, PW / PH, 0.1, 50);
    this._camera.position.set(0.4, 1.5, 3.2);
    this._camera.lookAt(0, 1.1, 0);

    this._scene.add(new THREE.AmbientLight(0xffe8d0, 0.65));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.15); key.position.set(3, 5, 3); this._scene.add(key);
    const rim = new THREE.DirectionalLight(0x8060ff, 0.38);  rim.position.set(-3, 2, -2); this._scene.add(rim);

    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0x0a0814, transparent: true, opacity: 0.4 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01; this._scene.add(disc);

    this._build(dna);
    this._bindPointer(canvas);
  }

  private _build(dna: CreatureDNA): void {
    if (this._rig) { this._scene.remove(this._rig.root); this._rig.dispose(); }
    this._rig = buildCreature(dna);
    this._scene.add(this._rig.root);
  }

  setDNA(dna: CreatureDNA): void { this._build(dna); }

  startLoop(): void {
    if (this._rafId !== null) return;
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      if (!this._drag) this._rotY += 0.007;
      if (this._rig) {
        this._rig.root.rotation.y = this._rotY;
        const t = performance.now() * 0.001;
        this._rig.root.position.y = Math.sin(t * 1.2) * 0.016;
        animateCreature(this._rig, { state: 'idle', time: t });
      }
      this._renderer.render(this._scene, this._camera);
    };
    tick();
  }

  stopLoop(): void {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  private _bindPointer(cv: HTMLCanvasElement): void {
    cv.addEventListener('pointerdown', (e) => { this._drag = true; this._prevX = e.clientX; this._rotYStart = this._rotY; });
    window.addEventListener('pointermove', (e) => { if (this._drag) this._rotY = this._rotYStart + (e.clientX - this._prevX) * 0.012; });
    window.addEventListener('pointerup', () => { this._drag = false; });
  }

  dispose(): void { this.stopLoop(); this._rig?.dispose(); this._renderer.dispose(); }
}

// ── CharacterCreation ─────────────────────────────────────────────────────────

export class CharacterCreation {
  private readonly _overlay: HTMLElement;
  private _preview:  CharacterPreview | null = null;
  private _dna:      CreatureDNA = cloneDNA(DEFAULT_PLAYER_DNA);
  private _boon:     StartingBoon = 'tome';
  private _slotId    = 0;

  // Control refs (populated in _build)
  private _nameInput!: HTMLInputElement;
  private _archChips  = new Map<Archetype, HTMLElement>();
  private _subRaceChips = new Map<SubRace, HTMLElement>();
  private _subRaceRow!: HTMLElement;
  private _boonCards  = new Map<StartingBoon, HTMLElement>();
  private _faceChips  = new Map<FaceType,  HTMLElement>();
  private _mouthChips = new Map<MouthType, HTMLElement>();
  private _propChips      = new Map<PropId,      HTMLElement>();
  private _outfitTopChips  = new Map<OutfitTopId,  HTMLElement>();
  private _outfitLegsChips = new Map<OutfitLegsId, HTMLElement>();
  private _outfitOverChips = new Map<OutfitOverId, HTMLElement>();
  private _outfitSec!: HTMLElement;
  private _morphInputs: Array<{ prop: string; slider: HTMLInputElement; val: HTMLElement }> = [];
  private _primaryInput!:   HTMLInputElement;
  private _secondaryInput!: HTMLInputElement;
  private _emissiveInput!:  HTMLInputElement;
  private _emissiveSlider!: HTMLInputElement;
  private _emissiveVal!:    HTMLElement;
  private _scaleSlider!:    HTMLInputElement;
  private _scaleVal!:       HTMLElement;
  private _eyeInput!:       HTMLInputElement;

  constructor(
    private readonly _onStart: (cfg: CharacterConfig) => void,
    private readonly _onBack:  () => void,
  ) {
    _ensureStyles();
    this._overlay = this._build();
    document.body.appendChild(this._overlay);
  }

  show(slotId: number): void {
    this._slotId = slotId;
    this._dna    = cloneDNA(DEFAULT_PLAYER_DNA);
    this._boon   = 'tome';
    this._overlay.style.display = 'flex';
    requestAnimationFrame(() => this._overlay.classList.add('cc-open'));
    const canvas = this._overlay.querySelector<HTMLCanvasElement>('.cc-preview-canvas')!;
    if (!this._preview) this._preview = new CharacterPreview(canvas, this._dna);
    else                this._preview.setDNA(this._dna);
    this._syncControls();
    this._preview.startLoop();
  }

  hide(): void {
    this._overlay.classList.remove('cc-open');
    this._preview?.stopLoop();
    setTimeout(() => { this._overlay.style.display = 'none'; }, 250);
  }

  dispose(): void { this._preview?.dispose(); this._overlay.remove(); }

  // ── Sync all control values from _dna ───────────────────────────────────

  private _syncControls(): void {
    const d = this._dna;
    this._nameInput.value     = '';
    this._primaryInput.value   = numToHex(d.colors.primary);
    this._secondaryInput.value = numToHex(d.colors.secondary);
    this._emissiveInput.value  = numToHex(d.colors.emissive);
    this._emissiveSlider.value = String(d.colors.emissiveIntensity);
    this._emissiveVal.textContent = d.colors.emissiveIntensity.toFixed(2);
    this._scaleSlider.value   = String(d.proportions.global);
    this._scaleVal.textContent = d.proportions.global.toFixed(2);
    for (const { prop, slider, val } of this._morphInputs) {
      const v = ((d.proportions as any)[prop] as number) ?? 1.0;
      slider.value = String(v); val.textContent = v.toFixed(2);
    }
    this._eyeInput.value      = numToHex(d.face.eyeColor);

    this._archChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.archetype));
    this._subRaceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.subRace));
    this._subRaceRow.style.display = d.archetype === 'biped' ? 'flex' : 'none';
    this._boonCards.forEach((el, id) => el.classList.toggle('cc-boon--on', id === this._boon));
    this._faceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.type));
    this._mouthChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.mouthType));
    this._propChips.forEach((el, id) => el.classList.toggle('cc-prop--on', d.props.includes(id)));
    this._outfitTopChips.forEach((el, id) => el.classList.toggle('cc-chip--on',  id === d.outfit.top));
    this._outfitLegsChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.outfit.legs));
    this._outfitOverChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.outfit.over));
    this._outfitSec.style.display = d.archetype === 'biped' ? 'flex' : 'none';
  }

  // ── DOM builder ──────────────────────────────────────────────────────────

  private _build(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'cc-overlay';

    const card = document.createElement('div');
    card.className = 'cc-card';

    // Title
    const title = document.createElement('div'); title.className = 'cc-title'; title.textContent = 'SHAPE YOUR BEING';
    const sub   = document.createElement('div'); sub.className   = 'cc-subtitle'; sub.textContent = 'Form • Boon • Appearance';
    card.append(title, sub);

    // Two-column main
    const main = document.createElement('div');
    main.className = 'cc-main';

    // ── Left column: preview ────────────────────────────────────────────────
    const previewCol = document.createElement('div');
    previewCol.className = 'cc-preview-col';
    const canvas = document.createElement('canvas');
    canvas.className = 'cc-preview-canvas';
    const hint = document.createElement('div'); hint.className = 'cc-drag-hint'; hint.textContent = 'Drag to rotate';
    const dnaBtn = document.createElement('button'); dnaBtn.className = 'cc-dna-btn'; dnaBtn.textContent = '📋 Copy DNA';
    dnaBtn.onclick = () => {
      navigator.clipboard?.writeText(dnaToBase64(this._dna)).catch(() => {});
    };
    const rollBtn = document.createElement('button'); rollBtn.className = 'cc-dna-btn cc-dna-btn--roll'; rollBtn.textContent = '🎲 Lucky Roll';
    rollBtn.onclick = () => {
      this._dna = randomDNA(Date.now() >>> 0);
      this._syncControls();
      this._preview?.setDNA(this._dna);
    };
    const mutateBtn = document.createElement('button'); mutateBtn.className = 'cc-dna-btn'; mutateBtn.textContent = '~ Mutate';
    mutateBtn.onclick = () => {
      this._dna = mutateDNA(this._dna, 0.25, Date.now() >>> 0);
      this._syncControls();
      this._preview?.setDNA(this._dna);
    };
    previewCol.append(canvas, hint, rollBtn, mutateBtn, dnaBtn);

    // ── Right column: controls ──────────────────────────────────────────────
    const ctrlCol = document.createElement('div');
    ctrlCol.className = 'cc-controls-col';

    // Name
    const nameWrap = document.createElement('div'); nameWrap.className = 'cc-section';
    const nameLbl = document.createElement('label'); nameLbl.className = 'cc-label'; nameLbl.textContent = 'Name';
    this._nameInput = document.createElement('input');
    this._nameInput.type = 'text'; this._nameInput.className = 'cc-name-input';
    this._nameInput.placeholder = 'Enter a name…'; this._nameInput.maxLength = 24;
    nameWrap.append(nameLbl, this._nameInput);

    // Archetype
    const archSec = document.createElement('div'); archSec.className = 'cc-section';
    const archTitle = document.createElement('div'); archTitle.className = 'cc-section-title'; archTitle.textContent = 'Form';
    const archChips = document.createElement('div'); archChips.className = 'cc-chips';
    for (const a of ARCHETYPES) {
      const chip = document.createElement('div'); chip.className = 'cc-chip';
      chip.textContent = a.icon + ' ' + a.label; chip.title = a.hint;
      chip.onclick = () => {
        this._dna = dnaForArchetype(a.id);
        this._subRaceRow.style.display = a.id === 'biped' ? 'flex' : 'none';
        this._syncControls();
        this._preview?.setDNA(this._dna);
      };
      this._archChips.set(a.id, chip); archChips.appendChild(chip);
    }
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

    // Boon
    const boonSec = document.createElement('div'); boonSec.className = 'cc-section';
    const boonTitle = document.createElement('div'); boonTitle.className = 'cc-section-title'; boonTitle.textContent = 'Boon';
    const boonList = document.createElement('div'); boonList.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
    for (const b of BOONS) {
      const card2 = document.createElement('div'); card2.className = 'cc-boon';
      const icon = document.createElement('span'); icon.className = 'cc-boon-icon'; icon.textContent = b.icon;
      const body = document.createElement('div');
      const t2 = document.createElement('div'); t2.className = 'cc-boon-title'; t2.textContent = b.title;
      const d2 = document.createElement('div'); d2.className = 'cc-boon-desc';  d2.textContent = b.desc;
      const e2 = document.createElement('div'); e2.className = 'cc-boon-effect'; e2.textContent = b.effect;
      body.append(t2, d2, e2); card2.append(icon, body);
      card2.onclick = () => { this._boon = b.id; this._boonCards.forEach((el, id) => el.classList.toggle('cc-boon--on', id === b.id)); };
      this._boonCards.set(b.id, card2); boonList.appendChild(card2);
    }
    boonSec.append(boonTitle, boonList);

    // Palette
    const palSec = this._makeSection('Palette');
    const colorRows: [string, 'primary' | 'secondary' | 'emissive'][] = [['Body', 'primary'], ['Accent', 'secondary'], ['Emissive', 'emissive']];
    for (const [lbl, key] of colorRows) {
      const row = document.createElement('div'); row.className = 'cc-row';
      const label = document.createElement('span'); label.className = 'cc-row-lbl'; label.textContent = lbl + ':';
      const inp = document.createElement('input'); inp.type = 'color'; inp.className = 'cc-color-input';
      inp.addEventListener('input', () => { this._dna.colors[key] = hexToNum(inp.value); this._preview?.setDNA(this._dna); });
      if (key === 'primary')   this._primaryInput   = inp;
      if (key === 'secondary') this._secondaryInput = inp;
      if (key === 'emissive')  this._emissiveInput  = inp;
      row.append(label, inp);
      palSec.appendChild(row);
    }
    // Emissive intensity
    const emRow = document.createElement('div'); emRow.className = 'cc-row';
    const emLbl = document.createElement('span'); emLbl.className = 'cc-row-lbl'; emLbl.textContent = 'Glow:';
    this._emissiveSlider = document.createElement('input'); this._emissiveSlider.type = 'range';
    this._emissiveSlider.className = 'cc-slider'; this._emissiveSlider.min = '0'; this._emissiveSlider.max = '0.5'; this._emissiveSlider.step = '0.01';
    this._emissiveVal = document.createElement('span'); this._emissiveVal.className = 'cc-slider-val';
    this._emissiveSlider.oninput = () => { this._dna.colors.emissiveIntensity = +this._emissiveSlider.value; this._emissiveVal.textContent = (+this._emissiveSlider.value).toFixed(2); this._preview?.setDNA(this._dna); };
    emRow.append(emLbl, this._emissiveSlider, this._emissiveVal); palSec.appendChild(emRow);

    // Face
    const faceSec = this._makeSection('Face');
    // Face type chips
    const ftRow = document.createElement('div'); ftRow.className = 'cc-row';
    const ftLbl = document.createElement('span'); ftLbl.className = 'cc-row-lbl'; ftLbl.textContent = 'Type:';
    const ftChips = document.createElement('div'); ftChips.className = 'cc-chips';
    for (const ft of ['cute','angry','cyclops','skull','compound','blank'] as FaceType[]) {
      const chip = document.createElement('div'); chip.className = 'cc-chip'; chip.textContent = ft;
      chip.onclick = () => { this._dna.face.type = ft; this._faceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === ft)); this._preview?.setDNA(this._dna); };
      this._faceChips.set(ft, chip); ftChips.appendChild(chip);
    }
    ftRow.append(ftLbl, ftChips); faceSec.appendChild(ftRow);

    // Mouth chips
    const mRow = document.createElement('div'); mRow.className = 'cc-row';
    const mLbl = document.createElement('span'); mLbl.className = 'cc-row-lbl'; mLbl.textContent = 'Mouth:';
    const mChips = document.createElement('div'); mChips.className = 'cc-chips';
    for (const mt of ['smile','frown','beak','fangs','none'] as MouthType[]) {
      const chip = document.createElement('div'); chip.className = 'cc-chip'; chip.textContent = mt;
      chip.onclick = () => { this._dna.face.mouthType = mt; this._mouthChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === mt)); this._preview?.setDNA(this._dna); };
      this._mouthChips.set(mt, chip); mChips.appendChild(chip);
    }
    mRow.append(mLbl, mChips); faceSec.appendChild(mRow);

    // Eye color
    const eyRow = document.createElement('div'); eyRow.className = 'cc-row';
    const eyLbl = document.createElement('span'); eyLbl.className = 'cc-row-lbl'; eyLbl.textContent = 'Eye:';
    this._eyeInput = document.createElement('input'); this._eyeInput.type = 'color'; this._eyeInput.className = 'cc-color-input';
    this._eyeInput.addEventListener('input', () => { this._dna.face.eyeColor = hexToNum(this._eyeInput.value); this._preview?.setDNA(this._dna); });
    eyRow.append(eyLbl, this._eyeInput); faceSec.appendChild(eyRow);

    // Props
    const propSec = this._makeSection('Props');
    const propGrid = document.createElement('div'); propGrid.className = 'cc-prop-grid';
    for (const pd of PROP_DEFS) {
      const item = document.createElement('div'); item.className = 'cc-prop';
      const box = document.createElement('span'); box.className = 'cc-prop-box';
      const lbl2 = document.createElement('span'); lbl2.textContent = pd.label;
      item.append(box, lbl2);
      item.onclick = () => {
        const idx = this._dna.props.indexOf(pd.id);
        if (idx >= 0) this._dna.props.splice(idx, 1); else this._dna.props.push(pd.id);
        item.classList.toggle('cc-prop--on', this._dna.props.includes(pd.id));
        this._preview?.setDNA(this._dna);
      };
      this._propChips.set(pd.id, item); propGrid.appendChild(item);
    }
    propSec.appendChild(propGrid);

    // Outfit — Top / Legs / Over (biped only, _syncControls handles show/hide)
    this._outfitSec = this._makeSection('Outfit');
    {
      const topRow = document.createElement('div'); topRow.className = 'cc-row';
      const topLbl = document.createElement('span'); topLbl.className = 'cc-row-lbl'; topLbl.textContent = 'Top:';
      const topChips = document.createElement('div'); topChips.className = 'cc-chips';
      for (const [id, lbl4] of [['none','None'],['tunic','Tunic'],['robe_top','Robe Top'],['armor_chest','Armor'],['wrap','Wrap']] as const) {
        const chip = document.createElement('div'); chip.className = 'cc-chip'; chip.textContent = lbl4;
        chip.onclick = () => { this._dna.outfit.top = id; this._outfitTopChips.forEach((el, k) => el.classList.toggle('cc-chip--on', k === id)); this._preview?.setDNA(this._dna); };
        this._outfitTopChips.set(id, chip); topChips.appendChild(chip);
      }
      topRow.append(topLbl, topChips); this._outfitSec.appendChild(topRow);
    }
    {
      const legsRow = document.createElement('div'); legsRow.className = 'cc-row';
      const legsLbl = document.createElement('span'); legsLbl.className = 'cc-row-lbl'; legsLbl.textContent = 'Legs:';
      const legsChips = document.createElement('div'); legsChips.className = 'cc-chips';
      for (const [id, lbl4] of [['none','None'],['trousers','Trousers'],['skirt','Skirt'],['shorts','Shorts'],['loincloth','Loincloth'],['robe_skirt','Robe Skirt']] as const) {
        const chip = document.createElement('div'); chip.className = 'cc-chip'; chip.textContent = lbl4;
        chip.onclick = () => { this._dna.outfit.legs = id; this._outfitLegsChips.forEach((el, k) => el.classList.toggle('cc-chip--on', k === id)); this._preview?.setDNA(this._dna); };
        this._outfitLegsChips.set(id, chip); legsChips.appendChild(chip);
      }
      legsRow.append(legsLbl, legsChips); this._outfitSec.appendChild(legsRow);
    }
    {
      const overRow = document.createElement('div'); overRow.className = 'cc-row';
      const overLbl = document.createElement('span'); overLbl.className = 'cc-row-lbl'; overLbl.textContent = 'Over:';
      const overChips = document.createElement('div'); overChips.className = 'cc-chips';
      for (const [id, lbl4] of [['none','None'],['robe_full','Robe'],['cape','Cape'],['cloak','Cloak']] as const) {
        const chip = document.createElement('div'); chip.className = 'cc-chip'; chip.textContent = lbl4;
        chip.onclick = () => { this._dna.outfit.over = id; this._outfitOverChips.forEach((el, k) => el.classList.toggle('cc-chip--on', k === id)); this._preview?.setDNA(this._dna); };
        this._outfitOverChips.set(id, chip); overChips.appendChild(chip);
      }
      overRow.append(overLbl, overChips); this._outfitSec.appendChild(overRow);
    }

    // Scale
    const scaleSec = this._makeSection('Body');
    const scRow = document.createElement('div'); scRow.className = 'cc-row';
    const scLbl = document.createElement('span'); scLbl.className = 'cc-row-lbl'; scLbl.textContent = 'Global:';
    this._scaleSlider = document.createElement('input'); this._scaleSlider.type = 'range';
    this._scaleSlider.className = 'cc-slider'; this._scaleSlider.min = '0.5'; this._scaleSlider.max = '2.0'; this._scaleSlider.step = '0.05';
    this._scaleVal = document.createElement('span'); this._scaleVal.className = 'cc-slider-val';
    this._scaleSlider.oninput = () => { this._dna.proportions.global = +this._scaleSlider.value; this._scaleVal.textContent = (+this._scaleSlider.value).toFixed(2); this._preview?.setDNA(this._dna); };
    scRow.append(scLbl, this._scaleSlider, this._scaleVal); scaleSec.appendChild(scRow);
    // CC-3 morph sliders
    for (const md of [
      { label: 'Shoulders', prop: 'shoulderWidth', min: '0.5', max: '2.0', step: '0.05' },
      { label: 'Hips',      prop: 'hipWidth',      min: '0.5', max: '2.0', step: '0.05' },
      { label: 'Belly',     prop: 'bellySize',     min: '0.0', max: '1.5', step: '0.05' },
      { label: 'Neck W',    prop: 'neckThickness', min: '0.5', max: '1.8', step: '0.05' },
    ] as const) {
      const mRow = document.createElement('div'); mRow.className = 'cc-row';
      const mLbl = document.createElement('span'); mLbl.className = 'cc-row-lbl'; mLbl.textContent = md.label + ':';
      const mSlider = document.createElement('input'); mSlider.type = 'range';
      mSlider.className = 'cc-slider'; mSlider.min = md.min; mSlider.max = md.max; mSlider.step = md.step;
      const mVal = document.createElement('span'); mVal.className = 'cc-slider-val';
      mSlider.oninput = () => { (this._dna.proportions as any)[md.prop] = +mSlider.value; mVal.textContent = (+mSlider.value).toFixed(2); this._preview?.setDNA(this._dna); };
      mRow.append(mLbl, mSlider, mVal); scaleSec.appendChild(mRow);
      this._morphInputs.push({ prop: md.prop, slider: mSlider, val: mVal });
    }

    ctrlCol.append(nameWrap, archSec, boonSec, palSec, faceSec, propSec, this._outfitSec, scaleSec);
    main.append(previewCol, ctrlCol);

    // Actions
    const actions = document.createElement('div'); actions.className = 'cc-actions';
    const backBtn = document.createElement('button'); backBtn.className = 'cc-btn cc-btn--back'; backBtn.textContent = '← Back';
    backBtn.onclick = () => this._onBack();
    const startBtn = document.createElement('button'); startBtn.className = 'cc-btn cc-btn--start'; startBtn.textContent = 'Begin →';
    startBtn.onclick = () => {
      const name = this._nameInput.value.trim() || 'The Transmuter';
      this._onStart({ name, boon: this._boon, slotId: this._slotId, dna: cloneDNA(this._dna) });
    };
    actions.append(backBtn, startBtn);
    card.append(main, actions);
    overlay.appendChild(card);
    return overlay;
  }

  // Creates a section wrapper with a title div that returns the section element
  private _makeSection(title: string): HTMLElement {
    const sec = document.createElement('div'); sec.className = 'cc-section';
    const t   = document.createElement('div'); t.className   = 'cc-section-title'; t.textContent = title;
    sec.appendChild(t);
    return sec;
  }
}

function _ensureStyles(): void {
  if (document.getElementById('cc-css')) return;
  const s = document.createElement('style');
  s.id = 'cc-css'; s.textContent = CC_CSS;
  document.head.appendChild(s);
}
