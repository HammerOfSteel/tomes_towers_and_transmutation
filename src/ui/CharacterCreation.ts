// ── CharacterCreation ────────────────────────────────────────────────────────
//
//  Shown between save-slot selection and actual game start.
//  Collects character name + starting boon, then fires onStart().
//
//  Boons are intentionally simple for now — the Phase 7.5e FK-rig live-preview
//  character builder will replace the visual section once that rig exists.

// ── Types ─────────────────────────────────────────────────────────────────────

export type StartingBoon = 'tome' | 'blood' | 'swift';

export interface CharacterConfig {
  name: string;
  boon: StartingBoon;
  slotId: number;
}

// ── Boon definitions ──────────────────────────────────────────────────────────

interface BoonDef {
  id: StartingBoon;
  icon: string;
  title: string;
  desc: string;
  effect: string;
}

const BOONS: BoonDef[] = [
  {
    id:     'tome',
    icon:   '📖',
    title:  'Ancient Tome',
    desc:   'A singed spellbook left behind by a previous occupant of the cell.',
    effect: 'Start with Flame Dart unlocked',
  },
  {
    id:     'blood',
    icon:   '❤',
    title:  "Warrior's Blood",
    desc:   'A trace of old lineage. Harder to extinguish than it looks.',
    effect: '+30 maximum HP',
  },
  {
    id:     'swift',
    icon:   '💨',
    title:  'Swift Feet',
    desc:   'A talent for movement, developed over years of being where you ought not to be.',
    effect: 'Dodge cooldown −35%  •  Move speed +15%',
  },
];

// ── CSS ───────────────────────────────────────────────────────────────────────

const CC_CSS = `
.cc-overlay {
  display: none; align-items: center; justify-content: center;
  position: fixed; inset: 0; z-index: 8500;
  background: rgba(4,3,10,.92);
  backdrop-filter: blur(6px);
  opacity: 0; transition: opacity .25s ease;
  font-family: 'Crimson Text', 'Georgia', serif;
}
.cc-overlay.cc-open { opacity: 1; }

.cc-card {
  background: linear-gradient(160deg, #0e0b1a 0%, #07060f 100%);
  border: 1px solid #3a2860;
  border-radius: 4px;
  padding: 32px 36px 28px;
  width: min(94vw, 680px);
  max-height: 88vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 24px;
  box-shadow: 0 20px 80px rgba(0,0,0,.9), 0 0 0 1px #0b0817 inset;
  scrollbar-width: thin; scrollbar-color: #2a1850 transparent;
}

.cc-title {
  font-size: 2rem; color: #e8d8b0; letter-spacing: .08em; text-align: center;
  text-shadow: 0 0 24px rgba(160,120,220,.5);
}
.cc-subtitle {
  font-size: .85rem; color: #6a5880; text-align: center; letter-spacing: .06em;
  text-transform: uppercase; margin-top: -18px;
}

/* ── Name input ── */
.cc-name-row { display: flex; flex-direction: column; gap: 8px; }
.cc-label { font-size: .8rem; color: #7a6a99; letter-spacing: .08em; text-transform: uppercase; }
.cc-name-input {
  background: #07060f; border: 1px solid #2e1f50; border-radius: 3px;
  color: #e0d0ff; font-size: 1.1rem; font-family: inherit;
  padding: 10px 14px; outline: none; transition: border-color .15s;
}
.cc-name-input:focus { border-color: #7050cc; box-shadow: 0 0 0 2px rgba(112,80,204,.2); }

/* ── Boon selector ── */
.cc-boon-label { font-size: .8rem; color: #7a6a99; letter-spacing: .08em; text-transform: uppercase; }
.cc-boons { display: flex; flex-direction: column; gap: 10px; }

.cc-boon {
  display: flex; align-items: flex-start; gap: 14px;
  background: rgba(255,255,255,.03); border: 1px solid #1e1530;
  border-radius: 4px; padding: 14px 16px; cursor: pointer;
  transition: background .12s, border-color .12s;
}
.cc-boon:hover { background: rgba(112,80,204,.09); border-color: #3a2860; }
.cc-boon.cc-boon--active {
  background: rgba(112,80,204,.14); border-color: #7050cc;
  box-shadow: 0 0 0 1px rgba(112,80,204,.25);
}
.cc-boon-icon { font-size: 1.6rem; line-height: 1; flex-shrink: 0; margin-top: 2px; }
.cc-boon-body { display: flex; flex-direction: column; gap: 3px; }
.cc-boon-title { color: #d4c0f0; font-size: 1.0rem; }
.cc-boon-desc { color: #7a6a90; font-size: .88rem; line-height: 1.45; }
.cc-boon-effect { color: #a080e8; font-size: .8rem; letter-spacing: .04em; margin-top: 2px; }

/* ── Placeholder preview ── */
.cc-preview {
  border: 1px dashed #1e1530; border-radius: 4px; padding: 18px;
  text-align: center; color: #3a2860; font-size: .82rem; line-height: 1.6;
}
.cc-preview-note { color: #4a3870; font-size: .76rem; margin-top: 6px; }

/* ── Actions ── */
.cc-actions { display: flex; gap: 12px; justify-content: flex-end; }
.cc-btn {
  border: none; border-radius: 3px; cursor: pointer; font-family: inherit;
  font-size: .95rem; letter-spacing: .04em; padding: 10px 24px;
  transition: background .12s, transform .05s;
}
.cc-btn:active { transform: scale(.97); }
.cc-btn--back {
  background: transparent; border: 1px solid #2e1f50; color: #7060a0;
}
.cc-btn--back:hover { background: rgba(255,255,255,.04); border-color: #4a3870; }
.cc-btn--start {
  background: linear-gradient(135deg, #5030a0 0%, #7050cc 100%);
  color: #f0e8ff; font-weight: 600;
  box-shadow: 0 4px 18px rgba(80,48,160,.45);
}
.cc-btn--start:hover { background: linear-gradient(135deg, #6040b8 0%, #8060e0 100%); }
`;

// ── CharacterCreation class ───────────────────────────────────────────────────

export class CharacterCreation {
  private readonly _overlay: HTMLElement;
  private _selectedBoon: StartingBoon = 'tome';
  private _nameInput: HTMLInputElement | null = null;

  constructor(
    private readonly _onStart: (cfg: CharacterConfig) => void,
    private readonly _onBack: () => void,
  ) {
    this._ensureStyles();
    this._overlay = this._build();
    document.body.appendChild(this._overlay);
  }

  show(slotId: number): void {
    // Store slotId for use in the start callback
    this._overlay.dataset.slotId = String(slotId);
    this._selectedBoon = 'tome';
    if (this._nameInput) this._nameInput.value = '';
    this._refreshBoons();
    this._overlay.style.display = 'flex';
    requestAnimationFrame(() => this._overlay.classList.add('cc-open'));
  }

  hide(): void {
    this._overlay.classList.remove('cc-open');
    setTimeout(() => { this._overlay.style.display = 'none'; }, 260);
  }

  dispose(): void { this._overlay.remove(); }

  // ── DOM ───────────────────────────────────────────────────────────────────

  private _build(): HTMLElement {
    const ov = document.createElement('div');
    ov.className = 'cc-overlay';

    const card = document.createElement('div');
    card.className = 'cc-card';

    // Title
    const title = document.createElement('div');
    title.className = 'cc-title';
    title.textContent = 'The Ritual Begins';
    const subtitle = document.createElement('div');
    subtitle.className = 'cc-subtitle';
    subtitle.textContent = 'Who are you, exactly?';

    // Name
    const nameRow = document.createElement('div');
    nameRow.className = 'cc-name-row';
    const nameLbl = document.createElement('label');
    nameLbl.className = 'cc-label';
    nameLbl.textContent = 'Your name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cc-name-input';
    nameInput.placeholder = 'Princess…';
    nameInput.maxLength = 32;
    nameInput.autocomplete = 'off';
    this._nameInput = nameInput;
    nameRow.append(nameLbl, nameInput);

    // Boon selector
    const boonLbl = document.createElement('div');
    boonLbl.className = 'cc-boon-label';
    boonLbl.textContent = 'Starting boon — choose one';
    const boonList = document.createElement('div');
    boonList.className = 'cc-boons';
    boonList.id = 'cc-boons';

    for (const boon of BOONS) {
      const row = document.createElement('div');
      row.className = 'cc-boon' + (boon.id === 'tome' ? ' cc-boon--active' : '');
      row.dataset.boon = boon.id;
      row.innerHTML = `
        <div class="cc-boon-icon">${boon.icon}</div>
        <div class="cc-boon-body">
          <div class="cc-boon-title">${boon.title}</div>
          <div class="cc-boon-desc">${boon.desc}</div>
          <div class="cc-boon-effect">✦ ${boon.effect}</div>
        </div>`;
      row.addEventListener('click', () => {
        this._selectedBoon = boon.id as StartingBoon;
        this._refreshBoons();
      });
      boonList.appendChild(row);
    }

    // Placeholder preview (Phase 7.5e will replace with FK rig viewport)
    const preview = document.createElement('div');
    preview.className = 'cc-preview';
    preview.innerHTML = `
      ✦ ✦ ✦<br>
      Character preview coming in a future update.<br>
      The princess will be customisable once the rig is built.
      <div class="cc-preview-note">(Phase 7.5e — Forward Kinematics character builder)</div>`;

    // Actions
    const actions = document.createElement('div');
    actions.className = 'cc-actions';
    const backBtn = document.createElement('button');
    backBtn.className = 'cc-btn cc-btn--back';
    backBtn.textContent = '← Back';
    backBtn.onclick = () => { this.hide(); this._onBack(); };
    const startBtn = document.createElement('button');
    startBtn.className = 'cc-btn cc-btn--start';
    startBtn.textContent = 'Begin the Ritual  →';
    startBtn.onclick = () => {
      const name    = (this._nameInput?.value.trim() || 'Princess');
      const slotId  = parseInt(this._overlay.dataset.slotId ?? '0');
      this.hide();
      this._onStart({ name, boon: this._selectedBoon, slotId });
    };
    actions.append(backBtn, startBtn);

    card.append(title, subtitle, nameRow, boonLbl, boonList, preview, actions);
    ov.appendChild(card);
    return ov;
  }

  private _refreshBoons(): void {
    const list = this._overlay.querySelector('#cc-boons');
    if (!list) return;
    list.querySelectorAll<HTMLElement>('.cc-boon').forEach(el => {
      el.classList.toggle('cc-boon--active', el.dataset.boon === this._selectedBoon);
    });
  }

  private _ensureStyles(): void {
    if (document.getElementById('char-creation-css')) return;
    const s = document.createElement('style');
    s.id = 'char-creation-css';
    s.textContent = CC_CSS;
    document.head.appendChild(s);
  }
}
