import * as THREE from 'three';

/**
 * Railing.ts — shared iron railing/gate module (doctrine Tier 3; undead's
 * cemetery-plot fencing per `2026-09-04-undead-buildings-design.md`'s lot
 * dressing: low iron rails ring monument plots, sometimes with a gate). A
 * rail section is posts + top/bottom rails + pickets (five-piece minimum
 * analogue: this reads as real 3D ironwork, never a flat lattice texture).
 */

export interface RailSectionOptions {
  length: number;
  height?: number;
  postThickness?: number;
  picketThickness?: number;
  /** Minimum picket count enforced regardless of length (doctrine: never fewer than 5). Default 5. */
  minPickets?: number;
  picketSpacing?: number;
  material: THREE.Material;
  finialMaterial?: THREE.Material;
  /** Adds ball finials atop each post. Default true. */
  finials?: boolean;
  /** Fraction (0-1) of pickets to omit at seeded random positions, for ruined rails. Default 0. */
  brokenFraction?: number;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPost(height: number, thickness: number, material: THREE.Material, finials: boolean, finialMaterial: THREE.Material, name: string): THREE.Group {
  const post = new THREE.Group();
  post.name = name;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, thickness), material);
  shaft.name = 'post-shaft';
  shaft.position.y = height / 2;
  shaft.castShadow = shaft.receiveShadow = true;
  post.add(shaft);
  if (finials) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(thickness * 1.3, 8, 6), finialMaterial);
    finial.name = 'post-finial';
    finial.position.y = height + thickness * 1.1;
    finial.castShadow = finial.receiveShadow = true;
    post.add(finial);
  }
  return post;
}

export function buildRailSection(options: RailSectionOptions): THREE.Group {
  const length = Math.max(options.length, 0.1);
  const height = options.height ?? 0.6;
  const postThickness = options.postThickness ?? 0.05;
  const picketThickness = options.picketThickness ?? 0.02;
  const minPickets = options.minPickets ?? 5;
  const spacing = options.picketSpacing ?? 0.14;
  const material = options.material;
  const finialMaterial = options.finialMaterial ?? material;
  const finials = options.finials ?? true;
  const brokenFraction = options.brokenFraction ?? 0;
  const seed = options.seed ?? 0;
  const rand = mulberry32(seed);

  const group = new THREE.Group();
  group.name = 'rail-section';

  const halfL = length / 2;
  const postA = buildPost(height, postThickness, material, finials, finialMaterial, 'post-a');
  postA.position.x = -halfL;
  const postB = buildPost(height, postThickness, material, finials, finialMaterial, 'post-b');
  postB.position.x = halfL;
  group.add(postA, postB);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(length, postThickness * 0.7, postThickness * 0.7), material);
  topRail.name = 'top-rail';
  topRail.position.y = height * 0.92;
  topRail.castShadow = topRail.receiveShadow = true;
  const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(length, postThickness * 0.7, postThickness * 0.7), material);
  bottomRail.name = 'bottom-rail';
  bottomRail.position.y = height * 0.12;
  bottomRail.castShadow = bottomRail.receiveShadow = true;
  group.add(topRail, bottomRail);

  const picketCount = Math.max(minPickets, Math.round(length / spacing) - 1);
  const picketSpan = (length - postThickness) / (picketCount + 1);
  for (let i = 0; i < picketCount; i++) {
    if (rand() < brokenFraction) {
      // A broken picket is genuinely omitted, not hidden — leaves a real
      // gap in the rail line, matching the frieze/opening "missing
      // segment" convention used across the undead ruin vocabulary.
      continue;
    }
    const picket = new THREE.Mesh(new THREE.BoxGeometry(picketThickness, height * 0.82, picketThickness), material);
    picket.name = `picket-${i}`;
    picket.position.set(-halfL + (i + 1) * picketSpan, height * 0.5, 0);
    picket.castShadow = picket.receiveShadow = true;
    group.add(picket);
  }

  return group;
}

export interface RailGateOptions {
  width: number;
  height?: number;
  material: THREE.Material;
  finialMaterial?: THREE.Material;
  /** Gate leaves swung open by this many radians (0 = closed). Default 0. */
  openAngle?: number;
}

export function buildRailGate(options: RailGateOptions): THREE.Group {
  const width = Math.max(options.width, 0.2);
  const height = options.height ?? 0.7;
  const material = options.material;
  const finialMaterial = options.finialMaterial ?? material;
  const openAngle = options.openAngle ?? 0;
  const postThickness = 0.06;

  const group = new THREE.Group();
  group.name = 'rail-gate';

  const hingePostL = buildPost(height, postThickness, material, true, finialMaterial, 'hinge-post-left');
  hingePostL.position.x = -width / 2;
  const hingePostR = buildPost(height, postThickness, material, true, finialMaterial, 'hinge-post-right');
  hingePostR.position.x = width / 2;
  group.add(hingePostL, hingePostR);

  const leafWidth = width / 2 - postThickness;
  const leafLeft = buildRailSection({
    length: leafWidth,
    height: height * 0.85,
    material,
    finialMaterial,
    finials: false,
    minPickets: 3,
  });
  leafLeft.name = 'gate-leaf-left';
  leafLeft.position.x = -width / 2 + postThickness / 2;
  leafLeft.rotation.y = openAngle;

  const leafRight = buildRailSection({
    length: leafWidth,
    height: height * 0.85,
    material,
    finialMaterial,
    finials: false,
    minPickets: 3,
  });
  leafRight.name = 'gate-leaf-right';
  leafRight.position.x = width / 2 - postThickness / 2;
  leafRight.rotation.y = -openAngle;

  group.add(leafLeft, leafRight);
  return group;
}
