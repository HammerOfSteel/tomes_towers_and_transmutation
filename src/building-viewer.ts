/**
 * building-viewer.ts — Isolated Building Preview Entry Point
 *
 * Reads a DungeonPlan from localStorage ('ttt_building_preview'),
 * renders it with the existing shared systems (SceneManager,
 * BlueprintRenderer, PlayerController, etc.) and NOTHING else.
 *
 * Zero coupling to the tower game:
 *   - No MainMenu / CharacterCreation
 *   - No TowerGenerator / StoryRunner / StoryRunner
 *   - No enemy / combat / progression systems
 *   - No auto-save / save slots
 *   - No KayKit dungeon props / PropPlacer
 *   - No day-night cycle
 *
 * Debug flags exposed on window:
 *   window.__buildingViewerReady  — true once room is loaded
 *   window.__buildingViewerError  — string if startup fails
 *   window.__bvRoomId             — current room blueprint ID
 */

import * as THREE from 'three';
import { GameLoop }         from '@/core/GameLoop';
import { InputManager }     from '@/core/InputManager';
import { CameraRig }        from '@/core/CameraRig';
import { PhysicsWorld }     from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { SceneManager }     from '@/levels/SceneManager';
import { LightingSystem }   from '@/rendering/LightingSystem';
import type { DungeonPlan } from '@/levels/DungeonGenerator';
import type { Blueprint }   from '@/levels/blueprint';
import {
  isCategoryEnabled, loadExternalAssetConfig, saveExternalAssetConfig,
} from '@/world/ExternalAssetConfig';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas   = document.getElementById('bv-canvas')  as HTMLCanvasElement;
const statusEl = document.getElementById('bv-status')   as HTMLDivElement;
const roomEl   = document.getElementById('bv-room-name') as HTMLDivElement;

function showStatus(msg: string): void {
  statusEl.textContent = msg;
  statusEl.style.display = 'block';
}

// ── Plan loading ──────────────────────────────────────────────────────────────

function loadPlan(): DungeonPlan | null {
  const raw = localStorage.getItem('ttt_building_preview');
  if (!raw) {
    console.warn('[BuildingViewer] ttt_building_preview not found in localStorage');
    return null;
  }
  try {
    const data = JSON.parse(raw) as {
      rooms:       Record<string, Blueprint>;
      startRoomId: string;
      seed:        number;
    };
    if (!data.rooms || !data.startRoomId) throw new Error('plan missing rooms or startRoomId');
    return {
      rooms:       new Map(Object.entries(data.rooms)),
      startRoomId: data.startRoomId,
      seed:        data.seed ?? 0,
    };
  } catch (e) {
    console.error('[BuildingViewer] failed to parse plan:', e);
    (window as any).__buildingViewerError = String(e);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[BuildingViewer] starting…');

  // ── 1. Load plan ────────────────────────────────────────────────────────────
  const plan = loadPlan();
  if (!plan) {
    showStatus(
      'No plan loaded.\n\nOpen Overworld Studio, double-click a ward, and click 🎮 Play in 3D.',
    );
    (window as any).__buildingViewerReady = false;
    return;
  }
  console.log('[BuildingViewer] plan loaded — rooms:', plan.rooms.size, '| start:', plan.startRoomId);

  // ── 2. Renderer ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    cameraRig.camera.aspect = window.innerWidth / window.innerHeight;
    cameraRig.camera.updateProjectionMatrix();
  });

  // ── 3. Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0808, 18, 40);

  // Ambient + directional light (LightingSystem will add torches per room)
  const ambient = new THREE.AmbientLight(0x443322, 0.4);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffeedd, 0.6);
  dirLight.position.set(5, 10, 5);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // ── 4. Camera ────────────────────────────────────────────────────────────────
  const cameraRig = new CameraRig(window.innerWidth / window.innerHeight);

  // ── 5. Physics ───────────────────────────────────────────────────────────────
  const physics = new PhysicsWorld();
  await physics.init();

  // ── 6. Player ────────────────────────────────────────────────────────────────
  const player = new PlayerController(physics, new THREE.Vector3(0, 1.5, 2));
  // Normal walking mode — same feel as the tower game
  player.flyMode   = false;
  player.noClipMode = false;
  scene.add(player.group);

  // ── 7. Input ─────────────────────────────────────────────────────────────────
  const input = new InputManager(canvas);

  // ── 8. Lighting ──────────────────────────────────────────────────────────────
  const lighting = new LightingSystem(scene);

  // ── 9. SceneManager ──────────────────────────────────────────────────────────
  const sceneManager = new SceneManager(scene, physics, player, () => {});
  sceneManager.showFloorTitle = false;  // suppress tower floor-name overlay

  // Floor physics: each room needs a static floor collider so the player doesn't
  // fall through. Tracked here so the old one is removed when the room changes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _floorBody: any = null;

  sceneManager.onRoomLoaded = (bp: Blueprint) => {
    // Replace floor physics body for the new room
    if (_floorBody) {
      physics.removeBody(_floorBody);
      _floorBody = null;
    }
    const hw = ((bp.width  - 1) * bp.cellSize) / 2;
    const hd = ((bp.depth  - 1) * bp.cellSize) / 2;
    _floorBody = physics.createStaticBox(
      new THREE.Vector3(0, -0.1, 0),
      new THREE.Vector3(hw, 0.1, hd),
    );
    console.log('[BuildingViewer] floor body created for', bp.id, hw.toFixed(1), 'x', hd.toFixed(1));

    lighting.clearTorches();
    lighting.addTorchesForBlueprint(bp);
    lighting.applyPreset('dungeon');
    roomEl.textContent = bp.id.replace(/_/g, ' ');
    (window as any).__bvRoomId = bp.id;
    console.log('[BuildingViewer] room loaded:', bp.id);
  };

  // Exterior door — show a brief message but don't close (it's a preview)
  sceneManager.onExitTrigger = () => {
    console.log('[BuildingViewer] reached exterior door — building exit');
    roomEl.textContent = 'Building exit';
    setTimeout(() => { roomEl.textContent = (sceneManager.currentBlueprint?.id ?? '').replace(/_/g, ' '); }, 1500);
  };

  // ── 10b. Real-vs-procedural dungeon-kit toggle ───────────────────────────────
  // Dev-only knob (Task 4 of
  // docs/superpowers/plans/2026-09-26-external-assets-dungeons.md), mirroring
  // SettlementLabPanel.ts's "Real buildings" checkbox: flips the same
  // 'dungeons-towers' ExternalAssetConfig category this whole viewer is meant
  // to QA, then reloads the current plan so the change is visible immediately.
  const toggleWrap = document.createElement('label');
  toggleWrap.style.cssText =
    'position:fixed;top:16px;left:16px;z-index:20;display:flex;align-items:center;gap:6px;' +
    'padding:6px 10px;background:rgba(10,8,8,.85);border:1px solid #4a3828;border-radius:4px;' +
    'color:#c8a96e;font-family:"IM Fell English",Georgia,serif;font-size:.85rem;cursor:pointer;';
  const toggleCheckbox = document.createElement('input');
  toggleCheckbox.type = 'checkbox';
  toggleCheckbox.checked = isCategoryEnabled('dungeons-towers');
  toggleWrap.append(toggleCheckbox, document.createTextNode('Real dungeon-kit assets'));
  document.body.appendChild(toggleWrap);
  toggleCheckbox.addEventListener('change', () => {
    const cfg = loadExternalAssetConfig();
    cfg.enabled['dungeons-towers'] = toggleCheckbox.checked;
    saveExternalAssetConfig(cfg);
    console.log('[BuildingViewer] dungeons-towers real assets:', toggleCheckbox.checked, '— reloading plan');
    sceneManager.loadDungeon(plan);
  });

  // ── 11. Load rooms ────────────────────────────────────────────────────────────
  sceneManager.loadDungeon(plan);
  console.log('[BuildingViewer] dungeon loaded, starting room:', plan.startRoomId);

  // ── 11b. Geometric-fit debug hook (test-only) ────────────────────────────────
  // Exposes every currently-rendered wall/floor/door mesh's world-space
  // AABB (min/max, not just size) so an external Playwright script can
  // independently verify REAL geometric fit — adjacent wall pieces
  // actually touch with no gap, every non-wall cell has exactly one floor
  // tile with no holes, door openings are correctly sized/positioned —
  // not just that a mesh's longest axis points the "expected" way (which
  // caught orientation bugs but NOT gaps/holes/misalignment). Reads
  // BlueprintRenderer.ts's per-tile userData (tileX/tileZ/tileType for
  // walls, tileX/tileZ/isFloor for floor tiles, tileX/tileZ/isDoor for
  // doors — all set purely for this purpose, not read by gameplay code).
  (window as any).__bvGetRoomGeometry = () => {
    function aabb(obj: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(obj);
      return {
        min: { x: +box.min.x.toFixed(4), y: +box.min.y.toFixed(4), z: +box.min.z.toFixed(4) },
        max: { x: +box.max.x.toFixed(4), y: +box.max.y.toFixed(4), z: +box.max.z.toFixed(4) },
      };
    }
    const walls: Array<{ tileX: number; tileZ: number; longAxis: 'x' | 'z'; isBoxGeometry: boolean } & ReturnType<typeof aabb>> = [];
    const floors: Array<{ tileX: number; tileZ: number } & ReturnType<typeof aabb>> = [];
    const doors: Array<{ tileX: number; tileZ: number; isBoxGeometry: boolean } & ReturnType<typeof aabb>> = [];
    const seenFloor = new Set<string>();
    const seenDoor = new Set<string>();
    const seenWall = new Set<string>();
    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      // Floor tiles: userData is set on the top-level clone (`tileMesh` in
      // BlueprintRenderer.ts), which may itself be a multi-mesh Group (OBJ/
      // GLB clones), so walk up like walls/doors rather than reading
      // `mesh.userData` directly.
      let fp: THREE.Object3D | null = mesh;
      while (fp && fp.userData.tileX === undefined) fp = fp.parent;
      if (fp && fp.userData.isFloor) {
        const key = `${fp.userData.tileX},${fp.userData.tileZ}`;
        if (seenFloor.has(key)) return; // real floor pieces can be multi-mesh; count once
        seenFloor.add(key);
        floors.push({ tileX: fp.userData.tileX, tileZ: fp.userData.tileZ, ...aabb(fp) });
        return;
      }
      if (mesh.userData.isWall) {
        // A true corner tile renders TWO wall pieces sharing the same
        // tileContainer (see BlueprintRenderer.ts's
        // computeWallRunRotations()), so dedupe must happen per PIECE
        // instance (the direct child of the tagged container), not per
        // tile — otherwise the second corner panel is silently dropped
        // and geometric-fit checks only ever see one of the two faces.
        let piece: THREE.Object3D = mesh;
        while (piece.parent && piece.parent.userData.tileX === undefined) piece = piece.parent;
        const container = piece.parent;
        if (!container || container.userData.tileType !== 'wall') return; // pillars have no run direction
        if (seenWall.has(piece.uuid)) return;
        seenWall.add(piece.uuid);
        const box = new THREE.Box3().setFromObject(piece);
        const size = new THREE.Vector3();
        box.getSize(size);
        walls.push({
          tileX: container.userData.tileX, tileZ: container.userData.tileZ,
          longAxis: size.x >= size.z ? 'x' : 'z',
          isBoxGeometry: mesh.geometry.type === 'BoxGeometry',
          ...aabb(piece),
        });
        return;
      }
      let dp: THREE.Object3D | null = mesh;
      while (dp && dp.userData.tileX === undefined) dp = dp.parent;
      if (dp && dp.userData.isDoor) {
        const key = `${dp.userData.tileX},${dp.userData.tileZ}`;
        if (seenDoor.has(key)) return;
        seenDoor.add(key);
        doors.push({
          tileX: dp.userData.tileX, tileZ: dp.userData.tileZ,
          isBoxGeometry: mesh.geometry.type === 'BoxGeometry',
          ...aabb(dp),
        });
      }
    });
    return { walls, floors, doors };
  };
  // Back-compat alias for the earlier orientation-only harness.
  (window as any).__bvGetWallMeshes = () => (window as any).__bvGetRoomGeometry().walls;

  // ── 12. Game loop ─────────────────────────────────────────────────────────────
  const gameLoop = new GameLoop();

  gameLoop.onTick((dt: number) => {
    physics.step(dt);
    player.update(input.state, dt);
    sceneManager.update(dt, player.group.position);
    cameraRig.updateZoom(dt);
    cameraRig.follow(player.group.position, dt);
    renderer.render(scene, cameraRig.camera);
  });

  gameLoop.start();

  // ── 13. Esc to close ──────────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.close();
  });

  // ── 14. Ready ─────────────────────────────────────────────────────────────────
  (window as any).__buildingViewerReady = true;
  (window as any).__bvRoomId = plan.startRoomId;
  console.log('[BuildingViewer] ✓ ready — room:', plan.startRoomId);
}

main().catch((e) => {
  console.error('[BuildingViewer] fatal error:', e);
  (window as any).__buildingViewerError = String(e);
  showStatus(`Failed to start: ${e}`);
});
