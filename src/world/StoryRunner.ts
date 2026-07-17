/**
 * StoryRunner — runtime state machine for the character's story quest line.
 *
 * One instance is created per new game. It tracks which act and beat are
 * currently active, checks completion conditions each tick, and exposes
 * callbacks for reward delivery and toast messages.
 *
 * Wiring in main.ts:
 *   const story = new StoryRunner(cfg.characterId, questLog);
 *   // in game loop tick:
 *   story.tick({ killCount, dungeonsClearedCount, playerCol, playerRow,
 *                itemsCraftedCount, nearSettlements });
 *
 * Completion checks are deliberately liberal (e.g. defeat_enemies is
 * cumulative over the whole game, not just since the beat started) so the
 * player never gets stuck waiting for a specific counter to reset.
 */

import type { CharacterId }   from '@/scene/CharacterDecisionTree';
import type { QuestLog }      from '@/ui/QuestLog';
import type { QuestDef }      from '@/world/QuestDef';
import {
  getStoryLine,
  type StoryBeat,
  type StoryAct,
  type StoryQuestLine,
} from '@/world/StoryQuestLine';

// ── Player state snapshot passed to tick() ────────────────────────────────────

export interface StoryTickState {
  /** Total enemies killed since game start. */
  killCount:            number;
  /** Total dungeon floors cleared since game start. */
  dungeonsClearedCount: number;
  /** Total items crafted since game start. */
  itemsCraftedCount:    number;
  /** Unique floor indices visited this session (tracked by SceneManager). */
  floorsVisited:        number;
  /** Number of named key items picked up (workbench_key / master key). */
  keysPickedUp:         number;
  /** Total number of books/lecterns read since game start. */
  booksReadCount:       number;
  /** Player's current overworld tile column (0 when in interior). */
  playerCol:            number;
  /** Player's current overworld tile row (0 when in interior). */
  playerRow:            number;
  /** Settlement labels near the player (within ~8 tiles). */
  nearSettlements:      string[];
}

// ── StoryRunner ───────────────────────────────────────────────────────────────

export class StoryRunner {
  private readonly _line:    StoryQuestLine;
  private readonly _log:     QuestLog;
  private _actIdx  = 0;
  private _beatIdx = 0;
  private _done    = false;

  /** Called when a beat completes: (completionText, xp, gold) */
  onBeatComplete: ((text: string, xp: number, gold: number) => void) | null = null;
  /** Called when a beat activates: (beatTitle, beatDescription) — use to update the objective tracker. */
  onBeatActivate:  ((title: string, description: string) => void) | null = null;
  /** Called when an act begins: (actTitle, introText) */
  onActBegin:     ((title: string, intro: string) => void) | null = null;
  /** Called when the whole story is finished. */
  onStoryComplete: (() => void) | null = null;

  // Snapshots of counts at the moment a beat became active.
  // Fulfillment is checked against delta-from-activation, not global total,
  // for beat types that require a count.
  private _beatStartKills    = 0;
  private _beatStartDungeons = 0;
  private _beatStartCrafts   = 0;
  private _beatStartFloors   = 0;
  private _beatStartBooks    = 0;

  constructor(characterId: CharacterId, questLog: QuestLog) {
    this._line = getStoryLine(characterId);
    this._log  = questLog;
  }

  /** Begin the story — adds first beat to the quest log. */
  start(initialState: StoryTickState): void {
    this._beginAct(initialState);
  }

  /** Call every game tick (or at least every second) while in-game. */
  tick(state: StoryTickState): void {
    if (this._done) return;

    const act  = this._currentAct();
    const beat = this._currentBeat();
    if (!act || !beat) return;

    if (this._isBeatFulfilled(beat, state)) {
      this._completeBeat(beat, state);
    }
  }

  /** Whether the whole story arc is finished. */
  get isComplete(): boolean { return this._done; }

  /** Title of the active act, or null if story is done. */
  get currentActTitle(): string | null {
    return this._currentAct()?.title ?? null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _currentAct(): StoryAct | null {
    return this._line.acts[this._actIdx] ?? null;
  }

  private _currentBeat(): StoryBeat | null {
    return this._currentAct()?.beats[this._beatIdx] ?? null;
  }

  private _beginAct(state: StoryTickState): void {
    const act = this._currentAct();
    if (!act) { this._done = true; this.onStoryComplete?.(); return; }

    this.onActBegin?.(act.title, act.intro);
    this._beatIdx = 0;
    this._activateBeat(state);
  }

  private _activateBeat(state: StoryTickState): void {
    const beat = this._currentBeat();
    if (!beat) return;

    // Snapshot counts so delta can be measured
    this._beatStartKills    = state.killCount;
    this._beatStartDungeons = state.dungeonsClearedCount;
    this._beatStartCrafts   = state.itemsCraftedCount;
    this._beatStartFloors   = state.floorsVisited;
    this._beatStartBooks    = state.booksReadCount;

    this._log.addQuest(this._beatToQuestDef(beat, this._currentAct()!));
    this.onBeatActivate?.(beat.title, beat.description);
  }

  private _completeBeat(beat: StoryBeat, state: StoryTickState): void {
    this._log.markCompleted(this._beatQuestId(beat));
    this.onBeatComplete?.(beat.completionText, beat.rewardXp, beat.rewardGold);

    this._beatIdx++;
    const act = this._currentAct();
    if (!act) { this._done = true; this.onStoryComplete?.(); return; }

    if (this._beatIdx >= act.beats.length) {
      // Advance to next act
      this._actIdx++;
      this._beginAct(state);
    } else {
      this._activateBeat(state);
    }
  }

  private _isBeatFulfilled(beat: StoryBeat, state: StoryTickState): boolean {
    const obj = beat.objective;
    switch (obj.type) {
      case 'defeat_enemies':
        return (state.killCount - this._beatStartKills) >= (obj.count ?? 1);

      case 'clear_dungeon':
        return (state.dungeonsClearedCount - this._beatStartDungeons) >= 1;

      case 'craft_item':
        return (state.itemsCraftedCount - this._beatStartCrafts) >= (obj.count ?? 1);

      case 'reach_location':
        // Fulfilled when the player is near any settlement OR when a
        // settlement name hint matches one of the nearby settlements.
        return state.nearSettlements.length > 0 ||
               (state.playerCol !== 0 && state.playerRow !== 0);

      case 'survive_wave':
        // Placeholder: auto-fulfil after a short delay so the beat
        // progresses until WaveManager is implemented.
        // Once WaveManager exists, it can call story.forceCompleteBeat().
        return (state.killCount - this._beatStartKills) >= 3;

      case 'explore_floor':
        // Fulfils when the player visits a floor index they haven't seen
        // before this beat was activated.  SceneManager.uniqueFloorsVisited
        // increments each time a new bp.floor is entered.
        return (state.floorsVisited - this._beatStartFloors) >= 1;

      case 'interact_key':
        // Fulfils the moment the player has the master key — whether they picked
        // it up during this beat or before it (e.g. basement visited before p4 starts).
        return state.keysPickedUp >= 1;

      case 'read_lore':
        // Fulfils when the player opens any book or lectern since this beat activated.
        return (state.booksReadCount - this._beatStartBooks) >= 1;
    }
  }

  /** Force-complete the current beat (used by WaveManager when a wave clears). */
  forceCompleteBeat(state: StoryTickState): void {
    const beat = this._currentBeat();
    if (!beat) return;
    this._completeBeat(beat, state);
  }

  private _beatQuestId(beat: StoryBeat): string {
    return `story__${beat.id}`;
  }

  private _beatToQuestDef(beat: StoryBeat, act: StoryAct): QuestDef {
    return {
      id:          this._beatQuestId(beat),
      title:       `[Story] ${beat.title}`,
      type:        'clear_dungeon',   // closest generic type for icon purposes
      giverName:   `${this._line.displayTitle} · ${act.title}`,
      target:      {
        type:  'grid_cell',
        id:    0,
        col:   0,
        row:   0,
        label: beat.objective.targetLabel,
      },
      reward:      { gold: beat.rewardGold, xp: beat.rewardXp },
      description: beat.description,
      completed:   false,
      fulfilled:   false,
    };
  }
}
