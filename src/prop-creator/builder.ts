/**
 * builder.ts — PROC-B3b/c
 *
 * `buildProp(dna)` → THREE.Group + PropCollisionMeta
 *
 * 12 prop archetypes built from primitive THREE.js geometry.
 * No external assets required — fully procedural.
 *
 * Called by BOTH atelier preview AND PropPlacer at room-load time.
 */

import * as THREE from 'three';
import type { PropDNA, PropKind, PropCollisionMeta } from './types';
import { MATERIAL_COLORS, KIND_SOLID } from './types';
import type { BuiltEntity } from '@/procedural/builder/BaseBuilder';

// ── Public contract ───────────────────────────────────────────────────────────

export interface BuiltProp extends BuiltEntity<PropDNA> {
  /** Collision metadata for physics registration. */
  collision: PropCollisionMeta;
  /** Optional point light (lanterns, glowing crystals). */
  light: THREE.PointLight | null;
}

// ── Material factory ──────────────────────────────────────────────────────────

function makeMat(hex: string, emissive?: string, emissiveIntensity = 0.4): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
  if (emissive) {
    mat.emissive = new THREE.Color(emissive);
    mat.emissiveIntensity = emissiveIntensity;
  }
  return mat;
}

function makeWire(hex: string): THREE.LineSegments {
  // thin edge overlay for definition
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(hex), transparent: true, opacity: 0.3 });
  return new THREE.LineSegments(geo, mat);
}

// ── Archetype builders ────────────────────────────────────────────────────────

type ArchetypeResult = { root: THREE.Group; collision: PropCollisionMeta; light: THREE.PointLight | null };

function buildChest(dna: PropDNA): ArchetypeResult {
  const g    = new THREE.Group();
  const base = makeMat(dna.colors.base);
  const lid  = makeMat(dna.colors.detail);
  const lock = makeMat(dna.colors.detail);

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), base);
  bodyMesh.position.y = 0.2;
  const lidMesh  = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.5), lid);
  lidMesh.position.y = 0.47;
  const lockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), lock);
  lockMesh.position.set(0, 0.42, 0.27);

  g.add(bodyMesh, lidMesh, lockMesh);
  return { root: g, light: null, collision: { halfExtents: { x: 0.35, y: 0.25, z: 0.25 }, offset: { x: 0, y: 0.25, z: 0 }, solid: true, interactRadius: dna.interactive ? 1.2 : undefined } };
}

function buildBookshelf(dna: PropDNA): ArchetypeResult {
  const g    = new THREE.Group();
  const wood = makeMat(dna.colors.base);
  const book1 = makeMat('#8b1a1a');
  const book2 = makeMat('#1a3d8b');
  const book3 = makeMat('#2a7a2a');

  // Frame
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.25), wood);
  frame.position.y = 0.9;
  g.add(frame);
  // 3 shelves
  const shelfMat = makeMat(dna.colors.detail);
  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.22), shelfMat);
    shelf.position.set(0, 0.4 + i * 0.55, 0);
    g.add(shelf);
    // Books on each shelf
    const books = [book1, book2, book3];
    for (let b = 0; b < 5; b++) {
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.18), books[b % 3]);
      bk.position.set(-0.3 + b * 0.15, 0.54 + i * 0.55, 0);
      g.add(bk);
    }
  }
  return { root: g, light: null, collision: { halfExtents: { x: 0.4, y: 0.9, z: 0.13 }, offset: { x: 0, y: 0.9, z: 0 }, solid: true } };
}

function buildTable(dna: PropDNA): ArchetypeResult {
  const g   = new THREE.Group();
  const mat = makeMat(dna.colors.base);
  const leg = makeMat(dna.colors.detail);

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.7), mat);
  top.position.y = 0.75;
  g.add(top);
  for (const [lx, lz] of [[0.52, 0.28], [-0.52, 0.28], [0.52, -0.28], [-0.52, -0.28]] as [number, number][]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), leg);
    l.position.set(lx, 0.37, lz);
    g.add(l);
  }
  return { root: g, light: null, collision: { halfExtents: { x: 0.6, y: 0.38, z: 0.35 }, offset: { x: 0, y: 0.38, z: 0 }, solid: true } };
}

function buildChair(dna: PropDNA): ArchetypeResult {
  const g   = new THREE.Group();
  const mat = makeMat(dna.colors.base);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), mat);
  seat.position.y = 0.45;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.05), mat);
  back.position.set(0, 0.78, -0.2);
  g.add(seat, back);
  for (const [lx, lz] of [[0.18, 0.18], [-0.18, 0.18], [0.18, -0.18], [-0.18, -0.18]] as [number, number][]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), mat);
    l.position.set(lx, 0.22, lz);
    g.add(l);
  }
  return { root: g, light: null, collision: { halfExtents: { x: 0.23, y: 0.39, z: 0.23 }, offset: { x: 0, y: 0.39, z: 0 }, solid: true } };
}

function buildCauldron(dna: PropDNA): ArchetypeResult {
  const g   = new THREE.Group();
  const mat = makeMat(dna.colors.base, dna.glow ? (dna.colors.glow ?? '#40ff80') : undefined, 0.35);
  const rim = makeMat(dna.colors.detail);

  // Sphere-ish body using scaled icosahedron
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), mat);
  body.scale.y = 0.8;
  body.position.y = 0.35;
  // Rim
  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 12), rim);
  rimMesh.position.y = 0.62;
  rimMesh.rotation.x = Math.PI / 2;
  // 3 stubby legs
  const legMat = makeMat(dna.colors.detail);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 5), legMat);
    l.position.set(Math.cos(a) * 0.28, 0.07, Math.sin(a) * 0.28);
    g.add(l);
  }
  g.add(body, rimMesh);

  let light: THREE.PointLight | null = null;
  if (dna.glow) {
    light = new THREE.PointLight(new THREE.Color(dna.colors.glow ?? '#40ff80'), 0.8, 3);
    light.position.set(0, 0.8, 0);
    g.add(light);
  }
  return { root: g, light, collision: { halfExtents: { x: 0.38, y: 0.32, z: 0.38 }, offset: { x: 0, y: 0.32, z: 0 }, solid: true } };
}

function buildLantern(dna: PropDNA): ArchetypeResult {
  const g      = new THREE.Group();
  const frame  = makeMat(dna.colors.base);
  const glass  = makeMat(dna.colors.glow ?? '#ffdd80', dna.colors.glow ?? '#ffdd80', 0.8);

  const post   = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), frame);
  post.position.y = 0.6;
  const head   = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), glass);
  head.position.y = 1.28;
  const cap    = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.06, 6), frame);
  cap.position.y  = 1.42;
  g.add(post, head, cap);

  let light: THREE.PointLight | null = null;
  if (dna.glow) {
    light = new THREE.PointLight(new THREE.Color(dna.colors.glow ?? '#ffaa40'), 1.2, 5);
    light.position.y = 1.3;
    g.add(light);
  }
  return { root: g, light, collision: { halfExtents: { x: 0.1, y: 0.6, z: 0.1 }, offset: { x: 0, y: 0.6, z: 0 }, solid: false } };
}

function buildPillar(dna: PropDNA): ArchetypeResult {
  const g   = new THREE.Group();
  const mat = makeMat(dna.colors.base);
  const cap = makeMat(dna.colors.detail);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 2.2, 8), mat);
  shaft.position.y = 1.1;
  const base  = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.15, 8), cap);
  base.position.y  = 0.07;
  const top   = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.15, 8), cap);
  top.position.y   = 2.27;
  g.add(shaft, base, top);
  return { root: g, light: null, collision: { halfExtents: { x: 0.2, y: 1.1, z: 0.2 }, offset: { x: 0, y: 1.1, z: 0 }, solid: true } };
}

function buildRug(dna: PropDNA): ArchetypeResult {
  const g   = new THREE.Group();
  const mat = makeMat(dna.colors.base);
  const edg = makeMat(dna.colors.detail);
  const face = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.9), mat);
  face.position.y = 0.01;
  const border = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 1.1), edg);
  border.position.y = 0.005;
  g.add(border, face);
  return { root: g, light: null, collision: { halfExtents: { x: 0.8, y: 0.01, z: 0.55 }, offset: { x: 0, y: 0.01, z: 0 }, solid: false } };
}

function buildStatue(dna: PropDNA): ArchetypeResult {
  const g   = new THREE.Group();
  const mat = makeMat(dna.colors.base, dna.glow ? (dna.colors.glow ?? '#8080ff') : undefined, 0.2);
  // Simple blocky humanoid silhouette
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.2), mat);
  body.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), mat);
  head.position.y = 1.2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.35), makeMat(dna.colors.detail));
  base.position.y = 0.07;
  g.add(body, head, base);
  return { root: g, light: null, collision: { halfExtents: { x: 0.25, y: 0.6, z: 0.18 }, offset: { x: 0, y: 0.6, z: 0 }, solid: true } };
}

function buildBarrel(dna: PropDNA): ArchetypeResult {
  const g    = new THREE.Group();
  const body = makeMat(dna.colors.base);
  const ring = makeMat(dna.colors.detail);
  const cyl  = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.6, 8), body);
  cyl.position.y = 0.3;
  for (const ry of [0.12, 0.3, 0.48]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 5, 10), ring);
    r.rotation.x = Math.PI / 2;
    r.position.y = ry;
    g.add(r);
  }
  g.add(cyl);
  return { root: g, light: null, collision: { halfExtents: { x: 0.26, y: 0.3, z: 0.26 }, offset: { x: 0, y: 0.3, z: 0 }, solid: true } };
}

function buildCrate(dna: PropDNA): ArchetypeResult {
  const g    = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), makeMat(dna.colors.base));
  body.position.y = 0.25;
  const plankMat = makeMat(dna.colors.detail);
  for (const px of [-0.15, 0.15]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.5), plankMat);
    p.position.set(px, 0.25, 0);
    g.add(p);
  }
  for (const pz of [-0.12, 0.12]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.03), plankMat);
    p.position.set(0, 0.25, pz);
    g.add(p);
  }
  g.add(body);
  return { root: g, light: null, collision: { halfExtents: { x: 0.3, y: 0.25, z: 0.25 }, offset: { x: 0, y: 0.25, z: 0 }, solid: true } };
}

function buildDoor(dna: PropDNA): ArchetypeResult {
  const g    = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.1), makeMat(dna.colors.base));
  body.position.y = 1.05;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.06), makeMat(dna.colors.detail));
  frame.position.y = 1.1;
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5), makeMat(dna.colors.detail));
  handle.position.set(0.32, 1.05, 0.08);
  g.add(frame, body, handle);
  return { root: g, light: null, collision: { halfExtents: { x: 0.5, y: 1.1, z: 0.08 }, offset: { x: 0, y: 1.1, z: 0 }, solid: true, interactRadius: dna.interactive ? 1.5 : undefined } };
}

// ── Archetype dispatch ────────────────────────────────────────────────────────

const BUILDERS: Record<PropKind, (dna: PropDNA) => ArchetypeResult> = {
  chest:     buildChest,
  bookshelf: buildBookshelf,
  table:     buildTable,
  chair:     buildChair,
  cauldron:  buildCauldron,
  lantern:   buildLantern,
  pillar:    buildPillar,
  rug:       buildRug,
  door:      buildDoor,
  statue:    buildStatue,
  barrel:    buildBarrel,
  crate:     buildCrate,
};

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a procedural prop from a DNA blueprint.
 * Synchronous — no async imports needed (pure THREE.js geometry).
 */
export function buildProp(dna: PropDNA): BuiltProp {
  const builder = BUILDERS[dna.propKind];
  if (!builder) throw new Error(`[buildProp] unknown propKind: "${dna.propKind}"`);

  const { root, collision, light } = builder(dna);

  // Apply size scaling
  if (dna.size !== 1) root.scale.setScalar(dna.size);

  // Condition degradation — damaged/ruined props get a tint + slight rotation offset
  if (dna.condition === 'damaged' || dna.condition === 'ruined') {
    const tiltAmt = dna.condition === 'ruined' ? 0.25 : 0.08;
    root.rotation.z += (Math.random() - 0.5) * tiltAmt;
    root.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
        obj.material = obj.material.clone();
        (obj.material as THREE.MeshLambertMaterial).color.multiplyScalar(0.75);
      }
    });
  }

  root.userData['propDna']       = dna;
  root.userData['propKind']      = dna.propKind;
  root.userData['propInteractive'] = dna.interactive;
  root.userData['propTheme']     = dna.theme;

  return {
    root,
    dna,
    collision,
    light,
    update: () => {},   // props are static; add animation in future if needed
    dispose: () => {
      root.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else (obj.material as THREE.Material).dispose();
        }
      });
    },
  };
}
