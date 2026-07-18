/**
 * showroom.ts — Standalone visual test arena
 *
 * A clean test scene with:
 *   • Checkerboard floor with 1m grid + distance markers every 5m
 *   • Neutral ambient + directional lighting
 *   • OrbitControls camera
 *   • window.showroom API: spawnNpc / spawnEnemy / spawnBuilding / spawnProp / clear
 *
 * Entry: showroom.html
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Scene setup ───────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog        = new THREE.FogExp2(0x1a1a2e, 0.006);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 14, 32);
camera.lookAt(0, 2, -5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;
controls.minDistance    = 2;
controls.maxDistance    = 80;
controls.maxPolarAngle  = Math.PI * 0.48;

// ── Lighting ──────────────────────────────────────────────────────────────────

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
sun.position.set(8, 16, 6);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 120;
sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
sun.shadow.camera.right = sun.shadow.camera.top   =  40;
scene.add(sun);

// Soft fill from opposite side
const fill = new THREE.DirectionalLight(0xd0e8ff, 0.4);
fill.position.set(-6, 8, -4);
scene.add(fill);

// ── Checkerboard floor ────────────────────────────────────────────────────────

function makeCheckerFloor(size = 40, tileCount = 40): THREE.Mesh {
  // Build a canvas texture with checkerboard + grid lines
  const RES = 512;
  const cv  = document.createElement('canvas');
  cv.width  = RES; cv.height = RES;
  const ctx = cv.getContext('2d')!;
  const cellPx = RES / tileCount;

  for (let r = 0; r < tileCount; r++) {
    for (let c = 0; c < tileCount; c++) {
      const light = (r + c) % 2 === 0;
      ctx.fillStyle = light ? '#2e2e44' : '#1a1a30';
      ctx.fillRect(c * cellPx, r * cellPx, cellPx, cellPx);
    }
  }
  // Grid lines every 5 tiles
  ctx.strokeStyle = '#4a4a6a';
  ctx.lineWidth   = 1.5;
  for (let i = 0; i <= tileCount; i += 5) {
    const p = i * cellPx;
    ctx.beginPath(); ctx.moveTo(p, 0);     ctx.lineTo(p, RES);    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p);     ctx.lineTo(RES, p);    ctx.stroke();
  }
  // Centre cross
  ctx.strokeStyle = '#8080c0';
  ctx.lineWidth = 2;
  const mid = RES / 2;
  ctx.beginPath(); ctx.moveTo(mid - 20, mid); ctx.lineTo(mid + 20, mid); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mid, mid - 20); ctx.lineTo(mid, mid + 20); ctx.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;

  const geo  = new THREE.PlaneGeometry(size, size);
  const mat  = new THREE.MeshLambertMaterial({ map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

scene.add(makeCheckerFloor());

// ── Distance ruler labels ─────────────────────────────────────────────────────

function makeLabel(text: string, pos: THREE.Vector3): THREE.Sprite {
  const cv  = document.createElement('canvas');
  cv.width  = 128; cv.height = 32;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, 128, 32);
  ctx.fillStyle = '#8080c0';
  ctx.font      = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 22);
  const tex     = new THREE.CanvasTexture(cv);
  const mat     = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite  = new THREE.Sprite(mat);
  sprite.position.copy(pos);
  sprite.scale.set(2, 0.5, 1);
  return sprite;
}

for (const d of [5, 10, 15, 20]) {
  scene.add(makeLabel(`${d}m`, new THREE.Vector3(d, 0.3, 0)));
  scene.add(makeLabel(`-${d}m`, new THREE.Vector3(-d, 0.3, 0)));
  scene.add(makeLabel(`${d}m`, new THREE.Vector3(0, 0.3, d)));
}

// ── Spawn state ───────────────────────────────────────────────────────────────

interface SpawnedItem { group: THREE.Group; dispose: () => void }
const _spawned: SpawnedItem[] = [];
let _cursor = { x: -15, z: 0 };   // next auto-place position

function autoPlace(group: THREE.Group, spacing = 4): void {
  group.position.set(_cursor.x, 0, _cursor.z);
  _cursor.x += spacing;
  if (_cursor.x > 18) { _cursor.x = -15; _cursor.z += 8; }
  scene.add(group);
}

function registerSpawned(group: THREE.Group, disposeFn: () => void): void {
  _spawned.push({ group, dispose: disposeFn });
  console.log(`[showroom] spawned "${group.userData['label'] ?? group.userData['npcName'] ?? group.userData['enemyDna']?.name ?? group.userData['buildingKind'] ?? '?'}" at (${group.position.x.toFixed(1)}, ${group.position.z.toFixed(1)})`);
}

/** Add a small canvas-sprite label floating above a world position. */
function _floatLabel(text: string, x: number, y: number, z: number): void {
  const lines = text.split('\n');
  const W = 256, H = 56 * lines.length;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(10,8,20,0.78)';
  ctx.roundRect(0, 0, W, H, 8);
  ctx.fill();
  ctx.fillStyle = '#c0b8ff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 32 + i * 30));
  const tex  = new THREE.CanvasTexture(cv);
  const mat  = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp   = new THREE.Sprite(mat);
  sp.position.set(x, y, z);
  sp.scale.set(4, 4 * (H / W), 1);
  scene.add(sp);
}

// ── Public API ────────────────────────────────────────────────────────────────

const showroom = {
  /** Spawn an NPC archetype. species = 'human'|'undead'|'vulperia'|'slime'|'elf'|'celestial'|'draconic' */
  async spawnNpc(
    species: string = 'human',
    role:    string = 'merchant',
    x?: number, z?: number,
  ): Promise<void> {
    const { getDefaultNpcDna } = await import('@/npc-creator/defaults/NpcDefaults');
    const { buildNpc }          = await import('@/npc-creator/builder');
    const dna  = getDefaultNpcDna(species as any, role as any, Date.now() ^ (Math.random() * 0xFFFF) >>> 0);
    const inst = await buildNpc({ ...dna, name: `${species} ${role}` });
    if (x !== undefined && z !== undefined) {
      inst.root.position.set(x, 0, z);
      scene.add(inst.root);
    } else {
      autoPlace(inst.root, 3.5);
    }
    registerSpawned(inst.root, () => inst.dispose());
  },

  /** Spawn an enemy archetype. tier = 1|2|3|4 */
  async spawnEnemy(
    species: string = 'undead',
    role:    string = 'melee',
    tier:    number = 1,
    x?: number, z?: number,
  ): Promise<void> {
    const { getDefaultEnemyDna } = await import('@/enemy-creator/defaults/EnemyDefaults');
    const { buildEnemy }          = await import('@/enemy-creator/builder');
    const dna    = getDefaultEnemyDna(species as any, role as any, tier as any, Date.now() ^ (Math.random() * 0xFFFF) >>> 0);
    const result = await buildEnemy({ ...dna, name: `T${tier} ${species} ${role}` });
    if (x !== undefined && z !== undefined) {
      result.rig.group.position.set(x, 0, z);
      scene.add(result.rig.group);
    } else {
      autoPlace(result.rig.group, 3.5);
    }
    registerSpawned(result.rig.group, () => {});
  },

  /** Spawn a building archetype. */
  spawnBuilding(
    kind:  string = 'house',
    style: string = 'thatched',
    size:  string = 'small',
    x?: number, z?: number,
  ): void {
    import('@/world/buildings/BuildingBuilder').then(({ buildBuilding }) => {
      import('@/world/buildings/BuildingDNA').then(({ STYLE_COLORS }) => {
        const dna = {
          v: 1, kind: 'building', name: `${style} ${kind}`, seed: Date.now(),
          buildingKind: kind, size, floors: 2, style,
          condition: 'weathered', hasInterior: true, interiorLayout: 'single_room',
          colors: (STYLE_COLORS as Record<string, import('@/world/buildings/BuildingDNA').BuildingColors>)[style] ?? STYLE_COLORS['thatched'],
          rotation: 0,
        } as any;
        const inst = buildBuilding(dna);
        if (x !== undefined && z !== undefined) {
          inst.exteriorGroup.position.set(x, 0, z);
          scene.add(inst.exteriorGroup);
        } else {
          autoPlace(inst.exteriorGroup, 10);
        }
        registerSpawned(inst.exteriorGroup, () => inst.dispose());
      });
    });
  },

  /** Spawn a prop. */
  spawnProp(
    kind:     string = 'chest',
    material: string = 'wood',
    x?: number, z?: number,
  ): void {
    import('@/prop-creator/builder').then(({ buildProp }) => {
      import('@/prop-creator/types').then(({ MATERIAL_COLORS }) => {
        const dna = {
          v: 1, kind: 'prop', name: `${material} ${kind}`, seed: Date.now(),
          propKind: kind, material, theme: 'dungeon', condition: 'weathered',
          size: 1, colors: (MATERIAL_COLORS as Record<string, import('@/prop-creator/types').PropColors>)[material] ?? MATERIAL_COLORS['wood'],
          interactive: false, glow: kind === 'lantern' || kind === 'cauldron',
          glowIntensity: 0.8,
        } as any;
        const built = buildProp(dna);
        if (x !== undefined && z !== undefined) {
          built.root.position.set(x, 0, z);
          scene.add(built.root);
        } else {
          autoPlace(built.root, 2.5);
        }
        registerSpawned(built.root, () => built.dispose());
      });
    });
  },

  /** Remove all spawned items and reset cursor. */
  clear(): void {
    for (const item of _spawned) {
      scene.remove(item.group);
      item.dispose();
    }
    _spawned.length = 0;
    _cursor = { x: -15, z: 0 };
    console.log('[showroom] cleared');
  },

  /** Spawn a full row of all NPC species. */
  async spawnAllNpcs(): Promise<void> {
    const species = ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'];
    const roles   = ['merchant', 'scholar', 'guard', 'innkeeper', 'quest_giver', 'elder', 'mysterious'];
    for (let i = 0; i < species.length; i++) {
      await showroom.spawnNpc(species[i], roles[i], -12 + i * 4, -8);
    }
  },

  /** Spawn enemy tier comparison (3 rows × species). */
  async spawnEnemyTiers(): Promise<void> {
    const configs = [
      { species: 'undead',   role: 'melee',  z:  4 },
      { species: 'draconic', role: 'caster', z:  8 },
      { species: 'elf',      role: 'ranged', z: 12 },
    ];
    for (const { species, role, z } of configs) {
      for (const [tier, x] of [[1, -8], [2, 0], [3, 8]] as [number, number][]) {
        await showroom.spawnEnemy(species, role, tier, x, z);
      }
    }
  },

  /** Spawn all 4 building styles in a row. */
  spawnAllBuildings(): void {
    // Row 1: residential styles
    const residential = ['house', 'terraced', 'cottage', 'villa'];
    for (let i = 0; i < residential.length; i++) {
      showroom.spawnBuilding(residential[i], ['thatched','timber','thatched','stone'][i], 'medium', -18 + i * 12, -5);
    }
    // Row 2: commercial / social
    const commercial = ['tavern', 'shop', 'apothecary', 'market_stall'];
    for (let i = 0; i < commercial.length; i++) {
      showroom.spawnBuilding(commercial[i], ['tudor','stone','timber','stone'][i], 'medium', -18 + i * 12, -22);
    }
    // Row 3: special / civic
    const special = ['chapel', 'watchtower', 'blacksmith', 'tent'];
    for (let i = 0; i < special.length; i++) {
      showroom.spawnBuilding(special[i], ['gothic','stone','stone','thatched'][i], 'medium', -18 + i * 12, -38);
    }
    // Row 4: infrastructure
    const infra = ['barn', 'well', 'ruin', 'guild'];
    for (let i = 0; i < infra.length; i++) {
      showroom.spawnBuilding(infra[i], 'stone', 'small', -18 + i * 12, -52);
    }
  },

  /** Preview an interior scene — floor plan + walls + furnished rooms. */
  spawnInterior(kind = 'house', style = 'timber', x = 0, z = 0): void {
    import('@/world/buildings/InteriorGenerator').then(({ generateInterior }) => {
      import('@/world/buildings/BuildingDNA').then(({ STYLE_COLORS }) => {
        const dna = {
          v: 1, kind: 'building', name: `${kind} interior`, seed: Date.now(),
          buildingKind: kind, size: 'medium', floors: 2, style,
          condition: 'weathered', hasInterior: true, interiorLayout: 'single_room',
          colors: (STYLE_COLORS as Record<string, any>)[style] ?? STYLE_COLORS['timber'],
          rotation: 0, terrace: 'none', features: [],
        } as any;
        const interior = generateInterior(dna);
        interior.group.position.set(x, 0, z);
        scene.add(interior.group);
        for (const l of interior.lights) scene.add(l);
        registerSpawned(interior.group, () => {});
        console.log(`[showroom] interior spawned: ${kind}/${style} at (${x},${z})`);
      });
    });
  },

  /** Spawn a row of different interior types for comparison. */
  spawnInteriorShowcase(): void {
    const interiors = [
      { kind: 'house',       style: 'timber',   x: -15, z: 0  },
      { kind: 'inn',         style: 'tudor',    x: 0,   z: 0  },
      { kind: 'blacksmith',  style: 'stone',    x: 18,  z: 0  },
      { kind: 'chapel',      style: 'gothic',   x: -15, z: -18 },
      { kind: 'villa',       style: 'vampiric', x: 0,   z: -18 },
      { kind: 'apothecary',  style: 'arcane',   x: 18,  z: -18 },
    ];
    for (const { kind, style, x, z } of interiors) {
      showroom.spawnInterior(kind, style, x, z);
    }
  },

  /**
   * Building walkthrough demo — the "test area".
   *
   * Spawns a 3×2 grid of (exterior + interior) pairs, each with an NPC
   * placed inside.  A multi-floor inn shows the staircase.
   *
   *   Col 0: cottage/thatched   Col 1: inn/tudor (2f)  Col 2: chapel/gothic
   *   Col 3: blacksmith/stone   Col 4: villa/vampiric   Col 5: apothecary/arcane
   *
   * Each cell:
   *   - Exterior building at (cx, 0, -8)
   *   - Interior cutaway at (cx, 0, 8) — same X, offset Z so you can see both
   *   - 1-2 NPCs placed in the interior rooms
   *   - A floating label above each pair
   */
  async spawnBuildingWalkthrough(): Promise<void> {
    const PAIRS: Array<{ kind: string; style: string; floors: number; species: string; role: string }> = [
      { kind: 'cottage',     style: 'thatched', floors: 1, species: 'human',     role: 'farmer'   },
      { kind: 'inn',         style: 'tudor',    floors: 2, species: 'human',     role: 'merchant' },
      { kind: 'chapel',      style: 'gothic',   floors: 1, species: 'celestial', role: 'scholar'  },
      { kind: 'blacksmith',  style: 'stone',    floors: 1, species: 'dwarven',   role: 'guard'    },
      { kind: 'villa',       style: 'vampiric', floors: 2, species: 'undead',    role: 'noble'    },
      { kind: 'apothecary',  style: 'arcane',   floors: 2, species: 'elf',       role: 'elder'    },
    ];

    const COL_SPACING = 20;
    const EXT_Z       = -10;   // exterior row Z
    const INT_Z       =  12;   // interior row Z

    const [
      { STYLE_COLORS, factionBuildingDna: _fbd },
      { buildBuilding },
      { generateInterior },
      { getDefaultNpcDna },
      { buildNpc },
    ] = await Promise.all([
      import('@/world/buildings/BuildingDNA'),
      import('@/world/buildings/BuildingBuilder'),
      import('@/world/buildings/InteriorGenerator'),
      import('@/npc-creator/defaults/NpcDefaults'),
      import('@/npc-creator/builder'),
    ]);

    for (let i = 0; i < PAIRS.length; i++) {
      const { kind, style, floors, species, role } = PAIRS[i]!;
      const cx = (i - (PAIRS.length - 1) / 2) * COL_SPACING;

      // ── Exterior building ──────────────────────────────────────────
      const dna: any = {
        v:1, kind:'building', name:`${kind} (${style})`, seed: i * 0x6B8B4567,
        buildingKind: kind, size:'medium', floors,
        style, condition:'weathered', hasInterior:true, interiorLayout:'single_room',
        colors: (STYLE_COLORS as Record<string, any>)[style] ?? STYLE_COLORS['timber'],
        rotation:0, terrace:'none', features:[],
      };
      const inst = buildBuilding(dna);
      inst.exteriorGroup.position.set(cx, 0, EXT_Z);
      scene.add(inst.exteriorGroup);
      registerSpawned(inst.exteriorGroup, () => inst.dispose());

      // ── Interior scene (floor 0) ───────────────────────────────────
      const interior = generateInterior(dna, 0);
      interior.group.position.set(cx, 0, INT_Z);
      scene.add(interior.group);
      for (const l of interior.lights) {
        l.position.x += cx;
        l.position.z += INT_Z;
        scene.add(l);
      }
      registerSpawned(interior.group, () => {});

      // ── If multi-floor, also show floor 1 offset slightly ──────────
      if (floors > 1) {
        const interior1 = generateInterior(dna, 1);
        interior1.group.position.set(cx + 0.5, 0, INT_Z + 14);
        scene.add(interior1.group);
        for (const l of interior1.lights) {
          l.position.x += cx + 0.5;
          l.position.z += INT_Z + 14;
          scene.add(l);
        }
        registerSpawned(interior1.group, () => {});
        // Label: "Floor 1"
        _floatLabel(`Floor 1`, cx + 0.5, 3.5, INT_Z + 14);
      }

      // ── NPC inside the interior ────────────────────────────────────
      try {
        const npcDna  = getDefaultNpcDna(species as any, role as any, i * 0x9E3779B9 >>> 0);
        const npcInst = await buildNpc(npcDna);
        // Place NPC in the centre of the interior (group-local, then world)
        npcInst.root.position.set(cx, 0, INT_Z - 1);
        scene.add(npcInst.root);
        registerSpawned(npcInst.root, () => npcInst.dispose?.());
      } catch { /* NPC build optional */ }

      // ── Floating labels ────────────────────────────────────────────
      _floatLabel(`${kind}/${style}\n${floors}F`, cx, 6, EXT_Z - 2);
      _floatLabel(`Interior F0`, cx, 3.5, INT_Z - 2);
    }

    console.log('[showroom] building walkthrough demo ready — use OrbitControls to explore');
  },

  spawnFactionShowcase(): void {
    import('@/world/buildings/BuildingDNA').then(({ factionBuildingDna }) => {
      import('@/world/buildings/BuildingBuilder').then(({ buildBuilding }) => {
        const factions = [
          'human_rural', 'human_town', 'human_noble',
          'elven', 'dwarven', 'vampire',
          'draconic', 'celestial', 'vulperia',
          'slime', 'orcish', 'fae',
        ] as const;
        const kinds = ['cottage', 'watchtower', 'villa', 'chapel', 'blacksmith', 'watchtower',
                       'watchtower', 'watchtower', 'cottage', 'tent', 'barn', 'tent'] as const;
        for (let fi = 0; fi < factions.length; fi++) {
          const row = Math.floor(fi / 4);
          const col = fi % 4;
          const dna = factionBuildingDna(kinds[fi] as any, factions[fi] as any, fi * 0x9E3779B9 >>> 0, 'medium', 2);
          const inst = buildBuilding(dna);
          inst.exteriorGroup.position.set(-18 + col * 13, 0, -5 + row * -18);
          scene.add(inst.exteriorGroup);
          console.log(`[showroom] spawned ${factions[fi]} ${kinds[fi]}`);
          registerSpawned(inst.exteriorGroup, () => inst.dispose());
        }
      });
    });
  },
};

(window as any).showroom        = showroom;
(window as any).__showroomScene = scene;   // exposed for Playwright tests

// ── HUD instructions ──────────────────────────────────────────────────────────

const hud = document.createElement('div');
hud.style.cssText = `
  position:fixed; top:12px; left:12px; background:rgba(0,0,0,0.7);
  color:#a0a0d0; font:12px/1.6 monospace; padding:10px 14px;
  border-radius:6px; border:1px solid rgba(80,80,160,0.4);
  pointer-events:none; z-index:100;
`;
hud.innerHTML = `
  <b style="color:#c0c0ff">TT&amp;T Showroom</b><br>
  <span style="color:#6060a0">Orbit:</span> left drag &nbsp; <span style="color:#6060a0">Pan:</span> right drag &nbsp; <span style="color:#6060a0">Zoom:</span> scroll<br><br>
  <b style="color:#8080ff">Console commands:</b><br>
  <code>showroom.spawnBuildingWalkthrough()</code> ← building demo<br>
  <code>showroom.spawnInteriorShowcase()</code><br>
  <code>showroom.spawnAllBuildings()</code><br>
  <code>showroom.spawnAllNpcs()</code><br>
  <code>showroom.spawnEnemyTiers()</code><br>
  <code>showroom.spawnNpc('elf','elder')</code><br>
  <code>showroom.spawnBuilding('inn','arcane','large')</code><br>
  <code>showroom.spawnInterior('inn','tudor')</code><br>
  <code>showroom.spawnProp('cauldron','iron')</code><br>
  <code>showroom.clear()</code>
`;
document.body.appendChild(hud);

// ── Render loop ───────────────────────────────────────────────────────────────

let _t = 0;
renderer.setAnimationLoop((time) => {
  _t = time / 1000;
  controls.update();
  renderer.render(scene, camera);
});

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── Auto-run from URL param (?demo=building|interiors|buildings|factions|npcs) ─

const _demoParam = new URLSearchParams(location.search).get('demo');
if (_demoParam) {
  // Give the page one frame to settle before loading assets
  requestAnimationFrame(() => {
    switch (_demoParam) {
      case 'building':
      case 'walkthrough':
        showroom.spawnBuildingWalkthrough().catch(console.error);
        // Reposition camera for the walkthrough layout
        camera.position.set(0, 22, 45);
        controls.target.set(0, 0, 5);
        controls.update();
        break;
      case 'interiors':
        showroom.spawnInteriorShowcase();
        camera.position.set(0, 18, 30);
        controls.target.set(0, 0, -5);
        controls.update();
        break;
      case 'buildings':
        showroom.spawnAllBuildings();
        camera.position.set(0, 30, 60);
        controls.update();
        break;
      case 'npcs':
        showroom.spawnAllNpcs();
        camera.position.set(0, 8, 20);
        controls.update();
        break;
      case 'factions':
        showroom.spawnFactionShowcase();
        camera.position.set(0, 25, 50);
        controls.update();
        break;
    }
    console.log(`[showroom] auto-ran demo: ${_demoParam}`);
  });
}
