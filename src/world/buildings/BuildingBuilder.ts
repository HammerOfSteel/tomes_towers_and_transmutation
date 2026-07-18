/**
 * BuildingBuilder.ts — PROC-C1c/d/e/f (upgraded)
 *
 * Full-quality building construction ported from hiraeth/stack-a.
 * MeshStandardMaterial + canvas textures, proper windows, doors, chimney pots.
 */

import * as THREE from 'three';
import type { BuildingDNA, BuildingKind } from './BuildingDNA';
import { SIZE_FOOTPRINT, FLOOR_HEIGHT, STYLE_COLORS, getFootprint } from './BuildingDNA';
import { pitchedRoof, hippedRoof, thatchedRoof } from './ModularSet';
import {
  stoneTexture, brickTexture, renderTexture,
  slateTexture, thatchTexture,
} from './TextureFactory';
import { mulberry32 } from '@/core/prng';

// ── Public contract ───────────────────────────────────────────────────────────

export interface BuildingBounds {
  halfWidth: number; halfDepth: number; height: number;
}

export interface BuildingInstance {
  exteriorGroup: THREE.Group;
  bounds:        BuildingBounds;
  dna:           BuildingDNA;
  dispose():     void;
}

// ── Material factories ────────────────────────────────────────────────────────

function wallStd(dna: BuildingDNA, w: number, d: number): THREE.MeshStandardMaterial {
  const h     = FLOOR_HEIGHT * dna.floors;
  const repX  = Math.max(1, w  / (dna.style === 'stone' ? 2.5 : 3.5));
  const repY  = Math.max(1, h  / (dna.style === 'stone' ? 2.5 : 3.5));
  const map   = dna.style === 'stone'  ? stoneTexture(repX, repY)
              : dna.style === 'timber' ? brickTexture(repX, repY)
              : renderTexture(repX, repY);
  const mult  = dna.condition === 'ruined'   ? 0.55
              : dna.condition === 'damaged'  ? 0.72
              : dna.condition === 'weathered'? 0.88
              : 1.0;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.colors.walls).multiplyScalar(mult),
    map, roughness: 0.92, metalness: 0.0,
  });
}

function roofStd(dna: BuildingDNA, w: number, d: number): THREE.MeshStandardMaterial {
  const ridgeH   = w * 0.52;
  const slopeLen = Math.sqrt((w / 2) ** 2 + ridgeH ** 2);
  const repX     = Math.max(1, d / 1.8);
  const repY     = Math.max(1, slopeLen / 1.4);
  const map      = dna.style === 'thatched' ? thatchTexture(repX, repY) : slateTexture(repX, repY);
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.colors.roof),
    map, roughness: 0.94, metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

function trimStd(dna: BuildingDNA): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim), roughness: 0.75 });
}

function doorMat(dna: BuildingDNA): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.door), roughness: 0.80 });
}

function glassMat(lit: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: lit ? new THREE.Color(0.35, 0.25, 0.08) : new THREE.Color(0.06, 0.08, 0.12),
    roughness: lit ? 0.4 : 0.05,
    metalness: lit ? 0.0 : 0.45,
  });
  if (lit) {
    m.emissive = new THREE.Color(0.85, 0.50, 0.08);
    m.emissiveIntensity = 1.4;
  }
  return m;
}

// ── Window (ported from hiraeth BuildingFactory.ts) ───────────────────────────

function addWindow(
  g: THREE.Group,
  x: number, y: number, z: number,
  rotY: number,
  lit: boolean,
  tMat: THREE.MeshStandardMaterial,
  winW = 1.05, winH = 1.15,
): void {
  const depth  = 0.12;
  const frame  = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.18, winH + 0.18, depth), tMat);
  const glass  = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, depth * 0.55), glassMat(lit));
  // Horizontal glazing bar
  const hBar   = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.04, 0.07, depth * 0.7), tMat);
  hBar.position.y = 0; // centred on window
  for (const m of [frame, glass, hBar]) {
    m.position.set(x, y, z);
    m.rotation.y = rotY;
  }
  g.add(frame, glass, hBar);
}

// ── Door (ported from hiraeth BuildingFactory.ts) ─────────────────────────────

function addDoor(
  g: THREE.Group,
  x: number, y: number, z: number,
  rotY: number,
  dna: BuildingDNA,
  tMat: THREE.MeshStandardMaterial,
): void {
  const dW = dna.buildingKind === 'inn' ? 1.35 : 1.0;
  const dH = dna.buildingKind === 'inn' ? 2.45 : 2.2;
  const pZ = 0.04;

  // Arch frame
  const frameH  = dH + 0.3;
  const frame   = new THREE.Mesh(new THREE.BoxGeometry(dW + 0.3, frameH, pZ * 2), tMat);
  frame.position.set(x, y + frameH / 2, z);
  frame.rotation.y = rotY;

  // Door panel
  const door    = new THREE.Mesh(new THREE.BoxGeometry(dW, dH, pZ * 1.5), doorMat(dna));
  door.position.set(x, y + dH / 2, z);
  door.rotation.y = rotY;

  // Handle
  const handle  = new THREE.Mesh(new THREE.SphereGeometry(0.065, 5, 5), tMat);
  const hOff    = (dW / 2 - 0.18) * (rotY === 0 ? 1 : -1);
  handle.position.set(x + hOff, y + dH * 0.46, z + pZ);
  handle.rotation.y = rotY;

  // Step
  const step    = new THREE.Mesh(new THREE.BoxGeometry(dW + 0.5, 0.2, 0.55), tMat);
  step.position.set(x, y + 0.1, z + (rotY === 0 ? 0.3 : -0.3));
  step.rotation.y = rotY;

  g.add(frame, door, handle, step);
}

// ── Chimney with pot + corbel ─────────────────────────────────────────────────

function addChimney(
  g: THREE.Group,
  cx: number, cy: number, cz: number,
): void {
  const chiH   = FLOOR_HEIGHT * 0.55;
  const chimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3828'), roughness: 0.92 });
  const potMat  = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2818'), roughness: 0.95 });

  const shaft  = new THREE.Mesh(new THREE.BoxGeometry(0.75, chiH, 0.75), chimMat);
  shaft.position.set(cx, cy + chiH / 2, cz);
  shaft.castShadow = true;

  // Corbel ledge
  const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.95), chimMat);
  corbel.position.set(cx, cy + chiH - 0.07, cz);

  // Chimney pot
  const pot    = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.45, 6), potMat);
  pot.position.set(cx, cy + chiH + 0.22, cz);

  g.add(shaft, corbel, pot);
}

// ── House / shop / inn / guild ────────────────────────────────────────────────

function buildHouseOrShop(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const fp  = getFootprint(dna.buildingKind, dna.size);
  const { w, d } = fp;
  const wallH    = FLOOR_HEIGHT * dna.floors;
  const plinthH  = 0.35;
  const r        = mulberry32(dna.seed ^ 0xABCD_EF01);

  const wMat = wallStd(dna, w, d);
  const rMat = roofStd(dna, w, d);
  const tMat = trimStd(dna);

  // ── Plinth (ground course) ─────────────────────────────────────────────────
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.5, plinthH, d + 0.5),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a6458'), roughness: 0.95 }),
  );
  plinth.position.y = plinthH / 2;
  plinth.castShadow = plinth.receiveShadow = true;
  g.add(plinth);

  // ── Four wall panels (separate so UV scales correctly) ─────────────────────
  const yMid = plinthH + wallH / 2;

  for (const [px, pz, ry, pw, pd] of [
    [0,      d / 2 - 0.14,  0,           w,    0.28],
    [0,     -d / 2 + 0.14,  0,           w,    0.28],
    [-w/2+0.14,  0,  Math.PI / 2,        0.28,  d - 0.28],
    [ w/2-0.14,  0,  Math.PI / 2,        0.28,  d - 0.28],
  ] as [number, number, number, number, number][]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(pw > 0.3 ? pw : pd, wallH, pw > 0.3 ? 0.28 : pw), wMat.clone());
    panel.rotation.y = ry;
    panel.position.set(px, yMid, pz);
    panel.castShadow = panel.receiveShadow = true;
    g.add(panel);
  }

  // Core shadow volume
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.5, wallH, d - 0.5),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.walls), roughness: 0.95 }),
  );
  core.position.set(0, yMid, 0);
  core.castShadow = core.receiveShadow = true;
  g.add(core);

  // ── Door (front centre, ground floor) ─────────────────────────────────────
  const doorY = plinthH;
  addDoor(g, 0, doorY, d / 2 + 0.02, 0, dna, tMat);

  // ── Windows — hiraeth layout: n cols per floor, skip centre ground ─────────
  const winW  = 1.05, winH = 1.15;
  const pitch = 3.0;
  const n     = Math.max(1, Math.floor((w - 2.0) / pitch));
  const frontZ = d / 2 + 0.04;
  const backZ  = -(d / 2 + 0.04);

  for (let fl = 0; fl < dna.floors; fl++) {
    const wy = plinthH + fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.60;
    for (let wi = 0; wi < n; wi++) {
      const wx  = (wi - (n - 1) / 2) * pitch;
      // Leave gap at centreline ground floor for door
      if (fl === 0 && Math.abs(wx) < 0.9) continue;
      const lit = r() > 0.4;
      addWindow(g, wx, wy, frontZ,  0,          lit, tMat, winW, winH);
      addWindow(g, wx, wy, backZ,   Math.PI,    lit, tMat, winW, winH);
    }
  }

  // Side windows (1 per floor per side)
  const sideN = dna.size === 'large' || dna.size === 'medium' ? 2 : 1;
  for (let fl = 0; fl < dna.floors; fl++) {
    const wy = plinthH + fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.60;
    for (let wi = 0; wi < sideN; wi++) {
      const wz = (wi - (sideN - 1) / 2) * (d * 0.35);
      addWindow(g, -(w / 2 + 0.04), wy, wz, -Math.PI / 2, r() > 0.4, tMat, 0.9, 1.1);
      addWindow(g,  (w / 2 + 0.04), wy, wz,  Math.PI / 2, r() > 0.4, tMat, 0.9, 1.1);
    }
  }

  // ── Roof ───────────────────────────────────────────────────────────────────
  const roofY = plinthH + wallH;
  let roof: THREE.Mesh | THREE.Group;
  if (dna.style === 'thatched')     roof = thatchedRoof(w, d, rMat);
  else if (dna.style === 'stone')   roof = hippedRoof(w, d, 0.45, 0.30, rMat);
  else if (dna.style === 'arcane')  roof = hippedRoof(w, d, 0.60, 0.22, rMat);
  else                              roof = pitchedRoof(w, d, 0.52, rMat);
  roof.position.y = roofY;
  (roof as THREE.Object3D).castShadow = true;
  g.add(roof);

  // Eave trim
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, 0.20, d + 0.45), tMat);
  eave.position.y = roofY + 0.07;
  g.add(eave);

  // ── Chimneys ───────────────────────────────────────────────────────────────
  const ridgeH  = w * 0.52;
  const chimsY  = roofY + ridgeH * 0.38;
  const chiCount = dna.style === 'arcane' ? 0 : (dna.size === 'tiny' ? (r() > 0.5 ? 1 : 0) : 1 + Math.floor(r() * 1.5));
  for (let i = 0; i < chiCount; i++) {
    const cx = (i === 0 ? -1 : 1) * (w * 0.24);
    addChimney(g, cx, chimsY, 0);
  }

  // ── Facade extras ──────────────────────────────────────────────────────────
  if (dna.buildingKind === 'shop' || dna.buildingKind === 'inn') {
    // Hanging sign
    const signMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.walls), roughness: 0.85 });
    const post    = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), tMat);
    post.position.set(0, plinthH + wallH * 0.68, d / 2 + 0.3);
    const board   = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.28, 0.07), signMat);
    board.position.set(0, plinthH + wallH * 0.56, d / 2 + 0.3);
    g.add(post, board);
  }

  // Corner posts for timber style
  if (dna.style === 'timber') {
    const postMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim), roughness: 0.8 });
    for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]] as [number,number][]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, wallH + 0.1, 0.18), postMat);
      post.position.set(cx, plinthH + (wallH + 0.1) / 2, cz);
      post.castShadow = true;
      g.add(post);
    }
  }

  // Style-specific faction overlays
  applyStyleOverlay(g, dna, w, d, plinthH + wallH);
  return g;
}

// ── Ruin ──────────────────────────────────────────────────────────────────────

function buildRuin(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const fp  = getFootprint(dna.buildingKind, dna.size);
  const { w, d } = fp;
  const h   = FLOOR_HEIGHT;
  const r   = mulberry32(dna.seed ^ 0xDE4D_BEEF);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.colors.walls).multiplyScalar(0.6), roughness: 0.95,
    map: stoneTexture(Math.max(1, w / 2.5), Math.max(1, h / 2.5)),
  });

  for (const [wx, wz, ry, len] of [
    [0, d/2, 0, w], [0, -d/2, 0, w],
    [-w/2, 0, Math.PI/2, d], [w/2, 0, Math.PI/2, d],
  ] as [number, number, number, number][]) {
    const wallH = h * (0.25 + r() * 0.75);
    const wall  = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, 0.28), mat);
    wall.rotation.y = ry;
    wall.position.set(wx, wallH / 2, wz);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
  }

  const rubbleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim).multiplyScalar(0.55), roughness: 0.98 });
  for (let i = 0; i < 8; i++) {
    const s = 0.25 + r() * 0.55;
    const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rubbleMat);
    chunk.position.set((r() - 0.5) * w, s * 0.5, (r() - 0.5) * d);
    chunk.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    chunk.castShadow = true;
    g.add(chunk);
  }
  return g;
}

// ── Well ──────────────────────────────────────────────────────────────────────

function buildWell(dna: BuildingDNA): THREE.Group {
  const g    = new THREE.Group();
  const mat  = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.walls), roughness: 0.92, map: stoneTexture(1, 1) });
  const rim  = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim),  roughness: 0.85 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.7, 0.8, 10), mat);
  body.position.y = 0.4;
  const top  = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.09, 6, 12), rim);
  top.rotation.x = Math.PI / 2; top.position.y = 0.82;
  for (const px of [-0.55, 0.55]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), rim);
    post.position.set(px, 1.3, 0); g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 6), rim);
  bar.rotation.z = Math.PI / 2; bar.position.y = 1.8;
  g.add(body, top, bar);
  return g;
}

// ── Barn ──────────────────────────────────────────────────────────────────────

function buildBarn(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const fp  = getFootprint(dna.buildingKind, dna.size === 'tiny' ? 'small' : dna.size);
  const { w, d } = fp;
  const h   = FLOOR_HEIGHT * 1.5;
  const mat = wallStd(dna, w, d);
  const rMat = roofStd(dna, w, d);

  for (const [wx, wz, ry, lw, ld] of [
    [0, d/2,  0,            w,    0.28],
    [0, -d/2, 0,            w,    0.28],
    [-w/2, 0, Math.PI/2,    0.28, d-0.28],
    [w/2,  0, Math.PI/2,    0.28, d-0.28],
  ] as [number,number,number,number,number][]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(lw > 0.3 ? lw : ld, h, lw > 0.3 ? 0.28 : lw), mat.clone());
    wall.rotation.y = ry;
    wall.position.set(wx, h / 2, wz);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
  }

  addDoor(g, 0, 0, d / 2 + 0.02, 0, { ...dna, buildingKind: 'inn' }, trimStd(dna));

  const roof = pitchedRoof(w, d, 0.52, rMat);
  roof.position.y = h;
  roof.castShadow = true;
  g.add(roof);

  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, 0.2, d + 0.45), trimStd(dna));
  eave.position.y = h + 0.07;
  g.add(eave);

  return g;
}

// ── Terraced house (narrow, shared walls, jetty overhang) ────────────────────

function buildTerraced(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('terraced', dna.size);
  const wallH    = FLOOR_HEIGHT * dna.floors;
  const plinthH  = 0.35;
  const r        = mulberry32(dna.seed ^ 0xFACE_B00C);
  const wMat = wallStd(dna, w, d);
  const rMat = roofStd(dna, w, d);
  const tMat = trimStd(dna);

  // Plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, plinthH, d + 0.4),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a6458'), roughness: 0.95 }));
  plinth.position.y = plinthH / 2;
  plinth.receiveShadow = true;
  g.add(plinth);

  const yMid = plinthH + wallH / 2;

  // Core box
  const core = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wMat);
  core.position.y = yMid;
  core.castShadow = core.receiveShadow = true;
  g.add(core);

  // Jetty overhang on upper floors (Split Grammar: upper volume projects 0.3m forward)
  if (dna.floors >= 2) {
    const jettyH  = FLOOR_HEIGHT * (dna.floors - 1);
    const jetty   = new THREE.Mesh(new THREE.BoxGeometry(w, jettyH, d + 0.35), wMat.clone());
    jetty.position.set(0, plinthH + FLOOR_HEIGHT + jettyH / 2, 0.175);
    jetty.castShadow = jetty.receiveShadow = true;
    g.add(jetty);
    // Jetty bracket beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 0.18, 0.18), tMat);
    beam.position.set(0, plinthH + FLOOR_HEIGHT - 0.09, d / 2 + 0.26);
    g.add(beam);
  }

  // Tudor cross-framing: vertical posts + diagonal braces
  if (dna.style === 'thatched' || dna.style === 'timber' || dna.style === 'tudor') {
    const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a1a0a'), roughness: 0.9 });
    const postW = 0.12;
    for (let fi = 0; fi <= 2; fi++) {
      const fx = -w / 2 + fi * (w / 2);
      const post = new THREE.Mesh(new THREE.BoxGeometry(postW, wallH + 0.1, postW), frameMat);
      post.position.set(fx, plinthH + (wallH + 0.1) / 2, d / 2 + 0.01);
      post.castShadow = true;
      g.add(post);
    }
    // Diagonal knee brace
    const braceH  = wallH * 0.3;
    const braceL  = Math.sqrt(braceH ** 2 + (w / 4) ** 2);
    for (const side of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(postW, braceL, postW), frameMat);
      brace.rotation.z = side * Math.atan2(braceH, w / 4);
      brace.position.set(side * w / 4 * 0.5, plinthH + braceH / 2, d / 2 + 0.01);
      g.add(brace);
    }
    // Horizontal floor band
    const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, postW), frameMat);
    band.position.set(0, plinthH + FLOOR_HEIGHT, d / 2 + 0.01);
    g.add(band);
  }

  // Door
  addDoor(g, 0, plinthH, d / 2 + 0.02, 0, dna, tMat);

  // Windows — only on front and back (no side windows — shared walls)
  const n   = Math.max(1, Math.floor((w - 1.5) / 2.8));
  const frontZ = d / 2 + 0.04 + 0.175; // account for jetty
  const backZ  = -(d / 2 + 0.04);
  for (let fl = 0; fl < dna.floors; fl++) {
    const wy = plinthH + fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.60;
    for (let wi = 0; wi < n; wi++) {
      const wx = (wi - (n - 1) / 2) * 2.8;
      if (fl === 0 && Math.abs(wx) < 0.8) continue;
      const lit = r() > 0.35;
      addWindow(g, wx, wy, frontZ, 0,       lit, tMat, 0.9, 1.1);
      addWindow(g, wx, wy, backZ,  Math.PI, lit, tMat, 0.9, 1.1);
    }
  }

  // Roof
  const roofY = plinthH + wallH;
  const roof  = pitchedRoof(w, d + 0.35, 0.6, rMat);
  roof.position.set(0, roofY, 0.175);
  roof.castShadow = true;
  g.add(roof);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.2, d + 0.7), tMat);
  eave.position.set(0, roofY + 0.07, 0.175);
  g.add(eave);

  // Chimney stack (rear-centred, tall)
  const ridgeH = w * 0.6;
  addChimney(g, 0, roofY + ridgeH * 0.35, -d * 0.2);

  return g;
}

// ── Cottage (wide, low, steep thatched) ──────────────────────────────────────

function buildCottage(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('cottage', dna.size);
  const wallH    = FLOOR_HEIGHT * 1.1;  // always 1 floor + loft
  const plinthH  = 0.4;
  const r        = mulberry32(dna.seed ^ 0xC0AA4E55);
  const wMat = wallStd(dna, w, d);
  const rMat = roofStd(dna, w, d);
  const tMat = trimStd(dna);

  // Thick rubble stone base
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, plinthH, d + 0.8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#585450'), roughness: 0.97 }));
  base.position.y = plinthH / 2;
  base.receiveShadow = true;
  g.add(base);

  const core = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wMat);
  core.position.y = plinthH + wallH / 2;
  core.castShadow = core.receiveShadow = true;
  g.add(core);

  // Arched doorway (lintel stone + arch)
  addDoor(g, 0, plinthH, d / 2 + 0.02, 0, dna, tMat);
  // Stone lintel
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.22), tMat);
  lintel.position.set(0, plinthH + 2.3, d / 2 + 0.1);
  g.add(lintel);

  // Small deep-set windows (thick-walled cottage proportion: narrow+tall)
  const winPositions: [number, number, number][] = [
    [-w / 2 + 1.6, plinthH + wallH * 0.52, d / 2 + 0.04],
    [ w / 2 - 1.6, plinthH + wallH * 0.52, d / 2 + 0.04],
  ];
  for (const [wx, wy, wz] of winPositions) {
    addWindow(g, wx, wy, wz, 0, r() > 0.4, tMat, 0.75, 1.2);
  }
  // Rear + side windows
  addWindow(g, 0, plinthH + wallH * 0.52, -(d / 2 + 0.04), Math.PI, r() > 0.4, tMat, 0.75, 1.2);

  // Very steep thatched roof (pitch 0.75 = 37° — classic English cottage)
  const roofY = plinthH + wallH;
  const roof  = thatchedRoof(w + 0.6, d + 0.6, rMat);
  roof.position.set(0, roofY, 0);
  roof.castShadow = true;
  g.add(roof);

  // Hanging flower baskets either side of door
  const potMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a06040'), roughness: 0.9 });
  for (const px of [-0.7, 0.7]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.2, 6), potMat);
    pot.position.set(px, plinthH + wallH * 0.72, d / 2 + 0.2);
    g.add(pot);
  }

  // Chimney (through thatched roof — traditional)
  addChimney(g, w * 0.25, roofY + (w + 0.6) * 0.75 * 0.38, 0);

  return g;
}

// ── Villa / Manor (grand, symmetrical, Georgian proportions) ─────────────────

function buildVilla(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('villa', dna.size);
  const wallH    = FLOOR_HEIGHT * dna.floors;
  const plinthH  = 0.6;  // taller rusticated plinth
  const r        = mulberry32(dna.seed ^ 0xA1110000);
  const wMat = wallStd(dna, w, d);
  const rMat = roofStd(dna, w, d);
  const tMat = trimStd(dna);

  // Rusticated plinth (stone base band)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, plinthH, d + 0.6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#808070'), roughness: 0.95 }));
  plinth.position.y = plinthH / 2;
  plinth.castShadow = plinth.receiveShadow = true;
  g.add(plinth);

  const yMid = plinthH + wallH / 2;
  const core = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wMat);
  core.position.y = yMid;
  core.castShadow = core.receiveShadow = true;
  g.add(core);

  // Stone quoins (corner blocks — Georgian detail)
  const quoinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a8880'), roughness: 0.92 });
  for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]] as [number,number][]) {
    for (let qi = 0; qi < Math.floor(wallH / 0.6); qi++) {
      const qy = plinthH + qi * 0.6 + 0.3;
      const qw = qi % 2 === 0 ? 0.35 : 0.22;
      const quoin = new THREE.Mesh(new THREE.BoxGeometry(qw, 0.28, qw), quoinMat);
      quoin.position.set(cx, qy, cz);
      g.add(quoin);
    }
  }

  // Columned portico at entrance (centred on front)
  const colMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim), roughness: 0.75 });
  const colH   = FLOOR_HEIGHT * 1.5;
  for (const px of [-0.9, 0.9]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, colH, 8), colMat);
    col.position.set(px, plinthH + colH / 2, d / 2 + 0.22);
    col.castShadow = true;
    g.add(col);
  }
  // Portico entablature (beam across columns)
  const entab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.36), colMat);
  entab.position.set(0, plinthH + colH + 0.11, d / 2 + 0.22);
  g.add(entab);

  // Door (centred, panelled)
  addDoor(g, 0, plinthH, d / 2 + 0.02, 0, dna, tMat);

  // Georgian window layout: regular grid, 5 bays wide
  const bays = 5;
  const pitch = (w - 1.5) / (bays - 1);
  const frontZ = d / 2 + 0.04;
  const backZ  = -(d / 2 + 0.04);
  for (let fl = 0; fl < dna.floors; fl++) {
    const wy = plinthH + fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.58;
    for (let bi = 0; bi < bays; bi++) {
      const wx = -((bays - 1) / 2) * pitch + bi * pitch;
      if (fl === 0 && Math.abs(wx) < 0.8) continue; // centre = door bay
      const lit = r() > 0.5;
      addWindow(g, wx, wy, frontZ,  0,       lit, tMat, 0.9, 1.3);
      addWindow(g, wx, wy, backZ,   Math.PI, lit, tMat, 0.9, 1.3);
    }
  }
  // Side windows (2 per floor per side)
  for (let fl = 0; fl < dna.floors; fl++) {
    const wy = plinthH + fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.58;
    for (const wz of [-d * 0.25, d * 0.25]) {
      addWindow(g, -(w/2+0.04), wy, wz, -Math.PI/2, r() > 0.5, tMat, 0.9, 1.3);
      addWindow(g,  (w/2+0.04), wy, wz,  Math.PI/2, r() > 0.5, tMat, 0.9, 1.3);
    }
  }

  // Hipped roof with parapet
  const roofY = plinthH + wallH;
  const roof  = hippedRoof(w, d, 0.28, 0.32, rMat);  // low Georgian pitch
  roof.position.y = roofY;
  roof.castShadow = true;
  g.add(roof);
  // Parapet / balustrade
  const para = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4), tMat);
  para.position.y = roofY + 0.3;
  g.add(para);

  // Symmetrical chimney stacks either side
  for (const cx of [-w * 0.3, w * 0.3]) {
    addChimney(g, cx, roofY + (w * 0.28) * 0.35, 0);
  }

  applyStyleOverlay(g, dna, w, d, roofY);
  return g;
}

// ── Tavern (wide Tudor, bay windows, stable arch) ─────────────────────────────

function buildTavern(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('tavern', dna.size);
  const wallH    = FLOOR_HEIGHT * Math.max(2, dna.floors);
  const plinthH  = 0.3;
  const r        = mulberry32(dna.seed ^ 0xA1E_B00C);
  const wMat = wallStd(dna, w, d);
  const rMat = roofStd(dna, w, d);
  const tMat = trimStd(dna);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, plinthH, d + 0.5),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a6458'), roughness: 0.95 }));
  plinth.position.y = plinthH / 2; plinth.receiveShadow = true;
  g.add(plinth);

  const core = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wMat);
  core.position.y = plinthH + wallH / 2;
  core.castShadow = core.receiveShadow = true;
  g.add(core);

  // Tudor heavy timber frame
  const fMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a0a08'), roughness: 0.88 });
  for (let fi = 0; fi <= 4; fi++) {
    const fx = -w / 2 + fi * (w / 4);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, wallH + 0.1, 0.15), fMat);
    post.position.set(fx, plinthH + (wallH + 0.1) / 2, d / 2 + 0.01);
    post.castShadow = true;
    g.add(post);
  }
  const hBeam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 0.15), fMat);
  hBeam.position.set(0, plinthH + FLOOR_HEIGHT, d / 2 + 0.01);
  g.add(hBeam);

  // Ground floor: large mullioned bay window (left of centre)
  const bayW = 2.6, bayD = 0.45, bayH = 1.8;
  const bayX = -(w * 0.22);
  const bayMesh = new THREE.Mesh(new THREE.BoxGeometry(bayW, bayH, bayD), wMat.clone());
  bayMesh.position.set(bayX, plinthH + FLOOR_HEIGHT * 0.5, d / 2 + bayD / 2);
  bayMesh.castShadow = true;
  g.add(bayMesh);
  // Bay window panes (3-light)
  for (let bw = 0; bw < 3; bw++) {
    const bwx = bayX - (bayW / 2 - 0.45) + bw * (bayW / 3);
    addWindow(g, bwx, plinthH + FLOOR_HEIGHT * 0.5, d / 2 + bayD + 0.01, 0, r() > 0.3, tMat, 0.7, 1.5);
  }

  // Door (right of centre, arched)
  addDoor(g, w * 0.25, plinthH, d / 2 + 0.02, 0, dna, tMat);

  // Upper floor windows (evenly spaced)
  const frontZ = d / 2 + 0.04;
  const backZ  = -(d / 2 + 0.04);
  const nWin   = Math.max(2, Math.floor((w - 2) / 3.2));
  for (let wi = 0; wi < nWin; wi++) {
    const wx  = (wi - (nWin - 1) / 2) * 3.2;
    const wy1 = plinthH + FLOOR_HEIGHT + FLOOR_HEIGHT * 0.58;
    addWindow(g, wx, wy1, frontZ, 0,       r() > 0.3, tMat, 1.0, 1.1);
    addWindow(g, wx, wy1, backZ,  Math.PI, r() > 0.3, tMat, 1.0, 1.1);
  }

  // Hanging sign (iron bracket + board)
  const bracketMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1a18'), roughness: 0.6 });
  const bracket    = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), bracketMat);
  bracket.position.set(w * 0.1, plinthH + wallH * 0.68, d / 2 + 0.7);
  const signBoard  = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.36, 0.08), wMat.clone());
  signBoard.position.set(w * 0.1, plinthH + wallH * 0.55, d / 2 + 0.7);
  const signChain  = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 4), bracketMat);
  signChain.position.set(w * 0.1, plinthH + wallH * 0.615, d / 2 + 0.7);
  g.add(bracket, signBoard, signChain);

  // Roof: pitched
  const roofY = plinthH + wallH;
  const roof  = pitchedRoof(w, d, 0.42, rMat);
  roof.position.y = roofY; roof.castShadow = true;
  g.add(roof);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.22, d + 0.5), tMat);
  eave.position.y = roofY + 0.08;
  g.add(eave);

  // Multiple chimneys (tavern = lots of hearths)
  for (const cx of [-w * 0.28, 0, w * 0.28]) {
    addChimney(g, cx, roofY + w * 0.42 * 0.38, 0);
  }

  return g;
}

// ── Watchtower (tall, narrow, battlements) ────────────────────────────────────

function buildWatchtower(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('watchtower', dna.size);
  const floors   = Math.max(4, dna.floors);
  const wallH    = FLOOR_HEIGHT * floors;
  const r        = mulberry32(dna.seed ^ 0xB4111E55);
  const wMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.colors.walls), roughness: 0.95,
    map: stoneTexture(Math.max(1, w / 2), Math.max(1, wallH / 2.5)),
  });
  const tMat = trimStd(dna);

  // Slightly tapered tower shaft
  for (let fl = 0; fl < floors; fl++) {
    const taper = fl * 0.05;
    const fw    = w - taper;
    const layer = new THREE.Mesh(new THREE.BoxGeometry(fw, FLOOR_HEIGHT, fw), wMat.clone());
    layer.position.y = fl * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
    layer.castShadow = layer.receiveShadow = true;
    g.add(layer);
  }

  // Arrow slits (narrow tall slots — NOT regular windows)
  const slitW = 0.18, slitH = 0.9;
  const slitMat = glassMat(false);
  for (let fl = 1; fl < floors; fl++) {
    const sy = fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.5;
    // One slit per face, alternating height
    for (const [sx, sz, ry] of [
      [0,    d / 2 + 0.01, 0          ],
      [0,   -d / 2 - 0.01, Math.PI    ],
      [w / 2 + 0.01, 0,   Math.PI / 2 ],
      [-w / 2 - 0.01, 0,  -Math.PI / 2],
    ] as [number, number, number][]) {
      const slitFrame = new THREE.Mesh(new THREE.BoxGeometry(slitW + 0.1, slitH + 0.1, 0.08), tMat);
      slitFrame.position.set(sx, sy + (fl % 2 === 0 ? 0.2 : -0.2), sz);
      slitFrame.rotation.y = ry;
      const slitGlass = new THREE.Mesh(new THREE.BoxGeometry(slitW, slitH, 0.05), slitMat);
      slitGlass.position.set(sx, sy + (fl % 2 === 0 ? 0.2 : -0.2), sz);
      slitGlass.rotation.y = ry;
      g.add(slitFrame, slitGlass);
    }
  }

  // Battlements at top (Split Grammar: merlons and crenels)
  const battleH = 0.65;
  const battleY = wallH + battleH / 2;
  const merlon  = tMat;
  const mCount  = 3;  // merlons per side

  for (const face of [0, 1, 2, 3]) {
    const angle = face * Math.PI / 2;
    for (let mi = 0; mi < mCount; mi++) {
      const t   = (mi - (mCount - 1) / 2) * ((w - 0.4) / mCount);
      const mx  = Math.cos(angle) * 0 + Math.sin(angle) * t;
      const mz  = Math.sin(angle) * 0 - Math.cos(angle) * t;
      const mMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, battleH, 0.55), merlon);
      mMesh.position.set(mx, battleY, mz);
      // Place around perimeter
      const perimX = Math.cos(angle) * (w / 2 - 0.28);
      const perimZ = -Math.sin(angle) * (w / 2 - 0.28);
      mMesh.position.set(mx + perimX, battleY, mz + perimZ);
      mMesh.castShadow = true;
      g.add(mMesh);
    }
  }
  // Battlement base ring
  const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, w + 0.3), tMat);
  ring.position.y = wallH + 0.15;
  g.add(ring);

  // Conical cap (some towers have pointed top)
  if (dna.style === 'arcane' || dna.style === 'gothic') {
    const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.roof), roughness: 0.9 });
    const cap    = new THREE.Mesh(new THREE.ConeGeometry(w * 0.65, w * 1.2, 8), capMat);
    cap.position.y = wallH + 0.3 + (w * 1.2) / 2;
    cap.castShadow = true;
    g.add(cap);
  }

  return g;
}

// ── Blacksmith (open forge, massive chimney, no front wall) ──────────────────

function buildBlacksmith(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('blacksmith', dna.size);
  const wallH    = FLOOR_HEIGHT;
  const plinthH  = 0.2;
  const r        = mulberry32(dna.seed ^ 0xF04E0001);
  const wMat = wallStd(dna, w, d);
  const rMat = roofStd(dna, w, d);
  const tMat = trimStd(dna);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, plinthH, d + 0.4),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#505050'), roughness: 0.97 }));
  plinth.position.y = plinthH / 2; g.add(plinth);

  // Three walls — no front wall (open forge!)
  for (const [wx, wz, ry, lw, ld] of [
    [0,    -d/2,   0,          w,   0.28],
    [-w/2,  0,    Math.PI/2,   0.28, d-0.28],
    [ w/2,  0,    Math.PI/2,   0.28, d-0.28],
  ] as [number,number,number,number,number][]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(lw > 0.3 ? lw : ld, wallH, lw > 0.3 ? 0.28 : lw), wMat.clone());
    wall.rotation.y = ry;
    wall.position.set(wx, plinthH + wallH / 2, wz);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
  }
  // Open front arch post (structural)
  for (const px of [-w/2 + 0.14, w/2 - 0.14]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, wallH, 0.28), wMat.clone());
    post.position.set(px, plinthH + wallH / 2, d / 2);
    post.castShadow = true; g.add(post);
  }
  // Lintel beam across open front
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, 0.28), tMat);
  lintel.position.set(0, plinthH + wallH - 0.14, d / 2);
  g.add(lintel);

  // Forge hearth (rear wall centred)
  const forgeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1a18'), roughness: 0.98 });
  const forge = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 0.6), forgeMat);
  forge.position.set(0, plinthH + 0.55, -d / 2 + 0.5);
  g.add(forge);
  // Glowing ember effect inside
  const emberMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ff4400'), emissive: new THREE.Color('#ff2200'),
    emissiveIntensity: 0.8, roughness: 0.9
  });
  const ember = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.2), emberMat);
  ember.position.set(0, plinthH + 0.3, -d / 2 + 0.2);
  g.add(ember);

  // Massive forge chimney (central, tall)
  const chimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2020'), roughness: 0.95 });
  const chimShaft = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH * 1.8, 1.2), chimMat);
  chimShaft.position.set(0, plinthH + wallH * 0.9, -d / 2 + 0.8);
  chimShaft.castShadow = true; g.add(chimShaft);
  const chimCap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 1.5), chimMat);
  chimCap.position.set(0, plinthH + wallH * 1.8 + 0.1, -d / 2 + 0.8);
  g.add(chimCap);

  // Simple mono-pitch roof (lean-to over open forge)
  const roofY = plinthH + wallH;
  const roof  = pitchedRoof(w + 0.5, d * 0.7, 0.25, rMat);
  roof.position.set(0, roofY, -d * 0.15);
  roof.castShadow = true; g.add(roof);

  // Tools hung outside
  const toolMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3038'), roughness: 0.6, metalness: 0.5 });
  for (let ti = 0; ti < 4; ti++) {
    const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7 + r() * 0.4, 5), toolMat);
    tool.rotation.z = (r() - 0.5) * 0.5;
    tool.position.set(-w / 2 + 0.3 + ti * 0.55, plinthH + wallH * 0.65, d / 2 + 0.2);
    g.add(tool);
  }

  return g;
}

// ── Chapel (long nave, gothic windows, bell tower) ───────────────────────────

function buildChapel(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('chapel', dna.size);
  const wallH    = FLOOR_HEIGHT * 2.2;   // tall nave
  const r        = mulberry32(dna.seed ^ 0xC4A0E100);
  const wMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.colors.walls).multiplyScalar(0.85), roughness: 0.94,
    map: stoneTexture(Math.max(1, w / 2.5), Math.max(1, wallH / 2.5)),
  });
  const rMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.roof), roughness: 0.94 });
  const tMat = trimStd(dna);

  // Nave box
  const nave = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wMat);
  nave.position.y = wallH / 2;
  nave.castShadow = nave.receiveShadow = true;
  g.add(nave);

  // Gothic pointed arch windows along sides (tall, narrow, pointed)
  const nWin  = Math.max(2, Math.floor(d / 4));
  const winW  = 0.8, winH = 2.0;
  for (let wi = 0; wi < nWin; wi++) {
    const wz  = -d / 2 + (wi + 0.5) * (d / nWin);
    const wy  = wallH * 0.55;
    const lit = r() > 0.2;
    // Gothic arched window: rectangular base + pointed arch triangle on top
    addWindow(g, -(w / 2 + 0.04), wy, wz, -Math.PI / 2, lit, tMat, winW, winH);
    addWindow(g,  (w / 2 + 0.04), wy, wz,  Math.PI / 2, lit, tMat, winW, winH);
    // Pointed top arch (triangle)
    const archMat = glassMat(lit);
    const archGeo = (() => {
      const s = new THREE.Shape();
      s.moveTo(-winW / 2, 0); s.lineTo(winW / 2, 0);
      s.lineTo(0, winW * 0.7); s.closePath();
      return new THREE.ShapeGeometry(s);
    })();
    const archL = new THREE.Mesh(archGeo, archMat);
    archL.position.set(-(w / 2 + 0.04), wy + winH / 2, wz);
    archL.rotation.y = -Math.PI / 2;
    const archR = archL.clone();
    archR.position.set(w / 2 + 0.04, wy + winH / 2, wz);
    archR.rotation.y = Math.PI / 2;
    g.add(archL, archR);
  }

  // Entrance arch (west end = -Z)
  addDoor(g, 0, 0, -(d / 2 + 0.02), Math.PI, dna, tMat);
  addWindow(g, 0, wallH * 0.68, -(d / 2 + 0.04), Math.PI, true, tMat, 1.0, 1.8);

  // Buttresses (structural props at intervals — Gothic requirement)
  const buttMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.walls), roughness: 0.96 });
  for (let bi = 0; bi <= nWin; bi++) {
    const bz = -d / 2 + bi * (d / nWin);
    for (const bx of [-(w / 2 + 0.35), w / 2 + 0.35]) {
      const butt = new THREE.Mesh(new THREE.BoxGeometry(0.7, wallH * 0.8, 0.5), buttMat);
      butt.position.set(bx, wallH * 0.4, bz);
      butt.castShadow = true; g.add(butt);
    }
  }

  // Nave pitched roof (steep)
  const roofY = wallH;
  const roof  = pitchedRoof(w + 0.3, d + 0.3, 0.65, rMat);
  roof.position.y = roofY; roof.castShadow = true;
  g.add(roof);

  // Bell tower (east end +Z, narrower, taller)
  const towerW = w * 0.55, towerH = FLOOR_HEIGHT * 3;
  const towerMat = wMat.clone();
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), towerMat);
  tower.position.set(0, towerH / 2, d / 2 + towerW / 2);
  tower.castShadow = tower.receiveShadow = true;
  g.add(tower);
  // Bell opening (arched slot)
  addWindow(g, 0, towerH * 0.78, d / 2 + towerW + 0.01, 0, false, tMat, 0.7, 1.1);
  // Spire on tower
  const spireMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.roof), roughness: 0.9 });
  const spire = new THREE.Mesh(new THREE.ConeGeometry(towerW * 0.55, towerW * 2.5, 8), spireMat);
  spire.position.set(0, towerH + towerW * 1.25, d / 2 + towerW / 2);
  spire.castShadow = true; g.add(spire);

  return g;
}

// ── Tent (fabric, conical or ridge, fantasy market) ───────────────────────────

function buildTent(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('tent', dna.size);
  const r   = mulberry32(dna.seed ^ 0x7E4A_0001);

  // Striped canvas palette (2 alternating colours)
  const col1 = dna.colors.walls;
  const col2 = dna.colors.roof;

  // Fabric panels — conical tent built from triangular segments
  const panels = 8;
  const tentH  = w * 0.75;
  const radius = Math.max(w, d) / 2;

  for (let pi = 0; pi < panels; pi++) {
    const a0   = (pi / panels) * Math.PI * 2;
    const a1   = ((pi + 1) / panels) * Math.PI * 2;
    const col  = pi % 2 === 0 ? col1 : col2;
    const mat  = new THREE.MeshStandardMaterial({
      color: new THREE.Color(col), roughness: 0.7, side: THREE.DoubleSide,
    });
    // Triangular panel from base edge to apex
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([0, tentH, 0,  x0, 0, z0,  x1, 0, z1]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const panel = new THREE.Mesh(geo, mat);
    panel.castShadow = true; g.add(panel);
  }

  // Central pole
  const poleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a3820'), roughness: 0.85 });
  const pole    = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, tentH + 0.8, 6), poleMat);
  pole.position.y = (tentH + 0.8) / 2;
  g.add(pole);
  // Finial
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), poleMat);
  finial.position.y = tentH + 0.8;
  g.add(finial);

  // Guy ropes (thin cylinders radiating outward)
  const ropeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8a060'), roughness: 0.9 });
  for (let ri = 0; ri < 4; ri++) {
    const ra = (ri / 4) * Math.PI * 2;
    const rx = Math.cos(ra) * radius * 1.2;
    const rz = Math.sin(ra) * radius * 1.2;
    const ropeH = Math.sqrt(rx * rx + tentH * tentH + rz * rz);
    const rope  = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, ropeH, 4), ropeMat);
    rope.position.set(rx / 2, tentH / 2, rz / 2);
    rope.lookAt(0, tentH, 0);
    rope.rotateX(Math.PI / 2);
    g.add(rope);
    // Stake
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.3, 4), poleMat);
    stake.position.set(rx, 0.05, rz);
    g.add(stake);
  }

  // Entrance flap (fabric door)
  const flapMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(col1), roughness: 0.7, side: THREE.DoubleSide });
  const flap    = new THREE.Mesh(new THREE.PlaneGeometry(radius * 0.7, radius * 0.9), flapMat);
  flap.position.set(0, radius * 0.45, radius + 0.01);
  g.add(flap);

  return g;
}

// ── Market stall (open front, awning) ────────────────────────────────────────

function buildMarketStall(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('market_stall', dna.size);
  const r   = mulberry32(dna.seed ^ 0xA44B0001);

  // Frame posts
  const postMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim), roughness: 0.85 });
  for (const [px, pz] of [[w/2, 0], [-w/2, 0], [w/2, -d+0.3], [-w/2, -d+0.3]] as [number,number][]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), postMat);
    post.position.set(px, 1.3, pz);
    post.castShadow = true; g.add(post);
  }

  // Counter (waist-height shelf)
  const counterMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.walls), roughness: 0.88 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.15, 0.5), counterMat);
  counter.position.set(0, 1.05, d / 2 - 0.28);
  g.add(counter);
  const counterLeg = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 1.0, 0.08), counterMat);
  counterLeg.position.set(0, 0.5, d / 2 - 0.04);
  g.add(counterLeg);

  // Striped awning (sloped canvas)
  const panels  = 6;
  const awningD = d + 0.5;
  for (let ai = 0; ai < panels; ai++) {
    const t  = ai / panels;
    const col = ai % 2 === 0 ? dna.colors.walls : dna.colors.roof;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.65, side: THREE.DoubleSide });
    const aw  = w / panels;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(aw - 0.02, awningD), mat);
    panel.rotation.x = -0.28;  // slight slope forward
    panel.position.set(-w / 2 + aw * (ai + 0.5), 2.5, -0.1);
    panel.castShadow = true; g.add(panel);
  }

  // Some goods on counter
  const goodsMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8783a'), roughness: 0.9 });
  for (let gi = 0; gi < 3; gi++) {
    const good = new THREE.Mesh(new THREE.SphereGeometry(0.12 + r() * 0.06, 6, 6), goodsMat);
    good.position.set(-w / 2 + 0.5 + gi * 0.55, 1.22, d / 2 - 0.2);
    g.add(good);
  }

  return g;
}

// ── Apothecary (narrow, tall, oriel window) ───────────────────────────────────

function buildApothecary(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('apothecary', dna.size);
  const floors   = Math.max(3, dna.floors);
  const wallH    = FLOOR_HEIGHT * floors;
  const plinthH  = 0.3;
  const r        = mulberry32(dna.seed ^ 0xA0070001);
  const wMat = wallStd(dna, w, d);
  const rMat = roofStd(dna, w, d);
  const tMat = trimStd(dna);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, plinthH, d + 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#686460'), roughness: 0.95 }));
  plinth.position.y = plinthH / 2; g.add(plinth);

  const core = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wMat);
  core.position.y = plinthH + wallH / 2;
  core.castShadow = core.receiveShadow = true; g.add(core);

  // Door (ground floor)
  addDoor(g, 0, plinthH, d / 2 + 0.02, 0, dna, tMat);

  // Ground floor: small display window (apothecary jars visible)
  const jarMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a6a4a'), roughness: 0.4, metalness: 0.2 });
  for (const [jx, jy] of [[-(w/2 - 0.7), plinthH + 1.2], [(w/2 - 0.7), plinthH + 1.2]] as [number,number][]) {
    addWindow(g, jx, jy, d/2 + 0.04, 0, true, tMat, 0.65, 1.0);
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.35, 6), jarMat);
    jar.position.set(jx, plinthH + 0.95, d/2 + 0.25);
    g.add(jar);
  }

  // Oriel window (projecting bay window on 2nd floor — apothecary signature)
  const oriW = w * 0.7, oriD = 0.55, oriH = FLOOR_HEIGHT * 0.8;
  const oriY = plinthH + FLOOR_HEIGHT + FLOOR_HEIGHT * 0.35;
  const orielBase = new THREE.Mesh(new THREE.BoxGeometry(oriW, oriH, oriD), wMat.clone());
  orielBase.position.set(0, oriY + oriH / 2, d / 2 + oriD / 2);
  orielBase.castShadow = true; g.add(orielBase);
  // Oriel floor bracket
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(oriW + 0.1, 0.15, oriD + 0.15), tMat);
  bracket.position.set(0, oriY, d / 2 + oriD / 2);
  g.add(bracket);
  // 3 oriel window panes
  for (let op = 0; op < 3; op++) {
    const ox = (op - 1) * (oriW / 3);
    addWindow(g, ox, oriY + oriH * 0.5, d / 2 + oriD + 0.01, 0, r() > 0.3, tMat, oriW / 3 - 0.15, oriH * 0.7);
  }

  // Upper floors: small narrow windows (typical apothecary: many windows for herbs)
  for (let fl = 2; fl < floors; fl++) {
    const wy = plinthH + fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.55;
    for (const wx of [-(w/2 - 0.7), (w/2 - 0.7)]) {
      addWindow(g, wx, wy, d / 2 + 0.04, 0,       r() > 0.35, tMat, 0.6, 0.9);
      addWindow(g, wx, wy, -(d/2 + 0.04), Math.PI, r() > 0.35, tMat, 0.6, 0.9);
    }
  }

  // Hanging herb bundles outside door
  const herbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a7830'), roughness: 0.9 });
  for (const hx of [-(w/2 - 0.5), (w/2 - 0.5)]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 4), herbMat);
    stem.rotation.z = 0.4 * Math.sign(hx);
    stem.position.set(hx, plinthH + 2.4, d / 2 + 0.15);
    const bunch = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 5), herbMat);
    bunch.position.set(hx + 0.08 * Math.sign(hx), plinthH + 2.1, d / 2 + 0.18);
    g.add(stem, bunch);
  }

  // Pitched roof
  const roofY = plinthH + wallH;
  const roof  = pitchedRoof(w, d, 0.55, rMat);
  roof.position.y = roofY; roof.castShadow = true; g.add(roof);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.18, d + 0.35), tMat);
  eave.position.y = roofY + 0.07; g.add(eave);

  // Single chimney (apothecary has a distillation hearth)
  addChimney(g, w * 0.2, roofY + w * 0.55 * 0.38, 0);

  return g;
}

// ── General tower (shorter than watchtower, more residential/civic) ───────────

function buildTower(dna: BuildingDNA): THREE.Group {
  const g   = new THREE.Group();
  const { w, d } = getFootprint('watchtower', dna.size);  // reuse narrow footprint
  const floors   = Math.min(4, Math.max(2, dna.floors));
  const wallH    = FLOOR_HEIGHT * floors;
  const wMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.colors.walls), roughness: 0.95,
    map: stoneTexture(Math.max(1, w / 2), Math.max(1, wallH / 2.5)),
  });
  const rMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.roof), roughness: 0.92 });
  const tMat = trimStd(dna);
  const r    = mulberry32(dna.seed ^ 0x70AEA001);

  // Main shaft — not tapered
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wMat);
  shaft.position.y = wallH / 2;
  shaft.castShadow = shaft.receiveShadow = true;
  g.add(shaft);

  // Windows on each floor
  for (let fl = 0; fl < floors; fl++) {
    const wy = fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.6;
    addWindow(g, 0, wy, d / 2 + 0.04, 0,       r() > 0.4, tMat, 0.65, 1.0);
    addWindow(g, 0, wy, -(d/2+0.04), Math.PI,   r() > 0.4, tMat, 0.65, 1.0);
  }

  // Door at base
  addDoor(g, 0, 0, d / 2 + 0.02, 0, dna, tMat);

  // Style-dependent top
  if (dna.style === 'arcane' || dna.style === 'vampiric') {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.65, w * 1.4, 8), rMat);
    cap.position.y = wallH + (w * 1.4) / 2;
    cap.castShadow = true; g.add(cap);
  } else if (dna.style === 'gothic') {
    // Pointed finials at corners
    for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]] as [number,number][]) {
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 6), tMat);
      finial.position.set(cx, wallH + 0.45, cz);
      g.add(finial);
    }
    // Battlements
    applyStyleOverlay(g, dna, w, d, wallH);
  } else {
    // Hipped roof cap
    const roof = hippedRoof(w + 0.2, d + 0.2, 0.5, 0.28, rMat);
    roof.position.y = wallH; roof.castShadow = true;
    g.add(roof);
  }

  return g;
}

// ── Gate (arched gatehouse — two flanking towers + arch) ─────────────────────

function buildGate(dna: BuildingDNA): THREE.Group {
  const g    = new THREE.Group();
  const gateW = 8, gateD = 5;   // fixed proportions
  const wallH = FLOOR_HEIGHT * Math.max(2, dna.floors);
  const wMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.colors.walls), roughness: 0.95,
    map: stoneTexture(Math.max(1, gateW / 2.5), Math.max(1, wallH / 2.5)),
  });
  const tMat = trimStd(dna);

  // Two flanking towers
  for (const tx of [-gateW / 2 + 1.1, gateW / 2 - 1.1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, wallH, gateD), wMat.clone());
    tower.position.set(tx, wallH / 2, 0);
    tower.castShadow = tower.receiveShadow = true;
    g.add(tower);
    // Battlements on each tower
    const bH = 0.6;
    for (const [mx, mz] of [[-0.55, 0], [0, 0.55], [0.55, 0], [0, -0.55]] as [number,number][]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, bH, 0.5), tMat);
      m.position.set(tx + mx, wallH + bH/2, mz);
      g.add(m);
    }
    // Arrow slits
    for (let fl = 0; fl < Math.max(2, dna.floors); fl++) {
      const wy = fl * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.5;
      addWindow(g, tx, wy, gateD / 2 + 0.04, 0,       false, tMat, 0.18, 0.9);
      addWindow(g, tx, wy, -(gateD/2+0.04), Math.PI,   false, tMat, 0.18, 0.9);
    }
  }

  // Arch span between towers
  const archH  = FLOOR_HEIGHT * 1.6;
  const archMat = tMat;
  // Arch top beam
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(gateW - 2.2, 0.6, gateD), archMat);
  archTop.position.set(0, archH + 0.3, 0);
  archTop.castShadow = true; g.add(archTop);
  // Arch side walls (portcullis frame)
  for (const ax of [-1.4, 1.4]) {
    const archSide = new THREE.Mesh(new THREE.BoxGeometry(0.4, archH, gateD), wMat.clone());
    archSide.position.set(ax, archH / 2, 0);
    g.add(archSide);
  }

  // Portcullis (iron bars visible in archway)
  const barMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1818'), roughness: 0.5, metalness: 0.7 });
  const nBars  = 5;
  for (let bi = 0; bi < nBars; bi++) {
    const bx = -1.4 + (bi + 0.5) * (2.8 / nBars);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, archH, 0.08), barMat);
    bar.position.set(bx, archH / 2, gateD * 0.1);
    g.add(bar);
  }

  // Connecting wall section between tower tops
  const wallBridge = new THREE.Mesh(new THREE.BoxGeometry(gateW - 2.2, wallH - archH - 0.6, gateD * 0.4), wMat.clone());
  wallBridge.position.set(0, archH + 0.6 + (wallH - archH - 0.6) / 2, gateD * 0.3);
  wallBridge.castShadow = true; g.add(wallBridge);

  return g;
}

// ── Style overlay — adds faction-specific visual details after main build ─────

function applyStyleOverlay(g: THREE.Group, dna: BuildingDNA, w: number, d: number, h: number): void {
  const tMat = trimStd(dna);
  const r    = mulberry32(dna.seed ^ 0x571E0001);

  switch (dna.style) {
    case 'vampiric': {
      // Gargoyle silhouettes at roof corners
      const gargMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1020'), roughness: 0.95 });
      for (const [cx, cz] of [[w/2+0.1, d/2+0.1], [-w/2-0.1, d/2+0.1],
                               [w/2+0.1, -d/2-0.1], [-w/2-0.1, -d/2-0.1]] as [number,number][]) {
        // Hunched gargoyle shape: sphere body + wing hints
        const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), gargMat);
        body.position.set(cx, h + 0.35, cz);
        body.castShadow = true; g.add(body);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.06), gargMat);
        wing.rotation.y = Math.atan2(cz, cx);
        wing.position.set(cx + Math.sign(cx) * 0.2, h + 0.45, cz);
        g.add(wing);
      }
      // Iron reinforcement bands across walls
      const ironMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1818'), roughness: 0.55, metalness: 0.75 });
      for (let fl = 0; fl < 3; fl++) {
        const by = h * (0.25 + fl * 0.25);
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, 0.1), ironMat);
        band.position.set(0, by, d / 2 + 0.05); g.add(band);
        const band2 = band.clone();
        band2.position.set(0, by, -(d / 2 + 0.05)); g.add(band2);
      }
      break;
    }
    case 'elven': {
      // Vine spirals — green cylinders winding up front corners
      const vineMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a6a20'), roughness: 0.9 });
      for (const cx of [-(w / 2 - 0.15), w / 2 - 0.15]) {
        for (let vi = 0; vi < 5; vi++) {
          const vz = d / 2 + 0.05;
          const vy = vi * (h / 4.5);
          const vine = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 4, 8, Math.PI * 0.7), vineMat);
          vine.position.set(cx, vy, vz);
          vine.rotation.x = Math.PI / 2;
          vine.rotation.z = vi * 0.8;
          g.add(vine);
        }
        // Leaf clusters
        const leafMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a8a28'), roughness: 0.85 });
        for (let li = 0; li < 3; li++) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18 + r() * 0.08, 5, 5), leafMat);
          leaf.scale.set(1.4, 0.6, 1.0);
          leaf.position.set(cx + (r() - 0.5) * 0.3, h * (0.3 + li * 0.28) + r() * 0.4, d / 2 + 0.1);
          g.add(leaf);
        }
      }
      break;
    }
    case 'dwarven': {
      // Carved horizontal relief bands (embossed stone)
      const carvedMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.walls).multiplyScalar(0.85), roughness: 0.98 });
      for (let fl = 0; fl < dna.floors; fl++) {
        const by = fl * FLOOR_HEIGHT;
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.28, 0.15), carvedMat);
        band.position.set(0, by + 0.14, d / 2 + 0.07);
        const band2 = band.clone();
        band2.position.set(0, by + 0.14, -(d / 2 + 0.07));
        g.add(band, band2);
        // Iron strap reinforcement on door side
        const strapMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2020'), roughness: 0.5, metalness: 0.8 });
        for (const sx of [-w * 0.3, w * 0.3]) {
          const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, FLOOR_HEIGHT, 0.12), strapMat);
          strap.position.set(sx, by + FLOOR_HEIGHT / 2, d / 2 + 0.06);
          g.add(strap);
        }
      }
      break;
    }
    case 'gothic': {
      // Flying buttress stubs on sides (visual only)
      const buttMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim), roughness: 0.94 });
      for (let bi = 0; bi < 2; bi++) {
        const bz = (bi - 0.5) * d * 0.5;
        for (const bx of [-(w / 2 + 0.45), w / 2 + 0.45]) {
          const butt = new THREE.Mesh(new THREE.BoxGeometry(0.7, h * 0.72, 0.38), buttMat);
          butt.position.set(bx, h * 0.36, bz);
          g.add(butt);
          // Diagonal arch connecting buttress to wall
          const archLen = 0.7;
          const arch = new THREE.Mesh(new THREE.BoxGeometry(archLen, 0.18, 0.22), buttMat);
          arch.rotation.z = Math.sign(bx) * 0.45;
          arch.position.set(bx * 0.6, h * 0.72, bz);
          g.add(arch);
        }
      }
      // Pointed finials on roof ridge
      for (let fi = 0; fi < 3; fi++) {
        const fz = (fi - 1) * (d / 3);
        const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 6), tMat);
        finial.position.set(0, h + 0.28, fz);
        g.add(finial);
      }
      break;
    }
    case 'nordic': {
      // Turf/moss band at base of roof (green-brown strip)
      const turfMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a6030'), roughness: 0.97 });
      const turf    = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.35, d + 0.35), turfMat);
      turf.position.y = h + 0.17;
      g.add(turf);
      // Carved dragon-head ridge ends (simplified)
      const dragonMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim), roughness: 0.9 });
      for (const dz of [-d / 2, d / 2]) {
        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), dragonMat);
        head.position.set(0, h + 0.55, dz * 1.05);
        head.castShadow = true; g.add(head);
      }
      break;
    }
    case 'fae': {
      // Mushroom-cap decorations on roof corners
      const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d04880'), roughness: 0.8 });
      const stemMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0e8d0'), roughness: 0.9 });
      for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]] as [number,number][]) {
        const scale = 0.5 + r() * 0.3;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.4 * scale, 6), stemMat);
        stem.position.set(cx, h + 0.2 * scale, cz);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 7, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), capMat);
        cap.position.set(cx, h + 0.4 * scale + 0.14 * scale, cz);
        g.add(stem, cap);
      }
      // Star/dot spots on mushroom caps
      const spotMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0d0f0'), roughness: 0.7 });
      break;
    }
    case 'orcish': {
      // Crude bone decoration at entrance
      const boneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d8d0b8'), roughness: 0.95 });
      for (let bi = 0; bi < 4; bi++) {
        const bx = (bi - 1.5) * 0.55;
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5 + r() * 0.3, 5), boneMat);
        bone.rotation.z = (r() - 0.5) * 0.8;
        bone.position.set(bx, h * 0.95, d / 2 + 0.15);
        g.add(bone);
      }
      // Rough wooden palisade stakes at base
      const stakeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3020'), roughness: 0.92 });
      const nStakes  = Math.floor(w / 0.7);
      for (let si = 0; si < nStakes; si++) {
        const sx = -w / 2 + si * (w / nStakes) + (r() - 0.5) * 0.2;
        const sh = 0.8 + r() * 0.5;
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, sh, 5), stakeMat);
        stake.position.set(sx, sh / 2, d / 2 + 0.25);
        stake.rotation.z = (r() - 0.5) * 0.3;
        stake.castShadow = true; g.add(stake);
      }
      break;
    }
    case 'nomadic': {
      // Rope lashings (bands at post junctions)
      const ropeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a08050'), roughness: 0.88 });
      for (let fl = 0; fl < dna.floors; fl++) {
        const by = fl * FLOOR_HEIGHT;
        for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2]] as [number,number][]) {
          const lash = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 4, 8), ropeMat);
          lash.rotation.x = Math.PI / 2;
          lash.position.set(cx, by + 0.3, cz);
          g.add(lash);
        }
      }
      break;
    }
    default:
      break;
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const KIND_BUILDERS: Partial<Record<BuildingKind, (dna: BuildingDNA) => THREE.Group>> = {
  house: buildHouseOrShop, shop: buildHouseOrShop,
  inn:   buildHouseOrShop, guild: buildHouseOrShop,
  terraced:    buildTerraced,
  cottage:     buildCottage,
  villa:       buildVilla,
  tavern:      buildTavern,
  watchtower:  buildWatchtower,
  tower:       buildTower,
  gate:        buildGate,
  blacksmith:  buildBlacksmith,
  chapel:      buildChapel,
  tent:        buildTent,
  market_stall: buildMarketStall,
  apothecary:  buildApothecary,
  ruin:  buildRuin, well: buildWell, barn: buildBarn,
};

// ── Main entry ────────────────────────────────────────────────────────────────

export function buildBuilding(dna: BuildingDNA): BuildingInstance {
  const builder  = KIND_BUILDERS[dna.buildingKind] ?? buildHouseOrShop;
  const fp       = getFootprint(dna.buildingKind, dna.size);
  const fullDna: BuildingDNA = { ...dna, colors: { ...STYLE_COLORS[dna.style], ...dna.colors } };

  const exteriorGroup = builder(fullDna);
  exteriorGroup.rotation.y = dna.rotation;
  exteriorGroup.userData['buildingDna']  = dna;
  exteriorGroup.userData['buildingKind'] = dna.buildingKind;

  return {
    exteriorGroup,
    bounds: {
      halfWidth: fp.w / 2,
      halfDepth: fp.d / 2,
      height:    FLOOR_HEIGHT * dna.floors + fp.w * 0.5,
    },
    dna,
    dispose() {
      exteriorGroup.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach(x => x.dispose());
          else (m as THREE.Material).dispose();
        }
      });
    },
  };
}
