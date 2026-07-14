import * as THREE from 'three';
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
import { DeathScreen } from '@/ui/DeathScreen';
import { VictoryBanner } from '@/ui/VictoryBanner';
import { EditMode } from '@/editor/EditMode';
import { ProgressionSystem } from '@/progression/ProgressionSystem';
import { BookReader } from '@/interactables/BookReader';
import { InteractableSystem } from '@/interactables/InteractableSystem';
import { SpellBook } from '@/ui/SpellBook';
import { DevPanel } from '@/ui/DevPanel';
import { generateDungeon } from '@/levels/DungeonGenerator';
import { generateTower } from '@/levels/TowerGenerator';
import { getFloorDef } from '@/levels/TowerFloorDef';
import { TelescopeView } from '@/ui/TelescopeView';
import { OverworldScene } from '@/scene/OverworldScene';
import { PartyManager } from '@/combat/PartyManager';
import { TamingGame } from '@/interactables/TamingGame';
import { generateGreenhouse } from '@/levels/GreenhouseGenerator';
import { TalentSystem } from '@/progression/TalentSystem';
import { TalentTree } from '@/ui/TalentTree';
import { StatPanel } from '@/ui/StatPanel';
import { LevelUpBanner } from '@/ui/LevelUpBanner';

async function main() {
  // ── Renderer ───────────────────────────────────────────────────────────────
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ── Scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);
  scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);

  // ── Camera (isometric) ────────────────────────────────────────────────────
  const cameraRig = new CameraRig(window.innerWidth / window.innerHeight);

  // ── Physics ────────────────────────────────────────────────────────────────
  const physics = new PhysicsWorld();
  await physics.init();

  // ── Input ──────────────────────────────────────────────────────────────────
  const input = new InputManager();

  // ── Lighting ──────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff5e0, 1.0);
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
  // Initial room load: generate the tower with a random seed.
  let currentSeed = Math.floor(Math.random() * 0xFFFF_FFFF);
  const _initialPlan = generateTower(currentSeed);
  sceneManager.loadDungeon(_initialPlan);

  // ── Scene mode (interior ↔ exterior ↔ telescope) ──────────────────
  let gameMode: 'interior' | 'exterior' | 'telescope' = 'interior';
  let overworld: OverworldScene | null = null;
  const party = new PartyManager(5);
  const tamingGame = new TamingGame(scene, cameraRig.camera);

  function switchToExterior(): void {
    // MUST unload dungeon first — onExitTrigger fires directly without
    // going through executeRoomSwap, so the room geometry + physics bodies
    // would otherwise stay in the scene and interfere with the overworld.
    sceneManager.unloadCurrentRoom();
    if (!overworld) {
      overworld = new OverworldScene(scene, physics, player, currentSeed);
    }
    gameMode = 'exterior';
    overworld.enter();
    // Spawn just south of the tower door, high enough that the KCC capsule
    // starts above the heightfield surface and falls cleanly to ground.
    player.teleport(new THREE.Vector3(0, 1.5, 8));
    // Widen fog for the open world
    scene.fog = new THREE.Fog(0x0a1408, 60, 180);
  }

  function switchToInterior(roomId?: string): void {
    overworld?.exit();
    gameMode = 'interior';
    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60); // restore dungeon fog
    sceneManager.loadRoomImmediate(roomId ?? sceneManager.startRoomId ?? 'cell_start');
  }

  sceneManager.onExitTrigger = () => switchToExterior();

  // ── Level editor ──────────────────────────────────────────────────────────
  const editMode = new EditMode(scene, cameraRig.camera, physics, sceneManager);

  // ── Progression & interactables ───────────────────────────────────────────
  const progression   = new ProgressionSystem();
  const talentSystem  = new TalentSystem();
  const talentTree    = new TalentTree();
  const statPanel     = new StatPanel();
  const levelUpBanner = new LevelUpBanner();

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
      overworld = new OverworldScene(scene, physics, player, currentSeed);
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

  // ── Dev panel ───────────────────────────────────────────────────────────
  const devPanel = new DevPanel({
    getGodMode:  () => player.health.godMode,
    onGodMode:   (v) => { player.health.godMode = v; },
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
      for (const id of ['magic_bolt', 'flame_dart', 'intimidate']) progression.grantSpell(id);
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
  });

  // ── Spell book ──────────────────────────────────────────────────────────
  const spellBook = new SpellBook(progression);

  // ── Pause menu ───────────────────────────────────────────────────────────
  const pauseMenu = new PauseMenu({
    onOpenEditor: () => editMode.toggle(),
    onOpenDevPanel: () => devPanel.open(),
  });

  // ── Main menu (shown at startup; starts the game loop on Play) ────────────
  /** Shared start-game logic — called by main menu onPlay and by tests. */
  function startGame(seed?: number): void {
    currentSeed = seed ?? Math.floor(Math.random() * 0xFFFF_FFFF);
    overworld?.dispose();
    overworld = null;
    gameMode = 'interior';
    scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
    const plan = generateTower(currentSeed);
    sceneManager.resetCleared();
    sceneManager.loadDungeon(plan);
    prevKillCount = 0; // reset XP kill tracker on new game
    gameLoop.start();
  }

  /** XP kill tracker — grants XP for each new kill registered. */
  let prevKillCount = 0;

  const mainMenu = new MainMenu({
    onPlay: () => startGame(),
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
    }
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
  let spellCooldown = 0;
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
    cameraRig.resize(window.innerWidth / window.innerHeight);
    telescopeView.updateAspect(window.innerWidth, window.innerHeight);
  });

  // ── Game loop ─────────────────────────────────────────────────────────────
  const gameLoop = new GameLoop();
  gameLoop.onTick((dt) => {
    // ── Telescope remote-view mode — skip all game simulation ──────────────
    if (gameMode === 'telescope') {
      telescopeView.update(dt);
      renderer.render(scene, telescopeView.camera);
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

      // 4. Room manager / overworld — enemy AI + door trigger checks
      if (gameMode === 'interior') {
        sceneManager.update(dt, player.group.position);
      } else if (overworld) {
        overworld.update(dt);
        party.pruneDead();
        tamingGame.update(dt);

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
          const _bld = overworld.nearBuilding(_pos);
          _setExteriorPrompt(_bld ? _bld.label : null);
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

      // 6b. Right-click → cast active equipped spell
      spellCooldown = Math.max(0, spellCooldown - dt);
      const castJustPressed = s.castSpell && !lastCastInput;
      lastCastInput = s.castSpell;
      if (castJustPressed && spellCooldown <= 0) {
        const activeSpell = progression.getEquippedSlot(s.activeSlot);
        if (activeSpell && progression.isSpellUnlocked(activeSpell)) {
          spellCooldown = 0.5;
          if (activeSpell === 'intimidate') {
            // AOE fear — instantly force all nearby living enemies to flee
            const INTIMIDATE_RANGE = 30;
            enemies.forEach(e => {
              if (!e.isDead && e.worldPosition
                  && e.worldPosition.distanceTo(player.group.position) <= INTIMIDATE_RANGE) {
                e.forceFlee();
              }
            });
          } else {
            spells.fire(player.group.position, mouseWorld, enemies, scene, undefined, activeSpell);
          }
        }
      }

      // 7. Combat tick (expire arcs / projectiles)
      combat.update(dt, scene);
      spells.update(dt, scene);

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

    // 10. Render
    renderer.render(scene, cameraRig.camera);
  });
  // Game loop is started by MainMenu.onPlay — not here.
}

main().catch(console.error);


