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
