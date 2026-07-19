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

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vPosition;

  void main() {
    vec3 viewDir  = normalize(cameraPosition - vPosition);
    float sunDot  = dot(vNormal, uSunDirection);

    // Day / night blend (soft terminator)
    float dayMix = smoothstep(-0.30, 0.45, sunDot);

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

    // Atmosphere rim (Fresnel-like limb brightening)
    float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
    rim = pow(rim, 3.5) * (0.5 + 0.5 * dayMix);
    color = mix(color, uAtmosphereColor, rim * 0.55);

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
    float alpha = rim * 0.72 * (0.45 + 0.55 * sunFacing);
    gl_FragColor = vec4(uAtmosphereColor, alpha);
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
  specularCloud: THREE.CanvasTexture;
  sunDirection: THREE.Vector3;
  atmosphereColor: THREE.Color;
  seed: number;
}

export class PlanetRenderer {
  private renderer:   THREE.WebGLRenderer;
  private scene:      THREE.Scene;
  private camera:     THREE.PerspectiveCamera;
  private controls:   OrbitControls;
  private clock:      THREE.Clock = new THREE.Clock();

  private planetMesh: THREE.Mesh | null  = null;
  private cloudMesh:  THREE.Mesh | null  = null;
  private atmosMesh:  THREE.Mesh | null  = null;
  private starPoints: THREE.Points | null = null;

  private raf = 0;
  private active = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000408);
    this.renderer.setSize(canvas.offsetWidth || 600, canvas.offsetHeight || 600);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 4.5);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enableZoom    = true;
    this.controls.minDistance   = 2.5;
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
        uSpecularClouds:{ value: tex.specularCloud },
        uSunDirection:  { value: tex.sunDirection },
        uAtmosphereColor:{ value: tex.atmosphereColor },
      },
    });
    this.planetMesh = new THREE.Mesh(sphere, planetMat);
    this.scene.add(this.planetMesh);

    // ── Clouds (transparent sphere, 1% larger) ───────────────────────────
    const cloudGeo = new THREE.SphereGeometry(2.022, 48, 48);
    const cloudMat = new THREE.MeshStandardMaterial({
      alphaMap:    tex.specularCloud,
      transparent: true,
      opacity:     0.78,
      color:       new THREE.Color(0xeef4ff),
      depthWrite:  false,
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

      // Animate cloud rotation
      if (this.cloudMesh)  this.cloudMesh.rotation.y  = t * 0.06;
      if (this.planetMesh) this.planetMesh.rotation.y = t * 0.04;

      // Update star twinkle time
      if (this.starPoints) {
        (this.starPoints.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      }

      this.renderer.render(this.scene, this.camera);
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
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
  }
}

// ── Texture builders ──────────────────────────────────────────────────────────

/** Biome color palette for the day texture. */
const BIOME_RGB: Record<string, readonly [number, number, number]> = {
  deep_ocean: [15,  32, 82],
  ocean:      [28,  58, 140],
  beach:      [196, 178, 100],
  desert:     [204, 142, 50],
  savanna:    [130, 154, 42],
  grassland:  [45,  124, 35],
  forest:     [22,  84, 25],
  taiga:      [38,  82, 60],
  tundra:     [84,  104, 120],
  snow:       [215, 232, 245],
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

/** Build 256×128 specular+cloud texture. R=ocean mask, G=cloud noise. */
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
