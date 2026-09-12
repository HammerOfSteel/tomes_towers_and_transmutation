import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';

export interface ShingleSurfaceOptions {
  /** World units per exposed tile course up the slope. Default 0.35. */
  courseHeight?: number;
  /**
   * Nominal full-width tile columns across the panel. Staggered courses may
   * emit one extra trimmed edge tile so the tile field still stays inside the
   * requested width instead of overhanging past the verges.
   */
  tilesPerCourse?: number;
  /** 0-1 fraction of per-tile size/position jitter. Default 0.12. */
  jitter?: number;
  /** Bottom-edge silhouette for each exposed tile butt. Default rectangular. */
  silhouette?: 'rectangular' | 'diamond' | 'fishscale';
  /** Exposed bottom-edge kick away from the roof plane; clamped to 2-5°. */
  kickDegrees?: number;
  /** Whether to add ridge/eave/verge trim. Defaults to all true. */
  trim?: { ridge?: boolean; eave?: boolean; verge?: boolean };
}

type ShingleSilhouette = NonNullable<ShingleSurfaceOptions['silhouette']>;

interface TileCenterRecord {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CourseTileSlot {
  minX: number;
  maxX: number;
  centerX: number;
}

interface TileCoverageBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const DEFAULT_COURSE_HEIGHT = 0.35;
const DEFAULT_JITTER = 0.12;
const DEFAULT_KICK_DEGREES = 3;
/**
 * Roof assemblers in this codebase compose many panels of different world
 * sizes, so an absolute "all panels stay under N triangles" promise scales
 * badly and becomes false as panels get larger. The stable contract here is a
 * density budget instead: each emitted tile silhouette has a fixed triangle
 * ceiling, and staggered rows only add trimmed edge tiles rather than denser
 * geometry. Total panel cost is therefore predictable from emitted tile count
 * plus the small constant trim overhead.
 */
const SHINGLE_TILE_TRIANGLE_BUDGET: Record<ShingleSilhouette, number> = {
  rectangular: 12,
  diamond: 16,
  fishscale: 48,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildCourseTileSlots(width: number, tilesPerCourse: number, courseIndex: number): CourseTileSlot[] {
  const tileSpan = width / tilesPerCourse;
  const rowOffset = courseIndex % 2 === 1 ? tileSpan * 0.5 : 0;
  const startIndex = rowOffset > 0 ? -1 : 0;
  const slots: CourseTileSlot[] = [];
  for (let tileIndex = startIndex; tileIndex < tilesPerCourse; tileIndex++) {
    const nominalMinX = -width / 2 + tileSpan * tileIndex + rowOffset;
    const nominalMaxX = nominalMinX + tileSpan;
    const minX = Math.max(nominalMinX, -width / 2);
    const maxX = Math.min(nominalMaxX, width / 2);
    if (maxX - minX <= 1e-6) continue;
    slots.push({
      minX,
      maxX,
      centerX: (minX + maxX) * 0.5,
    });
  }
  return slots;
}

function markMergedMeshesForLighting(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function buildTileShape(width: number, height: number, silhouette: ShingleSilhouette): THREE.Shape {
  const halfW = width / 2;
  const shape = new THREE.Shape();

  switch (silhouette) {
    case 'diamond': {
      const shoulderY = height * 0.36;
      shape.moveTo(-halfW, height);
      shape.lineTo(halfW, height);
      shape.lineTo(halfW, shoulderY);
      shape.lineTo(0, 0);
      shape.lineTo(-halfW, shoulderY);
      break;
    }
    case 'fishscale': {
      const shoulderY = height * 0.34;
      shape.moveTo(-halfW, height);
      shape.lineTo(halfW, height);
      shape.lineTo(halfW, shoulderY);
      shape.quadraticCurveTo(halfW * 0.52, -height * 0.1, 0, 0);
      shape.quadraticCurveTo(-halfW * 0.52, -height * 0.1, -halfW, shoulderY);
      break;
    }
    case 'rectangular':
    default:
      shape.moveTo(-halfW, height);
      shape.lineTo(halfW, height);
      shape.lineTo(halfW, 0);
      shape.lineTo(-halfW, 0);
      break;
  }

  shape.closePath();
  return shape;
}

function silhouetteLocalMinY(height: number, silhouette: ShingleSilhouette): number {
  return silhouette === 'fishscale' ? -height * 0.1 : 0;
}

function createShingleTileGeometry(
  width: number,
  height: number,
  depth: number,
  kickDegrees: number,
  silhouette: ShingleSilhouette,
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(buildTileShape(width, height, silhouette), {
    depth,
    bevelEnabled: false,
    curveSegments: silhouette === 'fishscale' ? 5 : 2,
    steps: 1,
  });

  const liftAtButt = Math.tan(THREE.MathUtils.degToRad(kickDegrees)) * height;
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    const t = 1 - clamp(y / height, 0, 1);
    positions.setZ(index, positions.getZ(index) + liftAtButt * t);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createTrimMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds one rectangular roof-slope panel in local XY space: X spans the
 * roof width, Y climbs from the eave (0) to the ridge (`slopeLength`), and
 * Z is the panel's outward relief. The caller positions/rotates this panel
 * into a larger roof silhouette.
 */
export function buildShingleSurface(
  width: number,
  slopeLength: number,
  seed: number,
  material: THREE.Material,
  opts: ShingleSurfaceOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shingle-surface';

  const silhouette: ShingleSilhouette = opts.silhouette ?? 'rectangular';
  const requestedCourseHeight = Math.max(0.1, opts.courseHeight ?? DEFAULT_COURSE_HEIGHT);
  const courseCount = Math.max(1, Math.round(slopeLength / requestedCourseHeight));
  const actualCourseHeight = slopeLength / courseCount;
  const tilesPerCourse = Math.max(3, opts.tilesPerCourse ?? Math.round(width / 0.55));
  const tileSpan = width / tilesPerCourse;
  const tileDepth = Math.max(0.035, actualCourseHeight * 0.14);
  const tileHeightBase = actualCourseHeight * 1.65;
  const jitter = clamp(opts.jitter ?? DEFAULT_JITTER, 0, 1);
  const kickDegrees = clamp(opts.kickDegrees ?? DEFAULT_KICK_DEGREES, 2, 5);
  const trim = {
    ridge: opts.trim?.ridge ?? true,
    eave: opts.trim?.eave ?? true,
    verge: opts.trim?.verge ?? true,
  };
  const rand = mulberry32(seed);
  const tileBounds: TileCoverageBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };

  group.userData.courseCount = courseCount;
  group.userData.courseHeight = actualCourseHeight;
  group.userData.tilesPerCourse = tilesPerCourse;
  group.userData.kickDegrees = kickDegrees;
  group.userData.silhouette = silhouette;
  group.userData.tileBounds = tileBounds;
  group.userData.triangleBudgetPerTile = SHINGLE_TILE_TRIANGLE_BUDGET[silhouette];

  for (let courseIndex = 0; courseIndex < courseCount; courseIndex++) {
    const courseGroup = new THREE.Group();
    courseGroup.name = `course-${courseIndex}`;

    const rowOffset = courseIndex % 2 === 1 ? tileSpan * 0.5 : 0;
    const tileSlots = buildCourseTileSlots(width, tilesPerCourse, courseIndex);
    const centers: TileCenterRecord[] = [];

    for (const slot of tileSlots) {
      const sizeJitter = 1 + (rand() - 0.5) * jitter;
      const heightJitter = 1 + (rand() - 0.5) * jitter;
      const slotWidth = slot.maxX - slot.minX;
      const tileWidth = Math.min(slotWidth, slotWidth * 0.92 * sizeJitter);
      const tileHeight = tileHeightBase * heightJitter;
      const localDepth = tileDepth * (1 + (rand() - 0.5) * jitter * 0.65);
      const xJitter = (rand() - 0.5) * tileSpan * jitter * 0.35;
      const yJitter = (rand() - 0.5) * actualCourseHeight * jitter * 0.2;
      const x = clamp(slot.centerX + xJitter, slot.minX + tileWidth / 2, slot.maxX - tileWidth / 2);
      const y = courseIndex * actualCourseHeight + yJitter;
      const mesh = new THREE.Mesh(
        createShingleTileGeometry(tileWidth, tileHeight, localDepth, kickDegrees, silhouette),
        material,
      );
      mesh.position.set(x, y, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      courseGroup.add(mesh);
      centers.push({ x, y, width: tileWidth, height: tileHeight });
      tileBounds.minX = Math.min(tileBounds.minX, x - tileWidth / 2);
      tileBounds.maxX = Math.max(tileBounds.maxX, x + tileWidth / 2);
      tileBounds.minY = Math.min(tileBounds.minY, y + silhouetteLocalMinY(tileHeight, silhouette));
      tileBounds.maxY = Math.max(tileBounds.maxY, y + tileHeight);
    }

    courseGroup.userData.courseIndex = courseIndex;
    courseGroup.userData.rowOffset = rowOffset;
    courseGroup.userData.kickDegrees = kickDegrees;
    courseGroup.userData.silhouette = silhouette;
    courseGroup.userData.tileCenters = centers;
    group.add(courseGroup);

    // Merge within each course so the caller still has one named row per
    // course (useful for tests/inspection) while preserving the codebase's
    // usual "many small pieces, one shared material" batching pattern.
    mergeGroupMeshesByMaterial(courseGroup);
    markMergedMeshesForLighting(courseGroup);
  }

  const panelCenterOffsetX = (tileBounds.minX + tileBounds.maxX) * 0.5;
  if (Math.abs(panelCenterOffsetX) > 1e-6) {
    for (const child of group.children) child.position.x -= panelCenterOffsetX;
    for (const course of group.children) {
      if (!(course instanceof THREE.Group) || !course.name.startsWith('course-')) continue;
      const centers = course.userData.tileCenters as TileCenterRecord[] | undefined;
      if (!centers) continue;
      for (const center of centers) center.x -= panelCenterOffsetX;
    }
    tileBounds.minX -= panelCenterOffsetX;
    tileBounds.maxX -= panelCenterOffsetX;
  }

  if (trim.eave) {
    const eaveGroup = new THREE.Group();
    eaveGroup.name = 'eave-trim';
    const skirtTopY = actualCourseHeight * 0.08;
    const skirtBottomY = Math.min(tileBounds.minY - actualCourseHeight * 0.12, -actualCourseHeight * 0.18);
    const skirtH = skirtTopY - skirtBottomY;
    const skirt = createTrimMesh(
      new THREE.BoxGeometry(tileBounds.maxX - tileBounds.minX + tileSpan * 0.24, skirtH, tileDepth * 1.5),
      material,
    );
    skirt.position.set((tileBounds.minX + tileBounds.maxX) / 2, (skirtBottomY + skirtTopY) / 2, tileDepth * 0.55);
    eaveGroup.add(skirt);
    mergeGroupMeshesByMaterial(eaveGroup);
    markMergedMeshesForLighting(eaveGroup);
    group.add(eaveGroup);
  }

  if (trim.ridge) {
    const ridgeGroup = new THREE.Group();
    ridgeGroup.name = 'ridge-trim';
    const capH = Math.max(actualCourseHeight * 0.28, tileBounds.maxY - slopeLength + actualCourseHeight * 0.1);
    const cap = createTrimMesh(
      new THREE.BoxGeometry(tileBounds.maxX - tileBounds.minX + tileSpan * 0.18, capH, tileDepth * 1.45),
      material,
    );
    cap.position.set((tileBounds.minX + tileBounds.maxX) / 2, slopeLength + capH * 0.5, tileDepth * 0.35);
    ridgeGroup.add(cap);
    mergeGroupMeshesByMaterial(ridgeGroup);
    markMergedMeshesForLighting(ridgeGroup);
    group.add(ridgeGroup);
  }

  if (trim.verge) {
    const vergeGroup = new THREE.Group();
    vergeGroup.name = 'verge-trim';
    const vergeW = Math.max(tileSpan * 0.24, (tileBounds.maxX - tileBounds.minX - width) + tileSpan * 0.28);
    const vergeH = tileBounds.maxY - tileBounds.minY + actualCourseHeight * 0.12;
    const vergeDepth = tileDepth * 1.25;
    const left = createTrimMesh(new THREE.BoxGeometry(vergeW, vergeH, vergeDepth), material);
    const right = createTrimMesh(new THREE.BoxGeometry(vergeW, vergeH, vergeDepth), material);
    left.position.set(tileBounds.minX, (tileBounds.minY + tileBounds.maxY) / 2, tileDepth * 0.35);
    right.position.set(tileBounds.maxX, (tileBounds.minY + tileBounds.maxY) / 2, tileDepth * 0.35);
    vergeGroup.add(left, right);
    mergeGroupMeshesByMaterial(vergeGroup);
    markMergedMeshesForLighting(vergeGroup);
    group.add(vergeGroup);
  }

  return group;
}
