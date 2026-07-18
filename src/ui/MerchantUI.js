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
import { injectHudTheme } from './hudTheme';
const SHOP_CATALOGUE = [
    { label: 'Ore', resource: 'ore', buyPrice: 12, sellPrice: 6, icon: '⛏' },
    { label: 'Timber', resource: 'timber', buyPrice: 8, sellPrice: 4, icon: '🪵' },
    { label: 'Essence', resource: 'essence', buyPrice: 20, sellPrice: 10, icon: '✨' },
];
let _panel = null;
let _closeKey = null;
export const MerchantUI = {
    /** Set this to receive potion purchases. Wire to consumables.addPotion(). */
    _onBuyPotion: null,
    get isOpen() { return _panel !== null; },
    open(merchantName, inventory) {
        this.close();
        injectHudTheme();
        const panel = document.createElement('div');
        panel.id = 'merchant-ui';
        panel.className = 'hud-panel hud-panel--warm';
        Object.assign(panel.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '400px',
            maxWidth: '92vw',
            fontSize: '14px',
            zIndex: '210',
            userSelect: 'none',
            overflow: 'hidden',
        });
        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '12px 16px 10px',
            borderBottom: '1px solid #4a3010',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0,0,0,0.3)',
        });
        const title = document.createElement('span');
        title.textContent = `🛒 ${merchantName}`;
        Object.assign(title.style, {
            fontFamily: 'Cinzel, serif',
            fontSize: '13px',
            letterSpacing: '2px',
            color: '#c8963c',
        });
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        Object.assign(closeBtn.style, {
            background: 'none',
            border: 'none',
            color: '#7a5a30',
            cursor: 'pointer',
            fontSize: '16px',
        });
        closeBtn.onclick = () => MerchantUI.close();
        header.append(title, closeBtn);
        panel.appendChild(header);
        // Gold display
        const goldBar = document.createElement('div');
        Object.assign(goldBar.style, {
            padding: '8px 16px',
            fontSize: '13px',
            color: '#d4aa44',
            borderBottom: '1px solid #2a1a04',
        });
        const refreshGold = () => {
            goldBar.textContent = `💰 Gold: ${inventory.get('gold')}`;
        };
        refreshGold();
        panel.appendChild(goldBar);
        // Tab bar
        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display:flex; border-bottom:1px solid var(--hud-border-warm); padding:0 16px;';
        const tabContents = [];
        const tabBtns = [];
        const TABS = ['Resources', 'Potions', 'Sell'];
        const switchTab = (idx) => {
            tabBtns.forEach((b, i) => {
                b.style.borderBottom = i === idx ? '2px solid var(--hud-gold)' : '2px solid transparent';
                b.style.color = i === idx ? 'var(--hud-gold)' : 'var(--hud-muted)';
            });
            tabContents.forEach((c, i) => { c.style.display = i === idx ? '' : 'none'; });
        };
        for (let i = 0; i < TABS.length; i++) {
            const btn = document.createElement('button');
            btn.textContent = TABS[i];
            btn.style.cssText = `background:none; border:none; border-bottom:2px solid transparent;
        font-family:var(--hud-font-serif); font-size:11px; letter-spacing:1px;
        padding:8px 14px; cursor:pointer; transition:color .12s, border-color .12s;
        color:var(--hud-muted);`;
            const idx = i;
            btn.addEventListener('click', () => switchTab(idx));
            tabBar.appendChild(btn);
            tabBtns.push(btn);
            const content = document.createElement('div');
            content.style.cssText = 'padding:12px 16px; display:flex; flex-direction:column; gap:10px; max-height:300px; overflow-y:auto;';
            tabContents.push(content);
        }
        panel.appendChild(tabBar);
        // Tab 0: Resources (Buy)
        for (const item of SHOP_CATALOGUE) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;';
            const nameLbl = document.createElement('span');
            nameLbl.textContent = `${item.icon} ${item.label}`;
            nameLbl.style.cssText = 'flex:1;font-size:13px;color:var(--hud-text);';
            const stockLbl = document.createElement('span');
            stockLbl.style.cssText = 'font-size:11px;color:var(--hud-muted);min-width:50px;text-align:right;';
            const refreshStock = () => { stockLbl.textContent = `Own: ${inventory.get(item.resource)}`; };
            refreshStock();
            const buyBtn = document.createElement('button');
            buyBtn.className = 'hud-btn';
            buyBtn.textContent = `Buy  ${item.buyPrice}g`;
            buyBtn.style.cssText = 'font-size:10px; padding:3px 8px; white-space:nowrap;';
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
            row.append(nameLbl, stockLbl, buyBtn);
            tabContents[0].appendChild(row);
        }
        // Tab 1: Potions (Buy)
        const POTION_CATALOGUE = [
            { id: 'potion_heal_minor', label: 'Minor Heal Potion', icon: '🧪', price: 12 },
            { id: 'potion_heal_major', label: 'Major Heal Potion', icon: '⚗️', price: 28 },
            { id: 'potion_swiftness', label: 'Swiftness Draught', icon: '💨', price: 20 },
            { id: 'potion_power', label: 'Power Elixir', icon: '⚔️', price: 22 },
        ];
        for (const pot of POTION_CATALOGUE) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;';
            const nameLbl = document.createElement('span');
            nameLbl.textContent = `${pot.icon} ${pot.label}`;
            nameLbl.style.cssText = 'flex:1;font-size:13px;color:var(--hud-text);';
            const buyBtn = document.createElement('button');
            buyBtn.className = 'hud-btn hud-btn-primary';
            buyBtn.textContent = `Buy  ${pot.price}g`;
            buyBtn.style.cssText = 'font-size:10px; padding:3px 8px; white-space:nowrap;';
            buyBtn.onclick = () => {
                if (inventory.get('gold') < pot.price) {
                    buyBtn.textContent = 'No gold!';
                    setTimeout(() => { buyBtn.textContent = `Buy  ${pot.price}g`; }, 800);
                    return;
                }
                inventory.spend('gold', pot.price);
                // Fire onBuyPotion callback if registered
                MerchantUI._onBuyPotion?.(pot.id);
                refreshGold();
            };
            row.append(nameLbl, buyBtn);
            tabContents[1].appendChild(row);
        }
        // Tab 2: Sell
        for (const item of SHOP_CATALOGUE) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;';
            const nameLbl = document.createElement('span');
            nameLbl.textContent = `${item.icon} ${item.label}`;
            nameLbl.style.cssText = 'flex:1;font-size:13px;color:var(--hud-text);';
            const stockLbl = document.createElement('span');
            stockLbl.style.cssText = 'font-size:11px;color:var(--hud-muted);min-width:50px;text-align:right;';
            const refreshStock2 = () => { stockLbl.textContent = `Own: ${inventory.get(item.resource)}`; };
            refreshStock2();
            const sellBtn = document.createElement('button');
            sellBtn.className = 'hud-btn';
            sellBtn.textContent = `Sell  ${item.sellPrice}g`;
            sellBtn.style.cssText = 'font-size:10px; padding:3px 8px; white-space:nowrap; color:var(--hud-success);';
            sellBtn.onclick = () => {
                if (inventory.get(item.resource) < 1) {
                    sellBtn.textContent = 'None!';
                    setTimeout(() => { sellBtn.textContent = `Sell  ${item.sellPrice}g`; }, 800);
                    return;
                }
                inventory.spend(item.resource, 1);
                inventory.add('gold', item.sellPrice);
                refreshGold();
                refreshStock2();
            };
            row.append(nameLbl, stockLbl, sellBtn);
            tabContents[2].appendChild(row);
        }
        // Add all tab content divs to panel
        for (const content of tabContents)
            panel.appendChild(content);
        switchTab(0);
        // Footer hint
        const foot = document.createElement('div');
        foot.textContent = '[E] or Esc to close';
        Object.assign(foot.style, {
            padding: '8px 16px',
            fontSize: '11px',
            color: '#4a3a18',
            borderTop: '1px solid #2a1a04',
            textAlign: 'center',
            fontFamily: 'monospace',
        });
        panel.appendChild(foot);
        document.body.appendChild(panel);
        _panel = panel;
        _closeKey = (e) => {
            if (e.code === 'KeyE' || e.code === 'Escape')
                MerchantUI.close();
        };
        window.addEventListener('keydown', _closeKey);
    },
    close() {
        _panel?.remove();
        _panel = null;
        if (_closeKey) {
            window.removeEventListener('keydown', _closeKey);
            _closeKey = null;
        }
    },
};
