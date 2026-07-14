/**
 * BuildingGenerator — returns a THREE.Group for each building type.
 *
 * All groups are positioned at the origin (y=0 = ground level).
 * The caller translates them to world-space after the call.
 *
 * Materials use MeshLambertMaterial (consistent with the rest of the game).
 * Per-seed colour variance is applied as a small hue offset so each settlement
 * has a distinct palette feel.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingType } from './BuildingTypes';

// ── Shared geometry cache (module-level, lazy) ────────────────────────────────

let _latheSegments = 12;  // reduce for performance on older hw

// ── Colour palette ─────────────────────────────────────────────────────────────

function _wallColor(rand: () => number): number {
  // Stone palette: warm grey with slight seeded variation
  const base = 0x9a8870;
  const r    = ((base >> 16) & 0xff) + Math.floor((rand() - 0.5) * 24);
  const g    = ((base >>  8) & 0xff) + Math.floor((rand() - 0.5) * 18);
  const b    = ( base        & 0xff) + Math.floor((rand() - 0.5) * 14);
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function _roofColor(rand: () => number): number {
  // Thatch/slate palette: warm amber or dark grey
  if (rand() < 0.55) {
    // thatch — amber
    const v = 0xb89050 + Math.floor((rand() - 0.5) * 16 * 0x010100);
    return v;
  }
  // slate — blue-grey
  return 0x556677 + Math.floor((rand() - 0.5) * 8 * 0x010101);
}

function _mat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

// ── Roof builders ──────────────────────────────────────────────────────────────

/**
 * Thatched dome — quarter-circle LatheGeometry profile.
 * @param radius  base radius of the roof
 * @param height  total height of the dome
 */
function _buildThatchedDome(radius: number, height: number, mat: THREE.Material): THREE.Mesh {
  const pts: THREE.Vector2[] = [];
  const SEG = 8;
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * (Math.PI / 2);
    // slight overhang at the base (radius * 1.12)
    const r = Math.cos(t) * radius * 1.12;
    const y = Math.sin(t) * height;
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.Mesh(new THREE.LatheGeometry(pts, _latheSegments), mat);
}

/**
 * Pointed/pitched roof — tapering cone profile with slight curve.
 */
function _buildPointedRoof(radius: number, height: number, mat: THREE.Material): THREE.Mesh {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(radius * 1.1, 0),
    new THREE.Vector2(radius * 0.7,  height * 0.35),
    new THREE.Vector2(radius * 0.25, height * 0.75),
    new THREE.Vector2(0.04,          height),
  ];
  return new THREE.Mesh(new THREE.LatheGeometry(pts, _latheSegments), mat);
}

/**
 * Spire — very tall narrow cone.
 */
function _buildSpire(baseRadius: number, height: number, mat: THREE.Material): THREE.Mesh {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(baseRadius, 0),
    new THREE.Vector2(baseRadius * 0.5, height * 0.4),
    new THREE.Vector2(baseRadius * 0.15, height * 0.8),
    new THREE.Vector2(0.03, height),
  ];
  return new THREE.Mesh(new THREE.LatheGeometry(pts, _latheSegments), mat);
}

/**
 * Flat parapet — a hollow BoxGeometry frame.
 * Returns a Group (4 merlons + flat top slab).
 */
function _buildFlatParapet(
  w: number, d: number, mat: THREE.Material,
  merlon = true,
): THREE.Group {
  const grp  = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.22, d + 0.3), mat);
  slab.position.y = 0.11;
  grp.add(slab);
  if (merlon) {
    const mH = 0.4;
    const mW = 0.28;
    for (let i = -1; i <= 1; i += 2) {
      for (let j = -1; j <= 1; j += 2) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(mW, mH, mW), mat);
        m.position.set(i * (w / 2 - 0.18), 0.22 + mH / 2, j * (d / 2 - 0.18));
        grp.add(m);
      }
    }
  }
  return grp;
}

// ── Wall builder ───────────────────────────────────────────────────────────────

/** Rectangular wall box with optional window cutouts simulated via colour. */
function _buildBox(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

// ── Building generators ────────────────────────────────────────────────────────

export function generateBuilding(type: BuildingType, seed: number): THREE.Group {
  const rand = mulberry32(seed ^ 0x3C_BA_19_E7);
  switch (type) {
    case 'cottage':      return _makeCottage(rand);
    case 'inn':          return _makeInn(rand);
    case 'market_stall': return _makeMarketStall(rand);
    case 'smithy':       return _makeSmity(rand);
    case 'tavern':       return _makeTavern(rand);
    case 'temple':       return _makeTemple(rand);
    case 'city_hall':    return _makeCityHall(rand);
    case 'guard_tower':  return _makeGuardTower(rand);
    case 'well':         return _makeWell(rand);
    case 'market_cross': return _makeMarketCross(rand);
  }
}

// ── Individual types ──────────────────────────────────────────────────────────

/** Small 1-room dwelling with thatched dome roof. */
function _makeCottage(rand: () => number): THREE.Group {
  const grp      = new THREE.Group();
  const wallMat  = _mat(_wallColor(rand));
  const roofMat  = _mat(_roofColor(rand));

  const w = 3.2 + rand() * 0.6;
  const d = 2.8 + rand() * 0.4;
  const h = 2.0;

  const walls = _buildBox(w, h, d, wallMat);
  walls.position.y = h / 2;
  grp.add(walls);

  const roof = _buildThatchedDome(Math.max(w, d) * 0.52, 1.5 + rand() * 0.4, roofMat);
  roof.position.y = h;
  grp.add(roof);

  // Door — darker inset rectangle on the front face
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.2, 0.12),
    _mat(0x2a1e12),
  );
  door.position.set(0, 0.6, d / 2 + 0.06);
  grp.add(door);

  // Flower boxes on windowsills
  const flowMat = _mat(0x5a3820);
  for (const sx of [-0.9, 0.9]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.18), flowMat);
    box.position.set(sx, 1.05, d / 2 + 0.09);
    grp.add(box);
    // Tiny flower blobs
    for (let i = 0; i < 3; i++) {
      const fl = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 4, 3),
        _mat(0xdd6688 + Math.floor(rand() * 0x003300)),
      );
      fl.position.set(sx + (i - 1) * 0.17, 1.2, d / 2 + 0.09);
      grp.add(fl);
    }
  }

  return grp;
}

/** Two-floor inn with pitched roof and hanging sign. */
function _makeInn(rand: () => number): THREE.Group {
  const grp     = new THREE.Group();
  const wallMat = _mat(_wallColor(rand));
  const roofMat = _mat(_roofColor(rand));

  const w = 5.0 + rand() * 1.0;
  const d = 4.0 + rand() * 0.8;
  const h1 = 2.2;
  const h2 = 2.0;

  // Ground floor
  const floor1 = _buildBox(w, h1, d, wallMat);
  floor1.position.y = h1 / 2;
  grp.add(floor1);

  // Second floor — slightly narrower
  const floor2 = _buildBox(w - 0.2, h2, d - 0.2, _mat(_wallColor(rand)));
  floor2.position.y = h1 + h2 / 2;
  grp.add(floor2);

  // Pitched roof
  const roof = _buildPointedRoof(Math.max(w, d) * 0.54, 2.2 + rand() * 0.5, roofMat);
  roof.position.y = h1 + h2;
  grp.add(roof);

  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.14), _mat(0x3a2010));
  door.position.set(0, 0.8, d / 2 + 0.07);
  grp.add(door);

  // Hanging sign — post + plank
  const postMat = _mat(0x5c3d1e);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), postMat);
  post.position.set(1.0, 2.2, d / 2 + 0.06);
  grp.add(post);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.35, 0.06),
    _mat(0x7a5c3a),
  );
  sign.position.set(1.0, 1.8, d / 2 + 0.04);
  sign.rotation.y = 0.12 + rand() * 0.08;
  grp.add(sign);

  return grp;
}

/** Open-sided market stall — 4 poles + awning + counter. */
function _makeMarketStall(rand: () => number): THREE.Group {
  const grp    = new THREE.Group();
  const wood   = _mat(0x6b4120);
  const canopy = _mat(0xaa3030 + Math.floor(rand() * 3) * 0x002000);

  const w = 3.0 + rand() * 0.5;
  const d = 2.2 + rand() * 0.3;
  const H = 2.0;

  // 4 corner poles
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, H, 5),
        wood,
      );
      pole.position.set(sx * (w / 2 - 0.1), H / 2, sz * (d / 2 - 0.1));
      grp.add(pole);
    }
  }

  // Awning — flat box angled slightly down at front
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.1, d + 0.5), canopy);
  awning.position.set(0, H, 0.1);
  awning.rotation.x = -0.12;
  grp.add(awning);

  // Counter
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.6, 0.3), wood);
  counter.position.set(0, 0.3, d / 2 - 0.1);
  grp.add(counter);

  // Goods on counter — random sphere / box blobs
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + rand() * 0.08, 5, 4),
      _mat(0x774422 + Math.floor(rand() * 6) * 0x100900),
    );
    g.position.set((i - 1) * 0.45, 0.68, d / 2 - 0.05);
    grp.add(g);
  }

  return grp;
}

/** Smithy — rectangular building with chimney and forge glow. */
function _makeSmity(rand: () => number): THREE.Group {
  const grp     = new THREE.Group();
  const wallMat = _mat(_wallColor(rand));

  const w = 4.4 + rand() * 0.6;
  const d = 3.6 + rand() * 0.4;
  const h = 2.4;

  const walls = _buildBox(w, h, d, wallMat);
  walls.position.y = h / 2;
  grp.add(walls);

  // Flat parapet roof
  const parapet = _buildFlatParapet(w, d, wallMat, false);
  parapet.position.y = h;
  grp.add(parapet);

  // Chimney
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.30, 1.6, 6),
    _mat(0x4a4238),
  );
  chimney.position.set(w * 0.3, h + 0.8, -d * 0.25);
  grp.add(chimney);

  // Forge ember glow — emissive sphere inside
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 7, 6),
    new THREE.MeshLambertMaterial({
      color:            0xff4400,
      emissive:         0xff2200,
      emissiveIntensity: 0.9,
    }),
  );
  glow.position.set(w * 0.3, h + 0.35, -d * 0.25);
  grp.add(glow);

  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.14), _mat(0x2a1800));
  door.position.set(0, 0.9, d / 2 + 0.07);
  grp.add(door);

  return grp;
}

/** Tavern — wide 2-floor building with barrel cluster out front. */
function _makeTavern(rand: () => number): THREE.Group {
  const grp     = new THREE.Group();
  const wallMat = _mat(_wallColor(rand));
  const roofMat = _mat(_roofColor(rand));
  const wood    = _mat(0x5c3d1e);

  const w = 6.0 + rand() * 1.0;
  const d = 5.0 + rand() * 0.8;
  const h1 = 2.4;
  const h2 = 2.2;

  const f1 = _buildBox(w, h1, d, wallMat);
  f1.position.y = h1 / 2;
  grp.add(f1);

  const f2 = _buildBox(w - 0.2, h2, d - 0.2, _mat(_wallColor(rand)));
  f2.position.y = h1 + h2 / 2;
  grp.add(f2);

  const roof = _buildPointedRoof(Math.max(w, d) * 0.54, 2.4 + rand() * 0.5, roofMat);
  roof.position.y = h1 + h2;
  grp.add(roof);

  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.14), _mat(0x3a2010));
  door.position.set(0, 0.9, d / 2 + 0.07);
  grp.add(door);

  // Hanging sign
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5), wood);
  post.position.set(1.2, 2.3, d / 2 + 0.05);
  grp.add(post);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.07), wood);
  sign.position.set(1.2, 1.8, d / 2 + 0.05);
  grp.add(sign);

  // Barrel cluster outside the door
  const barMat = _mat(0x5c3822);
  for (let i = 0; i < 3; i++) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.55, 8),
      barMat,
    );
    barrel.position.set(
      -1.0 + i * 0.55 + (rand() - 0.5) * 0.1,
      0.275,
      d / 2 + 0.55 + (rand() - 0.5) * 0.2,
    );
    grp.add(barrel);
    // Barrel hoop ring (TorusGeometry)
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.025, 4, 8),
      _mat(0x2a2010),
    );
    hoop.rotation.x = Math.PI / 2;
    hoop.position.copy(barrel.position).add(new THREE.Vector3(0, 0.12, 0));
    grp.add(hoop);
  }

  return grp;
}

/** Temple — circular column peristyle + dome roof + emissive altar. */
function _makeTemple(rand: () => number): THREE.Group {
  const grp      = new THREE.Group();
  const stoneMat = _mat(0xd0c8b8);
  const domeMat  = _mat(0xc8a060);

  const R       = 4.0;
  const bodyH   = 3.0;
  const COLS    = 8;

  // Central body (cella)
  const body = _buildBox(R * 1.2, bodyH, R * 1.2, stoneMat);
  body.position.y = bodyH / 2;
  grp.add(body);

  // Dome roof
  const dome = _buildThatchedDome(R * 0.7, 2.2 + rand() * 0.4, domeMat);
  dome.position.y = bodyH;
  grp.add(dome);

  // Peristyle columns
  for (let i = 0; i < COLS; i++) {
    const angle  = (i / COLS) * Math.PI * 2;
    const colH   = bodyH + 0.3 + rand() * 0.2;
    const col    = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, colH, 7),
      stoneMat,
    );
    col.position.set(Math.cos(angle) * R * 0.85, colH / 2, Math.sin(angle) * R * 0.85);
    grp.add(col);
    // Column capital
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.24, 0.22, 7),
      stoneMat,
    );
    cap.position.set(Math.cos(angle) * R * 0.85, colH + 0.11, Math.sin(angle) * R * 0.85);
    grp.add(cap);
  }

  // Emissive altar orb
  const altar = new THREE.Mesh(
    new THREE.SphereGeometry(0.30, 8, 6),
    new THREE.MeshLambertMaterial({
      color:            0xffcc44,
      emissive:         0xffaa00,
      emissiveIntensity: 0.75,
    }),
  );
  altar.position.set(0, 0.4, 0);
  grp.add(altar);

  return grp;
}

/** City hall — 3 floors, flat parapet, central spire + arched windows. */
function _makeCityHall(rand: () => number): THREE.Group {
  const grp     = new THREE.Group();
  const wallMat = _mat(0xb0a490 + Math.floor((rand() - 0.5) * 16) * 0x010101);
  const spireMat = _mat(0x6a7a88);

  const w  = 9.0 + rand() * 2.0;
  const d  = 6.0 + rand() * 1.0;
  const fh = [2.6, 2.4, 2.2];  // floor heights
  let y = 0;

  for (let f = 0; f < 3; f++) {
    const fw  = w - f * 0.3;
    const fd  = d - f * 0.2;
    const box = _buildBox(fw, fh[f], fd, wallMat);
    box.position.y = y + fh[f] / 2;
    grp.add(box);
    y += fh[f];
  }

  // Flat parapet
  const totalH = fh[0] + fh[1] + fh[2];
  const parapet = _buildFlatParapet(w - 0.9, d - 0.6, wallMat);
  parapet.position.y = totalH;
  grp.add(parapet);

  // Central spire
  const spire = _buildSpire(0.7, 4.0 + rand() * 0.8, spireMat);
  spire.position.y = totalH + 0.22;
  grp.add(spire);

  // Front door arch — LatheGeometry semicircle
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.16), _mat(0x2a1a0e));
  door.position.set(0, 1.2, d / 2 + 0.08);
  grp.add(door);

  // Arched window profiles on each floor (just coloured rectangles)
  for (let f = 0; f < 2; f++) {
    const fy = fh[0] * (f + 0.5);
    for (const sx of [-2.5, 0, 2.5]) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.9, 0.12),
        _mat(0x2a3040),
      );
      win.position.set(sx, fy, d / 2 + 0.06);
      grp.add(win);
    }
  }

  return grp;
}

/** Guard tower — tall narrow cylinder + battlements. */
function _makeGuardTower(rand: () => number): THREE.Group {
  const grp      = new THREE.Group();
  const stoneMat = _mat(0x5a5248 + Math.floor((rand() - 0.5) * 12) * 0x010101);

  const r      = 1.2 + rand() * 0.3;
  const floors = 4 + Math.floor(rand() * 2);
  const fh     = 2.2;
  const totalH = floors * fh;

  // Tower cylinder
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.05, totalH, 10),
    stoneMat,
  );
  cylinder.position.y = totalH / 2;
  grp.add(cylinder);

  // Battlement ring
  const MERLONS = 8;
  for (let i = 0; i < MERLONS; i++) {
    const angle  = (i / MERLONS) * Math.PI * 2;
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.28), stoneMat);
    merlon.position.set(
      Math.cos(angle) * (r - 0.04),
      totalH + 0.275,
      Math.sin(angle) * (r - 0.04),
    );
    merlon.rotation.y = angle;
    grp.add(merlon);
  }

  // Top ring slab
  const topSlab = new THREE.Mesh(
    new THREE.CylinderGeometry(r + 0.18, r + 0.18, 0.22, 10),
    stoneMat,
  );
  topSlab.position.y = totalH + 0.11;
  grp.add(topSlab);

  // Door opening
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.14), _mat(0x201508));
  door.position.set(0, 0.75, r + 0.07);
  grp.add(door);

  return grp;
}

/** Village well — cylinder surround + mini pitched roof + rope/bucket. */
function _makeWell(rand: () => number): THREE.Group {
  const grp   = new THREE.Group();
  const stone = _mat(0x7a6858);
  const wood  = _mat(0x5c3d1e);

  // Well surround
  const surround = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.75, 0.6, 10),
    stone,
  );
  surround.position.y = 0.3;
  grp.add(surround);

  // Two A-frame posts
  for (const sx of [-0.5, 0.5]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.4, 5),
      wood,
    );
    post.position.set(sx, 0.95, 0);
    post.rotation.z = sx * 0.22;
    grp.add(post);
  }

  // Cross-beam
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5),
    wood,
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.y = 1.55;
  grp.add(beam);

  // Mini pointed roof over the well
  const roof = _buildPointedRoof(0.85, 0.9, _mat(_roofColor(rand)));
  roof.position.y = 1.55;
  grp.add(roof);

  // Rope (line segment approximated as thin cylinder)
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4),
    _mat(0x8a6a30),
  );
  rope.position.set(0, 1.05, 0);
  grp.add(rope);

  // Bucket
  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.22, 7),
    _mat(0x5c3d1e),
  );
  bucket.position.set(0, 0.55, 0);
  grp.add(bucket);

  return grp;
}

/** Market cross — stone plinth + single column + cross-arm. */
function _makeMarketCross(rand: () => number): THREE.Group {
  const grp   = new THREE.Group();
  const stone = _mat(0xb0a090 + Math.floor((rand() - 0.5) * 10) * 0x010101);

  // Plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), stone);
  plinth.position.y = 0.2;
  grp.add(plinth);

  // Step
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.9), stone);
  step.position.y = 0.51;
  grp.add(step);

  // Column shaft
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 3.2, 7),
    stone,
  );
  shaft.position.y = 0.72 + 1.6;
  grp.add(shaft);

  // Cross-arm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.15), stone);
  arm.position.y = 0.72 + 3.0;
  grp.add(arm);

  // Cross top cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), stone);
  cap.position.y = 0.72 + 3.2 + 0.2;
  grp.add(cap);

  return grp;
}
