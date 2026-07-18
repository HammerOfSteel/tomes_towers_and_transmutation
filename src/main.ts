import * as THREE from 'three';
import { EffectComposer, EffectPass, RenderPass, BloomEffect, KernelSize } from 'postprocessing';
import { GameLoop } from '@/core/GameLoop';
import { InputManager } from '@/core/InputManager';
import { CameraRig } from '@/core/CameraRig';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { CombatSystem } from '@/combat/CombatSystem';
import { SpellSystem } from '@/combat/SpellSystem';
import { AbilitySystem, applyCharacterAbilities } from '@/combat/AbilitySystem';
import { SceneManager } from '@/levels/SceneManager';
import { HUD } from '@/ui/HUD';
import { DamageNumbers } from '@/ui/DamageNumbers';
import { EnemyHealthBars } from '@/ui/EnemyHealthBars';
import { PauseMenu } from '@/ui/PauseMenu';
import { GameMenu }  from '@/ui/GameMenu';
import { MainMenu, readSaveSlot, patchSaveSlot, applyColourBlindMode, applyTextScale } from '@/ui/MainMenu';
import { CharacterCreationV2 } from '@/ui/CharacterCreationV2';
import { NewGameFlow }          from '@/scene/NewGameFlow';
import type { CharacterConfig } from '@/ui/DNACreator';
import type { CharacterId, StatBonus } from '@/scene/CharacterDecisionTree';
import { CHAR_MANIFEST_MAP }    from '@/scene/CharacterDecisionTree';
import { DevSandbox } from '@/ui/DevSandbox';
import { generateSandboxArena } from '@/levels/SandboxArena';
import { DeathScreen } from '@/ui/DeathScreen';
import { VictoryBanner } from '@/ui/VictoryBanner';
import { EditMode } from '@/editor/EditMode';
import { ProgressionSystem } from '@/progression/ProgressionSystem';
import { BookReader } from '@/interactables/BookReader';
import { InteractableSystem } from '@/interactables/InteractableSystem';
import { SpellBook } from '@/ui/SpellBook';
import { DevPanel, devModeEnabled } from '@/ui/DevPanel';
import { generateDungeon, type DungeonPlan } from '@/levels/DungeonGenerator';
import { generateTower } from '@/levels/TowerGenerator';
import { getFloorDef } from '@/levels/TowerFloorDef';
import { TelescopeView } from '@/ui/TelescopeView';
import { CreativeMode, type CreativeModeContext } from '@/creative/CreativeMode';
import { OverworldScene } from '@/scene/OverworldScene';
import { OverworldEditor } from '@/editor/OverworldEditor';
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
import { QuestJournal } from '@/ui/QuestJournal';
import { DiscoveryTracker } from '@/world/DiscoveryTracker';
import { Inventory } from '@/core/Inventory';
import { CraftingUI } from '@/interactables/CraftingUI';
import { BaseScene, STRUCTURE_COSTS, STRUCTURE_META, type StructureType } from '@/scene/BaseScene';
import { checkQuestFulfillment } from '@/world/QuestDef';
import { assetLoader } from '@/assets/AssetLoader';
import { LightingSystem } from '@/rendering/LightingSystem';
import { ParticleSystem } from '@/rendering/ParticleSystem';
import { TimeSystem } from '@/world/TimeSystem';
import { DayNightSystem } from '@/rendering/DayNightSystem';
import { WeatherSystem } from '@/world/WeatherSystem';
import { AudioSystem }   from '@/audio/AudioSystem';
import { MerchantUI } from '@/ui/MerchantUI';
import { QuestBoardUI } from '@/ui/QuestBoardUI';
import { SpellForge }   from '@/ui/SpellForge';
import { StoryRunner }  from '@/world/StoryRunner';
import { speciesForCharacter, type SpeciesId } from '@/world/StoryQuestLine';
import { isDialogueOpen as isNPCDialogueOpen } from '@/world/NPCEntity';
import { ConsumableInventory } from '@/core/ConsumableInventory';
import { injectHudTheme } from '@/ui/hudTheme';
import { BuffBar } from '@/ui/BuffBar';
import { PartyStrip } from '@/ui/PartyStrip';
import { SolmorPresence } from '@/world/SolmorPresence';
import { ObjectiveTracker } from '@/ui/ObjectiveTracker';
import { QuestAcceptModal } from '@/ui/QuestAcceptModal';
import { ControlsOverlay }  from '@/ui/ControlsOverlay';
import { ProceduralWalkController } from '@/rendering/ProceduralWalk';
import { ProceduralBipedWalkController } from '@/rendering/ProceduralBipedWalk';
import { preloadDungeonProps, addPropsToRoom } from '@/rendering/KayKitDungeonProps';

async function main() {
  injectHudTheme();
  // Apply persisted accessibility settings on boot
  applyColourBlindMode(localStorage.getItem('ttt_colour_blind') === 'true');
  const _savedScale = parseInt(localStorage.getItem('ttt_text_scale') ?? '100');
  if (_savedScale !== 100) applyTextScale(_savedScale);
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
  // G1: cull static bodies beyond 30 WU from the player each physics step
  physics.cullingRadius = 30;

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

  // ── Day/night cycle — lerps hemi + keyLight + fog by TimeSystem.hour ──────
  const _dayNight  = new DayNightSystem(hemi, keyLight, scene);
  const _weatherSys = new WeatherSystem(scene, cameraRig.camera);
  void AudioSystem.instance; // boot singleton; context resumes on first user gesture

  // ── Floor ─────────────────────────────────────────────────────────────────
  // Floor and room geometry are now managed by SceneManager / BlueprintRenderer.

  // ── Player ────────────────────────────────────────────────────────────────
  const player = new PlayerController(physics, new THREE.Vector3(0, 1.5, 0));
  scene.add(player.shadow);
  scene.add(player.group);

  // ── Scene / room manager ──────────────────────────────────────────────────
  const sceneManager = new SceneManager(scene, physics, player, (dmg) => {
    if (dmg > 0) { cameraRig.shake(0.12, 0.22); hud.flashHit(); gameLoop.freeze(2); }
  });

  // ── Lighting system — torch flicker, spell pulses, ambiance presets ───────
  const lighting  = new LightingSystem(scene);
  const particles = new ParticleSystem(scene);
  // G2: Floating combat text + enemy health bars
  const dmgNumbers  = new DamageNumbers(cameraRig.camera, canvas);
  const enemyBars   = new EnemyHealthBars(cameraRig.camera, canvas);
  // Track last floor so onRoomLoaded can detect floor changes and show the location card.
  let _prevFloorIdx = Number.MIN_SAFE_INTEGER;
  // A4: KayKit dungeon prop group for the currently loaded room — removed on next room swap.
  let _roomPropGroup: THREE.Group | null = null;
  // Visited rooms — rooms entered at least once get instant lighting on re-entry.
  // First-visit rooms fade up from darkness for an exploration reveal effect.
  const _visitedRoomIds = new Set<string>();
  // Declared here (before onRoomLoaded / loadDungeon) to avoid temporal dead zone errors.
  let _towerPrologueDone = false;
  let _characterSpecies: SpeciesId | null = null;
  /** Active save-slot index — set when onPlay fires, used by autoSave(). */
  let _activeSlotId = 0;
  /** Most-recently entered tower floor — kept in sync for auto-save. */
  let _currentFloor = 0;
  /** True once the player has physically taken the master key from the basement workbench.
   *  Gates: front door exit, upward staircases. */
  let _hasMasterKey = false;

  sceneManager.onRoomLoaded = (bp, _s) => {
    lighting.clearTorches();
    lighting.addTorchesForBlueprint(bp);

    // A4: inject KayKit dungeon props (torches, pillars, barrels) into the room
    const dungeonPropGroup = addPropsToRoom(bp, assetLoader, bp.id);
    scene.add(dungeonPropGroup);
    // Store ref on bp so SceneManager teardown can remove it (we track via _roomPropGroup)
    _roomPropGroup = dungeonPropGroup;

    // Apply ambiance preset, then optionally override intensity for fade.
    const preset = (bp as any).lightPreset ?? 'dungeon';
    lighting.applyPreset(preset);

    // First-visit darkness fade: room starts pitch-dark, blooms to normal over 2.2 s.
    const isFirstVisit = !_visitedRoomIds.has(bp.id);
    if (isFirstVisit) {
      _visitedRoomIds.add(bp.id);
      lighting.fadeAmbientIn(0.0, 2.2);
    }

    // Slow ambient dust in every room
    const cx = (bp.width  * bp.cellSize) / 2;
    const cz = (bp.depth  * bp.cellSize) / 2;
    particles.addAmbientDust(
      new THREE.Vector3(cx, 1.5, cz),
      Math.min(bp.width, bp.depth) * bp.cellSize * 0.4,
    );
    // Floor name location card — shown only when the floor index actually changes
    // (side-room doors share the same floor index and don’t retrigger).
    if (bp.floor !== _prevFloorIdx) {
      _prevFloorIdx = bp.floor;
      _currentFloor = bp.floor;   // track for auto-save
      autoSave();                  // save on every floor transition
      const floorName = getFloorDef(bp.floor)?.name;
      if (floorName) _floorToast(floorName);

      // E3: Binding circle on Floor 0 — visible only to undead, shows lore on interact
      if (bp.floor === 0 && _characterSpecies === 'undead' && isFirstVisit) {
        _spawnBindingCircle(_s);
      }

      // Per-species staircase flavour toast — only during the prologue, only on first visit.
      if (!_towerPrologueDone && isFirstVisit && _characterSpecies) {
        const STAIR_FLAVOUR: Partial<Record<SpeciesId, Partial<Record<number, string>>>> = {
          human: {
            [-1]: "The air smells of sulphur and old reagents.\nWhatever was being made down here was not for guests.",
            [1]:  "The library is enormous. Most of these books have probably never been opened.\nYou feel a quiet obligation to fix that.",
            [2]:  "Something is still fermenting on this level.\nThe wizard's work continues without him.",
            [3]:  "The wizard's own chambers. Everything placed with intention.\nYou feel like you are not supposed to be here. You are probably right.",
          },
          undead: {
            [-1]: "The preservation wards in here are precise — older work, but careful.\nWhoever built this knew what they were doing.",
            [1]:  "Centuries of collected knowledge. You feel unusually at home.\nThis is your kind of room.",
            [2]:  "The fermentation vessels remind you of certain long-term processes\nyou prefer not to name in polite company.",
            [3]:  "A space built for solitary work. You recognise the signs.\nSomeone spent a very long time here alone.",
          },
          vulperia: {
            [-1]: "Your nose catches at least a dozen distinct compounds.\nImpressive laboratory. Dangerous laboratory. Possibly both.",
            [1]:  "The books are organised by a system you cannot immediately decode.\nYou find this personally offensive. You will work it out.",
            [2]:  "The aromas here are intensely layered. You file several notes mentally\nand immediately regret having such a good nose.",
            [3]:  "The wizard's sanctum. Every item placed deliberately.\nYour ears catch a distant draught from above — more to explore.",
          },
          slime: {
            [-1]: "The floor here is very clean. Suspiciously clean.\nYou respect this, while remaining suspicious.",
            [1]:  "The bookshelves are very tall. You regard them from several angles.\nReading is not technically your strength, but you are open to learning.",
            [2]:  "The cauldrons are enormous. You briefly consider whether you could fit inside one.\nFor research purposes only.",
            [3]:  "The carpet here is very soft. You take a moment to appreciate this.\nEveryone deserves a moment like this.",
          },
        };
        const msg = STAIR_FLAVOUR[_characterSpecies]?.[bp.floor];
        if (msg) _storyToast(msg, 'beat');
      }
    }
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
  // E2: Solmor 3D presence near tower entrance (shown after prologue complete)
  const solmorPresence = new SolmorPresence(scene);
  solmorPresence.load().catch(() => {});  // fire-and-forget
  let owEditor:  OverworldEditor | null = null;
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
    // Create (or recreate) the overworld editor bound to this scene instance
    owEditor?.dispose();
    owEditor = new OverworldEditor(scene, cameraRig.camera, canvas);
    const ow = new OverworldScene(scene, physics, player, worldData);
    // Inject already-cleared camps so they aren't re-spawned
    ow.clearedCamps = discoveryTracker.clearedCamps;
    ow.onCampCleared = (wx, wz) => {
      discoveryTracker.markCampCleared(wx, wz);
      discoveryTracker.saveToStorage();
    };
    ow.onMerchant = (name) => { MerchantUI.open(name, inventory); };
    MerchantUI._onBuyPotion = (id) => { consumables.addPotion(id); };
    // E1: pass current species so species-specific encounter NPCs spawn correctly
    ow.characterSpecies = _characterSpecies;
    MerchantUI._onBuyPotion = (id) => { consumables.addPotion(id); };
    ow.onQuestGiven = (quest) => {
      questModal.show(quest, () => {
        questLog.addQuest(quest);
        // Show in objective tracker if it's a world quest
        if (!quest.title.startsWith('[Story] ')) {
          objTracker.setObjective(quest.title, quest.description, false);
        }
        minimap?.setQuestPins(
          questLog.getActive().map(q => ({ col: q.target.col, row: q.target.row })),
        );
      });
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
    _weatherSys.setActive(true);
    minimap?.show();
    // E2: Show Solmor at tower entrance after prologue
    if (_towerPrologueDone) solmorPresence.show();
    // Spawn just south of the tower door, high enough that the KCC capsule
    // starts above the heightfield surface and falls cleanly to ground.
    player.teleport(new THREE.Vector3(0, 1.5, 8));
    // Widen fog for the open world
    scene.fog = new THREE.Fog(0x0a1408, 60, 180);
  }

  function switchToInterior(roomId?: string): void {
    overworld?.exit();
    _weatherSys.setActive(false);
    _cancelHarvest();
    gameMode = 'interior';
    minimap?.hide();
    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60); // restore dungeon fog
    // Remove previous room's KayKit props before loading new room
    if (_roomPropGroup) { scene.remove(_roomPropGroup); _roomPropGroup = null; }
    sceneManager.loadRoomImmediate(roomId ?? sceneManager.startRoomId ?? 'cell_start');
  }

  sceneManager.onExitTrigger = () => {
    // Block the front door until the player has the master key.
    if (!_hasMasterKey && gameMode === 'interior') {
      _storyToast(
        'The front door is sealed with heavy magic. You need the master key — it must be in the basement.',
        'beat',
      );
      return;
    }
    switchToExterior();

    // E2: After the prologue, trigger Solmor's first encounter the first time
    // the player exits the tower with the master key.
    if (_towerPrologueDone && _characterSpecies) {
      import('@/world/SolmorDialogueTree').then(({ getSolmorStage, showSolmorEncounter, advanceSolmorStage }) => {
        if (getSolmorStage() < 1) {
          showSolmorEncounter(1, _characterSpecies!, () => {
            advanceSolmorStage();
            _storyToast('Solmor has made an offer. The world waits.', 'act');
          });
        }
      });
    }
  };

  // During the prologue, upward staircases are locked until the player has the master key.
  sceneManager.onTransitionAttempt = (_targetId, direction) => {
    if (direction === 'up' && !_hasMasterKey && gameMode === 'interior') {
      _storyToast(
        "The staircase is sealed with an arcane ward.\nThe basement might have what you need first.",
        'beat',
      );
      return false;
    }
    return true;
  };

  // Track tower room clears for the clear_dungeon beat type (used by prologue beat 4).
  // discoveryTracker only tracks overworld dungeons; onRoomCleared covers tower floors.
  sceneManager.onRoomCleared = () => { _towerRoomsClearedCount++; };

  // ── Level editor ──────────────────────────────────────────────────────────
  const editMode = new EditMode(scene, cameraRig.camera, physics, sceneManager);

  // ── Progression & interactables ───────────────────────────────────────────
  const progression      = new ProgressionSystem();
  const questLog         = new QuestJournal();
  const discoveryTracker = new DiscoveryTracker();
  let _activeDungeonId: number | null = null;
  let _questCheckTimer = 0;
  let _storyRunner: StoryRunner | null = null;
  /** Tower room-clear counter — increments each time a room's enemies are all defeated.
   *  Used alongside discoveryTracker.clearedDungeons.size for clear_dungeon beats
   *  while the player is inside the tower (overworld dungeon clears are 0 in interior). */
  let _towerRoomsClearedCount = 0;
  let _craftedItemCount = 0;
  let _booksReadCount = 0;
  /** Blueprint IDs awarded from crafting, pending placement in construction mode. */
  const _pendingBlueprints = new Set<string>();
  const consumables   = new ConsumableInventory();
  consumables.onHeal  = (amt) => {
    player.health.heal(amt);
    // G2: show heal number at player position
    dmgNumbers.spawn(player.group.position.clone().setY(player.group.position.y + 2), amt, 'heal');
  };
  consumables.onChange = () => {
    hud.setConsumables({
      minorHealCount: consumables.getPotionCount('potion_heal_minor'),
      majorHealCount: consumables.getPotionCount('potion_heal_major'),
    });
  };
  /** Potion hotkeys: [Z] = heal minor, [X] = heal major */
  window.addEventListener('keydown', (e) => {
    if (gameMenu.isOpen || spellBook.isOpen || statPanel.visible) return;
    if (e.code === 'KeyZ') consumables.usePotion('potion_heal_minor');
    if (e.code === 'KeyX') consumables.usePotion('potion_heal_major');
  });
  const talentSystem  = new TalentSystem();
  // G3: particle burst when a talent node is purchased
  talentSystem.onNodeBought = (_nodeId) => {
    particles.burst(player.group.position.clone().setY(player.group.position.y + 1.2), 0xffdd44, 32, 3.5, 0.6);
    cameraRig.punch(1.2, 0.12);
  };
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
  bookReader.onOpen = () => { _booksReadCount++; };
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
  interactables.onQuestBoard = () => {
    QuestBoardUI.open(questLog, currentSeed, sceneManager.currentFloor);
  };

  interactables.onKeyPickup = () => {
    if (_hasMasterKey) return; // already picked up
    _hasMasterKey = true;
    _storyToast(
      'You take the master key.\nThe binding ward dissolves in your palm.',
      'act',
    );
    // Hide the key meshes in the scene (the workbench stays — you took FROM it).
    sceneManager.hidePickupItem('workbench_key');
    // Also patch the live blueprint so the interaction prompt no longer appears.
    const bp = sceneManager.currentBlueprintForPatch();
    if (bp) {
      const idx = bp.interactables.findIndex(i => i.type === 'workbench_key');
      if (idx !== -1) bp.interactables.splice(idx, 1);
    }
    // Auto-save: key is a significant milestone
    autoSave();
  };

  // Crafting station handler — open the shared CraftingUI with correct recipe set
  interactables.onCraftingStation = (type) => {
    // During the tower prologue, the wizard's stations are arcane-locked.
    if (!_towerPrologueDone && gameMode === 'interior') {
      const label = type === 'forge' ? 'forge' : type === 'alchemy' ? 'cauldron' : 'enchanting table';
      _storyToast(
        `The ${label} hums with unfamiliar wards.\n"Do not touch my equipment." — Solmor`,
        'beat',
      );
      return;
    }
    if (type === 'alchemy') {
      // If two spells are equipped, offer fusion; otherwise open crafting
      const slotA = progression.getEquippedSlot(0);
      const slotB = progression.getEquippedSlot(1);
      if (slotA && slotB && slotA !== slotB) {
        SpellForge.open(slotA, slotB, progression, spells, (hybridId) => {
          // Equip the new hybrid into slot 3 automatically
          progression.equipSpell(hybridId, 2);
        });
        return;
      }
    }
    craftingUI.toggle(type);
  };
  craftingUI.onCraft = (recipe) => {
    _craftedItemCount++;
    // Award result to inventory or progression based on result kind
    if (recipe.result.kind === 'blueprint') {
      _pendingBlueprints.add(recipe.result.id);
    } else if (recipe.result.kind === 'potion') {
      consumables.addPotion(recipe.result.id);
    } else if (recipe.result.kind === 'equipment_token') {
      consumables.addToken(recipe.result.id);
    }
    hud.setResources(inventory.snapshot());
    craftingUI.refresh();
  };
  craftingUI.setBag(consumables);
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
      for (const id of ['magic_bolt', 'flame_dart', 'intimidate', 'nova_burst', 'chain_arc', 'void_rift', 'battle_hymn', 'mass_animate', 'blink', 'levitate', 'fly']) progression.grantSpell(id);
      // Also grant all abilities: Blink (Z), Levitate (X), + species Q/R
      const charId = (_characterSpecies === 'human'    ? 'human_warrior'  :
                      _characterSpecies === 'undead'   ? 'skeleton_mage'  :
                      _characterSpecies === 'vulperia' ? 'fox_rogue'       :
                      _characterSpecies === 'slime'    ? 'slime'           :
                      'human_warrior') as import('@/scene/CharacterDecisionTree').CharacterId;
      applyCharacterAbilities(abilities, charId);
      _storyToast('All spells + abilities granted  ·  Q R Z X ready', 'beat');
    },
    onAllAbilities: () => {
      const charId = (_characterSpecies === 'human'    ? 'human_warrior'  :
                      _characterSpecies === 'undead'   ? 'skeleton_mage'  :
                      _characterSpecies === 'vulperia' ? 'fox_rogue'       :
                      _characterSpecies === 'slime'    ? 'slime'           :
                      'human_warrior') as import('@/scene/CharacterDecisionTree').CharacterId;
      applyCharacterAbilities(abilities, charId);
      _storyToast('Abilities granted: Q, R (species), Z (Blink), X (Levitate)', 'beat');
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

  // ── Game Menu (ESC hub) + legacy Pause Menu ────────────────────────────
  const pauseMenu = new PauseMenu({
    onOpenEditor:       () => editMode.toggle(),
    onOpenDevPanel:     () => devPanel.open(),
    onOpenStats:        () => statPanel.open(progression),
    onSave:             () => autoSave(),
    onEnterCreative:    () => {
      if (!import.meta.env.DEV) return;
      CreativeMode.enter();
    },
    onOpenBackrooms:    () => {
      if (!import.meta.env.DEV) return;
      CreativeMode.enterBackroom('spell_lab');
    },
  });

  const gameMenu = new GameMenu({
    openQuestLog:   () => questLog.show(),
    openQuestJournal: () => questLog.showJournal(),
    openSpellBook:  () => spellBook.open(),
    openStatPanel:  () => statPanel.open(progression),
    openTalentTree: () => talentTree.open(progression, talentSystem),
    openCrafting:   () => craftingUI.open('forge'),
    openDevPanel:   () => devPanel.open(),
    isDevMode:      () => devModeEnabled(),
    onSave:         () => { /* save hook placeholder */ },
    onQuit:         () => { gameLoop.stop(); sceneManager.unloadCurrentRoom?.(); mainMenu.show(); },
  });

  // ── Main menu (shown at startup; starts the game loop on Play) ────────────

  /** Write current progress to the active save slot. */
  function autoSave(): void {
    patchSaveSlot(_activeSlotId, {
      floor:        _currentFloor,
      hasMasterKey: _hasMasterKey,
      location:     'The Tower',
    });
  }

  /** Shared start-game logic — called by character creation onStart and by tests. */
  function startGame(seed?: number, cfg?: CharacterConfig): void {
    currentSeed = seed ?? Math.floor(Math.random() * 0xFFFF_FFFF);
    overworld?.dispose();
    overworld = null;
    owEditor?.dispose();
    owEditor = null;
    minimap?.dispose();
    minimap = null;
    gameMode = 'interior';
    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
    const plan = generateTower(currentSeed);
    sceneManager.resetCleared();
    sceneManager.resetVisitedFloors();
    _towerPrologueDone = false;
    _hasMasterKey = cfg?.hasMasterKey ?? false;   // restore from save or default false
    _currentFloor = 0;
    _booksReadCount = 0;
    _characterSpecies = null; // set below when cfg.characterId is known
    _visitedRoomIds.clear();
    _towerRoomsClearedCount = 0;
    // E1: reset story tracking sets for new game
    _eliteEnemiesKilled.clear();
    _completedNpcDialogues.clear();
    // E2: reset Solmor encounter stage for new game
    import('@/world/SolmorDialogueTree').then(({ resetSolmorStage }) => resetSolmorStage());
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

    // ── Start story quest line ─────────────────────────────────────────────
    _storyRunner = null;
    _craftedItemCount = 0;
    consumables.reset();
    hud.setConsumables({ minorHealCount: 0, majorHealCount: 0 });
    if (cfg?.characterId) {
      _characterSpecies = speciesForCharacter(cfg.characterId);
      // D6: gate species-specific talent nodes
      talentSystem.activeSpecies = _characterSpecies as import('@/progression/TalentSystem').TalentSpecies;
      mainMenu.setActiveSpecies(_characterSpecies);
      // Apply species-specific active abilities (D1/D6)
      applyCharacterAbilities(abilities, cfg.characterId);
      _storyRunner = new StoryRunner(cfg.characterId, questLog);
      // C1: Update quest journal species tab with the story arc title (fire-and-forget)
      import('@/world/StoryQuestLine').then(({ getStoryLine, speciesForCharacter }) => {
        const species = speciesForCharacter(cfg.characterId as any);
        if (species) {
          const line = getStoryLine(species as any);
          if (line) questLog.setSpeciesTitle(line.displayTitle);
        }
      });
      _storyRunner.onBeatComplete = (text, xp, gold) => {
        progression.grantXP(xp);
        if (gold > 0) inventory.add('gold', gold);
        _storyToast(text, 'beat');
        objTracker.clear(); // beat done — onBeatActivate fires next and will set the new one
      };
      _storyRunner.onBeatActivate = (title, desc) => {
        objTracker.setObjective(title, desc, true);
      };
      _storyRunner.onActBegin = (title, intro) => {
        _storyToast(intro, 'act');
        // The prologue ends when the first non-prologue act begins.
        if (title !== 'Prologue — The Tower') _towerPrologueDone = true;
        // E2: Advance Solmor to Stage 2 when Act I begins (after prologue)
        if (title !== 'Prologue — The Tower' && _characterSpecies) {
          import('@/world/SolmorDialogueTree').then(({ getSolmorStage, advanceSolmorStage }) => {
            if (getSolmorStage() === 1) {
              advanceSolmorStage();  // → stage 2
              solmorPresence.show(); // ensure he's visible
            }
          });
        }
      };
      _storyRunner.onStoryComplete = () => {
        _storyToast('Your story is complete. The world will remember this — probably.', 'act');
        objTracker.clear();
        // E2: Advance Solmor to Stage 3 when all species quests are done
        if (_characterSpecies) {
          import('@/world/SolmorDialogueTree').then(({ getSolmorStage, advanceSolmorStage }) => {
            if (getSolmorStage() === 2) {
              advanceSolmorStage();  // → stage 3 — the final encounter
            }
          });
        }
      };
      _storyRunner.start({
        killCount:            sceneManager.killCount,
        dungeonsClearedCount: discoveryTracker.clearedDungeons.size + _towerRoomsClearedCount,
        itemsCraftedCount:    _craftedItemCount,
        floorsVisited:        sceneManager.uniqueFloorsVisited,
        keysPickedUp:         _hasMasterKey ? 1 : 0,
        booksReadCount:       _booksReadCount,
        playerCol:            0,
        playerRow:            0,
        nearSettlements:      [],
        completedNpcDialogues: _completedNpcDialogues,
        eliteEnemiesKilled: _eliteEnemiesKilled,
      });
      // onBeatActivate fires during start() for the first beat — no manual init needed
    }

    // A4: preload KayKit dungeon props so first room has assets ready
    preloadDungeonProps(assetLoader).catch(() => { /* non-fatal */ });

    // Initialise creative mode with game context (dev only)
    if (import.meta.env.DEV) {
      CreativeMode.init({
        player: {
          ...(player as Parameters<typeof CreativeMode.init>[0]['player']),
          applyAssetModel: (def) => player.applyAssetModel(def),
        },
        regularHUD:   { el: (hud as unknown as { el?: HTMLElement }).el },
        sceneManager: sceneManager as Parameters<typeof CreativeMode.init>[0]['sceneManager'],
        scene,
        camera:       cameraRig.camera,
        canvas:       renderer.domElement,
        openCharSheet: () => statPanel.open(progression),
        orbit: orbit as CreativeModeContext['orbit'],
      });
    }

    gameLoop.start();
  }

  /** XP kill tracker — grants XP for each new kill registered. */
  let prevKillCount = 0;
  /** E1/E2: Named elite enemy IDs killed this session (for defeat_elite beats). */
  const _eliteEnemiesKilled   = new Set<string>();
  /** E1: NPC IDs whose full dialogue has been completed (for talk_to_npc beats). */
  const _completedNpcDialogues = new Set<string>();

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
    // Show a launcher modal offering the dev tools
    _showDevLauncher();
  }

  function _showDevLauncher(): void {
    const existing = document.getElementById('dev-launcher-modal');
    if (existing) { existing.remove(); }

    const overlay = document.createElement('div');
    overlay.id = 'dev-launcher-modal';
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;',
      'align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px)',
    ].join('');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#161a20;border:1px solid #2a2f38;border-radius:10px;',
      'padding:28px 32px;min-width:360px;color:#d0d8e8;font:13px/1.5 "Segoe UI",sans-serif',
    ].join('');

    panel.innerHTML = `
      <h2 style="font-size:16px;font-weight:700;margin-bottom:6px;color:#d8a96a;letter-spacing:.04em">Backrooms</h2>
      <p style="color:#7a8a9a;margin-bottom:20px;font-size:12px">Development tools — the place things get weird.</p>
      <div style="display:flex;flex-direction:column;gap:8px" id="dev-launcher-btns"></div>
      <button id="dev-launcher-close" style="
        margin-top:18px;width:100%;padding:8px;background:none;border:1px solid #2a2f38;
        border-radius:6px;color:#7a8a9a;font:inherit;font-size:12px;cursor:pointer
      ">Cancel</button>
    `;

    const btns = [
      { label: '✦ World Editor', desc: 'Asset Studio · Models · Tile Painter · Tower Rooms · Buildings · Library',
        action: () => { overlay.remove(); window.open('world-editor.html', '_blank'); } },
      { label: '⚡ Dev Panel (in-game)', desc: 'Spell Lab · Enemy Lab · Creature Creator · Cheats',
        action: () => { overlay.remove(); _startDevPanelInGame(); } },
    ];

    const btnContainer = panel.querySelector('#dev-launcher-btns')!;
    for (const b of btns) {
      const el = document.createElement('button');
      el.style.cssText = [
        'background:#1a1e28;border:1px solid #2a2f38;border-radius:7px;',
        'padding:10px 14px;text-align:left;cursor:pointer;color:#d0d8e8;font:inherit;',
        'transition:background .12s,border-color .12s',
      ].join('');
      el.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:2px">${b.label}</div>
        <div style="font-size:11px;color:#7a8a9a">${b.desc}</div>
      `;
      el.addEventListener('mouseover', () => { el.style.background = '#1e2535'; el.style.borderColor = '#6a9fd8'; });
      el.addEventListener('mouseout',  () => { el.style.background = '#1a1e28'; el.style.borderColor = '#2a2f38'; });
      el.addEventListener('click', b.action);
      btnContainer.appendChild(el);
    }

    panel.querySelector('#dev-launcher-close')!.addEventListener('click', () => { overlay.remove(); mainMenu.show(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); mainMenu.show(); } });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function _startDevPanelInGame(): void {
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
        // Grant all spells AND all abilities in one click
        for (const id of ['magic_bolt','flame_dart','intimidate','nova_burst','chain_arc','void_rift','battle_hymn','mass_animate','blink','levitate','fly']) {
          progression.grantSpell(id);
        }
        const charId = (_characterSpecies === 'human'    ? 'human_warrior'  :
                        _characterSpecies === 'undead'   ? 'skeleton_mage'  :
                        _characterSpecies === 'vulperia' ? 'fox_rogue'       :
                        _characterSpecies === 'slime'    ? 'slime'           :
                        'human_warrior') as import('@/scene/CharacterDecisionTree').CharacterId;
        applyCharacterAbilities(abilities, charId);
        _storyToast('All spells + abilities granted  ·  Q R Z X ready', 'beat');
      },
      onGrantAllAbilities: () => {
        // Re-apply character abilities to ensure all slots are filled.
        // Uses current characterId if known, falls back to human_warrior.
        const charId = (_characterSpecies === 'human'    ? 'human_warrior'  :
                        _characterSpecies === 'undead'   ? 'skeleton_mage'  :
                        _characterSpecies === 'vulperia' ? 'fox_rogue'       :
                        _characterSpecies === 'slime'    ? 'slime'           :
                        'human_warrior') as import('@/scene/CharacterDecisionTree').CharacterId;
        applyCharacterAbilities(abilities, charId);
        _storyToast('Abilities granted: Q, R (species), Z (Blink), X (Levitate)', 'beat');
      },
      // ── Cheats tab ──────────────────────────────────────────────────────
      getGodMode:          () => player.health.godMode,
      onGodMode:           (v) => { player.health.godMode = v; },
      getInstantCooldowns: () => spells.instantCooldowns,
      onInstantCooldowns:  (v) => { spells.instantCooldowns = v; },
      getHpInfo:   () => ({ hp: player.health.hp, maxHp: player.health.maxHp }),
      onFillHp:    () => { player.health.reset(); if (deathTriggered) { deathTriggered = false; deathScreen.hide(); } },
      onSetHp:     (v) => { player.health.forceSetHp(v); if (deathTriggered && v > 0) { deathTriggered = false; deathScreen.hide(); } },
      onKillAllInRoom: () => sceneManager.getActiveEnemies().forEach(e => { if (!e.isDead) e.health.takeDamage(9999); }),
      onForceFlee: () => {
        const all = gameMode === 'interior' ? sceneManager.getActiveEnemies() : (overworld?.getActiveEnemies() ?? []);
        all.forEach(e => { if (!e.isDead) e.forceFlee(); });
      },
      onTeleportRoom: (roomId) => { sceneManager.loadRoomImmediate(roomId); player.teleport(new THREE.Vector3(0, 1.5, 0)); wasRoomCleared = false; },
      getFlyMode:    () => player.flyMode,
      onFlyMode:     (v) => { player.flyMode = v; },
      getSettlements: () => gameMode === 'exterior' ? (overworld?.getSettlementPositions() ?? []) : [],
      onFastTravel:  (pos) => { if (gameMode !== 'exterior') switchToExterior(); player.teleport(new THREE.Vector3(pos.x, pos.y + 2, pos.z)); },
      onRunWave: (_count, _interval, hp, damage) => {
        // Called once per enemy by the wave timer in DevSandbox
        const playerPos = player.group.position;
        const angle = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 2;
        const pos = new THREE.Vector3(
          playerPos.x + Math.cos(angle) * r, 1.5,
          playerPos.z + Math.sin(angle) * r,
        );
        const en = new SlimeEnemy(pos, physics, (dmg: number) => { player.health.takeDamage(dmg); if (dmg > 0) { cameraRig.shake(0.12, 0.22); hud.flashHit(); gameLoop.freeze(2); dmgNumbers.spawn(player.group.position.clone().setY(player.group.position.y + 1.5), dmg, "damage"); } });
        en.health.forceSetHp(hp);
        (en as unknown as { _baseDamage?: number })._baseDamage = damage;
        scene.add(en.group);
        sceneManager.addEnemy(en);
      },
      onSwapPlayerModel: (path) => {
        // applyAssetModel expects a CharModelDef — look it up from the manifest
        import('@/characters/charManifest').then(({ CHAR_MODELS }) => {
          const def = CHAR_MODELS.find(m => m.path === path);
          if (def) player.applyAssetModel(def).catch((e) => console.warn('[sandbox] model swap failed:', e));
        });
      },
      onPreviewModel: async (def) => {
        // Load the model via CharacterLoader and place it at a fixed inspection
        // position in the sandbox scene (2 units in front of origin, lit well).
        const { loadCharModel } = await import('@/characters/CharacterLoader');
        try {
          const loaded = await loadCharModel(def);
          // Remove previous preview object if any
          const prevObj = scene.getObjectByName('__preview_model');
          if (prevObj) scene.remove(prevObj);
          // Keep a reference so we can play animations on it
          (window as unknown as Record<string, unknown>)['__previewLoaded'] = loaded;

          loaded.scene.name = '__preview_model';
          // Scale to a reasonable inspection size (auto-fit to ~2 unit height)
          const box    = new THREE.Box3().setFromObject(loaded.scene);
          const height = Math.max(box.max.y - box.min.y, 0.01);
          const scale  = 2.0 / height;
          loaded.scene.scale.setScalar(scale);
          // Centre on ground plane, slightly to the right of origin so player
          // doesn't overlap with the inspected model
          loaded.scene.position.set(4, 0, 0);
          scene.add(loaded.scene);
          // Start idle animation if available
          const clips = loaded.clips.map(c => c.name);
          if (loaded.mixer && loaded.clips.length > 0) {
            const idleClip = loaded.clips.find(c => /idle/i.test(c.name)) ?? loaded.clips[0];
            loaded.mixer.clipAction(idleClip).play();
          }
          return clips;
        } catch (e) {
          console.warn('[sandbox] preview model load failed:', e);
          return [];
        }
      },
      onPlayPreviewAnim: (clipName) => {
        const loaded = (window as unknown as Record<string, unknown>)['__previewLoaded'] as import('@/characters/CharacterLoader').LoadedChar | undefined;
        if (!loaded?.mixer) return;
        loaded.mixer.stopAllAction();
        if (!clipName) return;
        const clip = loaded.clips.find(c => c.name === clipName);
        if (clip) loaded.mixer.clipAction(clip).play();
      },
      onSpawnNPC: (dna, _name, hp, damage, count) => {
        const playerPos = player.group.position;
        const angle0 = Math.random() * Math.PI * 2;
        for (let i = 0; i < count; i++) {
          const angle = angle0 + (i / Math.max(count, 1)) * Math.PI * 2;
          const r = 4 + Math.random() * 2;
          const pos = new THREE.Vector3(
            playerPos.x + Math.cos(angle) * r, 1.5,
            playerPos.z + Math.sin(angle) * r,
          );
          const en = new SlimeEnemy(pos, physics, (dmg: number) => { player.health.takeDamage(dmg); if (dmg > 0) { cameraRig.shake(0.12, 0.22); hud.flashHit(); gameLoop.freeze(2); dmgNumbers.spawn(player.group.position.clone().setY(player.group.position.y + 1.5), dmg, "damage"); } });
          // Override HP and damage
          en.health.forceSetHp(hp);
          (en as unknown as { _maxHp?: number })._maxHp = hp;
          (en as unknown as { _baseDamage?: number })._baseDamage = damage;
          // Replace slime body with DNA creature rig
          const rig = buildCreature(dna);
          // Hide the default slime sphere mesh; add DNA rig to the enemy group
          en.group.children.slice().forEach(c => { c.visible = false; });
          en.group.add(rig.root);
          scene.add(en.group);
          sceneManager.addEnemy(en);
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
          const en = new SlimeEnemy(pos, physics, (dmg: number) => { player.health.takeDamage(dmg); if (dmg > 0) { cameraRig.shake(0.12, 0.22); hud.flashHit(); gameLoop.freeze(2); dmgNumbers.spawn(player.group.position.clone().setY(player.group.position.y + 1.5), dmg, "damage"); } });
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

  // ── Shadow arrival VFX (blink destination) ───────────────────────────────
  /** Dark shadow puff at the blink landing point — wavy wisps that rise and fade. */
  function _shadowArrivalVfx(pos: THREE.Vector3, targetScene: THREE.Scene): void {
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i < 2 ? 0x0a000f : 0x1a0028,
        transparent: true,
        opacity: 0.65 - i * 0.08,
      });
      const geo = new THREE.SphereGeometry(0.22 + i * 0.07, 6, 4);
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / 5) * Math.PI * 2;
      const r = 0.25 + (i % 2) * 0.2;
      mesh.position.set(pos.x + Math.cos(angle) * r, pos.y + 0.3, pos.z + Math.sin(angle) * r);
      targetScene.add(mesh);
      const t0 = performance.now();
      const rise = 1.0 + i * 0.25;
      const anim = () => {
        const t = Math.min((performance.now() - t0) / 480, 1);
        mesh.position.y = pos.y + 0.3 + t * rise;
        // Wavy sideways drift
        mesh.position.x = pos.x + Math.cos(angle) * r + Math.sin(t * 7 + i * 1.3) * 0.12;
        mesh.position.z = pos.z + Math.sin(angle) * r + Math.cos(t * 7 + i * 1.3) * 0.12;
        mat.opacity = (0.65 - i * 0.08) * (1 - t * t);
        mesh.scale.setScalar(1 + t * 0.5);
        if (t < 1) { requestAnimationFrame(anim); return; }
        targetScene.remove(mesh); geo.dispose(); mat.dispose();
      };
      requestAnimationFrame(anim);
    }
    // Dark ground disc that expands and fades
    const dGeo = new THREE.CircleGeometry(0.5, 18);
    dGeo.rotateX(-Math.PI / 2);
    const dMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(dGeo, dMat);
    disc.position.set(pos.x, pos.y + 0.02, pos.z);
    targetScene.add(disc);
    const d0 = performance.now();
    const dAnim = () => {
      const t = Math.min((performance.now() - d0) / 380, 1);
      dMat.opacity = 0.5 * Math.pow(1 - t, 1.8);
      disc.scale.setScalar(1 + t * 1.5);
      if (t < 1) { requestAnimationFrame(dAnim); return; }
      targetScene.remove(disc); dGeo.dispose(); dMat.dispose();
    };
    requestAnimationFrame(dAnim);
  }

  // ── Story toast ──────────────────────────────────────────────────────────
  function _storyToast(text: string, kind: 'beat' | 'act'): void {
    const el = document.createElement('div');
    const isBeat = kind === 'beat';
    Object.assign(el.style, {
      position:   'fixed',
      bottom:     isBeat ? '90px' : '50%',
      left:       '50%',
      transform:  isBeat ? 'translateX(-50%)' : 'translate(-50%, 50%)',
      maxWidth:   '480px',
      padding:    isBeat ? '10px 20px' : '16px 28px',
      background: isBeat ? 'rgba(20,14,6,0.88)' : 'rgba(12,8,3,0.94)',
      border:     `1px solid ${isBeat ? '#5a3a1a' : '#c8963c'}`,
      borderRadius: '4px',
      color:      isBeat ? '#cbbf9a' : '#e8d4a0',
      fontFamily: isBeat ? 'Georgia, serif' : "'Cinzel', serif",
      fontSize:   isBeat ? '13px' : '15px',
      lineHeight: '1.5',
      textAlign:  'center',
      zIndex:     '500',
      pointerEvents: 'none',
      opacity:    '1',
      transition: 'opacity 1.2s ease',
      boxShadow:  isBeat ? 'none' : '0 0 30px rgba(200,150,60,0.25)',
    });
    el.textContent = text;
    document.body.appendChild(el);
    // Act intros (prologue, new act) need longer display time — 3 sentences to read.
    setTimeout(() => { el.style.opacity = '0'; }, isBeat ? 3500 : 9000);
    setTimeout(() => { el.remove(); },            isBeat ? 4700 : 10200);
  }

  /** Location card — shown at the top-centre whenever the player enters a new floor. */
  /**
   * E3: Spawn the binding circle interactable on Floor 0 for undead species.
   * The circle is a faintly glowing floor rune with an [E] interact prompt that
   * shows species lore about the ward keeping the player's agency suppressed.
   */
  function _spawnBindingCircle(roomScene: THREE.Scene): void {
    const group = new THREE.Group();
    group.name  = 'binding_circle_f0';
    // Position the circle in the centre of Floor 0 (slightly under the rug)
    group.position.set(0, 0.03, 0);

    // Glowing rune disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0x4400aa, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);

    // Thin outer ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.04, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0x6622ff, transparent: true, opacity: 0.6 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // Subtle pulse light
    const light = new THREE.PointLight(0x4400aa, 0.6, 5);
    light.position.y = 0.5;
    group.add(light);

    roomScene.add(group);

    // Pulse animation driven by rAF — stops when group is removed
    let age = 0;
    const mat = disc.material as THREE.MeshBasicMaterial;
    const animFrame = () => {
      if (!group.parent) return;
      age += 0.016;
      mat.opacity  = 0.2 + Math.abs(Math.sin(age * 0.8)) * 0.2;
      light.intensity = 0.4 + Math.abs(Math.sin(age * 0.8)) * 0.4;
      requestAnimationFrame(animFrame);
    };
    requestAnimationFrame(animFrame);

    // Proximity lore trigger: when player steps within 1.8 WU, show lore text once
    let loreFired = false;
    const LORE_TEXT = [
      'A binding circle. Old work — centuries, at minimum.',
      'You can feel it even now, a subtle tugging at the root of what you are.',
      'The arcane notation around the edge is Solmor\'s hand, but the original design is older.',
      'Whatever it was meant to contain, it was never fully closed.',
    ].join('\n');

    const checkProximity = setInterval(() => {
      if (loreFired) { clearInterval(checkProximity); return; }
      if (!group.parent) { clearInterval(checkProximity); return; }
      const pPos = player.group.position;
      const dx = pPos.x - group.position.x;
      const dz = pPos.z - group.position.z;
      if (dx*dx + dz*dz < 1.8 * 1.8) {
        loreFired = true;
        _storyToast(LORE_TEXT, 'beat');
        clearInterval(checkProximity);
      }
    }, 200);
  }

  function _floorToast(name: string): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position:      'fixed',
      top:           '18%',
      left:          '50%',
      transform:     'translateX(-50%)',
      padding:       '6px 28px',
      color:         '#b8a888',
      fontFamily:    "'Cinzel', serif",
      fontSize:      '13px',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      textAlign:     'center',
      zIndex:        '399',
      pointerEvents: 'none',
      opacity:       '0',
      transition:    'opacity 0.7s ease',
    });
    el.textContent = name;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0.65'; });
    setTimeout(() => { el.style.opacity = '0'; }, 3200);
    setTimeout(() => { el.remove(); },             3900);
  }

  const mainMenu = new MainMenu({
    onPlay: (slotId, isNewGame) => {
      _activeSlotId = slotId;
      if (isNewGame) {
        // New save — run narrative campfire intro to determine character
        mainMenu.hide();
        const flow = new NewGameFlow();
        flow.play(document.body, slotId).then(cfg => {
          flow.dispose();
          // Persist character identity so "Continue" can restore it
          patchSaveSlot(slotId, {
            characterId:  cfg.characterId,
            boon:         cfg.boon,
            statBonuses:  cfg.statBonuses,
            hasMasterKey: false,
            floor:        0,
            location:     'The Tower',
          });
          startGame(undefined, cfg);
        }).catch(err => {
          console.error('[NewGameFlow] failed:', err);
          flow.dispose();
          // Fallback to old character creator on error
          charCreation.show(slotId);
          mainMenu.hide();
        });
      } else {
        // Continuing existing save — reconstruct character config from saved data
        mainMenu.hide();
        const saved = readSaveSlot(slotId);
        let cfg: CharacterConfig | undefined;
        if (saved?.characterId) {
          const charId = saved.characterId as CharacterId;
          const manifestId = CHAR_MANIFEST_MAP[charId];
          // Dynamically load the model list to rebuild assetModel
          import('@/characters/charManifest').then(({ CHAR_MODELS }) => {
            import('@/creatures/CreatureDNA').then(({ DEFAULT_PLAYER_DNA }) => {
              const assetModel = CHAR_MODELS.find(m => m.id === manifestId) ?? null;
              cfg = {
                name:         charId,
                boon:         (saved.boon ?? 'tome') as import('@/ui/CharacterCreation').StartingBoon,
                slotId,
                dna:          { ...DEFAULT_PLAYER_DNA },
                assetModel:   assetModel ?? undefined,
                statBonuses:  (saved.statBonuses ?? []) as StatBonus[],
                characterId:  charId,
                hasMasterKey: saved.hasMasterKey ?? false,
              };
              startGame(undefined, cfg);
            });
          });
        } else {
          startGame();
        }
      }
    },
    onDevLab: () => startSandbox(),
    rebindControls: {
      getBindings: () => input.bindings as import('@/core/InputManager').Bindings,
      rebind:       (action, code) => input.rebind(action, code),
      resetBindings: () => input.resetBindings(),
    },
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
      /** Enter creative mode (dev only). */
      enterCreativeMode: () => { if (import.meta.env.DEV) CreativeMode.enter(); },
      /** Exit creative mode (dev only). */
      exitCreativeMode: () => { if (import.meta.env.DEV) CreativeMode.exit(); },
      /** Whether creative mode is currently active. */
      isCreativeActive: () => import.meta.env.DEV && CreativeMode.active,
      /** Current tower floor index (-1=basement, 0–9=floors). */
      getCurrentFloor: () => _currentFloor,
      /** Current room ID as loaded in SceneManager. */
      getCurrentRoom: () => sceneManager.currentFloor,
    };
  }
  // ── Centralised key routing ──────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    // Ignore all game key routing while the main menu is visible
    if (mainMenu.isVisible) return;

    // Ctrl+Shift+C — toggle creative mode (dev builds only)
    if (import.meta.env.DEV && e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      if (CreativeMode.active) CreativeMode.exit();
      else                     CreativeMode.enter();
      return;
    }

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
      } else if (controlsOverlay.isOpen) {
        controlsOverlay.hide();     // close help → game
      } else if (gameMenu.isOpen) {
        gameMenu.close();           // close game menu → game
      } else if (gameMenu.isOpen) {
        pauseMenu.close();          // close legacy pause → game (safety)
      } else {
        gameMenu.open();            // game → game menu
      }
    } else if (e.key === 'h' || e.key === 'H') {
      if (!gameMenu.isOpen && !editMode.isActive) controlsOverlay.toggle();
    } else if (e.key === 'k' || e.key === 'K') {
      if (import.meta.env.DEV && CreativeMode.active) return;
      if (!gameMenu.isOpen && !editMode.isActive) spellBook.toggle();
    } else if (e.key === 'p' || e.key === 'P') {
      if (import.meta.env.DEV && CreativeMode.active) return;
      if (!gameMenu.isOpen && !editMode.isActive) statPanel.toggle(progression);
    } else if (e.key === 't' || e.key === 'T') {
      if (import.meta.env.DEV && CreativeMode.active) return;
      if (!gameMenu.isOpen && !editMode.isActive) talentTree.toggle(progression, talentSystem);
    } else if (e.key === '`' || e.key === '~') {
      if (!gameMenu.isOpen) editMode.toggle(); // shortcut: direct editor toggle
    } else if ((e.key === 'b' || e.key === 'B') && gameMode === 'exterior') {
      if (!gameMenu.isOpen && !editMode.isActive) _toggleConstructionMode();
    } else if (e.key === '\\' && gameMode === 'exterior') {
      if (!gameMenu.isOpen && devModeEnabled()) owEditor?.toggle();
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
  const combat  = new CombatSystem();
  const spells  = new SpellSystem();
  const abilities = new AbilitySystem();

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
  const buffBar    = new BuffBar();
  const partyStrip = new PartyStrip();
  const objTracker = new ObjectiveTracker();
  const questModal = new QuestAcceptModal();
  const controlsOverlay = new ControlsOverlay();

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

  // ── Scroll-to-zoom ───────────────────────────────────────────────────────
  window.addEventListener('wheel', (e) => {
    if (gameMode === 'exterior' || gameMode === 'interior') {
      e.preventDefault();
      cameraRig.applyScroll(e.deltaY);
    }
  }, { passive: false });

  // ── Game loop ─────────────────────────────────────────────────────────────
  const gameLoop = new GameLoop();
  gameLoop.onTick((dt) => {
    // ── Telescope remote-view mode — skip all game simulation ──────────────
    if (gameMode === 'telescope') {
      telescopeView.update(dt);
      renderer.render(scene, telescopeView.camera); // bypass bloom for telescope
      return;
    }

    // 1. Physics — G1: update culling origin to player position each frame
    const _pp = player.group.position;
    physics.cullingOrigin = { x: _pp.x, y: _pp.y, z: _pp.z };
    physics.step(dt);

    // 2-7. Game simulation — paused while editor, pause menu, or death screen is open
    if (!editMode.isActive && !gameMenu.isOpen && !deathScreen.isVisible && !spellBook.isOpen && !devPanel.isOpen) {
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

      // Tick the preview model mixer (asset browser inspection model)
      const _previewLoaded = (window as unknown as Record<string, unknown>)['__previewLoaded'] as import('@/characters/CharacterLoader').LoadedChar | undefined;
      _previewLoaded?.mixer?.update(dt);

      // 5. Room manager / overworld — enemy AI + door trigger checks
      if (gameMode === 'interior') {
        hud.setTime(null);
        sceneManager.update(dt, player.group.position);

        // Story runner tick — interior branch (prologue beats).
        // Throttled to 1 Hz like the exterior branch.
        _questCheckTimer -= dt;
        if (_questCheckTimer <= 0 && _storyRunner) {
          _questCheckTimer = 1.0;
          _storyRunner.tick({
            killCount:            sceneManager.killCount,
            dungeonsClearedCount: discoveryTracker.clearedDungeons.size + _towerRoomsClearedCount,
            itemsCraftedCount:    _craftedItemCount,
            floorsVisited:        sceneManager.uniqueFloorsVisited,
            keysPickedUp:         _hasMasterKey ? 1 : 0,
            booksReadCount:       _booksReadCount,
            playerCol:            0,
            playerRow:            0,
            nearSettlements:      [],
            completedNpcDialogues: _completedNpcDialogues,
            eliteEnemiesKilled: _eliteEnemiesKilled,
          });
        }
      } else if (overworld) {
        owEditor?.update();
        TimeSystem.instance.update(dt);
        _dayNight.update(TimeSystem.instance.hour);
        hud.setTime(TimeSystem.instance.formatted);
        const _dayNum = Math.floor(TimeSystem.instance.hour / 24);
        _weatherSys.update(dt, player.group.position, TimeSystem.instance.hour, _dayNum);
        const _npcBlocking = MerchantUI.isOpen || isNPCDialogueOpen();
        overworld.update(dt, input.state.interact && !_npcBlocking, cameraRig.camera);
        // A5: pass current hour so tower details (lights, gate) can respond
        (overworld as any)._timeHour = TimeSystem.instance.hour % 24;
        solmorPresence.update(dt);   // E2: bob + anim tick
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

          // Story runner tick (same 1 Hz throttle is fine)
          if (_storyRunner) {
            const _nearby: string[] = []; // settlement proximity — extended when OverworldScene exposes getSettlementsNear()
            _storyRunner.tick({
              killCount:            sceneManager.killCount,
              dungeonsClearedCount: discoveryTracker.clearedDungeons.size + _towerRoomsClearedCount,
              itemsCraftedCount:    _craftedItemCount,
              floorsVisited:        sceneManager.uniqueFloorsVisited,
              keysPickedUp:         _hasMasterKey ? 1 : 0,
              booksReadCount:       _booksReadCount,
              playerCol:            _gc.col,
              playerRow:            _gc.row,
              nearSettlements:      _nearby,
              completedNpcDialogues: _completedNpcDialogues,
              eliteEnemiesKilled: _eliteEnemiesKilled,
            });
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
              // NPC talk check
              const _nearNPC = overworld.nearestNPC(_pos);
              if (_nearNPC) {
                _setExteriorPrompt(`Talk to ${_nearNPC}`);
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
        // Priority: taming prompt > staircase hint > interactable prompt
        const _nearFleeInt = sceneManager.getActiveEnemies().find(
          en => !en.isDead && en.isRecruitable
            && en.worldPosition.distanceTo(player.group.position) < 6.0,
        );
        const _stairHint = !_nearFleeInt ? sceneManager.getStaircaseHint(player.group.position) : null;
        interactables.overridePrompt(
          _nearFleeInt
            ? (party.isFull ? 'Party full' : '♪ Sing to it')
            : _stairHint ?? null,
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
        combat.triggerMelee(player.group.position, meleeAngle, enemies, scene,
          // G2: melee damage number + G3: hit-stop + G3: death knockback
          (target, damage) => {
            const pos = (target as unknown as { worldPosition?: THREE.Vector3 }).worldPosition;
            if (pos) dmgNumbers.spawn(pos.clone().setY(pos.y + 1.8), damage, 'damage');
            cameraRig.shake(0.06, 0.18); // light shake on melee hit
            gameLoop.freeze(2);           // G3: 2-frame hit-stop
            // G3: knockback on lethal hit
            if ((target as unknown as { isDead?: boolean }).isDead) {
              (target as unknown as { applyDeathKnockback?(from: THREE.Vector3): void })
                .applyDeathKnockback?.(player.group.position);
            }
          },
        );
        player.triggerAttack();
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
            // G2: damage number on spell hit + G3: hit-stop on crit
            (target, damage) => {
              const pos = (target as unknown as { worldPosition?: THREE.Vector3 }).worldPosition;
              if (pos) {
                const isCrit = damage > 10;
                dmgNumbers.spawn(pos.clone().setY(pos.y + 1.8), damage, isCrit ? 'crit' : 'damage');
                if (isCrit) { cameraRig.shake(0.08, 0.25); gameLoop.freeze(3); } // G3: 3-frame hit-stop on crit
              }
            },
            {
              spellDamageMult: progression.derivedSpellDamageMult,
              aoeRadiusMult: progression.mods.aoeRadiusMult,
              party,
              onForceFlee: (targets) => targets.forEach(e => (e as unknown as { forceFlee?(): void }).forceFlee?.()),
              onBattleHymn: (_dur) => { party.followerDamageMult = 1.5; },
              // ── Movement spells ──────────────────────────────────────────
              onBlink: (_origin) => {
                // Shadow Step: blink to mouse cursor with dark smoky transition
                const playerPos = player.group.position;
                const raw = mouseWorld.clone().setY(playerPos.y);
                const toMouse = raw.clone().sub(playerPos);
                const dist    = Math.min(toMouse.length(), 12);
                const dir     = toMouse.clone().normalize();

                // Wall check
                const rayHit = physics.castRayVsWalls(
                  playerPos.clone().setY(playerPos.y + 0.8),
                  dir,
                  dist + 0.5,
                );
                const safeDist = rayHit !== null ? Math.max(0.5, rayHit - 0.9) : dist;
                const dest = playerPos.clone().add(dir.multiplyScalar(safeDist));
                dest.y = playerPos.y;

                // ── Shadow step transition ────────────────────────────────
                // Phase 1 (0-120ms): player model squishes into shadow + fades
                // Phase 2 (120ms): teleport happens
                // Phase 3 (120-320ms): player reforms from shadow at destination
                const charScene = (player as unknown as { _charController?: { scene: THREE.Group } })
                  ._charController?.scene ?? null;

                // Squish and fade out over 120ms
                const FADE_OUT = 120;
                const FADE_IN  = 200;
                const outStart = performance.now();

                const fadeOut = () => {
                  const t = Math.min((performance.now() - outStart) / FADE_OUT, 1);
                  // Squish downward + shrink sideways (melt into shadow)
                  if (charScene) {
                    charScene.scale.y = 1 - t * 0.92;
                    charScene.scale.x = 1 + t * 0.3;
                    charScene.scale.z = 1 + t * 0.3;
                  }
                  if (t < 1) { requestAnimationFrame(fadeOut); return; }

                  // Teleport
                  player.teleport(dest);

                  // Destination shadow smoke (appears just after teleport)
                  _shadowArrivalVfx(dest, scene);

                  // Phase 3: reform at destination
                  const inStart = performance.now();
                  const fadeIn = () => {
                    const ti = Math.min((performance.now() - inStart) / FADE_IN, 1);
                    // Ease out: fast scale up from shadow
                    const ease = 1 - Math.pow(1 - ti, 2.5);
                    if (charScene) {
                      charScene.scale.y = ease;
                      charScene.scale.x = 1 + (1 - ease) * 0.25;
                      charScene.scale.z = 1 + (1 - ease) * 0.25;
                    }
                    if (ti < 1) { requestAnimationFrame(fadeIn); return; }
                    // Fully reformed
                    if (charScene) charScene.scale.set(1, 1, 1);
                  };
                  requestAnimationFrame(fadeIn);
                };
                requestAnimationFrame(fadeOut);

                // No arcane light pulse — just the dark shadow VFX from SpellSystem
              },
              onLevitateToggle: () => {
                player.levitateMode = !player.levitateMode;
                if (player.levitateMode) {
                  (player as unknown as { _levitateTargetY: number })._levitateTargetY =
                    player.group.position.y + (player as unknown as { LEVITATE_HEIGHT: number }).LEVITATE_HEIGHT;
                  particles.burst(player.group.position, 0x88ddff, 14, 2.5, 0.5);
                } else {
                  // Landing — deactivate levitate, physics resumes
                  particles.burst(player.group.position, 0x88ddff, 8, 1.5, 0.3);
                }
              },
              onFlyBurst: (_angle) => {
                // Toggle sustained fly spell mode (WoW-style free flight)
                const wasFlying = player.flySpellMode;
                player.flySpellMode = !wasFlying;
                player.group.userData['_flySpellMode'] = player.flySpellMode;
                particles.burst(player.group.position, 0xffdd44, wasFlying ? 8 : 20, wasFlying ? 2.0 : 4.5, 0.4);
                if (!wasFlying) {
                  lighting.addSpellPulse(player.group.position, 0xffdd44);
                }
              },
            },
          );
          // Trigger cast animation on the character model (Throw / Use_Item clip)
          player.triggerCast();
          // G3: zoom punch on spell cast (orthographic FOV-kick equivalent)
          cameraRig.punch(1.8, 0.18);
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
      abilities.update(dt);

      // 7a. Ability casting (Q/R/Z/X keys — one-shot edge detection)
      const _abCtx = {
        playerPos:   player.group.position,
        playerGroup: player.group,
        scene,
        camera:      cameraRig.camera,
        aimDir:      mouseWorld.clone().sub(player.group.position).setY(0).normalize(),
        progression,
        enemies:     (sceneManager.getActiveEnemies() as unknown as Array<{ worldPosition: THREE.Vector3; hp: number; takeDamage(d: number): void; isDead: boolean }>),
        playerHp:    player.health,
      };
      if (s.ability1) abilities.trycast(0, _abCtx);
      if (s.ability2) abilities.trycast(1, _abCtx);
      if (s.ability3) abilities.trycast(2, _abCtx);
      if (s.ability4) abilities.trycast(3, _abCtx);

      // 7c. Lighting + particle tick
      lighting.update(dt);
      particles.update(dt);

      // 7b. Death check
      if (player.health.hp <= 0 && !deathTriggered) {
        deathTriggered = true;
        player.triggerDeath();
        cameraRig.shake(0.25, 0.6); // big shake on player death
        const _floorDef = getFloorDef(sceneManager.currentFloor);
        const _floorLabel = _floorDef?.name
          ?? (sceneManager.currentFloor === 0 ? 'the Ground Floor'
            : sceneManager.currentFloor > 0 ? `Floor ${sceneManager.currentFloor}`
            : `the Basement`);
        deathScreen.setContext(_floorLabel, sceneManager.killCount, sceneManager.totalEnemies);
        deathScreen.show();
      }

      // 7c. Room-clear check + wave progress display (interior only)
      if (gameMode === 'interior') {
        const dead  = sceneManager.roomEnemiesDefeated;
        const total = sceneManager.totalEnemies;
        const isCleared = total > 0 && dead >= total && !sceneManager.waveInfo;
        if (isCleared && !wasRoomCleared) {
          const fl = sceneManager.currentFloor;
          const label = fl === 0 ? 'Ground Floor Cleared'
                      : fl  > 0 ? `Floor ${fl} Cleared`
                      :           `Basement ${Math.abs(fl)} Cleared`;
          victoryBanner.show(label);
          // B3: spawn heal orb at room centre
          _spawnHealOrb(scene, player, particles);
        }
        wasRoomCleared = isCleared;

        // B3: show wave progress in objective tracker for swarm rooms
        const wi = sceneManager.waveInfo;
        if (wi) {
          objTracker.setObjective(`Wave ${wi.current} of ${wi.total}`, 'Defeat all enemies to advance', false);
          objTracker.setProgress(dead, total, 'defeated');
        }
      }
      // B3: animate + pick up heal orbs each frame (interior only)
      if (gameMode === 'interior') _updateHealOrbs(dt, scene, player, particles);
    }

    // 8. Camera
    cameraRig.updateZoom(dt);
    cameraRig.follow(player.group.position, dt);
    // G2: update floating combat text + enemy health bars
    dmgNumbers.update();
    const activeEnemiesForBars = gameMode === 'interior'
      ? sceneManager.getActiveEnemies()
      : (overworld?.getActiveEnemies() ?? []);
    enemyBars.update(activeEnemiesForBars as unknown as Parameters<typeof enemyBars.update>[0], player.group.position);

    // XP — grant 20 XP per kill tracked this frame
    const currKillCount = sceneManager.killCount;
    if (currKillCount > prevKillCount) {
      progression.grantXP((currKillCount - prevKillCount) * 20);
      prevKillCount = currKillCount;

      // E1: track named elite kills for defeat_elite story beats
      // Scan enemies that just died this frame and collect their enemyId tags.
      for (const e of sceneManager.getActiveEnemies()) {
        if (e.isDead) {
          const eid = e.group.userData['enemyId'] as string | undefined;
          if (eid) _eliteEnemiesKilled.add(eid);
        }
      }
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

    // G2: Ability bar — update every frame (cooldowns need smooth countdown)
    hud.setAbilities(abilities.getAllSlotInfos(), abilities.mana.fraction);

    // Show resource + potion strips in exterior mode only
    if (gameMode === 'exterior') {
      hud.setResources(inventory.snapshot());
      hud.setConsumables({
        minorHealCount: consumables.getPotionCount('potion_heal_minor'),
        majorHealCount: consumables.getPotionCount('potion_heal_major'),
      });
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
      hud.setConsumables(null);
    }

    // Cooldown sweep overlays + countdown numbers for action bar slots
    const equippedIds = progression.getEquippedSlots();
    hud.setCooldowns(
      equippedIds.map(id => id ? spells.cooldownFraction(id) : null),
      equippedIds.map(id => id ? spells.cooldownRemaining(id) : null),
    );

    // Buff bar — tick and update
    consumables.tickBuffs();
    buffBar.update(consumables.activeBuffs);

    // Party strip — follower HP chips
    partyStrip.setMembers(
      party.members.map((m, idx) => ({
        name: `Follower ${idx + 1}`,
        icon: '🟣',
        hp: m.hp,
        maxHp: m.maxHp,
      })),
    );

    // 10. Render
    composer.render(dt);

    // 11. Creative mode per-frame update (dev only)
    if (import.meta.env.DEV) CreativeMode.update(dt);
  });
  // Game loop is started by MainMenu.onPlay — not here.
}

// Export the startup promise so unit tests can await full initialisation.
export const _startupComplete = main().catch(console.error);

// ── B3: Room-clear heal orb ───────────────────────────────────────────────────
// A floating golden sphere spawns at room centre when all enemies are defeated.
// Walking within 1.5u picks it up and restores 25% max HP.

const _healOrbs: Array<{ mesh: THREE.Mesh; t: number }> = [];

function _spawnHealOrb(
  scene: THREE.Scene,
  player: import('@/player/PlayerController').PlayerController,
  particles: import('@/rendering/ParticleSystem').ParticleSystem,
): void {
  const geo = new THREE.OctahedronGeometry(0.35, 0);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffdd44,
    emissive: new THREE.Color(0xffaa00),
    emissiveIntensity: 0.8,
    transparent: true, opacity: 0.92,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 1.0, 0);
  scene.add(mesh);
  _healOrbs.push({ mesh, t: 0 });
}

/** Call once per frame from within the game loop to animate + pick up orbs. */
function _updateHealOrbs(
  dt: number,
  scene: THREE.Scene,
  player: import('@/player/PlayerController').PlayerController,
  particles: import('@/rendering/ParticleSystem').ParticleSystem,
): void {
  for (let i = _healOrbs.length - 1; i >= 0; i--) {
    const orb = _healOrbs[i];
    orb.t += dt;
    // Float + spin
    orb.mesh.position.y = 1.0 + Math.sin(orb.t * 2.2) * 0.18;
    orb.mesh.rotation.y += dt * 1.8;
    // Pulse emissive
    (orb.mesh.material as THREE.MeshLambertMaterial).emissiveIntensity =
      0.6 + Math.sin(orb.t * 4.0) * 0.3;

    // Proximity pickup
    const dx = orb.mesh.position.x - player.group.position.x;
    const dz = orb.mesh.position.z - player.group.position.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.5) {
      const heal = Math.round(player.health.maxHp * 0.25);
      player.health.heal(heal);
      particles.burst(orb.mesh.position.clone(), 0xffdd44, 20, 3.0, 0.5);
      scene.remove(orb.mesh);
      orb.mesh.geometry.dispose();
      (orb.mesh.material as THREE.Material).dispose();
      _healOrbs.splice(i, 1);
    }
  }
}



