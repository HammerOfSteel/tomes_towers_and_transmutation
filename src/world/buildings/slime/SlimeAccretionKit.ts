import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { finishArchitecturalGeometry, trimExtrudeSettings } from '@/world/buildings/kit/Bevels';
import { buildArchShape } from '@/world/buildings/StoneTowerOpenings';
import {
  GEL_LIP_HEIGHT,
  MEMBRANE_RIM_DEPTH,
  TENDRIL_RADIUS_MIN,
  TENDRIL_RADIUS_MAX,
  PUDDLE_TILE_THICKNESS,
} from './SlimeMaterials';

const EPSILON = 1e-5;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FORWARD = new THREE.Vector3(0, 0, 1);
const DEFAULT_LENS_INSET_DEPTH = -0.20;
const DEFAULT_LENS_THICKNESS = 0.018;

export type SlimeOpeningShape = 'arch' | 'round';

export interface GelLipCourseOptions {
  seed: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  outwardNormal: THREE.Vector3;
  material: THREE.Material;
  plateCount?: number;
}

export interface MembraneSheetOptions {
  seed: number;
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  membraneMaterial: THREE.Material;
  rimMaterial: THREE.Material;
  ribMaterial: THREE.Material;
  sag?: number;
  ribCount?: number;
}

export interface TendrilBridgeOptions {
  seed: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  material: THREE.Material;
  anchorMaterial: THREE.Material;
  startRadius?: number;
  midRadius?: number;
  endRadius?: number;
}

export interface FacetedDripRunOptions {
  seed: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  material: THREE.Material;
  dripCount?: number;
}

export interface GelLensInfillOptions {
  seed: number;
  width: number;
  straightHeight: number;
  pointHeight: number;
  material: THREE.Material;
  rimMaterial: THREE.Material;
  ribMaterial: THREE.Material;
  openingShape?: SlimeOpeningShape;
  insetDepth?: number;
}

export interface PuddleSkirtTilesOptions {
  seed: number;
  center: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
  material: THREE.Material;
  tileCount?: number;
}

export interface ContainedGelVatOptions {
  seed: number;
  radius: number;
  height: number;
  frameMaterial: THREE.Material;
  bandMaterial: THREE.Material;
  gelMaterial: THREE.Material;
  baseMaterial: THREE.Material;
  bandCount?: number;
}

function createModuleGroup(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.userData.moduleType = name;
  return group;
}

function normalizedOrFallback(vector: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  if (vector.lengthSq() <= EPSILON) return fallback.clone().normalize();
  return vector.clone().normalize();
}

function buildXAxisFrame(direction: THREE.Vector3, normalHint = WORLD_FORWARD): {
  xAxis: THREE.Vector3;
  yAxis: THREE.Vector3;
  zAxis: THREE.Vector3;
} {
  const xAxis = normalizedOrFallback(direction, new THREE.Vector3(1, 0, 0));
  let yAxis = WORLD_UP.clone().sub(xAxis.clone().multiplyScalar(WORLD_UP.dot(xAxis)));
  if (yAxis.lengthSq() <= EPSILON) {
    const candidate = normalHint.clone().sub(xAxis.clone().multiplyScalar(normalHint.dot(xAxis)));
    yAxis = candidate.lengthSq() > EPSILON ? candidate : new THREE.Vector3(0, 0, 1);
  }
  yAxis.normalize();
  let zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
  if (zAxis.lengthSq() <= EPSILON) {
    zAxis = normalizedOrFallback(normalHint, WORLD_FORWARD);
    yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
  }
  zAxis.normalize();
  yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
  return { xAxis, yAxis, zAxis };
}

function buildYAxisFrame(direction: THREE.Vector3, normalHint = WORLD_FORWARD): {
  xAxis: THREE.Vector3;
  yAxis: THREE.Vector3;
  zAxis: THREE.Vector3;
} {
  const yAxis = normalizedOrFallback(direction, WORLD_UP);
  let zAxis = normalHint.clone().sub(yAxis.clone().multiplyScalar(normalHint.dot(yAxis)));
  if (zAxis.lengthSq() <= EPSILON) {
    const fallback = Math.abs(yAxis.dot(WORLD_FORWARD)) > 0.95
      ? new THREE.Vector3(1, 0, 0)
      : WORLD_FORWARD.clone();
    zAxis = fallback.sub(yAxis.clone().multiplyScalar(fallback.dot(yAxis)));
  }
  zAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  return { xAxis, yAxis, zAxis };
}

function setBasis(
  object: THREE.Object3D,
  xAxis: THREE.Vector3,
  yAxis: THREE.Vector3,
  zAxis: THREE.Vector3,
  position: THREE.Vector3,
): void {
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  object.quaternion.setFromRotationMatrix(basis);
  object.position.copy(position);
}

function createBorderShape(inner: THREE.Shape, outer: THREE.Shape): THREE.Shape {
  const border = outer.clone();
  border.holes.push(inner);
  return border;
}

function createFinishedExtrude(
  shape: THREE.Shape,
  depth: number,
  beveled = true,
): THREE.BufferGeometry {
  const safeDepth = Math.max(depth, 0.01);
  const bevelSeed = Math.max(0.01, safeDepth * 0.5);
  const settings: THREE.ExtrudeGeometryOptions = beveled
    ? {
        ...trimExtrudeSettings(bevelSeed),
        depth: safeDepth,
        steps: 1,
        bevelEnabled: true,
        bevelSize: Math.min(bevelSeed * 0.25, safeDepth * 0.3),
        bevelThickness: Math.min(bevelSeed * 0.25, safeDepth * 0.3),
      }
    : {
        depth: safeDepth,
        steps: 1,
        bevelEnabled: false,
      };
  return finishArchitecturalGeometry(new THREE.ExtrudeGeometry(shape, settings));
}

function createRegularPolygonShape(
  radiusX: number,
  radiusY: number,
  sides: number,
  rotation = 0,
): THREE.Shape {
  const shape = new THREE.Shape();
  for (let index = 0; index < sides; index++) {
    const angle = rotation + (index / sides) * Math.PI * 2;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function createLipPlateShape(width: number, height: number, rand: () => number): THREE.Shape {
  const leftShoulder = 0.26 + rand() * 0.08;
  const topPeak = 0.84 + rand() * 0.1;
  const rightShoulder = 0.68 + rand() * 0.08;
  const lowerRight = 0.2 + rand() * 0.08;
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.52, -height * 0.18);
  shape.lineTo(-width * leftShoulder, height * 0.56);
  shape.lineTo(-width * 0.04, height * topPeak);
  shape.lineTo(width * rightShoulder, height * 0.62);
  shape.lineTo(width * 0.54, lowerRight * height);
  shape.lineTo(width * 0.12, -height * 0.12);
  shape.lineTo(-width * 0.34, -height * 0.16);
  shape.closePath();
  return shape;
}

function createDripShape(width: number, height: number, rand: () => number): THREE.Shape {
  const shoulder = 0.22 + rand() * 0.05;
  const rightShoulder = 0.28 + rand() * 0.06;
  const tipDepth = 0.46 + rand() * 0.08;
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.34, height * 0.12);
  shape.lineTo(-width * shoulder, height * 0.64);
  shape.lineTo(0, height);
  shape.lineTo(width * rightShoulder, height * 0.58);
  shape.lineTo(width * 0.36, height * 0.06);
  shape.lineTo(width * 0.1, -height * tipDepth);
  shape.lineTo(-width * 0.12, -height * (tipDepth * 0.94));
  shape.closePath();
  return shape;
}

function createPanelShape(
  width: number,
  straightHeight: number,
  pointHeight: number,
  openingShape: SlimeOpeningShape,
): THREE.Shape {
  if (openingShape === 'round') {
    const radius = width * 0.5;
    const shape = new THREE.Shape();
    shape.absarc(0, radius, radius, 0, Math.PI * 2);
    return shape;
  }
  return buildArchShape(width * 0.5, straightHeight, pointHeight);
}

function createSaggingMembraneGeometry(
  corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
  sag: number,
  outwardNormal: THREE.Vector3,
): THREE.BufferGeometry {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const positions: number[] = [];
  const indices: number[] = [];
  const segmentsX = 6;
  const segmentsY = 4;

  for (let y = 0; y <= segmentsY; y++) {
    const v = y / segmentsY;
    for (let x = 0; x <= segmentsX; x++) {
      const u = x / segmentsX;
      const top = topLeft.clone().lerp(topRight, u);
      const bottom = bottomLeft.clone().lerp(bottomRight, u);
      const point = top.lerp(bottom, v);
      const edgeHold = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      point.addScaledVector(WORLD_UP, -sag * edgeHold);
      point.addScaledVector(outwardNormal, 0.008 * edgeHold);
      positions.push(point.x, point.y, point.z);
    }
  }

  for (let y = 0; y < segmentsY; y++) {
    for (let x = 0; x < segmentsX; x++) {
      const a = y * (segmentsX + 1) + x;
      const b = a + 1;
      const c = a + segmentsX + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return finishArchitecturalGeometry(geometry);
}

function createVerticalBar(width: number, height: number, depth: number, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRingBand(
  radius: number,
  thickness: number,
  height: number,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const outer = createRegularPolygonShape(radius + thickness, radius + thickness, 8, Math.PI / 8);
  const inner = createRegularPolygonShape(radius, radius, 8, Math.PI / 8);
  const mesh = new THREE.Mesh(createFinishedExtrude(createBorderShape(inner, outer), height), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildGelLipCourse(options: GelLipCourseOptions): THREE.Group {
  const group = createModuleGroup('gel-lip-course');
  const span = options.end.clone().sub(options.start);
  const length = span.length();
  if (length <= EPSILON) return group;

  const rand = mulberry32(options.seed >>> 0);
  const { xAxis, yAxis, zAxis } = buildXAxisFrame(span, options.outwardNormal);
  setBasis(group, xAxis, yAxis, zAxis, options.start.clone());

  const plateCount = options.plateCount ?? Math.max(4, Math.round(length / 0.32));
  const step = length / Math.max(plateCount - 1, 1);
  const baseWidth = Math.max(step * 0.82, 0.24);

  for (let index = 0; index < plateCount; index++) {
    const plateHeight = GEL_LIP_HEIGHT * (0.82 + rand() * 0.3);
    const plateDepth = 0.055 + rand() * 0.03;
    const plateWidth = baseWidth * (0.92 + rand() * 0.18);
    const geometry = createFinishedExtrude(createLipPlateShape(plateWidth, plateHeight, rand), plateDepth);
    const mesh = new THREE.Mesh(geometry, options.material);
    mesh.name = `gel-lip-plate-${index}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      Math.min(length, Math.max(0, (step * index) + ((rand() - 0.5) * step * 0.22))),
      plateHeight * 0.08,
      0.02 + plateDepth * 0.18,
    );
    mesh.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (rand() - 0.5) * 0.14,
      (rand() - 0.5) * 0.2,
      (rand() - 0.5) * 0.12,
    )));
    group.add(mesh);
  }

  return group;
}

export function buildMembraneSheet(options: MembraneSheetOptions): THREE.Group {
  const group = createModuleGroup('membrane-sheet');
  const rand = mulberry32(options.seed >>> 0);
  const [topLeft, topRight, bottomRight, bottomLeft] = options.corners;
  const horizontal = topRight.clone().sub(topLeft);
  const vertical = bottomLeft.clone().sub(topLeft);
  const outwardNormal = normalizedOrFallback(
    new THREE.Vector3().crossVectors(horizontal, vertical),
    WORLD_FORWARD,
  );
  const sag = options.sag ?? (0.07 + rand() * 0.04);
  const ribCount = options.ribCount ?? Math.max(1, Math.round(horizontal.length() / 0.55));

  group.userData.socketPoints = options.corners.map(corner => corner.toArray());

  const panel = new THREE.Mesh(
    createSaggingMembraneGeometry(options.corners, sag, outwardNormal),
    options.membraneMaterial,
  );
  panel.name = 'membrane-panel';
  panel.castShadow = true;
  panel.receiveShadow = true;
  group.add(panel);

  const rim = createModuleGroup('membrane-rim');
  const rimWidth = 0.07;
  const rimDepth = MEMBRANE_RIM_DEPTH;
  const rimOffset = outwardNormal.clone().multiplyScalar(rimDepth * 0.5);
  const rimSegments = [
    { name: 'membrane-rim-top', start: topLeft, end: topRight },
    { name: 'membrane-rim-right', start: topRight, end: bottomRight },
    { name: 'membrane-rim-bottom', start: bottomLeft, end: bottomRight },
    { name: 'membrane-rim-left', start: topLeft, end: bottomLeft },
  ] as const;

  for (const segment of rimSegments) {
    const direction = segment.end.clone().sub(segment.start);
    const length = direction.length();
    if (length <= EPSILON) continue;
    const { xAxis, yAxis, zAxis } = buildXAxisFrame(direction, outwardNormal);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, rimWidth, rimDepth), options.rimMaterial);
    mesh.name = segment.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    setBasis(mesh, xAxis, yAxis, zAxis, segment.start.clone().lerp(segment.end, 0.5).add(rimOffset));
    rim.add(mesh);
  }
  group.add(rim);

  for (let index = 0; index < ribCount; index++) {
    const u = (index + 1) / (ribCount + 1);
    const top = topLeft.clone().lerp(topRight, u).add(rimOffset);
    const bottom = bottomLeft.clone().lerp(bottomRight, u).add(rimOffset);
    const meshDirection = bottom.clone().sub(top);
    const meshLength = meshDirection.length();
    if (meshLength <= EPSILON) continue;
    const { xAxis, yAxis, zAxis } = buildYAxisFrame(meshDirection, outwardNormal);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, meshLength, 0.028), options.ribMaterial);
    rib.name = `membrane-rib-${index}`;
    rib.castShadow = true;
    rib.receiveShadow = true;
    setBasis(rib, xAxis, yAxis, zAxis, top.clone().lerp(bottom, 0.5));
    group.add(rib);
  }

  return group;
}

export function buildTendrilBridge(options: TendrilBridgeOptions): THREE.Group {
  const group = createModuleGroup('tendril-bridge');
  const span = options.end.clone().sub(options.start);
  const length = span.length();
  if (length <= EPSILON) return group;

  const rand = mulberry32(options.seed >>> 0);
  const { xAxis, yAxis, zAxis } = buildYAxisFrame(span, WORLD_FORWARD);
  setBasis(group, xAxis, yAxis, zAxis, options.start.clone());

  const startRadius = THREE.MathUtils.clamp(
    options.startRadius ?? (TENDRIL_RADIUS_MIN + rand() * 0.018),
    TENDRIL_RADIUS_MIN,
    TENDRIL_RADIUS_MAX,
  );
  const endRadius = THREE.MathUtils.clamp(
    options.endRadius ?? (TENDRIL_RADIUS_MIN + rand() * 0.015),
    TENDRIL_RADIUS_MIN * 0.9,
    TENDRIL_RADIUS_MAX,
  );
  const midRadius = THREE.MathUtils.clamp(
    options.midRadius ?? (Math.max(startRadius, endRadius) + 0.02 + rand() * 0.02),
    Math.max(startRadius, endRadius) + 0.01,
    TENDRIL_RADIUS_MAX,
  );

  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(startRadius, length * 0.06),
    new THREE.Vector2(startRadius * (0.9 + rand() * 0.08), length * 0.2),
    new THREE.Vector2(midRadius, length * 0.5),
    new THREE.Vector2(midRadius * (0.74 + rand() * 0.08), length * 0.78),
    new THREE.Vector2(endRadius, length * 0.94),
    new THREE.Vector2(0, length),
  ];
  const body = new THREE.Mesh(
    finishArchitecturalGeometry(new THREE.LatheGeometry(profile, 7)),
    options.material,
  );
  body.name = 'tendril-bridge-body';
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const anchorThickness = Math.min(0.08, length * 0.08);
  const anchorRadius = Math.max(midRadius * 1.15, startRadius * 1.35);
  const startAnchor = new THREE.Mesh(
    new THREE.CylinderGeometry(anchorRadius * 0.86, anchorRadius, anchorThickness, 6),
    options.anchorMaterial,
  );
  startAnchor.name = 'tendril-anchor-start';
  startAnchor.castShadow = true;
  startAnchor.receiveShadow = true;
  startAnchor.position.y = anchorThickness * 0.5;
  group.add(startAnchor);

  const endAnchor = new THREE.Mesh(
    new THREE.CylinderGeometry(anchorRadius * 0.78, anchorRadius * 0.92, anchorThickness, 6),
    options.anchorMaterial,
  );
  endAnchor.name = 'tendril-anchor-end';
  endAnchor.castShadow = true;
  endAnchor.receiveShadow = true;
  endAnchor.position.y = length - anchorThickness * 0.5;
  group.add(endAnchor);

  return group;
}

export function buildFacetedDripRun(options: FacetedDripRunOptions): THREE.Group {
  const group = createModuleGroup('faceted-drip-run');
  const span = options.end.clone().sub(options.start);
  const length = span.length();
  if (length <= EPSILON) return group;

  const rand = mulberry32(options.seed >>> 0);
  const { xAxis, yAxis, zAxis } = buildXAxisFrame(span, WORLD_FORWARD);
  setBasis(group, xAxis, yAxis, zAxis, options.start.clone());

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.025, 0.04),
    options.material,
  );
  rail.name = 'drip-run-rail';
  rail.position.set(length * 0.5, 0, 0);
  rail.castShadow = true;
  rail.receiveShadow = true;
  group.add(rail);

  const dripCount = options.dripCount ?? Math.max(3, Math.round(length / 0.36));
  const step = length / Math.max(dripCount - 1, 1);

  for (let index = 0; index < dripCount; index++) {
    const dropWidth = 0.11 + rand() * 0.05;
    const dropHeight = 0.17 + rand() * 0.06;
    const dropDepth = 0.04 + rand() * 0.02;
    const mesh = new THREE.Mesh(
      createFinishedExtrude(createDripShape(dropWidth, dropHeight, rand), dropDepth),
      options.material,
    );
    mesh.name = `faceted-drip-${index}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      Math.min(length, Math.max(0, (step * index) + ((rand() - 0.5) * step * 0.18))),
      -dropHeight * 0.28,
      -dropDepth * 0.24,
    );
    mesh.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (rand() - 0.5) * 0.08,
      (rand() - 0.5) * 0.18,
      (rand() - 0.5) * 0.08,
    )));
    group.add(mesh);
  }

  return group;
}

export function buildGelLensInfill(options: GelLensInfillOptions): THREE.Group {
  const group = createModuleGroup('gel-lens-infill');
  const rand = mulberry32(options.seed >>> 0);
  const openingShape = options.openingShape ?? 'arch';
  const insetDepth = options.insetDepth ?? DEFAULT_LENS_INSET_DEPTH;
  group.position.z = insetDepth;
  group.userData.openingShape = openingShape;

  // This module only builds the set-back pane and its own gel ribbing; the
  // full architectural opening frame/sill/mullion stays in OpeningParts.ts.
  const innerShape = createPanelShape(
    options.width * 0.88,
    options.straightHeight * 0.88,
    options.pointHeight * 0.88,
    openingShape,
  );
  const outerShape = createPanelShape(
    options.width,
    options.straightHeight,
    options.pointHeight,
    openingShape,
  );

  const pane = new THREE.Mesh(
    createFinishedExtrude(innerShape, DEFAULT_LENS_THICKNESS, false),
    options.material,
  );
  pane.name = 'gel-lens-pane';
  pane.castShadow = true;
  pane.receiveShadow = true;
  group.add(pane);

  const rim = new THREE.Mesh(
    createFinishedExtrude(createBorderShape(innerShape, outerShape), MEMBRANE_RIM_DEPTH),
    options.rimMaterial,
  );
  rim.name = 'gel-lens-rim';
  rim.position.z = -MEMBRANE_RIM_DEPTH * 0.15;
  rim.castShadow = true;
  rim.receiveShadow = true;
  group.add(rim);

  const ribCount = Math.max(1, Math.round(options.width / 0.4));
  const clearWidth = options.width * 0.74;
  const clearHeight = options.straightHeight + Math.max(0, options.pointHeight * 0.45);
  for (let index = 0; index < ribCount; index++) {
    const rib = createVerticalBar(0.04, clearHeight * 0.78, 0.024, options.ribMaterial, `gel-lens-rib-${index}`);
    const t = ribCount === 1 ? 0.5 : index / (ribCount - 1);
    rib.position.set(
      -clearWidth * 0.5 + clearWidth * t,
      clearHeight * 0.42,
      DEFAULT_LENS_THICKNESS + 0.008 + rand() * 0.004,
    );
    group.add(rib);
  }

  return group;
}

export function buildPuddleSkirtTiles(options: PuddleSkirtTilesOptions): THREE.Group {
  const group = createModuleGroup('puddle-skirt-tiles');
  group.position.copy(options.center);
  const rand = mulberry32(options.seed >>> 0);
  const tileCount = options.tileCount ?? Math.max(7, Math.round((options.radiusX + options.radiusZ) * 4));

  for (let index = 0; index < tileCount; index++) {
    const angle = (index / tileCount) * Math.PI * 2 + (rand() - 0.5) * 0.34;
    const radialX = options.radiusX * (0.52 + rand() * 0.38);
    const radialZ = options.radiusZ * (0.52 + rand() * 0.38);
    const tileWidth = 0.22 + rand() * 0.12;
    const tileDepth = 0.15 + rand() * 0.1;
    const shape = createRegularPolygonShape(
      tileWidth * (0.7 + rand() * 0.18),
      tileDepth * (0.72 + rand() * 0.2),
      5,
      angle * 0.3,
    );
    const mesh = new THREE.Mesh(createFinishedExtrude(shape, PUDDLE_TILE_THICKNESS), options.material);
    mesh.name = `puddle-skirt-tile-${index}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle + (rand() - 0.5) * 0.22;
    mesh.position.set(
      Math.cos(angle) * radialX,
      0.02 + rand() * 0.03,
      Math.sin(angle) * radialZ,
    );
    group.add(mesh);
  }

  return group;
}

export function buildContainedGelVat(options: ContainedGelVatOptions): THREE.Group {
  const group = createModuleGroup('contained-gel-vat');
  const rand = mulberry32(options.seed >>> 0);
  const wallThickness = Math.max(0.055, options.radius * 0.22);
  const bodyHeight = Math.max(0.35, options.height * 0.76);
  const bodyBottom = 0.08;
  const innerRadius = Math.max(options.radius - wallThickness, options.radius * 0.52);

  const outerBody = createRegularPolygonShape(options.radius, options.radius * 0.96, 8, Math.PI / 8);
  const innerBody = createRegularPolygonShape(innerRadius, innerRadius * 0.92, 8, Math.PI / 8);
  const vatBody = new THREE.Mesh(
    createFinishedExtrude(createBorderShape(innerBody, outerBody), bodyHeight),
    options.frameMaterial,
  );
  vatBody.rotation.x = -Math.PI / 2;
  vatBody.position.y = bodyBottom;
  vatBody.name = 'vat-body';
  vatBody.castShadow = true;
  vatBody.receiveShadow = true;
  group.add(vatBody);

  const base = new THREE.Mesh(
    createFinishedExtrude(createRegularPolygonShape(options.radius * 1.08, options.radius, 8, Math.PI / 8), 0.08),
    options.baseMaterial,
  );
  base.rotation.x = -Math.PI / 2;
  base.name = 'vat-base';
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const rim = createRingBand(options.radius * 0.9, wallThickness * 0.42, 0.06, options.bandMaterial, 'vat-rim');
  rim.position.y = bodyBottom + bodyHeight - 0.03;
  group.add(rim);

  const bandCount = options.bandCount ?? 3;
  for (let index = 0; index < bandCount; index++) {
    const band = createRingBand(options.radius * 0.82, wallThickness * 0.28, 0.04, options.bandMaterial, `vat-band-${index}`);
    const t = bandCount === 1 ? 0.5 : index / (bandCount - 1);
    band.position.y = bodyBottom + 0.1 + t * (bodyHeight - 0.22);
    group.add(band);
  }

  const postHeight = bodyHeight + 0.04;
  const postDepth = wallThickness * 0.36;
  for (let index = 0; index < 4; index++) {
    const angle = (index / 4) * Math.PI * 2 + Math.PI / 8;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(postDepth, postHeight, postDepth),
      options.frameMaterial,
    );
    post.name = `vat-post-${index}`;
    post.castShadow = true;
    post.receiveShadow = true;
    post.position.set(
      Math.cos(angle) * options.radius * 0.76,
      bodyBottom + postHeight * 0.5 - 0.02,
      Math.sin(angle) * options.radius * 0.72,
    );
    post.rotation.y = angle + (rand() - 0.5) * 0.08;
    group.add(post);
  }

  const gelCore = new THREE.Mesh(
    createFinishedExtrude(createRegularPolygonShape(innerRadius * 0.9, innerRadius * 0.86, 8, Math.PI / 8), bodyHeight * 0.6, false),
    options.gelMaterial,
  );
  gelCore.rotation.x = -Math.PI / 2;
  gelCore.position.y = bodyBottom + 0.02;
  gelCore.name = 'vat-gel-core';
  gelCore.castShadow = true;
  gelCore.receiveShadow = true;
  group.add(gelCore);

  return group;
}
