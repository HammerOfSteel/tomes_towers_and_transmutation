import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type {
  BuildingCondition,
  BuildingDNA,
  BuildingKind,
  BuildingSize,
  BuildingStyle,
} from '@/world/buildings/BuildingDNA';
import { FLOOR_HEIGHT, getFootprint } from '@/world/buildings/BuildingDNA';
import {
  BLOCK_UNIT,
  clearBlock,
  createBlockGrid,
  meshBlockGrid,
  setBlock,
} from '@/world/buildings/BlockKit';
import { buildElvenChapelShrine } from '@/world/buildings/ElvenChapelKit';
import { buildElvenMarketStall } from '@/world/buildings/ElvenMarketStallKit';
import { buildElvenTreehouseHome } from '@/world/buildings/ElvenTreehouseKit';
import { buildElvenStoneTower } from '@/world/buildings/StoneTowerKit';
import {
  buildDoorOpening,
  buildWindowOpening,
  type DivisionStyle,
  type OpeningShape,
} from '@/world/buildings/kit/OpeningParts';
import type {
  BlockPlacementLookup,
  WallCourseModel,
} from '@/world/buildings/kit/Ruinate';
import { depthFor } from '@/world/buildings/kit/DepthLadder';
import { buildPlinthCourses, buildStringCourse } from '@/world/buildings/kit/StringCourse';

/**
 * Real slime host-shell sources available in this checkout:
 * - direct elven reuse for chapel/shop/watchtower,
 * - slime-scoped generic block-grid shells for the five kinds with no migrated
 *   real host kit yet.
 *
 * The spec's aspirational labels like "human rural cottage" or "dwarven hall"
 * are intentionally mapped to honest generic stand-ins here until those races'
 * own rebuilt kits exist.
 */

export const SLIME_HOST_SHELL_KINDS = [
  'house',
  'terraced',
  'villa',
  'inn',
  'shop',
  'blacksmith',
  'chapel',
  'watchtower',
] as const;

export type SlimeHostShellKind = (typeof SLIME_HOST_SHELL_KINDS)[number];

export const SLIME_GENERIC_HOST_CHAMFER_RADIUS = BLOCK_UNIT * 0.14;

export interface SlimeHostShellBuiltLayout {
  group: THREE.Group;
  hostChamferRadius: number;
  wallModel?: WallCourseModel;
  placementLookup?: BlockPlacementLookup;
  remeshWithRemovedBlocks?: (removedBlockIds: Iterable<string>) => THREE.Group;
}

export interface SlimeHostShellDescriptor {
  kind: SlimeHostShellKind;
  shellId: string;
  sourceLabel: string;
  weight: number;
  isGenericShell: boolean;
  build: (dna: BuildingDNA) => THREE.Group;
  buildWithLayout?: (dna: BuildingDNA) => SlimeHostShellBuiltLayout;
}

type WallFace = 'front' | 'back' | 'left' | 'right';
type GenericShellMaterialMode = 'stone' | 'timber' | 'manor' | 'forge' | 'mixed';
type RoofStyle = 'flat' | 'gable' | 'hip';

interface PerimeterColumn {
  bx: number;
  bz: number;
  corner: boolean;
  outwardNormal: THREE.Vector3;
}

interface ShellPalette {
  wall: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  recess: THREE.MeshStandardMaterial;
  glazing: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  chimney: THREE.MeshStandardMaterial;
}

interface OpeningSpec {
  kind: 'window' | 'door';
  face: WallFace;
  offset: number;
  baseY: number;
  width: number;
  straightHeight: number;
  pointHeight: number;
  frameWidth?: number;
  frameProud?: number;
  recessDepth?: number;
  divisionStyle?: DivisionStyle;
  openingShape?: OpeningShape;
}

interface ChimneySpec {
  xStart: number;
  zStart: number;
  width: number;
  depth: number;
  height: number;
}

interface GenericShellProfile {
  kind: SlimeHostShellKind;
  size: BuildingSize;
  floors: 1 | 2 | 3 | 4;
  materialMode: GenericShellMaterialMode;
  roofStyle: RoofStyle;
  roofLayers?: number;
  wallHeight?: number;
  stringCourseLevels?: number[];
  openings: OpeningSpec[];
  chimneys?: ChimneySpec[];
}

const CANONICAL_SIZE_BY_KIND: Record<SlimeHostShellKind, BuildingSize> = {
  house: 'small',
  terraced: 'tiny',
  villa: 'large',
  inn: 'large',
  shop: 'small',
  blacksmith: 'medium',
  chapel: 'medium',
  watchtower: 'small',
};

const CANONICAL_FLOORS_BY_KIND: Record<SlimeHostShellKind, 1 | 2 | 3 | 4> = {
  house: 1,
  terraced: 2,
  villa: 3,
  inn: 2,
  shop: 1,
  blacksmith: 1,
  chapel: 1,
  watchtower: 4,
};

const HOUSE_STONE_PROFILE: GenericShellProfile = {
  kind: 'house',
  size: 'small',
  floors: 1,
  materialMode: 'stone',
  roofStyle: 'gable',
  roofLayers: 2,
  openings: [
    { kind: 'door', face: 'front', offset: -0.8, baseY: 0, width: 0.8, straightHeight: 1.25, pointHeight: 0.5 },
    { kind: 'window', face: 'front', offset: 0.9, baseY: 0.78, width: 0.55, straightHeight: 0.62, pointHeight: 0.23 },
    { kind: 'window', face: 'right', offset: 0.45, baseY: 0.88, width: 0.38, straightHeight: 0.5, pointHeight: 0.12 },
  ],
  chimneys: [{ xStart: 5, zStart: 1, width: 1, depth: 1, height: 2 }],
};

const HOUSE_TIMBER_PROFILE: GenericShellProfile = {
  kind: 'house',
  size: 'small',
  floors: 1,
  materialMode: 'timber',
  roofStyle: 'gable',
  roofLayers: 2,
  openings: [
    { kind: 'door', face: 'front', offset: 0.75, baseY: 0, width: 0.78, straightHeight: 1.22, pointHeight: 0.46 },
    { kind: 'window', face: 'front', offset: -0.85, baseY: 0.76, width: 0.58, straightHeight: 0.62, pointHeight: 0.22, divisionStyle: 'cross' },
    { kind: 'window', face: 'left', offset: -0.35, baseY: 0.88, width: 0.36, straightHeight: 0.46, pointHeight: 0.14 },
  ],
};

const TERRACED_TIMBER_PROFILE: GenericShellProfile = {
  kind: 'terraced',
  size: 'tiny',
  floors: 2,
  materialMode: 'timber',
  roofStyle: 'flat',
  roofLayers: 1,
  stringCourseLevels: [FLOOR_HEIGHT],
  openings: [
    { kind: 'door', face: 'front', offset: -0.45, baseY: 0, width: 0.75, straightHeight: 1.18, pointHeight: 0.47 },
    { kind: 'window', face: 'front', offset: -0.68, baseY: FLOOR_HEIGHT + 0.55, width: 0.45, straightHeight: 0.48, pointHeight: 0.18 },
    { kind: 'window', face: 'front', offset: 0.68, baseY: FLOOR_HEIGHT + 0.55, width: 0.45, straightHeight: 0.48, pointHeight: 0.18 },
    { kind: 'window', face: 'back', offset: 0, baseY: 1.05, width: 0.34, straightHeight: 0.42, pointHeight: 0.1 },
  ],
};

const TERRACED_STONE_PROFILE: GenericShellProfile = {
  kind: 'terraced',
  size: 'tiny',
  floors: 2,
  materialMode: 'mixed',
  roofStyle: 'flat',
  roofLayers: 1,
  stringCourseLevels: [FLOOR_HEIGHT],
  openings: [
    { kind: 'door', face: 'front', offset: 0.45, baseY: 0, width: 0.74, straightHeight: 1.15, pointHeight: 0.45 },
    { kind: 'window', face: 'front', offset: -0.62, baseY: FLOOR_HEIGHT + 0.52, width: 0.42, straightHeight: 0.5, pointHeight: 0.16 },
    { kind: 'window', face: 'front', offset: 0.65, baseY: FLOOR_HEIGHT + 0.52, width: 0.42, straightHeight: 0.5, pointHeight: 0.16 },
    { kind: 'window', face: 'back', offset: 0, baseY: FLOOR_HEIGHT + 0.52, width: 0.3, straightHeight: 0.36, pointHeight: 0.08, openingShape: 'round' },
  ],
};

const VILLA_MANOR_PROFILE: GenericShellProfile = {
  kind: 'villa',
  size: 'large',
  floors: 3,
  materialMode: 'manor',
  roofStyle: 'hip',
  roofLayers: 2,
  stringCourseLevels: [FLOOR_HEIGHT, FLOOR_HEIGHT * 2],
  openings: [
    { kind: 'door', face: 'front', offset: 0, baseY: 0, width: 1.4, straightHeight: 1.65, pointHeight: 0.65, frameWidth: 0.12 },
    { kind: 'window', face: 'front', offset: -2.15, baseY: 0.82, width: 0.78, straightHeight: 0.8, pointHeight: 0.26, divisionStyle: 'cross' },
    { kind: 'window', face: 'front', offset: -1.05, baseY: 0.82, width: 0.78, straightHeight: 0.8, pointHeight: 0.26, divisionStyle: 'cross' },
    { kind: 'window', face: 'front', offset: 1.05, baseY: 0.82, width: 0.78, straightHeight: 0.8, pointHeight: 0.26, divisionStyle: 'cross' },
    { kind: 'window', face: 'front', offset: 2.15, baseY: 0.82, width: 0.78, straightHeight: 0.8, pointHeight: 0.26, divisionStyle: 'cross' },
    { kind: 'window', face: 'front', offset: -2.35, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: -1.15, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: 0, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: 1.15, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: 2.35, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: -2.35, baseY: FLOOR_HEIGHT * 2 + 0.7, width: 0.62, straightHeight: 0.68, pointHeight: 0.22 },
    { kind: 'window', face: 'front', offset: -1.15, baseY: FLOOR_HEIGHT * 2 + 0.7, width: 0.62, straightHeight: 0.68, pointHeight: 0.22 },
    { kind: 'window', face: 'front', offset: 0, baseY: FLOOR_HEIGHT * 2 + 0.7, width: 0.62, straightHeight: 0.68, pointHeight: 0.22 },
    { kind: 'window', face: 'front', offset: 1.15, baseY: FLOOR_HEIGHT * 2 + 0.7, width: 0.62, straightHeight: 0.68, pointHeight: 0.22 },
    { kind: 'window', face: 'front', offset: 2.35, baseY: FLOOR_HEIGHT * 2 + 0.7, width: 0.62, straightHeight: 0.68, pointHeight: 0.22 },
    { kind: 'window', face: 'left', offset: -1.1, baseY: FLOOR_HEIGHT + 0.85, width: 0.58, straightHeight: 0.68, pointHeight: 0.2 },
    { kind: 'window', face: 'left', offset: 1.1, baseY: FLOOR_HEIGHT * 2 + 0.72, width: 0.58, straightHeight: 0.68, pointHeight: 0.2 },
    { kind: 'window', face: 'right', offset: -1.1, baseY: FLOOR_HEIGHT + 0.85, width: 0.58, straightHeight: 0.68, pointHeight: 0.2 },
    { kind: 'window', face: 'right', offset: 1.1, baseY: FLOOR_HEIGHT * 2 + 0.72, width: 0.58, straightHeight: 0.68, pointHeight: 0.2 },
  ],
  chimneys: [{ xStart: 10, zStart: 2, width: 1, depth: 1, height: 4 }],
};

const VILLA_HALL_PROFILE: GenericShellProfile = {
  kind: 'villa',
  size: 'large',
  floors: 3,
  materialMode: 'stone',
  roofStyle: 'gable',
  roofLayers: 2,
  stringCourseLevels: [FLOOR_HEIGHT, FLOOR_HEIGHT * 2],
  openings: [
    { kind: 'door', face: 'front', offset: -0.4, baseY: 0, width: 1.3, straightHeight: 1.62, pointHeight: 0.6 },
    { kind: 'window', face: 'front', offset: -2.3, baseY: 0.8, width: 0.72, straightHeight: 0.78, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: -1.15, baseY: 0.8, width: 0.72, straightHeight: 0.78, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: 1.0, baseY: 0.8, width: 0.72, straightHeight: 0.78, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: 2.2, baseY: 0.8, width: 0.72, straightHeight: 0.78, pointHeight: 0.24 },
    { kind: 'window', face: 'front', offset: -2.35, baseY: FLOOR_HEIGHT + 0.72, width: 0.62, straightHeight: 0.68, pointHeight: 0.2 },
    { kind: 'window', face: 'front', offset: -1.15, baseY: FLOOR_HEIGHT + 0.72, width: 0.62, straightHeight: 0.68, pointHeight: 0.2 },
    { kind: 'window', face: 'front', offset: 0, baseY: FLOOR_HEIGHT + 0.72, width: 0.62, straightHeight: 0.68, pointHeight: 0.2 },
    { kind: 'window', face: 'front', offset: 1.15, baseY: FLOOR_HEIGHT + 0.72, width: 0.62, straightHeight: 0.68, pointHeight: 0.2 },
    { kind: 'window', face: 'front', offset: 2.35, baseY: FLOOR_HEIGHT + 0.72, width: 0.62, straightHeight: 0.68, pointHeight: 0.2 },
    { kind: 'window', face: 'front', offset: -2.35, baseY: FLOOR_HEIGHT * 2 + 0.72, width: 0.58, straightHeight: 0.64, pointHeight: 0.18 },
    { kind: 'window', face: 'front', offset: -1.15, baseY: FLOOR_HEIGHT * 2 + 0.72, width: 0.58, straightHeight: 0.64, pointHeight: 0.18 },
    { kind: 'window', face: 'front', offset: 0, baseY: FLOOR_HEIGHT * 2 + 0.72, width: 0.58, straightHeight: 0.64, pointHeight: 0.18 },
    { kind: 'window', face: 'front', offset: 1.15, baseY: FLOOR_HEIGHT * 2 + 0.72, width: 0.58, straightHeight: 0.64, pointHeight: 0.18 },
    { kind: 'window', face: 'front', offset: 2.35, baseY: FLOOR_HEIGHT * 2 + 0.72, width: 0.58, straightHeight: 0.64, pointHeight: 0.18 },
  ],
};

const INN_TAVERN_PROFILE: GenericShellProfile = {
  kind: 'inn',
  size: 'large',
  floors: 2,
  materialMode: 'mixed',
  roofStyle: 'gable',
  roofLayers: 2,
  stringCourseLevels: [FLOOR_HEIGHT],
  openings: [
    { kind: 'door', face: 'front', offset: -0.45, baseY: 0, width: 1.2, straightHeight: 1.45, pointHeight: 0.55 },
    { kind: 'window', face: 'front', offset: -2.2, baseY: 0.82, width: 0.9, straightHeight: 0.88, pointHeight: 0.24, divisionStyle: 'cross' },
    { kind: 'window', face: 'front', offset: 2.2, baseY: 0.82, width: 0.9, straightHeight: 0.88, pointHeight: 0.24, divisionStyle: 'cross' },
    { kind: 'window', face: 'front', offset: -2.35, baseY: FLOOR_HEIGHT + 0.72, width: 0.62, straightHeight: 0.68, pointHeight: 0.22 },
    { kind: 'window', face: 'front', offset: 0, baseY: FLOOR_HEIGHT + 0.72, width: 0.62, straightHeight: 0.68, pointHeight: 0.22 },
    { kind: 'window', face: 'front', offset: 2.35, baseY: FLOOR_HEIGHT + 0.72, width: 0.62, straightHeight: 0.68, pointHeight: 0.22 },
    { kind: 'door', face: 'right', offset: -1.1, baseY: 0, width: 1.0, straightHeight: 1.1, pointHeight: 0.4 },
  ],
  chimneys: [{ xStart: 11, zStart: 2, width: 1, depth: 1, height: 4 }],
};

const INN_WAYHOUSE_PROFILE: GenericShellProfile = {
  kind: 'inn',
  size: 'large',
  floors: 2,
  materialMode: 'timber',
  roofStyle: 'hip',
  roofLayers: 2,
  stringCourseLevels: [FLOOR_HEIGHT],
  openings: [
    { kind: 'door', face: 'front', offset: 0.35, baseY: 0, width: 1.15, straightHeight: 1.42, pointHeight: 0.5 },
    { kind: 'window', face: 'front', offset: -2.1, baseY: 0.84, width: 0.85, straightHeight: 0.84, pointHeight: 0.22, divisionStyle: 'cross' },
    { kind: 'window', face: 'front', offset: 2.1, baseY: 0.84, width: 0.85, straightHeight: 0.84, pointHeight: 0.22, divisionStyle: 'cross' },
    { kind: 'window', face: 'front', offset: -2.3, baseY: FLOOR_HEIGHT + 0.74, width: 0.62, straightHeight: 0.7, pointHeight: 0.2 },
    { kind: 'window', face: 'front', offset: 0, baseY: FLOOR_HEIGHT + 0.74, width: 0.62, straightHeight: 0.7, pointHeight: 0.2 },
    { kind: 'window', face: 'front', offset: 2.3, baseY: FLOOR_HEIGHT + 0.74, width: 0.62, straightHeight: 0.7, pointHeight: 0.2 },
    { kind: 'window', face: 'left', offset: 1.1, baseY: 1.15, width: 0.44, straightHeight: 0.58, pointHeight: 0.14 },
  ],
};

const BLACKSMITH_FORGE_PROFILE: GenericShellProfile = {
  kind: 'blacksmith',
  size: 'medium',
  floors: 1,
  materialMode: 'forge',
  roofStyle: 'flat',
  roofLayers: 1,
  wallHeight: 3.6,
  openings: [
    { kind: 'door', face: 'front', offset: 0, baseY: 0, width: 2.2, straightHeight: 1.55, pointHeight: 0.55, frameWidth: 0.14 },
    { kind: 'window', face: 'left', offset: -0.9, baseY: 1.45, width: 0.35, straightHeight: 0.42, pointHeight: 0.12, openingShape: 'round' },
    { kind: 'window', face: 'right', offset: 0.9, baseY: 1.45, width: 0.35, straightHeight: 0.42, pointHeight: 0.12, openingShape: 'round' },
    { kind: 'door', face: 'back', offset: 0.85, baseY: 0, width: 0.8, straightHeight: 1.15, pointHeight: 0.38 },
  ],
  chimneys: [{ xStart: 8, zStart: 5, width: 1, depth: 1, height: 5 }],
};

const BLACKSMITH_YARD_PROFILE: GenericShellProfile = {
  kind: 'blacksmith',
  size: 'medium',
  floors: 1,
  materialMode: 'stone',
  roofStyle: 'gable',
  roofLayers: 1,
  wallHeight: 3.6,
  openings: [
    { kind: 'door', face: 'front', offset: -0.35, baseY: 0, width: 2.0, straightHeight: 1.5, pointHeight: 0.5, frameWidth: 0.13 },
    { kind: 'window', face: 'left', offset: 0.95, baseY: 1.4, width: 0.35, straightHeight: 0.44, pointHeight: 0.1 },
    { kind: 'window', face: 'right', offset: -0.95, baseY: 1.4, width: 0.35, straightHeight: 0.44, pointHeight: 0.1 },
    { kind: 'door', face: 'back', offset: -0.95, baseY: 0, width: 0.78, straightHeight: 1.1, pointHeight: 0.36 },
  ],
  chimneys: [{ xStart: 1, zStart: 5, width: 1, depth: 1, height: 5 }],
};

function mat(color: string, roughness = 0.82, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
}

function rectangleLoop(width: number, depth: number): [number, number][] {
  const halfW = width / 2;
  const halfD = depth / 2;
  return [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
}

function normalizeOptions<T extends Omit<SlimeHostShellDescriptor, 'weight'> & { weight: number }>(
  options: T[],
): SlimeHostShellDescriptor[] {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  if (total <= 0) throw new Error('Slime host shell weights must be positive.');
  return options.map(option => ({
    ...option,
    weight: option.weight / total,
  }));
}

function assertCanonicalKind(kind: BuildingKind): asserts kind is SlimeHostShellKind {
  if (!SLIME_HOST_SHELL_KINDS.includes(kind as SlimeHostShellKind)) {
    throw new Error(`Unsupported slime host-shell kind "${kind}"`);
  }
}

function canonicalizeDna(
  base: BuildingDNA,
  kind: SlimeHostShellKind,
  style: BuildingStyle,
  colors: BuildingDNA['colors'],
  condition: BuildingCondition = 'weathered',
): BuildingDNA {
  return {
    ...base,
    buildingKind: kind,
    size: CANONICAL_SIZE_BY_KIND[kind],
    floors: CANONICAL_FLOORS_BY_KIND[kind],
    style,
    condition,
    colors,
    faction: undefined,
    terrace: kind === 'terraced' ? 'both' : 'none',
    features: [],
    name: `${kind} host shell`,
    rotation: 0,
  };
}

function createShellPalette(mode: GenericShellMaterialMode): ShellPalette {
  switch (mode) {
    case 'timber':
      return {
        wall: mat('#ccb592', 0.88),
        trim: mat('#785839', 0.8),
        roof: mat('#5f4834', 0.92),
        recess: mat('#201812', 0.96),
        glazing: mat('#182126', 0.84),
        wood: mat('#533827', 0.94),
        chimney: mat('#6a5544', 0.86),
      };
    case 'manor':
      return {
        wall: mat('#bcb2a7', 0.84),
        trim: mat('#d9cec1', 0.75),
        roof: mat('#4d4540', 0.9),
        recess: mat('#1a1715', 0.96),
        glazing: mat('#1a2128', 0.82),
        wood: mat('#5e4330', 0.92),
        chimney: mat('#7a7068', 0.82),
      };
    case 'forge':
      return {
        wall: mat('#7f7266', 0.9),
        trim: mat('#a19384', 0.82),
        roof: mat('#4a3f38', 0.92),
        recess: mat('#181514', 0.98),
        glazing: mat('#161d22', 0.86),
        wood: mat('#523b2b', 0.95),
        chimney: mat('#6b6057', 0.84),
      };
    case 'mixed':
      return {
        wall: mat('#b49a7b', 0.88),
        trim: mat('#8f8174', 0.82),
        roof: mat('#56493b', 0.92),
        recess: mat('#1e1a17', 0.96),
        glazing: mat('#192028', 0.84),
        wood: mat('#4d3523', 0.94),
        chimney: mat('#75675a', 0.84),
      };
    case 'stone':
    default:
      return {
        wall: mat('#8f867f', 0.88),
        trim: mat('#bdb3aa', 0.76),
        roof: mat('#514943', 0.92),
        recess: mat('#171515', 0.97),
        glazing: mat('#171f25', 0.84),
        wood: mat('#594030', 0.94),
        chimney: mat('#786f68', 0.84),
      };
  }
}

function centeredBlockCoordinate(index: number, count: number): number {
  return (index - ((count - 1) / 2)) * BLOCK_UNIT;
}

function overallOpeningHeight(opening: OpeningSpec): number {
  return opening.straightHeight + Math.max(0, opening.pointHeight);
}

function openingWorldCenter(opening: OpeningSpec, width: number, depth: number): {
  position: THREE.Vector3;
  rotationY: number;
  lateralCenter: number;
} {
  const halfW = width / 2;
  const halfD = depth / 2;
  switch (opening.face) {
    case 'front':
      return {
        position: new THREE.Vector3(opening.offset, opening.baseY, halfD),
        rotationY: 0,
        lateralCenter: opening.offset,
      };
    case 'back':
      return {
        position: new THREE.Vector3(opening.offset, opening.baseY, -halfD),
        rotationY: Math.PI,
        lateralCenter: opening.offset,
      };
    case 'left':
      return {
        position: new THREE.Vector3(-halfW, opening.baseY, opening.offset),
        rotationY: -Math.PI / 2,
        lateralCenter: opening.offset,
      };
    case 'right':
      return {
        position: new THREE.Vector3(halfW, opening.baseY, -opening.offset),
        rotationY: Math.PI / 2,
        lateralCenter: -opening.offset,
      };
  }
}

function openingCarvesCell(
  opening: OpeningSpec,
  bx: number,
  by: number,
  bz: number,
  bw: number,
  bd: number,
): boolean {
  if (opening.face === 'front' && bz !== bd - 1) return false;
  if (opening.face === 'back' && bz !== 0) return false;
  if (opening.face === 'left' && bx !== 0) return false;
  if (opening.face === 'right' && bx !== bw - 1) return false;

  const cellY = by * BLOCK_UNIT + BLOCK_UNIT / 2;
  if (cellY < opening.baseY || cellY > opening.baseY + overallOpeningHeight(opening)) return false;

  const cellHorizontal = opening.face === 'front' || opening.face === 'back'
    ? centeredBlockCoordinate(bx, bw)
    : centeredBlockCoordinate(bz, bd);
  const lateralCenter = openingWorldCenter(opening, bw * BLOCK_UNIT, bd * BLOCK_UNIT).lateralCenter;
  return Math.abs(cellHorizontal - lateralCenter) <= (opening.width / 2) + BLOCK_UNIT * 0.2;
}

function fillSolidPerimeterWalls(grid: ReturnType<typeof createBlockGrid>, bw: number, bd: number, wallBlocksH: number): void {
  for (let bx = 0; bx < bw; bx++) {
    for (let bz = 0; bz < bd; bz++) {
      const isPerimeter = bx === 0 || bz === 0 || bx === bw - 1 || bz === bd - 1;
      if (!isPerimeter) continue;
      for (let by = 0; by < wallBlocksH; by++) {
        setBlock(grid, bx, by, bz, 'wall');
      }
    }
  }
}

function carveOpeningCells(grid: ReturnType<typeof createBlockGrid>, bw: number, bd: number, wallBlocksH: number, openings: OpeningSpec[]): void {
  for (let bx = 0; bx < bw; bx++) {
    for (let bz = 0; bz < bd; bz++) {
      const isPerimeter = bx === 0 || bz === 0 || bx === bw - 1 || bz === bd - 1;
      if (!isPerimeter) continue;
      for (let by = 0; by < wallBlocksH; by++) {
        const carved = openings.some(opening => openingCarvesCell(opening, bx, by, bz, bw, bd));
        if (carved) clearBlock(grid, bx, by, bz);
      }
    }
  }
}

function outwardNormalForPerimeterCell(bx: number, bz: number, bw: number, bd: number): THREE.Vector3 {
  const outward = new THREE.Vector3(
    bx === 0 ? -1 : bx === bw - 1 ? 1 : 0,
    0,
    bz === 0 ? -1 : bz === bd - 1 ? 1 : 0,
  );
  return outward.normalize();
}

function buildPerimeterColumns(bw: number, bd: number): PerimeterColumn[] {
  const columns: PerimeterColumn[] = [];
  const push = (bx: number, bz: number) => {
    columns.push({
      bx,
      bz,
      corner: (bx === 0 || bx === bw - 1) && (bz === 0 || bz === bd - 1),
      outwardNormal: outwardNormalForPerimeterCell(bx, bz, bw, bd),
    });
  };

  for (let bx = 0; bx < bw; bx++) push(bx, bd - 1);
  for (let bz = bd - 2; bz >= 0; bz--) push(bw - 1, bz);
  for (let bx = bw - 2; bx >= 0; bx--) push(bx, 0);
  for (let bz = 1; bz < bd - 1; bz++) push(0, bz);

  return columns;
}

function buildPerimeterWallCourseModel(
  columns: readonly PerimeterColumn[],
  wallBlocksH: number,
  idPrefix: string,
): { wallModel: WallCourseModel; placementsById: Map<string, { bx: number; by: number; bz: number; outwardNormal: THREE.Vector3 }> } {
  const blocks: WallCourseModel['blocks'] = [];
  const placementsById = new Map<string, { bx: number; by: number; bz: number; outwardNormal: THREE.Vector3 }>();

  for (let course = 0; course < wallBlocksH; course++) {
    columns.forEach((column, index) => {
      const id = `${idPrefix}-c${course}-i${index}`;
      blocks.push({
        id,
        course,
        index,
        tags: column.corner ? { corner: true } : undefined,
      });
      placementsById.set(id, {
        bx: column.bx,
        by: course,
        bz: column.bz,
        outwardNormal: column.outwardNormal.clone(),
      });
    });
  }

  return {
    wallModel: {
      numCourses: wallBlocksH,
      blocksPerCourse: columns.length,
      blocks,
      leaf: 'outer',
    },
    placementsById,
  };
}

function fillRoof(grid: ReturnType<typeof createBlockGrid>, bw: number, bd: number, wallBlocksH: number, roofStyle: RoofStyle, roofLayers: number): void {
  switch (roofStyle) {
    case 'flat':
      for (let layer = 0; layer < roofLayers; layer++) {
        const by = wallBlocksH + layer;
        for (let bx = 0; bx < bw; bx++) {
          for (let bz = 0; bz < bd; bz++) {
            setBlock(grid, bx, by, bz, 'roof');
          }
        }
      }
      break;
    case 'hip':
      for (let layer = 0; layer < roofLayers; layer++) {
        const xInset = Math.min(layer, Math.floor((bw - 1) / 2));
        const zInset = Math.min(layer, Math.floor((bd - 1) / 2));
        const by = wallBlocksH + layer;
        for (let bx = xInset; bx < bw - xInset; bx++) {
          for (let bz = zInset; bz < bd - zInset; bz++) {
            setBlock(grid, bx, by, bz, 'roof');
          }
        }
      }
      break;
    case 'gable':
    default:
      for (let layer = 0; layer < roofLayers; layer++) {
        const zInset = Math.min(layer, Math.floor((bd - 1) / 2));
        const by = wallBlocksH + layer;
        for (let bx = 0; bx < bw; bx++) {
          for (let bz = zInset; bz < bd - zInset; bz++) {
            setBlock(grid, bx, by, bz, 'roof');
          }
        }
      }
      break;
  }
}

function fillChimneys(
  grid: ReturnType<typeof createBlockGrid>,
  wallBlocksH: number,
  chimneys: ChimneySpec[] | undefined,
): void {
  for (const chimney of chimneys ?? []) {
    for (let dx = 0; dx < chimney.width; dx++) {
      for (let dz = 0; dz < chimney.depth; dz++) {
        for (let dy = 0; dy < chimney.height; dy++) {
          setBlock(grid, chimney.xStart + dx, wallBlocksH + dy, chimney.zStart + dz, 'chimney');
        }
      }
    }
  }
}

function buildOpeningMesh(opening: OpeningSpec, palette: ShellPalette): THREE.Group {
  if (opening.kind === 'window') {
    return buildWindowOpening({
      width: opening.width,
      straightHeight: opening.straightHeight,
      pointHeight: opening.pointHeight,
      recessDepth: opening.recessDepth ?? 0.16,
      frameWidth: opening.frameWidth ?? Math.max(0.07, opening.width * 0.12),
      frameProud: opening.frameProud ?? depthFor('FRAME'),
      wallZ: 0,
      stoneMaterial: palette.trim,
      glazingMaterial: palette.glazing,
      recessMaterial: palette.recess,
      divisionStyle: opening.divisionStyle,
      openingShape: opening.openingShape ?? 'arch',
    });
  }

  return buildDoorOpening({
    width: opening.width,
    straightHeight: opening.straightHeight,
    pointHeight: opening.pointHeight,
    recessDepth: opening.recessDepth ?? 0.18,
    frameWidth: opening.frameWidth ?? Math.max(0.08, opening.width * 0.1),
    frameProud: opening.frameProud ?? Math.max(depthFor('FRAME'), 0.05),
    wallZ: 0,
    stoneMaterial: palette.trim,
    recessMaterial: palette.recess,
    woodMaterial: palette.wood,
  });
}

function createGenericShellMassMesh(
  grid: ReturnType<typeof createBlockGrid>,
  palette: ShellPalette,
  bw: number,
  bd: number,
): THREE.Group {
  const shell = meshBlockGrid(grid, {
   wall: palette.wall,
   roof: palette.roof,
   chimney: palette.chimney,
  }, {
   topBevel: true,
   chamferRadius: SLIME_GENERIC_HOST_CHAMFER_RADIUS,
   chamferSegments: 2,
  });
  shell.name = 'host-shell-mass';
  shell.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  shell.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  shell.position.y += BLOCK_UNIT / 2;
  return shell;
}

function finalizeGenericShellGroup(
  shellId: string,
  sourceLabel: string,
  dna: BuildingDNA,
  profile: GenericShellProfile,
  palette: ShellPalette,
  width: number,
  depth: number,
  shell: THREE.Group,
  shellGridCellCount: number,
  wallGridCellCount: number,
): THREE.Group {
  const { w, d } = getFootprint(profile.kind, profile.size);
  const group = new THREE.Group();
  group.name = shellId;
  group.userData.sourceLabel = sourceLabel;
  group.userData.slimeHostShellId = shellId;
  group.userData.slimeHostKind = profile.kind;
  group.userData.isGenericShell = true;
  group.userData.hostChamferRadius = SLIME_GENERIC_HOST_CHAMFER_RADIUS;
  group.userData.shellGridCellCount = shellGridCellCount;
  group.userData.wallGridCellCount = wallGridCellCount;
  group.add(shell);

  const footprint = rectangleLoop(width, depth);
  const plinth = buildPlinthCourses(footprint, palette.trim, 2, { height: 0.06 });
  group.add(plinth);

  for (const y of profile.stringCourseLevels ?? []) {
    const course = buildStringCourse(footprint, palette.trim, { y, height: 0.06 });
    course.name = `string-course-${y.toFixed(2)}`;
    group.add(course);
  }

  profile.openings.forEach((opening, index) => {
    const openingGroup = buildOpeningMesh(opening, palette);
    openingGroup.name = `${opening.kind}-opening-${index}`;
    openingGroup.userData.sourceLabel = sourceLabel;
    openingGroup.userData.hostOpening = true;
    const placement = openingWorldCenter(opening, width, depth);
    openingGroup.position.copy(placement.position);
    openingGroup.rotation.y = placement.rotationY;
    group.add(openingGroup);
  });

  const shellDna = canonicalizeDna(dna, profile.kind, dna.style, dna.colors);
  group.userData.hostShellDna = {
    seed: shellDna.seed,
    buildingKind: shellDna.buildingKind,
    size: shellDna.size,
    floors: shellDna.floors,
  };
  group.userData.hostFootprint = { w, d };

  return group;
}

function buildGenericShellLayout(
  shellId: string,
  sourceLabel: string,
  dna: BuildingDNA,
  profile: GenericShellProfile,
): SlimeHostShellBuiltLayout {
  const { w, d } = getFootprint(profile.kind, profile.size);
  const width = w;
  const depth = d;
  const wallHeight = profile.wallHeight ?? (profile.floors * FLOOR_HEIGHT);
  const wallBlocksH = Math.max(2, Math.round(wallHeight / BLOCK_UNIT));
  const bw = Math.max(2, Math.round(width / BLOCK_UNIT));
  const bd = Math.max(2, Math.round(depth / BLOCK_UNIT));
  const palette = createShellPalette(profile.materialMode);
  const columns = buildPerimeterColumns(bw, bd);
  const { wallModel, placementsById } = buildPerimeterWallCourseModel(columns, wallBlocksH, shellId);

  const buildShellGroup = (removedBlockIds?: Iterable<string>): THREE.Group => {
    const grid = createBlockGrid();
    fillSolidPerimeterWalls(grid, bw, bd, wallBlocksH);
    fillRoof(grid, bw, bd, wallBlocksH, profile.roofStyle, profile.roofLayers ?? 1);
    fillChimneys(grid, wallBlocksH, profile.chimneys);

    for (const blockId of removedBlockIds ?? []) {
      const placement = placementsById.get(blockId);
      if (!placement) continue;
      clearBlock(grid, placement.bx, placement.by, placement.bz);
    }

    carveOpeningCells(grid, bw, bd, wallBlocksH, profile.openings);
    const shellGridCellCount = grid.cells.size;
    const wallGridCellCount = [...grid.cells.values()].filter(materialKey => materialKey === 'wall').length;
    const shell = createGenericShellMassMesh(grid, palette, bw, bd);
    return finalizeGenericShellGroup(
      shellId,
      sourceLabel,
      dna,
      profile,
      palette,
      width,
      depth,
      shell,
      shellGridCellCount,
      wallGridCellCount,
    );
  };

  const placementLookup: BlockPlacementLookup = (block) => {
    const placement = placementsById.get(block.id);
    if (!placement) {
      throw new Error(`Unknown generic slime host-shell block "${block.id}"`);
    }

    return {
      center: new THREE.Vector3(
        (placement.bx - ((bw - 1) / 2)) * BLOCK_UNIT,
        (placement.by * BLOCK_UNIT) + (BLOCK_UNIT / 2),
        (placement.bz - ((bd - 1) / 2)) * BLOCK_UNIT,
      ),
      width: BLOCK_UNIT,
      height: BLOCK_UNIT,
      depth: BLOCK_UNIT,
      outwardNormal: placement.outwardNormal.clone(),
    };
  };

  return {
    group: buildShellGroup(),
    hostChamferRadius: SLIME_GENERIC_HOST_CHAMFER_RADIUS,
    wallModel,
    placementLookup,
    remeshWithRemovedBlocks: removedBlockIds => buildShellGroup(removedBlockIds),
  };
}

function buildGenericShellGroup(shellId: string, sourceLabel: string, dna: BuildingDNA, profile: GenericShellProfile): THREE.Group {
  return buildGenericShellLayout(shellId, sourceLabel, dna, profile).group;
}

function makeGenericDescriptor(
  kind: SlimeHostShellKind,
  shellId: string,
  sourceLabel: string,
  weight: number,
  profile: GenericShellProfile,
): SlimeHostShellDescriptor {
  return {
    kind,
    shellId,
    sourceLabel,
    weight,
    isGenericShell: true,
    build: (dna) => buildGenericShellGroup(shellId, sourceLabel, dna, profile),
    buildWithLayout: (dna) => buildGenericShellLayout(shellId, sourceLabel, dna, profile),
  };
}

function makeElvenDescriptor(
  kind: SlimeHostShellKind,
  shellId: string,
  sourceLabel: string,
  weight: number,
  builder: (dna: BuildingDNA) => THREE.Group,
  colors: BuildingDNA['colors'],
  style: BuildingStyle,
): SlimeHostShellDescriptor {
  return {
    kind,
    shellId,
    sourceLabel,
    weight,
    isGenericShell: false,
    build: (dna) => builder(canonicalizeDna(dna, kind, style, colors, 'weathered')),
  };
}

const ELVEN_TREEHOUSE_COLORS = {
  walls: '#c8d8b0',
  roof: '#8a9870',
  trim: '#f0f0e8',
  door: '#6a8a50',
};

const ELVEN_STONE_COLORS = {
  walls: '#9ca29f',
  roof: '#5b615a',
  trim: '#dbe4dd',
  door: '#6a6f62',
};

export const SLIME_HOST_SHELL_OPTIONS_BY_KIND: Record<SlimeHostShellKind, SlimeHostShellDescriptor[]> = {
  house: normalizeOptions([
    makeGenericDescriptor('house', 'generic-stone-cottage-shell', 'generic stone shell', 0.5, HOUSE_STONE_PROFILE),
    makeGenericDescriptor('house', 'generic-timber-cottage-shell', 'generic timber shell', 0.3, HOUSE_TIMBER_PROFILE),
    makeElvenDescriptor('house', 'elven-treehouse-home-shell', 'elven treehouse home', 0.2, buildElvenTreehouseHome, ELVEN_TREEHOUSE_COLORS, 'elven'),
  ]),
  terraced: normalizeOptions([
    makeGenericDescriptor('terraced', 'generic-timber-row-shell', 'generic timber row shell', 0.55, TERRACED_TIMBER_PROFILE),
    makeGenericDescriptor('terraced', 'generic-stone-row-shell', 'generic stone row shell', 0.45, TERRACED_STONE_PROFILE),
  ]),
  villa: normalizeOptions([
    makeGenericDescriptor('villa', 'generic-manor-shell', 'generic manor shell', 0.55, VILLA_MANOR_PROFILE),
    makeGenericDescriptor('villa', 'generic-grand-hall-shell', 'generic grand hall shell', 0.25, VILLA_HALL_PROFILE),
    makeElvenDescriptor('villa', 'elven-treehouse-home-shell', 'elven treehouse home', 0.2, buildElvenTreehouseHome, ELVEN_TREEHOUSE_COLORS, 'elven'),
  ]),
  inn: normalizeOptions([
    makeGenericDescriptor('inn', 'generic-tavern-shell', 'generic tavern shell', 0.6, INN_TAVERN_PROFILE),
    makeGenericDescriptor('inn', 'generic-roadside-inn-shell', 'generic roadside inn shell', 0.25, INN_WAYHOUSE_PROFILE),
    makeElvenDescriptor('inn', 'elven-treehouse-home-shell', 'elven treehouse home', 0.15, buildElvenTreehouseHome, ELVEN_TREEHOUSE_COLORS, 'elven'),
  ]),
  shop: normalizeOptions([
    makeElvenDescriptor('shop', 'elven-market-stall-shell', 'elven market-stall frame', 1, buildElvenMarketStall, ELVEN_TREEHOUSE_COLORS, 'elven'),
  ]),
  blacksmith: normalizeOptions([
    makeGenericDescriptor('blacksmith', 'generic-stone-forge-shell', 'generic forge shell', 0.65, BLACKSMITH_FORGE_PROFILE),
    makeGenericDescriptor('blacksmith', 'generic-yard-forge-shell', 'generic open-yard forge shell', 0.35, BLACKSMITH_YARD_PROFILE),
  ]),
  chapel: normalizeOptions([
    makeElvenDescriptor('chapel', 'elven-chapel-shrine-shell', 'elven chapel ruin', 1, buildElvenChapelShrine, ELVEN_STONE_COLORS, 'elven'),
  ]),
  watchtower: normalizeOptions([
    makeElvenDescriptor('watchtower', 'elven-stone-watchtower-shell', 'elven stone watchtower', 1, buildElvenStoneTower, ELVEN_STONE_COLORS, 'elven'),
  ]),
};

export function pickSlimeHostShell(kind: BuildingKind, seed: number): SlimeHostShellDescriptor {
  assertCanonicalKind(kind);
  const options = SLIME_HOST_SHELL_OPTIONS_BY_KIND[kind];
  const rand = mulberry32(seed >>> 0);
  const roll = rand();
  let cumulative = 0;

  for (const option of options) {
    cumulative += option.weight;
    if (roll <= cumulative) return option;
  }

  return options[options.length - 1]!;
}
