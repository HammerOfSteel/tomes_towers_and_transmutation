/**
 * editor-tab-switch.test.ts — unit tests for the model-review tab switching
 * logic. These are DOM-level tests that verify panel visibility correctly
 * changes when mode tabs are clicked.
 *
 * Run with: npx vitest run tests/editor/editor-tab-switch.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Minimal DOM setup ─────────────────────────────────────────────────────────

function buildDOM(): void {
  document.body.innerHTML = `
    <div id="app">
      <div id="side-panel">
        <div id="mode-tabs">
          <button class="mode-tab active" data-mode="chars">🧙 Characters</button>
          <button class="mode-tab"        data-mode="env">🌳 Environment</button>
          <button class="mode-tab"        data-mode="editor">✏️ Editor</button>
        </div>
        <div id="chars-panel"></div>
        <div id="env-panel" style="display:none"></div>
        <div id="editor-panel" style="display:none;flex-direction:column"></div>
      </div>
    </div>
  `;
}

// ── Simulated tab-switch logic (mirrors model-review.ts unified handler) ──────

function setupTabSwitching(): void {
  const charsPanel  = document.getElementById('chars-panel')!;
  const envPanel    = document.getElementById('env-panel')!;
  const editorPanel = document.getElementById('editor-panel')!;

  document.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset['mode'] ?? 'chars';

      charsPanel.style.display  = mode === 'chars'  ? ''     : 'none';
      envPanel.style.display    = mode === 'env'     ? ''     : 'none';
      editorPanel.style.display = mode === 'editor'  ? 'flex' : 'none';
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('model-review tab switching', () => {
  beforeEach(() => {
    buildDOM();
    setupTabSwitching();
  });

  it('initially shows chars panel, hides env and editor', () => {
    const chars  = document.getElementById('chars-panel')!;
    const env    = document.getElementById('env-panel')!;
    const editor = document.getElementById('editor-panel')!;
    // Initial state from HTML
    expect(env.style.display).toBe('none');
    expect(editor.style.display).toBe('none');
    // chars-panel has no inline display (visible)
    expect(chars.style.display).not.toBe('none');
  });

  it('clicking env tab shows env panel and hides chars + editor', () => {
    const envBtn = document.querySelector<HTMLButtonElement>('[data-mode="env"]')!;
    envBtn.click();

    expect(document.getElementById('env-panel')!.style.display).toBe('');
    expect(document.getElementById('chars-panel')!.style.display).toBe('none');
    expect(document.getElementById('editor-panel')!.style.display).toBe('none');
  });

  it('clicking editor tab shows editor panel and hides chars + env', () => {
    const edBtn = document.querySelector<HTMLButtonElement>('[data-mode="editor"]')!;
    edBtn.click();

    const editorPanel = document.getElementById('editor-panel')!;
    expect(editorPanel.style.display).toBe('flex');
    expect(document.getElementById('chars-panel')!.style.display).toBe('none');
    expect(document.getElementById('env-panel')!.style.display).toBe('none');
  });

  it('clicking chars tab after editor restores chars panel', () => {
    // Go to editor
    document.querySelector<HTMLButtonElement>('[data-mode="editor"]')!.click();
    expect(document.getElementById('editor-panel')!.style.display).toBe('flex');

    // Back to chars
    document.querySelector<HTMLButtonElement>('[data-mode="chars"]')!.click();
    expect(document.getElementById('chars-panel')!.style.display).toBe('');
    expect(document.getElementById('editor-panel')!.style.display).toBe('none');
  });

  it('active class follows the clicked tab', () => {
    const envBtn    = document.querySelector<HTMLButtonElement>('[data-mode="env"]')!;
    const editorBtn = document.querySelector<HTMLButtonElement>('[data-mode="editor"]')!;
    const charsBtn  = document.querySelector<HTMLButtonElement>('[data-mode="chars"]')!;

    envBtn.click();
    expect(envBtn.classList.contains('active')).toBe(true);
    expect(editorBtn.classList.contains('active')).toBe(false);
    expect(charsBtn.classList.contains('active')).toBe(false);

    editorBtn.click();
    expect(editorBtn.classList.contains('active')).toBe(true);
    expect(envBtn.classList.contains('active')).toBe(false);

    charsBtn.click();
    expect(charsBtn.classList.contains('active')).toBe(true);
    expect(editorBtn.classList.contains('active')).toBe(false);
  });

  it('cycling through all tabs shows correct panel each time', () => {
    const modes: Array<[string, string]> = [
      ['env',    'env-panel'],
      ['editor', 'editor-panel'],
      ['chars',  'chars-panel'],
      ['env',    'env-panel'],
    ];

    for (const [mode, expectedVisible] of modes) {
      document.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!.click();
      const panel = document.getElementById(expectedVisible)!;
      expect(panel.style.display).not.toBe('none');
    }
  });
});

// ── Editor panel content visibility ───────────────────────────────────────────

describe('editor panel sub-tabs', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="editor-panel" style="display:none;flex-direction:column">
        <div id="editor-sub-tabs">
          <button class="editor-sub active" data-etype="tower_floor">🏰 Tower</button>
          <button class="editor-sub" data-etype="overworld">🌍 World</button>
          <button class="editor-sub" data-etype="building">🏠 Building</button>
          <button class="editor-sub" data-etype="interior">🪑 Interior</button>
          <button class="editor-sub" data-etype="dungeon">⚔️ Dungeon</button>
        </div>
        <div id="tfe-props-panel"></div>
        <div id="ow-editor-panel" style="display:none"></div>
        <div id="building-editor-panel" style="display:none"></div>
        <div id="dungeon-editor-panel" style="display:none"></div>
        <div id="tfe-floor-list-panel"></div>
      </div>
    `;

    // Simulate _activateSubEditor logic
    document.querySelectorAll<HTMLButtonElement>('.editor-sub').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.editor-sub').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.dataset['etype'] ?? 'tower_floor';

        const panelMap: Record<string, string> = {
          tower_floor: 'tfe-props-panel',
          overworld:   'ow-editor-panel',
          building:    'building-editor-panel',
          dungeon:     'dungeon-editor-panel',
        };
        Object.values(panelMap).forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        const activeId = panelMap[type];
        if (activeId) {
          const el = document.getElementById(activeId);
          if (el) el.style.display = '';
        }
        const floorList = document.getElementById('tfe-floor-list-panel');
        if (floorList) floorList.style.display = type === 'tower_floor' ? '' : 'none';
      });
    });
  });

  it('Tower sub-tab is active by default', () => {
    const towerBtn = document.querySelector<HTMLButtonElement>('[data-etype="tower_floor"]')!;
    expect(towerBtn.classList.contains('active')).toBe(true);
  });

  it('clicking Building sub-tab shows building panel', () => {
    document.querySelector<HTMLButtonElement>('[data-etype="building"]')!.click();
    expect(document.getElementById('building-editor-panel')!.style.display).toBe('');
    expect(document.getElementById('tfe-props-panel')!.style.display).toBe('none');
    expect(document.getElementById('dungeon-editor-panel')!.style.display).toBe('none');
  });

  it('clicking Dungeon sub-tab shows dungeon panel', () => {
    document.querySelector<HTMLButtonElement>('[data-etype="dungeon"]')!.click();
    expect(document.getElementById('dungeon-editor-panel')!.style.display).toBe('');
  });

  it('clicking World sub-tab shows overworld panel', () => {
    document.querySelector<HTMLButtonElement>('[data-etype="overworld"]')!.click();
    expect(document.getElementById('ow-editor-panel')!.style.display).toBe('');
  });

  it('tower sub-tab shows floor list panel, others hide it', () => {
    const towerBtn    = document.querySelector<HTMLButtonElement>('[data-etype="tower_floor"]')!;
    const buildingBtn = document.querySelector<HTMLButtonElement>('[data-etype="building"]')!;

    buildingBtn.click();
    expect(document.getElementById('tfe-floor-list-panel')!.style.display).toBe('none');

    towerBtn.click();
    expect(document.getElementById('tfe-floor-list-panel')!.style.display).toBe('');
  });
});
