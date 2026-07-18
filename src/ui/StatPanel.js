// ── StatPanel ─────────────────────────────────────────────────────────────────
//
//  [P] key — full-screen stat allocation overlay.
//  Shows the 6 core stats, current values, point cost, and effect descriptions.
import { injectHudTheme } from './hudTheme';
const STAT_INFO = [
    {
        key: 'power',
        icon: '⚔',
        label: 'Power',
        desc: v => `Melee damage ×${(1 + (v - 1) * 0.10).toFixed(2)}`,
    },
    {
        key: 'attunement',
        icon: '✨',
        label: 'Attunement',
        desc: v => `Spell damage ×${(1 + (v - 1) * 0.08).toFixed(2)}`,
    },
    {
        key: 'vitality',
        icon: '❤',
        label: 'Vitality',
        desc: v => `Max HP ${10 + (v - 1) * 5}`,
    },
    {
        key: 'swiftness',
        icon: '💨',
        label: 'Swiftness',
        desc: v => `Speed +${((v - 1) * 4)}%  Dodge −${Math.round((1 - Math.max(0.4, 1 - (v - 1) * 0.05)) * 100)}%`,
    },
    {
        key: 'dominion',
        icon: '👑',
        label: 'Dominion',
        desc: v => `Party cap ${5 + (v - 1)}  Minion dmg +${(v - 1) * 5}%`,
    },
    {
        key: 'cunning',
        icon: '🎲',
        label: 'Cunning',
        desc: v => `Crit ${(v - 1) * 4}%  Yield ×${(1 + (v - 1) * 0.1).toFixed(1)}`,
    },
];
export class StatPanel {
    _el = null;
    _prog = null;
    _rows = [];
    _pointsEl = null;
    get visible() { return !!this._el; }
    open(prog) {
        if (this._el) {
            this._refresh();
            return;
        }
        this._prog = prog;
        this._build(prog);
    }
    close() {
        this._el?.remove();
        this._el = null;
        this._prog = null;
        this._rows = [];
        this._pointsEl = null;
    }
    toggle(prog) {
        this.visible ? this.close() : this.open(prog);
    }
    _build(prog) {
        injectHudTheme();
        const el = document.createElement('div');
        el.id = 'stat-panel';
        Object.assign(el.style, {
            position: 'fixed', inset: '0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(3,1,10,0.90)',
            zIndex: '700', fontFamily: 'var(--hud-font-serif)',
        });
        const box = document.createElement('div');
        box.className = 'hud-panel';
        Object.assign(box.style, {
            padding: '28px 36px',
            minWidth: '400px', maxWidth: '520px',
            boxShadow: 'var(--hud-shadow)',
        });
        // Title
        const title = document.createElement('div');
        title.textContent = '— Character —';
        title.className = 'hud-title';
        Object.assign(title.style, { marginBottom: '8px' });
        // Level + points row
        this._pointsEl = document.createElement('div');
        Object.assign(this._pointsEl.style, {
            fontSize: '11px', letterSpacing: '2px',
            color: 'var(--hud-gold)', textAlign: 'center', marginBottom: '22px',
        });
        this._updatePoints(prog);
        box.append(title, this._pointsEl);
        this._rows = [];
        STAT_INFO.forEach(info => {
            const row = document.createElement('div');
            Object.assign(row.style, {
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: '14px',
            });
            // Icon
            const icon = document.createElement('span');
            icon.textContent = info.icon;
            Object.assign(icon.style, { fontSize: '16px', minWidth: '20px', textAlign: 'center' });
            // Label
            const lbl = document.createElement('span');
            lbl.textContent = info.label;
            Object.assign(lbl.style, {
                flex: '1', fontSize: '13px', color: 'var(--hud-text)',
            });
            // Value + mini bar
            const valueWrap = document.createElement('div');
            Object.assign(valueWrap.style, { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' });
            const valEl = document.createElement('span');
            valEl.textContent = String(prog.stats[info.key]);
            Object.assign(valEl.style, {
                fontSize: '14px', fontFamily: 'var(--hud-font-mono)',
                color: 'var(--hud-gold)', minWidth: '28px', textAlign: 'center',
            });
            const miniBar = document.createElement('div');
            Object.assign(miniBar.style, {
                width: '48px', height: '3px', borderRadius: '2px',
                background: 'rgba(255,255,255,.08)',
                overflow: 'hidden',
            });
            const miniFill = document.createElement('div');
            Object.assign(miniFill.style, {
                height: '100%', borderRadius: '2px',
                background: 'var(--hud-info)',
                width: `${Math.min(100, (prog.stats[info.key] / 20) * 100)}%`,
                transition: 'width .2s',
            });
            miniBar.appendChild(miniFill);
            valueWrap.append(valEl, miniBar);
            // + button
            const btn = document.createElement('button');
            btn.textContent = '+';
            Object.assign(btn.style, {
                background: 'rgba(80,40,140,0.7)',
                border: '1px solid var(--hud-border)',
                borderRadius: 'var(--hud-radius-sm)', color: 'var(--hud-text)',
                fontFamily: 'var(--hud-font-mono)', fontSize: '14px',
                width: '28px', height: '28px',
                cursor: 'pointer', lineHeight: '1',
                transition: 'background 0.12s, box-shadow 0.12s',
            });
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(120,70,200,0.8)';
                btn.style.boxShadow = '0 0 10px rgba(140,80,255,0.5)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(80,40,140,0.7)';
                btn.style.boxShadow = '';
            });
            btn.addEventListener('click', () => {
                if (!this._prog)
                    return;
                if (this._prog.spendStat(info.key)) {
                    this._refresh();
                }
            });
            // Desc
            const descEl = document.createElement('div');
            descEl.textContent = info.desc(prog.stats[info.key]);
            Object.assign(descEl.style, {
                fontSize: '10px', color: 'var(--hud-muted)',
                marginLeft: '30px', marginBottom: '6px',
            });
            // Outer stat-block (two rows: label row + desc row)
            const statBlock = document.createElement('div');
            row.append(icon, lbl, valueWrap, btn);
            statBlock.append(row, descEl);
            box.appendChild(statBlock);
            this._rows.push({ valueEl: valEl, descEl, barFill: miniFill });
        });
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '× Close  [P]';
        closeBtn.className = 'hud-btn';
        Object.assign(closeBtn.style, {
            display: 'block', margin: '18px auto 0',
        });
        closeBtn.addEventListener('click', () => this.close());
        box.appendChild(closeBtn);
        el.appendChild(box);
        el.addEventListener('click', (e) => { if (e.target === el)
            this.close(); });
        document.body.appendChild(el);
        this._el = el;
    }
    _refresh() {
        if (!this._prog)
            return;
        this._updatePoints(this._prog);
        STAT_INFO.forEach((info, i) => {
            const r = this._rows[i];
            if (!r || !this._prog)
                return;
            const v = this._prog.stats[info.key];
            r.valueEl.textContent = String(v);
            r.descEl.textContent = info.desc(v);
            r.barFill.style.width = `${Math.min(100, (v / 20) * 100)}%`;
        });
    }
    _updatePoints(prog) {
        if (!this._pointsEl)
            return;
        this._pointsEl.textContent =
            `Level ${prog.level}  ·  ${prog.statPoints} point${prog.statPoints !== 1 ? 's' : ''} to spend`;
    }
}
