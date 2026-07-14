// ── CharacterCreation ────────────────────────────────────────────────────────
//
//  Character creation screen shown on New Game.
//  Includes a live procedural 3D mini-scene for appearance preview using a
//  dedicated WebGLRenderer (Phase 7.5e FK rig will replace the geometry once built).

import * as THREE from 'three';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StartingBoon = 'tome' | 'blood' | 'swift';
export type HeadShape    = 'round' | 'angular' | 'elongated';
export type HairStyle    = 'none'  | 'short'   | 'long';

export interface CharacterConfig {
  name:        string;
  boon:        StartingBoon;
  slotId:      number;
  // Appearance — stored for Phase 7.5e FK rig
  headShape:   HeadShape;
  hairStyle:   HairStyle;
  skinColor:   number;   // 0xRRGGBB
  robeColor:   number;   // 0xRRGGBB
  heightScale: number;   // 0.7 – 1.3
  widthScale:  number;   // 0.8 – 1.2
}

// ── Boon definitions ──────────────────────────────────────────────────────────

interface BoonDef {
  id: StartingBoon;
  icon: string;
  title: string;
  desc: string;
  effect: string;
}

const BOONS: BoonDef[] = [
  {
    id: 'tome', icon: '📖', title: 'Ancient Tome',
    desc: 'A singed spellbook left behind by a previous occupant of the cell.',
    effect: 'Start with Flame Dart unlocked',
  },
  {
    id: 'blood', icon: '❤', title: "Warrior's Blood",
    desc: 'A trace of old lineage. Harder to extinguish than it looks.',
    effect: '+30 maximum HP',
  },
  {
    id: 'swift', icon: '💨', title: 'Swift Feet',
    desc: 'A talent for movement, developed over years of being where you ought not to be.',
    effect: 'Dodge −35%  •  Move speed +15%',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToInput(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}
function inputToHex(s: string): number {
  return parseInt(s.slice(1), 16);
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CC_CSS = `
.cc-overlay {
  display: none; align-items: center; justify-content: center;
  position: fixed; inset: 0; z-index: 8500;
  background: rgba(4,3,10,.92);
  backdrop-filter: blur(6px);
  opacity: 0; transition: opacity .25s ease;
  font-family: 'Crimson Text','Georgia',serif;
  overflow-y: auto;
}
.cc-overlay.cc-open { opacity: 1; }

.cc-card {
  background: linear-gradient(160deg,#0e0b1a 0%,#07060f 100%);
  border: 1px solid #3a2860; border-radius: 4px;
  padding: 26px 28px 22px;
  width: min(96vw, 820px);
  display: flex; flex-direction: column; gap: 18px;
  box-shadow: 0 20px 80px rgba(0,0,0,.9), 0 0 0 1px #0b0817 inset;
  margin: auto;
}

.cc-title {
  font-size: 1.75rem; color: #e8d8b0; letter-spacing: .08em; text-align: center;
  text-shadow: 0 0 24px rgba(160,120,220,.5); margin-bottom: -12px;
}
.cc-subtitle {
  font-size: .82rem; color: #6a5880; text-align: center; letter-spacing: .06em;
  text-transform: uppercase;
}

/* ── Two-column layout ── */
.cc-main { display: flex; gap: 22px; align-items: flex-start; flex-wrap: wrap; }

.cc-preview-col {
  flex: 0 0 240px; display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.cc-preview-canvas {
  display: block; width: 240px; height: 300px;
  border: 1px solid #2a1850; border-radius: 4px;
  cursor: grab; user-select: none; background: #0e0b1a;
}
.cc-preview-canvas:active { cursor: grabbing; }
.cc-drag-hint { font-size: .69rem; color: #3a2860; letter-spacing: .06em; text-transform: uppercase; }

.cc-controls-col {
  flex: 1 1 280px; min-width: 230px;
  display: flex; flex-direction: column; gap: 13px;
}

/* ── Name ── */
.cc-name-row { display: flex; flex-direction: column; gap: 5px; }
.cc-label { font-size: .77rem; color: #7a6a99; letter-spacing: .08em; text-transform: uppercase; }
.cc-name-input {
  background: #07060f; border: 1px solid #2e1f50; border-radius: 3px;
  color: #e0d0ff; font-size: 1.04rem; font-family: inherit;
  padding: 8px 12px; outline: none; transition: border-color .15s;
}
.cc-name-input:focus { border-color: #7050cc; box-shadow: 0 0 0 2px rgba(112,80,204,.18); }

/* ── Boons ── */
.cc-boon-label { font-size: .77rem; color: #7a6a99; letter-spacing: .08em; text-transform: uppercase; }
.cc-boons { display: flex; flex-direction: column; gap: 6px; }
.cc-boon {
  display: flex; align-items: flex-start; gap: 10px;
  background: rgba(255,255,255,.025); border: 1px solid #1e1530;
  border-radius: 3px; padding: 8px 11px; cursor: pointer;
  transition: background .12s, border-color .12s;
}
.cc-boon:hover { background: rgba(112,80,204,.08); border-color: #3a2860; }
.cc-boon.cc-boon--active {
  background: rgba(112,80,204,.14); border-color: #7050cc;
  box-shadow: 0 0 0 1px rgba(112,80,204,.22);
}
.cc-boon-icon { font-size: 1.25rem; flex-shrink: 0; margin-top: 1px; }
.cc-boon-body { display: flex; flex-direction: column; gap: 2px; }
.cc-boon-title { color: #d4c0f0; font-size: .93rem; }
.cc-boon-desc { color: #7a6a90; font-size: .78rem; line-height: 1.4; }
.cc-boon-effect { color: #a080e8; font-size: .74rem; letter-spacing: .03em; margin-top: 1px; }

/* ── Appearance ── */
.cc-appear-section { display: flex; flex-direction: column; gap: 8px; }
.cc-appear-title {
  font-size: .77rem; color: #5a4880; letter-spacing: .1em; text-transform: uppercase;
  border-bottom: 1px solid #1a1228; padding-bottom: 4px;
}
.cc-appear-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.cc-appear-row-label { font-size: .77rem; color: #7a6a99; min-width: 44px; flex-shrink: 0; }

.cc-radio-group { display: flex; gap: 5px; flex-wrap: wrap; }
.cc-radio {
  display: flex; align-items: center; gap: 4px; cursor: pointer;
  font-size: .79rem; color: #8070a0; user-select: none;
}
.cc-radio-dot {
  width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid #3a2860;
  background: transparent; flex-shrink: 0; transition: all .12s;
}
.cc-radio:hover .cc-radio-dot { border-color: #7050cc; }
.cc-radio.cc-radio--active .cc-radio-dot { background: #7050cc; border-color: #9070e0; }
.cc-radio.cc-radio--active { color: #d4c0f0; }

.cc-color-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.cc-color-item { display: flex; align-items: center; gap: 6px; }
.cc-color-label { font-size: .77rem; color: #7a6a99; }
.cc-color-input {
  width: 42px; height: 26px; border: 1px solid #2a1850; border-radius: 3px;
  padding: 2px; background: #07060f; cursor: pointer;
  -webkit-appearance: none; appearance: none;
}
.cc-color-input::-webkit-color-swatch-wrapper { padding: 1px; }
.cc-color-input::-webkit-color-swatch { border: none; border-radius: 2px; }

.cc-slider-row { display: flex; align-items: center; gap: 9px; }
.cc-slider-label { font-size: .77rem; color: #7a6a99; min-width: 50px; }
.cc-slider { flex: 1; accent-color: #7050cc; cursor: pointer; }
.cc-slider-val { font-size: .73rem; color: #5a4880; min-width: 32px; text-align: right; }

/* ── Actions ── */
.cc-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 2px; }
.cc-btn {
  border: none; border-radius: 3px; cursor: pointer; font-family: inherit;
  font-size: .91rem; letter-spacing: .04em; padding: 10px 22px;
  transition: background .12s, transform .05s;
}
.cc-btn:active { transform: scale(.97); }
.cc-btn--back {
  background: transparent; border: 1px solid #2e1f50; color: #7060a0;
}
.cc-btn--back:hover { background: rgba(255,255,255,.04); border-color: #4a3870; }
.cc-btn--start {
  background: linear-gradient(135deg,#5030a0 0%,#7050cc 100%);
  color: #f0e8ff; font-weight: 600;
  box-shadow: 0 4px 18px rgba(80,48,160,.45);
}
.cc-btn--start:hover { background: linear-gradient(135deg,#6040b8 0%,#8060e0 100%); }
`;

// ── CharacterPreview ──────────────────────────────────────────────────────────
// Dedicated mini Three.js scene rendered into the CC canvas.

const PW = 240;
const PH = 300;

class CharacterPreview {
  private readonly _renderer: THREE.WebGLRenderer;
  private readonly _scene:    THREE.Scene;
  private readonly _camera:   THREE.PerspectiveCamera;
  private readonly _charRoot  = new THREE.Group();

  // Materials (updated in place on color changes)
  private _skinMat!: THREE.MeshLambertMaterial;
  private _robeMat!: THREE.MeshLambertMaterial;
  private _beltMat!: THREE.MeshLambertMaterial;
  private _hairMat!: THREE.MeshLambertMaterial;

  // Rebuilt groups on shape/style change
  private _headGroup!: THREE.Group;
  private _hairGroup!: THREE.Group;

  // Config
  private _headShape: HeadShape = 'round';
  private _hairStyle: HairStyle = 'short';
  private _skinColor = 0xf5c89a;
  private _robeColor = 0x4a2080;

  // Animation
  private _rotY    = 0.5;
  private _running = false;
  private _raf     = 0;
  // Drag
  private _dragging   = false;
  private _dragStartX = 0;
  private _rotStartY  = 0;

  constructor(canvas: HTMLCanvasElement) {
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this._renderer.setSize(PW, PH);
    this._renderer.setClearColor(0x0e0b1a, 1);

    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(42, PW / PH, 0.1, 50);
    this._camera.position.set(0.4, 1.5, 3.2);
    this._camera.lookAt(0, 1.1, 0);

    const ambient = new THREE.AmbientLight(0xffe8d0, 0.6);
    const key     = new THREE.DirectionalLight(0xfff0e0, 1.1);
    key.position.set(3, 5, 3);
    const rim     = new THREE.DirectionalLight(0x8080cc, 0.28);
    rim.position.set(-2, 2, -3);
    this._scene.add(ambient, key, rim);
    this._scene.add(this._charRoot);

    this._buildCharacter();

    // Drag-to-rotate
    canvas.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      this._dragStartX = e.clientX;
      this._rotStartY = this._rotY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      this._rotY = this._rotStartY + (e.clientX - this._dragStartX) * 0.012;
    });
    canvas.addEventListener('pointerup',     () => { this._dragging = false; });
    canvas.addEventListener('pointercancel', () => { this._dragging = false; });
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  stop(): void {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  dispose(): void {
    this.stop();
    this._charRoot.traverse(o => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    [this._skinMat, this._robeMat, this._beltMat, this._hairMat].forEach(m => m?.dispose());
    this._renderer.dispose();
  }

  // ── Setters ──────────────────────────────────────────────────────────────────

  setHeadShape(s: HeadShape): void {
    if (s === this._headShape) return;
    this._headShape = s;
    this._rebuildHead();
  }
  setHairStyle(s: HairStyle): void {
    if (s === this._hairStyle) return;
    this._hairStyle = s;
    this._rebuildHair();
  }
  setSkinColor(hex: number): void {
    this._skinColor = hex;
    this._skinMat.color.setHex(hex);
  }
  setRobeColor(hex: number): void {
    this._robeColor = hex;
    this._robeMat.color.setHex(hex);
    const belt = new THREE.Color(hex);
    belt.multiplyScalar(0.65);
    this._beltMat.color.copy(belt);
  }
  setHeightScale(s: number): void { this._charRoot.scale.y = s; }
  setWidthScale(s: number):  void { this._charRoot.scale.x = s; this._charRoot.scale.z = s; }

  // ── Build ─────────────────────────────────────────────────────────────────────

  private _buildCharacter(): void {
    this._skinMat = new THREE.MeshLambertMaterial({ color: this._skinColor });
    this._robeMat = new THREE.MeshLambertMaterial({ color: this._robeColor });
    const beltCol = new THREE.Color(this._robeColor);
    beltCol.multiplyScalar(0.65);
    this._beltMat = new THREE.MeshLambertMaterial({ color: beltCol });
    this._hairMat = new THREE.MeshLambertMaterial({ color: 0x1e0c04 });
    const eyeMat    = new THREE.MeshLambertMaterial({ color: 0x100808 });
    const shadowMat = new THREE.MeshLambertMaterial({ color: 0x030208, transparent: true, opacity: 0.35 });

    // Shadow disc
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.01, 16), shadowMat);
    sh.position.y = 0.005;
    this._charRoot.add(sh);

    // Robe (lower body — flared)
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.46, 1.1, 10), this._robeMat);
    robe.position.y = 0.55;
    this._charRoot.add(robe);

    // Belt / sash
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 10), this._beltMat);
    belt.position.y = 1.07;
    this._charRoot.add(belt);

    // Upper torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.235, 0.50, 10), this._robeMat);
    torso.position.y = 1.35;
    this._charRoot.add(torso);

    // Sleeves
    const slGeo = new THREE.CylinderGeometry(0.065, 0.07, 0.32, 7);
    const lSl   = new THREE.Mesh(slGeo, this._robeMat);
    lSl.position.set(-0.265, 1.43, 0); lSl.rotation.z = 0.25;
    const rSl   = new THREE.Mesh(slGeo, this._robeMat);
    rSl.position.set( 0.265, 1.43, 0); rSl.rotation.z = -0.25;
    this._charRoot.add(lSl, rSl);

    // Hands (skin-coloured sphere at sleeve ends)
    const handGeo = new THREE.SphereGeometry(0.058, 8, 6);
    const lH = new THREE.Mesh(handGeo, this._skinMat);
    lH.position.set(-0.31, 1.27, 0);
    const rH = new THREE.Mesh(handGeo, this._skinMat);
    rH.position.set( 0.31, 1.27, 0);
    this._charRoot.add(lH, rH);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.13, 8), this._skinMat);
    neck.position.y = 1.665;
    this._charRoot.add(neck);

    // Head group (rebuilt on head shape change)
    this._headGroup = new THREE.Group();
    this._headGroup.position.y = 1.92;
    this._charRoot.add(this._headGroup);
    this._rebuildHead();

    // Eyes (positioned in charRoot space)
    const eyeGeo = new THREE.SphereGeometry(0.03, 6, 4);
    const lE = new THREE.Mesh(eyeGeo, eyeMat);
    lE.position.set(-0.072, 1.934, 0.183);
    const rE = new THREE.Mesh(eyeGeo, eyeMat);
    rE.position.set( 0.072, 1.934, 0.183);
    this._charRoot.add(lE, rE);

    // Hair group (rebuilt on hair style change)
    this._hairGroup = new THREE.Group();
    this._hairGroup.position.y = 1.92;
    this._charRoot.add(this._hairGroup);
    this._rebuildHair();
  }

  private _rebuildHead(): void {
    this._headGroup.traverse(o => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    this._headGroup.clear();
    let geo: THREE.BufferGeometry;
    let sy = 1;
    switch (this._headShape) {
      case 'angular':   geo = new THREE.SphereGeometry(0.21, 5, 4);   break;
      case 'elongated': geo = new THREE.SphereGeometry(0.18, 12, 8); sy = 1.32; break;
      default:          geo = new THREE.SphereGeometry(0.21, 16, 12);
    }
    const m = new THREE.Mesh(geo, this._skinMat);
    m.scale.y = sy;
    this._headGroup.add(m);
  }

  private _rebuildHair(): void {
    this._hairGroup.traverse(o => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    this._hairGroup.clear();
    if (this._hairStyle === 'none') return;

    // Top hemisphere cap (shared by short + long)
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.223, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this._hairMat,
    );
    cap.position.y = 0.04;
    this._hairGroup.add(cap);

    if (this._hairStyle === 'short') {
      // Small bun at back
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), this._hairMat);
      bun.position.set(0, 0.18, -0.15);
      this._hairGroup.add(bun);
    } else {
      // Long strands via CatmullRomCurve3 → TubeGeometry
      const strands: Array<[number, number, number]> = [
        [-Math.PI * 0.55,  0.03, -0.02],
        [-Math.PI * 0.75, -0.02,  0.01],
        [-Math.PI,         0.00,  0.00],
        [ Math.PI * 0.75,  0.02,  0.03],
        [ Math.PI * 0.55, -0.03, -0.01],
        [-Math.PI * 0.35,  0.04,  0.02],
        [ Math.PI * 0.35, -0.02,  0.03],
      ];
      for (const [angle, jx, jz] of strands) {
        const sx = Math.cos(angle) * 0.20;
        const sz = Math.sin(angle) * 0.20;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sx * 0.55, 0.17,  sz * 0.55),
          new THREE.Vector3(sx,        0.00,  sz),
          new THREE.Vector3(sx * 1.05 + jx, -0.28, sz * 0.95 + jz),
          new THREE.Vector3(sx * 0.88 + jx, -0.72, sz * 0.82),
        ]);
        this._hairGroup.add(new THREE.Mesh(
          new THREE.TubeGeometry(curve, 8, 0.024, 4, false),
          this._hairMat,
        ));
      }
    }
  }

  private _loop(): void {
    if (!this._running) return;
    this._raf = requestAnimationFrame(() => this._loop());
    if (!this._dragging) this._rotY += 0.007;
    this._charRoot.rotation.y = this._rotY;
    // Gentle idle bob
    this._charRoot.position.y = Math.sin(performance.now() * 0.0012) * 0.016;
    this._renderer.render(this._scene, this._camera);
  }
}

// ── CharacterCreation ─────────────────────────────────────────────────────────

export class CharacterCreation {
  private readonly _overlay: HTMLElement;
  private _preview: CharacterPreview | null = null;

  // State
  private _selectedBoon: StartingBoon = 'tome';
  private _nameInput:    HTMLInputElement | null = null;
  private _headShape:    HeadShape = 'round';
  private _hairStyle:    HairStyle = 'short';
  private _skinColor  = 0xf5c89a;
  private _robeColor  = 0x4a2080;
  private _heightScale = 1.0;
  private _widthScale  = 1.0;

  constructor(
    private readonly _onStart: (cfg: CharacterConfig) => void,
    private readonly _onBack: () => void,
  ) {
    this._ensureStyles();
    this._overlay = this._build();
    document.body.appendChild(this._overlay);
  }

  show(slotId: number): void {
    this._overlay.dataset.slotId = String(slotId);
    this._overlay.style.display = 'flex';
    requestAnimationFrame(() => this._overlay.classList.add('cc-open'));
    this._preview?.start();
  }

  hide(): void {
    this._preview?.stop();
    this._overlay.classList.remove('cc-open');
    setTimeout(() => { this._overlay.style.display = 'none'; }, 260);
  }

  dispose(): void {
    this._preview?.dispose();
    this._overlay.remove();
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────

  private _build(): HTMLElement {
    const ov   = document.createElement('div');
    ov.className = 'cc-overlay';

    const card = document.createElement('div');
    card.className = 'cc-card';

    // Title
    const title    = document.createElement('div');
    title.className = 'cc-title';
    title.textContent = 'The Ritual Begins';
    const subtitle = document.createElement('div');
    subtitle.className = 'cc-subtitle';
    subtitle.textContent = 'Who are you, exactly?';

    // ── Two-column main area ─────────────────────────────────────────────────
    const main = document.createElement('div');
    main.className = 'cc-main';

    // Preview column
    const prevCol = document.createElement('div');
    prevCol.className = 'cc-preview-col';
    const canvas = document.createElement('canvas');
    canvas.className = 'cc-preview-canvas';
    canvas.width  = PW;
    canvas.height = PH;
    const dragHint = document.createElement('div');
    dragHint.className = 'cc-drag-hint';
    dragHint.textContent = '← drag to rotate →';
    prevCol.append(canvas, dragHint);

    // Try creating the 3D preview
    try {
      this._preview = new CharacterPreview(canvas);
    } catch {
      // WebGL unavailable — canvas stays as dark background
    }

    // Controls column
    const ctrlCol = document.createElement('div');
    ctrlCol.className = 'cc-controls-col';

    // Name row
    const nameRow = document.createElement('div');
    nameRow.className = 'cc-name-row';
    const nameLbl = document.createElement('label');
    nameLbl.className = 'cc-label';
    nameLbl.textContent = 'Your name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cc-name-input';
    nameInput.placeholder = 'Princess…';
    nameInput.maxLength = 32;
    nameInput.autocomplete = 'off';
    this._nameInput = nameInput;
    nameRow.append(nameLbl, nameInput);

    // Boons
    const boonLbl = document.createElement('div');
    boonLbl.className = 'cc-boon-label';
    boonLbl.textContent = 'Starting boon';
    const boonList = document.createElement('div');
    boonList.className = 'cc-boons';
    boonList.id = 'cc-boons';
    for (const b of BOONS) {
      const row = document.createElement('div');
      row.className = 'cc-boon' + (b.id === 'tome' ? ' cc-boon--active' : '');
      row.dataset.boon = b.id;
      row.innerHTML = `
        <div class="cc-boon-icon">${b.icon}</div>
        <div class="cc-boon-body">
          <div class="cc-boon-title">${b.title}</div>
          <div class="cc-boon-desc">${b.desc}</div>
          <div class="cc-boon-effect">✦ ${b.effect}</div>
        </div>`;
      row.addEventListener('click', () => {
        this._selectedBoon = b.id as StartingBoon;
        this._refreshBoons();
      });
      boonList.appendChild(row);
    }

    // Appearance section
    const appearSec = document.createElement('div');
    appearSec.className = 'cc-appear-section';
    const appearTitle = document.createElement('div');
    appearTitle.className = 'cc-appear-title';
    appearTitle.textContent = 'Appearance';

    const headRow = this._buildRadioRow('Head',
      [['round','Round'],['angular','Angular'],['elongated','Elongated']],
      this._headShape,
      (v) => { this._headShape = v as HeadShape; this._preview?.setHeadShape(v as HeadShape); },
    );
    const hairRow = this._buildRadioRow('Hair',
      [['short','Short'],['long','Long'],['none','None']],
      this._hairStyle,
      (v) => { this._hairStyle = v as HairStyle; this._preview?.setHairStyle(v as HairStyle); },
    );

    const colorRow = document.createElement('div');
    colorRow.className = 'cc-appear-row cc-color-row';
    colorRow.append(
      this._buildColorPicker('Skin', this._skinColor, (h) => { this._skinColor = h; this._preview?.setSkinColor(h); }),
      this._buildColorPicker('Robe', this._robeColor, (h) => { this._robeColor = h; this._preview?.setRobeColor(h); }),
    );

    const heightRow = this._buildSlider('Height', 70, 130, 100, (v) => {
      this._heightScale = v / 100;
      this._preview?.setHeightScale(this._heightScale);
    });

    appearSec.append(appearTitle, headRow, hairRow, colorRow, heightRow);
    ctrlCol.append(nameRow, boonLbl, boonList, appearSec);
    main.append(prevCol, ctrlCol);

    // Actions
    const actions  = document.createElement('div');
    actions.className = 'cc-actions';
    const backBtn  = document.createElement('button');
    backBtn.className = 'cc-btn cc-btn--back';
    backBtn.textContent = '← Back';
    backBtn.onclick = () => { this.hide(); this._onBack(); };
    const startBtn = document.createElement('button');
    startBtn.className = 'cc-btn cc-btn--start';
    startBtn.textContent = 'Begin the Ritual →';
    startBtn.onclick = () => {
      const slotId = parseInt(this._overlay.dataset.slotId ?? '0');
      this.hide();
      this._onStart({
        name:        this._nameInput?.value.trim() || 'Princess',
        boon:        this._selectedBoon,
        slotId,
        headShape:   this._headShape,
        hairStyle:   this._hairStyle,
        skinColor:   this._skinColor,
        robeColor:   this._robeColor,
        heightScale: this._heightScale,
        widthScale:  this._widthScale,
      });
    };
    actions.append(backBtn, startBtn);

    card.append(title, subtitle, main, actions);
    ov.appendChild(card);
    return ov;
  }

  // ── Control helpers ─────────────────────────────────────────────────────────

  private _buildRadioRow(
    label: string,
    options: Array<[string, string]>,
    initial: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    const row  = document.createElement('div');
    row.className = 'cc-appear-row';
    const lbl  = document.createElement('span');
    lbl.className = 'cc-appear-row-label';
    lbl.textContent = label;
    const grp  = document.createElement('div');
    grp.className = 'cc-radio-group';
    for (const [val, text] of options) {
      const item = document.createElement('label');
      item.className = 'cc-radio' + (val === initial ? ' cc-radio--active' : '');
      item.dataset.val = val;
      const dot = document.createElement('span');
      dot.className = 'cc-radio-dot';
      item.append(dot, text);
      item.addEventListener('click', () => {
        grp.querySelectorAll<HTMLElement>('.cc-radio').forEach(el =>
          el.classList.toggle('cc-radio--active', el.dataset.val === val));
        onChange(val);
      });
      grp.appendChild(item);
    }
    row.append(lbl, grp);
    return row;
  }

  private _buildColorPicker(label: string, initHex: number, onChange: (h: number) => void): HTMLElement {
    const wrap  = document.createElement('div');
    wrap.className = 'cc-color-item';
    const lbl   = document.createElement('span');
    lbl.className = 'cc-color-label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type  = 'color';
    input.className = 'cc-color-input';
    input.value = hexToInput(initHex);
    input.addEventListener('input', () => onChange(inputToHex(input.value)));
    wrap.append(lbl, input);
    return wrap;
  }

  private _buildSlider(label: string, min: number, max: number, initPct: number, onChange: (v: number) => void): HTMLElement {
    const row   = document.createElement('div');
    row.className = 'cc-slider-row cc-appear-row';
    const lbl   = document.createElement('span');
    lbl.className = 'cc-slider-label';
    lbl.textContent = label;
    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.className = 'cc-slider';
    slider.min   = String(min);
    slider.max   = String(max);
    slider.value = String(initPct);
    slider.step  = '1';
    const val   = document.createElement('span');
    val.className = 'cc-slider-val';
    val.textContent = initPct + '%';
    slider.addEventListener('input', () => {
      val.textContent = slider.value + '%';
      onChange(parseInt(slider.value));
    });
    row.append(lbl, slider, val);
    return row;
  }

  private _refreshBoons(): void {
    const list = this._overlay.querySelector('#cc-boons');
    if (!list) return;
    list.querySelectorAll<HTMLElement>('.cc-boon').forEach(el =>
      el.classList.toggle('cc-boon--active', el.dataset.boon === this._selectedBoon));
  }

  private _ensureStyles(): void {
    if (document.getElementById('char-creation-css')) return;
    const s = document.createElement('style');
    s.id = 'char-creation-css';
    s.textContent = CC_CSS;
    document.head.appendChild(s);
  }
}
