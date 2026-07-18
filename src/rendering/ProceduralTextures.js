/**
 * ProceduralTextures — Phase 7.5b
 *
 * Generates canvas-based procedural textures for the game's materials.
 * All textures are 256×256, created once and wrapped as `THREE.CanvasTexture`.
 *
 * Each function accepts an optional integer `seed` for deterministic output.
 *
 * Available textures:
 *   makeStoneTexture(seed?)         — Voronoi-crack stone; grey + warm hue variation
 *   makeWoodGrainTexture(seed?)     — Ring-and-stripe wood; warm brown palette (walls)
 *   makeFloorPlanksTexture(seed?)   — Parallel oak plank strips; for floor surfaces
 *   makeAlchemyStoneTexture(seed?)  — Amber voronoi stone; warm patina; for alchemy floor
 *   makeHeraldStoneTexture(seed?)   — Large flag-stone tiles; heraldic inlay marks; for foyer
 *   makeDampStoneTexture(seed?)     — Dark stone with moisture stain; greenish cracks; for brewing floor
 *   makeMossOverlay(seed?, intensity?) — Stipple moss spots; semi-transparent
 *   makeRuneEmissiveMap(seed?, tint?)  — Angular rune glyphs; dark background
 */
import * as THREE from 'three';
// ── Seeded PRNG (mulberry32, no external dep) ─────────────────────────────────
function mulberry32(seed) {
    let s = seed | 0;
    return () => {
        s += 0x6d2b79f5;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// ── Canvas helpers ────────────────────────────────────────────────────────────
/** Create a 2D canvas of the given size. Works in browser and test (jsdom). */
function makeCanvas(size = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
}
function getCtx(canvas) {
    return canvas.getContext('2d');
}
// ── Voronoi helper ────────────────────────────────────────────────────────────
/** Fast approximate Voronoi distances on a [0,1] grid (torus-wrapped). */
function voronoiField(width, height, numPoints, rand) {
    const pts = Array.from({ length: numPoints }, () => [
        rand() * width,
        rand() * height,
    ]);
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let minD = 1e9, min2 = 1e9;
            for (const [px, py] of pts) {
                const dx = Math.min(Math.abs(x - px), width - Math.abs(x - px));
                const dy = Math.min(Math.abs(y - py), height - Math.abs(y - py));
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minD) {
                    min2 = minD;
                    minD = d;
                }
                else if (d < min2) {
                    min2 = d;
                }
            }
            // Edge brightness = distance-to-nearest - distance-to-second-nearest
            out[y * width + x] = min2 - minD;
        }
    }
    return out;
}
// ── Stone texture ─────────────────────────────────────────────────────────────
/**
 * Generates a 256×256 stone texture.
 *
 * Approach:
 *  1. Paint a mid-grey base with slight brightness variation.
 *  2. Compute Voronoi cells — dark edges = mortar lines / cracks.
 *  3. Overlay light/dark noise for surface roughness.
 *  4. Slight sepia/warm hue tint per cell.
 */
export function makeStoneTexture(seed = 42) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    if (ctx) {
        // 1. Background: mid-grey gradient noise
        const imgData = ctx.createImageData(SIZE, SIZE);
        const d = imgData.data;
        const voronoi = voronoiField(SIZE, SIZE, 40, rand);
        // Find voronoi range for normalisation
        let vMax = 0;
        for (let i = 0; i < voronoi.length; i++)
            if (voronoi[i] > vMax)
                vMax = voronoi[i];
        for (let i = 0; i < SIZE * SIZE; i++) {
            // Base grey with low-frequency noise
            const noise = (rand() - 0.5) * 28;
            let grey = 130 + noise;
            // Voronoi edge → darken at mortar lines
            const v = voronoi[i] / (vMax + 0.01);
            const edgeDark = Math.max(0, 1 - v * 7) * 55;
            grey -= edgeDark;
            // Tiny surface pitting
            const pit = rand() < 0.015 ? -35 : 0;
            grey += pit;
            // Warm tone: slight reddish-orange hue drift per-pixel
            const r = Math.min(255, Math.max(0, grey + rand() * 10 - 3));
            const g = Math.min(255, Math.max(0, grey - 3));
            const b = Math.min(255, Math.max(0, grey - 10));
            d[i * 4] = r;
            d[i * 4 + 1] = g;
            d[i * 4 + 2] = b;
            d[i * 4 + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
}
// ── Herald stone floor texture ───────────────────────────────────────────────
/**
 * Large flag-stone tiles with subtle alternating tone and thin dark seams.
 * For the Grand Entrance Hall (floor 0).
 *
 * @param seed  PRNG seed (default 31).
 */
export function makeHeraldStoneTexture(seed = 31) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    // 2×2 flag-stone grid — each stone is SIZE/2 × SIZE/2 pixels
    const TILE = SIZE / 2;
    const SEAM = 3; // seam width in pixels
    const imgData = ctx.createImageData(SIZE, SIZE);
    const data = imgData.data;
    // Four stone tones, alternating checkerboard for heraldic look
    const tones = [
        { r: 0.68, g: 0.65, b: 0.60 }, // light grey
        { r: 0.58, g: 0.55, b: 0.51 }, // medium grey
        { r: 0.65, g: 0.62, b: 0.58 }, // light-warm
        { r: 0.55, g: 0.52, b: 0.48 }, // medium-warm
    ];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            // Seam detection
            const inSeamX = (x % TILE) < SEAM || (x % TILE) >= TILE - SEAM;
            const inSeamZ = (y % TILE) < SEAM || (y % TILE) >= TILE - SEAM;
            const inSeam = inSeamX || inSeamZ;
            const tileCol = Math.floor(x / TILE);
            const tileRow = Math.floor(y / TILE);
            const tone = tones[(tileRow * 2 + tileCol) % 4];
            // Per-pixel hash noise for surface texture
            const nx = ((x * 3011 ^ y * 5003 ^ (seed * 19)) & 0xff) / 255;
            const noise = 0.88 + nx * 0.12;
            let r, g, b;
            if (inSeam) {
                // Dark seam
                r = Math.round(0.22 * 255);
                g = Math.round(0.20 * 255);
                b = Math.round(0.18 * 255);
            }
            else {
                r = Math.min(255, Math.round(tone.r * noise * 255));
                g = Math.min(255, Math.round(tone.g * noise * 255));
                b = Math.min(255, Math.round(tone.b * noise * 255));
            }
            const i4 = (y * SIZE + x) * 4;
            data[i4] = r;
            data[i4 + 1] = g;
            data[i4 + 2] = b;
            data[i4 + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    // Faint heraldic diamond inlays at each tile centre
    ctx.strokeStyle = 'rgba(80, 70, 55, 0.30)';
    ctx.lineWidth = 1.5;
    for (const [tx, ty] of [[TILE / 2, TILE / 2], [TILE * 1.5, TILE / 2], [TILE / 2, TILE * 1.5], [TILE * 1.5, TILE * 1.5]]) {
        const s = TILE * 0.22;
        ctx.beginPath();
        ctx.moveTo(tx, ty - s);
        ctx.lineTo(tx + s, ty);
        ctx.lineTo(tx, ty + s);
        ctx.lineTo(tx - s, ty);
        ctx.closePath();
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 2.5); // ≈5 flag-stone tiles across the chamber
    return tex;
}
// ── Damp stone floor texture ──────────────────────────────────────────────────
/**
 * Dark voronoi stone with greenish moisture tint and damp-crack variation.
 * For the Fermentation Level (floor 2).
 *
 * @param seed  PRNG seed (default 55).
 */
export function makeDampStoneTexture(seed = 55) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    const cells = [];
    for (let i = 0; i < 26; i++) {
        cells.push({ cx: rand() * SIZE, cy: rand() * SIZE });
    }
    const imgData = ctx.createImageData(SIZE, SIZE);
    const data = imgData.data;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let d1 = Infinity, d2 = Infinity;
            for (const c of cells) {
                const dx = Math.min(Math.abs(x - c.cx), SIZE - Math.abs(x - c.cx));
                const dy = Math.min(Math.abs(y - c.cy), SIZE - Math.abs(y - c.cy));
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                }
                else if (d < d2)
                    d2 = d;
            }
            const edgeFade = Math.min((d2 - d1) / 4, 1);
            const crack = edgeFade < 0.35 ? edgeFade / 0.35 : 1;
            const nx = ((x * 2333 ^ y * 3779 ^ (seed * 23)) & 0xff) / 255;
            const tone = 0.35 + nx * 0.18;
            const t = tone * crack;
            // Dark base with green-grey moisture tint
            const r = Math.min(255, Math.round((0.22 + t * 0.28) * 255));
            const g = Math.min(255, Math.round((0.26 + t * 0.28) * 255));
            const b = Math.min(255, Math.round((0.20 + t * 0.22) * 255));
            const i4 = (y * SIZE + x) * 4;
            data[i4] = r;
            data[i4 + 1] = g;
            data[i4 + 2] = b;
            data[i4 + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
}
// ── Grass floor texture ───────────────────────────────────────────────────────
/**
 * Patchy green/brown grass with dirt variation — replaces the flat `#2a5a22`
 * colour on the Botanical Laboratory floor (floor 7).
 *
 * Technique: per-pixel hash noise blended between three base tones
 * (rich green, pale yellow-green, bare dirt brown), with occasional dark
 * moss patches.
 *
 * @param seed  PRNG seed (default 61).
 */
export function makeGrassTexture(seed = 61) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const imgData = ctx.createImageData(SIZE, SIZE);
    const data = imgData.data;
    // Three tone anchors: rich grass, yellow-green, dirt
    const TONES = [
        [40, 100, 30], // rich green
        [70, 120, 40], // lighter green
        [90, 130, 50], // yellow-green
        [60, 50, 25], // bare dirt
    ];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            // Low-frequency variation: large patches
            const nx = ((x * 1021 ^ y * 2531 ^ (seed * 13)) & 0xff) / 255;
            // High-frequency variation: fine noise
            const hf = ((x * 5381 ^ y * 3779 ^ (seed * 37)) & 0xff) / 255;
            // Moss / dark patch: very low freq
            const lf = ((x * 191 ^ y * 397 ^ (seed * 7)) & 0xff) / 255;
            // Select tone index via low-freq patch
            const tIdx = nx < 0.38 ? 0
                : nx < 0.62 ? 1
                    : nx < 0.82 ? 2
                        : 3;
            const [tr, tg, tb] = TONES[tIdx];
            // Fine noise jitter
            const jitter = (hf - 0.5) * 24;
            // Occasional dark moss blotch
            const mossBlend = lf < 0.08 ? (1 - lf / 0.08) * 0.40 : 0;
            const r = Math.min(255, Math.max(0, Math.round(tr + jitter * 0.5 - mossBlend * 28)));
            const g = Math.min(255, Math.max(0, Math.round(tg + jitter - mossBlend * 40)));
            const b = Math.min(255, Math.max(0, Math.round(tb + jitter * 0.4 - mossBlend * 20)));
            const i4 = (y * SIZE + x) * 4;
            data[i4] = r;
            data[i4 + 1] = g;
            data[i4 + 2] = b;
            data[i4 + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
}
/**
 * Generates a 256×256 wood grain texture.
 *
 * Approach:
 *  1. Warm brown base with ring distortion (circular "annual rings").
 *  2. Horizontal sine-wave stripe variation for plank grain.
 *  3. Knot: dark oval with radiating ring distortion.
 */
export function makeWoodGrainTexture(seed = 7) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    if (ctx) {
        const imgData = ctx.createImageData(SIZE, SIZE);
        const d = imgData.data;
        // Knot positions (0–3 per texture)
        const numKnots = 1 + Math.floor(rand() * 2);
        const knots = Array.from({ length: numKnots }, () => [
            0.1 + rand() * 0.8,
            0.1 + rand() * 0.8,
            20 + rand() * 30,
        ]);
        const CENTER_X = (0.3 + rand() * 0.4) * SIZE;
        const CENTER_Y = (0.3 + rand() * 0.4) * SIZE;
        const RING_PERIOD = 18 + rand() * 12;
        for (let i = 0; i < SIZE * SIZE; i++) {
            const x = i % SIZE;
            const y = (i / SIZE) | 0;
            let dx = x - CENTER_X;
            let dy = y - CENTER_Y;
            for (const [kx, ky, kr] of knots) {
                const kkx = kx * SIZE - x;
                const kky = ky * SIZE - y;
                const kd = Math.sqrt(kkx * kkx + kky * kky) + 0.1;
                const influence = Math.exp(-kd / kr) * 18;
                dx += (kkx / kd) * influence;
                dy += (kky / kd) * influence;
            }
            const ringDist = Math.sqrt(dx * dx + dy * dy);
            const ringPhase = (ringDist / RING_PERIOD) * Math.PI * 2;
            const ringBand = Math.sin(ringPhase + rand() * 0.4) * 0.5 + 0.5;
            const stripe = Math.sin((y * 0.35 + rand() * 2) * 0.8) * 0.5 + 0.5;
            const grain = ringBand * 0.7 + stripe * 0.3;
            d[i * 4] = Math.min(255, Math.max(0, 60 + grain * 120 + (rand() - 0.5) * 15));
            d[i * 4 + 1] = Math.min(255, Math.max(0, 32 + grain * 88 + (rand() - 0.5) * 10));
            d[i * 4 + 2] = Math.min(255, Math.max(0, 12 + grain * 48 + (rand() - 0.5) * 8));
            d[i * 4 + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.5, 1.5);
    return tex;
}
// ── Floor planks texture ──────────────────────────────────────────────────────
/**
 * Generates a 256×256 floor-plank texture.
 *
 * Planks run along the Z axis (north-south).  Seam lines appear along X.
 * Uses a per-pixel hash for surface noise (no sequential PRNG artefacts).
 *
 * @param seed  Controls per-plank tone, grain phase and amplitude.
 */
export function makeFloorPlanksTexture(seed = 77) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    if (ctx) {
        const NUM_PLANKS = 8; // vertical plank strips per tile
        const PLANK_PX = (SIZE / NUM_PLANKS) | 0; // 32 px wide each
        // Per-plank values — pre-generated so per-pixel work is pure math
        const tone = Array.from({ length: NUM_PLANKS }, () => 95 + rand() * 65);
        const phase = Array.from({ length: NUM_PLANKS }, () => rand() * Math.PI * 3);
        const amp = Array.from({ length: NUM_PLANKS }, () => 10 + rand() * 20);
        const freq = Array.from({ length: NUM_PLANKS }, () => 0.028 + rand() * 0.036);
        // Deterministic per-pixel hash — avoids sequential PRNG artefacts
        function pxHash(x, y) {
            let h = (x * 1619 ^ y * 31337 ^ seed * 6271) | 0;
            h ^= h >>> 13;
            h = Math.imul(h, 1540483477) | 0;
            return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
        }
        const imgData = ctx.createImageData(SIZE, SIZE);
        const d = imgData.data;
        for (let px = 0; px < SIZE; px++) {
            const pi = Math.min(NUM_PLANKS - 1, (px / PLANK_PX) | 0);
            const localX = px % PLANK_PX;
            const t = tone[pi];
            const ph = phase[pi];
            const a = amp[pi];
            const fr = freq[pi];
            // Seam line: thin dark gap at plank left/right boundary
            const edgeFade = localX < 2 ? localX / 2 : localX > PLANK_PX - 3 ? (PLANK_PX - 1 - localX) / 2 : 1;
            const jointDark = (1 - edgeFade) * 58;
            for (let py = 0; py < SIZE; py++) {
                // Grain runs along py (= V direction = Z axis = along the plank)
                const grain = Math.sin(py * fr + ph) * a
                    + Math.sin(py * fr * 2.1 + ph * 1.75) * a * 0.28;
                // Fine surface noise (hash-based)
                const noise = (pxHash(px, py) - 0.5) * 14;
                const brightness = t + grain + noise - jointDark;
                // Warm oak palette
                d[(py * SIZE + px) * 4] = Math.min(255, Math.max(0, brightness * 1.38));
                d[(py * SIZE + px) * 4 + 1] = Math.min(255, Math.max(0, brightness * 0.82));
                d[(py * SIZE + px) * 4 + 2] = Math.min(255, Math.max(0, brightness * 0.28));
                d[(py * SIZE + px) * 4 + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 2); // 32 plank strips across X, grain cycles twice in Z
    return tex;
}
// ── Alchemy stone floor texture ───────────────────────────────────────────────
/**
 * Warm amber-tinted voronoi stone for the Lower Laboratory (floor −1).
 * Tiles 3×3 across the chamber floor.
 *
 * @param seed  PRNG seed (default 13).
 */
export function makeAlchemyStoneTexture(seed = 13) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    const cells = [];
    for (let i = 0; i < 28; i++) {
        cells.push({ cx: rand() * SIZE, cy: rand() * SIZE });
    }
    const imgData = ctx.createImageData(SIZE, SIZE);
    const data = imgData.data;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let d1 = Infinity, d2 = Infinity;
            for (const c of cells) {
                const dx = Math.min(Math.abs(x - c.cx), SIZE - Math.abs(x - c.cx));
                const dy = Math.min(Math.abs(y - c.cy), SIZE - Math.abs(y - c.cy));
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                }
                else if (d < d2)
                    d2 = d;
            }
            // Edge crack darkening
            const edgeFade = Math.min((d2 - d1) / 5, 1);
            const crack = edgeFade < 0.4 ? edgeFade / 0.4 : 1;
            // Per-pixel hash noise
            const nx = ((x * 2971 ^ y * 4049 ^ (seed * 17)) & 0xff) / 255;
            const tone = 0.52 + nx * 0.2;
            const t = tone * crack;
            // Warm amber tint: r > g >> b
            const r = Math.min(255, Math.round((0.60 + t * 0.30) * 255));
            const g = Math.min(255, Math.round((0.40 + t * 0.24) * 255));
            const b = Math.min(255, Math.round((0.20 + t * 0.14) * 255));
            const i4 = (y * SIZE + x) * 4;
            data[i4] = r;
            data[i4 + 1] = g;
            data[i4 + 2] = b;
            data[i4 + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
}
// ── Scorched stone floor texture ──────────────────────────────────────────────
/**
 * Dark charred stone with reddish-orange heat cracks.
 * For the Runic Forge (floor 4).
 *
 * @param seed  PRNG seed (default 71).
 */
export function makeScorchedStoneTexture(seed = 71) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    const cells = [];
    for (let i = 0; i < 20; i++) {
        cells.push({ cx: rand() * SIZE, cy: rand() * SIZE });
    }
    const imgData = ctx.createImageData(SIZE, SIZE);
    const data = imgData.data;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let d1 = Infinity, d2 = Infinity;
            for (const c of cells) {
                const dx = Math.min(Math.abs(x - c.cx), SIZE - Math.abs(x - c.cx));
                const dy = Math.min(Math.abs(y - c.cy), SIZE - Math.abs(y - c.cy));
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                }
                else if (d < d2)
                    d2 = d;
            }
            const edgeFade = Math.min((d2 - d1) / 4, 1);
            const crack = edgeFade < 0.30 ? edgeFade / 0.30 : 1;
            const nx = ((x * 3157 ^ y * 2791 ^ (seed * 17)) & 0xff) / 255;
            const tone = 0.18 + nx * 0.22;
            const t = tone * crack;
            // Charcoal base with red-orange heat-crack glow
            const heatGlow = edgeFade < 0.30 ? (1 - edgeFade / 0.30) * 0.55 : 0;
            const r = Math.min(255, Math.round(((0.14 + t * 0.24) + heatGlow * 0.6) * 255));
            const g = Math.min(255, Math.round(((0.08 + t * 0.14) + heatGlow * 0.18) * 255));
            const b = Math.min(255, Math.round(((0.06 + t * 0.10)) * 255));
            const i4 = (y * SIZE + x) * 4;
            data[i4] = r;
            data[i4 + 1] = g;
            data[i4 + 2] = b;
            data[i4 + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
}
// ── Sealed stone floor texture ────────────────────────────────────────────────
/**
 * Cold grey stone with faint arcane ward markings.
 * For the Forbidden Archive (floor 8).
 *
 * @param seed  PRNG seed (default 89).
 */
export function makeSealedStoneTexture(seed = 89) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    const cells = [];
    for (let i = 0; i < 18; i++) {
        cells.push({ cx: rand() * SIZE, cy: rand() * SIZE });
    }
    const imgData = ctx.createImageData(SIZE, SIZE);
    const data = imgData.data;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let d1 = Infinity, d2 = Infinity;
            for (const c of cells) {
                const dx = Math.min(Math.abs(x - c.cx), SIZE - Math.abs(x - c.cx));
                const dy = Math.min(Math.abs(y - c.cy), SIZE - Math.abs(y - c.cy));
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                }
                else if (d < d2)
                    d2 = d;
            }
            const edgeFade = Math.min((d2 - d1) / 5, 1);
            const crack = edgeFade < 0.40 ? edgeFade / 0.40 : 1;
            const nx = ((x * 1999 ^ y * 3301 ^ (seed * 29)) & 0xff) / 255;
            const tone = 0.42 + nx * 0.18;
            const t = tone * crack;
            // Cold grey with faint purple-blue ward tint
            const r = Math.min(255, Math.round((0.28 + t * 0.32) * 255));
            const g = Math.min(255, Math.round((0.28 + t * 0.32) * 255));
            const b = Math.min(255, Math.round((0.36 + t * 0.32) * 255));
            const i4 = (y * SIZE + x) * 4;
            data[i4] = r;
            data[i4 + 1] = g;
            data[i4 + 2] = b;
            data[i4 + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 2.5);
    return tex;
}
// ── Celestial stone floor texture ─────────────────────────────────────────────
/**
 * Near-black stone with tiny gold star specks.
 * For the Celestial Observatory (floor 9).
 *
 * @param seed  PRNG seed (default 97).
 */
export function makeCelestialStoneTexture(seed = 97) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    const imgData = ctx.createImageData(SIZE, SIZE);
    const data = imgData.data;
    // Dark base with subtle blue-grey gradient
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const nx = ((x * 2221 ^ y * 3779 ^ (seed * 31)) & 0xff) / 255;
            const tone = 0.06 + nx * 0.10;
            const i4 = (y * SIZE + x) * 4;
            data[i4] = Math.round((tone * 0.75) * 255);
            data[i4 + 1] = Math.round((tone * 0.80) * 255);
            data[i4 + 2] = Math.round((tone * 1.00) * 255);
            data[i4 + 3] = 255;
        }
    }
    // Gold star specks
    const starCount = 120;
    for (let s = 0; s < starCount; s++) {
        const sx = Math.floor(rand() * SIZE);
        const sy = Math.floor(rand() * SIZE);
        const brightness = 0.55 + rand() * 0.45;
        const i4 = (sy * SIZE + sx) * 4;
        data[i4] = Math.min(255, Math.round((0.90 * brightness) * 255));
        data[i4 + 1] = Math.min(255, Math.round((0.78 * brightness) * 255));
        data[i4 + 2] = Math.min(255, Math.round((0.22 * brightness) * 255));
        data[i4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
}
/**
 * Generates a 256×256 moss overlay texture (transparent alpha channel).
 *
 * @param seed       Seed for stipple placement.
 * @param intensity  0.0 = barely visible, 1.0 = dense coverage (default 0.5).
 */
export function makeMossOverlay(seed = 99, intensity = 0.5) {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    if (ctx) {
        ctx.clearRect(0, 0, SIZE, SIZE);
        const numPatches = Math.floor(30 + intensity * 80);
        for (let i = 0; i < numPatches; i++) {
            const cx = rand() * SIZE;
            const cy = rand() * SIZE;
            const r = 4 + rand() * 18;
            const alpha = 0.25 + rand() * 0.5 * intensity;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, `rgba(60,120,40,${alpha})`);
            grad.addColorStop(0.6, `rgba(45,100,30,${(alpha * 0.6).toFixed(3)})`);
            grad.addColorStop(1, `rgba(30,70,20,0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(cx, cy, r, r * (0.6 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
        const numDots = Math.floor(intensity * 400);
        for (let i = 0; i < numDots; i++) {
            const x = rand() * SIZE;
            const y = rand() * SIZE;
            const r = 0.5 + rand() * 2.0;
            ctx.fillStyle = `rgba(40,90,25,${(0.4 + rand() * 0.4).toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
}
// ── Rune emissive map ─────────────────────────────────────────────────────────
/**
 * Generates a 256×256 rune emissive map.
 * Dark background + procedural angular rune glyphs drawn as bright polylines.
 *
 * @param seed  Controls glyph positions + shapes.
 * @param tint  CSS colour string for glyph lines (default violet `#bb44ff`).
 */
export function makeRuneEmissiveMap(seed = 13, tint = '#bb44ff') {
    const SIZE = 256;
    const canvas = makeCanvas(SIZE);
    const ctx = getCtx(canvas);
    const rand = mulberry32(seed);
    if (ctx) {
        ctx.fillStyle = '#0a0014';
        ctx.fillRect(0, 0, SIZE, SIZE);
        const numGlyphs = 4 + Math.floor(rand() * 5);
        for (let g = 0; g < numGlyphs; g++) {
            const cx = (0.1 + rand() * 0.8) * SIZE;
            const cy = (0.1 + rand() * 0.8) * SIZE;
            const scale = 10 + rand() * 20;
            const numStrokes = 2 + Math.floor(rand() * 4);
            ctx.strokeStyle = tint;
            ctx.lineWidth = 1.5 + rand() * 1.5;
            ctx.shadowColor = tint;
            ctx.shadowBlur = 6;
            ctx.globalAlpha = 0.6 + rand() * 0.4;
            for (let s = 0; s < numStrokes; s++) {
                const numPts = 2 + Math.floor(rand() * 4);
                ctx.beginPath();
                for (let p = 0; p < numPts; p++) {
                    const angle = rand() * Math.PI * 2;
                    const dist = rand() * scale;
                    const px = cx + Math.cos(angle) * dist;
                    const py = cy + Math.sin(angle) * dist;
                    if (p === 0)
                        ctx.moveTo(px, py);
                    else
                        ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}
export const TEXTURE_PRESETS = [
    {
        id: 'plain', label: 'Plain', emoji: '⬜',
        defaultColor: '#8b7355', defaultColor2: '#5a4a35',
        params: [
            { id: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.05, default: 0.75 },
            { id: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.05, default: 0 },
        ],
    },
    {
        id: 'wood', label: 'Wood', emoji: '🪵',
        defaultColor: '#8b5e3c', defaultColor2: '#5a3a22',
        params: [
            { id: 'scale', label: 'Texture Scale', min: 1, max: 5, step: 0.5, default: 2 },
            { id: 'grain_density', label: 'Grain Density', min: 0, max: 1, step: 0.05, default: 0.5 },
            { id: 'grain_warp', label: 'Grain Warp', min: 0, max: 1, step: 0.05, default: 0.4 },
            { id: 'knot_count', label: 'Knot Count', min: 0, max: 1, step: 0.1, default: 0.3 },
            { id: 'dark_bands', label: 'Growth Rings', min: 0, max: 1, step: 0.05, default: 0.3 },
            { id: 'polish', label: 'Polish', min: 0, max: 1, step: 0.05, default: 0.1 },
        ],
    },
    {
        id: 'stone', label: 'Stone', emoji: '🪨',
        defaultColor: '#7a7a7a', defaultColor2: '#4a4a4a',
        params: [
            { id: 'scale', label: 'Texture Scale', min: 0.5, max: 4, step: 0.5, default: 1.5 },
            { id: 'block_size', label: 'Block Size', min: 0, max: 1, step: 0.05, default: 0.5 },
            { id: 'mortar_width', label: 'Mortar Width', min: 0, max: 1, step: 0.05, default: 0.3 },
            { id: 'surface_noise', label: 'Surface Noise', min: 0, max: 1, step: 0.05, default: 0.5 },
            { id: 'cracks', label: 'Cracks', min: 0, max: 1, step: 0.05, default: 0.2 },
        ],
    },
    {
        id: 'fabric', label: 'Fabric', emoji: '🧵',
        defaultColor: '#7a5a9a', defaultColor2: '#4a3a6a',
        params: [
            { id: 'scale', label: 'Texture Scale', min: 1, max: 6, step: 0.5, default: 3 },
            { id: 'weave_scale', label: 'Thread Size', min: 0, max: 1, step: 0.05, default: 0.3 },
            { id: 'pattern', label: 'Pattern', min: 0, max: 2, step: 1, default: 0 },
            { id: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0.1 },
            { id: 'worn', label: 'Worn', min: 0, max: 1, step: 0.05, default: 0.1 },
        ],
    },
    {
        id: 'metal', label: 'Metal', emoji: '⚙',
        defaultColor: '#8a8a8a', defaultColor2: '#3a3a3a',
        params: [
            { id: 'scale', label: 'Texture Scale', min: 0.5, max: 3, step: 0.5, default: 1 },
            { id: 'scratch_count', label: 'Scratches', min: 0, max: 1, step: 0.05, default: 0.3 },
            { id: 'brush_dir', label: 'Brush Dir', min: 0, max: 1, step: 0.05, default: 0 },
            { id: 'polish', label: 'Polish', min: 0, max: 1, step: 0.05, default: 0.5 },
            { id: 'patina', label: 'Patina', min: 0, max: 1, step: 0.05, default: 0 },
        ],
    },
    {
        id: 'marble', label: 'Marble', emoji: '🔮',
        defaultColor: '#d8d4d0', defaultColor2: '#7a7a8a',
        params: [
            { id: 'scale', label: 'Texture Scale', min: 0.5, max: 3, step: 0.5, default: 1.5 },
            { id: 'vein_density', label: 'Vein Density', min: 0, max: 1, step: 0.05, default: 0.5 },
            { id: 'vein_boldness', label: 'Vein Width', min: 0, max: 1, step: 0.05, default: 0.4 },
            { id: 'vein_branch', label: 'Branching', min: 0, max: 1, step: 0.05, default: 0.3 },
            { id: 'roughness', label: 'Roughness', min: 0, max: 0.6, step: 0.05, default: 0.15 },
        ],
    },
    {
        id: 'leather', label: 'Leather', emoji: '🟫',
        defaultColor: '#6b3a2a', defaultColor2: '#3a1a0a',
        params: [
            { id: 'scale', label: 'Texture Scale', min: 1, max: 5, step: 0.5, default: 2 },
            { id: 'grain_size', label: 'Grain Size', min: 0, max: 1, step: 0.05, default: 0.4 },
            { id: 'worn', label: 'Worn', min: 0, max: 1, step: 0.05, default: 0.2 },
            { id: 'tooled', label: 'Tooled', min: 0, max: 1, step: 0.05, default: 0.0 },
        ],
    },
    {
        id: 'painted', label: 'Painted', emoji: '🎨',
        defaultColor: '#5a7a9a', defaultColor2: '#3a5a7a',
        params: [
            { id: 'scale', label: 'Texture Scale', min: 1, max: 5, step: 0.5, default: 2 },
            { id: 'stroke_size', label: 'Stroke Size', min: 0, max: 1, step: 0.05, default: 0.3 },
            { id: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.05, default: 0.6 },
            { id: 'worn', label: 'Worn / Chips', min: 0, max: 1, step: 0.05, default: 0.1 },
        ],
    },
];
// ── Seeded RNG (independent of the game-wide mulberry32) ──────────────────────
function _editorSeed(colorHex, p) {
    let h = parseInt(colorHex.replace('#', ''), 16) ^ 0xBEEF_CAFE;
    for (const [k, v] of Object.entries(p)) {
        for (let i = 0; i < k.length; i++)
            h ^= k.charCodeAt(i) << (i % 24);
        h ^= Math.round(v * 1000);
        h = (Math.imul(h ^ (h >>> 16), 0x45D9F3B)) | 0;
    }
    return h >>> 0;
}
function _editorRng(seed) {
    let s = seed >>> 0;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return ((s >>> 0) / 0xFFFFFFFF);
    };
}
function _parseHex(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _fill(ctx, r, g, b, size) {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, size, size);
}
// ── Generator implementations ─────────────────────────────────────────────────
function _genWood(ctx, size, color, p, rng) {
    const [r, g, b] = _parseHex(color);
    _fill(ctx, r, g, b, size);
    const grainCount = 8 + Math.floor((p['grain_density'] ?? 0.5) * 24);
    const warp = (p['grain_warp'] ?? 0.4) * 35;
    const darkBands = (p['dark_bands'] ?? 0.3) * 8;
    // Growth rings (elliptical)
    for (let ring = 0; ring < darkBands; ring++) {
        const cx = rng() * size;
        const cy = -size * 0.3 + rng() * size * 1.6;
        const rx = size * (0.3 + rng() * 0.5);
        const ry = rx * (0.2 + rng() * 0.4);
        const dk = 0.78 + rng() * 0.18;
        ctx.strokeStyle = `rgba(${Math.round(r * dk)},${Math.round(g * dk)},${Math.round(b * dk)},0.45)`;
        ctx.lineWidth = 1.5 + rng() * 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    // Grain lines
    for (let i = 0; i < grainCount; i++) {
        const x0 = (i / grainCount) * size + (rng() - 0.5) * size * 0.12;
        const phase = rng() * Math.PI * 2;
        const dk = 0.62 + rng() * 0.32;
        const alpha = 0.28 + rng() * 0.55;
        ctx.strokeStyle = `rgba(${Math.round(r * dk)},${Math.round(g * dk)},${Math.round(b * dk)},${alpha})`;
        ctx.lineWidth = 0.4 + rng() * 2;
        ctx.beginPath();
        ctx.moveTo(x0 + Math.sin(phase) * warp, 0);
        for (let y = 0; y <= size; y += 6) {
            ctx.lineTo(x0 + Math.sin(y * 0.03 + phase) * warp, y);
        }
        ctx.stroke();
    }
    // Knots
    const knotCount = Math.round((p['knot_count'] ?? 0.3) * 5);
    for (let k = 0; k < knotCount; k++) {
        const kx = rng() * size;
        const ky = rng() * size;
        const kr = 4 + rng() * 14;
        for (let ring = 0; ring < 6; ring++) {
            const rf = kr * (1 - ring * 0.15);
            if (rf <= 0)
                break;
            const dk = 0.38 + ring * 0.1;
            ctx.strokeStyle = `rgba(${Math.round(r * dk)},${Math.round(g * dk)},${Math.round(b * dk)},${0.75 - ring * 0.08})`;
            ctx.lineWidth = 1 + rng() * 0.5;
            ctx.beginPath();
            ctx.ellipse(kx, ky, rf, rf * (0.4 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}
function _genStone(ctx, size, color, p, rng) {
    const [r, g, b] = _parseHex(color);
    _fill(ctx, r, g, b, size);
    const noiseAmt = (p['surface_noise'] ?? 0.5) * 40;
    for (let x = 0; x < size; x += 3) {
        for (let y = 0; y < size; y += 3) {
            const n = (rng() - 0.5) * noiseAmt;
            ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + n))},${Math.max(0, Math.min(255, g + n))},${Math.max(0, Math.min(255, b + n))},0.5)`;
            ctx.fillRect(x, y, 3, 3);
        }
    }
    const rows = 2 + Math.round((p['block_size'] ?? 0.5) * 6);
    const mortarPx = 1 + (p['mortar_width'] ?? 0.3) * 8;
    const mR = Math.round(r * 0.45);
    const mG = Math.round(g * 0.45);
    const mB = Math.round(b * 0.45);
    const mortarFill = `rgba(${mR},${mG},${mB},0.9)`;
    for (let row = 0; row <= rows; row++) {
        const y = (row / rows) * size;
        ctx.fillStyle = mortarFill;
        ctx.fillRect(0, y - mortarPx / 2, size, mortarPx);
    }
    for (let row = 0; row < rows; row++) {
        const y = (row / rows) * size;
        const rowH = size / rows;
        const cols = 2 + Math.round(rng() * 3);
        const colW = size / cols;
        const off = row % 2 === 0 ? 0 : colW * 0.5;
        for (let col = 0; col <= cols + 1; col++) {
            ctx.fillStyle = mortarFill;
            ctx.fillRect(col * colW + off - mortarPx / 2, y, mortarPx, rowH);
        }
        for (let col = 0; col < cols; col++) {
            const tint = (rng() - 0.5) * 20;
            ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + tint))},${Math.max(0, Math.min(255, g + tint))},${Math.max(0, Math.min(255, b + tint))},0.3)`;
            ctx.fillRect(col * colW + off + mortarPx / 2, y + mortarPx / 2, colW - mortarPx, rowH - mortarPx);
        }
    }
    const crackCount = Math.round((p['cracks'] ?? 0.2) * 10);
    for (let c = 0; c < crackCount; c++) {
        let cx = rng() * size, cy = rng() * size;
        const len = 8 + rng() * 28;
        ctx.strokeStyle = `rgba(${Math.round(r * 0.3)},${Math.round(g * 0.3)},${Math.round(b * 0.3)},0.7)`;
        ctx.lineWidth = 0.5 + rng() * 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        for (let seg = 0; seg < 4; seg++) {
            const angle = rng() * Math.PI * 2;
            cx += Math.cos(angle) * len * 0.3;
            cy += Math.sin(angle) * len * 0.3;
            ctx.lineTo(cx, cy);
        }
        ctx.stroke();
    }
}
function _genFabric(ctx, size, color, p, rng) {
    const [r, g, b] = _parseHex(color);
    _fill(ctx, r, g, b, size);
    const threadW = 1.5 + (p['weave_scale'] ?? 0.3) * 7;
    const gap = threadW * 1.25;
    const pattern = Math.round(p['pattern'] ?? 0);
    for (let x = 0; x < size; x += gap) {
        const dk = 0.72 + rng() * 0.24;
        ctx.fillStyle = `rgba(${Math.round(r * dk)},${Math.round(g * dk)},${Math.round(b * dk)},0.55)`;
        if (pattern === 2) {
            const angle = (Math.floor(x / gap) % 2 === 0) ? 0.3 : -0.3;
            ctx.save();
            ctx.translate(x, size / 2);
            ctx.rotate(angle);
            ctx.fillRect(-threadW / 2, -size, threadW, size * 2);
            ctx.restore();
        }
        else {
            ctx.fillRect(x, 0, threadW, size);
        }
    }
    for (let y = 0; y < size; y += gap) {
        const dk = 0.65 + rng() * 0.22;
        ctx.fillStyle = `rgba(${Math.round(r * dk)},${Math.round(g * dk)},${Math.round(b * dk)},0.45)`;
        if (pattern === 1) {
            ctx.save();
            ctx.translate(size / 2, y);
            ctx.rotate(0.22);
            ctx.fillRect(-size, -threadW / 2, size * 2, threadW);
            ctx.restore();
        }
        else {
            ctx.fillRect(0, y, size, threadW);
        }
    }
    const worn = p['worn'] ?? 0.1;
    if (worn > 0.05) {
        for (let w = 0; w < Math.round(worn * 12); w++) {
            const wx = rng() * size, wy = rng() * size, wr = 3 + rng() * 12;
            ctx.fillStyle = `rgba(${Math.min(255, r + 50)},${Math.min(255, g + 50)},${Math.min(255, b + 50)},0.22)`;
            ctx.beginPath();
            ctx.ellipse(wx, wy, wr, wr * 0.5, rng() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
function _genMetal(ctx, size, color, p, rng) {
    const [r, g, b] = _parseHex(color);
    const hi = (v) => Math.min(255, v + 55);
    const lo = (v) => Math.max(0, v - 40);
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, `rgb(${hi(r)},${hi(g)},${hi(b)})`);
    grad.addColorStop(0.35, `rgb(${r},${g},${b})`);
    grad.addColorStop(0.55, `rgb(${lo(r)},${lo(g)},${lo(b)})`);
    grad.addColorStop(1, `rgb(${Math.min(255, r + 25)},${Math.min(255, g + 25)},${Math.min(255, b + 25)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const scratchCount = Math.round((p['scratch_count'] ?? 0.3) * 40);
    const horiz = (p['brush_dir'] ?? 0) < 0.5;
    for (let i = 0; i < scratchCount; i++) {
        const pos = rng() * size;
        const br = 0.85 + rng() * 0.35;
        ctx.strokeStyle = `rgba(${Math.min(255, Math.round(r * br))},${Math.min(255, Math.round(g * br))},${Math.min(255, Math.round(b * br))},${0.25 + rng() * 0.45})`;
        ctx.lineWidth = rng() * 1.2;
        const wobble = (rng() - 0.5) * 5;
        ctx.beginPath();
        if (horiz) {
            ctx.moveTo(0, pos);
            ctx.lineTo(size, pos + wobble);
        }
        else {
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos + wobble, size);
        }
        ctx.stroke();
    }
    const patina = p['patina'] ?? 0;
    if (patina > 0.05) {
        for (let s = 0; s < Math.round(patina * 20); s++) {
            const sx = rng() * size, sy = rng() * size, sr = 2 + rng() * 10;
            ctx.fillStyle = `rgba(${Math.round(r * 0.5 + 40)},${Math.round(g * 0.7 + 30)},${Math.round(b * 0.5)},${0.2 + rng() * 0.4})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
function _genMarble(ctx, size, color, p, rng) {
    const [r, g, b] = _parseHex(color);
    const lr = Math.min(255, r + 55), lg = Math.min(255, g + 55), lb = Math.min(255, b + 55);
    _fill(ctx, lr, lg, lb, size);
    for (let i = 0; i < 16; i++) {
        const cx = rng() * size, cy = rng() * size, cr = 10 + rng() * 40;
        const dk = 0.88 + rng() * 0.1;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        grad.addColorStop(0, `rgba(${Math.round(lr * dk)},${Math.round(lg * dk)},${Math.round(lb * dk)},0.18)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
    }
    const veinCount = Math.round(3 + (p['vein_density'] ?? 0.5) * 10);
    const veinBold = 0.5 + (p['vein_boldness'] ?? 0.4) * 3.5;
    const branch = (p['vein_branch'] ?? 0.3) > 0.1;
    for (let v = 0; v < veinCount; v++) {
        const x0 = rng() * size;
        const x1 = x0 + (rng() - 0.5) * size * 0.9, x2 = x1 + (rng() - 0.5) * size * 0.7, x3 = x2 + (rng() - 0.5) * size * 0.5;
        const dk = 0.4 + rng() * 0.3;
        ctx.strokeStyle = `rgba(${Math.round(r * dk)},${Math.round(g * dk)},${Math.round(b * dk)},${0.5 + rng() * 0.4})`;
        ctx.lineWidth = veinBold * (0.4 + rng() * 0.8);
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.bezierCurveTo(x1, size * 0.33, x2, size * 0.66, x3, size);
        ctx.stroke();
        if (branch && rng() > 0.5) {
            const bx = x1 + (x2 - x1) * 0.5, by = size * (0.3 + rng() * 0.4);
            ctx.lineWidth = veinBold * 0.35;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.bezierCurveTo(bx + (rng() - 0.5) * 40, by + 20, bx + (rng() - 0.5) * 60, by + 50, bx + (rng() - 0.5) * 80, by + 80);
            ctx.stroke();
        }
    }
}
function _genLeather(ctx, size, color, p, rng) {
    const [r, g, b] = _parseHex(color);
    _fill(ctx, r, g, b, size);
    for (let x = 0; x < size; x += 2) {
        for (let y = 0; y < size; y += 2) {
            const n = (rng() - 0.5) * 18;
            ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + n))},${Math.max(0, Math.min(255, g + n))},${Math.max(0, Math.min(255, b + n))},0.4)`;
            ctx.fillRect(x, y, 2, 2);
        }
    }
    const poreR = 1.5 + (p['grain_size'] ?? 0.4) * 5;
    const sp = poreR * 2.2;
    for (let x = 0; x < size; x += sp) {
        for (let y = 0; y < size; y += sp) {
            const ox = (rng() - 0.5) * sp * 0.5, oy = (rng() - 0.5) * sp * 0.5;
            const dk = 0.55 + rng() * 0.25;
            ctx.fillStyle = `rgba(${Math.round(r * dk)},${Math.round(g * dk)},${Math.round(b * dk)},0.7)`;
            ctx.beginPath();
            ctx.ellipse(x + ox, y + oy, poreR * 0.7, poreR * 0.45, rng() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const tooled = p['tooled'] ?? 0;
    if (tooled > 0.1) {
        const tLines = Math.round(tooled * 8);
        ctx.strokeStyle = `rgba(${Math.round(r * 0.55)},${Math.round(g * 0.55)},${Math.round(b * 0.55)},0.5)`;
        ctx.lineWidth = 1.2;
        for (let i = 0; i < tLines; i++) {
            ctx.beginPath();
            ctx.moveTo(i * size / tLines, 0);
            ctx.lineTo(0, i * size / tLines);
            ctx.stroke();
        }
    }
    const worn = p['worn'] ?? 0.2;
    if (worn > 0.05) {
        for (let w = 0; w < Math.round(worn * 15); w++) {
            const wx = rng() * size, wy = rng() * size, wr = 4 + rng() * 18;
            ctx.fillStyle = `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 50)},${Math.min(255, b + 30)},0.18)`;
            ctx.beginPath();
            ctx.ellipse(wx, wy, wr, wr * 0.4, rng() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
function _genPainted(ctx, size, color, p, rng) {
    const [r, g, b] = _parseHex(color);
    _fill(ctx, r, g, b, size);
    const strokeSize = 3 + (p['stroke_size'] ?? 0.3) * 15;
    const strokeCount = Math.round(size * size / (strokeSize * strokeSize * 1.5));
    for (let i = 0; i < strokeCount; i++) {
        const sx = rng() * size, sy = rng() * size;
        const sw = strokeSize * (0.5 + rng()), sh = strokeSize * (0.2 + rng() * 0.5);
        const dk = 0.82 + rng() * 0.3;
        ctx.fillStyle = `rgba(${Math.min(255, Math.round(r * dk))},${Math.min(255, Math.round(g * dk))},${Math.min(255, Math.round(b * dk))},0.3)`;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rng() * Math.PI);
        ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
        ctx.restore();
    }
    const worn = p['worn'] ?? 0.1;
    if (worn > 0.05) {
        for (let c = 0; c < Math.round(worn * 20); c++) {
            const cx = rng() * size, cy = rng() * size, cw = 2 + rng() * 12;
            ctx.fillStyle = `rgba(${Math.round(r * 0.4)},${Math.round(g * 0.35)},${Math.round(b * 0.3)},0.6)`;
            ctx.beginPath();
            ctx.ellipse(cx, cy, cw, cw * (0.3 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Build a MeshStandardMaterial with a procedural canvas texture.
 * Output is deterministic — same inputs → same texture every time.
 */
export function buildMaterial(presetId, texParams, colorHex) {
    const rng = _editorRng(_editorSeed(colorHex, texParams));
    const SIZE = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    switch (presetId) {
        case 'wood':
            _genWood(ctx, SIZE, colorHex, texParams, rng);
            break;
        case 'stone':
            _genStone(ctx, SIZE, colorHex, texParams, rng);
            break;
        case 'fabric':
            _genFabric(ctx, SIZE, colorHex, texParams, rng);
            break;
        case 'metal':
            _genMetal(ctx, SIZE, colorHex, texParams, rng);
            break;
        case 'marble':
            _genMarble(ctx, SIZE, colorHex, texParams, rng);
            break;
        case 'leather':
            _genLeather(ctx, SIZE, colorHex, texParams, rng);
            break;
        case 'painted':
            _genPainted(ctx, SIZE, colorHex, texParams, rng);
            break;
        default: {
            const [r, g, b] = _parseHex(colorHex);
            _fill(ctx, r, g, b, SIZE);
            for (let x = 0; x < SIZE; x += 3) {
                for (let y = 0; y < SIZE; y += 3) {
                    const n = (rng() - 0.5) * 10;
                    ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + n))},${Math.max(0, Math.min(255, g + n))},${Math.max(0, Math.min(255, b + n))},0.3)`;
                    ctx.fillRect(x, y, 3, 3);
                }
            }
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(texParams['scale'] ?? 2, texParams['scale'] ?? 2);
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: tex });
    switch (presetId) {
        case 'wood':
            mat.roughness = 0.88 - (texParams['polish'] ?? 0) * 0.55;
            mat.metalness = 0;
            break;
        case 'stone':
            mat.roughness = 0.92;
            mat.metalness = 0;
            break;
        case 'fabric':
            mat.roughness = 0.95;
            mat.metalness = 0;
            break;
        case 'metal':
            mat.roughness = Math.max(0.05, 0.5 - (texParams['polish'] ?? 0.5) * 0.45);
            mat.metalness = 0.75 + (texParams['polish'] ?? 0.5) * 0.2;
            break;
        case 'marble':
            mat.roughness = texParams['roughness'] ?? 0.15;
            mat.metalness = 0;
            break;
        case 'leather':
            mat.roughness = 0.78;
            mat.metalness = 0;
            break;
        case 'painted':
            mat.roughness = texParams['roughness'] ?? 0.65;
            mat.metalness = 0;
            break;
        default:
            mat.roughness = texParams['roughness'] ?? 0.75;
            mat.metalness = texParams['metalness'] ?? 0;
    }
    return mat;
}
/** Build an emissive glow material — not textured so the glow stays clean. */
export function buildEmissiveMaterial(colorHex, intensity = 1.8) {
    const col = new THREE.Color(colorHex);
    return new THREE.MeshStandardMaterial({
        color: col.clone().multiplyScalar(0.3),
        emissive: col,
        emissiveIntensity: intensity,
        roughness: 0.4,
    });
}
