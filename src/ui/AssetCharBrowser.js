/**
 * AssetCharBrowser — scrollable model selection grid for character creation.
 *
 * Shows one card per player-eligible model from the active character packs.
 * Clicking a card selects it (highlighted border) and fires `onSelect`.
 *
 * Phase 3 thumbnails are the pack icon on a coloured background.
 * A live 3D preview is planned for Phase 8.
 */
import { CHAR_MODELS, CHAR_PACKS } from '@/characters/charManifest';
// ── Styles ───────────────────────────────────────────────────────────────────
let _stylesInjected = false;
function _ensureStyles() {
    if (_stylesInjected)
        return;
    _stylesInjected = true;
    const css = `
/* ── AssetCharBrowser ─────────────────────────────────────────────────────── */
.acb-root {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}
.acb-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.acb-filter-chip {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
  background: rgba(255,255,255,0.07);
  color: #c8b89a;
  border: 1px solid rgba(255,255,255,0.12);
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
}
.acb-filter-chip:hover        { background: rgba(255,255,255,0.13); }
.acb-filter-chip--on          { background: rgba(200,184,154,0.2); border-color: #c8b89a; color: #f0e6cf; }
.acb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  padding: 4px 2px;
}
.acb-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px 6px;
  border-radius: 8px;
  background: rgba(255,255,255,0.05);
  border: 2px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  user-select: none;
}
.acb-card:hover   { background: rgba(255,255,255,0.1); transform: translateY(-1px); }
.acb-card--on     { border-color: #e8c97a; background: rgba(232,201,122,0.12); }
.acb-card-icon {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: rgba(0,0,0,0.2);
  flex-shrink: 0;
}
.acb-card-name {
  font-size: 11px;
  color: #e0d0b0;
  text-align: center;
  line-height: 1.2;
  font-weight: 500;
  word-break: break-word;
  max-width: 84px;
}
.acb-card-pack {
  font-size: 10px;
  color: #9a8870;
  text-align: center;
}
.acb-empty {
  color: #9a8870;
  font-style: italic;
  font-size: 13px;
  padding: 16px 0;
  text-align: center;
}
`;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
}
// ── Pack icon lookup ──────────────────────────────────────────────────────────
const _packIconMap = new Map(CHAR_PACKS.map((p) => [p.id, p.icon]));
const _packNameMap = new Map(CHAR_PACKS.map((p) => [p.id, p.name]));
// ── AssetCharBrowser class ────────────────────────────────────────────────────
export class AssetCharBrowser {
    _root;
    _grid;
    _onSelect;
    _models;
    _selected = null;
    _cardMap = new Map();
    _activeFilters = new Set(); // active pack IDs ('all' = no filter)
    constructor(container, activePacks, onSelect) {
        _ensureStyles();
        this._onSelect = onSelect;
        // Filter to player-eligible models from the given active packs
        this._models = CHAR_MODELS.filter((m) => m.roles.includes('player') && activePacks.includes(m.packId));
        this._root = document.createElement('div');
        this._root.className = 'acb-root';
        // ── Pack filter chips ─────────────────────────────────────────────────
        const packsPresent = [...new Set(this._models.map((m) => m.packId))];
        if (packsPresent.length > 1) {
            const filterRow = document.createElement('div');
            filterRow.className = 'acb-filter-row';
            const allChip = document.createElement('div');
            allChip.className = 'acb-filter-chip acb-filter-chip--on';
            allChip.textContent = '✦ All';
            allChip.dataset['packId'] = 'all';
            allChip.onclick = () => {
                this._activeFilters.clear();
                this._updateFilterChips(filterRow, 'all');
                this._renderCards();
            };
            filterRow.appendChild(allChip);
            for (const pid of packsPresent) {
                const chip = document.createElement('div');
                chip.className = 'acb-filter-chip';
                chip.textContent = `${_packIconMap.get(pid) ?? '📦'} ${_packNameMap.get(pid) ?? pid}`;
                chip.dataset['packId'] = pid;
                chip.onclick = () => {
                    this._activeFilters.has(pid)
                        ? this._activeFilters.delete(pid)
                        : this._activeFilters.add(pid);
                    this._updateFilterChips(filterRow, pid);
                    this._renderCards();
                };
                filterRow.appendChild(chip);
            }
            this._root.appendChild(filterRow);
        }
        // ── Card grid ─────────────────────────────────────────────────────────
        this._grid = document.createElement('div');
        this._grid.className = 'acb-grid';
        this._root.appendChild(this._grid);
        this._renderCards();
        container.appendChild(this._root);
    }
    /** Currently selected model, or null if none chosen. */
    get selected() { return this._selected; }
    dispose() { this._root.remove(); }
    // ── Private helpers ───────────────────────────────────────────────────────
    _visibleModels() {
        if (this._activeFilters.size === 0)
            return this._models;
        return this._models.filter((m) => this._activeFilters.has(m.packId));
    }
    _renderCards() {
        this._grid.innerHTML = '';
        this._cardMap.clear();
        const visible = this._visibleModels();
        if (visible.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'acb-empty';
            empty.textContent = 'No models in these packs.';
            this._grid.appendChild(empty);
            return;
        }
        for (const def of visible) {
            const card = document.createElement('div');
            card.className = 'acb-card' + (this._selected?.id === def.id ? ' acb-card--on' : '');
            const thumb = document.createElement('div');
            thumb.className = 'acb-card-icon';
            thumb.textContent = _packIconMap.get(def.packId) ?? '📦';
            const name = document.createElement('div');
            name.className = 'acb-card-name';
            name.textContent = def.name;
            const pack = document.createElement('div');
            pack.className = 'acb-card-pack';
            pack.textContent = _packNameMap.get(def.packId) ?? def.packId;
            card.append(thumb, name, pack);
            card.onclick = () => this._selectCard(def, card);
            this._cardMap.set(def.id, card);
            this._grid.appendChild(card);
        }
    }
    _selectCard(def, card) {
        // Deselect previous
        if (this._selected) {
            this._cardMap.get(this._selected.id)?.classList.remove('acb-card--on');
        }
        this._selected = def;
        card.classList.add('acb-card--on');
        this._onSelect(def);
    }
    _updateFilterChips(filterRow, changedId) {
        filterRow.querySelectorAll('.acb-filter-chip').forEach((chip) => {
            const pid = chip.dataset['packId'] ?? '';
            if (pid === 'all') {
                chip.classList.toggle('acb-filter-chip--on', this._activeFilters.size === 0);
            }
            else {
                chip.classList.toggle('acb-filter-chip--on', this._activeFilters.has(pid));
            }
        });
        // Ignore changedId — just used for future tracing
        void changedId;
    }
}
