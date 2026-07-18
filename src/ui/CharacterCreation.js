// ── CharacterCreation ────────────────────────────────────────────────────────
//
//  DNA-based character creation screen.  Every being type (biped, quadruped,
//  amoeba, avian, serpent) can be chosen — the player is NOT constrained to
//  a human shape.  Appearance is described by CreatureDNA and rendered live
//  via CreatureBuilder in a dedicated WebGLRenderer.
import * as THREE from 'three';
import { DEFAULT_PLAYER_DNA, dnaForArchetype, dnaForSubRace, cloneDNA, numToHex, hexToNum, dnaToBase64, base64ToDna, BIPED_SUBRACES, SUBRACE_DEFS, ARCHETYPE_FACE_ALLOW, ARCHETYPE_PROP_ALLOW, DOG_DNA, CAT_DNA, } from '@/creatures/CreatureDNA';
import { buildCreature } from '@/creatures/CreatureBuilder';
import { animateCreature } from '@/creatures/CreatureAnimator';
import { randomDNA, mutateDNA } from '@/creatures/CreatureRandomiser';
import { loadWorldGenConfig } from '@/world/WorldGenConfig';
import { AssetCharBrowser } from '@/ui/AssetCharBrowser';
import { loadCharModel } from '@/characters/CharacterLoader';
import { generateNameForSpecies } from '@/world/NameGenerator';
const BOONS = [
    { id: 'tome', icon: '📖', title: 'Ancient Tome', desc: 'A singed spellbook left in the cell.', effect: 'Start with Flame Dart' },
    { id: 'blood', icon: '❤', title: "Warrior's Blood", desc: 'Old lineage — harder to extinguish.', effect: '+30 maximum HP' },
    { id: 'swift', icon: '💨', title: 'Swift Feet', desc: 'A talent for movement and mischief.', effect: 'Dodge −35%  •  Move +15%' },
];
const ARCHETYPES = [
    { id: 'biped', icon: '🧙', label: 'Biped', hint: 'Two-legged — arms, legs, full spellcasting posture.' },
    { id: 'quadruped', icon: '🐺', label: 'Quadruped', hint: 'Four-limbed beast — swift, imposing.' },
    { id: 'amoeba', icon: '🫧', label: 'Amoeba', hint: 'Amorphous blob — orbiting satellite masses.' },
    { id: 'avian', icon: '🦅', label: 'Avian', hint: 'Winged form — graceful, airborne aesthetic.' },
    { id: 'serpent', icon: '🐍', label: 'Serpent', hint: 'Segmented serpentine — sinuous and ancient.' },
];
const PROP_DEFS = [
    { id: 'crown', label: 'Crown' },
    { id: 'horns_small', label: 'Horns (S)' },
    { id: 'horns_large', label: 'Horns (L)' },
    { id: 'antlers', label: 'Antlers' },
    { id: 'wings_bat', label: 'Bat Wings' },
    { id: 'feather_crest', label: 'Feathers' },
    { id: 'tail_stub', label: 'Tail (stub)' },
    { id: 'tail_long', label: 'Tail (long)' },
    { id: 'mane', label: 'Mane' },
    { id: 'aura', label: 'Aura' },
    { id: 'lantern', label: 'Lantern' },
    { id: 'ghost_trail', label: 'Ghost Trail' },
    { id: 'tusk_lower', label: 'Tusks' },
    { id: 'fin_dorsal', label: 'Dorsal Fin' },
    { id: 'scale_ridges', label: 'Scale Ridges' },
    { id: 'tentacles', label: 'Tentacles' },
    { id: 'carapace', label: 'Carapace' },
    { id: 'armor_light', label: 'Light Armor' },
    { id: 'hair_short', label: 'Hair (S)' },
    { id: 'hair_long', label: 'Hair (L)' },
    { id: 'hair_bun', label: 'Hair (bun)' },
];
// ── Archetype → generated name ────────────────────────────────────────────────
function _nameForArchetype(arch) {
    switch (arch) {
        case 'biped': return generateNameForSpecies('human');
        case 'quadruped': return generateNameForSpecies('fox');
        case 'amoeba': return generateNameForSpecies('slime');
        case 'avian': return generateNameForSpecies('human');
        case 'serpent': return generateNameForSpecies('undead');
    }
}
// ── CSS ───────────────────────────────────────────────────────────────────────
const CC_CSS = `
.cc-overlay {
  display: none; align-items: center; justify-content: center;
  position: fixed; inset: 0; z-index: 8500;
  background: rgba(4,3,10,.92); backdrop-filter: blur(6px);
  opacity: 0; transition: opacity .25s ease;
  font-family: 'Crimson Text','Georgia',serif; overflow-y: auto;
}
.cc-overlay.cc-open { opacity: 1; }
.cc-card {
  background: linear-gradient(160deg,#0e0b1a 0%,#07060f 100%);
  border: 1px solid #3a2860; border-radius: 4px; padding: 22px 24px 18px;
  width: min(98vw, 860px); display: flex; flex-direction: column; gap: 14px;
  box-shadow: 0 20px 80px rgba(0,0,0,.9); margin: auto;
}
.cc-title { font-size: 1.65rem; color: #e8d8b0; letter-spacing: .08em; text-align: center;
  text-shadow: 0 0 24px rgba(160,120,220,.5); margin-bottom: -8px; }
.cc-subtitle { font-size: .8rem; color: #5a4880; text-align: center; letter-spacing: .08em; text-transform: uppercase; }
.cc-main { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.cc-preview-col { flex: 0 0 240px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.cc-preview-canvas { display: block; width: 240px; height: 300px; border: 1px solid #2a1850;
  border-radius: 4px; cursor: grab; user-select: none; background: #0d0b18; }
.cc-preview-canvas:active { cursor: grabbing; }
.cc-drag-hint { font-size: .68rem; color: #3a2860; letter-spacing: .06em; text-transform: uppercase; }
.cc-dna-controls-group { display: flex; flex-direction: column; gap: 6px; width: 100%; align-items: center; }
.cc-asset-canvas-hint {
  font-size: .8rem; color: #7a6a8a; font-style: italic; text-align: center;
  margin-top: 8px; letter-spacing: .04em;
}
.cc-dna-btn { background: transparent; border: 1px solid #2a1850; border-radius: 3px;
  color: #5a4880; font-size: .72rem; cursor: pointer; padding: 4px 10px; font-family: inherit;
  letter-spacing: .04em; transition: all .12s; }
.cc-dna-btn:hover { background: rgba(80,48,160,.1); color: #a080e0; border-color: #4a3870; }
.cc-dna-btn.cc-dna-btn--roll { background: rgba(90,60,160,.12); border-color: #4a3070; color: #c0a0f0; font-size: .8rem; }
.cc-dna-btn.cc-dna-btn--roll:hover { background: rgba(110,70,200,.25); color: #e0d0ff; }
.cc-cam-row { display: flex; gap: 4px; width: 100%; }
.cc-cam-btn { flex: 1; background: transparent; border: 1px solid #2a1850; border-radius: 3px;
  color: #5a4880; font-size: .66rem; cursor: pointer; padding: 3px 4px; font-family: inherit;
  letter-spacing: .03em; transition: all .12s; }
.cc-cam-btn:hover, .cc-cam-btn--on { background: rgba(80,48,160,.15); color: #a080e0; border-color: #4a3870; }
.cc-anim-row { display: flex; gap: 4px; width: 100%; }
.cc-import-wrap { display: flex; gap: 4px; width: 100%; margin-top: 2px; }
.cc-import-input { flex: 1; background: #07060f; border: 1px solid #2e1f50; border-radius: 3px;
  color: #a090c0; font-size: .65rem; padding: 4px 7px; font-family: monospace; min-width: 0;
  transition: border-color .15s; }
.cc-controls-col { flex: 1 1 280px; min-width: 230px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 82vh; }
.cc-label { font-size: .76rem; color: #7a6a99; letter-spacing: .08em; text-transform: uppercase; display: block; margin-bottom: 4px; }
.cc-name-input { width: 100%; box-sizing: border-box;
  background: #07060f; border: 1px solid #2e1f50; border-radius: 3px;
  color: #e0d0ff; font-size: 1.02rem; font-family: inherit; padding: 7px 11px;
  outline: none; transition: border-color .15s; }
.cc-name-input:focus { border-color: #7050cc; box-shadow: 0 0 0 2px rgba(112,80,204,.18); }
.cc-section { display: flex; flex-direction: column; gap: 7px; }
.cc-section-title { font-size: .76rem; color: #5a4880; letter-spacing: .1em; text-transform: uppercase;
  border-bottom: 1px solid #1a1228; padding-bottom: 3px; }
.cc-chips { display: flex; gap: 5px; flex-wrap: wrap; }
.cc-chip { border: 1px solid #2a1850; border-radius: 3px; padding: 5px 9px;
  background: rgba(255,255,255,.02); cursor: pointer; transition: all .12s;
  font-size: .8rem; color: #7060a0; font-family: inherit; user-select: none; }
.cc-chip:hover { background: rgba(112,80,204,.08); border-color: #3a2860; }
.cc-chip.cc-chip--on { background: rgba(112,80,204,.18); border-color: #7050cc; color: #d4c0f0; }
.cc-boon { display: flex; align-items: flex-start; gap: 9px;
  background: rgba(255,255,255,.02); border: 1px solid #1e1530;
  border-radius: 3px; padding: 7px 10px; cursor: pointer; transition: all .12s; }
.cc-boon:hover { background: rgba(112,80,204,.07); border-color: #3a2860; }
.cc-boon.cc-boon--on { background: rgba(112,80,204,.14); border-color: #7050cc; }
.cc-boon-icon { font-size: 1.2rem; flex-shrink: 0; margin-top: 1px; }
.cc-boon-title { color: #d4c0f0; font-size: .9rem; }
.cc-boon-desc  { color: #6a5a80; font-size: .76rem; line-height: 1.4; }
.cc-boon-effect{ color: #a080e8; font-size: .72rem; margin-top: 1px; }
.cc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cc-row-lbl { font-size: .75rem; color: #7a6a99; min-width: 48px; flex-shrink: 0; }
.cc-color-input { width: 38px; height: 24px; border: 1px solid #2a1850; border-radius: 3px;
  padding: 2px; background: #07060f; cursor: pointer;
  -webkit-appearance: none; appearance: none; }
.cc-color-input::-webkit-color-swatch-wrapper { padding: 1px; }
.cc-color-input::-webkit-color-swatch { border: none; border-radius: 2px; }
.cc-slider { flex: 1; accent-color: #7050cc; cursor: pointer; min-width: 80px; }
.cc-slider-val { font-size: .72rem; color: #5a4880; min-width: 28px; text-align: right; }
.cc-subrace-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.cc-subrace-chip { font-size: .72rem; padding: 3px 8px; border-radius: 14px;
  border: 1px solid #2e1f50; color: #8070b0; cursor: pointer; user-select: none;
  background: transparent; transition: all .12s; white-space: nowrap; }
.cc-subrace-chip:hover { border-color: #5040a0; color: #c0b0e0; }
.cc-subrace-chip.cc-chip--on { background: #2a1858; border-color: #7050cc; color: #d4c8f8; }
.cc-prop-grid { display: flex; flex-wrap: wrap; gap: 5px; }
.cc-prop { display: flex; align-items: center; gap: 4px; cursor: pointer;
  font-size: .76rem; color: #7060a0; user-select: none; }
.cc-prop-box { width: 12px; height: 12px; border: 1.5px solid #3a2860; border-radius: 2px;
  background: transparent; flex-shrink: 0; transition: all .12s; }
.cc-prop:hover .cc-prop-box { border-color: #7050cc; }
.cc-prop.cc-prop--on .cc-prop-box { background: #7050cc; border-color: #9070e0; }
.cc-prop.cc-prop--on { color: #d4c0f0; }
.cc-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
.cc-btn { border: none; border-radius: 3px; cursor: pointer; font-family: inherit;
  font-size: .9rem; letter-spacing: .04em; padding: 9px 20px; transition: background .12s, transform .05s; }
.cc-btn:active { transform: scale(.97); }
.cc-btn--back { background: transparent; border: 1px solid #2e1f50; color: #7060a0; }
.cc-btn--back:hover { background: rgba(255,255,255,.04); border-color: #4a3870; }
.cc-btn--start { background: linear-gradient(135deg,#5030a0,#7050cc); color: #f0e8ff;
  font-weight: 600; box-shadow: 0 4px 18px rgba(80,48,160,.45); }
.cc-btn--start:hover { background: linear-gradient(135deg,#6040b8,#8060e0); }
`;
// ── CharacterPreview ──────────────────────────────────────────────────────────
const PW = 240, PH = 300;
class CharacterPreview {
    _renderer;
    _scene;
    _camera;
    _rig = null;
    _assetGroup = null;
    _assetMixer = null;
    _rafId = null;
    _prevTime = 0;
    _rotY = 0;
    _drag = false;
    _prevX = 0;
    _rotYStart = 0;
    _animState = 'idle';
    _camPosTarget = new THREE.Vector3(0.4, 1.5, 3.2);
    _camLookTarget = new THREE.Vector3(0, 1.1, 0);
    _camLookCurrent = new THREE.Vector3(0, 1.1, 0);
    constructor(canvas, dna) {
        this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this._renderer.setSize(PW, PH);
        this._renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        this._renderer.setClearColor(0x0d0b18);
        this._scene = new THREE.Scene();
        this._camera = new THREE.PerspectiveCamera(42, PW / PH, 0.1, 50);
        this._camera.position.set(0.4, 1.5, 3.2);
        this._camera.lookAt(0, 1.1, 0);
        this._scene.add(new THREE.AmbientLight(0xffe8d0, 0.65));
        const key = new THREE.DirectionalLight(0xfff0e0, 1.15);
        key.position.set(3, 5, 3);
        this._scene.add(key);
        const rim = new THREE.DirectionalLight(0x8060ff, 0.38);
        rim.position.set(-3, 2, -2);
        this._scene.add(rim);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0x0a0814, transparent: true, opacity: 0.4 }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.01;
        this._scene.add(disc);
        this._build(dna);
        this._bindPointer(canvas);
    }
    _build(dna) {
        if (this._rig) {
            this._scene.remove(this._rig.root);
            this._rig.dispose();
        }
        this._rig = buildCreature(dna);
        this._scene.add(this._rig.root);
    }
    setDNA(dna) { this._build(dna); }
    /**
     * Display a loaded asset model instead of the procedural rig.
     * Plays the first idle-looking clip if the model has one.
     */
    setAssetScene(group, mixer, clips) {
        if (this._rig) {
            this._scene.remove(this._rig.root);
            this._rig = null;
        }
        if (this._assetGroup) {
            this._scene.remove(this._assetGroup);
        }
        if (this._assetMixer) {
            this._assetMixer.stopAllAction();
            this._assetMixer = null;
        }
        this._assetGroup = group;
        // updateMatrixWorld so Box3.setFromObject gets correct world-space bounds
        // even though the group hasn't been added to the scene yet.
        group.updateMatrixWorld(true);
        // Auto-fit: centre + scale to fill the preview area
        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0.01 ? 2.2 / maxDim : 1;
        group.scale.setScalar(scale);
        // Recompute after scaling so feet land at y=0
        group.updateMatrixWorld(true);
        box.setFromObject(group);
        group.position.y = -box.min.y;
        group.position.x = 0;
        group.position.z = 0;
        this._scene.add(group);
        // Drive animation if the model has clips — prefer idle, fall back to first
        if (mixer && clips.length > 0) {
            this._assetMixer = mixer;
            const IDLE_PREFER = ['Idle_A', 'Idle_B', 'Idle', 'idle', 'Stand', 'Rest'];
            const idleClip = IDLE_PREFER.map(n => THREE.AnimationClip.findByName(clips, n)).find(Boolean)
                ?? clips[0];
            if (idleClip) {
                const action = mixer.clipAction(idleClip);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.clampWhenFinished = false;
                action.play();
            }
        }
        this.startLoop();
    }
    setAnimState(s) { this._animState = s; }
    setCamera(preset) {
        switch (preset) {
            case 'full':
                this._camPosTarget.set(0.4, 1.5, 3.2);
                this._camLookTarget.set(0, 1.1, 0);
                break;
            case 'face':
                this._camPosTarget.set(0.0, 2.0, 1.5);
                this._camLookTarget.set(0, 1.8, 0);
                break;
            case 'side':
                this._camPosTarget.set(3.0, 1.5, 0.5);
                this._camLookTarget.set(0, 1.0, 0);
                break;
        }
    }
    startLoop() {
        if (this._rafId !== null)
            return;
        this._prevTime = performance.now();
        const tick = () => {
            this._rafId = requestAnimationFrame(tick);
            const now = performance.now();
            const dt = Math.min((now - this._prevTime) * 0.001, 0.1);
            this._prevTime = now;
            if (!this._drag)
                this._rotY += 0.007;
            if (this._rig) {
                this._rig.root.rotation.y = this._rotY;
                const t = now * 0.001;
                this._rig.root.position.y = Math.sin(t * 1.2) * 0.016;
                animateCreature(this._rig, { state: this._animState, time: t });
            }
            if (this._assetGroup) {
                this._assetGroup.rotation.y = this._rotY;
            }
            this._assetMixer?.update(dt);
            this._camera.position.lerp(this._camPosTarget, 0.1);
            this._camLookCurrent.lerp(this._camLookTarget, 0.1);
            this._camera.lookAt(this._camLookCurrent);
            this._renderer.render(this._scene, this._camera);
        };
        tick();
    }
    stopLoop() {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }
    _bindPointer(cv) {
        cv.addEventListener('pointerdown', (e) => { this._drag = true; this._prevX = e.clientX; this._rotYStart = this._rotY; });
        window.addEventListener('pointermove', (e) => { if (this._drag)
            this._rotY = this._rotYStart + (e.clientX - this._prevX) * 0.012; });
        window.addEventListener('pointerup', () => { this._drag = false; });
    }
    dispose() { this.stopLoop(); this._assetMixer?.stopAllAction(); this._rig?.dispose(); this._renderer.dispose(); }
}
// ── CharacterCreation ─────────────────────────────────────────────────────────
export class DNACreator {
    _onStart;
    _onBack;
    _overlay;
    _preview = null;
    _dna = cloneDNA(DEFAULT_PLAYER_DNA);
    _boon = 'tome';
    _slotId = 0;
    _assetModel = null;
    _assetBrowser = null;
    // Pane references assigned in _build(), toggled in show()
    _ctrlCol;
    _assetPane;
    _assetBrowserSec;
    _assetNameInput;
    _dnaPreviewControls; // camRow, animRow, DNA buttons — hidden in asset mode
    _assetCanvasHint; // "Choose a model →" visible in asset mode
    // Control refs (populated in _build)
    _nameInput;
    _archChips = new Map();
    _subRaceChips = new Map();
    _subRaceRow;
    _boonCards = new Map();
    _faceChips = new Map();
    _eyeShapeChips = new Map();
    _browStyleChips = new Map();
    _skinPatternChips = new Map();
    _markColorRow;
    _markColorInput;
    _mouthChips = new Map();
    _propChips = new Map();
    _outfitTopChips = new Map();
    _outfitLegsChips = new Map();
    _outfitOverChips = new Map();
    _outfitSec;
    _morphWrap;
    _morphInputs = [];
    _primaryInput;
    _secondaryInput;
    _emissiveInput;
    _emissiveSlider;
    _emissiveVal;
    _scaleSlider;
    _scaleVal;
    _eyeInput;
    _bodyPatternChips = new Map();
    _bodyPatternColorRow;
    _bodyPatternColorInput;
    constructor(_onStart, _onBack) {
        this._onStart = _onStart;
        this._onBack = _onBack;
        _ensureStyles();
        this._overlay = this._build();
        document.body.appendChild(this._overlay);
    }
    show(slotId) {
        this._slotId = slotId;
        this._dna = cloneDNA(DEFAULT_PLAYER_DNA);
        this._boon = 'tome';
        this._assetModel = null;
        // Re-evaluate charMode every time the screen opens (settings may have changed)
        const wg = loadWorldGenConfig();
        const isAsset = wg.charMode === 'asset';
        this._ctrlCol.style.display = isAsset ? 'none' : '';
        this._assetPane.style.display = isAsset ? '' : 'none';
        // Show/hide DNA-only preview controls
        this._dnaPreviewControls.style.display = isAsset ? 'none' : '';
        this._assetCanvasHint.style.display = isAsset ? '' : 'none';
        if (isAsset && !this._assetBrowser) {
            this._assetBrowser = new AssetCharBrowser(this._assetBrowserSec, wg.charPacks, (def) => {
                this._assetModel = def;
                // Load and show the model in the preview canvas
                if (this._preview) {
                    loadCharModel(def)
                        .then((loaded) => {
                        this._preview?.setAssetScene(loaded.scene, loaded.mixer, loaded.clips);
                        this._assetCanvasHint.style.display = 'none';
                    })
                        .catch((err) => console.warn('[CharCreation] preview load failed:', err));
                }
            });
        }
        this._assetNameInput.value = '';
        this._overlay.style.display = 'flex';
        requestAnimationFrame(() => this._overlay.classList.add('cc-open'));
        const canvas = this._overlay.querySelector('.cc-preview-canvas');
        if (!this._preview)
            this._preview = new CharacterPreview(canvas, this._dna);
        else
            this._preview.setDNA(this._dna);
        if (!isAsset) {
            this._syncControls();
            // Auto-generate a name that fits the starting archetype
            this._nameInput.value = _nameForArchetype(this._dna.archetype);
            this._preview.startLoop();
        }
        // In asset mode the loop is started by setAssetScene when a model is selected.
        // Stop any existing procedural loop to clear the canvas.
        if (isAsset)
            this._preview.stopLoop();
    }
    hide() {
        this._overlay.classList.remove('cc-open');
        this._preview?.stopLoop();
        setTimeout(() => { this._overlay.style.display = 'none'; }, 250);
    }
    dispose() { this._preview?.dispose(); this._assetBrowser?.dispose(); this._overlay.remove(); }
    // ── Sync all control values from _dna ───────────────────────────────────
    _syncControls() {
        const d = this._dna;
        // Name is intentionally NOT reset here — it is set once in show() and preserved
        // across appearance tweaks so the player doesn't lose what they typed.
        this._primaryInput.value = numToHex(d.colors.primary);
        this._secondaryInput.value = numToHex(d.colors.secondary);
        this._emissiveInput.value = numToHex(d.colors.emissive);
        this._emissiveSlider.value = String(d.colors.emissiveIntensity);
        this._emissiveVal.textContent = d.colors.emissiveIntensity.toFixed(2);
        this._scaleSlider.value = String(d.proportions.global);
        this._scaleVal.textContent = d.proportions.global.toFixed(2);
        for (const { prop, slider, val } of this._morphInputs) {
            const v = prop === 'torso_y'
                ? d.proportions.torso[1]
                : (d.proportions[prop] ?? 1.0);
            slider.value = String(v);
            val.textContent = v.toFixed(2);
        }
        this._eyeInput.value = numToHex(d.face.eyeColor);
        this._eyeShapeChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.eyeShape));
        this._browStyleChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.browStyle));
        this._skinPatternChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.skinPattern));
        this._markColorInput.value = numToHex(d.face.markColor);
        this._markColorRow.style.display = d.face.skinPattern !== 'none' ? 'flex' : 'none';
        this._bodyPatternChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.colors.pattern));
        this._bodyPatternColorInput.value = numToHex(d.colors.patternColor);
        this._bodyPatternColorRow.style.display = d.colors.pattern !== 'none' ? 'flex' : 'none';
        this._archChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.archetype));
        this._subRaceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.subRace));
        this._subRaceRow.style.display = d.archetype === 'biped' ? 'flex' : 'none';
        this._boonCards.forEach((el, id) => el.classList.toggle('cc-boon--on', id === this._boon));
        // Filter face chips + auto-correct
        const faceAllow = ARCHETYPE_FACE_ALLOW[d.archetype];
        this._faceChips.forEach((el, id) => { el.style.display = faceAllow.includes(id) ? '' : 'none'; });
        if (!faceAllow.includes(d.face.type))
            d.face.type = faceAllow[0];
        this._faceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.type));
        this._mouthChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.mouthType));
        // Filter prop chips by archetype
        const propAllow = ARCHETYPE_PROP_ALLOW[d.archetype];
        this._propChips.forEach((el, id) => { el.style.display = propAllow.includes(id) ? '' : 'none'; });
        d.props = d.props.filter(p => propAllow.includes(p));
        this._propChips.forEach((el, id) => el.classList.toggle('cc-prop--on', d.props.includes(id)));
        this._outfitTopChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.outfit.top));
        this._outfitLegsChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.outfit.legs));
        this._outfitOverChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.outfit.over));
        this._outfitSec.style.display = d.archetype === 'biped' ? 'flex' : 'none';
        this._morphWrap.style.display = d.archetype === 'biped' ? 'flex' : 'none';
    }
    // ── DOM builder ──────────────────────────────────────────────────────────
    _build() {
        const overlay = document.createElement('div');
        overlay.className = 'cc-overlay';
        const card = document.createElement('div');
        card.className = 'cc-card';
        // Title
        const title = document.createElement('div');
        title.className = 'cc-title';
        title.textContent = 'SHAPE YOUR BEING';
        const sub = document.createElement('div');
        sub.className = 'cc-subtitle';
        sub.textContent = 'Form • Boon • Appearance';
        card.append(title, sub);
        // Two-column main
        const main = document.createElement('div');
        main.className = 'cc-main';
        // ── Left column: preview ────────────────────────────────────────────────
        const previewCol = document.createElement('div');
        previewCol.className = 'cc-preview-col';
        const canvas = document.createElement('canvas');
        canvas.className = 'cc-preview-canvas';
        // Camera preset buttons
        const camRow = document.createElement('div');
        camRow.className = 'cc-cam-row';
        const camBtns = new Map();
        for (const [lbl, preset] of [['⬜ Full', 'full'], ['👁 Face', 'face'], ['◀ Side', 'side']]) {
            const b = document.createElement('button');
            b.className = 'cc-cam-btn';
            b.textContent = lbl;
            b.onclick = () => {
                this._preview?.setCamera(preset);
                camBtns.forEach((el, k) => el.classList.toggle('cc-cam-btn--on', k === preset));
            };
            camBtns.set(preset, b);
            camRow.appendChild(b);
        }
        camBtns.get('full')?.classList.add('cc-cam-btn--on');
        // Animation state chips
        const animRow = document.createElement('div');
        animRow.className = 'cc-anim-row';
        const animChips = new Map();
        for (const [lbl, state] of [['Idle', 'idle'], ['Walk', 'walk'], ['Run', 'run'], ['Hit', 'hit']]) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip cc-chip--sm';
            chip.textContent = lbl;
            chip.onclick = () => {
                this._preview?.setAnimState(state);
                animChips.forEach((el, k) => el.classList.toggle('cc-chip--on', k === state));
            };
            animChips.set(state, chip);
            animRow.appendChild(chip);
        }
        animChips.get('idle')?.classList.add('cc-chip--on');
        const hint = document.createElement('div');
        hint.className = 'cc-drag-hint';
        hint.textContent = 'Drag to rotate';
        const dnaBtn = document.createElement('button');
        dnaBtn.className = 'cc-dna-btn';
        dnaBtn.textContent = '📋 Copy DNA';
        dnaBtn.onclick = () => {
            navigator.clipboard?.writeText(dnaToBase64(this._dna)).catch(() => { });
        };
        const rollBtn = document.createElement('button');
        rollBtn.className = 'cc-dna-btn cc-dna-btn--roll';
        rollBtn.textContent = '🎲 Lucky Roll';
        rollBtn.onclick = () => {
            this._dna = randomDNA(Date.now() >>> 0);
            this._syncControls();
            this._preview?.setDNA(this._dna);
        };
        const mutateBtn = document.createElement('button');
        mutateBtn.className = 'cc-dna-btn';
        mutateBtn.textContent = '~ Mutate';
        mutateBtn.onclick = () => {
            this._dna = mutateDNA(this._dna, 0.25, Date.now() >>> 0);
            this._syncControls();
            this._preview?.setDNA(this._dna);
        };
        // Import DNA
        const importWrap = document.createElement('div');
        importWrap.className = 'cc-import-wrap';
        const importInput = document.createElement('input');
        importInput.type = 'text';
        importInput.className = 'cc-import-input';
        importInput.placeholder = 'Paste DNA code…';
        const importBtn = document.createElement('button');
        importBtn.className = 'cc-dna-btn';
        importBtn.textContent = '⬇ Load';
        importBtn.onclick = () => {
            try {
                const dna = base64ToDna(importInput.value.trim());
                this._dna = dna;
                this._syncControls();
                this._preview?.setDNA(dna);
                importInput.value = '';
                importInput.style.borderColor = '';
            }
            catch {
                importInput.style.borderColor = '#c04040';
            }
        };
        importWrap.append(importInput, importBtn);
        // Group all DNA-only preview controls so we can hide them in asset mode
        const dnaControls = document.createElement('div');
        dnaControls.className = 'cc-dna-controls-group';
        dnaControls.append(camRow, animRow, hint, rollBtn, mutateBtn, dnaBtn, importWrap);
        this._dnaPreviewControls = dnaControls;
        // Placeholder shown in asset mode (hidden in code mode)
        const assetHint = document.createElement('div');
        assetHint.className = 'cc-asset-canvas-hint';
        assetHint.textContent = '← Choose a character';
        assetHint.style.display = 'none';
        this._assetCanvasHint = assetHint;
        previewCol.append(canvas, dnaControls, assetHint);
        // ── Right column: controls ──────────────────────────────────────────────
        const ctrlCol = document.createElement('div');
        ctrlCol.className = 'cc-controls-col';
        this._ctrlCol = ctrlCol;
        // Name
        const nameWrap = document.createElement('div');
        nameWrap.className = 'cc-section';
        const nameLbl = document.createElement('label');
        nameLbl.className = 'cc-label';
        nameLbl.textContent = 'Name';
        this._nameInput = document.createElement('input');
        this._nameInput.type = 'text';
        this._nameInput.className = 'cc-name-input';
        this._nameInput.placeholder = 'Enter a name…';
        this._nameInput.maxLength = 24;
        nameWrap.append(nameLbl, this._nameInput);
        // Archetype
        const archSec = document.createElement('div');
        archSec.className = 'cc-section';
        const archTitle = document.createElement('div');
        archTitle.className = 'cc-section-title';
        archTitle.textContent = 'Form';
        const archChips = document.createElement('div');
        archChips.className = 'cc-chips';
        for (const a of ARCHETYPES) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip';
            chip.textContent = a.icon + ' ' + a.label;
            chip.title = a.hint;
            chip.onclick = () => {
                this._dna = dnaForArchetype(a.id);
                this._subRaceRow.style.display = a.id === 'biped' ? 'flex' : 'none';
                this._syncControls();
                this._preview?.setDNA(this._dna);
            };
            this._archChips.set(a.id, chip);
            archChips.appendChild(chip);
        }
        archSec.append(archTitle, archChips);
        // Sub-race selector (biped only)
        const subRaceLabel = document.createElement('div');
        subRaceLabel.className = 'cc-label';
        subRaceLabel.textContent = 'Species';
        subRaceLabel.style.marginTop = '4px';
        this._subRaceRow = document.createElement('div');
        this._subRaceRow.className = 'cc-subrace-row';
        this._subRaceRow.style.display = this._dna.archetype === 'biped' ? 'flex' : 'none';
        for (const sr of BIPED_SUBRACES) {
            const def = SUBRACE_DEFS[sr];
            const chip = document.createElement('div');
            chip.className = 'cc-subrace-chip';
            chip.textContent = def.icon + ' ' + def.label;
            chip.title = def.hint;
            chip.onclick = () => {
                this._dna = dnaForSubRace(sr, this._dna);
                this._syncControls();
                this._preview?.setDNA(this._dna);
            };
            this._subRaceChips.set(sr, chip);
            this._subRaceRow.appendChild(chip);
        }
        archSec.append(subRaceLabel, this._subRaceRow);
        // Quick Presets — notable archetypes with curated DNA
        const presetSec = document.createElement('div');
        presetSec.className = 'cc-section';
        const presetTitle = document.createElement('div');
        presetTitle.className = 'cc-section-title';
        presetTitle.textContent = 'Quick Presets';
        const presetChips = document.createElement('div');
        presetChips.className = 'cc-chips';
        const PRESETS = [
            { label: '🐶 Dog', dna: DOG_DNA },
            { label: '🐱 Cat', dna: CAT_DNA },
        ];
        for (const p of PRESETS) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip';
            chip.textContent = p.label;
            chip.onclick = () => {
                this._dna = cloneDNA(p.dna);
                this._subRaceRow.style.display = 'none';
                this._syncControls();
                this._preview?.setDNA(this._dna);
            };
            presetChips.appendChild(chip);
        }
        presetSec.append(presetTitle, presetChips);
        // Boon
        const boonSec = document.createElement('div');
        boonSec.className = 'cc-section';
        const boonTitle = document.createElement('div');
        boonTitle.className = 'cc-section-title';
        boonTitle.textContent = 'Boon';
        const boonList = document.createElement('div');
        boonList.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
        for (const b of BOONS) {
            const card2 = document.createElement('div');
            card2.className = 'cc-boon';
            const icon = document.createElement('span');
            icon.className = 'cc-boon-icon';
            icon.textContent = b.icon;
            const body = document.createElement('div');
            const t2 = document.createElement('div');
            t2.className = 'cc-boon-title';
            t2.textContent = b.title;
            const d2 = document.createElement('div');
            d2.className = 'cc-boon-desc';
            d2.textContent = b.desc;
            const e2 = document.createElement('div');
            e2.className = 'cc-boon-effect';
            e2.textContent = b.effect;
            body.append(t2, d2, e2);
            card2.append(icon, body);
            card2.onclick = () => { this._boon = b.id; this._boonCards.forEach((el, id) => el.classList.toggle('cc-boon--on', id === b.id)); };
            this._boonCards.set(b.id, card2);
            boonList.appendChild(card2);
        }
        boonSec.append(boonTitle, boonList);
        // Palette
        const palSec = this._makeSection('Palette');
        const colorRows = [['Body', 'primary'], ['Accent', 'secondary'], ['Emissive', 'emissive']];
        for (const [lbl, key] of colorRows) {
            const row = document.createElement('div');
            row.className = 'cc-row';
            const label = document.createElement('span');
            label.className = 'cc-row-lbl';
            label.textContent = lbl + ':';
            const inp = document.createElement('input');
            inp.type = 'color';
            inp.className = 'cc-color-input';
            inp.addEventListener('input', () => { this._dna.colors[key] = hexToNum(inp.value); this._preview?.setDNA(this._dna); });
            if (key === 'primary')
                this._primaryInput = inp;
            if (key === 'secondary')
                this._secondaryInput = inp;
            if (key === 'emissive')
                this._emissiveInput = inp;
            row.append(label, inp);
            palSec.appendChild(row);
        }
        // Emissive intensity
        const emRow = document.createElement('div');
        emRow.className = 'cc-row';
        const emLbl = document.createElement('span');
        emLbl.className = 'cc-row-lbl';
        emLbl.textContent = 'Glow:';
        this._emissiveSlider = document.createElement('input');
        this._emissiveSlider.type = 'range';
        this._emissiveSlider.className = 'cc-slider';
        this._emissiveSlider.min = '0';
        this._emissiveSlider.max = '0.5';
        this._emissiveSlider.step = '0.01';
        this._emissiveVal = document.createElement('span');
        this._emissiveVal.className = 'cc-slider-val';
        this._emissiveSlider.oninput = () => { this._dna.colors.emissiveIntensity = +this._emissiveSlider.value; this._emissiveVal.textContent = (+this._emissiveSlider.value).toFixed(2); this._preview?.setDNA(this._dna); };
        emRow.append(emLbl, this._emissiveSlider, this._emissiveVal);
        palSec.appendChild(emRow);
        // Body skin pattern (CC-7)
        const bpRow = document.createElement('div');
        bpRow.className = 'cc-row';
        const bpLbl = document.createElement('span');
        bpLbl.className = 'cc-row-lbl';
        bpLbl.textContent = 'Body pattern:';
        const bpChips = document.createElement('div');
        bpChips.className = 'cc-chips';
        const bodyPatternChips = new Map();
        for (const sp of ['none', 'stripes', 'spots', 'scales', 'gradient', 'cracks', 'fur']) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip cc-chip--sm';
            chip.textContent = sp;
            chip.onclick = () => {
                this._dna.colors.pattern = sp;
                bodyPatternChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === sp));
                bpColorRow.style.display = sp !== 'none' ? 'flex' : 'none';
                this._preview?.setDNA(this._dna);
            };
            bodyPatternChips.set(sp, chip);
            bpChips.appendChild(chip);
        }
        bpRow.append(bpLbl, bpChips);
        palSec.appendChild(bpRow);
        // Body pattern color (shown when pattern active)
        const bpColorRow = document.createElement('div');
        bpColorRow.className = 'cc-row';
        bpColorRow.style.display = 'none';
        const bpcLbl = document.createElement('span');
        bpcLbl.className = 'cc-row-lbl';
        bpcLbl.textContent = 'Pattern color:';
        const bpcInput = document.createElement('input');
        bpcInput.type = 'color';
        bpcInput.className = 'cc-color-input';
        bpcInput.addEventListener('input', () => { this._dna.colors.patternColor = hexToNum(bpcInput.value); this._preview?.setDNA(this._dna); });
        bpColorRow.append(bpcLbl, bpcInput);
        palSec.appendChild(bpColorRow);
        // Store refs for _syncControls
        this._bodyPatternChips = bodyPatternChips;
        this._bodyPatternColorRow = bpColorRow;
        this._bodyPatternColorInput = bpcInput;
        // Face
        const faceSec = this._makeSection('Face');
        // Face type chips (all 14 — archetype filtering applied in _syncControls)
        const ftRow = document.createElement('div');
        ftRow.className = 'cc-row';
        const ftLbl = document.createElement('span');
        ftLbl.className = 'cc-row-lbl';
        ftLbl.textContent = 'Type:';
        const ftChips = document.createElement('div');
        ftChips.className = 'cc-chips';
        for (const ft of ['cute', 'cherubic', 'gaunt', 'angry', 'skull', 'cat', 'lizard', 'demon', 'ancient', 'bird', 'insect', 'cyclops', 'compound', 'blank']) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip';
            chip.textContent = ft;
            chip.onclick = () => { this._dna.face.type = ft; this._faceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === ft)); this._preview?.setDNA(this._dna); };
            this._faceChips.set(ft, chip);
            ftChips.appendChild(chip);
        }
        ftRow.append(ftLbl, ftChips);
        faceSec.appendChild(ftRow);
        // Eye shape chips
        const esRow = document.createElement('div');
        esRow.className = 'cc-row';
        const esLbl = document.createElement('span');
        esLbl.className = 'cc-row-lbl';
        esLbl.textContent = 'Eye shape:';
        const esChips = document.createElement('div');
        esChips.className = 'cc-chips';
        for (const es of ['round', 'almond', 'slit', 'compound', 'void', 'star']) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip cc-chip--sm';
            chip.textContent = es;
            chip.onclick = () => { this._dna.face.eyeShape = es; this._eyeShapeChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === es)); this._preview?.setDNA(this._dna); };
            this._eyeShapeChips.set(es, chip);
            esChips.appendChild(chip);
        }
        esRow.append(esLbl, esChips);
        faceSec.appendChild(esRow);
        // Brow style chips
        const bsRow = document.createElement('div');
        bsRow.className = 'cc-row';
        const bsLbl = document.createElement('span');
        bsLbl.className = 'cc-row-lbl';
        bsLbl.textContent = 'Brow:';
        const bsChips = document.createElement('div');
        bsChips.className = 'cc-chips';
        for (const bs of ['none', 'thin', 'thick', 'furrowed', 'arched']) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip cc-chip--sm';
            chip.textContent = bs;
            chip.onclick = () => { this._dna.face.browStyle = bs; this._browStyleChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === bs)); this._preview?.setDNA(this._dna); };
            this._browStyleChips.set(bs, chip);
            bsChips.appendChild(chip);
        }
        bsRow.append(bsLbl, bsChips);
        faceSec.appendChild(bsRow);
        // Mouth chips
        const mRow = document.createElement('div');
        mRow.className = 'cc-row';
        const mLbl = document.createElement('span');
        mLbl.className = 'cc-row-lbl';
        mLbl.textContent = 'Mouth:';
        const mChips = document.createElement('div');
        mChips.className = 'cc-chips';
        for (const mt of ['smile', 'frown', 'beak', 'fangs', 'none']) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip';
            chip.textContent = mt;
            chip.onclick = () => { this._dna.face.mouthType = mt; this._mouthChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === mt)); this._preview?.setDNA(this._dna); };
            this._mouthChips.set(mt, chip);
            mChips.appendChild(chip);
        }
        mRow.append(mLbl, mChips);
        faceSec.appendChild(mRow);
        // Skin pattern chips
        const spRow = document.createElement('div');
        spRow.className = 'cc-row';
        const spLbl = document.createElement('span');
        spLbl.className = 'cc-row-lbl';
        spLbl.textContent = 'Pattern:';
        const spChips = document.createElement('div');
        spChips.className = 'cc-chips';
        for (const sp of ['none', 'stripes', 'spots', 'scales', 'gradient', 'cracks', 'fur']) {
            const chip = document.createElement('div');
            chip.className = 'cc-chip cc-chip--sm';
            chip.textContent = sp;
            chip.onclick = () => {
                this._dna.face.skinPattern = sp;
                this._skinPatternChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === sp));
                this._markColorRow.style.display = sp !== 'none' ? 'flex' : 'none';
                this._preview?.setDNA(this._dna);
            };
            this._skinPatternChips.set(sp, chip);
            spChips.appendChild(chip);
        }
        spRow.append(spLbl, spChips);
        faceSec.appendChild(spRow);
        // Mark color (visible when pattern is active)
        this._markColorRow = document.createElement('div');
        this._markColorRow.className = 'cc-row';
        this._markColorRow.style.display = 'none';
        const mcLbl = document.createElement('span');
        mcLbl.className = 'cc-row-lbl';
        mcLbl.textContent = 'Mark color:';
        this._markColorInput = document.createElement('input');
        this._markColorInput.type = 'color';
        this._markColorInput.className = 'cc-color-input';
        this._markColorInput.addEventListener('input', () => { this._dna.face.markColor = hexToNum(this._markColorInput.value); this._preview?.setDNA(this._dna); });
        this._markColorRow.append(mcLbl, this._markColorInput);
        faceSec.appendChild(this._markColorRow);
        // Eye color
        const eyRow = document.createElement('div');
        eyRow.className = 'cc-row';
        const eyLbl = document.createElement('span');
        eyLbl.className = 'cc-row-lbl';
        eyLbl.textContent = 'Eye color:';
        this._eyeInput = document.createElement('input');
        this._eyeInput.type = 'color';
        this._eyeInput.className = 'cc-color-input';
        this._eyeInput.addEventListener('input', () => { this._dna.face.eyeColor = hexToNum(this._eyeInput.value); this._preview?.setDNA(this._dna); });
        eyRow.append(eyLbl, this._eyeInput);
        faceSec.appendChild(eyRow);
        // Props
        const propSec = this._makeSection('Props');
        const propGrid = document.createElement('div');
        propGrid.className = 'cc-prop-grid';
        for (const pd of PROP_DEFS) {
            const item = document.createElement('div');
            item.className = 'cc-prop';
            const box = document.createElement('span');
            box.className = 'cc-prop-box';
            const lbl2 = document.createElement('span');
            lbl2.textContent = pd.label;
            item.append(box, lbl2);
            item.onclick = () => {
                const idx = this._dna.props.indexOf(pd.id);
                if (idx >= 0)
                    this._dna.props.splice(idx, 1);
                else
                    this._dna.props.push(pd.id);
                item.classList.toggle('cc-prop--on', this._dna.props.includes(pd.id));
                this._preview?.setDNA(this._dna);
            };
            this._propChips.set(pd.id, item);
            propGrid.appendChild(item);
        }
        propSec.appendChild(propGrid);
        // Outfit — Top / Legs / Over (biped only, _syncControls handles show/hide)
        this._outfitSec = this._makeSection('Outfit');
        {
            const topRow = document.createElement('div');
            topRow.className = 'cc-row';
            const topLbl = document.createElement('span');
            topLbl.className = 'cc-row-lbl';
            topLbl.textContent = 'Top:';
            const topChips = document.createElement('div');
            topChips.className = 'cc-chips';
            for (const [id, lbl4] of [['none', 'None'], ['tunic', 'Tunic'], ['robe_top', 'Robe Top'], ['armor_chest', 'Armor'], ['wrap', 'Wrap'], ['dress_flared', 'Dress ↑'], ['dress_layered', 'Dress ↑↑']]) {
                const chip = document.createElement('div');
                chip.className = 'cc-chip';
                chip.textContent = lbl4;
                chip.onclick = () => { this._dna.outfit.top = id; this._outfitTopChips.forEach((el, k) => el.classList.toggle('cc-chip--on', k === id)); this._preview?.setDNA(this._dna); };
                this._outfitTopChips.set(id, chip);
                topChips.appendChild(chip);
            }
            topRow.append(topLbl, topChips);
            this._outfitSec.appendChild(topRow);
        }
        {
            const legsRow = document.createElement('div');
            legsRow.className = 'cc-row';
            const legsLbl = document.createElement('span');
            legsLbl.className = 'cc-row-lbl';
            legsLbl.textContent = 'Legs:';
            const legsChips = document.createElement('div');
            legsChips.className = 'cc-chips';
            for (const [id, lbl4] of [['none', 'None'], ['trousers', 'Trousers'], ['skirt', 'Skirt'], ['shorts', 'Shorts'], ['loincloth', 'Loincloth'], ['robe_skirt', 'Robe Skirt'], ['skirt_gathered', 'Gathered Skirt'], ['skirt_long', 'Long Skirt']]) {
                const chip = document.createElement('div');
                chip.className = 'cc-chip';
                chip.textContent = lbl4;
                chip.onclick = () => { this._dna.outfit.legs = id; this._outfitLegsChips.forEach((el, k) => el.classList.toggle('cc-chip--on', k === id)); this._preview?.setDNA(this._dna); };
                this._outfitLegsChips.set(id, chip);
                legsChips.appendChild(chip);
            }
            legsRow.append(legsLbl, legsChips);
            this._outfitSec.appendChild(legsRow);
        }
        {
            const overRow = document.createElement('div');
            overRow.className = 'cc-row';
            const overLbl = document.createElement('span');
            overLbl.className = 'cc-row-lbl';
            overLbl.textContent = 'Over:';
            const overChips = document.createElement('div');
            overChips.className = 'cc-chips';
            for (const [id, lbl4] of [['none', 'None'], ['robe_full', 'Robe'], ['cape', 'Cape'], ['cloak', 'Cloak'], ['robe_layered', 'Layered Robe']]) {
                const chip = document.createElement('div');
                chip.className = 'cc-chip';
                chip.textContent = lbl4;
                chip.onclick = () => { this._dna.outfit.over = id; this._outfitOverChips.forEach((el, k) => el.classList.toggle('cc-chip--on', k === id)); this._preview?.setDNA(this._dna); };
                this._outfitOverChips.set(id, chip);
                overChips.appendChild(chip);
            }
            overRow.append(overLbl, overChips);
            this._outfitSec.appendChild(overRow);
        }
        // Scale
        const scaleSec = this._makeSection('Body');
        const scRow = document.createElement('div');
        scRow.className = 'cc-row';
        const scLbl = document.createElement('span');
        scLbl.className = 'cc-row-lbl';
        scLbl.textContent = 'Global:';
        this._scaleSlider = document.createElement('input');
        this._scaleSlider.type = 'range';
        this._scaleSlider.className = 'cc-slider';
        this._scaleSlider.min = '0.5';
        this._scaleSlider.max = '2.0';
        this._scaleSlider.step = '0.05';
        this._scaleVal = document.createElement('span');
        this._scaleVal.className = 'cc-slider-val';
        this._scaleSlider.oninput = () => { this._dna.proportions.global = +this._scaleSlider.value; this._scaleVal.textContent = (+this._scaleSlider.value).toFixed(2); this._preview?.setDNA(this._dna); };
        scRow.append(scLbl, this._scaleSlider, this._scaleVal);
        scaleSec.appendChild(scRow);
        // CC-3 morph sliders — biped-only, wrapped for easy show/hide
        this._morphWrap = document.createElement('div');
        this._morphWrap.style.cssText = 'display:flex;flex-direction:column;gap:7px;';
        for (const md of [
            { label: 'Shoulders', prop: 'shoulderWidth', min: '0.5', max: '2.0', step: '0.05' },
            { label: 'Hips', prop: 'hipWidth', min: '0.5', max: '2.0', step: '0.05' },
            { label: 'Belly', prop: 'bellySize', min: '0.0', max: '1.5', step: '0.05' },
            { label: 'Neck W', prop: 'neckThickness', min: '0.5', max: '1.8', step: '0.05' },
            { label: 'Torso H', prop: 'torso_y', min: '0.5', max: '2.0', step: '0.05' },
            { label: 'Leg L', prop: 'legLength', min: '0.4', max: '2.0', step: '0.05' },
        ]) {
            const mRow = document.createElement('div');
            mRow.className = 'cc-row';
            const mLbl = document.createElement('span');
            mLbl.className = 'cc-row-lbl';
            mLbl.textContent = md.label + ':';
            const mSlider = document.createElement('input');
            mSlider.type = 'range';
            mSlider.className = 'cc-slider';
            mSlider.min = md.min;
            mSlider.max = md.max;
            mSlider.step = md.step;
            const mVal = document.createElement('span');
            mVal.className = 'cc-slider-val';
            mSlider.oninput = () => {
                const v = +mSlider.value;
                if (md.prop === 'torso_y') {
                    this._dna.proportions.torso[1] = v;
                }
                else {
                    this._dna.proportions[md.prop] = v;
                }
                mVal.textContent = v.toFixed(2);
                this._preview?.setDNA(this._dna);
            };
            mRow.append(mLbl, mSlider, mVal);
            this._morphWrap.appendChild(mRow);
            this._morphInputs.push({ prop: md.prop, slider: mSlider, val: mVal });
        }
        scaleSec.appendChild(this._morphWrap);
        ctrlCol.append(nameWrap, archSec, presetSec, boonSec, palSec, faceSec, propSec, this._outfitSec, scaleSec);
        main.append(previewCol, ctrlCol);
        // ── Asset mode pane (hidden when charMode is 'code') ──────────────────
        const assetPane = document.createElement('div');
        assetPane.className = 'cc-controls-col';
        assetPane.style.display = 'none';
        this._assetPane = assetPane;
        const assetNameWrap = document.createElement('div');
        assetNameWrap.className = 'cc-section';
        const assetNameLbl = document.createElement('label');
        assetNameLbl.className = 'cc-label';
        assetNameLbl.textContent = 'Name';
        assetNameLbl.setAttribute('for', 'cc-asset-name');
        const assetNameInput = document.createElement('input');
        assetNameInput.type = 'text';
        assetNameInput.id = 'cc-asset-name';
        assetNameInput.className = 'cc-name-input';
        assetNameInput.placeholder = 'Enter a name…';
        assetNameInput.maxLength = 24;
        this._assetNameInput = assetNameInput;
        assetNameWrap.append(assetNameLbl, assetNameInput);
        const assetBrowserSec = document.createElement('div');
        assetBrowserSec.className = 'cc-section';
        assetBrowserSec.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;';
        const assetBrowserTitle = document.createElement('div');
        assetBrowserTitle.className = 'cc-section-title';
        assetBrowserTitle.textContent = 'Choose Character';
        assetBrowserSec.appendChild(assetBrowserTitle);
        this._assetBrowserSec = assetBrowserSec;
        const assetBoonSec = boonSec.cloneNode(true);
        // Re-wire onclick for the cloned boon cards
        assetBoonSec.querySelectorAll('.cc-boon').forEach((card2, i) => {
            const boon = BOONS[i];
            card2.onclick = () => {
                this._boon = boon.id;
                assetBoonSec.querySelectorAll('.cc-boon').forEach((c, j) => c.classList.toggle('cc-boon--on', j === i));
            };
        });
        assetPane.append(assetNameWrap, assetBrowserSec, assetBoonSec);
        main.appendChild(assetPane);
        // ── Switch between DNA and Asset pane based on charMode ───────────────
        const wg = loadWorldGenConfig();
        if (wg.charMode === 'asset') {
            ctrlCol.style.display = 'none';
            assetPane.style.display = '';
            this._assetBrowser = new AssetCharBrowser(assetBrowserSec, wg.charPacks, (def) => { this._assetModel = def; });
        }
        // Sync name input across panes
        this._nameInput.addEventListener('input', () => { assetNameInput.value = this._nameInput.value; });
        assetNameInput.addEventListener('input', () => { this._nameInput.value = assetNameInput.value; });
        // Actions
        const actions = document.createElement('div');
        actions.className = 'cc-actions';
        const backBtn = document.createElement('button');
        backBtn.className = 'cc-btn cc-btn--back';
        backBtn.textContent = '← Back';
        backBtn.onclick = () => this._onBack();
        const startBtn = document.createElement('button');
        startBtn.className = 'cc-btn cc-btn--start';
        startBtn.textContent = 'Begin →';
        startBtn.onclick = () => {
            const wgNow = loadWorldGenConfig();
            const name = (wgNow.charMode === 'asset' ? assetNameInput : this._nameInput).value.trim() || 'The Transmuter';
            const base = { name, boon: this._boon, slotId: this._slotId, dna: cloneDNA(this._dna) };
            if (wgNow.charMode === 'asset' && this._assetModel) {
                base.assetModel = this._assetModel;
            }
            this._onStart(base);
        };
        actions.append(backBtn, startBtn);
        card.append(main, actions);
        overlay.appendChild(card);
        return overlay;
    }
    // Creates a section wrapper with a title div that returns the section element
    _makeSection(title) {
        const sec = document.createElement('div');
        sec.className = 'cc-section';
        const t = document.createElement('div');
        t.className = 'cc-section-title';
        t.textContent = title;
        sec.appendChild(t);
        return sec;
    }
}
function _ensureStyles() {
    if (document.getElementById('cc-css'))
        return;
    const s = document.createElement('style');
    s.id = 'cc-css';
    s.textContent = CC_CSS;
    document.head.appendChild(s);
}
