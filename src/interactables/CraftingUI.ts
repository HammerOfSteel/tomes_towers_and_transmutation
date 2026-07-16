/**
 * CraftingUI — shared HTML panel for all 4 crafting station types.
 *
 * Phase 7f: Crafting Systems
 *
 * Usage:
 *   const ui = new CraftingUI(inventory);
 *   ui.open('alchemy');          // shows alchemy recipes
 *   ui.onCraft = (recipe) => {}; // handle result
 *   ui.close();
 *
 * The panel is built once; `open()` switches between station types.
 */

import type { Inventory } from '@/core/Inventory';
import type { ConsumableInventory } from '@/core/ConsumableInventory';
import { injectHudTheme } from '@/ui/hudTheme';
import type { IngredientType } from './CraftingRecipes';
import {
  type CraftingRecipe,
  type StationType,
  RECIPES_BY_STATION,
} from './CraftingRecipes';

// ── Styles ─────────────────────────────────────────────────────────────────

const CSS = `
#crafting-panel {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 460px;
  background: rgba(8, 6, 16, 0.97);
  border: 1px solid #44385a;
  border-radius: 8px;
  padding: 20px 24px 24px;
  z-index: 600;
  font-family: 'Cinzel', serif;
  color: #ccc;
  display: none;
  user-select: none;
}
#crafting-panel.cp--open { display: block; }

.cp-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; border-bottom: 1px solid #2a2040; padding-bottom: 10px;
}
.cp-title { font-size: 15px; letter-spacing: 2px; color: #dda0ff; }
.cp-close {
  background: none; border: none; color: #776688;
  font-size: 18px; cursor: pointer; padding: 2px 6px;
  line-height: 1;
}
.cp-close:hover { color: #ccc; }

/* Recipe list */
.cp-list {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 200px; overflow-y: auto;
  margin-bottom: 16px;
}
.cp-recipe-btn {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid #2a2040;
  border-radius: 5px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  color: #bbb;
  font-family: monospace;
  font-size: 12px;
  transition: background 0.15s, border-color 0.15s;
}
.cp-recipe-btn:hover   { background: rgba(80,50,120,0.25); border-color: #55407a; }
.cp-recipe-btn.cp--sel { background: rgba(80,50,120,0.45); border-color: #8855cc; }
.cp-recipe-icon  { font-size: 18px; }
.cp-recipe-name  { flex: 1; font-weight: bold; color: #ddccff; }
.cp-recipe-cost  { font-size: 11px; color: #887799; }

/* Detail area (shown when a recipe is selected) */
.cp-detail { display: none; }
.cp-detail.cp--visible { display: block; }

.cp-desc {
  font-family: monospace; font-size: 11px; color: #8899aa;
  margin-bottom: 12px; line-height: 1.5;
}

.cp-slots {
  display: flex; gap: 8px; margin-bottom: 14px;
}
.cp-slot {
  flex: 1;
  border: 1px solid #332244;
  border-radius: 5px;
  padding: 8px 6px;
  text-align: center;
  font-family: monospace;
  font-size: 11px;
  min-height: 52px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px;
  transition: border-color 0.15s, background 0.15s;
}
.cp-slot.cp-slot--ok     { border-color: #338844; background: rgba(30,80,40,0.2); }
.cp-slot.cp-slot--bad    { border-color: #883333; background: rgba(80,20,20,0.2); }
.cp-slot--empty          { opacity: 0.2; }
.cp-slot-label  { color: #997799; font-size: 10px; }
.cp-slot-have   { font-size: 11px; }
.cp-slot-have.ok  { color: #55bb66; }
.cp-slot-have.bad { color: #cc4444; }

.cp-craft-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 4px;
}
.cp-result-preview {
  font-family: monospace; font-size: 11px; color: #aaa;
  flex: 1;
}
.cp-craft-btn {
  background: linear-gradient(135deg, #4a2870, #22144a);
  border: 1px solid #7744aa;
  border-radius: 5px;
  color: #ddbbff;
  font-family: 'Cinzel', serif;
  font-size: 12px;
  letter-spacing: 1px;
  padding: 8px 20px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}
.cp-craft-btn:hover:not(:disabled) { background: linear-gradient(135deg, #5a3880, #2a1a5a); }
.cp-craft-btn:active:not(:disabled) { transform: scale(0.97); }
.cp-craft-btn:disabled {
  background: rgba(40,30,60,0.5);
  border-color: #332244;
  color: #554466;
  cursor: not-allowed;
}

/* Brew animation overlay */
.cp-anim-overlay {
  position: absolute;
  inset: 0; border-radius: 8px;
  background: rgba(8,6,16,0.88);
  display: none; align-items: center; justify-content: center;
  flex-direction: column; gap: 12px;
  z-index: 10;
}
.cp-anim-overlay.cp--active { display: flex; }
.cp-anim-text { font-size: 13px; color: #cc99ff; letter-spacing: 2px; }
.cp-anim-bar-track {
  width: 200px; height: 5px;
  background: rgba(80,50,120,0.3);
  border: 1px solid #44285a;
  border-radius: 2px; overflow: hidden;
}
.cp-anim-bar-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #7733cc, #ccaaff);
  transition: width 0.1s linear;
}
`;

// ── Icon helpers ───────────────────────────────────────────────────────────

const RESOURCE_ICONS: Record<IngredientType, string> = {
  gold:        '🪙',
  ore:         '⛏️',
  timber:      '🪵',
  essence:     '✨',
  recipe_card: '📜',
};

const STATION_TITLES: Record<StationType, string> = {
  alchemy:    '⚗️  Alchemy Station',
  forge:      '⚒️  Forge',
  enchanting: '✦  Enchanting Table',
  blueprint:  '📐  Blueprint Crafting',
};

// ── CraftingUI ─────────────────────────────────────────────────────────────

export class CraftingUI {
  private readonly _panel: HTMLElement;
  private readonly _titleEl: HTMLElement;
  private readonly _listEl: HTMLElement;
  private readonly _detailEl: HTMLElement;
  private readonly _descEl: HTMLElement;
  private readonly _slotsEl: HTMLElement;
  private readonly _craftBtn: HTMLButtonElement;
  private readonly _resultPreview: HTMLElement;
  private readonly _animOverlay: HTMLElement;
  private readonly _animBar: HTMLElement;
  private readonly _animText: HTMLElement;
  /** My Bag section — shows crafted potions */
  private readonly _bagEl: HTMLElement;
  private _consumables: ConsumableInventory | null = null;

  private _station: StationType = 'alchemy';
  private _selected: CraftingRecipe | null = null;
  private _animTimer: ReturnType<typeof setInterval> | null = null;
  private _animElapsed = 0;

  /** Fired after the craft animation completes with the recipe that was crafted. */
  onCraft: ((recipe: CraftingRecipe) => void) | null = null;

  get isOpen(): boolean {
    return this._panel.classList.contains('cp--open');
  }

  constructor(private readonly inventory: Inventory) {
    this._injectStyles();

    this._panel = document.createElement('div');
    this._panel.id = 'crafting-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'cp-header';
    this._titleEl = document.createElement('span');
    this._titleEl.className = 'cp-title';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cp-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());
    header.append(this._titleEl, closeBtn);

    // Recipe list
    this._listEl = document.createElement('div');
    this._listEl.className = 'cp-list';

    // Detail area
    this._detailEl = document.createElement('div');
    this._detailEl.className = 'cp-detail';

    this._descEl = document.createElement('div');
    this._descEl.className = 'cp-desc';

    this._slotsEl = document.createElement('div');
    this._slotsEl.className = 'cp-slots';

    const craftRow = document.createElement('div');
    craftRow.className = 'cp-craft-row';
    this._resultPreview = document.createElement('div');
    this._resultPreview.className = 'cp-result-preview';
    this._craftBtn = document.createElement('button');
    this._craftBtn.className = 'cp-craft-btn';
    this._craftBtn.textContent = 'Craft';
    this._craftBtn.addEventListener('click', () => this._startCraft());
    craftRow.append(this._resultPreview, this._craftBtn);

    this._detailEl.append(this._descEl, this._slotsEl, craftRow);

    // Animation overlay
    this._animOverlay = document.createElement('div');
    this._animOverlay.className = 'cp-anim-overlay';
    this._animText = document.createElement('div');
    this._animText.className = 'cp-anim-text';
    const track = document.createElement('div');
    track.className = 'cp-anim-bar-track';
    this._animBar = document.createElement('div');
    this._animBar.className = 'cp-anim-bar-fill';
    track.appendChild(this._animBar);
    this._animOverlay.append(this._animText, track);

    this._panel.style.position = 'relative';

    // My Bag section
    this._bagEl = document.createElement('div');
    this._bagEl.className = 'cp-bag';
    this._bagEl.style.display = 'none'; // hidden until setBag() is called

    this._panel.append(header, this._listEl, this._detailEl, this._bagEl, this._animOverlay);
    document.body.appendChild(this._panel);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  open(station: StationType): void {
    this._station  = station;
    this._selected = null;
    this._titleEl.textContent = STATION_TITLES[station];
    this._buildList();
    this._detailEl.classList.remove('cp--visible');
    this._updateBag();
    this._panel.classList.add('cp--open');
  }

  close(): void {
    this._panel.classList.remove('cp--open');
    this._stopAnim();
    this._selected = null;
  }

  toggle(station: StationType): void {
    if (this.isOpen && this._station === station) {
      this.close();
    } else {
      this.open(station);
    }
  }

  /** Re-render ingredient slot states (call after inventory changes). */
  refresh(): void {
    if (this._selected) this._showDetail(this._selected);
  }

  /** Link a ConsumableInventory so the panel shows a My Bag section. */
  setBag(consumables: ConsumableInventory): void {
    injectHudTheme();
    this._consumables = consumables;
    consumables.onChange = () => { if (this.isOpen) this._updateBag(); };
    this._bagEl.style.display = '';
    this._updateBag();
  }

  private _updateBag(): void {
    if (!this._consumables) return;
    this._bagEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'hud-section-header';
    header.textContent = '⚗ My Bag';
    this._bagEl.appendChild(header);

    const POTION_DEFS = [
      { id: 'potion_heal_minor', label: 'Minor Heal', icon: '🧪' },
      { id: 'potion_heal_major', label: 'Major Heal', icon: '⚗️' },
      { id: 'potion_swiftness',  label: 'Swiftness',  icon: '💨' },
      { id: 'potion_power',      label: 'Power',      icon: '⚔️' },
      { id: 'potion_mystery',    label: 'Mystery',    icon: '❓' },
    ];

    let anyPotion = false;
    for (const def of POTION_DEFS) {
      const count = this._consumables.getPotionCount(def.id);
      if (count <= 0) continue;
      anyPotion = true;
      const row = document.createElement('div');
      row.className = 'hud-row';
      Object.assign(row.style, { padding: '3px 0' });

      const iconEl = document.createElement('span');
      iconEl.textContent = def.icon;
      iconEl.style.fontSize = '14px';

      const labelEl = document.createElement('span');
      labelEl.textContent = `${def.label} ×${count}`;
      labelEl.style.cssText = `flex:1; font-family:var(--hud-font-body); font-size:12px; color:var(--hud-text);`;

      const useBtn = document.createElement('button');
      useBtn.className = 'hud-btn hud-btn-primary';
      useBtn.textContent = 'Use';
      useBtn.style.cssText = 'font-size:10px; padding:2px 8px;';
      const potId = def.id;
      useBtn.addEventListener('click', () => {
        this._consumables?.usePotion(potId);
        this._updateBag();
      });

      row.append(iconEl, labelEl, useBtn);
      this._bagEl.appendChild(row);
    }

    if (!anyPotion) {
      const empty = document.createElement('div');
      empty.style.cssText = `font-family:var(--hud-font-body); font-size:11px; color:var(--hud-muted); font-style:italic; padding:4px 0;`;
      empty.textContent = 'No potions in bag.';
      this._bagEl.appendChild(empty);
    }
  }

  dispose(): void {
    this._stopAnim();
    this._panel.remove();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildList(): void {
    this._listEl.innerHTML = '';
    const recipes = RECIPES_BY_STATION[this._station];
    for (const recipe of recipes) {
      const btn = document.createElement('button');
      btn.className = 'cp-recipe-btn';
      const costParts = recipe.ingredients.map(i => `${RESOURCE_ICONS[i.type]} ${i.amount}`).join(' + ');
      btn.innerHTML = `
        <span class="cp-recipe-icon">${recipe.icon}</span>
        <span class="cp-recipe-name">${recipe.name}</span>
        <span class="cp-recipe-cost">${costParts}</span>
      `;
      btn.addEventListener('click', () => this._selectRecipe(recipe, btn));
      this._listEl.appendChild(btn);
    }
  }

  private _selectRecipe(recipe: CraftingRecipe, btn: HTMLElement): void {
    // Toggle — clicking the same recipe again deselects
    if (this._selected?.id === recipe.id) {
      this._selected = null;
      btn.classList.remove('cp--sel');
      this._detailEl.classList.remove('cp--visible');
      return;
    }
    this._selected = recipe;
    // Clear selection highlight from all buttons
    this._listEl.querySelectorAll('.cp-recipe-btn').forEach(b => b.classList.remove('cp--sel'));
    btn.classList.add('cp--sel');
    this._showDetail(recipe);
  }

  private _showDetail(recipe: CraftingRecipe): void {
    this._descEl.textContent = recipe.result.description;
    this._resultPreview.textContent = `→ ${recipe.result.name}`;

    // Build ingredient slots (max 3)
    this._slotsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const ing = recipe.ingredients[i];
      const slot = document.createElement('div');
      if (!ing) {
        slot.className = 'cp-slot cp-slot--empty';
        slot.textContent = '—';
      } else {
        const have = ing.type === 'recipe_card' ? 0 : this.inventory.get(ing.type as import('@/core/Inventory').ResourceType);
        const ok   = ing.type === 'recipe_card' ? false : have >= ing.amount;
        slot.className = `cp-slot ${ok ? 'cp-slot--ok' : 'cp-slot--bad'}`;
        slot.innerHTML = `
          <span style="font-size:16px">${RESOURCE_ICONS[ing.type]}</span>
          <span class="cp-slot-label">${ing.label}</span>
          <span class="cp-slot-have ${ok ? 'ok' : 'bad'}">Have: ${ing.type === 'recipe_card' ? '?' : have}</span>
        `;
      }
      this._slotsEl.appendChild(slot);
    }

    // Craft button — enabled if all non-recipe_card ingredients are sufficient
    const canCraft = recipe.ingredients.every(ing => {
      if (ing.type === 'recipe_card') return true; // gated by loot; assume present for now
      return this.inventory.get(ing.type as import('@/core/Inventory').ResourceType) >= ing.amount;
    });
    this._craftBtn.disabled = !canCraft;

    this._detailEl.classList.add('cp--visible');
  }

  private _startCraft(): void {
    const recipe = this._selected;
    if (!recipe) return;

    // Deduct resources (skip recipe_card for now)
    const costs: Partial<import('@/core/Inventory').InventoryData> = {};
    for (const ing of recipe.ingredients) {
      if (ing.type !== 'recipe_card') {
        const key = ing.type as import('@/core/Inventory').ResourceType;
        costs[key] = (costs[key] ?? 0) + ing.amount;
      }
    }
    const ok = this.inventory.spendMulti(costs);
    if (!ok) return; // shouldn't happen (button was enabled), but guard anyway

    // Start animation
    this._animElapsed = 0;
    this._animText.textContent = `Crafting ${recipe.name}…`;
    this._animBar.style.width = '0%';
    this._animOverlay.classList.add('cp--active');
    this._craftBtn.disabled = true;

    const TICK_MS = 50;
    this._animTimer = setInterval(() => {
      this._animElapsed += TICK_MS / 1000;
      const pct = Math.min(1, this._animElapsed / recipe.animDuration);
      this._animBar.style.width = `${pct * 100}%`;
      if (pct >= 1) {
        this._stopAnim();
        this._animOverlay.classList.remove('cp--active');
        this.onCraft?.(recipe);
        this.refresh();
      }
    }, TICK_MS);
  }

  private _stopAnim(): void {
    if (this._animTimer !== null) {
      clearInterval(this._animTimer);
      this._animTimer = null;
    }
  }

  private _injectStyles(): void {
    if (document.getElementById('crafting-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'crafting-ui-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
