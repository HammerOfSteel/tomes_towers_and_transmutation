import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { depthFor } from '@/world/buildings/kit/DepthLadder';
import type { BuildingDNA, BuildingSize } from '@/world/buildings/BuildingDNA';
import { FLOOR_HEIGHT, factionBuildingDna } from '@/world/buildings/BuildingDNA';
import { pickSlimeHostShell, type SlimeHostShellKind } from '@/world/buildings/slime/SlimeHostShells';
import { buildSlimeInn, buildSlimeShop } from '@/world/buildings/slime/SlimeBuildingKit';

const SIZE_BY_KIND: Record<'shop' | 'inn', BuildingSize> = {
  shop: 'small',
  inn: 'large',
};

const FLOORS_BY_KIND: Record<'shop' | 'inn', 1 | 2> = {
  shop: 1,
  inn: 2,
};

function makeDna(kind: 'shop' | 'inn', seed: number): BuildingDNA {
  return factionBuildingDna(kind, 'slime', seed, SIZE_BY_KIND[kind], FLOORS_BY_KIND[kind]);
}

function findSeed(
  kind: SlimeHostShellKind,
  predicate: (shell: ReturnType<typeof pickSlimeHostShell>) => boolean,
): number {
  for (let seed = 1; seed < 2048; seed++) {
    const shell = pickSlimeHostShell(kind, seed);
    if (predicate(shell)) return seed;
  }
  throw new Error(`No seed found for ${kind}`);
}

function findShopVariantSeed(predicate: (group: THREE.Group) => boolean): number {
  for (let seed = 1; seed < 4096; seed++) {
    const group = buildSlimeShop(makeDna('shop', seed));
    if (predicate(group)) return seed;
  }
  throw new Error('No shop variant seed found');
}

function findInnVariantSeed(predicate: (group: THREE.Group) => boolean): number {
  for (let seed = 1; seed < 4096; seed++) {
    const group = buildSlimeInn(makeDna('inn', seed));
    if (predicate(group)) return seed;
  }
  throw new Error('No inn variant seed found');
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function hasOnlyFinitePositions(root: THREE.Object3D): boolean {
  return collectMeshes(root).every(mesh => {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count * 3; index++) {
      if (!Number.isFinite(position.array[index])) return false;
    }
    return true;
  });
}

function requireGroup<T extends THREE.Object3D = THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  expect(object, `${name} should exist`).toBeTruthy();
  return object as T;
}

function collectGroups(root: THREE.Object3D, predicate: (group: THREE.Group) => boolean): THREE.Group[] {
  const groups: THREE.Group[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Group && predicate(object)) groups.push(object);
  });
  return groups;
}

function largestSphereLikeVolumeRatio(root: THREE.Object3D): number {
  const totalBox = new THREE.Box3().setFromObject(root);
  const totalSize = totalBox.getSize(new THREE.Vector3());
  const totalVolume = Math.max(totalSize.x * totalSize.y * totalSize.z, 1e-6);

  let ratio = 0;
  for (const mesh of collectMeshes(root)) {
    if (!['SphereGeometry', 'IcosahedronGeometry'].includes(mesh.geometry.type)) continue;
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    const volume = size.x * size.y * size.z;
    ratio = Math.max(ratio, volume / totalVolume);
  }
  return ratio;
}

function localBounds(root: THREE.Object3D, target: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  let found = false;
  target.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const relative = rootInverse.clone().multiply(object.matrixWorld);
    const meshBox = object.geometry.boundingBox!.clone().applyMatrix4(relative);
    if (!found) {
      box.copy(meshBox);
      found = true;
    } else {
      box.union(meshBox);
    }
  });
  if (!found) throw new Error(`No meshes found under ${target.name}`);
  return box;
}

const SHOP_SEED = 33;
const SHOP_BROKEN_SHINGLE_SEED = findShopVariantSeed(group => group.userData.kindVariation?.canopy === 'broken-shingle-roof');
const SHOP_BOOKS_SEED = findShopVariantSeed(group => group.userData.kindVariation?.goodsTheme === 'books-scrolls');
const SHOP_FOOD_SEED = findShopVariantSeed(group => group.userData.kindVariation?.goodsTheme === 'food-mushrooms');
const SHOP_SALVAGE_SIGN_SEED = findShopVariantSeed(group => group.userData.kindVariation?.canopy === 'heavy-sign-repair-flap');
const INN_SEED = findSeed('inn', shell => shell.isGenericShell);
const INN_GENERIC_TAVERN_LEFT_VARIANT_SEED = 8;
const INN_TAVERN_REUSED_DOOR_SEED = 9;
const INN_NON_SERVICEABLE_HOST_SEED = findSeed('inn', shell => shell.shellId !== 'generic-tavern-shell');
const INN_BROKEN_BALCONY_SEED = findInnVariantSeed(group => group.userData.kindVariation?.frontSpecial === 'broken-balcony');
const INN_PORCH_TROUGH_SEED = findInnVariantSeed(group => group.userData.kindVariation?.frontSpecial === 'porch-trough');
const INN_SIDE_STABLE_ARCH_SEED = findInnVariantSeed(group => group.userData.kindVariation?.frontSpecial === 'side-stable-arch');
const INN_HANGING_SIGN_SEED = findInnVariantSeed(group => group.userData.kindVariation?.frontSpecial === 'hanging-sign');
const INN_NO_VENT_SEED = findInnVariantSeed(group => group.userData.kindVariation?.ventState === 'none');
const INN_ROOF_CORNER_SEED = findInnVariantSeed(group => group.userData.kindVariation?.damageState === 'roof-corner-missing');
const INN_SIDE_BREACH_SEED = findInnVariantSeed(group => group.userData.kindVariation?.damageState === 'side-wall-breach');
const INN_UPPER_COLLAPSE_SEED = findInnVariantSeed(group => group.userData.kindVariation?.damageState === 'upper-balcony-collapse');

describe('SlimeCommerce', () => {
  it('builds shops with an open framed counter bay, goods props, and a membrane awning frame', () => {
    const shop = buildSlimeShop(makeDna('shop', SHOP_SEED));

    expect(shop).toBeInstanceOf(THREE.Group);
    expect(shop.children.length).toBeGreaterThan(0);
    expect(collectMeshes(shop).length).toBeGreaterThan(0);
    expect(hasOnlyFinitePositions(shop)).toBe(true);

    const counterBay = requireGroup(shop, 'shop-counter-bay');
    expect(counterBay.getObjectByName('counter-post-left')).toBeTruthy();
    expect(counterBay.getObjectByName('counter-post-right')).toBeTruthy();
    expect(counterBay.getObjectByName('counter-lintel')).toBeTruthy();
    expect(counterBay.getObjectByName('counter-sill')).toBeTruthy();
    expect(counterBay.getObjectByName('counter-membrane-backdrop')).toBeTruthy();
    expect(collectGroups(counterBay, group => group.name.startsWith('counter-division-')).length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(counterBay.rotation.y)).toBeGreaterThan(0.1);

    const goods = collectGroups(shop, group => group.userData.goodsProp === true);
    expect(goods.length).toBeGreaterThanOrEqual(3);
    expect(goods.length).toBeLessThanOrEqual(5);

    const awningFrame = requireGroup(shop, 'shop-awning-frame');
    expect(Math.abs(awningFrame.rotation.y)).toBeGreaterThan(0.1);
    expect(requireGroup(shop, 'shop-awning-membrane')).toBeTruthy();
  });

  it('builds inns with broad frontage, a real hanging sign, upper windows, and service props', () => {
    const inn = buildSlimeInn(makeDna('inn', INN_SEED));
    const host = requireGroup(inn, 'slime-host-shell');
    const hostBox = new THREE.Box3().setFromObject(host);
    const hostSize = hostBox.getSize(new THREE.Vector3());

    expect(hostSize.x).toBeGreaterThan(hostSize.z);
    expect(hostSize.x).toBeGreaterThan(5.5);

    const sign = requireGroup(inn, 'inn-hanging-sign');
    expect(sign.getObjectByName('inn-sign-bracket')).toBeTruthy();
    expect(sign.getObjectByName('inn-sign-plaque')).toBeTruthy();
    if (inn.userData.kindVariation.ventState !== 'none') {
      expect(requireGroup(inn, 'inn-roof-vent')).toBeTruthy();
    }

    const upperWindows = collectGroups(host, group => group.name.startsWith('window-opening-')).filter(window => {
      const box = new THREE.Box3().setFromObject(window);
      return box.min.y >= FLOOR_HEIGHT;
    });
    expect(upperWindows.length).toBeGreaterThanOrEqual(3);

    const servicePropNames = ['inn-service-vat', 'slime-contained-vat', 'inn-porch-channel'];
    const visibleServiceProps = servicePropNames.filter(name => inn.getObjectByName(name));
    expect(visibleServiceProps.length).toBeGreaterThanOrEqual(1);
    expect(requireGroup(inn, 'inn-service-arch')).toBeTruthy();
  });

  it('anchors inn service props to the actual side-service bay and keeps them above ground', () => {
    const inn = buildSlimeInn(makeDna('inn', INN_GENERIC_TAVERN_LEFT_VARIANT_SEED));
    const host = requireGroup(inn, 'slime-host-shell');
    const hostBounds = new THREE.Box3().setFromObject(host);
    const serviceArch = requireGroup(inn, 'inn-service-arch');
    const serviceVat = requireGroup(inn, 'inn-service-vat');
    const channel = requireGroup(inn, 'inn-porch-channel');

    const serviceArchBox = new THREE.Box3().setFromObject(serviceArch);
    expect(serviceArchBox.min.x).toBeGreaterThan(hostBounds.max.x - 0.45);

    for (const [name, object] of [
      ['inn-service-arch', serviceArch],
      ['inn-service-vat', serviceVat],
      ['inn-porch-channel', channel],
    ] as const) {
      const box = new THREE.Box3().setFromObject(object);
      expect(box.min.y, `${name} should not sink below ground`).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it('reuses a real inn side opening even when the initial host-shell roll lacks one', () => {
    const inn = buildSlimeInn(makeDna('inn', INN_NON_SERVICEABLE_HOST_SEED));
    const host = requireGroup(inn, 'slime-host-shell');
    const hostBounds = new THREE.Box3().setFromObject(host);
    const serviceArch = requireGroup(inn, 'inn-service-arch');
    const serviceArchBox = new THREE.Box3().setFromObject(serviceArch);

    expect(pickSlimeHostShell('inn', INN_NON_SERVICEABLE_HOST_SEED).shellId).not.toBe('generic-tavern-shell');
    expect(serviceArch.userData.reusesHostOpening).toBe(false);
    expect(serviceArch.userData.serviceFace).toBe(inn.userData.kindVariation.stableSide);
    expect(serviceArchBox.min.y).toBeGreaterThanOrEqual(-0.001);
    if (serviceArch.userData.serviceFace === 'right') {
      expect(serviceArchBox.min.x).toBeGreaterThan(hostBounds.max.x - 0.45);
    } else {
      expect(serviceArchBox.max.x).toBeLessThan(hostBounds.min.x + 0.45);
    }
  });

  it('varies shop goods props beyond jars and vials, and emits a heavy sign for repair-flap canopies', () => {
    const booksShop = buildSlimeShop(makeDna('shop', SHOP_BOOKS_SEED));
    expect(booksShop.userData.kindVariation.goodsTheme).toBe('books-scrolls');
    expect(booksShop.getObjectByName('goods-book-0') || booksShop.getObjectByName('goods-scroll-0')).toBeTruthy();

    const foodShop = buildSlimeShop(makeDna('shop', SHOP_FOOD_SEED));
    expect(foodShop.userData.kindVariation.goodsTheme).toBe('food-mushrooms');
    expect(foodShop.getObjectByName('goods-basket-0') || foodShop.getObjectByName('goods-mushroom-0')).toBeTruthy();

    const salvageShop = buildSlimeShop(makeDna('shop', SHOP_SALVAGE_SIGN_SEED));
    expect(salvageShop.userData.kindVariation.canopy).toBe('heavy-sign-repair-flap');
    expect(requireGroup(salvageShop, 'shop-heavy-sign')).toBeTruthy();
    expect(salvageShop.getObjectByName('shop-awning-frame')).toBeFalsy();
    expect(salvageShop.getObjectByName('shop-awning-membrane')).toBeFalsy();
  });

  it('uses a distinct broken-shingle frontage when the shop canopy roll calls for it', () => {
    const shingleShop = buildSlimeShop(makeDna('shop', SHOP_BROKEN_SHINGLE_SEED));
    expect(shingleShop.userData.kindVariation.canopy).toBe('broken-shingle-roof');
    expect(requireGroup(shingleShop, 'shop-broken-shingle-canopy')).toBeTruthy();
    expect(shingleShop.getObjectByName('shop-awning-membrane')).toBeFalsy();
  });

  it('suppresses generic front-lip and front-lens overlays when the shop reorients its frontage', () => {
    const shop = buildSlimeShop(makeDna('shop', SHOP_SEED));
    expect(shop.getObjectByName('facade-opening-lip-0')).toBeFalsy();
    expect(shop.getObjectByName('facade-gel-lens-0')).toBeFalsy();
  });

  it('decorates reusable inn side doors in place instead of adding a second full opening shell', () => {
    const inn = buildSlimeInn(makeDna('inn', INN_TAVERN_REUSED_DOOR_SEED));
    const serviceArch = requireGroup(inn, 'inn-service-arch');

    expect(pickSlimeHostShell('inn', INN_TAVERN_REUSED_DOOR_SEED).shellId).toBe('generic-tavern-shell');
    expect(serviceArch.userData.reusesHostOpening).toBe(true);
    expect(serviceArch.getObjectByName('recess')).toBeFalsy();
    expect(serviceArch.getObjectByName('inn-service-threshold')).toBeTruthy();
    expect(serviceArch.getObjectByName('inn-service-guide-left')).toBeTruthy();
    expect(serviceArch.getObjectByName('inn-service-guide-right')).toBeTruthy();
  });

  it('adds a broken balcony remnant when the inn front-special roll asks for one', () => {
    const inn = buildSlimeInn(makeDna('inn', INN_BROKEN_BALCONY_SEED));
    expect(inn.userData.kindVariation.frontSpecial).toBe('broken-balcony');
    expect(requireGroup(inn, 'inn-broken-balcony-remnant')).toBeTruthy();
  });

  it('gives inn frontage-special rolls their own visible emphasis geometry', () => {
    const hangingInn = buildSlimeInn(makeDna('inn', INN_HANGING_SIGN_SEED));
    expect(hangingInn.userData.kindVariation.frontSpecial).toBe('hanging-sign');
    expect(requireGroup(hangingInn, 'inn-sign-crown')).toBeTruthy();

    const troughInn = buildSlimeInn(makeDna('inn', INN_PORCH_TROUGH_SEED));
    expect(troughInn.userData.kindVariation.frontSpecial).toBe('porch-trough');
    expect(requireGroup(troughInn, 'inn-porch-trough-endcap-left')).toBeTruthy();
    expect(requireGroup(troughInn, 'inn-porch-trough-endcap-right')).toBeTruthy();

    const stableInn = buildSlimeInn(makeDna('inn', INN_SIDE_STABLE_ARCH_SEED));
    expect(stableInn.userData.kindVariation.frontSpecial).toBe('side-stable-arch');
    expect(requireGroup(stableInn, 'inn-service-canopy')).toBeTruthy();
  });

  it('omits roof-vent geometry when the inn variation rolls no vent stack', () => {
    const inn = buildSlimeInn(makeDna('inn', INN_NO_VENT_SEED));
    expect(inn.userData.kindVariation.ventState).toBe('none');
    expect(inn.getObjectByName('inn-roof-vent')).toBeFalsy();
  });

  it('realizes inn damage-state rolls with explicit exterior damage geometry', () => {
    const roofCornerInn = buildSlimeInn(makeDna('inn', INN_ROOF_CORNER_SEED));
    expect(roofCornerInn.userData.kindVariation.damageState).toBe('roof-corner-missing');
    expect(requireGroup(roofCornerInn, 'inn-roof-corner-collapse')).toBeTruthy();

    const sideBreachInn = buildSlimeInn(makeDna('inn', INN_SIDE_BREACH_SEED));
    expect(sideBreachInn.userData.kindVariation.damageState).toBe('side-wall-breach');
    expect(requireGroup(sideBreachInn, 'inn-side-breach-patch')).toBeTruthy();

    const upperCollapseInn = buildSlimeInn(makeDna('inn', INN_UPPER_COLLAPSE_SEED));
    expect(upperCollapseInn.userData.kindVariation.damageState).toBe('upper-balcony-collapse');
    expect(requireGroup(upperCollapseInn, 'inn-upper-collapse-scar')).toBeTruthy();
  });

  it('keeps representative commerce details on the depth ladder', () => {
    const shop = buildSlimeShop(makeDna('shop', SHOP_SEED));
    const counterBay = requireGroup<THREE.Group>(shop, 'shop-counter-bay');
    const counterPost = requireGroup(counterBay, 'counter-post-left');
    const counterLintel = requireGroup(counterBay, 'counter-lintel');
    const counterSill = requireGroup(counterBay, 'counter-sill');
    const counterBackdrop = requireGroup(counterBay, 'counter-membrane-backdrop');

    expect(localBounds(counterBay, counterPost).max.z).toBeCloseTo(depthFor('PILASTER'), 1);
    expect(localBounds(counterBay, counterLintel).max.z).toBeCloseTo(depthFor('PILASTER'), 1);
    expect(localBounds(counterBay, counterSill).max.z).toBeCloseTo(depthFor('TRIM'), 1);
    expect(localBounds(counterBay, counterBackdrop).max.z).toBeLessThanOrEqual(depthFor('GLAZING') + 0.05);

    const inn = buildSlimeInn(makeDna('inn', INN_TAVERN_REUSED_DOOR_SEED));
    const serviceArch = requireGroup<THREE.Group>(inn, 'inn-service-arch');
    const serviceThreshold = requireGroup(serviceArch, 'inn-service-threshold');
    const serviceGuide = requireGroup(serviceArch, 'inn-service-guide-left');
    expect(localBounds(serviceArch, serviceThreshold).max.z).toBeCloseTo(depthFor('TRIM'), 1);
    expect(localBounds(serviceArch, serviceGuide).max.z).toBeCloseTo(depthFor('PILASTER'), 1);
  });

  it('does not use a dominant sphere or icosahedron mesh as the main massing', () => {
    const shop = buildSlimeShop(makeDna('shop', SHOP_SEED));
    const inn = buildSlimeInn(makeDna('inn', INN_SEED));

    expect(largestSphereLikeVolumeRatio(shop)).toBeLessThan(0.1);
    expect(largestSphereLikeVolumeRatio(inn)).toBeLessThan(0.1);
  });
});
