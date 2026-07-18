/**
 * CreativeMode.ts — top-level orchestrator.
 *
 * Call CreativeMode.enter() to activate and exit() to restore normal play.
 * All creative-only systems (HUD, portals, speed, god mode) are managed here.
 *
 * Usage in main.ts:
 *   import { CreativeMode } from '@/creative/CreativeMode';
 *   CreativeMode.init({ player, hud, sceneManager, scene, camera, pauseMenu });
 *   // Then wire pauseMenu.onEnterCreative = () => CreativeMode.enter();
 */

import * as THREE from 'three';
import { InputManager } from '@/core/InputManager';
import {
  setCreativeActive, isCreativeActive,
  setGodMode, setFlyEnabled, setNoClip,
  getCreativeState, getSpeedMultiplier,
  setCurrentZone, setActiveHotbarSlot,
  type CreativeTool,
} from './CreativeModeState';
import { CreativeHUD }    from './CreativeHUD';
import { BackroomManager, BASEMENT_PORTAL_POSITIONS, BackroomRegistry } from './Backrooms';
import { CreativePlacementSystem } from './CreativePlacementSystem';
import { CreativeAssetBrowser }   from './CreativeAssetBrowser';
import { TOWER_FLOOR_DEFS, PLAYER_START_FLOOR_INDEX } from '@/levels/TowerFloorDef';

// ── Context injected by main.ts ───────────────────────────────────────────────

export interface CreativeModeContext {
  player: {
    flyMode:                  boolean;
    noClipMode:               boolean;
    creativeSpeedMultiplier:  number;
    health: { godMode: boolean; reset(): void };
    teleport(pos: THREE.Vector3): void;
    group: THREE.Group;
  };
  /** The regular game HUD — will be hidden while creative is active. */
  regularHUD: { el?: HTMLElement; hide?(): void; show?(): void };
  sceneManager: {
    currentFloor: number;
    loadRoomImmediate(id: string): void;
    currentRoomId?: string;
  };
  scene:    THREE.Scene;
  camera:   THREE.Camera;
  canvas:   HTMLCanvasElement;
  /** Open the character/stat sheet. */
  openCharSheet?: () => void;
  /** Called when player enters a backroom — implementations load the backroom scene. */
  loadBackroomScene?: (roomId: string) => Promise<() => void>;
  /** Called to restore the main game scene after leaving a backroom. */
  restoreMainScene?: () => void;
}

// ── Module-level singletons ───────────────────────────────────────────────────

let _ctx: CreativeModeContext | null = null;
let _hud: CreativeHUD | null = null;
let _placement: CreativePlacementSystem | null = null;
let _browser: CreativeAssetBrowser | null = null;
let _backroomMgr: BackroomManager | null = null;
let _frameHandler: (() => void) | null = null;
let _shiftA = false;
let _shiftQ = false;

// ── Public API ────────────────────────────────────────────────────────────────

export const CreativeMode = {

  /** Called once at game startup. Registers the context but does NOT activate. */
  init(ctx: CreativeModeContext): void {
    _ctx = ctx;
  },

  /** Activate creative mode — god mode + fly + HUD + backroom portals. */
  enter(): void {
    if (!_ctx) { console.warn('[CreativeMode] Not initialised — call CreativeMode.init() first.'); return; }
    if (isCreativeActive()) return;

    setCreativeActive(true);
    setGodMode(true);
    setFlyEnabled(true);

    // Block attack (LMB) and spell (RMB) synchronously — static flag on class
    InputManager.suppressAttackAndSpell = true;

    // Apply to player
    _ctx.player.flyMode               = true;
    _ctx.player.health.godMode        = true;
    _ctx.player.creativeSpeedMultiplier = getSpeedMultiplier();

    // Teleport to top floor (F9 Observatory)
    const topFloor = TOWER_FLOOR_DEFS.reduce((a, b) => b.floorIndex > a.floorIndex ? b : a);
    const chamberRoom = `tower_${topFloor.id}_chamber`;
    try { _ctx.sceneManager.loadRoomImmediate(chamberRoom); } catch { /* room may not exist yet */ }
    _ctx.player.teleport(new THREE.Vector3(0, 1.5, 0));
    setCurrentZone(topFloor.name);

    // Hide regular HUD
    _hideRegularHUD();

    // Mount creative HUD
    _hud = new CreativeHUD({
      onTeleport:         () => _openTeleportPanel(),
      onOpenBackrooms:    () => _openBackroomsMenu(),
      onOpenSkinPicker:   () => _openSkinPicker(),
      onPlaceAsset:       (path, slot) => { void _pickAssetForSlot(path, slot); },
      onExit:             () => CreativeMode.exit(),
    });
    _hud.mount();
    _hud.setZone(topFloor.name);
    _buildTeleportFloors();

    // Mount placement system + asset browser
    _placement = new CreativePlacementSystem(_ctx.scene, _ctx.camera, _ctx.canvas);
    _placement.activate();

    _browser = new CreativeAssetBrowser({
      onPickAsset: (path) => {
        void _placement!.holdAsset(path);
        _hud?.refresh();
      },
    });

    // Spawn basement backroom portals
    if (_ctx && _backroomMgr === null) {
      _backroomMgr = new BackroomManager({
        teleportPlayer: (pos) => _ctx!.player.teleport(new THREE.Vector3(pos.x, pos.y, pos.z)),
        loadScene:      (id)  => _ctx!.loadBackroomScene?.(id) ?? Promise.resolve(() => {}),
        restoreScene:   ()    => _ctx!.restoreMainScene?.(),
      });
      _backroomMgr.spawnMainDoorPortals(_ctx.scene, BASEMENT_PORTAL_POSITIONS);
    }

    // Per-frame updater — sync speed multiplier from state
    _frameHandler = () => {
      if (!_ctx || !isCreativeActive()) return;
      _ctx.player.creativeSpeedMultiplier = getSpeedMultiplier();
      _ctx.player.noClipMode              = getCreativeState().noClip;
      _hud?.setZone(getCreativeState().currentZone);
      _backroomMgr?.updatePortals(1 / 60); // approximate dt
    };

    _attachCreativeKeys();

    console.info('[CreativeMode] ✨ Creative mode active. Press Ctrl+Shift+C or use the exit button to return to normal play.');
  },

  /** Deactivate creative mode — restore normal gameplay. */
  exit(): void {
    if (!isCreativeActive() || !_ctx) return;

    setCreativeActive(false);
    setGodMode(false);
    setFlyEnabled(false);
    setNoClip(false);

    _ctx.player.flyMode               = false;
    _ctx.player.noClipMode            = false;
    _ctx.player.health.godMode        = false;
    _ctx.player.creativeSpeedMultiplier = 1;

    // Restore game input
    InputManager.suppressAttackAndSpell = false;

    _hud?.unmount();
    _hud = null;
    _placement?.deactivate();
    _placement = null;
    _browser?.hide();
    _browser = null;
    _frameHandler = null;
    _shiftA = false;
    _shiftQ = false;

    _showRegularHUD();

    // Teleport back to starting floor
    try {
      const startFloor = TOWER_FLOOR_DEFS.find(d => d.floorIndex === PLAYER_START_FLOOR_INDEX);
      if (startFloor) {
        _ctx.sceneManager.loadRoomImmediate(`tower_${startFloor.id}_chamber`);
        setCurrentZone(startFloor.name);
      }
    } catch { /* ignore */ }

    _ctx.player.teleport(new THREE.Vector3(0, 1.5, 0));
    console.info('[CreativeMode] Exited creative mode.');
  },

  get active(): boolean { return isCreativeActive(); },

  /** Call each game frame to keep HUD and portals updated. */
  update(dt = 1 / 60): void {
    _frameHandler?.();
    _backroomMgr?.updatePortals(dt);
    _placement?.update(dt);
  },

  /** Enter a specific backroom by ID. */
  async enterBackroom(roomId: string): Promise<void> {
    if (!_ctx || !_backroomMgr) return;
    const pos = _ctx.player.group.position;
    await _backroomMgr.enterBackroom(roomId, { x: pos.x, y: pos.y, z: pos.z });
  },

  /** Exit current backroom and return to where you came from. */
  exitBackroom(): void {
    _backroomMgr?.exitBackroom();
  },
};

// ── Private helpers ───────────────────────────────────────────────────────────

function _hideRegularHUD(): void {
  if (!_ctx) return;
  if (_ctx.regularHUD.hide) {
    _ctx.regularHUD.hide();
  } else if (_ctx.regularHUD.el) {
    _ctx.regularHUD.el.style.display = 'none';
  } else {
    // Best-effort: find the main HUD container
    (document.getElementById('hud-root') as HTMLElement | null)?.style.setProperty('display', 'none');
  }
}

function _showRegularHUD(): void {
  if (!_ctx) return;
  if (_ctx.regularHUD.show) {
    _ctx.regularHUD.show();
  } else if (_ctx.regularHUD.el) {
    _ctx.regularHUD.el.style.display = '';
  } else {
    (document.getElementById('hud-root') as HTMLElement | null)?.style.removeProperty('display');
  }
}

function _buildTeleportFloors(): void {
  if (!_ctx || !_hud) return;
  const floors = TOWER_FLOOR_DEFS
    .slice()
    .sort((a, b) => a.floorIndex - b.floorIndex)
    .map(def => ({
      id:   `tower_${def.id}_chamber`,
      name: `${def.floorIndex < 0 ? `B${Math.abs(def.floorIndex)}` : `F${def.floorIndex}`} — ${def.name}`,
      onTeleport: () => {
        try { _ctx!.sceneManager.loadRoomImmediate(`tower_${def.id}_chamber`); } catch { /* */ }
        _ctx!.player.teleport(new THREE.Vector3(0, 1.5, 0));
        setCurrentZone(def.name);
        _hud?.setZone(def.name);
      },
    }));

  // Add overworld entry
  floors.push({
    id: 'overworld',
    name: '🌍 Overworld',
    onTeleport: () => {
      _ctx!.player.teleport(new THREE.Vector3(0, 5, 0));
      setCurrentZone('Overworld');
      _hud?.setZone('Overworld');
    },
  });

  _hud.setTeleportFloors(floors);
}

function _openTeleportPanel(): void {
  // Teleport panel is managed by CreativeHUD internally
  // This callback fires when user clicks Teleport in the quick-tools panel
}

function _openBackroomsMenu(): void {
  if (!_ctx) return;
  // Show a quick selection overlay listing all backrooms
  let existing = document.getElementById('creative-backrooms-menu');
  if (existing) { existing.remove(); return; }

  const menu = document.createElement('div');
  menu.id = 'creative-backrooms-menu';
  menu.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(8,4,18,0.97);backdrop-filter:blur(8px);
    border:1px solid rgba(68,136,255,0.4);border-radius:12px;
    padding:20px;min-width:320px;z-index:9001;color:white;
    font-family:'Segoe UI',system-ui,sans-serif;
  `;
  menu.innerHTML = `
    <h2 style="font-size:13px;letter-spacing:3px;color:#4488ff;margin-bottom:12px;">⬡ DEV BACKROOMS</h2>
    <p style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:14px;line-height:1.5">
      Extra-dimensional test spaces. Step through a portal to enter.<br>
      A return portal is always present inside.
    </p>
  `;

  for (const def of BackroomRegistry.all()) {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;
      background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.05);
      color:rgba(200,180,230,0.8);cursor:pointer;text-align:left;font-size:11px;
    `;
    btn.innerHTML = `<span style="font-size:18px">${def.icon}</span><div><div style="font-weight:600">${def.name}</div><div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px">${def.description}</div></div>`;
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(68,136,255,0.15)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
    btn.addEventListener('click', () => {
      menu.remove();
      CreativeMode.enterBackroom(def.id);
    });
    menu.appendChild(btn);
  }

  const close = document.createElement('button');
  close.style.cssText = 'margin-top:12px;width:100%;padding:7px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:rgba(255,255,255,0.4);cursor:pointer;font-size:11px;';
  close.textContent = '✕ Close';
  close.addEventListener('click', () => menu.remove());
  menu.appendChild(close);

  document.body.appendChild(menu);
}

function _openSkinPicker(): void {
  // TODO C5: skin picker — for now show a placeholder toast
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(12,8,20,0.9);border:1px solid rgba(200,140,255,0.4);border-radius:6px;padding:8px 16px;color:#cc88ff;font-size:11px;z-index:9002;pointer-events:none;';
  toast.textContent = '👤 Skin picker coming in C5 — use the character selector in Dev Panel for now';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

async function _pickAssetForSlot(path: string, _slot: number): Promise<void> {
  if (_placement) await _placement.holdAsset(path);
}

// ── Per-session keyboard handler (C = browser, P = char sheet, Shift tracking) ──

function _attachCreativeKeys(): void {
  const onDown = (e: KeyboardEvent) => {
    if (!isCreativeActive()) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.shiftKey && e.key === 'A') { _shiftA = true; return; }
    if (e.shiftKey && e.key === 'Q') { _shiftQ = true; return; }

    switch (e.key) {
      case 'c': case 'C':
        e.preventDefault();
        _browser?.toggle();
        break;
      case 'v': case 'V':
        e.preventDefault();
        setActiveTool('select');
        _hud?.refresh();
        break;
      case 'p': case 'P':
        e.preventDefault();
        _ctx?.openCharSheet?.();
        break;
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (e.key === 'A') _shiftA = false;
    if (e.key === 'Q') _shiftQ = false;
  };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup',   onUp);
  // Store for removal on exit — simplified: we accept these stay until page reload
}
