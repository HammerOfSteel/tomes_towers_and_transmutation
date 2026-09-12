import * as THREE from 'three';

/**
 * Frieze.ts — shared classical frieze/cornice-band module (doctrine Tier 3,
 * first required by undead: docs/superpowers/specs/
 * 2026-09-04-undead-buildings-design.md's reference art `CEM0035.webp`
 * shows greek-key and dentil bands running under tomb-slab caps). Every
 * variant tiles a FIXED-SIZE motif across the requested `length` (doctrine
 * Rule 4: variety by module swapping, never by stretching one motif to fit
 * an arbitrary span) — the motif count varies with length, the motif itself
 * never does. Leftover space is absorbed as equal blank margins at both
 * ends, matching `FacadeGrammar.ts`'s own floating-filler philosophy at a
 * smaller (ornament-band) scale.
 */

export type FriezeVariant = 'greek-key' | 'dentil' | 'plain-double-string' | 'cracked';

export interface FriezeOptions {
  /** Total run length the band occupies (world units). */
  length: number;
  /** Overall band height. Default 0.16. */
  height?: number;
  /** Proud depth of the motif in front of its own backing plate. Default 0.05. */
  reliefDepth?: number;
  /** Backing plate depth (the plain band the motif sits on). Default 0.04. */
  depth?: number;
  variant: FriezeVariant;
  material: THREE.Material;
  /** Seeds which motif is treated as "missing" for damage variants. Default 0. */
  seed?: number;
}

const DEFAULT_HEIGHT = 0.16;
const DEFAULT_RELIEF_DEPTH = 0.05;
const DEFAULT_DEPTH = 0.04;
const GREEK_KEY_UNIT = 0.34;
const DENTIL_UNIT = 0.16;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addBackingPlate(group: THREE.Group, length: number, height: number, depth: number, material: THREE.Material): void {
  const plate = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), material);
  plate.name = 'frieze-backing';
  plate.position.z = -depth / 2;
  plate.castShadow = plate.receiveShadow = true;
  group.add(plate);
}

/**
 * One fixed-size greek-key (meander/fret) motif traced as a sequence of
 * orthogonal bar segments — a real angular relief, not a texture swap.
 * Alternate motifs mirror in X so consecutive units visually interlock,
 * matching the continuous-meander look of the reference art.
 */
function buildGreekKeyMotif(unit: number, height: number, reliefDepth: number, material: THREE.Material, mirrored: boolean): THREE.Group {
  const motif = new THREE.Group();
  motif.name = 'greek-key-motif';
  const bar = Math.max(0.03, unit * 0.16);
  const halfU = unit / 2;
  const sign = mirrored ? -1 : 1;

  // Path traced as [x0,y0, x1,y1] segments in unit-local space; each segment
  // becomes one box bar. The path forms a simple stepped square-spiral "key".
  const points: Array<[number, number]> = [
    [-halfU, -height / 2],
    [-halfU, height / 2],
    [halfU * 0.2, height / 2],
    [halfU * 0.2, -height * 0.05],
    [-halfU * 0.35, -height * 0.05],
    [-halfU * 0.35, height * 0.2],
  ];

  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    const segLength = Math.max(Math.hypot((bx - ax) * sign, by - ay), 0.02);
    const midX = ((ax + bx) / 2) * sign;
    const midY = (ay + by) / 2;
    const angle = Math.atan2(by - ay, (bx - ax) * sign);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(segLength + bar, bar, reliefDepth), material);
    seg.name = `key-segment-${i}`;
    seg.position.set(midX, midY, reliefDepth / 2);
    seg.rotation.z = angle - Math.PI / 2;
    seg.castShadow = seg.receiveShadow = true;
    motif.add(seg);
  }

  return motif;
}

function buildDentilTooth(width: number, height: number, reliefDepth: number, material: THREE.Material): THREE.Mesh {
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(width, height, reliefDepth), material);
  tooth.name = 'dentil-tooth';
  tooth.position.z = reliefDepth / 2;
  tooth.castShadow = tooth.receiveShadow = true;
  return tooth;
}

function tileMotifs(
  length: number,
  unit: number,
  height: number,
  reliefDepth: number,
  material: THREE.Material,
  variant: 'greek-key' | 'dentil',
  omitIndex: number | undefined,
): THREE.Group {
  const group = new THREE.Group();
  const count = Math.max(1, Math.floor(length / unit));
  const usedWidth = count * unit;
  const margin = (length - usedWidth) / 2;
  const startX = -length / 2 + margin + unit / 2;

  for (let i = 0; i < count; i++) {
    if (i === omitIndex) {
      // Missing-segment support for ruined friezes: skip this motif's
      // geometry entirely, leaving a genuine gap rather than a hidden mesh.
      continue;
    }
    const motif = variant === 'greek-key'
      ? buildGreekKeyMotif(unit * 0.9, height * 0.7, reliefDepth, material, i % 2 === 1)
      : buildDentilTooth(unit * 0.55, height * 0.6, reliefDepth, material);
    motif.name = `frieze-motif-${i}`;
    motif.position.x = startX + i * unit;
    group.add(motif);
  }

  return group;
}

function buildCrackMark(length: number, height: number, seed: number, material: THREE.Material): THREE.Mesh {
  const rand = mulberry32(seed ^ 0x4352_414B);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(length * 0.06, height * 1.1, 0.015), material);
  crack.name = 'frieze-crack';
  crack.position.set((rand() - 0.5) * length * 0.6, 0, 0.02);
  crack.rotation.z = (rand() - 0.5) * 0.5;
  crack.castShadow = crack.receiveShadow = true;
  return crack;
}

export function buildFriezeBand(options: FriezeOptions): THREE.Group {
  const length = Math.max(options.length, 0.01);
  const height = options.height ?? DEFAULT_HEIGHT;
  const reliefDepth = options.reliefDepth ?? DEFAULT_RELIEF_DEPTH;
  const depth = options.depth ?? DEFAULT_DEPTH;
  const seed = options.seed ?? 0;
  const variant = options.variant;

  const group = new THREE.Group();
  group.name = `frieze-${variant}`;
  group.userData.friezeVariant = variant;
  addBackingPlate(group, length, height, depth, options.material);

  if (variant === 'greek-key' || variant === 'dentil') {
    const motifs = tileMotifs(length, variant === 'greek-key' ? GREEK_KEY_UNIT : DENTIL_UNIT, height, reliefDepth, options.material, variant, undefined);
    group.add(...[...motifs.children]);
    return group;
  }

  if (variant === 'plain-double-string') {
    const upperBar = new THREE.Mesh(new THREE.BoxGeometry(length, height * 0.32, reliefDepth), options.material);
    upperBar.name = 'string-upper';
    upperBar.position.set(0, height * 0.28, reliefDepth / 2);
    upperBar.castShadow = upperBar.receiveShadow = true;
    const lowerBar = new THREE.Mesh(new THREE.BoxGeometry(length, height * 0.32, reliefDepth), options.material);
    lowerBar.name = 'string-lower';
    lowerBar.position.set(0, -height * 0.28, reliefDepth / 2);
    lowerBar.castShadow = lowerBar.receiveShadow = true;
    group.add(upperBar, lowerBar);
    return group;
  }

  // 'cracked': a dentil-derived band with one motif deliberately omitted
  // (a real gap, not just visually implied) plus a shallow recessed crack
  // groove crossing the band — the "cracked/missing segment" reference
  // signal from CEM0035.webp's fractured slab faces.
  const rand = mulberry32(seed);
  const count = Math.max(1, Math.floor(length / DENTIL_UNIT));
  const omitIndex = Math.floor(rand() * count);
  const motifs = tileMotifs(length, DENTIL_UNIT, height, reliefDepth, options.material, 'dentil', omitIndex);
  group.add(...[...motifs.children]);
  group.add(buildCrackMark(length, height, seed, options.material));
  return group;
}
