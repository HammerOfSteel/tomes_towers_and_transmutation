/**
 * ProceduralProps — Phase 7.5b
 *
 * Factory functions that return `THREE.Group` objects for in-world props.
 * Each prop is assembled from standard Three.js geometries (no CSG needed).
 *
 * All geometry is cached via GeometryCache where shared between instances;
 * material references are passed in so the caller controls appearance.
 *
 * Available builders:
 *   buildCauldron(mat, glowMat)          — Lathe-profile bowl, torus rim, 3 legs, liquid
 *   buildGoblet(mat)                     — Lathe goblet/chalice silhouette
 *   buildArch(mat, width?, ht?)          — Two box piers + half-torus arch span
 *   buildBookStack(mat)                  — Thin layered quads with ragged height
 *   buildLantern(mat, coreMat)           — Cage box + inner light core sphere
 *   buildPotionRack(frameMat, glowMat)         — Wall rack of 8 bottles; alchemy lab
 *   buildDistillationCoil(copperMat, glassMat) — Copper coil + flask; alchemy lab
 *   buildReadingTable(mat)                     — Wide table + open book; library
 *   buildGlobe(mat)                            — Sphere on stand; library
 *   buildFermentingVat(mat, glassMat)          — Oversized barrel with glass dome; brewing
 *   buildHerbBundle(mat)                       — Hanging bundle of dried herbs; brewing
 *   buildAnvil(mat)                            — Runic anvil with horn; forge
 *   buildCoolingTrough(mat)                    — Water-filled iron trough; forge
 *   buildBunk(mat, fabricMat)                  — Two-tier bunk bed; barracks
 *   buildMessTable(mat)                        — Long communal mess table; barracks
 *   buildMapTable(mat)                         — Broad campaign map table; war room
 *   buildWeaponStand(mat)                      — Crossed weapons rack; war room
 *   buildPlantPot(mat)                         — Terracotta pot with plant stem; botanical
 *   buildRaisedPlanter(mat)                    — Raised stone planting bed; botanical
 *   buildContainmentRing(mat)                  — Glowing ward circle; archive
 *   buildAstrolabe(mat)                        — Rotating brass orrery; observatory
 */
import * as THREE from 'three';
import { GeometryCache } from '@/rendering/GeometryCache';
// ── Helpers ───────────────────────────────────────────────────────────────────
/** Convenience: create a mesh, set castShadow, add to group, return mesh. */
function mesh(geo, mat, grp) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    grp.add(m);
    return m;
}
// ── Cauldron ──────────────────────────────────────────────────────────────────
/**
 * A proper cauldron built from a lathe-profile bowl, torus rim, and 3 legs.
 *
 *       ___________   ← torus rim
 *      /   liquid  \  ← circle face (glowMat)
 *     | bowl (lathe)|
 *      \___________/
 *       | |    | |    ← 3 legs (cylinder)
 *
 * Origin is at the base of the legs (floor level).
 */
export function buildCauldron(ironMat, glowMat) {
    const grp = new THREE.Group();
    // Bowl — lathe profile curve (outer silhouette, half-section)
    const bowlGeo = GeometryCache.get('prop_cauldron_bowl', () => {
        const profile = [];
        // Profile points: bottom-center → outer bottom → side → rim
        profile.push(new THREE.Vector2(0.00, 0.00)); // center base
        profile.push(new THREE.Vector2(0.35, 0.05)); // outer base corner
        profile.push(new THREE.Vector2(0.90, 0.30)); // lower belly
        profile.push(new THREE.Vector2(1.05, 0.65)); // mid belly (widest)
        profile.push(new THREE.Vector2(1.00, 1.00)); // upper bowl
        profile.push(new THREE.Vector2(1.05, 1.10)); // slight flare to rim
        return new THREE.LatheGeometry(profile, 16);
    });
    const bowl = mesh(bowlGeo, ironMat, grp);
    bowl.position.y = 0.3; // legs lift bowl off floor
    // Rim ring
    const rimGeo = GeometryCache.get('prop_cauldron_rim', () => new THREE.TorusGeometry(1.05, 0.07, 8, 20));
    const rimMesh = mesh(rimGeo, ironMat, grp);
    rimMesh.position.y = 1.40;
    rimMesh.rotation.x = Math.PI / 2;
    // Glowing liquid surface
    const liquidGeo = GeometryCache.get('prop_cauldron_liquid', () => {
        const g = new THREE.CircleGeometry(0.90, 16);
        g.rotateX(-Math.PI / 2);
        return g;
    });
    const liquidMesh = new THREE.Mesh(liquidGeo, glowMat);
    liquidMesh.position.y = 1.41;
    grp.add(liquidMesh);
    // Three legs
    const legGeo = GeometryCache.get('prop_cauldron_leg', () => new THREE.CylinderGeometry(0.07, 0.09, 0.35, 6));
    for (let li = 0; li < 3; li++) {
        const angle = (li / 3) * Math.PI * 2;
        const leg = mesh(legGeo, ironMat, grp);
        leg.position.set(Math.cos(angle) * 0.80, 0.175, Math.sin(angle) * 0.80);
    }
    return grp;
}
// ── Goblet / Chalice ──────────────────────────────────────────────────────────
/**
 * A decorative goblet built from a lathe profile.
 * Scaled to about 0.4 WU tall — suitable for a desk/altar prop.
 */
export function buildGoblet(mat) {
    const grp = new THREE.Group();
    const gobletGeo = GeometryCache.get('prop_goblet', () => {
        const pts = [
            new THREE.Vector2(0.00, 0.00), // foot center
            new THREE.Vector2(0.22, 0.01), // foot edge
            new THREE.Vector2(0.20, 0.04), // foot top
            new THREE.Vector2(0.08, 0.10), // stem narrow
            new THREE.Vector2(0.07, 0.24), // stem top
            new THREE.Vector2(0.15, 0.27), // cup base
            new THREE.Vector2(0.28, 0.30), // cup lower bowl
            new THREE.Vector2(0.33, 0.37), // cup widest
            new THREE.Vector2(0.30, 0.40), // cup rim
        ];
        return new THREE.LatheGeometry(pts, 12);
    });
    mesh(gobletGeo, mat, grp);
    return grp;
}
// ── Arch ─────────────────────────────────────────────────────────────────────
/**
 * A doorway arch: two rectangular stone piers + a half-torus arch span.
 *
 * @param mat      Stone material.
 * @param width    Inner opening width in WU (default 2.0).
 * @param height   Total arch height in WU (default 3.5).
 */
export function buildArch(mat, width = 2.0, height = 3.5) {
    const grp = new THREE.Group();
    const pierW = 0.5;
    const pierH = height - width / 2; // pier height below the arch curve
    const archR = width / 2 + pierW / 2;
    // Left pier
    const pierGeo = GeometryCache.get(`prop_arch_pier_${pierW.toFixed(2)}x${pierH.toFixed(2)}`, () => new THREE.BoxGeometry(pierW, pierH, pierW));
    const leftPier = mesh(pierGeo, mat, grp);
    leftPier.position.set(-(width / 2 + pierW / 2), pierH / 2, 0);
    // Right pier
    const rightPier = mesh(pierGeo, mat, grp);
    rightPier.position.set(width / 2 + pierW / 2, pierH / 2, 0);
    // Half-torus arch span (top 180°)
    const spanGeo = GeometryCache.get(`prop_arch_span_r${archR.toFixed(2)}`, () => new THREE.TorusGeometry(archR, pierW / 2, 8, 16, Math.PI));
    const span = mesh(spanGeo, mat, grp);
    span.position.y = pierH;
    span.rotation.z = Math.PI; // open side faces down
    return grp;
}
// ── Book stack ────────────────────────────────────────────────────────────────
/**
 * A small stack of 3–5 slightly offset books on a surface.
 * Height ≈ 0.45 WU.
 */
export function buildBookStack(mat) {
    const grp = new THREE.Group();
    const BOOKS = [
        { w: 0.55, h: 0.12, d: 0.40, y: 0.06, rx: 0, rz: 0 },
        { w: 0.50, h: 0.10, d: 0.36, y: 0.17, rx: 0, rz: 0.05 },
        { w: 0.48, h: 0.10, d: 0.38, y: 0.27, rx: 0.03, rz: -0.04 },
        { w: 0.52, h: 0.10, d: 0.42, y: 0.37, rx: 0, rz: 0.08 },
    ];
    for (const b of BOOKS) {
        const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
        const m = new THREE.Mesh(geo, mat);
        m.position.y = b.y;
        m.rotation.x = b.rx;
        m.rotation.z = b.rz;
        m.castShadow = true;
        grp.add(m);
    }
    return grp;
}
// ── Lantern ───────────────────────────────────────────────────────────────────
/**
 * A hanging lantern cage with a glowing inner sphere.
 * Scaled to ≈ 0.5 WU tall.
 */
export function buildLantern(cageMat, coreMat) {
    const grp = new THREE.Group();
    const cageGeo = GeometryCache.get('prop_lantern_cage', () => new THREE.BoxGeometry(0.25, 0.35, 0.25));
    mesh(cageGeo, cageMat, grp);
    const flameGeo = GeometryCache.get('prop_lantern_flame', () => new THREE.SphereGeometry(0.08, 6, 6));
    const flame = new THREE.Mesh(flameGeo, coreMat);
    flame.position.y = 0.02;
    grp.add(flame);
    const hookGeo = GeometryCache.get('prop_lantern_hook', () => new THREE.CylinderGeometry(0.015, 0.015, 0.18, 4));
    const hook = mesh(hookGeo, cageMat, grp);
    hook.position.y = 0.265;
    return grp;
}
// ── Bed ───────────────────────────────────────────────────────────────────────
/**
 * A simple bed: headboard + foot board + frame + mattress + pillow.
 * Total footprint ≈ 1.2 × 2.2 WU. Lies flat on Y = 0.
 *
 * @param frameMat    Wood / metal frame material.
 * @param mattressMat Fabric mattress material.
 */
export function buildBed(frameMat, mattressMat) {
    const grp = new THREE.Group();
    // Frame rails — two long side beams
    const railGeo = new THREE.BoxGeometry(0.08, 0.12, 2.0);
    for (const sx of [-0.56, 0.56]) {
        const rail = mesh(railGeo, frameMat, grp);
        rail.position.set(sx, 0.24, 0);
    }
    // Headboard (tall, at -Z end)
    const headGeo = new THREE.BoxGeometry(1.2, 0.7, 0.1);
    const head = mesh(headGeo, frameMat, grp);
    head.position.set(0, 0.45, -1.0);
    // Foot board (shorter, at +Z end)
    const footGeo = new THREE.BoxGeometry(1.2, 0.35, 0.1);
    const foot = mesh(footGeo, frameMat, grp);
    foot.position.set(0, 0.27, 1.0);
    // Four legs
    const legGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.28, 6);
    for (const [lx, lz] of [[-0.52, -0.95], [0.52, -0.95], [-0.52, 0.95], [0.52, 0.95]]) {
        const leg = mesh(legGeo, frameMat, grp);
        leg.position.set(lx, 0.14, lz);
    }
    // Mattress
    const mattGeo = new THREE.BoxGeometry(1.0, 0.14, 1.85);
    const matt = mesh(mattGeo, mattressMat, grp);
    matt.position.set(0, 0.37, 0);
    // Pillow
    const pillGeo = new THREE.BoxGeometry(0.42, 0.07, 0.30);
    const pill = mesh(pillGeo, mattressMat, grp);
    pill.position.set(0, 0.47, -0.72);
    return grp;
}
// ── Table ─────────────────────────────────────────────────────────────────────
/**
 * A configurable rectangular table: tabletop + four legs.
 *
 * @param mat    Wood material.
 * @param w      Width (X) in WU, default 1.4.
 * @param d      Depth (Z) in WU, default 0.8.
 * @param h      Height in WU, default 0.78.
 */
export function buildTable(mat, w = 1.4, d = 0.8, h = 0.78) {
    const grp = new THREE.Group();
    // Tabletop
    const topGeo = new THREE.BoxGeometry(w, 0.06, d);
    const top = mesh(topGeo, mat, grp);
    top.position.y = h - 0.03;
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, h - 0.06, 6);
    const lx = w / 2 - 0.08;
    const lz = d / 2 - 0.08;
    for (const [px, pz] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) {
        const leg = mesh(legGeo, mat, grp);
        leg.position.set(px, (h - 0.06) / 2, pz);
    }
    return grp;
}
// ── Chair ─────────────────────────────────────────────────────────────────────
/**
 * A basic chair: seat, backrest (2 slats), four legs.
 * Total height ≈ 1.0 WU.
 */
export function buildChair(mat) {
    const grp = new THREE.Group();
    const SEAT_H = 0.46;
    // Seat
    const seatGeo = new THREE.BoxGeometry(0.44, 0.055, 0.44);
    const seat = mesh(seatGeo, mat, grp);
    seat.position.y = SEAT_H;
    // Four legs
    const legGeo = new THREE.CylinderGeometry(0.025, 0.025, SEAT_H, 6);
    for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
        const leg = mesh(legGeo, mat, grp);
        leg.position.set(lx, SEAT_H / 2, lz);
    }
    // Back posts (2 tall legs at back)
    const postGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.52, 6);
    for (const lx of [-0.18, 0.18]) {
        const post = mesh(postGeo, mat, grp);
        post.position.set(lx, SEAT_H + 0.28, -0.18);
    }
    // Back slats
    for (const sy of [0.18, 0.38]) {
        const slat = mesh(new THREE.BoxGeometry(0.34, 0.055, 0.04), mat, grp);
        slat.position.set(0, SEAT_H + sy, -0.18);
    }
    return grp;
}
// ── Wardrobe ──────────────────────────────────────────────────────────────────
/**
 * A tall wardrobe / armoire: body + two doors + cornice + feet.
 * Footprint ≈ 1.1 × 0.55 WU; total height ≈ 2.3 WU.
 */
export function buildWardrobe(mat) {
    const grp = new THREE.Group();
    // Main body
    const bodyGeo = new THREE.BoxGeometry(1.1, 2.1, 0.55);
    const body = mesh(bodyGeo, mat, grp);
    body.position.y = 1.1;
    // Cornice / top moulding
    const corniceGeo = new THREE.BoxGeometry(1.15, 0.1, 0.58);
    const cornice = mesh(corniceGeo, mat, grp);
    cornice.position.y = 2.20;
    // Two door panels (decorative inset lines)
    for (const dx of [-0.28, 0.28]) {
        const doorGeo = new THREE.BoxGeometry(0.42, 1.65, 0.02);
        const door = mesh(doorGeo, mat, grp);
        door.position.set(dx, 1.1, 0.275);
        // Door handle
        const knobGeo = new THREE.SphereGeometry(0.028, 5, 5);
        const knob = mesh(knobGeo, mat, grp);
        knob.position.set(dx + (dx < 0 ? 0.14 : -0.14), 1.1, 0.30);
    }
    // Small feet
    const footGeo = new THREE.BoxGeometry(0.12, 0.1, 0.12);
    for (const [fx, fz] of [[-0.48, -0.22], [0.48, -0.22], [-0.48, 0.22], [0.48, 0.22]]) {
        const foot = mesh(footGeo, mat, grp);
        foot.position.set(fx, 0.05, fz);
    }
    return grp;
}
// ── Campfire ──────────────────────────────────────────────────────────────────
/**
 * A campfire: stone ring, crossed log stack, and animated-look ember glow.
 *
 * @param stoneMat   Rock/stone material for the ring.
 * @param woodMat    Log material.
 * @param emberMat   Emissive / glow material for the flame core.
 */
export function buildCampfire(stoneMat, woodMat, emberMat) {
    const grp = new THREE.Group();
    // Stone ring — 8 stones arranged in a circle
    const stoneGeo = new THREE.SphereGeometry(0.14, 5, 4);
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const stone = mesh(stoneGeo, stoneMat, grp);
        stone.position.set(Math.cos(a) * 0.4, 0.07, Math.sin(a) * 0.4);
        stone.scale.set(1, 0.6, 1);
    }
    // Two crossed logs
    const logGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.88, 7);
    for (const ry of [0.5, -0.5]) {
        const log = mesh(logGeo, woodMat, grp);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = ry;
        log.position.y = 0.065;
    }
    // Ember core sphere (glowing)
    const emberGeo = GeometryCache.get('prop_campfire_ember', () => new THREE.SphereGeometry(0.14, 7, 7));
    const ember = new THREE.Mesh(emberGeo, emberMat);
    ember.position.y = 0.14;
    grp.add(ember);
    // Flame cone on top
    const flameGeo = GeometryCache.get('prop_campfire_flame', () => new THREE.ConeGeometry(0.12, 0.42, 7));
    const flame = new THREE.Mesh(flameGeo, emberMat);
    flame.position.y = 0.42;
    grp.add(flame);
    return grp;
}
// ── Telescope ─────────────────────────────────────────────────────────────────
/**
 * A floor-standing brass telescope on a tripod.
 * Total height ≈ 1.6 WU. The barrel points upward at 45°.
 */
export function buildTelescope(mat) {
    const grp = new THREE.Group();
    // Three tripod legs
    const legGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.0, 5);
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = mesh(legGeo, mat, grp);
        leg.position.set(Math.cos(a) * 0.28, 0.5, Math.sin(a) * 0.28);
        leg.rotation.z = 0.22 * Math.cos(a + Math.PI / 2);
        leg.rotation.x = -0.22 * Math.sin(a + Math.PI / 2);
    }
    // Central pivot mount
    const pivotGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.14, 8);
    const pivot = mesh(pivotGeo, mat, grp);
    pivot.position.y = 1.0;
    // Telescope tube (tilted 45°)
    const tubeGeo = new THREE.CylinderGeometry(0.06, 0.075, 0.9, 10);
    const tube = mesh(tubeGeo, mat, grp);
    tube.position.set(0.22, 1.22, 0);
    tube.rotation.z = -Math.PI / 4;
    // Eyepiece end cap
    const eyeGeo = new THREE.CylinderGeometry(0.058, 0.055, 0.07, 8);
    const eye = mesh(eyeGeo, mat, grp);
    eye.position.set(-0.18, 1.58, 0);
    eye.rotation.z = -Math.PI / 4;
    return grp;
}
/**
 * A wall shelf: horizontal boards supported by brackets.
 * Designed to be placed against a wall (back is flat on Z− face).
 *
 * @param w     Width (X) in WU, default 1.2.
 * @param d     Depth (Z) in WU, default 0.28.
 */
export function buildShelf(mat, w = 1.2, d = 0.28, opts = {}) {
    const grp = new THREE.Group();
    const count = Math.max(1, opts.shelfCount ?? 2);
    const bStyle = opts.bracketStyle ?? 1;
    const BOARD_H = 0.045;
    const SHELF_GAP = 0.42;
    const WALL_MOUNT = 0.35; // height of first shelf off ground
    for (let i = 0; i < count; i++) {
        const y = WALL_MOUNT + i * SHELF_GAP;
        // Shelf board
        const boardGeo = new THREE.BoxGeometry(w, BOARD_H, d);
        const board = mesh(boardGeo, mat, grp);
        board.position.set(0, y, 0);
        // Brackets
        for (const sx of [-(w / 2 - 0.08), w / 2 - 0.08]) {
            if (bStyle === 0) {
                // Flat rectangular slab bracket
                const bGeo = new THREE.BoxGeometry(0.06, y - 0.04, d * 0.6);
                const b = mesh(bGeo, mat, grp);
                b.position.set(sx, (y - 0.04) / 2, -d * 0.1);
            }
            else if (bStyle === 1) {
                // Diagonal brace
                const bGeo = new THREE.BoxGeometry(0.05, 0.05, d * 0.8);
                const b = mesh(bGeo, mat, grp);
                b.position.set(sx, y - d * 0.35, -d * 0.08);
                b.rotation.x = Math.PI / 6;
            }
            else {
                // Curved bracket (L-shape approximation with two boxes)
                const v = mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), mat, grp);
                v.position.set(sx, y - 0.13, -d * 0.65);
                const h = mesh(new THREE.BoxGeometry(0.05, 0.05, d * 0.7), mat, grp);
                h.position.set(sx, y - 0.06, -d * 0.3);
                // Diagonal connector
                const dGeo = new THREE.BoxGeometry(0.05, 0.05, 0.3);
                const diag = mesh(dGeo, mat, grp);
                diag.position.set(sx, y - 0.1, -d * 0.5);
                diag.rotation.x = Math.PI / 5;
            }
        }
    }
    return grp;
}
/**
 * An architectural column / pillar.
 *
 * @param mat     Stone/wood material.
 * @param height  Total shaft height in WU, default 3.0.
 * @param r       Shaft radius, default 0.18.
 */
export function buildPillar(mat, height = 3.0, r = 0.18, opts = {}) {
    const grp = new THREE.Group();
    const style = opts.style ?? 0;
    const capH = opts.capitalH ?? 0.25;
    const pedH = opts.baseH ?? 0.15;
    const entasis = opts.entasis ?? 0.06;
    const SHAFT_H = height - capH - pedH;
    const yBase = pedH;
    // Pedestal base
    if (pedH > 0) {
        const pedR = r * 1.55;
        const pGeo = style === 2
            ? new THREE.BoxGeometry(pedR * 2, pedH, pedR * 2)
            : new THREE.CylinderGeometry(pedR, pedR * 1.12, pedH, style === 1 ? 8 : 24);
        const ped = mesh(pGeo, mat, grp);
        ped.position.y = pedH / 2;
    }
    // Shaft — slight entasis (wider at 1/3 height)
    const topR = r;
    const midR = r * (1 + entasis);
    const botR = r * 1.06;
    const segs = style === 1 ? 8 : (style === 2 ? 4 : 22);
    // CylinderGeometry with top/bottom radius but entasis requires a custom lathe
    if (entasis > 0.01 && style !== 2) {
        const pts = [];
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const bulge = Math.sin(t * Math.PI) * entasis;
            pts.push(new THREE.Vector2((botR + (topR - botR) * t + bulge * r), SHAFT_H * t));
        }
        const shaftGeo = new THREE.LatheGeometry(pts, segs);
        const shaft = mesh(shaftGeo, mat, grp);
        shaft.position.y = yBase;
        void midR; // suppressed
    }
    else {
        const shaftGeo = new THREE.CylinderGeometry(topR, botR, SHAFT_H, segs);
        const shaft = mesh(shaftGeo, mat, grp);
        shaft.position.y = yBase + SHAFT_H / 2;
    }
    // Capital
    if (capH > 0) {
        const topY = yBase + SHAFT_H;
        const capR = r * 1.6;
        const cGeo = style === 2
            ? new THREE.BoxGeometry(capR * 2, capH, capR * 2)
            : new THREE.CylinderGeometry(capR, r, capH, style === 1 ? 8 : 22);
        const cap = mesh(cGeo, mat, grp);
        cap.position.y = topY + capH / 2;
        // Abacus slab on top
        const abGeo = new THREE.BoxGeometry(capR * 2.1, capH * 0.35, capR * 2.1);
        const ab = mesh(abGeo, mat, grp);
        ab.position.y = topY + capH + capH * 0.175;
    }
    return grp;
}
/**
 * A ritual altar: stepped platform with optional top element.
 *
 * @param stoneMat  Base stone material.
 * @param glowMat   Emissive material for the crystal/fire element.
 * @param w         Width (X), default 1.2.
 * @param d         Depth (Z), default 0.7.
 * @param h         Total height to top of platform, default 1.0.
 */
export function buildAltar(stoneMat, glowMat, w = 1.2, d = 0.7, h = 1.0, opts = {}) {
    const grp = new THREE.Group();
    const tiers = Math.max(1, Math.min(3, opts.tiers ?? 2));
    const top = opts.topElement ?? 1;
    for (let t = 0; t < tiers; t++) {
        const scale = 1 - t * 0.18;
        const tw = w * scale;
        const td = d * scale;
        const th = h / tiers * 0.85;
        const y = t * (h / tiers);
        const tGeo = new THREE.BoxGeometry(tw, th, td);
        const tier = mesh(tGeo, stoneMat, grp);
        tier.position.y = y + th / 2;
    }
    // Top element
    const tableTopY = h + 0.01;
    if (top === 1) {
        // Crystal shard cluster (3 pointed prisms)
        for (const [ix, iz, ht, rot] of [
            [0, 0, 0.38, 0], [0.12, 0.05, 0.26, 0.5], [-0.1, -0.04, 0.22, -0.3],
        ]) {
            const cGeo = new THREE.ConeGeometry(0.055, ht, 6);
            const c = new THREE.Mesh(cGeo, glowMat);
            c.position.set(ix, tableTopY + ht / 2, iz);
            c.rotation.z = rot * 0.3;
            c.castShadow = true;
            grp.add(c);
        }
    }
    else if (top === 2) {
        // Carved hollow basin (bowl-like torus)
        const basinGeo = new THREE.TorusGeometry(0.22, 0.065, 8, 18);
        const basin = mesh(basinGeo, stoneMat, grp);
        basin.rotation.x = Math.PI / 2;
        basin.position.y = tableTopY + 0.065;
        // Glowing liquid inside
        const liqGeo = new THREE.CircleGeometry(0.16, 16);
        liqGeo.rotateX(-Math.PI / 2);
        const liq = new THREE.Mesh(liqGeo, glowMat);
        liq.position.y = tableTopY + 0.07;
        grp.add(liq);
    }
    return grp;
}
// ── Rug ───────────────────────────────────────────────────────────────────────
/**
 * A flat decorative rug with a procedurally-drawn canvas pattern.
 *
 * @param color1  Primary color (#rrggbb).
 * @param color2  Secondary / border color.
 * @param w       Width (X), default 2.0.
 * @param d       Depth (Z), default 1.4.
 * @param pattern 0=plain, 1=striped, 2=bordered, 3=geometric, 4=ornate (default 2).
 */
export function buildRug(color1, color2, w = 2.0, d = 1.4, pattern = 2) {
    const grp = new THREE.Group();
    // Generate canvas texture
    const SIZE = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const c1 = color1.replace('#', '');
    const c2 = color2.replace('#', '');
    const r1 = parseInt(c1.slice(0, 2), 16), g1 = parseInt(c1.slice(2, 4), 16), b1 = parseInt(c1.slice(4, 6), 16);
    const r2 = parseInt(c2.slice(0, 2), 16), g2 = parseInt(c2.slice(2, 4), 16), b2 = parseInt(c2.slice(4, 6), 16);
    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (pattern === 1) {
        // Stripes
        for (let i = 0; i < 10; i++) {
            ctx.fillStyle = i % 2 === 0 ? color1 : color2;
            ctx.fillRect(i * SIZE / 10, 0, SIZE / 10, SIZE);
        }
    }
    else if (pattern === 2) {
        // Border + inner border
        const bw = SIZE * 0.1;
        ctx.fillStyle = color2;
        ctx.fillRect(0, 0, SIZE, bw);
        ctx.fillRect(0, SIZE - bw, SIZE, bw);
        ctx.fillRect(0, 0, bw, SIZE);
        ctx.fillRect(SIZE - bw, 0, bw, SIZE);
        ctx.fillStyle = `rgba(${r2},${g2},${b2},0.4)`;
        ctx.fillRect(bw * 1.5, bw * 1.5, SIZE - bw * 3, bw * 0.5);
        ctx.fillRect(bw * 1.5, SIZE - bw * 2, SIZE - bw * 3, bw * 0.5);
        ctx.fillRect(bw * 1.5, bw * 1.5, bw * 0.5, SIZE - bw * 3);
        ctx.fillRect(SIZE - bw * 2, bw * 1.5, bw * 0.5, SIZE - bw * 3);
    }
    else if (pattern === 3) {
        // Geometric diamond grid
        const step = SIZE / 6;
        ctx.strokeStyle = color2;
        ctx.lineWidth = 2;
        for (let x = 0; x <= SIZE + step; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x - SIZE, SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + SIZE, SIZE);
            ctx.stroke();
        }
    }
    else if (pattern === 4) {
        // Ornate: multiple borders + centre medallion
        for (let bIdx = 0; bIdx < 3; bIdx++) {
            const bw = SIZE * 0.06 * (1 - bIdx * 0.2);
            const off = SIZE * 0.06 * bIdx;
            const col = bIdx % 2 === 0 ? color2 : `rgba(${r1},${g1},${b1},0.6)`;
            ctx.strokeStyle = col;
            ctx.lineWidth = bw * 0.6;
            ctx.strokeRect(off + bw, off + bw, SIZE - (off + bw) * 2, SIZE - (off + bw) * 2);
        }
        // Centre medallion
        const cx = SIZE / 2, cy = SIZE / 2, cr = SIZE * 0.18;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        grad.addColorStop(0, color2);
        grad.addColorStop(1, color1);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.fillStyle = color2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * cr * 0.65, cy + Math.sin(a) * cr * 0.65, cr * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const rugGeo = new THREE.BoxGeometry(w, 0.03, d);
    const rugMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.position.y = 0.015;
    rug.receiveShadow = true;
    grp.add(rug);
    return grp;
}
// ── Banner ────────────────────────────────────────────────────────────────────
/**
 * A hanging banner on a horizontal pole.
 * Pole extends W/2 past the banner on each side.
 *
 * @param poleMat   Metal/wood pole material.
 * @param color1    Primary banner color.
 * @param color2    Secondary / pattern color.
 * @param w         Banner width (X), default 0.65.
 * @param h         Banner height (Z hanging down), default 1.4.
 * @param pattern   0=plain, 1=horizontal stripe, 2=chevron, 3=rune symbol (default 1).
 */
export function buildBanner(poleMat, color1, color2, w = 0.65, h = 1.4, pattern = 1) {
    const grp = new THREE.Group();
    // Horizontal pole
    const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, w + 0.30, 8);
    const pole = mesh(poleGeo, poleMat, grp);
    pole.rotation.z = Math.PI / 2;
    pole.position.y = 0;
    // Banner fabric — canvas texture
    const SIZE = 128;
    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = SIZE;
    bannerCanvas.height = Math.round(SIZE * (h / w));
    const bCtx = bannerCanvas.getContext('2d');
    const BH = bannerCanvas.height;
    bCtx.fillStyle = color1;
    bCtx.fillRect(0, 0, SIZE, BH);
    if (pattern === 1) {
        bCtx.fillStyle = color2;
        bCtx.fillRect(0, BH * 0.35, SIZE, BH * 0.3);
    }
    else if (pattern === 2) {
        bCtx.fillStyle = color2;
        bCtx.beginPath();
        bCtx.moveTo(0, 0);
        bCtx.lineTo(SIZE, 0);
        bCtx.lineTo(SIZE / 2, BH * 0.4);
        bCtx.closePath();
        bCtx.fill();
    }
    else if (pattern === 3) {
        bCtx.fillStyle = color2;
        bCtx.font = `bold ${Math.round(BH * 0.55)}px serif`;
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        bCtx.fillText('✦', SIZE / 2, BH * 0.5);
    }
    // Bottom trim
    bCtx.fillStyle = color2;
    bCtx.fillRect(0, BH - 8, SIZE, 8);
    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    bannerTex.needsUpdate = true;
    const bannerGeo = new THREE.PlaneGeometry(w, h);
    const bannerMat = new THREE.MeshStandardMaterial({
        map: bannerTex, roughness: 0.9, side: THREE.DoubleSide,
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.y = -h / 2 - 0.02;
    banner.castShadow = true;
    grp.add(banner);
    // Two small finial balls on pole ends
    for (const sx of [-(w + 0.30) / 2, (w + 0.30) / 2]) {
        const fGeo = new THREE.SphereGeometry(0.038, 7, 7);
        const fin = mesh(fGeo, poleMat, grp);
        fin.position.set(sx, 0, 0);
    }
    return grp;
}
/**
 * A masonry fireplace with stone surround, firebox opening, and mantel shelf.
 * Place against a wall (back face at Z+).
 *
 * @param stoneMat  Stone / brick surround material.
 * @param fireMat   Emissive fire material.
 * @param w         Total width, default 1.8.
 * @param h         Total height to top of mantel, default 2.0.
 */
export function buildFireplace(stoneMat, fireMat, w = 1.8, h = 2.0, opts = {}) {
    const grp = new THREE.Group();
    const archOpen = opts.archOpening ?? 1;
    const mantelH = opts.mantelH ?? 0.18;
    const DEPTH = 0.4;
    const WALL_T = 0.22;
    const openW = w - WALL_T * 2;
    const openH = h * 0.52;
    const lintelY = openH;
    // Side walls
    for (const sx of [-(w / 2 - WALL_T / 2), (w / 2 - WALL_T / 2)]) {
        const wGeo = new THREE.BoxGeometry(WALL_T, openH, DEPTH);
        const wall = mesh(wGeo, stoneMat, grp);
        wall.position.set(sx, openH / 2, 0);
    }
    // Back wall of firebox
    const backGeo = new THREE.BoxGeometry(openW, openH, 0.08);
    const back = mesh(backGeo, stoneMat, grp);
    back.position.set(0, openH / 2, DEPTH / 2 - 0.04);
    // Floor of firebox
    const floorGeo = new THREE.BoxGeometry(openW, 0.08, DEPTH);
    const floorPl = mesh(floorGeo, stoneMat, grp);
    floorPl.position.y = 0.04;
    // Lintel / arch
    if (archOpen === 0) {
        // Flat lintel slab
        const lintelGeo = new THREE.BoxGeometry(w, WALL_T, DEPTH);
        const lintel = mesh(lintelGeo, stoneMat, grp);
        lintel.position.y = lintelY + WALL_T / 2;
    }
    else {
        // Arch span using half-torus
        const archR = openW / 2;
        const spanGeo = new THREE.TorusGeometry(archR, WALL_T / 2, 8, 16, Math.PI);
        const span = mesh(spanGeo, stoneMat, grp);
        span.position.y = lintelY;
        span.rotation.z = Math.PI;
    }
    // Upper surround (above arch/lintel to full height)
    const upH = h - openH - WALL_T - mantelH;
    if (upH > 0) {
        const upGeo = new THREE.BoxGeometry(w, upH, DEPTH * 0.5);
        const up = mesh(upGeo, stoneMat, grp);
        up.position.set(0, lintelY + WALL_T + upH / 2, DEPTH * 0.25);
    }
    // Mantel shelf
    if (mantelH > 0) {
        const mGeo = new THREE.BoxGeometry(w + 0.1, mantelH, DEPTH + 0.1);
        const m = mesh(mGeo, stoneMat, grp);
        m.position.y = h - mantelH / 2;
    }
    // Fire inside (2 log cylinders + flame cone)
    for (const [lx, lry] of [[-0.12, 0.4], [0.12, -0.4]]) {
        const logGeo = new THREE.CylinderGeometry(0.05, 0.05, openW * 0.65, 7);
        const log = mesh(logGeo, stoneMat, grp);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = lry;
        log.position.set(lx, 0.1, 0);
    }
    const flameGeo = new THREE.ConeGeometry(0.18, 0.38, 8);
    const flame = new THREE.Mesh(flameGeo, fireMat);
    flame.position.set(0, 0.3, 0);
    grp.add(flame);
    return grp;
}
// ── Potion rack ─────────────────────────────────────────────────────────────────
/**
 * A wall-mounted rack holding 8 potion bottles in two rows of 4.
 * Total width ≈1.1 WU, height ≈1.0 WU, depth ≈0.25 WU.
 * Place against a wall; the back face is flush with Z+.
 *
 * @param frameMat  Wood / iron frame material.
 * @param glowMat   Emissive material for the liquid inside the bottles.
 */
export function buildPotionRack(frameMat, glowMat) {
    const grp = new THREE.Group();
    // Back mounting board
    const boardGeo = new THREE.BoxGeometry(1.10, 0.90, 0.04);
    const board = mesh(boardGeo, frameMat, grp);
    board.position.set(0, 0.55, 0.115);
    // Two horizontal rails
    const railGeo = new THREE.BoxGeometry(1.06, 0.04, 0.18);
    for (const ry of [0.28, 0.72]) {
        const rail = mesh(railGeo, frameMat, grp);
        rail.position.set(0, ry, 0.02);
    }
    // 8 bottles in a 4×2 grid
    const BOTTLE_COLORS = [
        0x4488ff, 0xff4422, 0x44cc44, 0xffcc00,
        0xcc44ff, 0x22dddd, 0xff8844, 0xaaffaa,
    ];
    const heights = [0.28, 0.22, 0.32, 0.26, 0.24, 0.30, 0.20, 0.28];
    for (let i = 0; i < 8; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const bx = (col - 1.5) * 0.26;
        const by = row === 0 ? 0.28 : 0.72;
        const bh = heights[i];
        // Bottle body (lathe-like: cylinder + smaller neck)
        const bodyGeo = new THREE.CylinderGeometry(0.055, 0.055, bh * 0.7, 8);
        const bottleBody = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({
            color: BOTTLE_COLORS[i % BOTTLE_COLORS.length],
            transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.0,
        }));
        bottleBody.position.set(bx, by + bh * 0.35 - bh * 0.35 * 0.5 + bh * 0.35 * 0.5, -0.02);
        bottleBody.castShadow = true;
        grp.add(bottleBody);
        // Neck
        const neckGeo = new THREE.CylinderGeometry(0.025, 0.042, bh * 0.3, 7);
        const neck = new THREE.Mesh(neckGeo, new THREE.MeshStandardMaterial({
            color: BOTTLE_COLORS[i % BOTTLE_COLORS.length],
            transparent: true, opacity: 0.65, roughness: 0.1,
        }));
        neck.position.set(bx, by + bh * 0.7 + bh * 0.15 - bh * 0.35 * 0.5 + bh * 0.35 * 0.5, -0.02);
        neck.castShadow = true;
        grp.add(neck);
        // Inner glow liquid  
        const liquidGeo = new THREE.CylinderGeometry(0.040, 0.040, bh * 0.45, 8);
        const liquid = new THREE.Mesh(liquidGeo, glowMat);
        liquid.position.copy(bottleBody.position);
        grp.add(liquid);
        // Cork stopper
        const corkGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.045, 6);
        const cork = mesh(corkGeo, frameMat, grp);
        cork.position.set(bx, by + bh * 0.7 + bh * 0.3 + 0.022 - bh * 0.35 * 0.5 + bh * 0.35 * 0.5, -0.02);
    }
    return grp;
}
// ── Distillation coil ────────────────────────────────────────────────────────
/**
 * A table-top alchemical distillation rig: copper coiled pipe + bulb flask.
 * Total height ≈0.8 WU, footprint ≈0.7×0.5 WU.
 *
 * @param copperMat  Copper-coloured material for the pipe coil and stand.
 * @param glassMat   Transparent / translucent material for the flask.
 */
export function buildDistillationCoil(copperMat, glassMat) {
    const grp = new THREE.Group();
    // Base stand: two small feet + connecting crossbar
    const footGeo = new THREE.BoxGeometry(0.06, 0.06, 0.44);
    for (const fx of [-0.22, 0.22]) {
        const foot = mesh(footGeo, copperMat, grp);
        foot.position.set(fx, 0.03, 0);
    }
    const crossGeo = new THREE.BoxGeometry(0.48, 0.04, 0.05);
    const cross = mesh(crossGeo, copperMat, grp);
    cross.position.set(0, 0.05, 0);
    // Vertical support post
    const postGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8);
    const post = mesh(postGeo, copperMat, grp);
    post.position.set(-0.18, 0.32, 0);
    // Horizontal arm at top
    const armGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.38, 8);
    const arm = mesh(armGeo, copperMat, grp);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.01, 0.58, 0);
    // Coil: 4 rings of descending radius stacked vertically
    for (let ci = 0; ci < 4; ci++) {
        const cr = 0.13 - ci * 0.015;
        const coilGeo = new THREE.TorusGeometry(cr, 0.016, 6, 14);
        const coil = mesh(coilGeo, copperMat, grp);
        coil.position.set(0.18, 0.10 + ci * 0.12, 0);
    }
    // Output pipe from coil to flask
    const pipeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6);
    const pipe = mesh(pipeGeo, copperMat, grp);
    pipe.rotation.z = Math.PI / 5;
    pipe.position.set(0.12, 0.05, 0);
    // Round-bottom flask (lathe profile)
    const flaskPts = [
        new THREE.Vector2(0.00, 0.00),
        new THREE.Vector2(0.10, 0.02),
        new THREE.Vector2(0.18, 0.08),
        new THREE.Vector2(0.20, 0.18),
        new THREE.Vector2(0.18, 0.28),
        new THREE.Vector2(0.12, 0.35),
        new THREE.Vector2(0.06, 0.40),
        new THREE.Vector2(0.04, 0.48),
        new THREE.Vector2(0.05, 0.54),
    ];
    const flaskGeo = new THREE.LatheGeometry(flaskPts, 14);
    const flask = new THREE.Mesh(flaskGeo, glassMat);
    flask.position.set(0.35, 0.0, 0);
    flask.castShadow = true;
    grp.add(flask);
    // Flask stopper
    const stopGeo = new THREE.CylinderGeometry(0.038, 0.048, 0.06, 7);
    const stop = mesh(stopGeo, copperMat, grp);
    stop.position.set(0.35, 0.57, 0);
    return grp;
}
// ── Reading table ─────────────────────────────────────────────────────────────
/**
 * A wide reading table with an open book propped on top.
 * Footprint ≈ 1.8 × 0.9 WU; height ≈ 0.80 WU.
 *
 * @param mat  Wood material for the table frame.
 */
export function buildReadingTable(mat) {
    const grp = new THREE.Group();
    // Tabletop — wide and slightly shallow
    const topGeo = new THREE.BoxGeometry(1.80, 0.06, 0.90);
    const top = mesh(topGeo, mat, grp);
    top.position.y = 0.77;
    // Four sturdy legs
    const legGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.77, 6);
    for (const [lx, lz] of [[-0.82, -0.38], [0.82, -0.38], [-0.82, 0.38], [0.82, 0.38]]) {
        const leg = mesh(legGeo, mat, grp);
        leg.position.set(lx, 0.385, lz);
    }
    // Cross stretcher (structural, adds visual interest)
    const stretchGeo = new THREE.BoxGeometry(1.60, 0.04, 0.05);
    const stretch = mesh(stretchGeo, mat, grp);
    stretch.position.set(0, 0.30, 0);
    // Open book on top of table (two angled pages)
    const bookMat = new THREE.MeshLambertMaterial({ color: 0xf0ead8 });
    const spineMat = new THREE.MeshLambertMaterial({ color: 0x7a5535 });
    const pageGeo = new THREE.BoxGeometry(0.36, 0.015, 0.48);
    for (const [px, rx] of [[-0.18, -0.12], [0.18, 0.12]]) {
        const page = new THREE.Mesh(pageGeo, bookMat);
        page.position.set(px, 0.812, 0);
        page.rotation.z = rx;
        page.castShadow = true;
        grp.add(page);
    }
    // Book spine (the crease)
    const spineGeo = new THREE.BoxGeometry(0.04, 0.04, 0.48);
    const spine = new THREE.Mesh(spineGeo, spineMat);
    spine.position.set(0, 0.808, 0);
    spine.castShadow = true;
    grp.add(spine);
    return grp;
}
// ── Globe ─────────────────────────────────────────────────────────────────────
/**
 * A decorative globe on a brass stand with a meridian ring.
 * Total height ≈ 0.85 WU; globe radius ≈ 0.24 WU.
 *
 * @param mat  Material for the globe sphere and stand (brass / gold-ish).
 */
export function buildGlobe(mat) {
    const grp = new THREE.Group();
    // Tripod base legs
    const baseLegGeo = GeometryCache.get('prop_globe_base_leg', () => new THREE.CylinderGeometry(0.018, 0.022, 0.44, 6));
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = mesh(baseLegGeo, mat, grp);
        leg.position.set(Math.cos(a) * 0.22, 0.22, Math.sin(a) * 0.22);
        leg.rotation.x = Math.sin(a) * 0.18;
        leg.rotation.z = -Math.cos(a) * 0.18;
    }
    // Central vertical shaft
    const shaftGeo = GeometryCache.get('prop_globe_shaft', () => new THREE.CylinderGeometry(0.016, 0.016, 0.78, 7));
    const shaft = mesh(shaftGeo, mat, grp);
    shaft.position.y = 0.39;
    // Globe sphere (slightly flattened at poles = oblate spheroid via scale)
    const sphereGeo = GeometryCache.get('prop_globe_sphere', () => new THREE.SphereGeometry(0.24, 18, 12));
    const globe = mesh(sphereGeo, mat, grp);
    globe.position.y = 0.82;
    globe.scale.set(1.0, 0.96, 1.0);
    // Equatorial meridian ring
    const meridianGeo = GeometryCache.get('prop_globe_meridian', () => new THREE.TorusGeometry(0.26, 0.012, 6, 22));
    const meridian = mesh(meridianGeo, mat, grp);
    meridian.position.y = 0.82;
    meridian.rotation.x = Math.PI / 2;
    // Tilted axial ring
    const axialRing = mesh(meridianGeo, mat, grp);
    axialRing.position.y = 0.82;
    axialRing.rotation.z = THREE.MathUtils.degToRad(23.5);
    return grp;
}
// ── Anvil ─────────────────────────────────────────────────────────────────────
/**
 * A runic forge anvil: flat face, tapered body, horn on one side.
 * Total height ≈ 0.95 WU.
 *
 * @param mat  Iron / metal material.
 */
export function buildAnvil(mat) {
    const grp = new THREE.Group();
    // Base foot
    const baseGeo = GeometryCache.get('prop_anvil_base', () => new THREE.BoxGeometry(0.70, 0.18, 0.40));
    const base = mesh(baseGeo, mat, grp);
    base.position.y = 0.09;
    // Waist
    const waistGeo = GeometryCache.get('prop_anvil_waist', () => new THREE.BoxGeometry(0.38, 0.28, 0.30));
    const waist = mesh(waistGeo, mat, grp);
    waist.position.y = 0.32;
    // Face (flat top)
    const faceGeo = GeometryCache.get('prop_anvil_face', () => new THREE.BoxGeometry(0.72, 0.14, 0.34));
    const face = mesh(faceGeo, mat, grp);
    face.position.y = 0.53;
    // Horn
    const hornPts = [];
    for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        hornPts.push(new THREE.Vector2(0.13 * (1 - t * 0.85), t * 0.36));
    }
    const hornGeo = new THREE.LatheGeometry(hornPts, 8);
    const horn = new THREE.Mesh(hornGeo, mat);
    horn.rotation.z = -Math.PI / 2;
    horn.position.set(0.55, 0.52, 0);
    horn.castShadow = true;
    grp.add(horn);
    return grp;
}
// ── Cooling trough ────────────────────────────────────────────────────────────
/**
 * A rectangular iron trough filled with dark water.
 * ~1.5 WU long, 0.44 WU tall.
 *
 * @param mat  Iron material for the trough body.
 */
export function buildCoolingTrough(mat) {
    const grp = new THREE.Group();
    // Outer iron hull
    const outerGeo = GeometryCache.get('prop_trough_outer', () => new THREE.BoxGeometry(1.50, 0.44, 0.54));
    const outer = mesh(outerGeo, mat, grp);
    outer.position.y = 0.22;
    // Water fill (slightly inset)
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x223340,
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.82,
    });
    const waterGeo = new THREE.BoxGeometry(1.36, 0.06, 0.40);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 0.40;
    grp.add(water);
    // Three side supports
    const legGeo = GeometryCache.get('prop_trough_leg', () => new THREE.BoxGeometry(0.06, 0.22, 0.06));
    for (const lx of [-0.58, 0, 0.58]) {
        for (const lz of [-0.22, 0.22]) {
            const leg = mesh(legGeo, mat, grp);
            leg.position.set(lx, 0.11, lz);
        }
    }
    return grp;
}
// ── Bunk bed ──────────────────────────────────────────────────────────────────
/**
 * Two-tier bunk bed with wood frames and fabric mattresses.
 * ~1.8 WU tall; 1.2 WU long.
 *
 * @param mat       Wood frame material.
 * @param fabricMat Mattress fabric material.
 */
export function buildBunk(mat, fabricMat) {
    const grp = new THREE.Group();
    // Four corner posts
    const postGeo = GeometryCache.get('prop_bunk_post', () => new THREE.CylinderGeometry(0.04, 0.04, 1.80, 7));
    for (const px of [-0.52, 0.52]) {
        for (const pz of [-0.22, 0.22]) {
            const post = mesh(postGeo, mat, grp);
            post.position.set(px, 0.90, pz);
        }
    }
    // Lower mattress
    const mattGeo = GeometryCache.get('prop_bunk_mattress', () => new THREE.BoxGeometry(1.00, 0.12, 0.38));
    const lower = mesh(mattGeo, fabricMat, grp);
    lower.position.y = 0.36;
    // Upper mattress
    const upper = mesh(mattGeo, fabricMat, grp);
    upper.position.y = 1.08;
    // Two horizontal rails (lower and upper)
    const railGeo = GeometryCache.get('prop_bunk_rail', () => new THREE.BoxGeometry(1.12, 0.06, 0.06));
    for (const ry of [0.30, 0.60, 1.04, 1.34]) {
        for (const rz of [-0.22, 0.22]) {
            const rail = mesh(railGeo, mat, grp);
            rail.position.set(0, ry, rz);
        }
    }
    return grp;
}
// ── Mess table ────────────────────────────────────────────────────────────────
/**
 * A long communal mess table with two benches alongside.
 * Table: 2.2 WU long, 0.78 WU tall. Benches: 2.0 WU long, 0.42 WU tall.
 *
 * @param mat  Wood material.
 */
export function buildMessTable(mat) {
    const grp = new THREE.Group();
    // Tabletop
    const topGeo = GeometryCache.get('prop_mess_top', () => new THREE.BoxGeometry(2.20, 0.08, 0.70));
    const top = mesh(topGeo, mat, grp);
    top.position.y = 0.78;
    // Four legs
    const legGeo = GeometryCache.get('prop_mess_leg', () => new THREE.BoxGeometry(0.08, 0.78, 0.08));
    for (const lx of [-1.00, 1.00]) {
        for (const lz of [-0.28, 0.28]) {
            const leg = mesh(legGeo, mat, grp);
            leg.position.set(lx, 0.39, lz);
        }
    }
    // Two benches (one each side)
    const benchTopGeo = GeometryCache.get('prop_mess_bench_top', () => new THREE.BoxGeometry(2.00, 0.06, 0.28));
    const benchLegGeo = GeometryCache.get('prop_mess_bench_leg', () => new THREE.BoxGeometry(0.06, 0.42, 0.06));
    for (const bz of [-0.64, 0.64]) {
        const bTop = mesh(benchTopGeo, mat, grp);
        bTop.position.set(0, 0.42, bz);
        for (const bx of [-0.88, 0.88]) {
            const bLeg = mesh(benchLegGeo, mat, grp);
            bLeg.position.set(bx, 0.21, bz);
        }
    }
    return grp;
}
// ── Map table ─────────────────────────────────────────────────────────────────
/**
 * A broad campaign map table with a canvas top and brass marker pins.
 * ~1.8 WU wide, 0.82 WU tall.
 *
 * @param mat  Wood / leather material for frame.
 */
export function buildMapTable(mat) {
    const grp = new THREE.Group();
    // Table frame legs
    const legGeo = GeometryCache.get('prop_maptable_leg', () => new THREE.CylinderGeometry(0.05, 0.07, 0.82, 8));
    for (const lx of [-0.80, 0.80]) {
        for (const lz of [-0.38, 0.38]) {
            const leg = mesh(legGeo, mat, grp);
            leg.position.set(lx, 0.41, lz);
        }
    }
    // Tabletop
    const topGeo = GeometryCache.get('prop_maptable_top', () => new THREE.BoxGeometry(1.76, 0.06, 0.84));
    const top = mesh(topGeo, mat, grp);
    top.position.y = 0.85;
    // Map canvas (slightly raised, parchment colour)
    const mapMat = new THREE.MeshLambertMaterial({ color: 0xc8b880 });
    const mapGeo = new THREE.BoxGeometry(1.60, 0.01, 0.70);
    const mapMesh = new THREE.Mesh(mapGeo, mapMat);
    mapMesh.position.y = 0.89;
    mapMesh.castShadow = false;
    grp.add(mapMesh);
    // Six brass marker pins
    const pinGeo = new THREE.CylinderGeometry(0.012, 0.010, 0.08, 5);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.8, roughness: 0.3 });
    for (let p = 0; p < 6; p++) {
        const pin = new THREE.Mesh(pinGeo, pinMat);
        const angle = (p / 6) * Math.PI * 2;
        pin.position.set(Math.cos(angle) * 0.45, 0.93, Math.sin(angle) * 0.22);
        grp.add(pin);
    }
    return grp;
}
// ── Weapon stand ──────────────────────────────────────────────────────────────
/**
 * A crossed weapons rack: two swords / pole-arms crossed on a wooden stand.
 * ~1.2 WU tall.
 *
 * @param mat  Wood / iron material.
 */
export function buildWeaponStand(mat) {
    const grp = new THREE.Group();
    // Base plinth
    const baseGeo = GeometryCache.get('prop_weapon_base', () => new THREE.BoxGeometry(0.52, 0.10, 0.28));
    const base = mesh(baseGeo, mat, grp);
    base.position.y = 0.05;
    // Vertical centre pole
    const poleGeo = GeometryCache.get('prop_weapon_pole', () => new THREE.CylinderGeometry(0.025, 0.030, 1.10, 7));
    const pole = mesh(poleGeo, mat, grp);
    pole.position.y = 0.65;
    // Horizontal cross-bar
    const barGeo = GeometryCache.get('prop_weapon_bar', () => new THREE.CylinderGeometry(0.018, 0.018, 0.60, 6));
    const bar = mesh(barGeo, mat, grp);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 0.82;
    // Two sword blades (thin flat boxes, crossed)
    const bladeGeo = new THREE.BoxGeometry(0.03, 0.90, 0.008);
    for (let i = 0; i < 2; i++) {
        const blade = new THREE.Mesh(bladeGeo, mat);
        blade.rotation.z = (i === 0 ? 1 : -1) * THREE.MathUtils.degToRad(28);
        blade.position.y = 0.70;
        grp.add(blade);
    }
    return grp;
}
// ── Plant pot ─────────────────────────────────────────────────────────────────
/**
 * A terracotta pot with a leafy plant stem.
 * ~0.60 WU tall.
 *
 * @param mat  Terracotta / plant material.
 */
export function buildPlantPot(mat) {
    const grp = new THREE.Group();
    // Pot body (lathe)
    const potPts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.14, 0),
        new THREE.Vector2(0.18, 0.14),
        new THREE.Vector2(0.20, 0.28),
        new THREE.Vector2(0.17, 0.32),
        new THREE.Vector2(0.16, 0.36),
    ];
    const potGeo = new THREE.LatheGeometry(potPts, 12);
    const pot = new THREE.Mesh(potGeo, mat);
    pot.castShadow = true;
    grp.add(pot);
    // Soil disc
    const soilGeo = new THREE.CircleGeometry(0.16, 10);
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.37;
    grp.add(soil);
    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.22, 6);
    const stem = mesh(stemGeo, mat, grp);
    stem.position.y = 0.48;
    // Three leaf blobs
    const leafGeo = new THREE.SphereGeometry(0.065, 5, 4);
    for (let l = 0; l < 3; l++) {
        const la = (l / 3) * Math.PI * 2;
        const leaf = new THREE.Mesh(leafGeo, mat);
        leaf.scale.set(1, 0.45, 1);
        leaf.position.set(Math.cos(la) * 0.09, 0.60, Math.sin(la) * 0.09);
        grp.add(leaf);
    }
    return grp;
}
// ── Raised planter ────────────────────────────────────────────────────────────
/**
 * A rectangular raised stone planting bed with soil inside.
 * ~1.6 WU long, 0.50 WU tall.
 *
 * @param mat  Stone material for the box surround.
 */
export function buildRaisedPlanter(mat) {
    const grp = new THREE.Group();
    // Stone walls (four slabs)
    const wallN = GeometryCache.get('prop_planter_wallN', () => new THREE.BoxGeometry(1.60, 0.50, 0.10));
    const wallS = mesh(wallN, mat, grp);
    wallS.position.set(0, 0.25, -0.32);
    const wallN2 = mesh(wallN, mat, grp);
    wallN2.position.set(0, 0.25, 0.32);
    const wallE = GeometryCache.get('prop_planter_wallE', () => new THREE.BoxGeometry(0.10, 0.50, 0.54));
    const we = mesh(wallE, mat, grp);
    we.position.set(-0.75, 0.25, 0);
    const ww = mesh(wallE, mat, grp);
    ww.position.set(0.75, 0.25, 0);
    // Soil base
    const soilGeo = GeometryCache.get('prop_planter_soil', () => new THREE.BoxGeometry(1.40, 0.10, 0.44));
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.position.y = 0.45;
    grp.add(soil);
    // Small plant clumps
    const foliGeo = new THREE.SphereGeometry(0.07, 5, 4);
    const foliMat = new THREE.MeshLambertMaterial({ color: 0x3a6828 });
    for (let p = 0; p < 5; p++) {
        const f = new THREE.Mesh(foliGeo, foliMat);
        f.scale.set(1, 0.65, 1);
        f.position.set(-0.56 + p * 0.28, 0.54, (p % 2) * 0.08 - 0.04);
        grp.add(f);
    }
    return grp;
}
// ── Containment ring ──────────────────────────────────────────────────────────
/**
 * A glowing arcane ward circle inscribed on the floor.
 * Flat torus ring with emissive material, radius ≈ 0.9 WU.
 *
 * @param mat  Emissive ward material (caller provides colour).
 */
export function buildContainmentRing(mat) {
    const grp = new THREE.Group();
    // Outer ring
    const outerGeo = GeometryCache.get('prop_ward_outer', () => new THREE.TorusGeometry(0.90, 0.035, 6, 48));
    const outer = new THREE.Mesh(outerGeo, mat);
    outer.rotation.x = Math.PI / 2;
    outer.position.y = 0.015;
    grp.add(outer);
    // Inner ring
    const innerGeo = GeometryCache.get('prop_ward_inner', () => new THREE.TorusGeometry(0.62, 0.022, 6, 40));
    const inner = new THREE.Mesh(innerGeo, mat);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.014;
    grp.add(inner);
    // Six rune nodes evenly spaced
    const nodeGeo = GeometryCache.get('prop_ward_node', () => new THREE.CircleGeometry(0.055, 7));
    for (let n = 0; n < 6; n++) {
        const angle = (n / 6) * Math.PI * 2;
        const node = new THREE.Mesh(nodeGeo, mat);
        node.rotation.x = -Math.PI / 2;
        node.position.set(Math.cos(angle) * 0.90, 0.016, Math.sin(angle) * 0.90);
        grp.add(node);
    }
    return grp;
}
// ── Astrolabe ─────────────────────────────────────────────────────────────────
/**
 * A rotating brass orrery / astrolabe on a tripod stand.
 * Total height ≈ 1.10 WU.
 *
 * @param mat  Brass / metal material.
 */
export function buildAstrolabe(mat) {
    const grp = new THREE.Group();
    // Tripod legs (three)
    const legGeo = GeometryCache.get('prop_astro_leg', () => new THREE.CylinderGeometry(0.018, 0.025, 0.68, 6));
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const leg = mesh(legGeo, mat, grp);
        leg.position.set(Math.cos(angle) * 0.24, 0.34, Math.sin(angle) * 0.24);
        leg.rotation.x = Math.sin(angle) * 0.24;
        leg.rotation.z = -Math.cos(angle) * 0.24;
    }
    // Central shaft
    const shaftGeo = GeometryCache.get('prop_astro_shaft', () => new THREE.CylinderGeometry(0.020, 0.020, 0.38, 7));
    const shaft = mesh(shaftGeo, mat, grp);
    shaft.position.y = 0.86;
    // Main armillary sphere rings (3 nested rings)
    const ring1Geo = GeometryCache.get('prop_astro_ring1', () => new THREE.TorusGeometry(0.32, 0.018, 7, 32));
    const ring2Geo = GeometryCache.get('prop_astro_ring2', () => new THREE.TorusGeometry(0.26, 0.014, 6, 28));
    const ring3Geo = GeometryCache.get('prop_astro_ring3', () => new THREE.TorusGeometry(0.19, 0.012, 6, 24));
    for (const [geo, ry, rz] of [
        [ring1Geo, 0, 0],
        [ring2Geo, THREE.MathUtils.degToRad(60), 0],
        [ring3Geo, 0, THREE.MathUtils.degToRad(90)],
    ]) {
        const ring = new THREE.Mesh(geo, mat);
        ring.position.y = 1.06;
        ring.rotation.y = ry;
        ring.rotation.z = rz;
        ring.castShadow = true;
        grp.add(ring);
    }
    // Central orb
    const orbGeo = GeometryCache.get('prop_astro_orb', () => new THREE.SphereGeometry(0.065, 9, 7));
    const orb = mesh(orbGeo, mat, grp);
    orb.position.y = 1.06;
    return grp;
}
/**
 * An oversized brewing vat: wide barrel body, glass dome on top, copper fittings.
 * Total height ≈ 1.6 WU; radius ≈ 0.6 WU at widest.
 *
 * @param mat      Barrel / wood stave material.
 * @param glassMat Transparent dome top material.
 */
export function buildFermentingVat(mat, glassMat) {
    const grp = new THREE.Group();
    // Barrel body — wide cylinder
    const bodyGeo = GeometryCache.get('prop_ferment_body', () => new THREE.CylinderGeometry(0.60, 0.55, 1.10, 16));
    const body = mesh(bodyGeo, mat, grp);
    body.position.y = 0.55;
    // Top rim ring
    const topRimGeo = GeometryCache.get('prop_ferment_rim', () => new THREE.TorusGeometry(0.62, 0.04, 7, 20));
    const topRim = mesh(topRimGeo, mat, grp);
    topRim.position.y = 1.12;
    topRim.rotation.x = Math.PI / 2;
    // Bottom rim ring
    const botRim = mesh(topRimGeo, mat, grp);
    botRim.position.y = 0.06;
    botRim.rotation.x = Math.PI / 2;
    // Three metal bands around the barrel
    const bandGeo = GeometryCache.get('prop_ferment_band', () => new THREE.TorusGeometry(0.63, 0.025, 6, 20));
    for (const by of [0.28, 0.55, 0.85]) {
        const band = mesh(bandGeo, mat, grp);
        band.position.y = by;
        band.rotation.x = Math.PI / 2;
    }
    // Glass dome lid
    const domeGeo = GeometryCache.get('prop_ferment_dome', () => {
        const pts = [];
        for (let i = 0; i <= 10; i++) {
            const t = (i / 10) * (Math.PI / 2);
            pts.push(new THREE.Vector2(Math.sin(t) * 0.56, Math.cos(t) * 0.36));
        }
        return new THREE.LatheGeometry(pts, 16);
    });
    const dome = new THREE.Mesh(domeGeo, glassMat);
    dome.position.y = 1.14;
    dome.castShadow = false;
    grp.add(dome);
    // Copper tap / spigot on the side
    const tapGeo = new THREE.CylinderGeometry(0.030, 0.025, 0.18, 7);
    const tap = mesh(tapGeo, mat, grp);
    tap.rotation.z = Math.PI / 2;
    tap.position.set(0.64, 0.20, 0);
    return grp;
}
// ── Herb bundle ───────────────────────────────────────────────────────────────
/**
 * A hanging bundle of dried herbs: bound twigs/stems cluster.
 * Rendered at ceiling height when placed in the scene (y offset applied externally).
 * Total length ≈ 0.55 WU; diameter ≈ 0.22 WU.
 *
 * @param mat  Dried herb / plant material (brownish green).
 */
export function buildHerbBundle(mat) {
    const grp = new THREE.Group();
    // Central binding cord
    const cordGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.55, 6);
    const cord = mesh(cordGeo, mat, grp);
    cord.position.y = 0;
    // Stem cluster: 7 thin cylinders splaying outward from the base
    const stemGeo = new THREE.CylinderGeometry(0.014, 0.008, 0.38, 5);
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const splay = 0.09;
        const stem = mesh(stemGeo, mat, grp);
        stem.position.set(Math.cos(a) * splay * 0.5, -0.08, Math.sin(a) * splay * 0.5);
        stem.rotation.z = Math.cos(a) * 0.28;
        stem.rotation.x = Math.sin(a) * 0.28;
    }
    // Leaf/foliage blobs at bottom of stems
    const leafGeo = new THREE.SphereGeometry(0.050, 5, 4);
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leaf = mesh(leafGeo, mat, grp);
        leaf.position.set(Math.cos(a) * 0.10, -0.28, Math.sin(a) * 0.10);
        leaf.scale.set(1, 0.5, 1);
    }
    // Hanging rope at top
    const ropeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5);
    const rope = mesh(ropeGeo, mat, grp);
    rope.position.y = 0.38;
    return grp;
}
