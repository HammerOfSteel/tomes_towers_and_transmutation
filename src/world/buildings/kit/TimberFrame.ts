import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import { depthFor } from './DepthLadder';
import { buildQuatrefoil } from './Tracery';

/**
 * TimberFrame.ts — [SHARED KIT] proud structural half-timber frame with
 * recessed infill panels (docs/superpowers/specs/2026-09-04-human-buildings-
 * design.md's flagship human contribution, explicitly designed to be
 * reusable by other races later).
 *
 * A real half-timbered wall reads from TWO layers at different depths
 * (doctrine Rule 1, the depth ladder): the structural timber grid (posts,
 * rails, diagonal braces/studs) sits PROUD of the wall plane at the TRIM
 * role (+0.08 WU), while the infill panels between them (plaster, brick
 * nogging, wattle-and-daub) sit flush with or slightly behind the wall
 * plane (0.00 / -0.04 WU). Every piece is a real extruded solid
 * (`THREE.BoxGeometry`, or `buildQuatrefoil()`'s pierced tracery plate for
 * the ornamental pattern) so nothing here is a flat, untextured plane
 * standing in for a readable feature (doctrine Rule 3), and every mesh
 * carries a `uv` attribute automatically (BoxGeometry always does) so this
 * module can never trigger the uv-attribute merge-drop bug class documented
 * in `MeshMergeUtils.ts`.
 */

export type TimberFramePattern =
  | 'simpleBrace'
  | 'stAndrewsCross'
  | 'herringbone'
  | 'quatrefoil'
  | 'brickNogging'
  | 'repairPanel';

/** A local-space rectangle (panel-local coordinates: x in [0, width],
 * y in [0, height]) that structural braces/studs must never cross --
 * e.g. a window or door aperture cut into this bay. */
export interface TimberFrameExclusion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimberFramePanelOptions {
  width: number;
  height: number;
  pattern?: TimberFramePattern;
  seed: number;
  timberMaterial: THREE.Material;
  infillMaterial: THREE.Material;
  /** Alternate infill material for the repairPanel pattern (a later patch
   * using different, less-weathered stock) -- falls back to infillMaterial. */
  repairMaterial?: THREE.Material;
  exclude?: TimberFrameExclusion;
  /** Whether to emit a full-height corner post at the panel's left/right
   * edge (default true for both) -- set to false when an adjacent bay in
   * a facade already owns that shared corner post. */
  leftPost?: boolean;
  rightPost?: boolean;
}

export interface TimberFrameFacadeBay {
  /** Local-space left edge of this bay within the facade. */
  x: number;
  width: number;
  pattern?: TimberFramePattern;
  exclude?: TimberFrameExclusion;
}

export interface TimberFrameFacadeOptions {
  bays: TimberFrameFacadeBay[];
  height: number;
  seed: number;
  timberMaterial: THREE.Material;
  infillMaterial: THREE.Material;
  repairMaterial?: THREE.Material;
  defaultPattern?: TimberFramePattern;
}

const MAX_POST_SPACING = 2.4;
const MAX_INFILL_SPAN = 0.75;
const POST_WIDTH_MIN = 0.14;
const POST_WIDTH_MAX = 0.2;
const RAIL_HEIGHT = 0.09;
const STUD_WIDTH = 0.09;
const BRACE_WIDTH = 0.11;
const TIMBER_MEMBER_DEPTH = 0.12;
const INFILL_DEPTH = 0.05;
const FRAME_FRONT_Z = depthFor('TRIM');
const INFILL_RECESSED_FRONT_Z = -0.04;

/** Turns a short ASCII tag into a seed-mixing constant, matching every
 * other race kit's own local `tagSeed()` convention -- gives each
 * sub-feature (posts, braces, a given bay index) its own independent,
 * deterministic RNG stream derived from one building seed. */
function tagSeed(seed: number, tag: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h ^ (tag.charCodeAt(i) << ((i % 4) * 8))) >>> 0;
  }
  return h >>> 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function makeTimberBox(w: number, h: number, d: number, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)), material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Axis-aligned overlap test in panel-local (x, y) space, used to keep
 * braces/studs clear of a supplied window/door exclusion rectangle. */
function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Conservative bounding box of a diagonal brace running from (x0,y0) to
 * (x1,y1), padded by half its own cross-section width -- used only for
 * the exclusion-overlap test, not for placement. */
function braceBounds(x0: number, y0: number, x1: number, y1: number, pad: number) {
  return {
    x: Math.min(x0, x1) - pad,
    y: Math.min(y0, y1) - pad,
    width: Math.abs(x1 - x0) + pad * 2,
    height: Math.abs(y1 - y0) + pad * 2,
  };
}

/**
 * `x0/y0/x1/y1` are panel-local, UN-centered coordinates (x in [0, width],
 * matching `exclude`'s own coordinate space) -- `centerOffset` (half the
 * panel width) is subtracted only when placing the final mesh, so the
 * exclusion overlap test and the caller's own placement math never drift
 * out of sync with each other.
 */
function addDiagonalBrace(
  group: THREE.Group, x0: number, y0: number, x1: number, y1: number,
  material: THREE.Material, name: string, exclude: TimberFrameExclusion | undefined, centerOffset: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length < 0.05) return;
  const bounds = braceBounds(x0, y0, x1, y1, BRACE_WIDTH / 2);
  if (exclude && rectsOverlap(bounds.x, bounds.y, bounds.width, bounds.height, exclude.x, exclude.y, exclude.width, exclude.height)) {
    return;
  }
  const mesh = makeTimberBox(length, BRACE_WIDTH, TIMBER_MEMBER_DEPTH, material, name);
  mesh.position.set((x0 + x1) / 2 - centerOffset, (y0 + y1) / 2, 0);
  mesh.rotation.z = Math.atan2(dy, dx);
  group.add(mesh);
}

interface SubBay {
  x0: number;
  x1: number;
}

function splitIntoSubBays(width: number): SubBay[] {
  const count = Math.max(1, Math.ceil(width / MAX_POST_SPACING));
  const subWidth = width / count;
  const bays: SubBay[] = [];
  for (let i = 0; i < count; i++) bays.push({ x0: i * subWidth, x1: (i + 1) * subWidth });
  return bays;
}

/**
 * Builds one timber-frame bay: corner/intermediate posts (proud, TRIM
 * depth), sill/mid/head rails (proud, TRIM depth), a pattern-specific set
 * of diagonal braces (proud, TRIM depth, skipped wherever they would cross
 * `exclude`), and infill panels filling the remaining spans (flush/
 * recessed, at or behind the wall plane). Wide panels (> 2.4 WU, the
 * doctrine's maximum post spacing) are automatically split into multiple
 * post-bounded sub-bays; tall/wide sub-bay infill spans (> 0.75 WU) get an
 * intermediate stud.
 */
export function buildTimberFramePanel(options: TimberFramePanelOptions): THREE.Group {
  const width = Math.max(0.2, options.width);
  const height = Math.max(0.2, options.height);
  const pattern = options.pattern ?? 'simpleBrace';
  const timberMaterial = options.timberMaterial;
  const infillMaterial = options.infillMaterial;
  const repairMaterial = options.repairMaterial ?? infillMaterial;
  const leftPost = options.leftPost ?? true;
  const rightPost = options.rightPost ?? true;
  const exclude = options.exclude;
  const rand = mulberry32(options.seed >>> 0);

  const group = new THREE.Group();
  group.name = 'timber-frame-panel';
  group.userData.pattern = pattern;

  const postsGroup = new THREE.Group();
  postsGroup.name = 'post';
  postsGroup.position.z = FRAME_FRONT_Z;
  const railsGroup = new THREE.Group();
  railsGroup.name = 'rail';
  railsGroup.position.z = FRAME_FRONT_Z;
  const bracesGroup = new THREE.Group();
  bracesGroup.name = 'brace';
  bracesGroup.position.z = FRAME_FRONT_Z;
  const studsGroup = new THREE.Group();
  studsGroup.name = 'stud';
  studsGroup.position.z = FRAME_FRONT_Z;
  const infillGroup = new THREE.Group();
  infillGroup.name = 'infill';
  infillGroup.position.z = pattern === 'brickNogging' || pattern === 'repairPanel' ? INFILL_RECESSED_FRONT_Z : 0;

  const subBays = splitIntoSubBays(width);
  const postWidth = clamp(width * 0.08, POST_WIDTH_MIN, POST_WIDTH_MAX);

  // Posts: one at every sub-bay boundary, honoring leftPost/rightPost for
  // the outer two edges (a facade sharing a corner post between adjacent
  // bays sets one side's flag false to avoid a doubled post).
  const postXsLocal: number[] = [];
  for (let i = 0; i <= subBays.length; i++) {
    const isLeftEdge = i === 0;
    const isRightEdge = i === subBays.length;
    if (isLeftEdge && !leftPost) continue;
    if (isRightEdge && !rightPost) continue;
    postXsLocal.push(i === subBays.length ? width : subBays[i]!.x0);
  }
  for (const px of postXsLocal) {
    const mesh = makeTimberBox(postWidth, height, TIMBER_MEMBER_DEPTH, timberMaterial, `post-${px.toFixed(3)}`);
    mesh.position.set(px - width / 2, height / 2, 0);
    postsGroup.add(mesh);
  }

  // Rails: sill (near bottom), head (near top), plus a mid rail for any
  // panel tall enough for it to make structural sense (>1.6 WU) -- always
  // spanning the FULL panel width (a real rail runs corner-post to
  // corner-post, not per sub-bay).
  const railYs = [Math.min(0.14, height * 0.08), height - Math.min(0.14, height * 0.08)];
  if (height > 1.6) railYs.splice(1, 0, height * 0.55);
  if (height > 3.0) railYs.splice(1, 0, height * 0.3, height * 0.78);
  const uniqueRailYs = [...new Set(railYs.map((y) => Math.round(y * 1000) / 1000))].sort((a, b) => a - b);
  for (const ry of uniqueRailYs) {
    const mesh = makeTimberBox(width, RAIL_HEIGHT, TIMBER_MEMBER_DEPTH, timberMaterial, `rail-${ry.toFixed(3)}`);
    mesh.position.set(0, ry, 0);
    railsGroup.add(mesh);
  }

  const bandTop = uniqueRailYs[uniqueRailYs.length - 1]! - RAIL_HEIGHT / 2;
  const bandBottom = uniqueRailYs[0]! + RAIL_HEIGHT / 2;

  const centerOffset = width / 2;

  subBays.forEach((bay, bayIndex) => {
    const bayWidth = bay.x1 - bay.x0;
    const bayRand = mulberry32(tagSeed(options.seed, `SB${bayIndex}`));

    // Studs: split any infill span wider than the doctrine max (0.75 WU).
    // Kept in their own 'stud' group, distinct from full-height 'post'
    // members, so callers/tests can tell corner/intermediate posts apart
    // from shorter infill-dividing studs.
    const studCount = Math.max(0, Math.ceil(bayWidth / MAX_INFILL_SPAN) - 1);
    const studXsLocal: number[] = [];
    for (let s = 1; s <= studCount; s++) {
      const sx = bay.x0 + (bayWidth * s) / (studCount + 1);
      studXsLocal.push(sx);
      if (exclude && rectsOverlap(sx - STUD_WIDTH / 2, bandBottom, STUD_WIDTH, bandTop - bandBottom, exclude.x, exclude.y, exclude.width, exclude.height)) {
        continue;
      }
      const mesh = makeTimberBox(STUD_WIDTH, bandTop - bandBottom, TIMBER_MEMBER_DEPTH, timberMaterial, `stud-${bayIndex}-${s}`);
      mesh.position.set(sx - centerOffset, (bandTop + bandBottom) / 2, 0);
      studsGroup.add(mesh);
    }

    // Braces, per pattern. All coordinates below are panel-local
    // (un-centered, matching `exclude`'s own [0, width] space) -- see
    // `addDiagonalBrace()`'s own doc comment for why.
    const columnEdges = [bay.x0, ...studXsLocal, bay.x1];
    if (pattern === 'simpleBrace') {
      // One knee brace per bay corner (bottom corners rising toward the
      // head rail), the classic vernacular pattern.
      addDiagonalBrace(bracesGroup, bay.x0, bandBottom, bay.x0 + Math.min(bayWidth * 0.4, 0.9), bandBottom + Math.min((bandTop - bandBottom) * 0.4, 0.7), timberMaterial, `brace-${bayIndex}-l`, exclude, centerOffset);
      if (bayWidth > 1.1) {
        addDiagonalBrace(bracesGroup, bay.x1, bandBottom, bay.x1 - Math.min(bayWidth * 0.4, 0.9), bandBottom + Math.min((bandTop - bandBottom) * 0.4, 0.7), timberMaterial, `brace-${bayIndex}-r`, exclude, centerOffset);
      }
    } else if (pattern === 'stAndrewsCross') {
      addDiagonalBrace(bracesGroup, bay.x0, bandBottom, bay.x1, bandTop, timberMaterial, `brace-${bayIndex}-x1`, exclude, centerOffset);
      addDiagonalBrace(bracesGroup, bay.x1, bandBottom, bay.x0, bandTop, timberMaterial, `brace-${bayIndex}-x2`, exclude, centerOffset);
    } else if (pattern === 'herringbone') {
      const rows = Math.max(2, Math.round((bandTop - bandBottom) / 0.35));
      const rowH = (bandTop - bandBottom) / rows;
      for (let r = 0; r < rows; r++) {
        const y0 = bandBottom + r * rowH;
        const y1 = y0 + rowH;
        const dirFlip = r % 2 === 0;
        const xa = dirFlip ? bay.x0 : bay.x1;
        const xb = dirFlip ? bay.x1 : bay.x0;
        addDiagonalBrace(bracesGroup, xa, y0, xb, y1, timberMaterial, `brace-${bayIndex}-hb${r}`, exclude, centerOffset);
      }
    }
    // quatrefoil / brickNogging / repairPanel: no diagonal braces -- the
    // ornament or infill treatment itself carries the visual interest.

    // Infill panels: fill each column (between adjacent posts/studs) from
    // bandBottom to bandTop, skipping any column that overlaps `exclude`.
    for (let c = 0; c < columnEdges.length - 1; c++) {
      const cx0 = columnEdges[c]!;
      const cx1 = columnEdges[c + 1]!;
      const colW = cx1 - cx0;
      const colX = (cx0 + cx1) / 2 - width / 2;
      const colH = bandTop - bandBottom;
      const colY = (bandTop + bandBottom) / 2;
      if (exclude && rectsOverlap(cx0, bandBottom, colW, colH, exclude.x, exclude.y, exclude.width, exclude.height)) {
        continue;
      }
      if (pattern === 'quatrefoil' && colW > 0.5 && colH > 0.5) {
        const radius = Math.min(colW, colH) * 0.42;
        const quatrefoil = buildQuatrefoil(radius, { material: timberMaterial, depth: 0.05 });
        quatrefoil.position.set(colX, colY, INFILL_RECESSED_FRONT_Z - infillGroup.position.z);
        infillGroup.add(quatrefoil);
        // Backing infill plate behind the pierced ornament.
        const backing = makeTimberBox(colW * 0.94, colH * 0.94, INFILL_DEPTH, infillMaterial, `infill-${bayIndex}-${c}-back`);
        backing.position.set(colX, colY, -0.03);
        infillGroup.add(backing);
      } else if (pattern === 'brickNogging') {
        const courseH = 0.16;
        const courses = Math.max(1, Math.round(colH / courseH));
        for (let course = 0; course < courses; course++) {
          const cy = colY - colH / 2 + (course + 0.5) * (colH / courses);
          const jitter = (bayRand() - 0.5) * 0.02;
          const brick = makeTimberBox(colW * 0.94, colH / courses * 0.86, INFILL_DEPTH, infillMaterial, `infill-${bayIndex}-${c}-brick${course}`);
          brick.position.set(colX + jitter, cy, 0);
          infillGroup.add(brick);
        }
      } else if (pattern === 'repairPanel') {
        const plate = makeTimberBox(colW * 0.94, colH * 0.94, INFILL_DEPTH, repairMaterial, `infill-${bayIndex}-${c}-repair`);
        plate.position.set(colX, colY, 0);
        plate.userData.repaired = true;
        infillGroup.add(plate);
      } else {
        const plate = makeTimberBox(colW * 0.94, colH * 0.94, INFILL_DEPTH, infillMaterial, `infill-${bayIndex}-${c}`);
        plate.position.set(colX, colY, 0);
        infillGroup.add(plate);
      }
    }
  });

  // Deliberately NOT merged here (unlike RockPlinthSkirt.ts/ShingleSurface.ts's
  // own internal batching): callers (and tests) need to inspect/count the
  // individual named post/rail/brace/infill pieces. The final building group
  // gets one consolidating `mergeGroupMeshesByMaterial()` pass at the
  // SettlementRenderer.ts level, matching every other race kit's convention
  // of leaving per-piece structure intact until then.
  group.add(postsGroup, railsGroup, bracesGroup, studsGroup, infillGroup);
  void rand; // reserved for future per-panel jitter; kept for signature stability

  return group;
}

/**
 * Builds a full timber-frame facade from a list of bays (e.g. straight from
 * `FacadeGrammar`'s bay split, or a caller's own plain descriptors). Shares
 * exactly one corner post per interior bay boundary (n bays -> n+1 posts
 * total) rather than doubling posts at every seam.
 */
export function buildTimberFrameFacade(options: TimberFrameFacadeOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'timber-frame-facade';
  options.bays.forEach((bay, index) => {
    const panel = buildTimberFramePanel({
      width: bay.width,
      height: options.height,
      pattern: bay.pattern ?? options.defaultPattern,
      seed: tagSeed(options.seed, `BAY${index}`),
      timberMaterial: options.timberMaterial,
      infillMaterial: options.infillMaterial,
      repairMaterial: options.repairMaterial,
      exclude: bay.exclude,
      leftPost: index === 0,
      rightPost: true,
    });
    panel.position.x = bay.x + bay.width / 2;
    group.add(panel);
  });
  return group;
}
