import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';

/**
 * TurfRoof.ts — shared sod/turf roof kit module (first consumed by
 * Vulperia's warren architecture: docs/superpowers/specs/
 * 2026-09-04-vulperia-buildings-design.md / docs/superpowers/plans/
 * 2026-09-04-vulperia-buildings.md Tasks 1-3). No existing kit module did
 * genuine sod/turf ROOF surfacing before this: `ShingleSurface.ts` is the
 * closest precedent (course-based tile surfacing with named trim
 * children) but its per-tile shingle language doesn't fit a solid turf
 * cap — this module generalizes the same "real layered construction,
 * never a single smooth mesh" discipline to a different material
 * language: rafters -> board deck -> board ends -> turf-stop fascia ->
 * soil-edge -> grass-top, so the doctrine's anti-smooth-geometry rule
 * ("nothing coplanar... openings must read from shading discontinuity")
 * applies to turf roofs exactly the way it applies to walls/openings
 * elsewhere: a thick sod roof must be visibly SEGMENTED into planes with
 * real ridge/hip seams and dark verge trim, never one continuous green
 * dome/blob.
 *
 * Every mesh here is a stock `THREE.BoxGeometry` (or a small
 * `THREE.ExtrudeGeometry` for the tapered hip corners), which always
 * carries a `uv` attribute — deliberately avoiding the hand-rolled-
 * `BufferGeometry`-without-`uv` merge-drop bug class documented in
 * `MeshMergeUtils.ts` (see doctrine Part 9 / prior StoneTowerFloorCap.ts /
 * SlimeAccretionKit.ts history) — no custom BufferGeometry is used at all.
 *
 * Coordinate model: each roof "slope" (one pitched plane from eave to
 * ridge) gets its own orthonormal basis {spanDir, climbDir, outDir}.
 * `spanDir` runs along the ridge (horizontal), `climbDir` runs from the
 * eave (u=0) up to the ridge (u=slopeLength) — mirroring
 * `RoofMassing.ts`'s `buildTaperedShingleSlope` convention — and `outDir`
 * is the slope's own outward/upward relief axis (always resolved so its
 * world-Y component is positive), used to stack rafters -> deck -> turf
 * -> grass without ever needing a rotated parent `THREE.Group` (every
 * mesh's world position/quaternion is computed directly, so there is no
 * ambiguity from nested transforms).
 */

export type TurfRoofArchetype = 'lowGable' | 'longHall' | 'crossGable' | 'rowGable' | 'steepCap';

export interface TurfRoofPalette {
  /** Exposed rafter/board-end timber. */
  timber: THREE.Material;
  /** Board deck planking under the turf. */
  boardDeck: THREE.Material;
  /** Turf-stop fascia board + ridge cap trim (dark verge trim). */
  turfStop: THREE.Material;
  /** Exposed dark soil at the cut turf edges. */
  soil: THREE.Material;
  /** Main grass-top surface. */
  grass: THREE.Material;
  /** Optional secondary grass tone for tuft/wildflower detail accents. */
  grassAccent?: THREE.Material;
}

export type TurfRoofFace = 'front' | 'back' | 'left' | 'right';

export interface TurfRoofDormerSpec {
  id: string;
  face: TurfRoofFace;
  /** Offset along the slope's span direction (world units) from center. */
  offset: number;
  width: number;
  height: number;
}

export interface TurfRoofPorchCutSpec {
  id: string;
  face: TurfRoofFace;
  offset: number;
  width: number;
  height: number;
}

export interface TurfRoofDetailOptions {
  tufts?: number;
  wildflowers?: number;
}

export interface TurfRoofOptions {
  archetype: TurfRoofArchetype;
  halfWidth: number;
  halfDepth: number;
  eaveHeight: number;
  ridgeHeight: number;
  turfThickness: number;
  seed: number;
  palette: TurfRoofPalette;
  eaveOverhang?: number;
  dormers?: TurfRoofDormerSpec[];
  porchCuts?: TurfRoofPorchCutSpec[];
  detail?: TurfRoofDetailOptions;
  /** crossGable only: half-extent of the perpendicular wing along its own ridge. */
  wingHalfWidth?: number;
  /** crossGable only: half-run of the perpendicular wing (eave to ridge horizontal distance). */
  wingHalfDepth?: number;
  /** crossGable only: ridge height of the perpendicular wing. */
  wingRidgeHeight?: number;
}

interface SlopeInfo {
  name: TurfRoofFace;
  /** Eave-line midpoint (u=0, v=0 reference), in the roof group's local space. */
  origin: THREE.Vector3;
  spanDir: THREE.Vector3;
  climbDir: THREE.Vector3;
  outDir: THREE.Vector3;
  quaternion: THREE.Quaternion;
  slopeLength: number;
  halfSpan: number;
}

function computeSlope(
  name: TurfRoofFace,
  center: THREE.Vector3,
  ridgeDir: THREE.Vector3,
  sign: 1 | -1,
  halfSpanAlongRidge: number,
  halfRun: number,
  eaveHeight: number,
  ridgeHeight: number,
  eaveOverhang: number,
): SlopeInfo {
  const spanDir = ridgeDir.clone().normalize();
  // Horizontal perpendicular to the ridge direction (rotate 90 deg in the XZ plane).
  const perp = new THREE.Vector3(spanDir.z, 0, -spanDir.x);
  const eaveHoriz = perp.clone().multiplyScalar(sign * (halfRun + eaveOverhang));
  const eavePoint = center.clone().add(eaveHoriz);
  eavePoint.y = eaveHeight;
  const ridgePoint = center.clone();
  ridgePoint.y = ridgeHeight;
  const climbVec = ridgePoint.clone().sub(eavePoint);
  const slopeLength = climbVec.length();
  const climbDir = climbVec.clone().normalize();
  const outDir = new THREE.Vector3().crossVectors(spanDir, climbDir).normalize();
  // Keep outDir pointing "up" (away from the roof underside) for consistent
  // shading, but never negate it alone: cross(spanDir, climbDir) must stay
  // exactly equal to outDir or makeBasis() below receives a left-handed
  // (reflection) matrix, which Quaternion.setFromRotationMatrix() silently
  // mis-decomposes into a skewed, non-orthogonal rotation — the resulting
  // mesh renders with its span axis smeared across world X/Y instead of
  // cleanly along the ridge, producing a large silent bounding-box overrun.
  // Flipping spanDir together with outDir preserves the right-handed basis.
  if (outDir.y < 0) {
    spanDir.negate();
    outDir.negate();
  }
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(spanDir, climbDir, outDir),
  );
  return {
    name,
    origin: eavePoint,
    spanDir,
    climbDir,
    outDir,
    quaternion,
    slopeLength,
    halfSpan: halfSpanAlongRidge + eaveOverhang,
  };
}

function placeInSlope(mesh: THREE.Mesh, slope: SlopeInfo, v: number, u: number, z: number): void {
  mesh.position.copy(slope.origin)
    .addScaledVector(slope.spanDir, v)
    .addScaledVector(slope.climbDir, u)
    .addScaledVector(slope.outDir, z);
  mesh.quaternion.copy(slope.quaternion);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function box(w: number, h: number, d: number, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d)), material);
  mesh.name = name;
  return mesh;
}

const RAFTER_THICKNESS = 0.06;
const RAFTER_DEPTH = 0.05;
const DECK_THICKNESS = 0.045;
const BOARD_END_DEPTH = 0.09;
const TURF_INSET_SIDE = 0.09;
const TURF_INSET_END = 0.06;
const SOIL_EDGE_THICKNESS = 0.045;
const GRASS_CAP_THICKNESS = 0.02;

/** Builds all six named layers for a single slope, appending meshes into
 * the caller-provided per-layer group buckets. */
function buildSlopeLayers(
  slope: SlopeInfo,
  palette: TurfRoofPalette,
  turfThickness: number,
  seed: number,
  dentil: boolean,
  layers: {
    rafters: THREE.Group;
    deck: THREE.Group;
    boardEnds: THREE.Group;
    turfStop: THREE.Group;
    soilEdge: THREE.Group;
    grassTop: THREE.Group;
  },
): void {
  const rand = mulberry32((seed ^ 0x7f4a7c15) >>> 0);
  const { slopeLength, halfSpan } = slope;
  const turfStopHeight = Math.max(0.12, turfThickness * 0.55);

  // Rafters: individually placed, evenly spaced, poking slightly past the
  // eave line (negative u) so their end grain is genuinely exposed under
  // the turf-stop fascia, never a single fused slab.
  const rafterCount = Math.max(4, Math.round((halfSpan * 2) / 0.55) + 1);
  const railMargin = 0.15;
  const rafterZCenter = RAFTER_DEPTH / 2;
  const rafterU0 = -0.12;
  const rafterUSpan = slopeLength - rafterU0;
  for (let i = 0; i < rafterCount; i++) {
    const t = rafterCount === 1 ? 0.5 : i / (rafterCount - 1);
    const v = THREE.MathUtils.lerp(-halfSpan + railMargin, halfSpan - railMargin, t) + (rand() - 0.5) * 0.02;
    const rafter = box(RAFTER_THICKNESS, rafterUSpan, RAFTER_DEPTH, palette.timber, `rafter-${i}`);
    placeInSlope(rafter, slope, v, rafterU0 + rafterUSpan / 2, rafterZCenter);
    layers.rafters.add(rafter);

    // Visible board-end block poking a hair past the deck's own eave edge.
    const boardEnd = box(RAFTER_THICKNESS * 1.3, BOARD_END_DEPTH, RAFTER_DEPTH * 1.5, palette.timber, `board-end-${i}`);
    placeInSlope(boardEnd, slope, v, -0.05, rafterZCenter);
    layers.boardEnds.add(boardEnd);
  }

  // Board deck: a single generous slab, slightly overhanging the rafters
  // at both ends so no gaps show through.
  const deckZCenter = RAFTER_DEPTH + DECK_THICKNESS / 2;
  const deck = box(halfSpan * 2 - 0.05, slopeLength + 0.08, DECK_THICKNESS, palette.boardDeck, 'board-deck-slab');
  placeInSlope(deck, slope, 0, (slopeLength - 0.08) / 2, deckZCenter);
  layers.deck.add(deck);

  // Turf-stop: the proud fascia board that retains the turf at the eave,
  // standing clearly proud of the deck plane (doctrine depth-ladder rule).
  const turfStopZCenter = RAFTER_DEPTH + DECK_THICKNESS * 0.25 + turfStopHeight / 2;
  const turfStop = box(halfSpan * 2 + 0.06, 0.07, turfStopHeight, palette.turfStop, 'turf-stop-fascia');
  placeInSlope(turfStop, slope, 0, -0.02, turfStopZCenter);
  layers.turfStop.add(turfStop);

  // Ridge cap trim (same layer bucket): a slim proud board at the ridge
  // line closing the seam between opposing slopes.
  const ridgeCap = box(halfSpan * 2 + 0.05, 0.1, turfStopHeight * 0.6, palette.turfStop, 'ridge-cap');
  placeInSlope(ridgeCap, slope, 0, slopeLength + 0.02, RAFTER_DEPTH + DECK_THICKNESS + turfThickness * 0.5);
  layers.turfStop.add(ridgeCap);

  // rowGable-only dentil detail: small repeating proud blocks along the
  // turf-stop board, a subtle differentiator from the plain lowGable eave.
  if (dentil) {
    const dentilCount = Math.max(3, Math.round((halfSpan * 2) / 0.4));
    for (let i = 0; i < dentilCount; i++) {
      const t = dentilCount === 1 ? 0.5 : i / (dentilCount - 1);
      const v = THREE.MathUtils.lerp(-halfSpan + 0.2, halfSpan - 0.2, t);
      if (i % 2 === 0) continue;
      const dentilBlock = box(0.14, 0.05, turfStopHeight * 0.75, palette.turfStop, `turf-stop-dentil-${i}`);
      placeInSlope(dentilBlock, slope, v, -0.02, turfStopZCenter + turfStopHeight * 0.5);
      layers.turfStop.add(dentilBlock);
    }
  }

  // Turf slab: inset from both verges and the eave/ridge lines so the
  // dark soil edge genuinely reads at every cut face.
  const turfHalfSpan = Math.max(0.1, halfSpan - TURF_INSET_SIDE);
  const turfU0 = TURF_INSET_END;
  const turfU1 = slopeLength - TURF_INSET_END * 0.5;
  const turfULength = Math.max(0.1, turfU1 - turfU0);
  const turfZCenter = RAFTER_DEPTH + DECK_THICKNESS + turfThickness / 2;
  const turfSlab = box(turfHalfSpan * 2, turfULength, turfThickness, palette.grass, 'turf-slab');
  placeInSlope(turfSlab, slope, 0, turfU0 + turfULength / 2, turfZCenter);
  // Named/tagged as part of grass-top group visually, but kept as its own
  // mesh under soil-edge/grass groups below via explicit split (top cap
  // vs. body) — the turf slab BODY sits alongside soil-edge since its
  // sides are what the soil-edge strips dress; the thin grass-top cap is
  // the separate top-facing finish layer.
  layers.soilEdge.add(turfSlab);

  // Soil-edge strips: dark, thin strips flush with the turf slab's cut
  // side/eave faces (never carved — additive trim, per the doctrine's
  // no-CSG rule).
  const soilSide = (sign: 1 | -1): THREE.Mesh => {
    const strip = box(SOIL_EDGE_THICKNESS, turfULength, turfThickness, palette.soil, `soil-edge-side-${sign > 0 ? 'pos' : 'neg'}`);
    placeInSlope(strip, slope, sign * turfHalfSpan, turfU0 + turfULength / 2, turfZCenter);
    return strip;
  };
  layers.soilEdge.add(soilSide(1));
  layers.soilEdge.add(soilSide(-1));
  const soilEave = box(turfHalfSpan * 2, SOIL_EDGE_THICKNESS, turfThickness, palette.soil, 'soil-edge-eave');
  placeInSlope(soilEave, slope, 0, turfU0, turfZCenter);
  layers.soilEdge.add(soilEave);

  // Grass-top: a thin cap sitting right on the turf slab's top face.
  const grassZCenter = RAFTER_DEPTH + DECK_THICKNESS + turfThickness + GRASS_CAP_THICKNESS / 2;
  const grassMat = palette.grassAccent && (Math.abs(seed) % 2 === 0) ? palette.grassAccent : palette.grass;
  const grassTop = box(Math.max(0.08, turfHalfSpan * 2 - 0.03), Math.max(0.08, turfULength - 0.03), GRASS_CAP_THICKNESS, grassMat, 'grass-cap');
  placeInSlope(grassTop, slope, 0, turfU0 + turfULength / 2, grassZCenter);
  layers.grassTop.add(grassTop);
}

function turfSurfaceZ(turfThickness: number): number {
  return RAFTER_DEPTH + DECK_THICKNESS + turfThickness + GRASS_CAP_THICKNESS;
}

/** Builds a small roof-integrated dormer socket punched through a slope,
 * pushed outward past the eave line so it reads as a genuine raised
 * dormer (not a flush decal). Returns three named parts: the shell,
 * a soil-edge strip at its tiny turf verge, and its own mini hood roof. */
function buildDormer(
  spec: TurfRoofDormerSpec,
  slope: SlopeInfo,
  palette: TurfRoofPalette,
  turfThickness: number,
): { main: THREE.Group; soilEdge: THREE.Mesh; hood: THREE.Group } {
  const surfaceZ = turfSurfaceZ(turfThickness);
  const uPosition = Math.min(slope.slopeLength * 0.45, slope.slopeLength * 0.3 + spec.height);
  // Note: prior to the computeSlope() outward-normal handedness fix, this
  // projection reached the eave line only via a corrupted (non-orthonormal)
  // basis; now that outDir/spanDir are a genuine orthonormal frame, the
  // dormer needs a slightly larger real-world projection to still read as
  // clearly proud of the slope.
  const projection = Math.max(0.55, spec.width * 0.85);

  const main = new THREE.Group();
  main.name = `turf-roof-dormer-${spec.id}`;

  // Front cheek (vertical, facing outward along outDir), pushed proud of
  // the slope surface by `projection` so it clearly pokes past the eave.
  const cheek = box(spec.width, spec.height, 0.06, palette.boardDeck, 'dormer-cheek');
  placeInSlope(cheek, slope, spec.offset, uPosition, surfaceZ + projection);
  main.add(cheek);

  // Side walls connecting the cheek back to the roof surface.
  for (const sign of [1, -1] as const) {
    const side = box(0.06, spec.height, projection, palette.boardDeck, `dormer-side-${sign > 0 ? 'pos' : 'neg'}`);
    placeInSlope(side, slope, spec.offset + sign * spec.width * 0.5, uPosition, surfaceZ + projection / 2);
    main.add(side);
  }

  const hood = new THREE.Group();
  hood.name = `turf-roof-dormer-hood-${spec.id}`;
  const hoodCap = box(spec.width * 1.15, 0.08, projection * 1.1, palette.turfStop, 'dormer-hood-cap');
  placeInSlope(hoodCap, slope, spec.offset, uPosition, surfaceZ + spec.height + projection * 0.5);
  hood.add(hoodCap);

  const soilEdge = box(spec.width * 1.05, 0.05, 0.12, palette.soil, `dormer-soil-edge-${spec.id}`);
  soilEdge.name = `turf-roof-dormer-soil-edge-${spec.id}`;
  placeInSlope(soilEdge, slope, spec.offset, uPosition - spec.height * 0.5 - 0.1, surfaceZ + 0.02);

  return { main, soilEdge, hood };
}

/** Builds a named porch-cut socket: a simple rectangular notch shell
 * marking where a raised porch/entry structure breaks through the low
 * eave line, matching the design spec's "raised porches/dormers for
 * legibility" requirement. */
function buildPorchCut(
  spec: TurfRoofPorchCutSpec,
  slope: SlopeInfo,
  palette: TurfRoofPalette,
  turfThickness: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `turf-roof-porch-cut-${spec.id}`;
  const surfaceZ = turfSurfaceZ(turfThickness);
  const uPosition = Math.min(slope.slopeLength * 0.4, spec.height * 0.7);

  const header = box(spec.width * 1.2, 0.1, 0.35, palette.turfStop, 'porch-cut-header');
  placeInSlope(header, slope, spec.offset, uPosition, surfaceZ + 0.05);
  group.add(header);

  for (const sign of [1, -1] as const) {
    const post = box(0.08, spec.height * 0.4, 0.3, palette.timber, `porch-cut-post-${sign > 0 ? 'pos' : 'neg'}`);
    placeInSlope(post, slope, spec.offset + sign * spec.width * 0.5, uPosition - spec.height * 0.2, surfaceZ);
    group.add(post);
  }
  return group;
}

function buildDetail(
  slopes: SlopeInfo[],
  palette: TurfRoofPalette,
  turfThickness: number,
  seed: number,
  options: TurfRoofDetailOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'turf-roof-detail';
  const rand = mulberry32((seed ^ 0x2a5e11c3) >>> 0);
  const surfaceZ = turfSurfaceZ(turfThickness) + 0.01;
  const tuftMat = palette.grassAccent ?? palette.grass;

  const tuftCount = Math.max(0, options.tufts ?? 0);
  for (let i = 0; i < tuftCount; i++) {
    const slope = slopes[Math.floor(rand() * slopes.length)]!;
    const v = (rand() - 0.5) * slope.halfSpan * 1.6;
    const u = THREE.MathUtils.lerp(slope.slopeLength * 0.15, slope.slopeLength * 0.85, rand());
    const tuft = box(0.05 + rand() * 0.04, 0.05 + rand() * 0.04, 0.14 + rand() * 0.08, tuftMat, `tuft-${i}`);
    placeInSlope(tuft, slope, v, u, surfaceZ + 0.07);
    group.add(tuft);
  }

  const flowerCount = Math.max(0, options.wildflowers ?? 0);
  for (let i = 0; i < flowerCount; i++) {
    const slope = slopes[Math.floor(rand() * slopes.length)]!;
    const v = (rand() - 0.5) * slope.halfSpan * 1.6;
    const u = THREE.MathUtils.lerp(slope.slopeLength * 0.2, slope.slopeLength * 0.8, rand());
    const flower = box(0.045, 0.045, 0.1, palette.turfStop, `wildflower-${i}`);
    placeInSlope(flower, slope, v, u, surfaceZ + 0.05);
    group.add(flower);
  }

  return group;
}

function findSlope(slopes: SlopeInfo[], face: TurfRoofFace): SlopeInfo {
  const direct = slopes.find((s) => s.name === face);
  if (direct) return direct;
  // 2-slope archetypes only expose front/back; alias left/right onto them
  // so callers may use whichever face name reads more naturally for their
  // own building orientation.
  if (face === 'left') return slopes.find((s) => s.name === 'back') ?? slopes[0]!;
  if (face === 'right') return slopes.find((s) => s.name === 'front') ?? slopes[0]!;
  return slopes[0]!;
}

export function buildTurfRoof(options: TurfRoofOptions): THREE.Group {
  const {
    archetype, halfWidth, halfDepth, eaveHeight, ridgeHeight, turfThickness,
    seed, palette, eaveOverhang = 0.35, dormers = [], porchCuts = [], detail,
  } = options;

  const root = new THREE.Group();
  root.name = 'turf-roof';

  const layers = {
    rafters: new THREE.Group(),
    deck: new THREE.Group(),
    boardEnds: new THREE.Group(),
    turfStop: new THREE.Group(),
    soilEdge: new THREE.Group(),
    grassTop: new THREE.Group(),
  };
  layers.rafters.name = 'turf-roof-rafters';
  layers.deck.name = 'turf-roof-board-deck';
  layers.boardEnds.name = 'turf-roof-board-ends';
  layers.turfStop.name = 'turf-roof-turf-stop';
  layers.soilEdge.name = 'turf-roof-soil-edge';
  layers.grassTop.name = 'turf-roof-grass-top';
  root.add(layers.rafters, layers.deck, layers.boardEnds, layers.turfStop, layers.soilEdge, layers.grassTop);

  const slopes: SlopeInfo[] = [];
  const dentil = archetype === 'rowGable';

  if (archetype === 'steepCap') {
    // Hip/pyramid-like cap: four slopes converging toward a small plateau
    // near the apex rather than a literal single point, avoiding a
    // degenerate blob tip while still reading as a steep "turf umbrella".
    const plateau = 0.45;
    slopes.push(computeSlope('front', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 1, halfDepth * plateau, halfWidth, eaveHeight, ridgeHeight, eaveOverhang));
    slopes.push(computeSlope('back', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), -1, halfDepth * plateau, halfWidth, eaveHeight, ridgeHeight, eaveOverhang));
    slopes.push(computeSlope('right', new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 1, halfWidth * plateau, halfDepth, eaveHeight, ridgeHeight, eaveOverhang));
    slopes.push(computeSlope('left', new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), -1, halfWidth * plateau, halfDepth, eaveHeight, ridgeHeight, eaveOverhang));
  } else {
    slopes.push(computeSlope('front', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 1, halfDepth, halfWidth, eaveHeight, ridgeHeight, eaveOverhang));
    slopes.push(computeSlope('back', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), -1, halfDepth, halfWidth, eaveHeight, ridgeHeight, eaveOverhang));

    if (archetype === 'crossGable') {
      const wingHalfWidth = options.wingHalfWidth ?? halfDepth * 0.5;
      const wingHalfDepth = options.wingHalfDepth ?? halfWidth * 0.65;
      const wingRidgeHeight = options.wingRidgeHeight ?? Math.max(eaveHeight + 0.3, ridgeHeight * 0.85);
      const wingCenter = new THREE.Vector3(0, 0, 0);
      slopes.push(computeSlope('right', wingCenter, new THREE.Vector3(1, 0, 0), 1, wingHalfWidth, wingHalfDepth, eaveHeight, wingRidgeHeight, eaveOverhang));
      slopes.push(computeSlope('left', wingCenter, new THREE.Vector3(1, 0, 0), -1, wingHalfWidth, wingHalfDepth, eaveHeight, wingRidgeHeight, eaveOverhang));
    }
  }

  for (let i = 0; i < slopes.length; i++) {
    buildSlopeLayers(slopes[i]!, palette, turfThickness, (seed + i * 101) >>> 0, dentil, layers);
  }

  for (const spec of dormers) {
    const slope = findSlope(slopes, spec.face);
    const { main, soilEdge, hood } = buildDormer(spec, slope, palette, turfThickness);
    root.add(main, soilEdge, hood);
  }

  for (const spec of porchCuts) {
    const slope = findSlope(slopes, spec.face);
    root.add(buildPorchCut(spec, slope, palette, turfThickness));
  }

  if (detail && ((detail.tufts ?? 0) > 0 || (detail.wildflowers ?? 0) > 0)) {
    root.add(buildDetail(slopes, palette, turfThickness, seed, detail));
  }

  return root;
}
