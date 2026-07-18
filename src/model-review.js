/**
 * model-review.ts — Standalone model inspection tool.
 *
 * Served at /model-review.html (Vite MPA entry).
 *
 * Query params:
 *   ?model=<url>        — load a single model GLB
 *   ?animRig=<url>      — companion animation GLB (retargeted)
 *   ?pack=<packId>      — show all models in a pack (first loaded automatically)
 *   ?role=enemy|npc|player|all — filter model list by role
 *
 * window.__modelReview API (for Playwright):
 *   .ready       — true once Three.js scene is initialised
 *   .loaded      — true when the current model is fully loaded
 *   .stats       — model diagnostics (see ModelStats)
 *   .loadModel(path, animRigPath?)  → Promise<ModelStats>
 *   .playAnim(clipName: string)     — play a named clip ('' = stop)
 *   .setAngle('front'|'side'|'iso'|'top')
 *   .nextModel() / .prevModel()
 *   .currentIndex — 0-based index in the filtered list
 *   .modelList    — array of { id, name, path } for the current filter
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHAR_MODELS, CHAR_PACKS } from '@/characters/charManifest';
import { loadCharModel, getCharModelBounds } from '@/characters/CharacterLoader';
import { ENV_ASSETS, ENV_CATEGORIES, ENV_KITS } from '@/assets/envManifest';
import { EditorCore } from '@/editor/EditorCore';
import { EditorSerializer } from '@/editor/EditorSerializer';
import { TowerFloorEditor } from '@/editor/TowerFloorEditor';
import { BuildingEditor } from '@/editor/BuildingEditor';
import { DungeonEditor } from '@/editor/DungeonEditor';
import { OverworldEditor } from '@/editor/OverworldEditor';
// ── Scene setup ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const wrap = document.getElementById('viewport-wrap');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141820);
scene.fog = null; // no fog in the viewer
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
camera.position.set(0, 1.5, 4.5);
camera.lookAt(0, 1, 0);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.1;
orbit.target.set(0, 1, 0);
// ── Lights ────────────────────────────────────────────────────────────────────
// Generous ambient so vertex-colour models read clearly.
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sunLight = new THREE.DirectionalLight(0xfff8f0, 1.8);
sunLight.position.set(3, 6, 4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 0.1;
sunLight.shadow.camera.far = 50;
sunLight.shadow.camera.left = -5;
sunLight.shadow.camera.right = 5;
sunLight.shadow.camera.top = 8;
sunLight.shadow.camera.bottom = -1;
scene.add(sunLight);
// Fill light from opposite side.
const fillLight = new THREE.DirectionalLight(0xd0e0ff, 0.5);
fillLight.position.set(-4, 3, -3);
scene.add(fillLight);
// Rim / back-light to silhouette the model.
const rimLight = new THREE.DirectionalLight(0xc080ff, 0.4);
rimLight.position.set(0, 4, -5);
scene.add(rimLight);
// Ground plane (shadow catcher + neutral grey).
const groundGeo = new THREE.PlaneGeometry(12, 12);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.3, color: 0x000000 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// Subtle grid for scale reference.
const grid = new THREE.GridHelper(10, 10, 0x2a2040, 0x1a1030);
grid.position.y = 0.001;
scene.add(grid);
// ── GLTF Loader (removed — using CharacterLoader instead) ────────────────────
// ── State ─────────────────────────────────────────────────────────────────────
let _currentGroup = null;
let _mixer = null;
let _clips = [];
let _currentAction = null;
let _stats = null;
let _loaded = false;
let _currentIdx = 0;
let _roleFilter = 'all';
let _textFilter = '';
/** When true (default), the list shows only models with animations. */
let _animatedOnly = true;
let _filteredModels = [];
const clock = new THREE.Clock();
// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingOverlay = document.getElementById('loading-overlay');
const errorBanner = document.getElementById('error-banner');
const modelListEl = document.getElementById('model-list');
const modelTitleEl = document.getElementById('model-title');
const statsGridEl = document.getElementById('stats-grid');
const animControlsEl = document.getElementById('anim-controls');
const scaleInfoEl = document.getElementById('scale-info');
// ── Model loading ─────────────────────────────────────────────────────────────
async function loadModel(def) {
    _loaded = false;
    loadingOverlay.classList.remove('hidden');
    errorBanner.style.display = 'none';
    // Clear previous model
    if (_currentGroup) {
        scene.remove(_currentGroup);
        _currentGroup = null;
    }
    if (_mixer) {
        _mixer.stopAllAction();
        _mixer = null;
    }
    _clips = [];
    _currentAction = null;
    const errors = [];
    const warnings = [];
    let meshCount = 0, matCount = 0, texCount = 0, opaqueMats = 0, brokenAlpha = 0;
    let hasVC = false;
    let clipNames = [];
    let rawH = 0, rawW = 0, rawD = 0, normScale = 1;
    try {
        // Use CharacterLoader — handles KayKit animation rig retargeting,
        // skeleton cloning, and both GLB/FBX formats uniformly.
        const loaded = await loadCharModel(def);
        const root = loaded.scene;
        // ── Analyse geometry & materials ─────────────────────────────────────
        root.traverse(obj => {
            if (!(obj instanceof THREE.Mesh))
                return;
            obj.castShadow = true;
            obj.receiveShadow = true;
            meshCount++;
            const geom = obj.geometry;
            if (geom.attributes['color'] || geom.attributes['COLOR_0'])
                hasVC = true;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
                matCount++;
                if (!(mat instanceof THREE.MeshStandardMaterial ||
                    mat instanceof THREE.MeshPhysicalMaterial ||
                    mat instanceof THREE.MeshBasicMaterial))
                    continue;
                const m = mat;
                if (m.map)
                    texCount++;
                if (m.normalMap)
                    texCount++;
                if (m.metalnessMap)
                    texCount++;
                if ((m.transparent && m.opacity < 0.05) || (m.alphaTest > 0.01 && !m.map)) {
                    brokenAlpha++;
                    warnings.push(`Mat "${m.name}": broken alpha (auto-fixed) transparent=${m.transparent} alphaTest=${m.alphaTest.toFixed(2)}`);
                    m.transparent = false;
                    m.alphaTest = 0;
                    m.needsUpdate = true;
                }
                else {
                    opaqueMats++;
                }
                if (hasVC && !m.vertexColors) {
                    m.vertexColors = true;
                    m.needsUpdate = true;
                }
            }
        });
        // ── Wire AnimationMixer ───────────────────────────────────────────────
        if (loaded.mixer && loaded.clips.length > 0) {
            _mixer = loaded.mixer;
            _clips = loaded.clips;
            clipNames = loaded.clips.map(c => c.name);
            // Auto-play idle clip.
            const idle = loaded.clips.find(c => /idle/i.test(c.name)) ?? loaded.clips[0];
            _currentAction = _mixer.clipAction(idle);
            _currentAction.play();
        }
        else {
            // No clips from CharacterLoader — this is a static mesh.
            if (def.animated) {
                warnings.push('Expected animations (animated=true in manifest) but none loaded');
            }
            else {
                warnings.push('Static mesh — no animations (expected for this pack)');
            }
        }
        // ── Scale & position ──────────────────────────────────────────────────
        // Use getCharModelBounds() which reads bounds from the ORIGINAL cached
        // GLTF scene (initialized by Three.js's loader with correct world matrices).
        // This is critical for Meshy AI / wizard models whose bind-pose geometry is
        // tiny (cm-scale) while the real character height is encoded in bone offsets.
        const boundsBox = await getCharModelBounds(def);
        const sz = new THREE.Vector3();
        boundsBox.getSize(sz);
        rawH = sz.y;
        rawW = sz.x;
        rawD = sz.z;
        normScale = rawH > 0.01 ? 2.0 / rawH : 1;
        root.scale.setScalar(normScale);
        // Add to scene and centre.
        _currentGroup = root;
        scene.add(root);
        const centredBox = new THREE.Box3().setFromObject(root);
        const centre = new THREE.Vector3();
        centredBox.getCenter(centre);
        root.position.x -= centre.x;
        root.position.y -= centredBox.min.y;
        root.position.z -= centre.z;
        sunLight.shadow.camera.far = Math.max(20, rawH * normScale * 4);
        sunLight.shadow.camera.updateProjectionMatrix();
        // ── Auto-frame camera ─────────────────────────────────────────────────
        // Use generous distance so the full body is always visible with margin.
        // Formula: at 45° FoV, visible height at distance D = 2*tan(22.5°)*D ≈ 0.83*D
        // We want visible height ≥ modelH * 1.4 (40% margin), so D ≥ modelH * 1.69.
        // Use 2.2× height and 2.5× width so even wide characters frame nicely.
        const scaledSz = sz.multiplyScalar(normScale);
        const modelH = scaledSz.y;
        const maxHW = Math.max(scaledSz.x, scaledSz.z);
        const dist = Math.max(maxHW * 2.5, modelH * 2.2, 2.5);
        camera.position.set(0, modelH * 0.5, dist);
        orbit.target.set(0, modelH * 0.45, 0);
        orbit.update();
        if (rawH > 0.01) {
            scaleInfoEl.textContent = `raw ${rawH.toFixed(2)}m × ${normScale.toFixed(3)} = 2.0 WU`;
        }
    }
    catch (e) {
        const msg = e.message;
        errors.push(msg);
        errorBanner.textContent = `Load error: ${msg}`;
        errorBanner.style.display = 'block';
    }
    const pack = CHAR_PACKS.find(p => p.id === def.packId);
    _stats = {
        modelId: def.id,
        modelPath: def.path,
        animRigPath: def.animRig ?? null,
        packName: pack?.name ?? def.packId,
        meshCount, materialCount: matCount, textureCount: texCount,
        texCount, matCount, opaqueMats,
        brokenAlphaMats: brokenAlpha,
        hasVertexColors: hasVC,
        clipNames, rawBoundsH: rawH, rawBoundsW: rawW, rawBoundsD: rawD,
        normScale, errors, warnings,
    };
    _loaded = true;
    loadingOverlay.classList.add('hidden');
    _updateUI(def);
    _updateListHighlight();
    return _stats;
}
// ── Camera angle presets ──────────────────────────────────────────────────────
function setAngle(preset) {
    if (!_stats)
        return;
    const h = _stats.rawBoundsH * _stats.normScale;
    const mid = h * 0.45;
    const w = Math.max(_stats.rawBoundsW, _stats.rawBoundsD) * _stats.normScale;
    const r = Math.max(w * 2.5, h * 2.2, 2.5);
    switch (preset) {
        case 'front':
            camera.position.set(0, mid, r);
            break;
        case 'side':
            camera.position.set(r, mid, 0);
            break;
        case 'iso':
            camera.position.set(r * 0.7, h * 0.8, r * 0.7);
            break;
        case 'top':
            camera.position.set(0, r * 1.5, 0.01);
            break;
    }
    orbit.target.set(0, mid, 0);
    orbit.update();
}
// ── Animation controls ────────────────────────────────────────────────────────
function playAnim(clipName) {
    if (!_mixer)
        return;
    _mixer.stopAllAction();
    _currentAction = null;
    if (!clipName)
        return;
    const clip = _clips.find(c => c.name === clipName);
    if (!clip)
        return;
    _currentAction = _mixer.clipAction(clip);
    _currentAction.play();
    // Update button highlights
    document.querySelectorAll('.anim-btn:not(.stop)').forEach(b => {
        b.classList.toggle('playing', b.dataset['clip'] === clipName);
    });
}
// ── Model list ────────────────────────────────────────────────────────────────
function _buildFilteredList() {
    _filteredModels = CHAR_MODELS.filter(m => {
        const roleOk = _roleFilter === 'all' || m.roles.includes(_roleFilter);
        const textOk = !_textFilter || m.name.toLowerCase().includes(_textFilter) ||
            m.packId.toLowerCase().includes(_textFilter) ||
            m.tags.some(t => t.includes(_textFilter));
        const animOk = !_animatedOnly || m.animated;
        return roleOk && textOk && animOk;
    });
}
function _renderModelList() {
    _buildFilteredList();
    modelListEl.innerHTML = '';
    _filteredModels.forEach((m, i) => {
        const pack = CHAR_PACKS.find(p => p.id === m.packId);
        const li = document.createElement('li');
        li.dataset['idx'] = String(i);
        if (i === _currentIdx)
            li.classList.add('active');
        const icon = document.createElement('span');
        icon.textContent = pack?.icon ?? '📦';
        const name = document.createElement('span');
        name.textContent = m.name;
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.style.whiteSpace = 'nowrap';
        name.style.flex = '1';
        const tag = document.createElement('span');
        tag.className = 'pack-tag';
        tag.textContent = m.packId;
        li.append(icon, name, tag);
        li.onclick = () => {
            _currentIdx = i;
            loadModel(_filteredModels[i]);
            _renderModelList();
        };
        modelListEl.appendChild(li);
    });
}
function _updateListHighlight() {
    document.querySelectorAll('#model-list li').forEach((li, i) => {
        li.classList.toggle('active', i === _currentIdx);
        // Update status dot class on the active item so CSS can colour it.
        if (i === _currentIdx && _stats) {
            if (_stats.errors.length > 0) {
                li.className = 'active status-err';
            }
            else if (_stats.warnings.length > 0 || _stats.brokenAlphaMats > 0) {
                li.className = 'active status-warn';
            }
            else {
                li.className = 'active status-ok';
            }
        }
    });
}
// ── Stats panel ───────────────────────────────────────────────────────────────
function _updateUI(def) {
    if (!_stats)
        return;
    const s = _stats;
    modelTitleEl.textContent = def.name;
    modelTitleEl.title = def.path;
    const row = (label, value, cls = '') => `<span class="lbl">${label}</span><span class="val ${cls}">${value}</span>`;
    const texStatus = s.textureCount > 0
        ? `${s.textureCount} embedded`
        : s.hasVertexColors ? 'vertex colors'
            : 'none (solid color)';
    const texCls = s.textureCount > 0 ? 'ok' : s.hasVertexColors ? 'ok' : '';
    const alphaCls = s.brokenAlphaMats > 0 ? 'err' : 'ok';
    const alphaVal = s.brokenAlphaMats > 0
        ? `⚠ ${s.brokenAlphaMats} broken (auto-fixed)`
        : `✓ all opaque`;
    const animCls = s.clipNames.length > 0 ? 'ok' : 'warn';
    const animVal = s.clipNames.length > 0
        ? `${s.clipNames.length} clips`
        : 'none';
    statsGridEl.innerHTML = [
        row('Pack', s.packName),
        row('Meshes', String(s.meshCount)),
        row('Materials', String(s.materialCount)),
        row('Textures', texStatus, texCls),
        row('Alpha', alphaVal, alphaCls),
        row('Anims', animVal, animCls),
        row('Raw size', `${s.rawBoundsH.toFixed(2)} × ${s.rawBoundsW.toFixed(2)} m`),
        row('Scale', `×${s.normScale.toFixed(3)}`),
        ...(s.warnings.length > 0
            ? [row('Warnings', s.warnings.length + ' (see console)', 'warn')]
            : []),
        ...(s.errors.length > 0
            ? [row('Errors', s.errors.join('; '), 'err')]
            : []),
    ].join('');
    // Structured console output for Playwright capture.
    // Format: [model-review] <modelId> | status:<ok|warn|error> | clips:<n> | textures:<n> | warnings:[...] | errors:[...]
    const statusTag = s.errors.length > 0 ? 'error' : s.warnings.length > 0 ? 'warn' : 'ok';
    const logLine = `[model-review] ${def.id} | status:${statusTag} | clips:${s.clipNames.length} | textures:${s.textureCount} | warnings:${JSON.stringify(s.warnings)} | errors:${JSON.stringify(s.errors)}`;
    if (s.errors.length > 0)
        console.error(logLine);
    else if (s.warnings.filter(w => !w.startsWith('Static mesh')).length > 0)
        console.warn(logLine);
    else
        console.info(logLine);
    // Animation buttons
    animControlsEl.innerHTML = '';
    const stopBtn = document.createElement('button');
    stopBtn.className = 'anim-btn stop';
    stopBtn.textContent = '■ Stop';
    stopBtn.onclick = () => playAnim('');
    animControlsEl.appendChild(stopBtn);
    for (const clip of s.clipNames) {
        const btn = document.createElement('button');
        btn.className = 'anim-btn';
        btn.dataset['clip'] = clip;
        btn.textContent = clip;
        btn.onclick = () => playAnim(clip);
        // Highlight the auto-playing idle.
        if (/idle/i.test(clip) && s.clipNames.length > 0)
            btn.classList.add('playing');
        animControlsEl.appendChild(btn);
    }
}
// ── Navigation ────────────────────────────────────────────────────────────────
function navigate(dir) {
    _buildFilteredList();
    _currentIdx = ((_currentIdx + dir) + _filteredModels.length) % _filteredModels.length;
    loadModel(_filteredModels[_currentIdx]);
    _renderModelList();
}
document.getElementById('btn-prev').onclick = () => navigate(-1);
document.getElementById('btn-next').onclick = () => navigate(1);
// Camera angle buttons
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setAngle(btn.dataset['angle']);
    };
});
// Role filter buttons (skip the anim-toggle button which has an id)
document.querySelectorAll('.role-btn:not(#btn-anim-only)').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.role-btn:not(#btn-anim-only)').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _roleFilter = btn.dataset['role'];
        _currentIdx = 0;
        _renderModelList();
        if (_filteredModels.length > 0)
            loadModel(_filteredModels[0]);
    };
});
// Animated-only toggle (default ON — 🎬 active = only animated models shown)
const animOnlyBtn = document.getElementById('btn-anim-only');
animOnlyBtn.classList.add('active'); // default ON
animOnlyBtn.onclick = () => {
    _animatedOnly = !_animatedOnly;
    animOnlyBtn.classList.toggle('active', _animatedOnly);
    animOnlyBtn.title = _animatedOnly
        ? 'Showing animated models only — click to show all'
        : 'Showing all models — click to filter animated only';
    _currentIdx = 0;
    _renderModelList();
    if (_filteredModels.length > 0)
        loadModel(_filteredModels[0]);
};
// Text filter
document.getElementById('filter-inp').oninput = (e) => {
    _textFilter = e.target.value.toLowerCase();
    _currentIdx = 0;
    _renderModelList();
    if (_filteredModels.length > 0)
        loadModel(_filteredModels[0]);
};
// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(wrap);
resize();
// ── Render loop ───────────────────────────────────────────────────────────────
renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    _mixer?.update(dt);
    orbit.update();
    renderer.render(scene, camera);
});
// ── Query param initialisation ────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const qModel = params.get('model');
const qPack = params.get('pack');
const qRole = params.get('role') ?? 'all';
const qAnim = params.get('anim');
const qAngle = params.get('angle');
// Apply role filter from query param.
if (['enemy', 'npc', 'player'].includes(qRole)) {
    _roleFilter = qRole;
    document.querySelectorAll('.role-btn').forEach(b => {
        b.classList.toggle('active', b.dataset['role'] === _roleFilter);
    });
}
_buildFilteredList();
async function init() {
    _renderModelList();
    let firstDef;
    if (qModel) {
        // Direct model URL: find it in manifest or construct a minimal def.
        firstDef = CHAR_MODELS.find(m => m.path === qModel);
        if (!firstDef) {
            // Construct a minimal def from the path.
            const stem = qModel.split('/').pop()?.replace(/\.glb$/, '') ?? 'unknown';
            firstDef = {
                id: stem, packId: 'unknown', name: stem,
                path: qModel, format: 'glb', roles: ['npc'], tags: [], animated: true,
            };
        }
    }
    else if (qPack) {
        firstDef = _filteredModels.find(m => m.packId === qPack) ?? _filteredModels[0];
    }
    else {
        firstDef = _filteredModels[0];
    }
    if (firstDef) {
        _currentIdx = _filteredModels.indexOf(firstDef);
        if (_currentIdx < 0)
            _currentIdx = 0;
        await loadModel(firstDef);
        if (qAnim)
            playAnim(qAnim);
        if (qAngle)
            setAngle(qAngle);
        _renderModelList();
    }
}
init();
// ── window.__modelReview API ──────────────────────────────────────────────────
window['__modelReview'] = {
    get ready() { return true; },
    get loaded() { return _loaded; },
    get stats() { return _stats; },
    get currentIndex() { return _currentIdx; },
    get modelList() { return _filteredModels.map(m => ({ id: m.id, name: m.name, path: m.path, animated: m.animated })); },
    get animatedOnly() { return _animatedOnly; },
    set animatedOnly(v) {
        _animatedOnly = v;
        _renderModelList();
    },
    loadModel: async (path, animRigPath) => {
        let def = CHAR_MODELS.find(m => m.path === path);
        if (!def) {
            const stem = path.split('/').pop()?.replace(/\.glb$/, '') ?? 'unknown';
            def = { id: stem, packId: 'unknown', name: stem, path, format: 'glb', roles: ['npc'], tags: [], animated: true,
                animRig: animRigPath ?? undefined };
        }
        else if (animRigPath) {
            def = { ...def, animRig: animRigPath };
        }
        return loadModel(def);
    },
    playAnim: (clipName) => playAnim(clipName),
    setAngle: (preset) => setAngle(preset),
    nextModel: () => navigate(1),
    prevModel: () => navigate(-1),
};
// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT MODE
// ═══════════════════════════════════════════════════════════════════════════════
const _gltfLoader = new GLTFLoader();
// ── Environment state ─────────────────────────────────────────────────────────
let _envMode = false;
let _envCurrentDef = null;
let _envGroup = null;
let _envScale = 1.0;
let _envCatFilter = 'all';
let _envTextFilter = '';
let _envFiltered = [...ENV_ASSETS];
// 2m reference figure (capsule representing a human)
const _refFigure = (() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 4, 8), new THREE.MeshLambertMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 }));
    body.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshLambertMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 }));
    head.position.y = 1.85;
    g.add(body, head);
    // Label
    g.visible = true;
    return g;
})();
// ── DOM refs for env mode ─────────────────────────────────────────────────────
const envPanel = document.getElementById('env-panel');
const charsPanel = document.getElementById('chars-panel');
const editorPanel = document.getElementById('editor-panel');
const envListEl = document.getElementById('env-list');
const envCatBarEl = document.getElementById('env-cat-bar');
const envTitleEl = document.getElementById('env-asset-title');
const envStatsEl = document.getElementById('env-stats-grid');
const envScaleSlider = document.getElementById('env-scale-slider');
const envScaleVal = document.getElementById('env-scale-val');
const envScaleCopy = document.getElementById('env-scale-copy');
const envRefToggle = document.getElementById('env-ref-toggle');
// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset['mode'] ?? 'chars';
        // Show/hide the three root panels
        charsPanel.style.display = mode === 'chars' ? '' : 'none';
        envPanel.style.display = mode === 'env' ? '' : 'none';
        editorPanel.style.display = mode === 'editor' ? 'flex' : 'none';
        _envMode = mode === 'env';
        if (mode === 'env') {
            if (envRefToggle.checked)
                scene.add(_refFigure);
            if (_currentGroup) {
                scene.remove(_currentGroup);
                _currentGroup = null;
            }
            _buildEnvList();
            if (_envFiltered.length > 0 && !_envCurrentDef)
                loadEnvAsset(_envFiltered[0]);
        }
        else {
            scene.remove(_refFigure);
            if (_envGroup) {
                scene.remove(_envGroup);
                _envGroup = null;
            }
        }
        if (mode === 'editor') {
            // First time activating the editor — create EditorCore and sub-editors
            if (!_editorCore) {
                scene.remove(_refFigure);
                if (_envGroup) {
                    scene.remove(_envGroup);
                    _envGroup = null;
                }
                _editorCore = new EditorCore({
                    canvas, scene, camera, renderer, orbit,
                    onSelectionChange: (sel) => { _updateEditorInspector(sel[0] ?? null); },
                    onStatusChange: (msg) => {
                        const statusEl = document.getElementById('ed-status-sel');
                        if (statusEl)
                            statusEl.textContent = msg;
                    },
                });
                _editorSerial = new EditorSerializer(_editorCore, () => ({
                    ...((_editorType === 'tower_floor') ? {
                        floorIndex: 0, gridSize: 2, size: { w: 12, d: 12 }, properties: {},
                    } : {}),
                }));
                _editorCore.activate();
                _buildEditorAssetPanel();
                _bindEditorToolbar();
                const edContainer = document.getElementById('editor-inspector').parentElement;
                _towerEditor = new TowerFloorEditor(_editorCore, _editorSerial, edContainer);
                _overworldEditor = new OverworldEditor(scene, camera, canvas);
                const owPanel = document.getElementById('ow-editor-panel');
                if (owPanel) {
                    owPanel.style.position = 'relative';
                    owPanel.style.top = owPanel.style.left = owPanel.style.zIndex = '';
                    owPanel.style.display = 'none';
                    edContainer.appendChild(owPanel);
                }
                _buildingEditor = new BuildingEditor(_editorCore, edContainer);
                _dungeonEditor = new DungeonEditor(_editorCore, edContainer);
                _activateSubEditor('tower_floor');
                camera.position.set(0, 20, 15);
                camera.lookAt(0, 0, 0);
                orbit.target.set(0, 0, 0);
                orbit.update();
            }
            else {
                // Re-activating after switching away
                _editorCore.activate();
            }
        }
        else if (_editorCore) {
            // Leaving editor mode — deactivate but keep state
            _editorCore.deactivate();
            if (_overworldEditor?.isActive)
                _overworldEditor.toggle();
        }
    });
});
// ── Category bar ─────────────────────────────────────────────────────────────
function _buildEnvCatBar() {
    envCatBarEl.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'env-cat-btn' + (_envCatFilter === 'all' ? ' active' : '');
    allBtn.textContent = '🌍 All';
    allBtn.onclick = () => { _envCatFilter = 'all'; _buildEnvList(); _updateEnvCatBar(); };
    envCatBarEl.appendChild(allBtn);
    for (const cat of ENV_CATEGORIES) {
        const btn = document.createElement('button');
        btn.className = 'env-cat-btn' + (_envCatFilter === cat.id ? ' active' : '');
        btn.textContent = `${cat.icon} ${cat.label}`;
        btn.onclick = () => { _envCatFilter = cat.id; _buildEnvList(); _updateEnvCatBar(); };
        envCatBarEl.appendChild(btn);
    }
}
function _updateEnvCatBar() {
    document.querySelectorAll('.env-cat-btn').forEach(btn => {
        const text = btn.textContent ?? '';
        const isAll = text.includes('All');
        btn.classList.toggle('active', isAll ? _envCatFilter === 'all'
            : ENV_CATEGORIES.some(c => text.includes(c.label) && _envCatFilter === c.id));
    });
}
// ── List rendering ────────────────────────────────────────────────────────────
function _buildEnvList() {
    _envFiltered = ENV_ASSETS.filter(a => {
        const catOk = _envCatFilter === 'all' || a.category === _envCatFilter;
        const textOk = !_envTextFilter || a.name.toLowerCase().includes(_envTextFilter) ||
            a.kitId.toLowerCase().includes(_envTextFilter);
        return catOk && textOk;
    });
    envListEl.innerHTML = '';
    const packIcons = {};
    for (const p of ENV_KITS)
        packIcons[p.id] = p.icon;
    _envFiltered.forEach((def, i) => {
        const li = document.createElement('li');
        if (def === _envCurrentDef)
            li.classList.add('active');
        const icon = document.createElement('span');
        icon.textContent = packIcons[def.kitId] ?? '📦';
        const name = document.createElement('span');
        name.textContent = def.name;
        name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        const scaleTag = document.createElement('span');
        scaleTag.textContent = `×${def.gameScale}`;
        scaleTag.style.cssText = 'font-family:monospace;font-size:10px;color:#554466';
        li.append(icon, name, scaleTag);
        li.onclick = () => { loadEnvAsset(def); };
        envListEl.appendChild(li);
        void i; // used by closure
    });
}
// ── Load environment asset ────────────────────────────────────────────────────
async function loadEnvAsset(def) {
    _envCurrentDef = def;
    loadingOverlay.classList.remove('hidden');
    errorBanner.style.display = 'none';
    // Remove old model
    if (_envGroup) {
        scene.remove(_envGroup);
        _envGroup = null;
    }
    try {
        const gltf = await _gltfLoader.loadAsync(def.path);
        const root = gltf.scene;
        // Analyse bounds
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        // Set game scale
        _envScale = def.gameScale;
        envScaleSlider.value = String(_envScale);
        envScaleVal.textContent = _envScale.toFixed(2);
        root.scale.setScalar(_envScale);
        // Re-centre at origin floor
        const scaled = box.clone().applyMatrix4(new THREE.Matrix4().makeScale(_envScale, _envScale, _envScale));
        const scaledCentre = scaled.getCenter(new THREE.Vector3());
        root.position.x = -scaledCentre.x;
        root.position.y = -scaled.min.y; // sit on floor
        root.position.z = -scaledCentre.z;
        root.traverse(o => {
            if (o instanceof THREE.Mesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            }
        });
        _envGroup = new THREE.Group();
        _envGroup.add(root);
        scene.add(_envGroup);
        // Position ref figure beside the asset
        const scaledWidth = size.x * _envScale;
        _refFigure.position.set(scaledWidth * 0.5 + 0.5, 0, 0);
        if (envRefToggle.checked && !scene.children.includes(_refFigure)) {
            scene.add(_refFigure);
        }
        // Frame camera
        const scaledH = size.y * _envScale;
        const r = Math.max(scaledH, size.x * _envScale, size.z * _envScale) * 1.5 + 1.5;
        camera.position.set(r * 0.8, r * 0.6, r * 0.8);
        orbit.target.set(0, scaledH * 0.4, 0);
        orbit.update();
        // Update UI
        envTitleEl.textContent = def.name;
        envTitleEl.title = def.path;
        const fmt = (v) => v.toFixed(2) + 'm';
        envStatsEl.innerHTML = `
      <span class="lbl">Pack</span><span class="val">${def.kitId.replace('kenney_', '').replace('kaykit_', 'KK ')}</span>
      <span class="lbl">Raw H</span><span class="val">${fmt(size.y)}</span>
      <span class="lbl">Raw W</span><span class="val">${fmt(size.x)}</span>
      <span class="lbl">Raw D</span><span class="val">${fmt(size.z)}</span>
      <span class="lbl">Scale ×${_envScale.toFixed(2)} H</span><span class="val">${fmt(size.y * _envScale)}</span>
    `;
        // Highlight active in list
        document.querySelectorAll('#env-list li').forEach((li, i) => {
            li.classList.toggle('active', _envFiltered[i] === def);
        });
        loadingOverlay.classList.add('hidden');
        window.__envReview = { ...(window.__envReview ?? {}), loaded: true, currentDef: def, scale: _envScale };
    }
    catch (err) {
        loadingOverlay.classList.add('hidden');
        errorBanner.style.display = 'block';
        errorBanner.textContent = `Failed: ${def.path} — ${err.message}`;
    }
}
// ── Scale slider ──────────────────────────────────────────────────────────────
envScaleSlider.addEventListener('input', () => {
    _envScale = parseFloat(envScaleSlider.value);
    envScaleVal.textContent = _envScale.toFixed(2);
    if (_envGroup) {
        const root = _envGroup.children[0];
        if (root) {
            root.scale.setScalar(_envScale);
            // Re-floor
            const box = new THREE.Box3().setFromObject(root);
            root.position.y = -box.min.y;
        }
    }
    if (_envCurrentDef) {
        const box = new THREE.Box3().setFromObject(_envGroup);
        const size = box.getSize(new THREE.Vector3());
        const lbl = envStatsEl.querySelector('.val:last-child');
        if (lbl)
            lbl.textContent = (size.y).toFixed(2) + 'm';
    }
});
envScaleCopy.addEventListener('click', async () => {
    navigator.clipboard?.writeText(_envScale.toFixed(2)).catch(() => { });
    // L6: also patch envManifest.ts via dev-server if running locally
    if (_envCurrentDef) {
        const res = await fetch('/api/save-asset-scale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetPath: _envCurrentDef.path, scale: _envScale }),
        }).catch(() => null);
        if (res?.ok) {
            envScaleCopy.textContent = '✓ Saved!';
            setTimeout(() => { envScaleCopy.textContent = '📋'; }, 1800);
            // Update the displayed gameScale in the asset list
            if (_envCurrentDef)
                _envCurrentDef = { ..._envCurrentDef, gameScale: _envScale };
            return;
        }
    }
    envScaleCopy.textContent = '✓';
    setTimeout(() => { envScaleCopy.textContent = '📋'; }, 1200);
});
envRefToggle.addEventListener('change', () => {
    if (envRefToggle.checked)
        scene.add(_refFigure);
    else
        scene.remove(_refFigure);
});
// ── Env camera buttons ────────────────────────────────────────────────────────
document.getElementById('env-cam-controls')?.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('env-cam-controls').querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setAngle(btn.dataset['angle']);
    });
});
// ── Env filter input ──────────────────────────────────────────────────────────
document.getElementById('env-filter-inp')?.addEventListener('input', (e) => {
    _envTextFilter = e.target.value.toLowerCase();
    _buildEnvList();
});
// ── Expose API for Playwright ────────────────────────────────────────────────
window.__envReview = {
    ready: true,
    loaded: false,
    get currentDef() { return _envCurrentDef; },
    get scale() { return _envScale; },
    loadEnvAsset: async (path) => {
        const def = ENV_ASSETS.find(a => a.path === path);
        if (def)
            await loadEnvAsset(def);
    },
    setScale: (v) => {
        envScaleSlider.value = String(v);
        envScaleSlider.dispatchEvent(new Event('input'));
    },
    switchToEnv: () => {
        document.getElementById('tab-env')?.click();
    },
    getAssetList: () => ENV_ASSETS.map(a => ({ path: a.path, name: a.name, category: a.category, gameScale: a.gameScale })),
};
// ── Init env tab ──────────────────────────────────────────────────────────────
_buildEnvCatBar();
_buildEnvList();
// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR MODE (Phase L0 — Foundation)
// ═══════════════════════════════════════════════════════════════════════════════
// editorPanel declared above alongside envPanel/charsPanel
let _editorCore = null;
let _editorSerial = null;
let _editorType = 'tower_floor';
let _editorDocId = 'floor_new';
let _editorDocName = 'New Floor';
let _editorCatFilter = 'all';
let _editorAssetText = '';
// Sub-editors (created lazily when the Editor tab is first activated)
let _towerEditor = null;
let _overworldEditor = null;
let _buildingEditor = null;
let _dungeonEditor = null;
// ── Sub-editor activation ─────────────────────────────────────────────────────
function _activateSubEditor(type) {
    // Show/hide the sub-editor-specific panels
    const panelIds = {
        tower_floor: 'tfe-props-panel',
        overworld: 'ow-editor-panel',
        building: 'building-editor-panel',
        dungeon: 'dungeon-editor-panel',
    };
    Object.values(panelIds).forEach(id => {
        const el = document.getElementById(id);
        if (el)
            el.style.display = 'none';
    });
    const activeId = panelIds[type];
    if (activeId) {
        const el = document.getElementById(activeId);
        if (el)
            el.style.display = '';
    }
    // Tower: show floor list
    const floorListPanel = document.getElementById('tfe-floor-list-panel');
    if (floorListPanel)
        floorListPanel.style.display = type === 'tower_floor' ? '' : 'none';
    // Overworld: activate/deactivate the OverworldEditor (binds/unbinds its click handlers)
    if (_overworldEditor) {
        if (type === 'overworld' && !_overworldEditor.isActive) {
            _overworldEditor.toggle(); // turn on
            _editorCore?.deactivate(); // EditorCore not needed while OW editor active
        }
        else if (type !== 'overworld' && _overworldEditor.isActive) {
            _overworldEditor.toggle(); // turn off
            if (_editorCore)
                _editorCore.activate();
        }
    }
}
// ── Sub-tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.editor-sub').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.editor-sub').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _editorType = btn.dataset['etype'];
        _buildEditorAssetPanel();
        _activateSubEditor(_editorType);
    });
});
// ── Asset panel for editor ────────────────────────────────────────────────────
function _buildEditorAssetPanel() {
    // Category buttons — reuse ENV_CATEGORIES
    const catBar = document.getElementById('editor-asset-cats');
    catBar.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'ed-cat-btn' + (_editorCatFilter === 'all' ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.onclick = () => { _editorCatFilter = 'all'; _renderEditorAssetList(); _updateEditorCatActive(); };
    catBar.appendChild(allBtn);
    for (const cat of ENV_CATEGORIES) {
        const btn = document.createElement('button');
        btn.className = 'ed-cat-btn' + (_editorCatFilter === cat.id ? ' active' : '');
        btn.textContent = cat.icon;
        btn.title = cat.label;
        btn.onclick = () => { _editorCatFilter = cat.id; _renderEditorAssetList(); _updateEditorCatActive(); };
        catBar.appendChild(btn);
    }
    _renderEditorAssetList();
}
function _updateEditorCatActive() {
    document.querySelectorAll('.ed-cat-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === 0 ? _editorCatFilter === 'all'
            : ENV_CATEGORIES[i - 1]?.id === _editorCatFilter);
    });
}
function _renderEditorAssetList() {
    const listEl = document.getElementById('editor-asset-list');
    listEl.innerHTML = '';
    const filtered = ENV_ASSETS.filter(a => {
        const catOk = _editorCatFilter === 'all' || a.category === _editorCatFilter;
        const textOk = !_editorAssetText || a.name.toLowerCase().includes(_editorAssetText);
        return catOk && textOk;
    });
    for (const def of filtered) {
        const li = document.createElement('li');
        const icon = ENV_KITS.find(p => p.id === def.kitId)?.icon ?? '📦';
        const nameEl = document.createElement('span');
        nameEl.textContent = def.name;
        nameEl.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        const scaleTag = document.createElement('span');
        scaleTag.textContent = `×${def.gameScale}`;
        scaleTag.style.cssText = 'font-size:9px;color:#554466;font-family:monospace';
        li.append(document.createTextNode(icon + ' '), nameEl, scaleTag);
        li.onclick = () => {
            document.querySelectorAll('#editor-asset-list li').forEach(l => l.classList.remove('placing'));
            li.classList.add('placing');
            _editorCore?.beginPlacing(def.path);
        };
        listEl.appendChild(li);
    }
}
document.getElementById('editor-asset-search')?.addEventListener('input', e => {
    _editorAssetText = e.target.value.toLowerCase();
    _renderEditorAssetList();
});
// ── Toolbar binding ───────────────────────────────────────────────────────────
function _bindEditorToolbar() {
    const tools = [
        ['ed-tool-select', 'select'],
        ['ed-tool-move', 'move'],
        ['ed-tool-rotate', 'rotate'],
        ['ed-tool-scale', 'scale'],
    ];
    for (const [id, mode] of tools) {
        document.getElementById(id)?.addEventListener('click', () => {
            document.querySelectorAll('.ed-tool').forEach(b => b.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            _editorCore?.setTool(mode);
        });
    }
    // Snap toggle
    document.getElementById('ed-snap-toggle')?.addEventListener('click', function () {
        this.classList.toggle('active');
        _editorCore?.setSnap(this.classList.contains('active'));
        const statusEl = document.getElementById('ed-status-snap');
        if (statusEl)
            statusEl.textContent = this.classList.contains('active') ? 'snap: ON' : 'snap: OFF';
    });
    // Top view
    document.getElementById('ed-view-top')?.addEventListener('click', () => {
        camera.position.set(0, 30, 0.01);
        camera.lookAt(0, 0, 0);
        orbit.update();
    });
    // Undo / Redo
    document.getElementById('ed-undo')?.addEventListener('click', () => _editorCore?.history.undo());
    document.getElementById('ed-redo')?.addEventListener('click', () => _editorCore?.history.redo());
    // Save
    document.getElementById('ed-save')?.addEventListener('click', async () => {
        if (!_editorCore || !_editorSerial)
            return;
        const doc = _editorSerial.build(_editorType, _editorDocId, _editorDocName);
        _editorSerial.download(doc);
        _editorSerial.autosave(doc);
        // L6: also push to game output dir via dev-server plugin
        const saved = await _editorSerial.saveToGame(doc);
        const saveBtn = document.getElementById('ed-save');
        if (saveBtn) {
            saveBtn.textContent = saved ? '✓ Saved' : '💾';
            setTimeout(() => { if (saveBtn)
                saveBtn.textContent = '💾'; }, 1500);
        }
    });
    // Load
    document.getElementById('ed-load')?.addEventListener('click', () => {
        document.getElementById('ed-load-input')?.click();
    });
    document.getElementById('ed-load-input')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file || !_editorSerial)
            return;
        const doc = await _editorSerial.loadFile(file);
        _editorDocId = doc.id;
        _editorDocName = doc.name;
        await _editorSerial.applyToCore(doc);
    });
}
// ── Inspector panel ───────────────────────────────────────────────────────────
function _updateEditorInspector(obj) {
    const titleEl = document.getElementById('ed-insp-title');
    const fieldsEl = document.getElementById('ed-insp-fields');
    if (!obj) {
        titleEl.textContent = '— nothing selected —';
        fieldsEl.innerHTML = '';
        return;
    }
    titleEl.textContent = obj.asset.split('/').pop() ?? obj.id;
    const mkField = (label, value, onChange) => {
        const row = document.createElement('div');
        row.className = 'ed-field';
        const lbl = document.createElement('label');
        lbl.textContent = label;
        const inp = document.createElement('input');
        inp.value = String(value);
        if (onChange)
            inp.addEventListener('change', () => onChange(inp.value));
        else
            inp.readOnly = true;
        row.append(lbl, inp);
        return row;
    };
    fieldsEl.innerHTML = '';
    fieldsEl.append(mkField('ID', obj.id), mkField('X', obj.x.toFixed(2)), mkField('Y', obj.y.toFixed(2)), mkField('Z', obj.z.toFixed(2)), mkField('Rot Y', (obj.ry * 180 / Math.PI).toFixed(0) + '°'), mkField('Scale', obj.scale.toFixed(2)));
}
// ── Expose editor API for Playwright ─────────────────────────────────────────
window.__editorReview = {
    ready: true,
    get coreReady() { return !!_editorCore; },
    switchToEditor: () => document.getElementById('tab-editor')?.click(),
    getObjects: () => _editorCore?.getObjects() ?? [],
    getSpawns: () => _editorCore?.getSpawns() ?? [],
    getExits: () => _editorCore?.getExits() ?? [],
    placeSpawn: (type, x, y, z) => _editorCore?.placeSpawn(type, new THREE.Vector3(x, y, z)),
    placeExit: (type, x, y, z) => _editorCore?.placeExit(type, new THREE.Vector3(x, y, z)),
    undo: () => _editorCore?.history.undo(),
    redo: () => _editorCore?.history.redo(),
    exportDoc: () => _editorSerial?.build(_editorType, _editorDocId, _editorDocName),
};
