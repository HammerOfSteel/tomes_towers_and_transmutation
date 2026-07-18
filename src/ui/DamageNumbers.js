/**
 * DamageNumbers — floating combat text.
 *
 * Phase G2.
 *
 * Creates DOM elements for each hit, projects them from 3D world space to
 * screen space each frame, then animates them upward while fading out.
 *
 * Usage:
 *   const dn = new DamageNumbers(camera, canvas);
 *   dn.spawn(worldPos, damage, 'damage');   // red number
 *   dn.spawn(worldPos, amount, 'heal');     // green number
 *   dn.spawn(worldPos, damage, 'crit');     // large yellow
 *   dn.spawn(worldPos, damage, 'ability'); // purple
 *
 *   // in game loop:
 *   dn.update();  // repositions DOM elements
 */
import * as THREE from 'three';
import { injectHudTheme } from './hudTheme';
const KIND_COLOR = {
    damage: '#ff4444',
    heal: '#44ff88',
    crit: '#ffdd22',
    ability: '#bb88ff',
    miss: '#888888',
};
const KIND_SIZE = {
    damage: '15px',
    heal: '14px',
    crit: '22px',
    ability: '16px',
    miss: '12px',
};
const DN_CSS = `
.dn-num {
  position: fixed;
  pointer-events: none;
  font-family: var(--hud-font-serif, 'Cinzel', serif);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-shadow: 1px 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6);
  z-index: 8000;
  user-select: none;
  white-space: nowrap;
  will-change: transform, opacity;
}
`;
const _ndc = new THREE.Vector3();
const _screen = new THREE.Vector2();
export class DamageNumbers {
    _entries = [];
    _camera;
    _canvas;
    _styleInjected = false;
    constructor(camera, canvas) {
        this._camera = camera;
        this._canvas = canvas;
    }
    /**
     * Spawn a floating number at a world position.
     * @param worldPos  3D position (e.g. enemy's worldPosition)
     * @param value     Numeric value to display
     * @param kind      Visual style
     */
    spawn(worldPos, value, kind) {
        if (!this._styleInjected) {
            injectHudTheme();
            const s = document.createElement('style');
            s.textContent = DN_CSS;
            document.head.appendChild(s);
            this._styleInjected = true;
        }
        const text = kind === 'miss' ? 'MISS' : kind === 'heal' ? `+${value}` : `-${value}`;
        const el = document.createElement('div');
        el.className = 'dn-num';
        el.textContent = text;
        el.style.color = KIND_COLOR[kind];
        el.style.fontSize = KIND_SIZE[kind];
        el.style.opacity = '1';
        document.body.appendChild(el);
        const screen = this._worldToScreen(worldPos);
        el.style.left = `${screen.x}px`;
        el.style.top = `${screen.y}px`;
        this._entries.push({
            el,
            worldPos: worldPos.clone(),
            startTime: performance.now(),
            duration: kind === 'crit' ? 1100 : 800,
            startY: screen.y,
            riseAmount: kind === 'crit' ? 65 : 45,
            jitterX: (Math.random() - 0.5) * 16,
        });
    }
    /** Call once per frame (before render). */
    update() {
        const now = performance.now();
        for (let i = this._entries.length - 1; i >= 0; i--) {
            const e = this._entries[i];
            const t = (now - e.startTime) / e.duration;
            if (t >= 1) {
                e.el.remove();
                this._entries.splice(i, 1);
                continue;
            }
            // Ease out: rise fast then slow
            const rise = e.riseAmount * (1 - Math.pow(1 - t, 2));
            // Fade in first 15% then out for rest
            const opacity = t < 0.15
                ? t / 0.15
                : 1 - (t - 0.15) / 0.85;
            const screen = this._worldToScreen(e.worldPos);
            e.el.style.left = `${screen.x + e.jitterX}px`;
            e.el.style.top = `${screen.y - rise}px`;
            e.el.style.opacity = String(Math.max(0, opacity));
        }
    }
    /** Convert world position to CSS pixel coordinates. */
    _worldToScreen(worldPos) {
        _ndc.copy(worldPos);
        _ndc.project(this._camera);
        const rect = this._canvas.getBoundingClientRect();
        _screen.set((_ndc.x + 1) / 2 * rect.width + rect.left, (-_ndc.y + 1) / 2 * rect.height + rect.top);
        return _screen.clone();
    }
    dispose() {
        for (const e of this._entries)
            e.el.remove();
        this._entries.length = 0;
    }
}
