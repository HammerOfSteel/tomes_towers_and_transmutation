/**
 * EnemyHealthBars — thin HP bars that float above enemy heads.
 *
 * Phase G2.
 *
 * Only visible within 15 WU of the player. Updates DOM positions every frame
 * by projecting each enemy's 3D world position to screen space.
 *
 * Usage:
 *   const bars = new EnemyHealthBars(camera, canvas);
 *
 *   // each frame, pass the live enemy list:
 *   bars.update(enemies, playerPos);
 */
import * as THREE from 'three';
import { injectHudTheme } from './hudTheme';
const SHOW_RANGE = 15; // WU — only show bars within this distance
const EHB_CSS = `
.ehb-wrap {
  position: fixed;
  pointer-events: none;
  z-index: 7900;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.ehb-track {
  width: 44px; height: 4px;
  background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 2px;
  overflow: hidden;
}
.ehb-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.15s linear;
}
.ehb-fill--alive   { background: linear-gradient(90deg, #cc2222, #ff4444); }
.ehb-fill--low     { background: linear-gradient(90deg, #882200, #ff3300); }
.ehb-fill--healthy { background: linear-gradient(90deg, #228822, #44cc44); }
`;
const _ndc = new THREE.Vector3();
let _nextId = 0;
export class EnemyHealthBars {
    _camera;
    _canvas;
    _bars = new Map();
    _styleInjected = false;
    constructor(camera, canvas) {
        this._camera = canvas ? camera : camera; // satisfy TS
        this._camera = camera;
        this._canvas = canvas;
    }
    /**
     * Update / create / remove bars based on the current enemy list.
     * @param enemies   All active enemies in the current scene.
     * @param playerPos Player world position (for range culling).
     */
    update(enemies, playerPos) {
        if (!this._styleInjected) {
            injectHudTheme();
            const s = document.createElement('style');
            s.textContent = EHB_CSS;
            document.head.appendChild(s);
            this._styleInjected = true;
        }
        // Ensure we have one bar per living, in-range enemy.
        // Use index as ID (enemies array is stable within a room).
        const seen = new Set();
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.isDead)
                continue;
            const dist = e.worldPosition.distanceTo(playerPos);
            if (dist > SHOW_RANGE) {
                // Out of range — hide but keep entry
                const bar = this._bars.get(i);
                if (bar)
                    bar.wrap.style.display = 'none';
                continue;
            }
            seen.add(i);
            let bar = this._bars.get(i);
            if (!bar) {
                bar = this._createBar(i);
                this._bars.set(i, bar);
            }
            // Position above enemy head
            const headPos = e.worldPosition.clone();
            headPos.y += 2.4; // above a ~2u tall enemy
            const screen = this._worldToScreen(headPos);
            bar.wrap.style.left = `${screen.x}px`;
            bar.wrap.style.top = `${screen.y}px`;
            bar.wrap.style.display = '';
            // Update fill
            const fraction = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
            bar.fill.style.width = `${fraction * 100}%`;
            const cls = fraction < 0.25 ? 'low' : 'alive';
            bar.fill.className = `ehb-fill ehb-fill--${cls}`;
        }
        // Remove bars for enemies no longer in the scene
        for (const [idx, bar] of this._bars) {
            if (!seen.has(idx)) {
                const e = enemies[idx];
                if (!e || e.isDead) {
                    bar.wrap.remove();
                    this._bars.delete(idx);
                }
            }
        }
    }
    clearAll() {
        for (const [, bar] of this._bars)
            bar.wrap.remove();
        this._bars.clear();
    }
    _createBar(id) {
        const wrap = document.createElement('div');
        wrap.className = 'ehb-wrap';
        const track = document.createElement('div');
        track.className = 'ehb-track';
        const fill = document.createElement('div');
        fill.className = 'ehb-fill ehb-fill--alive';
        fill.style.width = '100%';
        track.appendChild(fill);
        wrap.appendChild(track);
        document.body.appendChild(wrap);
        return { id, wrap, fill };
    }
    _worldToScreen(worldPos) {
        _ndc.copy(worldPos).project(this._camera);
        const rect = this._canvas.getBoundingClientRect();
        return new THREE.Vector2((_ndc.x + 1) / 2 * rect.width + rect.left, (-_ndc.y + 1) / 2 * rect.height + rect.top);
    }
}
