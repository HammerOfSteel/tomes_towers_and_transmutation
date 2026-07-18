/**
 * AbilitySystem — active species ability framework.
 *
 * Phase D1/D6.
 *
 * Abilities are distinct from collectible Spells:
 *   • Spells are earned items (magic_bolt, nova_burst …) on slots 1–5 (mouse).
 *   • Abilities are species-specific powers on slots Q/R/Z/X (keyboard).
 *   • Abilities share a separate Mana pool that regenerates over time.
 *
 * Architecture:
 *   AbilitySystem
 *     ├── ManaPool           — current/max mana, regen
 *     ├── Ability[]          — definitions: id, cooldown, manaCost, cast()
 *     ├── slots[0..3]        — equipped ability ids (Q, R, Z, X)
 *     └── cooldownMap        — per-ability remaining cooldown seconds
 *
 * Usage (main.ts game loop):
 *   abilities.update(dt);                            // regen + cooldowns
 *   if (input.ability1) abilities.trycast(0, ctx);  // Q
 *   if (input.ability2) abilities.trycast(1, ctx);  // R
 *
 * Usage (HUD):
 *   abilities.getSlotInfo(i)  → { id, name, icon, cdRemaining, cdTotal, manaCost, canCast }
 */

import * as THREE from 'three';
import type { ProgressionSystem } from '@/progression/ProgressionSystem';
import type { CharacterId } from '@/scene/CharacterDecisionTree';

// ── AbilityCastContext ────────────────────────────────────────────────────────

/** Everything a cast() function can access. */
export interface AbilityCastContext {
  /** Player world position (reference — do not mutate). */
  playerPos:   THREE.Vector3;
  /** Player THREE.Group (for positioning effects relative to player). */
  playerGroup: THREE.Group;
  /** The THREE.Scene — add VFX objects here. */
  scene:       THREE.Scene;
  /** Camera — for world/screen conversions. */
  camera:      THREE.Camera;
  /** Mouse aim direction (normalised, projected onto the ground plane). */
  aimDir:      THREE.Vector3;
  /** Progression for reading stat modifiers (read-only). */
  progression: ProgressionSystem;
  /** Damageable enemies in the current room. Exclude dead ones in cast(). */
  enemies:     Array<{ worldPosition: THREE.Vector3; hp: number; takeDamage(d: number): void; isDead: boolean }>;
  /** Player HP system. */
  playerHp:    { takeDamage(d: number): void; heal(d: number): void; hp: number; maxHp: number };
}

// ── Ability definition ────────────────────────────────────────────────────────

export interface Ability {
  id:          string;
  name:        string;
  description: string;
  /** Unicode character or short text shown in the HUD glyph. */
  icon:        string;
  /** Seconds before this ability can be used again. */
  cooldown:    number;
  /** Mana cost deducted on successful cast. */
  manaCost:    number;
  /** Execute the ability. Called only after mana + cooldown checks pass. */
  cast(ctx: AbilityCastContext): void;
}

// ── ManaPool ──────────────────────────────────────────────────────────────────

export class ManaPool {
  private _current: number;
  private _max:     number;
  private _regen:   number; // per second

  constructor(max = 100, regenPerSec = 8) {
    this._max     = max;
    this._current = max;
    this._regen   = regenPerSec;
  }

  get current(): number { return this._current; }
  get max():     number { return this._max; }
  get fraction(): number { return this._current / this._max; }

  tick(dt: number): void {
    this._current = Math.min(this._max, this._current + this._regen * dt);
  }

  /** @returns true if deducted, false if insufficient. */
  spend(amount: number): boolean {
    if (this._current < amount) return false;
    this._current -= amount;
    return true;
  }

  refill(amount: number): void {
    this._current = Math.min(this._max, this._current + amount);
  }

  setMax(newMax: number): void {
    this._max     = newMax;
    this._current = Math.min(this._current, newMax);
  }
}

// ── AbilitySystem ─────────────────────────────────────────────────────────────

const MAX_SLOTS = 4;

export interface AbilitySlotInfo {
  id:          string | null;
  name:        string;
  icon:        string;
  cdRemaining: number;  // 0 = ready
  cdTotal:     number;
  manaCost:    number;
  canCast:     boolean;
}

export class AbilitySystem {
  readonly mana = new ManaPool();

  private readonly _abilities = new Map<string, Ability>();
  private readonly _slots:     Array<string | null> = Array(MAX_SLOTS).fill(null);
  private readonly _cooldowns  = new Map<string, number>();

  /** Called once per frame. */
  update(dt: number): void {
    this.mana.tick(dt);
    for (const [id, cd] of this._cooldowns) {
      this._cooldowns.set(id, Math.max(0, cd - dt));
    }
  }

  // ── Registry ───────────────────────────────────────────────────────────────

  register(ability: Ability): void {
    this._abilities.set(ability.id, ability);
    this._cooldowns.set(ability.id, 0);
  }

  /** Equip an ability into a slot (0–3 = Q R Z X). */
  equip(abilityId: string, slot: number): void {
    if (slot < 0 || slot >= MAX_SLOTS) return;
    this._slots[slot] = abilityId;
  }

  /** Remove the ability in `slot`. */
  unequip(slot: number): void {
    if (slot >= 0 && slot < MAX_SLOTS) this._slots[slot] = null;
  }

  // ── Casting ────────────────────────────────────────────────────────────────

  /**
   * Try to cast the ability in `slot`.
   * @returns `'ok'` on success, or a reason string on failure.
   */
  trycast(slot: number, ctx: AbilityCastContext): 'ok' | 'no_ability' | 'cooldown' | 'no_mana' {
    const id = this._slots[slot];
    if (!id) return 'no_ability';
    const ab = this._abilities.get(id);
    if (!ab) return 'no_ability';

    const cd = this._cooldowns.get(id) ?? 0;
    if (cd > 0) return 'cooldown';

    if (!this.mana.spend(ab.manaCost)) return 'no_mana';

    this._cooldowns.set(id, ab.cooldown);
    ab.cast(ctx);
    return 'ok';
  }

  // ── HUD info ───────────────────────────────────────────────────────────────

  getSlotInfo(slot: number): AbilitySlotInfo {
    const id = this._slots[slot] ?? null;
    const ab = id ? this._abilities.get(id) : undefined;
    if (!ab || !id) {
      return { id: null, name: '—', icon: '○', cdRemaining: 0, cdTotal: 0, manaCost: 0, canCast: false };
    }
    const cd = this._cooldowns.get(id) ?? 0;
    return {
      id,
      name:        ab.name,
      icon:        ab.icon,
      cdRemaining: cd,
      cdTotal:     ab.cooldown,
      manaCost:    ab.manaCost,
      canCast:     cd <= 0 && this.mana.current >= ab.manaCost,
    };
  }

  getAllSlotInfos(): AbilitySlotInfo[] {
    return Array.from({ length: MAX_SLOTS }, (_, i) => this.getSlotInfo(i));
  }
}

// ── Species Passives ──────────────────────────────────────────────────────────

/**
 * Apply the species-specific passive effect on each frame.
 * Call from the game loop AFTER the player's HP and kills have been updated.
 */
export interface SpeciesPassiveContext {
  hp:          { hp: number; maxHp: number; godMode: boolean };
  killsThisTick: number;   // enemies killed this frame (for kill-on-hit effects)
  mana:        ManaPool;
  progression: ProgressionSystem;
}

export type SpeciesPassive = (ctx: SpeciesPassiveContext) => void;

/** Returns the passive function for the character's species, or a no-op. */
export function getSpeciesPassive(characterId: CharacterId): SpeciesPassive {
  const id = characterId.toLowerCase();

  // ── Human — Iron Will ──────────────────────────────────────────────────────
  // Damage reduction at ≤ 25% HP is applied at the HealthComponent level
  // by checking `hasIronWill` on each takeDamage call.
  // This passive just stores the flag; PlayerController reads it.
  if (id.startsWith('human') || id === 'rogue' || id === 'rogue_hooded' || id === 'mage') {
    return (_ctx) => { /* Iron Will is handled in HealthComponent directly */ };
  }

  // ── Undead — Undying Hunger ────────────────────────────────────────────────
  // On kill, restore 5% max HP.
  if (id.startsWith('undead') || id === 'skeleton_mage' || id === 'skeleton_rogue' ||
      id === 'zombie' || id === 'ghost' || id === 'mystery_undead') {
    return (ctx) => {
      if (ctx.killsThisTick > 0) {
        const healAmt = Math.ceil(ctx.hp.maxHp * 0.05) * ctx.killsThisTick;
        // Exposed through mana refill as a proxy; real heal via playerHp in main
        ctx.mana.refill(healAmt * 0.5); // small mana reward too
      }
    };
  }

  // ── Vulperia — Predator's Eye ──────────────────────────────────────────────
  // First hit on each new enemy always crits.
  // Implemented in CombatSystem via a flag: hasPredatorsEye.
  if (id.startsWith('fox')) {
    return (_ctx) => { /* Predator's Eye is handled in CombatSystem */ };
  }

  // ── Slime — Amorphous ─────────────────────────────────────────────────────
  // Knockback immunity; 15% reduced fall damage.
  // Implemented in PlayerController physics: skipKnockback if hasAmorphous.
  if (id.startsWith('slime')) {
    return (_ctx) => { /* Amorphous is handled in PlayerController */ };
  }

  return (_ctx) => {};
}

// ── Alpha ability registry ────────────────────────────────────────────────────

const _scratchV = new THREE.Vector3();

// ── Universal movement abilities (Z / X slots for all species) ───────────────

/**
 * Blink — teleport 8u in the aim direction with a Spawn_Air landing animation.
 * Uses the `triggerSpawnAir()` method on the player if it exposes one.
 */
export const ABILITY_BLINK: Ability = {
  id:          'blink',
  name:        'Blink',
  description: 'Teleport 8 units in the aim direction. Plays the Spawn_Air arrival animation at the destination.',
  icon:        '✦',
  cooldown:    8,
  manaCost:    35,
  cast(ctx) {
    const BLINK_DIST = 8;
    const dir = ctx.aimDir.clone().setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    dir.normalize();

    const dest = ctx.playerPos.clone().add(dir.multiplyScalar(BLINK_DIST));
    dest.y = ctx.playerPos.y; // stay at same height

    ctx.playerGroup.position.copy(dest);
    // Trigger arrival animation via userData signal (PlayerController reads this)
    ctx.playerGroup.userData['_triggerSpawnAir'] = true;

    // VFX: flash ring at origin and destination
    _blinkVfx(ctx.scene, ctx.playerPos.clone(), dest);
  },
};

/**
 * Levitate — toggle hover mode.  The player floats 1.8u above the ground,
 * can move XZ freely, and uses Jump_Idle animation with direction tilt.
 * Drains 0.8 mana/s while active.
 */
export const ABILITY_LEVITATE: Ability = {
  id:          'levitate',
  name:        'Levitate',
  description: 'Toggle hover mode. Float 1.8u above the ground with directional tilt. Drains mana while active.',
  icon:        '🌀',
  cooldown:    1,   // low CD so toggle feels responsive
  manaCost:    0,   // mana drain is per-second in PlayerController, not on cast
  cast(ctx) {
    // Signal PlayerController to toggle levitate via userData
    const current = ctx.playerGroup.userData['_levitateMode'] as boolean | undefined;
    ctx.playerGroup.userData['_levitateMode'] = !current;
    ctx.playerGroup.userData['_levitateY']    = ctx.playerPos.y + 1.8;
    _levitateVfx(ctx.scene, ctx.playerPos.clone());
  },
};

/**
 * Fly Burst — brief dash-glide in the movement direction with a Fly animation
 * and aggressive forward tilt.  Covers ~12u over 1s.
 */
export const ABILITY_FLY_BURST: Ability = {
  id:          'fly_burst',
  name:        'Fly Burst',
  description: 'Launch into a 1-second glide in your movement direction, covering ~12u with a pitched-forward fly animation.',
  icon:        '🪶',
  cooldown:    12,
  manaCost:    40,
  cast(ctx) {
    const dir = ctx.aimDir.clone().setY(0).normalize();
    // Signal PlayerController to start a timed fly burst
    ctx.playerGroup.userData['_flyBurstDir']  = dir;
    ctx.playerGroup.userData['_flyBurstTimer'] = 1.0;  // 1 second
    ctx.playerGroup.userData['_flyBurstSpeed'] = 12.0; // WU/s
    _flyBurstVfx(ctx.scene, ctx.playerPos.clone(), dir);
  },
};

/**
 * Populate an AbilitySystem with the alpha abilities for the given character.
 * Called once after character selection in NewGameFlow.
 */
export function applyCharacterAbilities(
  abilities: AbilitySystem,
  characterId: CharacterId,
): void {
  const id = characterId.toLowerCase();

  // ── Human abilities ────────────────────────────────────────────────────────
  if (id.startsWith('human') || id === 'rogue' || id === 'rogue_hooded' || id === 'mage') {
    const shieldBash: Ability = {
      id:          'shield_bash',
      name:        'Shield Bash',
      description: 'Slam your shield into the nearest enemy, dealing 4 damage and briefly stunning them.',
      icon:        '🛡',
      cooldown:    6,
      manaCost:    20,
      cast(ctx) {
        // Find closest living enemy within 3 WU
        let closest: typeof ctx.enemies[0] | null = null;
        let closestDist = 3.0;
        for (const e of ctx.enemies) {
          if (e.isDead) continue;
          const d = ctx.playerPos.distanceTo(e.worldPosition);
          if (d < closestDist) { closestDist = d; closest = e; }
        }
        if (closest) {
          closest.takeDamage(Math.ceil(4 * ctx.progression.mods.meleeDamageMult));
          // VFX: brief white flash ring at enemy position
          _shieldBashVfx(ctx.scene, closest.worldPosition.clone());
        }
      },
    };
    abilities.register(shieldBash);
    abilities.equip('shield_bash', 0);

    // War Cry — AoE taunt / intimidate
    const warCry: Ability = {
      id:          'war_cry',
      name:        'War Cry',
      description: 'Emit a battle shout that forces all enemies within 6u to target you, and briefly pauses their attacks.',
      icon:        '📣',
      cooldown:    15,
      manaCost:    35,
      cast(ctx) {
        const RANGE = 6;
        for (const e of ctx.enemies) {
          if (e.isDead) continue;
          if (ctx.playerPos.distanceTo(e.worldPosition) <= RANGE) {
            // Taunt = 2 HP damage + brief stagger (represented as extra damage)
            e.takeDamage(1);
          }
        }
        _warCryVfx(ctx.scene, ctx.playerPos.clone());
      },
    };
    abilities.register(warCry);
    abilities.equip('war_cry', 1);
  }

  // ── Undead abilities ───────────────────────────────────────────────────────
  else if (id.startsWith('undead') || id === 'skeleton_mage' || id === 'skeleton_rogue' ||
           id === 'zombie' || id === 'ghost' || id === 'mystery_undead') {
    const deathBolt: Ability = {
      id:          'death_bolt',
      name:        'Death Bolt',
      description: 'Hurl a bolt of death energy at the nearest enemy, dealing 8 dark damage.',
      icon:        '💀',
      cooldown:    4,
      manaCost:    25,
      cast(ctx) {
        // Fire instantly at closest enemy within 15u (no travel time in alpha)
        let closest: typeof ctx.enemies[0] | null = null;
        let closestDist = 15.0;
        for (const e of ctx.enemies) {
          if (e.isDead) continue;
          const d = ctx.playerPos.distanceTo(e.worldPosition);
          if (d < closestDist) { closestDist = d; closest = e; }
        }
        if (closest) {
          const dmg = Math.ceil(8 * ctx.progression.mods.spellDamageMult);
          closest.takeDamage(dmg);
          _deathBoltVfx(ctx.scene, ctx.playerPos.clone(), closest.worldPosition.clone());
        }
      },
    };
    abilities.register(deathBolt);
    abilities.equip('death_bolt', 0);

    // Phase Shift — brief intangibility
    const phaseShift: Ability = {
      id:          'phase_shift',
      name:        'Phase Shift',
      description: 'Become briefly spectral, avoiding the next hit and passing through enemies for 1.5s.',
      icon:        '👻',
      cooldown:    12,
      manaCost:    40,
      cast(_ctx) {
        // In alpha: visual VFX only; godMode flag could be set briefly
        _phaseShiftVfx(_ctx.scene, _ctx.playerGroup);
      },
    };
    abilities.register(phaseShift);
    abilities.equip('phase_shift', 1);
  }

  // ── Vulperia abilities ─────────────────────────────────────────────────────
  else if (id.startsWith('fox')) {
    const shadowStep: Ability = {
      id:          'shadow_step',
      name:        'Shadow Step',
      description: 'Teleport instantly behind the nearest enemy and strike for 6 damage.',
      icon:        '🦊',
      cooldown:    8,
      manaCost:    30,
      cast(ctx) {
        let closest: typeof ctx.enemies[0] | null = null;
        let closestDist = 12.0;
        for (const e of ctx.enemies) {
          if (e.isDead) continue;
          const d = ctx.playerPos.distanceTo(e.worldPosition);
          if (d < closestDist) { closestDist = d; closest = e; }
        }
        if (closest) {
          // Teleport player to just behind the enemy
          const dir = _scratchV.copy(ctx.playerPos).sub(closest.worldPosition).normalize();
          const dest = closest.worldPosition.clone().add(dir.multiplyScalar(1.2));
          dest.y = ctx.playerPos.y;
          ctx.playerGroup.position.copy(dest);
          closest.takeDamage(Math.ceil(6 * ctx.progression.mods.meleeDamageMult));
          _shadowStepVfx(ctx.scene, dest);
        }
      },
    };
    abilities.register(shadowStep);
    abilities.equip('shadow_step', 0);

    // Scatter Shot — piercing ranged
    const scatterShot: Ability = {
      id:          'scatter_shot',
      name:        'Scatter Shot',
      description: 'Fire a piercing shot that hits all enemies in a line for 5 damage each.',
      icon:        '🏹',
      cooldown:    5,
      manaCost:    20,
      cast(ctx) {
        // Damage all enemies within a 10u line in the aim direction
        const LINE_RANGE = 10;
        const LINE_WIDTH = 1.2;
        for (const e of ctx.enemies) {
          if (e.isDead) continue;
          const toEnemy = _scratchV.copy(e.worldPosition).sub(ctx.playerPos);
          const proj = toEnemy.dot(ctx.aimDir);
          if (proj < 0 || proj > LINE_RANGE) continue;
          const perp = toEnemy.clone().sub(ctx.aimDir.clone().multiplyScalar(proj)).length();
          if (perp <= LINE_WIDTH) {
            e.takeDamage(Math.ceil(5 * ctx.progression.mods.spellDamageMult));
          }
        }
        _scatterShotVfx(ctx.scene, ctx.playerPos.clone(), ctx.aimDir.clone());
      },
    };
    abilities.register(scatterShot);
    abilities.equip('scatter_shot', 1);
  }

  // ── Slime abilities ────────────────────────────────────────────────────────
  else if (id.startsWith('slime')) {
    const acidSpit: Ability = {
      id:          'acid_spit',
      name:        'Acid Spit',
      description: 'Spit a glob of acid at the nearest enemy, dealing 3 damage per second for 4 seconds.',
      icon:        '🧪',
      cooldown:    5,
      manaCost:    18,
      cast(ctx) {
        // In alpha: instant application of DoT as total damage
        let closest: typeof ctx.enemies[0] | null = null;
        let closestDist = 12.0;
        for (const e of ctx.enemies) {
          if (e.isDead) continue;
          const d = ctx.playerPos.distanceTo(e.worldPosition);
          if (d < closestDist) { closestDist = d; closest = e; }
        }
        if (closest) {
          // 3 dmg/s × 4s = 12 total, split over 2 hits for now
          const dmgPerTick = Math.ceil(3 * ctx.progression.mods.spellDamageMult);
          closest.takeDamage(dmgPerTick * 2);
          _acidSpitVfx(ctx.scene, ctx.playerPos.clone(), closest.worldPosition.clone());
        }
      },
    };
    abilities.register(acidSpit);
    abilities.equip('acid_spit', 0);

    // Engulf — brief AoE hold
    const engulf: Ability = {
      id:          'engulf',
      name:        'Engulf',
      description: 'Surround a nearby enemy with slime, holding them in place and dealing 5 damage.',
      icon:        '🟢',
      cooldown:    8,
      manaCost:    28,
      cast(ctx) {
        let closest: typeof ctx.enemies[0] | null = null;
        let closestDist = 3.0;
        for (const e of ctx.enemies) {
          if (e.isDead) continue;
          const d = ctx.playerPos.distanceTo(e.worldPosition);
          if (d < closestDist) { closestDist = d; closest = e; }
        }
        if (closest) {
          closest.takeDamage(5);
          _engulfVfx(ctx.scene, closest.worldPosition.clone());
        }
      },
    };
    abilities.register(engulf);
    abilities.equip('engulf', 1);
  }

  // ── NS2: Elf abilities ─────────────────────────────────────────────────────
  if (id.startsWith('elf_')) {
    // Recall — replay last spell at no cost
    const recall: Ability = {
      id: 'recall', name: 'Recall', icon: '📜',
      description: 'Briefly replay your last cast spell at no mana cost. The memory is perfect.',
      cooldown: 8, manaCost: 0,
      cast(ctx) {
        // Try to invoke the last cast spell through the spell system
        const lastSpell = (ctx as any).lastCastSpellId as string | undefined;
        if (lastSpell) {
          ctx.progression.grantSpell(lastSpell);  // ensure still unlocked
        }
        _recallVfx(ctx.scene, ctx.playerPos.clone());
      },
    };
    abilities.register(recall);
    abilities.equip('recall', 0);

    // Arcane Library — instantly cycle to next equipped spell
    const arcaneLib: Ability = {
      id: 'arcane_library', name: 'Arcane Library', icon: '📚',
      description: 'Cycle through your equipped spells instantly. The right tool for every moment.',
      cooldown: 3, manaCost: 0,
      cast(ctx) {
        // Cycle active spell slot — note to implementation: wire to SpellSystem
        console.log('[Arcane Library] cycling spell slots');
        _recallVfx(ctx.scene, ctx.playerPos.clone());
      },
    };
    abilities.register(arcaneLib);
    abilities.equip('arcane_library', 1);
  }

  // ── NS2: Celestial abilities ────────────────────────────────────────────────
  if (id.startsWith('celestial_')) {
    // Starburst — 5-projectile spread
    const starburst: Ability = {
      id: 'starburst', name: 'Starburst', icon: '✨',
      description: 'Launch 5 radiant bolts in a spread. Each deals 6 damage.',
      cooldown: 10, manaCost: 30,
      cast(ctx) {
        const BASE_DMG = Math.ceil(6 * ctx.progression.mods.spellDamageMult);
        const ANGLES = [-40, -20, 0, 20, 40];
        for (const deg of ANGLES) {
          const rad = (deg * Math.PI) / 180;
          const dir = new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad));
          for (const e of ctx.enemies) {
            if (e.isDead) continue;
            const diff = e.worldPosition.clone().sub(ctx.playerPos);
            const angle = diff.angleTo(dir);
            if (angle < 0.25 && diff.length() < 12) { e.takeDamage(BASE_DMG); }
          }
        }
        _starburstVfx(ctx.scene, ctx.playerPos.clone());
      },
    };
    abilities.register(starburst);
    abilities.equip('starburst', 0);

    // Moonveil — 3s damage immunity
    const moonveil: Ability = {
      id: 'moonveil', name: 'Moonveil', icon: '🌙',
      description: 'Wrap yourself in lunar light. Immune to all damage for 3 seconds.',
      cooldown: 20, manaCost: 45,
      cast(ctx) {
        (ctx as any).isMoonveiled = true;
        _levitateVfx(ctx.scene, ctx.playerPos.clone());
        setTimeout(() => { (ctx as any).isMoonveiled = false; }, 3000);
      },
    };
    abilities.register(moonveil);
    abilities.equip('moonveil', 1);
  }

  // ── NS2: Draconic abilities ─────────────────────────────────────────────────
  if (id.startsWith('draconic_')) {
    // Breath — cone fire attack
    const breath: Ability = {
      id: 'dragon_breath', name: 'Dragon Breath', icon: '🔥',
      description: 'Breathe fire in a 3u cone (45°). Each enemy hit takes 12 damage.',
      cooldown: 8, manaCost: 25,
      cast(ctx) {
        const BASE_DMG = Math.ceil(12 * ctx.progression.mods.spellDamageMult);
        const CONE_RANGE = 3.0;
        const HALF_ANGLE = Math.PI / 8;   // 22.5° either side = 45° cone
        for (const e of ctx.enemies) {
          if (e.isDead) continue;
          const diff = e.worldPosition.clone().sub(ctx.playerPos);
          if (diff.length() > CONE_RANGE) continue;
          // Face direction — use player facing angle from group.rotation.y
          const facing = new THREE.Vector3(
            Math.sin((ctx as any).playerFacingY ?? 0), 0,
            Math.cos((ctx as any).playerFacingY ?? 0),
          );
          if (diff.angleTo(facing) <= HALF_ANGLE) e.takeDamage(BASE_DMG);
        }
        _breathVfx(ctx.scene, ctx.playerPos.clone());
      },
    };
    abilities.register(breath);
    abilities.equip('dragon_breath', 0);

    // Harden — block next 3 hits
    const harden: Ability = {
      id: 'harden', name: 'Harden', icon: '🪨',
      description: 'Harden your scales. Block the next 3 hits completely.',
      cooldown: 15, manaCost: 20,
      cast(ctx) {
        (ctx as any).hardenCharges = 3;
        _hardenVfx(ctx.scene, ctx.playerPos.clone());
      },
    };
    abilities.register(harden);
    abilities.equip('harden', 1);
  }

  // ── Universal movement abilities (Z / X) — all species ────────────────────
  abilities.register(ABILITY_BLINK);
  abilities.register(ABILITY_LEVITATE);
  abilities.register(ABILITY_FLY_BURST);
  // Blink, Levitate, and Fly are now SpellSystem spells (in the Grimoire, right-click to cast).
  // Z and X slots are left empty for future species-specific abilities.
}

// ── Minimal VFX helpers ───────────────────────────────────────────────────────
// Simple geometry-based VFX that don't require a shader system.
// Each VFX creates a mesh, adds it to the scene, and self-removes after a timer.

function _addTempMesh(
  scene: THREE.Scene,
  geo:   THREE.BufferGeometry,
  mat:   THREE.Material,
  pos:   THREE.Vector3,
  lifeSec: number,
): void {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  const start = performance.now();
  const animate = () => {
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed >= lifeSec) { scene.remove(mesh); return; }
    (mat as THREE.MeshBasicMaterial).opacity = 1 - elapsed / lifeSec;
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function _shieldBashVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const geo = new THREE.RingGeometry(0.3, 0.9, 12);
  _addTempMesh(scene, geo, mat, pos.clone().setY(pos.y + 1), 0.4);
}

function _warCryVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const geo = new THREE.RingGeometry(0.5, 6, 24);
  geo.rotateX(-Math.PI / 2);
  _addTempMesh(scene, geo, mat, pos.clone().setY(pos.y + 0.1), 0.6);
}

function _deathBoltVfx(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3): void {
  const mid = from.clone().lerp(to, 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0x660088, transparent: true, opacity: 1.0 });
  const geo = new THREE.SphereGeometry(0.22, 8, 4);
  _addTempMesh(scene, geo, mat, mid, 0.25);
}

function _phaseShiftVfx(scene: THREE.Scene, group: THREE.Group): void {
  // Temporarily boost emissive on player mesh
  group.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat?.emissive) {
      const prev = mat.emissive.getHex();
      mat.emissive.setHex(0x8800cc);
      setTimeout(() => mat.emissive.setHex(prev), 800);
    }
  });
}

function _shadowStepVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0x220044, transparent: true, opacity: 0.8 });
  const geo = new THREE.SphereGeometry(0.5, 8, 4);
  _addTempMesh(scene, geo, mat, pos.clone().setY(pos.y + 1), 0.35);
}

function _scatterShotVfx(scene: THREE.Scene, from: THREE.Vector3, dir: THREE.Vector3): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.9 });
  const geo = new THREE.CylinderGeometry(0.05, 0.05, 8, 6);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from.clone().add(dir.clone().multiplyScalar(4)));
  mesh.lookAt(from.clone().add(dir.clone().multiplyScalar(10)));
  scene.add(mesh);
  setTimeout(() => scene.remove(mesh), 300);
}

function _acidSpitVfx(scene: THREE.Scene, _from: THREE.Vector3, to: THREE.Vector3): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0x44ff44, transparent: true, opacity: 0.85 });
  const geo = new THREE.SphereGeometry(0.28, 8, 4);
  _addTempMesh(scene, geo, mat, to.clone().setY(to.y + 0.5), 0.5);
}

function _engulfVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0x44bb55, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const geo = new THREE.SphereGeometry(0.7, 12, 6);
  _addTempMesh(scene, geo, mat, pos.clone().setY(pos.y + 0.8), 0.6);
}

function _blinkVfx(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3): void {
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ringGeo = new THREE.RingGeometry(0.4, 1.0, 16);
  ringGeo.rotateX(-Math.PI / 2);
  _addTempMesh(scene, ringGeo, ringMat, from.clone().setY(from.y + 0.05), 0.3);
  const burstMat = new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.85 });
  const burstGeo = new THREE.SphereGeometry(0.55, 10, 6);
  _addTempMesh(scene, burstGeo, burstMat, to.clone().setY(to.y + 0.9), 0.4);
}

function _levitateVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const geo = new THREE.RingGeometry(0.3, 0.9, 16);
  geo.rotateX(-Math.PI / 2);
  _addTempMesh(scene, geo, mat, pos.clone().setY(pos.y + 0.2), 0.5);
}

function _flyBurstVfx(scene: THREE.Scene, pos: THREE.Vector3, dir: THREE.Vector3): void {
  for (let i = 0; i < 3; i++) {
    const offset = dir.clone().multiplyScalar(-(i + 1) * 0.8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.6 - i * 0.15 });
    const geo = new THREE.SphereGeometry(0.18 - i * 0.04, 6, 4);
    _addTempMesh(scene, geo, mat, pos.clone().add(offset).setY(pos.y + 1.0), 0.3 + i * 0.1);
  }
}

// NS2: New species VFX ─────────────────────────────────────────────────────────

function _recallVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  // Purple spiral ring
  const mat = new THREE.MeshBasicMaterial({ color: 0x9944ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const geo = new THREE.TorusGeometry(0.8, 0.06, 6, 24);
  geo.rotateX(-Math.PI / 2);
  _addTempMesh(scene, geo, mat, pos.clone().setY(pos.y + 1.2), 0.5);
}

function _starburstVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  // 5 radiant shards fanning out
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.9 });
    const geo = new THREE.SphereGeometry(0.12, 6, 4);
    const target = pos.clone().add(new THREE.Vector3(Math.sin(angle) * 2, 0.8, Math.cos(angle) * 2));
    _addTempMesh(scene, geo, mat, target, 0.4);
  }
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffdd, transparent: true, opacity: 0.6 });
  _addTempMesh(scene, new THREE.SphereGeometry(0.4, 8, 6), glow, pos.clone().setY(pos.y + 1.0), 0.3);
}

function _breathVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  // Orange cone burst
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i < 2 ? 0xff6600 : 0xff3300, transparent: true, opacity: 0.7 - i * 0.12 });
    const geo = new THREE.SphereGeometry(0.25 + i * 0.1, 6, 4);
    _addTempMesh(scene, geo, mat, pos.clone().setY(pos.y + 1.0).addScaledVector(new THREE.Vector3(0, 0, -1), i * 0.5), 0.35);
  }
}

function _hardenVfx(scene: THREE.Scene, pos: THREE.Vector3): void {
  // Grey rock-shard shell
  const mat = new THREE.MeshBasicMaterial({ color: 0x888866, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const geo = new THREE.IcosahedronGeometry(1.0, 0);
  _addTempMesh(scene, geo, mat, pos.clone().setY(pos.y + 1.0), 0.6);
}
