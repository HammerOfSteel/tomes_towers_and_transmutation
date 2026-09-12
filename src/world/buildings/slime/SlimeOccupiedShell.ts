import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { BLOCK_UNIT } from '@/world/buildings/BlockKit';
import { FLOOR_HEIGHT, type BuildingDNA } from '@/world/buildings/BuildingDNA';
import { finishArchitecturalGeometry } from '@/world/buildings/kit/Bevels';
import type { OpeningShape } from '@/world/buildings/kit/OpeningParts';
import {
  buildIvyAttachmentPoints,
  buildRubbleFromLostBlocks,
  ruinateCourses,
  type BlockPlacementLookup,
  type RuinateResult,
  type WallCourseModel,
} from '@/world/buildings/kit/Ruinate';
import {
  buildContainedGelVat,
  buildFacetedDripRun,
  buildGelLensInfill,
  buildGelLipCourse,
  buildMembraneSheet,
  buildPuddleSkirtTiles,
  buildTendrilBridge,
} from '@/world/buildings/slime/SlimeAccretionKit';
import { applySlimeDoorOverlay, applySlimeWindowOverlay } from '@/world/buildings/slime/SlimeOpeningOverlay';
import {
  MIMIC_FILLET_RADIUS_MAX,
  MIMIC_FILLET_RADIUS_MIN,
  MIMIC_RIDGE_SAG_MAX,
  MIMIC_RIDGE_SAG_MIN,
  createSlimeMaterialSet,
  rollElderHueBlend,
  rollSlimeHueFamily,
  type SlimeMaterialSet,
} from '@/world/buildings/slime/SlimeMaterials';
import {
  SLIME_GENERIC_HOST_CHAMFER_RADIUS,
  pickSlimeHostShell,
  type SlimeHostShellBuiltLayout,
  type SlimeHostShellDescriptor,
} from '@/world/buildings/slime/SlimeHostShells';

/**
 * Generic slime-built shells expose a real `WallCourseModel` + placement lookup
 * via `SlimeHostShells.ts`, so this composer can ruinate the abstract model and
 * remesh the actual block grid with matching deletions. Reused opaque shells
 * (including the direct elven builders) cannot expose their internal block
 * layout here, so they follow a synthetic path: we still run `ruinateCourses()`,
 * but the result only steers overlay density/hook placement/rubble and never
 * deletes the underlying host geometry.
 */

export interface SlimeKindBlueprintOpening {
  kind: 'window' | 'door';
  face: 'front' | 'back' | 'left' | 'right';
  offset: number;
  baseY: number;
  width: number;
  straightHeight: number;
  pointHeight: number;
  openingShape?: OpeningShape;
  cloggingRatio?: number;
}

export type SlimeOverlayModuleType =
  | 'gel-lip-course'
  | 'membrane-sheet'
  | 'tendril-bridge'
  | 'faceted-drip-run'
  | 'gel-lens-infill'
  | 'puddle-skirt-tiles'
  | 'contained-gel-vat';

export type SlimePropType = 'rubble' | 'contained-gel-vat';

export interface SlimeKindBlueprint {
  footprint: {
    width: number;
    depth: number;
    skirtAllowance?: number;
  };
  floors: number;
  openingSchedule: SlimeKindBlueprintOpening[];
  ruinIntensity?: number;
  moduleWeights: Partial<Record<SlimeOverlayModuleType, number>>;
  propWeights: Partial<Record<SlimePropType, number>>;
}

interface PerimeterColumn {
  bx: number;
  bz: number;
  outwardNormal: THREE.Vector3;
  corner: boolean;
}

interface RuinatedShell {
  hostShell: THREE.Group;
  wallModel: WallCourseModel;
  placementLookup: BlockPlacementLookup;
  result: RuinateResult;
  mode: 'destructive-generic-shell' | 'synthetic-overlay-only';
  removedRealBlocksCount: number;
  hostChamferRadius: number;
}

const TRUE_ABANDONED_RUIN_DAMAGE_INTENSITY = 0.4;
const DEFAULT_SLIME_RUIN_INTENSITY = TRUE_ABANDONED_RUIN_DAMAGE_INTENSITY * 0.5;
const HOST_DEPTH_PAD = 0.03;
const MIN_MODULE_VARIETY = 3;
const MODULE_ROLE_NAMES = new Set<SlimeOverlayModuleType>([
  'gel-lip-course',
  'membrane-sheet',
  'tendril-bridge',
  'faceted-drip-run',
  'gel-lens-infill',
  'puddle-skirt-tiles',
  'contained-gel-vat',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mixSeed(seed: number, salt: number): number {
  let mixed = (seed ^ salt) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85EB_CA6B);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xC2B2_AE35);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function isElderKind(kind: BuildingDNA['buildingKind']): boolean {
  return kind === 'villa' || kind === 'chapel' || kind === 'watchtower';
}

function buildPerimeterColumns(bw: number, bd: number): PerimeterColumn[] {
  const outwardNormal = (bx: number, bz: number): THREE.Vector3 => new THREE.Vector3(
    bx === 0 ? -1 : bx === bw - 1 ? 1 : 0,
    0,
    bz === 0 ? -1 : bz === bd - 1 ? 1 : 0,
  ).normalize();

  const columns: PerimeterColumn[] = [];
  const push = (bx: number, bz: number) => {
    columns.push({
      bx,
      bz,
      outwardNormal: outwardNormal(bx, bz),
      corner: (bx === 0 || bx === bw - 1) && (bz === 0 || bz === bd - 1),
    });
  };

  for (let bx = 0; bx < bw; bx++) push(bx, bd - 1);
  for (let bz = bd - 2; bz >= 0; bz--) push(bw - 1, bz);
  for (let bx = bw - 2; bx >= 0; bx--) push(bx, 0);
  for (let bz = 1; bz < bd - 1; bz++) push(0, bz);

  return columns;
}

function buildSyntheticWallData(
  box: THREE.Box3,
  footprint: SlimeKindBlueprint['footprint'],
  floors: number,
  seedPrefix: string,
): { wallModel: WallCourseModel; placementLookup: BlockPlacementLookup } {
  const width = Math.max(footprint.width, BLOCK_UNIT * 2);
  const depth = Math.max(footprint.depth, BLOCK_UNIT * 2);
  const wallHeight = Math.max(BLOCK_UNIT * 2, Math.min(floors * FLOOR_HEIGHT, box.max.y - box.min.y));
  const wallBlocksH = Math.max(2, Math.round(wallHeight / BLOCK_UNIT));
  const bw = Math.max(2, Math.round(width / BLOCK_UNIT));
  const bd = Math.max(2, Math.round(depth / BLOCK_UNIT));
  const columns = buildPerimeterColumns(bw, bd);
  const xStep = Math.max((box.max.x - box.min.x) / bw, BLOCK_UNIT * 0.5);
  const zStep = Math.max((box.max.z - box.min.z) / bd, BLOCK_UNIT * 0.5);
  const courseHeight = wallHeight / wallBlocksH;
  const blocks: WallCourseModel['blocks'] = [];

  columns.forEach((column, index) => {
    for (let course = 0; course < wallBlocksH; course++) {
      blocks.push({
        id: `${seedPrefix}-c${course}-i${index}`,
        course,
        index,
        tags: column.corner ? { corner: true } : undefined,
      });
    }
  });

  const wallModel: WallCourseModel = {
    numCourses: wallBlocksH,
    blocksPerCourse: columns.length,
    blocks,
    leaf: 'outer',
  };

  const placementLookup: BlockPlacementLookup = (block) => {
    const column = columns[block.index]!;
    const center = new THREE.Vector3(
      box.min.x + ((column.bx + 0.5) * xStep),
      box.min.y + ((block.course + 0.5) * courseHeight),
      box.min.z + ((column.bz + 0.5) * zStep),
    );
    const normal = column.outwardNormal.clone();
    const widthAlongWall = Math.abs(normal.z) > Math.abs(normal.x) ? xStep : zStep;
    const depthOutward = Math.min(xStep, zStep) * 0.7;

    return {
      center,
      width: widthAlongWall,
      height: courseHeight,
      depth: depthOutward,
      outwardNormal: normal,
    };
  };

  return { wallModel, placementLookup };
}

function findCompatibleHostOpenings(hostShell: THREE.Object3D): THREE.Group[] {
  const openings: THREE.Group[] = [];
  hostShell.traverse(object => {
    if (!(object instanceof THREE.Group)) return;
    if (!object.userData.hostOpening) return;
    if (!object.getObjectByName('recess') || !object.getObjectByName('surround')) return;
    openings.push(object);
  });
  return openings.sort((left, right) => left.name.localeCompare(right.name));
}

function estimateOpeningMetrics(openingGroup: THREE.Group): {
  width: number;
  straightHeight: number;
  pointHeight: number;
  openingShape: OpeningShape;
} {
  const box = new THREE.Box3().setFromObject(openingGroup);
  const width = Math.max(0.2, box.max.x - box.min.x);
  const totalHeight = Math.max(0.2, box.max.y - box.min.y);
  const openingShape = (openingGroup.userData.openingShape as OpeningShape | undefined) ?? 'arch';
  const pointHeight = openingShape === 'round' ? width * 0.5 : Math.min(totalHeight * 0.24, 0.45);
  return {
    width,
    straightHeight: Math.max(0.12, totalHeight - pointHeight),
    pointHeight,
    openingShape,
  };
}

function defaultOpeningCloggingRatio(blueprint: SlimeKindBlueprint): number {
  const lensWeight = blueprint.moduleWeights['gel-lens-infill'] ?? 0;
  return clamp(0.2 + (lensWeight * 0.35), 0.2, 0.55);
}

function applyOpeningOverlays(
  hostShell: THREE.Group,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): void {
  const openings = findCompatibleHostOpenings(hostShell);
  if (openings.length === 0) return;

  const windowSpecs = blueprint.openingSchedule.filter(opening => opening.kind === 'window');
  const doorSpecs = blueprint.openingSchedule.filter(opening => opening.kind === 'door');
  let windowIndex = 0;
  let doorIndex = 0;

  for (const opening of openings) {
    if (opening.name.startsWith('window-opening')) {
      const spec = windowSpecs[windowIndex++] ?? estimateOpeningMetrics(opening);
      applySlimeWindowOverlay(opening, {
        seed: mixSeed(seed, 0x5710_0000 + windowIndex),
        materials,
        width: spec.width,
        straightHeight: spec.straightHeight,
        pointHeight: spec.pointHeight,
        openingShape: spec.openingShape,
        cloggingRatio: spec.cloggingRatio ?? defaultOpeningCloggingRatio(blueprint),
        addLip: true,
        addDrip: false,
      });
      opening.userData.slimeOverlayApplied = true;
      continue;
    }

    if (opening.name.startsWith('door-opening')) {
      const spec = doorSpecs[doorIndex++] ?? estimateOpeningMetrics(opening);
      applySlimeDoorOverlay(opening, {
        seed: mixSeed(seed, 0xD001_0000 + doorIndex),
        materials,
        width: spec.width,
        straightHeight: spec.straightHeight,
        pointHeight: spec.pointHeight,
        cloggingRatio: spec.cloggingRatio ?? defaultOpeningCloggingRatio(blueprint),
        addLip: true,
        addDrip: false,
      });
      opening.userData.slimeOverlayApplied = true;
    }
  }
}

function resolveOpeningCenter(box: THREE.Box3, opening: SlimeKindBlueprintOpening): THREE.Vector3 {
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;
  const y = box.min.y + opening.baseY;

  switch (opening.face) {
    case 'front':
      return new THREE.Vector3(centerX + opening.offset, y, box.max.z + HOST_DEPTH_PAD);
    case 'back':
      return new THREE.Vector3(centerX + opening.offset, y, box.min.z - HOST_DEPTH_PAD);
    case 'left':
      return new THREE.Vector3(box.min.x - HOST_DEPTH_PAD, y, centerZ + opening.offset);
    case 'right':
      return new THREE.Vector3(box.max.x + HOST_DEPTH_PAD, y, centerZ - opening.offset);
  }
}

function faceNormal(face: SlimeKindBlueprintOpening['face']): THREE.Vector3 {
  switch (face) {
    case 'front': return new THREE.Vector3(0, 0, 1);
    case 'back': return new THREE.Vector3(0, 0, -1);
    case 'left': return new THREE.Vector3(-1, 0, 0);
    case 'right': return new THREE.Vector3(1, 0, 0);
  }
}

function faceRotationY(face: SlimeKindBlueprintOpening['face']): number {
  switch (face) {
    case 'front': return 0;
    case 'back': return Math.PI;
    case 'left': return -Math.PI / 2;
    case 'right': return Math.PI / 2;
  }
}

function buildFacadeLipCourses(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group[] {
  const weight = blueprint.moduleWeights['gel-lip-course'] ?? 0;
  if (weight <= 0 || blueprint.openingSchedule.length === 0) return [];

  const count = Math.min(2, Math.max(1, Math.round(weight * 2)));
  return blueprint.openingSchedule.slice(0, count).map((opening, index) => {
    const center = resolveOpeningCenter(box, opening);
    const alongFace = opening.face === 'front' || opening.face === 'back'
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);
    const halfWidth = opening.width * 0.5;
    const lipY = center.y - 0.14;
    const start = center.clone().addScaledVector(alongFace, -halfWidth);
    const end = center.clone().addScaledVector(alongFace, halfWidth);
    start.y = lipY;
    end.y = lipY;

    const lip = buildGelLipCourse({
      seed: mixSeed(seed, 0x11F0_1000 + index),
      start,
      end,
      outwardNormal: faceNormal(opening.face),
      material: materials.hardenedGel,
      plateCount: Math.max(4, Math.round(opening.width / 0.22)),
    });
    lip.name = `facade-opening-lip-${index}`;
    lip.userData.overlayRole = 'opening-lip';
    return lip;
  });
}

function buildStandaloneLensDisplays(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group[] {
  const weight = blueprint.moduleWeights['gel-lens-infill'] ?? 0;
  if (weight <= 0 || blueprint.openingSchedule.length === 0) return [];

  const windowCandidates = blueprint.openingSchedule.filter(opening => opening.kind === 'window');
  const candidates = (windowCandidates.length > 0 ? windowCandidates : blueprint.openingSchedule)
    .slice(0, Math.min(2, Math.max(1, Math.round(weight * 2))));

  return candidates.map((opening, index) => {
    const lens = buildGelLensInfill({
      seed: mixSeed(seed, 0x61E5_0000 + index),
      width: Math.max(0.22, opening.width * 0.78),
      straightHeight: Math.max(0.18, opening.straightHeight * 0.7),
      pointHeight: Math.max(0, opening.pointHeight * 0.65),
      material: materials.containedGel,
      rimMaterial: materials.hardenedGel,
      ribMaterial: materials.gelDark,
      openingShape: opening.openingShape ?? 'arch',
      insetDepth: 0,
    });

    const center = resolveOpeningCenter(box, opening);
    lens.name = `facade-gel-lens-${index}`;
    lens.position.copy(center.clone().addScaledVector(faceNormal(opening.face), HOST_DEPTH_PAD * 0.5));
    lens.rotation.y = faceRotationY(opening.face);
    lens.userData.overlayRole = 'facade-gel-lens';
    return lens;
  });
}

function buildRoofSagOverlay(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group {
  const rand = mulberry32(seed >>> 0);
  const spanX = Math.min((box.max.x - box.min.x) * 0.82, blueprint.footprint.width * 0.84);
  const spanZ = Math.min((box.max.z - box.min.z) * 0.78, blueprint.footprint.depth * 0.74);
  const halfX = Math.max(0.45, spanX * 0.5);
  const halfZ = Math.max(0.55, spanZ * 0.5);
  const baseY = box.max.y - 0.12;
  const edgeSag = THREE.MathUtils.lerp(MIMIC_RIDGE_SAG_MIN, MIMIC_RIDGE_SAG_MAX, rand());
  const sagRight = rand() < 0.5;
  const lowOffset = sagRight ? -edgeSag : 0;
  const highOffset = sagRight ? 0 : -edgeSag;
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;

  const roof = buildMembraneSheet({
    seed: mixSeed(seed, 0x50AF_0001),
    corners: [
      new THREE.Vector3(centerX - halfX, baseY + highOffset, centerZ - halfZ),
      new THREE.Vector3(centerX + halfX, baseY + lowOffset, centerZ - halfZ),
      new THREE.Vector3(centerX + halfX, baseY + lowOffset, centerZ + halfZ),
      new THREE.Vector3(centerX - halfX, baseY + highOffset, centerZ + halfZ),
    ],
    membraneMaterial: materials.containedGel,
    rimMaterial: materials.hardenedGel,
    ribMaterial: materials.gelDark,
    sag: clamp((blueprint.moduleWeights['membrane-sheet'] ?? 0.5) * 0.08, 0.03, 0.08),
    ribCount: Math.max(2, Math.round(spanX / 0.9)),
  });
  roof.name = 'mimic-roof-sag-overlay';
  roof.userData.overlayRole = 'roof-sag';
  roof.userData.edgeSag = edgeSag;
  roof.userData.sagSide = sagRight ? 'right' : 'left';
  return roof;
}

function buildMandatoryDripRuns(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group[] {
  const rand = mulberry32(seed >>> 0);
  const count = 1 + Math.floor(rand() * 3);
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;
  const y = box.max.y - 0.28;
  const halfWidth = blueprint.footprint.width * 0.46;
  const halfDepth = blueprint.footprint.depth * 0.46;

  return Array.from({ length: count }, (_unused, index) => {
    const faceIndex = index % 4;
    let start: THREE.Vector3;
    let end: THREE.Vector3;

    if (faceIndex === 0) {
      const xCenter = centerX + ((rand() - 0.5) * blueprint.footprint.width * 0.25);
      start = new THREE.Vector3(xCenter - 0.4, y, centerZ + halfDepth);
      end = new THREE.Vector3(xCenter + 0.4, y, centerZ + halfDepth);
    } else if (faceIndex === 1) {
      const xCenter = centerX + ((rand() - 0.5) * blueprint.footprint.width * 0.25);
      start = new THREE.Vector3(xCenter - 0.36, y - 0.02, centerZ - halfDepth);
      end = new THREE.Vector3(xCenter + 0.36, y - 0.02, centerZ - halfDepth);
    } else if (faceIndex === 2) {
      const zCenter = centerZ + ((rand() - 0.5) * blueprint.footprint.depth * 0.22);
      start = new THREE.Vector3(centerX - halfWidth, y - 0.01, zCenter - 0.34);
      end = new THREE.Vector3(centerX - halfWidth, y - 0.01, zCenter + 0.34);
    } else {
      const zCenter = centerZ + ((rand() - 0.5) * blueprint.footprint.depth * 0.22);
      start = new THREE.Vector3(centerX + halfWidth, y - 0.03, zCenter - 0.34);
      end = new THREE.Vector3(centerX + halfWidth, y - 0.03, zCenter + 0.34);
    }

    const drip = buildFacetedDripRun({
      seed: mixSeed(seed, 0xD610_1000 + index),
      start,
      end,
      material: materials.gel,
      dripCount: Math.max(3, Math.round((blueprint.moduleWeights['faceted-drip-run'] ?? 0.4) * 8)),
    });
    drip.name = `mandatory-drip-run-${index}`;
    drip.userData.overlayRole = 'mandatory-drip';
    drip.userData.dripRole = 'mandatory-mimic';
    return drip;
  });
}

function buildTendrilOverlays(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  wallModel: WallCourseModel,
  result: RuinateResult,
  placementLookup: BlockPlacementLookup,
  seed: number,
): THREE.Group[] {
  const weight = blueprint.moduleWeights['tendril-bridge'] ?? 0;
  if (weight <= 0) return [];

  const rand = mulberry32(seed >>> 0);
  const desiredCount = Math.min(3, Math.max(1, Math.round(weight * 3)));
  const hooks = buildIvyAttachmentPoints(wallModel, result, placementLookup, {
    seed: mixSeed(seed, 0x1F10_0000),
    density: clamp(weight + 0.15, 0.35, 0.9),
  });
  const fallbacks = [
    {
      position: new THREE.Vector3(box.min.x + 0.25, box.min.y + 0.7, box.max.z - 0.25),
      normal: new THREE.Vector3(-1, 0, 1).normalize(),
    },
    {
      position: new THREE.Vector3(box.max.x - 0.25, box.min.y + 0.95, box.min.z + 0.25),
      normal: new THREE.Vector3(1, 0, -1).normalize(),
    },
  ];
  const selectedHooks = hooks.length > 0
    ? hooks.slice(0, desiredCount)
    : fallbacks.slice(0, desiredCount).map((fallback, index) => ({
      id: `fallback-tendril-${index}`,
      position: fallback.position,
      normal: fallback.normal,
      course: 0,
      index,
    }));

  return selectedHooks.map((hook, index) => {
    const end = hook.position.clone().add(
      new THREE.Vector3(
        -hook.normal.x * 0.22,
        0.8 + (rand() * 0.75),
        -hook.normal.z * 0.22,
      ),
    );
    end.x = clamp(end.x, box.min.x + 0.18, box.max.x - 0.18);
    end.z = clamp(end.z, box.min.z + 0.18, box.max.z - 0.18);
    end.y = clamp(end.y, hook.position.y + 0.45, box.max.y - 0.04);

    const bridge = buildTendrilBridge({
      seed: mixSeed(seed, 0x7EAD_0000 + index),
      start: hook.position.clone(),
      end,
      material: materials.gelDark,
      anchorMaterial: materials.hardenedGel,
    });
    bridge.name = `slime-tendril-bridge-${index}`;
    bridge.userData.overlayRole = 'tendril-bridge';
    return bridge;
  });
}

function buildPuddleSkirt(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group | null {
  const weight = blueprint.moduleWeights['puddle-skirt-tiles'] ?? 0;
  if (weight <= 0) return null;

  const skirtAllowance = blueprint.footprint.skirtAllowance ?? 0.35;
  const skirt = buildPuddleSkirtTiles({
    seed,
    center: new THREE.Vector3(
      (box.min.x + box.max.x) * 0.5,
      box.min.y,
      (box.min.z + box.max.z) * 0.5,
    ),
    radiusX: (blueprint.footprint.width * 0.5) + skirtAllowance * 0.82,
    radiusZ: (blueprint.footprint.depth * 0.5) + skirtAllowance * 0.82,
    material: materials.gelDark,
    tileCount: Math.max(7, Math.round(8 + (weight * 10))),
  });
  skirt.name = 'slime-puddle-skirt';
  skirt.userData.overlayRole = 'puddle-skirt';
  return skirt;
}

function buildContainedVatProp(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group | null {
  const weight = Math.max(
    blueprint.propWeights['contained-gel-vat'] ?? 0,
    blueprint.moduleWeights['contained-gel-vat'] ?? 0,
  );
  if (weight <= 0) return null;

  const vat = buildContainedGelVat({
    seed,
    radius: clamp(0.28 + (weight * 0.22), 0.28, 0.42),
    height: 0.9 + (weight * 0.45),
    frameMaterial: materials.hardenedGel,
    bandMaterial: materials.gelDark,
    gelMaterial: materials.containedGel,
    baseMaterial: materials.wetStain,
    bandCount: 2 + Math.round(weight * 2),
  });
  vat.name = 'slime-contained-vat';
  vat.position.set(
    (box.min.x + box.max.x) * 0.5 + Math.min(0.35, blueprint.footprint.width * 0.12),
    box.min.y,
    (box.min.z + box.max.z) * 0.5 - Math.min(0.35, blueprint.footprint.depth * 0.14),
  );
  vat.userData.overlayRole = 'contained-vat';
  return vat;
}

function collectModuleTypes(root: THREE.Object3D): Set<SlimeOverlayModuleType> {
  const types = new Set<SlimeOverlayModuleType>();
  root.traverse(object => {
    const moduleType = object.userData.moduleType as SlimeOverlayModuleType | undefined;
    if (moduleType && MODULE_ROLE_NAMES.has(moduleType)) {
      types.add(moduleType);
    }
  });
  return types;
}

function buildFallbackPuddleSkirt(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group {
  const skirtAllowance = blueprint.footprint.skirtAllowance ?? 0.35;
  const skirt = buildPuddleSkirtTiles({
    seed,
    center: new THREE.Vector3(
      (box.min.x + box.max.x) * 0.5,
      box.min.y,
      (box.min.z + box.max.z) * 0.5,
    ),
    radiusX: (blueprint.footprint.width * 0.5) + skirtAllowance * 0.7,
    radiusZ: (blueprint.footprint.depth * 0.5) + skirtAllowance * 0.7,
    material: materials.gelDark,
    tileCount: 8,
  });
  skirt.name = 'fallback-puddle-skirt';
  skirt.userData.overlayRole = 'fallback-puddle-skirt';
  return skirt;
}

function buildFallbackFrontLip(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group {
  const width = Math.max(0.8, blueprint.footprint.width * 0.42);
  const centerX = (box.min.x + box.max.x) * 0.5;
  const z = box.max.z + HOST_DEPTH_PAD * 0.5;
  const y = box.min.y + 0.16;
  const lip = buildGelLipCourse({
    seed,
    start: new THREE.Vector3(centerX - width * 0.5, y, z),
    end: new THREE.Vector3(centerX + width * 0.5, y, z),
    outwardNormal: new THREE.Vector3(0, 0, 1),
    material: materials.hardenedGel,
    plateCount: 4,
  });
  lip.name = 'fallback-front-lip';
  lip.userData.overlayRole = 'fallback-front-lip';
  return lip;
}

function ensureMinimumModuleVariety(
  root: THREE.Group,
  overlays: THREE.Group,
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): void {
  let types = collectModuleTypes(root);
  if (types.size >= MIN_MODULE_VARIETY) return;

  if (!types.has('puddle-skirt-tiles')) {
    overlays.add(buildFallbackPuddleSkirt(box, blueprint, materials, mixSeed(seed, 0x500D_F011)));
    types = collectModuleTypes(root);
  }

  if (types.size >= MIN_MODULE_VARIETY) return;

  if (!types.has('gel-lip-course')) {
    overlays.add(buildFallbackFrontLip(box, blueprint, materials, mixSeed(seed, 0x11F0_F011)));
  }
}

function createFilletedPrismGeometry(
  width: number,
  height: number,
  depth: number,
  filletRadius: number,
): THREE.BufferGeometry {
  const safeWidth = Math.max(width, filletRadius * 2.3);
  const safeHeight = Math.max(height, filletRadius * 2.3);
  const safeDepth = Math.max(depth, filletRadius * 2.2);
  const halfW = safeWidth * 0.5;
  const halfH = safeHeight * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -halfH);
  shape.lineTo(halfW, -halfH);
  shape.lineTo(halfW, halfH);
  shape.lineTo(-halfW, halfH);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: safeDepth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(filletRadius, halfW - 1e-3, halfH - 1e-3),
    bevelThickness: Math.min(filletRadius, safeDepth * 0.48),
  });
  geometry.translate(0, 0, -safeDepth * 0.5);
  return finishArchitecturalGeometry(geometry);
}

function createFilletMesh(
  width: number,
  height: number,
  depth: number,
  filletRadius: number,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    createFilletedPrismGeometry(width, height, depth, filletRadius),
    material,
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.filletRadius = filletRadius;
  return mesh;
}

function buildMimicFilletLayer(
  box: THREE.Box3,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
  hostChamferRadius: number,
): THREE.Group {
  const rand = mulberry32(seed >>> 0);
  const layer = new THREE.Group();
  layer.name = 'mimic-fillet-layer';
  const filletRadius = clamp(
    Math.max(
      hostChamferRadius + 0.01,
      THREE.MathUtils.lerp(MIMIC_FILLET_RADIUS_MIN, MIMIC_FILLET_RADIUS_MAX, rand()),
    ),
    MIMIC_FILLET_RADIUS_MIN,
    MIMIC_FILLET_RADIUS_MAX,
  );
  const thickness = Math.max(filletRadius * 2.4, 0.18);
  const hostHeight = box.max.y - box.min.y;
  const centerY = box.min.y + hostHeight * 0.5;
  const corners = [
    [box.min.x, box.max.z],
    [box.max.x, box.max.z],
    [box.max.x, box.min.z],
    [box.min.x, box.min.z],
  ] as const;

  corners.forEach(([x, z], index) => {
    const bar = createFilletMesh(thickness, hostHeight * 0.58, thickness, filletRadius, materials.hardenedGel, `mimic-corner-fillet-${index}`);
    bar.position.set(
      x + (x === box.min.x ? -thickness * 0.1 : thickness * 0.1),
      centerY,
      z + (z === box.min.z ? -thickness * 0.1 : thickness * 0.1),
    );
    layer.add(bar);
  });

  const longerAlongX = (box.max.x - box.min.x) >= (box.max.z - box.min.z);
  const ridgeLength = longerAlongX
    ? Math.min(blueprint.footprint.width * 0.72, (box.max.x - box.min.x) * 0.74)
    : Math.min(blueprint.footprint.depth * 0.72, (box.max.z - box.min.z) * 0.74);
  const ridge = createFilletMesh(
    longerAlongX ? ridgeLength : thickness,
    thickness * 0.9,
    longerAlongX ? thickness : ridgeLength,
    filletRadius,
    materials.gel,
    'mimic-ridge-fillet',
  );
  ridge.position.set(
    (box.min.x + box.max.x) * 0.5,
    box.max.y - thickness * 0.55,
    (box.min.z + box.max.z) * 0.5,
  );
  layer.add(ridge);

  const firstFrontOpening = blueprint.openingSchedule.find(opening => opening.face === 'front');
  if (firstFrontOpening) {
    const center = resolveOpeningCenter(box, firstFrontOpening);
    const openingCap = createFilletMesh(
      firstFrontOpening.width + (filletRadius * 2.1),
      thickness * 0.85,
      thickness,
      filletRadius,
      materials.hardenedGel,
      'mimic-opening-fillet',
    );
    openingCap.position.set(center.x, center.y + firstFrontOpening.straightHeight + firstFrontOpening.pointHeight + 0.08, center.z);
    layer.add(openingCap);
  }

  layer.userData.filletRadius = filletRadius;
  layer.userData.hostChamferRadius = hostChamferRadius;
  return layer;
}

function buildRubbleOverlay(
  wallModel: WallCourseModel,
  result: RuinateResult,
  placementLookup: BlockPlacementLookup,
  blueprint: SlimeKindBlueprint,
  materials: SlimeMaterialSet,
  seed: number,
): THREE.Group | null {
  const weight = blueprint.propWeights.rubble ?? 0;
  if (weight <= 0 || result.removedBlockIds.size === 0) return null;

  const rubble = buildRubbleFromLostBlocks(
    wallModel,
    result,
    placementLookup,
    materials.wetStain,
    {
      seed,
      survivingVolumeFraction: clamp(0.24 + (weight * 0.26), 0.24, 0.5),
      chunksPerPile: Math.max(2, Math.round(2 + (weight * 5))),
    },
  );
  rubble.name = 'slime-rubble';
  rubble.userData.overlayRole = 'rubble';
  return rubble.children.length > 0 ? rubble : null;
}

function buildSyntheticHostLayout(
  descriptor: SlimeHostShellDescriptor,
  dna: BuildingDNA,
  blueprint: SlimeKindBlueprint,
): SlimeHostShellBuiltLayout {
  const group = descriptor.build(dna);
  const box = new THREE.Box3().setFromObject(group);
  const { wallModel, placementLookup } = buildSyntheticWallData(
    box,
    blueprint.footprint,
    blueprint.floors,
    descriptor.shellId,
  );

  return {
    group,
    hostChamferRadius: SLIME_GENERIC_HOST_CHAMFER_RADIUS,
    wallModel,
    placementLookup,
  };
}

function ruinateShell(
  descriptor: SlimeHostShellDescriptor,
  dna: BuildingDNA,
  blueprint: SlimeKindBlueprint,
): RuinatedShell {
  const damageIntensity = blueprint.ruinIntensity ?? DEFAULT_SLIME_RUIN_INTENSITY;
  const ruinSeed = mixSeed(dna.seed, 0x52_55_49_4e);

  if (descriptor.isGenericShell && descriptor.buildWithLayout) {
    const built = descriptor.buildWithLayout(dna);
    if (built.wallModel && built.placementLookup && built.remeshWithRemovedBlocks) {
      const result = ruinateCourses(built.wallModel, {
        seed: ruinSeed,
        damageIntensity,
      });
      return {
        hostShell: built.remeshWithRemovedBlocks(result.removedBlockIds),
        wallModel: built.wallModel,
        placementLookup: built.placementLookup,
        result,
        mode: 'destructive-generic-shell',
        removedRealBlocksCount: result.removedBlockIds.size,
        hostChamferRadius: built.hostChamferRadius,
      };
    }
  }

  const synthetic = buildSyntheticHostLayout(descriptor, dna, blueprint);
  const result = ruinateCourses(synthetic.wallModel!, {
    seed: ruinSeed,
    damageIntensity,
  });

  return {
    hostShell: synthetic.group,
    wallModel: synthetic.wallModel!,
    placementLookup: synthetic.placementLookup!,
    result,
    mode: 'synthetic-overlay-only',
    removedRealBlocksCount: 0,
    hostChamferRadius: synthetic.hostChamferRadius,
  };
}

export function buildSlimeOccupiedShell(dna: BuildingDNA, blueprint: SlimeKindBlueprint): THREE.Group {
  const hostDescriptor = pickSlimeHostShell(dna.buildingKind, dna.seed);
  const hueSelection = isElderKind(dna.buildingKind)
    ? rollElderHueBlend(dna.seed)
    : rollSlimeHueFamily(dna.seed);
  const materials = createSlimeMaterialSet(hueSelection);
  const ruinated = ruinateShell(hostDescriptor, dna, blueprint);

  const group = new THREE.Group();
  group.name = 'slime-occupied-shell';

  const hostWrapper = new THREE.Group();
  hostWrapper.name = 'slime-host-shell';
  hostWrapper.userData.shellId = hostDescriptor.shellId;
  hostWrapper.userData.sourceLabel = hostDescriptor.sourceLabel;
  hostWrapper.userData.isGenericShell = hostDescriptor.isGenericShell;
  if (hostDescriptor.isGenericShell) {
    applyOpeningOverlays(ruinated.hostShell, blueprint, materials, dna.seed);
  }
  hostWrapper.add(ruinated.hostShell);
  group.add(hostWrapper);
  const hostBox = new THREE.Box3().setFromObject(hostWrapper);
  hostWrapper.userData.hostBounds = {
    min: hostBox.min.toArray(),
    max: hostBox.max.toArray(),
  };

  const overlays = new THREE.Group();
  overlays.name = 'slime-overlays';

  buildFacadeLipCourses(hostBox, blueprint, materials, mixSeed(dna.seed, 0x11F0_0001))
    .forEach(overlay => overlays.add(overlay));

  buildStandaloneLensDisplays(hostBox, blueprint, materials, mixSeed(dna.seed, 0x61E5_0001))
    .forEach(overlay => overlays.add(overlay));

  const roofOverlay = buildRoofSagOverlay(hostBox, blueprint, materials, mixSeed(dna.seed, 0x500F_0002));
  overlays.add(roofOverlay);

  buildMandatoryDripRuns(hostBox, blueprint, materials, mixSeed(dna.seed, 0xD610_0003))
    .forEach(drip => overlays.add(drip));

  buildTendrilOverlays(
    hostBox,
    blueprint,
    materials,
    ruinated.wallModel,
    ruinated.result,
    ruinated.placementLookup,
    mixSeed(dna.seed, 0x7EAD_0004),
  ).forEach(tendril => overlays.add(tendril));

  const puddleSkirt = buildPuddleSkirt(hostBox, blueprint, materials, mixSeed(dna.seed, 0x500D_0005));
  if (puddleSkirt) overlays.add(puddleSkirt);

  const vat = buildContainedVatProp(hostBox, blueprint, materials, mixSeed(dna.seed, 0x0A70_0006));
  if (vat) overlays.add(vat);

  overlays.add(buildMimicFilletLayer(
    hostBox,
    blueprint,
    materials,
    mixSeed(dna.seed, 0xF111_0007),
    ruinated.hostChamferRadius,
  ));

  group.add(overlays);
  ensureMinimumModuleVariety(group, overlays, hostBox, blueprint, materials, dna.seed);

  const rubble = buildRubbleOverlay(
    ruinated.wallModel,
    ruinated.result,
    ruinated.placementLookup,
    blueprint,
    materials,
    mixSeed(dna.seed, 0xA881_0008),
  );
  if (rubble) group.add(rubble);

  group.userData.hostShellId = hostDescriptor.shellId;
  group.userData.sourceLabel = hostDescriptor.sourceLabel;
  group.userData.hueFamilies = [...materials.hueFamilies];
  group.userData.slimeMaterialSet = materials;
  group.userData.blueprint = {
    footprint: { ...blueprint.footprint },
    floors: blueprint.floors,
  };
  group.userData.hostBounds = {
    min: hostBox.min.toArray(),
    max: hostBox.max.toArray(),
  };
  group.userData.ruinate = {
    mode: ruinated.mode,
    damageIntensity: blueprint.ruinIntensity ?? DEFAULT_SLIME_RUIN_INTENSITY,
    trueAbandonedRuinReferenceIntensity: TRUE_ABANDONED_RUIN_DAMAGE_INTENSITY,
    removedRealBlocksCount: ruinated.removedRealBlocksCount,
    removedBlockIds: [...ruinated.result.removedBlockIds].sort(),
    survivingBlockCount: ruinated.result.survivingBlockIds.size,
    breakHeightByColumn: [...ruinated.result.breakHeightByColumn],
  };

  group.traverse(object => {
    if (!object.userData) object.userData = {};
    if (MODULE_ROLE_NAMES.has(object.userData.moduleType as SlimeOverlayModuleType)) {
      object.userData.hueFamilies = [...materials.hueFamilies];
    }
  });

  return group;
}
