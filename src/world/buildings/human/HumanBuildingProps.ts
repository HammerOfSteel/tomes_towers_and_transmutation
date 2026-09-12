import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';

/**
 * HumanBuildingProps.ts — the human race's own small-scale prop kit for
 * props that do not already exist as reusable shared-kit modules. Every
 * export below is genuinely human-specific ornament called out in
 * docs/superpowers/specs/2026-09-04-human-buildings-design.md's per-kind
 * "Ornament/props" rows (flower boxes, chopping blocks, benches, hanging
 * trade signs, tool racks, laundry poles, drain spouts, leaning wagon
 * wheels, fabric awnings, banner poles, grave pots/markers, and cellar
 * hatches).
 *
 * Props that already exist as shared kit are reused directly by
 * `HumanBuildingsKit.ts` instead of being duplicated here: shutters
 * (`kit/Shutter.ts`), lanterns (`kit/LanternKit.ts`), barrels/crates/
 * firewood/anvil/coal-bin (`kit/SalvageSpoils.ts`), balcony/deck rails
 * (`kit/Railing.ts`), and chimney stacks (`kit/CorbelledChimneyStack.ts`).
 *
 * Every assembly here is composed from multiple distinctly-named real
 * parts -- doctrine Rule 3 explicitly bans "crate/barrel/sign as one
 * primitive" (no bare box/cylinder/sphere standing in for a whole prop).
 */

export interface FlowerBoxOptions {
  width?: number;
  boxMaterial: THREE.Material;
  soilMaterial?: THREE.Material;
  leafMaterial?: THREE.Material;
  flowerMaterial?: THREE.Material;
  seed?: number;
}

/** Builds a window flower box: a planked planter shell, a soil bed set
 * slightly below the rim, and a scatter of jittered stem+leaf+bloom
 * plants (never a single flat "flowers" decal). */
export function buildFlowerBox(options: FlowerBoxOptions): THREE.Group {
  const {
    width = 0.55,
    boxMaterial,
    soilMaterial = boxMaterial,
    leafMaterial = boxMaterial,
    flowerMaterial = boxMaterial,
    seed = 11,
  } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'flower-box';

  const height = 0.16;
  const depth = 0.18;
  const wallThickness = 0.02;
  const wallSpecs: Array<[string, number, number, number, number]> = [
    ['flowerbox-wall-front', width, wallThickness, 0, depth / 2],
    ['flowerbox-wall-back', width, wallThickness, 0, -depth / 2],
    ['flowerbox-wall-left', wallThickness, depth, -width / 2, 0],
    ['flowerbox-wall-right', wallThickness, depth, width / 2, 0],
  ];
  for (const [name, sx, sz, px, pz] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, height, sz), boxMaterial);
    wall.name = name;
    wall.position.set(px, height / 2, pz);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
  }

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width - wallThickness, 0.02, depth - wallThickness), boxMaterial);
  floor.name = 'flowerbox-floor';
  floor.position.y = 0.01;
  g.add(floor);

  const soil = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.03, depth * 0.8), soilMaterial);
  soil.name = 'flowerbox-soil';
  soil.position.y = height * 0.78;
  g.add(soil);

  const plantCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < plantCount; i++) {
    const plant = new THREE.Group();
    plant.name = `flowerbox-plant-${i}`;
    const stemHeight = 0.1 + rand() * 0.08;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, stemHeight, 5), leafMaterial);
    stem.name = 'stem';
    stem.position.y = stemHeight / 2;
    plant.add(stem);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 5), leafMaterial);
    leaf.name = 'leaf';
    leaf.position.y = stemHeight * 0.55;
    leaf.rotation.z = (rand() - 0.5) * 0.6;
    plant.add(leaf);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), flowerMaterial);
    bloom.name = 'bloom';
    bloom.position.y = stemHeight;
    plant.add(bloom);
    plant.position.set((rand() - 0.5) * (width * 0.75), height * 0.85, (rand() - 0.5) * (depth * 0.4));
    plant.castShadow = plant.receiveShadow = true;
    g.add(plant);
  }

  return g;
}

export interface ChoppingBlockOptions {
  woodMaterial: THREE.Material;
  bladeMaterial?: THREE.Material;
}

/** Builds a chopping block: an octagonal-ish stump slab (an extruded
 * polygon, not a bare cylinder) with a hatchet blade embedded diagonally
 * across its top face. */
export function buildChoppingBlock(options: ChoppingBlockOptions): THREE.Group {
  const { woodMaterial, bladeMaterial = woodMaterial } = options;
  const g = new THREE.Group();
  g.name = 'chopping-block';

  const radius = 0.24;
  const sides = 9;
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const theta = (i / sides) * Math.PI * 2;
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const height = 0.42;
  const stumpGeometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  stumpGeometry.rotateX(-Math.PI / 2);
  const stump = new THREE.Mesh(stumpGeometry, woodMaterial);
  stump.name = 'stump';
  stump.castShadow = stump.receiveShadow = true;
  g.add(stump);

  const axeHead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.03), bladeMaterial);
  axeHead.name = 'axe-head';
  axeHead.position.set(0.05, height + 0.01, 0.02);
  axeHead.rotation.y = Math.PI / 5;
  axeHead.castShadow = axeHead.receiveShadow = true;
  g.add(axeHead);

  const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), woodMaterial);
  axeHandle.name = 'axe-handle';
  axeHandle.position.set(-0.02, height + 0.26, -0.06);
  axeHandle.rotation.set(0.55, Math.PI / 5, 0);
  axeHandle.castShadow = axeHandle.receiveShadow = true;
  g.add(axeHandle);

  return g;
}

export interface BenchOptions {
  width?: number;
  woodMaterial: THREE.Material;
}

/** Builds a simple plank bench: a seat slab, four splayed legs, and a
 * back rail (never a single seat-slab primitive). */
export function buildBench(options: BenchOptions): THREE.Group {
  const { width = 1.0, woodMaterial } = options;
  const g = new THREE.Group();
  g.name = 'bench';

  const seatHeight = 0.42;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.32), woodMaterial);
  seat.name = 'bench-seat';
  seat.position.y = seatHeight;
  seat.castShadow = seat.receiveShadow = true;
  g.add(seat);

  for (const [tag, sx, sz] of [
    ['front-left', -width / 2 + 0.06, 0.13],
    ['front-right', width / 2 - 0.06, 0.13],
    ['back-left', -width / 2 + 0.06, -0.13],
    ['back-right', width / 2 - 0.06, -0.13],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, seatHeight, 0.045), woodMaterial);
    leg.name = `bench-leg-${tag}`;
    leg.position.set(sx, seatHeight / 2, sz);
    leg.rotation.z = sx > 0 ? -0.05 : 0.05;
    leg.castShadow = leg.receiveShadow = true;
    g.add(leg);
  }

  const backRail = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.05, 0.03), woodMaterial);
  backRail.name = 'bench-back-rail';
  backRail.position.set(0, seatHeight + 0.28, -0.15);
  backRail.rotation.x = 0.2;
  backRail.castShadow = backRail.receiveShadow = true;
  g.add(backRail);

  return g;
}

export type TradeIcon = 'none' | 'boot' | 'loaf' | 'mug' | 'shears';

export interface HangingSignOptions {
  bracketMaterial: THREE.Material;
  boardMaterial: THREE.Material;
  icon?: TradeIcon;
  iconMaterial?: THREE.Material;
}

/** Builds a hanging trade sign: a wall bracket arm, two chain links, a
 * planked signboard, and an optional simple trade icon shape mounted on
 * the board face (never a texture-only signboard). */
export function buildHangingSign(options: HangingSignOptions): THREE.Group {
  const { bracketMaterial, boardMaterial, icon = 'none', iconMaterial = boardMaterial } = options;
  const g = new THREE.Group();
  g.name = 'hanging-sign';

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), bracketMaterial);
  arm.name = 'sign-bracket-arm';
  arm.position.set(0.25, 0, 0);
  arm.castShadow = arm.receiveShadow = true;
  g.add(arm);

  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.03), bracketMaterial);
  brace.name = 'sign-bracket-brace';
  brace.position.set(0.16, -0.15, 0);
  brace.rotation.z = Math.PI / 4.2;
  brace.castShadow = brace.receiveShadow = true;
  g.add(brace);

  for (const [tag, x] of [['a', 0.08], ['b', 0.42]] as const) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 5, 8), bracketMaterial);
    link.name = `sign-chain-${tag}`;
    link.rotation.x = Math.PI / 2;
    link.position.set(x, -0.08, 0);
    g.add(link);
  }

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.025), boardMaterial);
  board.name = 'sign-board';
  board.position.set(0.25, -0.34, 0);
  board.castShadow = board.receiveShadow = true;
  g.add(board);

  if (icon !== 'none') {
    const iconGroup = new THREE.Group();
    iconGroup.name = `sign-icon-${icon}`;
    iconGroup.position.set(0.25, -0.34, 0.02);
    if (icon === 'boot') {
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), iconMaterial);
      sole.position.set(0, -0.03, 0);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.02), iconMaterial);
      shaft.position.set(-0.05, 0.06, 0);
      iconGroup.add(sole, shaft);
    } else if (icon === 'loaf') {
      const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.1, 4, 8), iconMaterial);
      loaf.rotation.z = Math.PI / 2;
      const slash = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.022), iconMaterial);
      slash.position.y = 0.045;
      iconGroup.add(loaf, slash);
    } else if (icon === 'mug') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.14, 10), iconMaterial);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 5, 10), iconMaterial);
      handle.position.set(0.08, 0, 0);
      handle.rotation.y = Math.PI / 2;
      iconGroup.add(body, handle);
    } else if (icon === 'shears') {
      const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.01), iconMaterial);
      bladeA.rotation.z = 0.3;
      const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.01), iconMaterial);
      bladeB.rotation.z = -0.3;
      iconGroup.add(bladeA, bladeB);
    }
    g.add(iconGroup);
  }

  return g;
}

export interface ToolRackOptions {
  width?: number;
  height?: number;
  woodMaterial: THREE.Material;
  toolMaterial?: THREE.Material;
  seed?: number;
}

/** Builds a wall-mounted tool rack: two upright posts, a rail, and a few
 * hanging tool silhouettes. */
export function buildToolRack(options: ToolRackOptions): THREE.Group {
  const { width = 0.6, height = 1.1, woodMaterial, toolMaterial = woodMaterial, seed = 8 } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'tool-rack';

  for (const cx of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, height, 0.04), woodMaterial);
    post.name = `rack-post-${cx}`;
    post.position.set(cx * (width / 2 - 0.02), height / 2, 0);
    post.castShadow = post.receiveShadow = true;
    g.add(post);
  }

  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.04), woodMaterial);
  rail.name = 'rack-rail';
  rail.position.y = height * 0.88;
  rail.castShadow = rail.receiveShadow = true;
  g.add(rail);

  const toolCount = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < toolCount; i++) {
    const t = (i + 0.5) / toolCount;
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.02, height * 0.35, 0.05), toolMaterial);
    tool.name = `rack-tool-${i}`;
    tool.position.set(-width / 2 + t * width, height * 0.88 - height * 0.19, 0.05);
    tool.castShadow = tool.receiveShadow = true;
    g.add(tool);
  }

  return g;
}

export interface LaundryPoleOptions {
  height?: number;
  poleMaterial: THREE.Material;
  clothMaterials?: THREE.Material[];
  seed?: number;
}

/** Builds a laundry pole: an upright post, a horizontal crossbar, a taut
 * line, and a few draped cloth panes hanging from it. */
export function buildLaundryPole(options: LaundryPoleOptions): THREE.Group {
  const { height = 2.2, poleMaterial, clothMaterials = [poleMaterial], seed = 13 } = options;
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'laundry-pole';

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, height, 8), poleMaterial);
  post.name = 'laundry-post';
  post.position.y = height / 2;
  post.castShadow = post.receiveShadow = true;
  g.add(post);

  const crossbarWidth = 0.9;
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, crossbarWidth, 6), poleMaterial);
  crossbar.name = 'laundry-crossbar';
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.y = height - 0.1;
  crossbar.castShadow = crossbar.receiveShadow = true;
  g.add(crossbar);

  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, crossbarWidth * 0.96, 4), poleMaterial);
  line.name = 'laundry-line';
  line.rotation.z = Math.PI / 2;
  line.position.y = height - 0.16;
  g.add(line);

  const clothCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < clothCount; i++) {
    const t = (i + 0.5) / clothCount - 0.5;
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.28 + rand() * 0.08),
      clothMaterials[i % clothMaterials.length],
    );
    cloth.name = `laundry-cloth-${i}`;
    cloth.position.set(t * crossbarWidth * 0.8, height - 0.32, 0);
    cloth.rotation.y = (rand() - 0.5) * 0.3;
    cloth.castShadow = cloth.receiveShadow = true;
    g.add(cloth);
  }

  return g;
}

export interface DrainSpoutOptions {
  material: THREE.Material;
}

/** Builds a wall drain spout: a bracketed gutter channel and a
 * downward-angled spout lip. */
export function buildDrainSpout(options: DrainSpoutOptions): THREE.Group {
  const { material } = options;
  const g = new THREE.Group();
  g.name = 'drain-spout';

  const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.07), material);
  gutter.name = 'drain-gutter';
  g.add(gutter);

  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), material);
  bracket.name = 'drain-bracket';
  bracket.position.set(0.15, -0.06, 0.02);
  g.add(bracket);

  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.18, 6), material);
  spout.name = 'drain-spout-lip';
  spout.rotation.x = Math.PI / 2.6;
  spout.position.set(-0.16, -0.1, 0.05);
  spout.castShadow = spout.receiveShadow = true;
  g.add(spout);

  return g;
}

export interface WagonWheelOptions {
  radius?: number;
  material: THREE.Material;
}

/** Builds a cart wheel leaning against a wall: a rim ring, radial
 * spokes, and a hub boss (never a bare torus). */
export function buildWagonWheel(options: WagonWheelOptions): THREE.Group {
  const { radius = 0.42, material } = options;
  const g = new THREE.Group();
  g.name = 'wagon-wheel';

  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 6, 16), material);
  rim.name = 'wheel-rim';
  g.add(rim);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), material);
  hub.name = 'wheel-hub';
  hub.rotation.x = Math.PI / 2;
  g.add(hub);

  const spokeCount = 8;
  for (let i = 0; i < spokeCount; i++) {
    const theta = (i / spokeCount) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.85, 0.03, 0.02), material);
    spoke.name = `wheel-spoke-${i}`;
    spoke.rotation.z = theta;
    g.add(spoke);
  }

  return g;
}

export interface AwningOptions {
  width?: number;
  projection?: number;
  fabricMaterial: THREE.Material;
  ribMaterial?: THREE.Material;
  ribCount?: number;
}

/** Builds a fabric shop awning: a sloped fabric plane, visible rib
 * struts beneath it, and two support poles at the outer edge. */
export function buildAwning(options: AwningOptions): THREE.Group {
  const { width = 1.6, projection = 0.6, fabricMaterial, ribMaterial = fabricMaterial, ribCount = 5 } = options;
  const g = new THREE.Group();
  g.name = 'awning';

  const slopeAngle = 0.35;
  const fabric = new THREE.Mesh(new THREE.PlaneGeometry(width, projection), fabricMaterial);
  fabric.name = 'awning-fabric';
  fabric.rotation.x = -Math.PI / 2 + slopeAngle;
  fabric.position.set(0, -projection * Math.sin(slopeAngle) * 0.5, projection * Math.cos(slopeAngle) * 0.5);
  fabric.castShadow = fabric.receiveShadow = true;
  g.add(fabric);

  for (let i = 0; i < ribCount; i++) {
    const t = ribCount === 1 ? 0.5 : i / (ribCount - 1);
    const x = -width / 2 + t * width;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.025, projection * 0.98, 0.02), ribMaterial);
    rib.name = `awning-rib-${i}`;
    rib.rotation.x = -Math.PI / 2 + slopeAngle;
    rib.position.set(x, -projection * Math.sin(slopeAngle) * 0.5, projection * Math.cos(slopeAngle) * 0.5);
    g.add(rib);
  }

  for (const side of [-1, 1] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 8), ribMaterial);
    pole.name = `awning-pole-${side}`;
    pole.position.set(side * (width / 2 - 0.05), -0.7, projection * Math.cos(slopeAngle) * 0.92);
    pole.castShadow = pole.receiveShadow = true;
    g.add(pole);
  }

  return g;
}

export interface BannerPoleOptions {
  height?: number;
  poleMaterial: THREE.Material;
  bannerMaterial: THREE.Material;
}

/** Builds a banner pole: an upright post, a finial cap, and a draped
 * banner plane with a batten to keep it from reading as a flat decal. */
export function buildBannerPole(options: BannerPoleOptions): THREE.Group {
  const { height = 1.6, poleMaterial, bannerMaterial } = options;
  const g = new THREE.Group();
  g.name = 'banner-pole';

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, height, 8), poleMaterial);
  pole.name = 'pole-shaft';
  pole.position.y = height / 2;
  pole.castShadow = pole.receiveShadow = true;
  g.add(pole);

  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 6), poleMaterial);
  finial.name = 'pole-finial';
  finial.position.y = height + 0.05;
  g.add(finial);

  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.32, height * 0.55), bannerMaterial);
  banner.name = 'banner-cloth';
  banner.position.set(0.18, height * 0.68, 0);
  banner.castShadow = banner.receiveShadow = true;
  g.add(banner);

  const batten = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, height * 0.55, 5), poleMaterial);
  batten.name = 'pole-batten';
  batten.rotation.z = Math.PI / 2;
  batten.position.set(0.18, height * 0.68, 0.012);
  g.add(batten);

  return g;
}

export interface GraveMarkerOptions {
  height?: number;
  material: THREE.Material;
}

/** Builds a simple chapel-yard grave marker: a socketed base plinth and a
 * rounded-top headstone slab. */
export function buildGraveMarker(options: GraveMarkerOptions): THREE.Group {
  const { height = 0.5, material } = options;
  const g = new THREE.Group();
  g.name = 'grave-marker';

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.1), material);
  base.name = 'grave-base';
  base.position.y = 0.025;
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  const shape = new THREE.Shape();
  const w = 0.11;
  shape.moveTo(-w, 0);
  shape.lineTo(-w, height * 0.7);
  shape.absarc(0, height * 0.7, w, Math.PI, 0, true);
  shape.lineTo(w, 0);
  shape.closePath();
  const slabGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 8 });
  slabGeometry.translate(0, 0, -0.025);
  const slab = new THREE.Mesh(slabGeometry, material);
  slab.name = 'grave-slab';
  slab.position.y = 0.05;
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);

  return g;
}

export interface CellarHatchOptions {
  width?: number;
  depth?: number;
  woodMaterial: THREE.Material;
  frameMaterial?: THREE.Material;
}

/** Builds a ground-level cellar hatch: a stone/timber curb frame and two
 * angled planked doors meeting at a raised ridge. */
export function buildCellarHatch(options: CellarHatchOptions): THREE.Group {
  const { width = 1.0, depth = 0.8, woodMaterial, frameMaterial = woodMaterial } = options;
  const g = new THREE.Group();
  g.name = 'cellar-hatch';

  const curbHeight = 0.08;
  const curb = new THREE.Mesh(new THREE.BoxGeometry(width, curbHeight, depth), frameMaterial);
  curb.name = 'hatch-curb';
  curb.position.y = curbHeight / 2;
  curb.castShadow = curb.receiveShadow = true;
  g.add(curb);

  const doorDepth = depth / 2 + 0.02;
  const tilt = 0.3;
  for (const [tag, sign] of [['left', -1], ['right', 1]] as const) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.04, doorDepth), woodMaterial);
    door.name = `hatch-door-${tag}`;
    door.position.set(0, curbHeight + doorDepth * 0.5 * Math.sin(tilt) * 0.5, (sign * doorDepth) / 2);
    door.rotation.x = -sign * tilt;
    door.castShadow = door.receiveShadow = true;
    g.add(door);
  }

  return g;
}
