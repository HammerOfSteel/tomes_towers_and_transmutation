/**
 * planet-renderer.ts — Three.js WebGL planet renderer for Overworld Studio
 *
 * Architecture (Three.js Journey Lesson 38 pattern):
 *   - IcosahedronGeometry sphere with custom ShaderMaterial
 *   - Three canvas textures: day (biomes), night (city lights), specularClouds
 *   - GLSL: day/night blend, twilight band, ocean specular, cloud alpha, atmosphere rim
 *   - Cloud sphere (transparent, slightly larger, slower rotation)
 *   - Atmosphere sphere (additive blend, rim shader)
 *   - Star field: THREE.Points with twinkling vertex/fragment shader
 *   - OrbitControls for mouse drag rotation
 *   - requestAnimationFrame loop while active
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// ── GLSL shaders ──────────────────────────────────────────────────────────────

const PLANET_VERT = /* glsl */`
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vPosition;

  void main() {
    vUv      = uv;
    vNormal  = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLANET_FRAG = /* glsl */`
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform sampler2D uSpecularClouds;   // R=ocean specular, G=clouds
  uniform vec3  uSunDirection;
  uniform vec3  uAtmosphereColor;
  uniform float uDayOnly;   // 1.0 = always full day, 0.0 = normal day/night

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vPosition;

  void main() {
    vec3 viewDir  = normalize(cameraPosition - vPosition);
    float sunDot  = dot(vNormal, uSunDirection);

    // Soft terminator — tighter so more of the front hemisphere is lit
    float rawDayMix = smoothstep(-0.12, 0.30, sunDot);
    float dayMix = mix(rawDayMix, 1.0, uDayOnly);

    // Texture samples
    vec3  day       = texture2D(uDayTexture,      vUv).rgb;
    vec3  night     = texture2D(uNightTexture,    vUv).rgb;
    float specMask  = texture2D(uSpecularClouds,  vUv).r;
    float cloudMask = texture2D(uSpecularClouds,  vUv).g;

    // Compose terrain
    vec3 color = mix(night * 1.4, day, dayMix);

    // Cloud layer (white, mixed over terrain on day side)
    color = mix(color, vec3(0.96, 0.97, 1.0), cloudMask * dayMix * 0.85);

    // Twilight band (warm orange-red at the terminator)
    float twilight = pow(max(0.0, 1.0 - abs(sunDot * 5.0)), 2.0);
    color += vec3(0.38, 0.16, 0.02) * twilight * 0.5;

    // Ocean specular (Phong, only on day side)
    vec3  refl    = reflect(-uSunDirection, vNormal);
    float spec    = pow(max(0.0, dot(refl, viewDir)), 42.0) * specMask * dayMix;
    color        += vec3(0.65, 0.85, 1.0) * spec * 0.8;

    // Atmosphere rim — subtle haze only, does not overpower terrain
    float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
    rim = pow(rim, 4.0) * (0.4 + 0.6 * dayMix);
    color = mix(color, uAtmosphereColor, rim * 0.18);

    gl_FragColor = vec4(color, 1.0);
  }
`;

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

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3  viewDir = normalize(cameraPosition - vPosition);
    float rim     = 1.0 - max(0.0, dot(vNormal, viewDir));
    rim = pow(rim, 2.2);
    float sunFacing = dot(vNormal, uSunDirection) * 0.5 + 0.5;
    float alpha = rim * 0.38 * (0.45 + 0.55 * sunFacing);
    gl_FragColor = vec4(uAtmosphereColor, alpha);
  }
`;

// ── Cloud shader ──────────────────────────────────────────────────────────────

const CLOUD_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vUv      = uv;
    vNormal  = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */`
  uniform sampler2D uCloudTex;
  uniform float     uTime;
  uniform vec3      uSunDirection;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Slowly drift clouds eastward
    vec2 driftUv = vec2(mod(vUv.x + uTime * 0.007, 1.0), vUv.y);

    float c = texture2D(uCloudTex, driftUv).r;

    // Soft feathered cloud edge (no hard cutoff)
    float alpha = smoothstep(0.28, 0.68, c) * 0.88;

    // Day/night: fade clouds at terminator + night side
    float sunDot = dot(normalize(vNormal), uSunDirection);
    float day = smoothstep(-0.08, 0.25, sunDot);

    // Cloud lighting: bright white top, slightly grey underside
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float topLight = dot(normalize(vNormal), uSunDirection) * 0.3 + 0.7;
    vec3 col = mix(vec3(0.72, 0.74, 0.82), vec3(0.98, 0.99, 1.0), topLight);

    gl_FragColor = vec4(col, alpha * day);
  }
`;

const STAR_VERT = /* glsl */`
  attribute float aSize;
  attribute float aTwinkle;
  attribute vec3  aColor;

  varying vec3  vColor;
  varying float vAlpha;

  uniform float uTime;

  void main() {
    vColor = aColor;
    float twinkle = 0.78 + 0.22 * sin(uTime * aTwinkle + aTwinkle * 119.0);
    vAlpha = twinkle;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * twinkle * (380.0 / -mvPos.z);
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

// ── PlanetRenderer ────────────────────────────────────────────────────────────

export interface PlanetTextures {
  day:          THREE.CanvasTexture;
  night:        THREE.CanvasTexture;
  specular:     THREE.CanvasTexture;
  cloud:        THREE.CanvasTexture;
  sunDirection: THREE.Vector3;
  atmosphereColor: THREE.Color;
  seed: number;
  settlements: Array<{ x: number; y: number; name: string; size: 'village'|'town'|'city'; }>;
  W: number;   // realm grid width (for lon/lat conversion)
  H: number;
}

export class PlanetRenderer {
  private renderer:   THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene:      THREE.Scene;
  private camera:     THREE.PerspectiveCamera;
  private controls:   OrbitControls;
  private clock:      THREE.Clock = new THREE.Clock();

  private planetMesh: THREE.Mesh | null  = null;
  private cloudMesh:  THREE.Mesh | null  = null;
  private atmosMesh:  THREE.Mesh | null  = null;
  private starPoints: THREE.Points | null = null;
  private labelObjects: CSS2DObject[] = [];

  private raf = 0;
  private active = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000408);
    this.renderer.setSize(canvas.offsetWidth || 600, canvas.offsetHeight || 600);

    // CSS2D overlay for settlement labels
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(canvas.offsetWidth || 600, canvas.offsetHeight || 600);
    this.labelRenderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
    canvas.parentElement?.appendChild(this.labelRenderer.domElement);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 6.0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enableZoom    = true;
    this.controls.minDistance   = 2.8;
    this.controls.maxDistance   = 12;
    this.controls.rotateSpeed   = 0.5;
    this.controls.autoRotate    = true;
    this.controls.autoRotateSpeed = 0.4;

    this._buildStars(42);
  }

  /** Replace the planet mesh with new textures. */
  loadPlanet(tex: PlanetTextures): void {
    // Remove old meshes
    if (this.planetMesh) { this.scene.remove(this.planetMesh); this.planetMesh.geometry.dispose(); }
    if (this.cloudMesh)  { this.scene.remove(this.cloudMesh);  this.cloudMesh.geometry.dispose(); }
    if (this.atmosMesh)  { this.scene.remove(this.atmosMesh);  this.atmosMesh.geometry.dispose(); }

    const sphere = new THREE.SphereGeometry(2, 64, 64);

    // ── Planet ──────────────────────────────────────────────────────────────
    const planetMat = new THREE.ShaderMaterial({
      vertexShader:   PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: {
        uDayTexture:    { value: tex.day },
        uNightTexture:  { value: tex.night },
        uSpecularClouds:{ value: tex.specular },
        uSunDirection:  { value: tex.sunDirection },
        uAtmosphereColor:{ value: tex.atmosphereColor },
        uDayOnly:       { value: 0 },
      },
    });
    this.planetMesh = new THREE.Mesh(sphere, planetMat);
    this.scene.add(this.planetMesh);

    // ── Clouds (dedicated ShaderMaterial, soft drift animation) ──────────
    const cloudGeo = new THREE.SphereGeometry(2.022, 48, 48);
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader:   CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      side:           THREE.FrontSide,
      transparent:    true,
      depthWrite:     false,
      uniforms: {
        uCloudTex:    { value: tex.cloud },
        uTime:        { value: 0 },
        uSunDirection:{ value: tex.sunDirection },
      },
    });
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.scene.add(this.cloudMesh);

    // ── Atmosphere (additive, rim glow) ──────────────────────────────────
    const atmosGeo = new THREE.SphereGeometry(2.14, 32, 32);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader:   ATMOS_VERT,
      fragmentShader: ATMOS_FRAG,
      side:           THREE.BackSide,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      uniforms: {
        uSunDirection:   { value: tex.sunDirection },
        uAtmosphereColor:{ value: tex.atmosphereColor },
      },
    });
    this.atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    this.scene.add(this.atmosMesh);

    // Sun as a point light
    const sun = new THREE.DirectionalLight(0xfffaf0, 2.2);
    sun.position.copy(tex.sunDirection).multiplyScalar(10);
    this.scene.add(sun);

    const ambient = new THREE.AmbientLight(0x203050, 0.5);
    this.scene.add(ambient);

    // ── Settlement labels (CSS2D, projected onto sphere) ─────────────────
    // Remove old labels first (from planetMesh if it exists, else scene)
    for (const obj of this.labelObjects) {
      (obj.parent ?? this.scene).remove(obj);
      obj.element.remove();
    }
    this.labelObjects = [];

    const TWO_PI = Math.PI * 2;
    const DOT_COLORS = { city: '#f0a828', town: '#e8d070', village: '#d0c890' };

    for (const s of tex.settlements) {
      // Convert grid (x,y) to lon/lat
      const lon = (s.x / tex.W) * TWO_PI - Math.PI;
      const lat = (s.y / tex.H - 0.5) * Math.PI;
      const r   = 2.06;  // just above cloud layer
      const pos = new THREE.Vector3(
        r * Math.cos(lat) * Math.sin(lon),
        r * Math.sin(lat),
        r * Math.cos(lat) * Math.cos(lon),
      );

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;';

      const dot = document.createElement('div');
      dot.style.cssText = `width:${s.size==='city'?7:s.size==='town'?5:4}px;height:${s.size==='city'?7:s.size==='town'?5:4}px;border-radius:50%;background:${DOT_COLORS[s.size]};box-shadow:0 0 4px ${DOT_COLORS[s.size]};`;

      const label = document.createElement('div');
      label.textContent = s.name;
      label.style.cssText = `font:bold ${s.size==='city'?9:7}px Georgia,serif;color:rgba(240,228,200,0.9);text-shadow:0 0 4px rgba(0,0,0,0.9),0 0 8px rgba(0,0,0,0.7);white-space:nowrap;`;

      wrap.appendChild(dot);
      wrap.appendChild(label);

      const obj = new CSS2DObject(wrap);
      obj.position.copy(pos);
      // Parent to planetMesh so labels rotate with the terrain texture
      this.planetMesh!.add(obj);
      this.labelObjects.push(obj);
    }
  }

  private _buildStars(seed: number): void {
    const rand  = mulberry32(seed);
    const N     = 2000;
    const pos   = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const twink = new Float32Array(N);
    const cols  = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      // Fibonacci sphere distribution at large radius
      const phi   = Math.acos(1 - 2 * (i + 0.5) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i + rand() * 0.4;
      const r     = 40 + rand() * 20;
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i*3+2] = r * Math.cos(phi);

      sizes[i]   = 1.2 + rand() * 2.0;           // point size
      twink[i]   = 0.5 + rand() * 4.5;            // twinkle frequency

      // Color temperature: blue-white hot to warm yellow-red cool
      const t = rand();
      if      (t > 0.9) { cols[i*3] = 0.7; cols[i*3+1] = 0.8; cols[i*3+2] = 1.0; }  // blue
      else if (t > 0.7) { cols[i*3] = 0.95; cols[i*3+1] = 0.95; cols[i*3+2] = 1.0; } // white
      else if (t > 0.3) { cols[i*3] = 1.0; cols[i*3+1] = 1.0; cols[i*3+2] = 0.92; }  // warm white
      else              { cols[i*3] = 1.0; cols[i*3+1] = 0.85; cols[i*3+2] = 0.65; }  // warm yellow
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos,   3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twink, 1));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(cols,  3));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
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

      // Animate cloud drift via uTime uniform
      if (this.cloudMesh) {
        (this.cloudMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      }
      if (this.planetMesh) this.planetMesh.rotation.y = t * 0.03;

      // Back-face cull settlement labels (hide when behind planet)
      if (this.labelObjects.length > 0) {
        const camDir = this.camera.position.clone().normalize();
        for (const obj of this.labelObjects) {
          const wPos = new THREE.Vector3();
          obj.getWorldPosition(wPos);
          const onFront = camDir.dot(wPos.normalize()) > 0.05;
          (obj.element as HTMLElement).style.opacity = onFront ? '1' : '0';
        }
      }

      // Update star twinkle time
      if (this.starPoints) {
        (this.starPoints.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      }

      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  setVisible(layer: 'clouds' | 'atmosphere', show: boolean): void {
    if (layer === 'clouds'     && this.cloudMesh)  this.cloudMesh.visible  = show;
    if (layer === 'atmosphere' && this.atmosMesh)  this.atmosMesh.visible  = show;
  }

  setDayOnly(enabled: boolean): void {
    if (this.planetMesh) {
      const mat = this.planetMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uDayOnly.value = enabled ? 1.0 : 0.0;
    }
    // Clouds should stay fully visible in day-only mode
    if (this.cloudMesh) {
      const mat = this.cloudMesh.material as THREE.ShaderMaterial;
      if (mat.uniforms.uSunDirection) {
        // pass — cloud shader uses uSunDirection which we don't change
      }
    }
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
  }

  dispose(): void {
    this.stop();
    for (const obj of this.labelObjects) { this.scene.remove(obj); obj.element.remove(); }
    this.labelObjects = [];
    this.labelRenderer.domElement.remove();
    this.renderer.dispose();
  }
}

// ── Texture builders ──────────────────────────────────────────────────────────

/** Biome color palette for the day texture. */
const BIOME_RGB: Record<string, readonly [number, number, number]> = {
  deep_ocean: [18,  45, 105],
  ocean:      [32,  72, 168],
  beach:      [210, 192, 112],
  desert:     [218, 155, 58],
  savanna:    [148, 172, 48],
  grassland:  [52,  140, 40],
  forest:     [24,  95,  28],
  taiga:      [42,  92,  68],
  tundra:     [90,  112, 130],
  snow:       [222, 238, 250],
};

/** Build 512×256 day texture from biome cells. */
export function buildDayTexture(
  cells: Array<Array<{ biome: string; elevation: number }>>,
  W: number, H: number,
): THREE.CanvasTexture {
  const tw = 512, th = 256;
  const c  = document.createElement('canvas');
  c.width = tw; c.height = th;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(tw, th);
  const d   = img.data;

  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const gx   = Math.max(0, Math.min(W-1, Math.floor(tx / tw * W)));
      const gy   = Math.max(0, Math.min(H-1, Math.floor(ty / th * H)));
      const cell = cells[gy]?.[gx];
      const biome = cell?.biome ?? 'deep_ocean';
      const elev  = cell?.elevation ?? 0;
      const [br, bg, bb] = BIOME_RGB[biome] ?? BIOME_RGB.deep_ocean!;

      // Elevation boost for mountains (brighter peaks)
      const boost = elev > 0.62 ? (elev - 0.62) / 0.38 * 0.3 : 0;
      // Slight ocean depth gradient
      const depthDim = biome === 'deep_ocean' ? Math.max(0, (0.28 - (cell?.elevation ?? 0)) / 0.28) * 0.4 : 0;

      const idx = (ty * tw + tx) * 4;
      d[idx]   = Math.min(255, Math.round(br * (1 + boost) * (1 - depthDim)));
      d[idx+1] = Math.min(255, Math.round(bg * (1 + boost) * (1 - depthDim)));
      d[idx+2] = Math.min(255, Math.round(bb * (1 + boost) * (1 - depthDim)));
      d[idx+3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build 256×128 night texture: black + amber city-light glows at settlements. */
export function buildNightTexture(
  settlements: Array<{ x: number; y: number; size: string }>,
  W: number, H: number,
): THREE.CanvasTexture {
  const tw = 256, th = 128;
  const c  = document.createElement('canvas');
  c.width = tw; c.height = th;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, tw, th);

  for (const s of settlements) {
    const sx = (s.x / W) * tw;
    const sy = (s.y / H) * th;
    const r  = s.size === 'city' ? 6 : s.size === 'town' ? 4 : 2.5;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.5);
    grad.addColorStop(0,   s.size === 'city' ? 'rgba(255,230,100,0.95)' : 'rgba(240,190,80,0.85)');
    grad.addColorStop(0.4, 'rgba(255,170,30,0.5)');
    grad.addColorStop(1,   'rgba(255,120,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, r * 2.5, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build 512×256 specular mask: R=1 over ocean, R=0 over land. */
export function buildSpecularTexture(
  cells: Array<Array<{ biome: string }>>,
  W: number, H: number,
): THREE.CanvasTexture {
  const tw = 256, th = 128;
  const c  = document.createElement('canvas');
  c.width = tw; c.height = th;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(tw, th);
  const d   = img.data;
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const gx = Math.max(0, Math.min(W-1, Math.floor(tx / tw * W)));
      const gy = Math.max(0, Math.min(H-1, Math.floor(ty / th * H)));
      const biome = cells[gy]?.[gx]?.biome ?? 'deep_ocean';
      const isOcean = biome === 'ocean' || biome === 'deep_ocean';
      const idx = (ty * tw + tx) * 4;
      d[idx] = isOcean ? 215 : 12;
      d[idx+1] = d[idx+2] = d[idx];
      d[idx+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// ── Value noise helpers ───────────────────────────────────────────────────────

function makeGrid(GW: number, GH: number, rand: () => number): Float32Array {
  const g = new Float32Array(GW * GH);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return g;
}

function valueNoise2D(x: number, y: number, g: Float32Array, GW: number, GH: number): number {
  const xi = ((Math.floor(x) % GW) + GW) % GW;
  const yi = ((Math.floor(y) % GH) + GH) % GH;
  const xi1= (xi + 1) % GW, yi1 = (yi + 1) % GH;
  const fx = x - Math.floor(x), fy = y - Math.floor(y);
  const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
  const v00 = g[yi*GW+xi]!,  v10 = g[yi*GW+xi1]!;
  const v01 = g[yi1*GW+xi]!, v11 = g[yi1*GW+xi1]!;
  return v00*(1-ux)*(1-uy) + v10*ux*(1-uy) + v01*(1-ux)*uy + v11*ux*uy;
}

/**
 * High-quality 512×256 cloud texture — ridged multifractal for wispy cloud banks.
 * Combines:
 *   - Ridged noise (1 - |n|) for sharp cumulus-like towers
 *   - Smooth value noise for large stratus banks
 *   - Domain warping for organic curl/turbulence
 *   - Latitude weighting (cloud bands at ±30-60°, clearer at equator/poles)
 */
export function buildCloudTexture(seed: number): THREE.CanvasTexture {
  const TW = 512, TH = 256;
  const rand = mulberry32(seed ^ 0x47EA_C10D);

  // Noise grids at multiple resolutions
  const G = [
    makeGrid(5,  3,  rand),   // freq 3  — large cloud formations
    makeGrid(9,  5,  rand),   // freq 6  — medium banks
    makeGrid(17, 9,  rand),   // freq 12 — cloud clusters
    makeGrid(33, 17, rand),   // freq 24 — detail
    makeGrid(65, 33, rand),   // freq 48 — fine wisps
    makeGrid(7,  4,  rand),   // warp X
    makeGrid(7,  4,  rand),   // warp Y
  ];

  /** Value noise sample, wraps at boundary. */
  const vn = (x: number, y: number, g: Float32Array, gw: number, gh: number) =>
    valueNoise2D(x, y, g, gw, gh);

  /** Ridged noise: sharp peaks like cumulus towers. */
  const ridged = (x: number, y: number, g: Float32Array, gw: number, gh: number) =>
    1 - Math.abs(vn(x, y, g, gw, gh) * 2 - 1);

  const c   = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(TW, TH);
  const d   = img.data;

  for (let ty = 0; ty < TH; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      const u = tx / TW;
      const v = ty / TH;

      // Latitude weather bands
      const lat  = (v - 0.5) * Math.PI;
      const sinL = Math.abs(Math.sin(lat));
      // More cloud at ±30-60°, less at equator and poles
      const band = Math.pow(Math.sin(sinL * Math.PI), 0.6);
      const latFactor = 0.42 + 0.58 * band;

      // Domain warp (curl-like)
      const wx = (vn(u*3.5, v*2.5, G[5]!, 7, 4) - 0.5) * 0.14;
      const wy = (vn(u*3.5+7, v*2.5+7, G[6]!, 7, 4) - 0.5) * 0.07;
      const wu = u + wx, wv = v + wy;

      // Large stratus banks (smooth)
      const stratus = vn(wu*3, wv*1.5, G[0]!, 5, 3) * 0.40
                    + vn(wu*6, wv*3,   G[1]!, 9, 5) * 0.22;

      // Ridged cumulus (sharp towers)
      const cumulus = ridged(wu*6,  wv*3,   G[1]!, 9,  5) * 0.18
                    + ridged(wu*12, wv*6,   G[2]!, 17, 9) * 0.12;

      // Fine wispy cirrus detail
      const cirrus  = ridged(wu*24, wv*12, G[3]!, 33, 17) * 0.06
                    + vn    (wu*48, wv*24, G[4]!, 65, 33) * 0.02;

      const raw = (stratus * 0.6 + cumulus * 0.3 + cirrus * 0.1) * latFactor;

      // Multi-tier threshold: dense core + wispy edges
      const core  = Math.pow(Math.max(0, raw - 0.38) / 0.62, 1.4);
      const wisp  = Math.pow(Math.max(0, raw - 0.22) / 0.78, 2.5) * 0.35;
      const cloud = Math.min(1, core + wisp);

      const idx = (ty * TW + tx) * 4;
      const v8  = Math.min(255, Math.round(cloud * 255));
      d[idx] = v8; d[idx+1] = v8; d[idx+2] = v8; d[idx+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/** @deprecated use buildSpecularTexture + buildCloudTexture separately */
export function buildSpecularCloudTexture(
  cells: Array<Array<{ biome: string; elevation: number }>>,
  W: number, H: number,
  seed: number,
): THREE.CanvasTexture {
  const tw = 256, th = 128;
  const c  = document.createElement('canvas');
  c.width = tw; c.height = th;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(tw, th);
  const d   = img.data;

  // Build cloud noise texture
  const rand  = mulberry32(seed ^ 0xC10DC10D);
  const GRID  = 10;
  const GW    = GRID + 2, GH = Math.ceil(GRID * th / tw) + 2;
  const grid  = new Float32Array(GW * GH);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();

  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      // Ocean mask (R channel)
      const gx   = Math.max(0, Math.min(W-1, Math.floor(tx / tw * W)));
      const gy   = Math.max(0, Math.min(H-1, Math.floor(ty / th * H)));
      const biome = cells[gy]?.[gx]?.biome ?? 'deep_ocean';
      const isOcean = biome === 'ocean' || biome === 'deep_ocean';
      const specR = isOcean ? 220 : 18;

      // Cloud noise (G channel) — value noise interpolation
      const cx = tx / tw * GRID, cy = ty / th * (GRID * th / tw);
      const ix = Math.floor(cx), iy = Math.floor(cy);
      const fx = cx - ix, fy = cy - iy;
      const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
      const gi = (ix % GW + GW) % GW, gj = (iy % GH + GH) % GH;
      const v00 = grid[gj*GW + gi] ?? 0;
      const v10 = grid[gj*GW + ((gi+1)%GW)] ?? 0;
      const v01 = grid[((gj+1)%GH)*GW + gi] ?? 0;
      const v11 = grid[((gj+1)%GH)*GW + ((gi+1)%GW)] ?? 0;
      const cloud = v00*(1-ux)*(1-uy) + v10*ux*(1-uy) + v01*(1-ux)*uy + v11*ux*uy;
      const cloudThresh = Math.max(0, cloud - 0.42) / 0.58;

      // Polar ice (high latitude → more clouds)
      const lat = (ty / th - 0.5) * Math.PI;
      const poleMix = Math.max(0, (Math.abs(lat) - 1.1) / 0.47);
      const cloudG  = Math.min(255, Math.round((cloudThresh + poleMix * 0.8) * 255));

      const idx = (ty * tw + tx) * 4;
      d[idx]   = specR;
      d[idx+1] = cloudG;
      d[idx+2] = 0;
      d[idx+3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
