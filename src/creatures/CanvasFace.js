// ── CanvasFace ───────────────────────────────────────────────────────────────
//
//  Procedural anime-style face textures drawn on an offscreen canvas.
//  Applied to a PlaneGeometry face-plate attached to the head bone.
//  All drawing uses the 2D Canvas API — no assets loaded.
//  CC-5: Expanded to 14 face types with eyeShape, browStyle, skinPattern.
import * as THREE from 'three';
const SZ = 128;
export function makeFaceTexture(spec) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SZ;
    _draw(cv, spec);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
}
export function updateFaceTexture(tex, spec) {
    _draw(tex.image, spec);
    tex.needsUpdate = true;
}
function _hex(n) {
    return '#' + n.toString(16).padStart(6, '0');
}
function _draw(cv, spec) {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, SZ, SZ);
    const cx = SZ / 2, cy = SZ / 2;
    const eyeHex = _hex(spec.eyeColor);
    const markHex = spec.markColor ? _hex(spec.markColor) : '#884488';
    // Draw skin pattern overlay first (behind features)
    if (spec.skinPattern && spec.skinPattern !== 'none') {
        _drawSkinPattern(ctx, SZ, SZ, spec.skinPattern, markHex);
    }
    // Draw brows before eyes
    if (spec.browStyle && spec.browStyle !== 'none') {
        _drawBrows(ctx, cx, cy - 20, spec.browStyle, spec.expression);
    }
    switch (spec.faceType) {
        case 'cute':
            _cute(ctx, cx, cy, eyeHex, spec.mouthType, spec.expression, spec.eyeShape);
            break;
        case 'angry':
            _angry(ctx, cx, cy, eyeHex, spec.mouthType, spec.eyeShape);
            break;
        case 'cyclops':
            _cyclops(ctx, cx, cy, eyeHex, spec.mouthType, spec.eyeShape);
            break;
        case 'skull':
            _skull(ctx, cx, cy);
            break;
        case 'compound':
            _compound(ctx, cx, cy, eyeHex);
            break;
        case 'blank': break;
        case 'cherubic':
            _cherubic(ctx, cx, cy, eyeHex, spec.mouthType, spec.expression, spec.eyeShape);
            break;
        case 'gaunt':
            _gaunt(ctx, cx, cy, eyeHex, spec.mouthType, spec.eyeShape);
            break;
        case 'cat':
            _cat(ctx, cx, cy, eyeHex, spec.mouthType, spec.expression, spec.eyeShape);
            break;
        case 'lizard':
            _lizard(ctx, cx, cy, eyeHex, spec.mouthType, spec.eyeShape);
            break;
        case 'bird':
            _bird(ctx, cx, cy, eyeHex);
            break;
        case 'insect':
            _insect(ctx, cx, cy, eyeHex);
            break;
        case 'demon':
            _demon(ctx, cx, cy, eyeHex, spec.mouthType, spec.eyeShape);
            break;
        case 'ancient':
            _ancient(ctx, cx, cy, eyeHex);
            break;
    }
}
// ── Skin Pattern Overlay ─────────────────────────────────────────────────────
function _drawSkinPattern(ctx, w, h, pattern, markHex) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = markHex;
    switch (pattern) {
        case 'stripes':
            for (let i = -10; i < 20; i++) {
                ctx.beginPath();
                ctx.moveTo(i * 12, 0);
                ctx.moveTo(i * 12 + 6, 0);
                ctx.lineTo(i * 12 + h, h);
                ctx.lineTo(i * 12 + h - 6, h);
                ctx.closePath();
                ctx.fill();
            }
            break;
        case 'spots':
            for (let i = 0; i < 15; i++) {
                const sx = ((i * 37) % w);
                const sy = ((i * 53) % h);
                ctx.beginPath();
                ctx.ellipse(sx, sy, 4 + (i % 4), 3 + (i % 3), 0, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case 'scales':
            for (let row = 0; row < h; row += 10) {
                for (let col = 0; col < w; col += 10) {
                    const offset = (row % 20 === 0) ? 0 : 5;
                    ctx.beginPath();
                    ctx.arc(col + offset, row, 5, 0, Math.PI, true);
                    ctx.fill();
                }
            }
            break;
        case 'gradient':
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, markHex);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = markHex;
            ctx.fillRect(0, 0, w, h);
            break;
        case 'cracks':
            ctx.strokeStyle = markHex;
            ctx.lineWidth = 1;
            for (let i = 0; i < 12; i++) {
                let x = (i * 47) % w, y = (i * 31) % h;
                ctx.beginPath();
                ctx.moveTo(x, y);
                for (let j = 0; j < 4; j++) {
                    x += (Math.sin(i + j) * 10);
                    y += (Math.cos(i + j) * 8);
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            break;
        case 'fur':
            for (let i = 0; i < 60; i++) {
                const fx = (i * 17) % w, fy = (i * 23) % h;
                ctx.beginPath();
                ctx.ellipse(fx, fy, 2, 1, (i % 5) * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
    }
    ctx.globalAlpha = 1;
}
// ── Brow Styles ──────────────────────────────────────────────────────────────
function _drawBrows(ctx, cx, cy, style, expr) {
    ctx.strokeStyle = '#2a1000';
    const angery = expr === 'angry' || expr === 'hurt';
    const surprised = expr === 'surprised' || expr === 'scared';
    const yOff = surprised ? -4 : 0;
    switch (style) {
        case 'thin':
            ctx.lineWidth = 1.5;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(cx + s * 12, cy + yOff);
                ctx.lineTo(cx + s * 28, cy + (angery ? s * 4 : -s * 2) + yOff);
                ctx.stroke();
            }
            break;
        case 'thick':
            ctx.lineWidth = 4;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(cx + s * 10, cy + yOff);
                ctx.lineTo(cx + s * 30, cy + (angery ? s * 5 : -s * 3) + yOff);
                ctx.stroke();
            }
            break;
        case 'furrowed':
            ctx.lineWidth = 3;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(cx + s * 12, cy - 4 + yOff);
                ctx.lineTo(cx + s * 20, cy + 2 + yOff);
                ctx.lineTo(cx + s * 28, cy - 2 + yOff);
                ctx.stroke();
            }
            break;
        case 'arched':
            ctx.lineWidth = 2;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(cx + s * 8, cy + 2 + yOff);
                ctx.quadraticCurveTo(cx + s * 20, cy - 8 + yOff, cx + s * 30, cy + yOff);
                ctx.stroke();
            }
            break;
    }
}
// ── Eye shape helpers ────────────────────────────────────────────────────────
function _drawEye(ctx, ex, ey, eyeHex, shape) {
    const isSlit = shape === 'slit';
    const isAlmond = shape === 'almond';
    const isVoid = shape === 'void';
    const isStar = shape === 'star';
    // Eye white
    ctx.fillStyle = '#fffaf0';
    if (isAlmond) {
        ctx.beginPath();
        ctx.ellipse(ex, ey, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    else {
        _rrect(ctx, ex - 10, ey - 10, 20, 20, 6);
        ctx.fill();
    }
    // Iris
    ctx.fillStyle = eyeHex;
    if (isVoid) {
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 9, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        // Void: dark inner ring
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 2, 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (isStar) {
        // Star pupil: 4-point star
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 8, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        _star(ctx, ex, ey + 1, 4, 7, 3, 4);
    }
    else if (isSlit) {
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 7, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 2, 7, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    else {
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 7, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(ex, ey + 2, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // Highlight
    if (!isVoid) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.ellipse(ex - 3, ey - 2, 3, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
    }
}
function _star(ctx, cx, cy, innerR, outerR, points, rotation) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI * i / points) + rotation;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}
// ── Existing face types ──────────────────────────────────────────────────────
function _cute(ctx, cx, cy, eyeHex, mouth, expr, eyeShape) {
    const ey = cy - 8;
    for (const ex of [cx - 22, cx + 22]) {
        _drawEye(ctx, ex, ey, eyeHex, eyeShape);
        if (expr === 'angry') {
            ctx.strokeStyle = '#2a1000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(ex - 10, ey - 14);
            ctx.lineTo(ex + 10, ey - 18);
            ctx.stroke();
        }
        else if (expr === 'scared' || expr === 'surprised') {
            ctx.strokeStyle = '#2a1000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(ex - 10, ey - 18);
            ctx.lineTo(ex + 10, ey - 14);
            ctx.stroke();
        }
    }
    if (expr === 'happy' || expr === 'neutral' || expr === 'casting') {
        ctx.fillStyle = 'rgba(255,140,120,0.28)';
        ctx.beginPath();
        ctx.ellipse(cx - 28, cy + 8, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + 28, cy + 8, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // Casting: glowing eye effect
    if (expr === 'casting') {
        ctx.fillStyle = 'rgba(180,140,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx - 22, cy - 8, 16, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + 22, cy - 8, 16, 14, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    _mouth(ctx, cx, cy + 20, mouth, expr);
}
function _angry(ctx, cx, cy, eyeHex, mouth, eyeShape) {
    const pairs = [[cx - 22, 1], [cx + 22, -1]];
    for (const [ex, side] of pairs) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(ex - 11, cy - 5);
        ctx.lineTo(ex + 11, cy - 12 * side * 0.5 - 5);
        ctx.lineTo(ex + 11, cy + 6);
        ctx.lineTo(ex - 11, cy + 6);
        ctx.closePath();
        ctx.fill();
        if (eyeShape === 'slit') {
            ctx.fillStyle = eyeHex;
            ctx.beginPath();
            ctx.ellipse(ex, cy - 1, 6, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(ex, cy - 1, 2, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        else {
            ctx.fillStyle = eyeHex;
            ctx.beginPath();
            ctx.ellipse(ex, cy - 1, 7, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(ex, cy - 1, 2.5, 7, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = '#200';
        ctx.lineWidth = 4;
        ctx.beginPath();
        if (side > 0) {
            ctx.moveTo(ex - 12, cy - 16);
            ctx.lineTo(ex + 10, cy - 9);
        }
        else {
            ctx.moveTo(ex - 10, cy - 9);
            ctx.lineTo(ex + 12, cy - 16);
        }
        ctx.stroke();
    }
    _mouth(ctx, cx, cy + 20, mouth, 'angry');
}
function _cyclops(ctx, cx, cy, eyeHex, mouth, eyeShape) {
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 8, 26, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    if (eyeShape === 'void') {
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 8, 20, 17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 8, 12, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 8, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    else {
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 8, 19, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 8, 10, 12, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.ellipse(cx - 6, cy - 14, 5, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    _mouth(ctx, cx, cy + 24, mouth, 'neutral');
}
function _skull(ctx, cx, cy) {
    for (const ex of [cx - 20, cx + 20]) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.beginPath();
        ctx.ellipse(ex, cy - 6, 14, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(60,0,80,0.5)';
        ctx.beginPath();
        ctx.ellipse(ex - 3, cy - 9, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 8);
    ctx.lineTo(cx + 6, cy + 8);
    ctx.lineTo(cx, cy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fffef0';
    for (let i = 0; i < 5; i++)
        ctx.fillRect(cx - 18 + i * 8, cy + 18, 7, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - 19, cy + 17, 38, 2);
}
function _compound(ctx, cx, cy, eyeHex) {
    for (const [ex, ey] of [[cx - 24, cy - 10], [cx + 24, cy - 10]]) {
        const n = 6, r = 18;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const px = ex - r + (i / (n - 1)) * r * 2;
                const py = ey - r * 0.6 + (j / (n - 1)) * r * 1.2;
                ctx.fillStyle = eyeHex;
                ctx.globalAlpha = 0.6 + (i + j) / (n * 2 - 2) * 0.4;
                ctx.beginPath();
                ctx.ellipse(px, py, 3.5, 3.5, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#40200a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy + 26);
    ctx.lineTo(cx - 20, cy + 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy + 26);
    ctx.lineTo(cx + 20, cy + 38);
    ctx.stroke();
}
// ── CC-5: New face types ─────────────────────────────────────────────────────
function _cherubic(ctx, cx, cy, eyeHex, mouth, expr, eyeShape) {
    // Chubby cheeks, large round eyes, button nose
    const ey = cy - 6;
    for (const ex of [cx - 24, cx + 24]) {
        // Larger eyes
        ctx.fillStyle = '#fffaf0';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 14, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(ex, ey + 2, 9, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(ex, ey + 3, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.ellipse(ex - 3, ey - 2, 4, 5, -0.3, 0, Math.PI * 2);
        ctx.fill();
        if (eyeShape === 'star') {
            ctx.fillStyle = '#fff';
            _star(ctx, ex, ey + 2, 2, 5, 4, 0.5);
        }
    }
    // Chubby cheeks
    ctx.fillStyle = 'rgba(255,120,120,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - 30, cy + 10, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 30, cy + 10, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Button nose
    ctx.fillStyle = '#d4a088';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    _mouth(ctx, cx, cy + 20, mouth, expr);
}
function _gaunt(ctx, cx, cy, eyeHex, mouth, eyeShape) {
    // Sunken eyes, sharp cheekbones, hollow cheeks
    const ey = cy - 4;
    for (const ex of [cx - 20, cx + 20]) {
        // Sunken: dark ring around eye
        ctx.fillStyle = 'rgba(40,20,30,0.4)';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 14, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fffaf0';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 10, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        if (eyeShape === 'void') {
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(ex, ey, 7, 7, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        else {
            ctx.fillStyle = eyeHex;
            ctx.beginPath();
            ctx.ellipse(ex, ey, 6, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(ex, ey, 3, 5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(ex - 2, ey - 2, 2, 3, -0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    // Hollow cheeks (dark shadows)
    ctx.fillStyle = 'rgba(30,15,20,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx - 26, cy + 8, 12, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 26, cy + 8, 12, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Sharp cheekbone lines
    ctx.strokeStyle = 'rgba(60,30,40,0.3)';
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 14, cy - 2);
        ctx.lineTo(cx + s * 30, cy + 12);
        ctx.stroke();
    }
    _mouth(ctx, cx, cy + 20, mouth, 'neutral');
}
function _cat(ctx, cx, cy, eyeHex, mouth, expr, _eyeShape) {
    // Slit pupils, small nose, whisker lines
    const ey = cy - 8;
    for (const ex of [cx - 22, cx + 22]) {
        // Almond-shaped eye
        ctx.fillStyle = '#fffaf0';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 12, 9, (ex < cx ? -0.2 : 0.2), 0, Math.PI * 2);
        ctx.fill();
        // Slit pupil (default for cat)
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 8, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(ex, ey + 1, 2, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.ellipse(ex - 2, ey - 2, 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // Small triangular nose
    ctx.fillStyle = '#e09090';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.lineTo(cx, cy + 8);
    ctx.closePath();
    ctx.fill();
    // Whisker lines
    ctx.strokeStyle = '#2a1000';
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
        for (const dy of [-2, 0, 2]) {
            ctx.beginPath();
            ctx.moveTo(cx + s * 10, cy + 6 + dy);
            ctx.lineTo(cx + s * 32, cy + 4 + dy * 2);
            ctx.stroke();
        }
    }
    _mouth(ctx, cx, cy + 18, mouth, expr);
}
function _lizard(ctx, cx, cy, eyeHex, mouth, _eyeShape) {
    // No visible nose, slit pupils, scale texture hint
    const ey = cy - 6;
    for (const ex of [cx - 22, cx + 22]) {
        ctx.fillStyle = '#e8e0c0';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 11, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(ex, ey, 8, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Slit pupil
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 1.5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // No highlight — reptilian matte eye
    }
    // Scale hint lines around eyes
    ctx.strokeStyle = 'rgba(80,60,20,0.2)';
    ctx.lineWidth = 1;
    for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(cx + s * 28, cy - 4 + i * 6, 5, 0, Math.PI, false);
            ctx.stroke();
        }
    }
    _mouth(ctx, cx, cy + 20, mouth, 'neutral');
}
function _bird(ctx, cx, cy, eyeHex) {
    // Beak always shown, tiny pupil dots
    const ey = cy - 8;
    for (const ex of [cx - 18, cx + 18]) {
        ctx.fillStyle = '#fffaf0';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 7, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(ex, ey, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 2, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.ellipse(ex - 1, ey - 2, 1.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // Beak
    ctx.fillStyle = '#e0a030';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 2);
    ctx.lineTo(cx + 6, cy + 2);
    ctx.lineTo(cx, cy + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#a07020';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 2);
    ctx.lineTo(cx, cy + 14);
    ctx.stroke();
}
function _insect(ctx, cx, cy, eyeHex) {
    // Multi-facet compound eyes fill most of face
    for (const [ex, ey] of [[cx - 26, cy - 6], [cx + 26, cy - 6]]) {
        const n = 7, r = 22;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const px = ex - r + (i / (n - 1)) * r * 2;
                const py = ey - r * 0.7 + (j / (n - 1)) * r * 1.4;
                ctx.fillStyle = eyeHex;
                ctx.globalAlpha = 0.5 + (i + j) / (n * 2 - 2) * 0.5;
                ctx.beginPath();
                ctx.ellipse(px, py, 4, 4, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        // Outline
        ctx.strokeStyle = '#201008';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(ex, ey, r + 1, r * 0.72 + 1, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    // Mandibles
    ctx.strokeStyle = '#40200a';
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 8, cy + 22);
        ctx.quadraticCurveTo(cx + s * 18, cy + 32, cx + s * 14, cy + 40);
        ctx.stroke();
    }
}
function _demon(ctx, cx, cy, eyeHex, mouth, _eyeShape) {
    // Inverted triangle eyes, heavy brow ridge, goat slit
    const ey = cy - 6;
    for (const ex of [cx - 20, cx + 20]) {
        // Inverted triangle eye shape
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.moveTo(ex, ey + 8);
        ctx.lineTo(ex - 10, ey - 6);
        ctx.lineTo(ex + 10, ey - 6);
        ctx.closePath();
        ctx.fill();
        // Slit pupil
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Glow
        ctx.fillStyle = 'rgba(255,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 14, 12, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // Heavy brow ridge
    ctx.strokeStyle = '#300';
    ctx.lineWidth = 5;
    for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 8, cy - 18);
        ctx.lineTo(cx + s * 30, cy - 12);
        ctx.stroke();
    }
    _mouth(ctx, cx, cy + 20, mouth, 'angry');
}
function _ancient(ctx, cx, cy, eyeHex) {
    // Many small eyes arranged in arc, no mouth
    const eyePositions = [];
    const arcR = 28;
    const count = 7;
    for (let i = 0; i < count; i++) {
        const angle = -Math.PI * 0.7 + (i / (count - 1)) * Math.PI * 1.4;
        const ex = cx + Math.cos(angle + Math.PI / 2) * arcR;
        const ey = cy - 4 + Math.sin(angle + Math.PI / 2) * arcR * 0.6;
        eyePositions.push([ex, ey]);
    }
    for (const [ex, ey] of eyePositions) {
        ctx.fillStyle = '#e8e0c0';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeHex;
        ctx.beginPath();
        ctx.ellipse(ex, ey, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(ex - 1, ey - 1, 1.5, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // Mystical glow
    ctx.fillStyle = 'rgba(100,60,180,0.08)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // No mouth for ancient
}
// ── Shared helpers ────────────────────────────────────────────────────────────
function _rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
function _mouth(ctx, cx, cy, mouth, expr) {
    ctx.strokeStyle = '#2a1000';
    ctx.fillStyle = '#c04040';
    ctx.lineWidth = 3;
    switch (mouth) {
        case 'smile': {
            const arc = expr === 'angry' || expr === 'hurt' ? -0.4 : expr === 'surprised' ? 0.0 : 0.4;
            if (expr === 'surprised' || expr === 'scared') {
                // O-shaped mouth
                ctx.beginPath();
                ctx.ellipse(cx, cy + 2, 7, 8, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            else {
                ctx.beginPath();
                ctx.arc(cx, cy - arc * 10, 12, arc > 0 ? 0.1 : Math.PI + 0.1, arc > 0 ? Math.PI - 0.1 : -0.1);
                ctx.stroke();
            }
            break;
        }
        case 'frown': {
            ctx.beginPath();
            ctx.arc(cx, cy + 10, 10, Math.PI + 0.2, -0.2);
            ctx.stroke();
            break;
        }
        case 'beak': {
            ctx.fillStyle = '#e0a030';
            ctx.beginPath();
            ctx.moveTo(cx - 8, cy - 3);
            ctx.lineTo(cx + 8, cy - 3);
            ctx.lineTo(cx, cy + 8);
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 'fangs': {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(cx - 12, cy);
            ctx.lineTo(cx + 12, cy);
            ctx.lineTo(cx + 12, cy + 6);
            ctx.lineTo(cx - 12, cy + 6);
            ctx.closePath();
            ctx.fill();
            for (const fx of [cx - 8, cx + 2]) {
                ctx.beginPath();
                ctx.moveTo(fx, cy + 6);
                ctx.lineTo(fx + 3, cy + 14);
                ctx.lineTo(fx + 6, cy + 6);
                ctx.closePath();
                ctx.fill();
            }
            ctx.strokeStyle = '#cc2a00';
            ctx.lineWidth = 2;
            ctx.strokeRect(cx - 12, cy, 24, 6);
            break;
        }
    }
}
