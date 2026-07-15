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

// ── CSS injected once (replaced on HMR) ─────────────────────────────────────

const NGO_STYLE_ID = 'ngo-dialogue-styles';
function _injectCSS(): void {
  // Remove any stale copy first so HMR always picks up the latest rules
  document.getElementById(NGO_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = NGO_STYLE_ID;
  style.textContent = `
    .ngo-root {
      position: absolute; inset: 0;
      pointer-events: none;
      z-index: 10;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    /* Full-screen fade to black */
    .ngo-blackout {
      position: absolute; inset: 0;
      background: #000;
      opacity: 0;
      transition: opacity 0.1s linear;
      pointer-events: none;
    }

    /* ── Speech panel: fixed to viewport top so it's always visible ── */
    .ngo-speech {
      position: fixed;
      top: 8%; left: 50%;
      transform: translate(-50%, 0);
      width: 90%; max-width: 720px;
      text-align: center;
      padding: 0;
      background: none;
      border: none;
      pointer-events: none;
      opacity: 0;
      transition: opacity 1.5s ease, transform 1.5s ease;
    }
    .ngo-speech.ngo--visible {
      opacity: 1;
      transform: translate(-50%, 0);
      pointer-events: auto;
    }
    /* Wizard-fade: speech gently dissolves upward while player reads choices */
    .ngo-speech.ngo--faded {
      opacity: 0 !important;
      transform: translate(-50%, -10px) !important;
      transition: opacity 2s ease, transform 2s ease !important;
      pointer-events: none !important;
    }

    .ngo-speaker {
      color: rgba(255, 170, 0, 0.7);
      font-weight: 300;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 4px;
      margin-bottom: 15px;
      display: block;
    }
    .ngo-text {
      font-size: 1.4rem;
      font-weight: 300;
      font-style: italic;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.95);
      min-height: 2em;
      margin: 0;
      text-shadow: 0 4px 15px rgba(0,0,0,1), 0 2px 5px rgba(0,0,0,0.8);
    }
    .ngo-cursor {
      display: inline-block;
      width: 2px; height: 1.2em;
      background: rgba(255, 255, 255, 0.55);
      vertical-align: text-bottom;
      animation: ngo-blink 0.9s step-end infinite;
      margin-left: 3px;
      font-style: normal;
    }
    @keyframes ngo-blink { 0%,100%{ opacity:1 } 50%{ opacity:0 } }

    /* Skip hint */
    .ngo-skip-hint {
      font-size: 10px;
      color: rgba(255, 170, 0, 0.25);
      text-align: center;
      margin-top: 14px;
      letter-spacing: 1px;
    }

    /* ── Choice buttons: fixed to viewport bottom (bulletproof regardless of container) ── */
    .ngo-choices {
      position: fixed;
      bottom: 4%; left: 50%;
      transform: translate(-50%, 0);
      width: 90%; max-width: 800px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 0;
      pointer-events: none;
    }

    .ngo-card {
      width: 100%;
      background: transparent;
      border: none;
      padding: 6px 30px;
      cursor: pointer;
      color: rgba(255, 255, 255, 0.5);
      font-family: inherit;
      font-size: 1.05rem;
      text-align: center;
      line-height: 1.4;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(14px);
      transition: color 0.4s cubic-bezier(0.2,0,0.2,1),
                  letter-spacing 0.4s cubic-bezier(0.2,0,0.2,1),
                  opacity 0.22s ease,
                  transform 0.22s ease;
      user-select: none;
      position: relative;
      text-shadow: 0 2px 5px rgba(0,0,0,0.8);
    }
    .ngo-card:hover {
      color: #ffaa00;
      text-shadow: 0 2px 15px rgba(255, 170, 0, 0.6);
      letter-spacing: 1px;
      transform: scale(1.05);
    }
    /* ◈ amber decorators on hover */
    .ngo-card::before, .ngo-card::after {
      content: '◈';
      position: absolute;
      opacity: 0;
      color: #ffaa00;
      transition: all 0.4s ease;
      font-size: 0.85rem;
      top: 50%; transform: translateY(-50%);
    }
    .ngo-card::before { left:  8px; }
    .ngo-card::after  { right: 8px; }
    .ngo-card:hover::before { left:  2px; opacity: 1; }
    .ngo-card:hover::after  { right: 2px; opacity: 1; }

    .ngo-card.ngo--card-in {
      opacity: 1;
      transform: translateY(0);
    }
    .ngo-card.ngo--selected {
      color: #ffaa00;
      opacity: 0.65;
    }

    /* Hide numbered key boxes — pure POC look */
    .ngo-card-key { display: none; }

    /* ── Stat toast ── */
    .ngo-toast {
      position: absolute;
      bottom: 28px; right: 28px;
      padding: 10px 18px;
      background: rgba(4, 6, 16, 0.85);
      border: 1px solid rgba(255, 170, 0, 0.3);
      border-radius: 6px;
      color: rgba(255, 200, 100, 0.9);
      font-size: 13px;
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
  private _choices:   HTMLElement;
  private _toast:     HTMLElement;
  private _speechFadeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    _injectCSS();

    this._root = _el('div', 'ngo-root');

    this._blackout = _el('div', 'ngo-blackout');

    this._speech = _el('div', 'ngo-speech');
    this._speaker = _el('div', 'ngo-speaker');
    this._textEl  = _el('div', 'ngo-text');
    this._speech.append(this._speaker, this._textEl);

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
  /**
   * Show wizard speech with a POC-style fade-in.
   * If text is already visible it fades out first, then fades in the new line.
   * Resolves after the CSS fade-in completes so choices appear naturally after.
   */
  speak(text: string, speaker = '\u2014 The Wizard'): Promise<void> {
    return new Promise<void>((resolve) => {
      // Cancel any pending wizard-fade
      if (this._speechFadeTimer !== null) {
        clearTimeout(this._speechFadeTimer);
        this._speechFadeTimer = null;
      }

      const show = () => {
        this._speech.classList.remove('ngo--faded');
        this._speaker.textContent = speaker;
        this._textEl.textContent  = text;
        this._speech.classList.add('ngo--visible');
        setTimeout(resolve, 1500); // wait for CSS fade-in to complete
      };

      if (this._speech.classList.contains('ngo--visible')) {
        // Fade current line out first, then bring in the new one (POC crossfade)
        this._speech.classList.remove('ngo--visible');
        setTimeout(show, 700);
      } else {
        show();
      }
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

      // Cancel any existing fade timer (new line coming in)
      if (this._speechFadeTimer !== null) {
        clearTimeout(this._speechFadeTimer);
        this._speechFadeTimer = null;
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

      // Wizard-fade: speech dissolves ~4s after the last choice card appears (POC feel)
      const lastCardDelay = (choices.length - 1) * 80 + 60 + 300;
      this._speechFadeTimer = setTimeout(() => {
        this._speech.classList.add('ngo--faded');
        this._speechFadeTimer = null;
      }, lastCardDelay + 4000);

      const pickChoice = (idx: number) => {
        document.removeEventListener('keydown', onKey);
        if (this._speechFadeTimer !== null) {
          clearTimeout(this._speechFadeTimer);
          this._speechFadeTimer = null;
        }
        const cards = Array.from(this._choices.querySelectorAll('.ngo-card')) as HTMLElement[];
        cards[idx]?.classList.add('ngo--selected');
        setTimeout(() => {
          this._choices.innerHTML = '';
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
    if (this._speechFadeTimer !== null) {
      clearTimeout(this._speechFadeTimer);
      this._speechFadeTimer = null;
    }
    this._speech.classList.remove('ngo--visible', 'ngo--faded');
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
