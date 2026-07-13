// ── MainMenu ───────────────────────────────────────────────────────────────
//
// Full-screen animated main menu with:
//  • Concept-art masonry gallery (8 tiles, staggered cross-fade, no duplicates)
//  • Play modal with 3 localStorage save slots
//  • Settings modal (volume, fullscreen)
//  • Credits modal
//  • Controls modal
//
// NOTE: Concept art images are served from /concept_art/ (project root).
//       For production builds, move that folder into /public/concept_art/.

// ── Image pool ────────────────────────────────────────────────────────────

const CONCEPT_ART = [
  '/concept_art/tower_study.png',
  '/concept_art/punk_rock_mage.png',
  '/concept_art/cozy_study.png',
  '/concept_art/dungeon_exploration.png',
  '/concept_art/hiking_with_slimey.png',
  '/concept_art/potion_making.png',
  '/concept_art/practice_hermalism.png',
  '/concept_art/practice_magic.png',
  '/concept_art/practice_magic_2.png',
  '/concept_art/rainy_day.png',
  '/concept_art/sunlit_hammock.png',
];

// ── Grid layout ───────────────────────────────────────────────────────────
//
//  Col:  1          2          3          4
//  R1:  [tall]    [normal]   [tall]     [tall]
//  R2:  [tall]    [wide 2×1..........]  [tall]
//  R3:  [normal]  [normal]   [wide 2×1..........]
//
// 8 tiles; 11 images → 3 always in the pool for rotation.

interface TilePos {
  col: string;
  row: string;
}

const TILE_POSITIONS: TilePos[] = [
  { col: '1',          row: '1 / span 2' }, // 0 tall-left
  { col: '2',          row: '1'          }, // 1 normal
  { col: '3',          row: '1 / span 2' }, // 2 tall-mid
  { col: '4',          row: '1 / span 2' }, // 3 tall-right
  { col: '2 / span 2', row: '2'          }, // 4 wide-mid
  { col: '1',          row: '3'          }, // 5 normal-bl
  { col: '2',          row: '3'          }, // 6 normal
  { col: '3 / span 2', row: '3'          }, // 7 wide-br
];

const NUM_TILES = TILE_POSITIONS.length;

// Image swap timing
const SWAP_MIN_MS  = 7_000;
const SWAP_MAX_MS  = 14_000;
const FADE_MS      = 1_400;  // CSS transition duration
const STAGGER_MS   = 1_300;  // per-tile offset on initial start

// LocalStorage helpers
const lsSave   = (i: number) => `ttt_save_${i}`;
const LS_VOL   = 'ttt_vol';
const NUM_SLOTS = 3;

interface SaveData {
  location: string;
  floor: number;
  timestamp: number;
}

export interface MainMenuOptions {
  /** Called when the player picks a save slot. */
  onPlay: (slotId: number) => void;
}

// ── MainMenu class ────────────────────────────────────────────────────────

export class MainMenu {
  private readonly overlay: HTMLElement;
  private readonly tiles: Array<{ front: HTMLImageElement; back: HTMLImageElement }> = [];
  /** Index into CONCEPT_ART currently displayed in each tile. */
  private readonly current: number[];
  /** CONCEPT_ART indices not currently on screen. */
  private pool: number[];
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private _visible = true;

  constructor(private readonly opts: MainMenuOptions) {
    this._ensureFonts();
    this._ensureStyles();

    const order = shuffled(CONCEPT_ART.map((_, i) => i));
    this.current = order.slice(0, NUM_TILES);
    this.pool    = order.slice(NUM_TILES);

    this.overlay = this._buildDOM();
    document.body.appendChild(this.overlay);
    this._scheduleAll();
  }

  get isVisible(): boolean { return this._visible; }

  hide(): void {
    if (!this._visible) return;
    this._visible = false;
    this.overlay.style.opacity = '0';
    setTimeout(() => { this.overlay.style.display = 'none'; }, 520);
  }

  show(): void {
    this._visible = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => { this.overlay.style.opacity = '1'; });
  }

  dispose(): void {
    this.timers.forEach(clearTimeout);
    this.overlay.remove();
  }

  // ── DOM build ─────────────────────────────────────────────────────────

  private _buildDOM(): HTMLElement {
    const ov = mkEl('div', 'mm-overlay');

    // Header
    const header = mkEl('header', 'mm-header');
    const subtitle = mkEl('p', 'mm-subtitle');
    subtitle.textContent = 'Tomes, Towers & Transmutation';
    const title = mkEl('h1', 'mm-title');
    title.textContent = 'For Princesses';
    const nav = mkEl('nav', 'mm-nav');
    nav.append(
      mkBtn('Play',     'mm-btn', () => { this._renderSaveSlots(); this._openModal('mm-play'); }),
      mkBtn('Settings', 'mm-btn', () => this._openModal('mm-settings')),
      mkBtn('Controls', 'mm-btn', () => this._openModal('mm-controls')),
      mkBtn('Credits',  'mm-btn', () => this._openModal('mm-credits')),
    );
    header.append(subtitle, title, nav);

    // Masonry gallery
    const section = mkEl('section', 'mm-gallery');
    const frame   = mkEl('div', 'mm-frame');
    frame.insertAdjacentHTML('beforeend', corners());
    const grid = mkEl('div', 'mm-grid');

    TILE_POSITIONS.forEach((pos, i) => {
      const tile  = mkEl('div', 'mm-tile');
      tile.style.gridColumn = pos.col;
      tile.style.gridRow    = pos.row;

      const back  = document.createElement('img');
      back.className = 'mm-img mm-img--back';
      back.alt = '';
      back.draggable = false;

      const front = document.createElement('img');
      front.className = 'mm-img mm-img--front';
      front.src = CONCEPT_ART[this.current[i]];
      front.alt = '';
      front.draggable = false;

      tile.append(back, front);
      grid.appendChild(tile);
      this.tiles.push({ front, back });
    });

    frame.appendChild(grid);
    section.appendChild(frame);

    ov.append(
      header,
      section,
      this._buildPlayModal(),
      this._buildSettingsModal(),
      this._buildControlsModal(),
      this._buildCreditsModal(),
    );
    return ov;
  }

  // ── Play / save slot modal ─────────────────────────────────────────────

  private _buildPlayModal(): HTMLElement {
    const [modal, card] = mkModal('mm-play', 'Select Chronicle', () => this._closeModal('mm-play'));
    const slots = mkEl('div', 'mm-slots');
    slots.id = 'mm-slots';
    const footer = mkEl('div', 'mm-modal-footer');
    footer.appendChild(mkBtn('← Back', 'mm-slot-btn', () => this._closeModal('mm-play')));
    card.append(slots, footer);
    modal.appendChild(card);
    return modal;
  }

  private _renderSaveSlots(): void {
    const container = document.getElementById('mm-slots');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < NUM_SLOTS; i++) {
      const raw  = localStorage.getItem(lsSave(i));
      const data = raw ? (JSON.parse(raw) as SaveData) : null;
      const row  = mkEl('div', 'mm-save-row');

      if (data) {
        const date = new Date(data.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        row.innerHTML = `
          <div class="mm-save-info">
            <span class="mm-save-name">Chronicle ${i + 1}</span>
            <span class="mm-save-detail">${data.location} &middot; Floor ${data.floor} &middot; ${date}</span>
          </div>
          <div class="mm-save-actions">
            <button class="mm-slot-btn mm-slot-btn--play" data-i="${i}">Continue</button>
            <button class="mm-slot-btn mm-slot-btn--del"  data-i="${i}">✕</button>
          </div>`;
      } else {
        row.innerHTML = `
          <span class="mm-save-name mm-save-empty">Chronicle ${i + 1} — Empty</span>
          <button class="mm-slot-btn mm-slot-btn--play" data-i="${i}">New Game</button>`;
      }

      row.querySelectorAll<HTMLButtonElement>('.mm-slot-btn--play').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.i ?? '0');
          if (!data) {
            const save: SaveData = { location: 'The Cell', floor: 0, timestamp: Date.now() };
            localStorage.setItem(lsSave(idx), JSON.stringify(save));
          }
          this._closeModal('mm-play');
          this.hide();
          this.opts.onPlay(idx);
        });
      });
      row.querySelectorAll<HTMLButtonElement>('.mm-slot-btn--del').forEach(b => {
        b.addEventListener('click', () => {
          localStorage.removeItem(lsSave(parseInt(b.dataset.i ?? '0')));
          this._renderSaveSlots();
        });
      });

      container.appendChild(row);
    }
  }

  // ── Settings modal ─────────────────────────────────────────────────────

  private _buildSettingsModal(): HTMLElement {
    const vol = parseInt(localStorage.getItem(LS_VOL) ?? '80');
    const [modal, card] = mkModal('mm-settings', 'Grimoire Options', () => this._closeModal('mm-settings'));

    card.insertAdjacentHTML('beforeend', `
      <div class="mm-setting-row">
        <label class="mm-setting-label">Master Volume</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-vol" class="mm-slider" min="0" max="100" value="${vol}">
          <span id="mm-vol-val" class="mm-setting-val">${vol}%</span>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">Fullscreen</label>
        <label class="mm-toggle">
          <input type="checkbox" id="mm-fs">
          <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>
    `);

    const footer = mkEl('div', 'mm-modal-footer');
    footer.appendChild(mkBtn('Apply & Close', 'mm-slot-btn', () => this._closeModal('mm-settings')));
    card.appendChild(footer);

    const slider = card.querySelector<HTMLInputElement>('#mm-vol')!;
    const valEl  = card.querySelector<HTMLSpanElement>('#mm-vol-val')!;
    slider.addEventListener('input', () => {
      valEl.textContent = `${slider.value}%`;
      localStorage.setItem(LS_VOL, slider.value);
    });

    const fsCb = card.querySelector<HTMLInputElement>('#mm-fs')!;
    fsCb.checked = !!document.fullscreenElement;
    fsCb.addEventListener('change', () => {
      if (fsCb.checked) document.documentElement.requestFullscreen().catch(() => {});
      else              document.exitFullscreen().catch(() => {});
    });

    modal.appendChild(card);
    return modal;
  }

  // ── Controls modal ────────────────────────────────────────────────────

  private _buildControlsModal(): HTMLElement {
    const [modal, card] = mkModal('mm-controls', 'Tome of Controls', () => this._closeModal('mm-controls'));

    const rows: [string, string][] = [
      ['W A S D',         'Move'],
      ['Shift',           'Run'],
      ['Space',           'Jump'],
      ['E  (near book)',  'Read interactable'],
      ['E  (open field)', 'Cast spell'],
      ['F',               'Dodge roll'],
      ['Left Click',      'Melee attack'],
      ['Mouse',           'Aim spells / attacks'],
      ['Escape',          'Pause / close'],
      ['` (tilde)',       'Level Editor (dev)'],
    ];

    const table = mkEl('div', 'mm-controls-table');
    rows.forEach(([key, action]) => {
      table.insertAdjacentHTML('beforeend', `
        <div class="mm-ctrl-row">
          <kbd class="mm-kbd">${key}</kbd>
          <span class="mm-ctrl-action">${action}</span>
        </div>`);
    });

    const footer = mkEl('div', 'mm-modal-footer');
    footer.appendChild(mkBtn('Close', 'mm-slot-btn', () => this._closeModal('mm-controls')));
    card.append(table, footer);
    modal.appendChild(card);
    return modal;
  }

  // ── Credits modal ─────────────────────────────────────────────────────

  private _buildCreditsModal(): HTMLElement {
    const [modal, card] = mkModal('mm-credits', 'The Grimoire\'s Colophon', () => this._closeModal('mm-credits'));

    card.insertAdjacentHTML('beforeend', `
      <div class="mm-credits-body">
        <p class="mm-credits-role">Design, Code &amp; World</p>
        <p class="mm-credits-name">Terry Goleman</p>

        <div class="mm-credits-div"></div>

        <p class="mm-credits-role">Concept Art</p>
        <p class="mm-credits-name">AI-assisted illustrations</p>

        <div class="mm-credits-div"></div>

        <p class="mm-credits-role">Built With</p>
        <p class="mm-credits-small">Three.js &nbsp;·&nbsp; Rapier3D &nbsp;·&nbsp; Vite &nbsp;·&nbsp; TypeScript</p>

        <div class="mm-credits-div"></div>

        <p class="mm-credits-quote">
          <em>"Do not read aloud unless you mean it."</em><br>
          — W
        </p>
      </div>
    `);

    const footer = mkEl('div', 'mm-modal-footer');
    footer.appendChild(mkBtn('Close', 'mm-slot-btn', () => this._closeModal('mm-credits')));
    card.appendChild(footer);
    modal.appendChild(card);
    return modal;
  }

  // ── Modal helpers ──────────────────────────────────────────────────────

  private _openModal(id: string): void {
    document.getElementById(id)?.classList.add('mm-modal--open');
  }

  private _closeModal(id: string): void {
    document.getElementById(id)?.classList.remove('mm-modal--open');
  }

  // ── Masonry crossfade ──────────────────────────────────────────────────

  private _scheduleAll(): void {
    for (let i = 0; i < NUM_TILES; i++) {
      const delay = 2_800 + i * STAGGER_MS + randInt(0, 2_000);
      this.timers[i] = setTimeout(() => this._swapTile(i), delay);
    }
  }

  private _swapTile(i: number): void {
    if (this.pool.length === 0) {
      this.timers[i] = setTimeout(() => this._swapTile(i), SWAP_MIN_MS);
      return;
    }

    const { front, back } = this.tiles[i];
    // Pick a random candidate from the pool
    const newIdx = this.pool[Math.floor(Math.random() * this.pool.length)];

    const preload = new Image();
    preload.onload = () => {
      // Update accounting before any DOM change
      this.pool = this.pool.filter(x => x !== newIdx);
      this.pool.push(this.current[i]);
      this.current[i] = newIdx;

      back.src = CONCEPT_ART[newIdx];

      // Two rAF to ensure the back image is painted before we start the fade
      requestAnimationFrame(() => requestAnimationFrame(() => {
        back.style.opacity  = '1';
        front.style.opacity = '0';

        setTimeout(() => {
          front.src           = back.src;
          front.style.opacity = '1';
          back.style.opacity  = '0';
          back.src            = '';

          this.timers[i] = setTimeout(
            () => this._swapTile(i),
            SWAP_MIN_MS + randInt(0, SWAP_MAX_MS - SWAP_MIN_MS),
          );
        }, FADE_MS + 80);
      }));
    };
    preload.onerror = () => {
      // Image failed — retry after a short wait without burning a cycle
      this.timers[i] = setTimeout(() => this._swapTile(i), 3_000);
    };
    preload.src = CONCEPT_ART[newIdx];
  }

  // ── Font / style injection ─────────────────────────────────────────────

  private _ensureFonts(): void {
    if (document.getElementById('mm-gfonts')) return;
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com';
    (pre2 as HTMLLinkElement & { crossOrigin: string }).crossOrigin = 'anonymous';
    const lnk = document.createElement('link');
    lnk.id = 'mm-gfonts';
    lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=IM+Fell+English:ital@0;1&display=swap';
    document.head.append(pre1, pre2, lnk);
  }

  private _ensureStyles(): void {
    if (document.getElementById('mm-css')) return;
    const s = document.createElement('style');
    s.id = 'mm-css';
    s.textContent = MM_CSS;
    document.head.appendChild(s);
  }
}

// ── Small DOM helpers ─────────────────────────────────────────────────────

function mkEl(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function mkBtn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button') as HTMLButtonElement;
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/** Build a modal overlay + card pair. Returns [overlay, card]. */
function mkModal(
  id: string,
  titleText: string,
  onBackdropClick: () => void,
): [HTMLElement, HTMLElement] {
  const overlay = mkEl('div', 'mm-modal');
  overlay.id = id;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) onBackdropClick(); });

  const card = mkEl('div', 'mm-modal-card');
  card.addEventListener('click', (e) => e.stopPropagation());
  card.insertAdjacentHTML('beforeend', corners());

  const h2 = mkEl('h2', 'mm-modal-title') as HTMLHeadingElement;
  h2.textContent = titleText;
  card.appendChild(h2);

  return [overlay, card];
}

function corners(): string {
  return `<span class="mm-corner mm-c-tl">✥</span>
          <span class="mm-corner mm-c-tr">✥</span>
          <span class="mm-corner mm-c-bl">✥</span>
          <span class="mm-corner mm-c-br">✥</span>`;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── CSS ───────────────────────────────────────────────────────────────────

const MM_CSS = `
/* ── Base overlay ───────────────────────────────────────────────────────── */
.mm-overlay {
  position: fixed; inset: 0; z-index: 9000;
  display: flex; flex-direction: column; align-items: center;
  overflow-y: auto;
  background: #1a1820;
  background-image:
    radial-gradient(circle at 50% -10%, rgba(157,124,206,.18) 0%, transparent 55%),
    radial-gradient(circle at 95% 95%,  rgba(85,60,120,.22) 0%,  transparent 40%);
  color: #e2d9c8;
  font-family: 'IM Fell English', Georgia, serif;
  opacity: 1;
  transition: opacity .5s ease;
  padding-bottom: 48px;
  scrollbar-width: thin;
  scrollbar-color: #4a4158 transparent;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.mm-header {
  text-align: center;
  width: 100%; max-width: 860px;
  padding: 52px 24px 28px;
}

.mm-subtitle {
  font-family: 'Cinzel', serif;
  font-size: 12px; letter-spacing: 6px; text-transform: uppercase;
  color: #9d7cce; margin-bottom: 14px;
}

.mm-title {
  font-family: 'Cinzel', serif;
  font-size: clamp(38px, 7.5vw, 82px);
  font-weight: 700; color: #fff;
  text-shadow: 0 0 35px rgba(157,124,206,.55), 0 5px 10px rgba(0,0,0,.85);
  letter-spacing: 4px; margin-bottom: 40px; line-height: 1.1;
}

/* ── Nav buttons ─────────────────────────────────────────────────────────── */
.mm-nav {
  display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;
}

.mm-btn {
  background: transparent;
  border: 2px solid #4a4158; border-radius: 4px;
  color: #e2d9c8;
  font-family: 'Cinzel', serif; font-size: 17px;
  padding: 11px 44px;
  cursor: pointer; text-transform: uppercase; letter-spacing: 2px;
  position: relative; overflow: hidden;
  transition: border-color .28s, color .28s, box-shadow .28s, transform .14s;
}
.mm-btn::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(157,124,206,.16), transparent);
  transform: translateX(-100%);
  transition: transform .48s ease;
}
.mm-btn:hover::after { transform: translateX(100%); }
.mm-btn:hover {
  border-color: #9d7cce; color: #fff;
  box-shadow: 0 0 22px rgba(157,124,206,.38);
  transform: translateY(-2px);
}
.mm-btn:active { transform: translateY(1px); }

/* ── Gallery frame ───────────────────────────────────────────────────────── */
.mm-gallery {
  width: 100%; max-width: 1160px;
  padding: 0 20px;
}

.mm-frame {
  position: relative;
  background: rgba(28,24,36,.72); border: 2px solid #4a4158; border-radius: 12px;
  padding: 22px;
  box-shadow: inset 0 0 55px rgba(0,0,0,.5), 0 12px 42px rgba(0,0,0,.42);
}

.mm-corner {
  position: absolute; color: #4a4158; font-size: 19px; line-height: 1;
  pointer-events: none;
}
.mm-c-tl { top:10px;  left:14px;  }
.mm-c-tr { top:10px;  right:14px; }
.mm-c-bl { bottom:10px; left:14px;  }
.mm-c-br { bottom:10px; right:14px; }

/* ── Masonry grid ─────────────────────────────────────────────────────────── */
.mm-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: 210px 210px 230px;
  gap: 13px;
}

.mm-tile {
  position: relative;
  border-radius: 8px; overflow: hidden;
  border: 1px solid rgba(255,255,255,.045);
  box-shadow: 0 4px 14px rgba(0,0,0,.42);
  background: #0f0d14;
  cursor: default;
  transition: transform .32s cubic-bezier(.25,.8,.25,1),
              box-shadow .32s,
              border-color .32s;
}
.mm-tile:hover {
  transform: scale(1.042) translateY(-4px);
  box-shadow: 0 14px 30px rgba(0,0,0,.55), 0 0 18px rgba(157,124,206,.22);
  border-color: rgba(157,124,206,.38);
  z-index: 5;
}

.mm-img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover;
  transition: opacity ${FADE_MS}ms ease-in-out;
  filter: brightness(.84) contrast(1.06);
  user-select: none;
}
.mm-img--front { opacity: 1; z-index: 2; }
.mm-img--back  { opacity: 0; z-index: 1; }
.mm-tile:hover .mm-img--front { filter: brightness(1.06) contrast(1.0); }

/* ── Modal overlay ───────────────────────────────────────────────────────── */
.mm-modal {
  position: fixed; inset: 0; z-index: 9200;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.84);
  backdrop-filter: blur(5px);
  opacity: 0; pointer-events: none;
  transition: opacity .32s ease;
}
.mm-modal.mm-modal--open {
  opacity: 1; pointer-events: auto;
}

.mm-modal-card {
  position: relative;
  background: rgba(26,22,34,.97); border: 2px solid #4a4158; border-radius: 12px;
  padding: 38px 46px; width: 90%; max-width: 580px;
  box-shadow: inset 0 0 50px rgba(0,0,0,.65), 0 22px 60px rgba(0,0,0,.6);
  transform: translateY(18px);
  transition: transform .38s cubic-bezier(.175,.885,.32,1.28);
  max-height: 85vh; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #4a4158 transparent;
}
.mm-modal.mm-modal--open .mm-modal-card {
  transform: translateY(0);
}

.mm-modal-title {
  font-family: 'Cinzel', serif; font-size: 22px; font-weight: 700;
  text-align: center; color: #9d7cce;
  margin-bottom: 24px; padding-bottom: 14px;
  border-bottom: 1px solid #4a4158; letter-spacing: 2px;
}

.mm-modal-footer {
  margin-top: 26px; text-align: center;
}

/* ── Save slots ──────────────────────────────────────────────────────────── */
.mm-save-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: rgba(0,0,0,.32); border: 1px solid #4a4158; border-radius: 6px;
  padding: 14px 16px; margin-bottom: 10px;
  transition: border-color .22s;
}
.mm-save-row:hover { border-color: #9d7cce; }

.mm-save-info { display: flex; flex-direction: column; gap: 5px; }
.mm-save-name {
  font-family: 'Cinzel', serif; font-size: 14px;
  color: #e2d9c8; letter-spacing: 1px;
}
.mm-save-detail { font-size: 11px; color: #9d7cce; font-family: monospace; }
.mm-save-empty { color: #5e5870 !important; font-style: italic; }
.mm-save-actions { display: flex; gap: 8px; flex-shrink: 0; }

/* ── Slot / action buttons ───────────────────────────────────────────────── */
.mm-slot-btn {
  background: transparent;
  border: 1px solid #9d7cce; border-radius: 4px;
  color: #e2d9c8;
  font-family: 'Cinzel', serif; font-size: 12px;
  padding: 7px 18px; cursor: pointer;
  text-transform: uppercase; letter-spacing: 1px;
  transition: background .2s, color .2s, box-shadow .2s;
  white-space: nowrap;
}
.mm-slot-btn:hover {
  background: #9d7cce; color: #fff;
  box-shadow: 0 0 12px rgba(157,124,206,.4);
}
.mm-slot-btn--del {
  border-color: #7a3030; color: #bb7070;
  padding: 7px 12px;
}
.mm-slot-btn--del:hover { background: #7a3030; color: #fff; box-shadow: 0 0 10px rgba(122,48,48,.4); }

/* ── Settings ────────────────────────────────────────────────────────────── */
.mm-setting-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 15px 0; gap: 16px;
  border-bottom: 1px solid rgba(255,255,255,.055);
}
.mm-setting-label {
  font-family: 'Cinzel', serif; font-size: 14px;
  letter-spacing: 1px; color: #e2d9c8;
}
.mm-setting-ctl { display: flex; align-items: center; gap: 11px; }

.mm-slider {
  -webkit-appearance: none; appearance: none;
  width: 150px; height: 4px;
  background: #4a4158; border-radius: 2px; cursor: pointer;
  accent-color: #9d7cce;
}
.mm-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px; height: 16px; border-radius: 50%;
  background: #9d7cce; cursor: pointer;
  box-shadow: 0 0 6px rgba(157,124,206,.5);
}

.mm-setting-val {
  font-family: monospace; font-size: 13px; color: #9d7cce;
  min-width: 38px; text-align: right;
}

/* Toggle switch */
.mm-toggle { position: relative; display: inline-flex; cursor: pointer; }
.mm-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.mm-toggle-track {
  width: 48px; height: 26px;
  background: #26223a; border: 1px solid #4a4158; border-radius: 13px;
  position: relative;
  transition: background .3s, border-color .3s;
}
.mm-toggle input:checked ~ .mm-toggle-track {
  background: #9d7cce; border-color: #9d7cce;
}
.mm-toggle-thumb {
  position: absolute; width: 18px; height: 18px;
  background: #c8bedd; border-radius: 50%;
  top: 3px; left: 3px;
  transition: transform .28s ease, background .28s;
}
.mm-toggle input:checked ~ .mm-toggle-track .mm-toggle-thumb {
  transform: translateX(22px); background: #fff;
}

/* ── Controls table ──────────────────────────────────────────────────────── */
.mm-controls-table { display: flex; flex-direction: column; gap: 8px; padding: 6px 0; }
.mm-ctrl-row {
  display: flex; align-items: center; gap: 16px;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.04);
}
.mm-kbd {
  display: inline-block; min-width: 138px;
  background: rgba(0,0,0,.4); border: 1px solid #4a4158; border-radius: 4px;
  padding: 4px 10px; text-align: center;
  font-family: monospace; font-size: 13px; color: #bfa5e6;
  flex-shrink: 0;
}
.mm-ctrl-action {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 14px; color: #e2d9c8;
}

/* ── Credits ─────────────────────────────────────────────────────────────── */
.mm-credits-body {
  text-align: center; display: flex; flex-direction: column;
  gap: 4px; padding: 8px 0;
}
.mm-credits-role {
  font-family: 'Cinzel', serif; font-size: 11px;
  letter-spacing: 3px; text-transform: uppercase; color: #9d7cce;
  margin-top: 10px;
}
.mm-credits-name {
  font-family: 'IM Fell English', Georgia, serif; font-size: 18px; color: #e2d9c8;
}
.mm-credits-small { font-family: monospace; font-size: 12px; color: #7a6888; }
.mm-credits-div {
  width: 60%; margin: 10px auto 0;
  height: 1px;
  background: linear-gradient(to right, transparent, #4a4158, transparent);
}
.mm-credits-quote {
  font-family: 'IM Fell English', Georgia, serif; font-style: italic;
  font-size: 14px; color: #7a6888; margin-top: 14px; line-height: 1.7;
}
`;
