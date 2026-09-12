import * as THREE from 'three';

/**
 * MonumentKit.ts — shared funerary monument module (doctrine Tier 3; the
 * primary lot-dressing vocabulary for undead per
 * `2026-09-04-undead-buildings-design.md`: grave markers, obelisks, urns,
 * sarcophagi, and table-tombs scattered around necropolis lots and used as
 * the watchtower's "crumbling tower" apex references). Every variant has a
 * plinth (base), body, and cap as distinct real volumes — never a single
 * extruded silhouette — so weathering/breakage reads as genuine geometry
 * loss rather than a texture swap.
 */

export type MonumentVariant =
  | 'arched-slab'
  | 'gabled-slab'
  | 'cross'
  | 'obelisk'
  | 'urn'
  | 'sarcophagus'
  | 'table-tomb'
  | 'broken-marker';

export interface MonumentOptions {
  variant: MonumentVariant;
  /** Overall monument height (plinth to cap). Default varies by variant. */
  height?: number;
  /** Overall width/footprint scale. Default varies by variant. */
  width?: number;
  material: THREE.Material;
  plinthMaterial?: THREE.Material;
  /** Adds a small skull-boss relief on the body face. Default false. */
  skullBoss?: boolean;
  bossMaterial?: THREE.Material;
  seed?: number;
}

const DEFAULT_DIMENSIONS: Record<MonumentVariant, { height: number; width: number }> = {
  'arched-slab': { height: 0.9, width: 0.5 },
  'gabled-slab': { height: 0.85, width: 0.5 },
  cross: { height: 1.1, width: 0.6 },
  obelisk: { height: 1.6, width: 0.35 },
  urn: { height: 0.55, width: 0.32 },
  sarcophagus: { height: 0.65, width: 1.4 },
  'table-tomb': { height: 0.55, width: 1.6 },
  'broken-marker': { height: 0.5, width: 0.45 },
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPlinth(width: number, depth: number, material: THREE.Material): THREE.Mesh {
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width, width * 0.16, depth), material);
  plinth.name = 'monument-plinth';
  plinth.position.y = width * 0.08;
  plinth.castShadow = plinth.receiveShadow = true;
  return plinth;
}

function addSkullBoss(group: THREE.Group, atY: number, atZ: number, size: number, material: THREE.Material): void {
  const boss = new THREE.Group();
  boss.name = 'skull-boss';
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 8, 6), material);
  cranium.name = 'boss-cranium';
  cranium.position.set(0, atY, atZ);
  cranium.castShadow = cranium.receiveShadow = true;
  boss.add(cranium);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(size * 0.55, size * 0.22, size * 0.35), material);
  jaw.name = 'boss-jaw';
  jaw.position.set(0, atY - size * 0.42, atZ);
  jaw.castShadow = jaw.receiveShadow = true;
  boss.add(jaw);
  group.add(boss);
}

export function buildMonument(options: MonumentOptions): THREE.Group {
  const dims = DEFAULT_DIMENSIONS[options.variant];
  const height = options.height ?? dims.height;
  const width = options.width ?? dims.width;
  const material = options.material;
  const plinthMaterial = options.plinthMaterial ?? material;
  const seed = options.seed ?? 0;
  const rand = mulberry32(seed);

  const group = new THREE.Group();
  group.name = `monument-${options.variant}`;
  group.userData.monumentVariant = options.variant;

  const plinthDepth = width * 0.6;
  const plinth = buildPlinth(width, plinthDepth, plinthMaterial);
  group.add(plinth);
  const plinthHeight = width * 0.16;
  const bodyBaseY = plinthHeight;

  switch (options.variant) {
    case 'arched-slab':
    case 'gabled-slab': {
      const bodyDepth = width * 0.18;
      const bodyHeight = height * 0.75;
      const body = new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, bodyHeight, bodyDepth), material);
      body.name = 'monument-body';
      body.position.y = bodyBaseY + bodyHeight / 2;
      body.castShadow = body.receiveShadow = true;
      group.add(body);

      const capHeight = height - bodyHeight - plinthHeight;
      if (options.variant === 'arched-slab') {
        const capShape = new THREE.Shape();
        const halfW = (width * 0.85) / 2;
        capShape.moveTo(-halfW, 0);
        capShape.absarc(0, 0, halfW, Math.PI, 0, true);
        capShape.lineTo(halfW, 0);
        capShape.closePath();
        const capGeom = new THREE.ExtrudeGeometry(capShape, { depth: bodyDepth, bevelEnabled: false, curveSegments: 10 });
        const cap = new THREE.Mesh(capGeom, material);
        cap.name = 'monument-cap';
        cap.position.set(0, bodyBaseY + bodyHeight, -bodyDepth / 2);
        cap.castShadow = cap.receiveShadow = true;
        group.add(cap);
      } else {
        const cap = new THREE.Mesh(new THREE.ConeGeometry((width * 0.85) / 1.5, capHeight, 3), material);
        cap.name = 'monument-cap';
        cap.rotation.y = Math.PI / 4;
        cap.rotation.x = Math.PI;
        cap.position.set(0, bodyBaseY + bodyHeight + capHeight / 2, 0);
        cap.castShadow = cap.receiveShadow = true;
        group.add(cap);
      }

      if (options.skullBoss) {
        addSkullBoss(group, bodyBaseY + bodyHeight * 0.55, bodyDepth / 2 + 0.02, width * 0.3, options.bossMaterial ?? material);
      }
      break;
    }
    case 'cross': {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(width * 0.2, height * 0.78, width * 0.2), material);
      upright.name = 'monument-body';
      upright.position.y = bodyBaseY + (height * 0.78) / 2;
      upright.castShadow = upright.receiveShadow = true;
      group.add(upright);

      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(width, width * 0.2, width * 0.2), material);
      crossbar.name = 'monument-crossbar';
      crossbar.position.y = bodyBaseY + height * 0.55;
      crossbar.castShadow = crossbar.receiveShadow = true;
      group.add(crossbar);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(width * 0.2, height * 0.14, width * 0.2), material);
      cap.name = 'monument-cap';
      cap.position.y = bodyBaseY + height * 0.78 + (height * 0.14) / 2;
      cap.castShadow = cap.receiveShadow = true;
      group.add(cap);
      break;
    }
    case 'obelisk': {
      const bodyHeight = height * 0.86;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.32, width * 0.5, bodyHeight, 4, 1), material);
      body.name = 'monument-body';
      body.rotation.y = Math.PI / 4;
      body.position.y = bodyBaseY + bodyHeight / 2;
      body.castShadow = body.receiveShadow = true;
      group.add(body);

      const capHeight = height - bodyHeight - plinthHeight;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(width * 0.32, capHeight, 4), material);
      cap.name = 'monument-cap';
      cap.rotation.y = Math.PI / 4;
      cap.position.y = bodyBaseY + bodyHeight + capHeight / 2;
      cap.castShadow = cap.receiveShadow = true;
      group.add(cap);
      break;
    }
    case 'urn': {
      const bodyHeight = height * 0.6;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.5, width * 0.32, bodyHeight, 10), material);
      body.name = 'monument-body';
      body.position.y = bodyBaseY + bodyHeight / 2;
      body.castShadow = body.receiveShadow = true;
      group.add(body);

      const neckHeight = height * 0.18;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.24, width * 0.4, neckHeight, 10), material);
      neck.name = 'monument-neck';
      neck.position.y = bodyBaseY + bodyHeight + neckHeight / 2;
      neck.castShadow = neck.receiveShadow = true;
      group.add(neck);

      const capHeight = height - bodyHeight - neckHeight - plinthHeight;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(width * 0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), material);
      cap.name = 'monument-cap';
      cap.position.y = bodyBaseY + bodyHeight + neckHeight + Math.max(capHeight, 0) * 0.3;
      cap.castShadow = cap.receiveShadow = true;
      group.add(cap);
      break;
    }
    case 'sarcophagus': {
      const bodyHeight = height * 0.7;
      const body = new THREE.Mesh(new THREE.BoxGeometry(width, bodyHeight, width * 0.5), material);
      body.name = 'monument-body';
      body.position.y = bodyBaseY + bodyHeight / 2;
      body.castShadow = body.receiveShadow = true;
      group.add(body);

      const lidHeight = height - bodyHeight - plinthHeight;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(width * 1.05, lidHeight, width * 0.56), material);
      lid.name = 'monument-cap';
      lid.position.y = bodyBaseY + bodyHeight + lidHeight / 2;
      lid.castShadow = lid.receiveShadow = true;
      group.add(lid);

      if (options.skullBoss) {
        addSkullBoss(group, bodyBaseY + bodyHeight * 0.55, width * 0.25 + 0.02, width * 0.22, options.bossMaterial ?? material);
      }
      break;
    }
    case 'table-tomb': {
      const legHeight = height * 0.55;
      const legInsetX = width * 0.42;
      const legInsetZ = width * 0.18;
      const legPositions: Array<[number, number]> = [
        [-legInsetX, -legInsetZ],
        [legInsetX, -legInsetZ],
        [-legInsetX, legInsetZ],
        [legInsetX, legInsetZ],
      ];
      legPositions.forEach(([x, z], i) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(width * 0.08, legHeight, width * 0.08), material);
        leg.name = `monument-leg-${i}`;
        leg.position.set(x, bodyBaseY + legHeight / 2, z);
        leg.castShadow = leg.receiveShadow = true;
        group.add(leg);
      });
      const lidHeight = height - legHeight - plinthHeight;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(width, lidHeight, width * 0.45), material);
      lid.name = 'monument-cap';
      lid.position.y = bodyBaseY + legHeight + lidHeight / 2;
      lid.castShadow = lid.receiveShadow = true;
      group.add(lid);
      break;
    }
    case 'broken-marker': {
      // A slab marker snapped roughly in half — the surviving stub stands,
      // the broken-off top rests, tilted, against the plinth. Real
      // fractured volumes, not a deleted mesh or a decal crack.
      const stubHeight = height * 0.42;
      const stub = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, stubHeight, width * 0.16), material);
      stub.name = 'monument-body';
      stub.position.y = bodyBaseY + stubHeight / 2;
      stub.rotation.z = (rand() - 0.5) * 0.08;
      stub.castShadow = stub.receiveShadow = true;
      group.add(stub);

      const fragmentHeight = height * 0.4;
      const fragment = new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, fragmentHeight, width * 0.16), material);
      fragment.name = 'monument-fragment';
      fragment.position.set(width * 0.32, bodyBaseY + fragmentHeight * 0.42, width * 0.22);
      fragment.rotation.z = 1.15 + (rand() - 0.5) * 0.3;
      fragment.rotation.y = (rand() - 0.5) * 0.4;
      fragment.castShadow = fragment.receiveShadow = true;
      group.add(fragment);
      break;
    }
  }

  return group;
}

/** Deterministic cumulative-weight selection over `[variant, weight]` pairs. */
export function pickMonumentVariant(rand: () => number, weights: Array<[MonumentVariant, number]>): MonumentVariant {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [variant, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return variant;
  }
  return weights[weights.length - 1]![0];
}

export const MONUMENT_VARIANTS: MonumentVariant[] = [
  'arched-slab',
  'gabled-slab',
  'cross',
  'obelisk',
  'urn',
  'sarcophagus',
  'table-tomb',
  'broken-marker',
];
