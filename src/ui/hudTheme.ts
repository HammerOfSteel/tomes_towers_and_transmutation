/**
 * hudTheme — shared design system for all in-game UI panels.
 *
 * Injects one <style> tag once.  All panels import and call injectHudTheme()
 * (idempotent) then use the CSS custom properties and component classes below.
 *
 * Palette
 *   --hud-bg          deep void background
 *   --hud-surface     card / panel surface
 *   --hud-border      cool purple border (spell/dungeon aesthetic)
 *   --hud-border-warm warm parchment border (NPC / quest aesthetic)
 *   --hud-gold        headings, active elements, story quests
 *   --hud-text        primary body text
 *   --hud-muted       secondary / hint text
 *   --hud-danger      HP critical, death
 *   --hud-info        spells, cool tones
 *   --hud-success     completion, positive
 *
 * Component classes
 *   .hud-panel          base panel card
 *   .hud-title          large Cinzel heading
 *   .hud-title-sm       small Cinzel heading / section label
 *   .hud-section-header full-width section divider with label
 *   .hud-divider        horizontal rule
 *   .hud-row            flex row, gap 8px, align center
 *   .hud-bar-track      progress bar track
 *   .hud-bar-fill       progress bar fill (set width inline)
 *   .hud-pill           small status pill
 *   .hud-kbd            keyboard key badge  [E]
 *   .hud-close-hint     muted close hint text
 *   .hud-btn            small action button
 *   .hud-btn-primary    primary CTA button
 *   .hud-scrollable     scrollable panel body
 */

const THEME_CSS = `
/* ── Custom properties ── */
:root {
  --hud-bg:          #0d0b13;
  --hud-surface:     #1a1428;
  --hud-surface-alt: #140f20;
  --hud-border:      #3d2d55;
  --hud-border-warm: #5a3a1a;
  --hud-gold:        #c8963c;
  --hud-gold-bright: #f0c060;
  --hud-text:        #e8d4a0;
  --hud-muted:       #6a5a4a;
  --hud-muted-cool:  #4a4060;
  --hud-danger:      #cc4444;
  --hud-danger-dim:  #882222;
  --hud-info:        #44ddff;
  --hud-info-dim:    #1a5566;
  --hud-success:     #55bb66;
  --hud-success-dim: #1a4422;
  --hud-shadow:      0 8px 40px rgba(0,0,0,.92), 0 0 0 1px rgba(255,255,255,.03) inset;
  --hud-radius:      5px;
  --hud-radius-sm:   3px;
  --hud-font-serif:  'Cinzel', Georgia, serif;
  --hud-font-body:   Georgia, 'Times New Roman', serif;
  --hud-font-mono:   'Courier New', Courier, monospace;
}

/* ── Base panel ── */
.hud-panel {
  background: linear-gradient(160deg, var(--hud-surface) 0%, var(--hud-bg) 100%);
  border: 1px solid var(--hud-border);
  border-radius: var(--hud-radius);
  box-shadow: var(--hud-shadow);
  color: var(--hud-text);
  font-family: var(--hud-font-body);
  user-select: none;
}

.hud-panel--warm {
  border-color: var(--hud-border-warm);
  background: linear-gradient(160deg, #2a1e0f 0%, #1a1208 100%);
}

/* ── Typography ── */
.hud-title {
  font-family: var(--hud-font-serif);
  font-size: 15px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--hud-gold);
}

.hud-title-sm {
  font-family: var(--hud-font-serif);
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--hud-gold);
}

.hud-close-hint {
  font-family: var(--hud-font-mono);
  font-size: 10px;
  color: var(--hud-muted-cool);
  letter-spacing: 1px;
}

/* ── Section header (full-width divider with label) ── */
.hud-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0 8px;
  color: var(--hud-gold);
  font-family: var(--hud-font-serif);
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.hud-section-header::before,
.hud-section-header::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--hud-border-warm), transparent);
}

/* ── Divider ── */
.hud-divider {
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--hud-border), transparent);
  margin: 10px 0;
}

/* ── Row ── */
.hud-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Progress bars ── */
.hud-bar-track {
  height: 7px;
  background: rgba(0,0,0,.55);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 2px;
  overflow: hidden;
  flex: 1;
}

.hud-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width .12s ease;
}

.hud-bar-fill--hp    { background: var(--hud-info); }
.hud-bar-fill--hp.low { background: #ffcc44; }
.hud-bar-fill--hp.crit { background: var(--hud-danger); }
.hud-bar-fill--xp    { background: linear-gradient(90deg, #6644aa, var(--hud-gold)); }
.hud-bar-fill--stat  { background: linear-gradient(90deg, #5544aa, #8866dd); }
.hud-bar-fill--party { background: #55bb44; }

/* ── Pills ── */
.hud-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-family: var(--hud-font-mono);
  border: 1px solid rgba(255,255,255,.1);
  white-space: nowrap;
}

/* ── Key badge ── */
.hud-kbd {
  font-family: var(--hud-font-mono);
  font-size: 10px;
  color: var(--hud-muted);
  background: rgba(0,0,0,.45);
  border: 1px solid #1e2e3e;
  border-radius: 2px;
  padding: 1px 5px;
  line-height: 1.6;
  letter-spacing: .5px;
}

/* ── Buttons ── */
.hud-btn {
  background: rgba(80,50,120,0.2);
  border: 1px solid var(--hud-border);
  border-radius: var(--hud-radius-sm);
  color: var(--hud-text);
  font-family: var(--hud-font-serif);
  font-size: 11px;
  letter-spacing: 1px;
  padding: 4px 12px;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}
.hud-btn:hover {
  background: rgba(100,70,150,0.4);
  border-color: #6644aa;
}

.hud-btn-primary {
  background: rgba(80,50,30,0.5);
  border-color: var(--hud-border-warm);
  color: var(--hud-gold);
}
.hud-btn-primary:hover {
  background: rgba(120,80,40,0.6);
  border-color: var(--hud-gold);
}

.hud-btn-danger {
  border-color: var(--hud-danger-dim);
  color: #dd6655;
}
.hud-btn-danger:hover {
  background: rgba(100,20,20,0.5);
  border-color: var(--hud-danger);
}

/* ── Scrollable body ── */
.hud-scrollable {
  overflow-y: auto;
  flex: 1;
}
.hud-scrollable::-webkit-scrollbar { width: 4px; }
.hud-scrollable::-webkit-scrollbar-track { background: transparent; }
.hud-scrollable::-webkit-scrollbar-thumb { background: var(--hud-border); border-radius: 2px; }

/* ── Animations ── */
@keyframes hudFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes hudSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes hudPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}
@keyframes hudShake {
  0%, 100% { transform: translateX(0); }
  25%       { transform: translateX(-4px); }
  75%       { transform: translateX(4px); }
}

/* ── Toasts ── */
.hud-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: var(--hud-radius);
  font-family: var(--hud-font-serif);
  font-size: 13px;
  letter-spacing: 1px;
  pointer-events: none;
  z-index: 9999;
  animation: hudSlideUp .3s ease;
}
.hud-toast--beat {
  background: rgba(13,11,19,.92);
  border: 1px solid var(--hud-border);
  color: var(--hud-gold);
}
.hud-toast--act {
  background: rgba(42,30,15,.95);
  border: 1px solid var(--hud-border-warm);
  color: var(--hud-gold-bright);
  font-size: 15px;
}
`;

let _injected = false;

/** Inject the shared HUD design system once. Idempotent. */
export function injectHudTheme(): void {
  if (_injected) return;
  _injected = true;
  const s = document.createElement('style');
  s.id = 'hud-theme';
  s.textContent = THEME_CSS;
  document.head.appendChild(s);
}
