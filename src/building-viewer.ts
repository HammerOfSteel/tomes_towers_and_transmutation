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
import { WallOcclusionManager } from '@/rendering/WallOcclusionManager';
import type { DungeonPlan } from '@/levels/DungeonGenerator';
import type { Blueprint }   from '@/levels/blueprint';

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
  // ── 10. Wall occlusion ────────────────────────────────────────────────────────
  const wallOccMgr = new WallOcclusionManager();

  // Floor physics: each room needs a static floor collider so the player doesn't
  // fall through. Tracked here so the old one is removed when the room changes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _floorBody: any = null;

  sceneManager.onRoomLoaded = (bp: Blueprint) => {
    wallOccMgr.reset();

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

  // ── 11. Load rooms ────────────────────────────────────────────────────────────
  sceneManager.loadDungeon(plan);
  console.log('[BuildingViewer] dungeon loaded, starting room:', plan.startRoomId);

  // ── 12. Game loop ─────────────────────────────────────────────────────────────
  const gameLoop = new GameLoop();

  gameLoop.onTick((dt: number) => {
    physics.step(dt);
    player.update(input.state, dt);
    sceneManager.update(dt, player.group.position);
    cameraRig.updateZoom(dt);
    cameraRig.follow(player.group.position, dt);
    wallOccMgr.update(cameraRig.camera, player.group, sceneManager.currentRoomGroup);
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
