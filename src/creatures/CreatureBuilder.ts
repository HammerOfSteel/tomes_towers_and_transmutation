// ── CreatureBuilder ──────────────────────────────────────────────────────────
//
//  Builds a Three.js Group hierarchy (FK rig) from a CreatureDNA.
//  MeshPhysicalMaterial gives the "3DS plastic toy" clearcoat look.
//  All geometry is procedural — no asset files loaded.

import * as THREE from 'three';
import type { CreatureDNA, PropId, EarShape } from './CreatureDNA';
import { SUBRACE_DEFS } from './CreatureDNA';
import { makeFaceTexture, type FaceSpec } from './CanvasFace';
import { makeSkinTexture } from './CanvasSkin';
import { flatShade, wobbleVertices } from './meshUtils';
import { dressFlaredProfile, robeLayeredProfile, skirtGatheredProfile, addHemFolds } from './profileCurves';
import { buildSeamMesh } from './sdfBlend';
import { SnakeLocomotion } from './SnakeLocomotion';

// ── Public types ──────────────────────────────────────────────────────────────

export interface CreatureBones {
  torso?:     THREE.Group;
  head?:      THREE.Group;
  neck?:      THREE.Group;
  armL?:      THREE.Group;
  armR?:      THREE.Group;
  legL?:      THREE.Group;
  legR?:      THREE.Group;
  legLKnee?:  THREE.Group;
  legRKnee?:  THREE.Group;
  frontLegL?: THREE.Group;
  frontLegR?: THREE.Group;
  backLegL?:  THREE.Group;
  backLegR?:  THREE.Group;
  frontLegLKnee?: THREE.Group;
  frontLegRKnee?: THREE.Group;
  backLegLKnee?:  THREE.Group;
  backLegRKnee?:  THREE.Group;
  tail?:      THREE.Group;
  wingL?:     THREE.Group;
  wingR?:     THREE.Group;
  blobs?:     THREE.Group[];
  segments?:  THREE.Group[];
}

export interface CreatureRig {
  root:       THREE.Group;
  bones:      CreatureBones;
  faceTex?:   THREE.CanvasTexture;
  /** Present only for serpent-archetype creatures. */
  snakeLoco?: SnakeLocomotion;
  dispose(): void;
}

// ── CC-13: Material pool — one material instance per color×role per build ─────
// Reset at the start of each buildCreature() call so different creatures never
// share material objects (allowing independent color changes / disposal).

let _matPool: Map<string, THREE.MeshPhysicalMaterial> = new Map();

function _clearMatPool(): void { _matPool = new Map(); }

// ── Entry ─────────────────────────────────────────────────────────────────────

export function buildCreature(dna: CreatureDNA): CreatureRig {
  _clearMatPool();
  switch (dna.archetype) {
    case 'quadruped': return _quad(dna);
    case 'amoeba':    return _amoeba(dna);
    case 'avian':     return _avian(dna);
    case 'serpent':   return _serpent(dna);
    default:          return _biped(dna);
  }
}

/**
 * Compute the natural foot height (unscaled root-local Y) for a quad rig.
 * Works for both 2-bone (knee groups) and legacy 1-bone skeletons.
 * This is the Y target for foot placement when the creature stands at rest.
 */
export function computeQuadNaturalFootY(rig: CreatureRig): number {
  const hipFL  = rig.bones.frontLegL;
  if (!hipFL) return 0.33;
  const torsoY = rig.bones.torso?.position.y ?? 0.95;
  const hipLocalY = torsoY + hipFL.position.y;  // hip Y above root (unscaled)
  const kneeFL = rig.bones.frontLegLKnee;
  if (kneeFL) {
    // 2-bone: paw is a child of kneeGroup
    let pawY = 0;
    kneeFL.children.forEach(child => {
      if (child instanceof THREE.Mesh && child.position.y < pawY) pawY = child.position.y;
    });
    if (pawY === 0) pawY = -(Math.abs(kneeFL.position.y) * (25 / 27));
    return hipLocalY + kneeFL.position.y + pawY;
  }
  // 1-bone fallback: paw is a direct child of hip
  let pawY = 0;
  hipFL.children.forEach(child => {
    if (child instanceof THREE.Mesh && child.position.y < pawY) pawY = child.position.y;
  });
  if (pawY === 0) pawY = -0.52;
  return hipLocalY + pawY;
}

// ── Material / dispose helpers ────────────────────────────────────────────────

function _m(color: number, dna: CreatureDNA, overrides?: Partial<CreatureDNA['material']>): THREE.MeshPhysicalMaterial {
  const mat = { ...dna.material, ...overrides };
  // Build a cache key — unique per color + all material params that differ
  const key = `${color}_${mat.roughness}_${mat.metalness}_${mat.clearcoat}_${mat.clearcoatRoughness}`;
  const cached = _matPool.get(key);
  if (cached) return cached;
  const result = flatShade(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(dna.colors.emissive),
    emissiveIntensity: dna.colors.emissiveIntensity,
    roughness: mat.roughness,
    metalness: mat.metalness,
    clearcoat: mat.clearcoat,
    clearcoatRoughness: mat.clearcoatRoughness,
  }));
  _matPool.set(key, result);
  return result;
}

/** Wobble a geometry in-place with strength scaled by dna.colors.primary. */
function _wobble(geo: THREE.BufferGeometry, strength: number, dna: CreatureDNA, salt = 0): THREE.BufferGeometry {
  wobbleVertices(geo, strength, (dna.colors.primary ^ salt) >>> 0);
  return geo;
}

/** Primary body material — includes skin pattern texture when set. */
function _bodyMat(dna: CreatureDNA, overrides?: Partial<CreatureDNA['material']>): THREE.MeshPhysicalMaterial {
  const mat = _m(dna.colors.primary, dna, overrides);
  const c = dna.colors;
  if (c.pattern !== 'none') {
    mat.map = makeSkinTexture(c.primary, c.patternColor, c.pattern, c.patternScale, c.patternOpacity);
  }
  return mat;
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

function _ears(
  earShape: EarShape, hs: number, head: THREE.Group,
  mat: THREE.MeshPhysicalMaterial, ms: THREE.Mesh[],
): void {
  if (earShape === 'none' || earShape === 'round') return; // round ears = no visible geometry
  if (earShape === 'pointed') {
    // Slender pointy elven/pixie/fae ears — thin cones angled outward
    for (const s of [-1, 1] as const) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.045 * hs, 0.22 * hs, 5), mat);
      m.position.set(s * 0.2 * hs, 0.08 * hs, 0);
      m.rotation.z = s * 1.2;
      head.add(m); ms.push(m);
    }
  } else if (earShape === 'large') {
    // Wide flat goblin / troll ears — flattened sphere halves
    for (const s of [-1, 1] as const) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13 * hs, 8, 6, 0, Math.PI), mat);
      m.position.set(s * 0.22 * hs, 0, 0);
      m.rotation.y = s * Math.PI / 2;
      m.rotation.z = s * 0.2;
      head.add(m); ms.push(m);
    }
  }
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
  const pm = _bodyMat(dna);
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
  if (props.includes('hair_short') && head) {
    const hs = (dna.proportions.headSize ?? 1.0) * 0.22;
    const hairMat = _m(dna.colors.secondary, dna, { roughness: 0.92, clearcoat: 0, metalness: 0 });
    // Rounded cap covering the top half of the head
    const cap = new THREE.Mesh(new THREE.SphereGeometry(hs * 1.06, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
    cap.position.y = 0.02 * hs; head.add(cap); ms.push(cap);
  }
  if (props.includes('hair_long') && head) {
    const hs = (dna.proportions.headSize ?? 1.0) * 0.22;
    const hairMat = _m(dna.colors.secondary, dna, { roughness: 0.92, clearcoat: 0, metalness: 0 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(hs * 1.06, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    cap.position.y = 0.02 * hs; head.add(cap); ms.push(cap);
    // Flowing hair down the back
    const flow = new THREE.Mesh(new THREE.CylinderGeometry(hs * 0.50, hs * 0.32, hs * 2.4, 7), hairMat);
    flow.position.set(0, -hs * 1.1, -hs * 0.72); flow.rotation.x = 0.32;
    head.add(flow); ms.push(flow);
  }
  if (props.includes('hair_bun') && head) {
    const hs = (dna.proportions.headSize ?? 1.0) * 0.22;
    const hairMat = _m(dna.colors.secondary, dna, { roughness: 0.92, clearcoat: 0, metalness: 0 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(hs * 1.05, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    cap.position.y = 0.03 * hs; head.add(cap); ms.push(cap);
    // Bun on top-back
    const bun = new THREE.Mesh(new THREE.SphereGeometry(hs * 0.44, 7, 6), hairMat);
    bun.position.set(0, hs * 1.1, -hs * 0.30); head.add(bun); ms.push(bun);
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
      wg.position.set(s * 0.26, 1.32, -0.14);  // upper-back attachment, shoulder height
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

  // ── CC-6 new props ───────────────────────────────────────────────────────
  if (props.includes('antlers') && head) {
    const am = _m(dna.colors.secondary, dna, { roughness: 0.85, metalness: 0 });
    for (const s of [-1, 1]) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.28, 5), am);
      base.position.set(s * 0.10, 0.16, 0); base.rotation.z = s * 0.35;
      head.add(base); ms.push(base);
      for (const [bx, by, bz, rx, rz] of [[0.06, 0.24, 0, 0, s * 0.6], [-0.02, 0.22, 0.04, -0.3, s * 0.2]] as number[][]) {
        const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.14, 4), am);
        tine.position.set(s * bx, by, bz); tine.rotation.set(rx, 0, rz);
        base.add(tine); ms.push(tine);
      }
    }
  }
  if (props.includes('fin_dorsal') && torso) {
    const fm = _m(dna.colors.secondary, dna, { roughness: 0.7 });
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(-0.12, 0.45); shape.lineTo(0.12, 0.45); shape.closePath();
    const fin = new THREE.Mesh(new THREE.ShapeGeometry(shape), fm);
    fin.position.set(0, 0.55, -0.12); fin.rotation.x = -0.15;
    torso.add(fin); ms.push(fin);
  }
  if (props.includes('mane') && torso) {
    const mm = _m(dna.colors.secondary, dna, { roughness: 0.95, clearcoat: 0, metalness: 0 });
    const neckY = 1.45;
    const maneGeo = new THREE.CylinderGeometry(0.028, 0.018, 0.22, 4);
    const maneIm  = new THREE.InstancedMesh(maneGeo, mm, 8);
    const mtxM = new THREE.Matrix4(), posM = new THREE.Vector3(), quatM = new THREE.Quaternion(), scaleM = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      posM.set(Math.cos(a) * 0.19, neckY, Math.sin(a) * 0.19);
      quatM.setFromEuler(new THREE.Euler(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.5));
      mtxM.compose(posM, quatM, scaleM);
      maneIm.setMatrixAt(i, mtxM);
    }
    maneIm.instanceMatrix.needsUpdate = true;
    torso.add(maneIm);
    ms.push({ geometry: maneGeo, material: mm } as unknown as THREE.Mesh);
  }
  if (props.includes('feather_crest') && head) {
    const fcm = _m(dna.colors.secondary, dna, { roughness: 0.8, metalness: 0 });
    for (let i = 0; i < 5; i++) {
      const t = (i / 4 - 0.5);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.28 - Math.abs(t) * 0.08, 4), fcm);
      f.position.set(t * 0.15, 0.22, -0.04); f.rotation.z = t * 0.3;
      head.add(f); ms.push(f);
    }
  }
  if (props.includes('tusk_lower') && head) {
    const tm = _m(dna.colors.secondary, dna, { roughness: 0.6, metalness: 0.1 });
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.14, 5), tm);
      t.position.set(s * 0.08, -0.14, 0.06); t.rotation.set(0.3, 0, s * 0.15);
      head.add(t); ms.push(t);
    }
  }
  if (props.includes('scale_ridges') && torso) {
    const sm2 = _m(dna.colors.secondary, dna, { roughness: 0.65 });
    const ridgeGeo = new THREE.ConeGeometry(0.036, 0.10, 4);
    const ridgeIm  = new THREE.InstancedMesh(ridgeGeo, sm2, 5);
    const mtxR = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      mtxR.makeRotationX(0.25);
      mtxR.setPosition(0, 0.85 - i * 0.22, -0.14);
      ridgeIm.setMatrixAt(i, mtxR);
    }
    ridgeIm.instanceMatrix.needsUpdate = true;
    torso.add(ridgeIm);
    // push a dummy Mesh placeholder so _free() can dispose the geometry
    ms.push({ geometry: ridgeGeo, material: sm2 } as unknown as THREE.Mesh);
  }
  if (props.includes('tentacles') && torso) {
    const tentm = _m(dna.colors.secondary, dna, { roughness: 0.9, clearcoat: 0, metalness: 0 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      for (let seg = 0; seg < 3; seg++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025 - seg * 0.006, 0.032 - seg * 0.006, 0.18, 5), tentm);
        s.position.set(Math.cos(a) * (0.28 + seg * 0.14), -(0.12 + seg * 0.20), Math.sin(a) * (0.28 + seg * 0.14));
        s.rotation.x = 0.4 + seg * 0.2; s.rotation.y = a;
        torso.add(s); ms.push(s);
      }
    }
  }
  if (props.includes('carapace') && torso) {
    const cm = _m(dna.colors.secondary, dna, { roughness: 0.45, metalness: 0.12 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), cm);
    shell.position.set(0, 0.72, -0.08); shell.rotation.x = -Math.PI * 0.5;
    torso.add(shell); ms.push(shell);
  }
  if (props.includes('lantern') && torso) {
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(dna.colors.emissive) });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 6), lm);
    lantern.position.set(0.32, 0.30, 0.18);
    torso.add(lantern); ms.push(lantern);
  }
  if (props.includes('ghost_trail') && torso) {
    const gtm = new THREE.MeshBasicMaterial({
      color: new THREE.Color(dna.colors.emissive), transparent: true, opacity: 0.22, side: THREE.BackSide,
    });
    for (let i = 0; i < 3; i++) {
      const trail = new THREE.Mesh(new THREE.ConeGeometry(0.20 - i * 0.04, 0.30, 6), gtm);
      trail.position.set(0, -(0.18 + i * 0.28), 0);
      torso.add(trail); ms.push(trail);
    }
  }
}
// ── Outfit ────────────────────────────────────────────────────────────────────────────────

function _outfit(dna: CreatureDNA, torso: THREE.Group, ms: THREE.Mesh[]): void {
  const o = (dna as any).outfit ?? { top: 'none', legs: 'none', over: 'none' };
  const pm = _bodyMat(dna), sm = _m(dna.colors.secondary, dna);

  // ─ Top ───────────────────────────────────────────────────────────────
  if (o.top === 'tunic') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.5, 10), sm);
    m.position.y = 1.17; torso.add(m); ms.push(m);
  }
  if (o.top === 'robe_top') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.5, 10), sm);
    body.position.y = 1.17; torso.add(body); ms.push(body);
    const belt2 = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.055, 10), pm);
    belt2.position.y = 0.91; torso.add(belt2); ms.push(belt2);
  }
  if (o.top === 'armor_chest') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.44, 0.21), _m(0x8090a0, dna, { metalness: 0.5, roughness: 0.3 }));
    plate.position.y = 1.29; torso.add(plate); ms.push(plate);
    for (const s of [-1, 1] as const) {
      const spd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), _m(0x8090a0, dna, { metalness: 0.5, roughness: 0.3 }));
      spd.position.set(s * 0.32, 1.5, 0); torso.add(spd); ms.push(spd);
    }
  }
  if (o.top === 'wrap') {
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.055, 10, 1, true),
        _m(0xe8dcc8, dna, { roughness: 0.9, clearcoat: 0 }));
      ring.position.y = 1.08 + i * 0.12; torso.add(ring); ms.push(ring);
    }
  }

  // ─ Legs ──────────────────────────────────────────────────────────────
  if (o.legs === 'trousers') {
    // Trouser legs: from hip (y=0.70) to near feet (y=0.04), hip joint width
    for (const s of [-1, 1] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.090, 0.66, 8), sm);
      leg.position.set(s * 0.13, 0.37, 0); torso.add(leg); ms.push(leg);
    }
  }
  if (o.legs === 'skirt') {
    // Top at belt level (y=1.06), bottom at mid-thigh (y=-0.10)
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.50, 1.16, 10), sm);
    skirt.position.y = 0.54; torso.add(skirt); ms.push(skirt);
  }
  if (o.legs === 'shorts') {
    // Shorts: wrap around hip level (y=0.42 to y=0.70)
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.28, 10), sm);
    shorts.position.y = 0.56; torso.add(shorts); ms.push(shorts);
  }
  if (o.legs === 'loincloth') {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.03), sm);
    front.position.set(0, 0.52, 0.17); torso.add(front); ms.push(front);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.03), sm);
    back.position.set(0, 0.54, -0.15); torso.add(back); ms.push(back);
  }
  if (o.legs === 'robe_skirt') {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.52, 1.08, 10), sm);
    skirt.position.y = 0.58; torso.add(skirt); ms.push(skirt);
    const belt3 = new THREE.Mesh(new THREE.CylinderGeometry(0.248, 0.248, 0.058, 10), pm);
    belt3.position.y = 1.05; torso.add(belt3); ms.push(belt3);
  }

  // ─ Over ──────────────────────────────────────────────────────────────
  if (o.over === 'robe_full') {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.48, 1.12, 10), sm);
    skirt.position.y = 0.56; torso.add(skirt); ms.push(skirt);
    const belt4 = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 10), pm);
    belt4.position.y = 1.07; torso.add(belt4); ms.push(belt4);
  }
  if (o.over === 'cape') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.38, 0); shape.lineTo(0.38, 0);
    shape.lineTo(0.44, -0.92); shape.lineTo(0, -1.04); shape.lineTo(-0.44, -0.92);
    shape.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(dna.colors.secondary), emissive: new THREE.Color(dna.colors.emissive),
      emissiveIntensity: dna.colors.emissiveIntensity * 0.4,
      roughness: 0.88, metalness: 0, clearcoat: 0.1, side: THREE.DoubleSide,
    }));
    m.position.set(0, 1.52, -0.26); m.rotation.x = 0.16; torso.add(m); ms.push(m);
  }
  if (o.over === 'cloak') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.33, 0); shape.lineTo(0.33, 0);
    shape.lineTo(0.37, -0.74); shape.lineTo(0, -0.84); shape.lineTo(-0.37, -0.74);
    shape.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(dna.colors.secondary), emissive: new THREE.Color(dna.colors.emissive),
      emissiveIntensity: dna.colors.emissiveIntensity * 0.4,
      roughness: 0.88, metalness: 0, clearcoat: 0.1, side: THREE.DoubleSide,
    }));
    m.position.set(0, 1.52, -0.24); m.rotation.x = 0.13; torso.add(m); ms.push(m);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(dna.colors.secondary), roughness: 0.88, metalness: 0, clearcoat: 0.1 }));
    hood.position.set(0, 1.73, -0.06); hood.rotation.x = 0.3; torso.add(hood); ms.push(hood);
  }

  // ── CC-11: LatheGeometry garments ─────────────────────────────────────
  if (o.top === 'dress_flared') {
    const pts = dressFlaredProfile(1.08, 0.16, 0.32, 0.10);
    const geo = new THREE.LatheGeometry(pts, 12);
    const dress = new THREE.Mesh(geo, sm);
    dress.position.y = 0.56; torso.add(dress); ms.push(dress);
  }
  if (o.top === 'dress_layered') {
    const pts = robeLayeredProfile(1.04, 0.22);
    const geo = new THREE.LatheGeometry(pts, 12);
    const robe = new THREE.Mesh(geo, sm);
    robe.position.y = 0.60; torso.add(robe); ms.push(robe);
  }
  if (o.legs === 'skirt_gathered') {
    const pts = addHemFolds(skirtGatheredProfile(0.56, 0.24), 6, 0.028);
    const geo = new THREE.LatheGeometry(pts, 12);
    const skirt = new THREE.Mesh(geo, sm);
    skirt.position.y = 0.58; torso.add(skirt); ms.push(skirt);
  }
  if (o.legs === 'skirt_long') {
    const pts = dressFlaredProfile(0.90, 0.22, 0.34, 0.06);
    const geo = new THREE.LatheGeometry(pts, 12);
    const skirt = new THREE.Mesh(geo, sm);
    skirt.position.y = 0.56; torso.add(skirt); ms.push(skirt);
  }
  if (o.over === 'robe_layered') {
    const pts = robeLayeredProfile(1.12, 0.24);
    const geo = new THREE.LatheGeometry(pts, 12);
    const robe = new THREE.Mesh(geo, sm);
    robe.position.y = 0.56; torso.add(robe); ms.push(robe);
  }
}
// ── Biped ─────────────────────────────────────────────────────────────────────

function _biped(dna: CreatureDNA): CreatureRig {
  const ms: THREE.Mesh[] = [], bones: CreatureBones = {};
  const p = dna.proportions;
  const [tx, ty] = p.torso;
  const pm = _bodyMat(dna), sm = _m(dna.colors.secondary, dna);

  const root = new THREE.Group();
  root.scale.setScalar(p.global);

  const torso = new THREE.Group();
  bones.torso = torso; root.add(torso);

  // CC-3 morph scalars
  const sw = p.shoulderWidth  ?? 1.0;
  const hw = p.hipWidth       ?? 1.0;
  const bz = p.bellySize      ?? 0.0;
  const nt = p.neckThickness  ?? 1.0;

  // Body cylinder (chest / upper torso)
  const body = new THREE.Mesh(_wobble(new THREE.CylinderGeometry(0.19 * tx * sw, 0.245 * tx * hw, 0.52 * ty, 10), 0.014, dna, 2), pm);
  body.position.y = 1.38 * ty; torso.add(body); ms.push(body);
  if (bz > 0.3) {
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.19 * tx * bz, 8, 6), pm);
    belly.scale.z = 1.35; belly.position.set(0, 1.18 * ty, 0.09); torso.add(belly); ms.push(belly);
  }
  // Pelvis — compact waist-to-hip connector (hip joints now raised to 0.70*ty)
  const pelvis = new THREE.Mesh(_wobble(new THREE.CylinderGeometry(0.245 * tx * hw, 0.21 * tx * hw, 0.42 * ty, 10), 0.014, dna, 3), pm);
  pelvis.position.y = 0.91 * ty; torso.add(pelvis); ms.push(pelvis);

  // Legacy props
  _props(dna.props, undefined, torso, dna, ms);

  // Arms
  for (const s of [-1, 1] as const) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.31 * tx * sw, 1.44 * ty, 0); sh.rotation.z = s * 0.25;
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
  const neckM = new THREE.Mesh(_wobble(new THREE.CylinderGeometry(0.07 * nt, 0.085 * nt, 0.13 * p.neckLength, 8), 0.008, dna, 4), pm);
  neck.add(neckM); ms.push(neckM);

  const head = new THREE.Group();
  head.position.y = 0.065 + 0.22 * p.headSize; bones.head = head; neck.add(head);
  // Sub-race head scale modifier
  const srDef = (dna.subRace && dna.subRace !== 'none') ? SUBRACE_DEFS[dna.subRace] : null;
  const headScale = srDef?.headStyle === 'large' ? 1.18 : srDef?.headStyle === 'small' ? 0.82 : srDef?.headStyle === 'elongated' ? 1.0 : 1.0;
  head.scale.setScalar(headScale);
  const hm = new THREE.Mesh(_wobble(_headgeo(dna.face.type, p.headSize), 0.018, dna, 1), pm); head.add(hm); ms.push(hm);
  const { tex, plane } = _faceplane(dna, p.headSize);
  head.add(plane); ms.push(plane);
  // Sub-race ears
  _ears(srDef?.earShape ?? 'round', p.headSize, head, sm, ms);

  _props(dna.props, head, undefined, dna, ms);

  // CC-12: SDF seam meshes — smooth-blend the neck→torso and head→neck joints
  {
    const neckBaseY  = 1.62 * ty;                        // neck group position (= neckM centre)
    const torsoTopY  = 1.38 * ty;                        // torso body cylinder centre
    const headCentreY = neckBaseY + 0.065 + 0.22 * p.headSize; // head group in torso space
    const neckTopY   = neckBaseY + 0.065 * p.neckLength; // top cap of neckM

    const seamNT = new THREE.Mesh(
      buildSeamMesh(
        { x: 0, y: neckBaseY,  z: 0 }, { x: 0, y: torsoTopY,   z: 0 },
        0.085 * nt, 0.19 * tx * sw, { blendK: 0.20 },
      ), pm,
    );
    torso.add(seamNT); ms.push(seamNT);

    const seamHN = new THREE.Mesh(
      buildSeamMesh(
        { x: 0, y: neckTopY,   z: 0 }, { x: 0, y: headCentreY, z: 0 },
        0.07 * nt, p.headSize * 0.40, { blendK: 0.18 },
      ), pm,
    );
    torso.add(seamHN); ms.push(seamHN);
  }

  // Legs — hidden when a full-length over garment or skirt is worn
  const _ot = (dna as any).outfit ?? { top: 'none', legs: 'none', over: 'none' };
  const _hideLegs = dna.props.includes('robe') || _ot.over === 'robe_full' || _ot.over === 'robe_layered' || _ot.legs === 'robe_skirt' || _ot.legs === 'skirt' || _ot.top === 'dress_flared' || _ot.top === 'dress_layered';
  const legLL = p.legLength ?? 1.0;
  if (!_hideLegs) {
    // Two-bone chain: thigh (L1) + knee group + shin (L2) + foot.
    // L1 + L2 = 0.66*legLL — same total reach as the old single-bone leg.
    const L1_leg = 0.32 * legLL;  // thigh
    const L2_leg = 0.34 * legLL;  // shin
    for (const s of [-1, 1] as const) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13 * tx * hw, 0.70 * ty, 0);
      // Upper leg (thigh)
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.082 * p.limbWidth, 0.070 * p.limbWidth, L1_leg, 7), sm);
      thigh.position.y = -L1_leg / 2; hip.add(thigh); ms.push(thigh);
      // Knee group (pivot at bottom of thigh)
      const kneeGroup = new THREE.Group();
      kneeGroup.position.y = -L1_leg;
      hip.add(kneeGroup);
      if (s === -1) bones.legLKnee = kneeGroup; else bones.legRKnee = kneeGroup;
      // Shin
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.070 * p.limbWidth, 0.058 * p.limbWidth, L2_leg, 7), sm);
      shin.position.y = -L2_leg / 2; kneeGroup.add(shin); ms.push(shin);
      // Foot
      const footGeo = new THREE.SphereGeometry(0.09 * p.limbWidth, 6, 4);
      footGeo.scale(1.5, 0.55, 1.9);
      const foot = new THREE.Mesh(footGeo, pm);
      foot.position.set(0.02, -L2_leg, 0.04); kneeGroup.add(foot); ms.push(foot);
      torso.add(hip);
      if (s === -1) bones.legL = hip; else bones.legR = hip;
    }
  }

  // Outfit (top / legs / over clothing layer)
  _outfit(dna, torso, ms);

  return { root, bones, faceTex: tex, dispose: _free(ms, [tex]) };
}

// ── Quadruped ─────────────────────────────────────────────────────────────────

function _quad(dna: CreatureDNA): CreatureRig {
  const ms: THREE.Mesh[] = [], bones: CreatureBones = {};
  const p = dna.proportions;
  const [tx, , tz] = p.torso;
  const pm = _bodyMat(dna), sm = _m(dna.colors.secondary, dna);

  const root  = new THREE.Group(); root.scale.setScalar(p.global);
  const torso = new THREE.Group(); torso.position.y = 0.95; bones.torso = torso; root.add(torso);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35 * tx, 0.7 * tz, 8, 10), pm);
  body.rotation.x = Math.PI / 2; torso.add(body); ms.push(body);

  const legDefs = [
    { x: -0.28 * tx, z:  0.4 * tz, k: 'frontLegL' as const, kk: 'frontLegLKnee' as const },
    { x:  0.28 * tx, z:  0.4 * tz, k: 'frontLegR' as const, kk: 'frontLegRKnee' as const },
    { x: -0.28 * tx, z: -0.4 * tz, k: 'backLegL'  as const, kk: 'backLegLKnee'  as const },
    { x:  0.28 * tx, z: -0.4 * tz, k: 'backLegR'  as const, kk: 'backLegRKnee'  as const },
  ];
  // Two-bone leg chain: upper (hip→knee) + lower (knee→paw).
  // L1 + L2 = 0.52 * limbLength — same total reach as the old single-bone leg.
  const L1 = 0.27 * p.limbLength;  // upper leg (thigh / humerus)
  const L2 = 0.25 * p.limbLength;  // lower leg (shin / radius)
  for (const d of legDefs) {
    const hip = new THREE.Group(); hip.position.set(d.x, -0.1, d.z);
    torso.add(hip); bones[d.k] = hip;

    // Upper leg
    const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.080 * p.limbWidth, 0.068 * p.limbWidth, L1, 7), sm);
    upperLeg.position.y = -L1 / 2; hip.add(upperLeg); ms.push(upperLeg);

    // Knee group (pivot at bottom of upper leg)
    const kneeGroup = new THREE.Group(); kneeGroup.position.y = -L1;
    hip.add(kneeGroup); bones[d.kk] = kneeGroup;

    // Lower leg
    const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * p.limbWidth, 0.055 * p.limbWidth, L2, 7), sm);
    lowerLeg.position.y = -L2 / 2; kneeGroup.add(lowerLeg); ms.push(lowerLeg);

    // Paw (paw center at -L2 in knee-local = -(L1+L2) = -0.52*ll in hip-local)
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.1 * p.limbWidth, 7, 5), pm);
    paw.position.y = -L2; paw.scale.set(1.3, 0.65, 1.5); kneeGroup.add(paw); ms.push(paw);
  }

  const neck = new THREE.Group(); neck.position.set(0, 0.3, 0.5 * tz); neck.rotation.x = -0.7;
  bones.neck = neck; torso.add(neck);
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.38 * p.neckLength, 8), pm);
  neckM.position.y = 0.19 * p.neckLength; neck.add(neckM); ms.push(neckM);

  const head = new THREE.Group(); head.position.y = 0.38 * p.neckLength; bones.head = head; neck.add(head);
  const hm = new THREE.Mesh(_headgeo(dna.face.type, p.headSize * 0.88), pm); head.add(hm); ms.push(hm);
  const { tex, plane } = _faceplane(dna, p.headSize * 0.88); head.add(plane); ms.push(plane);

  if (p.tailLength > 0) {
    const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.45 * tz); tail.rotation.x = -1.0;
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
  const pm = _bodyMat(dna), sm2 = _m(dna.colors.secondary, dna);

  const root  = new THREE.Group(); root.scale.setScalar(p.global);
  const torso = new THREE.Group(); torso.position.y = 0.7; bones.torso = torso; root.add(torso);

  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * p.headSize, 2), pm);
  blob.scale.set(p.torso[0], p.torso[1], p.torso[2]); torso.add(blob); ms.push(blob);

  // Face plane: place just outside blob surface (blob z-extent = 0.5 * headSize * torso[2])
  const head = new THREE.Group(); head.position.z = 0.52 * p.headSize * p.torso[2] + 0.04; bones.head = head; torso.add(head);
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
  const pm = _bodyMat(dna);

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

// Flat snake: all segments lie horizontal. Head is raised; body & tail hug the ground.
// Chained parent-child layout so rotation.y on each segment animates as a lateral body wave.
// Segment spacing used by both the builder and SnakeLocomotion — must match.
const SNAKE_SEGMENT_SPACING = 0.30;

function _serpent(dna: CreatureDNA): CreatureRig {
  const ms: THREE.Mesh[] = [], bones: CreatureBones = { segments: [] };
  const p  = dna.proportions;
  const pm = _bodyMat(dna), sm = _m(dna.colors.secondary, dna);

  const root = new THREE.Group(); root.scale.setScalar(p.global);
  const n    = Math.round(Math.max(5, Math.min(14, p.segmentCount)));

  // ── Flat segment hierarchy ────────────────────────────────────────────────
  //  All segments are DIRECT children of root (not a parent→child chain).
  //  SnakeLocomotion.update() drives their positions each frame via the
  //  follow-en-trail algorithm, so initial positions are just a straight line.
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = Math.max(0.035, (0.26 - t * 0.16) * p.torso[0]);
    const g = new THREE.Group();

    // Initial resting position: straight line along -Z from root
    g.position.set(0, 0, -i * SNAKE_SEGMENT_SPACING);

    // Capsule mesh: long axis along Z (x-rotation of 90°), elevated above ground
    const bodyY = 0.13 - t * 0.06;   // head/neck higher, tail lower
    const seg   = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.26, 5, 8), i % 2 ? sm : pm);
    seg.rotation.x = Math.PI / 2;
    seg.position.y = bodyY;

    g.add(seg); root.add(g);   // FLAT — all direct children of root
    bones.segments!.push(g); ms.push(seg);
    if (i === 0) bones.torso = g;
  }

  // Head on first segment — nose tilts upward (snake raising its head)
  const headNeck = new THREE.Group();
  headNeck.position.y = 0.40;   // elevated above the capsule body
  headNeck.rotation.x = 0.25;   // face tilts slightly skyward
  bones.segments![0].add(headNeck);

  const head = new THREE.Group(); bones.head = head;
  const hm   = new THREE.Mesh(_headgeo(dna.face.type, p.headSize * 0.80), pm);
  head.add(hm); ms.push(hm);
  const { tex, plane } = _faceplane(dna, p.headSize * 0.80);
  head.add(plane); ms.push(plane);
  headNeck.add(head);

  _props(dna.props, head, bones.torso, dna, ms);

  const snakeLoco = new SnakeLocomotion(n, SNAKE_SEGMENT_SPACING);
  return { root, bones, faceTex: tex, snakeLoco, dispose: _free(ms, [tex]) };
}
