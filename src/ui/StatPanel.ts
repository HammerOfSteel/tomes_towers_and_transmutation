// ── StatPanel ─────────────────────────────────────────────────────────────────
//
//  [P] key — full-screen stat allocation overlay.
//  Shows the 6 core stats, current values, point cost, and effect descriptions.

import type { ProgressionSystem } from '@/progression/ProgressionSystem';

const STAT_INFO: Array<{
  key: keyof import('@/progression/ProgressionSystem').PlayerStats;
  label: string;
  icon: string;
  desc: (val: number) => string;
}> = [
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
  private _el: HTMLDivElement | null = null;
  private _prog: ProgressionSystem | null = null;
  private _rows: Array<{ valueEl: HTMLElement; descEl: HTMLElement }> = [];
  private _pointsEl: HTMLElement | null = null;

  get visible(): boolean { return !!this._el; }

  open(prog: ProgressionSystem): void {
    if (this._el) { this._refresh(); return; }
    this._prog = prog;
    this._build(prog);
  }

  close(): void {
    this._el?.remove();
    this._el = null;
    this._prog = null;
    this._rows = [];
    this._pointsEl = null;
  }

  toggle(prog: ProgressionSystem): void {
    this.visible ? this.close() : this.open(prog);
  }

  private _build(prog: ProgressionSystem): void {
    const el = document.createElement('div');
    el.id = 'stat-panel';
    Object.assign(el.style, {
      position: 'fixed', inset: '0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(3,1,10,0.88)',
      zIndex: '700', fontFamily: '"IM Fell English", Georgia, serif',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: 'rgba(8,4,20,0.97)',
      border: '1px solid #4a3366',
      borderRadius: '6px',
      padding: '28px 36px',
      minWidth: '380px',
      boxShadow: '0 0 40px rgba(100,60,200,0.3)',
    });

    // Title
    const title = document.createElement('div');
    title.textContent = '— Character —';
    Object.assign(title.style, {
      fontFamily: '"Cinzel", serif',
      fontSize: '13px', letterSpacing: '4px',
      color: '#9977cc', textAlign: 'center', marginBottom: '8px',
    });

    // Level + points row
    this._pointsEl = document.createElement('div');
    Object.assign(this._pointsEl.style, {
      fontSize: '11px', letterSpacing: '2px',
      color: '#ffd43c', textAlign: 'center', marginBottom: '22px',
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
        flex: '1', fontSize: '13px', color: '#c9b8e8',
      });

      // Value
      const valEl = document.createElement('span');
      valEl.textContent = String(prog.stats[info.key]);
      Object.assign(valEl.style, {
        fontSize: '14px', fontFamily: 'monospace',
        color: '#ffd43c', minWidth: '28px', textAlign: 'center',
      });

      // + button
      const btn = document.createElement('button');
      btn.textContent = '+';
      Object.assign(btn.style, {
        background: 'rgba(80,40,140,0.7)',
        border: '1px solid #6644aa',
        borderRadius: '3px', color: '#c9b8e8',
        fontFamily: 'monospace', fontSize: '14px',
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
        if (!this._prog) return;
        if (this._prog.spendStat(info.key)) {
          this._refresh();
        }
      });

      // Desc
      const descEl = document.createElement('div');
      descEl.textContent = info.desc(prog.stats[info.key]);
      Object.assign(descEl.style, {
        fontSize: '10px', color: '#6655aa',
        marginLeft: '30px', marginBottom: '6px',
      });

      // Outer stat-block (two rows: label row + desc row)
      const statBlock = document.createElement('div');
      row.append(icon, lbl, valEl, btn);
      statBlock.append(row, descEl);
      box.appendChild(statBlock);

      this._rows.push({ valueEl: valEl, descEl });
    });

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '× Close  [P]';
    Object.assign(closeBtn.style, {
      display: 'block', margin: '18px auto 0',
      background: 'none', border: '1px solid #3a2255',
      borderRadius: '3px', color: '#5a4477',
      fontFamily: '"Cinzel", serif', fontSize: '10px',
      letterSpacing: '2px', padding: '6px 18px',
      cursor: 'pointer',
    });
    closeBtn.addEventListener('click', () => this.close());
    box.appendChild(closeBtn);

    el.appendChild(box);
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    document.body.appendChild(el);
    this._el = el;
  }

  private _refresh(): void {
    if (!this._prog) return;
    this._updatePoints(this._prog);
    STAT_INFO.forEach((info, i) => {
      const r = this._rows[i];
      if (!r || !this._prog) return;
      r.valueEl.textContent = String(this._prog.stats[info.key]);
      r.descEl.textContent = info.desc(this._prog.stats[info.key]);
    });
  }

  private _updatePoints(prog: ProgressionSystem): void {
    if (!this._pointsEl) return;
    this._pointsEl.textContent =
      `Level ${prog.level}  ·  ${prog.statPoints} point${prog.statPoints !== 1 ? 's' : ''} to spend`;
  }
}
