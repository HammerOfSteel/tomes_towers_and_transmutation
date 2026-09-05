import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { buildStrapSet } from '../kit/MetalBanding';
import type { DwarvenPalette } from './DwarvenMaterials';

/**
 * DwarvenWorkshopProps.ts — the blacksmith flagship's working-yard prop
 * kit: bellows, quench trough, anvil, ore/coal bin, and a tool rack. Every
 * assembly here is composed from multiple distinctly-named real parts
 * (no bare/placeholder sphere-bellows or cylinder-anvil stand-ins), per
 * the doctrine's depth-ladder and "no blob primitives" rules.
 */

export interface BellowsOptions {
  width: number;
  height: number;
  seed: number;
}

/** Builds the bellows housing: a planked wood backboard standing against
 * the forge wall, two wedge-shaped leather bellows plates hinged at their
 * rear edge (built as tapered boxes, not a bare cylinder), a hinge axle,
 * iron straps across the backboard, and a nozzle feeding into the forge
 * mouth. */
export function buildBellows(options: BellowsOptions, palette: DwarvenPalette): THREE.Group {
  const { width, height, seed } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'bellows-housing';

  const backboard = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), palette.wood);
  backboard.name = 'bellows-backboard';
  backboard.castShadow = backboard.receiveShadow = true;
  g.add(backboard);

  // Two leaf plates: tapered boxes (wide at the hinge, narrow at the
  // nozzle end) standing proud of the backboard, angled slightly apart
  // to read as an operable bellows pair rather than a flat sandwich.
  const plateLength = width * 0.85;
  const plateWidth = height * 0.45;
  for (const [tag, sign] of [['a', -1], ['b', 1]] as const) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -plateWidth / 2);
    shape.lineTo(plateLength, -plateWidth * 0.2);
    shape.lineTo(plateLength, plateWidth * 0.2);
    shape.lineTo(0, plateWidth / 2);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 1 });
    const plate = new THREE.Mesh(geometry, palette.wood);
    plate.name = `bellows-plate-${tag}`;
    plate.position.set(-plateLength / 2, sign * plateWidth * 0.35, 0.08 + (sign > 0 ? 0.05 : 0));
    plate.rotation.y = sign * 0.12;
    plate.castShadow = plate.receiveShadow = true;
    g.add(plate);
  }

  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, plateWidth * 1.1, 8), palette.iron);
  hinge.name = 'bellows-hinge-axle';
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(-plateLength / 2, 0, 0.1);
  hinge.castShadow = hinge.receiveShadow = true;
  g.add(hinge);

  const straps = buildStrapSet({ leafWidth: width, leafHeight: height, material: palette.iron, strapCount: 3 + Math.round(rand() * 1) });
  straps.name = 'bellows-straps';
  straps.position.z = 0.032;
  g.add(straps);

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 8), palette.iron);
  nozzle.name = 'bellows-nozzle';
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(plateLength / 2 - width / 2 + 0.05, 0, 0.24);
  nozzle.castShadow = nozzle.receiveShadow = true;
  g.add(nozzle);

  return g;
}

export interface QuenchTroughOptions {
  width: number;
  depth: number;
  height: number;
  seed: number;
}

/** Builds a stone quench trough: 4 thick rim walls (a real hollow basin,
 * not a solid block), a set-back dark water plane inside, a drain slot
 * notch, and an adjacent tongs rack (an upright post + crossbar + a bent
 * rod standing in for hanging tongs). */
export function buildQuenchTrough(options: QuenchTroughOptions, palette: DwarvenPalette): THREE.Group {
  const { width, depth, height, seed } = options;
  void seed;
  const g = new THREE.Group();
  g.name = 'quench-trough';

  const rimThickness = 0.05;
  const wallSpecs: Array<[string, number, number, number, number, number]> = [
    // [name, sizeX, sizeZ, posX, posZ, ...]
    ['trough-wall-front', width + rimThickness * 2, rimThickness, 0, depth / 2, 0],
    ['trough-wall-back', width + rimThickness * 2, rimThickness, 0, -depth / 2, 0],
    ['trough-wall-left', rimThickness, depth, -width / 2, 0, 0],
    ['trough-wall-right', rimThickness, depth, width / 2, 0, 0],
  ];
  for (const [name, sizeX, sizeZ, posX, posZ] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sizeX, height, sizeZ), palette.basalt);
    wall.name = name;
    wall.position.set(posX, height / 2, posZ);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
  }

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.15, depth), palette.basalt);
  floor.name = 'trough-floor';
  floor.position.y = height * 0.075;
  floor.castShadow = floor.receiveShadow = true;
  g.add(floor);

  const water = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.02, depth * 0.92), palette.darkGlass);
  water.name = 'trough-water';
  water.position.y = height * 0.7;
  g.add(water);

  const drain = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, rimThickness * 1.2), palette.soot);
  drain.name = 'trough-drain';
  drain.position.set(0, height * 0.1, -depth / 2);
  g.add(drain);

  const rackPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, height * 1.6, 6), palette.wood);
  rackPost.name = 'tongs-rack';
  rackPost.position.set(width / 2 + 0.15, height * 0.8, 0);
  rackPost.castShadow = rackPost.receiveShadow = true;
  g.add(rackPost);

  const tongsBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.02), palette.iron);
  tongsBar.name = 'tongs-bar';
  tongsBar.position.set(width / 2 + 0.15, height * 1.5, 0);
  tongsBar.castShadow = tongsBar.receiveShadow = true;
  g.add(tongsBar);

  return g;
}

export interface AnvilOptions {
  seed: number;
}

/** Builds an anvil from its three iconic real parts: a wide flat base
 * block, a narrower waist riser, and a tapered horn protruding to one
 * side (a real wedge, not a bare cone). */
export function buildAnvil(options: AnvilOptions, palette: DwarvenPalette): THREE.Group {
  void options;
  const g = new THREE.Group();
  g.name = 'anvil';

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.22), palette.iron);
  base.name = 'anvil-base';
  base.position.y = 0.11;
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), palette.iron);
  waist.name = 'anvil-waist';
  waist.position.y = 0.22 + 0.05;
  waist.castShadow = waist.receiveShadow = true;
  g.add(waist);

  const hornShape = new THREE.Shape();
  hornShape.moveTo(0, -0.09);
  hornShape.lineTo(0.28, -0.02);
  hornShape.lineTo(0.28, 0.02);
  hornShape.lineTo(0, 0.09);
  hornShape.closePath();
  const hornGeometry = new THREE.ExtrudeGeometry(hornShape, { depth: 0.14, bevelEnabled: false, curveSegments: 1 });
  hornGeometry.translate(0, 0, -0.07);
  const horn = new THREE.Mesh(hornGeometry, palette.iron);
  horn.name = 'anvil-horn';
  horn.rotation.x = -Math.PI / 2;
  horn.position.set(0.16, 0.32, 0);
  horn.castShadow = horn.receiveShadow = true;
  g.add(horn);

  return g;
}

export interface OreCoalBinOptions {
  width: number;
  depth: number;
  height: number;
  seed: number;
}

/** Builds a low ore/coal storage bin: a planked crate body with metal
 * straps at its corners, plus several individual irregular stone/coal
 * chunk fragments piled inside (small jittered boxes, never a bare
 * mound/blob primitive). */
export function buildOreCoalBin(options: OreCoalBinOptions, palette: DwarvenPalette): THREE.Group {
  const { width, depth, height, seed } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'ore-coal-bin';

  const crate = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), palette.wood);
  crate.name = 'bin-crate';
  crate.position.y = height / 2;
  crate.castShadow = crate.receiveShadow = true;
  g.add(crate);

  const straps = buildStrapSet({ leafWidth: depth, leafHeight: height, material: palette.iron, strapCount: 3 });
  straps.name = 'bin-straps';
  straps.rotation.y = Math.PI / 2;
  straps.position.set(width / 2 + 0.01, height / 2, 0);
  g.add(straps);

  const chunkCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < chunkCount; i++) {
    const size = 0.06 + rand() * 0.05;
    const chunk = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.8, size * 0.9), palette.soot);
    chunk.name = `bin-chunk-${i}`;
    chunk.position.set(
      (rand() - 0.5) * (width - size),
      height + size * 0.4,
      (rand() - 0.5) * (depth - size),
    );
    chunk.rotation.set(rand() * 0.6, rand() * Math.PI, rand() * 0.6);
    chunk.castShadow = chunk.receiveShadow = true;
    g.add(chunk);
  }

  return g;
}

export interface ToolRackOptions {
  width: number;
  height: number;
  seed: number;
}

/** Builds a tool rack: two upright posts, a horizontal rail, and a few
 * hanging tool silhouettes (thin planked/iron shapes), standing against
 * the forge wall. */
export function buildToolRack(options: ToolRackOptions, palette: DwarvenPalette): THREE.Group {
  const { width, height, seed } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'tool-rack';

  for (const cx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, height, 0.04), palette.wood);
    post.name = `rack-post-${cx}`;
    post.position.set(cx * (width / 2 - 0.02), height / 2, 0);
    post.castShadow = post.receiveShadow = true;
    g.add(post);
  }

  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.04), palette.wood);
  rail.name = 'rack-rail';
  rail.position.y = height * 0.85;
  rail.castShadow = rail.receiveShadow = true;
  g.add(rail);

  const toolCount = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < toolCount; i++) {
    const t = (i + 0.5) / toolCount;
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.02, height * 0.4, 0.06), palette.iron);
    tool.name = `rack-tool-${i}`;
    tool.position.set(-width / 2 + t * width, height * 0.85 - height * 0.2, 0.05);
    tool.castShadow = tool.receiveShadow = true;
    g.add(tool);
  }

  return g;
}
