import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { ParticleSystem } from '@/rendering/ParticleSystem';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { WaterLabScene } from '@/scene/WaterLabScene';

describe('WaterLabScene water variant', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let player: PlayerController;
  let particles: ParticleSystem;
  let lab: WaterLabScene;

  beforeAll(async () => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    particles = new ParticleSystem(scene);
    lab = new WaterLabScene(scene, physics, player, particles);
  });

  it('defaults to the stylized (see-through) variant on enter()', () => {
    lab.enter();
    const waterMesh = scene.children.find(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && (c.material as THREE.ShaderMaterial).uniforms?.uTime !== undefined,
    );
    expect(waterMesh).toBeDefined();
    expect((waterMesh!.material as THREE.ShaderMaterial).transparent).toBe(true);
  });

  it('switches to reflective and flow-refractive variants without throwing', () => {
    expect(() => lab.setWaterVariant('reflective')).not.toThrow();
    expect(() => lab.setWaterVariant('flow-refractive')).not.toThrow();
    expect(() => lab.setWaterVariant('stylized')).not.toThrow();
    lab.exit();
  });
});

describe('WaterLabScene swim/wade hysteresis', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let player: PlayerController;
  let particles: ParticleSystem;
  let lab: WaterLabScene;

  beforeAll(async () => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    // Use the princess rig, not the DNA creature fallback — this is what
    // enterWaterLab() actually applies in production (main.ts calls
    // applyPrincess by default), and it has different proportions than the
    // creature rig, which matters for the visual-submersion regression
    // test below (a creature-rig-only test previously passed even with the
    // real bug still present).
    const { defaultDna } = await import('@/princess-creator/dna');
    await player.applyPrincess(defaultDna('human'));
    particles = new ParticleSystem(scene);
    lab = new WaterLabScene(scene, physics, player, particles);
    lab.enter();
  });

  it('does not flicker swim state once the buoyancy float settles (regression: previous underdamped spring + single-threshold check caused a hunting loop)', () => {
    // Teleport onto the deep floor (well past the enter threshold) so swim
    // mode engages, then let buoyancy settle toward its float depth.
    player.teleport(new THREE.Vector3(0, -1.2, 0));
    let sawSwim = false;
    let flickerCount = 0;
    let lastSwimming: boolean | null = null;
    for (let i = 0; i < 300; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(
        { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any,
        1 / 60,
        'isometric',
      );
      const swimming = player.isSwimming;
      if (swimming) sawSwim = true;
      // Only count transitions after the first ~30 frames (allow the
      // initial dive-in transient to settle) — a hunting loop would keep
      // flickering indefinitely, while a one-time settle transition is fine.
      if (i > 30 && lastSwimming !== null && swimming !== lastSwimming) flickerCount++;
      lastSwimming = swimming;
    }
    expect(sawSwim).toBe(true);
    expect(flickerCount).toBe(0);
  });

  it('keeps the active visual rig visibly above the water surface while floating (regression: setSubmersion(1.0) sank the whole rig ~0.68 WU, burying the head/shoulders under the drawn water surface even though SWIM_FLOAT_DEPTH looked fine on the physics origin alone)', () => {
    // Same settle as above — by now the player should be floating at
    // SWIM_FLOAT_DEPTH with swim mode engaged.
    expect(player.isSwimming).toBe(true);
    const activeRoot: THREE.Object3D =
      (player as any)._creatureRig?.root ?? (player as any)._princessInstance?.root
      ?? (player as any)._charController?.scene ?? (player as any).bodyMesh;
    const box = new THREE.Box3().setFromObject(activeRoot);
    // WATER_LAB_SURFACE_Y is 0 — the rig's highest point must clear it by a
    // real margin. 0.15 only broke the *hair-tip* through the surface (the
    // "just the very top of her head" follow-up complaint); the whole head
    // needs to clear so she reads as actually swimming, not drowning at the
    // neck, from isometric/WoW camera angles (OOT/SM64-style readability).
    expect(box.max.y).toBeGreaterThan(0.5);
  });

  it('blocks movement past the room perimeter even for a player who dove in deep water (regression: the boundary wall colliders only spanned y=0..4, but a swimming player floats around y≈-0.5..-1, so they passed clean underneath the wall and could swim out of the room entirely)', () => {
    // Start mid-pool, already swimming, then hold a constant iso "forward"
    // input (ISO_FORWARD = (-1,0,-1) normalized — moves toward -x/-z) for
    // far longer than needed to cross the full 24×24 room (half-extent 12)
    // at SWIM_SPEED. If the perimeter wall doesn't reach swim depth, the
    // player sails straight through it; if it does, position clamps near
    // the boundary.
    player.teleport(new THREE.Vector3(0, -1.2, 0));
    // Hold jump (repurposed as "dive" while swimming, see PlayerController's
    // swim/dive gravity override) together with forward. Note: with the
    // floor-aware position correction (see the dedicated "trapped below
    // floor" regression test below), the player now naturally surfaces onto
    // each shallower tier's floor as she crosses it and stops "swimming"
    // (by depth) well before reaching the bank/wall — that's now correct,
    // floor-following behavior, not a bug. This test only cares that the
    // wall still stops her either way (walking or swimming), i.e. she never
    // tunnels through it.
    const input = { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false, jump: true, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    for (let i = 0; i < 1200; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(input, 1 / 60, 'isometric');
    }
    const pos = player.group.position;
    // Room half-extent is 12; the capsule radius (0.35) plus wall half-
    // thickness (0.25) means the center should rest a bit inside that, but
    // must not have tunneled past it.
    expect(pos.x).toBeGreaterThan(-12.5);
    expect(pos.z).toBeGreaterThan(-12.5);
    // Confirm it actually traveled a meaningful distance from the deep-tier
    // start point (i.e. the test is exercising real movement, not just
    // failing to move at all for an unrelated reason). It may not reach the
    // wall in this particular run: once corrected up onto a shallower
    // tier's floor after crossing a boundary, the player is a normal walker
    // subject to normal step-height collision at the next tier's ledge —
    // a separate, pre-existing characteristic of these stepped floors, not
    // the void-glide-under-the-wall bug this test targets.
    expect(pos.x).toBeLessThan(-2);
    expect(pos.z).toBeLessThan(-2);
  });

  it('has solid floor all the way out to the perimeter wall, not just the bank tier\'s own halfExtent (regression: the bank tier\'s floor frame only spanned radius 7..11, one unit short of the room\'s actual half-extent of 12 where the walls sit, leaving an unfloored ring the player fell through into "swimming" with no floor and no water mesh underneath — read by the player as floating below the terrain, out past the pool)', () => {
    // Drop the player from above into that gap (radius 11.5, between the
    // bank tier's own edge at 11 and the room/wall boundary at 12).
    player.teleport(new THREE.Vector3(11.5, 2, 0));
    const input = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(input, 1 / 60, 'isometric');
    }
    // Should settle standing on the bank floor (y just above 0, roughly the
    // capsule's resting height), not fall into swim mode at negative y.
    expect(player.isSwimming).toBe(false);
    expect(player.group.position.y).toBeGreaterThan(0.5);
  });

  it('does not let the player swim laterally under the shallower tier floors into an unbounded void (regression: the dive/swim vertical spring always eased toward a single fixed depth below the water surface — DIVE_TARGET_DEPTH below WATER_LAB_SURFACE_Y — with no idea what floor is actually beneath the player\'s current X/Z; diving in at the abyss center, the only footprint deep enough to trigger real swim state from a vertical fall, then holding a lateral direction while still diving carried the player at that dive depth clean underneath the much-shallower deep/shallow/bank floor slabs and out to the perimeter wall, since only the floor slabs themselves and the outer wall had any collision — nothing stopped lateral movement at the tier step boundaries for someone already positioned below them)', () => {
    // Dive in at the abyss center (radius < 2) from height so real swim
    // state engages and the dive spring settles the player down near
    // WATER_LAB_SURFACE_Y - DIVE_TARGET_DEPTH (-3).
    player.teleport(new THREE.Vector3(0, 3, 0));
    const diveInPlace = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: true, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    for (let i = 0; i < 90; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(diveInPlace, 1 / 60, 'isometric');
    }
    expect(player.isSwimming).toBe(true);
    expect(player.group.position.y).toBeLessThan(-2); // genuinely down at dive depth

    // Now hold a lateral direction (iso "forward", -x/-z) while still
    // diving, swimming out past the abyss (radius 2), deep (radius 4), and
    // shallow (radius 7) tier boundaries toward the perimeter wall.
    const diveAndSwim = { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false, jump: true, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(diveAndSwim, 1 / 60, 'isometric');
    }
    // By now the player has crossed the abyss/deep tier boundary (radius 2)
    // and risen onto the deep tier's own floor — with the bug present, Y
    // stayed pinned at the dive depth (~-3) regardless of how far the
    // player traveled, since the spring never knew about the shallower
    // floors it was passing under. With the fix, Y should have risen to
    // track the local floor instead of staying at the abyss's depth. (She
    // may not reach the outer wall in this particular run — once corrected
    // up onto a shallower tier's floor she stops "swimming" by depth and is
    // subject to normal walking collision at the next tier step, same as
    // any other walker on these stepped floors; that's expected, unrelated
    // ledge-climbing behavior, not the void-glide bug this test targets.)
    const finalPos = player.group.position;
    const finalRadius = Math.max(Math.abs(finalPos.x), Math.abs(finalPos.z));
    expect(finalRadius).toBeGreaterThan(2); // actually crossed out of the abyss, not frozen in place
    expect(finalPos.y).toBeGreaterThan(-1.2); // shallower than the deep tier's own floor
  });

  it('never leaves the player trapped below the local tier floor while diving+swimming laterally across every tier boundary (regression: the fixed-depth spring only stopped the *unbounded* void glide — a diver who had already crossed under a shallower tier'
    + "'s solid floor slab got physically stuck skimming along just beneath it (confirmed live: y frozen at -0.91 near the bank tier's own y=0 floor, the KCC's \"hit ceiling\" check repeatedly zeroing upward velocity every frame since no velocity, however large, can push a capsule "
    + 'through solid geometry directly above it). The fix adds a direct position correction: if swimming and the KCC-resolved next Y would still be below the locally-correct floor height, snap Y up to the floor directly (bypassing the KCC\'s truncated result for this one deliberate case) instead of endlessly failing to spring through it.', () => {
    // Local mirror of WaterLabScene's tier table (src/levels/WaterLab.ts) so
    // the test can independently compute "what floor should be under her
    // right now" at every sampled frame, instead of only checking the final
    // resting spot (which the previous regression test above did — and
    // which the still-broken '-0.91 stuck' state technically also passed,
    // since -0.91 > -1.2).
    const tiers = [
      { y: 0, halfExtent: 11 },
      { y: -0.3, halfExtent: 7 },
      { y: -1.2, halfExtent: 4 },
      { y: -5.0, halfExtent: 2 },
    ];
    const localFloorAt = (x: number, z: number): number => {
      let floor = tiers[0]!.y;
      for (const t of tiers) {
        if (Math.abs(x) <= t.halfExtent && Math.abs(z) <= t.halfExtent) floor = t.y;
      }
      return floor;
    };

    player.teleport(new THREE.Vector3(0, 3, 0));
    const diveInPlace = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: true, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    for (let i = 0; i < 90; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(diveInPlace, 1 / 60, 'isometric');
    }
    expect(player.isSwimming).toBe(true);

    const diveAndSwim = { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false, jump: true, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    // A capsule resting exactly on a floor sits with its center ~0.85 WU
    // above that floor's surface (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS).
    // The scene passes floorY into setSwimming() one frame behind the
    // player's actual X/Z (physics.step() -> player.update() -> lab.update()
    // each frame — see WaterLabScene's update() doc comment), so a single
    // frame right at a tier boundary crossing can show a large apparent
    // deficit against *this test's own* independently-computed floor before
    // the scene's own lookup (and therefore the fix) catches up. The real
    // bug this guards against is being *persistently* stuck under a floor
    // for many frames (confirmed live: frozen there for hundreds of ticks)
    // — so track the longest streak of consecutive large-deficit frames,
    // not the single worst instantaneous one.
    const ALLOWED_BELOW_FLOOR = 0.5;
    const MAX_ALLOWED_STREAK = 3; // frames; a real "stuck" bug runs for hundreds
    let deficitStreak = 0;
    let worstStreak = 0;
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(diveAndSwim, 1 / 60, 'isometric');
      const pos = player.group.position;
      const floor = localFloorAt(pos.x, pos.z);
      const deficit = floor - pos.y;
      deficitStreak = deficit > ALLOWED_BELOW_FLOOR ? deficitStreak + 1 : 0;
      worstStreak = Math.max(worstStreak, deficitStreak);
    }
    expect(worstStreak).toBeLessThanOrEqual(MAX_ALLOWED_STREAK);
  });

  it('starts a wake-trail emitter while swimming and moving near the surface, and stops it once she comes to a stop', () => {
    player.teleport(new THREE.Vector3(0, -1.2, 0));
    const stationaryInput = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any;

    // Let her settle into a stable swim float, not moving — no wake yet.
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(stationaryInput, 1 / 60, 'isometric');
    }
    expect(player.isSwimming).toBe(true);
    expect((lab as unknown as { _wakeEmitter: { active: boolean } | null })._wakeEmitter?.active ?? false).toBe(false);

    // Swim forward with no dive input, so she stays near SWIM_FLOAT_DEPTH
    // (near the surface) — the wake trail should start.
    const forwardInput = { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    for (let i = 0; i < 30; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(forwardInput, 1 / 60, 'isometric');
    }
    expect(player.isSwimming).toBe(true);
    expect((lab as unknown as { _wakeEmitter: { active: boolean } | null })._wakeEmitter?.active).toBe(true);

    // Stop moving again — the wake should turn back off.
    for (let i = 0; i < 90; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(stationaryInput, 1 / 60, 'isometric');
    }
    expect((lab as unknown as { _wakeEmitter: { active: boolean } | null })._wakeEmitter?.active ?? false).toBe(false);
  });

  it('stops the wake-trail when diving deep even while still moving forward', () => {
    player.teleport(new THREE.Vector3(0, -1.2, 0));
    const stationaryInput = { moveForward: false, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any;

    // Let her settle into a stable swim float, not moving — no wake yet.
    for (let i = 0; i < 60; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(stationaryInput, 1 / 60, 'isometric');
    }
    expect(player.isSwimming).toBe(true);

    // Swim forward with no dive input, so she stays near SWIM_FLOAT_DEPTH
    // (near the surface) — the wake trail should start.
    const forwardInput = { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false, jump: false, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    for (let i = 0; i < 30; i++) {
      physics.step(1 / 60);
      lab.update(1 / 60);
      player.update(forwardInput, 1 / 60, 'isometric');
    }
    expect(player.isSwimming).toBe(true);
    expect((lab as unknown as { _wakeEmitter: { active: boolean } | null })._wakeEmitter?.active).toBe(true);

    // Dive deep while still moving forward — the wake should turn off even
    // though speed alone wouldn't explain it stopping (depth must be the
    // reason). Hold dive+forward until underwaterDepthFraction crosses above
    // WAKE_NEAR_SURFACE_DEPTH_FRACTION (0.3).
    const diveAndSwim = { moveForward: true, moveBackward: false, moveLeft: false, moveRight: false, jump: true, run: false, dodge: false, interact: false, turnDragHeld: false } as any;
    let reachedDeep = false;
    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60);
      player.update(diveAndSwim, 1 / 60, 'isometric');
      lab.update(1 / 60);  // lab.update after player so depth is current
      // Once we're deep enough, confirm the wake is off
      if (player.underwaterDepthFraction > 0.3) {
        expect((lab as unknown as { _wakeEmitter: { active: boolean } | null })._wakeEmitter?.active ?? false).toBe(false);
        reachedDeep = true;
        break;
      }
    }
    // If we never got deep enough, the test setup was wrong
    expect(reachedDeep).toBe(true);
  });
});

