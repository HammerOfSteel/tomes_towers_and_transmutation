/**
 * WallOcclusionManager.ts
 *
 * Hides wall meshes (and pillars) that visually overlap the player from the
 * camera's perspective.
 *
 * Technique — screen-space projection (works for isometric cameras):
 *   1. Project the player's feet/waist/head to NDC (normalised device coords).
 *   2. Project each wall mesh centre to NDC.
 *   3. If the wall is CLOSER to the camera than the player AND its NDC position
 *      falls within the player's screen-space silhouette → hide it.
 *
 * Raycasting misses adjacent tiles and cylinders whose geometry the ray barely
 * avoids. Screen-space covers the whole visual footprint: the moment a wall
 * appears behind the character's silhouette it disappears.
 *
 * Usage:
 *   const occ = new WallOcclusionManager();
 *   occ.update(camera, playerGroup, roomGroup);  // every frame
 *   occ.reset();                                  // on room change
 */

import * as THREE from 'three';

/** NDC radius around the player screen position inside which walls are hidden.
 *  NDC space goes -1..+1 on each axis. 0.3 ≈ ~20% of the screen width. */
const SCREEN_RADIUS_X = 0.32;
const SCREEN_RADIUS_Y = 0.38;   // slightly taller to catch walls above head

/** Depth margin: hide a wall only if it is at least this many world-units
 *  closer to the camera than the player (avoids hiding walls behind the player). */
const DEPTH_MARGIN = 0.5;

/** Set to true in DEV to log occlusion activity each frame. */
const DEBUG = false;

export class WallOcclusionManager {
  /** Meshes hidden this frame — restored at the start of the next update. */
  private readonly _hidden = new Set<THREE.Mesh>();
  /** Running count — exposed on window for Playwright / devtools inspection. */
  private _hiddenCount = 0;

  private readonly _wPos    = new THREE.Vector3();
  private readonly _wNDC    = new THREE.Vector3();
  private readonly _camPos  = new THREE.Vector3();

  // Three NDC sample points on the player (feet, waist, head)
  private readonly _pFeet  = new THREE.Vector3();
  private readonly _pWaist = new THREE.Vector3();
  private readonly _pHead  = new THREE.Vector3();

  constructor() {
    console.log('[WallOcclusion] initialized');
    (window as any).__wallOccluded = 0;
  }

  /**
   * Call once per frame.
   *
   * @param camera        The active camera.
   * @param playerGroup   The player's THREE.Group.
   * @param roomGroup     The current room's THREE.Group — only its tagged wall
   *                      meshes are tested.
   */
  update(
    camera:      THREE.Camera,
    playerGroup: THREE.Group,
    roomGroup:   THREE.Group | null,
  ): void {
    // ── Restore previous frame's hidden objects ───────────────────────────
    const prevCount = this._hidden.size;
    for (const mesh of this._hidden) mesh.visible = true;
    this._hidden.clear();
    if (DEBUG && prevCount > 0) console.debug(`[WallOcclusion] restored ${prevCount}`);

    if (!roomGroup) return;

    // ── Collect tagged meshes (walls + pillars share userData.isWall = true) ─
    const wallMeshes: THREE.Mesh[] = [];
    roomGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.userData.isWall === true) {
        wallMeshes.push(obj as THREE.Mesh);
      }
    });
    if (!wallMeshes.length) return;

    // ── Player NDC samples ────────────────────────────────────────────────
    playerGroup.getWorldPosition(this._pFeet);
    this._pWaist.copy(this._pFeet).setY(this._pFeet.y + 1.0);
    this._pHead .copy(this._pFeet).setY(this._pFeet.y + 1.8);

    this._pFeet .project(camera);
    this._pWaist.project(camera);
    this._pHead .project(camera);

    // Reference NDC: use the waist (most representative screen centre)
    const pNDC_X = this._pWaist.x;
    const pNDC_Y = this._pWaist.y;

    // ── Camera world position for depth check ─────────────────────────────
    camera.getWorldPosition(this._camPos);
    const playerWorldPos = new THREE.Vector3();
    playerGroup.getWorldPosition(playerWorldPos);
    const playerCamDist = playerWorldPos.distanceTo(this._camPos);

    // ── Test each wall / pillar mesh ───────────────────────────────────────
    for (const mesh of wallMeshes) {
      // 1. Depth check: mesh must be closer to camera than the player
      mesh.getWorldPosition(this._wPos);
      const wallCamDist = this._wPos.distanceTo(this._camPos);
      if (wallCamDist >= playerCamDist - DEPTH_MARGIN) continue;

      // 2. Screen-space overlap: NDC position within player silhouette
      this._wNDC.copy(this._wPos).project(camera);
      const dx = (this._wNDC.x - pNDC_X) / SCREEN_RADIUS_X;
      const dy = (this._wNDC.y - pNDC_Y) / SCREEN_RADIUS_Y;
      if (dx * dx + dy * dy > 1.0) continue;

      mesh.visible = false;
      this._hidden.add(mesh);
    }

    this._hiddenCount = this._hidden.size;
    (window as any).__wallOccluded = this._hiddenCount;
    if (DEBUG && this._hiddenCount > 0) {
      console.debug(`[WallOcclusion] hiding ${this._hiddenCount}`);
    }
  }

  /** Restore all hidden objects (call on room change or dispose). */
  reset(): void {
    const count = this._hidden.size;
    for (const mesh of this._hidden) mesh.visible = true;
    this._hidden.clear();
    this._hiddenCount = 0;
    (window as any).__wallOccluded = 0;
    if (count > 0) console.log(`[WallOcclusion] reset — restored ${count}`);
  }
}


import * as THREE from 'three';

/** Extra margin (world units) before the player so nearby walls clear cleanly. */
const RAY_MARGIN = 0.4;
