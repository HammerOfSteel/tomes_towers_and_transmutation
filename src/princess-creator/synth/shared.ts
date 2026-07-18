// ── Shared chibi scaffold: proportions, rig tree, sockets, dresses ──────────
//
//  All four archetypes are built on this grammar (2.5-head chibi, pivot-at-
//  joint groups, 9 sockets) so the Animator and parts system stay
//  archetype-agnostic. Numbers are ported from the POC set and normalized.

import * as THREE from 'three';
import type { PrincessDNA } from '../types';
import type { MaterialKit } from '../materials';
import type { BuildResult, PrincessRig, Proportions, Sockets } from './contracts';

export function computeProportions(dna: PrincessDNA): Proportions {
  const b = dna.body;
  const headR = 2.42 * b.headSize;
  const dressH = 4.6 * dna.dress.length;
  const chub = b.chubbiness;
  const legUpper = 1.9 * b.legLength;
  const legLower = 1.6 * b.legLength;
  const hipY = -1.5;
  return {
    headR,
    dressH,
    hemR: 2.9 * dna.dress.flare * (0.82 + 0.18 * b.hipWidth),
    topR: 1.05 * (0.7 + 0.3 * chub),
    shoulderX: 1.55 * b.shoulderWidth * (0.85 + 0.15 * chub),
    shoulderY: 0.55,
    armUpper: 1.35 * b.armLength,
    armLower: 1.25 * b.armLength,
    armThick: 0.26 * chub,
    hipX: 0.72 * b.hipWidth,
    hipY,
    legUpper,
    legLower,
    legThick: 0.33 * chub,
    neckY: 0.95,
    headCY: 0.95 + headR * 0.98,
    baseY: -hipY + legUpper + legLower + 0.45,
  };
}

export interface Scaffold {
  characterGroup: THREE.Group;  // BuildResult.root (scaled by dna.body.height)
  rig: PrincessRig;
  sockets: Sockets;
}

/**
 * Builds the joint tree + sockets. Synths add meshes into the joint groups.
 *
 *   characterGroup (scale=height)
 *     └ root (y = baseY)
 *        └ torso
 *           ├ neck ─ headPivot(@headCY) ─ [head meshes, head sockets]
 *           ├ shoulderL/R ─ elbowL/R ─ [handL/R sockets]
 *           └ hipL/R ─ kneeL/R
 */
export function makeScaffold(dna: PrincessDNA, p: Proportions): Scaffold {
  const characterGroup = new THREE.Group();
  characterGroup.name = 'princess';
  characterGroup.scale.setScalar(dna.body.height);

  const root = new THREE.Group();
  root.name = 'rigRoot';
  root.position.y = p.baseY;
  characterGroup.add(root);

  const torso = new THREE.Group();
  torso.name = 'torso';
  root.add(torso);

  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.y = p.neckY;
  torso.add(neck);

  const headPivot = new THREE.Group();
  headPivot.name = 'head';
  headPivot.position.y = p.headCY - p.neckY;
  neck.add(headPivot);

  const mkPair = (name: string, x: number, y: number, parent: THREE.Object3D): [THREE.Group, THREE.Group] => {
    const l = new THREE.Group();
    l.name = `${name}L`;
    l.position.set(x, y, 0);
    const r = new THREE.Group();
    r.name = `${name}R`;
    r.position.set(-x, y, 0);
    parent.add(l, r);
    return [l, r];
  };

  const shoulders = mkPair('shoulder', p.shoulderX, p.shoulderY, torso);
  const elbows: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  elbows.forEach((e, i) => {
    e.name = i === 0 ? 'elbowL' : 'elbowR';
    e.position.y = -p.armUpper;
    shoulders[i].add(e);
  });
  const hips = mkPair('hip', p.hipX, p.hipY, torso);
  const knees: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  knees.forEach((k, i) => {
    k.name = i === 0 ? 'kneeL' : 'kneeR';
    k.position.y = -p.legUpper;
    hips[i].add(k);
  });

  const socket = (name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
    const s = new THREE.Group();
    s.name = `socket:${name}`;
    s.position.set(x, y, z);
    parent.add(s);
    return s;
  };

  const sockets: Sockets = {
    headTop: socket('headTop', headPivot, 0, p.headR * 0.92, 0),
    earL: socket('earL', headPivot, p.headR * 0.6, p.headR * 0.62, -0.1),
    earR: socket('earR', headPivot, -p.headR * 0.6, p.headR * 0.62, -0.1),
    hairBack: socket('hairBack', headPivot, 0, p.headR * 0.25, -p.headR * 0.35),
    face: socket('face', headPivot, 0, 0, 0),
    back: socket('back', torso, 0, 0.1, -p.topR - 0.55),
    tail: socket('tail', torso, 0, p.hipY - 0.35, -p.hemR * 0.72),
    handL: socket('handL', elbows[0], 0, -p.armLower - 0.2, 0.1),
    handR: socket('handR', elbows[1], 0, -p.armLower - 0.2, 0.1),
  };

  const rig: PrincessRig = {
    root, torso, neck, head: headPivot, shoulders, elbows, hips, knees, baseY: p.baseY,
  };

  return { characterGroup, rig, sockets };
}

/** Limb segment with the pivot at the joint (mesh offset downward). */
export function limbPart(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  yOffset: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = yOffset;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Dress builder shared by all mesh archetypes. Returns group at torso origin. */
export function buildDress(dna: PrincessDNA, kit: MaterialKit, p: Proportions): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dress';
  const style = dna.dress.style;
  const seg = kit.flat ? (style === 'hex' ? 6 : 8) : 32;
  const h = p.dressH;

  if (style === 'bell') {
    const geo = new THREE.ConeGeometry(p.hemR, h, seg);
    const m = shadowed(new THREE.Mesh(geo, kit.primary));
    m.position.y = -h / 2 + 0.9;
    g.add(m);
  } else if (style === 'layered') {
    const layers = 3;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const r = THREE.MathUtils.lerp(p.hemR * 0.55, p.hemR, t);
      const lh = h * 0.45;
      const geo = new THREE.ConeGeometry(r, lh, seg);
      const m = shadowed(new THREE.Mesh(geo, i % 2 === 0 ? kit.primary : kit.secondary));
      m.position.y = 0.9 - lh / 2 - t * (h - lh);
      g.add(m);
    }
  } else {
    // hex / aline / slim are all tapered cylinders with different profiles.
    const profiles: Record<string, [number, number]> = {
      hex: [p.topR * 1.15, p.hemR * 0.86],
      aline: [p.topR, p.hemR],
      slim: [p.topR, p.topR * 1.35],
    };
    const [top, hem] = profiles[style];
    const geo = new THREE.CylinderGeometry(top, hem, h, seg);
    const m = shadowed(new THREE.Mesh(geo, kit.primary));
    m.position.y = -h / 2 + 0.9;
    g.add(m);
  }

  const hemY = 0.9 - h + (style === 'slim' ? 0.15 : 0);
  const hemR = style === 'slim' ? p.topR * 1.35 : (style === 'hex' ? p.hemR * 0.86 : p.hemR);

  if (dna.dress.trim) {
    const trimGeo = new THREE.TorusGeometry(hemR * 0.98, 0.16, kit.flat ? 4 : 12, seg);
    trimGeo.rotateX(Math.PI / 2);
    const trim = shadowed(new THREE.Mesh(trimGeo, kit.secondary));
    trim.position.y = hemY + 0.1;
    g.add(trim);
  }
  if (dna.dress.sash) {
    const sashGeo = new THREE.CylinderGeometry(p.topR * 1.12, p.topR * 1.18, 0.45, seg);
    const sash = shadowed(new THREE.Mesh(sashGeo, kit.accent));
    sash.position.y = 0.35;
    g.add(sash);
  }
  return g;
}

/** Puffy shoulder sleeves (human & optional fox). */
export function addPuffSleeves(kit: MaterialKit, p: Proportions, rig: PrincessRig): void {
  for (const shoulder of rig.shoulders) {
    const geo = new THREE.SphereGeometry(0.62 + p.armThick * 0.6, kit.flat ? 8 : 16, kit.flat ? 6 : 12);
    const puff = shadowed(new THREE.Mesh(geo, kit.secondary));
    puff.scale.set(1, 1.15, 1);
    shoulder.add(puff);
  }
}

/** Dispose every geometry under root (materials are kit-owned; skipped). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && !obj.userData.noDispose && mesh.geometry) {
      mesh.geometry.dispose();
    }
  });
}

/** Standard BuildResult assembly used by the mesh synths. */
export function makeResult(
  scaffold: Scaffold,
  p: Proportions,
  update: (t: number, dt: number) => void,
  extraDispose?: () => void,
): BuildResult {
  const hooks: BuildResult['hooks'] = { tick: [], disposers: [] };
  return {
    root: scaffold.characterGroup,
    rig: scaffold.rig,
    sockets: scaffold.sockets,
    proportions: p,
    hooks,
    update(t, dt) {
      update(t, dt);
      for (const fn of hooks.tick) fn(t, dt);
    },
    dispose() {
      disposeTree(scaffold.characterGroup);
      for (const fn of hooks.disposers) fn();
      extraDispose?.();
    },
  };
}
