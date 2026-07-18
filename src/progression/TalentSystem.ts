// ── TalentSystem ──────────────────────────────────────────────────────────────
//
//  26-node talent constellation: 7 paths × 3 tiers + 5 cross-path junctions.
//  Nodes buy with talent points (1 per level-up).
//  Effects are applied by mutating `progression.mods` immediately on purchase.

import type { ProgressionSystem } from './ProgressionSystem';

// ── Node definition ───────────────────────────────────────────────────────────

export type TalentPath =
  | 'blade_dancer' | 'arcanist' | 'warlock'
  | 'conductor'    | 'artificer' | 'apothecary'
  | 'naturalist'   | 'cross';

/** Species IDs that mirror StoryQuestLine.SpeciesId — kept local to avoid circular imports. */
export type TalentSpecies = 'human' | 'undead' | 'vulperia' | 'slime' | 'elf' | 'celestial' | 'draconic';

export interface TalentNode {
  id: string;
  path: TalentPath;
  tier: 1 | 2 | 3;
  /** Talent-point cost to purchase. Cross-path nodes cost 2. */
  cost: number;
  prerequisites: string[];
  name: string;
  description: string;
  /**
   * Optional species gate.  When set, only characters of these species can
   * purchase this node.  Unset = available to all species.
   */
  allowedSpecies?: readonly TalentSpecies[];
  /** Applied once, immediately when the node is purchased. */
  applyEffect(prog: ProgressionSystem): void;
}

// ── 26 talent nodes ───────────────────────────────────────────────────────────

export const TALENT_NODES: readonly TalentNode[] = [

  // ── Blade Dancer ──────────────────────────────────────────────────────────
  {
    id: 'bd_1', path: 'blade_dancer', tier: 1, cost: 1, prerequisites: [],
    name: 'Rapid Strikes',
    description: '+15% melee damage. Your blade finds every gap in their guard.',
    applyEffect: p => { p.mods.meleeDamageMult *= 1.15; },
  },
  {
    id: 'bd_2', path: 'blade_dancer', tier: 2, cost: 1, prerequisites: ['bd_1'],
    name: 'Parry Form',
    description: 'Dodging near an enemy (within 3u) grants 0.3s of invulnerability on top of normal i-frames.',
    applyEffect: () => { /* effect flag checked in PlayerController */ },
  },
  {
    id: 'bd_apex', path: 'blade_dancer', tier: 3, cost: 2, prerequisites: ['bd_2'],
    name: 'Tempest Step',
    description: '20% chance on melee hit to teleport behind the target.',
    applyEffect: () => { /* flag checked in CombatSystem */ },
  },

  // ── Arcanist ──────────────────────────────────────────────────────────────
  {
    id: 'ar_1', path: 'arcanist', tier: 1, cost: 1, prerequisites: [],
    name: 'Arcane Surge',
    description: '+20% spell damage. Your spells crackle with amplified resonance.',
    applyEffect: p => { p.mods.spellDamageMult *= 1.20; },
  },
  {
    id: 'ar_2', path: 'arcanist', tier: 2, cost: 1, prerequisites: ['ar_1'],
    name: 'Resonant Field',
    description: '+50% AOE radius on all spells. Also unlocks Chain Arc spell.',
    applyEffect: p => { p.mods.aoeRadiusMult *= 1.50; p.grantSpell('chain_arc'); },
  },
  {
    id: 'ar_apex', path: 'arcanist', tier: 3, cost: 2, prerequisites: ['ar_2'],
    name: 'Time Fracture',
    description: 'Casting any spell briefly freezes all enemies within 8u for 1.2s. Unlocks Nova Burst spell.',
    applyEffect: p => { p.grantSpell('nova_burst'); },
  },

  // ── Warlock ───────────────────────────────────────────────────────────────
  {
    id: 'wl_1', path: 'warlock', tier: 1, cost: 1, prerequisites: [],
    name: 'Curse Touch',
    description: 'Spell hits apply a 3s Curse: 1 dmg/s. Also unlocks Void Rift spell.',
    applyEffect: p => { p.mods.hasCurseTouch = true; p.grantSpell('void_rift'); },
  },
  {
    id: 'wl_2', path: 'warlock', tier: 2, cost: 1, prerequisites: ['wl_1'],
    name: 'Soul Drain',
    description: 'Each Curse tick heals you for 1 HP. Pain feeds power.',
    applyEffect: p => { p.mods.hasSoulDrain = true; },
  },
  {
    id: 'wl_apex', path: 'warlock', tier: 3, cost: 2, prerequisites: ['wl_2'],
    name: 'Dark Covenant',
    description: 'Sacrifice 20% current HP to triple all damage for 10s. (Spell: hold cast [E] 1s)',
    applyEffect: () => { /* handled by spell dark_covenant */ },
  },

  // ── Conductor ─────────────────────────────────────────────────────────────
  {
    id: 'co_1', path: 'conductor', tier: 1, cost: 1, prerequisites: [],
    name: 'Rally',
    description: '+1 max party size. Minions deal +10% damage.',
    applyEffect: p => { p.mods.extraPartySlots += 1; },
  },
  {
    id: 'co_2', path: 'conductor', tier: 2, cost: 1, prerequisites: ['co_1'],
    name: 'Inspiring Aura',
    description: '+2 max party size. Minions within 12u gain +25% movement speed. Unlocks Mass Animate spell.',
    applyEffect: p => { p.mods.extraPartySlots += 2; p.grantSpell('mass_animate'); },
  },
  {
    id: 'co_apex', path: 'conductor', tier: 3, cost: 2, prerequisites: ['co_2'],
    name: 'Undying Legion',
    description: 'Each minion can reanimate once per combat at 5 HP when slain. Unlocks Battle Hymn spell.',
    applyEffect: p => { p.grantSpell('battle_hymn'); },
  },

  // ── Artificer ─────────────────────────────────────────────────────────────
  {
    id: 'af_1', path: 'artificer', tier: 1, cost: 1, prerequisites: [],
    name: 'Efficient Builder',
    description: 'Built structures cost 25% fewer resources.',
    applyEffect: p => { p.mods.buildCostMult *= 0.75; },
  },
  {
    id: 'af_2', path: 'artificer', tier: 2, cost: 1, prerequisites: ['af_1'],
    name: 'Fortification',
    description: 'All structures have +50% HP and auto-repair 1 HP every 15s.',
    applyEffect: () => { /* applied to structures in BaseScene */ },
  },
  {
    id: 'af_apex', path: 'artificer', tier: 3, cost: 2, prerequisites: ['af_2'],
    name: 'Master Builder',
    description: 'Structures rebuild free after destruction. Blueprint cost −50%.',
    applyEffect: p => { p.mods.buildCostMult *= 0.50; },
  },

  // ── Apothecary ────────────────────────────────────────────────────────────
  {
    id: 'ap_1', path: 'apothecary', tier: 1, cost: 1, prerequisites: [],
    name: 'Potent Brew',
    description: 'Potions are 50% more effective. Carry 1 extra potion slot.',
    applyEffect: p => { p.mods.potionPotencyMult *= 1.5; },
  },
  {
    id: 'ap_2', path: 'apothecary', tier: 2, cost: 1, prerequisites: ['ap_1'],
    name: 'Volatile Mixtures',
    description: 'Potions can be thrown up to 10u. Impact applies effect in 3u radius.',
    applyEffect: () => { /* handled by inventory / potion throw system */ },
  },
  {
    id: 'ap_apex', path: 'apothecary', tier: 3, cost: 2, prerequisites: ['ap_2'],
    name: 'Grand Elixir',
    description: 'Once per in-game day, brew a Grand Elixir applying all positive effects for 60s.',
    applyEffect: () => { /* handled by AlchemyStation */ },
  },

  // ── Naturalist ────────────────────────────────────────────────────────────
  {
    id: 'na_1', path: 'naturalist', tier: 1, cost: 1, prerequisites: [],
    name: 'Herbalist',
    description: '+50% harvest yield from plants and herbs.',
    applyEffect: p => { p.mods.herbYieldMult *= 1.5; },
  },
  {
    id: 'na_2', path: 'naturalist', tier: 2, cost: 1, prerequisites: ['na_1'],
    name: 'Healing Touch',
    description: 'Unlocks the Rejuvenate spell: channel 2s to restore 15 HP.',
    applyEffect: p => { p.grantSpell('rejuvenate'); },
  },
  {
    id: 'na_apex', path: 'naturalist', tier: 3, cost: 2, prerequisites: ['na_2'],
    name: 'World Tree Blessing',
    description: 'Channel 3s: all allies within 15u are fully healed. 120s cooldown.',
    applyEffect: p => { p.grantSpell('world_tree_blessing'); },
  },

  // ── Cross-path junction nodes ─────────────────────────────────────────────
  {
    id: 'cross_bd_ar', path: 'cross', tier: 2, cost: 2,
    prerequisites: ['bd_1', 'ar_1'],
    name: 'Spell Blade',
    description: '20% chance on melee hit to trigger your equipped spell at impact. Free cast.',
    applyEffect: p => { p.mods.hasSpellBlade = true; },
  },
  {
    id: 'cross_ar_wl', path: 'cross', tier: 2, cost: 2,
    prerequisites: ['ar_1', 'wl_1'],
    name: 'Void Weave',
    description: 'All spells apply a Void Mark on hit. At 3 stacks: bonus 8 damage burst.',
    applyEffect: p => { p.mods.hasVoidWeave = true; },
  },
  {
    id: 'cross_wl_co', path: 'cross', tier: 2, cost: 2,
    prerequisites: ['wl_1', 'co_1'],
    name: 'Death Pact',
    description: 'When a minion dies it explodes: 3u radius DoT cloud, 3 dmg/s for 3s.',
    applyEffect: p => { p.mods.hasDeathPact = true; },
  },
  {
    id: 'cross_co_af', path: 'cross', tier: 2, cost: 2,
    prerequisites: ['co_1', 'af_1'],
    name: 'War Machine',
    description: 'Minions assigned to Watch Perches gain a ranged attack (3 dmg, 4s cooldown).',
    applyEffect: () => { /* applied when minion enters guard state */ },
  },
  {
    id: 'cross_ap_na', path: 'cross', tier: 2, cost: 2,
    prerequisites: ['ap_1', 'na_1'],
    name: 'Herbmaster',
    description: 'Harvest herbs without a crafting station. Ingredients have +1 potency.',
    applyEffect: () => { /* applied in GardenPlot / harvest logic */ },
  },

  // ── D6: Species-gated signature nodes ─────────────────────────────────────
  {
    id: 'sp_human_iron_will', path: 'cross', tier: 3, cost: 2,
    prerequisites: ['bd_1'],
    allowedSpecies: ['human'] as const,
    name: 'Iron Will',
    description: '[Human only] HP below 25%: all damage reduced by 20%. Passive — always active.',
    applyEffect: p => { p.mods.ironWill = true; },
  },
  {
    id: 'sp_undead_undying', path: 'cross', tier: 3, cost: 2,
    prerequisites: ['wl_1'],
    allowedSpecies: ['undead'] as const,
    name: 'Undying Hunger',
    description: '[Undead only] On kill, restore 5% max HP. Passive — always active.',
    applyEffect: p => { p.mods.undyingHunger = true; },
  },
  {
    id: 'sp_vulperia_predator', path: 'cross', tier: 3, cost: 2,
    prerequisites: ['bd_2'],
    allowedSpecies: ['vulperia'] as const,
    name: "Predator's Eye",
    description: '[Vulperia only] First hit on each new enemy always crits. Passive — resets per enemy.',
    applyEffect: p => { p.mods.predatorsEye = true; },
  },
  {
    id: 'sp_slime_amorphous', path: 'cross', tier: 3, cost: 2,
    prerequisites: ['na_1'],
    allowedSpecies: ['slime'] as const,
    name: 'Amorphous',
    description: '[Slime only] Immune to knockback; take 15% reduced fall damage. Passive — always active.',
    applyEffect: p => { p.mods.amorphous = true; },
  },
  // NS2: New Tier-1 species signature nodes
  {
    id: 'sp_elf_long_memory', path: 'cross', tier: 3, cost: 2,
    prerequisites: ['ar_1'],
    allowedSpecies: ['elf'] as const,
    name: 'Long Memory',
    description: '[Elf only] +10% XP from all sources. First encounter with each enemy type deals +20% damage. Passive — resets per run.',
    applyEffect: p => { p.mods.longMemory = true; },
  },
  {
    id: 'sp_celestial_star_touched', path: 'cross', tier: 3, cost: 2,
    prerequisites: ['ar_2'],
    allowedSpecies: ['celestial'] as const,
    name: 'Star-Touched',
    description: '[Celestial only] 3u light aura (enemies -10% hit rate). At night: spells +15% damage, -10% mana cost. Passive.',
    applyEffect: p => { p.mods.starTouched = true; },
  },
  {
    id: 'sp_draconic_scale_armour', path: 'cross', tier: 3, cost: 2,
    prerequisites: ['bd_1', 'wl_1'],
    allowedSpecies: ['draconic'] as const,
    name: 'Scale Armour',
    description: '[Draconic only] −15% physical damage taken. +20% damage when above 75% HP. Fire spells cost 20% less mana. Passive.',
    applyEffect: p => { p.mods.scaleArmour = true; },
  },

  // ── Elf talent paths: Memory / Grace / Sage ──────────────────────────────
  {
    id: 'elf_mem_1', path: 'arcanist', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['elf'] as const,
    name: 'Studied Recall',
    description: '[Elf] +15% XP from books and lore interactions. The library still gives her things.',
    applyEffect: p => { p.mods.spellDamageMult *= 1.08; },
  },
  {
    id: 'elf_mem_2', path: 'arcanist', tier: 2, cost: 1, prerequisites: ['elf_mem_1'],
    allowedSpecies: ['elf'] as const,
    name: 'Pattern Recognition',
    description: '[Elf] After defeating 3 enemies of the same type, +25% damage vs that type permanently (this run).',
    applyEffect: p => { p.mods.spellDamageMult *= 1.12; },
  },
  {
    id: 'elf_grace_1', path: 'blade_dancer', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['elf'] as const,
    name: 'Centuries of Practice',
    description: '[Elf] +20% melee damage when above 75% HP. She has done this before.',
    applyEffect: p => { p.mods.meleeDamageMult *= 1.12; },
  },
  {
    id: 'elf_grace_2', path: 'blade_dancer', tier: 2, cost: 1, prerequisites: ['elf_grace_1'],
    allowedSpecies: ['elf'] as const,
    name: 'Graceful Step',
    description: '[Elf] Dodge roll leaves a 1.5s root trap at the point of departure.',
    applyEffect: () => { /* checked in PlayerController dodge */ },
  },
  {
    id: 'elf_sage_1', path: 'apothecary', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['elf'] as const,
    name: 'Herbalist Lineage',
    description: '[Elf] Herb yield +30%. Minor Heal potions heal +20% HP.',
    applyEffect: p => { p.mods.herbYieldMult *= 1.30; p.mods.potionPotencyMult *= 1.20; },
  },
  {
    id: 'elf_sage_2', path: 'apothecary', tier: 2, cost: 1, prerequisites: ['elf_sage_1'],
    allowedSpecies: ['elf'] as const,
    name: "Elder's Patience",
    description: '[Elf] Charge a 3× damage shot over 2s (fully stationary). Old but effective.',
    applyEffect: p => { p.mods.spellDamageMult *= 1.15; },
  },

  // ── Celestial talent paths: Dawn / Dusk / Void ──────────────────────────
  {
    id: 'cel_dawn_1', path: 'arcanist', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['celestial'] as const,
    name: 'Radiant Aura',
    description: '[Celestial] Light aura radius +1u. Enemies within aura take +8% spell damage.',
    applyEffect: p => { p.mods.spellDamageMult *= 1.08; p.mods.aoeRadiusMult *= 1.10; },
  },
  {
    id: 'cel_dawn_2', path: 'arcanist', tier: 2, cost: 1, prerequisites: ['cel_dawn_1'],
    allowedSpecies: ['celestial'] as const,
    name: 'Solar Flare',
    description: '[Celestial] Once per 30s, emit a brief blind burst (2s, all enemies within 4u). Passive.',
    applyEffect: p => { p.mods.spellDamageMult *= 1.12; },
  },
  {
    id: 'cel_dusk_1', path: 'warlock', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['celestial'] as const,
    name: 'Eclipse',
    description: '[Celestial] Reduce all enemy damage dealt by 15% for 6s after taking a hit. Passive.',
    applyEffect: () => { /* checked in CombatSystem */ },
  },
  {
    id: 'cel_dusk_2', path: 'warlock', tier: 2, cost: 1, prerequisites: ['cel_dusk_1'],
    allowedSpecies: ['celestial'] as const,
    name: 'Gravity Well',
    description: '[Celestial] Once per 20s, pull all enemies within 5u inward 2 WU. Passive.',
    applyEffect: p => { p.mods.hasVoidWeave = true; },
  },
  {
    id: 'cel_void_1', path: 'blade_dancer', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['celestial'] as const,
    name: 'Stellar Jump',
    description: '[Celestial] Blink cooldown −25%. Blinking through an enemy deals 6 damage.',
    applyEffect: p => { p.mods.meleeDamageMult *= 1.06; },
  },
  {
    id: 'cel_void_2', path: 'blade_dancer', tier: 2, cost: 1, prerequisites: ['cel_void_1'],
    allowedSpecies: ['celestial'] as const,
    name: 'Void Touch',
    description: '[Celestial] Next melee hit after a blink phases through armour (+50% damage, ignores defence).',
    applyEffect: p => { p.mods.meleeDamageMult *= 1.20; },
  },

  // ── Draconic talent paths: Fire / Scale / Void ──────────────────────────
  {
    id: 'dra_fire_1', path: 'arcanist', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['draconic'] as const,
    name: 'Ignition',
    description: '[Draconic] Fire-type spells apply a 3s burn DoT (2 dmg/s). Passive.',
    applyEffect: p => { p.mods.spellDamageMult *= 1.10; },
  },
  {
    id: 'dra_fire_2', path: 'arcanist', tier: 2, cost: 1, prerequisites: ['dra_fire_1'],
    allowedSpecies: ['draconic'] as const,
    name: 'Dragon Rage',
    description: '[Draconic] When below 50% HP: all damage +25%. The scales heat up. Passive.',
    applyEffect: p => { p.mods.spellDamageMult *= 1.15; p.mods.meleeDamageMult *= 1.10; },
  },
  {
    id: 'dra_scale_1', path: 'blade_dancer', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['draconic'] as const,
    name: 'Hardened Hide',
    description: '[Draconic] +20 max HP. Harden (ability) grants 1 additional block charge.',
    applyEffect: p => { p.mods.ironWill = true; /* max HP bonus applied via vitality boost in startGame */ },
  },
  {
    id: 'dra_scale_2', path: 'blade_dancer', tier: 2, cost: 1, prerequisites: ['dra_scale_1'],
    allowedSpecies: ['draconic'] as const,
    name: 'Tail Sweep',
    description: '[Draconic] Every 8th melee hit automatically deals AoE knockback in a 2u ring. Passive.',
    applyEffect: p => { p.mods.meleeDamageMult *= 1.12; },
  },
  {
    id: 'dra_void_1', path: 'warlock', tier: 1, cost: 1, prerequisites: [],
    allowedSpecies: ['draconic'] as const,
    name: 'Acid Scale',
    description: '[Draconic] Shed scales on hit — any enemy that walks over them takes 3 damage. Passive.',
    applyEffect: () => { /* checked in CombatSystem */ },
  },
  {
    id: 'dra_void_2', path: 'warlock', tier: 2, cost: 1, prerequisites: ['dra_void_1'],
    allowedSpecies: ['draconic'] as const,
    name: 'Corrode',
    description: '[Draconic] Attacks reduce enemy defence by 30% for 4s. Stacks twice. Passive.',
    applyEffect: p => { p.mods.hasDeathPact = true; /* repurposed flag for corrode */ },
  },
];

// Fast lookup by id
const NODE_MAP = new Map<string, TalentNode>(TALENT_NODES.map(n => [n.id, n]));

export function getTalentNode(id: string): TalentNode | undefined {
  return NODE_MAP.get(id);
}

// ── TalentSystem ──────────────────────────────────────────────────────────────

export class TalentSystem {
  private readonly _bought = new Set<string>();
  /** Active species — set after character creation so species-gated nodes gate correctly. */
  activeSpecies: TalentSpecies | null = null;

  /** Called when a node is successfully purchased. Use for particle/sound FX. */
  onNodeBought: ((nodeId: string) => void) | null = null;

  get boughtNodes(): ReadonlySet<string> { return this._bought; }

  hasNode(id: string): boolean { return this._bought.has(id); }

  /** True if all prerequisites are met, species matches, and the node hasn't been bought. */
  canBuy(id: string, progression: ProgressionSystem): boolean {
    const node = NODE_MAP.get(id);
    if (!node) return false;
    if (this._bought.has(id)) return false;
    if (progression.talentPoints < node.cost) return false;
    // D6: species gate
    if (node.allowedSpecies && this.activeSpecies &&
        !node.allowedSpecies.includes(this.activeSpecies)) return false;
    return node.prerequisites.every(p => this._bought.has(p));
  }

  /**
   * Purchase a talent node.
   * @returns true on success, false if prerequisites/points not met.
   */
  buyNode(id: string, progression: ProgressionSystem): boolean {
    if (!this.canBuy(id, progression)) return false;
    const node = NODE_MAP.get(id)!;
    if (!progression.spendTalentPoint(node.cost)) return false;
    this._bought.add(id);
    node.applyEffect(progression);
    this.onNodeBought?.(id);
    return true;
  }

  /** Paths in which the player has at least `minPoints` nodes purchased. */
  pointsInPath(path: TalentPath): number {
    let count = 0;
    for (const id of this._bought) {
      if (NODE_MAP.get(id)?.path === path) count++;
    }
    return count;
  }

  /** Serialise for localStorage persistence. */
  serialize(): { bought: string[] } {
    return { bought: [...this._bought] };
  }

  /** Restore from serialised data (does NOT re-apply effects — call on new run only). */
  deserialize(data: { bought: string[] }, progression: ProgressionSystem): void {
    this._bought.clear();
    for (const id of data.bought) {
      const node = NODE_MAP.get(id);
      if (node) {
        this._bought.add(id);
        node.applyEffect(progression);
      }
    }
  }
}
