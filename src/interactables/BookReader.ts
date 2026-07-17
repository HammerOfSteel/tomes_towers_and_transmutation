// ── BookReader ────────────────────────────────────────────────────────────

const PRETTY_TYPE: Record<string, string> = {
  bookshelf: 'BOOKSHELF',
  lectern:   'TOME ON LECTERN',
};

const PRETTY_SPELL: Record<string, string> = {
  flame_dart: 'Flame Dart',
  magic_bolt: 'Magic Bolt',
};

/** Full-screen parchment overlay that displays a book's text content.
 *  Close with Escape, clicking outside the card, or calling `close()`.
 *
 *  When `spellUnlock` is passed to `open()`, the overlay shows a
 *  "Spell Discovered" banner at the bottom of the card. */
export class BookReader {
  private _open = false;
  private overlay: HTMLElement | null = null;

  /** Fired once each time a book is opened: (itemType, content). */
  onOpen: ((itemType: string, content: string) => void) | null = null;

  get isOpen(): boolean { return this._open; }

  open(content: string, itemType: string, spellUnlock?: string): void {
    if (this._open) this.close();
    this._open = true;
    this.onOpen?.(itemType, content);
    this._buildOverlay(content, itemType, spellUnlock);
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this.overlay?.remove();
    this.overlay = null;
  }

  dispose(): void { this.close(); }

  // ── DOM ───────────────────────────────────────────────────────────────

  private _buildOverlay(content: string, itemType: string, spellUnlock?: string): void {
    const title = PRETTY_TYPE[itemType] ?? itemType.toUpperCase();

    const unlockBanner = spellUnlock ? `
      <div style="${UNLOCK_STYLE}">
        <span style="font-size:18px;">✦</span>
        &nbsp;Spell Discovered: <strong>${PRETTY_SPELL[spellUnlock] ?? spellUnlock}</strong>&nbsp;
        <span style="font-size:18px;">✦</span>
      </div>` : '';

    const overlay = document.createElement('div');
    overlay.style.cssText = OVERLAY_STYLE;
    overlay.innerHTML = `
      <div style="${CARD_STYLE}">
        <div style="${RUNE_STYLE}">✦ &nbsp; &nbsp; ✦</div>
        <div style="${TITLE_STYLE}">${title}</div>
        <div style="${DIVIDER_STYLE}"></div>
        <div style="${CONTENT_STYLE}">${escapeHtml(content)}</div>
        ${unlockBanner}
        <div style="${DIVIDER_STYLE}margin-top:18px;"></div>
        <div style="${HINT_STYLE}">Press <kbd style="${KBD_STYLE}">Esc</kbd> or click outside to close</div>
      </div>
    `;

    // Click background to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.body.appendChild(overlay);
    this.overlay = overlay;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ── Style constants ───────────────────────────────────────────────────────

const OVERLAY_STYLE = [
  'position:fixed;inset:0;',
  'background:rgba(0,0,0,0.72);',
  'display:flex;align-items:center;justify-content:center;',
  'z-index:7500;',
].join('');

const CARD_STYLE = [
  'background:#f5e6c0;',
  'border:3px solid #7a5022;',
  'border-radius:4px;',
  'padding:32px 40px;',
  'max-width:560px;width:90%;',
  'max-height:80vh;overflow-y:auto;',
  'display:flex;flex-direction:column;gap:8px;',
  'box-shadow:0 8px 40px rgba(0,0,0,0.6),inset 0 0 30px rgba(120,80,20,0.08);',
].join('');

const RUNE_STYLE = [
  'text-align:center;',
  'color:#a06828;font-size:14px;letter-spacing:12px;',
  'margin-bottom:2px;',
].join('');

const TITLE_STYLE = [
  'text-align:center;',
  'color:#3a1a04;font-size:13px;letter-spacing:4px;',
  'font-family:serif;font-weight:bold;',
].join('');

const DIVIDER_STYLE = [
  'height:1px;',
  'background:linear-gradient(to right,transparent,#a06828,transparent);',
  'margin:4px 0;',
].join('');

const CONTENT_STYLE = [
  'color:#2e1c0a;font-size:15px;line-height:1.8;',
  'font-family:Georgia,serif;',
  'padding:8px 0;white-space:pre-wrap;',
].join('');

const UNLOCK_STYLE = [
  'text-align:center;',
  'background:rgba(180,80,10,0.12);border:1px solid #c86414;border-radius:4px;',
  'padding:10px 16px;margin-top:8px;',
  'color:#7a3a04;font-size:14px;font-family:serif;letter-spacing:1px;',
].join('');

const HINT_STYLE = 'text-align:center;color:#8a6030;font:11px monospace;';
const KBD_STYLE = [
  'background:#e8d4a0;border:1px solid #a06828;',
  'border-radius:3px;padding:1px 5px;color:#5a3010;',
].join('');
