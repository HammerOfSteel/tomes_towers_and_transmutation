// ── Editor UI: tabs, sliders, chips, swatches, dock, gallery ────────────────
//
//  Static chrome lives in princess-creator.html; this module renders the
//  dynamic controls and keeps them in sync with the store. Controls are
//  rebuilt on tab/archetype changes and value-synced otherwise (so an open
//  slider never gets yanked out from under the pointer).

import type { Archetype, PrincessDNA, Range, SpeciesId, ClassId } from './types';
import {
  SPECIES_IDS, CLASS_IDS, DRESS_STYLES, EYE_STYLES, MOUTH_STYLES, HAIR_STYLES,
  CROWN_IDS, EAR_IDS, TAIL_IDS, BACK_IDS, HAND_ITEM_IDS, IDLE_STYLES, RANGES,
} from './types';
import { defaultDna } from './dna';
import { SPECIES_DEFS, CLASS_DEFS, PALETTES } from './species';
import type { DnaStore } from './store';
import type { GalleryEntry } from './gallery';
import { STATE_IDS, type AnimId } from './anim/clips';

export interface UiActions {
  randomize(): void;
  mutate(): void;
  rollName(): void;
  setSpecies(s: SpeciesId): void;
  setClass(c: ClassId): void;
  setSubtype(id: string): void;
  copyCode(): void;
  importCode(code: string): boolean;
  exportPng(): void;
  exportGlb(): void;
  exportJson(): void;
  saveToGallery(): void;
  playNow(): void;
  loadGalleryEntry(id: string): void;
  deleteGalleryEntry(id: string): void;
  listClips(): Array<{ id: AnimId; label: string; group: string; loop: boolean }>;
  playClip(id: AnimId): void;
  setAnimState(id: AnimId): void;
  getAnimState(): AnimId;
  getTweak(id: AnimId): { speed: number; amp: number };
  setTweakValue(id: AnimId, patch: { speed?: number; amp?: number }): void;
  resetTweak(id: AnimId): void;
  exportAnims(): void;
  undo(): void;
  redo(): void;
  applyPalette(species: SpeciesId, paletteId: string): void;
  /** Palette-dot drag → paint-drop onto the princess (D5). */
  startPaintDrag(hex: string): void;
}

type TabId = 'body' | 'face' | 'hair' | 'parts' | 'colors' | 'motion';
const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'body', label: 'Body' },
  { id: 'face', label: 'Face' },
  { id: 'hair', label: 'Hair' },
  { id: 'parts', label: 'Parts' },
  { id: 'colors', label: 'Colors' },
  { id: 'motion', label: 'Motion' },
];

/** Signature sliders pinned to the top of the Body tab, per archetype. */
const SIGNATURE: Record<Archetype, Array<{ label: string; path: string; range: Range }>> = {
  human: [],
  fox: [
    { label: 'Snout', path: 'traits.snoutLength', range: RANGES.traits.snoutLength },
    { label: 'Fluffiness', path: 'traits.fluff', range: RANGES.traits.fluff },
  ],
  slime: [
    { label: 'Wobble', path: 'traits.wobble', range: RANGES.traits.wobble },
    { label: 'Translucency', path: 'traits.translucency', range: RANGES.traits.translucency },
    { label: 'Core Glow', path: 'traits.coreGlow', range: RANGES.traits.coreGlow },
  ],
  skeleton: [
    { label: 'Bone Gauge', path: 'traits.boneThickness', range: RANGES.traits.boneThickness },
    { label: 'Soul Glow', path: 'traits.eyeGlowIntensity', range: RANGES.traits.eyeGlowIntensity },
  ],
  lamia: [
    { label: 'Tail Length', path: 'body.legLength', range: RANGES.body.legLength },
    { label: 'Coil Girth', path: 'body.chubbiness', range: RANGES.body.chubbiness },
  ],
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls: string, parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  parent.appendChild(node);
  return node;
}

function get(dna: PrincessDNA, path: string): unknown {
  let cur: unknown = dna;
  for (const seg of path.split('.')) cur = (cur as Record<string, unknown>)[seg];
  return cur;
}

export class Ui {
  private activeTab: TabId = 'body';
  private updaters: Array<(dna: PrincessDNA) => void> = [];
  private tabContent: HTMLElement;
  private tabsBar: HTMLElement;
  private dock: HTMLElement;
  private galleryGrid: HTMLElement;
  private codeField: HTMLInputElement;
  private nameField: HTMLInputElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private subtypeWrap!: HTMLElement;

  constructor(private store: DnaStore, private actions: UiActions) {
    this.tabContent = document.getElementById('tab-content') as HTMLElement;
    this.tabsBar = document.getElementById('tabs') as HTMLElement;
    this.dock = document.getElementById('dock') as HTMLElement;
    this.galleryGrid = document.getElementById('gallery-grid') as HTMLElement;
    this.codeField = document.getElementById('share-code') as HTMLInputElement;
    this.nameField = document.getElementById('name-input') as HTMLInputElement;
    this.undoBtn = document.getElementById('btn-undo') as HTMLButtonElement;
    this.redoBtn = document.getElementById('btn-redo') as HTMLButtonElement;

    this.buildChrome();
    this.renderTab();
  }

  // ── Static chrome wiring ──
  private buildChrome(): void {
    for (const tab of TABS) {
      const b = el('button', 'tab', this.tabsBar);
      b.textContent = tab.label;
      b.dataset.tab = tab.id;
      b.onclick = () => {
        this.activeTab = tab.id;
        this.renderTab();
      };
    }

    // Species row
    const speciesRow = el('div', 'dock-row species-row', this.dock);
    for (const s of SPECIES_IDS) {
      const def = SPECIES_DEFS[s];
      const card = el('button', 'arch-card', speciesRow);
      card.dataset.species = s;
      card.title = def.blurb;
      card.innerHTML = `<span class="arch-icon">${def.icon}</span><span>${def.label}</span>`;
      card.onclick = () => this.actions.setSpecies(s);
    }
    // Class + subtype row
    const metaRow = el('div', 'dock-row meta-row', this.dock);
    const classWrap = el('div', 'dock-chips', metaRow);
    for (const c of CLASS_IDS) {
      const def = CLASS_DEFS[c];
      const chip = el('button', 'chip class-chip', classWrap);
      chip.dataset.pclass = c;
      chip.title = def.blurb;
      chip.textContent = `${def.icon} ${def.label}`;
      chip.onclick = () => this.actions.setClass(c);
    }
    this.subtypeWrap = el('div', 'dock-chips subtype-chips', metaRow);

    this.buildAnimPanel();

    (document.getElementById('btn-dice') as HTMLButtonElement).onclick = () => this.actions.rollName();
    (document.getElementById('btn-random') as HTMLButtonElement).onclick = () => this.actions.randomize();
    (document.getElementById('btn-mutate') as HTMLButtonElement).onclick = () => this.actions.mutate();
    (document.getElementById('btn-copy') as HTMLButtonElement).onclick = () => this.actions.copyCode();
    (document.getElementById('btn-export-png') as HTMLButtonElement).onclick = () => this.actions.exportPng();
    (document.getElementById('btn-export-glb') as HTMLButtonElement).onclick = () => this.actions.exportGlb();
    (document.getElementById('btn-export-json') as HTMLButtonElement).onclick = () => this.actions.exportJson();
    (document.getElementById('btn-save-gallery') as HTMLButtonElement).onclick = () => this.actions.saveToGallery();
    (document.getElementById('btn-play-now') as HTMLButtonElement).onclick = () => this.actions.playNow();
    this.undoBtn.onclick = () => this.actions.undo();
    this.redoBtn.onclick = () => this.actions.redo();

    const importField = document.getElementById('import-code') as HTMLInputElement;
    (document.getElementById('btn-import') as HTMLButtonElement).onclick = () => {
      const ok = this.actions.importCode(importField.value);
      if (!ok) {
        importField.classList.remove('shake');
        void importField.offsetWidth; // restart animation
        importField.classList.add('shake');
      } else {
        importField.value = '';
      }
    };

    this.nameField.addEventListener('focus', () => this.store.beginDrag());
    this.nameField.addEventListener('input', () => {
      this.store.set('name', this.nameField.value.slice(0, 24), 'none');
    });
    this.nameField.addEventListener('blur', () => this.store.endDrag());
  }

  // ── Control builders ──
  private slider(parent: HTMLElement, label: string, path: string, range: Range): void {
    const row = el('div', 'row', parent);
    const lab = el('label', '', row);
    lab.textContent = label;
    const input = el('input', 'slider', row);
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String((range.max - range.min) / 100);
    input.value = String(get(this.store.dna, path));
    input.addEventListener('pointerdown', () => this.store.beginDrag());
    input.addEventListener('input', () => {
      this.store.beginDrag();
      this.store.set(path, parseFloat(input.value), 'none');
    });
    input.addEventListener('change', () => this.store.endDrag());
    input.addEventListener('dblclick', () => {
      const def = get(defaultDna(this.store.dna.species), path) as number;
      this.store.set(path, def);
    });
    this.updaters.push((dna) => {
      if (document.activeElement !== input) input.value = String(get(dna, path));
    });
  }

  private chips<T extends string>(
    parent: HTMLElement, label: string, path: string, options: readonly T[],
  ): void {
    const wrap = el('div', 'chip-group', parent);
    const lab = el('div', 'chip-label', wrap);
    lab.textContent = label;
    const box = el('div', 'chips', wrap);
    const buttons = new Map<string, HTMLButtonElement>();
    for (const opt of options) {
      const b = el('button', 'chip', box);
      b.textContent = opt;
      b.onclick = () => this.store.set(path, opt);
      buttons.set(opt, b);
    }
    const update = (dna: PrincessDNA): void => {
      const val = get(dna, path) as string;
      for (const [opt, b] of buttons) b.classList.toggle('active', opt === val);
    };
    update(this.store.dna);
    this.updaters.push(update);
  }

  private toggle(parent: HTMLElement, label: string, path: string): void {
    const b = el('button', 'chip toggle', parent);
    b.textContent = label;
    b.onclick = () => this.store.set(path, !(get(this.store.dna, path) as boolean));
    const update = (dna: PrincessDNA): void => {
      b.classList.toggle('active', get(dna, path) as boolean);
    };
    update(this.store.dna);
    this.updaters.push(update);
  }

  private colorRow(parent: HTMLElement, label: string, path: string): void {
    const row = el('div', 'row color-row', parent);
    const lab = el('label', '', row);
    lab.textContent = label;
    const input = el('input', 'swatch', row);
    input.type = 'color';
    input.value = get(this.store.dna, path) as string;
    input.addEventListener('input', () => {
      this.store.beginDrag();
      this.store.set(path, input.value, 'none');
    });
    input.addEventListener('change', () => this.store.endDrag());
    this.updaters.push((dna) => {
      if (document.activeElement !== input) input.value = get(dna, path) as string;
    });
  }

  private section(parent: HTMLElement, title: string): HTMLElement {
    const s = el('div', 'section', parent);
    const h = el('div', 'section-title', s);
    h.textContent = title;
    return s;
  }

  // ── Tab rendering ──
  renderTab(): void {
    this.updaters = [];
    this.tabContent.innerHTML = '';
    for (const b of this.tabsBar.children) {
      (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tab === this.activeTab);
    }
    const c = this.tabContent;
    const arch = this.store.dna.archetype;

    if (this.activeTab === 'body') {
      const sig = SIGNATURE[arch];
      if (sig.length > 0) {
        const s = this.section(c, `${SPECIES_DEFS[this.store.dna.species].label} signature`);
        for (const def of sig) this.slider(s, def.label, def.path, def.range);
      }
      const s1 = this.section(c, 'Proportions');
      this.slider(s1, 'Height', 'body.height', RANGES.body.height);
      this.slider(s1, 'Head Size', 'body.headSize', RANGES.body.headSize);
      this.slider(s1, 'Chubbiness', 'body.chubbiness', RANGES.body.chubbiness);
      this.slider(s1, 'Arm Length', 'body.armLength', RANGES.body.armLength);
      this.slider(s1, 'Leg Length', 'body.legLength', RANGES.body.legLength);
      this.slider(s1, 'Shoulders', 'body.shoulderWidth', RANGES.body.shoulderWidth);
      this.slider(s1, 'Hips', 'body.hipWidth', RANGES.body.hipWidth);
      const s2 = this.section(c, 'Dress');
      this.chips(s2, 'Style', 'dress.style', DRESS_STYLES);
      this.slider(s2, 'Flare', 'dress.flare', RANGES.dress.flare);
      this.slider(s2, 'Length', 'dress.length', RANGES.dress.length);
      const togs = el('div', 'chips', s2);
      this.toggle(togs, 'trim', 'dress.trim');
      this.toggle(togs, 'sash', 'dress.sash');
      this.toggle(togs, 'puff sleeves', 'dress.puffSleeves');
    } else if (this.activeTab === 'face') {
      const s = this.section(c, 'Eyes');
      this.chips(s, 'Style', 'face.eyeStyle', EYE_STYLES);
      this.slider(s, 'Size', 'face.eyeSize', RANGES.face.eyeSize);
      this.slider(s, 'Spacing', 'face.eyeSpacing', RANGES.face.eyeSpacing);
      this.slider(s, 'Tilt', 'face.eyeTilt', RANGES.face.eyeTilt);
      const s2 = this.section(c, 'Expression');
      this.chips(s2, 'Mouth', 'face.mouth', MOUTH_STYLES);
      this.slider(s2, 'Blush', 'face.blush', RANGES.face.blush);
    } else if (this.activeTab === 'hair') {
      const s = this.section(c, arch === 'slime' ? 'Hair (jelly!)' : 'Hair');
      this.chips(s, 'Style', 'hair.style', HAIR_STYLES);
      this.slider(s, 'Length', 'hair.length', RANGES.hair.length);
    } else if (this.activeTab === 'parts') {
      const s1 = this.section(c, 'Crown');
      this.chips(s1, 'Crown', 'parts.crown', CROWN_IDS);
      this.slider(s1, 'Tilt', 'parts.crownTilt', RANGES.parts.crownTilt);
      this.slider(s1, 'Size', 'parts.crownSize', RANGES.parts.crownSize);
      const s2 = this.section(c, 'Ears & Tail');
      this.chips(s2, 'Ears', 'parts.ears', EAR_IDS);
      this.slider(s2, 'Ear Size', 'parts.earSize', RANGES.parts.earSize);
      this.chips(s2, 'Tail', 'parts.tail', TAIL_IDS);
      this.slider(s2, 'Tail Size', 'parts.tailSize', RANGES.parts.tailSize);
      const s3 = this.section(c, 'Back & Hands');
      this.chips(s3, 'Back', 'parts.back', BACK_IDS);
      this.slider(s3, 'Back Size', 'parts.backSize', RANGES.parts.backSize);
      this.chips(s3, 'Left Hand', 'parts.handL', HAND_ITEM_IDS);
      this.chips(s3, 'Right Hand', 'parts.handR', HAND_ITEM_IDS);
      this.slider(s3, 'Item Size', 'parts.handSize', RANGES.parts.handSize);
      const s4 = this.section(c, 'Extras');
      const extras = el('div', 'chips', s4);
      this.toggle(extras, 'glasses', 'parts.glasses');
    } else if (this.activeTab === 'colors') {
      const species = this.store.dna.species;
      const s0 = this.section(c, `${SPECIES_DEFS[species].label} palettes`);
      const hint = el('div', 'chip-label', s0);
      hint.textContent = 'click a card to apply · drag a dot onto her to paint one spot';
      for (const pal of PALETTES[species]) {
        const card = el('button', 'palette-card', s0);
        const dots = el('span', 'palette-dots', card);
        for (const key of ['primary', 'secondary', 'accent', 'skin'] as const) {
          const dot = el('span', 'dot', dots);
          dot.style.background = pal.colors[key];
          dot.style.cursor = 'grab';
          dot.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.actions.startPaintDrag(pal.colors[key]);
          });
        }
        const lab = el('span', 'palette-label', card);
        lab.textContent = pal.label;
        card.onclick = () => this.actions.applyPalette(species, pal.id);
      }
      const s = this.section(c, 'Custom');
      this.colorRow(s, 'Dress', 'colors.primary');
      this.colorRow(s, 'Trim', 'colors.secondary');
      this.colorRow(s, 'Accent', 'colors.accent');
      this.colorRow(s, arch === 'fox' ? 'Fur' : arch === 'slime' ? 'Jelly' : arch === 'skeleton' ? 'Bone' : 'Skin', 'colors.skin');
      this.colorRow(s, arch === 'fox' ? 'Fur Alt' : 'Hair', 'colors.hair');
      this.colorRow(s, 'Eyes', 'colors.eyes');
      this.colorRow(s, 'Metal', 'colors.metal');
      this.colorRow(s, 'Glow', 'colors.glow');
    } else {
      const s = this.section(c, 'Motion');
      this.slider(s, 'Energy', 'motion.energy', RANGES.motion.energy);
      this.slider(s, 'Bounce', 'motion.bounce', RANGES.motion.bounce);
      this.chips(s, 'Idle Style', 'motion.idleStyle', IDLE_STYLES);
    }
    this.sync(this.store.dna);
  }

  /** Cheap value sync (sliders, chips, name, code, dock, undo/redo). */
  sync(dna: PrincessDNA): void {
    for (const u of this.updaters) u(dna);
    if (document.activeElement !== this.nameField) this.nameField.value = dna.name;
    this.dock.querySelectorAll<HTMLElement>('.arch-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.species === dna.species);
    });
    this.dock.querySelectorAll<HTMLElement>('.class-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.pclass === dna.pclass);
    });
    // Subtype chips (kitsune tails etc.) render only when the species has them
    const subtypes = SPECIES_DEFS[dna.species].subtypes;
    this.subtypeWrap.innerHTML = '';
    if (subtypes) {
      for (const sub of subtypes) {
        const chip = el('button', 'chip class-chip', this.subtypeWrap);
        chip.textContent = sub.label;
        chip.classList.toggle('active', dna.subtype === sub.id);
        chip.onclick = () => this.actions.setSubtype(sub.id);
      }
    }
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
  }

  setShareCode(code: string): void {
    this.codeField.value = code;
  }

  setGallery(entries: GalleryEntry[]): void {
    this.galleryGrid.innerHTML = '';
    for (const entry of entries) {
      const card = el('div', 'gallery-card', this.galleryGrid);
      const img = el('img', '', card);
      img.src = entry.thumb;
      img.alt = entry.name;
      img.title = entry.name;
      img.onclick = () => this.actions.loadGalleryEntry(entry.id);
      const name = el('div', 'gallery-name', card);
      name.textContent = entry.name;
      const del = el('button', 'gallery-del', card);
      del.textContent = '×';
      del.onclick = (e) => {
        e.stopPropagation();
        if (del.classList.contains('confirm')) {
          this.actions.deleteGalleryEntry(entry.id);
        } else {
          del.classList.add('confirm');
          del.textContent = '✓?';
          setTimeout(() => {
            del.classList.remove('confirm');
            del.textContent = '×';
          }, 1600);
        }
      };
    }
    if (entries.length === 0) {
      const empty = el('div', 'gallery-empty', this.galleryGrid);
      empty.textContent = 'No saved princesses yet — press ⭐ Save';
    }
  }

  onArchetypeChanged(): void {
    this.renderTab();
  }

  // ── Animations panel ───────────────────────────────────────────────────────

  /** Rebuild on species change — clip labels are species-flavored (Slither, Melt…). */
  refreshAnimPanel(): void {
    this.buildAnimPanel();
  }

  private buildAnimPanel(): void {
    const states = document.getElementById('anim-states') as HTMLElement;
    const actionsWrap = document.getElementById('anim-actions') as HTMLElement;
    const tweaks = document.getElementById('anim-tweaks') as HTMLElement;
    states.innerHTML = '';
    actionsWrap.innerHTML = '';
    tweaks.innerHTML = '';
    const clips = this.actions.listClips();
    const byId = new Map(clips.map((c) => [c.id, c]));

    // Base-state loop chips
    for (const id of STATE_IDS) {
      const meta = byId.get(id);
      if (!meta) continue;
      const chip = el('button', 'chip', states);
      chip.dataset.anim = id;
      chip.textContent = meta.label;
      chip.onclick = () => {
        this.actions.setAnimState(id);
        this.setAnimActive(id);
      };
    }
    this.setAnimActive(this.actions.getAnimState());

    // One-shot actions, grouped
    const GROUPS: ReadonlyArray<{ id: string; label: string }> = [
      { id: 'combat', label: 'Combat' },
      { id: 'locomotion', label: 'Jumps' },
      { id: 'reaction', label: 'Reactions' },
      { id: 'misc', label: 'Emotes' },
    ];
    for (const g of GROUPS) {
      const members = clips.filter((c) => c.group === g.id && !c.loop);
      if (members.length === 0) continue;
      el('div', 'anim-group-label', actionsWrap).textContent = g.label;
      const grid = el('div', 'anim-grid', actionsWrap);
      for (const c of members) {
        const b = el('button', 'emote-btn', grid);
        b.dataset.anim = c.id;
        b.textContent = c.label;
        b.onclick = () => {
          this.actions.playClip(c.id);
          this.setAnimActive(this.actions.getAnimState());
        };
      }
    }

    // Tuning + export
    el('div', 'tweak-title', tweaks).textContent = 'Tune clip · saved per species';
    const sel = el('select', 'anim-select', tweaks);
    for (const c of clips) {
      const o = el('option', '', sel);
      o.value = c.id;
      o.textContent = c.label;
    }
    const speedRow = el('div', 'row', tweaks);
    el('label', '', speedRow).textContent = 'Speed';
    const speed = el('input', 'slider', speedRow);
    speed.type = 'range'; speed.min = '0.5'; speed.max = '1.8'; speed.step = '0.01';
    const ampRow = el('div', 'row', tweaks);
    el('label', '', ampRow).textContent = 'Punch';
    const amp = el('input', 'slider', ampRow);
    amp.type = 'range'; amp.min = '0.5'; amp.max = '1.6'; amp.step = '0.01';

    const syncTweak = (): void => {
      const t = this.actions.getTweak(sel.value as AnimId);
      speed.value = String(t.speed);
      amp.value = String(t.amp);
    };
    const preview = (): void => {
      this.actions.playClip(sel.value as AnimId);
      this.setAnimActive(this.actions.getAnimState());
    };
    sel.onchange = () => { syncTweak(); preview(); };
    speed.oninput = () => {
      this.actions.setTweakValue(sel.value as AnimId, { speed: parseFloat(speed.value) });
      preview();
    };
    amp.oninput = () => {
      this.actions.setTweakValue(sel.value as AnimId, { amp: parseFloat(amp.value) });
      preview();
    };

    const btnRow = el('div', 'btn-row', tweaks);
    const reset = el('button', 'big-btn', btnRow);
    reset.textContent = '↺ Reset';
    reset.onclick = () => { this.actions.resetTweak(sel.value as AnimId); syncTweak(); preview(); };
    const exp = el('button', 'big-btn gold', btnRow);
    exp.textContent = '💾 Anim JSON';
    exp.title = 'Export every species\' resolved clip set for the game';
    exp.onclick = () => this.actions.exportAnims();
    syncTweak();
  }

  setAnimActive(id: string): void {
    document.querySelectorAll<HTMLButtonElement>('#anim-states .chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.anim === id);
    });
  }
}
