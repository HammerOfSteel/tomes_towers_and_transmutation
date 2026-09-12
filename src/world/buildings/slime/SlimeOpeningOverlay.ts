import * as THREE from 'three';
import { depthFor } from '@/world/buildings/kit/DepthLadder';
import type { OpeningShape } from '@/world/buildings/kit/OpeningParts';
import {
  buildFacetedDripRun,
  buildGelLensInfill,
  buildGelLipCourse,
  buildMembraneSheet,
} from '@/world/buildings/slime/SlimeAccretionKit';
import type { SlimeMaterialSet } from '@/world/buildings/slime/SlimeMaterials';

type OverlayMaterials = Pick<SlimeMaterialSet, 'containedGel' | 'hardenedGel' | 'gelDark' | 'gel'>;

interface BaseOverlayOptions {
  seed: number;
  materials: OverlayMaterials;
  width: number;
  straightHeight: number;
  pointHeight: number;
  cloggingRatio?: number;
  maxCloggingRatio?: number;
  openingShape?: OpeningShape;
  addLip?: boolean;
  addDrip?: boolean;
}

export interface SlimeWindowOverlayOptions extends BaseOverlayOptions {}
export interface SlimeDoorOverlayOptions extends BaseOverlayOptions {}

const EPSILON = 1e-6;
const DEFAULT_CLOGGING_RATIO = 0.3;
const DEFAULT_CLOGGING_CAP = 0.6;
const OVERLAY_RAIL_PROUD = 0.02;
const LIP_CLEARANCE_BELOW_OPENING = 0.14;
const DRIP_CLEARANCE_ABOVE_OPENING = 0.24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function requireObject<T extends THREE.Object3D = THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Expected opening child "${name}"`);
  return object as T;
}

function clearExistingOverlay(root: THREE.Object3D, name: string): void {
  const existing = root.getObjectByName(name);
  if (existing?.parent) existing.parent.remove(existing);
}

function removeChild(root: THREE.Object3D, name: string): void {
  const object = root.getObjectByName(name);
  if (object?.parent) object.parent.remove(object);
}

function objectBoxInRootSpace(root: THREE.Object3D, object: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  object.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  const childMatrix = new THREE.Matrix4();

  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.computeBoundingBox();
    const geometryBox = child.geometry.boundingBox;
    if (!geometryBox) return;
    childMatrix.multiplyMatrices(rootInverse, child.matrixWorld);
    childBox.copy(geometryBox).applyMatrix4(childMatrix);
    box.union(childBox);
  });

  if (box.isEmpty()) throw new Error('Overlay host anchor has no measurable geometry.');
  return box;
}

function areaXYInObjectSpace(object: THREE.Object3D): number {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return Math.max(0, box.max.x - box.min.x) * Math.max(0, box.max.y - box.min.y);
}

function boxInLocalSpace(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function applyAreaCap(overlay: THREE.Object3D, allowedArea: number): number {
  const currentArea = areaXYInObjectSpace(overlay);
  if (currentArea <= EPSILON || currentArea <= allowedArea + EPSILON) return 1;
  const scale = Math.sqrt(allowedArea / currentArea);
  overlay.scale.x *= scale;
  overlay.scale.y *= scale;
  return scale;
}

function getEffectiveCloggingRatio(options: BaseOverlayOptions): number {
  const desired = clamp(options.cloggingRatio ?? DEFAULT_CLOGGING_RATIO, 0, 1);
  const cap = clamp(options.maxCloggingRatio ?? DEFAULT_CLOGGING_CAP, 0, 1);
  return Math.min(desired, cap);
}

function setOverlayMetadata(
  overlay: THREE.Object3D,
  type: 'window' | 'door',
  cloggingRatio: number,
  clearArea: number,
  areaScale: number,
  anchorDepth: number,
): void {
  overlay.userData.overlayType = type;
  overlay.userData.cloggingRatio = cloggingRatio;
  overlay.userData.clearArea = clearArea;
  overlay.userData.anchorDepth = anchorDepth;
  overlay.userData.appliedAreaScale = areaScale;
}

function buildAlignedOverlay(
  name: string,
  anchorDepth: number,
  anchorX: number,
  anchorY: number,
  content: THREE.Group,
  referenceBox: THREE.Box3,
): THREE.Group {
  const overlay = new THREE.Group();
  overlay.name = name;
  overlay.position.set(anchorX, anchorY, anchorDepth);

  const contentBox = boxInLocalSpace(content);
  const referenceForwardExtent = referenceBox.max.z - anchorDepth;
  const contentForwardExtent = contentBox.max.z;
  content.position.z = referenceForwardExtent - contentForwardExtent;
  overlay.add(content);

  return overlay;
}

function addWindowAccents(
  hostOpening: THREE.Group,
  clearBox: THREE.Box3,
  depth: number,
  options: SlimeWindowOverlayOptions,
): void {
  if (options.addLip !== false) {
    clearExistingOverlay(hostOpening, 'slime-window-lip');
    const lip = buildGelLipCourse({
      seed: options.seed ^ 0x11,
      start: new THREE.Vector3(clearBox.min.x, clearBox.min.y - LIP_CLEARANCE_BELOW_OPENING, depth + OVERLAY_RAIL_PROUD),
      end: new THREE.Vector3(clearBox.max.x, clearBox.min.y - LIP_CLEARANCE_BELOW_OPENING, depth + OVERLAY_RAIL_PROUD),
      outwardNormal: new THREE.Vector3(0, 0, 1),
      material: options.materials.hardenedGel,
    });
    lip.name = 'slime-window-lip';
    hostOpening.add(lip);
  }

  if (options.addDrip !== false) {
    clearExistingOverlay(hostOpening, 'slime-window-drip');
    const drip = buildFacetedDripRun({
      seed: options.seed ^ 0x12,
      start: new THREE.Vector3(clearBox.min.x, clearBox.max.y + DRIP_CLEARANCE_ABOVE_OPENING, depth + OVERLAY_RAIL_PROUD * 0.5),
      end: new THREE.Vector3(clearBox.max.x, clearBox.max.y + DRIP_CLEARANCE_ABOVE_OPENING, depth + OVERLAY_RAIL_PROUD * 0.5),
      material: options.materials.gel,
    });
    drip.name = 'slime-window-drip';
    hostOpening.add(drip);
  }
}

function addDoorAccents(
  hostOpening: THREE.Group,
  clearBox: THREE.Box3,
  depth: number,
  options: SlimeDoorOverlayOptions,
): void {
  if (options.addLip !== false) {
    clearExistingOverlay(hostOpening, 'slime-door-lip');
    const lip = buildGelLipCourse({
      seed: options.seed ^ 0x21,
      start: new THREE.Vector3(clearBox.min.x, clearBox.min.y - LIP_CLEARANCE_BELOW_OPENING, depth + OVERLAY_RAIL_PROUD),
      end: new THREE.Vector3(clearBox.max.x, clearBox.min.y - LIP_CLEARANCE_BELOW_OPENING, depth + OVERLAY_RAIL_PROUD),
      outwardNormal: new THREE.Vector3(0, 0, 1),
      material: options.materials.hardenedGel,
    });
    lip.name = 'slime-door-lip';
    hostOpening.add(lip);
  }

  if (options.addDrip !== false) {
    clearExistingOverlay(hostOpening, 'slime-door-drip');
    const drip = buildFacetedDripRun({
      seed: options.seed ^ 0x22,
      start: new THREE.Vector3(clearBox.min.x, clearBox.max.y + DRIP_CLEARANCE_ABOVE_OPENING, depth + OVERLAY_RAIL_PROUD * 0.5),
      end: new THREE.Vector3(clearBox.max.x, clearBox.max.y + DRIP_CLEARANCE_ABOVE_OPENING, depth + OVERLAY_RAIL_PROUD * 0.5),
      material: options.materials.gel,
    });
    drip.name = 'slime-door-drip';
    hostOpening.add(drip);
  }
}

export function applySlimeWindowOverlay(
  hostOpening: THREE.Group,
  options: SlimeWindowOverlayOptions,
): THREE.Group {
  const glazing = requireObject<THREE.Group>(hostOpening, 'glazing');
  const clearBox = objectBoxInRootSpace(hostOpening, glazing);
  const clearWidth = clearBox.max.x - clearBox.min.x;
  const clearHeight = clearBox.max.y - clearBox.min.y;
  const cloggingRatio = getEffectiveCloggingRatio(options);
  const uniformScale = Math.sqrt(cloggingRatio);
  const totalHeight = Math.max(options.straightHeight + options.pointHeight, EPSILON);
  const pointRatio = options.pointHeight / totalHeight;
  const targetHeight = clearHeight * uniformScale;
  const targetPointHeight = targetHeight * pointRatio;
  const targetStraightHeight = Math.max(0.12, targetHeight - targetPointHeight);
  const targetWidth = Math.max(0.12, clearWidth * uniformScale);
  const depth = glazing.position.z ?? depthFor('GLAZING');
  const clearArea = clearWidth * clearHeight;

  clearExistingOverlay(hostOpening, 'slime-window-lens');
  const lensContent = buildGelLensInfill({
    seed: options.seed,
    width: targetWidth,
    straightHeight: targetStraightHeight,
    pointHeight: targetPointHeight,
    openingShape: options.openingShape ?? ((hostOpening.userData.openingShape as OpeningShape | undefined) ?? 'arch'),
    material: options.materials.containedGel,
    rimMaterial: options.materials.hardenedGel,
    ribMaterial: options.materials.gelDark,
    insetDepth: 0,
  });
  const lens = buildAlignedOverlay(
    'slime-window-lens',
    depth,
    (clearBox.min.x + clearBox.max.x) * 0.5,
    clearBox.min.y,
    lensContent,
    clearBox,
  );

  const areaScale = applyAreaCap(lens, clearArea * cloggingRatio);
  setOverlayMetadata(lens, 'window', cloggingRatio, clearArea, areaScale, depth);
  removeChild(hostOpening, 'glazing');
  hostOpening.add(lens);
  addWindowAccents(hostOpening, clearBox, depth, options);

  return hostOpening;
}

export function applySlimeDoorOverlay(
  hostOpening: THREE.Group,
  options: SlimeDoorOverlayOptions,
): THREE.Group {
  const doorLeaf = requireObject<THREE.Group>(hostOpening, 'door-leaf');
  const clearBox = objectBoxInRootSpace(hostOpening, doorLeaf);
  const clearWidth = clearBox.max.x - clearBox.min.x;
  const clearHeight = clearBox.max.y - clearBox.min.y;
  const cloggingRatio = getEffectiveCloggingRatio(options);
  const uniformScale = Math.sqrt(cloggingRatio);
  const targetWidth = Math.max(0.14, clearWidth * uniformScale);
  const targetHeight = Math.max(0.18, clearHeight * uniformScale);
  const depth = doorLeaf.position.z ?? depthFor('GLAZING');
  const clearArea = clearWidth * clearHeight;

  clearExistingOverlay(hostOpening, 'slime-door-membrane');
  const membraneContent = buildMembraneSheet({
    seed: options.seed,
    corners: [
      new THREE.Vector3(-targetWidth / 2, targetHeight, 0),
      new THREE.Vector3(targetWidth / 2, targetHeight, 0),
      new THREE.Vector3(targetWidth / 2, 0, 0),
      new THREE.Vector3(-targetWidth / 2, 0, 0),
    ],
    membraneMaterial: options.materials.containedGel,
    rimMaterial: options.materials.hardenedGel,
    ribMaterial: options.materials.gelDark,
  });
  const membrane = buildAlignedOverlay(
    'slime-door-membrane',
    depth,
    (clearBox.min.x + clearBox.max.x) * 0.5,
    clearBox.min.y,
    membraneContent,
    clearBox,
  );

  const areaScale = applyAreaCap(membrane, clearArea * cloggingRatio);
  setOverlayMetadata(membrane, 'door', cloggingRatio, clearArea, areaScale, depth);
  removeChild(hostOpening, 'door-leaf');
  hostOpening.add(membrane);
  addDoorAccents(hostOpening, clearBox, depth, options);

  return hostOpening;
}
