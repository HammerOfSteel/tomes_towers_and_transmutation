// ── Editor UI: tabs, sliders, chips, swatches, dock, gallery ────────────────
//
//  Static chrome lives in princess-creator.html; this module renders the
//  dynamic controls and keeps them in sync with the store. Controls are
//  rebuilt on tab/archetype changes and value-synced otherwise (so an open
//  slider never gets yanked out from under the pointer).

import type { Archetype, PrincessDNA, Range } from './types';
import {
  ARCHETYPES, DRESS_STYLES, EYE_STYLES, MOUTH_STYLES, HAIR_STYLES,
  CROWN_IDS, EAR_IDS, TAIL_IDS, BACK_IDS, HAND_ITEM_IDS, IDLE_STYLES, RANGES,
} from './types';
import { defaultDna } from './dna';
import { PALETTES } from './palettes';
import type { DnaStore } from './store';
import type { GalleryEntry } from './gallery';
import type { EmoteId } from './animate';
import { EMOTES } from './animate';

export interface UiActions {
  randomize(): void;
  mutate(): void;
  rollName(): void;
  setArchetype(a: Archetype): void;
  copyCode(): void;
  importCode(code: string): boolean;
  exportPng(): void;
  exportGlb(): void;
  exportJson(): void;
  saveToGallery(): void;
  loadGalleryEntry(id: string): void;
  deleteGalleryEntry(id: string): void;
  playEmote(id: EmoteId): void;
  toggleWalk(): boolean;
  undo(): void;
  redo(): void;
  applyPalette(archetype: Archetype, paletteId: string): void;
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

const ARCH_META: Record<Archetype, { icon: string; label: string }> = {
  human: { icon: '👑', label: 'Human' },
  fox: { icon: '🦊', label: 'Fox' },
  slime: { icon: '💧', label: 'Slime' },
  skeleton: { icon: '💀', label: 'Skeleton' },
};

const EMOTE_META: Record<EmoteId, string> = {
  wave: '👋 Wave', twirl: '🌀 Twirl', dance: '💃 Dance', cast: '✨ Cast',
};

/** Signature sliders pinned to the top of the Body tab, per archetype. */
const SIGNATURE: Record<Archetype, Array<{ label: string; path: string; range: Range }>> = {
  human: [],
  fox: [
    { label: 'Snout', path: 'species.snoutLength', range: RANGES.species.snoutLength },
    { label: 'Fluffiness', path: 'species.fluff', range: RANGES.species.fluff },
  ],
  slime: [
    { label: 'Wobble', path: 'species.wobble', range: RANGES.species.wobble },
    { label: 'Translucency', path: 'species.translucency', range: RANGES.species.translucency },
    { label: 'Core Glow', path: 'species.coreGlow', range: RANGES.species.coreGlow },
  ],
  skeleton: [
    { label: 'Bone Gauge', path: 'species.boneThickness', range: RANGES.species.boneThickness },
    { label: 'Soul Glow', path: 'species.eyeGlowIntensity', range: RANGES.species.eyeGlowIntensity },
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
  private walkBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;

  constructor(private store: DnaStore, private actions: UiActions) {
    this.tabContent = document.getElementById('tab-content') as HTMLElement;
    this.tabsBar = document.getElementById('tabs') as HTMLElement;
    this.dock = document.getElementById('dock') as HTMLElement;
    this.galleryGrid = document.getElementById('gallery-grid') as HTMLElement;
    this.codeField = document.getElementById('share-code') as HTMLInputElement;
    this.nameField = document.getElementById('name-input') as HTMLInputElement;
    this.walkBtn = document.getElementById('btn-walk') as HTMLButtonElement;
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

    for (const a of ARCHETYPES) {
      const meta = ARCH_META[a];
      const card = el('button', 'arch-card', this.dock);
      card.dataset.arch = a;
      card.innerHTML = `<span class="arch-icon">${meta.icon}</span><span>${meta.label}</span>`;
      card.onclick = () => this.actions.setArchetype(a);
    }

    const emoteBar = document.getElementById('emote-buttons') as HTMLElement;
    for (const id of EMOTES) {
      const b = el('button', 'emote-btn', emoteBar);
      b.textContent = EMOTE_META[id];
      b.onclick = () => this.actions.playEmote(id);
    }
    this.walkBtn.onclick = () => {
      const on = this.actions.toggleWalk();
      this.walkBtn.classList.toggle('active', on);
    };

    (document.getElementById('btn-dice') as HTMLButtonElement).onclick = () => this.actions.rollName();
    (document.getElementById('btn-random') as HTMLButtonElement).onclick = () => this.actions.randomize();
    (document.getElementById('btn-mutate') as HTMLButtonElement).onclick = () => this.actions.mutate();
    (document.getElementById('btn-copy') as HTMLButtonElement).onclick = () => this.actions.copyCode();
    (document.getElementById('btn-export-png') as HTMLButtonElement).onclick = () => this.actions.exportPng();
    (document.getElementById('btn-export-glb') as HTMLButtonElement).onclick = () => this.actions.exportGlb();
    (document.getElementById('btn-export-json') as HTMLButtonElement).onclick = () => this.actions.exportJson();
    (document.getElementById('btn-save-gallery') as HTMLButtonElement).onclick = () => this.actions.saveToGallery();
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
      const def = get(defaultDna(this.store.dna.archetype), path) as number;
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
        const s = this.section(c, `${ARCH_META[arch].label} signature`);
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
      const s2 = this.section(c, 'Ears & Tail');
      this.chips(s2, 'Ears', 'parts.ears', EAR_IDS);
      this.slider(s2, 'Ear Size', 'parts.earSize', RANGES.parts.earSize);
      this.chips(s2, 'Tail', 'parts.tail', TAIL_IDS);
      this.slider(s2, 'Tail Size', 'parts.tailSize', RANGES.parts.tailSize);
      const s3 = this.section(c, 'Back & Hands');
      this.chips(s3, 'Back', 'parts.back', BACK_IDS);
      this.chips(s3, 'Left Hand', 'parts.handL', HAND_ITEM_IDS);
      this.chips(s3, 'Right Hand', 'parts.handR', HAND_ITEM_IDS);
    } else if (this.activeTab === 'colors') {
      const s0 = this.section(c, 'Palettes');
      for (const pal of PALETTES[arch]) {
        const card = el('button', 'palette-card', s0);
        const dots = el('span', 'palette-dots', card);
        for (const key of ['primary', 'secondary', 'accent', 'skin'] as const) {
          const dot = el('span', 'dot', dots);
          dot.style.background = pal.colors[key];
        }
        const lab = el('span', 'palette-label', card);
        lab.textContent = pal.label;
        card.onclick = () => this.actions.applyPalette(arch, pal.id);
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
    for (const card of this.dock.children) {
      (card as HTMLElement).classList.toggle(
        'active', (card as HTMLElement).dataset.arch === dna.archetype,
      );
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

  setWalkActive(on: boolean): void {
    this.walkBtn.classList.toggle('active', on);
  }
}
