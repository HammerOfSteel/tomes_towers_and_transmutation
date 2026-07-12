/** Minimal HTML HUD — HP bar + kill counter.
 *
 *  Creates its own DOM nodes; call `dispose()` to remove them.
 *  Call `update(hp, maxHp, kills, totalEnemies)` each frame (or on change).
 */
export class HUD {
  private readonly root: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly killText: HTMLSpanElement;
  private readonly floorText: HTMLSpanElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '16px',
      left: '16px',
      fontFamily: 'monospace',
      color: '#cce8ff',
      userSelect: 'none',
      pointerEvents: 'none',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);

    // ── HP bar ────────────────────────────────────────────────────────────
    const hpRow = document.createElement('div');
    Object.assign(hpRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '6px',
    } satisfies Partial<CSSStyleDeclaration>);

    const hpLabel = document.createElement('span');
    hpLabel.textContent = 'HP';
    hpLabel.style.fontSize = '13px';

    const hpTrack = document.createElement('div');
    Object.assign(hpTrack.style, {
      width: '140px',
      height: '10px',
      background: 'rgba(0,0,0,0.5)',
      border: '1px solid #446688',
      borderRadius: '3px',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);

    this.hpFill = document.createElement('div');
    Object.assign(this.hpFill.style, {
      height: '100%',
      width: '100%',
      background: '#44ddff',
      transition: 'width 0.1s ease, background 0.2s ease',
      borderRadius: '3px',
    } satisfies Partial<CSSStyleDeclaration>);
    hpTrack.appendChild(this.hpFill);

    this.hpText = document.createElement('span');
    this.hpText.style.fontSize = '12px';

    hpRow.append(hpLabel, hpTrack, this.hpText);

    // ── Kill counter ──────────────────────────────────────────────────────
    this.killText = document.createElement('div');
    this.killText.style.fontSize = '12px';

    this.root.append(hpRow, this.killText);

    // ── Floor indicator ───────────────────────────────────────────────
    this.floorText = document.createElement('div');
    Object.assign(this.floorText.style, {
      fontSize: '12px',
      marginTop: '4px',
      color: '#aabbcc',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.floorText);

    document.body.appendChild(this.root);
  }

  update(hp: number, maxHp: number, kills: number, total: number, floor = 0): void {
    const pct = Math.max(0, (hp / maxHp) * 100);
    this.hpFill.style.width = `${pct}%`;
    this.hpFill.style.background = pct > 50 ? '#44ddff' : pct > 25 ? '#ffcc44' : '#ff4444';
    this.hpText.textContent = `${hp}/${maxHp}`;
    this.killText.textContent = `Enemies: ${kills}/${total}`;
    const floorLabel = floor === 0 ? 'Ground' : floor > 0 ? `Floor ${floor}` : `Basement ${Math.abs(floor)}`;
    this.floorText.textContent = `▲ ${floorLabel}`;
  }

  dispose(): void {
    this.root.remove();
  }
}
