// tests/progression/talentSystem.test.ts
//
//  Unit tests for ProgressionSystem (XP/level/stats) and TalentSystem (nodes).

import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressionSystem, xpThreshold } from '@/progression/ProgressionSystem';
import { TalentSystem, TALENT_NODES, getTalentNode } from '@/progression/TalentSystem';

// ── ProgressionSystem — XP & levelling ───────────────────────────────────────

describe('ProgressionSystem — XP & levelling', () => {
  let prog: ProgressionSystem;

  beforeEach(() => { prog = new ProgressionSystem(); });

  it('starts at level 1 with 0 XP', () => {
    expect(prog.level).toBe(1);
    expect(prog.xp).toBe(0);
  });

  it('xpThreshold(1) = 100', () => {
    expect(xpThreshold(1)).toBe(100);
  });

  it('xpThreshold(2) = 400', () => {
    expect(xpThreshold(2)).toBe(400);
  });

  it('grantXP below threshold does not level up', () => {
    const levelled = prog.grantXP(99);
    expect(levelled).toBe(false);
    expect(prog.level).toBe(1);
    expect(prog.xp).toBe(99);
  });

  it('grantXP at exact threshold levels up once', () => {
    const levelled = prog.grantXP(100);
    expect(levelled).toBe(true);
    expect(prog.level).toBe(2);
    expect(prog.xp).toBe(0); // leftover = 0
  });

  it('grantXP carries over excess XP after level-up', () => {
    prog.grantXP(150); // 150 − 100 = 50 leftover at level 2
    expect(prog.level).toBe(2);
    expect(prog.xp).toBe(50);
  });

  it('grantXP can trigger multiple level-ups in one call', () => {
    // level 1 needs 100, level 2 needs 400; 500 XP = level 1→2→3
    prog.grantXP(500);
    expect(prog.level).toBe(3);
  });

  it('level-up grants 1 stat point and 1 talent point', () => {
    prog.grantXP(100);
    expect(prog.statPoints).toBe(1);
    expect(prog.talentPoints).toBe(1);
  });

  it('onLevelUp callback fires with new level', () => {
    const received: number[] = [];
    prog.onLevelUp = (n) => received.push(n);
    prog.grantXP(100);
    expect(received).toEqual([2]);
  });

  it('does not exceed level 30', () => {
    // Grant enough XP to blow past level 30
    for (let i = 0; i < 31; i++) prog.grantXP(100_000);
    expect(prog.level).toBe(30);
  });

  it('xpProgress is 0 at start of level', () => {
    expect(prog.xpProgress).toBe(0);
  });

  it('xpProgress is 0.5 at half threshold', () => {
    prog.grantXP(50);
    expect(prog.xpProgress).toBeCloseTo(0.5);
  });
});

// ── ProgressionSystem — stats ─────────────────────────────────────────────────

describe('ProgressionSystem — stat spending', () => {
  let prog: ProgressionSystem;

  beforeEach(() => {
    prog = new ProgressionSystem();
    prog.grantXP(100); // get 1 stat point
  });

  it('spendStat succeeds when points available', () => {
    expect(prog.spendStat('power')).toBe(true);
    expect(prog.stats.power).toBe(2);
    expect(prog.statPoints).toBe(0);
  });

  it('spendStat fails when no points available', () => {
    prog.spendStat('power'); // use the 1 point
    expect(prog.spendStat('power')).toBe(false);
    expect(prog.stats.power).toBe(2); // unchanged
  });

  it('derivedMaxHp increases with vitality', () => {
    const base = prog.derivedMaxHp;
    prog.spendStat('vitality');
    expect(prog.derivedMaxHp).toBe(base + 5);
  });

  it('derivedSpellDamageMult increases with attunement', () => {
    const base = prog.derivedSpellDamageMult;
    prog.spendStat('attunement');
    expect(prog.derivedSpellDamageMult).toBeGreaterThan(base);
  });

  it('derivedPartyCap increases with dominion', () => {
    const base = prog.derivedPartyCap;
    prog.spendStat('dominion');
    expect(prog.derivedPartyCap).toBe(base + 1);
  });
});

// ── TalentSystem ──────────────────────────────────────────────────────────────

describe('TalentSystem — node registry', () => {
  it('has 26 nodes total', () => {
    expect(TALENT_NODES.length).toBe(26);
  });

  it('has exactly 5 cross-path nodes', () => {
    expect(TALENT_NODES.filter(n => n.path === 'cross').length).toBe(5);
  });

  it('each path has exactly 3 non-cross nodes', () => {
    const paths = ['blade_dancer', 'arcanist', 'warlock', 'conductor', 'artificer', 'apothecary', 'naturalist'];
    for (const path of paths) {
      expect(TALENT_NODES.filter(n => n.path === path).length).toBe(3);
    }
  });

  it('getTalentNode returns undefined for unknown id', () => {
    expect(getTalentNode('nope')).toBeUndefined();
  });

  it('getTalentNode returns correct node', () => {
    const n = getTalentNode('ar_1');
    expect(n?.name).toBe('Arcane Surge');
  });
});

describe('TalentSystem — buyNode', () => {
  let prog: ProgressionSystem;
  let talents: TalentSystem;

  beforeEach(() => {
    prog = new ProgressionSystem();
    talents = new TalentSystem();
    // Grant 10 levels for 10 talent points
    for (let i = 0; i < 10; i++) prog.grantXP(xpThreshold(prog.level));
  });

  it('can buy a tier-1 node with no prerequisites', () => {
    expect(talents.buyNode('ar_1', prog)).toBe(true);
    expect(talents.hasNode('ar_1')).toBe(true);
  });

  it('buying a node deducts talent points', () => {
    const before = prog.talentPoints;
    talents.buyNode('ar_1', prog);
    expect(prog.talentPoints).toBe(before - 1);
  });

  it('applies node effect immediately (Arcane Surge +20% spell damage)', () => {
    const before = prog.mods.spellDamageMult;
    talents.buyNode('ar_1', prog);
    expect(prog.mods.spellDamageMult).toBeCloseTo(before * 1.20);
  });

  it('cannot buy tier-2 node without tier-1 prerequisite', () => {
    expect(talents.buyNode('ar_2', prog)).toBe(false);
    expect(talents.hasNode('ar_2')).toBe(false);
  });

  it('can buy tier-2 node after buying tier-1', () => {
    talents.buyNode('ar_1', prog);
    expect(talents.buyNode('ar_2', prog)).toBe(true);
  });

  it('cannot buy cross-path node without both prerequisites', () => {
    talents.buyNode('ar_1', prog); // has ar_1 but not wl_1
    expect(talents.buyNode('cross_ar_wl', prog)).toBe(false);
  });

  it('can buy cross-path node when both prerequisites met', () => {
    talents.buyNode('ar_1', prog);
    talents.buyNode('wl_1', prog);
    expect(talents.buyNode('cross_ar_wl', prog)).toBe(true);
    expect(prog.mods.hasVoidWeave).toBe(true);
  });

  it('cross-path node costs 2 talent points', () => {
    talents.buyNode('ar_1', prog);
    talents.buyNode('wl_1', prog);
    const before = prog.talentPoints;
    talents.buyNode('cross_ar_wl', prog);
    expect(prog.talentPoints).toBe(before - 2);
  });

  it('cannot buy same node twice', () => {
    talents.buyNode('ar_1', prog);
    const before = prog.talentPoints;
    expect(talents.buyNode('ar_1', prog)).toBe(false);
    expect(prog.talentPoints).toBe(before); // no deduction
  });

  it('canBuy returns false when insufficient talent points', () => {
    // Drain all talent points
    while (prog.talentPoints > 0) prog.spendTalentPoint();
    expect(talents.canBuy('ar_1', prog)).toBe(false);
  });

  it('Conductor co_1 adds +1 to extraPartySlots', () => {
    expect(prog.mods.extraPartySlots).toBe(0);
    talents.buyNode('co_1', prog);
    expect(prog.mods.extraPartySlots).toBe(1);
  });

  it('Death Pact sets hasDeathPact = true', () => {
    talents.buyNode('wl_1', prog);
    talents.buyNode('co_1', prog);
    talents.buyNode('cross_wl_co', prog);
    expect(prog.mods.hasDeathPact).toBe(true);
  });

  it('serialize/deserialize round-trip preserves bought nodes', () => {
    talents.buyNode('ar_1', prog);
    talents.buyNode('wl_1', prog);
    const data = talents.serialize();

    const prog2 = new ProgressionSystem();
    // Manually restore points (normally done from save)
    for (let i = 0; i < 5; i++) prog2.grantXP(xpThreshold(prog2.level));
    const talents2 = new TalentSystem();
    talents2.deserialize(data, prog2);
    expect(talents2.hasNode('ar_1')).toBe(true);
    expect(talents2.hasNode('wl_1')).toBe(true);
  });
});
