/**
 * MerchantUI — buy/sell panel shown when [E]ing a merchant NPC.
 *
 * Buy:  spend gold from Inventory to receive resources/potions.
 * Sell: convert resources back to gold at 50% rate.
 *
 * Usage:
 *   MerchantUI.open(merchantName, inventory);
 *   MerchantUI.close();
 *   MerchantUI.isOpen
 */

import type { Inventory } from '@/core/Inventory';
import type { ResourceType } from '@/core/Inventory';

interface ShopItem {
  label: string;
  resource: ResourceType;
  buyPrice: number;   // gold per unit
  sellPrice: number;  // gold received per unit (50% of buy)
  icon: string;
}

const SHOP_CATALOGUE: ShopItem[] = [
  { label: 'Ore',     resource: 'ore',     buyPrice: 12, sellPrice: 6,  icon: '⛏' },
  { label: 'Timber',  resource: 'timber',  buyPrice: 8,  sellPrice: 4,  icon: '🪵' },
  { label: 'Essence', resource: 'essence', buyPrice: 20, sellPrice: 10, icon: '✨' },
];

let _panel: HTMLDivElement | null = null;
let _closeKey: ((e: KeyboardEvent) => void) | null = null;

export const MerchantUI = {
  get isOpen(): boolean { return _panel !== null; },

  open(merchantName: string, inventory: Inventory): void {
    this.close();

    const panel = document.createElement('div');
    panel.id = 'merchant-ui';
    Object.assign(panel.style, {
      position:    'fixed',
      top:         '50%',
      left:        '50%',
      transform:   'translate(-50%, -50%)',
      width:       '400px',
      maxWidth:    '92vw',
      background:  'linear-gradient(160deg, #1a1008 0%, #0e0a04 100%)',
      border:      '1px solid #6a4a1a',
      borderRadius:'6px',
      boxShadow:   '0 8px 40px rgba(0,0,0,0.9)',
      color:       '#e8d4a0',
      fontFamily:  'Georgia, serif',
      fontSize:    '14px',
      zIndex:      '210',
      userSelect:  'none',
      overflow:    'hidden',
    } as Partial<CSSStyleDeclaration>);

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding:      '12px 16px 10px',
      borderBottom: '1px solid #4a3010',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      background:   'rgba(0,0,0,0.3)',
    } as Partial<CSSStyleDeclaration>);
    const title = document.createElement('span');
    title.textContent = `🛒 ${merchantName}`;
    Object.assign(title.style, {
      fontFamily:    'Cinzel, serif',
      fontSize:      '13px',
      letterSpacing: '2px',
      color:         '#c8963c',
    } as Partial<CSSStyleDeclaration>);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      background: 'none',
      border:     'none',
      color:      '#7a5a30',
      cursor:     'pointer',
      fontSize:   '16px',
    } as Partial<CSSStyleDeclaration>);
    closeBtn.onclick = () => MerchantUI.close();
    header.append(title, closeBtn);
    panel.appendChild(header);

    // Gold display
    const goldBar = document.createElement('div');
    Object.assign(goldBar.style, {
      padding:   '8px 16px',
      fontSize:  '13px',
      color:     '#d4aa44',
      borderBottom: '1px solid #2a1a04',
    } as Partial<CSSStyleDeclaration>);
    const refreshGold = () => {
      goldBar.textContent = `💰 Gold: ${inventory.get('gold')}`;
    };
    refreshGold();
    panel.appendChild(goldBar);

    // Shop rows
    const body = document.createElement('div');
    body.style.cssText = 'padding:12px 16px;display:flex;flex-direction:column;gap:10px;';

    for (const item of SHOP_CATALOGUE) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;';

      const nameLbl = document.createElement('span');
      nameLbl.textContent = `${item.icon} ${item.label}`;
      nameLbl.style.cssText = 'flex:1;font-size:13px;';

      const stockLbl = document.createElement('span');
      stockLbl.style.cssText = 'font-size:11px;color:#7a6a40;min-width:60px;text-align:right;';
      const refreshStock = () => {
        stockLbl.textContent = `Own: ${inventory.get(item.resource)}`;
      };
      refreshStock();

      // Buy button
      const buyBtn = document.createElement('button');
      buyBtn.textContent = `Buy  ${item.buyPrice}g`;
      Object.assign(buyBtn.style, {
        background:   'rgba(60,40,10,0.7)',
        border:       '1px solid #6a4a1a',
        color:        '#c8a050',
        borderRadius: '3px',
        padding:      '4px 10px',
        cursor:       'pointer',
        fontFamily:   'monospace',
        fontSize:     '11px',
        whiteSpace:   'nowrap',
      } as Partial<CSSStyleDeclaration>);
      buyBtn.onclick = () => {
        if (inventory.get('gold') < item.buyPrice) {
          buyBtn.textContent = 'No gold!';
          setTimeout(() => { buyBtn.textContent = `Buy  ${item.buyPrice}g`; }, 800);
          return;
        }
        inventory.spend('gold', item.buyPrice);
        inventory.add(item.resource, 1);
        refreshGold();
        refreshStock();
      };

      // Sell button
      const sellBtn = document.createElement('button');
      sellBtn.textContent = `Sell  ${item.sellPrice}g`;
      Object.assign(sellBtn.style, {
        background:   'rgba(10,30,10,0.7)',
        border:       '1px solid #2a5a2a',
        color:        '#60a060',
        borderRadius: '3px',
        padding:      '4px 10px',
        cursor:       'pointer',
        fontFamily:   'monospace',
        fontSize:     '11px',
        whiteSpace:   'nowrap',
      } as Partial<CSSStyleDeclaration>);
      sellBtn.onclick = () => {
        if (inventory.get(item.resource) < 1) {
          sellBtn.textContent = 'None!';
          setTimeout(() => { sellBtn.textContent = `Sell  ${item.sellPrice}g`; }, 800);
          return;
        }
        inventory.spend(item.resource, 1);
        inventory.add('gold', item.sellPrice);
        refreshGold();
        refreshStock();
      };

      row.append(nameLbl, stockLbl, buyBtn, sellBtn);
      body.appendChild(row);
    }

    panel.appendChild(body);

    // Footer hint
    const foot = document.createElement('div');
    foot.textContent = '[E] or Esc to close';
    Object.assign(foot.style, {
      padding:      '8px 16px',
      fontSize:     '11px',
      color:        '#4a3a18',
      borderTop:    '1px solid #2a1a04',
      textAlign:    'center',
      fontFamily:   'monospace',
    } as Partial<CSSStyleDeclaration>);
    panel.appendChild(foot);

    document.body.appendChild(panel);
    _panel = panel;

    _closeKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' || e.code === 'Escape') MerchantUI.close();
    };
    window.addEventListener('keydown', _closeKey);
  },

  close(): void {
    _panel?.remove();
    _panel = null;
    if (_closeKey) {
      window.removeEventListener('keydown', _closeKey);
      _closeKey = null;
    }
  },
};