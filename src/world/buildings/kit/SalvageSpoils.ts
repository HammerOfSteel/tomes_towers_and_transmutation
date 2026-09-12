/**
 * SalvageSpoils.ts — socketed salvage/spoils prop modules (docs/
 * superpowers/specs/2026-09-04-orcish-buildings-design.md section 5:
 * `[SHARED KIT] SalvageSpoils.ts`: "captured shields, tusk/bone finials,
 * banner strips, plank crates, weapon racks, and stave-built kegs as
 * socketable prop modules. Could also serve undead/human bandit ruins
 * later"). Every export assembles multiple distinctly-named parts --
 * doctrine Rule 3 explicitly bans "crate/barrel/sign as one primitive."
 * Building kits place these via `FacadeGrammar`/`ModuleSocket` weighted
 * swaps (design spec: "assembled from salvage and spoils... through named
 * socket/module swaps with weights. They are not random scatter.").
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { buildTaperedLog } from './LashedTimber';

// ---------------------------------------------------------------------
// Tusk / bone
// ---------------------------------------------------------------------

export interface TuskFinialOptions {
  length?: number;
  radius?: number;
  /** Number of straight segments approximating the tusk's curve. Default 3. */
  segments?: number;
  /** Total sideways curve of the tusk tip, in radians. Default ~35deg. */
  curve?: number;
  material: THREE.Material;
}

/**
 * Builds one curved tusk/horn as several short tapered-log segments laid
 * end-to-end at slightly increasing angles (a faceted curve, never a
 * single bare cone) -- design spec: "bone/tusk finials at roof corners,
 * ridge peaks, and watchtower platform corners."
 */
export function buildTuskFinial(options: TuskFinialOptions): THREE.Group {
  const { length = 0.5, radius = 0.05, segments = 3, curve = (35 * Math.PI) / 180, material } = options;
  const g = new THREE.Group();
  g.name = 'tusk-finial';
  const segLen = length / segments;
  const cursor = new THREE.Vector3(0, 0, 0);
  let angle = 0;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const rBase = radius * (1 - t0 * 0.75);
    const rTop = radius * (1 - t1 * 0.75);
    const seg = buildTaperedLog({ length: segLen, radiusBase: rBase, radiusTop: rTop, material, radialSegments: 6 });
    seg.name = `tusk-segment-${i}`;
    // Each segment tilts a bit more than the last, approximating a curve.
    angle += curve / segments;
    const dir = new THREE.Vector3(Math.sin(angle), Math.cos(angle), 0);
    seg.position.copy(cursor).addScaledVector(dir, segLen / 2);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(seg);
    cursor.addScaledVector(dir, segLen);
  }
  return g;
}

export interface SkullTrophyOptions {
  boneMaterial: THREE.Material;
  tuskMaterial?: THREE.Material;
  darkMaterial?: THREE.Material;
  scale?: number;
}

/**
 * Builds a skull-and-tusk trophy mask: a boxy cranium, a narrower jaw,
 * two recessed dark eye sockets, and two small curved tusks -- design
 * spec: "trophy skulls... through named socket/module swaps"; "no skull
 * blobs as primary forms" (Rule 3 / chapel ornament note).
 */
export function buildSkullTrophy(options: SkullTrophyOptions): THREE.Group {
  const { boneMaterial, tuskMaterial = boneMaterial, darkMaterial = boneMaterial, scale = 1 } = options;
  const g = new THREE.Group();
  g.name = 'skull-trophy';
  const s = scale;

  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.26 * s, 0.28 * s), boneMaterial);
  cranium.name = 'skull-cranium';
  cranium.position.y = 0.16 * s;
  cranium.castShadow = cranium.receiveShadow = true;
  g.add(cranium);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.1 * s, 0.22 * s), boneMaterial);
  jaw.name = 'skull-jaw';
  jaw.position.set(0, 0.03 * s, 0.02 * s);
  jaw.castShadow = jaw.receiveShadow = true;
  g.add(jaw);

  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.07 * s, 0.05 * s), darkMaterial);
    socket.name = `skull-eye-socket-${side}`;
    socket.position.set(side * 0.09 * s, 0.18 * s, 0.15 * s);
    g.add(socket);

    const tusk = buildTuskFinial({ length: 0.16 * s, radius: 0.02 * s, segments: 2, material: tuskMaterial });
    tusk.name = `skull-tusk-${side}`;
    tusk.rotation.z = side * 0.3;
    tusk.position.set(side * 0.1 * s, 0.02 * s, 0.2 * s);
    g.add(tusk);
  }

  return g;
}

// ---------------------------------------------------------------------
// Shields / banners / blades
// ---------------------------------------------------------------------

export interface CapturedShieldOptions {
  radius?: number;
  kind?: 'round' | 'kite';
  faceMaterial: THREE.Material;
  rimMaterial?: THREE.Material;
  bossMaterial?: THREE.Material;
}

/**
 * Builds a captured shield trophy: a flat face plate (round or kite
 * silhouette), a proud rim band framing its edge, and a raised boss at
 * its center (design spec: "captured shields... through named socket/
 * module swaps").
 */
export function buildCapturedShield(options: CapturedShieldOptions): THREE.Group {
  const { radius = 0.35, kind = 'round', faceMaterial, rimMaterial = faceMaterial, bossMaterial = faceMaterial } = options;
  const g = new THREE.Group();
  g.name = 'captured-shield';

  let faceGeo: THREE.BufferGeometry;
  let rim: THREE.Mesh;
  if (kind === 'round') {
    faceGeo = new THREE.CircleGeometry(radius, 12);
    rim = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.08, 6, 16), rimMaterial);
  } else {
    const shape = new THREE.Shape();
    shape.moveTo(0, radius);
    shape.lineTo(radius * 0.75, radius * 0.35);
    shape.lineTo(radius * 0.55, -radius * 0.7);
    shape.lineTo(0, -radius);
    shape.lineTo(-radius * 0.55, -radius * 0.7);
    shape.lineTo(-radius * 0.75, radius * 0.35);
    shape.closePath();
    faceGeo = new THREE.ShapeGeometry(shape, 6);
    // Approximate the kite outline's rim as a thin extruded ring by
    // reusing the same shape at a slightly larger scale behind the face.
    const rimShape = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false, curveSegments: 6 });
    rim = new THREE.Mesh(rimShape, rimMaterial);
    rim.scale.set(1.06, 1.06, 1);
    rim.position.z = -0.03;
  }
  const face = new THREE.Mesh(faceGeo, faceMaterial);
  face.name = 'shield-face';
  face.castShadow = face.receiveShadow = true;
  g.add(face);

  rim.name = 'shield-rim';
  rim.castShadow = rim.receiveShadow = true;
  if (kind === 'round') rim.position.z = 0.005;
  g.add(rim);

  const boss = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.16, 8, 6), bossMaterial);
  boss.name = 'shield-boss';
  boss.position.z = 0.05;
  boss.castShadow = boss.receiveShadow = true;
  g.add(boss);

  return g;
}

export interface BannerStripOptions {
  width?: number;
  length?: number;
  poleHeight?: number;
  clothMaterial: THREE.Material;
  poleMaterial: THREE.Material;
  seed?: number;
}

/**
 * Builds a hanging banner: a tapered pole, a small finial cap, and a
 * cloth strip with a gentle per-vertex wave (never a bare flat plane) --
 * design spec: "torn red banner", "captured banner rack".
 */
export function buildBannerStrip(options: BannerStripOptions): THREE.Group {
  const { width = 0.4, length = 0.9, poleHeight = 1.3, clothMaterial, poleMaterial, seed = 1 } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'banner-strip';

  const pole = buildTaperedLog({ length: poleHeight, radiusBase: 0.035, radiusTop: 0.02, material: poleMaterial });
  pole.name = 'banner-pole';
  pole.position.y = poleHeight / 2;
  g.add(pole);

  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 6), poleMaterial);
  finial.name = 'banner-finial';
  finial.position.y = poleHeight + 0.045;
  g.add(finial);

  const clothGeo = new THREE.PlaneGeometry(width, length, 6, 8);
  const pos = clothGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i) / length + 0.5; // 0 at bottom, 1 at top (attached to pole)
    const wave = Math.sin(v * Math.PI * 1.5 + rand() * 0.4) * 0.03 * (1 - v * 0.4);
    pos.setZ(i, wave);
  }
  pos.needsUpdate = true;
  clothGeo.computeVertexNormals();
  const cloth = new THREE.Mesh(clothGeo, clothMaterial);
  cloth.name = 'banner-cloth';
  cloth.position.set(width / 2 + 0.03, poleHeight - length / 2 - 0.05, 0);
  cloth.castShadow = cloth.receiveShadow = true;
  g.add(cloth);

  return g;
}

export interface WeaponRackOptions {
  width?: number;
  height?: number;
  count?: number;
  frameMaterial: THREE.Material;
  bladeMaterial?: THREE.Material;
  seed?: number;
}

/** Builds a weapon rack: two posts, a horizontal rail, and several
 * leaning axe/spear silhouettes (thin tapered wedge shapes, not bare
 * cylinders) -- design spec: "weapon racks... named socket/module
 * swaps". */
export function buildWeaponRack(options: WeaponRackOptions): THREE.Group {
  const { width = 0.7, height = 1.1, count = 4, frameMaterial, bladeMaterial = frameMaterial, seed = 2 } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'weapon-rack';

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, height, 0.04), frameMaterial);
    post.name = `rack-post-${side}`;
    post.position.set(side * (width / 2 - 0.02), height / 2, 0);
    post.castShadow = post.receiveShadow = true;
    g.add(post);
  }

  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.04), frameMaterial);
  rail.name = 'rack-rail';
  rail.position.y = height * 0.35;
  rail.castShadow = rail.receiveShadow = true;
  g.add(rail);

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const bladeLen = height * (0.75 + rand() * 0.2);
    const blade = buildTaperedLog({ length: bladeLen, radiusBase: 0.03, radiusTop: 0.008, material: bladeMaterial, radialSegments: 4 });
    blade.name = `rack-weapon-${i}`;
    blade.position.set(-width / 2 + t * width, height * 0.35 + bladeLen / 2 - 0.05, 0.05);
    blade.rotation.z = (rand() - 0.5) * 0.25;
    blade.castShadow = blade.receiveShadow = true;
    g.add(blade);
  }

  return g;
}

export interface CrossedBladesOptions {
  length?: number;
  bladeMaterial: THREE.Material;
  bindingMaterial?: THREE.Material;
}

/** Builds two crossed blade silhouettes with a binding wrap at their
 * crossing point -- design spec chapel/villa trophy-bay motif "crossed
 * blades". */
export function buildCrossedBlades(options: CrossedBladesOptions): THREE.Group {
  const { length = 0.7, bladeMaterial, bindingMaterial = bladeMaterial } = options;
  const g = new THREE.Group();
  g.name = 'crossed-blades';

  for (const [tag, angle] of [['a', Math.PI / 4], ['b', -Math.PI / 4]] as const) {
    const blade = buildTaperedLog({ length, radiusBase: 0.035, radiusTop: 0.01, material: bladeMaterial, radialSegments: 4 });
    blade.name = `crossed-blade-${tag}`;
    blade.rotation.z = angle;
    g.add(blade);
  }

  const binding = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 10), bindingMaterial);
  binding.name = 'crossed-blades-binding';
  binding.rotation.y = Math.PI / 2;
  g.add(binding);

  return g;
}

// ---------------------------------------------------------------------
// Board / stave goods
// ---------------------------------------------------------------------

export interface PlankCrateOptions {
  width?: number;
  height?: number;
  depth?: number;
  plankCount?: number;
  material: THREE.Material;
  strapMaterial?: THREE.Material;
}

/**
 * Builds a board-built crate: individual plank slats on the front/back
 * faces (a real board-built read, not one solid box), a top lid, and two
 * corner straps -- design spec: "board-built crates" / Rule 3 "no crate...
 * as one primitive."
 */
export function buildPlankCrate(options: PlankCrateOptions): THREE.Group {
  const { width = 0.5, height = 0.45, depth = 0.4, plankCount = 4, material, strapMaterial = material } = options;
  const g = new THREE.Group();
  g.name = 'plank-crate';

  const plankH = height / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const y = i * plankH + plankH / 2;
    for (const face of ['front', 'back'] as const) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, plankH * 0.9, 0.025), material);
      plank.name = `crate-plank-${face}-${i}`;
      plank.position.set(0, y, face === 'front' ? depth / 2 : -depth / 2);
      plank.castShadow = plank.receiveShadow = true;
      g.add(plank);
    }
  }
  for (const side of [-1, 1] as const) {
    const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.025, height, depth), material);
    sidePanel.name = `crate-side-${side}`;
    sidePanel.position.set(side * (width / 2), height / 2, 0);
    sidePanel.castShadow = sidePanel.receiveShadow = true;
    g.add(sidePanel);
  }

  const lid = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.03, depth + 0.04), material);
  lid.name = 'crate-lid';
  lid.position.y = height + 0.015;
  lid.castShadow = lid.receiveShadow = true;
  g.add(lid);

  for (const [tag, y] of [['top', height * 0.85], ['bottom', height * 0.15]] as const) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, 0.04, depth + 0.03), strapMaterial);
    strap.name = `crate-strap-${tag}`;
    strap.position.y = y;
    strap.castShadow = strap.receiveShadow = true;
    g.add(strap);
  }

  return g;
}

export interface StaveKegOptions {
  radius?: number;
  height?: number;
  staveCount?: number;
  material: THREE.Material;
  hoopMaterial?: THREE.Material;
}

/** Builds a stave-built keg: individual slightly-bulged plank staves
 * arranged around a circle (never a bare cylinder primitive), plus top,
 * middle, and bottom hoop bands -- design spec: "stave-built kegs (not
 * cylinders)". */
export function buildStaveKeg(options: StaveKegOptions): THREE.Group {
  const { radius = 0.28, height = 0.5, staveCount = 12, material, hoopMaterial = material } = options;
  const g = new THREE.Group();
  g.name = 'stave-keg';

  const staveWidth = ((2 * Math.PI * radius) / staveCount) * 0.92;
  for (let i = 0; i < staveCount; i++) {
    const theta = (i / staveCount) * Math.PI * 2;
    const stave = new THREE.Mesh(new THREE.BoxGeometry(staveWidth, height, 0.035), material);
    stave.name = `keg-stave-${i}`;
    stave.position.set(Math.sin(theta) * radius, height / 2, Math.cos(theta) * radius);
    stave.rotation.y = theta;
    stave.castShadow = stave.receiveShadow = true;
    g.add(stave);
  }

  for (const [tag, t] of [['top', 0.82], ['mid', 0.5], ['bottom', 0.18]] as const) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(radius * (t === 0.5 ? 1.03 : 1.0), 0.02, 6, 16), hoopMaterial);
    hoop.name = `keg-hoop-${tag}`;
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = height * t;
    hoop.castShadow = hoop.receiveShadow = true;
    g.add(hoop);
  }

  return g;
}

export interface FirewoodBundleOptions {
  logCount?: number;
  length?: number;
  material: THREE.Material;
  seed?: number;
}

/** Builds a firewood stack: several jittered tapered sticks lying in a
 * pile plus a tie band -- design spec: "firewood stack built from
 * tapered sticks." */
export function buildFirewoodBundle(options: FirewoodBundleOptions): THREE.Group {
  const { logCount = 6, length = 0.5, material, seed = 5 } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'firewood-bundle';

  for (let i = 0; i < logCount; i++) {
    const stick = buildTaperedLog({
      length: length * (0.85 + rand() * 0.25),
      radiusBase: 0.035 + rand() * 0.015,
      radiusTop: 0.03 + rand() * 0.01,
      material,
      radialSegments: 6,
    });
    stick.name = `firewood-log-${i}`;
    stick.rotation.z = Math.PI / 2;
    stick.rotation.y = (rand() - 0.5) * 0.5;
    stick.position.set((rand() - 0.5) * 0.15, 0.03 + Math.floor(i / 3) * 0.06, (rand() - 0.5) * 0.15);
    stick.castShadow = stick.receiveShadow = true;
    g.add(stick);
  }

  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 5, 10), material);
  tie.name = 'firewood-tie';
  tie.rotation.y = Math.PI / 2;
  tie.position.y = 0.09;
  g.add(tie);

  return g;
}

export interface HideBundleOptions {
  material: THREE.Material;
  tieMaterial?: THREE.Material;
}

/** Builds a rolled hide bundle: a stubby capped cylinder "roll" plus 2
 * tie bands cinching it -- design spec shop goods socket: "hide
 * bundle". */
export function buildHideBundle(options: HideBundleOptions): THREE.Group {
  const { material, tieMaterial = material } = options;
  const g = new THREE.Group();
  g.name = 'hide-bundle';

  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), material);
  roll.name = 'hide-roll';
  roll.rotation.z = Math.PI / 2;
  roll.position.y = 0.14;
  roll.castShadow = roll.receiveShadow = true;
  g.add(roll);

  for (const [tag, x] of [['a', -0.14], ['b', 0.14]] as const) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.015, 5, 10), tieMaterial);
    tie.name = `hide-bundle-tie-${tag}`;
    tie.rotation.y = Math.PI / 2;
    tie.position.set(x, 0.14, 0);
    g.add(tie);
  }

  return g;
}

// ---------------------------------------------------------------------
// Forge props
// ---------------------------------------------------------------------

export interface AnvilOptions {
  material: THREE.Material;
}

/** Builds an anvil from its three iconic parts: a wide base block, a
 * narrower waist riser, and a tapered horn wedge -- design spec: "anvil
 * built from base+horn+face pieces." */
export function buildAnvil(options: AnvilOptions): THREE.Group {
  const { material } = options;
  const g = new THREE.Group();
  g.name = 'anvil';

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.24), material);
  base.name = 'anvil-base';
  base.position.y = 0.12;
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.18), material);
  waist.name = 'anvil-waist';
  waist.position.y = 0.24 + 0.05;
  waist.castShadow = waist.receiveShadow = true;
  g.add(waist);

  const hornShape = new THREE.Shape();
  hornShape.moveTo(0, -0.1);
  hornShape.lineTo(0.3, -0.02);
  hornShape.lineTo(0.3, 0.02);
  hornShape.lineTo(0, 0.1);
  hornShape.closePath();
  const hornGeometry = new THREE.ExtrudeGeometry(hornShape, { depth: 0.15, bevelEnabled: false, curveSegments: 1 });
  hornGeometry.translate(0, 0, -0.075);
  const horn = new THREE.Mesh(hornGeometry, material);
  horn.name = 'anvil-horn';
  horn.rotation.x = -Math.PI / 2;
  horn.position.set(0.17, 0.34, 0);
  horn.castShadow = horn.receiveShadow = true;
  g.add(horn);

  return g;
}

export interface CoalBinOptions {
  width?: number;
  depth?: number;
  height?: number;
  material: THREE.Material;
  chunkMaterial?: THREE.Material;
  seed?: number;
}

/** Builds a coal/ore bin: a board-built crate body (`buildPlankCrate`)
 * plus a pile of jittered coal chunk fragments -- design spec: "coal
 * bins from plank modules." */
export function buildCoalBin(options: CoalBinOptions): THREE.Group {
  const { width = 0.55, depth = 0.45, height = 0.32, material, chunkMaterial = material, seed = 6 } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'coal-bin';

  const crate = buildPlankCrate({ width, height, depth, plankCount: 3, material });
  crate.name = 'coal-bin-crate';
  g.add(crate);

  const chunkCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < chunkCount; i++) {
    const size = 0.05 + rand() * 0.04;
    const chunk = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.8, size * 0.9), chunkMaterial);
    chunk.name = `coal-chunk-${i}`;
    chunk.position.set((rand() - 0.5) * (width - size), height + size * 0.4, (rand() - 0.5) * (depth - size));
    chunk.rotation.set(rand() * 0.6, rand() * Math.PI, rand() * 0.6);
    chunk.castShadow = chunk.receiveShadow = true;
    g.add(chunk);
  }

  return g;
}

export interface SlagTroughOptions {
  width?: number;
  depth?: number;
  height?: number;
  material: THREE.Material;
}

/** Builds a rough slag/quench trough: 4 thick rim walls forming a real
 * hollow basin (never a solid block), plus a dark slag-pool plane inset
 * inside -- design spec blacksmith prop socket: "slag trough". */
export function buildSlagTrough(options: SlagTroughOptions): THREE.Group {
  const { width = 0.6, depth = 0.4, height = 0.22, material } = options;
  const g = new THREE.Group();
  g.name = 'slag-trough';
  const rimThickness = 0.045;

  const wallSpecs: Array<[string, number, number, number, number]> = [
    ['trough-wall-front', width + rimThickness * 2, rimThickness, 0, depth / 2],
    ['trough-wall-back', width + rimThickness * 2, rimThickness, 0, -depth / 2],
    ['trough-wall-left', rimThickness, depth, -width / 2, 0],
    ['trough-wall-right', rimThickness, depth, width / 2, 0],
  ];
  for (const [name, sx, sz, px, pz] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, height, sz), material);
    wall.name = name;
    wall.position.set(px, height / 2, pz);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
  }

  const pool = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.02, depth * 0.92), material);
  pool.name = 'trough-slag-pool';
  pool.position.y = height * 0.65;
  g.add(pool);

  return g;
}

// ---------------------------------------------------------------------
// Totem / shrine
// ---------------------------------------------------------------------

export interface TotemPoleOptions {
  height?: number;
  material: THREE.Material;
  boneMaterial?: THREE.Material;
  seed?: number;
}

/** Builds a stacked totem pole: a tapered base post, a bone ring collar,
 * a skull-mask trophy segment (`buildSkullTrophy`), and a top tusk
 * finial -- design spec chapel: "stacked totem poles... Totems use
 * carved multi-piece modules; no sphere skull blobs as primary forms." */
export function buildTotemPole(options: TotemPoleOptions): THREE.Group {
  const { height = 1.6, material, boneMaterial = material, seed = 8 } = options;
  void seed;
  const g = new THREE.Group();
  g.name = 'totem-pole';

  const post = buildTaperedLog({ length: height, radiusBase: 0.09, radiusTop: 0.07, material });
  post.name = 'totem-post';
  post.position.y = height / 2;
  g.add(post);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), boneMaterial);
  collar.name = 'totem-collar';
  collar.rotation.x = Math.PI / 2;
  collar.position.y = height * 0.55;
  g.add(collar);

  const mask = buildSkullTrophy({ boneMaterial, tuskMaterial: boneMaterial, darkMaterial: material, scale: 0.85 });
  mask.name = 'totem-mask';
  mask.position.y = height * 0.72;
  g.add(mask);

  const finial = buildTuskFinial({ length: 0.3, radius: 0.035, material: boneMaterial });
  finial.name = 'totem-finial';
  finial.position.y = height;
  g.add(finial);

  return g;
}
