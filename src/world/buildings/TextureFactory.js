/**
 * TextureFactory — canvas-generated procedural textures for building materials.
 *
 * Each texture type has a single cached HTMLCanvasElement (built once, lazily).
 * Each call to an exported function wraps that canvas in a new THREE.CanvasTexture
 * with caller-specified repeat settings, so each material can tile independently.
 *
 * Adapted from the hiraeth sister project's TextureFactory.ts.
 * Additions: thatchTexture() for thatched roofs.
 */
import * as THREE from 'three';
// ── Canvas element cache (one per type, built lazily) ─────────────────────────
let _stoneCanvas = null;
let _brickCanvas = null;
let _renderCanvas = null;
let _slateCanvas = null;
let _thatchCanvas = null;
let _cobblestoneCanvas = null;
// ── Internal helper ───────────────────────────────────────────────────────────
function _wrap(t, rx, ry) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
}
// ── Stone — coursed limestone/granite ────────────────────────────────────────
function _buildStoneCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    if (!g)
        return c;
    ;
    g.fillStyle = '#636058';
    g.fillRect(0, 0, 512, 512);
    const palette = ['#8c8880', '#96928a', '#7e7a74', '#a09c94', '#848280', '#929090'];
    const mortar = 5;
    let y = 0, row = 0;
    while (y < 516) {
        const courseH = 30 + Math.floor(Math.random() * 10);
        let x = row % 2 === 0 ? 0 : -(25 + Math.random() * 20);
        while (x < 516) {
            const sw = 40 + Math.random() * 36;
            const col = palette[Math.floor(Math.random() * palette.length)];
            g.fillStyle = col;
            g.fillRect(x + mortar, y + mortar, sw - mortar, courseH - mortar);
            g.fillStyle = 'rgba(255,255,255,0.07)';
            g.fillRect(x + mortar, y + mortar, sw - mortar, 2);
            g.fillStyle = 'rgba(0,0,0,0.12)';
            g.fillRect(x + mortar, y + courseH - mortar - 2, sw - mortar, 2);
            x += sw;
        }
        y += courseH;
        row++;
    }
    return c;
}
// ── Brick — muted red clay brick ─────────────────────────────────────────────
function _buildBrickCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    if (!g)
        return c;
    ;
    g.fillStyle = '#888070';
    g.fillRect(0, 0, 512, 512);
    const palette = ['#a84030', '#b84840', '#b04038', '#c05040', '#a04028'];
    const bH = 22, bW = 58, mortar = 4;
    let y = 0, row = 0;
    while (y < 516) {
        const offset = row % 2 === 0 ? 0 : bW / 2;
        for (let xi = -1; xi < 512 / bW + 2; xi++) {
            const x = xi * bW + offset;
            const col = palette[Math.floor(Math.random() * palette.length)];
            const v = (Math.random() - 0.5) * 12;
            g.fillStyle = col;
            g.fillRect(x + mortar, y + mortar, bW - mortar, bH - mortar);
            if (v > 0) {
                g.fillStyle = `rgba(255,255,255,${v / 80})`;
                g.fillRect(x + mortar, y + mortar, bW - mortar, bH - mortar);
            }
            g.fillStyle = 'rgba(255,255,255,0.05)';
            g.fillRect(x + mortar, y + mortar, bW - mortar, 2);
        }
        y += bH;
        row++;
    }
    return c;
}
// ── Render — lime plaster / pebbledash ───────────────────────────────────────
function _buildRenderCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (!g)
        return c;
    ;
    g.fillStyle = '#dedad0';
    g.fillRect(0, 0, 256, 256);
    const img = g.getImageData(0, 0, 256, 256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 18;
        d[i] = Math.max(0, Math.min(255, d[i] + n));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.7));
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(90,85,75,0.2)';
    g.lineWidth = 0.6;
    for (let i = 0; i < 12; i++) {
        const sx = Math.random() * 256, sy = Math.random() * 256;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + (Math.random() - 0.5) * 40, sy + (Math.random() - 0.5) * 40);
        g.stroke();
    }
    return c;
}
// ── Slate — dark blue-grey roof tiles ────────────────────────────────────────
function _buildSlateCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    if (!g)
        return c;
    ;
    g.fillStyle = '#2e3640';
    g.fillRect(0, 0, 512, 512);
    const tH = 26, tW = 38;
    for (let row = 0; row * tH < 512; row++) {
        const offset = row % 2 === 0 ? 0 : tW / 2;
        for (let col = -1; col * tW - offset < 512; col++) {
            const x = col * tW + offset;
            const y = row * tH;
            const dark = Math.random() * 0.14;
            g.fillStyle = `rgba(0,0,0,${dark})`;
            g.fillRect(x + 1, y + 1, tW - 1, tH - 1);
            g.fillStyle = 'rgba(255,255,255,0.035)';
            g.fillRect(x + 1, y + 1, tW - 1, 1);
        }
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(0, row * tH, 512, 1);
    }
    return c;
}
// ── Thatch — warm straw with overlapping course layers ───────────────────────
function _buildThatchCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (!g)
        return c;
    ;
    g.fillStyle = '#b89020';
    g.fillRect(0, 0, 256, 256);
    const img = g.getImageData(0, 0, 256, 256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 44;
        d[i] = Math.max(0, Math.min(255, d[i] + n));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.8));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.1));
    }
    g.putImageData(img, 0, 0);
    // Horizontal course lines (overlapping thatch layers)
    const courseH = 14;
    for (let row = 0; row < Math.ceil(256 / courseH); row++) {
        const y = row * courseH;
        g.fillStyle = 'rgba(50,30,0,0.30)';
        g.fillRect(0, y + courseH - 2, 256, 2);
        g.fillStyle = 'rgba(255,200,80,0.08)';
        g.fillRect(0, y, 256, 2);
        g.strokeStyle = 'rgba(40,25,0,0.18)';
        g.lineWidth = 0.5;
        for (let i = 0; i < 22; i++) {
            const sx = Math.random() * 256;
            const slant = (Math.random() - 0.5) * 5;
            g.beginPath();
            g.moveTo(sx, y + 1);
            g.lineTo(sx + slant, y + courseH - 1);
            g.stroke();
        }
    }
    return c;
}
// ── Cobblestone — for roads and squares ──────────────────────────────────────
function _buildCobblestoneCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (!g)
        return c;
    ;
    g.fillStyle = '#585450';
    g.fillRect(0, 0, 256, 256);
    const palette = ['#888480', '#909090', '#7c7875', '#9a9694', '#848280', '#7a7672'];
    const sx = 30, sy = 24;
    for (let row = 0; row < Math.ceil(256 / sy) + 2; row++) {
        const xOff = row % 2 === 0 ? 0 : sx / 2;
        for (let col = -1; col < Math.ceil(256 / sx) + 2; col++) {
            const cx = col * sx + xOff + (Math.random() - 0.5) * 5;
            const cy = row * sy + (Math.random() - 0.5) * 4;
            const rx = sx * 0.37 + (Math.random() - 0.5) * 3;
            const ry = sy * 0.37 + (Math.random() - 0.5) * 2;
            const col_v = palette[Math.floor(Math.random() * palette.length)];
            g.fillStyle = col_v;
            g.beginPath();
            g.ellipse(cx, cy, rx, ry, (Math.random() - 0.5) * 0.5, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.07)';
            g.beginPath();
            g.ellipse(cx - 1, cy - 2, rx * 0.55, ry * 0.38, 0, 0, Math.PI * 2);
            g.fill();
        }
    }
    return c;
}
// ── Public API ────────────────────────────────────────────────────────────────
/** Coursed stone (limestone / granite). */
export function stoneTexture(repX, repY) {
    if (!_stoneCanvas)
        _stoneCanvas = _buildStoneCanvas();
    return _wrap(new THREE.CanvasTexture(_stoneCanvas), repX, repY);
}
/** Muted red clay brick, running bond. */
export function brickTexture(repX, repY) {
    if (!_brickCanvas)
        _brickCanvas = _buildBrickCanvas();
    return _wrap(new THREE.CanvasTexture(_brickCanvas), repX, repY);
}
/** Lime render / smooth plaster with hairline cracks. */
export function renderTexture(repX, repY) {
    if (!_renderCanvas)
        _renderCanvas = _buildRenderCanvas();
    return _wrap(new THREE.CanvasTexture(_renderCanvas), repX, repY);
}
/** Dark blue-grey Welsh slate roof tiles. */
export function slateTexture(repX, repY) {
    if (!_slateCanvas)
        _slateCanvas = _buildSlateCanvas();
    return _wrap(new THREE.CanvasTexture(_slateCanvas), repX, repY);
}
/** Warm straw thatch with horizontal course lines. */
export function thatchTexture(repX, repY) {
    if (!_thatchCanvas)
        _thatchCanvas = _buildThatchCanvas();
    return _wrap(new THREE.CanvasTexture(_thatchCanvas), repX, repY);
}
/** Irregular rounded cobblestones — roads, squares, courtyards. */
export function cobblestoneTexture(repX, repY) {
    if (!_cobblestoneCanvas)
        _cobblestoneCanvas = _buildCobblestoneCanvas();
    return _wrap(new THREE.CanvasTexture(_cobblestoneCanvas), repX, repY);
}
