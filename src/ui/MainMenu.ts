// ── MainMenu ───────────────────────────────────────────────────────────────
//
// Full-screen animated main menu with:
//  • Concept-art masonry gallery (8 tiles, staggered cross-fade, no duplicates)
//  • Play modal with 3 localStorage save slots
//  • Settings modal (volume, fullscreen)
//  • Lore modal (4-page book — Wizard's journal + Princess's account)
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
//  R1:  [tall]    [normal]   [normal]   [tall]
//  R2:  [tall]    [wide 2×1..........]  [tall]
//  R3:  [normal]  [normal]   [wide 2×1..........]
//
// tile 2 is intentionally normal (not tall) to avoid overlapping tile 4 (wide cols 2-3 row 2).
// 8 tiles; 11 images → 3 always in the pool for rotation.

interface TilePos {
  col: string;
  row: string;
}

const TILE_POSITIONS: TilePos[] = [
  { col: '1',          row: '1 / span 2' }, // 0 tall-left
  { col: '2',          row: '1'          }, // 1 normal
  { col: '3',          row: '1'          }, // 2 normal  ← not tall; avoids conflict with tile 4
  { col: '4',          row: '1 / span 2' }, // 3 tall-right
  { col: '2 / span 2', row: '2'          }, // 4 wide-mid (cols 2-3)
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

const LS_MUSIC_VISIBLE = 'ttt_music_visible';

// ── Music tracks (Dancing Salamanders — Glitchwitch) ─────────────────────
const TRACKS: readonly string[] = [
  'Lint',
  'bless this mess (and all its variables)',
  'breadcrumb cosmology',
  'checksum of the heart',
  'half hymn whole hashmap',
  'kettle logic',
  'kindly demons of the pantry',
  'leaven rise',
  'magpie logging',
  'meandering migration',
  'moss matrix',
  'patch day at the cottage',
];

interface SaveData {
  location: string;
  floor: number;
  timestamp: number;
}

// ── Lore pages ───────────────────────────────────────────────────────────

interface LorePage {
  chapterLabel: string;
  title: string;
  byline: string;
  body: string;        // HTML
}

const LORE_PAGES: LorePage[] = [
  {
    chapterLabel: 'Prologue',
    title: 'Tomes and Towers',
    byline: 'From the records of W., Wizard, Upper Order — suspended, pending review',
    body: `
      <p>Right. Where to begin.</p>
      <p>Perhaps with a clarification: I am not, as certain colleagues implied at the last Grand Convocation, <em>"losing his faculties."</em> My faculties are in exceptional working order. I can name all fourteen subspecies of the Cascading Vortex Moth from memory, translate Elven treatises on temporal harmonics whilst boiling an egg, and I once predicted a solar eclipse to within four minutes — the remaining four being attributable to continental drift, not error.</p>
      <p>The egg was fine, by the way. These things happen.</p>
      <p>What I <em>am</em> is busy. Impressively, productively busy, in ways that the uninitiated might misread as absent-mindedness but are in fact simply the natural consequence of operating at a higher cognitive frequency than most of one's contemporaries.</p>
      <p>I have a tower. A <em>good</em> tower — three generations of careful architectural decisions, seventeen wards, two basement levels (one of which is technically in a different dimension, but that's structural, not magical; there is a distinction), and a library that has been described, by those with sufficient vocabulary, as "formidable."</p>
      <p>I mention all of this because events have occurred in my absence that have since, I am told, taken on the quality of a <em>story.</em></p>
      <p>I do not write stories. I write <em>records.</em> What follows is a record of what happened when I left for what I was certain would be no more than a week, and returned to find my tower considerably more inhabited than I had left it.</p>
      <p>The tower was still standing. I want to be clear about that.</p>`,
  },
  {
    chapterLabel: 'Prologue, continued',
    title: 'On the Thoroughness of Locks',
    byline: 'From the records of W.',
    body: `
      <p>When I locked the tower, I locked it <em>thoroughly.</em></p>
      <p>Seventeen wards on the main door alone. Enchanted window shutters. A Confundment Field over the library rated to give a fully-trained archivist a week-long headache measurable on standard diagnostics. The second staircase is a defensive illusion — has been since 1842. The corridor between floors two and three contains traps that are, I am still quite proud to say, tasteful.</p>
      <p>In thirty-seven years of practice, not one person had successfully circumvented these measures. The Confundment Field specifically was designed to make the books feel <em>unreadable</em> — not illegible, but somehow beside the point, like trying to read a menu in a language you theoretically know but practically find tedious.</p>
      <p>What I had not accounted for — what I maintain no <em>reasonable</em> person could have accounted for — was the possibility that someone might simply find all of this funny, and read the books anyway, on principle, out of what can only be described as <em>spite.</em></p>
      <p>In my defence: the Field was rated for deterring adults with seven or more years of formal magical education. It was not rated for someone with nothing else to do and a high threshold for being told what not to think about.</p>
      <p>These things happen.</p>
      <p>I am still forming opinions about whether they should have.</p>`,
  },
  {
    chapterLabel: 'Chapter I',
    title: 'What I Understood About Towers (Before I Started Breaking Things)',
    byline: 'The personal accounts of Z. — uninvited guest, floor one, cell three',
    body: `
      <p>When I found the books, I want to be perfectly clear: I was not <em>snooping.</em></p>
      <p>I was <em>exploring.</em> There is an important distinction, and it is fundamentally dependent on whether the person who owns the things is present to object — which, as I had established over the course of several days, he very much was not.</p>
      <p>The cell wasn't terrible. I use the word descriptively, not dramatically, though I acknowledge it carries a certain drama regardless. There was a window. There was a bed with strong opinions about lumbar support. There was a bookshelf that extended upward in three separate directions, which I initially assumed was a shelving error and later understood to be entirely intentional and, frankly, impressive.</p>
      <p>The books had titles like: <em>On the Recursive Properties of Asymptotic Ward Fields,</em> and <em>A Catalogue of Observable Anomalies in Sub-Dimensional Space (Vol. XXIV),</em> and, memorably, <em>Why Everyone Else Is Wrong: A Corrective Analysis</em> — the author's initials embossed in gold on the spine, clearly by his own instruction, because he was quite pleased with it.</p>
      <p>It took me approximately four hours to realise no one was coming.</p>
      <p>Another four to understand this was, looked at correctly, rather good news.</p>`,
  },
  {
    chapterLabel: 'Chapter I, continued',
    title: 'Things I Now Know, and What I Intend to Do About Them',
    byline: 'Z.',
    body: `
      <p>By the end of the first week, I had pieced together the following:</p>
      <p>Towers, apparently, are a very <em>serious business</em> among Wizards.</p>
      <p>Not the buildings — buildings don't care; they simply stand there and occasionally settle. It's what the towers <em>represent.</em> Having a tower means you have a territory. A <em>tall</em> tower means the territory matters. The number of wards, the obscurity of the location, the complexity of the interior, the volume of the library — these are, as best I can determine, the primary metrics by which very old men in very large hats measure themselves against each other at conferences.</p>
      <p>By these measurements, my captor's tower is, conservatively, extraordinary. Which was somewhat alarming, since I had been operating on the comfortable assumption that I was dealing with a second-rate Wizard who had locked me up by accident and forgotten.</p>
      <p>The accident part, I still believe. The forgetting, clearly true.</p>
      <p>But the journal on the highest shelf — the one with the coffee stain on page forty-seven and the margin note reading <em>"do not let this fall into the wrong hands — W."</em> — suggested I had been significantly underestimating the situation.</p>
      <p>I made tea. I found a better candle. I borrowed the blank journal from the third drawer of the writing desk, which appeared to have been left there for correspondence the Wizard intended to write <em>eventually.</em></p>
      <p>I opened to the first page and wrote, at the top: <em>Things I Now Know About This Tower, and What I Intend to Do About Them.</em></p>
      <p>Then I turned back to volume one, page one, and I read.</p>`,
  },
];

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
  private _lorePage = 0;
  private _prevBtn: HTMLButtonElement | null = null;
  private _nextBtn: HTMLButtonElement | null = null;
  private _audio: HTMLAudioElement | null = null;
  private _trackIdx = 0;
  private _shuffling = false;
  private _songNameEl: HTMLElement | null = null;
  private _playPauseBtn: HTMLButtonElement | null = null;
  private _shuffleBtn: HTMLButtonElement | null = null;

  constructor(private readonly opts: MainMenuOptions) {
    this._ensureFonts();
    this._ensureStyles();

    const order = shuffled(CONCEPT_ART.map((_, i) => i));
    this.current = order.slice(0, NUM_TILES);
    this.pool    = order.slice(NUM_TILES);

    this.overlay = this._buildDOM();
    document.body.appendChild(this.overlay);
    this._scheduleAll();
    this._initAudio();
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
    if (this._audio) { this._audio.pause(); this._audio.src = ''; }
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
      mkBtn('Lore',     'mm-btn', () => { this._setLorePage(0); this._openModal('mm-lore'); }),
    );
    header.append(subtitle, title, nav, this._buildMusicPlayer());

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
      this._buildLoreModal(),
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

    const musicVis = localStorage.getItem(LS_MUSIC_VISIBLE) !== 'false';
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
      <div class="mm-setting-row">
        <label class="mm-setting-label">Music Player</label>
        <label class="mm-toggle">
          <input type="checkbox" id="mm-music-toggle" ${musicVis ? 'checked' : ''}>
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
      if (this._audio) this._audio.volume = parseInt(slider.value) / 100;
    });

    const fsCb = card.querySelector<HTMLInputElement>('#mm-fs')!;
    fsCb.checked = !!document.fullscreenElement;
    fsCb.addEventListener('change', () => {
      if (fsCb.checked) document.documentElement.requestFullscreen().catch(() => {});
      else              document.exitFullscreen().catch(() => {});
    });

    const musicToggle = card.querySelector<HTMLInputElement>('#mm-music-toggle')!;
    musicToggle.addEventListener('change', () => {
      const playerEl = document.getElementById('mm-player');
      if (playerEl) playerEl.style.display = musicToggle.checked ? 'flex' : 'none';
      localStorage.setItem(LS_MUSIC_VISIBLE, String(musicToggle.checked));
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

  // ── Lore / book modal ──────────────────────────────────────────────────

  private _buildLoreModal(): HTMLElement {
    const modal = mkEl('div', 'mm-modal');
    modal.id = 'mm-lore';
    modal.addEventListener('click', (e) => { if (e.target === modal) this._closeModal('mm-lore'); });

    const card = mkEl('div', 'mm-book-card');
    card.addEventListener('click', (e) => e.stopPropagation());

    // Close button (top-right of card)
    const closeX = mkBtn('✕', 'mm-book-close', () => this._closeModal('mm-lore'));
    card.appendChild(closeX);

    // Scrollable page content
    const pageWrap = mkEl('div', 'mm-book-page-wrap');
    const page = mkEl('div', 'mm-lore-page');
    page.id = 'mm-lore-page';
    pageWrap.appendChild(page);

    // Navigation bar
    const nav = mkEl('div', 'mm-book-nav');
    this._prevBtn = mkBtn('◄ Previous', 'mm-book-nav-btn', () => this._flipLore(-1)) as HTMLButtonElement;
    const pageNum = mkEl('span', 'mm-book-page-num') as HTMLSpanElement;
    pageNum.id = 'mm-book-pnum';
    this._nextBtn = mkBtn('Next ►', 'mm-book-nav-btn', () => this._flipLore(1)) as HTMLButtonElement;
    nav.append(this._prevBtn, pageNum, this._nextBtn);

    card.append(pageWrap, nav);
    modal.appendChild(card);

    // Render the first page now (DOM exists at this point)
    this._setLorePage(0);
    return modal;
  }

  private _setLorePage(idx: number): void {
    this._lorePage = Math.max(0, Math.min(idx, LORE_PAGES.length - 1));
    const p    = LORE_PAGES[this._lorePage];
    const page = document.getElementById('mm-lore-page');
    const pnum = document.getElementById('mm-book-pnum');

    if (page) {
      page.innerHTML = `
        <div class="mm-lore-chapter">${p.chapterLabel}</div>
        <h2 class="mm-lore-title">${p.title}</h2>
        <p class="mm-lore-byline">${p.byline}</p>
        <div class="mm-lore-rule"></div>
        <div class="mm-lore-body">${p.body}</div>
      `;
    }
    if (pnum) pnum.textContent = `${this._lorePage + 1} \u2013 ${LORE_PAGES.length}`;
    if (this._prevBtn) this._prevBtn.disabled = this._lorePage === 0;
    if (this._nextBtn) this._nextBtn.disabled = this._lorePage === LORE_PAGES.length - 1;
  }

  /** Animate page turn in direction +1 (forward) or -1 (back). */
  private _flipLore(dir: 1 | -1): void {
    const next = this._lorePage + dir;
    if (next < 0 || next >= LORE_PAGES.length) return;

    const page = document.getElementById('mm-lore-page');
    if (!page) return;

    const exitCls  = dir > 0 ? 'mm-flip-out-fwd'  : 'mm-flip-out-back';
    const enterCls = dir > 0 ? 'mm-flip-in-fwd'   : 'mm-flip-in-back';

    page.classList.add(exitCls);
    // Block nav during animation
    if (this._prevBtn) this._prevBtn.disabled = true;
    if (this._nextBtn) this._nextBtn.disabled = true;

    setTimeout(() => {
      page.classList.remove(exitCls);
      this._setLorePage(next);
      page.classList.add(enterCls);
      setTimeout(() => page.classList.remove(enterCls), 300);
    }, 260);
  }

  // ── Music player ───────────────────────────────────────────────────────

  private _buildMusicPlayer(): HTMLElement {
    const visible = localStorage.getItem(LS_MUSIC_VISIBLE) !== 'false';

    const wrap = mkEl('div', 'mm-player');
    wrap.id = 'mm-player';
    if (!visible) wrap.style.display = 'none';

    const prevBtn = mkBtn('⏮', 'mm-player-btn', () => this._prevTrack());
    prevBtn.title = 'Previous';

    this._playPauseBtn = mkBtn('▶', 'mm-player-btn mm-player-btn--pp', () => this._togglePlayPause()) as HTMLButtonElement;
    this._playPauseBtn.title = 'Play / Pause';

    const nextBtn = mkBtn('⏭', 'mm-player-btn', () => this._nextTrack());
    nextBtn.title = 'Next';

    this._shuffleBtn = mkBtn('⇄', 'mm-player-btn mm-player-btn--shuf', () => this._toggleShuffle()) as HTMLButtonElement;
    this._shuffleBtn.title = 'Shuffle';

    const controls = mkEl('div', 'mm-player-controls');
    controls.append(prevBtn, this._playPauseBtn, nextBtn, this._shuffleBtn);

    this._songNameEl = mkEl('span', 'mm-player-track');
    this._songNameEl.textContent = TRACKS[0];
    const artist = mkEl('span', 'mm-player-artist');
    artist.textContent = 'Dancing Salamanders';
    const info = mkEl('div', 'mm-player-info');
    info.append(this._songNameEl, artist);

    wrap.append(controls, info);
    return wrap;
  }

  private _initAudio(): void {
    const audio = new Audio();
    audio.volume = parseInt(localStorage.getItem(LS_VOL) ?? '80') / 100;
    this._audio = audio;
    audio.addEventListener('ended', () => this._nextTrack());
    audio.addEventListener('pause', () => this._updatePlayerUI());
    audio.addEventListener('play',  () => this._updatePlayerUI());
    this._playTrack(this._trackIdx, /*autoStart*/ true);
  }

  private _playTrack(idx: number, autoStart = false): void {
    if (!this._audio) return;
    this._trackIdx = Math.max(0, Math.min(idx, TRACKS.length - 1));
    this._audio.src = `/music/${encodeURIComponent(TRACKS[this._trackIdx] + '.mp3')}`;
    this._updatePlayerUI();
    if (autoStart) {
      this._audio.play().catch(() => { /* autoplay blocked — user can click ▶ */ });
    }
  }

  private _prevTrack(): void {
    if (this._audio && this._audio.currentTime > 3) {
      this._audio.currentTime = 0;
    } else {
      this._playTrack((this._trackIdx - 1 + TRACKS.length) % TRACKS.length, true);
    }
  }

  private _nextTrack(): void {
    let idx: number;
    if (this._shuffling) {
      do { idx = Math.floor(Math.random() * TRACKS.length); }
      while (TRACKS.length > 1 && idx === this._trackIdx);
    } else {
      idx = (this._trackIdx + 1) % TRACKS.length;
    }
    this._playTrack(idx, true);
  }

  private _togglePlayPause(): void {
    if (!this._audio) return;
    if (this._audio.paused) this._audio.play().catch(() => {});
    else                    this._audio.pause();
  }

  private _toggleShuffle(): void {
    this._shuffling = !this._shuffling;
    this._shuffleBtn?.classList.toggle('mm-player-btn--active', this._shuffling);
  }

  private _updatePlayerUI(): void {
    if (this._songNameEl)   this._songNameEl.textContent   = TRACKS[this._trackIdx];
    if (this._playPauseBtn) this._playPauseBtn.textContent = this._audio?.paused !== false ? '▶' : '⏸';
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
          // Do NOT clear back.src here — setting src='' triggers the broken-image
          // placeholder while back is still fading to opacity:0.  The src will be
          // overwritten on the next swap cycle, so leaving it is safe.

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

/* ── Lore / Book modal ───────────────────────────────────────────────────── */

/* Page-flip keyframes */
@keyframes mm-flip-out-fwd {
  from { opacity:1; transform: perspective(700px) rotateY(0deg)   translateX(0);    }
  to   { opacity:0; transform: perspective(700px) rotateY(-22deg) translateX(-4%);  }
}
@keyframes mm-flip-in-fwd {
  from { opacity:0; transform: perspective(700px) rotateY(22deg)  translateX(4%);   }
  to   { opacity:1; transform: perspective(700px) rotateY(0deg)   translateX(0);    }
}
@keyframes mm-flip-out-back {
  from { opacity:1; transform: perspective(700px) rotateY(0deg)   translateX(0);   }
  to   { opacity:0; transform: perspective(700px) rotateY(22deg)  translateX(4%);  }
}
@keyframes mm-flip-in-back {
  from { opacity:0; transform: perspective(700px) rotateY(-22deg) translateX(-4%); }
  to   { opacity:1; transform: perspective(700px) rotateY(0deg)   translateX(0);   }
}
.mm-flip-out-fwd  { animation: mm-flip-out-fwd  .26s ease forwards; pointer-events:none; }
.mm-flip-in-fwd   { animation: mm-flip-in-fwd   .28s ease forwards; }
.mm-flip-out-back { animation: mm-flip-out-back .26s ease forwards; pointer-events:none; }
.mm-flip-in-back  { animation: mm-flip-in-back  .28s ease forwards; }

/* Book card — parchment look, intentionally different from dark modals */
.mm-book-card {
  position: relative;
  /* Warm parchment with subtle horizontal ruling */
  background: #f0e6ca;
  background-image: repeating-linear-gradient(
    transparent, transparent 27px, rgba(100,65,20,.07) 27px, rgba(100,65,20,.07) 28px
  );
  /* Left = spine (flat), right = page edge (slight curve) */
  border: 2px solid #8b6030;
  border-left: 8px solid #5a3010;
  border-radius: 2px 10px 10px 2px;
  padding: 40px 52px 28px 48px;
  width: 90%; max-width: 720px;
  box-shadow: -6px 0 18px rgba(0,0,0,.35), 6px 0 10px rgba(0,0,0,.15),
              0 24px 60px rgba(0,0,0,.65);
  transform: translateY(18px);
  transition: transform .38s cubic-bezier(.175,.885,.32,1.28);
  display: flex; flex-direction: column;
  max-height: 88vh; overflow: hidden;
}
.mm-modal.mm-modal--open .mm-book-card { transform: translateY(0); }

/* Close button (top-right, low-profile) */
.mm-book-close {
  position: absolute; top: 12px; right: 16px;
  background: transparent; border: none; cursor: pointer;
  color: #8b6030; font-size: 18px; line-height: 1;
  opacity: .55; transition: opacity .2s;
  padding: 4px 8px;
}
.mm-book-close:hover { opacity: 1; }

/* Scrollable page area */
.mm-book-page-wrap {
  flex: 1; overflow-y: auto; min-height: 320px;
  scrollbar-width: thin; scrollbar-color: #c8a878 transparent;
  padding-right: 4px;
}

/* The animated page content div */
.mm-lore-page { padding-bottom: 8px; }

/* Chapter label (small-caps above title) */
.mm-lore-chapter {
  font-family: 'Cinzel', serif;
  font-size: 10px; letter-spacing: 5px; text-transform: uppercase;
  color: #8b4513; margin-bottom: 6px;
}

/* Page title */
.mm-lore-title {
  font-family: 'Cinzel', serif;
  font-size: clamp(17px, 2.4vw, 22px); font-weight: 700;
  color: #2a1204; line-height: 1.25; margin-bottom: 6px;
}

/* Byline / attribution */
.mm-lore-byline {
  font-family: 'IM Fell English', Georgia, serif;
  font-style: italic; font-size: 12px; color: #7a5030;
  margin-bottom: 10px;
}

/* Decorative rule */
.mm-lore-rule {
  height: 1px; margin: 10px 0 16px;
  background: linear-gradient(to right, #8b6030, transparent);
}

/* Body text */
.mm-lore-body { color: #1e1006; font-family: 'IM Fell English', Georgia, serif; }
.mm-lore-body p { font-size: 15px; line-height: 1.85; margin-bottom: 12px; }
.mm-lore-body p:last-child { margin-bottom: 0; }
.mm-lore-body em { font-style: italic; }

/* Drop cap on the first paragraph of each page */
.mm-lore-body p:first-child::first-letter {
  float: left;
  font-family: 'Cinzel', serif; font-size: 3.8em; line-height: .82;
  margin: .05em .14em 0 0;
  color: #5a2d0c;
}

/* Navigation bar */
.mm-book-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 16px; margin-top: 14px;
  border-top: 1px solid rgba(100,65,20,.2);
  flex-shrink: 0;
}

.mm-book-nav-btn {
  background: transparent;
  border: 1px solid #8b6030; border-radius: 3px;
  color: #5a3010; font-family: 'Cinzel', serif;
  font-size: 12px; letter-spacing: 1px; text-transform: uppercase;
  padding: 6px 18px; cursor: pointer;
  transition: background .2s, color .2s, border-color .2s;
}
.mm-book-nav-btn:hover:not(:disabled) { background: #8b6030; color: #f0e6ca; }
.mm-book-nav-btn:disabled { opacity: .3; cursor: default; }

.mm-book-page-num {
  font-family: 'Cinzel', serif; font-size: 12px;
  color: #8b6030; letter-spacing: 2px;
}

/* ── Music player ────────────────────────────────────────────────────────── */
.mm-player {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 14px auto 0;
  padding: 7px 18px 7px 12px;
  background: rgba(0,0,0,.28);
  border: 1px solid #4a4158;
  border-radius: 100px;
  width: fit-content;
  max-width: 94vw;
  transition: border-color .25s;
}
.mm-player:hover { border-color: #9d7cce; }

.mm-player-controls {
  display: flex; align-items: center; gap: 2px; flex-shrink: 0;
}

.mm-player-btn {
  background: transparent; border: none; cursor: pointer;
  color: #c8bedd; font-size: 15px; line-height: 1;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  transition: color .2s, background .2s;
  padding: 0;
}
.mm-player-btn:hover { color: #fff; background: rgba(157,124,206,.18); }
.mm-player-btn--active { color: #9d7cce !important; }

.mm-player-info {
  display: flex; flex-direction: column; justify-content: center;
  min-width: 0;
}

.mm-player-track {
  font-family: 'Cinzel', serif;
  font-size: 11px; letter-spacing: .5px;
  color: #e2d9c8; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  max-width: 220px;
}

.mm-player-artist {
  font-family: 'IM Fell English', Georgia, serif;
  font-style: italic; font-size: 10px;
  color: #9d7cce; white-space: nowrap;
}
`;
