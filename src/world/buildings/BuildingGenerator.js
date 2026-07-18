/**
 * BuildingGenerator — procedural THREE.Group for each building type.
 *
 * Improvements over OW-4:
 *   • Canvas-generated procedural textures (stone, brick, render, thatch, slate)
 *     via TextureFactory — individual bricks/stones visible with mortar lines.
 *   • 4-panel wall construction: front/back/left/right panels give each face
 *     its own UV space so the texture tiles correctly relative to wall size.
 *   • Proper pitched / hipped BufferGeometry roofs (not LatheGeometry cones).
 *   • Window geometry: trim frame + glass pane on every occupied floor.
 *   • Plinth on all solid buildings.
 *
 * Materials use MeshLambertMaterial (consistent with the rest of the game).
 * The canvas texture map provides visual detail; a seed-derived colour tint
 * on the material gives per-building variation.
 *
 * All groups are positioned at the origin (y=0 = ground level).
 * The caller translates them to world-space after the call.
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { stoneTexture, brickTexture, renderTexture, slateTexture, thatchTexture, } from './TextureFactory';
// ── Constants ─────────────────────────────────────────────────────────────────
const WT = 0.25; // wall thickness (world units)
const PLINTH_H = 0.28; // plinth / foundation height
// ── Roof geometry ─────────────────────────────────────────────────────────────
/**
 * Gabled pitched roof — ridge runs along the X-axis.
 * Vertices sit at y=0 (eave level); ridge at y=rh.
 */
function _pitchedRoof(w, d) {
    const hw = w / 2, hd = d / 2, rh = w * 0.52;
    const pos = new Float32Array([
        -hw, 0, -hd, // 0 front-left eave
        hw, 0, -hd, // 1 front-right eave
        hw, 0, hd, // 2 back-right eave
        -hw, 0, hd, // 3 back-left eave
        -hw, rh, 0, // 4 left gable ridge
        hw, rh, 0, // 5 right gable ridge
    ]);
    const idx = new Uint16Array([
        0, 1, 5, 0, 5, 4, // front slope  (faces -Z)
        3, 5, 4, 3, 2, 5, // back slope   (faces +Z)
        0, 3, 4, // left gable   (faces -X)
        1, 5, 2, // right gable  (faces +X)
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return geo;
}
/**
 * Hipped roof — ridge shorter than the building depth, both ends are sloped.
 */
function _hippedRoof(w, d) {
    const hw = w / 2, hd = d / 2;
    const rh = w * 0.48;
    const hip = d * 0.28;
    const rl = hd - hip;
    const pos = new Float32Array([
        -hw, 0, -hd, // 0 front-left
        hw, 0, -hd, // 1 front-right
        hw, 0, hd, // 2 back-right
        -hw, 0, hd, // 3 back-left
        -hw, rh, -rl, // 4 left-front ridge
        hw, rh, -rl, // 5 right-front ridge
        hw, rh, rl, // 6 right-back ridge
        -hw, rh, rl, // 7 left-back ridge
    ]);
    const idx = new Uint16Array([
        0, 1, 5, 0, 5, 4, // front hip
        3, 7, 6, 3, 6, 2, // back hip
        0, 4, 7, 0, 7, 3, // left hip
        1, 2, 6, 1, 6, 5, // right hip
        4, 5, 6, 4, 6, 7, // ridge cap
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return geo;
}
// ── Material helpers ──────────────────────────────────────────────────────────
/** Canvas-textured Lambert wall material with a seed-tinted colour. */
function _wallMat(texFn, w, h, tint) {
    const repX = Math.max(1, w / 2.0);
    const repY = Math.max(1, h / 1.5);
    return new THREE.MeshLambertMaterial({ map: texFn(repX, repY), color: tint });
}
/** Canvas-textured Lambert roof material. */
function _roofMat(texFn, w, d, tint) {
    const slopeLen = Math.sqrt((w / 2) ** 2 + (w * 0.52) ** 2);
    const repX = Math.max(1, d / 2.0);
    const repY = Math.max(1, slopeLen / 1.5);
    return new THREE.MeshLambertMaterial({
        map: texFn(repX, repY),
        color: tint,
        side: THREE.DoubleSide,
    });
}
/** Flat colour Lambert — for doors, frames, trim. */
function _flatMat(hex) {
    return new THREE.MeshLambertMaterial({ color: hex });
}
// ── Colour tint generators ────────────────────────────────────────────────────
function _stoneColor(rand) {
    const v = (rand() - 0.5) * 0.1;
    return new THREE.Color(0.62 + v, 0.58 + v * 0.9, 0.52 + v * 0.7);
}
function _brickColor(rand) {
    const v = (rand() - 0.5) * 0.07;
    return new THREE.Color(0.72 + v, 0.44 + v * 0.8, 0.34 + v * 0.5);
}
function _renderColor(rand) {
    const v = (rand() - 0.5) * 0.07;
    return new THREE.Color(0.84 + v, 0.78 + v, 0.65 + v * 0.8);
}
function _slateColor(rand) {
    const v = (rand() - 0.5) * 0.05;
    return new THREE.Color(0.24 + v, 0.28 + v, 0.32 + v);
}
function _thatchColor(rand) {
    const v = (rand() - 0.5) * 0.08;
    return new THREE.Color(0.70 + v, 0.56 + v * 0.9, 0.22 + v * 0.3);
}
// ── Wall construction helpers ─────────────────────────────────────────────────
/** Stone plinth / foundation slab. */
function _addPlinth(grp, w, d) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, PLINTH_H, d + 0.5), _flatMat(0x5a5048));
    mesh.position.y = PLINTH_H / 2;
    grp.add(mesh);
}
/**
 * Four-panel wall construction.
 * Each face is a separate BoxGeometry so UV tiling is independent per face.
 */
function _addWalls(grp, w, wallH, d, mat) {
    const yMid = PLINTH_H + wallH / 2;
    const panels = [
        [w, wallH, WT, 0, yMid, d / 2 - WT / 2], // front
        [w, wallH, WT, 0, yMid, -d / 2 + WT / 2], // back
        [WT, wallH, d - WT * 2, -w / 2 + WT / 2, yMid, 0], // left
        [WT, wallH, d - WT * 2, w / 2 - WT / 2, yMid, 0], // right
    ];
    for (const [gw, gh, gd, px, py, pz] of panels) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), mat);
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        grp.add(mesh);
    }
}
/**
 * Place a window: trim frame + glass pane.
 * rotY=0 → window faces +Z (front wall).
 */
function _addWindow(grp, x, y, z, rotY, winW, winH, trimMat) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.16, winH + 0.16, WT * 0.6), trimMat);
    frame.position.set(x, y, z);
    frame.rotation.y = rotY;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, WT * 0.35), new THREE.MeshLambertMaterial({ color: 0x1a2a38 }));
    glass.position.set(x, y, z);
    glass.rotation.y = rotY;
    grp.add(frame, glass);
}
/** Simple door panel + surround. */
function _addDoor(grp, x, _z, doorW, doorH, wallFaceZ, doorColor, trimColor) {
    const surround = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.22, doorH + 0.22, WT * 0.5), _flatMat(trimColor));
    surround.position.set(x, PLINTH_H + doorH / 2 + 0.06, wallFaceZ);
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, WT * 0.45), _flatMat(doorColor));
    door.position.set(x, PLINTH_H + doorH / 2, wallFaceZ);
    grp.add(surround, door);
}
// ── Public entry point ────────────────────────────────────────────────────────
export function generateBuilding(type, seed) {
    const rand = mulberry32(seed ^ 0x3C_BA_19_E7);
    switch (type) {
        case 'cottage': return _makeCottage(rand);
        case 'inn': return _makeInn(rand);
        case 'market_stall': return _makeMarketStall(rand);
        case 'smithy': return _makeSmity(rand);
        case 'tavern': return _makeTavern(rand);
        case 'temple': return _makeTemple(rand);
        case 'city_hall': return _makeCityHall(rand);
        case 'guard_tower': return _makeGuardTower(rand);
        case 'well': return _makeWell(rand);
        case 'market_cross': return _makeMarketCross(rand);
    }
}
// ── Individual building generators ────────────────────────────────────────────
/** Cottage — render/plaster walls, thatched pitched roof, flower boxes. */
function _makeCottage(rand) {
    const grp = new THREE.Group();
    const w = 3.4 + rand() * 0.7;
    const d = 2.9 + rand() * 0.5;
    const wallH = 2.1;
    const wallTint = _renderColor(rand);
    const roofTint = _thatchColor(rand);
    const trimColor = 0x4a3420;
    const wallM = _wallMat(renderTexture, w, wallH, wallTint);
    const roofM = _roofMat(thatchTexture, w, d, roofTint);
    const trimM = _flatMat(trimColor);
    _addPlinth(grp, w, d);
    _addWalls(grp, w, wallH, d, wallM);
    // Pitched roof with slight overhang
    const roofMesh = new THREE.Mesh(_pitchedRoof(w + 0.4, d + 0.4), roofM);
    roofMesh.position.y = PLINTH_H + wallH;
    grp.add(roofMesh);
    // Door (slightly off-centre for character)
    const doorX = w * (rand() < 0.5 ? -0.15 : 0.15);
    _addDoor(grp, doorX, 0, 0.7, 1.6, d / 2 + WT / 2, 0x2a1e12, trimColor);
    // Small windows front + back
    const winY = PLINTH_H + wallH * 0.55;
    const frontZ = d / 2 + WT / 2 + 0.01;
    for (const [wx, wz, ry] of [
        [-w * 0.28, frontZ, 0],
        [w * 0.28, frontZ, 0],
        [-w * 0.28, -frontZ, Math.PI],
    ]) {
        _addWindow(grp, wx, winY, wz, ry, 0.65, 0.75, trimM);
    }
    // Flower boxes on front windowsills
    const flowMat = _flatMat(0x5a3820);
    for (const sx of [-w * 0.28, w * 0.28]) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.18), flowMat);
        box.position.set(sx, PLINTH_H + wallH * 0.38, d / 2 + 0.14);
        grp.add(box);
    }
    return grp;
}
/** Inn — brick walls, 2 floors, hipped slate roof, hanging sign. */
function _makeInn(rand) {
    const grp = new THREE.Group();
    const w = 5.2 + rand() * 1.0;
    const d = 4.2 + rand() * 0.8;
    const flH = 2.2;
    const wallH = flH * 2;
    const wallTint = _brickColor(rand);
    const roofTint = _slateColor(rand);
    const trimColor = 0x3a2a18;
    const wallM = _wallMat(brickTexture, w, wallH, wallTint);
    const roofM = _roofMat(slateTexture, w, d, roofTint);
    const trimM = _flatMat(trimColor);
    _addPlinth(grp, w, d);
    _addWalls(grp, w, wallH, d, wallM);
    // Floor separation band
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1), _flatMat(0x3a3028));
    band.position.y = PLINTH_H + flH;
    grp.add(band);
    // Hipped slate roof + eave
    const roofMesh = new THREE.Mesh(_hippedRoof(w + 0.4, d + 0.4), roofM);
    roofMesh.position.y = PLINTH_H + wallH;
    grp.add(roofMesh);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.18, d + 0.5), trimM);
    eave.position.y = PLINTH_H + wallH + 0.09;
    grp.add(eave);
    // Door
    _addDoor(grp, 0, 0, 0.9, 2.0, d / 2 + WT / 2, 0x3a2010, trimColor);
    // Windows per floor
    const frontZ = d / 2 + WT / 2 + 0.01;
    for (let fl = 0; fl < 2; fl++) {
        const wy = PLINTH_H + fl * flH + flH * 0.55;
        for (const wx of [-w * 0.3, w * 0.3]) {
            if (fl === 0 && Math.abs(wx) < 1.0)
                continue;
            _addWindow(grp, wx, wy, frontZ, 0, 0.85, 1.0, trimM);
            _addWindow(grp, wx, wy, -frontZ, Math.PI, 0.85, 1.0, trimM);
        }
    }
    // Hanging sign
    const wood = _flatMat(0x5c3d1e);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), wood);
    post.position.set(w * 0.32, PLINTH_H + flH * 0.8, d / 2 + 0.06);
    grp.add(post);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 0.07), wood);
    sign.position.set(w * 0.32, PLINTH_H + flH * 0.55, d / 2 + 0.06);
    sign.rotation.y = 0.1 + rand() * 0.08;
    grp.add(sign);
    return grp;
}
/** Market stall — open timber frame, fabric awning, counter. */
function _makeMarketStall(rand) {
    const grp = new THREE.Group();
    const w = 3.2 + rand() * 0.5;
    const d = 2.2 + rand() * 0.3;
    const H = 2.0;
    const wood = _flatMat(0x6b4120);
    const awning = _flatMat(0x8a2828 + Math.floor(rand() * 4) * 0x002200);
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, H, 5), wood);
            pole.position.set(sx * (w / 2 - 0.12), H / 2, sz * (d / 2 - 0.12));
            grp.add(pole);
        }
    }
    const awn = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.1, d + 0.5), awning);
    awn.position.set(0, H, 0.1);
    awn.rotation.x = -0.1;
    grp.add(awn);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.55, 0.28), wood);
    counter.position.set(0, 0.28, d / 2 - 0.1);
    grp.add(counter);
    for (let i = 0; i < 3; i++) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.13 + rand() * 0.07, 5, 4), _flatMat(0x774422 + Math.floor(rand() * 6) * 0x100900));
        blob.position.set((i - 1) * 0.45, 0.65, d / 2 - 0.05);
        grp.add(blob);
    }
    return grp;
}
/** Smithy — stone walls, flat parapet, chimney, forge glow. */
function _makeSmity(rand) {
    const grp = new THREE.Group();
    const w = 4.5 + rand() * 0.7;
    const d = 3.8 + rand() * 0.5;
    const wallH = 2.6;
    const wallTint = _stoneColor(rand);
    const wallM = _wallMat(stoneTexture, w, wallH, wallTint);
    const trimM = _flatMat(0x3a3228);
    _addPlinth(grp, w, d);
    _addWalls(grp, w, wallH, d, wallM);
    // Flat parapet
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.45, d + 0.25), _flatMat(0x4a4238));
    parapet.position.y = PLINTH_H + wallH + 0.22;
    grp.add(parapet);
    // Roof slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w - WT * 2, 0.18, d - WT * 2), _flatMat(0x2e2a22));
    slab.position.y = PLINTH_H + wallH + 0.09;
    grp.add(slab);
    // Chimney
    const chimMat = _flatMat(0x4a4238);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.7), chimMat);
    chimney.position.set(w * 0.28, PLINTH_H + wallH + 0.75, -d * 0.22);
    grp.add(chimney);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.14, 0.85), chimMat);
    cap.position.set(w * 0.28, PLINTH_H + wallH + 1.57, -d * 0.22);
    grp.add(cap);
    // Forge ember glow
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.9 }));
    glow.position.set(w * 0.28, PLINTH_H + wallH + 0.1, -d * 0.22);
    grp.add(glow);
    // Door + front window
    _addDoor(grp, 0, 0, 0.9, 1.9, d / 2 + WT / 2, 0x2a1800, 0x3a2a18);
    _addWindow(grp, -w * 0.3, PLINTH_H + wallH * 0.55, d / 2 + WT / 2 + 0.01, 0, 0.7, 0.8, trimM);
    return grp;
}
/** Tavern — brick 2-floor, hipped slate roof, barrel cluster, hanging sign. */
function _makeTavern(rand) {
    const grp = new THREE.Group();
    const w = 6.2 + rand() * 1.0;
    const d = 5.0 + rand() * 0.8;
    const flH = 2.4;
    const wallH = flH * 2;
    const wallTint = _brickColor(rand);
    const roofTint = _slateColor(rand);
    const trimColor = 0x3a2818;
    const wallM = _wallMat(brickTexture, w, wallH, wallTint);
    const roofM = _roofMat(slateTexture, w, d, roofTint);
    const trimM = _flatMat(trimColor);
    const wood = _flatMat(0x5c3d1e);
    _addPlinth(grp, w, d);
    _addWalls(grp, w, wallH, d, wallM);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.2, d + 0.12), trimM);
    band.position.y = PLINTH_H + flH;
    grp.add(band);
    const roofMesh = new THREE.Mesh(_hippedRoof(w + 0.45, d + 0.45), roofM);
    roofMesh.position.y = PLINTH_H + wallH;
    grp.add(roofMesh);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.55, 0.18, d + 0.55), trimM);
    eave.position.y = PLINTH_H + wallH + 0.09;
    grp.add(eave);
    _addDoor(grp, 0, 0, 1.1, 2.2, d / 2 + WT / 2, 0x3a2010, trimColor);
    const frontZ = d / 2 + WT / 2 + 0.01;
    for (let fl = 0; fl < 2; fl++) {
        const wy = PLINTH_H + fl * flH + flH * 0.55;
        const n = fl === 0 ? 2 : 3;
        for (let wi = 0; wi < n; wi++) {
            const wx = (wi - (n - 1) / 2) * (w / (n + 0.5));
            if (fl === 0 && Math.abs(wx) < 0.8)
                continue;
            _addWindow(grp, wx, wy, frontZ, 0, 0.9, 1.05, trimM);
            _addWindow(grp, wx, wy, -frontZ, Math.PI, 0.9, 1.05, trimM);
        }
    }
    // Hanging sign
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5), wood);
    post.position.set(w * 0.34, PLINTH_H + flH * 0.85, d / 2 + 0.06);
    grp.add(post);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.38, 0.08), wood);
    sign.position.set(w * 0.34, PLINTH_H + flH * 0.55, d / 2 + 0.06);
    sign.rotation.y = 0.1 + rand() * 0.07;
    grp.add(sign);
    // Barrel cluster
    const barMat = _flatMat(0x5c3822);
    for (let i = 0; i < 3; i++) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 8), barMat);
        barrel.position.set(-0.9 + i * 0.52 + (rand() - 0.5) * 0.1, 0.28, d / 2 + 0.55 + (rand() - 0.5) * 0.2);
        grp.add(barrel);
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 4, 8), _flatMat(0x2a2010));
        hoop.rotation.x = Math.PI / 2;
        hoop.position.copy(barrel.position).add(new THREE.Vector3(0, 0.12, 0));
        grp.add(hoop);
    }
    return grp;
}
/** Temple — stone columns peristyle, gabled slate roof, emissive altar. */
function _makeTemple(rand) {
    const grp = new THREE.Group();
    const R = 3.8;
    const bodyW = R * 1.4;
    const bodyD = R * 1.4;
    const wallH = 3.2;
    const COLS = 8;
    const wallTint = _stoneColor(rand);
    const roofTint = _slateColor(rand);
    const wallM = _wallMat(stoneTexture, bodyW, wallH, wallTint);
    const roofM = _roofMat(slateTexture, bodyW, bodyD, roofTint);
    _addPlinth(grp, bodyW + 0.6, bodyD + 0.6);
    // Stepped platform
    for (let s = 0; s < 2; s++) {
        const sW = bodyW + 0.6 - s * 0.4;
        const step = new THREE.Mesh(new THREE.BoxGeometry(sW, 0.22, bodyD + 0.6 - s * 0.4), _flatMat(0x8a8270));
        step.position.y = PLINTH_H + s * 0.22;
        grp.add(step);
    }
    _addWalls(grp, bodyW, wallH, bodyD, wallM);
    // Gabled roof
    const roofMesh = new THREE.Mesh(_pitchedRoof(bodyW + 0.5, bodyD + 0.5), roofM);
    roofMesh.position.y = PLINTH_H + wallH + 0.44;
    grp.add(roofMesh);
    // Peristyle columns
    const colTint = _stoneColor(rand);
    const colMat = _wallMat(stoneTexture, 1, wallH + 0.3, colTint);
    for (let i = 0; i < COLS; i++) {
        const angle = (i / COLS) * Math.PI * 2;
        const colH = wallH + 0.3;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, colH, 7), colMat);
        col.position.set(Math.cos(angle) * (R + 0.2), PLINTH_H + 0.44 + colH / 2, Math.sin(angle) * (R + 0.2));
        grp.add(col);
        const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.26, 0.2, 7), colMat);
        capMesh.position.set(Math.cos(angle) * (R + 0.2), PLINTH_H + 0.44 + colH + 0.1, Math.sin(angle) * (R + 0.2));
        grp.add(capMesh);
    }
    // Emissive altar orb
    const altar = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 0.7 }));
    altar.position.set(0, PLINTH_H + 0.35, 0);
    grp.add(altar);
    return grp;
}
/** City hall — render + stone 3 floors, flat parapet, central spire. */
function _makeCityHall(rand) {
    const grp = new THREE.Group();
    const w = 9.0 + rand() * 2.0;
    const d = 6.0 + rand() * 1.0;
    const flH = [2.7, 2.4, 2.2];
    const wallTint = _renderColor(rand);
    const trimColor = 0x3a3028;
    const trimM = _flatMat(trimColor);
    const spireMat = _flatMat(0x6a7a88);
    _addPlinth(grp, w, d);
    let y = PLINTH_H;
    for (let f = 0; f < 3; f++) {
        const fw = w - f * 0.3, fd = d - f * 0.2;
        const fMat = _wallMat(renderTexture, fw, flH[f], wallTint);
        _addWalls(grp, fw, flH[f], fd, fMat);
        if (f < 2) {
            const band = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.15, 0.2, fd + 0.15), trimM);
            band.position.y = y + flH[f];
            grp.add(band);
        }
        y += flH[f];
    }
    // Flat parapet
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.55, d - 0.5), _flatMat(0x4a4438));
    parapet.position.y = y + 0.28;
    grp.add(parapet);
    // Central spire
    const spireH = 4.2 + rand() * 0.8;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.65, spireH, 7), spireMat);
    spire.position.y = y + 0.55 + spireH / 2;
    grp.add(spire);
    // Front door
    _addDoor(grp, 0, 0, 1.2, 2.5, d / 2 + WT / 2, 0x2a1a0e, trimColor);
    // Windows per floor
    let fy = PLINTH_H;
    for (let f = 0; f < 3; f++) {
        const cy = fy + flH[f] * 0.55;
        const fw = w - f * 0.3, fd = d - f * 0.2;
        const frontZ = fd / 2 + WT / 2 + 0.01;
        const n = 3;
        for (let wi = 0; wi < n; wi++) {
            const wx = (wi - (n - 1) / 2) * (fw / (n + 1));
            if (f === 0 && Math.abs(wx) < 0.9)
                continue;
            _addWindow(grp, wx, cy, frontZ, 0, 0.7, 1.0, trimM);
            _addWindow(grp, wx, cy, -frontZ, Math.PI, 0.7, 1.0, trimM);
        }
        fy += flH[f];
    }
    return grp;
}
/** Guard tower — stone cylinder, battlements. */
function _makeGuardTower(rand) {
    const grp = new THREE.Group();
    const r = 1.3 + rand() * 0.3;
    const floors = 4 + Math.floor(rand() * 2);
    const fh = 2.3;
    const totalH = floors * fh;
    const stoneMat = new THREE.MeshLambertMaterial({
        map: stoneTexture(2, 3),
        color: _stoneColor(rand),
    });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, totalH, 10), stoneMat);
    cyl.position.y = totalH / 2;
    grp.add(cyl);
    const topSlab = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.2, r + 0.2, 0.22, 10), stoneMat);
    topSlab.position.y = totalH + 0.11;
    grp.add(topSlab);
    const MERLONS = 8;
    for (let i = 0; i < MERLONS; i++) {
        const angle = (i / MERLONS) * Math.PI * 2;
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.26), stoneMat);
        merlon.position.set(Math.cos(angle) * (r - 0.02), totalH + 0.25 + 0.22, Math.sin(angle) * (r - 0.02));
        merlon.rotation.y = angle;
        grp.add(merlon);
    }
    _addDoor(grp, 0, 0, 0.7, 1.5, r + WT / 2, 0x201508, 0x3a2a18);
    return grp;
}
/** Village well — stone surround, A-frame, cone roof cap, bucket. */
function _makeWell(rand) {
    const grp = new THREE.Group();
    const wood = _flatMat(0x5c3d1e);
    const surround = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.78, 0.6, 10), new THREE.MeshLambertMaterial({
        map: stoneTexture(1, 1),
        color: new THREE.Color(0.5, 0.44, 0.38),
    }));
    surround.position.y = 0.3;
    grp.add(surround);
    for (const sx of [-0.5, 0.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.4, 5), wood);
        post.position.set(sx, 0.95, 0);
        post.rotation.z = sx * 0.22;
        grp.add(post);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5), wood);
    beam.rotation.z = Math.PI / 2;
    beam.position.y = 1.55;
    grp.add(beam);
    const roofCone = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.9, 8), new THREE.MeshLambertMaterial({
        map: slateTexture(1, 1),
        color: _slateColor(rand),
        side: THREE.DoubleSide,
    }));
    roofCone.position.y = 1.55 + 0.45;
    grp.add(roofCone);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), _flatMat(0x8a6a30));
    rope.position.set(0, 1.05, 0);
    grp.add(rope);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 7), _flatMat(0x5c3d1e));
    bucket.position.set(0, 0.55, 0);
    grp.add(bucket);
    return grp;
}
/** Market cross — stone plinth steps, column shaft, cross-arm. */
function _makeMarketCross(rand) {
    const grp = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({
        map: stoneTexture(1, 2),
        color: new THREE.Color(0.68 + (rand() - 0.5) * 0.06, 0.64, 0.57),
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), stone);
    base.position.y = 0.2;
    grp.add(base);
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.95), stone);
    step.position.y = 0.51;
    grp.add(step);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2, 7), stone);
    shaft.position.y = 0.72 + 1.6;
    grp.add(shaft);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.14), stone);
    arm.position.y = 0.72 + 3.0;
    grp.add(arm);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.14), stone);
    cap.position.y = 0.72 + 3.2 + 0.19;
    grp.add(cap);
    return grp;
}
