// ── VictoryBanner ─────────────────────────────────────────────────────────────
//
//  Transient center-screen banner for floor-clear events.
//  Call show(label) to display; auto-dismisses after ~3.2 s.
export class VictoryBanner {
    overlay;
    titleEl;
    _timer = null;
    constructor() {
        this._ensureStyles();
        const { overlay, titleEl } = this._build();
        this.overlay = overlay;
        this.titleEl = titleEl;
        document.body.appendChild(this.overlay);
    }
    show(label) {
        if (this._timer !== null)
            clearTimeout(this._timer);
        this.titleEl.textContent = label;
        this.overlay.style.display = 'flex';
        requestAnimationFrame(() => this.overlay.classList.add('vb-open'));
        this._timer = setTimeout(() => this._dismiss(), 3200);
    }
    dispose() {
        if (this._timer !== null)
            clearTimeout(this._timer);
        this.overlay.remove();
    }
    _dismiss() {
        this.overlay.classList.remove('vb-open');
        setTimeout(() => { this.overlay.style.display = 'none'; }, 560);
        this._timer = null;
    }
    _build() {
        const overlay = document.createElement('div');
        overlay.id = 'victory-banner';
        overlay.className = 'vb-overlay';
        overlay.style.display = 'none';
        const card = document.createElement('div');
        card.className = 'vb-card';
        const rune = document.createElement('span');
        rune.className = 'vb-rune';
        rune.textContent = '✦';
        const titleEl = document.createElement('h2');
        titleEl.className = 'vb-title';
        const sub = document.createElement('p');
        sub.className = 'vb-sub';
        sub.textContent = 'The staircase beckons';
        card.append(rune, titleEl, sub);
        overlay.appendChild(card);
        return { overlay, titleEl };
    }
    _ensureStyles() {
        if (document.getElementById('vb-css'))
            return;
        const s = document.createElement('style');
        s.id = 'vb-css';
        s.textContent = VB_CSS;
        document.head.appendChild(s);
    }
}
// ── CSS ───────────────────────────────────────────────────────────────────
const VB_CSS = `
.vb-overlay {
  position: fixed; inset: 0; z-index: 9100;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}

.vb-card {
  text-align: center;
  opacity: 0;
  transform: translateY(-28px);
  transition: opacity .48s ease, transform .48s cubic-bezier(.175,.885,.32,1.28);
  padding: 28px 56px;
  background: rgba(18,15,26,.86);
  border: 2px solid #4a4158;
  border-radius: 10px;
  box-shadow: 0 0 55px rgba(157,124,206,.16), 0 14px 42px rgba(0,0,0,.65);
  backdrop-filter: blur(8px);
}
.vb-open .vb-card {
  opacity: 1;
  transform: translateY(0);
}

.vb-rune {
  display: block; font-size: 22px;
  color: #9d7cce; margin-bottom: 8px;
  animation: vb-spin 5s linear infinite;
}
@keyframes vb-spin { to { transform: rotate(360deg); } }

.vb-title {
  font-family: 'Cinzel', serif;
  font-size: clamp(22px, 4vw, 40px);
  font-weight: 700; color: #e2d9c8;
  text-shadow: 0 0 28px rgba(157,124,206,.45);
  letter-spacing: 4px; margin: 0 0 9px;
}

.vb-sub {
  font-family: 'IM Fell English', Georgia, serif;
  font-style: italic; font-size: 15px;
  color: #9d7cce; margin: 0;
}
`;
