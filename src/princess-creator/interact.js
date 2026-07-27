// ── Direct manipulation: hover glow, wheel-scale, drag to move/tear off ─────
//
//  The Spore feel: point at a thing → it glows and tells you what it is;
//  scroll → it grows/shrinks; grab a part and pull it off → it flushes red
//  and falls away; drop a hand item on the other hand → it swaps.
//
//  Everything maps to DNA edits through the store, so undo/redo, share codes
//  and rebuilds keep working — the manipulator owns zero persistent state.
//
//  Pure decision logic (wheelTargetFor / tiltTargetFor / resolveDrop /
//  removalFor) is exported for unit tests; DOM wiring stays thin.
import * as THREE from 'three';
import { RANGES } from './types';
export const DRAGGABLE = ['crown', 'ears', 'tail', 'back', 'handL', 'handR', 'hair'];
/** Regions you can grab and PULL bigger/smaller (Spore's inflate feel). */
export const PULLABLE = ['head', 'dress', 'body', 'arm', 'leg', 'face'];
/** Dropping a palette color onto a pickable retints exactly one slot. */
export function paintSlotFor(pick) {
    switch (pick) {
        case 'dress': return 'primary';
        case 'hair': return 'hair';
        case 'face': return 'eyes';
        case 'crown': return 'metal';
        case 'handL':
        case 'handR': return 'metal';
        case 'back': return 'accent';
        case 'ears':
        case 'tail':
        case 'head':
        case 'arm':
        case 'leg':
        case 'body': return 'skin';
    }
}
const LABEL = {
    crown: 'crown', ears: 'ears', tail: 'tail', back: 'back item',
    handL: 'left hand', handR: 'right hand', hair: 'hair',
    head: 'head', face: 'eyes', dress: 'dress', arm: 'arms', leg: 'legs', body: 'body',
};
/** Scroll over a pickable → which DNA dial does it turn? */
export function wheelTargetFor(pick) {
    switch (pick) {
        case 'crown': return { path: 'parts.crownSize', range: RANGES.parts.crownSize };
        case 'ears': return { path: 'parts.earSize', range: RANGES.parts.earSize };
        case 'tail': return { path: 'parts.tailSize', range: RANGES.parts.tailSize };
        case 'back': return { path: 'parts.backSize', range: RANGES.parts.backSize };
        case 'handL':
        case 'handR': return { path: 'parts.handSize', range: RANGES.parts.handSize };
        case 'hair': return { path: 'hair.length', range: RANGES.hair.length };
        case 'head': return { path: 'body.headSize', range: RANGES.body.headSize };
        case 'face': return { path: 'face.eyeSize', range: RANGES.face.eyeSize };
        case 'dress': return { path: 'dress.flare', range: RANGES.dress.flare };
        case 'arm': return { path: 'body.armLength', range: RANGES.body.armLength };
        case 'leg': return { path: 'body.legLength', range: RANGES.body.legLength };
        case 'body': return { path: 'body.chubbiness', range: RANGES.body.chubbiness };
    }
}
/** Alt+scroll → tilt, where a tilt dial exists. */
export function tiltTargetFor(pick) {
    if (pick === 'crown')
        return { path: 'parts.crownTilt', range: RANGES.parts.crownTilt };
    if (pick === 'face')
        return { path: 'face.eyeTilt', range: RANGES.face.eyeTilt };
    return null;
}
/** Tearing a part off → which DNA field goes to what. */
export function removalFor(pick) {
    switch (pick) {
        case 'crown': return { path: 'parts.crown', value: 'none' };
        case 'ears': return { path: 'parts.ears', value: 'none' };
        case 'tail': return { path: 'parts.tail', value: 'none' };
        case 'back': return { path: 'parts.back', value: 'none' };
        case 'handL': return { path: 'parts.handL', value: 'none' };
        case 'handR': return { path: 'parts.handR', value: 'none' };
        case 'hair': return { path: 'hair.style', value: 'none' };
        default: return null;
    }
}
/** Release a dragged part → what happens? (pure, unit-tested) */
export function resolveDrop(pick, target) {
    if (target === 'home')
        return { kind: 'cancel' };
    if ((pick === 'handL' || pick === 'handR') && (target === 'handL' || target === 'handR')) {
        return target === pick ? { kind: 'cancel' } : { kind: 'swapHands' };
    }
    if (target === null) {
        const removal = removalFor(pick);
        return removal ? { kind: 'remove', ...removal } : { kind: 'cancel' };
    }
    return { kind: 'cancel' };
}
// ── Scene tagging ────────────────────────────────────────────────────────────
/**
 * Tags body regions on the rig (parts tag themselves in parts.ts) and returns
 * the flat pickable mesh list with resolved pick ids for raycasting.
 */
export function tagPickables(result) {
    const { rig, sockets } = result;
    rig.head.userData.pick = 'head';
    rig.torso.userData.pick = 'body';
    sockets.face.userData.pick = 'face';
    const dress = rig.torso.getObjectByName('dress');
    if (dress)
        dress.userData.pick = 'dress';
    for (const s of rig.shoulders)
        s.userData.pick = 'arm';
    for (const e of rig.elbows)
        e.userData.pick = 'arm';
    for (const h of rig.hips)
        h.userData.pick = 'leg';
    for (const k of rig.knees)
        k.userData.pick = 'leg';
    const mc = result.root.getObjectByName('slimeBody');
    if (mc)
        mc.userData.pick = 'body';
    const map = new Map();
    result.root.traverse((obj) => {
        const mesh = obj;
        if (!mesh.isMesh)
            return;
        let cur = obj;
        while (cur) {
            const pick = cur.userData.pick;
            if (pick) {
                map.set(mesh, pick);
                return;
            }
            cur = cur.parent;
        }
    });
    return map;
}
/** Nearest ancestor (or self) carrying a pick tag — the manipulation handle. */
function pickGroupOf(obj) {
    let cur = obj;
    while (cur) {
        if (cur.userData.pick)
            return cur;
        cur = cur.parent;
    }
    return null;
}
// ── Hover highlight (material swap; kit materials stay untouched) ───────────
class HighlightSwap {
    cloneCache = new Map();
    swapped = [];
    apply(meshes) {
        this.clear();
        for (const mesh of meshes) {
            const orig = mesh.material;
            if (Array.isArray(orig))
                continue;
            let glow = this.cloneCache.get(orig.uuid);
            if (!glow) {
                glow = orig.clone();
                const g = glow;
                if ('emissive' in g) {
                    g.emissive = new THREE.Color('#ffb84d');
                    g.emissiveIntensity = 0.35;
                }
                else if ('color' in glow) {
                    glow.color.multiplyScalar(1.5);
                }
                this.cloneCache.set(orig.uuid, glow);
            }
            this.swapped.push({ mesh, original: orig });
            mesh.material = glow;
        }
    }
    pulse(t) {
        for (const m of this.cloneCache.values()) {
            const std = m;
            if ('emissiveIntensity' in std)
                std.emissiveIntensity = 0.3 + Math.sin(t * 7) * 0.15;
        }
    }
    clear() {
        for (const { mesh, original } of this.swapped)
            mesh.material = original;
        this.swapped.length = 0;
    }
    dispose() {
        this.clear();
        for (const m of this.cloneCache.values())
            m.dispose();
        this.cloneCache.clear();
    }
}
// ── The manipulator ──────────────────────────────────────────────────────────
const SNAP_PX = 95; // screen-space snap radius (drags happen on screen)
const DRAG_START_PX = 7;
export class DirectManipulator {
    stage;
    store;
    result = null;
    pickMap = new Map();
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    hovered = null;
    highlight = new HighlightSwap();
    pending = null;
    drag = null;
    pendingPull = null;
    pulling = null;
    paint = null;
    wheelEndTimer = null;
    lastPointer = null;
    tip;
    snapMarker;
    tearMat = new THREE.MeshBasicMaterial({ color: '#ff5468', transparent: true, opacity: 0.85 });
    disposers = [];
    constructor(stage, store) {
        this.stage = stage;
        this.store = store;
        this.tip = document.createElement('div');
        this.tip.id = 'pick-tip';
        this.tip.style.cssText =
            'position:fixed;z-index:30;pointer-events:none;display:none;' +
                'background:rgba(22,17,38,0.92);border:1px solid rgba(232,182,76,0.35);' +
                'border-radius:8px;padding:4px 9px;font:600 10.5px Quicksand,sans-serif;' +
                'color:#efe9ff;white-space:nowrap;backdrop-filter:blur(6px)';
        document.body.appendChild(this.tip);
        this.snapMarker = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({
            color: '#ffe08a', transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.snapMarker.visible = false;
        stage.scene.add(this.snapMarker);
        const canvas = stage.renderer.domElement;
        const onMove = (e) => this.onPointerMove(e, canvas);
        const onDown = (e) => this.onPointerDown(e, canvas);
        const onUp = (e) => this.onPointerUp(e);
        const onWheel = (e) => this.onWheel(e, canvas);
        const onKey = (e) => {
            if (e.key !== 'Escape')
                return;
            if (this.drag)
                this.cancelDrag(true);
            if (this.pulling)
                this.cancelPull();
            if (this.paint)
                this.endPaintDrag(null);
        };
        // Capture phase on window → we run before OrbitControls' canvas listeners.
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerdown', onDown, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('wheel', onWheel, { capture: true, passive: false });
        window.addEventListener('keydown', onKey);
        this.disposers.push(() => {
            window.removeEventListener('pointermove', onMove, true);
            window.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('wheel', onWheel, true);
            window.removeEventListener('keydown', onKey);
        });
    }
    /** Call after every rebuild — re-tags the new tree and drops stale state. */
    bind(result) {
        if (this.drag)
            this.cancelDrag(false); // old tree is gone; nothing to unhide
        this.highlight.dispose();
        this.hovered = null;
        this.pending = null;
        this.tip.style.display = 'none';
        this.result = result;
        this.pickMap = tagPickables(result);
        // Re-acquire hover at the current pointer position: wheel edits rebuild
        // the tree every notch, and without this the next notch would fall
        // through to camera zoom. The fresh tree hasn't rendered yet, so its
        // world matrices are still identity — compute them before raycasting.
        if (this.lastPointer?.overCanvas) {
            result.root.updateWorldMatrix(true, true);
            const canvas = this.stage.renderer.domElement;
            const hit = this.raycastAt(this.lastPointer.x, this.lastPointer.y, canvas);
            this.applyHover(hit, this.lastPointer.x, this.lastPointer.y);
        }
    }
    update(t) {
        this.highlight.pulse(t);
        if (this.snapMarker.visible) {
            const s = 1 + Math.sin(t * 8) * 0.18;
            this.snapMarker.scale.setScalar(s);
        }
    }
    // ── Hover ──
    onPointerMove(e, canvas) {
        if (this.paint) {
            this.paint.ghost.style.left = `${e.clientX - 9}px`;
            this.paint.ghost.style.top = `${e.clientY - 9}px`;
            return;
        }
        if (this.pulling) {
            const { target, startValue, startY, pick } = this.pulling;
            const span = target.range.max - target.range.min;
            const value = startValue + ((startY - e.clientY) / 240) * span;
            this.store.set(target.path, value, 'none');
            this.tip.textContent = `${LABEL[pick]} — pull ↑ bigger · ↓ smaller · esc cancels`;
            this.tip.style.display = 'block';
            this.tip.style.left = `${e.clientX + 16}px`;
            this.tip.style.top = `${e.clientY + 20}px`;
            return;
        }
        if (this.pendingPull) {
            if (Math.abs(e.clientY - this.pendingPull.y) > 5) {
                const pick = this.pendingPull.pick;
                const target = wheelTargetFor(pick);
                const startValue = target.path.split('.').reduce((o, k) => o[k], this.store.dna);
                this.store.beginDrag();
                this.pulling = { pick, target, startValue, startY: this.pendingPull.y };
                this.pendingPull = null;
                this.highlight.clear();
                canvas.style.cursor = 'ns-resize';
            }
            return;
        }
        if (this.drag) {
            this.moveDrag(e, canvas);
            return;
        }
        if (this.pending) {
            const dx = e.clientX - this.pending.x;
            const dy = e.clientY - this.pending.y;
            if (Math.hypot(dx, dy) > DRAG_START_PX)
                this.startDrag(e, canvas);
            return;
        }
        this.lastPointer = { x: e.clientX, y: e.clientY, overCanvas: e.target === canvas };
        if (e.target !== canvas || !this.result) {
            this.applyHover(null, e.clientX, e.clientY);
            return;
        }
        const hit = this.raycastAt(e.clientX, e.clientY, canvas);
        this.applyHover(hit, e.clientX, e.clientY);
    }
    raycastAt(clientX, clientY, canvas) {
        const rect = canvas.getBoundingClientRect();
        this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.stage.camera);
        const meshes = [...this.pickMap.keys()].filter((m) => m.visible);
        const hits = this.raycaster.intersectObjects(meshes, false);
        if (hits.length === 0)
            return null;
        const mesh = hits[0].object;
        const pick = this.pickMap.get(mesh);
        const group = pickGroupOf(mesh);
        if (!pick || !group)
            return null;
        return { pick, group, mesh };
    }
    applyHover(hit, clientX, clientY) {
        const canvas = this.stage.renderer.domElement;
        if (!hit) {
            if (this.hovered) {
                this.highlight.clear();
                this.hovered = null;
                this.tip.style.display = 'none';
                canvas.style.cursor = 'default';
            }
            return;
        }
        if (!this.hovered || this.hovered.group !== hit.group || this.hovered.pick !== hit.pick) {
            this.hovered = { pick: hit.pick, group: hit.group };
            const meshes = [];
            for (const [mesh, pick] of this.pickMap) {
                if (pick !== hit.pick)
                    continue;
                // Highlight the whole pick family (both ears, all dress meshes…).
                meshes.push(mesh);
            }
            this.highlight.apply(meshes);
            const draggable = DRAGGABLE.includes(hit.pick);
            const tilt = tiltTargetFor(hit.pick) ? ' · alt+scroll tilt' : '';
            this.tip.textContent =
                `${LABEL[hit.pick]}  —  scroll size${tilt}${draggable ? ' · drag to move / tear off' : ''}`;
            this.tip.style.display = 'block';
            canvas.style.cursor = draggable ? 'grab' : 'ns-resize';
        }
        this.tip.style.left = `${clientX + 16}px`;
        this.tip.style.top = `${clientY + 20}px`;
    }
    // ── Wheel scale / tilt ──
    onWheel(e, canvas) {
        if (e.target !== canvas || !this.hovered || this.drag)
            return;
        const target = e.altKey
            ? tiltTargetFor(this.hovered.pick) ?? wheelTargetFor(this.hovered.pick)
            : wheelTargetFor(this.hovered.pick);
        e.preventDefault();
        e.stopPropagation(); // keep OrbitControls from zooming
        const step = (target.range.max - target.range.min) * 0.05 * (e.deltaY > 0 ? -1 : 1);
        const cur = target.path.split('.').reduce((o, k) => o[k], this.store.dna);
        this.store.beginDrag();
        this.store.set(target.path, cur + step, 'none');
        if (this.wheelEndTimer)
            clearTimeout(this.wheelEndTimer);
        this.wheelEndTimer = setTimeout(() => this.store.endDrag(), 450);
    }
    // ── Drag / pull ──
    onPointerDown(e, canvas) {
        if (e.target !== canvas || e.button !== 0 || !this.hovered)
            return;
        if (DRAGGABLE.includes(this.hovered.pick)) {
            this.pending = {
                x: e.clientX, y: e.clientY,
                pick: this.hovered.pick, group: this.hovered.group,
            };
            this.stage.controls.enabled = false;
        }
        else if (PULLABLE.includes(this.hovered.pick)) {
            this.pendingPull = { y: e.clientY, pick: this.hovered.pick };
            this.stage.controls.enabled = false;
        }
    }
    startDrag(e, canvas) {
        if (!this.pending)
            return;
        const { pick, group } = this.pending;
        this.pending = null;
        this.highlight.clear();
        const worldPos = new THREE.Vector3();
        group.getWorldPosition(worldPos);
        const ghost = group.clone(true);
        ghost.position.copy(worldPos);
        const worldQuat = new THREE.Quaternion();
        group.getWorldQuaternion(worldQuat);
        ghost.quaternion.copy(worldQuat);
        const worldScale = new THREE.Vector3();
        group.getWorldScale(worldScale);
        ghost.scale.copy(worldScale);
        this.stage.scene.add(ghost);
        group.visible = false;
        const normal = new THREE.Vector3();
        this.stage.camera.getWorldDirection(normal);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, worldPos);
        this.drag = { pick, sourceGroup: group, ghost, plane, tinted: false, ghostOriginals: [] };
        ghost.traverse((o) => {
            const mesh = o;
            if (mesh.isMesh)
                this.drag.ghostOriginals.push({ mesh, material: mesh.material });
        });
        this.stage.renderer.domElement.style.cursor = 'grabbing';
        this.moveDrag(e, canvas);
    }
    /** Project a world position to canvas pixel coordinates. */
    toScreen(world) {
        const rect = this.stage.renderer.domElement.getBoundingClientRect();
        const p = world.clone().project(this.stage.camera);
        return new THREE.Vector2((p.x * 0.5 + 0.5) * rect.width + rect.left, (-p.y * 0.5 + 0.5) * rect.height + rect.top);
    }
    /**
     * Drop candidates are compared in SCREEN space — the user drags on screen,
     * and world-space distances get distorted by the camera-parallel drag plane.
     */
    dropTarget() {
        if (!this.drag || !this.result)
            return { target: null, pos: null };
        const ghostS = this.toScreen(this.drag.ghost.position);
        const tmp = new THREE.Vector3();
        const candidates = [];
        const homeSocket = this.drag.sourceGroup.parent;
        if (homeSocket) {
            homeSocket.getWorldPosition(tmp);
            candidates.push({ target: 'home', dist: ghostS.distanceTo(this.toScreen(tmp)), pos: tmp.clone() });
        }
        if (this.drag.pick === 'handL' || this.drag.pick === 'handR') {
            for (const id of ['handL', 'handR']) {
                this.result.sockets[id].getWorldPosition(tmp);
                candidates.push({ target: id, dist: ghostS.distanceTo(this.toScreen(tmp)), pos: tmp.clone() });
            }
        }
        candidates.sort((a, b) => a.dist - b.dist);
        const best = candidates[0];
        if (best && best.dist < SNAP_PX)
            return { target: best.target, pos: best.pos };
        return { target: null, pos: null };
    }
    moveDrag(e, canvas) {
        if (!this.drag)
            return;
        const rect = canvas.getBoundingClientRect();
        this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.stage.camera);
        const point = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.drag.plane, point)) {
            this.drag.ghost.position.copy(point);
        }
        const { target, pos } = this.dropTarget();
        const tearing = target === null;
        if (pos && !tearing) {
            this.snapMarker.visible = true;
            this.snapMarker.position.copy(pos);
        }
        else {
            this.snapMarker.visible = false;
        }
        if (tearing && !this.drag.tinted) {
            for (const { mesh } of this.drag.ghostOriginals)
                mesh.material = this.tearMat;
            this.drag.tinted = true;
        }
        else if (!tearing && this.drag.tinted) {
            for (const { mesh, material } of this.drag.ghostOriginals)
                mesh.material = material;
            this.drag.tinted = false;
        }
        this.tip.textContent = tearing
            ? `release to remove ${LABEL[this.drag.pick]}`
            : target === 'home' || target === this.drag.pick
                ? 'release to put back'
                : `release to move to ${LABEL[target] ?? target}`;
        this.tip.style.display = 'block';
        this.tip.style.left = `${e.clientX + 16}px`;
        this.tip.style.top = `${e.clientY + 20}px`;
    }
    onPointerUp(e) {
        if (this.paint) {
            this.endPaintDrag(e ?? null);
            return;
        }
        if (this.pulling) {
            this.store.endDrag();
            this.pulling = null;
            this.stage.controls.enabled = true;
            this.tip.style.display = 'none';
            return;
        }
        if (this.pendingPull) {
            this.pendingPull = null;
            this.stage.controls.enabled = true;
            return;
        }
        if (this.pending) {
            this.pending = null;
            this.stage.controls.enabled = true;
            return;
        }
        if (!this.drag)
            return;
        const { target } = this.dropTarget();
        const action = resolveDrop(this.drag.pick, target);
        const sourceGroup = this.drag.sourceGroup;
        this.teardownDragVisuals();
        if (action.kind === 'remove') {
            this.store.set(action.path, action.value); // rebuild removes the part
        }
        else if (action.kind === 'swapHands') {
            const dna = this.store.dna;
            const l = dna.parts.handL;
            const r = dna.parts.handR;
            this.store.beginDrag();
            this.store.set('parts.handL', r, 'none');
            this.store.set('parts.handR', l, 'none');
            this.store.endDrag();
        }
        else {
            sourceGroup.visible = true; // simple cancel — no rebuild needed
        }
    }
    cancelDrag(unhide) {
        if (!this.drag)
            return;
        const source = this.drag.sourceGroup;
        this.teardownDragVisuals();
        if (unhide)
            source.visible = true;
    }
    cancelPull() {
        if (!this.pulling)
            return;
        this.store.set(this.pulling.target.path, this.pulling.startValue, 'none');
        this.store.endDrag();
        this.pulling = null;
        this.stage.controls.enabled = true;
        this.tip.style.display = 'none';
    }
    // ── Paint drop (palette dot → region) ──
    /** Called by the UI when a palette dot starts being dragged. */
    startPaintDrag(hex) {
        if (this.paint)
            this.endPaintDrag(null);
        const ghost = document.createElement('div');
        ghost.style.cssText =
            'position:fixed;z-index:40;width:18px;height:18px;border-radius:50%;' +
                `background:${hex};border:2px solid rgba(255,255,255,0.8);` +
                'pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.5);left:-30px;top:-30px';
        document.body.appendChild(ghost);
        this.paint = { hex, ghost };
        this.stage.controls.enabled = false;
    }
    endPaintDrag(e) {
        if (!this.paint)
            return;
        const { hex, ghost } = this.paint;
        ghost.remove();
        this.paint = null;
        this.stage.controls.enabled = true;
        const canvas = this.stage.renderer.domElement;
        if (e && e.target === canvas) {
            const hit = this.raycastAt(e.clientX, e.clientY, canvas);
            if (hit) {
                const slot = paintSlotFor(hit.pick);
                this.store.set(`colors.${slot}`, hex); // cosmetic fast-path + one undo
            }
        }
    }
    /** Removes ghost + marker, re-enables controls. Never touches DNA. */
    teardownDragVisuals() {
        if (!this.drag)
            return;
        this.stage.scene.remove(this.drag.ghost); // clone shares geometry: no dispose
        this.drag = null;
        this.snapMarker.visible = false;
        this.stage.controls.enabled = true;
        this.stage.renderer.domElement.style.cursor = 'default';
        this.tip.style.display = 'none';
    }
    dispose() {
        for (const d of this.disposers)
            d();
        this.highlight.dispose();
        this.tearMat.dispose();
        this.snapMarker.geometry.dispose();
        this.snapMarker.material.dispose();
        this.stage.scene.remove(this.snapMarker);
        this.tip.remove();
    }
}
