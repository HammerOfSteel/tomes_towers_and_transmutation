/**
 * HidePanel.ts — framed stretched-hide panels (docs/superpowers/specs/
 * 2026-09-04-orcish-buildings-design.md section 5: `[SHARED KIT]
 * HidePanel.ts`/`StretchedSkin.ts`). Doctrine rule: "frame first, skin
 * second" -- every hide wall/roof panel must show real proud ribs/posts
 * BEFORE the skin is emitted; a smooth cone/dome without ribs is a banned
 * blob (doctrine Part 2 Rule 3). This module is the orcish/nomadic
 * sibling of the masonry kit's `buildWallSurfaceBlocks()`/`OpeningParts`
 * combination: ribs stand proud (depth-ladder POST-ish offset), the skin
 * sags between them, and every free edge gets a thickened "return" strip
 * rather than reading as a bare flat plane (Rule 3: "flat untextured
 * plane as a visible surface" -> "extruded thickness + chamfer/return on
 * every free edge").
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { OctagonFace } from '../StoneTowerShape';
import { buildTaperedLog } from './LashedTimber';

export interface HidePanelOptions {
  width: number;
  height: number;
  skinMaterial: THREE.Material;
  ribMaterial: THREE.Material;
  /** Number of vertical ribs across the panel width. Default 3 (>= 2 required by doctrine). */
  ribCount?: number;
  /** How far the skin sags inward (-Z) at each bay's midpoint, in world units. Default 0.06. */
  sag?: number;
  /** Rib radius at its base. Default 0.045. */
  ribRadius?: number;
  /** How far ribs stand proud of the skin plane (z=0). Default 0.08 (depth-ladder POST-ish). */
  ribProud?: number;
  /** Thickness of the edge-return strips framing the skin's free edges. Default 0.04. */
  edgeThickness?: number;
  seed?: number;
}

/** Builds a sagging skin plane: a subdivided `THREE.PlaneGeometry` whose
 * vertices are displaced along -Z (inward, away from the ribs) by a
 * sine bump peaking at the midpoint of each bay between ribs and
 * returning to 0 at each rib position -- real per-vertex curvature, not
 * a flat coplanar surface, while keeping the stock plane's own `uv`
 * attribute intact (avoids the hand-rolled-geometry uv-drop bug class). */
export function buildSaggingSkin(width: number, height: number, ribCount: number, sag: number, material: THREE.Material): THREE.Mesh {
  const segsX = Math.max(8, (ribCount - 1) * 6);
  const segsY = 4;
  const geo = new THREE.PlaneGeometry(width, height, segsX, segsY);
  const pos = geo.attributes.position;
  const bayWidth = width / Math.max(1, ribCount - 1);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    // x runs from -width/2 to +width/2; ribs sit at evenly spaced
    // multiples of bayWidth from the left edge.
    const localX = x + width / 2;
    const bayT = (localX % bayWidth) / bayWidth;
    const bump = Math.sin(Math.PI * bayT); // 0 at rib positions, 1 at bay midpoint
    pos.setZ(i, -sag * bump);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'skin';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Builds 4 thin boxed "return" strips framing the skin's free edges
 * (top/bottom/left/right), each turned back toward the wall by
 * `edgeThickness` -- reads as a hide edge tucked/hemmed over a frame
 * rather than an infinitely-thin plane. */
function buildEdgeReturns(width: number, height: number, edgeThickness: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const specs: Array<[string, number, number, number, number]> = [
    // name, sizeX, sizeY, posX, posY
    ['edge-return-top', width + edgeThickness, edgeThickness, 0, height / 2],
    ['edge-return-bottom', width + edgeThickness, edgeThickness, 0, -height / 2],
    ['edge-return-left', edgeThickness, height, -width / 2, 0],
    ['edge-return-right', edgeThickness, height, width / 2, 0],
  ];
  for (const [name, sx, sy, px, py] of specs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, edgeThickness), material);
    mesh.name = name;
    mesh.position.set(px, py, -edgeThickness / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

/**
 * Builds one framed hide panel in the local XY plane (width x height,
 * centered at origin, facing +Z): ribs stand proud at `ribProud`, the
 * skin sags between them at z<=0, and 4 edge-return strips frame the
 * skin's boundary. Callers rotate/position the whole group onto a wall
 * face (see `buildRibbedHideWall`) or a roof panel (see `RibbedRoof.ts`).
 */
export function buildHidePanel(options: HidePanelOptions): THREE.Group {
  const {
    width, height, skinMaterial, ribMaterial,
    ribCount = 3, sag = 0.06, ribRadius = 0.045, ribProud = 0.08, edgeThickness = 0.04,
  } = options;
  const g = new THREE.Group();
  g.name = 'hide-panel';

  const skin = buildSaggingSkin(width, height, ribCount, sag, skinMaterial);
  g.add(skin);

  g.add(buildEdgeReturns(width, height, edgeThickness, ribMaterial));

  for (let i = 0; i < ribCount; i++) {
    const t = ribCount === 1 ? 0.5 : i / (ribCount - 1);
    const x = -width / 2 + t * width;
    const rib = buildTaperedLog({ length: height, radiusBase: ribRadius, radiusTop: ribRadius * 0.85, material: ribMaterial });
    rib.name = `rib-${i}`;
    rib.position.set(x, 0, ribProud);
    g.add(rib);
  }

  return g;
}

export interface RibbedHideWallOptions {
  ribCount?: number;
  sag?: number;
  ribRadius?: number;
  ribProud?: number;
  edgeThickness?: number;
}

/**
 * Builds one `buildHidePanel()` per face, oriented onto that face
 * (rotated so the panel's local +Z points along the face's own outward
 * normal, positioned at the face midpoint) -- the hide-infill sibling of
 * `buildLogCourseWall()`, used for orcish hide bays between log posts.
 */
export function buildRibbedHideWall(
  faces: OctagonFace[],
  height: number,
  seed: number,
  skinMaterial: THREE.Material,
  ribMaterial: THREE.Material,
  opts: RibbedHideWallOptions = {},
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ribbed-hide-wall';
  const rand = mulberry32(seed >>> 0);

  for (const face of faces) {
    const [ax, az] = face.a;
    const [bx, bz] = face.b;
    const faceLen = Math.hypot(bx - ax, bz - az);
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    const ribCount = opts.ribCount ?? Math.max(2, Math.round(faceLen / 0.9) + 1);
    const panel = buildHidePanel({
      width: faceLen * 0.94,
      height,
      skinMaterial,
      ribMaterial,
      ribCount,
      sag: opts.sag ?? 0.05 + rand() * 0.03,
      ribRadius: opts.ribRadius,
      ribProud: opts.ribProud,
      edgeThickness: opts.edgeThickness,
    });
    panel.position.set(midX, height / 2, midZ);
    panel.rotation.y = face.normalAngle;
    g.add(panel);
  }
  return g;
}
