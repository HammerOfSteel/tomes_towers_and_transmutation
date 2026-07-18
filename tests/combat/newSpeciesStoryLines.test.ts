/**
 * newSpeciesStoryLines.test.ts — NS7: Validate Elf, Celestial, Draconic story lines
 * using the same patterns as storyRunner.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { StoryRunner } from '@/world/StoryRunner';
import { getStoryLineBySpecies } from '@/world/StoryQuestLine';
import type { StoryTickState } from '@/world/StoryRunner';

function makeQuestLog() {
  const added: string[] = [];
  const completed: string[] = [];
  return {
    addQuest:     (q: any) => { added.push(q.id); },
    markCompleted:(id: string) => { completed.push(id); },
    getActive:    () => [],
    _added: added, _completed: completed,
  } as any;
}

const BASE: StoryTickState = {
  killCount: 0, dungeonsClearedCount: 0, itemsCraftedCount: 0,
  floorsVisited: 0, keysPickedUp: 0, booksReadCount: 0,
  playerCol: 0, playerRow: 0, nearSettlements: [],
  completedNpcDialogues: new Set(), eliteEnemiesKilled: new Set(),
};

const ALL_SPECIES = ['elf', 'celestial', 'draconic'] as const;
const CHAR_IDS: Record<typeof ALL_SPECIES[number], string> = {
  elf:       'elf_scholar',
  celestial: 'celestial_dawn',
  draconic:  'draconic_fire',
};

// ── Story line structure tests ────────────────────────────────────────────────

describe.each(ALL_SPECIES)('%s: story line structure', (species) => {
  it('getStoryLineBySpecies returns a non-null line', () => {
    const line = getStoryLineBySpecies(species);
    expect(line).toBeTruthy();
    expect(line.speciesId).toBe(species);
  });

  it('has at least 2 acts (prologue + Act I)', () => {
    const line = getStoryLineBySpecies(species)!;
    expect(line.acts.length).toBeGreaterThanOrEqual(2);
  });

  it('all beats have non-empty completionText', () => {
    const line = getStoryLineBySpecies(species)!;
    for (const act of line.acts) {
      for (const beat of act.beats) {
        expect(beat.completionText, `${act.id}/${beat.id}`).toBeTruthy();
      }
    }
  });

  it('all beats have rewardXp > 0', () => {
    const line = getStoryLineBySpecies(species)!;
    for (const act of line.acts) {
      for (const beat of act.beats) {
        expect(beat.rewardXp, `${act.id}/${beat.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('prologue has exactly 4 beats ending with interact_key', () => {
    const line = getStoryLineBySpecies(species)!;
    const prologue = line.acts[0];
    expect(prologue).toBeTruthy();
    expect(prologue!.beats.length).toBe(4);
    expect(prologue!.beats[3]?.objective.type).toBe('interact_key');
  });

  it('displayTitle is non-empty', () => {
    const line = getStoryLineBySpecies(species)!;
    expect(line.displayTitle.length).toBeGreaterThan(3);
  });
});

// ── StoryRunner integration ────────────────────────────────────────────────────

describe.each(ALL_SPECIES)('%s: StoryRunner drives through prologue', (species) => {
  const charId = CHAR_IDS[species];

  it('starts without throwing', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner(charId as any, log);
    expect(() => runner.start({ ...BASE })).not.toThrow();
  });

  it('onActBegin fires on start()', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner(charId as any, log);
    let actTitle = '';
    runner.onActBegin = (t) => { actTitle = t; };
    runner.start({ ...BASE });
    expect(actTitle).toBeTruthy();
  });

  it('advances at least one beat with high-delta ticks', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner(charId as any, log);
    let completed = 0;
    runner.onBeatComplete = () => { completed++; };
    runner.start({ ...BASE });

    for (let i = 1; i <= 20 && completed === 0; i++) {
      runner.tick({
        ...BASE,
        killCount: i * 10, dungeonsClearedCount: i, floorsVisited: i,
        booksReadCount: i, keysPickedUp: 1, itemsCraftedCount: i,
        nearSettlements: ['village'],
        completedNpcDialogues: new Set(['npc_archivist']),
        eliteEnemiesKilled: new Set(['bandit_captain']),
      });
    }
    expect(completed).toBeGreaterThan(0);
  });

  it('story completes without infinite loop (max 60 ticks)', () => {
    const log    = makeQuestLog();
    const runner = new StoryRunner(charId as any, log);
    let done = 0;
    runner.onStoryComplete = () => { done++; };
    runner.start({ ...BASE });

    for (let i = 1; i <= 60 && !runner.isComplete; i++) {
      runner.tick({
        ...BASE,
        killCount: i * 20, dungeonsClearedCount: i, floorsVisited: i,
        booksReadCount: i, keysPickedUp: 1, itemsCraftedCount: i,
        nearSettlements: ['village'],
        completedNpcDialogues: new Set(['npc_archivist','npc_scholar']),
        eliteEnemiesKilled: new Set(['bandit_captain','baron_guard_elite']),
      });
    }
    expect(done).toBe(1);
  });
});
