import * as THREE from 'three';
import { trimExtrudeSettings, finishArchitecturalGeometry } from './Bevels';
import { depthFor } from './DepthLadder';
import { buildArchShape } from '../StoneTowerOpenings';

export type OpeningShape = 'arch' | 'round';
export type DivisionStyle = 'vertical' | 'cross';

export interface WindowOpeningOptions {
  width: number;
  straightHeight: number;
  pointHeight: number;
  recessDepth: number;
  frameWidth: number;
  frameProud: number;
  wallZ: number;
  stoneMaterial: THREE.Material;
  glazingMaterial: THREE.Material;
  recessMaterial?: THREE.Material;
  openingShape?: OpeningShape;
  divisionStyle?: DivisionStyle;
}

export interface DoorOpeningOptions {
  width: number;
  straightHeight: number;
  pointHeight: number;
  recessDepth: number;
  frameWidth: number;
  frameProud: number;
  wallZ: number;
  stoneMaterial: THREE.Material;
  recessMaterial: THREE.Material;
  woodMaterial: THREE.Material;
}

interface OpeningDepths {
  reveal: number;
  frame: number;
  sillFront: number;
  division: number;
  glazing: number;
}

interface ApertureMetrics {
  clearWidth: number;
  clearStraightHeight: number;
  clearPointHeight: number;
}

// Doctrine Part 2, Rule 2 ("five-piece opening minimum"): recesses must be at
// least one wall block deep (0.12 WU), and surrounds must project at least 30%
// of that recess depth proud of the wall face.
const MIN_RECESS_DEPTH = 0.12;
const MIN_SURROUND_PROUD_RATIO = 0.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildRoundShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, radius, radius, 0, Math.PI * 2);
  return shape;
}

function buildBorderShape(inner: THREE.Shape, outer: THREE.Shape): THREE.Shape {
  const border = outer.clone();
  border.holes.push(inner);
  return border;
}

function getOpeningDepths(recessDepth: number, frameProud: number): OpeningDepths {
  const effectiveRecessDepth = Math.max(recessDepth, MIN_RECESS_DEPTH);
  const reveal = -effectiveRecessDepth;
  const frame = Math.max(frameProud, effectiveRecessDepth * MIN_SURROUND_PROUD_RATIO, depthFor('FRAME'));
  const sillFront = frame + 0.045;
  const glazing = Math.min(depthFor('GLAZING') - 0.002, reveal - 0.04);
  const division = Math.max(depthFor('RECESS'), glazing + 0.08);
  return { reveal, frame, sillFront, division, glazing };
}

function getArchApertureMetrics(width: number, straightHeight: number, pointHeight: number, frameWidth: number): ApertureMetrics {
  const inset = frameWidth * 0.36;
  return {
    clearWidth: Math.max(width - inset * 2, width * 0.62),
    clearStraightHeight: Math.max(straightHeight - inset * 0.9, straightHeight * 0.74),
    clearPointHeight: pointHeight > 0 ? Math.max(pointHeight - inset * 0.5, pointHeight * 0.7) : 0,
  };
}

function createOpeningGroup(name: string, wallZ: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.z = wallZ + depth;
  return group;
}

function createFinishedExtrude(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  return finishArchitecturalGeometry(new THREE.ExtrudeGeometry(shape, {
    ...trimExtrudeSettings(depth / 2),
    depth,
    bevelEnabled: true,
    steps: 1,
  }));
}

function buildSill(width: number, wallZ: number, frameDepth: number, stoneMaterial: THREE.Material): THREE.Group {
  const sill = createOpeningGroup('sill', wallZ, frameDepth + 0.045);
  const overhang = width * 0.08;
  const thickness = clamp(width * 0.11, 0.045, 0.075);
  const rearInset = 0.02;
  const totalDepth = rearInset + sill.position.z - wallZ;

  const sillShape = new THREE.Shape();
  sillShape.moveTo(-width / 2 - overhang, -thickness);
  sillShape.lineTo(-width / 2 - overhang, 0);
  sillShape.lineTo(width / 2 + overhang, 0);
  sillShape.lineTo(width / 2 + overhang, -thickness);
  sillShape.lineTo(-width / 2 - overhang, -thickness);

  const sillMesh = new THREE.Mesh(createFinishedExtrude(sillShape, totalDepth), stoneMaterial);
  sillMesh.position.z = -totalDepth;
  sillMesh.castShadow = sillMesh.receiveShadow = true;
  sill.add(sillMesh);

  const drip = new THREE.Mesh(
    new THREE.BoxGeometry(width + overhang * 1.3, thickness * 0.28, 0.012),
    stoneMaterial,
  );
  drip.position.set(0, -thickness * 0.72, -0.006);
  drip.castShadow = drip.receiveShadow = true;
  sill.add(drip);
  return sill;
}

function buildThreshold(width: number, wallZ: number, frameDepth: number, stoneMaterial: THREE.Material): THREE.Group {
  const threshold = buildSill(width, wallZ, frameDepth, stoneMaterial);
  threshold.name = 'threshold';
  return threshold;
}

function buildArchRecess(
  opts: WindowOpeningOptions,
  depths: OpeningDepths,
  metrics: ApertureMetrics,
  recessMaterial: THREE.Material,
): THREE.Group {
  const outer = buildArchShape(opts.width * 0.5 * 0.96, opts.straightHeight * 0.98, opts.pointHeight > 0 ? opts.pointHeight * 0.95 : 0);
  const inner = buildArchShape(metrics.clearWidth * 0.5, metrics.clearStraightHeight, metrics.clearPointHeight);
  const recess = createOpeningGroup('recess', opts.wallZ, depths.reveal);
  const recessDepth = Math.abs(depths.reveal);
  const recessMesh = new THREE.Mesh(
    finishArchitecturalGeometry(new THREE.ExtrudeGeometry(buildBorderShape(inner, outer), {
      depth: recessDepth,
      bevelEnabled: false,
      steps: 1,
    })),
    recessMaterial,
  );
  recessMesh.castShadow = recessMesh.receiveShadow = true;
  recess.add(recessMesh);
  return recess;
}

function buildArchSurround(opts: WindowOpeningOptions, depths: OpeningDepths): THREE.Group {
  const outer = buildArchShape(opts.width * 0.5 + opts.frameWidth, opts.straightHeight + opts.frameWidth, opts.pointHeight > 0 ? opts.pointHeight + opts.frameWidth : 0);
  const inner = buildArchShape(opts.width * 0.5, opts.straightHeight, opts.pointHeight);
  const surround = createOpeningGroup('surround', opts.wallZ, depths.frame);
  const surroundMesh = new THREE.Mesh(
    finishArchitecturalGeometry(new THREE.ExtrudeGeometry(buildBorderShape(inner, outer), {
      depth: depths.frame,
      bevelEnabled: false,
      steps: 1,
    })),
    opts.stoneMaterial,
  );
  surroundMesh.position.z = -depths.frame;
  surroundMesh.castShadow = surroundMesh.receiveShadow = true;
  surround.add(surroundMesh);
  return surround;
}

function buildArchGlazing(opts: WindowOpeningOptions, depths: OpeningDepths, metrics: ApertureMetrics): THREE.Group {
  const glazing = createOpeningGroup('glazing', opts.wallZ, depths.glazing);
  const glazingDepth = 0.012;
  const glazingShape = buildArchShape(metrics.clearWidth * 0.5 * 0.95, metrics.clearStraightHeight * 0.95, metrics.clearPointHeight > 0 ? metrics.clearPointHeight * 0.92 : 0);
  const glazingMesh = new THREE.Mesh(
    finishArchitecturalGeometry(new THREE.ExtrudeGeometry(glazingShape, {
      depth: glazingDepth,
      bevelEnabled: false,
      steps: 1,
    })),
    opts.glazingMaterial,
  );
  glazingMesh.castShadow = glazingMesh.receiveShadow = true;
  glazing.add(glazingMesh);
  return glazing;
}

function buildArchDivision(opts: WindowOpeningOptions, depths: OpeningDepths, metrics: ApertureMetrics): THREE.Group {
  const division = createOpeningGroup('division', opts.wallZ, depths.division);
  const barThickness = clamp(Math.min(metrics.clearWidth, metrics.clearStraightHeight) * 0.1, 0.04, 0.08);
  const barDepth = 0.018;
  const verticalHeight = metrics.clearStraightHeight + metrics.clearPointHeight * 0.55;

  const vertical = new THREE.Mesh(
    new THREE.BoxGeometry(barThickness, verticalHeight, barDepth),
    opts.stoneMaterial,
  );
  vertical.position.set(0, verticalHeight / 2, barDepth / 2);
  vertical.castShadow = vertical.receiveShadow = true;
  division.add(vertical);

  if ((opts.divisionStyle ?? 'vertical') === 'cross') {
    const crossY = metrics.clearStraightHeight * 0.55;
    const horizontal = new THREE.Mesh(
      new THREE.BoxGeometry(metrics.clearWidth * 0.94, barThickness, barDepth),
      opts.stoneMaterial,
    );
    horizontal.position.set(0, crossY, barDepth / 2);
    horizontal.castShadow = horizontal.receiveShadow = true;
    division.add(horizontal);
  }

  return division;
}

function buildRoundRecess(
  opts: WindowOpeningOptions,
  depths: OpeningDepths,
  clearRadius: number,
  recessMaterial: THREE.Material,
): THREE.Group {
  const recess = createOpeningGroup('recess', opts.wallZ, depths.reveal);
  const outer = buildRoundShape(opts.width * 0.5 * 0.96);
  const inner = buildRoundShape(clearRadius);
  const recessMesh = new THREE.Mesh(
    finishArchitecturalGeometry(new THREE.ExtrudeGeometry(buildBorderShape(inner, outer), {
      depth: Math.abs(depths.reveal),
      bevelEnabled: false,
      steps: 1,
    })),
    recessMaterial,
  );
  recessMesh.castShadow = recessMesh.receiveShadow = true;
  recess.add(recessMesh);
  return recess;
}

function buildRoundSurround(opts: WindowOpeningOptions, depths: OpeningDepths): THREE.Group {
  const surround = createOpeningGroup('surround', opts.wallZ, depths.frame);
  const outer = buildRoundShape(opts.width * 0.5 + opts.frameWidth);
  const inner = buildRoundShape(opts.width * 0.5);
  const mesh = new THREE.Mesh(
    finishArchitecturalGeometry(new THREE.ExtrudeGeometry(buildBorderShape(inner, outer), {
      depth: depths.frame,
      bevelEnabled: false,
      steps: 1,
    })),
    opts.stoneMaterial,
  );
  mesh.position.z = -depths.frame;
  mesh.castShadow = mesh.receiveShadow = true;
  surround.add(mesh);
  return surround;
}

function buildRoundDivision(opts: WindowOpeningOptions, depths: OpeningDepths, clearRadius: number): THREE.Group {
  const division = createOpeningGroup('division', opts.wallZ, depths.division);
  const barThickness = clamp(clearRadius * 0.18, 0.04, 0.075);
  const barDepth = 0.018;

  const vertical = new THREE.Mesh(new THREE.BoxGeometry(barThickness, clearRadius * 1.8, barDepth), opts.stoneMaterial);
  vertical.position.set(0, clearRadius, barDepth / 2);
  vertical.castShadow = vertical.receiveShadow = true;
  division.add(vertical);

  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(clearRadius * 1.8, barThickness, barDepth), opts.stoneMaterial);
  horizontal.position.set(0, clearRadius, barDepth / 2);
  horizontal.castShadow = horizontal.receiveShadow = true;
  division.add(horizontal);

  return division;
}

function buildRoundGlazing(opts: WindowOpeningOptions, depths: OpeningDepths, clearRadius: number): THREE.Group {
  const glazing = createOpeningGroup('glazing', opts.wallZ, depths.glazing);
  const glass = new THREE.Mesh(
    finishArchitecturalGeometry(new THREE.CylinderGeometry(clearRadius * 0.94, clearRadius * 0.94, 0.012, 18)),
    opts.glazingMaterial,
  );
  glass.rotation.x = Math.PI / 2;
  glass.position.set(0, clearRadius, 0.006);
  glass.castShadow = glass.receiveShadow = true;
  glazing.add(glass);
  return glazing;
}

export function buildWindowOpening(opts: WindowOpeningOptions): THREE.Group {
  const opening = new THREE.Group();
  const depths = getOpeningDepths(opts.recessDepth, opts.frameProud);
  const recessMaterial = opts.recessMaterial ?? opts.glazingMaterial;

  if ((opts.openingShape ?? 'arch') === 'round') {
    const clearRadius = Math.max(opts.width * 0.34, opts.width * 0.5 - opts.frameWidth * 0.7);
    opening.add(
      buildRoundRecess(opts, depths, clearRadius, recessMaterial),
      buildRoundSurround(opts, depths),
      buildSill(opts.width * 0.72, opts.wallZ, depths.frame, opts.stoneMaterial),
      buildRoundDivision(opts, depths, clearRadius),
      buildRoundGlazing(opts, depths, clearRadius),
    );
    return opening;
  }

  const metrics = getArchApertureMetrics(opts.width, opts.straightHeight, opts.pointHeight, opts.frameWidth);
  opening.add(
    buildArchRecess(opts, depths, metrics, recessMaterial),
    buildArchSurround(opts, depths),
    buildSill(opts.width, opts.wallZ, depths.frame, opts.stoneMaterial),
    buildArchDivision(opts, depths, metrics),
    buildArchGlazing(opts, depths, metrics),
  );
  return opening;
}

function buildDoorLeaf(opts: DoorOpeningOptions, depths: OpeningDepths): THREE.Group {
  const leaf = createOpeningGroup('door-leaf', opts.wallZ, depths.glazing);
  const metrics = getArchApertureMetrics(opts.width, opts.straightHeight, opts.pointHeight, opts.frameWidth);
  const leafWidth = metrics.clearWidth * 0.94;
  // Keep the planked leaf below the spring line so the rectangular boards do
  // not protrude into the narrowing pointed-arch head at oblique camera angles.
  const leafHeight = metrics.clearStraightHeight;
  const plankCount = clamp(Math.round(opts.width / 0.15), 5, 7);
  const gap = 0.008;
  const plankWidth = (leafWidth - gap * (plankCount - 1)) / plankCount;
  const plankDepth = 0.028;
  const plankBottom = leafHeight / 2;

  for (let index = 0; index < plankCount; index++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(plankWidth, leafHeight, plankDepth),
      opts.woodMaterial,
    );
    plank.name = `plank-${index}`;
    plank.position.set(
      -leafWidth / 2 + plankWidth / 2 + index * (plankWidth + gap),
      plankBottom,
      plankDepth / 2,
    );
    plank.castShadow = plank.receiveShadow = true;
    leaf.add(plank);
  }

  const strapCount = clamp(Math.round(leafHeight / 0.55), 3, 5);
  const strapWidth = leafWidth * 0.96;
  const strapHeight = 0.035;
  for (let index = 0; index < strapCount; index++) {
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(strapWidth, strapHeight, 0.01),
      opts.stoneMaterial,
    );
    strap.name = `strap-${index}`;
    const t = strapCount === 1 ? 0.5 : index / (strapCount - 1);
    strap.position.set(0, leafHeight * (0.18 + t * 0.58), plankDepth + 0.006);
    strap.castShadow = strap.receiveShadow = true;
    leaf.add(strap);
  }

  return leaf;
}

export function buildDoorOpening(opts: DoorOpeningOptions): THREE.Group {
  const opening = new THREE.Group();
  const depths = getOpeningDepths(opts.recessDepth, opts.frameProud);
  const windowLike: WindowOpeningOptions = {
    ...opts,
    glazingMaterial: opts.woodMaterial,
  };
  const metrics = getArchApertureMetrics(opts.width, opts.straightHeight, opts.pointHeight, opts.frameWidth);

  opening.add(
    buildArchRecess(windowLike, depths, metrics, opts.recessMaterial),
    buildArchSurround(windowLike, depths),
    buildThreshold(opts.width * 1.04, opts.wallZ, depths.frame, opts.stoneMaterial),
    buildDoorLeaf(opts, depths),
  );
  return opening;
}
