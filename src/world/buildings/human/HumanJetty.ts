import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';

/**
 * HumanJetty.ts — race-specific (not shared-kit) flagship human silhouette
 * move (docs/superpowers/specs/2026-09-04-human-buildings-design.md §"Jetty
 * is the signature human silhouette move"): an upper storey projecting
 * `0.28-0.45 WU` past the lower wall, carried by a heavy bressummer beam at
 * the floor line, with exposed joist ends, corbels, and knee braces below —
 * deliberately NOT a single enlarged upper box. Kept race-specific per the
 * spec ("do not mark as shared unless another race explicitly consumes
 * it"), unlike `TimberFrame.ts` which IS shared kit from day one.
 *
 * Local coordinate convention: X spans the facade width (centered), Y is
 * world-up (`floorY` is the storey transition height), Z is the outward
 * relief direction (0 = lower-wall plane, `projection` = the jettied upper
 * wall's new forward plane). Every mesh uses stock `THREE.BoxGeometry`
 * (always UV-complete) to avoid the uv-attribute merge-drop bug class
 * documented in `MeshMergeUtils.ts`.
 */
export interface HumanJettyOptions {
  width: number;
  /** Height (world Y) of the floor transition this jetty carries. */
  floorY: number;
  /** How far the upper storey projects past the lower wall. 0.28-0.45 WU
   * per the doctrine; default 0.34. */
  projection?: number;
  seed: number;
  /** Bressummer beam / joists / corbels / knee braces. */
  timberMaterial: THREE.Material;
  /** Underside shadow/soffit board — defaults to timberMaterial if omitted. */
  shadowMaterial?: THREE.Material;
  /** World-unit spacing between exposed joist ends. 0.28-0.40 WU; default 0.32. */
  joistSpacing?: number;
  /** Emit a corbel bracket under every Nth joist. Default 2 (every other). */
  corbelEveryNth?: number;
  /** Emit knee braces at the two building corners. Default true. */
  kneeBraces?: boolean;
}

export interface HumanJettyResult {
  group: THREE.Group;
  /** The new forward Z offset the upper storey's own wall/frame should be
   * built at (equal to `projection`) — returned so callers never have to
   * re-derive or hardcode it. */
  facadeOffset: number;
}

const BRESSUMMER_HEIGHT = 0.2;
const BRESSUMMER_DEPTH_BASE = 0.18;
const JOIST_END_PROTRUSION = 0.08;
const JOIST_END_SIZE = 0.09;
const SHADOW_BOARD_HEIGHT = 0.035;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function makeBox(w: number, h: number, d: number, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)), material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** A diagonal bracket running in the Y-Z (side) plane from
 * (yWall, zWall) to (yJetty, zJetty) -- used for both corbels (short,
 * frequent) and knee braces (longer, at the corners). Rotated about the
 * local X axis so it reads correctly whether the facade runs along X. */
function makeSideBracket(
  x: number, yWall: number, zWall: number, yJetty: number, zJetty: number,
  crossSection: number, material: THREE.Material, name: string,
): THREE.Mesh {
  const dy = yJetty - yWall;
  const dz = zJetty - zWall;
  const length = Math.hypot(dy, dz);
  const mesh = makeBox(crossSection, length, crossSection, material, name);
  mesh.position.set(x, (yWall + yJetty) / 2, (zWall + zJetty) / 2);
  mesh.rotation.x = Math.atan2(dz, dy);
  return mesh;
}

/**
 * Builds one jetty assembly for a facade of the given width at the given
 * floor-transition height: a proud bressummer beam, exposed joist-end
 * stubs, alternating corbel brackets, corner knee braces, and a dark
 * underside shadow board.
 */
export function buildHumanJetty(options: HumanJettyOptions): HumanJettyResult {
  const width = Math.max(0.4, options.width);
  const floorY = options.floorY;
  const projection = clamp(options.projection ?? 0.34, 0.28, 0.45);
  const timberMaterial = options.timberMaterial;
  const shadowMaterial = options.shadowMaterial ?? timberMaterial;
  const joistSpacing = clamp(options.joistSpacing ?? 0.32, 0.28, 0.4);
  const corbelEveryNth = Math.max(1, options.corbelEveryNth ?? 2);
  const emitKneeBraces = options.kneeBraces ?? true;
  const rand = mulberry32(options.seed >>> 0);

  const group = new THREE.Group();
  group.name = 'human-jetty';

  const bressummerDepth = BRESSUMMER_DEPTH_BASE * (1 + (rand() - 0.5) * 0.1);

  // Bressummer beam: its OUTER (front) face sits at z = projection, its
  // top edge sits at floorY (the upper storey's frame rests directly on
  // it), matching "the wall plane above should start forward, while the
  // lower wall remains flush."
  const bressummer = makeBox(width, BRESSUMMER_HEIGHT, bressummerDepth, timberMaterial, 'bressummer');
  bressummer.position.set(0, floorY - BRESSUMMER_HEIGHT / 2, projection - bressummerDepth / 2);
  group.add(bressummer);

  // Exposed joist ends: short stubs poking past the bressummer's own
  // front face, evenly spaced along the width.
  const joistsGroup = new THREE.Group();
  joistsGroup.name = 'joist';
  const joistCount = Math.max(2, Math.round(width / joistSpacing));
  const actualSpacing = width / joistCount;
  for (let i = 0; i <= joistCount; i++) {
    const x = -width / 2 + i * actualSpacing;
    const sizeJ = 1 + (rand() - 0.5) * 0.15;
    const joist = makeBox(JOIST_END_SIZE * sizeJ, JOIST_END_SIZE * sizeJ, JOIST_END_PROTRUSION, timberMaterial, `joist-${i}`);
    joist.position.set(x, floorY - BRESSUMMER_HEIGHT * 0.4, projection + JOIST_END_PROTRUSION / 2);
    joistsGroup.add(joist);

    // Corbel bracket under every Nth joist, bridging the lower wall face
    // (z=0, just below the floor line) up and out to the bressummer's
    // underside.
    if (i % corbelEveryNth === 0 && i > 0 && i < joistCount) {
      const corbel = makeSideBracket(x, floorY - BRESSUMMER_HEIGHT - 0.22, 0, floorY - BRESSUMMER_HEIGHT, projection * 0.92, 0.07, timberMaterial, `corbel-${i}`);
      joistsGroup.add(corbel);
    }
  }
  group.add(joistsGroup);

  // Knee braces at the two building corners -- longer, chunkier brackets
  // than the mid-span corbels, the classic jettied-corner reinforcement.
  if (emitKneeBraces) {
    const kneeGroup = new THREE.Group();
    kneeGroup.name = 'knee-brace';
    for (const side of [-1, 1] as const) {
      const x = (side * width) / 2 - side * 0.05;
      const brace = makeSideBracket(x, floorY - BRESSUMMER_HEIGHT - 0.36, 0, floorY - BRESSUMMER_HEIGHT, projection * 0.95, 0.1, timberMaterial, `knee-${side < 0 ? 'l' : 'r'}`);
      kneeGroup.add(brace);
    }
    group.add(kneeGroup);
  }

  // Underside shadow/soffit board: a thin, dark full-width slab spanning
  // the set-back depth right beneath the bressummer, reading as the
  // real shading discontinuity a jetty's underside always shows from
  // street level (doctrine Rule 1 -- nothing here is coplanar with the
  // wall it sits under).
  const shadowBoard = makeBox(width, SHADOW_BOARD_HEIGHT, projection, shadowMaterial, 'shadow-board');
  shadowBoard.position.set(0, floorY - BRESSUMMER_HEIGHT - SHADOW_BOARD_HEIGHT / 2, projection / 2);
  group.add(shadowBoard);

  return { group, facadeOffset: projection };
}
