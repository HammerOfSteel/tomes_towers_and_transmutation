import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';
import { FLOOR_HEIGHT } from '@/world/buildings/BuildingDNA';
import { finishArchitecturalGeometry } from '@/world/buildings/kit/Bevels';
import { depthFor } from '@/world/buildings/kit/DepthLadder';
import { buildDoorOpening, buildWindowOpening } from '@/world/buildings/kit/OpeningParts';
import {
  buildContainedGelVat,
  buildFacetedDripRun,
  buildGelLensInfill,
  buildGelLipCourse,
  buildMembraneSheet,
  buildPuddleSkirtTiles,
  buildTendrilBridge,
} from '@/world/buildings/slime/SlimeAccretionKit';
import {
  buildSlimeOccupiedShell,
  type SlimeKindBlueprint,
  type SlimeKindBlueprintOpening,
} from '@/world/buildings/slime/SlimeOccupiedShell';
import { applySlimeDoorOverlay } from '@/world/buildings/slime/SlimeOpeningOverlay';
import type { SlimeMaterialSet } from '@/world/buildings/slime/SlimeMaterials';

type BuildingKitKind = 'house' | 'terraced' | 'shop' | 'inn' | 'blacksmith' | 'villa' | 'chapel';
type OpeningFace = SlimeKindBlueprintOpening['face'];

type HouseDamageState = 'light-roof-loss' | 'broken-side-wall' | 'blocked-side-window' | 'exposed-rafters';
type HouseEmphasis = 'membrane-patches' | 'tendril-anchors' | 'hardened-lip-plates' | 'contained-gel-lens';
type GrowthCorner = 'front-left' | 'front-right' | 'rear-left' | 'rear-right';

type TerracedRowLength = 'single-lot' | 'two-bay-illusion' | 'three-bay-illusion';
type TerracedPartyWall = 'both-intact' | 'left-cracked' | 'right-cracked' | 'roof-gap-between-units';
type TerracedCirculation = 'base-gutter' | 'vertical-downspout' | 'window-to-window-membrane' | 'alley-puddle-bridge';
type TerracedSpecialBay = 'blocked-upper-window' | 'bulging-gel-lens' | 'exposed-stair-remnant' | 'small-sign-bracket';

type ShopCounterBay = 'full-width-counter' | 'split-counter-side-door' | 'corner-counter' | 'blocked-repaired-bay';
type ShopCanopy = 'broken-shingle-roof' | 'membrane-awning' | 'mixed-rafter-membrane' | 'heavy-sign-repair-flap';
type ShopGoodsTheme = 'jars' | 'books-scrolls' | 'alchemy-vials' | 'food-mushrooms' | 'mystery-salvage';
type ShopEmphasis = 'counter-drip-lip' | 'gel-lens-display' | 'tendril-shelf-supports' | 'puddle-skirt-threshold';

type InnFrontSpecial = 'hanging-sign' | 'porch-trough' | 'broken-balcony' | 'side-stable-arch';
type InnSocialFeature = 'interior-vat-visible' | 'floor-channel-visible' | 'membrane-awning-patch' | 'glowing-window-lenses';
type InnDamageState = 'light' | 'roof-corner-missing' | 'side-wall-breach' | 'upper-balcony-collapse';
type InnVentState = 'retained-chimney' | 'capped-vent-pipe-cluster' | 'broken-chimney-gel-seam' | 'none';

type BlacksmithHeatSource = 'glowing-acid-vat' | 'mineral-hardening-crucible' | 'steam-vent-furnace' | 'fungal-spore-kiln';
type BlacksmithFrontComposition = 'central-arch' | 'offset-arch-tank' | 'double-pier-opening' | 'half-collapsed-front';
type BlacksmithVentSilhouette = 'tall-chimney' | 'louvred-vent-box' | 'pipe-cluster' | 'broken-chimney-gel-repair';

type VillaMassing = 'rectangular' | 'l-wing' | 'porch-balcony' | 'broken-annex';
type VillaElderExposure = 'roof-skylight' | 'broken-front-bay' | 'side-wall-breach' | 'courtyard-pool';
type VillaGelMotif = 'ring-lip-courses' | 'coral-crown-finials' | 'membrane-skylight' | 'tendril-buttresses';

type ChapelApseTreatment = 'oculus' | 'broken-rose-frame';
type ChapelChoirTreatment = 'tendril-arcs' | 'gel-lens-screen';

interface WeightedOption<T> {
  value: T;
  weight: number;
}

interface HouseVariation {
  dominantGrowthSide: GrowthCorner;
  damageState: HouseDamageState;
  moduleEmphasis: HouseEmphasis;
  halfLoftDormer: boolean;
  hasSideSlit: boolean;
  doorOffset: number;
  frontWindowOffset: number;
  sideWindowFace: OpeningFace;
}

interface TerracedVariation {
  rowLength: TerracedRowLength;
  partyWallCondition: TerracedPartyWall;
  circulation: TerracedCirculation;
  specialBay: TerracedSpecialBay;
  doorOffset: number;
  membraneBridge: boolean;
  downspout: boolean;
}

interface ShopVariation {
  counterBay: ShopCounterBay;
  canopy: ShopCanopy;
  goodsTheme: ShopGoodsTheme;
  slimeEmphasis: ShopEmphasis;
  bayOffset: number;
  bayWidth: number;
  bayDivisions: number;
  repairBay: boolean;
  sideWindowFace: OpeningFace;
}

interface InnVariation {
  frontSpecial: InnFrontSpecial;
  socialFeature: InnSocialFeature;
  damageState: InnDamageState;
  ventState: InnVentState;
  signSide: -1 | 1;
  stableSide: 'left' | 'right';
  entranceOffset: number;
}

interface BlacksmithVariation {
  heatSource: BlacksmithHeatSource;
  frontComposition: BlacksmithFrontComposition;
  ventSilhouette: BlacksmithVentSilhouette;
  workArchOffset: number;
}

interface VillaVariation {
  massing: VillaMassing;
  elderExposure: VillaElderExposure;
  gelMotif: VillaGelMotif;
  damageIntensity: number;
}

interface ChapelVariation {
  apseTreatment: ChapelApseTreatment;
  choirTreatment: ChapelChoirTreatment;
  lancetCloggingRatio: number;
  ruinIntensity: number;
}

interface BuildContext<TVariation> {
  dna: BuildingDNA;
  group: THREE.Group;
  host: THREE.Group;
  hostBox: THREE.Box3;
  materials: SlimeMaterialSet;
  blueprint: SlimeKindBlueprint;
  variation: TVariation;
}

interface OrientedFrontTransform {
  origin: THREE.Vector3;
  rotationY: number;
  outwardNormal: THREE.Vector3;
  width: number;
  reuseHostFrontage: boolean;
}

interface ServiceAnchor {
  position: THREE.Vector3;
  rotationY: number;
  face: OpeningFace;
  outwardNormal: THREE.Vector3;
  reusesHostOpening: boolean;
  opening?: THREE.Group;
}

type ModuleWeights = SlimeKindBlueprint['moduleWeights'];
type PropWeights = SlimeKindBlueprint['propWeights'];

const HOUSE_BLUEPRINT_SALT = 0x4810_0001;
const TERRACED_BLUEPRINT_SALT = 0x4a20_0002;
const SHOP_BLUEPRINT_SALT = 0x4b30_0003;
const INN_BLUEPRINT_SALT = 0x4c40_0004;
const BLACKSMITH_BLUEPRINT_SALT = 0x4d50_0005;
const VILLA_BLUEPRINT_SALT = 0x4e60_0006;
const CHAPEL_BLUEPRINT_SALT = 0x4f70_0007;

const HOUSE_EXTRA_SALT = 0x5100_0001;
const TERRACED_EXTRA_SALT = 0x5200_0002;
const SHOP_EXTRA_SALT = 0x5300_0003;
const INN_EXTRA_SALT = 0x5400_0004;
const BLACKSMITH_EXTRA_SALT = 0x5500_0005;
const VILLA_EXTRA_SALT = 0x5600_0006;
const CHAPEL_EXTRA_SALT = 0x5700_0007;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function seedWithSalt(seed: number, salt: number): number {
  return (seed ^ salt) >>> 0;
}

function rollRange(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}

function pickWeighted<T>(rand: () => number, options: readonly WeightedOption<T>[]): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  const roll = rand() * total;
  let cumulative = 0;
  for (const option of options) {
    cumulative += option.weight;
    if (roll <= cumulative) return option.value;
  }
  return options[options.length - 1]!.value;
}

function withBoostedWeight(weights: ModuleWeights, key: keyof ModuleWeights, amount: number, max = 1): void {
  weights[key] = clamp((weights[key] ?? 0) + amount, 0, max);
}

function withBoostedPropWeight(weights: PropWeights, key: keyof PropWeights, amount: number, max = 1): void {
  weights[key] = clamp((weights[key] ?? 0) + amount, 0, max);
}

function shadowMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function beam(width: number, height: number, depth: number, material: THREE.Material, name: string): THREE.Mesh {
  return shadowMesh(new THREE.BoxGeometry(width, height, depth), material, name);
}

function createRegularPolygonShape(radiusX: number, radiusY: number, sides: number, rotation = 0): THREE.Shape {
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

function createPlaqueShape(width: number, height: number): THREE.Shape {
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const cut = Math.min(width, height) * 0.18;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + cut, -halfH);
  shape.lineTo(halfW - cut, -halfH);
  shape.lineTo(halfW, -halfH + cut);
  shape.lineTo(halfW, halfH - cut);
  shape.lineTo(halfW - cut, halfH);
  shape.lineTo(-halfW + cut, halfH);
  shape.lineTo(-halfW, halfH - cut);
  shape.lineTo(-halfW, -halfH + cut);
  shape.closePath();
  return shape;
}

function extrudeShape(shape: THREE.Shape, depth: number, centered = true): THREE.BufferGeometry {
  const safeDepth = Math.max(depth, 0.01);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: safeDepth,
    steps: 1,
    bevelEnabled: true,
    bevelSize: Math.min(safeDepth * 0.24, 0.03),
    bevelThickness: Math.min(safeDepth * 0.24, 0.03),
    bevelSegments: 1,
  });
  if (centered) geometry.translate(0, 0, -safeDepth * 0.5);
  return finishArchitecturalGeometry(geometry);
}

function createFacetedPlate(
  width: number,
  depth: number,
  thickness: number,
  material: THREE.Material,
  name: string,
  sides = 6,
): THREE.Mesh {
  const geometry = extrudeShape(
    createRegularPolygonShape(width * 0.5, depth * 0.5, sides, Math.PI / sides),
    thickness,
  );
  const mesh = shadowMesh(geometry, material, name);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function normalizeDna(
  dna: BuildingDNA,
  buildingKind: BuildingKitKind,
  size: BuildingDNA['size'],
  floors: BuildingDNA['floors'],
  terrace: BuildingDNA['terrace'] = 'none',
): BuildingDNA {
  return {
    ...dna,
    buildingKind,
    size,
    floors,
    terrace,
  };
}

function requireObject<T extends THREE.Object3D = THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Expected slime building part "${name}"`);
  return object as T;
}

function copyBlueprint(blueprint: SlimeKindBlueprint): SlimeKindBlueprint {
  return {
    footprint: { ...blueprint.footprint },
    floors: blueprint.floors,
    ruinIntensity: blueprint.ruinIntensity,
    openingSchedule: blueprint.openingSchedule.map(opening => ({ ...opening })),
    moduleWeights: { ...blueprint.moduleWeights },
    propWeights: { ...blueprint.propWeights },
  };
}

function faceNormal(face: OpeningFace): THREE.Vector3 {
  switch (face) {
    case 'front':
      return new THREE.Vector3(0, 0, 1);
    case 'back':
      return new THREE.Vector3(0, 0, -1);
    case 'left':
      return new THREE.Vector3(-1, 0, 0);
    case 'right':
      return new THREE.Vector3(1, 0, 0);
  }
}

function faceRotationY(face: OpeningFace): number {
  switch (face) {
    case 'front':
      return 0;
    case 'back':
      return Math.PI;
    case 'left':
      return -Math.PI / 2;
    case 'right':
      return Math.PI / 2;
  }
}

function openingAnchor(box: THREE.Box3, opening: SlimeKindBlueprintOpening): THREE.Vector3 {
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;
  const y = box.min.y + opening.baseY;
  switch (opening.face) {
    case 'front':
      return new THREE.Vector3(centerX + opening.offset, y, box.max.z);
    case 'back':
      return new THREE.Vector3(centerX + opening.offset, y, box.min.z);
    case 'left':
      return new THREE.Vector3(box.min.x, y, centerZ + opening.offset);
    case 'right':
      return new THREE.Vector3(box.max.x, y, centerZ - opening.offset);
  }
}

function groundYForBox(box: THREE.Box3): number {
  return Math.max(0, box.min.y);
}

function hostShellId(root: THREE.Object3D): string | null {
  return typeof root.userData.shellId === 'string'
    ? root.userData.shellId
    : typeof root.userData.hostShellId === 'string'
      ? root.userData.hostShellId
      : null;
}

function collectNamedGroups(root: THREE.Object3D, prefix: string): THREE.Group[] {
  const groups: THREE.Group[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Group && object.name.startsWith(prefix)) groups.push(object);
  });
  return groups;
}

function inferNearestFace(box: THREE.Box3, hostBox: THREE.Box3): OpeningFace {
  const center = box.getCenter(new THREE.Vector3());
  const distances: Array<{ face: OpeningFace; distance: number }> = [
    { face: 'front', distance: Math.abs(hostBox.max.z - center.z) },
    { face: 'back', distance: Math.abs(center.z - hostBox.min.z) },
    { face: 'left', distance: Math.abs(center.x - hostBox.min.x) },
    { face: 'right', distance: Math.abs(hostBox.max.x - center.x) },
  ];
  distances.sort((left, right) => left.distance - right.distance);
  return distances[0]!.face;
}

function syncInnStableSide(context: BuildContext<InnVariation>, side: 'left' | 'right'): void {
  context.variation.stableSide = side;
  const kindVariation = context.group.userData.kindVariation as Partial<InnVariation> | undefined;
  if (kindVariation) kindVariation.stableSide = side;
}

function resolveShopFrontTransform(context: BuildContext<ShopVariation>): OrientedFrontTransform {
  const groundY = groundYForBox(context.hostBox);
  if (hostShellId(context.host) === 'elven-market-stall-shell') {
    const radius = Math.min(context.blueprint.footprint.width, context.blueprint.footprint.depth) * 0.5;
    const rotationY = Math.PI / 8;
    const outwardNormal = new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
    return {
      origin: new THREE.Vector3(
        outwardNormal.x * radius * 1.18,
        groundY,
        outwardNormal.z * radius * 1.18,
      ),
      rotationY,
      outwardNormal,
      width: Math.min(1.5, context.variation.bayWidth * 0.82),
      reuseHostFrontage: true,
    };
  }

  return {
    origin: new THREE.Vector3(context.variation.bayOffset, groundY, context.hostBox.max.z),
    rotationY: 0,
    outwardNormal: new THREE.Vector3(0, 0, 1),
    width: context.variation.bayWidth,
    reuseHostFrontage: false,
  };
}

function resolveInnServiceAnchor(context: BuildContext<InnVariation>): ServiceAnchor {
  const groundY = groundYForBox(context.hostBox);
  const sideDoors = collectNamedGroups(context.host, 'door-opening-')
    .map(opening => {
      const box = new THREE.Box3().setFromObject(opening);
      return { opening, box, face: inferNearestFace(box, context.hostBox) };
    })
    .filter(candidate => (
      (candidate.face === 'left' || candidate.face === 'right')
      && candidate.box.min.y <= groundY + 0.35
    ));

  const reused = sideDoors.find(candidate => candidate.face === context.variation.stableSide)
    ?? sideDoors[0];

  if (reused) {
    const reusedFace = reused.face === 'left' ? 'left' : 'right';
    syncInnStableSide(context, reusedFace);
    const center = reused.box.getCenter(new THREE.Vector3());
    return {
      position: new THREE.Vector3(
        reusedFace === 'left' ? context.hostBox.min.x : context.hostBox.max.x,
        groundY,
        center.z,
      ),
      rotationY: faceRotationY(reusedFace),
      face: reusedFace,
      outwardNormal: faceNormal(reusedFace),
      reusesHostOpening: true,
      opening: reused.opening,
    };
  }

  const fallbackFace: OpeningFace = context.variation.stableSide === 'left' ? 'left' : 'right';
  const fallbackOpening = context.blueprint.openingSchedule.find(opening => (
    opening.kind === 'door' && opening.face === fallbackFace
  ));
  const fallbackPosition = fallbackOpening
    ? openingAnchor(context.hostBox, fallbackOpening)
    : new THREE.Vector3(
      fallbackFace === 'left' ? context.hostBox.min.x : context.hostBox.max.x,
      groundY,
      (context.hostBox.min.z + context.hostBox.max.z) * 0.5,
    );
  fallbackPosition.y = groundYForBox(context.hostBox);
  return {
    position: fallbackPosition,
    rotationY: faceRotationY(fallbackFace),
    face: fallbackFace,
    outwardNormal: faceNormal(fallbackFace),
    reusesHostOpening: false,
  };
}

function makeContext<TVariation>(
  dna: BuildingDNA,
  blueprint: SlimeKindBlueprint,
  variation: TVariation,
  kind: BuildingKitKind,
): BuildContext<TVariation> {
  const group = buildSlimeOccupiedShell(dna, blueprint);
  const host = requireObject<THREE.Group>(group, 'slime-host-shell');
  const hostBox = new THREE.Box3().setFromObject(host);
  const materials = group.userData.slimeMaterialSet as SlimeMaterialSet | undefined;
  if (!materials) throw new Error('Slime occupied shell did not provide a material set.');

  group.name = `slime-${kind}`;
  group.userData.buildingKind = kind;
  group.userData.builder = 'SlimeBuildingKit';
  group.userData.kindBlueprint = copyBlueprint(blueprint);
  group.userData.kindVariation = { ...variation };

  return { dna, group, host, hostBox, materials, blueprint, variation };
}

function createHouseBlueprint(dna: BuildingDNA): { blueprint: SlimeKindBlueprint; variation: HouseVariation } {
  const rand = mulberry32(seedWithSalt(dna.seed, HOUSE_BLUEPRINT_SALT));
  const dominantGrowthSide = pickWeighted(rand, [
    { value: 'front-left' as const, weight: 0.25 },
    { value: 'front-right' as const, weight: 0.25 },
    { value: 'rear-left' as const, weight: 0.25 },
    { value: 'rear-right' as const, weight: 0.25 },
  ]);
  const damageState = pickWeighted(rand, [
    { value: 'light-roof-loss' as const, weight: 0.45 },
    { value: 'broken-side-wall' as const, weight: 0.25 },
    { value: 'blocked-side-window' as const, weight: 0.20 },
    { value: 'exposed-rafters' as const, weight: 0.10 },
  ]);
  const moduleEmphasis = pickWeighted(rand, [
    { value: 'membrane-patches' as const, weight: 0.35 },
    { value: 'tendril-anchors' as const, weight: 0.25 },
    { value: 'hardened-lip-plates' as const, weight: 0.25 },
    { value: 'contained-gel-lens' as const, weight: 0.15 },
  ]);
  const halfLoftDormer = rand() < 0.25;
  const hasSideSlit = damageState === 'blocked-side-window' || rand() < 0.65;
  const doorOffset = rand() < 0.5 ? -(0.68 + rand() * 0.12) : 0.68 + rand() * 0.12;
  const frontWindowOffset = -Math.sign(doorOffset) * (0.82 + rand() * 0.12);
  const sideWindowFace: OpeningFace = dominantGrowthSide.endsWith('left') ? 'right' : 'left';

  const ruinRanges: Record<HouseDamageState, readonly [number, number]> = {
    'light-roof-loss': [0.25, 0.30],
    'broken-side-wall': [0.31, 0.38],
    'blocked-side-window': [0.28, 0.34],
    'exposed-rafters': [0.34, 0.40],
  };
  const [ruinMin, ruinMax] = ruinRanges[damageState];
  const ruinIntensity = rollRange(rand, ruinMin, ruinMax);

  const moduleWeights: ModuleWeights = {
    'gel-lip-course': 0.54,
    'membrane-sheet': 0.58,
    'tendril-bridge': 0.36,
    'faceted-drip-run': 0.48,
    'gel-lens-infill': 0.28,
    'puddle-skirt-tiles': 1,
    'contained-gel-vat': 0.18,
  };

  switch (moduleEmphasis) {
    case 'membrane-patches':
      withBoostedWeight(moduleWeights, 'membrane-sheet', 0.22);
      break;
    case 'tendril-anchors':
      withBoostedWeight(moduleWeights, 'tendril-bridge', 0.24);
      break;
    case 'hardened-lip-plates':
      withBoostedWeight(moduleWeights, 'gel-lip-course', 0.22);
      break;
    case 'contained-gel-lens':
      withBoostedWeight(moduleWeights, 'gel-lens-infill', 0.24);
      break;
  }

  if (damageState === 'light-roof-loss') withBoostedWeight(moduleWeights, 'membrane-sheet', 0.08);
  if (damageState === 'blocked-side-window') withBoostedWeight(moduleWeights, 'gel-lens-infill', 0.1);
  if (damageState === 'exposed-rafters') {
    withBoostedWeight(moduleWeights, 'membrane-sheet', 0.12);
    withBoostedWeight(moduleWeights, 'faceted-drip-run', 0.08);
  }
  if (damageState === 'broken-side-wall') {
    withBoostedWeight(moduleWeights, 'tendril-bridge', 0.1);
  }

  const propWeights: PropWeights = {
    rubble: clamp(0.28 + ruinIntensity * 0.75, 0.36, 0.62),
    'contained-gel-vat': 0.24,
  };
  if (halfLoftDormer) withBoostedPropWeight(propWeights, 'contained-gel-vat', 0.04);

  const openingSchedule: SlimeKindBlueprintOpening[] = [
    {
      kind: 'door',
      face: 'front',
      offset: doorOffset,
      baseY: 0,
      width: 0.8,
      straightHeight: 1.35,
      pointHeight: 0.4,
      cloggingRatio: 0.2 + rand() * 0.08,
    },
    {
      kind: 'window',
      face: 'front',
      offset: frontWindowOffset,
      baseY: 0.8,
      width: 0.55,
      straightHeight: 0.62,
      pointHeight: 0.23,
      cloggingRatio: 0.18 + rand() * 0.08,
    },
  ];

  if (hasSideSlit) {
    openingSchedule.push({
      kind: 'window',
      face: sideWindowFace,
      offset: rand() < 0.5 ? -0.38 : 0.38,
      baseY: 0.9,
      width: 0.3,
      straightHeight: 0.46,
      pointHeight: 0.12,
      cloggingRatio: damageState === 'blocked-side-window' ? 0.48 : 0.26 + rand() * 0.08,
    });
  }

  return {
    blueprint: {
      footprint: { width: 4, depth: 3, skirtAllowance: 0.35 },
      floors: 1,
      openingSchedule,
      ruinIntensity,
      moduleWeights,
      propWeights,
    },
    variation: {
      dominantGrowthSide,
      damageState,
      moduleEmphasis,
      halfLoftDormer,
      hasSideSlit,
      doorOffset,
      frontWindowOffset,
      sideWindowFace,
    },
  };
}

function createTerracedBlueprint(dna: BuildingDNA): { blueprint: SlimeKindBlueprint; variation: TerracedVariation } {
  const rand = mulberry32(seedWithSalt(dna.seed, TERRACED_BLUEPRINT_SALT));
  const rowLength = pickWeighted(rand, [
    { value: 'single-lot' as const, weight: 0.45 },
    { value: 'two-bay-illusion' as const, weight: 0.35 },
    { value: 'three-bay-illusion' as const, weight: 0.20 },
  ]);
  const partyWallCondition = pickWeighted(rand, [
    { value: 'both-intact' as const, weight: 0.50 },
    { value: 'left-cracked' as const, weight: 0.20 },
    { value: 'right-cracked' as const, weight: 0.20 },
    { value: 'roof-gap-between-units' as const, weight: 0.10 },
  ]);
  const circulation = pickWeighted(rand, [
    { value: 'base-gutter' as const, weight: 0.40 },
    { value: 'vertical-downspout' as const, weight: 0.25 },
    { value: 'window-to-window-membrane' as const, weight: 0.20 },
    { value: 'alley-puddle-bridge' as const, weight: 0.15 },
  ]);
  const specialBay = pickWeighted(rand, [
    { value: 'blocked-upper-window' as const, weight: 0.30 },
    { value: 'bulging-gel-lens' as const, weight: 0.25 },
    { value: 'exposed-stair-remnant' as const, weight: 0.20 },
    { value: 'small-sign-bracket' as const, weight: 0.25 },
  ]);

  const doorOffset = rand() < 0.5 ? -0.45 : 0.45;
  const upperFilledIndex = rand() < 0.5 ? 0 : 1;

  const ruinRanges: Record<TerracedPartyWall, readonly [number, number]> = {
    'both-intact': [0.15, 0.22],
    'left-cracked': [0.18, 0.27],
    'right-cracked': [0.18, 0.27],
    'roof-gap-between-units': [0.24, 0.30],
  };
  const [ruinMin, ruinMax] = ruinRanges[partyWallCondition];
  const ruinIntensity = rollRange(rand, ruinMin, ruinMax);

  const moduleWeights: ModuleWeights = {
    'gel-lip-course': 0.62,
    'membrane-sheet': 0.42,
    'tendril-bridge': 0.32,
    'faceted-drip-run': 0.34,
    'gel-lens-infill': 0.38,
    'puddle-skirt-tiles': 0.9,
    'contained-gel-vat': 0.14,
  };

  switch (circulation) {
    case 'base-gutter':
      withBoostedWeight(moduleWeights, 'gel-lip-course', 0.16);
      withBoostedWeight(moduleWeights, 'puddle-skirt-tiles', 0.05);
      break;
    case 'vertical-downspout':
      withBoostedWeight(moduleWeights, 'tendril-bridge', 0.24);
      break;
    case 'window-to-window-membrane':
      withBoostedWeight(moduleWeights, 'membrane-sheet', 0.22);
      break;
    case 'alley-puddle-bridge':
      withBoostedWeight(moduleWeights, 'puddle-skirt-tiles', 0.08);
      withBoostedWeight(moduleWeights, 'tendril-bridge', 0.1);
      break;
  }

  if (specialBay === 'blocked-upper-window') withBoostedWeight(moduleWeights, 'gel-lens-infill', 0.08);
  if (specialBay === 'bulging-gel-lens') withBoostedWeight(moduleWeights, 'gel-lens-infill', 0.2);
  if (specialBay === 'small-sign-bracket') withBoostedWeight(moduleWeights, 'gel-lip-course', 0.05);

  const propWeights: PropWeights = {
    rubble: clamp(0.16 + ruinIntensity * 0.8, 0.28, 0.44),
    'contained-gel-vat': specialBay === 'bulging-gel-lens' ? 0.22 : 0.16,
  };

  const upperWindowBaseY = FLOOR_HEIGHT + 0.55;
  const baseClogging = specialBay === 'blocked-upper-window' ? 0.32 : 0.22;
  const openingSchedule: SlimeKindBlueprintOpening[] = [
    {
      kind: 'door',
      face: 'front',
      offset: doorOffset,
      baseY: 0,
      width: 0.75,
      straightHeight: 1.22,
      pointHeight: 0.43,
      cloggingRatio: 0.18 + rand() * 0.06,
    },
    {
      kind: 'window',
      face: 'front',
      offset: -0.68,
      baseY: upperWindowBaseY,
      width: 0.45,
      straightHeight: 0.56,
      pointHeight: 0.19,
      cloggingRatio: upperFilledIndex === 0 ? baseClogging : 0.16 + rand() * 0.06,
    },
    {
      kind: 'window',
      face: 'front',
      offset: 0.68,
      baseY: upperWindowBaseY,
      width: 0.45,
      straightHeight: 0.56,
      pointHeight: 0.19,
      cloggingRatio: upperFilledIndex === 1 ? baseClogging : 0.16 + rand() * 0.06,
    },
    {
      kind: 'window',
      face: 'back',
      offset: 0,
      baseY: 1.05,
      width: 0.32,
      straightHeight: 0.36,
      pointHeight: 0.1,
      cloggingRatio: 0.18 + rand() * 0.06,
    },
  ];

  return {
    blueprint: {
      footprint: { width: 3, depth: 4, skirtAllowance: 0.35 },
      floors: 2,
      openingSchedule,
      ruinIntensity,
      moduleWeights,
      propWeights,
    },
    variation: {
      rowLength,
      partyWallCondition,
      circulation,
      specialBay,
      doorOffset,
      membraneBridge: circulation === 'window-to-window-membrane' || rand() < 0.35,
      downspout: circulation === 'vertical-downspout' || rand() < 0.35,
    },
  };
}

function createShopBlueprint(dna: BuildingDNA): { blueprint: SlimeKindBlueprint; variation: ShopVariation } {
  const rand = mulberry32(seedWithSalt(dna.seed, SHOP_BLUEPRINT_SALT));
  const counterBay = pickWeighted(rand, [
    { value: 'full-width-counter' as const, weight: 0.45 },
    { value: 'split-counter-side-door' as const, weight: 0.25 },
    { value: 'corner-counter' as const, weight: 0.20 },
    { value: 'blocked-repaired-bay' as const, weight: 0.10 },
  ]);
  const canopy = pickWeighted(rand, [
    { value: 'broken-shingle-roof' as const, weight: 0.35 },
    { value: 'membrane-awning' as const, weight: 0.35 },
    { value: 'mixed-rafter-membrane' as const, weight: 0.20 },
    { value: 'heavy-sign-repair-flap' as const, weight: 0.10 },
  ]);
  const goodsTheme = pickWeighted(rand, [
    { value: 'jars' as const, weight: 0.30 },
    { value: 'books-scrolls' as const, weight: 0.20 },
    { value: 'alchemy-vials' as const, weight: 0.20 },
    { value: 'food-mushrooms' as const, weight: 0.15 },
    { value: 'mystery-salvage' as const, weight: 0.15 },
  ]);
  const slimeEmphasis = pickWeighted(rand, [
    { value: 'counter-drip-lip' as const, weight: 0.30 },
    { value: 'gel-lens-display' as const, weight: 0.25 },
    { value: 'tendril-shelf-supports' as const, weight: 0.20 },
    { value: 'puddle-skirt-threshold' as const, weight: 0.25 },
  ]);

  let bayOffset = 0;
  let bayWidth = 2;
  let bayDivisions = 1;
  let repairBay = false;
  switch (counterBay) {
    case 'split-counter-side-door':
      bayOffset = -0.35;
      bayWidth = 1.55;
      break;
    case 'corner-counter':
      bayOffset = rand() < 0.5 ? -0.45 : 0.45;
      bayWidth = 1.45;
      break;
    case 'blocked-repaired-bay':
      bayWidth = 1.7;
      bayDivisions = 2;
      repairBay = true;
      break;
    case 'full-width-counter':
    default:
      bayWidth = 2;
      bayDivisions = 1;
      break;
  }

  const ruinIntensity = rollRange(rand, 0.15, 0.30);
  const moduleWeights: ModuleWeights = {
    'gel-lip-course': 0.5,
    'membrane-sheet': 0.68,
    'tendril-bridge': 0.24,
    'faceted-drip-run': 0.42,
    'gel-lens-infill': 0.32,
    'puddle-skirt-tiles': 0.78,
    'contained-gel-vat': 0.16,
  };

  if (canopy === 'membrane-awning') withBoostedWeight(moduleWeights, 'membrane-sheet', 0.2);
  if (canopy === 'mixed-rafter-membrane') withBoostedWeight(moduleWeights, 'membrane-sheet', 0.12);
  if (canopy === 'heavy-sign-repair-flap') withBoostedWeight(moduleWeights, 'faceted-drip-run', 0.08);

  switch (slimeEmphasis) {
    case 'counter-drip-lip':
      withBoostedWeight(moduleWeights, 'gel-lip-course', 0.22);
      break;
    case 'gel-lens-display':
      withBoostedWeight(moduleWeights, 'gel-lens-infill', 0.22);
      break;
    case 'tendril-shelf-supports':
      withBoostedWeight(moduleWeights, 'tendril-bridge', 0.2);
      break;
    case 'puddle-skirt-threshold':
      withBoostedWeight(moduleWeights, 'puddle-skirt-tiles', 0.12);
      break;
  }

  const propWeights: PropWeights = {
    rubble: clamp(0.12 + ruinIntensity * 0.6, 0.2, 0.32),
    'contained-gel-vat': goodsTheme === 'jars' ? 0.18 : 0.12,
  };

  const sideWindowFace: OpeningFace = bayOffset >= 0 ? 'right' : 'left';
  const openingSchedule: SlimeKindBlueprintOpening[] = [
    {
      kind: 'window',
      face: 'front',
      offset: bayOffset,
      baseY: 0.85,
      width: bayWidth,
      straightHeight: 0.95,
      pointHeight: 0.25,
      cloggingRatio: 0.2,
    },
    {
      kind: 'door',
      face: 'back',
      offset: bayOffset > 0 ? -0.55 : 0.55,
      baseY: 0,
      width: 0.8,
      straightHeight: 1.24,
      pointHeight: 0.36,
      cloggingRatio: 0.16 + rand() * 0.06,
    },
    {
      kind: 'window',
      face: sideWindowFace,
      offset: rand() < 0.5 ? -0.35 : 0.35,
      baseY: 1.02,
      width: 0.42,
      straightHeight: 0.54,
      pointHeight: 0.18,
      cloggingRatio: slimeEmphasis === 'gel-lens-display' ? 0.3 : 0.2,
    },
  ];

  return {
    blueprint: {
      footprint: { width: 4, depth: 3, skirtAllowance: 0.35 },
      floors: 1,
      openingSchedule,
      ruinIntensity,
      moduleWeights,
      propWeights,
    },
    variation: {
      counterBay,
      canopy,
      goodsTheme,
      slimeEmphasis,
      bayOffset,
      bayWidth,
      bayDivisions,
      repairBay,
      sideWindowFace,
    },
  };
}

function createInnBlueprint(dna: BuildingDNA): { blueprint: SlimeKindBlueprint; variation: InnVariation } {
  const rand = mulberry32(seedWithSalt(dna.seed, INN_BLUEPRINT_SALT));
  const frontSpecial = pickWeighted(rand, [
    { value: 'hanging-sign' as const, weight: 0.35 },
    { value: 'porch-trough' as const, weight: 0.25 },
    { value: 'broken-balcony' as const, weight: 0.20 },
    { value: 'side-stable-arch' as const, weight: 0.20 },
  ]);
  const socialFeature = pickWeighted(rand, [
    { value: 'interior-vat-visible' as const, weight: 0.30 },
    { value: 'floor-channel-visible' as const, weight: 0.25 },
    { value: 'membrane-awning-patch' as const, weight: 0.20 },
    { value: 'glowing-window-lenses' as const, weight: 0.25 },
  ]);
  const damageState = pickWeighted(rand, [
    { value: 'light' as const, weight: 0.50 },
    { value: 'roof-corner-missing' as const, weight: 0.25 },
    { value: 'side-wall-breach' as const, weight: 0.15 },
    { value: 'upper-balcony-collapse' as const, weight: 0.10 },
  ]);
  const ventState = pickWeighted(rand, [
    { value: 'retained-chimney' as const, weight: 0.45 },
    { value: 'capped-vent-pipe-cluster' as const, weight: 0.25 },
    { value: 'broken-chimney-gel-seam' as const, weight: 0.20 },
    { value: 'none' as const, weight: 0.10 },
  ]);

  const signSide = rand() < 0.5 ? -1 : 1;
  const stableSide = signSide > 0 ? 'left' : 'right';
  const entranceOffset = frontSpecial === 'broken-balcony'
    ? 0.35
    : signSide > 0 ? -0.45 : 0.35;

  const ruinRanges: Record<InnDamageState, readonly [number, number]> = {
    light: [0.20, 0.25],
    'roof-corner-missing': [0.24, 0.31],
    'side-wall-breach': [0.28, 0.35],
    'upper-balcony-collapse': [0.27, 0.34],
  };
  const [ruinMin, ruinMax] = ruinRanges[damageState];
  const ruinIntensity = rollRange(rand, ruinMin, ruinMax);

  const moduleWeights: ModuleWeights = {
    'gel-lip-course': 0.58,
    'membrane-sheet': 0.54,
    'tendril-bridge': 0.28,
    'faceted-drip-run': 0.44,
    'gel-lens-infill': 0.42,
    'puddle-skirt-tiles': 0.72,
    'contained-gel-vat': 0.36,
  };

  if (frontSpecial === 'porch-trough') withBoostedWeight(moduleWeights, 'gel-lip-course', 0.16);
  if (frontSpecial === 'side-stable-arch') withBoostedWeight(moduleWeights, 'tendril-bridge', 0.1);
  if (socialFeature === 'interior-vat-visible') withBoostedWeight(moduleWeights, 'contained-gel-vat', 0.18);
  if (socialFeature === 'floor-channel-visible') withBoostedWeight(moduleWeights, 'gel-lip-course', 0.14);
  if (socialFeature === 'membrane-awning-patch') withBoostedWeight(moduleWeights, 'membrane-sheet', 0.18);
  if (socialFeature === 'glowing-window-lenses') withBoostedWeight(moduleWeights, 'gel-lens-infill', 0.18);

  const propWeights: PropWeights = {
    rubble: clamp(0.14 + ruinIntensity * 0.7, 0.26, 0.42),
    'contained-gel-vat': socialFeature === 'interior-vat-visible' ? 0.48 : 0.38,
  };
  if (ventState === 'none') withBoostedPropWeight(propWeights, 'contained-gel-vat', 0.02);

  const frontWindowClogging = socialFeature === 'glowing-window-lenses' ? 0.28 : 0.18 + rand() * 0.06;
  const upperWindowClogging = socialFeature === 'glowing-window-lenses' ? 0.3 : 0.18 + rand() * 0.08;
  const serviceFace: OpeningFace = stableSide === 'left' ? 'left' : 'right';
  const openingSchedule: SlimeKindBlueprintOpening[] = [
    {
      kind: 'door',
      face: 'front',
      offset: entranceOffset,
      baseY: 0,
      width: 1.2,
      straightHeight: 1.45,
      pointHeight: 0.55,
      cloggingRatio: 0.18 + rand() * 0.06,
    },
    {
      kind: 'window',
      face: 'front',
      offset: -2.2,
      baseY: 0.82,
      width: 0.9,
      straightHeight: 0.78,
      pointHeight: 0.22,
      cloggingRatio: frontWindowClogging,
    },
    {
      kind: 'window',
      face: 'front',
      offset: 2.2,
      baseY: 0.82,
      width: 0.9,
      straightHeight: 0.78,
      pointHeight: 0.22,
      cloggingRatio: frontWindowClogging,
    },
    {
      kind: 'window',
      face: 'front',
      offset: -2.35,
      baseY: FLOOR_HEIGHT + 0.72,
      width: 0.62,
      straightHeight: 0.48,
      pointHeight: 0.22,
      cloggingRatio: upperWindowClogging,
    },
    {
      kind: 'window',
      face: 'front',
      offset: 0,
      baseY: FLOOR_HEIGHT + 0.72,
      width: 0.62,
      straightHeight: 0.48,
      pointHeight: 0.22,
      cloggingRatio: upperWindowClogging,
    },
    {
      kind: 'window',
      face: 'front',
      offset: 2.35,
      baseY: FLOOR_HEIGHT + 0.72,
      width: 0.62,
      straightHeight: 0.48,
      pointHeight: 0.22,
      cloggingRatio: upperWindowClogging,
    },
    {
      kind: 'door',
      face: serviceFace,
      offset: -1.1,
      baseY: 0,
      width: 1,
      straightHeight: 1.12,
      pointHeight: 0.38,
      cloggingRatio: 0.22 + rand() * 0.06,
    },
  ];

  return {
    blueprint: {
      footprint: { width: 7, depth: 5, skirtAllowance: 0.35 },
      floors: 2,
      openingSchedule,
      ruinIntensity,
      moduleWeights,
      propWeights,
    },
    variation: {
      frontSpecial,
      socialFeature,
      damageState,
      ventState,
      signSide,
      stableSide,
      entranceOffset,
    },
  };
}

function createBlacksmithBlueprint(dna: BuildingDNA): { blueprint: SlimeKindBlueprint; variation: BlacksmithVariation } {
  const rand = mulberry32(seedWithSalt(dna.seed, BLACKSMITH_BLUEPRINT_SALT));
  const heatSource = pickWeighted(rand, [
    { value: 'glowing-acid-vat' as const, weight: 0.35 },
    { value: 'mineral-hardening-crucible' as const, weight: 0.30 },
    { value: 'steam-vent-furnace' as const, weight: 0.20 },
    { value: 'fungal-spore-kiln' as const, weight: 0.15 },
  ]);
  const frontComposition = pickWeighted(rand, [
    { value: 'central-arch' as const, weight: 0.45 },
    { value: 'offset-arch-tank' as const, weight: 0.25 },
    { value: 'double-pier-opening' as const, weight: 0.20 },
    { value: 'half-collapsed-front' as const, weight: 0.10 },
  ]);
  const ventSilhouette = pickWeighted(rand, [
    { value: 'tall-chimney' as const, weight: 0.35 },
    { value: 'louvred-vent-box' as const, weight: 0.30 },
    { value: 'pipe-cluster' as const, weight: 0.20 },
    { value: 'broken-chimney-gel-repair' as const, weight: 0.15 },
  ]);
  const workArchOffset = frontComposition === 'offset-arch-tank' ? (rand() < 0.5 ? -0.55 : 0.55) : 0;

  const ruinRanges: Record<BlacksmithFrontComposition, readonly [number, number]> = {
    'central-arch': [0.10, 0.18],
    'offset-arch-tank': [0.14, 0.20],
    'double-pier-opening': [0.16, 0.22],
    'half-collapsed-front': [0.20, 0.25],
  };
  const [ruinMin, ruinMax] = ruinRanges[frontComposition];
  const ruinIntensity = rollRange(rand, ruinMin, ruinMax);

  const moduleWeights: ModuleWeights = {
    'gel-lip-course': 0.62,
    'membrane-sheet': 0.40,
    'tendril-bridge': 0.32,
    'faceted-drip-run': 0.30,
    'gel-lens-infill': 0.18,
    'puddle-skirt-tiles': 0.85,
    'contained-gel-vat': 0.45,
  };
  if (heatSource === 'glowing-acid-vat') withBoostedWeight(moduleWeights, 'contained-gel-vat', 0.2);
  if (heatSource === 'steam-vent-furnace') withBoostedWeight(moduleWeights, 'membrane-sheet', 0.15);
  if (frontComposition === 'half-collapsed-front') withBoostedWeight(moduleWeights, 'tendril-bridge', 0.15);

  const propWeights: PropWeights = {
    rubble: clamp(0.22 + ruinIntensity * 0.7, 0.28, 0.5),
    'contained-gel-vat': heatSource === 'glowing-acid-vat' ? 0.5 : 0.22,
  };

  const openingSchedule: SlimeKindBlueprintOpening[] = [
    {
      kind: 'door',
      face: 'front',
      offset: workArchOffset,
      baseY: 0,
      width: 2.2,
      straightHeight: 1.55,
      pointHeight: 0.32,
      cloggingRatio: 0.06 + rand() * 0.06,
    },
    {
      kind: 'door',
      face: 'back',
      offset: 0,
      baseY: 0,
      width: 0.9,
      straightHeight: 1.5,
      pointHeight: 0.28,
      cloggingRatio: 0.12 + rand() * 0.08,
    },
  ];

  return {
    blueprint: {
      footprint: { width: 5, depth: 4, skirtAllowance: 0.3 },
      floors: 1,
      openingSchedule,
      ruinIntensity,
      moduleWeights,
      propWeights,
    },
    variation: {
      heatSource,
      frontComposition,
      ventSilhouette,
      workArchOffset,
    },
  };
}

function createVillaBlueprint(dna: BuildingDNA): { blueprint: SlimeKindBlueprint; variation: VillaVariation } {
  const rand = mulberry32(seedWithSalt(dna.seed, VILLA_BLUEPRINT_SALT));
  const massing = pickWeighted(rand, [
    { value: 'rectangular' as const, weight: 0.40 },
    { value: 'l-wing' as const, weight: 0.30 },
    { value: 'porch-balcony' as const, weight: 0.20 },
    { value: 'broken-annex' as const, weight: 0.10 },
  ]);
  const elderExposure = pickWeighted(rand, [
    { value: 'roof-skylight' as const, weight: 0.35 },
    { value: 'broken-front-bay' as const, weight: 0.25 },
    { value: 'side-wall-breach' as const, weight: 0.20 },
    { value: 'courtyard-pool' as const, weight: 0.20 },
  ]);
  const gelMotif = pickWeighted(rand, [
    { value: 'ring-lip-courses' as const, weight: 0.35 },
    { value: 'coral-crown-finials' as const, weight: 0.25 },
    { value: 'membrane-skylight' as const, weight: 0.25 },
    { value: 'tendril-buttresses' as const, weight: 0.15 },
  ]);
  const damageRanges: Record<VillaMassing, readonly [number, number]> = {
    rectangular: [0.30, 0.38],
    'l-wing': [0.32, 0.42],
    'porch-balcony': [0.30, 0.40],
    'broken-annex': [0.40, 0.50],
  };
  const [damageMin, damageMax] = damageRanges[massing];
  const damageIntensity = rollRange(rand, damageMin, damageMax);

  const moduleWeights: ModuleWeights = {
    'gel-lip-course': 0.55,
    'membrane-sheet': gelMotif === 'membrane-skylight' ? 0.55 : 0.28,
    'tendril-bridge': gelMotif === 'tendril-buttresses' ? 0.5 : 0.24,
    'faceted-drip-run': 0.26,
    'gel-lens-infill': 0.30,
    'puddle-skirt-tiles': 0.5,
    'contained-gel-vat': 0.28,
  };

  const propWeights: PropWeights = {
    rubble: clamp(0.28 + damageIntensity * 0.6, 0.32, 0.55),
    'contained-gel-vat': 0.3,
  };

  const openingSchedule: SlimeKindBlueprintOpening[] = [
    { kind: 'door', face: 'front', offset: 0, baseY: 0, width: 1.4, straightHeight: 1.65, pointHeight: 0.65, cloggingRatio: 0.05 },
    { kind: 'window', face: 'front', offset: -2.15, baseY: 0.82, width: 0.78, straightHeight: 0.8, pointHeight: 0.26, cloggingRatio: 0.35 },
    { kind: 'window', face: 'front', offset: -1.05, baseY: 0.82, width: 0.78, straightHeight: 0.8, pointHeight: 0.26, cloggingRatio: 0.35 },
    { kind: 'window', face: 'front', offset: 1.05, baseY: 0.82, width: 0.78, straightHeight: 0.8, pointHeight: 0.26, cloggingRatio: 0.35 },
    { kind: 'window', face: 'front', offset: 2.15, baseY: 0.82, width: 0.78, straightHeight: 0.8, pointHeight: 0.26, cloggingRatio: 0.35 },
    { kind: 'window', face: 'front', offset: -2.35, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24, cloggingRatio: 0.4 },
    { kind: 'window', face: 'front', offset: -1.15, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24, cloggingRatio: 0.4 },
    { kind: 'window', face: 'front', offset: 0, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24, cloggingRatio: 0.4 },
    { kind: 'window', face: 'front', offset: 1.15, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24, cloggingRatio: 0.4 },
    { kind: 'window', face: 'front', offset: 2.35, baseY: FLOOR_HEIGHT + 0.7, width: 0.65, straightHeight: 0.72, pointHeight: 0.24, cloggingRatio: 0.4 },
  ];

  return {
    blueprint: {
      footprint: { width: 7, depth: 5, skirtAllowance: 0.35 },
      floors: 3,
      openingSchedule,
      ruinIntensity: damageIntensity,
      moduleWeights,
      propWeights,
    },
    variation: {
      massing,
      elderExposure,
      gelMotif,
      damageIntensity,
    },
  };
}

function createChapelBlueprint(dna: BuildingDNA): { blueprint: SlimeKindBlueprint; variation: ChapelVariation } {
  const rand = mulberry32(seedWithSalt(dna.seed, CHAPEL_BLUEPRINT_SALT));
  const apseTreatment = pickWeighted(rand, [
    { value: 'oculus' as const, weight: 0.55 },
    { value: 'broken-rose-frame' as const, weight: 0.45 },
  ]);
  const choirTreatment = pickWeighted(rand, [
    { value: 'tendril-arcs' as const, weight: 0.6 },
    { value: 'gel-lens-screen' as const, weight: 0.4 },
  ]);
  const lancetCloggingRatio = rollRange(rand, 0.4, 0.7);
  const ruinIntensity = rollRange(rand, 0.45, 0.65);

  const moduleWeights: ModuleWeights = {
    'gel-lip-course': 0.6,
    'membrane-sheet': 0.3,
    'tendril-bridge': choirTreatment === 'tendril-arcs' ? 0.55 : 0.25,
    'faceted-drip-run': 0.3,
    'gel-lens-infill': choirTreatment === 'gel-lens-screen' ? 0.55 : 0.35,
    'puddle-skirt-tiles': 0.65,
    'contained-gel-vat': 0.2,
  };

  const propWeights: PropWeights = {
    rubble: clamp(0.35 + ruinIntensity * 0.4, 0.4, 0.6),
    'contained-gel-vat': 0.15,
  };

  const openingSchedule: SlimeKindBlueprintOpening[] = [
    { kind: 'door', face: 'front', offset: 0, baseY: 0, width: 1.0, straightHeight: 1.55, pointHeight: 0.55, cloggingRatio: 0.08 },
    { kind: 'window', face: 'left', offset: -1.4, baseY: 1.35, width: 0.55, straightHeight: 1.15, pointHeight: 0.2, cloggingRatio: lancetCloggingRatio },
    { kind: 'window', face: 'left', offset: 1.4, baseY: 1.35, width: 0.55, straightHeight: 1.15, pointHeight: 0.2, cloggingRatio: lancetCloggingRatio },
    { kind: 'window', face: 'right', offset: -1.4, baseY: 1.35, width: 0.55, straightHeight: 1.15, pointHeight: 0.2, cloggingRatio: lancetCloggingRatio },
    { kind: 'window', face: 'right', offset: 1.4, baseY: 1.35, width: 0.55, straightHeight: 1.15, pointHeight: 0.2, cloggingRatio: lancetCloggingRatio },
  ];

  return {
    blueprint: {
      footprint: { width: 4, depth: 8, skirtAllowance: 0.3 },
      floors: 1,
      openingSchedule,
      ruinIntensity,
      moduleWeights,
      propWeights,
    },
    variation: {
      apseTreatment,
      choirTreatment,
      lancetCloggingRatio,
      ruinIntensity,
    },
  };
}

function buildHouseDoorPath(context: BuildContext<HouseVariation>, seed: number): THREE.Group {
  const path = new THREE.Group();
  path.name = 'house-door-puddle-path';
  const rand = mulberry32(seed);
  const door = context.blueprint.openingSchedule.find(opening => opening.kind === 'door' && opening.face === 'front');
  if (!door) return path;

  const doorAnchor = openingAnchor(context.hostBox, door);
  const groundY = groundYForBox(context.hostBox);
  const segmentCount = 3;
  for (let index = 0; index < segmentCount; index++) {
    const center = new THREE.Vector3(
      doorAnchor.x + (rand() - 0.5) * 0.12,
      groundY,
      doorAnchor.z + 0.16 + index * 0.34,
    );
    const tiles = buildPuddleSkirtTiles({
      seed: seedWithSalt(seed, 0x31 + index),
      center,
      radiusX: 0.18 + index * 0.03,
      radiusZ: 0.16 + index * 0.05,
      material: context.materials.gelDark,
      tileCount: 4 + index,
    });
    tiles.name = `house-door-path-segment-${index}`;
    path.add(tiles);
  }

  path.userData.overlayRole = 'door-puddle-path';
  return path;
}

function buildHousePebbles(context: BuildContext<HouseVariation>, seed: number): THREE.Group {
  const pebbles = new THREE.Group();
  pebbles.name = 'house-ooze-pebbles';
  const rand = mulberry32(seed);
  const groundY = groundYForBox(context.hostBox);
  const startX = context.hostBox.min.x + 0.35;
  const startZ = context.hostBox.max.z + 0.24;
  const count = 3 + Math.floor(rand() * 2);

  for (let index = 0; index < count; index++) {
    const mesh = createFacetedPlate(
      0.12 + rand() * 0.06,
      0.1 + rand() * 0.04,
      0.04 + rand() * 0.02,
      context.materials.gel,
      `ooze-pebble-${index}`,
      5,
    );
    mesh.position.set(
      startX + index * 0.16 + (rand() - 0.5) * 0.05,
      groundY + 0.08 + rand() * 0.03,
      startZ + (rand() - 0.5) * 0.16,
    );
    mesh.rotation.y = rand() * Math.PI;
    pebbles.add(mesh);
  }

  return pebbles;
}

function buildCrateShelf(context: BuildContext<HouseVariation>, seed: number): THREE.Group {
  const shelf = new THREE.Group();
  shelf.name = 'house-crate-shelf';
  const rand = mulberry32(seed);
  const groundY = groundYForBox(context.hostBox);
  const sideSign = context.variation.sideWindowFace === 'left' ? -1 : 1;
  const x = sideSign < 0 ? context.hostBox.min.x + 0.28 : context.hostBox.max.x - 0.28;
  const z = context.hostBox.min.z + 0.48 + rand() * 0.24;
  const uprightDepth = 0.08;
  const uprightHeight = 0.62;
  const shelfWidth = 0.54;
  const uprightOffset = 0.2;

  const leftUpright = beam(0.06, uprightHeight, uprightDepth, context.materials.wetStain, 'shelf-upright-left');
  leftUpright.position.set(x + sideSign * uprightOffset, groundY + uprightHeight * 0.5, z);
  shelf.add(leftUpright);

  const rightUpright = beam(0.06, uprightHeight, uprightDepth, context.materials.wetStain, 'shelf-upright-right');
  rightUpright.position.set(x - sideSign * uprightOffset, groundY + uprightHeight * 0.5, z);
  shelf.add(rightUpright);

  const topRail = beam(shelfWidth, 0.05, uprightDepth, context.materials.hardenedGel, 'shelf-top-rail');
  topRail.position.set(x, groundY + uprightHeight - 0.06, z);
  shelf.add(topRail);

  const shelfPlank = beam(shelfWidth * 0.92, 0.05, 0.16, context.materials.wetStain, 'shelf-plank');
  shelfPlank.position.set(x, groundY + 0.28, z);
  shelf.add(shelfPlank);

  const crateBase = beam(0.26, 0.1, 0.18, context.materials.wetStain, 'crate-base');
  crateBase.position.set(x + sideSign * 0.06, groundY + 0.36, z);
  shelf.add(crateBase);

  const crateRim = beam(0.28, 0.04, 0.2, context.materials.hardenedGel, 'crate-rim');
  crateRim.position.set(x + sideSign * 0.06, groundY + 0.43, z);
  shelf.add(crateRim);

  return shelf;
}

function buildHouseLantern(context: BuildContext<HouseVariation>, seed: number): THREE.Group {
  const groundY = groundYForBox(context.hostBox);
  const lantern = buildContainedGelVat({
    seed,
    radius: 0.11,
    height: 0.34,
    frameMaterial: context.materials.hardenedGel,
    bandMaterial: context.materials.gelDark,
    gelMaterial: context.materials.containedGel,
    baseMaterial: context.materials.wetStain,
    bandCount: 2,
  });
  lantern.name = 'house-core-lantern';
  lantern.position.set(
    context.hostBox.min.x + 0.46,
    groundY + 0.28,
    context.hostBox.max.z - 0.16,
  );
  lantern.scale.setScalar(0.88);
  lantern.userData.propRole = 'core-lantern';
  return lantern;
}

function buildHouseDormerRemnant(context: BuildContext<HouseVariation>, seed: number): THREE.Group {
  const dormer = new THREE.Group();
  dormer.name = 'house-dormer-remnant';
  const face: OpeningFace = context.variation.dominantGrowthSide.startsWith('rear') ? 'back' : 'front';
  const side = context.variation.dominantGrowthSide.endsWith('left') ? -1 : 1;
  const anchor = new THREE.Vector3(
    side < 0 ? context.hostBox.min.x + 0.72 : context.hostBox.max.x - 0.72,
    context.hostBox.max.y - 0.34,
    face === 'front' ? context.hostBox.max.z - 0.26 : context.hostBox.min.z + 0.26,
  );
  dormer.position.copy(anchor);
  dormer.rotation.y = faceRotationY(face);

  const sill = beam(0.58, 0.08, 0.12, context.materials.wetStain, 'dormer-sill');
  sill.position.set(0, 0.02, 0.04);
  dormer.add(sill);

  const leftPost = beam(0.08, 0.46, 0.1, context.materials.hardenedGel, 'dormer-post-left');
  leftPost.position.set(-0.22, 0.23, 0.02);
  dormer.add(leftPost);

  const rightPost = beam(0.08, 0.46, 0.1, context.materials.hardenedGel, 'dormer-post-right');
  rightPost.position.set(0.22, 0.23, 0.02);
  dormer.add(rightPost);

  const lintel = beam(0.52, 0.08, 0.1, context.materials.hardenedGel, 'dormer-lintel');
  lintel.position.set(0, 0.46, 0.02);
  dormer.add(lintel);

  const patch = buildMembraneSheet({
    seed,
    corners: [
      new THREE.Vector3(-0.22, 0.42, depthFor('GLAZING')),
      new THREE.Vector3(0.22, 0.42, depthFor('GLAZING')),
      new THREE.Vector3(0.22, 0.1, depthFor('GLAZING')),
      new THREE.Vector3(-0.22, 0.1, depthFor('GLAZING')),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: 0.04,
    ribCount: 1,
  });
  patch.name = 'dormer-membrane-patch';
  dormer.add(patch);

  const breakPlate = beam(0.24, 0.05, 0.1, context.materials.gelDark, 'dormer-break-plate');
  breakPlate.position.set(side * 0.12, 0.56, -0.02);
  breakPlate.rotation.z = side * -0.28;
  dormer.add(breakPlate);

  return dormer;
}

function addHouseExtras(context: BuildContext<HouseVariation>): void {
  context.group.add(buildHouseDoorPath(context, seedWithSalt(context.dna.seed, HOUSE_EXTRA_SALT)));
  context.group.add(buildHousePebbles(context, seedWithSalt(context.dna.seed, HOUSE_EXTRA_SALT ^ 0x17)));
  context.group.add(buildCrateShelf(context, seedWithSalt(context.dna.seed, HOUSE_EXTRA_SALT ^ 0x22)));
  context.group.add(buildHouseLantern(context, seedWithSalt(context.dna.seed, HOUSE_EXTRA_SALT ^ 0x33)));
  if (context.variation.halfLoftDormer) {
    context.group.add(buildHouseDormerRemnant(context, seedWithSalt(context.dna.seed, HOUSE_EXTRA_SALT ^ 0x3f)));
  }

  const rand = mulberry32(seedWithSalt(context.dna.seed, HOUSE_EXTRA_SALT ^ 0x44));
  const extraDripCount = 1 + Math.floor(rand() * 2);
  const y = context.hostBox.max.y - 0.18;
  const z = context.hostBox.max.z + 0.03;
  for (let index = 0; index < extraDripCount; index++) {
    const centerX = (context.hostBox.min.x + context.hostBox.max.x) * 0.5 + (rand() - 0.5) * 0.8;
    const drip = buildFacetedDripRun({
      seed: seedWithSalt(context.dna.seed, HOUSE_EXTRA_SALT ^ (0x90 + index)),
      start: new THREE.Vector3(centerX - 0.22, y, z),
      end: new THREE.Vector3(centerX + 0.22, y, z),
      material: context.materials.gel,
      dripCount: 3,
    });
    drip.name = `house-eave-drip-run-${index}`;
    drip.userData.overlayRole = 'house-eave-drip';
    context.group.add(drip);
  }
}

function buildTerracedGutter(context: BuildContext<TerracedVariation>, seed: number): THREE.Group {
  const gutter = new THREE.Group();
  gutter.name = 'terraced-base-gutter';
  const y = groundYForBox(context.hostBox) + 0.12;
  const frontStart = new THREE.Vector3(context.hostBox.min.x + 0.08, y, context.hostBox.max.z + 0.02);
  const frontEnd = new THREE.Vector3(context.hostBox.max.x - 0.08, y, context.hostBox.max.z + 0.02);
  const front = buildGelLipCourse({
    seed,
    start: frontStart,
    end: frontEnd,
    outwardNormal: new THREE.Vector3(0, 0, 1),
    material: context.materials.hardenedGel,
    plateCount: 8,
  });
  front.name = 'terraced-gutter-front';
  gutter.add(front);

  const returnDepth = Math.min(0.7, (context.hostBox.max.z - context.hostBox.min.z) * 0.3);
  const leftReturn = buildGelLipCourse({
    seed: seedWithSalt(seed, 0x01),
    start: new THREE.Vector3(context.hostBox.min.x + 0.04, y, context.hostBox.max.z - returnDepth),
    end: new THREE.Vector3(context.hostBox.min.x + 0.04, y, context.hostBox.max.z + 0.02),
    outwardNormal: new THREE.Vector3(-1, 0, 0),
    material: context.materials.hardenedGel,
    plateCount: 4,
  });
  leftReturn.name = 'terraced-gutter-left-return';
  gutter.add(leftReturn);

  const rightReturn = buildGelLipCourse({
    seed: seedWithSalt(seed, 0x02),
    start: new THREE.Vector3(context.hostBox.max.x - 0.04, y, context.hostBox.max.z - returnDepth),
    end: new THREE.Vector3(context.hostBox.max.x - 0.04, y, context.hostBox.max.z + 0.02),
    outwardNormal: new THREE.Vector3(1, 0, 0),
    material: context.materials.hardenedGel,
    plateCount: 4,
  });
  rightReturn.name = 'terraced-gutter-right-return';
  gutter.add(rightReturn);

  return gutter;
}

function buildPartyWallMarker(
  context: BuildContext<TerracedVariation>,
  side: 'left' | 'right',
  seed: number,
): THREE.Group {
  const marker = new THREE.Group();
  marker.name = `terraced-party-wall-marker-${side}`;
  const rand = mulberry32(seed);
  const groundY = groundYForBox(context.hostBox);
  const x = side === 'left' ? context.hostBox.min.x - 0.04 : context.hostBox.max.x + 0.04;
  const z = context.hostBox.max.z + 0.04;
  const cracked = context.variation.partyWallCondition === `${side}-cracked`
    || context.variation.partyWallCondition === 'roof-gap-between-units';
  const segments = 4;

  for (let index = 0; index < segments; index++) {
    if (cracked && index === 2) continue;
    const block = beam(0.14, 0.74, 0.16, context.materials.wetStain, `marker-${side}-block-${index}`);
    block.position.set(
      x,
      groundY + 0.37 + index * 0.76 + (cracked ? rand() * 0.05 : 0),
      z,
    );
    block.rotation.y = side === 'left' ? rand() * 0.06 : -rand() * 0.06;
    marker.add(block);
  }

  const cap = beam(0.18, 0.12, 0.2, context.materials.hardenedGel, 'marker-cap');
  cap.position.set(x, context.hostBox.max.y + 0.06, z);
  marker.add(cap);
  return marker;
}

function buildTerracedWindowMembrane(context: BuildContext<TerracedVariation>, seed: number): THREE.Group {
  const membrane = buildMembraneSheet({
    seed,
    corners: [
      new THREE.Vector3(-0.3, 0.95, 0),
      new THREE.Vector3(0.3, 0.95, 0),
      new THREE.Vector3(0.3, 0, 0),
      new THREE.Vector3(-0.3, 0, 0),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: 0.06,
    ribCount: 2,
  });
  membrane.name = 'terraced-window-bridge';
  membrane.position.set(
    (context.hostBox.min.x + context.hostBox.max.x) * 0.5,
    context.hostBox.min.y + FLOOR_HEIGHT + 0.56,
    context.hostBox.max.z + depthFor('GLAZING'),
  );
  membrane.userData.overlayRole = 'terraced-window-bridge';
  return membrane;
}

function buildTerracedDownspout(context: BuildContext<TerracedVariation>, seed: number): THREE.Group {
  const edgeX = context.hostBox.max.x - 0.14;
  const downspout = buildTendrilBridge({
    seed,
    start: new THREE.Vector3(edgeX, context.hostBox.max.y - 0.12, context.hostBox.max.z + 0.04),
    end: new THREE.Vector3(edgeX, context.hostBox.min.y + 0.18, context.hostBox.max.z + 0.04),
    material: context.materials.gelDark,
    anchorMaterial: context.materials.hardenedGel,
    startRadius: 0.05,
    midRadius: 0.07,
    endRadius: 0.045,
  });
  downspout.name = 'terraced-downspout';
  downspout.userData.overlayRole = 'terraced-downspout';
  return downspout;
}

function buildTerracedRowBay(side: 'left' | 'right', context: BuildContext<TerracedVariation>, seed: number): THREE.Group {
  const bay = new THREE.Group();
  bay.name = `terraced-row-bay-${side}`;
  const x = side === 'left' ? context.hostBox.min.x - 0.68 : context.hostBox.max.x + 0.68;
  const y = groundYForBox(context.hostBox);
  const z = context.hostBox.max.z + 0.02;
  const wall = beam(0.88, FLOOR_HEIGHT * 1.86, 0.16, context.materials.wetStain, `row-bay-wall-${side}`);
  wall.position.set(x, y + FLOOR_HEIGHT * 0.93, z);
  bay.add(wall);

  const parapet = beam(0.94, 0.12, 0.18, context.materials.hardenedGel, `row-bay-parapet-${side}`);
  parapet.position.set(x, y + FLOOR_HEIGHT * 1.88, z);
  bay.add(parapet);

  const sill = beam(0.46, 0.06, 0.12, context.materials.hardenedGel, `row-bay-sill-${side}`);
  sill.position.set(x, y + FLOOR_HEIGHT + 0.42, z + 0.06);
  bay.add(sill);

  const lens = buildMembraneSheet({
    seed,
    corners: [
      new THREE.Vector3(x - 0.16, y + FLOOR_HEIGHT + 0.94, z + depthFor('GLAZING')),
      new THREE.Vector3(x + 0.16, y + FLOOR_HEIGHT + 0.94, z + depthFor('GLAZING')),
      new THREE.Vector3(x + 0.16, y + FLOOR_HEIGHT + 0.26, z + depthFor('GLAZING')),
      new THREE.Vector3(x - 0.16, y + FLOOR_HEIGHT + 0.26, z + depthFor('GLAZING')),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: 0.03,
    ribCount: 1,
  });
  lens.name = `row-bay-window-${side}`;
  bay.add(lens);
  return bay;
}

function buildTerracedRowBayIllusions(context: BuildContext<TerracedVariation>, seed: number): THREE.Group[] {
  if (context.variation.rowLength === 'single-lot') return [];
  if (context.variation.rowLength === 'two-bay-illusion') {
    const side: 'left' | 'right' = context.variation.doorOffset < 0 ? 'right' : 'left';
    return [buildTerracedRowBay(side, context, seed)];
  }

  return [
    buildTerracedRowBay('left', context, seed),
    buildTerracedRowBay('right', context, seedWithSalt(seed, 0x01)),
  ];
}

function buildTerracedAlleyPuddleBridge(context: BuildContext<TerracedVariation>, seed: number): THREE.Group {
  const bridge = new THREE.Group();
  bridge.name = 'terraced-alley-puddle-bridge';
  const side: 'left' | 'right' = context.variation.partyWallCondition === 'left-cracked'
    ? 'left'
    : context.variation.partyWallCondition === 'right-cracked'
      ? 'right'
      : context.variation.doorOffset < 0 ? 'left' : 'right';
  const sign = side === 'left' ? -1 : 1;
  const groundY = groundYForBox(context.hostBox);
  const edgeX = side === 'left' ? context.hostBox.min.x - 0.08 : context.hostBox.max.x + 0.08;
  const startZ = context.hostBox.min.z + 0.72;

  for (let index = 0; index < 3; index++) {
    const patch = buildPuddleSkirtTiles({
      seed: seedWithSalt(seed, index),
      center: new THREE.Vector3(edgeX + sign * 0.18 * index, groundY, startZ + index * 0.22),
      radiusX: 0.16 + index * 0.03,
      radiusZ: 0.12,
      material: context.materials.gelDark,
      tileCount: 4 + index,
    });
    patch.name = `alley-bridge-patch-${index}`;
    bridge.add(patch);
  }

  const tendon = buildTendrilBridge({
    seed: seedWithSalt(seed, 0x10),
    start: new THREE.Vector3(edgeX, groundY + 0.08, startZ),
    end: new THREE.Vector3(edgeX + sign * 0.44, groundY + 0.1, startZ + 0.44),
    material: context.materials.gelDark,
    anchorMaterial: context.materials.hardenedGel,
    startRadius: 0.04,
    midRadius: 0.06,
    endRadius: 0.04,
  });
  tendon.name = 'alley-bridge-tendril';
  bridge.add(tendon);

  return bridge;
}

function buildTerracedStairRemnant(context: BuildContext<TerracedVariation>, seed: number): THREE.Group {
  const stair = new THREE.Group();
  stair.name = 'terraced-stair-remnant';
  const rand = mulberry32(seed);
  const baseX = context.variation.doorOffset > 0 ? context.hostBox.min.x + 0.54 : context.hostBox.max.x - 0.54;
  const baseZ = context.hostBox.max.z + 0.16;
  const groundY = groundYForBox(context.hostBox);

  for (let index = 0; index < 4; index++) {
    const tread = beam(0.32, 0.08, 0.18, context.materials.wetStain, `stair-tread-${index}`);
    tread.position.set(baseX, groundY + 0.04 + index * 0.16, baseZ - index * 0.12);
    tread.rotation.y = (rand() - 0.5) * 0.08;
    stair.add(tread);
  }

  const brace = beam(0.08, 0.72, 0.08, context.materials.hardenedGel, 'stair-brace');
  brace.position.set(baseX + (context.variation.doorOffset > 0 ? -0.14 : 0.14), groundY + 0.36, baseZ - 0.18);
  brace.rotation.z = context.variation.doorOffset > 0 ? 0.22 : -0.22;
  stair.add(brace);
  return stair;
}

function buildTerracedAddressPlaque(context: BuildContext<TerracedVariation>): THREE.Group {
  const plaque = new THREE.Group();
  plaque.name = 'terraced-address-plaque';
  const x = context.variation.doorOffset + (context.variation.doorOffset > 0 ? -0.42 : 0.42);
  const y = groundYForBox(context.hostBox) + 1.74;
  const z = context.hostBox.max.z + 0.08;

  const bracket = beam(0.18, 0.05, 0.12, context.materials.hardenedGel, 'address-bracket');
  bracket.position.set(x, y + 0.08, z);
  plaque.add(bracket);

  const tag = shadowMesh(extrudeShape(createPlaqueShape(0.24, 0.2), 0.05), context.materials.wetStain, 'address-tag');
  tag.position.set(x, y - 0.02, z + 0.08);
  plaque.add(tag);

  return plaque;
}

function buildTerracedRoofGapMarker(context: BuildContext<TerracedVariation>, seed: number): THREE.Group {
  const marker = new THREE.Group();
  marker.name = 'terraced-roof-gap-marker';
  const side: 'left' | 'right' = context.variation.doorOffset < 0 ? 'right' : 'left';
  const sign = side === 'left' ? -1 : 1;
  const x = side === 'left' ? context.hostBox.min.x - 0.02 : context.hostBox.max.x + 0.02;
  const y = context.hostBox.max.y + 0.08;
  const z = context.hostBox.max.z - 0.36;

  const parapetFront = beam(0.24, 0.16, 0.2, context.materials.hardenedGel, 'roof-gap-front-cap');
  parapetFront.position.set(x, y + 0.08, z + 0.22);
  marker.add(parapetFront);

  const parapetRear = beam(0.24, 0.16, 0.2, context.materials.hardenedGel, 'roof-gap-rear-cap');
  parapetRear.position.set(x, y + 0.08, z - 0.22);
  marker.add(parapetRear);

  const rafter = beam(0.08, 0.62, 0.08, context.materials.wetStain, 'roof-gap-broken-rafter');
  rafter.position.set(x - sign * 0.08, y - 0.14, z + 0.02);
  rafter.rotation.z = sign * 0.28;
  marker.add(rafter);

  const membrane = buildMembraneSheet({
    seed,
    corners: [
      new THREE.Vector3(x - sign * 0.04, y + 0.18, z + 0.08),
      new THREE.Vector3(x + sign * 0.12, y + 0.14, z + 0.08),
      new THREE.Vector3(x + sign * 0.1, y - 0.06, z - 0.04),
      new THREE.Vector3(x - sign * 0.06, y - 0.02, z - 0.04),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: 0.03,
    ribCount: 1,
  });
  membrane.name = 'roof-gap-membrane-patch';
  marker.add(membrane);

  return marker;
}

function addTerracedExtras(context: BuildContext<TerracedVariation>): void {
  context.group.add(buildTerracedGutter(context, seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT)));
  context.group.add(buildPartyWallMarker(context, 'left', seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT ^ 0x11)));
  context.group.add(buildPartyWallMarker(context, 'right', seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT ^ 0x22)));
  buildTerracedRowBayIllusions(context, seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT ^ 0x2f))
    .forEach(bay => context.group.add(bay));

  if (context.variation.membraneBridge) {
    context.group.add(buildTerracedWindowMembrane(context, seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT ^ 0x33)));
  }
  if (context.variation.downspout) {
    context.group.add(buildTerracedDownspout(context, seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT ^ 0x44)));
  }
  if (context.variation.circulation === 'alley-puddle-bridge') {
    context.group.add(buildTerracedAlleyPuddleBridge(context, seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT ^ 0x55)));
  }
  if (context.variation.specialBay === 'exposed-stair-remnant') {
    context.group.add(buildTerracedStairRemnant(context, seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT ^ 0x66)));
  }
  if (context.variation.specialBay === 'small-sign-bracket') {
    context.group.add(buildTerracedAddressPlaque(context));
  }
  if (context.variation.partyWallCondition === 'roof-gap-between-units') {
    context.group.add(buildTerracedRoofGapMarker(context, seedWithSalt(context.dna.seed, TERRACED_EXTRA_SALT ^ 0x77)));
  }
}

function buildCounterBay(context: BuildContext<ShopVariation>, seed: number): THREE.Group {
  const front = resolveShopFrontTransform(context);
  const counterBay = new THREE.Group();
  counterBay.name = 'shop-counter-bay';
  const rand = mulberry32(seed);
  const postDepth = front.reuseHostFrontage ? 0.12 : depthFor('PILASTER') * 2;
  const counterDepth = depthFor('TRIM');
  const postHeight = front.reuseHostFrontage ? 1.62 : 2.08;
  const lintelHeight = 0.12;
  const counterHeight = 0.12;
  const openingBottom = 0.85;
  const openingHeight = front.reuseHostFrontage ? 1.02 : 1.2;
  const halfWidth = front.width * 0.5;
  const centerX = 0;
  const frontZ = front.reuseHostFrontage ? 0.06 : 0;
  const sillZ = depthFor('TRIM') * 0.5;

  counterBay.position.copy(front.origin);
  counterBay.rotation.y = front.rotationY;

  const leftPost = beam(0.12, postHeight, postDepth, context.materials.hardenedGel, 'counter-post-left');
  leftPost.position.set(centerX - halfWidth, postHeight * 0.5, frontZ);
  counterBay.add(leftPost);

  const rightPost = beam(0.12, postHeight, postDepth, context.materials.hardenedGel, 'counter-post-right');
  rightPost.position.set(centerX + halfWidth, postHeight * 0.5, frontZ);
  counterBay.add(rightPost);

  const lintel = beam(front.width + 0.12, lintelHeight, postDepth, context.materials.hardenedGel, 'counter-lintel');
  lintel.position.set(centerX, openingBottom + openingHeight + lintelHeight * 0.5, frontZ);
  counterBay.add(lintel);

  const sill = beam(front.width + 0.16, counterHeight, counterDepth, context.materials.wetStain, 'counter-sill');
  sill.position.set(centerX, openingBottom - counterHeight * 0.5, sillZ);
  counterBay.add(sill);

  const dripGuard = buildGelLipCourse({
    seed: seedWithSalt(seed, 0x10),
    start: new THREE.Vector3(centerX - halfWidth, openingBottom - 0.16, frontZ + 0.02),
    end: new THREE.Vector3(centerX + halfWidth, openingBottom - 0.16, frontZ + 0.02),
    outwardNormal: new THREE.Vector3(0, 0, 1),
    material: context.materials.gel,
    plateCount: 5,
  });
  dripGuard.name = 'counter-drip-guard';
  counterBay.add(dripGuard);

  const backdrop = buildMembraneSheet({
    seed: seedWithSalt(seed, 0x20),
    corners: [
      new THREE.Vector3(centerX - halfWidth * 0.88, openingBottom + openingHeight - 0.06, depthFor('GLAZING')),
      new THREE.Vector3(centerX + halfWidth * 0.88, openingBottom + openingHeight - 0.06, depthFor('GLAZING')),
      new THREE.Vector3(centerX + halfWidth * 0.88, openingBottom + 0.08, depthFor('GLAZING')),
      new THREE.Vector3(centerX - halfWidth * 0.88, openingBottom + 0.08, depthFor('GLAZING')),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: 0.05,
    ribCount: Math.max(1, context.variation.bayDivisions),
  });
  backdrop.name = 'counter-membrane-backdrop';
  counterBay.add(backdrop);

  for (let index = 0; index < context.variation.bayDivisions; index++) {
    const division = new THREE.Group();
    division.name = `counter-division-${index}`;
    const xOffset = context.variation.bayDivisions === 1
      ? 0
      : ((index / (context.variation.bayDivisions - 1)) - 0.5) * front.width * 0.42;
    const bar = beam(0.05, openingHeight - 0.14, 0.08, context.materials.gelDark, `counter-division-bar-${index}`);
    bar.position.set(centerX + xOffset, openingBottom + (openingHeight * 0.5), frontZ + 0.02);
    division.add(bar);
    counterBay.add(division);
  }

  if (context.variation.repairBay) {
    const repair = beam(0.34, 0.75, 0.08, context.materials.wetStain, 'counter-repair-panel');
    repair.position.set(centerX + halfWidth * 0.54, openingBottom + 0.42, frontZ - 0.08 + rand() * 0.04);
    repair.rotation.z = 0.12;
    counterBay.add(repair);
  }

  counterBay.userData.counterDepths = {
    posts: depthFor('PILASTER'),
    lintel: depthFor('PILASTER'),
    sill: depthFor('TRIM'),
    backdrop: depthFor('GLAZING'),
  };
  counterBay.userData.reusesHostFrontage = front.reuseHostFrontage;
  return counterBay;
}

function buildAwning(context: BuildContext<ShopVariation>, seed: number): { frame: THREE.Group; membrane: THREE.Group } {
  const front = resolveShopFrontTransform(context);
  const frame = new THREE.Group();
  frame.name = 'shop-awning-frame';
  const topY = front.reuseHostFrontage ? 1.88 : 2.4;
  const projection = front.reuseHostFrontage
    ? 0.34
    : context.variation.canopy === 'heavy-sign-repair-flap' ? 0.36 : 0.56;
  const frontDrop = front.reuseHostFrontage
    ? 0.16
    : context.variation.canopy === 'broken-shingle-roof' ? 0.1 : 0.18;
  const leftX = -(front.width * 0.5) - 0.1;
  const rightX = (front.width * 0.5) + 0.1;
  const frontZ = front.reuseHostFrontage ? 0.04 : 0;

  frame.position.copy(front.origin);
  frame.rotation.y = front.rotationY;

  const topRod = beam(front.width + 0.22, 0.05, 0.08, context.materials.hardenedGel, 'awning-top-rod');
  topRod.position.set((leftX + rightX) * 0.5, topY, frontZ - 0.04);
  frame.add(topRod);

  const frontRod = beam(front.width + 0.18, 0.05, 0.08, context.materials.hardenedGel, 'awning-front-rod');
  frontRod.position.set((leftX + rightX) * 0.5, topY - frontDrop, frontZ + projection);
  frame.add(frontRod);

  const leftRod = beam(0.05, frontDrop + 0.04, 0.08, context.materials.hardenedGel, 'awning-side-rod-left');
  leftRod.position.set(leftX, topY - frontDrop * 0.5, frontZ + projection * 0.48);
  leftRod.rotation.z = 0.22;
  frame.add(leftRod);

  const rightRod = beam(0.05, frontDrop + 0.04, 0.08, context.materials.hardenedGel, 'awning-side-rod-right');
  rightRod.position.set(rightX, topY - frontDrop * 0.5, frontZ + projection * 0.48);
  rightRod.rotation.z = -0.22;
  frame.add(rightRod);

  const membrane = buildMembraneSheet({
    seed,
    corners: [
      new THREE.Vector3(leftX, topY, frontZ - 0.02),
      new THREE.Vector3(rightX, topY, frontZ - 0.02),
      new THREE.Vector3(rightX, topY - frontDrop, frontZ + projection),
      new THREE.Vector3(leftX, topY - frontDrop, frontZ + projection),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: context.variation.canopy === 'membrane-awning' ? 0.08 : 0.05,
    ribCount: context.variation.canopy === 'mixed-rafter-membrane' ? 3 : 2,
  });
  membrane.name = 'shop-awning-membrane';
  membrane.userData.overlayRole = 'shop-awning';
  membrane.position.copy(front.origin);
  membrane.rotation.y = front.rotationY;
  return { frame, membrane };
}

function buildBrokenShingleCanopy(context: BuildContext<ShopVariation>, seed: number): THREE.Group {
  const front = resolveShopFrontTransform(context);
  const canopy = new THREE.Group();
  canopy.name = 'shop-broken-shingle-canopy';
  canopy.position.copy(front.origin);
  canopy.rotation.y = front.rotationY;
  const rand = mulberry32(seed);
  const topY = front.reuseHostFrontage ? 1.92 : 2.36;
  const frontZ = front.reuseHostFrontage ? 0.08 : 0.02;
  const projection = 0.34;
  const halfWidth = (front.width + 0.16) * 0.5;

  const ledger = beam(front.width + 0.18, 0.08, 0.16, context.materials.hardenedGel, 'broken-shingle-ledger');
  ledger.position.set(0, topY, frontZ);
  canopy.add(ledger);

  const leftBrace = beam(0.08, 0.46, 0.08, context.materials.hardenedGel, 'broken-shingle-brace-left');
  leftBrace.position.set(-halfWidth + 0.08, topY - 0.18, frontZ + projection * 0.42);
  leftBrace.rotation.z = 0.42;
  canopy.add(leftBrace);

  const rightBrace = beam(0.08, 0.46, 0.08, context.materials.hardenedGel, 'broken-shingle-brace-right');
  rightBrace.position.set(halfWidth - 0.08, topY - 0.18, frontZ + projection * 0.42);
  rightBrace.rotation.z = -0.42;
  canopy.add(rightBrace);

  for (let index = 0; index < 4; index++) {
    if (index === 3) continue;
    const shingle = beam(0.32, 0.04, 0.18, context.materials.wetStain, `broken-shingle-strip-${index}`);
    shingle.position.set(
      -halfWidth + 0.2 + index * 0.28,
      topY - 0.12 - index * 0.01,
      frontZ + 0.18 + rand() * 0.08,
    );
    shingle.rotation.x = 0.38;
    shingle.rotation.z = (rand() - 0.5) * 0.08;
    canopy.add(shingle);
  }

  const brokenStrip = beam(0.22, 0.04, 0.18, context.materials.wetStain, 'broken-shingle-fragment');
  brokenStrip.position.set(halfWidth - 0.1, topY - 0.18, frontZ + 0.24);
  brokenStrip.rotation.set(0.5, 0, -0.26);
  canopy.add(brokenStrip);
  return canopy;
}

function buildShopTrail(context: BuildContext<ShopVariation>, seed: number): THREE.Group {
  const front = resolveShopFrontTransform(context);
  const trail = new THREE.Group();
  trail.name = 'shop-street-slime-trail';
  for (let index = 0; index < 3; index++) {
    const center = front.origin.clone().addScaledVector(front.outwardNormal, 0.18 + index * 0.26);
    const patch = buildPuddleSkirtTiles({
      seed: seedWithSalt(seed, index),
      center: new THREE.Vector3(center.x, front.origin.y, center.z),
      radiusX: 0.22,
      radiusZ: 0.18 + index * 0.03,
      material: context.materials.gelDark,
      tileCount: 4 + index,
    });
    patch.name = `shop-trail-patch-${index}`;
    trail.add(patch);
  }
  return trail;
}

function buildGoodsJar(materials: SlimeMaterialSet, seed: number, name: string): THREE.Group {
  const jar = buildContainedGelVat({
    seed,
    radius: 0.09,
    height: 0.28,
    frameMaterial: materials.hardenedGel,
    bandMaterial: materials.gelDark,
    gelMaterial: materials.containedGel,
    baseMaterial: materials.wetStain,
    bandCount: 2,
  });
  jar.name = name;
  jar.userData.goodsProp = true;
  jar.scale.setScalar(0.86);
  return jar;
}

function buildGoodsCrate(materials: SlimeMaterialSet, name: string): THREE.Group {
  const crate = new THREE.Group();
  crate.name = name;
  crate.userData.goodsProp = true;

  const base = beam(0.24, 0.08, 0.18, materials.wetStain, 'crate-base');
  base.position.y = 0.04;
  crate.add(base);

  const rim = beam(0.28, 0.04, 0.22, materials.hardenedGel, 'crate-rim');
  rim.position.y = 0.11;
  crate.add(rim);

  const leftPost = beam(0.04, 0.18, 0.04, materials.hardenedGel, 'crate-post-left');
  leftPost.position.set(-0.1, 0.09, 0);
  crate.add(leftPost);

  const rightPost = beam(0.04, 0.18, 0.04, materials.hardenedGel, 'crate-post-right');
  rightPost.position.set(0.1, 0.09, 0);
  crate.add(rightPost);

  return crate;
}

function buildGoodsVial(materials: SlimeMaterialSet, name: string): THREE.Group {
  const vial = new THREE.Group();
  vial.name = name;
  vial.userData.goodsProp = true;

  const body = shadowMesh(
    extrudeShape(createRegularPolygonShape(0.05, 0.05, 6, Math.PI / 6), 0.11),
    materials.containedGel,
    'vial-body',
  );
  body.position.y = 0.12;
  vial.add(body);

  const base = beam(0.08, 0.04, 0.08, materials.wetStain, 'vial-base');
  base.position.y = 0.02;
  vial.add(base);

  const collar = beam(0.1, 0.03, 0.1, materials.hardenedGel, 'vial-collar');
  collar.position.y = 0.22;
  vial.add(collar);

  return vial;
}

function buildGoodsBook(materials: SlimeMaterialSet, name: string): THREE.Group {
  const book = new THREE.Group();
  book.name = name;
  book.userData.goodsProp = true;

  const cover = beam(0.16, 0.04, 0.12, materials.wetStain, 'book-cover');
  cover.position.y = 0.02;
  book.add(cover);

  const pages = beam(0.13, 0.03, 0.09, materials.containedGel, 'book-pages');
  pages.position.set(0.01, 0.045, 0);
  book.add(pages);

  const clasp = beam(0.03, 0.05, 0.13, materials.hardenedGel, 'book-clasp');
  clasp.position.set(0.07, 0.025, 0);
  book.add(clasp);

  return book;
}

function buildGoodsScroll(materials: SlimeMaterialSet, name: string): THREE.Group {
  const scroll = new THREE.Group();
  scroll.name = name;
  scroll.userData.goodsProp = true;

  const roll = shadowMesh(
    extrudeShape(createRegularPolygonShape(0.035, 0.035, 6, Math.PI / 6), 0.18),
    materials.containedGel,
    'scroll-roll',
  );
  roll.rotation.z = Math.PI / 2;
  roll.position.y = 0.05;
  scroll.add(roll);

  const strap = beam(0.03, 0.08, 0.14, materials.hardenedGel, 'scroll-strap');
  strap.position.y = 0.05;
  scroll.add(strap);

  return scroll;
}

function buildGoodsBasket(materials: SlimeMaterialSet, name: string): THREE.Group {
  const basket = new THREE.Group();
  basket.name = name;
  basket.userData.goodsProp = true;

  const base = beam(0.2, 0.06, 0.14, materials.wetStain, 'basket-base');
  base.position.y = 0.03;
  basket.add(base);

  const rim = beam(0.24, 0.04, 0.18, materials.hardenedGel, 'basket-rim');
  rim.position.y = 0.11;
  basket.add(rim);

  const handleLeft = beam(0.03, 0.16, 0.03, materials.hardenedGel, 'basket-handle-left');
  handleLeft.position.set(-0.07, 0.11, 0);
  handleLeft.rotation.z = 0.42;
  basket.add(handleLeft);

  const handleRight = beam(0.03, 0.16, 0.03, materials.hardenedGel, 'basket-handle-right');
  handleRight.position.set(0.07, 0.11, 0);
  handleRight.rotation.z = -0.42;
  basket.add(handleRight);

  return basket;
}

function buildGoodsMushroom(materials: SlimeMaterialSet, name: string): THREE.Group {
  const mushroom = new THREE.Group();
  mushroom.name = name;
  mushroom.userData.goodsProp = true;

  const stem = beam(0.05, 0.14, 0.05, materials.wetStain, 'mushroom-stem');
  stem.position.y = 0.07;
  mushroom.add(stem);

  const cap = createFacetedPlate(0.16, 0.14, 0.06, materials.gel, 'mushroom-cap', 7);
  cap.position.y = 0.16;
  mushroom.add(cap);

  return mushroom;
}

function buildGoodsSalvage(materials: SlimeMaterialSet, name: string): THREE.Group {
  const salvage = new THREE.Group();
  salvage.name = name;
  salvage.userData.goodsProp = true;

  const base = beam(0.18, 0.05, 0.14, materials.wetStain, 'salvage-base');
  base.position.y = 0.025;
  salvage.add(base);

  const shard = createFacetedPlate(0.12, 0.08, 0.05, materials.hardenedGel, 'salvage-shard', 5);
  shard.position.set(0.01, 0.09, 0);
  shard.rotation.z = 0.24;
  salvage.add(shard);

  const strap = beam(0.04, 0.12, 0.04, materials.gelDark, 'salvage-strap');
  strap.position.set(-0.05, 0.07, 0);
  salvage.add(strap);

  return salvage;
}

function buildGoodsScatter(context: BuildContext<ShopVariation>, seed: number): THREE.Group {
  const front = resolveShopFrontTransform(context);
  const goods = new THREE.Group();
  goods.name = 'shop-goods-display';
  const rand = mulberry32(seed);
  const count = 3 + Math.floor(rand() * 3);
  const xStart = -(count - 1) * 0.16 * 0.5;
  goods.position.copy(front.origin);
  goods.rotation.y = front.rotationY;

  for (let index = 0; index < count; index++) {
    const item = (() => {
      switch (context.variation.goodsTheme) {
        case 'jars':
          return buildGoodsJar(context.materials, seedWithSalt(seed, 0x40 + index), `goods-jar-${index}`);
        case 'books-scrolls':
          return index % 2 === 0
            ? buildGoodsBook(context.materials, `goods-book-${index}`)
            : buildGoodsScroll(context.materials, `goods-scroll-${index}`);
        case 'alchemy-vials':
          return index % 2 === 0
            ? buildGoodsVial(context.materials, `goods-vial-${index}`)
            : buildGoodsJar(context.materials, seedWithSalt(seed, 0x60 + index), `goods-jar-${index}`);
        case 'food-mushrooms':
          return index % 2 === 0
            ? buildGoodsBasket(context.materials, `goods-basket-${index}`)
            : buildGoodsMushroom(context.materials, `goods-mushroom-${index}`);
        case 'mystery-salvage':
        default:
          return index % 2 === 0
            ? buildGoodsSalvage(context.materials, `goods-salvage-${index}`)
            : buildGoodsCrate(context.materials, `goods-crate-${index}`);
      }
    })();
    const role = item.name.includes('crate')
      ? 'crate'
      : item.name.includes('basket')
        ? 'basket'
        : 'small';
    item.position.set(
      xStart + index * 0.16,
      0.86 + (role === 'crate' || role === 'basket' ? 0 : 0.02),
      front.reuseHostFrontage
        ? 0.04 - (role === 'crate' || role === 'basket' ? 0.02 : 0)
        : -0.06 - (role === 'crate' || role === 'basket' ? 0.02 : 0),
    );
    item.rotation.y = (rand() - 0.5) * 0.3;
    goods.add(item);
  }

  return goods;
}

function buildShopHeavySign(context: BuildContext<ShopVariation>, seed: number): THREE.Group {
  const front = resolveShopFrontTransform(context);
  const sign = new THREE.Group();
  sign.name = 'shop-heavy-sign';
  sign.position.copy(front.origin);
  sign.rotation.y = front.rotationY;

  const wallPlate = beam(0.08, 0.58, 0.08, context.materials.hardenedGel, 'heavy-sign-wall-plate');
  wallPlate.position.set(front.width * 0.42, 1.54, -0.02);
  sign.add(wallPlate);

  const arm = beam(0.52, 0.08, 0.08, context.materials.hardenedGel, 'heavy-sign-arm');
  arm.position.set(front.width * 0.2, 1.82, 0.12);
  sign.add(arm);

  const plaque = shadowMesh(extrudeShape(createPlaqueShape(0.48, 0.38), 0.1), context.materials.wetStain, 'heavy-sign-plaque');
  plaque.position.set(-0.02, 1.5, 0.16);
  sign.add(plaque);

  const rim = shadowMesh(extrudeShape(createPlaqueShape(0.54, 0.44), 0.05), context.materials.hardenedGel, 'heavy-sign-rim');
  rim.position.set(-0.02, 1.5, 0.22);
  sign.add(rim);

  const patch = buildMembraneSheet({
    seed,
    corners: [
      new THREE.Vector3(-0.2, 1.9, 0.05),
      new THREE.Vector3(0.22, 1.9, 0.05),
      new THREE.Vector3(0.18, 1.58, 0.26),
      new THREE.Vector3(-0.18, 1.58, 0.22),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: 0.04,
    ribCount: 1,
  });
  patch.name = 'heavy-sign-repair-flap';
  sign.add(patch);

  return sign;
}

function addShopExtras(context: BuildContext<ShopVariation>): void {
  context.group.add(buildCounterBay(context, seedWithSalt(context.dna.seed, SHOP_EXTRA_SALT)));
  if (context.variation.canopy === 'broken-shingle-roof') {
    context.group.add(buildBrokenShingleCanopy(context, seedWithSalt(context.dna.seed, SHOP_EXTRA_SALT ^ 0x11)));
  } else if (context.variation.canopy !== 'heavy-sign-repair-flap') {
    const awning = buildAwning(context, seedWithSalt(context.dna.seed, SHOP_EXTRA_SALT ^ 0x11));
    context.group.add(awning.frame);
    context.group.add(awning.membrane);
  }
  context.group.add(buildGoodsScatter(context, seedWithSalt(context.dna.seed, SHOP_EXTRA_SALT ^ 0x22)));
  context.group.add(buildShopTrail(context, seedWithSalt(context.dna.seed, SHOP_EXTRA_SALT ^ 0x33)));
  if (context.variation.canopy === 'heavy-sign-repair-flap') {
    context.group.add(buildShopHeavySign(context, seedWithSalt(context.dna.seed, SHOP_EXTRA_SALT ^ 0x44)));
  }
}

function buildInnSign(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const sign = new THREE.Group();
  sign.name = 'inn-hanging-sign';
  const frontZ = context.hostBox.max.z + 0.02;
  const x = context.variation.entranceOffset + context.variation.signSide * 1.2;
  const y = groundYForBox(context.hostBox) + 2.4;
  const bracket = new THREE.Group();
  bracket.name = 'inn-sign-bracket';

  const wallPlate = beam(0.1, 0.6, 0.08, context.materials.hardenedGel, 'sign-wall-plate');
  wallPlate.position.set(x, y, frontZ);
  bracket.add(wallPlate);

  const arm = beam(0.55, 0.06, 0.08, context.materials.hardenedGel, 'sign-arm');
  arm.position.set(x + context.variation.signSide * 0.28, y + 0.18, frontZ + 0.02);
  bracket.add(arm);

  const brace = beam(0.38, 0.05, 0.08, context.materials.gelDark, 'sign-brace');
  brace.position.set(x + context.variation.signSide * 0.16, y + 0.02, frontZ + 0.02);
  brace.rotation.z = -context.variation.signSide * 0.72;
  bracket.add(brace);

  sign.add(bracket);

  const plaqueGeometry = extrudeShape(createPlaqueShape(0.54, 0.42), 0.08);
  const plaque = shadowMesh(plaqueGeometry, context.materials.wetStain, 'inn-sign-plaque');
  plaque.position.set(x + context.variation.signSide * 0.56, y - 0.1, frontZ + 0.02);
  sign.add(plaque);

  const rim = shadowMesh(extrudeShape(createPlaqueShape(0.6, 0.48), 0.04), context.materials.hardenedGel, 'sign-plaque-rim');
  rim.position.set(x + context.variation.signSide * 0.56, y - 0.1, frontZ + 0.07);
  sign.add(rim);

  const drip = buildFacetedDripRun({
    seed,
    start: new THREE.Vector3(x + context.variation.signSide * 0.52, y - 0.33, frontZ + 0.04),
    end: new THREE.Vector3(x + context.variation.signSide * 0.52, y - 0.67, frontZ + 0.04),
    material: context.materials.gel,
    dripCount: 3,
  });
  drip.name = 'inn-sign-drip-chain';
  sign.add(drip);

  if (context.variation.frontSpecial === 'hanging-sign') {
    const crown = beam(0.22, 0.08, 0.08, context.materials.hardenedGel, 'inn-sign-crown');
    crown.position.set(x + context.variation.signSide * 0.56, y + 0.2, frontZ + 0.08);
    sign.add(crown);
  }

  return sign;
}

function buildInnChannel(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const channel = new THREE.Group();
  channel.name = 'inn-porch-channel';
  const y = groundYForBox(context.hostBox) + 0.1;
  const z = context.hostBox.max.z + 0.22;
  const width = Math.min(5.6, (context.hostBox.max.x - context.hostBox.min.x) * 0.84);
  const centerX = (context.hostBox.min.x + context.hostBox.max.x) * 0.5;
  const halfWidth = width * 0.5;

  const leftLip = buildGelLipCourse({
    seed,
    start: new THREE.Vector3(centerX - halfWidth, y, z - 0.08),
    end: new THREE.Vector3(centerX + halfWidth, y, z - 0.08),
    outwardNormal: new THREE.Vector3(0, 0, 1),
    material: context.materials.hardenedGel,
    plateCount: 10,
  });
  leftLip.name = 'inn-channel-back-lip';
  channel.add(leftLip);

  const rightLip = buildGelLipCourse({
    seed: seedWithSalt(seed, 0x01),
    start: new THREE.Vector3(centerX - halfWidth, y, z + 0.08),
    end: new THREE.Vector3(centerX + halfWidth, y, z + 0.08),
    outwardNormal: new THREE.Vector3(0, 0, 1),
    material: context.materials.hardenedGel,
    plateCount: 10,
  });
  rightLip.name = 'inn-channel-front-lip';
  channel.add(rightLip);

  const floor = buildPuddleSkirtTiles({
    seed: seedWithSalt(seed, 0x02),
    // keep channel tiles on the ground plane even when the host shell's
    // beveled geometry dips slightly below zero.
    center: new THREE.Vector3(centerX, groundYForBox(context.hostBox), z),
    radiusX: width * 0.42,
    radiusZ: 0.12,
    material: context.materials.gelDark,
    tileCount: 9,
  });
  floor.name = 'inn-channel-floor';
  channel.add(floor);

  if (context.variation.frontSpecial === 'porch-trough') {
    const endcapLeft = beam(0.1, 0.14, 0.22, context.materials.hardenedGel, 'inn-porch-trough-endcap-left');
    endcapLeft.position.set(centerX - halfWidth, y + 0.02, z);
    channel.add(endcapLeft);

    const endcapRight = beam(0.1, 0.14, 0.22, context.materials.hardenedGel, 'inn-porch-trough-endcap-right');
    endcapRight.position.set(centerX + halfWidth, y + 0.02, z);
    channel.add(endcapRight);
  }

  return channel;
}

function buildInnServiceCanopy(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const canopy = new THREE.Group();
  canopy.name = 'inn-service-canopy';

  const topRod = beam(0.98, 0.05, 0.08, context.materials.hardenedGel, 'service-canopy-top-rod');
  topRod.position.set(0, 1.46, -0.02);
  canopy.add(topRod);

  const frontRod = beam(0.94, 0.05, 0.08, context.materials.hardenedGel, 'service-canopy-front-rod');
  frontRod.position.set(0, 1.24, 0.24);
  canopy.add(frontRod);

  const membrane = buildMembraneSheet({
    seed,
    corners: [
      new THREE.Vector3(-0.44, 1.46, 0),
      new THREE.Vector3(0.44, 1.46, 0),
      new THREE.Vector3(0.44, 1.24, 0.24),
      new THREE.Vector3(-0.44, 1.24, 0.24),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: 0.04,
    ribCount: 2,
  });
  membrane.name = 'service-canopy-membrane';
  canopy.add(membrane);

  return canopy;
}

function buildInnServiceOpeningDecoration(
  context: BuildContext<InnVariation>,
  anchor: ServiceAnchor,
  seed: number,
): THREE.Group {
  const arch = new THREE.Group();
  arch.name = 'inn-service-arch';

  const openingBox = anchor.opening ? new THREE.Box3().setFromObject(anchor.opening) : new THREE.Box3();
  const openingSize = openingBox.getSize(new THREE.Vector3());
  const width = clamp(Math.max(openingSize.x, openingSize.z), 0.92, 1.08);
  const height = clamp(openingSize.y, 1.12, 1.6);

  const threshold = beam(width * 1.06, 0.08, depthFor('TRIM'), context.materials.wetStain, 'inn-service-threshold');
  threshold.position.set(0, 0.04, depthFor('TRIM') * 0.5);
  arch.add(threshold);

  const guideLeft = beam(0.08, 0.34, depthFor('PILASTER'), context.materials.hardenedGel, 'inn-service-guide-left');
  guideLeft.position.set(-(width * 0.5) + 0.08, 0.17, depthFor('PILASTER') * 0.5);
  arch.add(guideLeft);

  const guideRight = beam(0.08, 0.34, depthFor('PILASTER'), context.materials.hardenedGel, 'inn-service-guide-right');
  guideRight.position.set((width * 0.5) - 0.08, 0.17, depthFor('PILASTER') * 0.5);
  arch.add(guideRight);

  const lintelPad = beam(width + 0.06, 0.08, depthFor('PILASTER'), context.materials.hardenedGel, 'inn-service-lintel-pad');
  lintelPad.position.set(0, height - 0.12, depthFor('PILASTER') * 0.5);
  arch.add(lintelPad);

  const troughLip = buildGelLipCourse({
    seed,
    start: new THREE.Vector3(-(width * 0.5) + 0.04, 0.12, 0.1),
    end: new THREE.Vector3((width * 0.5) - 0.04, 0.12, 0.1),
    outwardNormal: new THREE.Vector3(0, 0, 1),
    material: context.materials.gel,
    plateCount: 4,
  });
  troughLip.name = 'inn-service-trough-lip';
  arch.add(troughLip);

  if (context.variation.frontSpecial === 'side-stable-arch') {
    arch.add(buildInnServiceCanopy(context, seedWithSalt(seed, 0x31)));
  }

  arch.position.copy(anchor.position.clone().addScaledVector(anchor.outwardNormal, 0.02));
  arch.rotation.y = anchor.rotationY;
  arch.userData.decoratesHostOpening = true;
  arch.userData.serviceFace = anchor.face;
  arch.userData.reusesHostOpening = true;
  arch.userData.propRole = 'service-arch';
  return arch;
}

function buildInnServiceArch(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const anchor = resolveInnServiceAnchor(context);
  if (anchor.reusesHostOpening) return buildInnServiceOpeningDecoration(context, anchor, seed);

  const arch = buildDoorOpening({
    width: 1,
    straightHeight: 1.12,
    pointHeight: 0.38,
    recessDepth: 0.18,
    frameWidth: 0.1,
    frameProud: depthFor('FRAME'),
    wallZ: 0,
    stoneMaterial: context.materials.wetStain,
    recessMaterial: context.materials.gelDark,
    woodMaterial: context.materials.wetStain,
  });
  applySlimeDoorOverlay(arch, {
    seed,
    materials: {
      containedGel: context.materials.containedGel,
      hardenedGel: context.materials.hardenedGel,
      gelDark: context.materials.gelDark,
      gel: context.materials.gel,
    },
    width: 1,
    straightHeight: 1.12,
    pointHeight: 0.38,
    cloggingRatio: 0.28,
  });
  arch.name = 'inn-service-arch';
  arch.position.copy(anchor.position.clone().addScaledVector(anchor.outwardNormal, anchor.reusesHostOpening ? 0.08 : 0.02));
  arch.position.y += 0.18;
  arch.rotation.y = anchor.rotationY;
  arch.userData.propRole = 'service-arch';
  arch.userData.serviceFace = anchor.face;
  arch.userData.reusesHostOpening = anchor.reusesHostOpening;
  if (context.variation.frontSpecial === 'side-stable-arch') {
    arch.add(buildInnServiceCanopy(context, seedWithSalt(seed, 0x19)));
  }
  return arch;
}

function buildInnVat(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const anchor = resolveInnServiceAnchor(context);
  const vat = buildContainedGelVat({
    seed,
    radius: 0.22,
    height: 0.72,
    frameMaterial: context.materials.hardenedGel,
    bandMaterial: context.materials.gelDark,
    gelMaterial: context.materials.containedGel,
    baseMaterial: context.materials.wetStain,
    bandCount: 3,
  });
  vat.name = 'inn-service-vat';
  vat.position.copy(anchor.position.clone().addScaledVector(anchor.outwardNormal, 0.55));
  vat.position.y = groundYForBox(context.hostBox) + 0.02;
  vat.userData.propRole = 'service-vat';
  vat.userData.serviceFace = anchor.face;
  vat.userData.reusesHostOpening = anchor.reusesHostOpening;
  return vat;
}

function buildInnRoofVent(context: BuildContext<InnVariation>, seed: number): THREE.Group | null {
  if (context.variation.ventState === 'none') return null;

  const vent = new THREE.Group();
  vent.name = 'inn-roof-vent';
  const ridgeY = context.hostBox.max.y + 0.08;
  const x = context.variation.signSide > 0 ? -1.25 : 1.25;
  const z = context.hostBox.min.z + 0.45;

  if (context.variation.ventState === 'capped-vent-pipe-cluster') {
    const plinth = beam(0.52, 0.12, 0.32, context.materials.wetStain, 'vent-cluster-plinth');
    plinth.position.set(x, ridgeY + 0.06, z);
    vent.add(plinth);
    for (let index = 0; index < 3; index++) {
      const pipe = beam(0.1, 0.52 + index * 0.08, 0.1, context.materials.hardenedGel, `vent-pipe-${index}`);
      pipe.position.set(x - 0.14 + index * 0.14, ridgeY + 0.26 + index * 0.04, z);
      vent.add(pipe);
      const cap = beam(0.16, 0.04, 0.16, context.materials.gelDark, `vent-cap-${index}`);
      cap.position.set(pipe.position.x, pipe.position.y + (0.52 + index * 0.08) * 0.5 + 0.04, z);
      vent.add(cap);
    }
  } else if (context.variation.ventState === 'broken-chimney-gel-seam') {
    const shaft = beam(0.34, 0.82, 0.3, context.materials.wetStain, 'vent-broken-shaft');
    shaft.position.set(x, ridgeY + 0.41, z);
    shaft.rotation.z = 0.08;
    vent.add(shaft);
    const seam = buildGelLipCourse({
      seed,
      start: new THREE.Vector3(x - 0.1, ridgeY + 0.42, z + 0.17),
      end: new THREE.Vector3(x + 0.1, ridgeY + 0.62, z + 0.17),
      outwardNormal: new THREE.Vector3(0, 0, 1),
      material: context.materials.gel,
      plateCount: 4,
    });
    seam.name = 'vent-gel-seam';
    vent.add(seam);
    const cap = beam(0.4, 0.06, 0.34, context.materials.hardenedGel, 'vent-broken-cap');
    cap.position.set(x + 0.04, ridgeY + 0.84, z);
    cap.rotation.z = -0.05;
    vent.add(cap);
  } else {
    const shaftHeight = 0.92;
    const shaft = beam(0.32, shaftHeight, 0.28, context.materials.wetStain, 'vent-shaft');
    shaft.position.set(x, ridgeY + shaftHeight * 0.5, z);
    vent.add(shaft);
    const cap = beam(0.42, 0.06, 0.36, context.materials.hardenedGel, 'vent-cap');
    cap.position.set(x, ridgeY + shaftHeight + 0.03, z);
    vent.add(cap);
    const band = beam(0.38, 0.04, 0.32, context.materials.gelDark, 'vent-band');
    band.position.set(x, ridgeY + shaftHeight * 0.58, z);
    vent.add(band);
  }

  vent.userData.ventState = context.variation.ventState;
  return vent;
}

function buildInnRoofCornerCollapse(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const collapse = new THREE.Group();
  collapse.name = 'inn-roof-corner-collapse';
  const x = context.variation.signSide > 0 ? context.hostBox.min.x + 0.62 : context.hostBox.max.x - 0.62;
  const z = context.hostBox.min.z + 0.68;
  const y = context.hostBox.max.y - 0.1;

  const rafterA = beam(0.1, 0.88, 0.1, context.materials.wetStain, 'roof-collapse-rafter-a');
  rafterA.position.set(x, y + 0.28, z);
  rafterA.rotation.z = context.variation.signSide > 0 ? -0.42 : 0.42;
  collapse.add(rafterA);

  const rafterB = beam(0.1, 0.62, 0.1, context.materials.wetStain, 'roof-collapse-rafter-b');
  rafterB.position.set(x + context.variation.signSide * 0.22, y + 0.12, z + 0.18);
  rafterB.rotation.z = context.variation.signSide > 0 ? -0.28 : 0.28;
  collapse.add(rafterB);

  const patch = buildMembraneSheet({
    seed,
    corners: [
      new THREE.Vector3(x - 0.18, y + 0.36, z + 0.04),
      new THREE.Vector3(x + 0.18, y + 0.3, z + 0.04),
      new THREE.Vector3(x + 0.1, y + 0.04, z + 0.24),
      new THREE.Vector3(x - 0.08, y + 0.08, z + 0.16),
    ],
    membraneMaterial: context.materials.containedGel,
    rimMaterial: context.materials.hardenedGel,
    ribMaterial: context.materials.gelDark,
    sag: 0.04,
    ribCount: 1,
  });
  patch.name = 'roof-collapse-patch';
  collapse.add(patch);
  return collapse;
}

function buildInnSideBreachPatch(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const patch = new THREE.Group();
  patch.name = 'inn-side-breach-patch';
  const face = context.variation.stableSide;
  const sign = face === 'left' ? -1 : 1;
  const x = face === 'left' ? context.hostBox.min.x - 0.02 : context.hostBox.max.x + 0.02;
  const z = (context.hostBox.min.z + context.hostBox.max.z) * 0.5 - 0.5;
  const y = groundYForBox(context.hostBox) + 1.62;

  const plateA = beam(0.12, 0.92, 0.16, context.materials.hardenedGel, 'side-breach-plate-a');
  plateA.position.set(x, y, z);
  plateA.rotation.y = sign * 0.08;
  patch.add(plateA);

  const plateB = beam(0.12, 0.82, 0.16, context.materials.hardenedGel, 'side-breach-plate-b');
  plateB.position.set(x, y - 0.04, z + 0.28);
  plateB.rotation.y = -sign * 0.1;
  patch.add(plateB);

  const seam = buildGelLipCourse({
    seed,
    start: new THREE.Vector3(x, y + 0.34, z - 0.16),
    end: new THREE.Vector3(x, y - 0.18, z + 0.44),
    outwardNormal: new THREE.Vector3(sign, 0, 0),
    material: context.materials.gel,
    plateCount: 5,
  });
  seam.name = 'side-breach-seam';
  patch.add(seam);
  return patch;
}

function buildInnUpperCollapseScar(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const scar = new THREE.Group();
  scar.name = 'inn-upper-collapse-scar';
  const centerX = context.variation.entranceOffset + context.variation.signSide * 0.28;
  const y = groundYForBox(context.hostBox) + FLOOR_HEIGHT + 1.08;
  const z = context.hostBox.max.z + 0.14;

  const brokenBeam = beam(0.84, 0.08, 0.12, context.materials.wetStain, 'upper-collapse-beam');
  brokenBeam.position.set(centerX, y, z);
  brokenBeam.rotation.z = -context.variation.signSide * 0.2;
  scar.add(brokenBeam);

  const brace = beam(0.08, 0.7, 0.08, context.materials.hardenedGel, 'upper-collapse-brace');
  brace.position.set(centerX - context.variation.signSide * 0.22, y - 0.26, z - 0.04);
  brace.rotation.z = context.variation.signSide * 0.34;
  scar.add(brace);

  const drip = buildFacetedDripRun({
    seed,
    start: new THREE.Vector3(centerX - 0.28, y - 0.08, z + 0.08),
    end: new THREE.Vector3(centerX + 0.2, y - 0.12, z + 0.08),
    material: context.materials.gel,
    dripCount: 3,
  });
  drip.name = 'upper-collapse-drip';
  scar.add(drip);
  return scar;
}

function buildInnDamageAccent(context: BuildContext<InnVariation>, seed: number): THREE.Group | null {
  switch (context.variation.damageState) {
    case 'roof-corner-missing':
      return buildInnRoofCornerCollapse(context, seed);
    case 'side-wall-breach':
      return buildInnSideBreachPatch(context, seed);
    case 'upper-balcony-collapse':
      return buildInnUpperCollapseScar(context, seed);
    case 'light':
    default:
      return null;
  }
}

function buildInnBrokenBalconyRemnant(context: BuildContext<InnVariation>, seed: number): THREE.Group {
  const balcony = new THREE.Group();
  balcony.name = 'inn-broken-balcony-remnant';
  const centerX = context.variation.entranceOffset + (context.variation.signSide * 0.35);
  const baseY = groundYForBox(context.hostBox) + FLOOR_HEIGHT + 0.98;
  const frontZ = context.hostBox.max.z + 0.18;

  const deck = beam(1.1, 0.08, 0.44, context.materials.wetStain, 'balcony-deck');
  deck.position.set(centerX, baseY, frontZ);
  balcony.add(deck);

  const railLeft = beam(0.08, 0.34, 0.08, context.materials.hardenedGel, 'balcony-rail-left');
  railLeft.position.set(centerX - 0.42, baseY + 0.2, frontZ + 0.1);
  balcony.add(railLeft);

  const railStub = beam(0.34, 0.08, 0.08, context.materials.hardenedGel, 'balcony-rail-stub');
  railStub.position.set(centerX - 0.24, baseY + 0.34, frontZ + 0.1);
  balcony.add(railStub);

  const brokenPlank = beam(0.38, 0.05, 0.12, context.materials.wetStain, 'balcony-broken-plank');
  brokenPlank.position.set(centerX + 0.26, baseY - 0.02, frontZ + 0.08);
  brokenPlank.rotation.z = 0.3;
  balcony.add(brokenPlank);

  const brace = beam(0.08, 0.62, 0.08, context.materials.gelDark, 'balcony-brace');
  brace.position.set(centerX - 0.18, baseY - 0.28, frontZ - 0.08);
  brace.rotation.z = -0.42;
  balcony.add(brace);

  const drip = buildFacetedDripRun({
    seed,
    start: new THREE.Vector3(centerX - 0.34, baseY - 0.12, frontZ + 0.16),
    end: new THREE.Vector3(centerX + 0.12, baseY - 0.12, frontZ + 0.16),
    material: context.materials.gel,
    dripCount: 3,
  });
  drip.name = 'balcony-drip';
  balcony.add(drip);

  return balcony;
}

function addInnExtras(context: BuildContext<InnVariation>): void {
  context.group.add(buildInnSign(context, seedWithSalt(context.dna.seed, INN_EXTRA_SALT)));
  context.group.add(buildInnChannel(context, seedWithSalt(context.dna.seed, INN_EXTRA_SALT ^ 0x11)));
  context.group.add(buildInnServiceArch(context, seedWithSalt(context.dna.seed, INN_EXTRA_SALT ^ 0x22)));
  context.group.add(buildInnVat(context, seedWithSalt(context.dna.seed, INN_EXTRA_SALT ^ 0x33)));
  const roofVent = buildInnRoofVent(context, seedWithSalt(context.dna.seed, INN_EXTRA_SALT ^ 0x44));
  if (roofVent) context.group.add(roofVent);
  const damageAccent = buildInnDamageAccent(context, seedWithSalt(context.dna.seed, INN_EXTRA_SALT ^ 0x49));
  if (damageAccent) context.group.add(damageAccent);
  if (context.variation.frontSpecial === 'broken-balcony') {
    context.group.add(buildInnBrokenBalconyRemnant(context, seedWithSalt(context.dna.seed, INN_EXTRA_SALT ^ 0x55)));
  }
}

function buildBlacksmithVentSilhouette(context: BuildContext<BlacksmithVariation>, seed: number): THREE.Group {
  const vent = new THREE.Group();
  vent.name = 'blacksmith-vent-silhouette';
  const rand = mulberry32(seed);
  const box = context.hostBox;
  const roofY = box.max.y;
  const cornerX = box.max.x - 0.5;
  const cornerZ = box.min.z + 0.5;

  switch (context.variation.ventSilhouette) {
    case 'tall-chimney': {
      const ringCount = 4 + Math.floor(rand() * 2);
      let y = roofY;
      for (let index = 0; index < ringCount; index++) {
        const ringHeight = 0.34 + rand() * 0.08;
        const ringRadius = 0.26 - index * 0.012;
        const ring = createFacetedPlate(ringRadius * 2, ringRadius * 2, ringHeight, context.materials.hardenedGel, `chimney-ring-${index}`, 6);
        ring.position.set(cornerX, y + ringHeight * 0.5, cornerZ);
        vent.add(ring);
        const strap = beam(ringRadius * 1.9, 0.04, ringRadius * 1.9, context.materials.gelDark, `chimney-strap-${index}`);
        strap.position.set(cornerX, y + ringHeight, cornerZ);
        vent.add(strap);
        y += ringHeight;
      }
      break;
    }
    case 'louvred-vent-box': {
      const boxWidth = 0.55;
      const boxHeight = 0.62;
      const frame = beam(boxWidth, boxHeight, 0.4, context.materials.hardenedGel, 'louvre-frame');
      frame.position.set(cornerX, roofY + boxHeight * 0.5, cornerZ);
      vent.add(frame);
      const slatCount = 4;
      for (let index = 0; index < slatCount; index++) {
        const slat = beam(boxWidth * 0.94, 0.05, 0.42, context.materials.gelDark, `louvre-slat-${index}`);
        slat.position.set(cornerX, roofY + 0.1 + index * (boxHeight * 0.78) / slatCount, cornerZ);
        slat.rotation.x = -0.35;
        vent.add(slat);
      }
      break;
    }
    case 'pipe-cluster': {
      const pipeCount = 3;
      for (let index = 0; index < pipeCount; index++) {
        const height = 0.5 + rand() * 0.4;
        const radius = 0.09 + rand() * 0.03;
        const pipe = createFacetedPlate(radius * 2, radius * 2, height, context.materials.hardenedGel, `vent-pipe-${index}`, 6);
        pipe.position.set(
          cornerX + (index - 1) * 0.22,
          roofY + height * 0.5,
          cornerZ + (rand() - 0.5) * 0.1,
        );
        vent.add(pipe);
        const cap = createFacetedPlate(radius * 2.3, radius * 2.3, 0.06, context.materials.gelDark, `vent-pipe-cap-${index}`, 6);
        cap.position.set(pipe.position.x, roofY + height + 0.03, pipe.position.z);
        vent.add(cap);
      }
      break;
    }
    case 'broken-chimney-gel-repair': {
      const stubHeight = 0.4;
      const stub = createFacetedPlate(0.5, 0.5, stubHeight, context.materials.hardenedGel, 'chimney-stub', 6);
      stub.position.set(cornerX, roofY + stubHeight * 0.5, cornerZ);
      vent.add(stub);
      const patch = buildMembraneSheet({
        seed: seedWithSalt(seed, 0x01),
        corners: [
          new THREE.Vector3(cornerX - 0.24, roofY + stubHeight, cornerZ - 0.24),
          new THREE.Vector3(cornerX + 0.24, roofY + stubHeight, cornerZ - 0.24),
          new THREE.Vector3(cornerX + 0.24, roofY + stubHeight, cornerZ + 0.24),
          new THREE.Vector3(cornerX - 0.24, roofY + stubHeight, cornerZ + 0.24),
        ],
        membraneMaterial: context.materials.containedGel,
        rimMaterial: context.materials.hardenedGel,
        ribMaterial: context.materials.gelDark,
        sag: 0.06,
        ribCount: 3,
      });
      patch.name = 'chimney-gel-repair-patch';
      vent.add(patch);
      break;
    }
  }

  return vent;
}

function buildBlacksmithChannelLip(context: BuildContext<BlacksmithVariation>, seed: number): THREE.Group {
  const lip = new THREE.Group();
  lip.name = 'blacksmith-channel-lip';
  const box = context.hostBox;
  const groundY = groundYForBox(box) + 0.1;

  const front = buildGelLipCourse({
    seed,
    start: new THREE.Vector3(box.min.x + 0.1, groundY, box.max.z + 0.03),
    end: new THREE.Vector3(box.max.x - 0.1, groundY, box.max.z + 0.03),
    outwardNormal: new THREE.Vector3(0, 0, 1),
    material: context.materials.hardenedGel,
    plateCount: 7,
  });
  front.name = 'blacksmith-channel-lip-front';
  lip.add(front);

  const returnDepth = Math.min(0.8, (box.max.z - box.min.z) * 0.3);
  const rightReturn = buildGelLipCourse({
    seed: seedWithSalt(seed, 0x01),
    start: new THREE.Vector3(box.max.x - 0.05, groundY, box.max.z - returnDepth),
    end: new THREE.Vector3(box.max.x - 0.05, groundY, box.max.z + 0.03),
    outwardNormal: new THREE.Vector3(1, 0, 0),
    material: context.materials.hardenedGel,
    plateCount: 4,
  });
  rightReturn.name = 'blacksmith-channel-lip-return';
  lip.add(rightReturn);

  return lip;
}

function buildBlacksmithPlateRack(context: BuildContext<BlacksmithVariation>, seed: number): THREE.Group {
  const rack = new THREE.Group();
  rack.name = 'blacksmith-plate-rack';
  const rand = mulberry32(seed);
  const box = context.hostBox;
  const groundY = groundYForBox(box);
  const x = box.max.x - 0.65;
  const z = box.max.z + 0.34;

  const postLeft = beam(0.06, 0.62, 0.06, context.materials.wetStain, 'rack-post-left');
  postLeft.position.set(x - 0.32, groundY + 0.31, z);
  rack.add(postLeft);
  const postRight = beam(0.06, 0.62, 0.06, context.materials.wetStain, 'rack-post-right');
  postRight.position.set(x + 0.32, groundY + 0.31, z);
  rack.add(postRight);
  const rail = beam(0.72, 0.05, 0.08, context.materials.wetStain, 'rack-rail');
  rail.position.set(x, groundY + 0.58, z);
  rack.add(rail);

  const plateCount = 4 + Math.floor(rand() * 2);
  for (let index = 0; index < plateCount; index++) {
    const plate = createFacetedPlate(
      0.18 + rand() * 0.04,
      0.24 + rand() * 0.05,
      0.03,
      context.materials.hardenedGel,
      `rack-plate-${index}`,
      5,
    );
    plate.position.set(x - 0.28 + index * (0.56 / (plateCount - 1)), groundY + 0.34, z + 0.05);
    plate.rotation.z = (rand() - 0.5) * 0.18;
    rack.add(plate);
  }

  return rack;
}

function buildBlacksmithHeatSource(context: BuildContext<BlacksmithVariation>, seed: number): THREE.Group {
  const heat = new THREE.Group();
  heat.name = 'blacksmith-heat-source';
  const box = context.hostBox;
  const groundY = groundYForBox(box);
  const x = box.min.x + 0.7;
  const z = box.max.z + 0.4;

  const vat = buildContainedGelVat({
    seed,
    radius: context.variation.heatSource === 'glowing-acid-vat' ? 0.4 : 0.32,
    height: 0.5,
    frameMaterial: context.materials.hardenedGel,
    bandMaterial: context.materials.gelDark,
    gelMaterial: context.variation.heatSource === 'glowing-acid-vat' ? context.materials.gelGlow : context.materials.containedGel,
    baseMaterial: context.materials.wetStain,
    bandCount: 3,
  });
  vat.name = 'blacksmith-heat-source-vessel';
  vat.position.set(x, groundY, z);
  heat.add(vat);

  const tiles = buildPuddleSkirtTiles({
    seed: seedWithSalt(seed, 0x01),
    center: new THREE.Vector3(x, groundY + 0.01, z),
    radiusX: 0.62,
    radiusZ: 0.6,
    material: context.materials.wetStain,
    tileCount: 6,
  });
  tiles.name = 'blacksmith-heat-source-apron';
  heat.add(tiles);

  return heat;
}

function buildBlacksmithVent(
  context: BuildContext<BlacksmithVariation>,
  side: 'left' | 'right',
  seed: number,
): THREE.Group {
  const face: OpeningFace = side;
  const width = 0.35;
  const straightHeight = 0.55;
  const pointHeight = 0.22;
  const opening = buildWindowOpening({
    width,
    straightHeight,
    pointHeight,
    recessDepth: 0.16,
    frameWidth: 0.07,
    frameProud: 0.03,
    wallZ: 0,
    stoneMaterial: context.materials.hardenedGel,
    glazingMaterial: context.materials.gelGlow,
    recessMaterial: context.materials.wetStain,
    divisionStyle: 'cross',
    openingShape: 'round',
  });
  opening.name = `blacksmith-vent-${side}`;

  const anchor = openingAnchor(context.hostBox, {
    kind: 'window',
    face,
    offset: side === 'left' ? -0.9 : 0.9,
    baseY: 1.45,
    width,
    straightHeight,
    pointHeight,
  });
  const rand = mulberry32(seed);
  opening.position.copy(anchor);
  opening.rotation.y = faceRotationY(face);
  opening.rotation.y += (rand() - 0.5) * 0.01;
  opening.userData.overlayRole = 'blacksmith-vent';
  return opening;
}

function addBlacksmithExtras(context: BuildContext<BlacksmithVariation>): void {
  context.group.add(buildBlacksmithVentSilhouette(context, seedWithSalt(context.dna.seed, BLACKSMITH_EXTRA_SALT)));
  context.group.add(buildBlacksmithChannelLip(context, seedWithSalt(context.dna.seed, BLACKSMITH_EXTRA_SALT ^ 0x11)));
  context.group.add(buildBlacksmithPlateRack(context, seedWithSalt(context.dna.seed, BLACKSMITH_EXTRA_SALT ^ 0x22)));
  context.group.add(buildBlacksmithHeatSource(context, seedWithSalt(context.dna.seed, BLACKSMITH_EXTRA_SALT ^ 0x33)));
  context.group.add(buildBlacksmithVent(context, 'left', seedWithSalt(context.dna.seed, BLACKSMITH_EXTRA_SALT ^ 0x44)));
  context.group.add(buildBlacksmithVent(context, 'right', seedWithSalt(context.dna.seed, BLACKSMITH_EXTRA_SALT ^ 0x55)));
}

function buildVillaElderRing(context: BuildContext<VillaVariation>, seed: number): THREE.Group {
  const ring = new THREE.Group();
  ring.name = 'villa-elder-ring';
  const box = context.hostBox;
  const doorOpening = context.blueprint.openingSchedule.find(o => o.kind === 'door' && o.face === 'front');
  if (!doorOpening) return ring;

  const anchor = openingAnchor(box, doorOpening);
  const halfWidth = doorOpening.width * 0.5 + 0.3;
  const halfHeight = doorOpening.straightHeight * 0.5 + doorOpening.pointHeight + 0.35;
  const centerY = anchor.y + doorOpening.straightHeight * 0.5;
  const z = anchor.z + 0.04;

  [0.32, 0.58].forEach((offset, ringIndex) => {
    const hw = halfWidth + offset;
    const hh = halfHeight + offset * 0.55;
    const segments: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(anchor.x - hw, centerY - hh, z), new THREE.Vector3(anchor.x + hw, centerY - hh, z)],
      [new THREE.Vector3(anchor.x + hw, centerY - hh, z), new THREE.Vector3(anchor.x + hw, centerY + hh, z)],
      [new THREE.Vector3(anchor.x + hw, centerY + hh, z), new THREE.Vector3(anchor.x - hw, centerY + hh, z)],
      [new THREE.Vector3(anchor.x - hw, centerY + hh, z), new THREE.Vector3(anchor.x - hw, centerY - hh, z)],
    ];
    segments.forEach(([start, end], segIndex) => {
      const seg = buildGelLipCourse({
        seed: seedWithSalt(seed, (ringIndex << 4) | segIndex),
        start,
        end,
        outwardNormal: new THREE.Vector3(0, 0, 1),
        material: context.materials.hardenedGel,
        plateCount: 4,
      });
      seg.name = `villa-elder-ring-${ringIndex}-${segIndex}`;
      ring.add(seg);
    });
  });

  return ring;
}

function buildVillaCoralCrown(context: BuildContext<VillaVariation>, seed: number): THREE.Group {
  const crown = new THREE.Group();
  crown.name = 'villa-coral-crown';
  const rand = mulberry32(seed);
  const box = context.hostBox;
  const roofY = box.max.y;
  const corners = [
    new THREE.Vector3(box.min.x + 0.4, roofY, box.min.z + 0.4),
    new THREE.Vector3(box.max.x - 0.4, roofY, box.min.z + 0.4),
    new THREE.Vector3(box.min.x + 0.4, roofY, box.max.z - 0.4),
    new THREE.Vector3(box.max.x - 0.4, roofY, box.max.z - 0.4),
  ];

  corners.forEach((corner, cornerIndex) => {
    const finial = new THREE.Group();
    finial.name = `villa-coral-crown-finial-${cornerIndex}`;
    const branchCount = 3 + Math.floor(rand() * 2);
    for (let index = 0; index < branchCount; index++) {
      const height = 0.12 + rand() * 0.14;
      const width = 0.05 + rand() * 0.04;
      const branch = createFacetedPlate(width, width, height, context.materials.hardenedGel, `coral-branch-${index}`, 5);
      branch.position.set(
        corner.x + (rand() - 0.5) * 0.14,
        corner.y + height * 0.5 + index * 0.02,
        corner.z + (rand() - 0.5) * 0.14,
      );
      branch.rotation.z = (rand() - 0.5) * 0.5;
      branch.rotation.x = (rand() - 0.5) * 0.3;
      finial.add(branch);
    }
    crown.add(finial);
  });

  return crown;
}

function buildVillaGelMotifExtra(context: BuildContext<VillaVariation>, seed: number): THREE.Group | null {
  const box = context.hostBox;
  if (context.variation.gelMotif === 'membrane-skylight') {
    const cx = (box.min.x + box.max.x) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    const roofY = box.max.y;
    const sheet = buildMembraneSheet({
      seed,
      corners: [
        new THREE.Vector3(cx - 0.9, roofY, cz - 0.7),
        new THREE.Vector3(cx + 0.9, roofY, cz - 0.7),
        new THREE.Vector3(cx + 0.9, roofY, cz + 0.7),
        new THREE.Vector3(cx - 0.9, roofY, cz + 0.7),
      ],
      membraneMaterial: context.materials.containedGel,
      rimMaterial: context.materials.hardenedGel,
      ribMaterial: context.materials.gelDark,
      sag: 0.1,
      ribCount: 4,
    });
    sheet.name = 'villa-elder-skylight';
    return sheet;
  }

  if (context.variation.gelMotif === 'tendril-buttresses') {
    const group = new THREE.Group();
    group.name = 'villa-tendril-buttresses';
    const groundY = groundYForBox(box);
    (['left', 'right'] as const).forEach((side, index) => {
      const x = side === 'left' ? box.min.x : box.max.x;
      const bridge = buildTendrilBridge({
        seed: seedWithSalt(seed, index),
        start: new THREE.Vector3(x, groundY, box.min.z + 0.6),
        end: new THREE.Vector3(x, groundY + (box.max.y - groundY) * 0.6, box.min.z + 0.6),
        material: context.materials.gel,
        anchorMaterial: context.materials.hardenedGel,
      });
      bridge.name = `villa-tendril-buttress-${side}`;
      group.add(bridge);
    });
    return group;
  }

  return null;
}

function addVillaExtras(context: BuildContext<VillaVariation>): void {
  context.group.add(buildVillaElderRing(context, seedWithSalt(context.dna.seed, VILLA_EXTRA_SALT)));
  context.group.add(buildVillaCoralCrown(context, seedWithSalt(context.dna.seed, VILLA_EXTRA_SALT ^ 0x11)));
  const motif = buildVillaGelMotifExtra(context, seedWithSalt(context.dna.seed, VILLA_EXTRA_SALT ^ 0x22));
  if (motif) context.group.add(motif);
}

function buildChapelLancets(context: BuildContext<ChapelVariation>, seed: number): THREE.Group[] {
  const windows = context.blueprint.openingSchedule.filter(opening => opening.kind === 'window');
  return windows.map((opening, index) => {
    const lancet = buildWindowOpening({
      width: opening.width,
      straightHeight: opening.straightHeight,
      pointHeight: opening.pointHeight,
      recessDepth: 0.16,
      frameWidth: 0.08,
      frameProud: 0.03,
      wallZ: 0,
      stoneMaterial: context.materials.hardenedGel,
      glazingMaterial: context.materials.containedGel,
      recessMaterial: context.materials.wetStain,
      divisionStyle: 'vertical',
      openingShape: 'arch',
    });
    lancet.name = `chapel-lancet-${index}`;
    const anchor = openingAnchor(context.hostBox, opening);
    lancet.position.copy(anchor);
    lancet.rotation.y = faceRotationY(opening.face);
    const rand = mulberry32(seedWithSalt(seed, index));
    lancet.rotation.y += (rand() - 0.5) * 0.01;
    lancet.userData.overlayRole = 'chapel-lancet';
    return lancet;
  });
}

function buildChapelEntrance(context: BuildContext<ChapelVariation>, seed: number): THREE.Group {
  const doorSpec = context.blueprint.openingSchedule.find(opening => opening.kind === 'door');
  const entrance = new THREE.Group();
  entrance.name = 'chapel-entrance';
  if (!doorSpec) return entrance;

  const door = buildDoorOpening({
    width: doorSpec.width,
    straightHeight: doorSpec.straightHeight,
    pointHeight: doorSpec.pointHeight,
    recessDepth: 0.2,
    frameWidth: 0.1,
    frameProud: 0.05,
    wallZ: 0,
    stoneMaterial: context.materials.hardenedGel,
    recessMaterial: context.materials.wetStain,
    woodMaterial: context.materials.gelDark,
  });
  door.name = 'chapel-entrance-door';
  const anchor = openingAnchor(context.hostBox, doorSpec);
  door.position.copy(anchor);
  door.rotation.y = faceRotationY(doorSpec.face);
  entrance.add(door);
  entrance.userData.overlayRole = 'chapel-entrance';
  void seed;
  return entrance;
}

function buildChapelPulsePool(context: BuildContext<ChapelVariation>, seed: number): THREE.Group {
  const pool = new THREE.Group();
  pool.name = 'chapel-pulse-pool';
  const box = context.hostBox;
  const groundY = groundYForBox(box);
  const cx = (box.min.x + box.max.x) * 0.5;
  const z = box.min.z + 0.9;
  const halfW = 1.1;
  const halfD = 0.85;

  const rim = new THREE.Group();
  rim.name = 'chapel-pulse-pool-rim';
  const segments: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(cx - halfW, groundY + 0.14, z - halfD), new THREE.Vector3(cx + halfW, groundY + 0.14, z - halfD), new THREE.Vector3(0, 0, -1)],
    [new THREE.Vector3(cx + halfW, groundY + 0.14, z - halfD), new THREE.Vector3(cx + halfW, groundY + 0.14, z + halfD), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(cx + halfW, groundY + 0.14, z + halfD), new THREE.Vector3(cx - halfW, groundY + 0.14, z + halfD), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(cx - halfW, groundY + 0.14, z + halfD), new THREE.Vector3(cx - halfW, groundY + 0.14, z - halfD), new THREE.Vector3(-1, 0, 0)],
  ];
  segments.forEach(([start, end, normal], index) => {
    const seg = buildGelLipCourse({
      seed: seedWithSalt(seed, index),
      start,
      end,
      outwardNormal: normal,
      material: context.materials.hardenedGel,
      plateCount: 5,
    });
    seg.name = `chapel-pulse-pool-rim-segment-${index}`;
    rim.add(seg);
  });
  pool.add(rim);

  const basin = buildPuddleSkirtTiles({
    seed: seedWithSalt(seed, 0x10),
    center: new THREE.Vector3(cx, groundY + 0.01, z),
    radiusX: halfW * 0.85,
    radiusZ: halfD * 0.85,
    material: context.materials.containedGel,
    tileCount: 8,
  });
  basin.name = 'chapel-pulse-pool-basin';
  pool.add(basin);

  const candleCount = 3;
  for (let index = 0; index < candleCount; index++) {
    const t = index / (candleCount - 1);
    const cup = buildContainedGelVat({
      seed: seedWithSalt(seed, 0x20 + index),
      radius: 0.09,
      height: 0.2,
      frameMaterial: context.materials.hardenedGel,
      bandMaterial: context.materials.gelDark,
      gelMaterial: context.materials.gelGlow,
      baseMaterial: context.materials.wetStain,
      bandCount: 1,
    });
    cup.name = `chapel-pulse-pool-candle-${index}`;
    cup.position.set(cx - halfW + t * halfW * 2, groundY + 0.14, z - halfD + 0.06);
    cup.scale.setScalar(0.6);
    pool.add(cup);
  }

  return pool;
}

function buildChapelChoirScreen(context: BuildContext<ChapelVariation>, seed: number): THREE.Group {
  const screen = new THREE.Group();
  screen.name = 'chapel-choir-screen';
  const box = context.hostBox;
  const groundY = groundYForBox(box);
  const cx = (box.min.x + box.max.x) * 0.5;
  const archZ = box.min.z + 1.8;

  if (context.variation.choirTreatment === 'tendril-arcs') {
    for (let index = 0; index < 2; index++) {
      const x = cx + (index === 0 ? -0.9 : 0.9);
      const arc = buildTendrilBridge({
        seed: seedWithSalt(seed, index),
        start: new THREE.Vector3(x, groundY + 0.1, archZ - 0.5),
        end: new THREE.Vector3(x, groundY + 0.1, archZ + 0.5),
        material: context.materials.gel,
        anchorMaterial: context.materials.hardenedGel,
        midRadius: 0.05,
      });
      arc.name = `chapel-choir-screen-arc-${index}`;
      screen.add(arc);
    }
  } else {
    const lens = buildGelLensInfill({
      seed,
      width: 1.6,
      straightHeight: 1.0,
      pointHeight: 0.3,
      material: context.materials.containedGel,
      rimMaterial: context.materials.hardenedGel,
      ribMaterial: context.materials.gelDark,
      openingShape: 'arch',
      insetDepth: 0,
    });
    lens.name = 'chapel-choir-screen-lens';
    lens.position.set(cx, groundY + 1.0, archZ);
    screen.add(lens);
  }

  return screen;
}

function addChapelExtras(context: BuildContext<ChapelVariation>): void {
  const seed = context.dna.seed;
  for (const lancet of buildChapelLancets(context, seedWithSalt(seed, CHAPEL_EXTRA_SALT))) {
    context.group.add(lancet);
  }
  context.group.add(buildChapelEntrance(context, seedWithSalt(seed, CHAPEL_EXTRA_SALT ^ 0x11)));
  context.group.add(buildChapelPulsePool(context, seedWithSalt(seed, CHAPEL_EXTRA_SALT ^ 0x22)));
  context.group.add(buildChapelChoirScreen(context, seedWithSalt(seed, CHAPEL_EXTRA_SALT ^ 0x33)));
}

export function buildSlimeHouse(dna: BuildingDNA): THREE.Group {
  const normalized = normalizeDna(dna, 'house', 'small', 1, 'none');
  const { blueprint, variation } = createHouseBlueprint(normalized);
  const context = makeContext(normalized, blueprint, variation, 'house');
  addHouseExtras(context);
  return context.group;
}

export function buildSlimeTerraced(dna: BuildingDNA): THREE.Group {
  const normalized = normalizeDna(dna, 'terraced', 'tiny', 2, 'both');
  const { blueprint, variation } = createTerracedBlueprint(normalized);
  const context = makeContext(normalized, blueprint, variation, 'terraced');
  addTerracedExtras(context);
  return context.group;
}

export function buildSlimeShop(dna: BuildingDNA): THREE.Group {
  const normalized = normalizeDna(dna, 'shop', 'small', 1, 'none');
  const { blueprint, variation } = createShopBlueprint(normalized);
  const context = makeContext(normalized, blueprint, variation, 'shop');
  addShopExtras(context);
  return context.group;
}

export function buildSlimeInn(dna: BuildingDNA): THREE.Group {
  const normalized = normalizeDna(dna, 'inn', 'large', 2, 'none');
  const { blueprint, variation } = createInnBlueprint(normalized);
  const context = makeContext(normalized, blueprint, variation, 'inn');
  addInnExtras(context);
  return context.group;
}

export function buildSlimeBlacksmith(dna: BuildingDNA): THREE.Group {
  const normalized = normalizeDna(dna, 'blacksmith', 'medium', 1, 'none');
  const { blueprint, variation } = createBlacksmithBlueprint(normalized);
  const context = makeContext(normalized, blueprint, variation, 'blacksmith');
  addBlacksmithExtras(context);
  return context.group;
}

export function buildSlimeVilla(dna: BuildingDNA): THREE.Group {
  const normalized = normalizeDna(dna, 'villa', 'large', 3, 'none');
  const { blueprint, variation } = createVillaBlueprint(normalized);
  const context = makeContext(normalized, blueprint, variation, 'villa');
  addVillaExtras(context);
  return context.group;
}

export function buildSlimeChapel(dna: BuildingDNA): THREE.Group {
  const normalized = normalizeDna(dna, 'chapel', 'medium', 1, 'none');
  const { blueprint, variation } = createChapelBlueprint(normalized);
  const context = makeContext(normalized, blueprint, variation, 'chapel');
  addChapelExtras(context);
  return context.group;
}
