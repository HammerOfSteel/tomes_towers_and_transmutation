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
import { EditMode } from '@/editor/EditMode';
import { ProgressionSystem } from '@/progression/ProgressionSystem';
import { BookReader } from '@/interactables/BookReader';
import { InteractableSystem } from '@/interactables/InteractableSystem';

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
  sceneManager.loadRoomImmediate('cell_start');

  // ── Level editor ──────────────────────────────────────────────────────────
  const editMode = new EditMode(scene, cameraRig.camera, physics, sceneManager);

  // ── Progression & interactables ───────────────────────────────────────────
  const progression   = new ProgressionSystem();
  const bookReader    = new BookReader();
  const interactables = new InteractableSystem(progression, bookReader);

  // ── Pause menu ───────────────────────────────────────────────────────────
  const pauseMenu = new PauseMenu({
    onOpenEditor: () => editMode.toggle(),
  });

  // ── Main menu (shown at startup; starts the game loop on Play) ────────────
  const mainMenu = new MainMenu({
    onPlay: () => gameLoop.start(),
  });
  // ── Centralised key routing ──────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    // Ignore all game key routing while the main menu is visible
    if (mainMenu.isVisible) return;

    if (e.key === 'Escape') {
      if (bookReader.isOpen) {
        bookReader.close();         // close book → game
      } else if (editMode.isActive) {
        editMode.toggle();          // close editor → game
      } else if (pauseMenu.isOpen) {
        pauseMenu.close();          // close menu → game
      } else {
        pauseMenu.open();           // game → menu
      }
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

  // ── HUD ───────────────────────────────────────────────────────────────────
  const hud = new HUD();

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

    // 2-7. Game simulation — paused while the level editor or pause menu is open
    if (!editMode.isActive && !pauseMenu.isOpen) {
      // 2. Player movement
      player.update(input.state, dt);

      // 3. Update mouse world position for spell aim
      const s = input.state;
      mouseNDC.set(s.mouseX, s.mouseY);
      raycaster.setFromCamera(mouseNDC, cameraRig.camera);
      raycaster.ray.intersectPlane(floorPlane, mouseWorld);

      // 4. Room manager — enemy AI + door trigger checks
      sceneManager.update(dt, player.group.position);
      const enemies = sceneManager.getActiveEnemies();

      // 4b. Interactable proximity detection
      interactables.update(player.group.position, sceneManager.getActiveInteractables());

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

      // 6. Spell / interact (E key — context-sensitive: read nearby item OR cast spell)
      spellCooldown = Math.max(0, spellCooldown - dt);
      const spellJustPressed = s.interact && !lastSpellInput;
      lastSpellInput = s.interact;
      if (spellJustPressed) {
        // Priority: read interactable first; fall back to casting if nothing nearby
        const didRead = !bookReader.isOpen && interactables.tryRead();
        if (!didRead && spellCooldown <= 0) {
          spellCooldown = 0.6;
          spells.fire(player.group.position, mouseWorld, enemies, scene);
        }
      }

      // 7. Combat tick (expire arcs / projectiles)
      combat.update(dt, scene);
      spells.update(dt, scene);
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
      progression.getUnlockedSpells(),
    );

    // 10. Render
    renderer.render(scene, cameraRig.camera);
  });
  // Game loop is started by MainMenu.onPlay — not here.
}

main().catch(console.error);


