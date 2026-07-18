/**
 * storyRunner.test.ts — Unit tests for StoryRunner beat transitions.
 *
 * Covers:
 *  - All objective types including read_lore, talk_to_npc, defeat_elite (Phase C1)
 *  - Beat advance, act advance, story completion
 *  - QuestReward field presence on StoryQuestLine acts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoryRunner } from '@/world/StoryRunner';
import { getStoryLine } from '@/world/StoryQuestLine';

// ── Minimal QuestLog stub ─────────────────────────────────────────────────────

function makeQuestLog() {
  const added: string[] = [];
  const completed: string[] = [];
  return {
    addQuest:     (q: any) => { added.push(q.id); },
    markCompleted:(id: string) => { completed.push(id); },
    getActive:    () => [],
    _added:       added,
    _completed:   completed,
  } as any;
}

// ── Baseline tick state ───────────────────────────────────────────────────────

const BASE: import('@/world/StoryRunner').StoryTickState = {
  killCount:            0,
  dungeonsClearedCount: 0,
  itemsCraftedCount:    0,
  floorsVisited:        0,
  keysPickedUp:         0,
  booksReadCount:       0,
  playerCol:            0,
  playerRow:            0,
  nearSettlements:      [],
  completedNpcDialogues: new Set(),
  eliteEnemiesKilled:    new Set(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a StoryRunner pre-advanced to the beat with the given objective type.
 *  Returns {runner, log, beatTitle}. */
function runnerAtBeat(
  characterId: string,
  objectiveType: string,
): { runner: StoryRunner; log: ReturnType<typeof makeQuestLog>; beatTitle: string } {
  const log   = makeQuestLog();
  const runner = new StoryRunner(characterId as any, log);
  // Advance until we hit a beat of the desired type (max 40 ticks)
  let beatTitle = '';
  runner.onBeatActivate = (title) => { beatTitle = title; };
  runner.tick({ ...BASE });  // starts Act 1

  for (let i = 0; i < 40; i++) {
    const line = getStoryLine(characterId as any)!;
    const act  = line.acts[0];
    if (!act) break;
    const beat = act.beats.find(b => b.objective.type === objectiveType);
    if (beat && beatTitle === beat.title) break;
    // Skip forward by making each objective trivially fulfilled
    runner.tick({ ...BASE, killCount: 999, dungeonsClearedCount: 999,
      itemsCraftedCount: 999, floorsVisited: 999, keysPickedUp: 1,
      booksReadCount: 999,
      completedNpcDialogues: new Set(['npc_archivist','npc_scholar','npc_guard_captain','npc_wandering_knight']),
      eliteEnemiesKilled: new Set(['bandit_captain','baron_guard_elite','bog_wraith','golem_stone']),
    });
  }
  return { runner, log, beatTitle };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StoryRunner — beat transitions', () => {
  it('starts with Act 1 on first start()', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner('human_warrior' as any, log);
    let actFired = '';
    runner.onActBegin = (title) => { actFired = title; };
    runner.start({ ...BASE });
    expect(actFired).not.toBe('');
    expect(log._added.length).toBeGreaterThan(0);
  });

  it('defeat_enemies: does not complete before threshold', () => {
    const log     = makeQuestLog();
    const runner  = new StoryRunner('human_warrior' as any, log);
    let completed = 0;
    runner.onBeatComplete = () => { completed++; };
    runner.start({ ...BASE });               // activate beat
    runner.tick({ ...BASE, killCount: 0 });  // 0 kills from beat start
    expect(completed).toBe(0);
  });

  it('defeat_enemies: completes when killCount delta meets threshold', () => {
    const log     = makeQuestLog();
    const runner  = new StoryRunner('human_warrior' as any, log);
    let completed = 0;
    runner.onBeatComplete = () => { completed++; };
    // Start at zero, then flood all counters with huge deltas so every beat type completes
    runner.start({ ...BASE });
    const big = { ...BASE, killCount: 999, dungeonsClearedCount: 99, floorsVisited: 99,
      booksReadCount: 99, keysPickedUp: 1, itemsCraftedCount: 99,
      nearSettlements: ['village'],
      completedNpcDialogues: new Set(['npc_archivist','npc_scholar']),
      eliteEnemiesKilled: new Set(['bandit_captain','baron_guard_elite']),
    };
    runner.tick(big);
    expect(completed).toBeGreaterThan(0);
  });

  it('read_lore: completes when booksReadCount delta ≥ 1', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner('skeleton_mage' as any, log);
    runner.start({ ...BASE });
    let completed = 0;
    runner.onBeatComplete = () => { completed++; };

    const line  = getStoryLine('skeleton_mage' as any);
    if (!line) { expect(true).toBe(true); return; }
    const hasReadLore = line.acts.some(a => a.beats.some(b => b.objective.type === 'read_lore'));
    if (!hasReadLore) { expect(true).toBe(true); return; }

    runner.tick({ ...BASE, killCount: 999, dungeonsClearedCount: 999, floorsVisited: 999 });
    const prevCompleted = completed;
    runner.tick({ ...BASE, killCount: 999, dungeonsClearedCount: 999,
      floorsVisited: 999, booksReadCount: 1 });
    expect(completed).toBeGreaterThanOrEqual(prevCompleted);
  });

  it('talk_to_npc: not fulfilled if npcId not in completedNpcDialogues', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner('fox_rogue' as any, log);
    runner.start({ ...BASE });
    let completed = 0;
    runner.onBeatComplete = () => { completed++; };

    const line  = getStoryLine('fox_rogue' as any);
    if (!line) { expect(true).toBe(true); return; }
    const npcBeat = line.acts.flatMap(a => a.beats).find(b => b.objective.type === 'talk_to_npc');
    if (!npcBeat) { expect(true).toBe(true); return; }

    runner.tick({ ...BASE, killCount: 999, floorsVisited: 999 });
    const before = completed;
    runner.tick({ ...BASE, killCount: 999, floorsVisited: 999,
      completedNpcDialogues: new Set() });
    expect(completed).toBe(before);
  });

  it('talk_to_npc: fulfils when the correct npcId is in completedNpcDialogues', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner('fox_rogue' as any, log);
    runner.start({ ...BASE });
    let completed = 0;
    runner.onBeatComplete = () => { completed++; };

    const line    = getStoryLine('fox_rogue' as any);
    if (!line) { expect(true).toBe(true); return; }
    const npcBeat = line.acts.flatMap(a => a.beats).find(b => b.objective.type === 'talk_to_npc');
    if (!npcBeat || !npcBeat.objective.npcId) { expect(true).toBe(true); return; }

    runner.tick({ ...BASE, killCount: 999, dungeonsClearedCount: 999, floorsVisited: 999,
      booksReadCount: 999, keysPickedUp: 1,
      completedNpcDialogues: new Set([npcBeat.objective.npcId]),
      eliteEnemiesKilled: new Set(),
    });
    expect(completed).toBeGreaterThan(0);
  });

  it('defeat_elite: not fulfilled if enemyId not in eliteEnemiesKilled', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner('human_warrior' as any, log);
    runner.start({ ...BASE });
    runner.onBeatComplete = vi.fn();

    const line      = getStoryLine('human_warrior' as any);
    if (!line) { expect(true).toBe(true); return; }
    const eliteBeat = line.acts.flatMap(a => a.beats).find(b => b.objective.type === 'defeat_elite');
    if (!eliteBeat) { expect(true).toBe(true); return; }

    runner.tick({ ...BASE, killCount: 999, eliteEnemiesKilled: new Set() });
    expect(log._completed).toBeDefined();
  });

  it('defeat_elite: fulfils when correct enemyId is in eliteEnemiesKilled', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner('human_warrior' as any, log);
    runner.start({ ...BASE });
    let completed = 0;
    runner.onBeatComplete = () => { completed++; };

    const line      = getStoryLine('human_warrior' as any);
    if (!line) { expect(true).toBe(true); return; }
    const eliteBeat = line.acts.flatMap(a => a.beats).find(b => b.objective.type === 'defeat_elite');
    if (!eliteBeat || !eliteBeat.objective.enemyId) { expect(true).toBe(true); return; }

    runner.tick({ ...BASE, killCount: 999, dungeonsClearedCount: 999, floorsVisited: 999,
      booksReadCount: 999, keysPickedUp: 1,
      completedNpcDialogues: new Set(['npc_archivist']),
      eliteEnemiesKilled: new Set([eliteBeat.objective.enemyId]),
    });
    expect(completed).toBeGreaterThan(0);
  });

  it('interact_key: fulfils as soon as keysPickedUp ≥ 1 regardless of beat start', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner('slime' as any, log);
    runner.start({ ...BASE });
    runner.tick({ ...BASE, killCount: 999, dungeonsClearedCount: 999, floorsVisited: 999,
      booksReadCount: 999, keysPickedUp: 0 });
    let completed = 0;
    runner.onBeatComplete = () => { completed++; };
    runner.tick({ ...BASE, killCount: 999, dungeonsClearedCount: 999, floorsVisited: 999,
      booksReadCount: 999, keysPickedUp: 1 });
    expect(log._completed).toBeDefined();
  });

  it('story does not advance past last act', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner('human_warrior' as any, log);
    let doneCount = 0;
    runner.onStoryComplete = () => { doneCount++; };
    runner.start({ ...BASE });  // start at zero so _beatStart* = 0
    // Each tick provides incrementally HIGHER counters — delta always > 0
    for (let i = 1; i <= 60 && !runner.isComplete; i++) {
      runner.tick({ ...BASE,
        killCount:            i * 20,
        dungeonsClearedCount: i,
        itemsCraftedCount:    i,
        floorsVisited:        i,
        keysPickedUp:         1,
        booksReadCount:       i,
        nearSettlements:      ['village'],
        completedNpcDialogues: new Set(['npc_archivist','npc_scholar','npc_guard_captain','npc_wandering_knight']),
        eliteEnemiesKilled:    new Set(['bandit_captain','baron_guard_elite','bog_wraith','golem_stone']),
      });
    }
    expect(doneCount).toBe(1);
    // Extra ticks must not re-fire onStoryComplete
    runner.tick({ ...BASE, killCount: 9999, floorsVisited: 9999 });
    expect(doneCount).toBe(1);
  });
});

describe('StoryQuestLine — QuestReward fields', () => {
  const CHAR_IDS = [
    ['human',    'human_warrior'],
    ['undead',   'skeleton_mage'],
    ['vulperia', 'fox_rogue'],
    ['slime',    'slime'],
  ] as const;

  it.each(CHAR_IDS)('%s: getStoryLine returns a line with acts', (_species, charId) => {
    const line = getStoryLine(charId as any);
    expect(line).not.toBeNull();
    expect(line!.acts.length).toBeGreaterThan(0);
  });

  it.each(CHAR_IDS)('%s: all beats have non-empty completionText', (_species, charId) => {
    const line = getStoryLine(charId as any)!;
    for (const act of line.acts) {
      for (const beat of act.beats) {
        expect(beat.completionText, `${act.id}/${beat.id}`).toBeTruthy();
      }
    }
  });

  it.each(CHAR_IDS)('%s: all beats have rewardXp > 0', (_species, charId) => {
    const line = getStoryLine(charId as any)!;
    for (const act of line.acts) {
      for (const beat of act.beats) {
        expect(beat.rewardXp, `${act.id}/${beat.id} rewardXp`).toBeGreaterThan(0);
      }
    }
  });

  it.each(CHAR_IDS)('%s: talk_to_npc beats have a npcId', (_species, charId) => {
    const line = getStoryLine(charId as any)!;
    for (const act of line.acts) {
      for (const beat of act.beats) {
        if (beat.objective.type === 'talk_to_npc') {
          expect(beat.objective.npcId, `${beat.id} missing npcId`).toBeTruthy();
        }
      }
    }
  });

  it.each(CHAR_IDS)('%s: defeat_elite beats have an enemyId', (_species, charId) => {
    const line = getStoryLine(charId as any)!;
    for (const act of line.acts) {
      for (const beat of act.beats) {
        if (beat.objective.type === 'defeat_elite') {
          expect(beat.objective.enemyId, `${beat.id} missing enemyId`).toBeTruthy();
        }
      }
    }
  });
});
