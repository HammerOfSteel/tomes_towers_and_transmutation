#!/usr/bin/env python3
"""Generate creature system files and rewrite CharacterCreation.ts"""
import pathlib, os

ROOT = pathlib.Path('/Users/terrygoleman/Documents/dev/games/tomes_towers_and_transmutation/src')
C = ROOT / 'creatures'
C.mkdir(exist_ok=True)

# ── CreatureDNA.ts ─────────────────────────────────────────────────────────────
(C / 'CreatureDNA.ts').write_text(r"""// ── CreatureDNA ─────────────────────────────────────────────────────────────────
//
//  Single source of truth for generating any creature or player character.
//  A DNA object serialises to Base64 for save files, clipboard, and the lab.

export type Archetype  = 'biped' | 'quadruped' | 'amoeba' | 'avian' | 'serpent';
export type FaceType   = 'cute' | 'angry' | 'cyclops' | 'blank' | 'skull' | 'compound';
export type MouthType  = 'smile' | 'frown' | 'beak' | 'fangs' | 'none';
export type Expression = 'neutral' | 'happy' | 'angry' | 'scared';
export type PropId     =
  | 'horns_small' | 'horns_large'
  | 'tail_stub'   | 'tail_long'
  | 'wings_bat'
  | 'crown'
  | 'robe'
  | 'armor_light'
  | 'aura';

export interface CreatureDNA {
  archetype: Archetype;
  colors: {
    primary:           number;
    secondary:         number;
    emissive:          number;
    emissiveIntensity: number;
  };
  proportions: {
    global:       number;
    torso:        [number, number, number];
    headSize:     number;
    limbLength:   number;
    limbWidth:    number;
    neckLength:   number;
    tailLength:   number;
    wingSpan:     number;
    segmentCount: number;
  };
  face: {
    type:       FaceType;
    eyeColor:   number;
    mouthType:  MouthType;
    expression: Expression;
  };
  material: {
    roughness:          number;
    metalness:          number;
    clearcoat:          number;
    clearcoatRoughness: number;
  };
  props: PropId[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_PLAYER_DNA: CreatureDNA = {
  archetype: 'biped',
  colors: { primary: 0xf5c89a, secondary: 0x4a2080, emissive: 0x6030c0, emissiveIntensity: 0.04 },
  proportions: {
    global: 1.0, torso: [1, 1, 1], headSize: 1.0,
    limbLength: 1.0, limbWidth: 1.0, neckLength: 1.0,
    tailLength: 0.0, wingSpan: 1.5, segmentCount: 5,
  },
  face: { type: 'cute', eyeColor: 0x2a1a4a, mouthType: 'smile', expression: 'neutral' },
  material: { roughness: 0.55, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 },
  props: ['robe'],
};

export const ARCHETYPE_DEFAULTS: Partial<Record<Archetype, Partial<CreatureDNA>>> = {
  quadruped: {
    colors: { primary: 0x6a9a5a, secondary: 0x3a5a2a, emissive: 0x204010, emissiveIntensity: 0.02 },
    proportions: { global: 1.0, torso: [1.4, 0.85, 1.8], headSize: 0.85, limbLength: 0.95, limbWidth: 0.9, neckLength: 1.4, tailLength: 1.2, wingSpan: 1.5, segmentCount: 4 },
    face: { type: 'angry', eyeColor: 0xff4000, mouthType: 'fangs', expression: 'angry' },
    props: [],
  },
  amoeba: {
    colors: { primary: 0x40c0a0, secondary: 0x20a080, emissive: 0x40ffd0, emissiveIntensity: 0.18 },
    proportions: { global: 1.0, torso: [1.3, 1.3, 1.3], headSize: 1.6, limbLength: 0.3, limbWidth: 1.5, neckLength: 0.3, tailLength: 0, wingSpan: 0.5, segmentCount: 6 },
    face: { type: 'cyclops', eyeColor: 0xff8800, mouthType: 'none', expression: 'neutral' },
    props: ['aura'],
  },
  avian: {
    colors: { primary: 0xe8c060, secondary: 0xa87020, emissive: 0xffe080, emissiveIntensity: 0.06 },
    proportions: { global: 0.85, torso: [0.85, 1.1, 0.7], headSize: 0.75, limbLength: 0.7, limbWidth: 0.7, neckLength: 1.6, tailLength: 0.9, wingSpan: 2.2, segmentCount: 3 },
    face: { type: 'cute', eyeColor: 0x1a3060, mouthType: 'beak', expression: 'neutral' },
    props: [],
  },
  serpent: {
    colors: { primary: 0x506020, secondary: 0x304010, emissive: 0x60a020, emissiveIntensity: 0.08 },
    proportions: { global: 1.0, torso: [0.5, 0.5, 0.5], headSize: 1.1, limbLength: 0.4, limbWidth: 0.6, neckLength: 0.5, tailLength: 1.8, wingSpan: 0.5, segmentCount: 9 },
    face: { type: 'angry', eyeColor: 0xff2000, mouthType: 'fangs', expression: 'angry' },
    props: ['tail_long'],
  },
};

export function dnaForArchetype(arch: Archetype): CreatureDNA {
  const base = cloneDNA(DEFAULT_PLAYER_DNA);
  base.archetype = arch;
  const over = ARCHETYPE_DEFAULTS[arch];
  if (!over) return base;
  if (over.colors)      Object.assign(base.colors,      over.colors);
  if (over.proportions) Object.assign(base.proportions, over.proportions);
  if (over.face)        Object.assign(base.face,        over.face);
  if (over.props !== undefined) base.props = [...over.props];
  return base;
}

// ── Serialisation ─────────────────────────────────────────────────────────────

export function dnaToBase64(dna: CreatureDNA): string { return btoa(JSON.stringify(dna)); }
export function base64ToDna(b64: string): CreatureDNA  { return JSON.parse(atob(b64)) as CreatureDNA; }
export function cloneDNA(dna: CreatureDNA): CreatureDNA { return JSON.parse(JSON.stringify(dna)) as CreatureDNA; }
export function numToHex(n: number): string { return '#' + n.toString(16).padStart(6, '0'); }
export function hexToNum(s: string): number { return parseInt(s.replace('#', ''), 16); }
""")
print('Wrote CreatureDNA.ts')

# ── CanvasFace.ts ──────────────────────────────────────────────────────────────
(C / 'CanvasFace.ts').write_text(r"""// ── CanvasFace ───────────────────────────────────────────────────────────────
//
//  Procedural anime-style face textures drawn on an offscreen canvas.
//  Applied to a PlaneGeometry face-plate attached to the head bone.
//  All drawing uses the 2D Canvas API — no assets loaded.

import * as THREE from 'three';
import type { FaceType, MouthType, Expression } from './CreatureDNA';

export interface FaceSpec {
  faceType:   FaceType;
  eyeColor:   number;
  mouthType:  MouthType;
  expression: Expression;
}

const SZ = 128;

export function makeFaceTexture(spec: FaceSpec): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  _draw(cv, spec);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export function updateFaceTexture(tex: THREE.CanvasTexture, spec: FaceSpec): void {
  _draw(tex.image as HTMLCanvasElement, spec);
  tex.needsUpdate = true;
}

function _draw(cv: HTMLCanvasElement, spec: FaceSpec): void {
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, SZ, SZ);
  const cx = SZ / 2, cy = SZ / 2;
  const eyeHex = '#' + spec.eyeColor.toString(16).padStart(6, '0');
  switch (spec.faceType) {
    case 'cute':     _cute(ctx, cx, cy, eyeHex, spec.mouthType, spec.expression); break;
    case 'angry':    _angry(ctx, cx, cy, eyeHex, spec.mouthType); break;
    case 'cyclops':  _cyclops(ctx, cx, cy, eyeHex, spec.mouthType); break;
    case 'skull':    _skull(ctx, cx, cy); break;
    case 'compound': _compound(ctx, cx, cy, eyeHex); break;
    case 'blank':    break;
  }
}

function _rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}

function _cute(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  eyeHex: string, mouth: MouthType, expr: Expression,
): void {
  const ey = cy - 8;
  for (const ex of [cx - 22, cx + 22]) {
    ctx.fillStyle = '#fffaf0'; _rrect(ctx, ex - 10, ey - 11, 20, 22, 7); ctx.fill();
    ctx.fillStyle = eyeHex;   _rrect(ctx, ex - 7,  ey - 5,  14, 16, 6); ctx.fill();
    ctx.fillStyle = '#111';   _rrect(ctx, ex - 4,  ey - 1,  8,  10, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(ex - 3, ey - 2, 3, 4, -0.3, 0, Math.PI * 2); ctx.fill();
    if (expr === 'angry') {
      ctx.strokeStyle = '#2a1000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ex - 10, ey - 14); ctx.lineTo(ex + 10, ey - 18); ctx.stroke();
    } else if (expr === 'scared') {
      ctx.strokeStyle = '#2a1000'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ex - 10, ey - 18); ctx.lineTo(ex + 10, ey - 14); ctx.stroke();
    }
  }
  if (expr === 'happy' || expr === 'neutral') {
    ctx.fillStyle = 'rgba(255,140,120,0.28)';
    ctx.beginPath(); ctx.ellipse(cx - 28, cy + 8, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 28, cy + 8, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  _mouth(ctx, cx, cy + 20, mouth, expr);
}

function _angry(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, eyeHex: string, mouth: MouthType,
): void {
  const pairs: [number, number][] = [[cx - 22, 1], [cx + 22, -1]];
  for (const [ex, side] of pairs) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(ex - 11, cy - 5);
    ctx.lineTo(ex + 11, cy - 12 * side * 0.5 - 5);
    ctx.lineTo(ex + 11, cy + 6);
    ctx.lineTo(ex - 11, cy + 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = eyeHex;
    ctx.beginPath(); ctx.ellipse(ex, cy - 1, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(ex, cy - 1, 2.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#200'; ctx.lineWidth = 4;
    ctx.beginPath();
    if (side > 0) { ctx.moveTo(ex - 12, cy - 16); ctx.lineTo(ex + 10, cy - 9); }
    else          { ctx.moveTo(ex - 10, cy - 9);  ctx.lineTo(ex + 12, cy - 16); }
    ctx.stroke();
  }
  _mouth(ctx, cx, cy + 20, mouth, 'angry');
}

function _cyclops(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, eyeHex: string, mouth: MouthType,
): void {
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.ellipse(cx, cy - 8, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = eyeHex;   ctx.beginPath(); ctx.ellipse(cx, cy - 8, 19, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';   ctx.beginPath(); ctx.ellipse(cx, cy - 8, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.ellipse(cx - 6, cy - 14, 5, 7, -0.4, 0, Math.PI * 2); ctx.fill();
  _mouth(ctx, cx, cy + 24, mouth, 'neutral');
}

function _skull(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  for (const ex of [cx - 20, cx + 20]) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath(); ctx.ellipse(ex, cy - 6, 14, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(60,0,80,0.5)';
    ctx.beginPath(); ctx.ellipse(ex - 3, cy - 9, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath(); ctx.moveTo(cx - 6, cy + 8); ctx.lineTo(cx + 6, cy + 8); ctx.lineTo(cx, cy + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fffef0';
  for (let i = 0; i < 5; i++) ctx.fillRect(cx - 18 + i * 8, cy + 18, 7, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - 19, cy + 17, 38, 2);
}

function _compound(ctx: CanvasRenderingContext2D, cx: number, cy: number, eyeHex: string): void {
  for (const [ex, ey] of [[cx - 24, cy - 10], [cx + 24, cy - 10]] as [number, number][]) {
    const n = 6, r = 18;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const px = ex - r + (i / (n - 1)) * r * 2;
        const py = ey - r * 0.6 + (j / (n - 1)) * r * 1.2;
        ctx.fillStyle = eyeHex;
        ctx.globalAlpha = 0.6 + (i + j) / (n * 2 - 2) * 0.4;
        ctx.beginPath(); ctx.ellipse(px, py, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = '#40200a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 10, cy + 26); ctx.lineTo(cx - 20, cy + 38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 10, cy + 26); ctx.lineTo(cx + 20, cy + 38); ctx.stroke();
}

function _mouth(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, mouth: MouthType, expr: Expression,
): void {
  ctx.strokeStyle = '#2a1000'; ctx.fillStyle = '#c04040'; ctx.lineWidth = 3;
  switch (mouth) {
    case 'smile': {
      const arc = expr === 'angry' ? -0.4 : 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy - arc * 10, 12, arc > 0 ? 0.1 : Math.PI + 0.1, arc > 0 ? Math.PI - 0.1 : -0.1);
      ctx.stroke(); break;
    }
    case 'frown': {
      ctx.beginPath(); ctx.arc(cx, cy + 10, 10, Math.PI + 0.2, -0.2); ctx.stroke(); break;
    }
    case 'beak': {
      ctx.fillStyle = '#e0a030';
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 3); ctx.lineTo(cx + 8, cy - 3); ctx.lineTo(cx, cy + 8);
      ctx.closePath(); ctx.fill(); break;
    }
    case 'fangs': {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx + 12, cy + 6);
      ctx.lineTo(cx - 12, cy + 6); ctx.closePath(); ctx.fill();
      for (const fx of [cx - 8, cx + 2]) {
        ctx.beginPath(); ctx.moveTo(fx, cy + 6); ctx.lineTo(fx + 3, cy + 14); ctx.lineTo(fx + 6, cy + 6); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = '#cc2a00'; ctx.lineWidth = 2; ctx.strokeRect(cx - 12, cy, 24, 6); break;
    }
  }
}
""")
print('Wrote CanvasFace.ts')

# ── CreatureBuilder.ts ─────────────────────────────────────────────────────────
(C / 'CreatureBuilder.ts').write_text(r"""// ── CreatureBuilder ──────────────────────────────────────────────────────────
//
//  Builds a Three.js Group hierarchy (FK rig) from a CreatureDNA.
//  MeshPhysicalMaterial gives the "3DS plastic toy" clearcoat look.
//  All geometry is procedural — no asset files loaded.

import * as THREE from 'three';
import type { CreatureDNA, PropId } from './CreatureDNA';
import { makeFaceTexture, type FaceSpec } from './CanvasFace';

// ── Public types ──────────────────────────────────────────────────────────────

export interface CreatureBones {
  torso?:     THREE.Group;
  head?:      THREE.Group;
  neck?:      THREE.Group;
  armL?:      THREE.Group;
  armR?:      THREE.Group;
  legL?:      THREE.Group;
  legR?:      THREE.Group;
  frontLegL?: THREE.Group;
  frontLegR?: THREE.Group;
  backLegL?:  THREE.Group;
  backLegR?:  THREE.Group;
  tail?:      THREE.Group;
  wingL?:     THREE.Group;
  wingR?:     THREE.Group;
  blobs?:     THREE.Group[];
  segments?:  THREE.Group[];
}

export interface CreatureRig {
  root:     THREE.Group;
  bones:    CreatureBones;
  faceTex?: THREE.CanvasTexture;
  dispose(): void;
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export function buildCreature(dna: CreatureDNA): CreatureRig {
  switch (dna.archetype) {
    case 'quadruped': return _quad(dna);
    case 'amoeba':    return _amoeba(dna);
    case 'avian':     return _avian(dna);
    case 'serpent':   return _serpent(dna);
    default:          return _biped(dna);
  }
}

// ── Material / dispose helpers ────────────────────────────────────────────────

function _m(color: number, dna: CreatureDNA, overrides?: Partial<CreatureDNA['material']>): THREE.MeshPhysicalMaterial {
  const mat = { ...dna.material, ...overrides };
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(dna.colors.emissive),
    emissiveIntensity: dna.colors.emissiveIntensity,
    roughness: mat.roughness,
    metalness: mat.metalness,
    clearcoat: mat.clearcoat,
    clearcoatRoughness: mat.clearcoatRoughness,
  });
}

function _free(meshes: THREE.Mesh[], textures?: THREE.Texture[]): () => void {
  return () => {
    for (const m of meshes) {
      m.geometry.dispose();
      if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
      else (m.material as THREE.Material).dispose();
    }
    textures?.forEach((t) => t.dispose());
  };
}

function _faceplane(dna: CreatureDNA, hs: number): { tex: THREE.CanvasTexture; plane: THREE.Mesh } {
  const spec: FaceSpec = { faceType: dna.face.type, eyeColor: dna.face.eyeColor, mouthType: dna.face.mouthType, expression: dna.face.expression };
  const tex = makeFaceTexture(spec);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.32 * hs, 0.24 * hs), mat);
  plane.position.z = 0.225 * hs;
  plane.position.y = 0.02;
  return { tex, plane };
}

function _headgeo(ftype: string, hs: number): THREE.BufferGeometry {
  switch (ftype) {
    case 'skull':    return new THREE.DodecahedronGeometry(0.22 * hs, 1);
    case 'cyclops':  return new THREE.IcosahedronGeometry(0.22 * hs, 1);
    case 'compound': return new THREE.OctahedronGeometry(0.22 * hs, 2);
    default:         return new THREE.SphereGeometry(0.22 * hs, 14, 10);
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

function _props(
  props: PropId[], head: THREE.Group | undefined, torso: THREE.Group | undefined,
  dna: CreatureDNA, ms: THREE.Mesh[],
): void {
  const pm = _m(dna.colors.primary,   dna);
  const sm = _m(dna.colors.secondary, dna);

  if (props.includes('horns_small') && head) {
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 6), sm);
      m.position.set(s * 0.13, 0.18, 0.02); m.rotation.z = s * 0.3;
      head.add(m); ms.push(m);
    }
  }
  if (props.includes('horns_large') && head) {
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.44, 6), sm);
      m.position.set(s * 0.17, 0.25, -0.04); m.rotation.z = s * 0.55; m.rotation.x = -0.18;
      head.add(m); ms.push(m);
    }
  }
  if (props.includes('crown') && head) {
    const goldMat = _m(0xffd700, dna, { metalness: 0.6, roughness: 0.25, clearcoat: 0.9 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.1, 8, 1, true), goldMat);
    ring.position.y = 0.2; head.add(ring); ms.push(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.1, 5), goldMat);
      spike.position.set(Math.cos(a) * 0.2, 0.27, Math.sin(a) * 0.2);
      head.add(spike); ms.push(spike);
    }
  }
  if (props.includes('robe') && torso) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.48, 1.12, 10), sm);
    skirt.position.y = 0.56; torso.add(skirt); ms.push(skirt);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 10), pm);
    belt.position.y = 1.07; torso.add(belt); ms.push(belt);
  }
  if (props.includes('armor_light') && torso) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.22), _m(0x8090a0, dna, { metalness: 0.5, roughness: 0.3 }));
    m.position.y = 1.3; torso.add(m); ms.push(m);
  }
  if (props.includes('tail_stub') && torso) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 7), pm);
    m.position.set(0, 0.25, -0.28); m.rotation.x = -1.4;
    torso.add(m); ms.push(m);
  }
  if (props.includes('tail_long') && torso) {
    let parent: THREE.Object3D = torso;
    for (let i = 0; i < 3; i++) {
      const r = 0.09 - i * 0.025;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, 0.38, 7), pm);
      const g = new THREE.Group();
      g.position.set(0, i === 0 ? 0.2 : -0.38, i === 0 ? -0.3 : 0);
      g.rotation.x = -1.1 - i * 0.25;
      seg.position.y = -0.19;
      g.add(seg); parent.add(g); parent = g; ms.push(seg);
    }
  }
  if (props.includes('wings_bat') && torso) {
    for (const s of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(s * 0.3, 0.3, -0.1);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(s * 0.82, 0.2); shape.lineTo(s * 0.92, -0.45);
      shape.lineTo(s * 0.4, -0.72); shape.lineTo(0, -0.3); shape.closePath();
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), _m(dna.colors.secondary, dna, { roughness: 0.85, clearcoat: 0.1 }));
      wg.add(m); torso.add(wg); ms.push(m);
    }
  }
  if (props.includes('aura') && torso) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 10, 7),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(dna.colors.emissive), transparent: true, opacity: 0.15, side: THREE.BackSide }),
    );
    torso.add(m); ms.push(m);
  }
}

// ── Biped ─────────────────────────────────────────────────────────────────────

function _biped(dna: CreatureDNA): CreatureRig {
  const ms: THREE.Mesh[] = [], bones: CreatureBones = {};
  const p = dna.proportions;
  const [tx, ty] = p.torso;
  const pm = _m(dna.colors.primary, dna), sm = _m(dna.colors.secondary, dna);

  const root = new THREE.Group();
  root.scale.setScalar(p.global);

  const torso = new THREE.Group();
  bones.torso = torso; root.add(torso);

  // Body cylinder (above any robe)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * tx, 0.245 * tx, 0.52 * ty, 10), pm);
  body.position.y = 1.38 * ty; torso.add(body); ms.push(body);

  // Robe handled in _props
  _props(dna.props, undefined, torso, dna, ms);

  // Arms
  for (const s of [-1, 1] as const) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.31 * tx, 1.44 * ty, 0); sh.rotation.z = s * 0.25;
    const arm  = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * p.limbWidth, 0.075 * p.limbWidth, 0.34 * p.limbLength, 7), sm);
    arm.position.y = -0.17 * p.limbLength; sh.add(arm); ms.push(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062 * p.limbWidth, 6, 5), pm);
    hand.position.y = -0.35 * p.limbLength; sh.add(hand); ms.push(hand);
    torso.add(sh);
    if (s === -1) bones.armL = sh; else bones.armR = sh;
  }

  // Neck + Head
  const neck = new THREE.Group();
  neck.position.y = 1.62 * ty; bones.neck = neck; torso.add(neck);
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.13 * p.neckLength, 8), pm);
  neck.add(neckM); ms.push(neckM);

  const head = new THREE.Group();
  head.position.y = 0.065 + 0.22 * p.headSize; bones.head = head; neck.add(head);
  const hm = new THREE.Mesh(_headgeo(dna.face.type, p.headSize), pm); head.add(hm); ms.push(hm);
  const { tex, plane } = _faceplane(dna, p.headSize);
  head.add(plane); ms.push(plane);

  _props(dna.props, head, undefined, dna, ms);

  // Legs (only if no robe)
  if (!dna.props.includes('robe')) {
    for (const s of [-1, 1] as const) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13 * tx, 0.02, 0);
      const leg  = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * p.limbWidth, 0.072 * p.limbWidth, 0.46 * p.limbLength, 7), sm);
      leg.position.y = -0.23 * p.limbLength; hip.add(leg); ms.push(leg);
      const footGeo = new THREE.SphereGeometry(0.09 * p.limbWidth, 6, 4);
      footGeo.scale(1.5, 0.55, 1.9);
      const foot = new THREE.Mesh(footGeo, pm);
      foot.position.set(0.02, -0.48 * p.limbLength, 0.04); hip.add(foot); ms.push(foot);
      torso.add(hip);
      if (s === -1) bones.legL = hip; else bones.legR = hip;
    }
  }

  return { root, bones, faceTex: tex, dispose: _free(ms, [tex]) };
}

// ── Quadruped ─────────────────────────────────────────────────────────────────

function _quad(dna: CreatureDNA): CreatureRig {
  const ms: THREE.Mesh[] = [], bones: CreatureBones = {};
  const p = dna.proportions;
  const [tx, , tz] = p.torso;
  const pm = _m(dna.colors.primary, dna), sm = _m(dna.colors.secondary, dna);

  const root  = new THREE.Group(); root.scale.setScalar(p.global);
  const torso = new THREE.Group(); torso.position.y = 0.95; bones.torso = torso; root.add(torso);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35 * tx, 0.7 * tz, 8, 10), pm);
  body.rotation.x = Math.PI / 2; torso.add(body); ms.push(body);

  const legDefs = [
    { x: -0.28 * tx, z: -0.4 * tz, k: 'frontLegL' as const },
    { x:  0.28 * tx, z: -0.4 * tz, k: 'frontLegR' as const },
    { x: -0.28 * tx, z:  0.4 * tz, k: 'backLegL'  as const },
    { x:  0.28 * tx, z:  0.4 * tz, k: 'backLegR'  as const },
  ];
  for (const d of legDefs) {
    const hip = new THREE.Group(); hip.position.set(d.x, -0.1, d.z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * p.limbWidth, 0.065 * p.limbWidth, 0.5 * p.limbLength, 7), sm);
    leg.position.y = -0.25 * p.limbLength; hip.add(leg); ms.push(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.1 * p.limbWidth, 7, 5), pm);
    paw.position.y = -0.52 * p.limbLength; paw.scale.set(1.3, 0.65, 1.5); hip.add(paw); ms.push(paw);
    torso.add(hip); bones[d.k] = hip;
  }

  const neck = new THREE.Group(); neck.position.set(0, 0.3, -0.5 * tz); neck.rotation.x = -0.7;
  bones.neck = neck; torso.add(neck);
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.38 * p.neckLength, 8), pm);
  neckM.position.y = 0.19 * p.neckLength; neck.add(neckM); ms.push(neckM);

  const head = new THREE.Group(); head.position.y = 0.38 * p.neckLength; bones.head = head; neck.add(head);
  const hm = new THREE.Mesh(_headgeo(dna.face.type, p.headSize * 0.88), pm); head.add(hm); ms.push(hm);
  const { tex, plane } = _faceplane(dna, p.headSize * 0.88); head.add(plane); ms.push(plane);

  if (p.tailLength > 0) {
    const tail = new THREE.Group(); tail.position.set(0, 0.1, 0.45 * tz); tail.rotation.x = 1.0;
    bones.tail = tail;
    const tM = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55 * p.tailLength, 8), sm);
    tM.position.y = 0.275 * p.tailLength; tail.add(tM); ms.push(tM); torso.add(tail);
  }

  _props(dna.props, head, torso, dna, ms);
  return { root, bones, faceTex: tex, dispose: _free(ms, [tex]) };
}

// ── Amoeba ────────────────────────────────────────────────────────────────────

function _amoeba(dna: CreatureDNA): CreatureRig {
  const ms: THREE.Mesh[] = [], bones: CreatureBones = { blobs: [] };
  const p = dna.proportions;
  const pm = _m(dna.colors.primary, dna), sm2 = _m(dna.colors.secondary, dna);

  const root  = new THREE.Group(); root.scale.setScalar(p.global);
  const torso = new THREE.Group(); torso.position.y = 0.7; bones.torso = torso; root.add(torso);

  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * p.headSize, 2), pm);
  blob.scale.set(p.torso[0], p.torso[1], p.torso[2]); torso.add(blob); ms.push(blob);

  const head = new THREE.Group(); head.position.z = 0.45 * p.headSize; bones.head = head; torso.add(head);
  const { tex, plane } = _faceplane(dna, p.headSize * 0.8); head.add(plane); ms.push(plane);

  const n = Math.round(Math.max(2, p.segmentCount));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.58 + (i % 2) * 0.12;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, Math.sin(a * 0.5) * 0.25, Math.sin(a) * r);
    const sz = 0.12 + (i % 3) * 0.06;
    const b  = new THREE.Mesh(new THREE.SphereGeometry(sz, 7, 5), i % 2 ? sm2 : pm);
    g.add(b); torso.add(g); bones.blobs!.push(g); ms.push(b);
  }

  _props(dna.props, head, torso, dna, ms);
  return { root, bones, faceTex: tex, dispose: _free(ms, [tex]) };
}

// ── Avian ─────────────────────────────────────────────────────────────────────

function _avian(dna: CreatureDNA): CreatureRig {
  const ms: THREE.Mesh[] = [], bones: CreatureBones = {};
  const p = dna.proportions;
  const [tx, ty] = p.torso;
  const pm = _m(dna.colors.primary, dna);

  const root  = new THREE.Group(); root.scale.setScalar(p.global);
  const torso = new THREE.Group(); torso.position.y = 0.8; bones.torso = torso; root.add(torso);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3 * tx, 12, 9), pm);
  body.scale.y = ty * 1.3; torso.add(body); ms.push(body);

  for (const s of [-1, 1] as const) {
    const hip = new THREE.Group(); hip.position.set(s * 0.12 * tx, -0.32 * ty, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.5 * p.limbLength, 5), _m(dna.colors.secondary, dna));
    leg.position.y = -0.25 * p.limbLength; hip.add(leg); ms.push(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), _m(dna.colors.secondary, dna));
    foot.position.y = -0.52 * p.limbLength; foot.scale.set(2, 0.5, 1.5); hip.add(foot); ms.push(foot);
    torso.add(hip);
    if (s === -1) bones.legL = hip; else bones.legR = hip;
  }

  const ws = p.wingSpan;
  for (const s of [-1, 1] as const) {
    const wg = new THREE.Group(); wg.position.set(s * 0.32 * tx, 0.18 * ty, 0);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.bezierCurveTo(s * ws * 0.5, 0.15, s * ws, -0.05, s * ws, -0.3);
    sh.bezierCurveTo(s * ws * 0.8, -0.5, s * ws * 0.4, -0.4, 0, -0.2); sh.closePath();
    const wm = new THREE.Mesh(new THREE.ShapeGeometry(sh, 12), _m(dna.colors.secondary, dna, { roughness: 0.75, clearcoat: 0.2 }));
    wg.add(wm); torso.add(wg); ms.push(wm);
    if (s === -1) bones.wingL = wg; else bones.wingR = wg;
  }

  const neck = new THREE.Group(); neck.position.set(0, 0.36 * ty, -0.1); neck.rotation.x = -0.35;
  bones.neck = neck; torso.add(neck);
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.28 * p.neckLength, 7), pm);
  neckM.position.y = 0.14 * p.neckLength; neck.add(neckM); ms.push(neckM);

  const head = new THREE.Group(); head.position.y = 0.3 * p.neckLength; bones.head = head; neck.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.2 * p.headSize, 12, 8), pm); head.add(hm); ms.push(hm);
  const { tex, plane } = _faceplane(dna, p.headSize * 0.75); head.add(plane); ms.push(plane);

  _props(dna.props, head, torso, dna, ms);
  return { root, bones, faceTex: tex, dispose: _free(ms, [tex]) };
}

// ── Serpent ───────────────────────────────────────────────────────────────────

function _serpent(dna: CreatureDNA): CreatureRig {
  const ms: THREE.Mesh[] = [], bones: CreatureBones = { segments: [] };
  const p = dna.proportions;
  const pm = _m(dna.colors.primary, dna), sm = _m(dna.colors.secondary, dna);

  const root = new THREE.Group(); root.scale.setScalar(p.global);
  const n    = Math.round(Math.max(3, Math.min(12, p.segmentCount)));
  let parent: THREE.Object3D = root;
  let lastGrp: THREE.Group | null = null;

  for (let i = 0; i < n; i++) {
    const t  = i / (n - 1);
    const r  = (0.22 - t * 0.12) * p.torso[0];
    const g  = new THREE.Group();
    g.position.y = i === 0 ? 0.5 : 0.36;
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.18, 6, 8), i % 2 ? sm : pm);
    g.add(seg); parent.add(g);
    bones.segments!.push(g); ms.push(seg);
    if (i === 0) bones.torso = g;
    parent = g; lastGrp = g;
  }

  const head = new THREE.Group(); bones.head = head;
  const hm = new THREE.Mesh(_headgeo(dna.face.type, p.headSize * 0.7), pm); head.add(hm); ms.push(hm);
  const { tex, plane } = _faceplane(dna, p.headSize * 0.7); head.add(plane); ms.push(plane);
  if (lastGrp) lastGrp.add(head);

  _props(dna.props, head, bones.torso, dna, ms);
  return { root, bones, faceTex: tex, dispose: _free(ms, [tex]) };
}
""")
print('Wrote CreatureBuilder.ts')

# ── CreatureAnimator.ts ────────────────────────────────────────────────────────
(C / 'CreatureAnimator.ts').write_text(r"""// ── CreatureAnimator ─────────────────────────────────────────────────────────
//
//  Drives CreatureRig bones using pure Forward Kinematics math.
//  No keyframe files — all motion is procedural time-based sine/cosine.
//  Call animateCreature(rig, ctx) every frame inside the render loop.

import type { CreatureRig } from './CreatureBuilder';

export type AnimState = 'idle' | 'walk' | 'run' | 'hit' | 'hypnotized' | 'death';

export interface AnimContext {
  state:         AnimState;
  time:          number;
  timeSinceHit?: number;
  velocity?:     number;
}

export function animateCreature(rig: CreatureRig, ctx: AnimContext): void {
  const { bones } = rig;
  const t = ctx.time;
  switch (ctx.state) {
    case 'idle':       _idle(bones, t);                         break;
    case 'walk':       _walk(bones, t, ctx.velocity ?? 0.5, false); break;
    case 'run':        _walk(bones, t, ctx.velocity ?? 1.0, true);  break;
    case 'hit':        _hit(bones, ctx.timeSinceHit ?? 0);      break;
    case 'hypnotized': _hypno(bones, t);                        break;
    case 'death':      _death(bones, t);                        break;
  }
}

// ── Idle — breathing + micro-sway ─────────────────────────────────────────────

function _idle(b: CreatureRig['bones'], t: number): void {
  const br = Math.sin(t * 2.4) * 0.028;
  if (b.torso) { b.torso.scale.y = 1 + br; b.torso.position.y = br * 4; }
  if (b.head)  { b.head.rotation.y = Math.sin(t * 0.7) * 0.055; b.head.rotation.z = Math.sin(t * 1.1) * 0.022; }
  if (b.armL)  b.armL.rotation.x  =  Math.sin(t * 2.2) * 0.04 + 0.06;
  if (b.armR)  b.armR.rotation.x  =  Math.sin(t * 2.2 + 1.0) * 0.04 + 0.06;
  if (b.wingL) b.wingL.rotation.z =  Math.sin(t * 1.8) * 0.06;
  if (b.wingR) b.wingR.rotation.z = -Math.sin(t * 1.8) * 0.06;
  if (b.blobs) {
    b.blobs.forEach((g, i) => {
      const ph = (i / b.blobs!.length) * Math.PI * 2;
      g.position.x = Math.cos(t * 0.9 + ph) * 0.6;
      g.position.z = Math.sin(t * 0.9 + ph) * 0.6;
      g.position.y = Math.sin(t * 1.4 + ph) * 0.2;
    });
  }
  if (b.segments) b.segments.forEach((sg, i) => { sg.rotation.z = Math.sin(t * 1.2 + i * 0.5) * 0.08; });
}

// ── Walk / Run — opposing sine-wave limbs ─────────────────────────────────────

function _walk(b: CreatureRig['bones'], t: number, vel: number, run: boolean): void {
  const sp  = run ? 9  : 5;
  const str = run ? 0.7 : 0.38;
  const bob = Math.sin(t * sp * 2) * (run ? 0.045 : 0.022);
  const ph  = t * sp;
  if (b.torso)     b.torso.position.y = bob;
  if (b.armL)      b.armL.rotation.x     =  Math.cos(ph) * str;
  if (b.armR)      b.armR.rotation.x     = -Math.cos(ph) * str;
  if (b.legL)      b.legL.rotation.x     = -Math.cos(ph) * str;
  if (b.legR)      b.legR.rotation.x     =  Math.cos(ph) * str;
  if (b.frontLegL) b.frontLegL.rotation.x =  Math.cos(ph) * str;
  if (b.frontLegR) b.frontLegR.rotation.x = -Math.cos(ph) * str;
  if (b.backLegL)  b.backLegL.rotation.x  = -Math.cos(ph) * str;
  if (b.backLegR)  b.backLegR.rotation.x  =  Math.cos(ph) * str;
  if (b.wingL)     b.wingL.rotation.z     =  Math.cos(ph * 1.5) * (run ? 0.6 : 0.25);
  if (b.wingR)     b.wingR.rotation.z     = -Math.cos(ph * 1.5) * (run ? 0.6 : 0.25);
  if (b.head)      b.head.rotation.x      = -bob * 3;
  if (b.segments)  b.segments.forEach((sg, i) => { sg.rotation.z = Math.sin(ph + i * 0.6) * str * 0.7; });
  void vel;
}

// ── Hit — exponential decay recoil ────────────────────────────────────────────

function _hit(b: CreatureRig['bones'], tsh: number): void {
  const d = Math.exp(-tsh * 9) * Math.sin(tsh * 28);
  if (b.torso) { b.torso.rotation.x = d * 0.35; const s = 1 + d * 0.1; b.torso.scale.set(1 / s, s, 1 / s); }
  if (b.head)  b.head.rotation.x = d * 0.25;
}

// ── Hypnotized — swirling confusion ───────────────────────────────────────────

function _hypno(b: CreatureRig['bones'], t: number): void {
  if (b.head)  { b.head.rotation.z = Math.sin(t * 14) * 0.22; b.head.rotation.y = Math.cos(t * 9) * 0.3; }
  if (b.torso) { b.torso.rotation.z = Math.sin(t * 5) * 0.08; b.torso.position.y = Math.abs(Math.sin(t * 6)) * 0.06; }
  if (b.armL)  b.armL.rotation.z =  Math.sin(t * 7) * 0.5;
  if (b.armR)  b.armR.rotation.z = -Math.sin(t * 7) * 0.5;
}

// ── Death — fall over ─────────────────────────────────────────────────────────

function _death(b: CreatureRig['bones'], t: number): void {
  const fall = Math.min(1, t * 2.5);
  if (b.torso) { b.torso.rotation.z = fall * (Math.PI / 2.1); b.torso.position.y = fall * -0.4; }
}
""")
print('Wrote CreatureAnimator.ts')

# ── CharacterCreation.ts (full rewrite) ────────────────────────────────────────
(ROOT / 'ui' / 'CharacterCreation.ts').write_text(r"""// ── CharacterCreation ────────────────────────────────────────────────────────
//
//  DNA-based character creation screen.  Every being type (biped, quadruped,
//  amoeba, avian, serpent) can be chosen — the player is NOT constrained to
//  a human shape.  Appearance is described by CreatureDNA and rendered live
//  via CreatureBuilder in a dedicated WebGLRenderer.

import * as THREE from 'three';
import {
  type CreatureDNA, type Archetype, type FaceType, type MouthType, type PropId,
  DEFAULT_PLAYER_DNA, dnaForArchetype, cloneDNA, numToHex, hexToNum,
} from '@/creatures/CreatureDNA';
import { buildCreature, type CreatureRig } from '@/creatures/CreatureBuilder';
import { animateCreature }                 from '@/creatures/CreatureAnimator';

// ── Public types ──────────────────────────────────────────────────────────────

export type StartingBoon = 'tome' | 'blood' | 'swift';

export interface CharacterConfig {
  name:   string;
  boon:   StartingBoon;
  slotId: number;
  dna:    CreatureDNA;
}

// ── Boon data ─────────────────────────────────────────────────────────────────

interface BoonDef { id: StartingBoon; icon: string; title: string; desc: string; effect: string; }
const BOONS: BoonDef[] = [
  { id: 'tome',  icon: '📖', title: 'Ancient Tome',    desc: 'A singed spellbook left in the cell.',            effect: 'Start with Flame Dart' },
  { id: 'blood', icon: '❤',  title: "Warrior's Blood", desc: 'Old lineage — harder to extinguish.',             effect: '+30 maximum HP' },
  { id: 'swift', icon: '💨', title: 'Swift Feet',      desc: 'A talent for movement and mischief.',             effect: 'Dodge −35%  •  Move +15%' },
];

// ── Archetype data ────────────────────────────────────────────────────────────

interface ArchDef { id: Archetype; icon: string; label: string; hint: string; }
const ARCHETYPES: ArchDef[] = [
  { id: 'biped',     icon: '🧙', label: 'Biped',     hint: 'Two-legged — arms, legs, full spellcasting posture.' },
  { id: 'quadruped', icon: '🐺', label: 'Quadruped', hint: 'Four-limbed beast — swift, imposing.' },
  { id: 'amoeba',    icon: '🫧', label: 'Amoeba',    hint: 'Amorphous blob — orbiting satellite masses.' },
  { id: 'avian',     icon: '🦅', label: 'Avian',     hint: 'Winged form — graceful, airborne aesthetic.' },
  { id: 'serpent',   icon: '🐍', label: 'Serpent',   hint: 'Segmented serpentine — sinuous and ancient.' },
];

// ── Prop data ─────────────────────────────────────────────────────────────────

interface PropDef { id: PropId; label: string; }
const PROP_DEFS: PropDef[] = [
  { id: 'robe',        label: 'Robe'       },
  { id: 'crown',       label: 'Crown'      },
  { id: 'horns_small', label: 'Horns (S)'  },
  { id: 'horns_large', label: 'Horns (L)'  },
  { id: 'wings_bat',   label: 'Bat Wings'  },
  { id: 'tail_stub',   label: 'Tail (stub)'},
  { id: 'tail_long',   label: 'Tail (long)'},
  { id: 'armor_light', label: 'Armor'      },
  { id: 'aura',        label: 'Aura'       },
];

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
.cc-dna-btn { background: transparent; border: 1px solid #2a1850; border-radius: 3px;
  color: #5a4880; font-size: .72rem; cursor: pointer; padding: 4px 10px; font-family: inherit;
  letter-spacing: .04em; transition: all .12s; }
.cc-dna-btn:hover { background: rgba(80,48,160,.1); color: #a080e0; border-color: #4a3870; }
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
  private readonly _renderer: THREE.WebGLRenderer;
  private readonly _scene:    THREE.Scene;
  private readonly _camera:   THREE.PerspectiveCamera;
  private _rig:   CreatureRig | null = null;
  private _rafId: number | null = null;
  private _rotY  = 0;
  private _drag  = false;
  private _prevX = 0;
  private _rotYStart = 0;

  constructor(canvas: HTMLCanvasElement, dna: CreatureDNA) {
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this._renderer.setSize(PW, PH);
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this._renderer.setClearColor(0x0d0b18);

    this._scene  = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(42, PW / PH, 0.1, 50);
    this._camera.position.set(0.4, 1.5, 3.2);
    this._camera.lookAt(0, 1.1, 0);

    this._scene.add(new THREE.AmbientLight(0xffe8d0, 0.65));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.15); key.position.set(3, 5, 3); this._scene.add(key);
    const rim = new THREE.DirectionalLight(0x8060ff, 0.38);  rim.position.set(-3, 2, -2); this._scene.add(rim);

    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0x0a0814, transparent: true, opacity: 0.4 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01; this._scene.add(disc);

    this._build(dna);
    this._bindPointer(canvas);
  }

  private _build(dna: CreatureDNA): void {
    if (this._rig) { this._scene.remove(this._rig.root); this._rig.dispose(); }
    this._rig = buildCreature(dna);
    this._scene.add(this._rig.root);
  }

  setDNA(dna: CreatureDNA): void { this._build(dna); }

  startLoop(): void {
    if (this._rafId !== null) return;
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      if (!this._drag) this._rotY += 0.007;
      if (this._rig) {
        this._rig.root.rotation.y = this._rotY;
        const t = performance.now() * 0.001;
        this._rig.root.position.y = Math.sin(t * 1.2) * 0.016;
        animateCreature(this._rig, { state: 'idle', time: t });
      }
      this._renderer.render(this._scene, this._camera);
    };
    tick();
  }

  stopLoop(): void {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  private _bindPointer(cv: HTMLCanvasElement): void {
    cv.addEventListener('pointerdown', (e) => { this._drag = true; this._prevX = e.clientX; this._rotYStart = this._rotY; });
    window.addEventListener('pointermove', (e) => { if (this._drag) this._rotY = this._rotYStart + (e.clientX - this._prevX) * 0.012; });
    window.addEventListener('pointerup', () => { this._drag = false; });
  }

  dispose(): void { this.stopLoop(); this._rig?.dispose(); this._renderer.dispose(); }
}

// ── CharacterCreation ─────────────────────────────────────────────────────────

export class CharacterCreation {
  private readonly _overlay: HTMLElement;
  private _preview:  CharacterPreview | null = null;
  private _dna:      CreatureDNA = cloneDNA(DEFAULT_PLAYER_DNA);
  private _boon:     StartingBoon = 'tome';
  private _slotId    = 0;

  // Control refs (populated in _build)
  private _nameInput!: HTMLInputElement;
  private _archChips  = new Map<Archetype, HTMLElement>();
  private _boonCards  = new Map<StartingBoon, HTMLElement>();
  private _faceChips  = new Map<FaceType,  HTMLElement>();
  private _mouthChips = new Map<MouthType, HTMLElement>();
  private _propChips  = new Map<PropId,    HTMLElement>();
  private _primaryInput!:   HTMLInputElement;
  private _secondaryInput!: HTMLInputElement;
  private _emissiveInput!:  HTMLInputElement;
  private _emissiveSlider!: HTMLInputElement;
  private _emissiveVal!:    HTMLElement;
  private _scaleSlider!:    HTMLInputElement;
  private _scaleVal!:       HTMLElement;
  private _eyeInput!:       HTMLInputElement;

  constructor(
    private readonly _onStart: (cfg: CharacterConfig) => void,
    private readonly _onBack:  () => void,
  ) {
    _ensureStyles();
    this._overlay = this._build();
    document.body.appendChild(this._overlay);
  }

  show(slotId: number): void {
    this._slotId = slotId;
    this._dna    = cloneDNA(DEFAULT_PLAYER_DNA);
    this._boon   = 'tome';
    this._overlay.style.display = 'flex';
    requestAnimationFrame(() => this._overlay.classList.add('cc-open'));
    const canvas = this._overlay.querySelector<HTMLCanvasElement>('.cc-preview-canvas')!;
    if (!this._preview) this._preview = new CharacterPreview(canvas, this._dna);
    else                this._preview.setDNA(this._dna);
    this._syncControls();
    this._preview.startLoop();
  }

  hide(): void {
    this._overlay.classList.remove('cc-open');
    this._preview?.stopLoop();
    setTimeout(() => { this._overlay.style.display = 'none'; }, 250);
  }

  dispose(): void { this._preview?.dispose(); this._overlay.remove(); }

  // ── Sync all control values from _dna ───────────────────────────────────

  private _syncControls(): void {
    const d = this._dna;
    this._nameInput.value     = '';
    this._primaryInput.value   = numToHex(d.colors.primary);
    this._secondaryInput.value = numToHex(d.colors.secondary);
    this._emissiveInput.value  = numToHex(d.colors.emissive);
    this._emissiveSlider.value = String(d.colors.emissiveIntensity);
    this._emissiveVal.textContent = d.colors.emissiveIntensity.toFixed(2);
    this._scaleSlider.value   = String(d.proportions.global);
    this._scaleVal.textContent = d.proportions.global.toFixed(2);
    this._eyeInput.value      = numToHex(d.face.eyeColor);

    this._archChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.archetype));
    this._boonCards.forEach((el, id) => el.classList.toggle('cc-boon--on', id === this._boon));
    this._faceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.type));
    this._mouthChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === d.face.mouthType));
    this._propChips.forEach((el, id) => el.classList.toggle('cc-prop--on', d.props.includes(id)));
  }

  // ── DOM builder ──────────────────────────────────────────────────────────

  private _build(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'cc-overlay';

    const card = document.createElement('div');
    card.className = 'cc-card';

    // Title
    const title = document.createElement('div'); title.className = 'cc-title'; title.textContent = 'SHAPE YOUR BEING';
    const sub   = document.createElement('div'); sub.className   = 'cc-subtitle'; sub.textContent = 'Form • Boon • Appearance';
    card.append(title, sub);

    // Two-column main
    const main = document.createElement('div');
    main.className = 'cc-main';

    // ── Left column: preview ────────────────────────────────────────────────
    const previewCol = document.createElement('div');
    previewCol.className = 'cc-preview-col';
    const canvas = document.createElement('canvas');
    canvas.className = 'cc-preview-canvas';
    const hint = document.createElement('div'); hint.className = 'cc-drag-hint'; hint.textContent = 'Drag to rotate';
    const dnaBtn = document.createElement('button'); dnaBtn.className = 'cc-dna-btn'; dnaBtn.textContent = '📋 Copy DNA';
    dnaBtn.onclick = () => {
      const { dnaToBase64 } = require('@/creatures/CreatureDNA'); // dynamic; resolved at runtime
      navigator.clipboard?.writeText(dnaToBase64(this._dna)).catch(() => {});
    };
    previewCol.append(canvas, hint, dnaBtn);

    // ── Right column: controls ──────────────────────────────────────────────
    const ctrlCol = document.createElement('div');
    ctrlCol.className = 'cc-controls-col';

    // Name
    const nameWrap = document.createElement('div'); nameWrap.className = 'cc-section';
    const nameLbl = document.createElement('label'); nameLbl.className = 'cc-label'; nameLbl.textContent = 'Name';
    this._nameInput = document.createElement('input');
    this._nameInput.type = 'text'; this._nameInput.className = 'cc-name-input';
    this._nameInput.placeholder = 'Enter a name…'; this._nameInput.maxLength = 24;
    nameWrap.append(nameLbl, this._nameInput);

    // Archetype
    const archSec = document.createElement('div'); archSec.className = 'cc-section';
    const archTitle = document.createElement('div'); archTitle.className = 'cc-section-title'; archTitle.textContent = 'Form';
    const archChips = document.createElement('div'); archChips.className = 'cc-chips';
    for (const a of ARCHETYPES) {
      const chip = document.createElement('div'); chip.className = 'cc-chip';
      chip.textContent = a.icon + ' ' + a.label; chip.title = a.hint;
      chip.onclick = () => { this._dna = dnaForArchetype(a.id); this._syncControls(); this._preview?.setDNA(this._dna); };
      this._archChips.set(a.id, chip); archChips.appendChild(chip);
    }
    archSec.append(archTitle, archChips);

    // Boon
    const boonSec = document.createElement('div'); boonSec.className = 'cc-section';
    const boonTitle = document.createElement('div'); boonTitle.className = 'cc-section-title'; boonTitle.textContent = 'Boon';
    const boonList = document.createElement('div'); boonList.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
    for (const b of BOONS) {
      const card2 = document.createElement('div'); card2.className = 'cc-boon';
      const icon = document.createElement('span'); icon.className = 'cc-boon-icon'; icon.textContent = b.icon;
      const body = document.createElement('div');
      const t2 = document.createElement('div'); t2.className = 'cc-boon-title'; t2.textContent = b.title;
      const d2 = document.createElement('div'); d2.className = 'cc-boon-desc';  d2.textContent = b.desc;
      const e2 = document.createElement('div'); e2.className = 'cc-boon-effect'; e2.textContent = b.effect;
      body.append(t2, d2, e2); card2.append(icon, body);
      card2.onclick = () => { this._boon = b.id; this._boonCards.forEach((el, id) => el.classList.toggle('cc-boon--on', id === b.id)); };
      this._boonCards.set(b.id, card2); boonList.appendChild(card2);
    }
    boonSec.append(boonTitle, boonList);

    // Palette
    const palSec = this._makeSection('Palette');
    const colorRows: [string, 'primary' | 'secondary' | 'emissive'][] = [['Body', 'primary'], ['Accent', 'secondary'], ['Emissive', 'emissive']];
    for (const [lbl, key] of colorRows) {
      const row = document.createElement('div'); row.className = 'cc-row';
      const label = document.createElement('span'); label.className = 'cc-row-lbl'; label.textContent = lbl + ':';
      const inp = document.createElement('input'); inp.type = 'color'; inp.className = 'cc-color-input';
      inp.addEventListener('input', () => { this._dna.colors[key] = hexToNum(inp.value); this._preview?.setDNA(this._dna); });
      if (key === 'primary')   this._primaryInput   = inp;
      if (key === 'secondary') this._secondaryInput = inp;
      if (key === 'emissive')  this._emissiveInput  = inp;
      row.append(label, inp);
      palSec.appendChild(row);
    }
    // Emissive intensity
    const emRow = document.createElement('div'); emRow.className = 'cc-row';
    const emLbl = document.createElement('span'); emLbl.className = 'cc-row-lbl'; emLbl.textContent = 'Glow:';
    this._emissiveSlider = document.createElement('input'); this._emissiveSlider.type = 'range';
    this._emissiveSlider.className = 'cc-slider'; this._emissiveSlider.min = '0'; this._emissiveSlider.max = '0.5'; this._emissiveSlider.step = '0.01';
    this._emissiveVal = document.createElement('span'); this._emissiveVal.className = 'cc-slider-val';
    this._emissiveSlider.oninput = () => { this._dna.colors.emissiveIntensity = +this._emissiveSlider.value; this._emissiveVal.textContent = (+this._emissiveSlider.value).toFixed(2); this._preview?.setDNA(this._dna); };
    emRow.append(emLbl, this._emissiveSlider, this._emissiveVal); palSec.appendChild(emRow);

    // Face
    const faceSec = this._makeSection('Face');
    // Face type chips
    const ftRow = document.createElement('div'); ftRow.className = 'cc-row';
    const ftLbl = document.createElement('span'); ftLbl.className = 'cc-row-lbl'; ftLbl.textContent = 'Type:';
    const ftChips = document.createElement('div'); ftChips.className = 'cc-chips';
    for (const ft of ['cute','angry','cyclops','skull','compound','blank'] as FaceType[]) {
      const chip = document.createElement('div'); chip.className = 'cc-chip'; chip.textContent = ft;
      chip.onclick = () => { this._dna.face.type = ft; this._faceChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === ft)); this._preview?.setDNA(this._dna); };
      this._faceChips.set(ft, chip); ftChips.appendChild(chip);
    }
    ftRow.append(ftLbl, ftChips); faceSec.appendChild(ftRow);

    // Mouth chips
    const mRow = document.createElement('div'); mRow.className = 'cc-row';
    const mLbl = document.createElement('span'); mLbl.className = 'cc-row-lbl'; mLbl.textContent = 'Mouth:';
    const mChips = document.createElement('div'); mChips.className = 'cc-chips';
    for (const mt of ['smile','frown','beak','fangs','none'] as MouthType[]) {
      const chip = document.createElement('div'); chip.className = 'cc-chip'; chip.textContent = mt;
      chip.onclick = () => { this._dna.face.mouthType = mt; this._mouthChips.forEach((el, id) => el.classList.toggle('cc-chip--on', id === mt)); this._preview?.setDNA(this._dna); };
      this._mouthChips.set(mt, chip); mChips.appendChild(chip);
    }
    mRow.append(mLbl, mChips); faceSec.appendChild(mRow);

    // Eye color
    const eyRow = document.createElement('div'); eyRow.className = 'cc-row';
    const eyLbl = document.createElement('span'); eyLbl.className = 'cc-row-lbl'; eyLbl.textContent = 'Eye:';
    this._eyeInput = document.createElement('input'); this._eyeInput.type = 'color'; this._eyeInput.className = 'cc-color-input';
    this._eyeInput.addEventListener('input', () => { this._dna.face.eyeColor = hexToNum(this._eyeInput.value); this._preview?.setDNA(this._dna); });
    eyRow.append(eyLbl, this._eyeInput); faceSec.appendChild(eyRow);

    // Props
    const propSec = this._makeSection('Props');
    const propGrid = document.createElement('div'); propGrid.className = 'cc-prop-grid';
    for (const pd of PROP_DEFS) {
      const item = document.createElement('div'); item.className = 'cc-prop';
      const box = document.createElement('span'); box.className = 'cc-prop-box';
      const lbl2 = document.createElement('span'); lbl2.textContent = pd.label;
      item.append(box, lbl2);
      item.onclick = () => {
        const idx = this._dna.props.indexOf(pd.id);
        if (idx >= 0) this._dna.props.splice(idx, 1); else this._dna.props.push(pd.id);
        item.classList.toggle('cc-prop--on', this._dna.props.includes(pd.id));
        this._preview?.setDNA(this._dna);
      };
      this._propChips.set(pd.id, item); propGrid.appendChild(item);
    }
    propSec.appendChild(propGrid);

    // Scale
    const scaleSec = this._makeSection('Scale');
    const scRow = document.createElement('div'); scRow.className = 'cc-row';
    const scLbl = document.createElement('span'); scLbl.className = 'cc-row-lbl'; scLbl.textContent = 'Global:';
    this._scaleSlider = document.createElement('input'); this._scaleSlider.type = 'range';
    this._scaleSlider.className = 'cc-slider'; this._scaleSlider.min = '0.5'; this._scaleSlider.max = '2.0'; this._scaleSlider.step = '0.05';
    this._scaleVal = document.createElement('span'); this._scaleVal.className = 'cc-slider-val';
    this._scaleSlider.oninput = () => { this._dna.proportions.global = +this._scaleSlider.value; this._scaleVal.textContent = (+this._scaleSlider.value).toFixed(2); this._preview?.setDNA(this._dna); };
    scRow.append(scLbl, this._scaleSlider, this._scaleVal); scaleSec.appendChild(scRow);

    ctrlCol.append(nameWrap, archSec, boonSec, palSec, faceSec, propSec, scaleSec);
    main.append(previewCol, ctrlCol);

    // Actions
    const actions = document.createElement('div'); actions.className = 'cc-actions';
    const backBtn = document.createElement('button'); backBtn.className = 'cc-btn cc-btn--back'; backBtn.textContent = '← Back';
    backBtn.onclick = () => this._onBack();
    const startBtn = document.createElement('button'); startBtn.className = 'cc-btn cc-btn--start'; startBtn.textContent = 'Begin →';
    startBtn.onclick = () => {
      const name = this._nameInput.value.trim() || 'The Transmuter';
      this._onStart({ name, boon: this._boon, slotId: this._slotId, dna: cloneDNA(this._dna) });
    };
    actions.append(backBtn, startBtn);
    card.append(main, actions);
    overlay.appendChild(card);
    return overlay;
  }

  // Creates a section wrapper with a title div that returns the section element
  private _makeSection(title: string): HTMLElement {
    const sec = document.createElement('div'); sec.className = 'cc-section';
    const t   = document.createElement('div'); t.className   = 'cc-section-title'; t.textContent = title;
    sec.appendChild(t);
    return sec;
  }
}

function _ensureStyles(): void {
  if (document.getElementById('cc-css')) return;
  const s = document.createElement('style');
  s.id = 'cc-css'; s.textContent = CC_CSS;
  document.head.appendChild(s);
}
""")
print('Wrote CharacterCreation.ts')

print('\nAll files written successfully!')
