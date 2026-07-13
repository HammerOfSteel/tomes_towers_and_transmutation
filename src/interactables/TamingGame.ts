// ── TamingGame — "The Princess's Song" ────────────────────────────────────────
//
//  A 3-round word-picking mini-game used to recruit fleeing slimes.
//  Each slime has a hidden personality (bold / gentle / curious / lonely).
//  The player picks verse fragments each round; the score against the slime's
//  personality determines whether the taming succeeds (threshold: 45 / 75 pts).
//
//  Usage:
//    const taming = new TamingGame();
//    taming.onSuccess = (slime) => party.recruit(slime);
//    taming.onFail    = ()      => { /* slime bolts */ };
//    taming.begin(slime);   // shows overlay; slime must be in 'flee' state
//    // call taming.update(dt) every frame (inside exterior game-loop branch)

import type { SlimeEnemy } from '@/enemy/SlimeEnemy';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SlimePersonality = 'bold' | 'gentle' | 'curious' | 'lonely';

type Phase = 'idle' | 'choosing' | 'reacting' | 'success' | 'fail';

interface SongWord {
  /** Text shown on the choice button. */
  button: string;
  /** Fragment that appends to the growing verse. */
  verse: string;
  scores: Record<SlimePersonality, number>;
}

// ── Song Data ─────────────────────────────────────────────────────────────────

const SONG_ROUNDS: SongWord[][] = [
  // Round 0 — Greeting (how you address the slime)
  [
    {
      button: 'Brave wanderer',
      verse: '"Brave wanderer..."',
      scores: { bold: 25, curious: 15, gentle: -10, lonely: -5 },
    },
    {
      button: 'Gentle spirit',
      verse: '"Gentle spirit..."',
      scores: { gentle: 25, lonely: 15, bold: -10, curious: 5 },
    },
    {
      button: 'Curious little one',
      verse: '"Curious little one..."',
      scores: { curious: 25, bold: 10, gentle: 5, lonely: -5 },
    },
    {
      button: 'Lonely heart',
      verse: '"Lonely heart..."',
      scores: { lonely: 25, gentle: 15, bold: -15, curious: 5 },
    },
  ],
  // Round 1 — Promise (what you offer)
  [
    {
      button: "I'll walk beside you",
      verse: "I'll walk beside you...",
      scores: { lonely: 25, gentle: 20, bold: -5, curious: 5 },
    },
    {
      button: "We'll see new worlds",
      verse: "We'll see new worlds...",
      scores: { curious: 25, bold: 15, gentle: -5, lonely: 5 },
    },
    {
      button: "I'll keep you safe",
      verse: "I'll keep you safe...",
      scores: { gentle: 25, lonely: 20, bold: -10, curious: -5 },
    },
    {
      button: "Together we'll be bold",
      verse: "Together we'll be bold...",
      scores: { bold: 25, curious: 15, gentle: -10, lonely: 5 },
    },
  ],
  // Round 2 — Closing flourish (the song's last line)
  [
    {
      button: 'Into the light, forever',
      verse: '...into the light, forever. ♪"',
      scores: { lonely: 25, gentle: 15, bold: -5, curious: 10 },
    },
    {
      button: 'Through storm and shadow',
      verse: '...through storm and shadow. ♪"',
      scores: { bold: 25, curious: 15, gentle: -15, lonely: -5 },
    },
    {
      button: 'In peace, always',
      verse: '...in peace, always. ♪"',
      scores: { gentle: 25, lonely: 20, bold: -15, curious: -5 },
    },
    {
      button: 'Ever forward, ever free',
      verse: '...ever forward, ever free. ♪"',
      scores: { curious: 25, bold: 20, gentle: -5, lonely: -5 },
    },
  ],
];

const SCORE_THRESHOLD = 45;

// Reaction text shown in the overlay after each choice
const REACTION_TEXT: Record<string, string> = {
  great:   '💛 The creature\'s eyes light up!',
  good:    '💚 It sways gently with interest...',
  neutral: '💙 It listens, uncertain...',
  bad:     '🩷 It pulls away from the sound...',
};

// ── TamingGame ────────────────────────────────────────────────────────────────

export class TamingGame {
  private _slime: SlimeEnemy | null = null;
  private _phase: Phase = 'idle';
  private _round = 0;
  private _totalScore = 0;
  private _reactionTimer = 0;
  private _verseLines: string[] = [];
  private _overlay: HTMLDivElement | null = null;
  private _verseEl: HTMLParagraphElement | null = null;
  private _resonanceEl: HTMLDivElement | null = null;
  private _reactionEl: HTMLParagraphElement | null = null;
  private _choicesEl: HTMLDivElement | null = null;

  onSuccess: ((slime: SlimeEnemy) => void) | null = null;
  onFail: (() => void) | null = null;

  get active(): boolean { return this._phase !== 'idle'; }

  // ── Public API ─────────────────────────────────────────────────────────────

  begin(slime: SlimeEnemy): void {
    if (this._phase !== 'idle') return;
    this._slime = slime;
    this._phase = 'choosing';
    this._round = 0;
    this._totalScore = 0;
    this._verseLines = [];
    this._buildOverlay();
    this._showRound();
  }

  /** Call every frame while active. Handles timed phase transitions. */
  update(dt: number): void {
    if (this._phase === 'reacting') {
      this._reactionTimer -= dt;
      if (this._reactionTimer <= 0) {
        this._round++;
        if (this._round >= SONG_ROUNDS.length) {
          this._handleFinalResult();
        } else {
          this._phase = 'choosing';
          this._showRound();
        }
      }
    } else if (this._phase === 'success' || this._phase === 'fail') {
      this._reactionTimer -= dt;
      if (this._reactionTimer <= 0) {
        this.close();
      }
    }
  }

  /** Close and clean up the overlay without triggering callbacks (ESC / walk away). */
  close(): void {
    this._phase = 'idle';
    this._overlay?.remove();
    this._overlay = null;
    this._verseEl = null;
    this._resonanceEl = null;
    this._reactionEl = null;
    this._choicesEl = null;
    this._slime = null;
  }

  // ── Private — game logic ──────────────────────────────────────────────────

  private _onWordChosen(wordIndex: number): void {
    if (this._phase !== 'choosing' || !this._slime) return;
    const word = SONG_ROUNDS[this._round][wordIndex];
    const personality = this._slime.personality;
    const score = word.scores[personality];
    this._totalScore += score;
    this._verseLines.push(word.verse);

    const quality =
      score >= 20 ? 'great' :
      score >= 8  ? 'good'  :
      score >= 0  ? 'neutral' : 'bad';

    this._slime.tameReact(quality as 'great' | 'good' | 'neutral' | 'bad');
    this._showReaction(quality, word.verse);
    this._phase = 'reacting';
    this._reactionTimer = 1.3;
  }

  private _handleFinalResult(): void {
    if (!this._slime) return;
    if (this._totalScore >= SCORE_THRESHOLD) {
      this._phase = 'success';
      this._reactionTimer = 1.8;
      this._showSuccess();
      this.onSuccess?.(this._slime);
    } else {
      this._phase = 'fail';
      this._reactionTimer = 1.2;
      this._showFail();
      this.onFail?.();
    }
  }

  // ── Private — DOM overlay ─────────────────────────────────────────────────

  private _buildOverlay(): void {
    const el = document.createElement('div');
    el.id = 'taming-overlay';

    Object.assign(el.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '380px',
      background: 'rgba(8,4,20,0.97)',
      border: '2px solid #6644aa',
      borderRadius: '12px',
      padding: '20px 24px',
      color: '#d4c8e8',
      fontFamily: '"Palatino Linotype", Palatino, serif',
      zIndex: '900',
      boxShadow: '0 0 32px rgba(100,60,180,0.6)',
      userSelect: 'none',
    });

    // Title
    const title = document.createElement('h2');
    title.textContent = '♪  The Princess\'s Song  ♪';
    Object.assign(title.style, {
      margin: '0 0 12px 0',
      textAlign: 'center',
      fontSize: '16px',
      color: '#e8d88c',
      letterSpacing: '2px',
      fontWeight: 'normal',
    });
    el.appendChild(title);

    // Separator
    el.appendChild(this._makeSep());

    // Verse display
    const verseEl = document.createElement('p');
    verseEl.textContent = '\u00a0';  // non-breaking space placeholder
    Object.assign(verseEl.style, {
      minHeight: '52px',
      fontStyle: 'italic',
      fontSize: '13px',
      color: '#b8a8d8',
      lineHeight: '1.6',
      margin: '8px 0',
      whiteSpace: 'pre-line',
    });
    this._verseEl = verseEl;
    el.appendChild(verseEl);

    // Resonance bar
    const resonanceWrap = document.createElement('div');
    Object.assign(resonanceWrap.style, {
      margin: '6px 0 10px 0',
    });
    const resLabel = document.createElement('div');
    resLabel.textContent = '♫ Resonance';
    Object.assign(resLabel.style, {
      fontSize: '11px',
      color: '#9980cc',
      marginBottom: '4px',
      letterSpacing: '1px',
    });
    resonanceWrap.appendChild(resLabel);
    const resBg = document.createElement('div');
    Object.assign(resBg.style, {
      background: '#1a0e2e',
      borderRadius: '4px',
      height: '8px',
      width: '100%',
      overflow: 'hidden',
    });
    const resFill = document.createElement('div');
    Object.assign(resFill.style, {
      height: '100%',
      width: '0%',
      background: 'linear-gradient(90deg, #6644aa, #cc99ff)',
      borderRadius: '4px',
      transition: 'width 0.4s ease',
    });
    resBg.appendChild(resFill);
    resonanceWrap.appendChild(resBg);
    this._resonanceEl = resFill as unknown as HTMLDivElement;
    el.appendChild(resonanceWrap);

    el.appendChild(this._makeSep());

    // Reaction text
    const reactionEl = document.createElement('p');
    reactionEl.textContent = '\u00a0';
    Object.assign(reactionEl.style, {
      minHeight: '22px',
      fontSize: '13px',
      textAlign: 'center',
      margin: '6px 0',
      color: '#c8c0e0',
      fontStyle: 'italic',
    });
    this._reactionEl = reactionEl;
    el.appendChild(reactionEl);

    el.appendChild(this._makeSep());

    // Choose label
    const chooseLabel = document.createElement('p');
    chooseLabel.textContent = 'Choose your words:';
    Object.assign(chooseLabel.style, {
      fontSize: '12px',
      color: '#9980cc',
      margin: '8px 0 6px 0',
      letterSpacing: '1px',
    });
    el.appendChild(chooseLabel);

    // Choices container
    const choicesEl = document.createElement('div');
    Object.assign(choicesEl.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    });
    this._choicesEl = choicesEl;
    el.appendChild(choicesEl);

    // ESC hint
    const hint = document.createElement('p');
    hint.textContent = 'ESC — abandon the song';
    Object.assign(hint.style, {
      fontSize: '10px',
      color: '#554466',
      textAlign: 'center',
      marginTop: '12px',
      marginBottom: '0',
    });
    el.appendChild(hint);

    document.body.appendChild(el);
    this._overlay = el;
  }

  private _showRound(): void {
    if (!this._choicesEl) return;
    this._choicesEl.innerHTML = '';
    if (this._reactionEl) this._reactionEl.textContent = '\u00a0';

    const words = SONG_ROUNDS[this._round];
    words.forEach((word, i) => {
      const btn = document.createElement('button');
      btn.textContent = word.button;
      Object.assign(btn.style, {
        background: '#1e0e34',
        border: '1px solid #4422aa',
        borderRadius: '6px',
        color: '#d4c8e8',
        fontFamily: 'inherit',
        fontSize: '13px',
        padding: '8px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s, border-color 0.15s',
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#2e1a44';
        btn.style.borderColor = '#8866cc';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#1e0e34';
        btn.style.borderColor = '#4422aa';
      });
      btn.addEventListener('click', () => {
        // Disable all buttons once one is clicked
        if (this._choicesEl) {
          this._choicesEl.querySelectorAll('button').forEach(b => {
            (b as HTMLButtonElement).disabled = true;
            (b as HTMLButtonElement).style.opacity = '0.4';
            (b as HTMLButtonElement).style.cursor = 'default';
          });
        }
        this._onWordChosen(i);
      });
      this._choicesEl!.appendChild(btn);
    });
  }

  private _showReaction(quality: string, verseLine: string): void {
    // Update verse
    if (this._verseEl) {
      this._verseLines[this._round] = verseLine;
      this._verseEl.textContent = this._verseLines.join('\n');
    }
    // Update resonance bar
    if (this._resonanceEl) {
      const pct = Math.max(0, Math.min(100, (this._totalScore / SCORE_THRESHOLD) * 100));
      (this._resonanceEl as HTMLElement).style.width = `${pct}%`;
      // Colour hint: green if on track, red if behind
      const onTrack = this._totalScore >= (SCORE_THRESHOLD / SONG_ROUNDS.length) * (this._round + 1);
      (this._resonanceEl as HTMLElement).style.background = onTrack
        ? 'linear-gradient(90deg, #6644aa, #88ddbb)'
        : 'linear-gradient(90deg, #6622aa, #cc4466)';
    }
    // Reaction text
    if (this._reactionEl) {
      this._reactionEl.textContent = REACTION_TEXT[quality] ?? '\u00a0';
    }
    // Hide choices during reaction pause
    if (this._choicesEl) this._choicesEl.style.opacity = '0.3';
    setTimeout(() => {
      if (this._choicesEl) this._choicesEl.style.opacity = '1';
    }, this._reactionTimer * 1000);
  }

  private _showSuccess(): void {
    if (!this._overlay) return;
    if (this._choicesEl) this._choicesEl.innerHTML = '';
    if (this._reactionEl) {
      this._reactionEl.style.color = '#88ff88';
      this._reactionEl.style.fontSize = '15px';
      this._reactionEl.textContent = '♪ A new friend! ♪';
    }
    this._overlay.style.borderColor = '#88ff88';
    this._overlay.style.boxShadow = '0 0 40px rgba(80,220,120,0.7)';
  }

  private _showFail(): void {
    if (!this._overlay) return;
    if (this._choicesEl) this._choicesEl.innerHTML = '';
    if (this._reactionEl) {
      this._reactionEl.style.color = '#cc4466';
      this._reactionEl.style.fontSize = '14px';
      this._reactionEl.textContent = '♪ The melody fades... ♪';
    }
    this._overlay.style.borderColor = '#aa3344';
    this._overlay.style.boxShadow = '0 0 24px rgba(180,40,80,0.5)';
  }

  private _makeSep(): HTMLHRElement {
    const hr = document.createElement('hr');
    Object.assign(hr.style, {
      border: 'none',
      borderTop: '1px solid #3a1e5e',
      margin: '8px 0',
    });
    return hr;
  }
}
