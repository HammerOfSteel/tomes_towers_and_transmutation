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
import { OverworldScene } from '@/scene/OverworldScene';
import { PartyManager } from '@/combat/PartyManager';

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
  // Initial room load: generate a fresh dungeon with a random seed.
  let currentSeed = Math.floor(Math.random() * 0xFFFF_FFFF);
  const _initialPlan = generateDungeon(currentSeed, 1);
  sceneManager.loadDungeon(_initialPlan);

  // ── Scene mode (interior ↔ exterior) ─────────────────────────────────
  let gameMode: 'interior' | 'exterior' = 'interior';
  let overworld: OverworldScene | null = null;
  const party = new PartyManager(5);

  function switchToExterior(): void {
    if (!overworld) {
      overworld = new OverworldScene(scene, physics, player, currentSeed);
    }
    gameMode = 'exterior';
    overworld.enter();
    // Spawn the player just in front of the tower entrance
    player.teleport(new THREE.Vector3(0, 1.5, 4));
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
  const bookReader    = new BookReader();
  const interactables = new InteractableSystem(progression, bookReader);

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
      for (const id of ['magic_bolt', 'flame_dart']) progression.grantSpell(id);
    },
    onKillAll:   () => {
      sceneManager.getActiveEnemies().forEach(e => {
        if (!e.isDead) e.health.takeDamage(9999);
      });
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
  const mainMenu = new MainMenu({
    onPlay: () => {
      // Generate a new dungeon + fresh world each time the player presses Play.
      currentSeed = Math.floor(Math.random() * 0xFFFF_FFFF);
      overworld?.dispose();
      overworld = null;
      gameMode = 'interior';
      scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
      const plan = generateDungeon(currentSeed, 1);
      sceneManager.loadDungeon(plan);
      gameLoop.start();
    },
  });
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
      } else if (pauseMenu.isOpen) {
        pauseMenu.close();          // close menu → game
      } else {
        pauseMenu.open();           // game → menu
      }
    } else if (e.key === 'k' || e.key === 'K') {
      if (!pauseMenu.isOpen && !editMode.isActive) spellBook.toggle();
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
  });

  // ── Game loop ─────────────────────────────────────────────────────────────
  const gameLoop = new GameLoop();
  gameLoop.onTick((dt) => {
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
      }
      const enemies = gameMode === 'interior'
        ? sceneManager.getActiveEnemies()
        : (overworld?.getActiveEnemies() ?? []);

      // 4b. Interactable proximity detection (interior only)
      if (gameMode === 'interior') {
        interactables.update(player.group.position, sceneManager.getActiveInteractables());
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
      if (interactJustPressed && !bookReader.isOpen) {
        if (gameMode === 'interior') {
          interactables.tryRead();
        } else if (overworld) {
          // Spare nearby fleeing enemy first
          const nearFlee = overworld.getActiveEnemies().find(
            (en) => !en.isDead && en.isRecruitable
              && en.worldPosition.distanceTo(player.group.position) < 2.5,
          );
          if (nearFlee) {
            if (!party.isFull) {
              party.recruit(nearFlee);
            }
          } else if (overworld.nearTowerEntrance(player.group.position)) {
            switchToInterior();
          } else {
            const bld = overworld.nearBuilding(player.group.position);
            if (bld) {
              // Load a separate dungeon for the building (XOR seed for variety)
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

      // 6b. Right-click → cast active equipped spell
      spellCooldown = Math.max(0, spellCooldown - dt);
      const castJustPressed = s.castSpell && !lastCastInput;
      lastCastInput = s.castSpell;
      if (castJustPressed && spellCooldown <= 0) {
        const activeSpell = progression.getEquippedSlot(s.activeSlot);
        if (activeSpell && progression.isSpellUnlocked(activeSpell)) {
          spellCooldown = 0.5;
          spells.fire(player.group.position, mouseWorld, enemies, scene, undefined, activeSpell);
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

    // 9. HUD
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
    );

    // 10. Render
    renderer.render(scene, cameraRig.camera);
  });
  // Game loop is started by MainMenu.onPlay — not here.
}

main().catch(console.error);


