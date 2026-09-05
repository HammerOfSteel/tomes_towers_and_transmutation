/**
 * StoneTowerOpenings.ts — shared recessed carved-opening geometry for
 * the elven stone-tower kit's windows and entrance: a proud stone
 * frame surrounding a genuinely recessed dark cavity, matching real
 * carved-stone tower construction (and the tabletop-terrain-kit
 * reference image's arched, framed, recessed doorways/windows) instead
 * of a flat glass box glued in front of the wall with no depth.
 *
 * Every opening shares ONE base shape: a pointed-arch outline
 * (`buildArchShape`) that degenerates to a plain rectangle when
 * `pointHeight` is 0 -- reused for both arched windows/doors and
 * square-topped openings (StoneTowerWindows.ts's cross_mullion type)
 * without a second shape-building code path.
 */

import * as THREE from 'three';
import { buildGothicArchShape, GOTHIC_ARCH_ROMANESQUE_RATIO } from './kit/GothicArch';

/**
 * Builds a 2D pointed-arch outline centered on the X axis, with its
 * BOTTOM edge at y=0 (the opening's sill/threshold) — a rectangular
 * body of `straightHeight`, capped by a true two-centred Gothic point
 * rising `pointHeight` further via two circular arcs whose centres sit
 * on the springing line. `pointHeight = 0` degenerates to a plain
 * rectangle (reused for square-topped openings).
 *
 * For shallow pointHeight relative to width (a common case, e.g. the
 * existing test case buildArchShape(1, 2, 0.6)), a full-span two-centred
 * arch would require a much taller rise than the legacy `pointHeight`
 * value describes. This adapter uses a "shouldered arch" compromise:
 * narrowing the curved cap to a Romanesque semicircle sized to hit the
 * exact legacy apex height, with flat horizontal "shoulder" segments on
 * either side at the springing height to bridge it to the full jamb width.
 * This is a recognized historical arch style (shouldered/depressed arch),
 * chosen to preserve the numeric apex-height contract for shallow legacy
 * values, not a bug or oversight.
 */
export function buildArchShape(halfWidth: number, straightHeight: number, pointHeight: number): THREE.Shape {
  if (pointHeight > 0) {
    const fullWidth = halfWidth * 2;
    const curvedWidth = Math.min(fullWidth, pointHeight * 2);
    const shoulderWidth = (fullWidth - curvedWidth) / 2;

    if (shoulderWidth <= 1e-6) {
      const archRatio = (pointHeight * pointHeight) / (fullWidth * fullWidth) + 0.25;
      return buildGothicArchShape({
        width: fullWidth,
        springHeight: straightHeight,
        archRatio,
      });
    }

    const curvedHalfWidth = curvedWidth / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(-halfWidth, straightHeight);
    shape.lineTo(-curvedHalfWidth, straightHeight);

    const archHead = buildGothicArchShape({
      width: curvedWidth,
      springHeight: straightHeight,
      archRatio: GOTHIC_ARCH_ROMANESQUE_RATIO,
    });

    shape.curves.push(archHead.curves[1]!, archHead.curves[2]!);
    shape.currentPoint.copy(new THREE.Vector2(curvedHalfWidth, straightHeight));
    shape.lineTo(halfWidth, straightHeight);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(-halfWidth, 0);
    return shape;
  }

  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(-halfWidth, straightHeight);
  shape.lineTo(halfWidth, straightHeight);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(-halfWidth, 0);
  return shape;
}

/** Builds the frame's outer-boundary-with-hole shape: an arch
 * `frameWidth` bigger all around than the inner opening, with the
 * inner opening's own outline punched out as a hole. */
function _buildFrameShape(halfWidth: number, straightHeight: number, pointHeight: number, frameWidth: number): THREE.Shape {
  const outer = buildArchShape(halfWidth + frameWidth, straightHeight + frameWidth, pointHeight > 0 ? pointHeight + frameWidth : 0);
  const inner = buildArchShape(halfWidth, straightHeight, pointHeight);
  outer.holes.push(inner);
  return outer;
}

export interface RecessedArchOptions {
  /** Full width of the opening (the frame's inner hole). */
  width: number;
  /** Height of the opening's rectangular body, below the point. */
  straightHeight: number;
  /** Height of the pointed top above the straight body. 0 = square top. */
  pointHeight: number;
  /** How far the cavity recedes INTO the wall from the wall surface. */
  recessDepth: number;
  /** Width of the proud stone border surrounding the opening. */
  frameWidth: number;
  /** How far the frame projects OUT from the wall surface. */
  frameProud: number;
}

/**
 * Builds one complete recessed, framed opening: a proud stone frame
 * (an extruded arch-with-a-hole shape, flush with the wall surface and
 * projecting outward by `frameProud`) surrounding a genuinely recessed
 * dark cavity (an extruded solid arch shape, receding from the wall
 * surface inward by `recessDepth`) — real depth between the two
 * pieces, not two coplanar decals. The returned group's local origin
 * is the opening's bottom-center (sill level) at the given `radius`
 * (the wall's outward radial distance); callers position the group's
 * `y`/rotation to place it on a specific ring/face.
 */
export function buildRecessedArchOpening(
  opts: RecessedArchOptions, radius: number, cavityMaterial: THREE.Material, frameMaterial: THREE.Material,
): THREE.Group {
  const { width, straightHeight, pointHeight, recessDepth, frameWidth, frameProud } = opts;
  const halfWidth = width / 2;

  const frameShape = _buildFrameShape(halfWidth, straightHeight, pointHeight, frameWidth);
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: frameProud, bevelEnabled: false, steps: 1 });
  const frameMesh = new THREE.Mesh(frameGeo, frameMaterial);
  // Flush with the wall surface, extruding OUTWARD (proud) from there.
  frameMesh.position.z = radius;
  frameMesh.castShadow = frameMesh.receiveShadow = true;

  // Slightly smaller than the frame's hole so the cavity's edge tucks
  // behind the frame's inner lip, avoiding a visible gap/z-fighting seam.
  const cavityShape = buildArchShape(halfWidth * 0.94, straightHeight * 0.96, pointHeight > 0 ? pointHeight * 0.9 : 0);
  const cavityGeo = new THREE.ExtrudeGeometry(cavityShape, { depth: recessDepth, bevelEnabled: false, steps: 1 });
  const cavityMesh = new THREE.Mesh(cavityGeo, cavityMaterial);
  // Recedes INWARD from the wall surface: local z=0 (darkest/back) sits at
  // radius-recessDepth, local z=recessDepth (the mouth) sits at radius,
  // flush with the frame's own inner lip.
  cavityMesh.position.z = radius - recessDepth;

  const group = new THREE.Group();
  group.add(cavityMesh, frameMesh);
  return group;
}
