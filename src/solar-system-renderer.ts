/**
 * solar-system-renderer.ts — OW-F3 Solar System
 *
 * Generates and renders an animated top-down solar system view on a 2D canvas.
 * Star DNA, Titius-Bode planet placement, per-zone planet types, asteroid belt,
 * comets, nebula background, real-time orbit animation.
 */

import { type PlanetType, PLANET_META } from './planet-dna';

// ── Types ────────────────────────────────────────────────────────────────────

export type SpectralType = 'O'|'B'|'A'|'F'|'G'|'K'|'M';

export interface StarDNA {
  spectral: SpectralType;
  color: string;       // CSS colour for core
  coronaColor: string;
  radius: number;      // px at 1x scale
  luminosity: number;  // glow intensity multiplier
}

export interface SolarPlanet {
  id: number;
  name: string;
  type: PlanetType;
  orbitRadius: number;  // canvas px from centre
  orbitEccentricity: number;
  radius: number;       // planet dot px
  color: string;
  glowColor: string;
  speed: number;        // rad/s
  angle: number;        // initial angle
  isTowerPlanet: boolean;
  hasRings: boolean;
  moonCount: number;
  moonAngles: number[];
}

export interface CometDNA {
  perihelion: number;   // closest approach px
  aphelion: number;
  orbitTilt: number;
  speed: number;
  angle: number;
  color: string;
}

export interface SolarSystemData {
  seed: number;
  star: StarDNA;
  planets: SolarPlanet[];
  asteroidBelt: { inner: number; outer: number; count: number; seed: number };
  comets: CometDNA[];
  towerPlanetId: number;
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

function mulberry(n: number) {
  let s = (n >>> 0) + 1;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Star presets ──────────────────────────────────────────────────────────────

const STAR_PRESETS: Record<SpectralType, Omit<StarDNA,'radius'|'luminosity'>> = {
  O: { spectral: 'O', color: '#a0c0ff', coronaColor: '#6080ff' },
  B: { spectral: 'B', color: '#b8cfff', coronaColor: '#8099ee' },
  A: { spectral: 'A', color: '#d8e8ff', coronaColor: '#b0c8ff' },
  F: { spectral: 'F', color: '#fff8e0', coronaColor: '#ffe090' },
  G: { spectral: 'G', color: '#ffe880', coronaColor: '#ffb030' },
  K: { spectral: 'K', color: '#ffb040', coronaColor: '#e06010' },
  M: { spectral: 'M', color: '#ff6030', coronaColor: '#cc2800' },
};

const STAR_RADII: Record<SpectralType, number> = {
  O: 34, B: 28, A: 22, F: 18, G: 16, K: 14, M: 12,
};
const STAR_LUMINOSITY: Record<SpectralType, number> = {
  O: 2.5, B: 2.0, A: 1.6, F: 1.3, G: 1.0, K: 0.8, M: 0.6,
};

// ── Planet type visual lookup ─────────────────────────────────────────────────

const PLANET_COLORS: Record<PlanetType, [string,string]> = {
  terran:    ['#4a8e3c', '#6db85c'],
  ocean:     ['#1b6fa8', '#3aa0d8'],
  gas_giant: ['#c89060', '#e8b880'],
  ice:       ['#a0c8e8', '#d0eaf8'],
  volcanic:  ['#c83020', '#f04010'],
  toxic:     ['#788040', '#a0aa50'],
  desert:    ['#c8a050', '#e8c070'],
  verdant:   ['#30a840', '#58d868'],
  dead:      ['#707070', '#989898'],
  ringed:    ['#c0a860', '#e0c880'],
};

// ── Planet name generator ─────────────────────────────────────────────────────

const PREFIXES = ['Sol','Ara','Vel','Nox','Tor','Kas','Mir','Eld','Zyr','Pho'];
const SUFFIXES = ['is','a','on','us','ix','ar','em','yn','os','en'];
const ROMAN    = ['','I','II','III','IV','V','VI','VII','VIII','IX'];

function planetName(starName: string, idx: number, rng: () => number): string {
  return `${starName} ${ROMAN[idx + 1] ?? (idx + 1)}`;
}

function starName(rng: () => number): string {
  return PREFIXES[Math.floor(rng() * PREFIXES.length)]! +
         SUFFIXES[Math.floor(rng() * SUFFIXES.length)]!;
}

// ── Generator ────────────────────────────────────────────────────────────────

export function generateSolarSystem(seed: number): SolarSystemData {
  const rng = mulberry(seed);

  // Star
  const spectralTypes: SpectralType[] = ['F','G','G','G','K','K','M'];
  const spectral = spectralTypes[Math.floor(rng() * spectralTypes.length)]!;
  const starPreset = STAR_PRESETS[spectral];
  const star: StarDNA = {
    ...starPreset,
    radius:    STAR_RADII[spectral],
    luminosity: STAR_LUMINOSITY[spectral],
  };
  const sName = starName(rng);

  // Planet count 5-9
  const nPlanets = 5 + Math.floor(rng() * 5);

  // Tower planet at habitable zone (index 2-4)
  const towerIdx = 2 + Math.floor(rng() * 2);

  // Titius-Bode-inspired spacing (in canvas px from centre)
  // Base orbit: 80px, each step multiplied by ~1.55-1.75
  const BASE_ORBIT = 80;
  const planets: SolarPlanet[] = [];
  let orbitR = BASE_ORBIT;

  for (let i = 0; i < nPlanets; i++) {
    const isTower = (i === towerIdx);
    // Zone: inner (0-1) = hot, mid (2-4) = habitable, outer (5+) = cold
    let type: PlanetType;
    if (i <= 1) {
      type = (['rocky','volcanic','desert'] as PlanetType[])[Math.floor(rng() * 3)]!;
    } else if (i <= 4) {
      type = isTower ? 'terran' : (['terran','ocean','verdant','dead'] as PlanetType[])[Math.floor(rng() * 4)]!;
    } else {
      type = (['ice','gas_giant','ringed','dead'] as PlanetType[])[Math.floor(rng() * 4)]!;
    }

    const hasRings = type === 'ringed' || (type === 'gas_giant' && rng() > 0.4);
    const moonCount = type === 'gas_giant' ? 2 + Math.floor(rng()*3) :
                      type === 'ringed'    ? 1 + Math.floor(rng()*2) :
                      rng() > 0.6         ? 1 : 0;

    const [color, glowColor] = PLANET_COLORS[type];
    const radius = type === 'gas_giant' ? 10 + rng() * 5 :
                   type === 'ringed'    ? 9  + rng() * 4 :
                   isTower             ? 7 :
                                         4  + rng() * 3;

    planets.push({
      id:       i,
      name:     planetName(sName, i, rng),
      type, orbitRadius: orbitR,
      orbitEccentricity: rng() * 0.06,
      radius,
      color, glowColor,
      speed:   (0.06 + rng() * 0.08) / Math.sqrt(orbitR / BASE_ORBIT),
      angle:   rng() * Math.PI * 2,
      isTowerPlanet: isTower,
      hasRings, moonCount,
      moonAngles: Array.from({ length: moonCount }, () => rng() * Math.PI * 2),
    });

    orbitR += 55 + rng() * 45 + i * 18;
  }

  // Asteroid belt between inner/mid boundary (after planet index 1, before 2)
  const beltInner = planets[1]!.orbitRadius + 20;
  const beltOuter = planets[2]!.orbitRadius - 20;

  // Comets
  const nComets = 1 + Math.floor(rng() * 2);
  const comets: CometDNA[] = Array.from({ length: nComets }, () => ({
    perihelion: 60 + rng() * 40,
    aphelion:   planets[nPlanets - 1]!.orbitRadius * (0.8 + rng() * 0.4),
    orbitTilt:  rng() * Math.PI * 2,
    speed:      0.003 + rng() * 0.006,
    angle:      rng() * Math.PI * 2,
    color:      '#c0e8ff',
  }));

  return {
    seed, star, planets,
    asteroidBelt: { inner: beltInner, outer: beltOuter, count: 80 + Math.floor(rng() * 120), seed: Math.floor(rng() * 0xffffffff) },
    comets,
    towerPlanetId: towerIdx,
  };
}

// ── Renderer ─────────────────────────────────────────────────────────────────

export class SolarSystemRenderer {
  private canvas:  HTMLCanvasElement;
  private ctx:     CanvasRenderingContext2D;
  private data:    SolarSystemData | null = null;
  private raf:     number = 0;
  private active:  boolean = false;
  private t:       number = 0;
  private asteroids: Array<{ a: number; r: number; size: number }> = [];
  private nebulaCanvas: HTMLCanvasElement | null = null;

  // Hover state
  private hoveredPlanet: SolarPlanet | null = null;
  private onClickPlanet: ((p: SolarPlanet) => void) | null = null;
  private onHoverPlanet: ((p: SolarPlanet | null) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d')!;
    this._bindPointer();
  }

  setData(data: SolarSystemData): void {
    this.data = data;
    this._buildAsteroids(data.asteroidBelt);
    this._buildNebula(data.seed);
  }

  onPlanetClick(cb: (p: SolarPlanet) => void): void  { this.onClickPlanet = cb; }
  onPlanetHover(cb: (p: SolarPlanet | null) => void): void { this.onHoverPlanet = cb; }

  start(): void {
    if (this.active) return;
    this.active = true;
    const loop = (ts: number) => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(loop);
      this.t = ts / 1000;
      if (this.data) this._draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
  }

  resize(w: number, h: number): void {
    this.canvas.width  = w;
    this.canvas.height = h;
    if (this.data) this._buildNebula(this.data.seed); // rebuild nebula for new size
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _cx(): number { return this.canvas.width  / 2; }
  private _cy(): number { return this.canvas.height / 2; }

  private _buildAsteroids(belt: SolarSystemData['asteroidBelt']): void {
    const rng = mulberry(belt.seed);
    this.asteroids = Array.from({ length: belt.count }, () => ({
      a:    rng() * Math.PI * 2,
      r:    belt.inner + rng() * (belt.outer - belt.inner),
      size: 0.6 + rng() * 1.0,
    }));
  }

  private _buildNebula(seed: number): void {
    const nc = document.createElement('canvas');
    nc.width  = this.canvas.width  || 600;
    nc.height = this.canvas.height || 600;
    const nctx = nc.getContext('2d')!;
    const rng = mulberry(seed ^ 0x9b2c4e1a);
    // Soft fBm-like nebula blobs
    for (let i = 0; i < 5; i++) {
      const x = rng() * nc.width, y = rng() * nc.height;
      const r = 80 + rng() * 160;
      const h = Math.floor(rng() * 360);
      const grd = nctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0,   `hsla(${h},40%,25%,0.18)`);
      grd.addColorStop(0.5, `hsla(${h},30%,15%,0.08)`);
      grd.addColorStop(1,   'transparent');
      nctx.fillStyle = grd;
      nctx.fillRect(0, 0, nc.width, nc.height);
    }
    this.nebulaCanvas = nc;
  }

  private _draw(): void {
    const { ctx, canvas, data, t } = this;
    if (!data) return;
    const cx = this._cx(), cy = this._cy();
    const W = canvas.width, H = canvas.height;

    // Background
    ctx.fillStyle = '#02040c';
    ctx.fillRect(0, 0, W, H);

    // Nebula
    if (this.nebulaCanvas) ctx.drawImage(this.nebulaCanvas, 0, 0);

    // Stars (fixed background dots)
    this._drawStarField(data.seed);

    // Orbital paths
    for (const p of data.planets) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.orbitRadius, p.orbitRadius * (1 - p.orbitEccentricity * 0.5), 0, 0, Math.PI * 2);
      ctx.strokeStyle = p.isTowerPlanet ? 'rgba(255,220,100,0.18)' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = p.isTowerPlanet ? 1.5 : 0.8;
      ctx.stroke();
    }

    // Asteroid belt
    ctx.fillStyle = 'rgba(160,150,130,0.45)';
    for (const ast of this.asteroids) {
      const aa = ast.a + t * 0.004;
      const ax = cx + Math.cos(aa) * ast.r;
      const ay = cy + Math.sin(aa) * ast.r;
      ctx.beginPath();
      ctx.arc(ax, ay, ast.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Comets
    for (const comet of data.comets) {
      const ca = comet.orbitTilt + t * comet.speed;
      const semi = (comet.perihelion + comet.aphelion) / 2;
      const cx2 = cx + Math.cos(ca) * semi;
      const cy2 = cy + Math.sin(ca) * semi;
      const tail = 24 + Math.max(0, 60 - semi) * 0.4;
      const grd = ctx.createLinearGradient(cx2, cy2, cx2 - Math.cos(ca)*tail, cy2 - Math.sin(ca)*tail);
      grd.addColorStop(0, 'rgba(180,230,255,0.8)');
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 - Math.cos(ca)*tail, cy2 - Math.sin(ca)*tail);
      ctx.strokeStyle = grd;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx2, cy2, 2, 0, Math.PI * 2);
      ctx.fillStyle = comet.color;
      ctx.fill();
    }

    // Planets
    for (const p of data.planets) {
      const pa = p.angle + t * p.speed;
      const px = cx + Math.cos(pa) * p.orbitRadius;
      const py = cy + Math.sin(pa) * p.orbitRadius * (1 - p.orbitEccentricity * 0.5);

      // Rings (behind planet body)
      if (p.hasRings) {
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(1, 0.28);
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * 2.0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(210,185,130,0.50)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(210,185,130,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Planet glow
      const grd = ctx.createRadialGradient(px, py, 0, px, py, p.radius * 2.5);
      grd.addColorStop(0,   p.glowColor + 'cc');
      grd.addColorStop(0.4, p.glowColor + '44');
      grd.addColorStop(1,   'transparent');
      ctx.beginPath();
      ctx.arc(px, py, p.radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Planet body
      const bodyGrd = ctx.createRadialGradient(px - p.radius*0.25, py - p.radius*0.25, 0, px, py, p.radius);
      bodyGrd.addColorStop(0, p.glowColor);
      bodyGrd.addColorStop(1, p.color);
      ctx.beginPath();
      ctx.arc(px, py, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrd;
      ctx.fill();

      // Tower planet highlight ring
      if (p.isTowerPlanet) {
        ctx.beginPath();
        ctx.arc(px, py, p.radius + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,80,0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // ⬡ symbol
        ctx.fillStyle = 'rgba(255,215,80,0.9)';
        ctx.font = `${Math.max(8, p.radius)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('⬡', px, py - p.radius - 6);
      }

      // Gas giant bands
      if (p.type === 'gas_giant') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, p.radius, 0, Math.PI * 2);
        ctx.clip();
        for (let b = 0; b < 5; b++) {
          const by = py - p.radius + (b * p.radius * 2) / 4.5;
          ctx.fillStyle = b % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.06)';
          ctx.fillRect(px - p.radius, by, p.radius * 2, p.radius * 0.38);
        }
        ctx.restore();
      }

      // Moons
      for (let m = 0; m < p.moonCount; m++) {
        const mr = p.radius + 7 + m * 5;
        const ma = p.moonAngles[m]! + t * (0.4 + m * 0.15);
        const mx2 = px + Math.cos(ma) * mr;
        const my2 = py + Math.sin(ma) * mr * 0.4;
        ctx.beginPath();
        ctx.arc(mx2, my2, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#c0c0b0';
        ctx.fill();
      }

      // Planet name label
      const isHovered = this.hoveredPlanet?.id === p.id;
      if (isHovered || p.isTowerPlanet) {
        ctx.fillStyle = p.isTowerPlanet ? 'rgba(255,220,100,0.95)' : 'rgba(200,200,200,0.9)';
        ctx.font = `${p.isTowerPlanet ? 'bold ' : ''}9px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, px, py + p.radius + 11);
        if (isHovered) {
          ctx.fillStyle = 'rgba(160,160,160,0.7)';
          ctx.font = '8px sans-serif';
          ctx.fillText(PLANET_META[p.type].emoji + ' ' + PLANET_META[p.type].label, px, py + p.radius + 21);
        }
      }
    }

    // Central star
    this._drawStar(data.star, cx, cy, t);
  }

  private _drawStarField(seed: number): void {
    const rng = mulberry(seed ^ 0xdeadbeef);
    const W = this.canvas.width, H = this.canvas.height;
    this.ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 200; i++) {
      const x = rng() * W, y = rng() * H;
      const r = 0.4 + rng() * 0.8;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private _drawStar(star: StarDNA, cx: number, cy: number, t: number): void {
    const ctx = this.ctx;
    const flicker = 1 + Math.sin(t * 2.7) * 0.04 * star.luminosity;
    const r = star.radius * flicker;

    // Outer corona layers
    for (let i = 3; i >= 1; i--) {
      const cr = r * (1 + i * 0.9 * star.luminosity);
      const alpha = 0.06 / i;
      const grd = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, cr);
      grd.addColorStop(0, star.coronaColor + Math.round(alpha * 255).toString(16).padStart(2,'0'));
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Star body
    const bodyGrd = ctx.createRadialGradient(cx - r*0.2, cy - r*0.2, 0, cx, cy, r);
    bodyGrd.addColorStop(0, '#ffffff');
    bodyGrd.addColorStop(0.3, star.color);
    bodyGrd.addColorStop(1, star.coronaColor);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrd;
    ctx.fill();
  }

  private _bindPointer(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.data) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const cx = this._cx(), cy = this._cy();
      const t  = this.t;
      let found: SolarPlanet | null = null;
      for (const p of this.data.planets) {
        const pa = p.angle + t * p.speed;
        const px = cx + Math.cos(pa) * p.orbitRadius;
        const py = cy + Math.sin(pa) * p.orbitRadius * (1 - p.orbitEccentricity * 0.5);
        if (Math.hypot(mx - px, my - py) < p.radius + 6) { found = p; break; }
      }
      if (found !== this.hoveredPlanet) {
        this.hoveredPlanet = found;
        this.canvas.style.cursor = found ? 'pointer' : 'default';
        this.onHoverPlanet?.(found);
      }
    });

    this.canvas.addEventListener('click', (e) => {
      if (!this.data) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const cx = this._cx(), cy = this._cy();
      const t  = this.t;
      for (const p of this.data.planets) {
        const pa = p.angle + t * p.speed;
        const px = cx + Math.cos(pa) * p.orbitRadius;
        const py = cy + Math.sin(pa) * p.orbitRadius * (1 - p.orbitEccentricity * 0.5);
        if (Math.hypot(mx - px, my - py) < p.radius + 6) {
          this.onClickPlanet?.(p);
          return;
        }
      }
    });
  }
}
