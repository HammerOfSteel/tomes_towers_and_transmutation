/**
 * QuestBoardUI — parchment-style panel shown when [E]ing a quest_board fixture.
 *
 * Lists currently active quests from QuestLog, plus generates up to 3 new
 * procedural quests seeded from the current floor and world seed.
 * Players can "Pin" new quests to add them to the QuestLog.
 *
 * Usage:
 *   QuestBoardUI.open(questLog, currentSeed, currentFloor);
 *   QuestBoardUI.close();
 *   QuestBoardUI.isOpen
 */

import type { QuestLog } from '@/ui/QuestLog';
import { generateQuest } from '@/world/QuestDef';
import type { QuestDef } from '@/world/QuestDef';
import { injectHudTheme } from './hudTheme';

let _panel: HTMLDivElement | null = null;
let _closeKey: ((e: KeyboardEvent) => void) | null = null;

/** Static quest board that reads from QuestLog. */
export const QuestBoardUI = {
  get isOpen(): boolean { return _panel !== null; },

  open(questLog: QuestLog, worldSeed: number, floor: number): void {
    this.close();
    injectHudTheme();

    const panel = document.createElement('div');
    panel.id = 'quest-board-ui';
    panel.className = 'hud-panel hud-panel--warm';
    Object.assign(panel.style, {
      position:    'fixed',
      top:         '50%',
      left:        '50%',
      transform:   'translate(-50%, -50%)',
      width:       '480px',
      maxWidth:    '94vw',
      maxHeight:   '80vh',
      overflowY:   'auto',
      fontSize:    '13px',
      zIndex:      '215',
      userSelect:  'none',
    } as Partial<CSSStyleDeclaration>);

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding:      '12px 16px 10px',
      borderBottom: '1px solid #5a3a10',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      background:   'rgba(0,0,0,0.3)',
      position:     'sticky',
      top:          '0',
      zIndex:       '1',
    } as Partial<CSSStyleDeclaration>);
    const title = document.createElement('span');
    title.textContent = '📋 Notice Board';
    Object.assign(title.style, {
      fontFamily:    'Cinzel, serif',
      fontSize:      '13px',
      letterSpacing: '2px',
      color:         '#d4aa44',
    } as Partial<CSSStyleDeclaration>);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      background: 'none',
      border:     'none',
      color:      '#7a5a30',
      cursor:     'pointer',
      fontSize:   '16px',
    } as Partial<CSSStyleDeclaration>);
    closeBtn.onclick = () => QuestBoardUI.close();
    header.append(title, closeBtn);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:14px;';

    // ── Active quests ─────────────────────────────────────────────────────
    const active = questLog.getActive();
    if (active.length > 0) {
      const sec = _mkSection('Active Quests');
      for (const q of active) {
        sec.appendChild(_mkQuestRow(q, true, null));
      }
      body.appendChild(sec);
    }

    // ── Board postings — generated quests ─────────────────────────────────
    const boardSec = _mkSection('Posted Notices');
    // (rng used implicitly via worldSeed seed derivation; floor affects quest selection)

    // Generate up to 3 procedural quests using available dungeon/settlement context
    const boardQuests: QuestDef[] = [];
    const ctxTemplates = [
      { npcName: 'Anonymous Postings',   npcRole: 'guard'    as const },
      { npcName: 'Settlement Council',   npcRole: 'scholar'  as const },
      { npcName: 'Travelling Merchant',  npcRole: 'merchant' as const },
    ];

    for (let i = 0; i < ctxTemplates.length; i++) {
      const ctx = ctxTemplates[i]!;
      const q = generateQuest(
        {
          npcName:      ctx.npcName,
          npcRole:      ctx.npcRole,
          settlement:   { id: i, plan: { name: 'the Region', type: 'village', centerCol: 25, centerRow: 25, buildings: [], roads: [], population: 0 }, seed: worldSeed ^ (i * 0x1234) } as unknown as import('@/world/WorldData').SettlementEntry,
          dungeons:     [],
          nearbyEvents: [],
        },
        worldSeed ^ (floor * 0x5A3C ^ i * 0x11FF),
      );
      if (q && !active.some(a => a.id === q.id)) {
        boardQuests.push(q);
      }
    }

    if (boardQuests.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:11px;color:#5a4a28;font-style:italic;';
      empty.textContent = 'The board is bare. Come back after clearing a dungeon.';
      boardSec.appendChild(empty);
    } else {
      for (const q of boardQuests) {
        const alreadyActive = active.some(a => a.id === q.id);
        boardSec.appendChild(_mkQuestRow(q, alreadyActive, () => {
          questLog.addQuest(q);
          QuestBoardUI.close();
          QuestBoardUI.open(questLog, worldSeed, floor);
        }));
      }
    }
    body.appendChild(boardSec);

    // Footer
    const foot = document.createElement('div');
    foot.textContent = '[E] or Esc to close';
    Object.assign(foot.style, {
      padding:    '8px 16px',
      fontSize:   '11px',
      color:      '#4a3a18',
      borderTop:  '1px solid #2a1a04',
      textAlign:  'center',
      fontFamily: 'monospace',
      position:   'sticky',
      bottom:     '0',
      background: '#100c04',
    } as Partial<CSSStyleDeclaration>);

    panel.append(body, foot);
    document.body.appendChild(panel);
    _panel = panel;

    _closeKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' || e.code === 'Escape') QuestBoardUI.close();
    };
    window.addEventListener('keydown', _closeKey);
  },

  close(): void {
    _panel?.remove();
    _panel = null;
    if (_closeKey) {
      window.removeEventListener('keydown', _closeKey);
      _closeKey = null;
    }
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function _mkSection(title: string): HTMLElement {
  const sec = document.createElement('div');
  const t = document.createElement('div');
  Object.assign(t.style, {
    fontSize:      '.72rem',
    color:         '#7a5a28',
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    marginBottom:  '8px',
    paddingBottom: '4px',
    borderBottom:  '1px solid #3a2a0a',
  } as Partial<CSSStyleDeclaration>);
  t.textContent = title;
  sec.appendChild(t);
  return sec;
}

function _mkQuestRow(
  q: QuestDef,
  alreadyActive: boolean,
  onPin: (() => void) | null,
): HTMLElement {
  const row = document.createElement('div');
  Object.assign(row.style, {
    background:   'rgba(0,0,0,0.25)',
    border:       '1px solid #3a2a0a',
    borderRadius: '4px',
    padding:      '9px 11px',
    display:      'flex',
    gap:          '10px',
    alignItems:   'flex-start',
  } as Partial<CSSStyleDeclaration>);

  const info = document.createElement('div');
  info.style.flex = '1';

  const name = document.createElement('div');
  name.style.cssText = 'font-size:.88rem;color:#d4aa60;margin-bottom:3px;';
  name.textContent = q.title ?? q.id;

  const desc = document.createElement('div');
  desc.style.cssText = 'font-size:.78rem;color:#9a7a50;line-height:1.4;';
  desc.textContent = q.description ?? '';

  const reward = document.createElement('div');
  reward.style.cssText = 'font-size:.72rem;color:#6a8a3a;margin-top:4px;';
  reward.textContent = `Reward: ${q.reward?.xp ?? 0} XP`;

  info.append(name, desc, reward);
  row.appendChild(info);

  if (!alreadyActive && onPin) {
    const pinBtn = document.createElement('button');
    pinBtn.textContent = '📌 Pin';
    Object.assign(pinBtn.style, {
      background:   'rgba(80,60,10,0.6)',
      border:       '1px solid #8a6a20',
      color:        '#d4aa44',
      borderRadius: '3px',
      padding:      '4px 10px',
      cursor:       'pointer',
      fontFamily:   'monospace',
      fontSize:     '.72rem',
      whiteSpace:   'nowrap',
      flexShrink:   '0',
    } as Partial<CSSStyleDeclaration>);
    pinBtn.onclick = onPin;
    row.appendChild(pinBtn);
  } else if (alreadyActive) {
    const badge = document.createElement('span');
    badge.textContent = '✓ Active';
    badge.style.cssText = 'font-size:.7rem;color:#4a8a4a;flex-shrink:0;margin-top:2px;';
    row.appendChild(badge);
  }

  return row;
}