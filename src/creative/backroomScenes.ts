/**
 * backroomScenes.ts
 *
 * Scene generators for each backroom. These are called by BackroomManager.loadScene()
 * and return a cleanup function that removes the generated content.
 *
 * Currently implemented:
 *  - asset_showcase  : pedestals showing one asset per kit
 *  - dungeon_prototype: empty dungeon room with proper lighting
 *  - spell_lab       : empty space ready for dummy targets
 *  - combat_arena    : flat arena with grid
 *  (others: empty rooms for now, will be expanded)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ENV_KITS } from '@/assets/envManifest';

type CleanupFn = () => void;

// ── Asset Showcase Hall ───────────────────────────────────────────────────────

export async function buildAssetShowcase(scene: THREE.Scene): Promise<CleanupFn> {
  const group = new THREE.Group();
  group.name  = 'backroom_asset_showcase';

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshBasicMaterial({ color: 0x0d0820, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // Grid overlay
  const grid = new THREE.GridHelper(120, 60, 0x2a1840, 0x1a0e2a);
  grid.position.y = 0.01;
  group.add(grid);

  // Title label
  group.add(_makeLabel('🏛 ASSET SHOWCASE HALL', 0xcc88ff, { x: 0, y: 6, z: -20 }, 12));

  // One row per kit group
  const kitGroups: Array<{ group: 'kaykit' | 'kenney' | 'kenney_modular'; label: string; color: number; z: number }> = [
    { group: 'kaykit',         label: 'KayKit',          color: 0x8855cc, z: -12 },
    { group: 'kenney',         label: 'Kenney',          color: 0x4488cc, z:   0 },
    { group: 'kenney_modular', label: 'Kenney Modular',  color: 0x448844, z:  12 },
  ];

  const loader = new GLTFLoader();

  for (const row of kitGroups) {
    const kits = ENV_KITS.filter(k => k.group === row.group && k.extracted && k.path);
    group.add(_makeLabel(row.label, row.color, { x: -55, y: 2, z: row.z }, 4));

    kits.forEach(async (kit, i) => {
      const wx = -50 + i * 5.5;
      const wz = row.z;

      // Pedestal
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.8, 0.4, 8),
        new THREE.MeshBasicMaterial({ color: 0x1a0e2a }),
      );
      ped.position.set(wx, 0.2, wz);
      group.add(ped);

      // Kit label under pedestal
      group.add(_makeLabel(`${kit.icon} ${kit.label.replace(/^(KayKit |Kenney )/, '')}`, row.color, { x: wx, y: 0.55, z: wz + 1.2 }, 1.5));

      // Try to load first asset from kit's index file
      try {
        const res  = await fetch(`/assets-index/${kit.id}.json`);
        if (!res.ok) return;
        const items = await res.json() as Array<{ path: string }>;
        const first = items.find(a => a.path.endsWith('.glb') || a.path.endsWith('.gltf'));
        if (!first) return;
        const gltf = await loader.loadAsync(first.path);
        const root = gltf.scene;
        // Scale to fit on pedestal (~1.5 WU max)
        const box  = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const maxD = Math.max(size.x, size.y, size.z);
        if (maxD > 0) root.scale.setScalar(1.5 / maxD);
        root.position.set(wx, 0.4 + (1.5 / maxD) * (size.y / 2), wz);
        group.add(root);
      } catch { /* asset not available */ }
    });
  }

  scene.add(group);
  return () => { scene.remove(group); };
}

// ── Dungeon Prototype Room ────────────────────────────────────────────────────

export function buildDungeonPrototype(scene: THREE.Scene): CleanupFn {
  const group = new THREE.Group();
  group.name  = 'backroom_dungeon_prototype';

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({ color: 0x1a0e28, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // Walls (4 sides)
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x0d0820 });
  const wallH = 4;
  for (const [x, z, rx, rz, w, d] of [
    [0, -10, 0, 0, 20, 0.4],
    [0,  10, 0, 0, 20, 0.4],
    [-10, 0, 0, Math.PI/2, 20, 0.4],
    [ 10, 0, 0, Math.PI/2, 20, 0.4],
  ] as [number,number,number,number,number,number][]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    wall.position.set(x, wallH / 2, z);
    wall.rotation.y = rz;
    group.add(wall);
  }

  // Point lights (dungeon torches)
  for (const [lx, lz] of [[-6,-6],[-6,6],[6,-6],[6,6]]) {
    const light = new THREE.PointLight(0xff8844, 1.5, 12);
    light.position.set(lx, 2.5, lz);
    group.add(light);
  }

  // Grid
  const grid = new THREE.GridHelper(20, 10, 0x3a1a4a, 0x2a0e3a);
  grid.position.y = 0.02;
  group.add(grid);

  group.add(_makeLabel('⚔️ DUNGEON PROTOTYPE ROOM', 0xff8844, { x: 0, y: 5, z: -8 }, 6));
  group.add(_makeLabel('Place blueprint rooms from the spawn palette [C] → Code tab', 0xcc6644, { x: 0, y: 4.2, z: -8 }, 4));

  scene.add(group);
  return () => { scene.remove(group); };
}

// ── Spell Lab (with workbench UI trigger) ─────────────────────────────────────

export function buildSpellLab(scene: THREE.Scene): CleanupFn {
  const group = new THREE.Group();
  group.name  = 'backroom_spell_lab';

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ color: 0x080418, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const grid = new THREE.GridHelper(30, 15, 0x4444cc, 0x1a1a44);
  grid.position.y = 0.01;
  group.add(grid);

  // Ambient blue light
  const ambient = new THREE.AmbientLight(0x4444cc, 0.6);
  group.add(ambient);

  group.add(_makeLabel('🧪 THE SPELL CRAFTING LAB', 0x4488ff, { x: 0, y: 6, z: -10 }, 8));
  group.add(_makeLabel('[C] → Code tab → Dummy Targets to spawn test golems', 0x8888cc, { x: 0, y: 5.2, z: -10 }, 4));
  group.add(_makeLabel('[W] = open Spell Workbench', 0x88aaff, { x: 0, y: 4.6, z: -10 }, 4));

  // Spell workbench activation zone marker
  const wbMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8),
    new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.7 }),
  );
  wbMarker.position.set(0, 0.05, 3);
  wbMarker.userData['spellWorkbench'] = true;
  group.add(wbMarker);
  group.add(_makeLabel('⚗️ Workbench', 0x4488ff, { x: 0, y: 1.2, z: 3 }, 2.5));

  // Wire W key to open workbench; R to replay last cast; Shift+R to open workbench pre-filled
  const keyHandler = (e: KeyboardEvent) => {
    if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.shiftKey) {
      _openSpellWorkbench();
    }
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey) {
      const wb = document.getElementById('spell-workbench') as any;
      if (wb?._doCast) {
        // Workbench is open — fire it
        wb._doCast();
      } else {
        // Workbench closed — replay last cast
        const last = (window as any).__game?.lastSpellCast;
        if (last) {
          _openSpellWorkbench(last);
          // Fire after DOM settles
          requestAnimationFrame(() => {
            const wb2 = document.getElementById('spell-workbench') as any;
            wb2?._doCast?.();
          });
        } else {
          const toast = document.createElement('div');
          toast.style.cssText = 'position:fixed;bottom:75px;left:50%;transform:translateX(-50%);background:rgba(8,4,18,0.9);border:1px solid rgba(140,80,220,0.3);border-radius:5px;padding:6px 14px;color:rgba(200,180,230,0.5);font-size:10px;z-index:9200;pointer-events:none;';
          toast.textContent = 'No last cast — open Workbench [W] first';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        }
      }
    }
  };
  window.addEventListener('keydown', keyHandler);

  scene.add(group);
  return () => {
    scene.remove(group);
    window.removeEventListener('keydown', keyHandler);
    document.getElementById('spell-workbench')?.remove();
  };
}

function _openSpellWorkbench(prefill?: { element: string; shape: string; modifier: string }): void {
  const existing = document.getElementById('spell-workbench');
  if (existing && !prefill) { existing.remove(); return; }
  existing?.remove();

  const panel = document.createElement('div');
  panel.id = 'spell-workbench';
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(4,2,18,0.97);backdrop-filter:blur(8px);
    border:1px solid rgba(80,140,220,0.5);border-radius:12px;
    padding:20px;width:480px;z-index:9001;
    font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:rgba(220,200,255,0.85);
  `;

  const ELEMENTS  = ['fire','ice','lightning','arcane','shadow','nature'];
  const SHAPES    = ['bolt','burst','nova','beam','chain','mine'];
  const MODIFIERS = ['none','double','pierce','bounce','slow','burn'];

  // ── Stat tables ──────────────────────────────────────────────────────────
  const ELEM_DMG:  Record<string,number> = { fire:15, ice:12, lightning:20, arcane:18, shadow:14, nature:10 };
  const ELEM_MANA: Record<string,number> = { fire:20, ice:15, lightning:25, arcane:30, shadow:22, nature:12 };
  const SHAPE_MULT:Record<string,number> = { bolt:1.0, burst:0.7, nova:0.6, beam:1.5, chain:0.8, mine:1.2 };
  const SHAPE_CAST:Record<string,number> = { bolt:0.3, burst:0.5, nova:0.6, beam:1.0, chain:0.4, mine:0.8 };
  const SHAPE_AOE: Record<string,number> = { bolt:0,   burst:4,   nova:6,   beam:0,   chain:3,   mine:5   };
  const MOD_MULT:  Record<string,number> = { none:1.0, double:2.0, pierce:1.1, bounce:0.9, slow:0.8, burn:1.3 };
  const MOD_DUR:   Record<string,number> = { none:0, double:0, pierce:0, bounce:0, slow:4, burn:3 };

  const computeStats = (e: string, s: string, m: string) => {
    const base   = ELEM_DMG[e]!  * SHAPE_MULT[s]! * MOD_MULT[m]!;
    const mana   = ELEM_MANA[e]! * SHAPE_MULT[s]! * (m === 'double' ? 1.8 : 1);
    const cast   = SHAPE_CAST[s]!;
    const aoe    = SHAPE_AOE[s]!;
    const dur    = MOD_DUR[m]!;
    const dps    = cast > 0 ? base / cast : base;
    return { dmg: +base.toFixed(1), mana: +mana.toFixed(1), cast, aoe, dps: +dps.toFixed(1), dur };
  };

  let castLog: { ts: number; dmg: number }[] = [];
  let slowMoActive = false;

  const last = (window as any).__game?.lastSpellCast;
  let elem = prefill?.element ?? last?.element ?? 'fire';
  let shape = prefill?.shape ?? last?.shape ?? 'bolt';
  let mod   = prefill?.modifier ?? last?.modifier ?? 'none';

  const renderWB = () => {
    const st = computeStats(elem, shape, mod);

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="color:#4488ff;font-size:12px;letter-spacing:2px">⚗️ SPELL WORKBENCH [W]</h3>
        <div style="display:flex;gap:6px;align-items:center">
          <button id="wb-slo" title="Effect visualiser: slow-motion" style="padding:3px 8px;background:${slowMoActive ? 'rgba(120,60,0,0.6)' : 'rgba(30,30,60,0.4)'};border:1px solid ${slowMoActive ? 'rgba(255,140,0,0.5)' : 'rgba(80,80,180,0.3)'};border-radius:4px;color:${slowMoActive ? '#ffaa44' : 'rgba(200,180,230,0.4)'};cursor:pointer;font-size:10px">${slowMoActive ? '🔴 0.1×' : '🎞 Slow'}</button>
          <button id="wb-close" style="background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:14px">✕</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
        ${[['Element', ELEMENTS, elem, 'elem'],['Shape', SHAPES, shape, 'shape'],['Modifier', MODIFIERS, mod, 'mod']].map(([label, opts, val, key]) => `
          <div>
            <div style="font-size:9px;color:rgba(200,180,230,0.4);letter-spacing:1px;margin-bottom:4px">${label}</div>
            <select id="wb-${key}" style="width:100%;background:rgba(10,6,28,0.9);border:1px solid rgba(80,140,220,0.3);color:#eee;padding:4px 6px;border-radius:4px;font-size:10px;outline:none">
              ${(opts as string[]).map(o => `<option${o===val?' selected':''}>${o}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>

      <!-- Stats overlay -->
      <div style="background:rgba(8,4,20,0.8);border:1px solid rgba(80,140,220,0.15);border-radius:6px;padding:10px;margin-bottom:10px">
        <div style="font-size:9px;color:rgba(200,180,230,0.4);letter-spacing:1px;margin-bottom:7px">SPELL STATS</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center">
          <div><div style="font-size:16px;color:#ff8844;font-weight:bold">${st.dmg}</div><div style="font-size:8px;color:rgba(200,180,230,0.35)">DAMAGE</div></div>
          <div><div style="font-size:16px;color:#44aaff;font-weight:bold">${st.mana.toFixed(0)}</div><div style="font-size:8px;color:rgba(200,180,230,0.35)">MANA</div></div>
          <div><div style="font-size:16px;color:#aaffaa;font-weight:bold">${st.dps}</div><div style="font-size:8px;color:rgba(200,180,230,0.35)">DPS</div></div>
          <div><div style="font-size:14px;color:#ffdd88;font-weight:bold">${st.cast}s</div><div style="font-size:8px;color:rgba(200,180,230,0.35)">CAST</div></div>
          <div><div style="font-size:14px;color:#ff88ff;font-weight:bold">${st.aoe > 0 ? st.aoe+'wu' : '—'}</div><div style="font-size:8px;color:rgba(200,180,230,0.35)">AoE</div></div>
          <div><div style="font-size:14px;color:#88ffdd;font-weight:bold">${st.dur > 0 ? st.dur+'s' : '—'}</div><div style="font-size:8px;color:rgba(200,180,230,0.35)">EFFECT</div></div>
        </div>
        ${castLog.length > 0 ? `<div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(80,140,220,0.1);font-size:9px;color:rgba(200,180,230,0.35)">
          <span style="color:rgba(200,180,230,0.5)">SESSION:</span>
          ${castLog.length} cast${castLog.length>1?'s':''} •
          avg ${(castLog.reduce((s,c)=>s+c.dmg,0)/castLog.length).toFixed(1)} dmg •
          last ${castLog[castLog.length-1]!.dmg} dmg
        </div>` : ''}
      </div>

      <div style="display:flex;gap:8px">
        <button id="wb-cast" style="flex:1;padding:8px;background:rgba(30,60,120,0.4);border:1px solid rgba(80,140,220,0.4);border-radius:5px;color:#88aaff;cursor:pointer;font-size:11px">⚡ Cast [R]</button>
        <button id="wb-export" style="padding:8px 12px;background:rgba(60,40,120,0.25);border:1px solid rgba(140,80,220,0.3);border-radius:5px;color:#cc88ff;cursor:pointer;font-size:10px">📋 Export</button>
      </div>
    `;

    const onChange = () => {
      elem  = (panel.querySelector<HTMLSelectElement>('#wb-elem'))?.value  ?? elem;
      shape = (panel.querySelector<HTMLSelectElement>('#wb-shape'))?.value ?? shape;
      mod   = (panel.querySelector<HTMLSelectElement>('#wb-mod'))?.value   ?? mod;
      renderWB();
    };
    panel.querySelector('#wb-elem')?.addEventListener('change',  onChange);
    panel.querySelector('#wb-shape')?.addEventListener('change', onChange);
    panel.querySelector('#wb-mod')?.addEventListener('change',   onChange);

    panel.querySelector('#wb-close')?.addEventListener('click', () => {
      if (slowMoActive) { (window as any).__game?.setGameSpeed?.(1); slowMoActive = false; }
      panel.remove();
    });

    // Effect visualiser — toggle slow-motion
    panel.querySelector('#wb-slo')?.addEventListener('click', () => {
      slowMoActive = !slowMoActive;
      (window as any).__game?.setGameSpeed?.(slowMoActive ? 0.1 : 1);
      renderWB();
    });

    const doCast = () => {
      const g = (window as any).__game;
      if (g?.grantAllSpells) g.grantAllSpells();
      const name = `${elem}_${shape}${mod !== 'none' ? `_${mod}` : ''}`;
      const st2 = computeStats(elem, shape, mod);
      castLog.push({ ts: Date.now(), dmg: st2.dmg });
      if (castLog.length > 20) castLog.shift();
      (window as any).__game = { ...(window as any).__game, lastSpellCast: { element: elem, shape, modifier: mod, name } };
      console.log('[SpellWorkbench] Cast:', name, st2);
      renderWB();  // refresh stats + session log
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:75px;left:50%;transform:translateX(-50%);background:rgba(30,60,120,0.95);border:1px solid rgba(80,140,220,0.5);border-radius:5px;padding:6px 14px;color:#88aaff;font-size:10px;z-index:9200;pointer-events:none;';
      toast.textContent = `⚡ ${elem} ${shape}${mod !== 'none' ? ` + ${mod}` : ''} — ${st2.dmg} dmg`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1800);
    };

    panel.querySelector('#wb-cast')?.addEventListener('click', doCast);
    (panel as any)._doCast = doCast;   // expose for R-key handler

    panel.querySelector('#wb-export')?.addEventListener('click', () => {
      const st2 = computeStats(elem, shape, mod);
      const spec = { element: elem, shape, modifier: mod === 'none' ? null : mod, stats: st2, generated: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `spell_${elem}_${shape}.json`; a.click(); URL.revokeObjectURL(a.href);
    });
  };

  renderWB();
  document.body.appendChild(panel);
}

// ── Combat Arena ──────────────────────────────────────────────────────────────

export function buildCombatArena(scene: THREE.Scene): CleanupFn {
  const group = new THREE.Group();
  group.name  = 'backroom_combat_arena';

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 32),
    new THREE.MeshBasicMaterial({ color: 0x1a0808, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // Arena ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(18, 0.3, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x882222 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const ambient = new THREE.AmbientLight(0xcc4444, 0.5);
  group.add(ambient);

  group.add(_makeLabel('⚔️ COMBAT TESTING ARENA', 0xff4444, { x: 0, y: 6, z: -15 }, 8));

  scene.add(group);
  return () => { scene.remove(group); };
}

// ── Building Interior Lab ─────────────────────────────────────────────────────

const _BLAB_PAIRS = [
  { kind: 'cottage',    style: 'thatched', floors: 1, species: 'human',     role: 'farmer',   note: '1 floor'  },
  { kind: 'inn',        style: 'tudor',    floors: 2, species: 'human',     role: 'merchant', note: '2 floors' },
  { kind: 'blacksmith', style: 'stone',    floors: 1, species: 'dwarven',   role: 'guard',    note: '1 floor'  },
  { kind: 'chapel',     style: 'gothic',   floors: 2, species: 'celestial', role: 'scholar',  note: '2 floors' },
  { kind: 'villa',      style: 'vampiric', floors: 2, species: 'undead',    role: 'noble',    note: '2 floors' },
  { kind: 'apothecary', style: 'arcane',   floors: 2, species: 'elf',       role: 'elder',    note: '2 floors' },
] as const;

/**
 * Building Interior Lab — walk through procedural interiors as the fox princess.
 * Spawns 6 interiors in a row at z=0. Floor-1s are placed at z=+22 (same X).
 * Physics: perimeter box colliders per interior so the character bounces off walls.
 * NPCs placed in the first room of each interior.
 */
export async function buildBuildingLab(
  scene: THREE.Scene,
  physics?: import('@/physics/PhysicsWorld').PhysicsWorld,
): Promise<CleanupFn> {

  const sceneGroups: THREE.Group[]       = [];
  const sceneLights: THREE.Light[]       = [];
  const physBodies:  any[]               = [];

  // ── Ground platform (visual only — physics floor provided by enterBackroom) ──
  const platform = new THREE.Group();
  platform.name  = 'backroom_building_lab';

  const floorMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
  const floorGeo = new THREE.PlaneGeometry(160, 70);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, -0.02, 5);
  platform.add(floorMesh);

  const grid = new THREE.GridHelper(160, 80, 0x2a2a4a, 0x16162a);
  grid.position.set(0, 0, 5);
  platform.add(grid);

  // Header label
  platform.add(_makeLabel('🏗  BUILDING INTERIOR LAB  —  WASD · mouse · E to interact', 0x88ccff, { x: 0, y: 5.5, z: -30 }, 10));
  platform.add(_makeLabel('Walk through rooms · find the stair trigger · E = change floor', 0x6688aa, { x: 0, y: 4.6, z: -30 }, 6));

  scene.add(platform);
  sceneGroups.push(platform);

  // ── Import helpers ────────────────────────────────────────────────────────
  const [
    { generateInterior },
    { STYLE_COLORS },
    { getDefaultNpcDna },
    { buildNpc },
  ] = await Promise.all([
    import('@/world/buildings/InteriorGenerator'),
    import('@/world/buildings/BuildingDNA'),
    import('@/npc-creator/defaults/NpcDefaults'),
    import('@/npc-creator/builder'),
  ]);

  const COL_W   = 24;
  const TOTAL   = _BLAB_PAIRS.length;
  const F1_OFFSET_Z = 24;   // floor-1 displaced Z so they don't overlap floor-0

  for (let i = 0; i < TOTAL; i++) {
    const { kind, style, floors, species, role, note } = _BLAB_PAIRS[i];
    const cx = (i - (TOTAL - 1) / 2) * COL_W;

    const dna: any = {
      v:1, kind:'building', name:`${kind} (${style})`,
      seed: (i + 1) * 0x6B8B4567,
      buildingKind: kind, size: 'medium', floors,
      style, condition: 'weathered', hasInterior: true, interiorLayout: 'single_room',
      colors: (STYLE_COLORS as Record<string, any>)[style] ?? STYLE_COLORS['timber'],
      rotation: 0, terrace: 'none', features: [],
    };

    // ── Interior floor 0 ─────────────────────────────────────────────────
    const int0 = generateInterior(dna, 0);
    int0.group.position.set(cx, 0, 0);
    scene.add(int0.group);
    sceneGroups.push(int0.group);
    for (const l of int0.lights) {
      l.position.x += cx; scene.add(l); sceneLights.push(l);
    }

    // Physics perimeter walls for floor 0
    if (physics) {
      const hw = int0.planW / 2 + 0.1;
      const hd = int0.planD / 2 + 0.1;
      const fc = int0.floorCenter;         // root-local centre of floor
      const wx = cx + fc.x;
      const wz = 0  + fc.z;
      const wallH = 3.0;
      for (const [ox, oz, ew, ed] of [
        [0,   -hd, hw, 0.5],   // south wall
        [0,   +hd, hw, 0.5],   // north wall
        [-hw, 0,  0.5, hd],    // west wall
        [+hw, 0,  0.5, hd],    // east wall
      ] as [number,number,number,number][]) {
        physBodies.push(physics.createStaticBox(
          new THREE.Vector3(wx + ox, wallH, wz + oz),
          new THREE.Vector3(ew, wallH, ed),
        ));
      }
    }

    // ── Column label (floor 0) ────────────────────────────────────────────
    platform.add(_makeLabel(`${kind}\n${style} · ${note}`, 0xaaaaff, { x: cx, y: 4.5, z: -22 }, 3.5));

    // ── Interior floor 1 (if multi-floor) ────────────────────────────────
    if (floors > 1) {
      const int1 = generateInterior(dna, 1);
      int1.group.position.set(cx, 0, F1_OFFSET_Z);
      scene.add(int1.group);
      sceneGroups.push(int1.group);
      for (const l of int1.lights) {
        l.position.x += cx; l.position.z += F1_OFFSET_Z; scene.add(l); sceneLights.push(l);
      }

      // Physics walls for floor 1
      if (physics) {
        const hw = int1.planW / 2 + 0.1;
        const hd = int1.planD / 2 + 0.1;
        const fc = int1.floorCenter;
        const wx = cx + fc.x;
        const wz = F1_OFFSET_Z + fc.z;
        const wallH = 3.0;
        for (const [ox, oz, ew, ed] of [
          [0,   -hd, hw, 0.5],
          [0,   +hd, hw, 0.5],
          [-hw, 0,  0.5, hd],
          [+hw, 0,  0.5, hd],
        ] as [number,number,number,number][]) {
          physBodies.push(physics.createStaticBox(
            new THREE.Vector3(wx + ox, wallH, wz + oz),
            new THREE.Vector3(ew, wallH, ed),
          ));
        }
      }

      // Stair connection arrow label
      platform.add(_makeLabel(`↑ Floor 1`, 0x88ffaa, { x: cx, y: 3.5, z: F1_OFFSET_Z - 21 }, 2.5));
    }

    // ── NPC inside floor 0 ────────────────────────────────────────────────
    try {
      const npcDna  = getDefaultNpcDna(species as any, role as any, (i + 7) * 0x9E3779B9 >>> 0);
      const npcInst = await buildNpc({ ...npcDna });
      // Place NPC in the interior centre (root-local centre + group world pos)
      const fc = int0.floorCenter;
      npcInst.root.position.set(cx + fc.x, 0, fc.z + 1);
      scene.add(npcInst.root);
      sceneGroups.push(npcInst.root);
    } catch { /* NPC optional */ }
  }

  // Connecting pathway between row 0 and row 1
  const pathMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4, F1_OFFSET_Z),
    new THREE.MeshLambertMaterial({ color: 0x222240 }),
  );
  pathMesh.rotation.x = -Math.PI / 2;
  pathMesh.position.set(0, 0, F1_OFFSET_Z / 2);
  platform.add(pathMesh);
  platform.add(_makeLabel('⤴  stair connections above  ⤴', 0x44cc88, { x: 0, y: 2, z: F1_OFFSET_Z / 2 }, 4));

  console.log('[buildBuildingLab] ready — 6 building interiors, walk around with WASD');

  return () => {
    for (const g of sceneGroups) scene.remove(g);
    for (const l of sceneLights) scene.remove(l);
    if (physics) {
      for (const b of physBodies) {
        try { physics.rapierWorld.removeRigidBody(b); } catch { /* already removed */ }
      }
    }
  };
}

// ── Generic empty room (placeholder for other backrooms) ──────────────────────

export function buildEmptyRoom(scene: THREE.Scene, name: string, color: number): CleanupFn {
  const group = new THREE.Group();
  group.name  = `backroom_${name}`;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({ color: 0x0a0a14, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const grid = new THREE.GridHelper(20, 10, color, 0x111122);
  grid.position.y = 0.01;
  group.add(grid);

  group.add(_makeLabel(name.toUpperCase(), color, { x: 0, y: 4, z: -8 }, 8));

  scene.add(group);
  return () => { scene.remove(group); };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function _makeLabel(text: string, color: number, pos: { x: number; y: number; z: number }, scale: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = `#${color.toString(16).padStart(6,'0')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
  sprite.scale.set(scale * 4, scale * 0.5, 1);
  sprite.position.set(pos.x, pos.y, pos.z);
  return sprite;
}
