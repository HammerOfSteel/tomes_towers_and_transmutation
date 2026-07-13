// tests/interactables/tamingGame.test.ts
//
//  Unit tests for TamingGame word-scoring and state machine.
//  Uses jsdom (configured in vitest.config.ts).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TamingGame } from '@/interactables/TamingGame';

// ── Minimal SlimeEnemy stub ───────────────────────────────────────────────────

function makeSlimeStub(personality: 'bold' | 'gentle' | 'curious' | 'lonely') {
  const reactions: Array<'great' | 'good' | 'neutral' | 'bad'> = [];
  return {
    personality,
    tameReact(q: 'great' | 'good' | 'neutral' | 'bad') { reactions.push(q); },
    startTaming() {},
    stopTaming() {},
    _reactions: reactions,
  } as unknown as import('@/enemy/SlimeEnemy').SlimeEnemy;
}

/** Click the nth choice button inside the active taming strip. */
function clickButton(game: TamingGame, index: number): void {
  const strips = document.querySelectorAll('#taming-strip');
  const strip = strips[strips.length - 1] as HTMLElement;
  const buttons = strip.querySelectorAll('button');
  (buttons[index] as HTMLButtonElement).click();
  game.update(2.0);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TamingGame', () => {
  let game: TamingGame;

  beforeEach(() => {
    game = new TamingGame();
  });

  afterEach(() => {
    game.close();
    document.querySelectorAll('#taming-strip').forEach(el => el.remove());
  });

  it('is not active before begin()', () => {
    expect(game.active).toBe(false);
  });

  it('becomes active after begin()', () => {
    const slime = makeSlimeStub('bold');
    game.begin(slime);
    expect(game.active).toBe(true);
  });

  it('close() deactivates the game', () => {
    const slime = makeSlimeStub('gentle');
    game.begin(slime);
    game.close();
    expect(game.active).toBe(false);
  });

  it('renders word buttons in the DOM', () => {
    const slime = makeSlimeStub('curious');
    game.begin(slime);
    const strip = document.getElementById('taming-strip');
    expect(strip).not.toBeNull();
    const buttons = strip!.querySelectorAll('button');
    expect(buttons.length).toBe(4);  // 4 choices in round 0
  });

  it('strip is removed from DOM after close()', () => {
    const slime = makeSlimeStub('lonely');
    game.begin(slime);
    game.close();
    expect(document.getElementById('taming-strip')).toBeNull();
  });

  it('triggers onSuccess when score meets threshold for best-matched personality', () => {
    // A 'bold' slime picking the bold-best words across all 3 rounds:
    // round0 word0 (bold+25) + round1 word3 (bold+25) + round2 word1 (bold+25) = 75 ≥ 45
    const slime = makeSlimeStub('bold');
    let successFired = false;
    let failFired = false;
    game.onSuccess = () => { successFired = true; };
    game.onFail    = () => { failFired = true; };
    game.begin(slime);

    // "Brave wanderer" — bold +25 (round 0)
    clickButton(game, 0);
    // "Together we'll be bold" — bold +25 (round 1)
    clickButton(game, 3);

    // Round 2 — "Through storm and shadow" (bold +25)
    const strips = document.querySelectorAll('#taming-strip');
    const strip = strips[strips.length - 1] as HTMLElement;
    const buttons = strip.querySelectorAll('button');
    (buttons[1] as HTMLButtonElement).click();  // word1 chosen
    // First update: reacting → success (fires onSuccess callback)
    game.update(2.0);
    expect(successFired).toBe(true);
    expect(failFired).toBe(false);
    // Second update: success timer expires → close
    game.update(2.0);
    expect(game.active).toBe(false);
  });

  it('triggers onFail when score falls short', () => {
    // A 'gentle' slime: picking all anti-match (bold-best) words scores −35 < 45
    const slime = makeSlimeStub('gentle');
    let successFired = false;
    let failFired = false;
    game.onSuccess = () => { successFired = true; };
    game.onFail    = () => { failFired = true; };
    game.begin(slime);

    // All "bold" words — bad for a gentle slime
    clickButton(game, 0);  // "Brave wanderer" (gentle −10)
    clickButton(game, 3);  // "Together we'll be bold" (gentle −10)

    // Round 2 — "Through storm and shadow" (gentle −15)
    const strips2 = document.querySelectorAll('#taming-strip');
    const strip2 = strips2[strips2.length - 1] as HTMLElement;
    (strip2.querySelectorAll('button')[1] as HTMLButtonElement).click();
    game.update(2.0);   // reacting → fail (fires onFail)
    expect(failFired).toBe(true);
    expect(successFired).toBe(false);
    game.update(2.0);   // fail timer expires → close
    expect(game.active).toBe(false);
  });

  it('calls tameReact on the slime once per round', () => {
    const slime = makeSlimeStub('curious');
    game.begin(slime);

    // Round 0 — "Curious little one" (curious +25 → 'great')
    const getStrip = () => {
      const els = document.querySelectorAll('#taming-strip');
      return els[els.length - 1] as HTMLElement;
    };
    (getStrip().querySelectorAll('button')[2] as HTMLButtonElement).click();
    const reacts = (slime as unknown as { _reactions: string[] })._reactions;
    // tameReact fires inside _onWordChosen, before phase changes
    expect(reacts.length).toBe(1);
    expect(reacts[0]).toBe('great');

    game.update(2.0);  // advance to round 1

    // Round 1 — "We'll see new worlds" (curious +25 → 'great')
    (getStrip().querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(reacts.length).toBe(2);
    expect(reacts[1]).toBe('great');

    game.update(2.0);  // advance to round 2

    // Round 2 — "Ever forward, ever free" (curious +25 → 'great')
    (getStrip().querySelectorAll('button')[3] as HTMLButtonElement).click();
    expect(reacts.length).toBe(3);

    // clean up
    game.update(2.0);
    game.update(2.0);
  });
});
