import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLOCK_UNIT } from '@/world/buildings/BlockKit';
import { FLOOR_HEIGHT, factionBuildingDna } from '@/world/buildings/BuildingDNA';
import {
  MIMIC_FILLET_RADIUS_MAX,
  MIMIC_FILLET_RADIUS_MIN,
  MIMIC_RIDGE_SAG_MAX,
  MIMIC_RIDGE_SAG_MIN,
  rollElderHueBlend,
  rollSlimeHueFamily,
} from '@/world/buildings/slime/SlimeMaterials';
import { pickSlimeHostShell } from '@/world/buildings/slime/SlimeHostShells';
import {
  buildSlimeOccupiedShell,
  type SlimeKindBlueprint,
} from '@/world/buildings/slime/SlimeOccupiedShell';

const TRUE_ABANDONED_RUIN_DAMAGE_INTENSITY = 0.4;
const HOST_BLOCK_KIT_CHAMFER_RADIUS = BLOCK_UNIT * 0.14;
const EXPORTED_MODULE_TYPES = new Set([
  'gel-lip-course',
  'membrane-sheet',
  'tendril-bridge',
  'faceted-drip-run',
  'gel-lens-infill',
  'puddle-skirt-tiles',
  'contained-gel-vat',
]);

function makeTerracedDna(seed: number) {
  return {
    ...factionBuildingDna('terraced', 'slime', seed, 'tiny', 2),
    terrace: 'both' as const,
  };
}

function makeChapelDna(seed: number) {
  return factionBuildingDna('chapel', 'slime', seed, 'medium', 1);
}

function makeTerracedBlueprint(overrides: Partial<SlimeKindBlueprint> = {}): SlimeKindBlueprint {
  return {
    footprint: { width: 3, depth: 4, skirtAllowance: 0.35 },
    floors: 2,
    openingSchedule: [
      { kind: 'door', face: 'front', offset: -0.45, baseY: 0, width: 0.75, straightHeight: 1.65, pointHeight: 0.18 },
      { kind: 'window', face: 'front', offset: -0.68, baseY: FLOOR_HEIGHT + 0.55, width: 0.45, straightHeight: 0.75, pointHeight: 0.12 },
      { kind: 'window', face: 'front', offset: 0.68, baseY: FLOOR_HEIGHT + 0.55, width: 0.45, straightHeight: 0.75, pointHeight: 0.12 },
      { kind: 'window', face: 'back', offset: 0, baseY: 1.05, width: 0.34, straightHeight: 0.42, pointHeight: 0.1, openingShape: 'round' },
    ],
    moduleWeights: {
      'gel-lip-course': 0.8,
      'membrane-sheet': 0.65,
      'tendril-bridge': 0.55,
      'faceted-drip-run': 0.45,
      'gel-lens-infill': 0.5,
      'puddle-skirt-tiles': 1,
      'contained-gel-vat': 0.2,
    },
    propWeights: {
      rubble: 0.7,
      'contained-gel-vat': 0.35,
    },
    ...overrides,
  };
}

function makeChapelBlueprint(overrides: Partial<SlimeKindBlueprint> = {}): SlimeKindBlueprint {
  return {
    footprint: { width: 4, depth: 8, skirtAllowance: 0.35 },
    floors: 1,
    ruinIntensity: 0.26,
    openingSchedule: [
      { kind: 'door', face: 'front', offset: 0, baseY: 0, width: 1.0, straightHeight: 2.1, pointHeight: 0.2 },
      { kind: 'window', face: 'left', offset: -1.4, baseY: 1.15, width: 0.55, straightHeight: 1.05, pointHeight: 0.3 },
      { kind: 'window', face: 'left', offset: 1.4, baseY: 1.15, width: 0.55, straightHeight: 1.05, pointHeight: 0.3 },
      { kind: 'window', face: 'right', offset: -1.4, baseY: 1.15, width: 0.55, straightHeight: 1.05, pointHeight: 0.3 },
      { kind: 'window', face: 'right', offset: 1.4, baseY: 1.15, width: 0.55, straightHeight: 1.05, pointHeight: 0.3 },
    ],
    moduleWeights: {
      'gel-lip-course': 0.8,
      'membrane-sheet': 0.7,
      'tendril-bridge': 0.55,
      'faceted-drip-run': 0.5,
      'gel-lens-infill': 0.4,
      'puddle-skirt-tiles': 0.7,
      'contained-gel-vat': 0.25,
    },
    propWeights: {
      rubble: 0.8,
      'contained-gel-vat': 0.2,
    },
    ...overrides,
  };
}

function requireObject<T extends THREE.Object3D = THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  expect(object, `${name} should exist`).toBeTruthy();
  return object as T;
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function countVertices(root: THREE.Object3D): number {
  return collectMeshes(root).reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
}

function namedSignature(root: THREE.Object3D): string[] {
  const signature: string[] = [];
  root.traverse(object => {
    signature.push([
      object.type,
      object.name,
      String(object.children.length),
      String(object.userData.moduleType ?? ''),
      String(object.userData.overlayRole ?? ''),
    ].join('|'));
  });
  return signature.sort();
}

function collectModuleGroups(root: THREE.Object3D): THREE.Group[] {
  const modules: THREE.Group[] = [];
  root.traverse(object => {
    if (
      object instanceof THREE.Group
      && typeof object.userData.moduleType === 'string'
      && EXPORTED_MODULE_TYPES.has(String(object.userData.moduleType))
    ) {
      modules.push(object);
    }
  });
  return modules;
}

function moduleTypesOf(root: THREE.Object3D): Set<string> {
  return new Set(collectModuleGroups(root).map(module => String(module.userData.moduleType)));
}

function collectMandatoryDrips(root: THREE.Object3D): THREE.Group[] {
  return collectModuleGroups(root).filter(module =>
    module.userData.moduleType === 'faceted-drip-run'
    && module.userData.dripRole === 'mandatory-mimic',
  );
}

function getAllowedSlimeMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const set = root.userData.slimeMaterialSet as Record<string, unknown> | undefined;
  expect(set).toBeTruthy();
  return new Set(
    Object.values(set ?? {}).filter(value => value instanceof THREE.Material) as THREE.Material[],
  );
}

function expectModuleMaterialsToReuseOneSet(root: THREE.Object3D): void {
  const allowed = getAllowedSlimeMaterials(root);
  for (const module of collectModuleGroups(root)) {
    module.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        expect(allowed.has(material)).toBe(true);
      }
    });
  }
}

function averageEdgeY(points: number[][], side: 'left' | 'right'): number {
  const indices = side === 'left' ? [0, 3] : [1, 2];
  return indices.reduce((sum, index) => sum + points[index]![1]!, 0) / indices.length;
}

function boxSize(object: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

describe('SlimeOccupiedShell', () => {
  it('returns a non-empty deterministic group with host shell, ruinate metadata, and multiple overlay module classes', () => {
    const dna = makeTerracedDna(4242);
    const blueprint = makeTerracedBlueprint();

    const first = buildSlimeOccupiedShell(dna, blueprint);
    const second = buildSlimeOccupiedShell(dna, blueprint);

    expect(first).toBeInstanceOf(THREE.Group);
    expect(first.children.length).toBeGreaterThan(0);
    expect(collectMeshes(first).length).toBeGreaterThan(0);
    expect(requireObject(first, 'slime-host-shell')).toBeTruthy();
    expect(first.userData.ruinate).toBeTruthy();
    expect(first.userData.ruinate.damageIntensity).toBeGreaterThan(0);

    const distinctModuleTypes = new Set(collectModuleGroups(first).map(module => module.userData.moduleType));
    expect(distinctModuleTypes.size).toBeGreaterThanOrEqual(3);

    expect(namedSignature(first)).toEqual(namedSignature(second));
  });

  it('uses a light ruin pass at half the true abandoned-ruin reference intensity by default', () => {
    const dna = makeTerracedDna(101);
    const blueprint = makeTerracedBlueprint();
    delete (blueprint as Partial<SlimeKindBlueprint>).ruinIntensity;

    const composed = buildSlimeOccupiedShell(dna, blueprint);

    expect(composed.userData.ruinate.damageIntensity).toBeCloseTo(
      TRUE_ABANDONED_RUIN_DAMAGE_INTENSITY / 2,
      6,
    );
    expect(composed.userData.ruinate.damageIntensity).toBeLessThan(TRUE_ABANDONED_RUIN_DAMAGE_INTENSITY);
  });

  it('reuses one rolled hue selection and one material set across all slime accretion modules', () => {
    const terracedDna = makeTerracedDna(55);
    const terraced = buildSlimeOccupiedShell(terracedDna, makeTerracedBlueprint());
    expect(terraced.userData.hueFamilies).toEqual([rollSlimeHueFamily(terracedDna.seed)]);
    expectModuleMaterialsToReuseOneSet(terraced);

    const chapelDna = makeChapelDna(77);
    const chapel = buildSlimeOccupiedShell(chapelDna, makeChapelBlueprint());
    expect(chapel.userData.hueFamilies).toEqual(rollElderHueBlend(chapelDna.seed));
    expectModuleMaterialsToReuseOneSet(chapel);
  });

  it('uses gel-lens-infill and contained-gel-vat module weights as real blueprint controls', () => {
    const dna = makeChapelDna(818);
    const blueprint = makeChapelBlueprint({
      moduleWeights: {
        'gel-lip-course': 0,
        'membrane-sheet': 0,
        'tendril-bridge': 0,
        'faceted-drip-run': 0,
        'gel-lens-infill': 0.85,
        'puddle-skirt-tiles': 0,
        'contained-gel-vat': 0.75,
      },
      propWeights: {
        rubble: 0,
        'contained-gel-vat': 0,
      },
    });

    const composed = buildSlimeOccupiedShell(dna, blueprint);
    const moduleTypes = moduleTypesOf(composed);

    expect(moduleTypes.has('gel-lens-infill')).toBe(true);
    expect(moduleTypes.has('contained-gel-vat')).toBe(true);
  });

  it('backfills sparse blueprints so even opaque reused shells still expose at least three module classes', () => {
    const dna = makeChapelDna(919);
    const blueprint = makeChapelBlueprint({
      moduleWeights: {
        'gel-lip-course': 0,
        'membrane-sheet': 0,
        'tendril-bridge': 0,
        'faceted-drip-run': 0,
        'gel-lens-infill': 0,
        'puddle-skirt-tiles': 0,
        'contained-gel-vat': 0,
      },
      propWeights: {
        rubble: 0,
        'contained-gel-vat': 0,
      },
    });

    const composed = buildSlimeOccupiedShell(dna, blueprint);
    expect(moduleTypesOf(composed).size).toBeGreaterThanOrEqual(3);
  });

  it('keeps reused opaque host shells intact while generic shells really lose host blocks under non-trivial ruin', () => {
    const genericDna = makeTerracedDna(314159);
    const genericDescriptor = pickSlimeHostShell(genericDna.buildingKind, genericDna.seed);
    const genericBaseHost = genericDescriptor.build(genericDna);
    const genericComposed = buildSlimeOccupiedShell(genericDna, makeTerracedBlueprint({ ruinIntensity: 0.32 }));
    const genericHost = requireObject<THREE.Group>(genericComposed, 'slime-host-shell');
    const genericRuinatedHost = requireObject<THREE.Group>(genericHost, genericDescriptor.shellId);

    expect(genericComposed.userData.ruinate.mode).toBe('destructive-generic-shell');
    expect(genericComposed.userData.ruinate.removedRealBlocksCount).toBeGreaterThan(0);
    expect(genericRuinatedHost.userData.wallGridCellCount).toBeLessThan(genericBaseHost.userData.wallGridCellCount);
    expect(genericRuinatedHost.userData.shellGridCellCount).toBeLessThan(genericBaseHost.userData.shellGridCellCount);

    const reusedDna = makeChapelDna(909);
    const reusedBaseHost = pickSlimeHostShell(reusedDna.buildingKind, reusedDna.seed).build(reusedDna);
    const reusedComposed = buildSlimeOccupiedShell(reusedDna, makeChapelBlueprint());
    const reusedHost = requireObject<THREE.Group>(reusedComposed, 'slime-host-shell');

    expect(reusedComposed.userData.ruinate.mode).toBe('synthetic-overlay-only');
    expect(reusedComposed.userData.ruinate.removedRealBlocksCount).toBe(0);
    expect(reusedComposed.userData.ruinate.removedBlockIds.length).toBeGreaterThan(0);
    expect(countVertices(reusedHost)).toBe(countVertices(reusedBaseHost));
    expect(boxSize(reusedHost).toArray()).toEqual(boxSize(reusedBaseHost).toArray());
  });

  it('builds mimic fillets inside the required band, larger than the host chamfer, while leaving host courses unsmoothed', () => {
    const dna = makeChapelDna(303);
    const baseHost = pickSlimeHostShell(dna.buildingKind, dna.seed).build(dna);
    const composed = buildSlimeOccupiedShell(dna, makeChapelBlueprint());
    const host = requireObject<THREE.Group>(composed, 'slime-host-shell');
    const filletLayer = requireObject<THREE.Group>(composed, 'mimic-fillet-layer');
    const filletMeshes = collectMeshes(filletLayer);

    expect(filletMeshes.length).toBeGreaterThan(0);
    for (const mesh of filletMeshes) {
      expect(mesh.userData.filletRadius).toBeGreaterThanOrEqual(MIMIC_FILLET_RADIUS_MIN);
      expect(mesh.userData.filletRadius).toBeLessThanOrEqual(MIMIC_FILLET_RADIUS_MAX);
      expect(mesh.userData.filletRadius).toBeGreaterThan(HOST_BLOCK_KIT_CHAMFER_RADIUS);
    }

    expect(countVertices(host)).toBe(countVertices(baseHost));
  });

  it('sags one mirrored roof/eave edge by the required amount and keeps 1-3 mandatory drip runs even when ruin intensity changes', () => {
    const dna = makeTerracedDna(612);
    const light = buildSlimeOccupiedShell(dna, makeTerracedBlueprint({ ruinIntensity: 0.05 }));
    const heavy = buildSlimeOccupiedShell(dna, makeTerracedBlueprint({ ruinIntensity: 0.34 }));

    const lightRoof = requireObject<THREE.Group>(light, 'mimic-roof-sag-overlay');
    const heavyRoof = requireObject<THREE.Group>(heavy, 'mimic-roof-sag-overlay');
    const lightPoints = lightRoof.userData.socketPoints as number[][];
    const heavyPoints = heavyRoof.userData.socketPoints as number[][];
    const lightSagAmount = Math.abs(averageEdgeY(lightPoints, 'left') - averageEdgeY(lightPoints, 'right'));
    const heavySagAmount = Math.abs(averageEdgeY(heavyPoints, 'left') - averageEdgeY(heavyPoints, 'right'));

    expect(lightSagAmount).toBeGreaterThanOrEqual(MIMIC_RIDGE_SAG_MIN);
    expect(lightSagAmount).toBeLessThanOrEqual(MIMIC_RIDGE_SAG_MAX);
    expect(heavySagAmount).toBeGreaterThanOrEqual(MIMIC_RIDGE_SAG_MIN);
    expect(heavySagAmount).toBeLessThanOrEqual(MIMIC_RIDGE_SAG_MAX);
    expect(lightSagAmount).toBeCloseTo(heavySagAmount, 6);

    const lightDrips = collectMandatoryDrips(light);
    const heavyDrips = collectMandatoryDrips(heavy);
    expect(lightDrips.length).toBeGreaterThanOrEqual(1);
    expect(lightDrips.length).toBeLessThanOrEqual(3);
    expect(heavyDrips.length).toBeGreaterThanOrEqual(1);
    expect(heavyDrips.length).toBeLessThanOrEqual(3);
    expect(heavyDrips.length).toBe(lightDrips.length);
  });

  it('stays within a finite footprint-sized box plus a modest slime skirt allowance', () => {
    const dna = makeTerracedDna(1010);
    const blueprint = makeTerracedBlueprint();
    const group = buildSlimeOccupiedShell(dna, blueprint);
    const box = new THREE.Box3().setFromObject(group);
    const hostBox = new THREE.Box3().setFromObject(requireObject(group, 'slime-host-shell'));
    const size = box.getSize(new THREE.Vector3());
    const allowedSkirt = blueprint.footprint.skirtAllowance ?? 0.35;
    expect(group.userData.hostBounds).toEqual({
      min: hostBox.min.toArray(),
      max: hostBox.max.toArray(),
    });

    expect([
      box.min.x, box.min.y, box.min.z,
      box.max.x, box.max.y, box.max.z,
      size.x, size.y, size.z,
    ].every(Number.isFinite)).toBe(true);

    expect(size.x).toBeLessThanOrEqual(blueprint.footprint.width + (allowedSkirt * 2) + 0.5);
    expect(size.z).toBeLessThanOrEqual(blueprint.footprint.depth + (allowedSkirt * 2) + 0.5);
    expect(size.y).toBeGreaterThan(FLOOR_HEIGHT);
  });
});
