import * as THREE from 'three';
import { GameLoop } from '@/core/GameLoop';
import { InputManager } from '@/core/InputManager';
import { CameraRig } from '@/core/CameraRig';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { createFloor } from '@/scene/createFloor';
import { createObstacles } from '@/scene/createObstacles';
import { CombatSystem } from '@/combat/CombatSystem';
import { SpellSystem } from '@/combat/SpellSystem';
import { SlimeEnemy, SLIME_SPAWN_POSITIONS } from '@/enemy/SlimeEnemy';
import { HUD } from '@/ui/HUD';

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
  const { mesh: floorMesh } = createFloor(50, physics);
  scene.add(floorMesh);

  // ── Obstacles ─────────────────────────────────────────────────────────────
  const obstacles = createObstacles(physics);
  obstacles.forEach((m) => scene.add(m));

  // ── Player ────────────────────────────────────────────────────────────────
  const player = new PlayerController(physics, new THREE.Vector3(0, 1.5, 0));
  scene.add(player.shadow);
  scene.add(player.group);

  // ── Enemies ───────────────────────────────────────────────────────────────
  const slimes = SLIME_SPAWN_POSITIONS.map((pos) => {
    const s = new SlimeEnemy(pos, physics, (dmg) => {
      player.health.takeDamage(dmg);
    });
    scene.add(s.group);
    return s;
  });

  // ── Combat systems ─────────────────────────────────────────────────────────
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

    // 2. Player movement
    player.update(input.state, dt);

    // 3. Update mouse world position for spell aim
    const s = input.state;
    mouseNDC.set(s.mouseX, s.mouseY);
    raycaster.setFromCamera(mouseNDC, cameraRig.camera);
    raycaster.ray.intersectPlane(floorPlane, mouseWorld);

    // 4. Melee attack (mouse button 0, 0.4s cooldown)
    meleeCooldown = Math.max(0, meleeCooldown - dt);
    const attackJustPressed = s.attack && !lastAttackInput;
    lastAttackInput = s.attack;
    if (attackJustPressed && meleeCooldown <= 0) {
      meleeCooldown = 0.4;
      const meleeAngle = Math.atan2(
        mouseWorld.x - player.group.position.x,
        mouseWorld.z - player.group.position.z,
      );
      combat.triggerMelee(player.group.position, meleeAngle, slimes, scene);
    }

    // 5. Spell (right-click / 'E' remapped — here we use E key via interact)
    spellCooldown = Math.max(0, spellCooldown - dt);
    const spellJustPressed = s.interact && !lastSpellInput;
    lastSpellInput = s.interact;
    if (spellJustPressed && spellCooldown <= 0) {
      spellCooldown = 0.6;
      spells.fire(player.group.position, mouseWorld, slimes, scene);
    }

    // 6. Enemy AI
    const playerPos = player.group.position;
    slimes.forEach((sl) => sl.update(playerPos, dt));

    // 7. Combat tick (expire arcs / projectiles)
    combat.update(dt, scene);
    spells.update(dt, scene);

    // 8. Camera
    cameraRig.follow(player.group.position);

    // 9. HUD
    const kills = slimes.filter((sl) => sl.isDead).length;
    hud.update(player.health.hp, player.health.maxHp, kills, slimes.length);

    // 10. Render
    renderer.render(scene, cameraRig.camera);
  });
  gameLoop.start();
}

main().catch(console.error);


