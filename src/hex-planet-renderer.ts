/**
 * hex-planet-renderer.ts — Goldberg polyhedron hex planet for Overworld Studio
 *
 * Architecture:
 *   - hexasphere library generates tiles (hexagons + exactly 12 pentagons)
 *   - Each tile: centerPoint + boundary vertices, fan-triangulated into BufferGeometry
 *   - Tile elevation from fBm noise → extrude boundary outward from sphere
 *   - Tile colour = biome palette (same as realm map)
 *   - Settlement tiles highlighted with gold ring + CSS2D labels
 *   - Atmosphere + cloud spheres reused from PlanetRenderer shaders
 *   - OrbitControls + requestAnimationFrame loop
 *   - CSS2DRenderer for settlement name labels
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
// @ts-ignore — hexasphere ships CJS, no @types
import { Hexasphere } from 'hexasphere';

// ── Atmosphere shaders (same as planet-renderer.ts) ──────────────────────────

const ATMOS_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOS_FRAG = /* glsl */`
  uniform vec3  uSunDirection;
  uniform vec3  uAtmosphereColor;
  varying vec3  vNormal;
  varying vec3  vPosition;
  void main() {
    vec3  viewDir   = normalize(cameraPosition - vPosition);
    float rim       = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 2.2);
    float sunFacing = dot(vNormal, uSunDirection) * 0.5 + 0.5;
    float alpha     = rim * 0.38 * (0.45 + 0.55 * sunFacing);
    gl_FragColor    = vec4(uAtmosphereColor, alpha);
  }
`;

const STAR_VERT = /* glsl */`
  attribute float aSize;
  attribute float aTwinkle;
  attribute vec3  aColor;
  varying vec3    vColor;
  varying float   vAlpha;
  uniform float   uTime;
  void main() {
    vColor = aColor;
    float tw = 0.78 + 0.22 * sin(uTime * aTwinkle + aTwinkle * 119.0);
    vAlpha = tw;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * tw * (380.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`;

const STAR_FRAG = /* glsl */`
  varying vec3  vColor;
  varying float vAlpha;
  void main() {
    float d    = distance(gl_PointCoord, vec2(0.5));
    float disc = 1.0 - smoothstep(0.25, 0.50, d);
    float glow = 1.0 - smoothstep(0.00, 0.50, d);
    float a    = disc * 0.85 + glow * 0.15;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 0xFFFF_FFFF;
  };
}

function makeGrid(GW: number, GH: number, rand: () => number): Float32Array {
  const g = new Float32Array(GW * GH);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return g;
}

function valueNoise2D(x: number, y: number, g: Float32Array, GW: number, GH: number): number {
  const xi = ((Math.floor(x) % GW) + GW) % GW;
  const yi = ((Math.floor(y) % GH) + GH) % GH;
  const xi1 = (xi+1)%GW, yi1 = (yi+1)%GH;
  const fx = x-Math.floor(x), fy = y-Math.floor(y);
  const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
  const v00 = g[yi*GW+xi]!, v10 = g[yi*GW+xi1]!;
  const v01 = g[yi1*GW+xi]!, v11 = g[yi1*GW+xi1]!;
  return v00*(1-ux)*(1-uy)+v10*ux*(1-uy)+v01*(1-ux)*uy+v11*ux*uy;
}

// ── Biome palette ─────────────────────────────────────────────────────────────

type BiomeName = 'deep_ocean'|'ocean'|'beach'|'desert'|'savanna'|'grassland'|'forest'|'taiga'|'tundra'|'snow';

const BIOME_COLOR: Record<BiomeName, readonly [number,number,number]> = {
  deep_ocean: [18, 45, 105],
  ocean:      [32, 72, 168],
  beach:      [210,192,112],
  desert:     [218,155, 58],
  savanna:    [148,172, 48],
  grassland:  [ 52,140, 40],
  forest:     [ 24, 95, 28],
  taiga:      [ 42, 92, 68],
  tundra:     [ 90,112,130],
  snow:       [222,238,250],
};

function classifyBiome(elev: number, moist: number, temp: number): BiomeName {
  if (elev < 0.30) return 'deep_ocean';
  if (elev < 0.38) return 'ocean';
  if (elev < 0.43) return 'beach';
  if (elev > 0.84) return 'snow';
  if (temp < 0.16) return 'tundra';
  if (temp < 0.32) return 'taiga';
  if (moist < 0.26) return 'desert';
  if (moist < 0.46 && temp > 0.60) return 'savanna';
  if (moist < 0.50) return 'grassland';
  if (temp < 0.56) return 'taiga';
  return 'forest';
}

// ── HexPlanetRenderer ─────────────────────────────────────────────────────────

export interface HexPlanetSettings {
  seed:         number;
  subdivisions: number;
  roughness:    number;   // 0-1 — controls vertical exaggeration ONLY (not shape/frequency)
  sunDirection: THREE.Vector3;
  atmosphereColor: THREE.Color;
  settlements: Array<{ x: number; y: number; name: string; size: 'village'|'town'|'city'; }>;
  cells: Array<Array<{ elevation: number; biome: string }>>;   // from RealmData.cells
  W: number; H: number;
}

// ── Continent mask (same algorithm as generateRealmData) ──────────────────────

type MaskFn = (nx: number, ny: number) => number;

function buildContinentMask(shape: string, rand: () => number): MaskFn {
  if (shape === 'continents') {
    const nC = 2 + Math.floor(rand() * 2);
    const C = Array.from({ length: nC }, () => ({
      cx: 0.12 + rand() * 0.76, cy: 0.12 + rand() * 0.76,
      rx: 0.14 + rand() * 0.20, ry: 0.10 + rand() * 0.16,
      rot: rand() * Math.PI,
    }));
    return (nx, ny) => {
      let v = 0;
      for (const c of C) {
        const dx = nx - c.cx, dy = ny - c.cy;
        const rx = dx * Math.cos(c.rot) + dy * Math.sin(c.rot);
        const ry = -dx * Math.sin(c.rot) + dy * Math.cos(c.rot);
        const d  = Math.sqrt((rx/c.rx)**2 + (ry/c.ry)**2);
        v = Math.max(v, Math.max(0, 1.1 - d));
      }
      return v;
    };
  }
  if (shape === 'archipelago') {
    const nI = 12 + Math.floor(rand() * 10);
    const islands = Array.from({ length: nI }, () => ({
      cx: 0.04 + rand() * 0.92, cy: 0.04 + rand() * 0.92,
      r:  0.025 + rand() * 0.06,
    }));
    return (nx, ny) => {
      let v = 0;
      for (const isl of islands) {
        const d = Math.hypot((nx - isl.cx) / isl.r, (ny - isl.cy) / isl.r);
        v = Math.max(v, Math.max(0, 1 - d));
      }
      return v;
    };
  }
  if (shape === 'pangaea') {
    return (nx, ny) => {
      const dx = nx - 0.5, dy = ny - 0.5;
      const jitter = Math.sin(nx * 8) * 0.06 + Math.cos(ny * 7) * 0.05;
      return Math.max(0, 1 - Math.sqrt(dx*dx*1.5 + dy*dy*1.2) * 1.3 + jitter);
    };
  }
  // Island (default)
  return (nx, ny) => Math.min(nx, 1-nx, ny, 1-ny) * 4.2;
}

export class HexPlanetRenderer {
  private renderer:      THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene:         THREE.Scene;
  private camera:        THREE.PerspectiveCamera;
  private controls:      OrbitControls;
  private clock:         THREE.Clock = new THREE.Clock();

  private tileMesh:   THREE.Mesh | null   = null;
  private edgeMesh:   THREE.LineSegments | null = null;
  private atmosMesh:  THREE.Mesh | null   = null;
  private starPoints: THREE.Points | null = null;
  private labelObjs:  CSS2DObject[]       = [];

  private raf    = 0;
  private active = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000408);
    this.renderer.setSize(canvas.offsetWidth || 600, canvas.offsetHeight || 600);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(canvas.offsetWidth || 600, canvas.offsetHeight || 600);
    this.labelRenderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
    canvas.parentElement?.appendChild(this.labelRenderer.domElement);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 6.0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping    = true;
    this.controls.dampingFactor    = 0.06;
    this.controls.minDistance      = 2.8;
    this.controls.maxDistance      = 14;
    this.controls.rotateSpeed      = 0.5;
    this.controls.autoRotate       = true;
    this.controls.autoRotateSpeed  = 0.35;

    this._buildStars(99);
  }

  /** Generate + load a hex planet from settings. */
  loadPlanet(s: HexPlanetSettings): void {
    // Dispose old geometry
    if (this.tileMesh)  { this.scene.remove(this.tileMesh);  this.tileMesh.geometry.dispose();  }
    if (this.edgeMesh)  { this.scene.remove(this.edgeMesh);  this.edgeMesh.geometry.dispose();  }
    if (this.atmosMesh) { this.scene.remove(this.atmosMesh); this.atmosMesh.geometry.dispose(); }
    for (const obj of this.labelObjs) { (obj.parent ?? this.scene).remove(obj); obj.element.remove(); }
    this.labelObjs = [];
    this.scene.children.filter(c => c instanceof THREE.Light).forEach(l => this.scene.remove(l));

    // ── Lights ────────────────────────────────────────────────────────────
    const sun = new THREE.DirectionalLight(0xfffaf0, 2.0);
    sun.position.copy(s.sunDirection).multiplyScalar(10);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x203050, 0.55));

    // ── Generate hexasphere tiles ─────────────────────────────────────────
    const BASE_R = 2.0;
    const hs = new Hexasphere(BASE_R, s.subdivisions, 0.96) as {
      tiles: Array<{
        centerPoint: { x: number; y: number; z: number };
        boundary:    Array<{ x: number; y: number; z: number }>;
        neighborIds: string[];
      }>;
    };

        // ── Sample realm cells directly (no re-generation) ──────────────────
    // Each tile projects its 3D centre to lat/lon → UV → realm grid cell.
    // This ensures hex view is a different RESOLUTION of the same underlying data.
    // roughness now ONLY controls vertical exaggeration, not shape/frequency.

    /** Map tile 3D centre to realm grid (gx, gy). */
    function sampleCell(cx: number, cy: number, cz: number, len: number) {
      const u  = (Math.atan2(cz, cx) / (Math.PI * 2) + 0.5);
      const v  = (Math.asin(Math.max(-1, Math.min(1, cy / len))) / Math.PI + 0.5);
      const gx = Math.max(0, Math.min(s.W - 1, Math.floor(u * s.W)));
      const gy = Math.max(0, Math.min(s.H - 1, Math.floor(v * s.H)));
      return s.cells[gy]![gx]!;
    }

    // ── Sub-hex tile geometry ─────────────────────────────────────────────
    // Two-level Goldberg: sub=24 for TERRITORY borders, sub=48 for fine tiles
    // Each sub=48 tile (~23k) is a flat coloured hex polygon — discrete biome cells.
    // Visible gaps between tiles (tilePct=0.88) show the mosaic structure.
    // Sub=24 territory lines sit on top as bright overlay.

    // ── Fine tiles: sub=48 flat hex mosaic ──
    const HS_FINE_SUB = 48;
    const HexasphereFine = (Hexasphere as any);
    const hs_fine = new HexasphereFine(BASE_R, HS_FINE_SUB, 0.88);

    const TIER2: Record<string, number> = {
      deep_ocean: 0.955, ocean: 0.968, beach: 0.982,
      desert: 1.000, savanna: 1.004, grassland: 1.008,
      forest: 1.013, taiga: 1.018, tundra: 1.023, snow: 1.030,
    };
    const microAmp2 = s.roughness * 0.016;

    const pos2: number[] = [];
    const col2: number[] = [];

    for (const tile of hs_fine.tiles) {
      const cp = tile.centerPoint as { x: number; y: number; z: number };
      const cLen = Math.sqrt(cp.x*cp.x + cp.y*cp.y + cp.z*cp.z);
      const cell2 = sampleCell(cp.x, cp.y, cp.z, cLen);
      const biome2 = cell2.biome as BiomeName;
      const [tr, tg, tb] = BIOME_COLOR[biome2] ?? BIOME_COLOR.deep_ocean;
      const rn = tr/255, gn = tg/255, bn = tb/255;

      const tierH = TIER2[biome2] ?? 1.0;
      const dispH = BASE_R * (tierH + (cell2.elevation - 0.5) * microAmp2);

      // Scale center + each boundary vertex uniformly by dispH/len
      const cScale = dispH / cLen;
      const cx = cp.x*cScale, cy = cp.y*cScale, cz = cp.z*cScale;

      const bnd = tile.boundary as { x: number; y: number; z: number }[];
      const N = bnd.length;
      for (let ti2 = 0; ti2 < N; ti2++) {
        const b0 = bnd[ti2]!;
        const b1 = bnd[(ti2+1)%N]!;
        const s0 = dispH / Math.sqrt(b0.x*b0.x+b0.y*b0.y+b0.z*b0.z);
        const s1 = dispH / Math.sqrt(b1.x*b1.x+b1.y*b1.y+b1.z*b1.z);
        pos2.push(cx, cy, cz,
                  b0.x*s0, b0.y*s0, b0.z*s0,
                  b1.x*s1, b1.y*s1, b1.z*s1);
        col2.push(rn,gn,bn, rn,gn,bn, rn,gn,bn);
      }
    }

    const tileGeo2 = new THREE.BufferGeometry();
    tileGeo2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos2), 3));
    tileGeo2.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(col2), 3));
    tileGeo2.computeVertexNormals();

    const tileMat2 = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.tileMesh  = new THREE.Mesh(tileGeo2, tileMat2);
    this.scene.add(this.tileMesh);

    // ── Territory borders: sub=24 hex edge lines (bright overlay) ──
    const edgePts2: number[] = [];
    for (const tile of hs.tiles) {
      const bnd2 = tile.boundary as { x: number; y: number; z: number }[];
      const NT = bnd2.length;
      const ef = BASE_R * 1.012; // float above tile surface
      for (let i = 0; i < NT; i++) {
        const b0 = bnd2[i]!;
        const b1 = bnd2[(i+1)%NT]!;
        const bL0 = Math.sqrt(b0.x*b0.x+b0.y*b0.y+b0.z*b0.z);
        const bL1 = Math.sqrt(b1.x*b1.x+b1.y*b1.y+b1.z*b1.z);
        edgePts2.push(b0.x*(ef/bL0), b0.y*(ef/bL0), b0.z*(ef/bL0));
        edgePts2.push(b1.x*(ef/bL1), b1.y*(ef/bL1), b1.z*(ef/bL1));
      }
    }
    const edgeGeo2 = new THREE.BufferGeometry();
    edgeGeo2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePts2), 3));
    const edgeMat2 = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.30, depthWrite: false });
    this.edgeMesh  = new THREE.LineSegments(edgeGeo2, edgeMat2);
    this.scene.add(this.edgeMesh);

    // Atmosphere sphere
    const atmosGeo = new THREE.SphereGeometry(BASE_R * 1.07, 32, 32);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: ATMOS_VERT, fragmentShader: ATMOS_FRAG,
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uSunDirection: { value: s.sunDirection }, uAtmosphereColor: { value: s.atmosphereColor } },
    });
    this.atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    this.scene.add(this.atmosMesh);

    // ── Settlement markers on hex surface ────────────────────────────────
    const DOT_COLORS = { city: '#f0a828', town: '#e8d070', village: '#d0c890' };
    const TWO_PI = Math.PI * 2;

    for (const settle of s.settlements) {
      const lon = (settle.x / s.W) * TWO_PI - Math.PI;
      const lat = (settle.y / s.H - 0.5) * Math.PI;
      const r2  = BASE_R * 1.12;
      const pos = new THREE.Vector3(
        r2 * Math.cos(lat) * Math.sin(lon),
        r2 * Math.sin(lat),
        r2 * Math.cos(lat) * Math.cos(lon),
      );

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;';

      const dot = document.createElement('div');
      const dotSz = settle.size === 'city' ? 8 : settle.size === 'town' ? 6 : 4;
      dot.style.cssText = `width:${dotSz}px;height:${dotSz}px;border-radius:50%;background:${DOT_COLORS[settle.size]};box-shadow:0 0 6px ${DOT_COLORS[settle.size]},0 0 2px rgba(0,0,0,0.8);`;

      const label = document.createElement('div');
      label.textContent = settle.name;
      label.style.cssText = `font:bold ${settle.size==='city'?9:7}px Georgia,serif;color:rgba(240,228,200,0.95);text-shadow:0 0 5px rgba(0,0,0,0.95),0 0 10px rgba(0,0,0,0.7);white-space:nowrap;`;

      wrap.appendChild(dot); wrap.appendChild(label);
      const obj = new CSS2DObject(wrap);
      obj.position.copy(pos);
      this.scene.add(obj);
      this.labelObjs.push(obj);
    }
  }

  private _buildStars(seed: number): void {
    const rand = mulberry32(seed ^ 0x57412);
    const N = 2000;
    const pos = new Float32Array(N*3), sizes = new Float32Array(N);
    const twink = new Float32Array(N), cols = new Float32Array(N*3);
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(1-2*(i+0.5)/N), theta = Math.PI*(1+Math.sqrt(5))*i + rand()*0.4;
      const r = 40 + rand()*20;
      pos[i*3]   = r*Math.sin(phi)*Math.cos(theta);
      pos[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
      pos[i*3+2] = r*Math.cos(phi);
      sizes[i]   = 1.2 + rand()*2.0;
      twink[i]   = 0.5 + rand()*4.5;
      const t = rand();
      if      (t>0.9)  { cols[i*3]=0.7; cols[i*3+1]=0.8; cols[i*3+2]=1.0; }
      else if (t>0.7)  { cols[i*3]=0.95; cols[i*3+1]=0.95; cols[i*3+2]=1.0; }
      else if (t>0.3)  { cols[i*3]=1.0; cols[i*3+1]=1.0; cols[i*3+2]=0.92; }
      else             { cols[i*3]=1.0; cols[i*3+1]=0.85; cols[i*3+2]=0.65; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos,   3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twink, 1));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(cols,  3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uTime: { value: 0 } },
    });
    this.starPoints = new THREE.Points(geo, mat);
    this.scene.add(this.starPoints);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.clock.start();
    const loop = () => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(loop);
      const t = this.clock.getElapsedTime();
      this.controls.update();
      if (this.starPoints) (this.starPoints.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

      // Back-face cull labels
      if (this.labelObjs.length > 0) {
        const camDir = this.camera.position.clone().normalize();
        for (const obj of this.labelObjs) {
          const wp = new THREE.Vector3(); obj.getWorldPosition(wp);
          (obj.element as HTMLElement).style.opacity = camDir.dot(wp.normalize()) > 0.05 ? '1' : '0';
        }
      }

      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void { this.active = false; cancelAnimationFrame(this.raf); }

  setVisible(layer: 'atmosphere', show: boolean): void {
    if (layer === 'atmosphere' && this.atmosMesh) this.atmosMesh.visible = show;
  }

  setDayOnly(enabled: boolean): void {
    this.scene.traverse(obj => {
      if (obj instanceof THREE.AmbientLight) {
        // Day-only: pure white ambient at full strength
        obj.color.setHex(enabled ? 0xffffff : 0x203050);
        obj.intensity = enabled ? 1.6 : 0.55;
      }
      if (obj instanceof THREE.DirectionalLight) {
        // Day-only: keep sun but add fill from opposite side too
        obj.intensity = enabled ? 1.8 : 2.0;
      }
    });
  }

  setEdgeLines(show: boolean): void {
    if (this.edgeMesh) this.edgeMesh.visible = show;
  }

  setAutoRotate(enabled: boolean): void { this.controls.autoRotate = enabled; }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  dispose(): void {
    this.stop();
    for (const obj of this.labelObjs) { (obj.parent ?? this.scene).remove(obj); obj.element.remove(); }
    this.labelObjs = [];
    this.labelRenderer.domElement.remove();
    this.renderer.dispose();
  }
}
