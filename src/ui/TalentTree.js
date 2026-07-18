// ── TalentTree ────────────────────────────────────────────────────────────────
//
//  [T] key — star-map constellation overlay.
//  7 talent paths radiate from a center node; cross-path junctions sit between
//  adjacent paths. An HTML5 canvas draws connecting lines; node <divs> sit on
//  top via absolute positioning inside the same fixed container.
//
//  Layout:
//    Center (350, 270) — "Student of the Arts"
//    7 paths at angles evenly spaced from top (−90°), clockwise:
//      i=0  Blade Dancer  −90°
//      i=1  Arcanist      −38.6°
//      i=2  Warlock         12.9°
//      i=3  Conductor       64.3°
//      i=4  Artificer      115.7°
//      i=5  Apothecary     167.1°
//      i=6  Naturalist     218.6°
//    Tier 1 r=130, Tier 2 r=230, Tier 3 r=330
//    Cross-path (between adj paths): r=180, angle = midpoint of adj angles
import { TALENT_NODES, getTalentNode } from '@/progression/TalentSystem';
// ── Layout constants ──────────────────────────────────────────────────────────
const CX = 350, CY = 270;
const R1 = 130, R2 = 230, R3 = 330, RCROSS = 180;
const BASE_ANGLE = -Math.PI / 2; // start at top
const STEP = (2 * Math.PI) / 7;
const PATH_ORDER = [
    'blade_dancer', 'arcanist', 'warlock', 'conductor',
    'artificer', 'apothecary', 'naturalist',
];
const PATH_COLOR = {
    blade_dancer: '#cc4466',
    arcanist: '#4488ff',
    warlock: '#8822cc',
    conductor: '#ffcc44',
    artificer: '#88aacc',
    apothecary: '#44ddbb',
    naturalist: '#44cc66',
    cross: '#ffffff',
};
const PATH_LABEL = {
    blade_dancer: '🗡 Blade Dancer',
    arcanist: '✨ Arcanist',
    warlock: '🩸 Warlock',
    conductor: '👑 Conductor',
    artificer: '🔨 Artificer',
    apothecary: '⚗ Apothecary',
    naturalist: '🌿 Naturalist',
    cross: '✦ Junction',
};
/** Compute (x,y) for a node given its path index and tier. */
function nodePos(pathIndex, r) {
    const a = BASE_ANGLE + pathIndex * STEP;
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
}
/** For cross-path nodes between path i and path (i+1). */
function crossPos(pathI, pathJ) {
    const ai = BASE_ANGLE + pathI * STEP;
    const aj = BASE_ANGLE + pathJ * STEP;
    // Midpoint angle (handle wrap-around for i=6, j=0 case)
    let diff = aj - ai;
    if (diff > Math.PI)
        diff -= 2 * Math.PI;
    if (diff < -Math.PI)
        diff += 2 * Math.PI;
    const am = ai + diff * 0.5;
    return [CX + Math.cos(am) * RCROSS, CY + Math.sin(am) * RCROSS];
}
// Precompute positions for each node id
const NODE_POS = new Map();
TALENT_NODES.forEach(n => {
    if (n.path === 'cross') {
        // Find the two adjacent paths from prerequisites
        const pathI = PATH_ORDER.indexOf(TALENT_NODES.find(x => x.id === n.prerequisites[0])?.path);
        const pathJ = PATH_ORDER.indexOf(TALENT_NODES.find(x => x.id === n.prerequisites[1])?.path);
        if (pathI !== -1 && pathJ !== -1) {
            NODE_POS.set(n.id, crossPos(pathI, pathJ));
        }
    }
    else {
        const pi = PATH_ORDER.indexOf(n.path);
        const r = n.tier === 1 ? R1 : n.tier === 2 ? R2 : R3;
        NODE_POS.set(n.id, nodePos(pi, r));
    }
});
// ── TalentTree UI class ───────────────────────────────────────────────────────
export class TalentTree {
    _el = null;
    _canvas = null;
    _infoEl = null;
    _talentPointsEl = null;
    _nodeEls = new Map();
    _prog = null;
    _talents = null;
    get visible() { return !!this._el; }
    open(prog, talents) {
        if (this._el) {
            this._refresh();
            return;
        }
        this._prog = prog;
        this._talents = talents;
        this._build();
    }
    close() {
        this._el?.remove();
        this._el = null;
        this._canvas = null;
        this._infoEl = null;
        this._talentPointsEl = null;
        this._nodeEls.clear();
        this._prog = null;
        this._talents = null;
    }
    toggle(prog, talents) {
        this.visible ? this.close() : this.open(prog, talents);
    }
    _build() {
        const PANEL_W = 760, PANEL_H = 640;
        const el = document.createElement('div');
        el.id = 'talent-tree';
        Object.assign(el.style, {
            position: 'fixed', inset: '0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(2,0,8,0.93)',
            zIndex: '710',
        });
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            position: 'relative', width: `${PANEL_W}px`, height: `${PANEL_H}px`,
            background: 'rgba(6,2,16,0.98)',
            border: '1px solid #2a1844',
            borderRadius: '6px',
            boxShadow: '0 0 60px rgba(80,40,160,0.25)',
            overflow: 'hidden',
        });
        // Title
        const title = document.createElement('div');
        title.textContent = '— Constellation of Skills —';
        Object.assign(title.style, {
            position: 'absolute', top: '14px', left: '0', right: '0',
            textAlign: 'center',
            fontFamily: '"Cinzel", serif', fontSize: '11px',
            letterSpacing: '4px', color: '#4a3366',
        });
        panel.appendChild(title);
        // Talent points display
        this._talentPointsEl = document.createElement('div');
        Object.assign(this._talentPointsEl.style, {
            position: 'absolute', top: '14px', right: '18px',
            fontFamily: 'monospace', fontSize: '11px',
            color: '#ffd43c', letterSpacing: '1px',
        });
        panel.appendChild(this._talentPointsEl);
        // Canvas for lines (behind nodes)
        const canvas = document.createElement('canvas');
        canvas.width = PANEL_W;
        canvas.height = PANEL_H;
        Object.assign(canvas.style, {
            position: 'absolute', top: '0', left: '0',
            pointerEvents: 'none',
        });
        panel.appendChild(canvas);
        this._canvas = canvas;
        // Info panel (bottom strip)
        const info = document.createElement('div');
        Object.assign(info.style, {
            position: 'absolute', bottom: '0', left: '0', right: '0',
            background: 'rgba(8,4,20,0.95)',
            borderTop: '1px solid #2a1844',
            padding: '12px 20px', height: '88px',
            boxSizing: 'border-box',
        });
        const infoTitle = document.createElement('div');
        Object.assign(infoTitle.style, {
            fontFamily: '"Cinzel", serif', fontSize: '11px',
            letterSpacing: '2px', color: '#c9b8e8', marginBottom: '5px',
        });
        infoTitle.id = 'tt-info-title';
        const infoBody = document.createElement('div');
        Object.assign(infoBody.style, {
            fontFamily: '"IM Fell English", Georgia, serif',
            fontSize: '12px', color: '#5a4477', lineHeight: '1.5',
        });
        infoBody.id = 'tt-info-body';
        info.append(infoTitle, infoBody);
        panel.appendChild(info);
        this._infoEl = info;
        // Center node
        this._makeNode(panel, {
            id: '_center', x: CX, y: CY, label: '✦', subLabel: 'Student of the Arts',
            color: '#664488', bought: true, canBuy: false, locked: false, isCenter: true,
        });
        // Path nodes
        TALENT_NODES.forEach(node => {
            const pos = NODE_POS.get(node.id);
            if (!pos)
                return;
            const [x, y] = pos;
            const bought = this._talents.hasNode(node.id);
            const canBuy = this._talents.canBuy(node.id, this._prog);
            const locked = !bought && !canBuy &&
                !node.prerequisites.every(p => this._talents.hasNode(p));
            const div = this._makeNode(panel, {
                id: node.id, x, y,
                label: node.name,
                subLabel: node.path === 'cross' ? `(${node.cost}pt)` : '',
                color: PATH_COLOR[node.path] ?? '#888888',
                bought, canBuy, locked,
                isCenter: false,
            });
            this._nodeEls.set(node.id, div);
        });
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '× Close  [T]';
        Object.assign(closeBtn.style, {
            position: 'absolute', bottom: '96px', right: '18px',
            background: 'none', border: '1px solid #2a1844',
            borderRadius: '3px', color: '#3a2244',
            fontFamily: '"Cinzel", serif', fontSize: '9px',
            letterSpacing: '2px', padding: '5px 14px',
            cursor: 'pointer',
        });
        closeBtn.addEventListener('click', () => this.close());
        panel.appendChild(closeBtn);
        el.appendChild(panel);
        el.addEventListener('click', (e) => { if (e.target === el)
            this.close(); });
        document.body.appendChild(el);
        this._el = el;
        this._drawLines();
        this._updatePointsDisplay();
    }
    _makeNode(panel, opts) {
        const div = document.createElement('div');
        const SIZE = opts.isCenter ? 38 : 30;
        Object.assign(div.style, {
            position: 'absolute',
            left: `${opts.x - SIZE / 2}px`,
            top: `${opts.y - SIZE / 2}px`,
            width: `${SIZE}px`, height: `${SIZE}px`,
            borderRadius: '50%',
            border: `2px solid ${opts.bought ? opts.color : opts.canBuy ? opts.color : '#1a1030'}`,
            background: opts.bought ? `rgba(${this._hexToRgb(opts.color)},0.35)` :
                opts.canBuy ? 'rgba(10,4,26,0.8)' : 'rgba(4,2,10,0.6)',
            cursor: opts.canBuy ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column',
            boxShadow: opts.bought ? `0 0 14px rgba(${this._hexToRgb(opts.color)},0.55)` :
                opts.canBuy ? `0 0 8px rgba(${this._hexToRgb(opts.color)},0.25)` : 'none',
            transition: 'box-shadow 0.15s, background 0.15s',
            zIndex: '1',
            opacity: opts.locked ? '0.25' : '1',
        });
        if (!opts.isCenter && opts.label.length <= 20) {
            // Label above the circle
            const lbl = document.createElement('div');
            lbl.textContent = opts.label;
            Object.assign(lbl.style, {
                position: 'absolute',
                top: `${-20}px`,
                left: '50%', transform: 'translateX(-50%)',
                fontFamily: '"IM Fell English", Georgia, serif',
                fontSize: '9px', whiteSpace: 'nowrap',
                color: opts.bought ? opts.color : opts.canBuy ? opts.color : '#2a1a3a',
                pointerEvents: 'none',
                textShadow: opts.bought ? `0 0 6px ${opts.color}` : 'none',
            });
            div.appendChild(lbl);
        }
        if (opts.isCenter) {
            const dot = document.createElement('div');
            dot.textContent = '✦';
            Object.assign(dot.style, {
                color: opts.color, fontSize: '16px',
                textShadow: `0 0 12px ${opts.color}`,
            });
            div.appendChild(dot);
        }
        else {
            // Small circle glyph inside node
            const dot = document.createElement('div');
            dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${opts.bought ? opts.color : opts.canBuy ? opts.color + '88' : '#1a1030'};`;
            if (opts.bought)
                dot.style.boxShadow = `0 0 6px ${opts.color}`;
            div.appendChild(dot);
        }
        if (opts.canBuy) {
            div.addEventListener('mouseenter', () => {
                div.style.boxShadow = `0 0 18px rgba(${this._hexToRgb(opts.color)},0.7)`;
                div.style.background = `rgba(${this._hexToRgb(opts.color)},0.2)`;
            });
            div.addEventListener('mouseleave', () => {
                div.style.boxShadow = `0 0 8px rgba(${this._hexToRgb(opts.color)},0.25)`;
                div.style.background = 'rgba(10,4,26,0.8)';
            });
        }
        if (!opts.isCenter) {
            div.addEventListener('mouseenter', () => this._showInfo(opts.id));
            div.addEventListener('click', () => this._tryBuy(opts.id));
        }
        panel.appendChild(div);
        return div;
    }
    _showInfo(nodeId) {
        if (!this._infoEl)
            return;
        const node = getTalentNode(nodeId);
        if (!node)
            return;
        const titleEl = document.getElementById('tt-info-title');
        const bodyEl = document.getElementById('tt-info-body');
        if (!titleEl || !bodyEl)
            return;
        const bought = this._talents?.hasNode(nodeId);
        const canBuy = this._talents?.canBuy(nodeId, this._prog);
        const status = bought ? '  ✓ Acquired' : canBuy ? `  (${node.cost} talent pt)` : '  🔒 Locked';
        titleEl.textContent = `${node.name}  — ${PATH_LABEL[node.path] ?? node.path}${status}`;
        titleEl.style.color = PATH_COLOR[node.path] ?? '#c9b8e8';
        bodyEl.textContent = node.description;
    }
    _tryBuy(nodeId) {
        if (!this._prog || !this._talents)
            return;
        if (this._talents.buyNode(nodeId, this._prog)) {
            this._refresh();
        }
    }
    _refresh() {
        if (!this._el || !this._prog || !this._talents)
            return;
        // Rebuild node visual states
        this._nodeEls.forEach((div, id) => {
            const node = getTalentNode(id);
            if (!node)
                return;
            const bought = this._talents.hasNode(id);
            const canBuy = this._talents.canBuy(id, this._prog);
            const locked = !bought && !canBuy &&
                !node.prerequisites.every(p => this._talents.hasNode(p));
            const color = PATH_COLOR[node.path] ?? '#888';
            const rgb = this._hexToRgb(color);
            div.style.border = `2px solid ${bought ? color : canBuy ? color : '#1a1030'}`;
            div.style.background = bought ? `rgba(${rgb},0.35)` : canBuy ? 'rgba(10,4,26,0.8)' : 'rgba(4,2,10,0.6)';
            div.style.boxShadow = bought ? `0 0 14px rgba(${rgb},0.55)` : canBuy ? `0 0 8px rgba(${rgb},0.25)` : 'none';
            div.style.opacity = locked ? '0.25' : '1';
            div.style.cursor = canBuy ? 'pointer' : 'default';
            // Update inner dot
            const dot = div.querySelector('div');
            if (dot && !dot.textContent?.includes('✦')) {
                dot.style.background = bought ? color : canBuy ? color + '88' : '#1a1030';
                dot.style.boxShadow = bought ? `0 0 6px ${color}` : 'none';
            }
            // Update label
            const lbl = div.querySelector('div:not([style*="border-radius"])');
            if (lbl) {
                lbl.style.color = bought ? color : canBuy ? color : '#2a1a3a';
                lbl.style.textShadow = bought ? `0 0 6px ${color}` : 'none';
            }
        });
        this._drawLines();
        this._updatePointsDisplay();
    }
    _drawLines() {
        if (!this._canvas || !this._talents)
            return;
        const ctx = this._canvas.getContext('2d');
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        // Draw constellation lines from center to each path's tier 1, then tier 1 → 2 → 3
        TALENT_NODES.forEach(node => {
            const [nx, ny] = NODE_POS.get(node.id) ?? [CX, CY];
            node.prerequisites.forEach(prereqId => {
                const [px, py] = prereqId === '_center'
                    ? [CX, CY]
                    : (NODE_POS.get(prereqId) ?? [CX, CY]);
                const bought = this._talents.hasNode(node.id);
                const prereqBought = prereqId === '_center' || this._talents.hasNode(prereqId);
                const color = PATH_COLOR[node.path] ?? '#888888';
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(nx, ny);
                if (bought) {
                    ctx.strokeStyle = color + 'cc';
                    ctx.lineWidth = 1.5;
                }
                else if (prereqBought) {
                    ctx.strokeStyle = color + '44';
                    ctx.lineWidth = 0.8;
                }
                else {
                    ctx.strokeStyle = '#1a1030';
                    ctx.lineWidth = 0.5;
                }
                ctx.stroke();
            });
        });
        // Lines from center to each path's tier 1 node
        PATH_ORDER.forEach((path) => {
            const tier1 = TALENT_NODES.find(n => n.path === path && n.tier === 1);
            if (!tier1)
                return;
            const [nx, ny] = NODE_POS.get(tier1.id) ?? [CX, CY];
            const color = PATH_COLOR[path];
            const bought = this._talents.hasNode(tier1.id);
            ctx.beginPath();
            ctx.moveTo(CX, CY);
            ctx.lineTo(nx, ny);
            ctx.strokeStyle = bought ? color + 'cc' : color + '22';
            ctx.lineWidth = bought ? 1.5 : 0.8;
            ctx.stroke();
        });
    }
    _updatePointsDisplay() {
        if (!this._talentPointsEl || !this._prog)
            return;
        const pts = this._prog.talentPoints;
        this._talentPointsEl.textContent = `${pts} talent pt${pts !== 1 ? 's' : ''}`;
    }
    _hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    }
}
