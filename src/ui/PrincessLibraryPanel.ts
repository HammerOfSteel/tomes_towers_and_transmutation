/**
 * PrincessLibraryPanel.ts — PC2: Gallery picker panel shown during new-game
 * flow when the "custom princess" toggle is on.
 *
 * Shows up to 24 saved princesses as cards (thumbnail + name + species badge).
 * Buttons: ▶ Play, ✎ Edit (opens Atelier), 🗑 Delete.
 * "✦ Create New" button opens princess-creator.html in a new tab.
 *
 * Usage:
 *   const panel = new PrincessLibraryPanel(container, {
 *     onSelect: (dna) => startGame(dna),
 *   });
 *   panel.show();
 */

import type { PrincessDNA } from '@/princess-creator/types';
import { loadGallery, removeFromGallery, type GalleryEntry } from '@/princess-creator/gallery';
import { shareCodeToDna } from '@/princess-creator/dna';
import { seedGalleryIfEmpty, PRINCESS_SPECIES_MAP } from '@/princess-creator/defaults/PrincessDefaults';

export interface PrincessLibraryCallbacks {
  onSelect: (dna: PrincessDNA, gameSpecies: 'human' | 'undead' | 'vulperia' | 'slime') => void;
  onClose?: () => void;
}

const SPECIES_BADGE_COLORS: Record<string, string> = {
  human: '#3b82f6', elf: '#3b82f6', high_elf: '#8b5cf6', celestial: '#8b5cf6',
  foxling: '#f59e0b', orc: '#f59e0b', troll: '#f59e0b', lamia: '#ec4899',
  undead: '#14b8a6', skeleton: '#14b8a6', specter: '#6366f1',
  slime: '#22c55e',
  pixie: '#a78bfa', fae: '#a78bfa', draconic: '#ef4444',
  gnome: '#84cc16', goblin: '#84cc16',
  ignis: '#f97316', naiad: '#06b6d4', moonborn: '#818cf8', verdant: '#4ade80',
};
// Fallback for any unmapped species
function getBadgeColor(species: string): string {
  return SPECIES_BADGE_COLORS[species] ?? '#6b7280';
}

const CSS = `
#plp-root {
  display: none;
  position: fixed; inset: 0;
  background: rgba(4,2,14,0.92); backdrop-filter: blur(6px);
  z-index: 800;
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: rgba(220,200,255,0.9);
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
#plp-root.plp-visible { display: flex; }
#plp-box {
  width: min(860px, 94vw);
  max-height: 82vh;
  background: rgba(8,4,22,0.98);
  border: 1px solid rgba(180,140,255,0.2);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#plp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px 0;
  flex-shrink: 0;
}
#plp-title { font-size: 12px; letter-spacing: 2px; color: rgba(180,140,255,0.6); }
#plp-close {
  background: transparent; border: none;
  color: rgba(255,255,255,0.3); cursor: pointer; font-size: 18px;
}
#plp-close:hover { color: rgba(255,255,255,0.7); }
#plp-actions {
  display: flex; gap: 8px;
  padding: 10px 18px;
  flex-shrink: 0;
}
#plp-new-btn {
  padding: 7px 16px;
  background: rgba(120,80,220,0.3);
  border: 1px solid rgba(180,140,255,0.4);
  border-radius: 6px;
  color: rgba(200,170,255,0.9);
  cursor: pointer; font-size: 11px; letter-spacing: 0.5px;
}
#plp-new-btn:hover { background: rgba(120,80,220,0.5); }
#plp-grid {
  overflow-y: auto;
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 8px 18px 18px;
}
.plp-card {
  background: rgba(14,8,30,0.8);
  border: 1px solid rgba(180,140,255,0.12);
  border-radius: 8px;
  overflow: hidden;
  display: flex; flex-direction: column;
  transition: border-color 0.15s;
  cursor: default;
}
.plp-card:hover { border-color: rgba(180,140,255,0.35); }
.plp-thumb {
  width: 100%; aspect-ratio: 1;
  background: rgba(20,10,40,0.8);
  display: flex; align-items: center; justify-content: center;
  font-size: 40px;
  overflow: hidden;
}
.plp-thumb img { width: 100%; height: 100%; object-fit: cover; }
.plp-info { padding: 7px 8px 4px; }
.plp-name { font-size: 11px; font-weight: 600; color: rgba(220,200,255,0.9); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plp-species {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 8px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
  margin-bottom: 6px;
}
.plp-btns { display: flex; gap: 4px; padding: 0 8px 8px; }
.plp-btn {
  flex: 1; padding: 4px 0;
  border-radius: 4px; border: 1px solid rgba(180,140,255,0.15);
  background: transparent; cursor: pointer;
  font-size: 9px; color: rgba(180,140,255,0.6);
}
.plp-btn:hover { background: rgba(120,80,220,0.2); color: rgba(200,170,255,0.9); }
.plp-btn-play { border-color: rgba(80,220,120,0.3); color: rgba(100,220,120,0.8); }
.plp-btn-play:hover { background: rgba(80,220,120,0.15); }
.plp-btn-del { border-color: rgba(220,80,80,0.25); color: rgba(200,100,100,0.6); }
.plp-btn-del:hover { background: rgba(220,80,80,0.15); color: rgba(240,100,100,0.9); }
#plp-empty {
  grid-column: 1/-1;
  text-align: center;
  padding: 40px;
  color: rgba(180,140,255,0.3);
  font-size: 12px;
}
`;

export class PrincessLibraryPanel {
  private _root: HTMLElement;
  private _grid: HTMLElement;

  constructor(
    private readonly _container: HTMLElement,
    private readonly _cb: PrincessLibraryCallbacks,
  ) {
    if (!document.getElementById('plp-style')) {
      const style = document.createElement('style');
      style.id = 'plp-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this._root = document.createElement('div');
    this._root.id = 'plp-root';
    this._root.innerHTML = `
      <div id="plp-box">
        <div id="plp-header">
          <span id="plp-title">YOUR PRINCESSES</span>
          <button id="plp-close">✕</button>
        </div>
        <div id="plp-actions">
          <button id="plp-new-btn">✦ Create New Princess</button>
        </div>
        <div id="plp-grid"></div>
      </div>
    `;

    this._root.querySelector('#plp-close')?.addEventListener('click', () => this.hide());
    this._root.addEventListener('click', (e) => { if (e.target === this._root) this.hide(); });
    this._root.querySelector('#plp-new-btn')?.addEventListener('click', () => {
      window.open('princess-creator.html', '_blank');
    });

    this._grid = this._root.querySelector('#plp-grid')!;
    this._container.appendChild(this._root);
  }

  show(): void {
    seedGalleryIfEmpty();
    this._render();
    this._root.classList.add('plp-visible');
  }

  hide(): void {
    this._root.classList.remove('plp-visible');
    this._cb.onClose?.();
  }

  refresh(): void {
    if (this._root.classList.contains('plp-visible')) this._render();
  }

  private _render(): void {
    const entries = loadGallery();
    this._grid.innerHTML = '';

    if (entries.length === 0) {
      this._grid.innerHTML = `<div id="plp-empty">No princesses yet.<br><br>Click <strong>✦ Create New Princess</strong> to design your character in the Atelier.</div>`;
      return;
    }

    for (const entry of entries) {
      const card = this._makeCard(entry);
      this._grid.appendChild(card);
    }
  }

  private _makeCard(entry: GalleryEntry): HTMLElement {
    const dna = shareCodeToDna(entry.code);
    const species = dna?.species ?? 'human';
    const badgeColor = getBadgeColor(species);
    const gameSpecies = PRINCESS_SPECIES_MAP[species] ?? 'human';
    const EMOJI_MAP: Record<string, string> = {
      human: '👸', elf: '🧝', high_elf: '🧝', foxling: '🦊', slime: '🟢',
      skeleton: '💀', undead: '💀', specter: '👻', draconic: '🐉',
      pixie: '✨', fae: '🧚', celestial: '⭐', gnome: '🍄', goblin: '👺',
      ignis: '🔥', naiad: '💧', moonborn: '🌙', verdant: '🌿',
      lamia: '🐍', orc: '⚔️', troll: '🪨',
    };
    const emoji = EMOJI_MAP[species] ?? '👸';

    const card = document.createElement('div');
    card.className = 'plp-card';
    card.innerHTML = `
      <div class="plp-thumb">
        ${entry.thumb ? `<img src="${entry.thumb}" alt="${entry.name}" />` : `<span>${emoji}</span>`}
      </div>
      <div class="plp-info">
        <div class="plp-name">${entry.name}</div>
        <span class="plp-species" style="background:${badgeColor}">${species.replace('_', ' ')}</span>
      </div>
      <div class="plp-btns">
        <button class="plp-btn plp-btn-play" title="Play as this princess">▶ Play</button>
        <button class="plp-btn plp-btn-edit" title="Edit in Atelier">✎ Edit</button>
        <button class="plp-btn plp-btn-del" title="Delete">🗑</button>
      </div>
    `;

    card.querySelector('.plp-btn-play')?.addEventListener('click', () => {
      if (!dna) return;
      this.hide();
      this._cb.onSelect(dna, gameSpecies);
    });

    card.querySelector('.plp-btn-edit')?.addEventListener('click', () => {
      window.open(`princess-creator.html#code=${encodeURIComponent(entry.code)}`, '_blank');
    });

    card.querySelector('.plp-btn-del')?.addEventListener('click', () => {
      removeFromGallery(entry.id);
      this._render();
    });

    return card;
  }
}
