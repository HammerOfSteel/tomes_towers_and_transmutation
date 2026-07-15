/**
 * DialogueOverlay — cinematic typewriter speech + choice cards.
 *
 * Design: fullscreen overlay, pointer-events off by default.
 * Only the bottom 22% carries dialogue text; choice cards appear above it.
 * Dark glassmorphism styling — everything semi-transparent over the scene.
 *
 * Usage:
 *   const overlay = new DialogueOverlay();
 *   overlay.mount(document.body);
 *   await overlay.fadeIn();
 *   await overlay.speak("Hello, traveller.", "The Wizard");
 *   const idx = await overlay.choose(["Option A", "Option B"]);
 *   await overlay.fadeOut();
 *   overlay.unmount();
 */

// ── CSS injected once ─────────────────────────────────────────────────────────

let _cssInjected = false;
function _injectCSS(): void {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ngo-root {
      position: absolute; inset: 0;
      pointer-events: none;
      z-index: 10;
      font-family: 'Georgia', 'Palatino Linotype', serif;
    }

    /* Full-screen fade to black */
    .ngo-blackout {
      position: absolute; inset: 0;
      background: #000;
      opacity: 0;
      transition: opacity 0.1s linear;
      pointer-events: none;
    }

    /* Speech panel ─────────────────────────────────── */
    .ngo-speech {
      position: absolute;
      bottom: 0; left: 50%;
      transform: translateX(-50%);
      width: min(720px, 86vw);
      padding: 18px 26px 22px;
      background: rgba(4, 6, 16, 0.84);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(100, 80, 180, 0.22);
      border-bottom: none;
      border-radius: 10px 10px 0 0;
      pointer-events: none;
      opacity: 0;
      transform: translateX(-50%) translateY(8px);
      transition: opacity 0.35s ease, transform 0.35s ease;
    }
    .ngo-speech.ngo--visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: auto;
    }
    .ngo-speaker {
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(160, 140, 220, 0.7);
      margin-bottom: 8px;
    }
    .ngo-text {
      font-size: 17px;
      line-height: 1.65;
      color: #e8e0d4;
      min-height: 2em;
    }
    .ngo-cursor {
      display: inline-block;
      width: 2px; height: 1.1em;
      background: rgba(200, 180, 255, 0.8);
      vertical-align: text-bottom;
      animation: ngo-blink 0.9s step-end infinite;
      margin-left: 2px;
    }
    @keyframes ngo-blink { 0%,100%{ opacity:1 } 50%{ opacity:0 } }

    /* Skip hint */
    .ngo-skip-hint {
      font-size: 11px;
      color: rgba(140, 130, 160, 0.5);
      text-align: right;
      margin-top: 6px;
    }

    /* Choice cards ─────────────────────────────────── */
    .ngo-choices {
      position: absolute;
      bottom: 0; left: 50%;
      transform: translateX(-50%);
      width: min(720px, 86vw);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0 0 12px 0;
      pointer-events: none;
    }

    .ngo-card {
      flex: 1 1 calc(50% - 4px);
      min-width: 220px;
      padding: 13px 18px;
      background: rgba(8, 10, 24, 0.80);
      border: 1px solid rgba(100, 80, 180, 0.28);
      border-radius: 7px;
      cursor: pointer;
      color: #d8d0e8;
      font-size: 15px;
      line-height: 1.45;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(14px);
      transition: background 0.15s, border-color 0.15s, transform 0.22s ease, opacity 0.22s ease;
      user-select: none;
    }
    .ngo-card:hover {
      background: rgba(20, 18, 50, 0.90);
      border-color: rgba(160, 130, 255, 0.55);
    }
    .ngo-card.ngo--card-in {
      opacity: 1;
      transform: translateY(0);
    }
    .ngo-card.ngo--selected {
      background: rgba(60, 40, 130, 0.65);
      border-color: rgba(180, 150, 255, 0.8);
      animation: ngo-shimmer 0.45s ease-out forwards;
    }
    @keyframes ngo-shimmer {
      0%   { box-shadow: 0 0 0 rgba(140,100,255,0); }
      40%  { box-shadow: 0 0 18px rgba(140,100,255,0.6); }
      100% { box-shadow: 0 0 0 rgba(140,100,255,0); }
    }
    .ngo-card-key {
      display: inline-block;
      width: 20px; height: 20px;
      line-height: 20px; text-align: center;
      font-size: 11px; font-family: monospace;
      background: rgba(80, 60, 150, 0.5);
      border-radius: 3px;
      margin-right: 9px;
      color: rgba(200, 180, 255, 0.8);
      vertical-align: middle;
    }

    /* Stat toast ───────────────────────────────────── */
    .ngo-toast {
      position: absolute;
      bottom: 28px; right: 28px;
      padding: 10px 18px;
      background: rgba(4, 6, 16, 0.88);
      border: 1px solid rgba(180, 150, 255, 0.35);
      border-radius: 6px;
      color: #d0c8f8;
      font-size: 14px;
      pointer-events: none;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .ngo-toast.ngo--visible {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);
}

// ── class ──────────────────────────────────────────────────────────────────────

export class DialogueOverlay {
  private _root:      HTMLElement;
  private _blackout:  HTMLElement;
  private _speech:    HTMLElement;
  private _speaker:   HTMLElement;
  private _textEl:    HTMLElement;
  private _cursor:    HTMLElement;
  private _choices:   HTMLElement;
  private _toast:     HTMLElement;

  constructor() {
    _injectCSS();

    this._root = _el('div', 'ngo-root');

    this._blackout = _el('div', 'ngo-blackout');

    this._speech = _el('div', 'ngo-speech');
    this._speaker = _el('div', 'ngo-speaker');
    this._textEl  = _el('div', 'ngo-text');
    this._cursor  = _el('span', 'ngo-cursor');
    const hint    = _el('div', 'ngo-skip-hint');
    hint.textContent = 'click or space to skip';
    this._speech.append(this._speaker, this._textEl, hint);

    this._choices = _el('div', 'ngo-choices');
    this._toast   = _el('div', 'ngo-toast');

    this._root.append(this._blackout, this._speech, this._choices, this._toast);
  }

  mount(container: HTMLElement): void {
    container.style.position = container.style.position || 'relative';
    container.appendChild(this._root);
  }

  unmount(): void {
    this._root.remove();
  }

  // ── fade ──────────────────────────────────────────────────────────────────

  fadeIn(ms = 1200): Promise<void> {
    return new Promise<void>((resolve) => {
      this._blackout.style.transition = `opacity ${ms}ms linear`;
      this._blackout.style.opacity    = '1';
      // fade IN = go from black to transparent
      requestAnimationFrame(() => {
        this._blackout.style.transition = `opacity ${ms}ms linear`;
        this._blackout.style.opacity    = '0';
        setTimeout(resolve, ms + 50);
      });
    });
  }

  fadeOut(ms = 2000): Promise<void> {
    return new Promise<void>((resolve) => {
      this._blackout.style.transition = `opacity ${ms}ms linear`;
      this._blackout.style.opacity    = '1';
      setTimeout(resolve, ms + 50);
    });
  }

  // ── speech ────────────────────────────────────────────────────────────────

  /**
   * Typewriter-animate the given text. Speaker name shown above.
   * Returns a promise that resolves when complete (or skipped).
   */
  speak(text: string, speaker = '— The Wizard'): Promise<void> {
    return new Promise<void>((resolve) => {
      this._speaker.textContent = speaker;
      this._textEl.textContent  = '';
      this._textEl.appendChild(this._cursor);
      this._speech.classList.add('ngo--visible');

      let i = 0;
      const INTERVAL = 28; // ms per character

      const flush = () => {
        this._textEl.textContent = text;
        this._textEl.appendChild(this._cursor);
        cleanup();
        resolve();
      };

      const tick = setInterval(() => {
        if (i >= text.length) { clearInterval(tick); cleanup(); resolve(); return; }
        this._textEl.textContent = text.slice(0, ++i);
        this._textEl.appendChild(this._cursor);
      }, INTERVAL);

      const onSkip = () => { clearInterval(tick); flush(); };

      const cleanup = () => {
        document.removeEventListener('keydown', _skipKey);
        this._speech.removeEventListener('click', onSkip);
        this._cursor.remove();
      };

      const _skipKey = (e: KeyboardEvent) => {
        if (e.code === 'Space') { e.preventDefault(); onSkip(); }
      };
      document.addEventListener('keydown', _skipKey, { once: true });
      this._speech.addEventListener('click', onSkip, { once: true });
    });
  }

  hideSpeech(): void {
    this._speech.classList.remove('ngo--visible');
  }

  // ── choices ───────────────────────────────────────────────────────────────

  /**
   * Show choice cards. Returns a promise resolving with the 0-based selected index.
   */
  choose(choices: string[]): Promise<number> {
    return new Promise<number>((resolve) => {
      this._choices.innerHTML = '';

      // Move speech panel up to make room if it's visible
      if (this._speech.classList.contains('ngo--visible')) {
        const rowHeight = Math.ceil(choices.length / 2);
        this._speech.style.bottom = `${rowHeight * 68 + 20}px`;
      }

      choices.forEach((text, idx) => {
        const card = _el('div', 'ngo-card');
        const key  = _el('span', 'ngo-card-key');
        key.textContent = String(idx + 1);
        card.append(key, document.createTextNode(text));
        this._choices.appendChild(card);

        // Staggered slide-in
        setTimeout(() => card.classList.add('ngo--card-in'), idx * 80 + 60);

        card.addEventListener('click', () => { pickChoice(idx); }, { once: true });
      });

      const pickChoice = (idx: number) => {
        document.removeEventListener('keydown', onKey);
        const cards = Array.from(this._choices.querySelectorAll('.ngo-card')) as HTMLElement[];
        cards[idx]?.classList.add('ngo--selected');
        setTimeout(() => {
          this._choices.innerHTML = '';
          this._speech.style.bottom = '';
          resolve(idx);
        }, 420);
      };

      const onKey = (e: KeyboardEvent) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= choices.length) { pickChoice(n - 1); }
      };
      document.addEventListener('keydown', onKey);
    });
  }

  // ── stat toast ────────────────────────────────────────────────────────────

  showStatGain(label: string): void {
    this._toast.textContent = label;
    this._toast.classList.add('ngo--visible');
    setTimeout(() => this._toast.classList.remove('ngo--visible'), 1800);
  }

  clear(): void {
    this._choices.innerHTML = '';
    this._speech.classList.remove('ngo--visible');
    this._speech.style.bottom = '';
  }
}

// ── utils ──────────────────────────────────────────────────────────────────────

function _el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = cls;
  return el;
}
