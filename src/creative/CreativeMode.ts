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
import { buildAssetShowcase, buildDungeonPrototype, buildSpellLab, buildCombatArena, buildEmptyRoom } from './backroomScenes';import {
  setCreativeActive, isCreativeActive,
  setGodMode, setFlyEnabled, setNoClip,
  getCreativeState, getSpeedMultiplier,
  setCurrentZone, setActiveHotbarSlot, setHotbarSlot,
  setCurrentSkin,
  type CreativeTool,
} from './CreativeModeState';
import { CreativeHUD }    from './CreativeHUD';
import { BackroomManager, BASEMENT_PORTAL_POSITIONS, BackroomRegistry } from './Backrooms';import { CreativePlacementSystem } from './CreativePlacementSystem';
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
    applyAssetModel?: (def: import('@/characters/charManifest').CharModelDef) => Promise<void>;
  };
  regularHUD:   { el?: HTMLElement; hide?(): void; show?(): void };
  sceneManager: { currentFloor: number; loadRoomImmediate(id: string): void; currentRoomId?: string };
  scene:        THREE.Scene;
  camera:       THREE.Camera;
  canvas:       HTMLCanvasElement;
  /** OrbitControls instance for camera unlock. */
  orbit?:       { maxPolarAngle: number; enableDamping: boolean; dampingFactor: number };
  openCharSheet?:      () => void;
  loadBackroomScene?:  (roomId: string) => Promise<() => void>;
  restoreMainScene?:   () => void;
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

    // Unlock camera orbit — allow free look through walls
    const orbit = (_ctx as any).orbit ?? (_ctx as any).orbitControls;
    if (orbit) {
      orbit.maxPolarAngle = Math.PI;   // allow look straight up/down
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
    }

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
      onPickSpawn: (item) => {
        // Store the spawn item as a special marker path in hotbar
        const state = getCreativeState();
        setHotbarSlot(state.activeHotbarSlot, `spawn:${item.id}`);
        _hudToast(`${item.icon} ${item.label} → ready to place (right-click)`);
        _hud?.refresh();
      },
    });

    // Spawn basement backroom portals
    if (_ctx && _backroomMgr === null) {
      _backroomMgr = new BackroomManager({
        teleportPlayer: (pos) => _ctx!.player.teleport(new THREE.Vector3(pos.x, pos.y, pos.z)),
        loadScene: async (roomId) => {
          const scene = _ctx!.scene;
          switch (roomId) {
            case 'asset_showcase':   return buildAssetShowcase(scene);
            case 'dungeon_prototype':return buildDungeonPrototype(scene);
            case 'spell_lab':        return buildSpellLab(scene);
            case 'combat_arena':     return buildCombatArena(scene);
            default:
              return buildEmptyRoom(scene, roomId, 0x884488);
          }
        },
        restoreScene:   ()    => _ctx!.restoreMainScene?.(),
        scene:          _ctx!.scene,
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
    // Check portal proximity when in creative mode
    if (isCreativeActive() && _ctx && _backroomMgr) {
      _checkPortalProximity();
    }
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
        // Smooth teleport: lerp to new position
        _lerpTeleport(new THREE.Vector3(0, 1.5, 0));
        setCurrentZone(def.name);
        _hud?.setZone(def.name);
      },
    }));

  floors.push({
    id: 'overworld',
    name: '🌍 Overworld',
    onTeleport: () => {
      _lerpTeleport(new THREE.Vector3(0, 5, 0));
      setCurrentZone('Overworld');
      _hud?.setZone('Overworld');
    },
  });

  _hud.setTeleportFloors(floors);
}

/** Smooth lerp teleport — moves player to target over 0.3s. */
function _lerpTeleport(target: THREE.Vector3): void {
  if (!_ctx) return;
  const start = _ctx.player.group.position.clone();
  const steps = 15;
  let i = 0;
  const tick = () => {
    if (!_ctx || i >= steps) {
      _ctx?.player.teleport(target);
      return;
    }
    const t = (++i) / steps;
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
    _ctx.player.group.position.lerpVectors(start, target, ease);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function _toggleQuestBuilder(): void {
  const existing = document.getElementById('creative-quest-builder');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'creative-quest-builder';
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(8,4,18,0.97);backdrop-filter:blur(8px);
    border:1px solid rgba(140,80,220,0.4);border-radius:12px;
    padding:18px;width:420px;max-height:80vh;overflow-y:auto;
    z-index:9001;font-family:'Segoe UI',system-ui,sans-serif;
    color:rgba(220,200,255,0.85);font-size:11px;
  `;
  const questState = { name: '', desc: '', objectives: [] as Array<{type:string;target:string;count:number}>, xp: 100 };

  const renderPanel = () => {
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="color:#cc88ff;font-size:11px;letter-spacing:2px">📜 QUEST BUILDER [Q]</h3>
        <button id="qb-close" style="background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:14px">✕</button>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:9px;color:rgba(200,180,230,0.4);margin-bottom:4px;letter-spacing:1px">QUEST NAME</div>
        <input id="qb-name" type="text" value="${questState.name}" placeholder="Enter quest name…"
          style="width:100%;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.25);color:#eee;padding:5px 10px;border-radius:4px;font-size:11px;box-sizing:border-box;outline:none"/>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:9px;color:rgba(200,180,230,0.4);margin-bottom:4px;letter-spacing:1px">DESCRIPTION</div>
        <textarea id="qb-desc" rows="2" placeholder="What does the player need to do?"
          style="width:100%;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.25);color:#eee;padding:5px 10px;border-radius:4px;font-size:10px;box-sizing:border-box;outline:none;resize:vertical">${questState.desc}</textarea>
      </div>
      <div style="margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:9px;color:rgba(200,180,230,0.4);letter-spacing:1px">OBJECTIVES</div>
          <button id="qb-add-obj" style="font-size:9px;padding:2px 8px;background:rgba(100,40,180,0.25);border:1px solid rgba(140,80,220,0.3);border-radius:3px;color:#cc88ff;cursor:pointer">+ Add</button>
        </div>
        <div id="qb-objectives">
          ${questState.objectives.map((o,i) => `
            <div style="display:flex;gap:4px;margin-bottom:4px;align-items:center">
              <select data-oi="${i}" data-field="type" style="background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.2);color:#eee;padding:2px 4px;border-radius:3px;font-size:9px;flex-shrink:0">
                ${['kill','interact','collect','reach','talk'].map(t=>`<option${o.type===t?' selected':''}>${t}</option>`).join('')}
              </select>
              <input data-oi="${i}" data-field="target" type="text" value="${o.target}" placeholder="target / ID"
                style="flex:1;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.2);color:#eee;padding:2px 6px;border-radius:3px;font-size:9px;outline:none"/>
              <input data-oi="${i}" data-field="count" type="number" value="${o.count}" min="1"
                style="width:42px;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.2);color:#eee;padding:2px 4px;border-radius:3px;font-size:9px;outline:none"/>
              <button data-del="${i}" style="background:transparent;border:none;color:rgba(220,80,80,0.5);cursor:pointer;font-size:12px">✕</button>
            </div>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <div style="font-size:9px;color:rgba(200,180,230,0.4);letter-spacing:1px">REWARD XP</div>
        <input id="qb-xp" type="number" value="${questState.xp}" min="0"
          style="width:70px;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.25);color:#eee;padding:3px 6px;border-radius:3px;font-size:10px;outline:none"/>
      </div>
      <div style="display:flex;gap:8px">
        <button id="qb-save" style="flex:1;padding:7px;background:rgba(100,40,180,0.3);border:1px solid rgba(200,100,255,0.4);border-radius:5px;color:#cc88ff;cursor:pointer;font-size:10px">💾 Save Quest</button>
        <button id="qb-play" style="padding:7px 12px;background:rgba(40,120,60,0.25);border:1px solid rgba(80,200,100,0.3);border-radius:5px;color:#88ee88;cursor:pointer;font-size:10px">▶ Play Test</button>
      </div>
      <div style="margin-top:8px;font-size:8px;color:rgba(255,255,255,0.2)">Player-created quests only (ID prefixed player_) — game quests are never modified.</div>
    `;

    panel.querySelector('#qb-close')?.addEventListener('click', () => panel.remove());
    panel.querySelector('#qb-name')?.addEventListener('input', e => { questState.name = (e.target as HTMLInputElement).value; });
    panel.querySelector('#qb-desc')?.addEventListener('input', e => { questState.desc = (e.target as HTMLTextAreaElement).value; });
    panel.querySelector('#qb-xp')?.addEventListener('input', e => { questState.xp = parseInt((e.target as HTMLInputElement).value) || 0; });
    panel.querySelector('#qb-add-obj')?.addEventListener('click', () => { questState.objectives.push({ type: 'kill', target: '', count: 1 }); renderPanel(); });

    panel.querySelectorAll<HTMLElement>('[data-oi]').forEach(el => {
      const i = parseInt(el.dataset['oi'] ?? '0');
      el.addEventListener('input', ev => {
        const val = (ev.target as HTMLInputElement).value;
        const field = el.dataset['field'] as 'type' | 'target' | 'count';
        if (field === 'count') questState.objectives[i].count = parseInt(val) || 1;
        else (questState.objectives[i] as any)[field] = val;
      });
    });
    panel.querySelectorAll<HTMLElement>('[data-del]').forEach(el => {
      el.addEventListener('click', () => { questState.objectives.splice(parseInt(el.dataset['del'] ?? '0'), 1); renderPanel(); });
    });

    panel.querySelector('#qb-save')?.addEventListener('click', async () => {
      if (!questState.name.trim()) { _hudToast('Quest needs a name'); return; }
      const id = `player_quest_${Date.now()}`;
      const doc = { id, name: questState.name, description: questState.desc, objectives: questState.objectives, rewards: { xp: questState.xp } };
      try {
        const res = await fetch('/api/save-level', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'quests', id, content: JSON.stringify(doc, null, 2) }) });
        _hudToast(res.ok ? `✓ Quest saved: ${id}` : '✗ Save failed');
        if (res.ok) panel.remove();
      } catch { _hudToast(`✓ Quest built: ${id} (no server — use Ctrl+S to save state)`); panel.remove(); }
    });

    panel.querySelector('#qb-play')?.addEventListener('click', () => {
      _hudToast('▶ Exiting creative to play-test — press Ctrl+Shift+C to return');
      panel.remove();
      CreativeMode.exit();
    });
  };

  renderPanel();
  document.body.appendChild(panel);
  panel.querySelector<HTMLInputElement>('#qb-name')?.focus();
}

// ── Portal proximity ──────────────────────────────────────────────────────────

let _portalTransitioning = false;

function _checkPortalProximity(): void {
  if (!_ctx || !_backroomMgr || _portalTransitioning) return;
  const playerPos = _ctx.player.group.position;

  // Check return portals (when inside a backroom)
  if (_backroomMgr.isInBackroom) {
    // Scan scene for return portal objects
    _ctx.scene.traverse(obj => {
      if (obj.userData['returnPortal'] && !_portalTransitioning) {
        const dx = playerPos.x - obj.position.x;
        const dz = playerPos.z - obj.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.2) {
          _portalTransitioning = true;
          const onEnter = obj.userData['onEnter'] as (() => void) | undefined;
          if (onEnter) {
            // Fade out and exit
            const fade = document.createElement('div');
            fade.style.cssText = 'position:fixed;inset:0;background:black;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.3s';
            document.body.appendChild(fade);
            requestAnimationFrame(() => { fade.style.opacity = '1'; });
            setTimeout(() => {
              onEnter();
              setTimeout(() => {
                fade.style.opacity = '0';
                setTimeout(() => { fade.remove(); _portalTransitioning = false; }, 350);
              }, 200);
            }, 350);
          } else {
            _portalTransitioning = false;
          }
        }
      }
    });
    return;
  }

  // Check entry portals (main world basement)
  for (const p of BASEMENT_PORTAL_POSITIONS) {
    const dx = playerPos.x - p.x;
    const dz = playerPos.z - p.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.2) {
      _portalTransitioning = true;
      void _enterBackroomWithFade(p.roomId, { x: playerPos.x, y: playerPos.y, z: playerPos.z });
      return;
    }
  }
}

async function _enterBackroomWithFade(roomId: string, fromPos: { x: number; y: number; z: number }): Promise<void> {
  // Fade to black
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:black;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.3s';
  document.body.appendChild(fade);
  requestAnimationFrame(() => { fade.style.opacity = '1'; });

  await new Promise(r => setTimeout(r, 350));

  if (_backroomMgr) {
    await _backroomMgr.enterBackroom(roomId, fromPos);
    const def = BackroomRegistry.get(roomId);
    if (def) setCurrentZone(def.name);
    _hud?.setZone(def?.name ?? roomId);
  }

  await new Promise(r => setTimeout(r, 150));
  fade.style.opacity = '0';
  await new Promise(r => setTimeout(r, 350));
  fade.remove();
  _portalTransitioning = false;
  _hudToast(`Entered: ${roomId} — walk back to exit`);
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
  const existing = document.getElementById('creative-skin-picker');
  if (existing) { existing.remove(); return; }

  import('@/characters/charManifest').then(({ CHAR_MODELS, CHAR_PACKS }) => {
    const overlay = document.createElement('div');
    overlay.id = 'creative-skin-picker';
    overlay.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(8,4,18,0.97);backdrop-filter:blur(8px);
      border:1px solid rgba(140,80,220,0.4);border-radius:12px;
      padding:16px;z-index:9001;width:520px;max-height:70vh;
      display:flex;flex-direction:column;gap:10px;
      font-family:'Segoe UI',system-ui,sans-serif;color:rgba(220,200,255,0.85);
    `;
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h3 style="color:#cc88ff;font-size:11px;letter-spacing:2px;text-transform:uppercase">👤 Choose Skin</h3>
        <button id="skin-close" style="background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:14px">✕</button>
      </div>
      <input id="skin-search" type="text" placeholder="search skins…"
        style="background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.25);color:#eee;padding:4px 10px;border-radius:4px;font-size:11px;outline:none;width:100%;box-sizing:border-box"/>
      <div id="skin-grid" style="overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;flex:1;min-height:0"></div>
    `;
    document.body.appendChild(overlay);

    const grid = overlay.querySelector<HTMLElement>('#skin-grid')!;
    const search = overlay.querySelector<HTMLInputElement>('#skin-search')!;
    const state = getCreativeState();

    // Role filter tabs
    type RoleFilter = 'all' | 'player' | 'enemy' | 'npc';
    let roleFilter: RoleFilter = 'all';
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:4px;padding:0 2px 8px;flex-shrink:0;';
    const ROLE_TABS: Array<{ id: RoleFilter; label: string }> = [
      { id: 'all',    label: '🌍 All' },
      { id: 'player', label: '🧙 Playable' },
      { id: 'enemy',  label: '👹 Enemies' },
      { id: 'npc',    label: '🧑 NPCs' },
    ];
    const mkTab = (r: typeof ROLE_TABS[0]) => {
      const btn = document.createElement('button');
      btn.textContent = r.label;
      btn.style.cssText = `font-size:9px;padding:3px 8px;background:${roleFilter===r.id?'rgba(100,40,180,0.4)':'transparent'};border:1px solid rgba(140,80,220,0.25);border-radius:3px;color:${roleFilter===r.id?'#cc88ff':'rgba(200,180,230,0.4)'};cursor:pointer;`;
      btn.addEventListener('click', () => { roleFilter = r.id; renderTabs(); renderSkins(search.value.toLowerCase()); });
      return btn;
    };
    const renderTabs = () => { tabBar.innerHTML = ''; ROLE_TABS.forEach(r => tabBar.appendChild(mkTab(r))); };
    renderTabs();
    overlay.querySelector('#skin-grid')!.before(tabBar);

    const renderSkins = (filter = '') => {
      grid.innerHTML = '';
      const filtered = CHAR_MODELS.filter(m => {
        const roleOk = roleFilter === 'all' ? true : m.roles.includes(roleFilter as never);
        const textOk = !filter || m.name.toLowerCase().includes(filter) || m.packId.toLowerCase().includes(filter);
        return roleOk && textOk;
      });
      for (const m of filtered) {
        const pack = CHAR_PACKS.find(p => p.id === m.packId);
        const isEnemy = m.roles.includes('enemy') && !m.roles.includes('player');
        const card = document.createElement('div');
        card.style.cssText = `
          background:rgba(20,12,36,0.8);border:1px solid ${isEnemy ? 'rgba(180,60,60,0.3)' : 'rgba(100,60,180,0.3)'};
          border-radius:6px;padding:8px 4px 6px;cursor:pointer;text-align:center;transition:border-color 0.1s;
          ${m.id === state.currentSkin ? 'border-color:#cc88ff;background:rgba(80,40,140,0.5)' : ''}
        `;
        card.innerHTML = `
          <div style="font-size:22px;line-height:1.3">${pack?.icon ?? (isEnemy ? '👹' : '🧙')}</div>
          <div style="font-size:8px;color:rgba(200,180,230,0.6);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.name}</div>
          <div style="font-size:7px;color:${isEnemy?'rgba(220,120,120,0.4)':'rgba(200,180,230,0.3)'};margin-top:1px">${pack?.name ?? m.packId}</div>
        `;
        card.title = `${m.name}\n${m.id}\nRoles: ${m.roles.join(', ')}`;
        card.addEventListener('click', async () => {
          if (!_ctx?.player.applyAssetModel) { _hudToast('Skin swap not available'); return; }
          try {
            await _ctx.player.applyAssetModel(m);
            setCurrentSkin(m.id);
            _hud?.refresh();
            overlay.remove();
            _hudToast(`${isEnemy ? '👹' : '🧙'} Skin: ${m.name}`);
          } catch { _hudToast('Failed to load skin'); }
        });
        grid.appendChild(card);
      }
      if (!filtered.length) {
        grid.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:10px;padding:16px;grid-column:1/-1;text-align:center">No skins match</div>';
      }
    };

    renderSkins();
    search.addEventListener('input', () => renderSkins(search.value.toLowerCase()));
    overlay.querySelector('#skin-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  });
}

function _hudToast(msg: string): void {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:75px;left:50%;transform:translateX(-50%);background:rgba(12,8,20,0.9);border:1px solid rgba(140,80,220,0.3);border-radius:5px;padding:5px 14px;color:rgba(220,200,255,0.8);font-size:10px;z-index:9200;pointer-events:none;font-family:monospace;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
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

    // Ctrl+S = save version, Ctrl+Shift+S = publish, Ctrl+E = export scenario, Ctrl+I = import
    if ((e.ctrlKey || e.metaKey) && e.key === 'S' && e.shiftKey) { e.preventDefault(); void _placement?.publish(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E') && !e.shiftKey) {
      e.preventDefault();
      const name = prompt('Scenario name:', 'My Scenario') ?? 'scenario';
      _placement?.downloadScenario(name);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I') && !e.shiftKey) {
      e.preventDefault();
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.ttt-scenario.json,.json';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        await _placement?.importScenario(text);
      });
      input.click();
      return;
    }

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
      case 'q': case 'Q':
        e.preventDefault();
        _toggleQuestBuilder();
        break;
      case 'F5':
        // F5 = "Play from here" — exit creative at current position
        e.preventDefault();
        if (!_ctx) break;
        _hudToast('▶ Playing from here — press Ctrl+Shift+C to return to creative');
        CreativeMode.exit();
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
