// ── CreatureBuilder ──────────────────────────────────────────────────────────
//
//  Builds a Three.js Group hierarchy (FK rig) from a CreatureDNA.
//  MeshPhysicalMaterial gives the "3DS plastic toy" clearcoat look.
//  All geometry is procedural — no asset files loaded.

import * as THREE from 'three';
import type { CreatureDNA, PropId, EarShape } from './CreatureDNA';
import { SUBRACE_DEFS } from './CreatureDNA';
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
// ── Outfit ────────────────────────────────────────────────────────────────────────────────

function _outfit(dna: CreatureDNA, torso: THREE.Group, ms: THREE.Mesh[]): void {
  const o = (dna as any).outfit ?? { top: 'none', legs: 'none', over: 'none' };
  const pm = _m(dna.colors.primary, dna), sm = _m(dna.colors.secondary, dna);

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
    for (const s of [-1, 1] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.088, 0.46, 8), sm);
      leg.position.set(s * 0.13, -0.25, 0); torso.add(leg); ms.push(leg);
    }
  }
  if (o.legs === 'skirt') {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 0.58, 10), sm);
    skirt.position.y = -0.06; torso.add(skirt); ms.push(skirt);
  }
  if (o.legs === 'shorts') {
    for (const s of [-1, 1] as const) {
      const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.22, 8), sm);
      s2.position.set(s * 0.12, -0.14, 0); torso.add(s2); ms.push(s2);
    }
  }
  if (o.legs === 'loincloth') {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.28, 0.03), sm);
    front.position.set(0, -0.19, 0.15); torso.add(front); ms.push(front);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.03), sm);
    back.position.set(0, -0.17, -0.14); torso.add(back); ms.push(back);
  }
  if (o.legs === 'robe_skirt') {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.52, 1.08, 10), sm);
    skirt.position.y = 0.52; torso.add(skirt); ms.push(skirt);
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

  // CC-3 morph scalars
  const sw = p.shoulderWidth  ?? 1.0;
  const hw = p.hipWidth       ?? 1.0;
  const bz = p.bellySize      ?? 0.0;
  const nt = p.neckThickness  ?? 1.0;

  // Body cylinder
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * tx * sw, 0.245 * tx * hw, 0.52 * ty, 10), pm);
  body.position.y = 1.38 * ty; torso.add(body); ms.push(body);
  if (bz > 0.3) {
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.19 * tx * bz, 8, 6), pm);
    belly.scale.z = 1.35; belly.position.set(0, 1.18 * ty, 0.09); torso.add(belly); ms.push(belly);
  }

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
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * nt, 0.085 * nt, 0.13 * p.neckLength, 8), pm);
  neck.add(neckM); ms.push(neckM);

  const head = new THREE.Group();
  head.position.y = 0.065 + 0.22 * p.headSize; bones.head = head; neck.add(head);
  // Sub-race head scale modifier
  const srDef = (dna.subRace && dna.subRace !== 'none') ? SUBRACE_DEFS[dna.subRace] : null;
  const headScale = srDef?.headStyle === 'large' ? 1.18 : srDef?.headStyle === 'small' ? 0.82 : srDef?.headStyle === 'elongated' ? 1.0 : 1.0;
  head.scale.setScalar(headScale);
  const hm = new THREE.Mesh(_headgeo(dna.face.type, p.headSize), pm); head.add(hm); ms.push(hm);
  const { tex, plane } = _faceplane(dna, p.headSize);
  head.add(plane); ms.push(plane);
  // Sub-race ears
  _ears(srDef?.earShape ?? 'round', p.headSize, head, sm, ms);

  _props(dna.props, head, undefined, dna, ms);

  // Legs — hidden when a full-length over garment or skirt is worn
  const _ot = (dna as any).outfit ?? { top: 'none', legs: 'none', over: 'none' };
  const _hideLegs = dna.props.includes('robe') || _ot.over === 'robe_full' || _ot.legs === 'robe_skirt' || _ot.legs === 'skirt';
  if (!_hideLegs) {
    for (const s of [-1, 1] as const) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13 * tx * hw, 0.02, 0);
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

  // Outfit (top / legs / over clothing layer)
  _outfit(dna, torso, ms);

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
