import * as THREE from 'three';

/**
 * Shutter.ts — shared kit module for louvred/planked window shutters
 * (docs/superpowers/specs/2026-09-04-vampire-buildings-design.md's
 * "[SHARED KIT] Shutter" requirement — the vampire signature "closed, not
 * broken" window vocabulary, reusable by any race with domestic
 * fenestration). A shutter leaf is a real hinged, layered assembly: a flat
 * leaf panel, angled louvre slats (or planked boards for a boarded-in-place
 * variant) proud of it, two hinge straps tying it to the wall, and an iron
 * holdback — never a texture-only louvre pattern.
 *
 * Depth ladder (relative to the wall face the shutter is mounted on, all
 * distinct from `DepthLadder.ts`'s FRAME/TRIM/PILASTER constants so a
 * shutter never reads as coplanar with the opening surround beneath it):
 *   0.16  holdback (mounted further out, away from the leaf itself)
 *   0.13  louvre slats / boarded planks (proud of the leaf panel)
 *   0.10  leaf panel (proud of the frame/surround)
 *   0.06  hinge straps (between the frame and the leaf)
 */
const LEAF_PROUD = 0.10;
const SLAT_PROUD = 0.13;
const HINGE_PROUD = 0.06;
const HOLDBACK_PROUD = 0.16;

export type ShutterState = 'closed_louvred' | 'one_ajar' | 'folded_open' | 'boarded_in_place';
export type ShutterHinge = 'left' | 'right';

export interface ShutterOptions {
  /** Width of this single leaf (a pair covering a full opening uses half the opening width per leaf). */
  width: number;
  height: number;
  /** Leaf/board material (dark wood). */
  material: THREE.Material;
  /** Hinge strap + holdback material (iron). Defaults to `material` if omitted. */
  hingeMaterial?: THREE.Material;
  state?: ShutterState;
  /** Which edge this leaf hinges from. Defaults to 'left'. */
  hinge?: ShutterHinge;
  /** Number of louvre slats (closed/ajar states only). Defaults to 6. */
  slatCount?: number;
  /** Wall-face Z this shutter is mounted in front of. Defaults to 0. */
  wallZ?: number;
  seed?: number;
}

export interface ShutterPairOptions extends Omit<ShutterOptions, 'hinge'> {
  /** Gap left between the two leaves when both are closed. Defaults to 0 (leaves meet at the centreline). */
  gap?: number;
  /** Per-leaf state override; falls back to the shared `state`. */
  leftState?: ShutterState;
  rightState?: ShutterState;
}

const ONE_AJAR_ANGLE = THREE.MathUtils.degToRad(45);
const FOLDED_OPEN_ANGLE = Math.PI;

function stateAngle(state: ShutterState): number {
  if (state === 'one_ajar') return ONE_AJAR_ANGLE;
  if (state === 'folded_open') return FOLDED_OPEN_ANGLE;
  return 0;
}

/**
 * Builds a single hinged shutter leaf. The returned group's local origin sits
 * at the bottom-centre of the leaf's CLOSED footprint (matching
 * `OpeningParts.ts`'s window/door group convention), so it can be positioned
 * exactly like a window/door opening. Internally the leaf geometry hangs off
 * a named `hinge-pivot` child at the hinge-side edge, so opening states are a
 * single Y rotation of that pivot.
 */
export function buildShutter(options: ShutterOptions): THREE.Group {
  const {
    width,
    height,
    material,
    hingeMaterial = material,
    state = 'closed_louvred',
    hinge = 'left',
    slatCount = 6,
    wallZ = 0,
  } = options;

  const group = new THREE.Group();
  group.name = 'shutter';
  group.position.z = wallZ;

  // dir: +1 means the leaf content extends in +X from the pivot (left
  // hinge); -1 means it extends in -X (right hinge). Either way the leaf's
  // CLOSED footprint is centred at local x=0 (matching a centred opening).
  const dir: 1 | -1 = hinge === 'left' ? 1 : -1;
  const pivotX = -dir * (width / 2);

  const pivot = new THREE.Group();
  pivot.name = 'hinge-pivot';
  pivot.position.set(pivotX, 0, 0);
  pivot.rotation.y = stateAngle(state);
  group.add(pivot);

  // Leaf content is built spanning local x in [0, dir*width] relative to the
  // pivot -- i.e. from the hinge edge outward to the far edge.
  const leafCenterX = dir * (width / 2);

  const leafThickness = 0.03;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(width, height, leafThickness), material);
  leaf.name = 'leaf';
  leaf.position.set(leafCenterX, height / 2, LEAF_PROUD);
  leaf.castShadow = leaf.receiveShadow = true;
  pivot.add(leaf);

  if (state === 'boarded_in_place') {
    const plankCount = Math.max(3, Math.round(width / 0.09));
    const plankGap = 0.006;
    const plankWidth = (width - plankGap * (plankCount - 1)) / plankCount;
    for (let i = 0; i < plankCount; i++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(plankWidth, height * 0.98, 0.018), material);
      board.name = `board-${i}`;
      const localX = i * (plankWidth + plankGap) + plankWidth / 2;
      board.position.set(leafCenterX - dir * (width / 2) + dir * localX, height / 2, SLAT_PROUD);
      board.castShadow = board.receiveShadow = true;
      pivot.add(board);
    }
  } else {
    const count = Math.max(5, slatCount);
    const slatHeight = height / count;
    const slatTiltRad = THREE.MathUtils.degToRad(28);
    for (let i = 0; i < count; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, slatHeight * 0.92, 0.02), material);
      slat.name = `slat-${i}`;
      slat.position.set(leafCenterX, slatHeight * (i + 0.5), SLAT_PROUD);
      slat.rotation.x = slatTiltRad;
      slat.castShadow = slat.receiveShadow = true;
      pivot.add(slat);
    }
  }

  // Hinge straps: two horizontal bars crossing from the leaf's hinge edge
  // onto the wall, near the top and bottom of the leaf.
  const hingeWidth = Math.min(0.12, width * 0.4);
  const hingeThickness = 0.02;
  for (const [name, t] of [['hinge-strap-top', 0.82], ['hinge-strap-bottom', 0.18]] as const) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(hingeWidth, 0.05, hingeThickness), hingeMaterial);
    strap.name = name;
    // Hinges live on the un-rotated wall/frame side, so they are children of
    // `group` (not `pivot`) at the fixed pivot X position.
    strap.position.set(pivotX + dir * (hingeWidth / 2), height * t, HINGE_PROUD);
    strap.castShadow = strap.receiveShadow = true;
    group.add(strap);
  }

  // Holdback: an iron bracket mounted on the wall beyond the leaf's outer
  // edge, used to latch the leaf open. Present regardless of state (a
  // closed shutter still has the hardware fixed to the wall).
  const holdback = new THREE.Group();
  holdback.name = 'holdback';
  holdback.position.set(pivotX + dir * (width * 0.94), height * 0.32, HOLDBACK_PROUD);
  const holdbackArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.09), hingeMaterial);
  holdbackArm.position.z = -0.045;
  holdbackArm.castShadow = holdbackArm.receiveShadow = true;
  holdback.add(holdbackArm);
  const holdbackHook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 10), hingeMaterial);
  holdbackHook.castShadow = holdbackHook.receiveShadow = true;
  holdback.add(holdbackHook);
  group.add(holdback);

  return group;
}

/**
 * Builds a symmetric pair of shutter leaves covering a full opening width,
 * hinged from the outer edges (left leaf hinges left, right leaf hinges
 * right) so both fold outward away from the opening. Matches
 * `OpeningParts.ts`'s window-group convention: centred on X, y=0 at the
 * bottom of the leaves.
 */
export function buildShutterPair(options: ShutterPairOptions): THREE.Group {
  const { width, height, material, hingeMaterial, state = 'closed_louvred', gap = 0, slatCount, wallZ, seed, leftState, rightState } = options;
  const group = new THREE.Group();
  group.name = 'shutter-pair';

  const leafWidth = (width - gap) / 2;

  const left = buildShutter({
    width: leafWidth,
    height,
    material,
    hingeMaterial,
    state: leftState ?? state,
    hinge: 'left',
    slatCount,
    wallZ,
    seed,
  });
  left.name = 'shutter-leaf-left';
  left.position.x = -leafWidth / 2 - gap / 2;

  const right = buildShutter({
    width: leafWidth,
    height,
    material,
    hingeMaterial,
    state: rightState ?? state,
    hinge: 'right',
    slatCount,
    wallZ,
    seed,
  });
  right.name = 'shutter-leaf-right';
  right.position.x = leafWidth / 2 + gap / 2;

  group.add(left, right);
  return group;
}
