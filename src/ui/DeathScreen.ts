// ── DeathScreen ──────────────────────────────────────────────────────────────
//
//  Full-screen overlay shown when player HP reaches zero.
//  Requires Google Fonts (Cinzel + IM Fell English) already loaded by MainMenu.

export interface DeathScreenOptions {
  onRestart:  () => void;
  onMainMenu: () => void;
}

export class DeathScreen {
  private readonly el: HTMLElement;
  private _visible = false;

  constructor(private readonly opts: DeathScreenOptions) {
    this._ensureStyles();
    this.el = this._build();
    document.body.appendChild(this.el);
  }

  get isVisible(): boolean { return this._visible; }

  show(): void {
    if (this._visible) return;
    this._visible = true;
    this.el.style.display = 'flex';
    requestAnimationFrame(() => this.el.classList.add('ds-open'));
  }

  hide(): void {
    this._visible = false;
    this.el.classList.remove('ds-open');
    setTimeout(() => { this.el.style.display = 'none'; }, 420);
  }

  dispose(): void {
    this.el.remove();
  }

  private _build(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'death-screen';
    overlay.className = 'ds-overlay';
    overlay.style.display = 'none';

    overlay.innerHTML = `
      <div class="ds-card">
        <span class="ds-rune">✦</span>
        <h1 class="ds-title">The Ritual Failed</h1>
        <p class="ds-sub">
          Even so — the tower still stands.<br>
          The journal is still there.<br>
          The notes are still yours.
        </p>
        <div class="ds-btns">
          <button class="ds-btn ds-btn--primary" id="ds-retry">Try Again</button>
          <button class="ds-btn" id="ds-menu">Return to Sanctum</button>
        </div>
      </div>
    `;

    overlay.querySelector('#ds-retry')!.addEventListener('click', () => {
      this.hide();
      this.opts.onRestart();
    });
    overlay.querySelector('#ds-menu')!.addEventListener('click', () => {
      this.hide();
      this.opts.onMainMenu();
    });

    return overlay;
  }

  private _ensureStyles(): void {
    if (document.getElementById('ds-css')) return;
    const s = document.createElement('style');
    s.id = 'ds-css';
    s.textContent = DS_CSS;
    document.head.appendChild(s);
  }
}

// ── CSS ───────────────────────────────────────────────────────────────────

const DS_CSS = `
.ds-overlay {
  position: fixed; inset: 0; z-index: 9500;
  display: flex; align-items: center; justify-content: center;
  background: rgba(8,4,6,0);
  backdrop-filter: blur(0px);
  transition: background .42s ease, backdrop-filter .42s ease;
}
.ds-overlay.ds-open {
  background: rgba(8,4,6,.9);
  backdrop-filter: blur(7px);
}

.ds-card {
  text-align: center;
  opacity: 0;
  transform: translateY(28px) scale(.95);
  transition: opacity .5s ease .08s, transform .5s cubic-bezier(.175,.885,.32,1.28) .08s;
  padding: 0 28px;
}
.ds-open .ds-card {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.ds-rune {
  display: block; font-size: 38px;
  color: #aa2222;
  text-shadow: 0 0 22px rgba(200,40,40,.5);
  margin-bottom: 18px;
  animation: ds-pulse 2.6s ease-in-out infinite;
}
@keyframes ds-pulse {
  0%,100% { opacity:.65; text-shadow: 0 0 18px rgba(180,30,30,.4); }
  50%      { opacity:1;   text-shadow: 0 0 42px rgba(210,50,50,.8); }
}

.ds-title {
  font-family: 'Cinzel', serif;
  font-size: clamp(32px, 6vw, 68px);
  font-weight: 700; color: #cc3333;
  text-shadow: 0 0 40px rgba(170,30,30,.55), 0 4px 8px rgba(0,0,0,.9);
  letter-spacing: 4px; margin-bottom: 18px; line-height: 1.1;
}

.ds-sub {
  font-family: 'IM Fell English', Georgia, serif;
  font-style: italic;
  font-size: clamp(13px, 1.8vw, 17px);
  color: #8a7070; line-height: 2; margin-bottom: 46px;
}

.ds-btns { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }

.ds-btn {
  background: transparent;
  border: 2px solid #552222; border-radius: 4px;
  color: #e2d9c8;
  font-family: 'Cinzel', serif; font-size: 14px;
  padding: 11px 38px; cursor: pointer;
  text-transform: uppercase; letter-spacing: 2px;
  position: relative; overflow: hidden;
  transition: border-color .25s, color .25s, box-shadow .25s, transform .14s;
}
.ds-btn::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(200,60,60,.1), transparent);
  transform: translateX(-100%); transition: transform .45s ease;
}
.ds-btn:hover::after { transform: translateX(100%); }
.ds-btn:hover {
  border-color: #cc3333; color: #fff;
  box-shadow: 0 0 20px rgba(170,40,40,.32);
  transform: translateY(-2px);
}
.ds-btn:active { transform: translateY(1px); }
.ds-btn--primary {
  border-color: #773333;
  background: rgba(90,18,18,.35);
}
.ds-btn--primary:hover { background: rgba(130,28,28,.45); }
`;
