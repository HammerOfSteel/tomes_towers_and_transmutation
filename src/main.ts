import * as THREE from 'three';
import { EffectComposer, EffectPass, RenderPass, BloomEffect, KernelSize } from 'postprocessing';
import { GameLoop } from '@/core/GameLoop';
import { InputManager } from '@/core/InputManager';
import { CameraRig } from '@/core/CameraRig';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { CombatSystem } from '@/combat/CombatSystem';
import { SpellSystem } from '@/combat/SpellSystem';
import { SceneManager } from '@/levels/SceneManager';
import { HUD } from '@/ui/HUD';
import { PauseMenu } from '@/ui/PauseMenu';
import { MainMenu } from '@/ui/MainMenu';
import { CharacterCreationV2 } from '@/ui/CharacterCreationV2';
import { NewGameFlow }          from '@/scene/NewGameFlow';
import type { CharacterConfig } from '@/ui/CharacterCreation';
import { DevSandbox } from '@/ui/DevSandbox';
import { generateSandboxArena } from '@/levels/SandboxArena';
import { DeathScreen } from '@/ui/DeathScreen';
import { VictoryBanner } from '@/ui/VictoryBanner';
import { EditMode } from '@/editor/EditMode';
import { ProgressionSystem } from '@/progression/ProgressionSystem';
import { BookReader } from '@/interactables/BookReader';
import { InteractableSystem } from '@/interactables/InteractableSystem';
import { SpellBook } from '@/ui/SpellBook';
import { DevPanel } from '@/ui/DevPanel';
import { generateDungeon, type DungeonPlan } from '@/levels/DungeonGenerator';
import { generateTower } from '@/levels/TowerGenerator';
import { getFloorDef } from '@/levels/TowerFloorDef';
import { TelescopeView } from '@/ui/TelescopeView';
import { OverworldScene } from '@/scene/OverworldScene';
import { OWMinimap }      from '@/ui/OWMinimap';
import { loadWorldGenConfig, type WorldGenConfig } from '@/world/WorldGenConfig';
import { buildWorldData } from '@/world/WorldGenerator';
import { PartyManager } from '@/combat/PartyManager';
import { TamingGame } from '@/interactables/TamingGame';
import { generateGreenhouse } from '@/levels/GreenhouseGenerator';
import { SlimeEnemy } from '@/enemy/SlimeEnemy';
import { TalentSystem } from '@/progression/TalentSystem';
import { buildCreature, type CreatureRig } from '@/creatures/CreatureBuilder';
import { animateCreature } from '@/creatures/CreatureAnimator';
import { TalentTree } from '@/ui/TalentTree';
import { StatPanel } from '@/ui/StatPanel';
import { LevelUpBanner } from '@/ui/LevelUpBanner';
import { QuestLog } from '@/ui/QuestLog';
import { DiscoveryTracker } from '@/world/DiscoveryTracker';
import { Inventory } from '@/core/Inventory';
import { CraftingUI } from '@/interactables/CraftingUI';
import { BaseScene, STRUCTURE_COSTS, STRUCTURE_META, type StructureType } from '@/scene/BaseScene';
import { checkQuestFulfillment } from '@/world/QuestDef';
import { assetLoader } from '@/assets/AssetLoader';
import { LightingSystem } from '@/rendering/LightingSystem';
import { ParticleSystem } from '@/rendering/ParticleSystem';
import { ProceduralWalkController } from '@/rendering/ProceduralWalk';
import { ProceduralBipedWalkController } from '@/rendering/ProceduralBipedWalk';

async function main() {
  // ── Renderer ───────────────────────────────────────────────────────────────
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Phase 7.5c — ACESFilmic tonemapping: punchy, saturated colours; zero cost
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // ── Scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);
  scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);

  // ── Camera (isometric) ────────────────────────────────────────────────────
  const cameraRig = new CameraRig(window.innerWidth / window.innerHeight);
  // ── Post-processing — bloom/glow for all emissive + additive VFX ──────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cameraRig.camera));
  composer.addPass(new EffectPass(
    cameraRig.camera,
    new BloomEffect({ intensity: 2.2, luminanceThreshold: 0.12, kernelSize: KernelSize.MEDIUM }),
  ));
  // ── Physics ────────────────────────────────────────────────────────────────
  const physics = new PhysicsWorld();
  await physics.init();

  // ── Input ──────────────────────────────────────────────────────────────────
  const input = new InputManager();

  // ── Lighting ──────────────────────────────────────────────────────────────
  // Hemisphere light provides sky (blue-white) + ground (dark green) fill,
  // giving PBR (MeshStandardMaterial) GLB assets correct colour without blowing
  // out to white.  No separate AmbientLight — hemisphere covers ambient fill.
  const hemi = new THREE.HemisphereLight(0xb8d4e8, 0x4a6b3a, 0.9);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff5e0, 0.85);
  keyLight.position.set(12, 20, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.setScalar(1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 80;
  keyLight.shadow.camera.left = -25;
  keyLight.shadow.camera.right = 25;
  keyLight.shadow.camera.top = 25;
  keyLight.shadow.camera.bottom = -25;
  scene.add(keyLight);

  // ── Floor ─────────────────────────────────────────────────────────────────
  // Floor and room geometry are now managed by SceneManager / BlueprintRenderer.

  // ── Player ────────────────────────────────────────────────────────────────
  const player = new PlayerController(physics, new THREE.Vector3(0, 1.5, 0));
  scene.add(player.shadow);
  scene.add(player.group);

  // ── Scene / room manager ──────────────────────────────────────────────────
  const sceneManager = new SceneManager(scene, physics, player);

  // ── Lighting system — torch flicker, spell pulses, ambiance presets ───────
  const lighting  = new LightingSystem(scene);
  const particles = new ParticleSystem(scene);
  sceneManager.onRoomLoaded = (bp, _s) => {
    lighting.clearTorches();
    lighting.addTorchesForBlueprint(bp);
    // Torch fire particles for each torch that was just placed
    // The LightingSystem exposes torchPositions so we can mirror them.
    for (const tp of lighting.torchPositions) {
      particles.addTorchFire(tp);
    }
    // Slow ambient dust in every room
    const cx = (bp.width  * bp.cellSize) / 2;
    const cz = (bp.depth  * bp.cellSize) / 2;
    particles.addAmbientDust(
      new THREE.Vector3(cx, 1.5, cz),
      Math.min(bp.width, bp.depth) * bp.cellSize * 0.4,
    );
  };
  // Initial room load: generate the tower with a random seed.
  let currentSeed = Math.floor(Math.random() * 0xFFFF_FFFF);
  let worldGenConfig: WorldGenConfig = loadWorldGenConfig();
  const _initialPlan = generateTower(currentSeed);
  sceneManager.loadDungeon(_initialPlan);

  // ── Scene mode (interior ↔ exterior ↔ telescope) ──────────────────
  let gameMode: 'interior' | 'exterior' | 'telescope' = 'interior';
  let overworld: OverworldScene | null = null;
  let minimap:   OWMinimap | null = null;
  // Rigs spawned via the Creature Lab sandbox — animated each tick.
  const _spawnedRigs: Array<{
    rig: CreatureRig;
    born: number;
    walkCtrl: ProceduralWalkController | ProceduralBipedWalkController | null;
    /** Wandering state for quads (so procedural walk is visible) */
    wander: { angle: number; timer: number; speed: number };
  }> = [];
  /** Index of the currently player-controlled spawned creature (null = none). */
  let _selectedCreatureIdx: number | null = null;
  /** Yellow ring rendered under the selected spawned creature. */
  const _selectionRing = (() => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.05, 40),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.visible = false;
    scene.add(ring);
    return ring;
  })();
  const party = new PartyManager(20);
  const tamingGame = new TamingGame(scene, cameraRig.camera);
  /** Phase 7g — persistent base building. Scene is reused for both modes. */
  const baseScene = new BaseScene(scene);
  baseScene.onFountainHeal = (_pos, _radius, amount) => {
    // Heal player HP — integrate with ProgressionSystem when available
    (player as unknown as { heal?: (n: number) => void }).heal?.(amount);
  };

  function _makeOverworld(seed: number): OverworldScene {
    // Always re-read so changes made in the Settings modal are picked up.
    worldGenConfig = loadWorldGenConfig();
    const cfg       = { ...worldGenConfig, seed };
    const worldData = buildWorldData(seed, cfg);
    // Rebuild minimap for the new world
    minimap?.dispose();
    minimap = new OWMinimap(worldData);
    minimap.hide(); // hidden until exterior mode is entered
    const ow = new OverworldScene(scene, physics, player, worldData);
    ow.onQuestGiven = (quest) => {
      questLog.addQuest(quest);
      // Refresh minimap pins from all active quests
      minimap?.setQuestPins(
        questLog.getActive().map(q => ({ col: q.target.col, row: q.target.row })),
      );
    };
    // Fire-and-forget: swap procedural geometry for GLB assets when ready.
    // Each upgrade is independent — a failure in one doesn't block the others.
    // Asset upgrades are ONLY applied when the user has enabled Kenney asset mode
    // in Settings (default is code-first procedural geometry).
    if (worldGenConfig.assetMode === 'kenney') {
      const packs = new Set(worldGenConfig.assetPacks);

      if (packs.has('nature')) {
        ow.upgradeTreesWithAssets(assetLoader).catch((e) =>
          console.warn('[main] tree asset upgrade failed:', e),
        );
        ow.upgradeRocksWithAssets(assetLoader).catch((e) =>
          console.warn('[main] rock asset upgrade failed:', e),
        );
        ow.addGroundClutter(assetLoader).catch((e) =>
          console.warn('[main] ground clutter failed:', e),
        );
        ow.replaceWaterWithRiverTiles(assetLoader).catch((e) =>
          console.warn('[main] river tile upgrade failed:', e),
        );
      }
      if (packs.has('castle')) {
        ow.upgradeTowerWithAssets(assetLoader).catch((e) =>
          console.warn('[main] tower upgrade failed:', e),
        );
      }
      if (packs.has('town')) {
        ow.upgradeSettlementsWithAssets(assetLoader, worldData).catch((e) =>
          console.warn('[main] settlement decoration failed:', e),
        );
      }
      if (packs.has('buildings')) {
        ow.upgradeBuildingsWithAssets(assetLoader, worldData).catch((e) =>
          console.warn('[main] modular buildings failed:', e),
        );
      }
      if (packs.has('town') || packs.has('nature')) {
        ow.upgradeRoadsWithAssets(assetLoader, worldData).catch((e) =>
          console.warn('[main] road tile upgrade failed:', e),
        );
      }
      if (packs.has('dungeon')) {
        ow.upgradeDungeonEntrancesWithAssets(assetLoader).catch((e) =>
          console.warn('[main] dungeon entrance upgrade failed:', e),
        );
      }
    }
    return ow;
  }

  function switchToExterior(): void {
    // MUST unload dungeon first — onExitTrigger fires directly without
    // going through executeRoomSwap, so the room geometry + physics bodies
    // would otherwise stay in the scene and interfere with the overworld.
    sceneManager.unloadCurrentRoom();
    if (!overworld) {
      overworld = _makeOverworld(currentSeed);
    }
    // Mark last visited dungeon as cleared (enter = cleared, simplification for now)
    if (_activeDungeonId !== null) {
      discoveryTracker.markDungeonCleared(_activeDungeonId);
      _activeDungeonId = null;
    }
    gameMode = 'exterior';
    overworld.enter();
    minimap?.show();
    // Spawn just south of the tower door, high enough that the KCC capsule
    // starts above the heightfield surface and falls cleanly to ground.
    player.teleport(new THREE.Vector3(0, 1.5, 8));
    // Widen fog for the open world
    scene.fog = new THREE.Fog(0x0a1408, 60, 180);
  }

  function switchToInterior(roomId?: string): void {
    overworld?.exit();
    _cancelHarvest();
    gameMode = 'interior';
    minimap?.hide();
    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60); // restore dungeon fog
    sceneManager.loadRoomImmediate(roomId ?? sceneManager.startRoomId ?? 'cell_start');
  }

  sceneManager.onExitTrigger = () => switchToExterior();

  // ── Level editor ──────────────────────────────────────────────────────────
  const editMode = new EditMode(scene, cameraRig.camera, physics, sceneManager);

  // ── Progression & interactables ───────────────────────────────────────────
  const progression      = new ProgressionSystem();
  const questLog         = new QuestLog();
  const discoveryTracker = new DiscoveryTracker();
  let _activeDungeonId: number | null = null;
  let _questCheckTimer = 0;
  /** Blueprint IDs awarded from crafting, pending placement in construction mode. */
  const _pendingBlueprints = new Set<string>();
  const talentSystem  = new TalentSystem();
  const talentTree    = new TalentTree();
  const statPanel     = new StatPanel();
  const levelUpBanner = new LevelUpBanner();
  const inventory     = new Inventory();
  const craftingUI    = new CraftingUI(inventory);

  // Fire banner + grant talent point on every level-up
  progression.onLevelUp = (newLevel) => {
    levelUpBanner.show(newLevel);
    // Close stat panel if open so player sees the banner
  };

  const bookReader    = new BookReader();
  const interactables = new InteractableSystem(progression, bookReader);
  const telescopeView = new TelescopeView();
  let _telescopePrevRoomId: string | null = null;

  function enterTelescopeMode(): void {
    if (telescopeView.active) return;
    _telescopePrevRoomId = sceneManager.currentBlueprint?.id ?? null;
    // Unload interior, load exterior world for remote viewing
    sceneManager.unloadCurrentRoom();
    if (!overworld) {
      overworld = _makeOverworld(currentSeed);
    }
    overworld.enter();
    scene.background = new THREE.Color(0x4a6888);
    scene.fog = new THREE.Fog(0x4a6888, 200, 800);
    player.group.visible = false;
    gameMode = 'telescope';
    telescopeView.updateAspect(window.innerWidth, window.innerHeight);
    telescopeView.show(renderer.domElement);
    telescopeView.onClose = () => {
      overworld?.exit();
      player.group.visible = true;
      gameMode = 'interior';
      scene.background = null;
      scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
      if (_telescopePrevRoomId) {
        sceneManager.loadRoomImmediate(_telescopePrevRoomId);
      }
    };
  }

  interactables.onTelescopeActivate = () => enterTelescopeMode();

  // Crafting station handler — open the shared CraftingUI with correct recipe set
  interactables.onCraftingStation = (type) => {
    craftingUI.toggle(type);
  };
  craftingUI.onCraft = (recipe) => {
    // Award result to inventory or progression based on result kind
    if (recipe.result.kind === 'blueprint') {
      // Store blueprint ID for construction mode to consume
      _pendingBlueprints.add(recipe.result.id);
    }
    hud.setResources(inventory.snapshot());
    craftingUI.refresh();
  };

  // ── Dev panel ───────────────────────────────────────────────────────────
  const devPanel = new DevPanel({
    getGodMode:          () => player.health.godMode,
    onGodMode:           (v) => { player.health.godMode = v; },
    getInstantCooldowns: () => spells.instantCooldowns,
    onInstantCooldowns:  (v) => { spells.instantCooldowns = v; },
    getHpInfo:   () => ({ hp: player.health.hp, maxHp: player.health.maxHp }),
    onFillHp:    () => {
      player.health.reset();
      if (deathTriggered) { deathTriggered = false; deathScreen.hide(); }
    },
    onSetHp:     (v) => {
      player.health.forceSetHp(v);
      if (deathTriggered && v > 0) { deathTriggered = false; deathScreen.hide(); }
    },
    onAllSpells: () => {
      for (const id of ['magic_bolt', 'flame_dart', 'intimidate', 'nova_burst', 'chain_arc', 'void_rift', 'battle_hymn', 'mass_animate']) progression.grantSpell(id);
    },
    onKillAll:   () => {
      sceneManager.getActiveEnemies().forEach(e => {
        if (!e.isDead) e.health.takeDamage(9999);
      });
    },
    onForceFlee: () => {
      // Works in both interior and exterior scenes
      const all = gameMode === 'interior'
        ? sceneManager.getActiveEnemies()
        : (overworld?.getActiveEnemies() ?? []);
      all.forEach(e => { if (!e.isDead) e.forceFlee(); });
    },
    onTeleport:  (roomId) => {
      sceneManager.loadRoomImmediate(roomId);
      player.teleport(new THREE.Vector3(0, 1.5, 0));
      wasRoomCleared = false;
    },
    // ── Overworld (available when in exterior mode) ──────────────────────────
    getFlyMode:    () => player.flyMode,
    onFlyMode:     (v) => { player.flyMode = v; },
    getSettlements: () => gameMode === 'exterior'
      ? (overworld?.getSettlementPositions() ?? [])
      : [],
    onFastTravel:  (pos) => {
      if (gameMode !== 'exterior') switchToExterior();
      player.teleport(new THREE.Vector3(pos.x, pos.y + 2, pos.z));
    },
  });

  // ── Spell book ──────────────────────────────────────────────────────────
  const spellBook = new SpellBook(progression);

  // ── Pause menu ───────────────────────────────────────────────────────────
  const pauseMenu = new PauseMenu({
    onOpenEditor:   () => editMode.toggle(),
    onOpenDevPanel: () => devPanel.open(),
    onOpenStats:    () => statPanel.open(progression),
  });

  // ── Main menu (shown at startup; starts the game loop on Play) ────────────
  /** Shared start-game logic — called by character creation onStart and by tests. */
  function startGame(seed?: number, cfg?: CharacterConfig): void {
    currentSeed = seed ?? Math.floor(Math.random() * 0xFFFF_FFFF);
    overworld?.dispose();
    overworld = null;
    minimap?.dispose();
    minimap = null;
    gameMode = 'interior';
    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
    const plan = generateTower(currentSeed);
    sceneManager.resetCleared();
    sceneManager.loadDungeon(plan);
    prevKillCount = 0; // reset XP kill tracker on new game

    // ── Apply starting boon ────────────────────────────────────────────
    if (cfg?.boon === 'tome') {
      progression.grantSpell('flame_dart');
    } else if (cfg?.boon === 'blood') {
      // +6 vitality → derivedMaxHp = 10 + 6*5 = 40 (+30 HP)
      progression.boostStat('vitality', 6);
    } else if (cfg?.boon === 'swift') {
      // +7 swiftness → dodge CD mult ≈ 0.65, speed mult ≈ 1.28
      progression.boostStat('swiftness', 7);
    }

    // ── Apply narrative stat bonuses (from NewGameFlow conversation) ───
    for (const bonus of cfg?.statBonuses ?? []) {
      const BONUS_MAP: Record<string, [Parameters<typeof progression.boostStat>[0], number]> = {
        strength:     ['power',      2],
        agility:      ['swiftness',  2],
        intelligence: ['attunement', 2],
        constitution: ['vitality',   2],
        attack_power: ['power',      3],
        stealth:      ['cunning',    2],
        magic_power:  ['attunement', 3],
        max_hp:       ['vitality',   3],
      };
      const entry = BONUS_MAP[bonus];
      if (entry) progression.boostStat(entry[0], entry[1]);
    }

    // Apply player character appearance — asset model takes priority over DNA
    if (cfg?.assetModel) {
      player.applyAssetModel(cfg.assetModel).catch((e) =>
        console.error('[main] failed to load asset model:', e));
    } else if (cfg?.dna) {
      player.applyDNA(cfg.dna);
    }

    gameLoop.start();
  }

  /** XP kill tracker — grants XP for each new kill registered. */
  let prevKillCount = 0;

  // ── Character creation screen ─────────────────────────────────────────────
  let _sandboxUi: DevSandbox | null = null;

  const charCreation = new CharacterCreationV2();
  charCreation.onComplete = (cfg) => {
    charCreation.hide();
    mainMenu.hide();
    startGame(undefined, cfg);
  };
  charCreation.onBack = () => {
    mainMenu.show();
  };

  // ── Sandbox mode helpers ──────────────────────────────────────────────────

  function startSandbox(): void {
    mainMenu.hide();
    gameMode = 'interior';
    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
    const plan = generateSandboxArena();
    sceneManager.loadDungeon(plan);
    gameLoop.start();

    // Track the last generated plan so room-teleport can load it
    let _lastGeneratedPlan: DungeonPlan | null = null;

    // Build sandbox UI
    _sandboxUi?.dispose();
    _sandboxUi = new DevSandbox({
      onGrantSpell: (id) => progression.grantSpell(id),
      onSetActiveSpell: (id) => {
        progression.grantSpell(id);
        progression.equipSpell(id, 1);
      },
      onGrantAllSpells: () => {
        for (const id of ['magic_bolt','flame_dart','intimidate','nova_burst','chain_arc','void_rift','battle_hymn','mass_animate']) {
          progression.grantSpell(id);
        }
      },
      onSpawnEnemies: (n) => {
        const playerPos = player.group.position;
        const angle0 = Math.random() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          const angle = angle0 + (i / n) * Math.PI * 2;
          const r = 4 + Math.random() * 2;
          const pos = new THREE.Vector3(
            playerPos.x + Math.cos(angle) * r,
            1.5,
            playerPos.z + Math.sin(angle) * r,
          );
          const en = new SlimeEnemy(pos, physics, (dmg: number) => player.health.takeDamage(dmg));
          scene.add(en.group);
          sceneManager.addEnemy(en);
        }
      },
      onKillAllEnemies: () => {
        sceneManager.getActiveEnemies().forEach(e => {
          if (!e.isDead) e.health.takeDamage(9999);
        });
      },
      getProcGenStats: (type, seed) => {
        try {
          if (type === 'tower') {
            const p = generateTower(seed);
            _lastGeneratedPlan = p;
            const roomIds = [...p.rooms.keys()];
            const byFloor = new Map<number, number>();
            for (const bp of p.rooms.values()) {
              byFloor.set(bp.floor, (byFloor.get(bp.floor) ?? 0) + 1);
            }
            const floors = [...byFloor.entries()].sort((a, b) => a[0] - b[0]);
            return {
              text: [
                `Seed:  ${seed}`,
                `Rooms: ${p.rooms.size}`,
                `Start: ${p.startRoomId}`,
                '',
                'Floor breakdown:',
                ...floors.map(([f, c]) => `  Floor ${String(f).padStart(2)}: ${c} room(s)`),
              ].join('\n'),
              roomIds,
            };
          } else if (type === 'dungeon') {
            const p = generateDungeon(seed, 5);
            _lastGeneratedPlan = p;
            const roomIds = [...p.rooms.keys()];
            return {
              text: [
                `Seed:  ${seed}`,
                `Rooms: ${p.rooms.size}`,
                `Start: ${p.startRoomId}`,
                '',
                'Room IDs:',
                ...roomIds.map(id => `  ${id}`),
              ].join('\n'),
              roomIds,
            };
          } else {
            _lastGeneratedPlan = null;
            return {
              text: [
                `Seed:        ${seed}`,
                `Biomes:      5 (bog, forest, highland, coastal, plains)`,
                `Grid:        64×64 heightfield`,
                '',
                'Note: overworld generates as a live scene.',
                'No rooms to teleport into.',
              ].join('\n'),
              roomIds: [],
            };
          }
        } catch (e) {
          return { text: `Error: ${String(e)}`, roomIds: [] };
        }
      },
      onEnterRoom: (roomId) => {
        if (!_lastGeneratedPlan) return;
        sceneManager.loadDungeon(_lastGeneratedPlan);
        sceneManager.loadRoomImmediate(roomId);
        _sandboxUi?.setLocation(roomId);
      },
      onReturnToArena: () => {
        // Exit overworld if we were in it
        if (gameMode === 'exterior') {
          overworld?.exit();
          gameMode = 'interior';
        }
        // Clear spawned sandbox rigs
        for (const { rig } of _spawnedRigs) { scene.remove(rig.root); rig.dispose(); }
        _spawnedRigs.length = 0;
        _selectedCreatureIdx = null;
        _selectionRing.visible = false;
        const arenaPlan = generateSandboxArena();
        sceneManager.loadDungeon(arenaPlan);
        sceneManager.loadRoomImmediate('sandbox_arena');
        scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
        _sandboxUi?.setLocation('arena');
      },
      onEnterOverworld: (seed) => {
        // Tear down any existing interior room
        sceneManager.unloadCurrentRoom();
        // Always recreate so the specified seed is honoured
        if (overworld) { overworld.exit(); overworld.dispose(); overworld = null; }
        overworld = _makeOverworld(seed);
        overworld.enter();
        gameMode = 'exterior';
        player.teleport(new THREE.Vector3(0, 1.5, 8));
        scene.fog = new THREE.Fog(0x0a1408, 60, 180);
        _sandboxUi?.setLocation('overworld');
      },
      onSpawnCreature: (dna) => {
        const rig = buildCreature(dna);
        const pp  = player.group.position;
        rig.root.position.set(pp.x + 2.5, 0, pp.z + 2.5);
        // Build walk controller first (geometry-only, no world matrices needed).
        // Use its naturalFootY to ground the rig so foot targets land at y=0.
        let walkCtrl: ProceduralWalkController | ProceduralBipedWalkController | null = null;
        if (dna.archetype === 'biped') {
          const bwc = new ProceduralBipedWalkController(rig);
          if (bwc.isApplicable) {
            walkCtrl = bwc;
            rig.root.position.y = -bwc.naturalFootY;
          }
        } else {
          const qwc = new ProceduralWalkController(rig);
          if (qwc.isApplicable) {
            walkCtrl = qwc;
            rig.root.position.y = -qwc.naturalFootY;
          } else {
            // Fallback: bounding-box grounding for non-walking non-bipeds
            rig.root.updateWorldMatrix(true, true);
            const box = new THREE.Box3();
            rig.root.traverse(obj => { if (obj instanceof THREE.Mesh) box.union(new THREE.Box3().setFromObject(obj)); });
            if (!box.isEmpty() && isFinite(box.min.y) && box.min.y > 0.01) rig.root.position.y -= box.min.y;
          }
        }
        scene.add(rig.root);
        _spawnedRigs.push({
          rig,
          born: performance.now() * 0.001,
          walkCtrl,
          wander: { angle: Math.random() * Math.PI * 2, timer: 1.5 + Math.random() * 2, speed: 1.8 + Math.random() * 1.2 },
        });
      },
      onClose: () => {
        _sandboxUi?.hide();
        gameLoop.stop();
        sceneManager.unloadCurrentRoom();
        mainMenu.show();
      },
    });
    _sandboxUi.show();
  }

  const mainMenu = new MainMenu({
    onPlay: (slotId, isNewGame) => {
      if (isNewGame) {
        // New save — run narrative campfire intro to determine character
        mainMenu.hide();
        const flow = new NewGameFlow();
        flow.play(document.body, slotId).then(cfg => {
          flow.dispose();
          startGame(undefined, cfg);
        }).catch(err => {
          console.error('[NewGameFlow] failed:', err);
          flow.dispose();
          // Fallback to old character creator on error
          charCreation.show(slotId);
          mainMenu.hide();
        });
      } else {
        // Continuing existing save — skip character creation
        mainMenu.hide();
        startGame();
      }
    },
    onDevLab: () => startSandbox(),
  });

  // ── Test / debug hook (dev builds only) ──────────────────────────────────
  // Exposed on window so Playwright e2e tests can drive the game without
  // simulating keyboard/mouse events for every action.
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__game = {
      /** Start the game with an optional deterministic seed (default random). */
      startGame: (seed?: number) => {
        mainMenu.hide();
        startGame(seed);
      },
      /** Switch to exterior overworld (requires game already started). */
      switchToExterior: () => switchToExterior(),
      /** Switch back to interior dungeon. */
      switchToInterior: (roomId?: string) => switchToInterior(roomId),
      /** Current player position { x, y, z }. */
      getPlayerPos: () => {
        const p = player.group.position;
        return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
      },
      /** Current scene mode: 'interior' | 'exterior'. */
      getGameMode: () => gameMode,
      /** Whether the player group is marked visible. */
      isPlayerVisible: () => player.group.visible,
      /** Teleport player to a specific world position (for tests). */
      teleportPlayer: (x: number, y: number, z: number) => {
        player.teleport(new THREE.Vector3(x, y, z));
      },
      /** Whether player is currently in the tower entrance trigger zone. */
      isNearTower: () => overworld?.nearTowerEntrance(player.group.position) ?? false,
      hasAssetTrees:   () => !!(scene as any).__assetTreesLoaded,
      hasAssetRocks:       () => !!(scene as any).__assetRocksLoaded,
      hasAssetClutter:     () => !!(scene as any).__assetClutterLoaded,
      hasAssetRiver:       () => !!(scene as any).__assetRiverLoaded,
      hasAssetTower:       () => !!(scene as any).__assetTowerLoaded,
      hasAssetSettlement:  () => !!(scene as any).__assetSettlementLoaded,
      hasAssetDungeon:     () => !!(scene as any).__assetDungeonLoaded,
      /** Open the character creation screen (slot 0 by default). */
      openCharCreation: (slotId = 0) => charCreation.show(slotId),
      /** Snapshot of current character creation state — for Playwright tests. */
      getCharCreationState: () => charCreation.getState(),
    };
  }
  // ── Centralised key routing ──────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    // Ignore all game key routing while the main menu is visible
    if (mainMenu.isVisible) return;

    if (e.key === 'Escape') {
      if (bookReader.isOpen) {
        bookReader.close();         // close book → game
      } else if (spellBook.isOpen) {
        spellBook.close();          // close grimoire → game
      } else if (devPanel.isOpen) {
        devPanel.close();           // close dev panel → game
      } else if (craftingUI.isOpen) {
        craftingUI.close();         // close crafting → game
      } else if (_constructionMode) {
        _exitConstructionMode();    // close construction mode → game
      } else if (editMode.isActive) {
        editMode.toggle();          // close editor → game
      } else if (statPanel.visible) {
        statPanel.close();          // close stat panel → game
      } else if (talentTree.visible) {
        talentTree.close();         // close talent tree → game
      } else if (pauseMenu.isOpen) {
        pauseMenu.close();          // close menu → game
      } else {
        pauseMenu.open();           // game → menu
      }
    } else if (e.key === 'k' || e.key === 'K') {
      if (!pauseMenu.isOpen && !editMode.isActive) spellBook.toggle();
    } else if (e.key === 'p' || e.key === 'P') {
      if (!pauseMenu.isOpen && !editMode.isActive) statPanel.toggle(progression);
    } else if (e.key === 't' || e.key === 'T') {
      if (!pauseMenu.isOpen && !editMode.isActive) talentTree.toggle(progression, talentSystem);
    } else if (e.key === '`' || e.key === '~') {
      if (!pauseMenu.isOpen) editMode.toggle(); // shortcut: direct editor toggle
    } else if ((e.key === 'b' || e.key === 'B') && gameMode === 'exterior') {
      if (!pauseMenu.isOpen && !editMode.isActive) _toggleConstructionMode();
    }
  });

  // ── Construction mode (Phase 7g) ──────────────────────────────────────────

  let _constructionMode = false;
  let _selectedStructure: StructureType | null = null;
  // Ghost mesh shown at cursor position when a structure type is selected
  let _ghostMesh: THREE.Mesh | null = null;

  /** Build or destroy the ghost preview mesh for the selected structure type. */
  function _rebuildGhost(): void {
    if (_ghostMesh) { scene.remove(_ghostMesh); _ghostMesh.geometry.dispose(); (_ghostMesh.material as THREE.Material).dispose(); _ghostMesh = null; }
    if (!_selectedStructure) return;
    const geo = new THREE.BoxGeometry(1, 2, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x44aaff, transparent: true, opacity: 0.45, depthWrite: false });
    _ghostMesh = new THREE.Mesh(geo, mat);
    scene.add(_ghostMesh);
  }

  /** Build the radial-menu HTML overlay for construction mode. */
  function _buildConstructionMenu(): HTMLElement {
    const TYPES: StructureType[] = ['barrier_wall', 'watch_perch', 'healing_fountain', 'ward_stone'];
    const wrap = document.createElement('div');
    wrap.id = 'construction-menu';
    wrap.style.cssText = [
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);',
      'background:rgba(8,6,18,0.93);border:1px solid #553388;border-radius:10px;',
      'padding:18px;display:flex;flex-direction:column;gap:10px;',
      'color:#ccc;font:13px monospace;z-index:600;min-width:240px;',
    ].join('');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px;color:#aa88ee;font-weight:bold;text-align:center;margin-bottom:4px;';
    title.textContent = '🏗 Construction Mode  [B / Esc]';
    wrap.appendChild(title);

    for (const type of TYPES) {
      const meta = STRUCTURE_META[type];
      const costs = STRUCTURE_COSTS[type];
      const costStr = Object.entries(costs).map(([k, v]) => `${v} ${k}`).join(' + ');
      const btn = document.createElement('button');
      btn.dataset['structType'] = type;
      btn.style.cssText = [
        'background:rgba(30,20,50,0.9);border:1px solid #443366;border-radius:5px;',
        'padding:8px 12px;color:#ccc;cursor:pointer;text-align:left;',
        'transition:background 0.15s;',
      ].join('');
      btn.innerHTML = `<span style="font-size:16px">${meta.icon}</span> <strong>${meta.name}</strong><br><small style="color:#887799">${meta.description} — Cost: ${costStr}</small>`;
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(80,40,120,0.9)'; });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = _selectedStructure === type ? 'rgba(60,20,100,0.9)' : 'rgba(30,20,50,0.9)';
      });
      btn.addEventListener('click', () => {
        _selectedStructure = type;
        _rebuildGhost();
        // highlight active
        wrap.querySelectorAll('button').forEach(b => { (b as HTMLButtonElement).style.background = 'rgba(30,20,50,0.9)'; });
        btn.style.background = 'rgba(60,20,100,0.9)';
      });
      wrap.appendChild(btn);
    }

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#665577;text-align:center;margin-top:4px;';
    hint.textContent = 'Select a structure then Left-Click to place';
    wrap.appendChild(hint);

    return wrap;
  }

  let _constructionMenuEl: HTMLElement | null = null;

  function _toggleConstructionMode(): void {
    _constructionMode = !_constructionMode;
    if (_constructionMode) {
      _selectedStructure = null;
      _constructionMenuEl = _buildConstructionMenu();
      document.body.appendChild(_constructionMenuEl);
    } else {
      _exitConstructionMode();
    }
  }

  function _exitConstructionMode(): void {
    _constructionMode = false;
    _selectedStructure = null;
    _rebuildGhost(); // clears ghost
    if (_constructionMenuEl) { _constructionMenuEl.remove(); _constructionMenuEl = null; }
  }

  // Left-click to place in construction mode
  renderer.domElement.addEventListener('click', (e) => {
    // ── Creature picking (sandbox: click to select/deselect for WASD control) ──
    if (!_constructionMode && _spawnedRigs.length > 0) {
      const rect2 = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect2.left) / rect2.width) * 2 - 1,
          -((e.clientY - rect2.top) / rect2.height) * 2 + 1,
        ),
        cameraRig.camera,
      );
      const pickedMeshes: THREE.Object3D[] = [];
      for (const { rig } of _spawnedRigs) rig.root.traverse(o => { if (o instanceof THREE.Mesh) pickedMeshes.push(o); });
      const hits = raycaster.intersectObjects(pickedMeshes, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        let newIdx: number | null = null;
        for (let ci = 0; ci < _spawnedRigs.length; ci++) {
          let found = false;
          _spawnedRigs[ci].rig.root.traverse(o => { if (o === hitObj) found = true; });
          if (found) { newIdx = ci; break; }
        }
        // toggle off if clicking the already-selected creature
        _selectedCreatureIdx = _selectedCreatureIdx === newIdx ? null : newIdx;
        e.stopPropagation();
        return;
      } else {
        // click on empty ground — deselect
        _selectedCreatureIdx = null;
      }
    }

    if (!_constructionMode || !_selectedStructure || gameMode !== 'exterior') return;
    e.stopPropagation();
    // Raycast to floor plane at y=0
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      cameraRig.camera,
    );
    raycaster.ray.intersectPlane(floorPlane, mouseWorld);
    // Check resource cost
    const costs = STRUCTURE_COSTS[_selectedStructure];
    const canAfford = Object.entries(costs).every(
      ([res, amt]) => inventory.get(res as Parameters<typeof inventory.get>[0]) >= (amt ?? 0),
    );
    if (!canAfford) {
      // Brief flash on the menu — not enough resources
      if (_constructionMenuEl) {
        _constructionMenuEl.style.borderColor = '#cc2244';
        setTimeout(() => { if (_constructionMenuEl) _constructionMenuEl.style.borderColor = '#553388'; }, 600);
      }
      return;
    }
    // Spend resources
    const costRecord: Record<string, number> = Object.fromEntries(Object.entries(costs).filter(([, v]) => v !== undefined)) as Record<string,number>;
    inventory.spendMulti(costRecord as Parameters<typeof inventory.spendMulti>[0]);
    hud.setResources(inventory.snapshot());
    craftingUI.refresh();
    // Place structure
    baseScene.place(_selectedStructure, mouseWorld.x, mouseWorld.z);
  });

  // ── Combat systems ────────────────────────────────────────────────────────
  const combat = new CombatSystem();
  const spells = new SpellSystem();

  // Raycaster for mouse → world position on the floor plane
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const mouseWorld = new THREE.Vector3();
  const mouseNDC = new THREE.Vector2();

  // Attack / spell cooldowns
  let meleeCooldown = 0;
  let lastAttackInput = false;
  let lastSpellInput = false;
  let lastCastInput = false;

  // ── HUD ───────────────────────────────────────────────────────────────────
  const hud = new HUD();

  // ── Exterior interaction prompt ───────────────────────────────────────────
  // Reuses the same visual style as InteractableSystem's prompt.
  const exteriorPrompt = (() => {
    const el = document.createElement('div');
    el.id = 'exterior-prompt';
    el.style.cssText = [
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);',
      'background:rgba(10,8,18,0.88);border:1px solid #44405a;',
      'border-radius:5px;padding:7px 16px;',
      'color:#ccc;font:13px monospace;',
      'pointer-events:none;z-index:500;',
      'opacity:0;transition:opacity 0.18s;',
      'white-space:nowrap;',
    ].join('');
    document.body.appendChild(el);
    return el;
  })();
  const _KBD = '<kbd style="background:#2a2838;border:1px solid #665588;border-radius:3px;padding:1px 6px;color:#bb99ff;">E</kbd>';
  function _setExteriorPrompt(text: string | null): void {
    if (!text) { exteriorPrompt.style.opacity = '0'; return; }
    exteriorPrompt.innerHTML = `${_KBD}&nbsp; ${text}`;
    exteriorPrompt.style.opacity = '1';
  }

  // ── Harvest progress ring ─────────────────────────────────────────────────
  // Circular SVG progress ring shown while player holds [E] near a resource node.
  const _harvestRing = (() => {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);',
      'pointer-events:none;z-index:501;',
      'opacity:0;transition:opacity 0.1s;',
    ].join('');
    el.innerHTML = `<svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(80,60,20,0.4)" stroke-width="4"/>
      <circle id="harvest-arc" cx="24" cy="24" r="20" fill="none"
        stroke="#ffd43c" stroke-width="4"
        stroke-dasharray="125.7" stroke-dashoffset="125.7"
        stroke-linecap="round"
        transform="rotate(-90 24 24)"/>
    </svg>`;
    document.body.appendChild(el);
    return el;
  })();
  const _harvestArc = _harvestRing.querySelector('#harvest-arc') as SVGCircleElement;
  const HARVEST_DURATION = 1.5;          // seconds to hold [E]
  const HARVEST_CIRCUMFERENCE = 125.7;   // 2π×20
  let _harvestTimer  = 0;
  let _harvestNodeIdx: number | null = null;
  let _harvestLastPos = new THREE.Vector3();

  function _cancelHarvest(): void {
    _harvestTimer = 0;
    _harvestNodeIdx = null;
    _harvestRing.style.opacity = '0';
    _harvestArc.style.strokeDashoffset = String(HARVEST_CIRCUMFERENCE);
  }

  // ── Death screen ──────────────────────────────────────────────────────────
  let deathTriggered = false;
  const deathScreen = new DeathScreen({
    onRestart: () => {
      player.health.reset();
      player.teleport(new THREE.Vector3(0, 1.5, 0));
      // Return to the start of the current dungeon (or fall back to cell_start)
      sceneManager.loadRoomImmediate(sceneManager.startRoomId ?? 'cell_start');
      deathTriggered = false;
    },
    onMainMenu: () => {
      player.health.reset();
      deathTriggered = false;
      gameLoop.stop();
      mainMenu.show();
    },
  });

  // ── Victory banner ────────────────────────────────────────────────────────
  const victoryBanner = new VictoryBanner();
  let wasRoomCleared = false;

  // ── Resize ────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    cameraRig.resize(window.innerWidth / window.innerHeight);
    telescopeView.updateAspect(window.innerWidth, window.innerHeight);
  });

  // ── Game loop ─────────────────────────────────────────────────────────────
  const gameLoop = new GameLoop();
  gameLoop.onTick((dt) => {
    // ── Telescope remote-view mode — skip all game simulation ──────────────
    if (gameMode === 'telescope') {
      telescopeView.update(dt);
      renderer.render(scene, telescopeView.camera); // bypass bloom for telescope
      return;
    }

    // 1. Physics
    physics.step(dt);

    // 2-7. Game simulation — paused while editor, pause menu, or death screen is open
    if (!editMode.isActive && !pauseMenu.isOpen && !deathScreen.isVisible && !spellBook.isOpen && !devPanel.isOpen) {
      // 2. Player movement
      player.update(input.state, dt);

      // 3. Update mouse world position for spell aim
      const s = input.state;
      mouseNDC.set(s.mouseX, s.mouseY);
      raycaster.setFromCamera(mouseNDC, cameraRig.camera);
      raycaster.ray.intersectPlane(floorPlane, mouseWorld);

      // 4. Animate sandbox-spawned creature rigs
      if (_spawnedRigs.length > 0) {
        const _now = performance.now() * 0.001;
        for (let _ci = 0; _ci < _spawnedRigs.length; _ci++) {
          const { rig, born, walkCtrl, wander } = _spawnedRigs[_ci];
          if (walkCtrl) {
            const isControlled = _selectedCreatureIdx === _ci;
            if (isControlled) {
              // WASD / arrow keys steer the selected creature directly
              const cs = input.state;
              const CTRL_SPEED  = 3.5;
              const TURN_SPEED  = 2.8;
              if (cs.moveLeft)     rig.root.rotation.y += TURN_SPEED * dt;
              if (cs.moveRight)    rig.root.rotation.y -= TURN_SPEED * dt;
              let fwd = 0;
              if (cs.moveForward)  fwd =  CTRL_SPEED * (cs.run ? 1.6 : 1);
              if (cs.moveBackward) fwd = -CTRL_SPEED * 0.55;
              if (fwd !== 0) {
                rig.root.position.x += Math.sin(rig.root.rotation.y) * fwd * dt;
                rig.root.position.z += Math.cos(rig.root.rotation.y) * fwd * dt;
              }
              wander.angle = rig.root.rotation.y; // keep in sync for when released
            } else {
              // Auto wander
              wander.timer -= dt;
              if (wander.timer <= 0) {
                wander.angle += (Math.random() - 0.5) * Math.PI * 1.2;
                wander.timer = 1.5 + Math.random() * 2.5;
              }
              rig.root.rotation.y = wander.angle;
              rig.root.position.x += Math.sin(wander.angle) * wander.speed * dt;
              rig.root.position.z += Math.cos(wander.angle) * wander.speed * dt;
              // Keep inside a 12 WU radius from spawn centre (clamp back toward origin)
              const dx = rig.root.position.x, dz = rig.root.position.z;
              if (dx * dx + dz * dz > 144) {
                wander.angle = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.5;
              }
            }
            walkCtrl.update(dt, rig.root.position, rig.root.rotation.y);
          } else {
            animateCreature(rig, { state: 'idle', time: _now - born });
          }
        }
        // Update selection ring position
        if (_selectedCreatureIdx !== null && _spawnedRigs[_selectedCreatureIdx]) {
          const selPos = _spawnedRigs[_selectedCreatureIdx].rig.root.position;
          _selectionRing.position.set(selPos.x, 0.04, selPos.z);
          _selectionRing.visible = true;
        } else {
          _selectionRing.visible = false;
        }
      } else {
        _selectionRing.visible = false;
      }

      // 5. Room manager / overworld — enemy AI + door trigger checks
      if (gameMode === 'interior') {
        sceneManager.update(dt, player.group.position);
      } else if (overworld) {
        overworld.update(dt);
        party.pruneDead();
        tamingGame.update(dt);

        // Quest fulfillment check (throttled to 1 Hz)
        _questCheckTimer -= dt;
        if (_questCheckTimer <= 0) {
          _questCheckTimer = 1.0;
          const _pp  = player.group.position;
          const _gc  = overworld.worldToGrid(_pp.x, _pp.z);
          for (const q of questLog.getActive()) {
            if (!q.fulfilled && checkQuestFulfillment(q, _gc.col, _gc.row, discoveryTracker.clearedDungeons)) {
              questLog.markFulfilled(q.id);
              progression.grantXP(q.reward.xp);
              // Refresh minimap pins
              minimap?.setQuestPins(
                questLog.getActive().map(aq => ({ col: aq.target.col, row: aq.target.row })),
              );
            }
          }
        }

        // Update minimap player position (convert world → tile coords)
        if (minimap?.isVisible()) {
          const _pp  = player.group.position;
          const _gc  = overworld.worldToGrid(_pp.x, _pp.z);
          minimap.updatePlayer(_gc.col, _gc.row);
        }

        // Update exterior interaction prompt
        const _pos = player.group.position;
        const _flee = overworld.getActiveEnemies().find(
          e => !e.isDead && e.isRecruitable && e.worldPosition.distanceTo(_pos) < 6.0,
        );
        if (_flee) {
          _setExteriorPrompt(party.isFull ? 'Party full' : '♪ Sing to it');
        } else if (overworld.nearTowerEntrance(_pos)) {
          _setExteriorPrompt('Enter Tower');
        } else {
          const _dng = overworld.nearDungeonEntrance(_pos);
          if (_dng) {
            _setExteriorPrompt(_dng.entry.name);
          } else {
            const _bld = overworld.nearBuilding(_pos);
            if (_bld) {
              _setExteriorPrompt(_bld.label);
            } else {
              // Watch Perch guard assignment
              const _wp = baseScene.nearWatchPerch(_pos);
              if (_wp && party.members.some(m => !m.isGuarding)) {
                _setExteriorPrompt('🗼 Assign guard');
              } else {
                const _res = overworld.nearResourceNode(_pos);
                const _LABELS: Record<string, string> = { ore: '⛏ Mine ore', timber: '🪵 Chop timber', essence: '✨ Harvest essence' };
                _setExteriorPrompt(_res ? (_LABELS[_res.node.type] ?? 'Harvest') : null);
              }
            }
          }
        }

        // ── Harvest hold mechanic ─────────────────────────────────────────
        // Cancel if player moved more than 0.5 WU since harvest started
        const _cur = player.group.position;
        if (_harvestNodeIdx !== null) {
          const _moved = _harvestLastPos.distanceTo(_cur);
          if (_moved > 0.5) _cancelHarvest();
        }
        const _holdingE = input.state.interact;
        const _nearRes = _holdingE ? overworld.nearResourceNode(_cur) : null;
        if (_nearRes && _harvestNodeIdx === null) {
          // Begin harvest
          _harvestNodeIdx = _nearRes.index;
          _harvestTimer   = 0;
          _harvestLastPos.copy(_cur);
          _harvestRing.style.opacity = '1';
        } else if (!_holdingE || !_nearRes || (_harvestNodeIdx !== null && _nearRes.index !== _harvestNodeIdx)) {
          if (_harvestNodeIdx !== null) _cancelHarvest();
        }
        if (_harvestNodeIdx !== null) {
          _harvestTimer += dt;
          const pct = Math.min(1, _harvestTimer / HARVEST_DURATION);
          _harvestArc.style.strokeDashoffset = String(HARVEST_CIRCUMFERENCE * (1 - pct));
          if (pct >= 1) {
            // Harvest complete
            const baseYield = overworld.harvestNode(_harvestNodeIdx);
            const nodeType  = overworld.nearResourceNode(_cur)?.node.type
              ?? _nearRes?.node.type ?? 'ore';
            const cunning   = progression.stats.cunning;
            const finalAmt  = Math.ceil(baseYield * (1 + cunning * 0.1));
            inventory.add(nodeType as import('@/core/Inventory').ResourceType, finalAmt);
            hud.setResources(inventory.snapshot());
            _cancelHarvest();
          }
        }
      } else {
        _setExteriorPrompt(null);
      }
      const enemies = gameMode === 'interior'
        ? sceneManager.getActiveEnemies()
        : (overworld?.getActiveEnemies() ?? []);

      // 4b. Interactable proximity detection (interior only)
      if (gameMode === 'interior') {
        interactables.update(player.group.position, sceneManager.getActiveInteractables());
        // Taming prompt takes priority over book prompts when a fleeing slime is nearby
        const _nearFleeInt = sceneManager.getActiveEnemies().find(
          en => !en.isDead && en.isRecruitable
            && en.worldPosition.distanceTo(player.group.position) < 6.0,
        );
        interactables.overridePrompt(
          _nearFleeInt ? (party.isFull ? 'Party full' : '♪ Sing to it') : null,
        );
      }

      // 5. Melee attack (mouse button 0, 0.4s cooldown)
      meleeCooldown = Math.max(0, meleeCooldown - dt);
      const attackJustPressed = s.attack && !lastAttackInput;
      lastAttackInput = s.attack;
      if (attackJustPressed && meleeCooldown <= 0) {
        meleeCooldown = 0.4;
        const meleeAngle = Math.atan2(
          mouseWorld.x - player.group.position.x,
          mouseWorld.z - player.group.position.z,
        );
        combat.triggerMelee(player.group.position, meleeAngle, enemies, scene);
      }

      // 6a. E key — context-sensitive: interior = read book; exterior = enter/recruit
      const interactJustPressed = s.interact && !lastSpellInput;
      lastSpellInput = s.interact;
      if (interactJustPressed && !bookReader.isOpen && !telescopeView.active && !tamingGame.active) {
        if (gameMode === 'interior') {
          // Taming takes priority over book reading when a recruitable slime is nearby
          const nearFleeInt = sceneManager.getActiveEnemies().find(
            en => !en.isDead && en.isRecruitable
              && en.worldPosition.distanceTo(player.group.position) < 6.0,
          );
          if (nearFleeInt && !party.isFull) {
            tamingGame.begin(nearFleeInt);
            tamingGame.onSuccess = (slime) => { party.recruit(slime); };
            tamingGame.onFail = () => {};
          } else {
            interactables.tryRead();
          }
        } else if (overworld) {
          // Tame nearby fleeing enemy with the mini-game
          const nearFlee = overworld.getActiveEnemies().find(
            (en) => !en.isDead && en.isRecruitable
              && en.worldPosition.distanceTo(player.group.position) < 6.0,
          );
          if (nearFlee) {
            if (!party.isFull) {
              tamingGame.begin(nearFlee);
              tamingGame.onSuccess = (slime) => { party.recruit(slime); };
              tamingGame.onFail = () => { /* slime bolts — flee state handles it */ };
            }
          } else if (overworld.nearTowerEntrance(player.group.position)) {
            switchToInterior();
          } else {
            const dngHandle = overworld.nearDungeonEntrance(player.group.position);
            if (dngHandle) {
              // Enter a seeded dungeon whose floor count was set at world-gen time
              _activeDungeonId = dngHandle.entry.id;
              discoveryTracker.markDungeonFound(dngHandle.entry.id);
              const dngPlan = generateDungeon(dngHandle.entry.seed, dngHandle.entry.floorCount);
              overworld.exit();
              gameMode = 'interior';
              scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
              sceneManager.loadDungeon(dngPlan);
              player.teleport(new THREE.Vector3(0, 1.5, 8));
            } else {
              // Watch Perch guard assignment — priority over buildings
              const _perch = baseScene.nearWatchPerch(player.group.position);
              const _available = party.members.find(m => !m.isGuarding && !m.isDead);
              if (_perch && _available) {
                _available.assignGuard(new THREE.Vector3(_perch.wx, 0.9, _perch.wz));
              } else {
                const bld = overworld.nearBuilding(player.group.position);
                if (bld) {
                  if (bld.type === 'greenhouse') {
                    // Load the greenhouse interior dungeon
                    const ghPlan = generateGreenhouse(currentSeed ^ 0x6745_23f1);
                    overworld.exit();
                    gameMode = 'interior';
                    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
                    sceneManager.loadDungeon(ghPlan);
                    player.teleport(new THREE.Vector3(0, 1.5, 8));
                  } else {
                    // Generic building — load a random dungeon floor
                    const bldSeed = currentSeed ^ 0xCAFE_BABE;
                    const bldPlan = generateDungeon(bldSeed, 1);
                    overworld.exit();
                    gameMode = 'interior';
                    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
                    sceneManager.loadDungeon(bldPlan);
                  }
                }
              }
            }
          }
        }
      }

      // 6b. Right-click → cast active equipped spell
      const castJustPressed = s.castSpell && !lastCastInput;
      lastCastInput = s.castSpell;
      if (castJustPressed) {
        const activeSpell = progression.getEquippedSlot(s.activeSlot);
        if (activeSpell && progression.isSpellUnlocked(activeSpell)) {
          spells.cast(
            activeSpell,
            player.group.position,
            mouseWorld,
            enemies,
            scene,
            undefined,
            {
              spellDamageMult: progression.derivedSpellDamageMult,
              aoeRadiusMult: progression.mods.aoeRadiusMult,
              party,
              onForceFlee: (targets) => targets.forEach(e => (e as unknown as { forceFlee?(): void }).forceFlee?.()),
              onBattleHymn: (_dur) => { party.followerDamageMult = 1.5; },
            },
          );
          // Phase 7.5c — cast light pulse: brief PointLight flash at cast origin
          lighting.addSpellPulse(player.group.position, spells.getSpellColor(activeSpell));
          // Phase 7.5d — spell cast particle burst
          particles.burst(player.group.position, spells.getSpellColor(activeSpell), 24, 4.0, 0.5);
        }
      }

      // Battle Hymn expiry — reset follower damage boost when aura ends
      if (!spells.battleHymnActive && party.followerDamageMult !== 1.0) {
        party.followerDamageMult = 1.0;
      }

      // 7. Combat tick (expire arcs / projectiles / zones / auras)
      combat.update(dt, scene);
      spells.update(dt, scene, enemies, player.group.position, physics);

      // 7c. Lighting + particle tick
      lighting.update(dt);
      particles.update(dt);

      // 7b. Death check
      if (player.health.hp <= 0 && !deathTriggered) {
        deathTriggered = true;
        deathScreen.show();
      }

      // 7c. Room-clear check (interior only)
      if (gameMode === 'interior') {
        const dead  = sceneManager.roomEnemiesDefeated;
        const total = sceneManager.totalEnemies;
      const isCleared = total > 0 && dead >= total;
      if (isCleared && !wasRoomCleared) {
        const fl = sceneManager.currentFloor;
        const label = fl === 0 ? 'Ground Floor Cleared'
                    : fl  > 0 ? `Floor ${fl} Cleared`
                    :           `Basement ${Math.abs(fl)} Cleared`;
        victoryBanner.show(label);
      }
        wasRoomCleared = isCleared;
      }
    }

    // 8. Camera
    cameraRig.follow(player.group.position);

    // XP — grant 20 XP per kill tracked this frame
    const currKillCount = sceneManager.killCount;
    if (currKillCount > prevKillCount) {
      progression.grantXP((currKillCount - prevKillCount) * 20);
      prevKillCount = currKillCount;
    }

    // 9. HUD + per-frame stat sync
    // Keep party cap in sync with Dominion stat + talent nodes
    party.maxSize = progression.derivedPartyCap;

    hud.update(
      player.health.hp,
      player.health.maxHp,
      sceneManager.killCount,
      sceneManager.totalEnemies,
      sceneManager.currentFloor,
      progression.getEquippedSlots(),
      input.activeSlot,
      player.dodgeReadyFraction,
      input.state.run,
      getFloorDef(sceneManager.currentFloor)?.name,
      progression.level,
      progression.xpProgress,
    );

    // Show resource strip in exterior mode only
    if (gameMode === 'exterior') {
      hud.setResources(inventory.snapshot());
      // Update base-building ghost mesh position
      if (_constructionMode && _ghostMesh && overworld) {
        raycaster.setFromCamera(mouseNDC, cameraRig.camera);
        raycaster.ray.intersectPlane(floorPlane, mouseWorld);
        _ghostMesh.position.set(
          Math.round(mouseWorld.x / 2) * 2,
          1,
          Math.round(mouseWorld.z / 2) * 2,
        );
      }
      // Base scene update (fountain heal ticks, etc.)
      baseScene.update(dt, player.group.position);
    } else {
      hud.setResources(null);
    }

    // Cooldown sweep overlays for action bar slots
    hud.setCooldowns(
      progression.getEquippedSlots().map(id => id ? spells.cooldownFraction(id) : null),
    );

    // 10. Render
    composer.render(dt);
  });
  // Game loop is started by MainMenu.onPlay — not here.
}

main().catch(console.error);


