// ── PauseMenu ─────────────────────────────────────────────────────────────

export interface PauseMenuActions {
  onOpenEditor:    () => void;
  onOpenDevPanel?: () => void;
  /** Open the character stats sheet (available from pause menu). */
  onOpenStats?:    () => void;
  /** Save current game state to the active slot. */
  onSave?:         () => void;
  /** Enter creative mode (dev builds only). */
  onEnterCreative?: () => void;
  /** Open the Backrooms portal list (dev builds only). */
  onOpenBackrooms?: () => void;
}

/** Full-screen pause overlay, opened via Escape.
 *  Key routing is handled externally (main.ts); this class only manages
 *  the overlay DOM and open/close state.
 *
 *  Designed to be extended with more menu items over time. */
export class PauseMenu {
  private _open = false;
  private overlay: HTMLElement | null = null;

  constructor(private readonly actions: PauseMenuActions) {}

  get isOpen(): boolean { return this._open; }

  open(): void {
    if (this._open) return;
    this._open = true;
    this._buildOverlay();
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this.overlay?.remove();
    this.overlay = null;
  }

  dispose(): void { this.close(); }

  // ── DOM ───────────────────────────────────────────────────────────────

  private _buildOverlay(): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;inset:0;',
      'background:rgba(5,4,12,0.88);',
      'display:flex;align-items:center;justify-content:center;',
      'z-index:8000;',
    ].join('');

    overlay.innerHTML = `
      <div style="${CARD_STYLE}">
        <div style="${RUNE_STYLE}">✦ ⬡ ✦</div>
        <h1 style="${TITLE_STYLE}">Tomes, Towers<br><span style="font-size:0.7em;letter-spacing:4px;">&amp; Transmutation</span></h1>
        <div style="${DIVIDER_STYLE}"></div>

        <button class="pm-btn" data-action="resume" style="${BTN_STYLE}">
          <span style="color:#44cc88;">▶</span>&nbsp; Resume
        </button>

        ${this.actions.onSave ? `
        <button class="pm-btn" data-action="save" style="${BTN_STYLE}">
          <span style="color:#cc9944;">✦</span>&nbsp; Save Chronicle
        </button>` : ''}

        <button class="pm-btn" data-action="editor" style="${BTN_STYLE}">
          <span style="color:#ff9933;">⬡</span>&nbsp; Level Editor
        </button>

        ${this.actions.onOpenStats ? `
        <button class="pm-btn" data-action="stats" style="${BTN_STYLE}">
          <span style="color:#44aaff;">✦</span>&nbsp; Character
        </button>` : ''}

        ${localStorage.getItem('ttt_dev_mode') === 'true' ? `
        <button class="pm-btn" data-action="devpanel" style="${BTN_STYLE.replace('#44405a','#5a3a22').replace('#44405a','#5a3a22')}">
          <span style="color:#cc8844;">⚙</span>&nbsp; Dev Panel
        </button>
        <div style="${DIVIDER_STYLE}margin:10px 0 6px;"></div>
        <div style="font-size:9px;letter-spacing:3px;color:rgba(255,255,255,0.2);text-align:center;margin-bottom:6px">DEV LABS</div>
        <button class="pm-btn" data-action="creative" style="${BTN_STYLE.replace('#44405a','#2a1040')}">
          <span style="color:#cc88ff;">🎨</span>&nbsp; Creative Mode
        </button>
        <button class="pm-btn" data-action="backrooms" style="${BTN_STYLE.replace('#44405a','#0a1a2a')}">
          <span style="color:#4488ff;">🧪</span>&nbsp; Dev Backrooms
        </button>` : ''}

        <div style="${DIVIDER_STYLE}margin-top:18px;"></div>

        <div style="${HINT_STYLE}">Press <kbd style="${KBD_STYLE}">Esc</kbd> to resume</div>
      </div>
    `;

    // Hover effect via class — simpler than inline events
    for (const btn of overlay.querySelectorAll<HTMLElement>('.pm-btn')) {
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#2a2840';
        btn.style.borderColor = '#6658aa';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.borderColor = '#44405a';
      });
      btn.addEventListener('click', () => {
        const action = btn.dataset['action'];
        if (action === 'resume') {
          this.close();
        } else if (action === 'save') {
          this.actions.onSave?.();
          // brief visual feedback — flash button text
          btn.textContent = '✦ Saved!';
          setTimeout(() => { btn.innerHTML = '<span style="color:#cc9944;">✦</span>&nbsp; Save Chronicle'; }, 1400);
        } else if (action === 'editor') {
          this.close();
          this.actions.onOpenEditor();
        } else if (action === 'stats') {
          this.close();
          this.actions.onOpenStats?.();
        } else if (action === 'devpanel') {
          this.close();
          this.actions.onOpenDevPanel?.();
        } else if (action === 'creative') {
          this.close();
          this.actions.onEnterCreative?.();
        } else if (action === 'backrooms') {
          this.close();
          this.actions.onOpenBackrooms?.();
        }
      });
    }

    // Click outside the card to resume
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.body.appendChild(overlay);
    this.overlay = overlay;
  }
}

// ── Style constants ───────────────────────────────────────────────────────

const CARD_STYLE = [
  'background:rgba(14,12,22,0.97);',
  'border:1px solid #44405a;border-radius:10px;',
  'padding:36px 48px;min-width:280px;',
  'display:flex;flex-direction:column;align-items:center;',
  'gap:10px;',
  'box-shadow:0 0 60px rgba(100,70,200,0.15);',
].join('');

const RUNE_STYLE = [
  'color:#44405a;font-size:18px;letter-spacing:8px;',
  'margin-bottom:4px;',
].join('');

const TITLE_STYLE = [
  'color:#c8b88a;font-family:serif;font-size:22px;',
  'font-weight:normal;text-align:center;',
  'line-height:1.5;letter-spacing:2px;',
  'margin:0 0 4px;',
].join('');

const DIVIDER_STYLE = [
  'width:100%;height:1px;',
  'background:linear-gradient(to right,transparent,#44405a,transparent);',
  'margin:6px 0;',
].join('');

const BTN_STYLE = [
  'width:100%;padding:11px 20px;',
  'background:transparent;border:1px solid #44405a;',
  'border-radius:6px;cursor:pointer;',
  'color:#ccc;font:15px/1 monospace;',
  'text-align:left;letter-spacing:1px;',
  'transition:background 0.12s,border-color 0.12s;',
].join('');

const HINT_STYLE = 'color:#444;font:11px monospace;margin-top:4px;';
const KBD_STYLE = [
  'background:#1a1828;border:1px solid #444;',
  'border-radius:3px;padding:1px 5px;color:#888;',
].join('');
