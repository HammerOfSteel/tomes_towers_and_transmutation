/**
 * SpellForge — minimal emergent spell-crafting panel.
 *
 * Opened when [E]ing a cauldron while two spells are equipped in slots 1 & 2.
 * Combines them deterministically into a hybrid spell whose id, name, damage,
 * speed, radius and colour blend the two source spells.
 *
 * The hybrid is registered into SpellSystem's SPELL_DEFS at runtime and
 * granted to ProgressionSystem so it shows up in the Grimoire and can be equipped.
 *
 * Usage:
 *   SpellForge.open(spellA, spellB, progression, spellSystem, onForged);
 *   SpellForge.close();
 *   SpellForge.isOpen
 */

import type { ProgressionSystem } from '@/progression/ProgressionSystem';
import type { SpellSystem }       from '@/combat/SpellSystem';

// ── Name fragments ─────────────────────────────────────────────────────────

const PREFIX: Record<string, string> = {
  magic_bolt:   'Arcane',   flame_dart:   'Flame',
  chain_arc:    'Chain',    nova_burst:   'Nova',
  void_rift:    'Void',     battle_hymn:  'Battle',
  mass_animate: 'Animate',  intimidate:   'Dread',
};
const SUFFIX: Record<string, string> = {
  magic_bolt:   'Bolt',     flame_dart:   'Dart',
  chain_arc:    'Arc',      nova_burst:   'Burst',
  void_rift:    'Rift',     battle_hymn:  'Hymn',
  mass_animate: 'Wave',     intimidate:   'Shriek',
};

function hybridName(a: string, b: string): string {
  const pfx = PREFIX[a] ?? 'Mystic';
  const sfx = SUFFIX[b] ?? 'Flux';
  return `${pfx}-${sfx}`;
}

// ── SpellSystem runtime hook ───────────────────────────────────────────────

/** Register a hybrid spell into SpellSystem's runtime DEFS. */
function _registerHybrid(
  sys: SpellSystem,
  id: string,
  name: string,
  a: string,
  b: string,
): void {
  (sys as unknown as {
    _registerHybridSpell: (id: string, name: string, baseA: string, baseB: string) => void
  })._registerHybridSpell(id, name, a, b);
}

// ── Panel singleton ────────────────────────────────────────────────────────

let _panel: HTMLDivElement | null = null;
let _closeKey: ((e: KeyboardEvent) => void) | null = null;

export const SpellForge = {
  get isOpen(): boolean { return _panel !== null; },

  open(
    spellA: string,
    spellB: string,
    progression: ProgressionSystem,
    spellSystem: SpellSystem,
    onForged: (hybridId: string) => void,
  ): void {
    this.close();

    const nameA = spellA.replace(/_/g, ' ');
    const nameB = spellB.replace(/_/g, ' ');
    const hybridId   = `hybrid_${spellA}_${spellB}`;
    const hybridTitle = hybridName(spellA, spellB);
    const alreadyKnown = progression.isSpellUnlocked(hybridId);

    const panel = document.createElement('div');
    panel.id = 'spell-forge';
    Object.assign(panel.style, {
      position:    'fixed',
      top:         '50%',
      left:        '50%',
      transform:   'translate(-50%,-50%)',
      width:       '440px',
      maxWidth:    '94vw',
      background:  'linear-gradient(160deg, #120820 0%, #0a0414 100%)',
      border:      '1px solid #6a1a8a',
      borderRadius:'6px',
      boxShadow:   '0 8px 40px rgba(0,0,0,0.9)',
      color:       '#e8d4f8',
      fontFamily:  'Georgia, serif',
      fontSize:    '13px',
      zIndex:      '220',
      userSelect:  'none',
      overflow:    'hidden',
    } as Partial<CSSStyleDeclaration>);

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding:      '12px 16px 10px',
      borderBottom: '1px solid #4a1070',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      background:   'rgba(0,0,0,0.3)',
    } as Partial<CSSStyleDeclaration>);
    const title = document.createElement('span');
    title.textContent = '🧪 Cauldron — Spell Fusion';
    Object.assign(title.style, {
      fontFamily:    'Cinzel, serif',
      fontSize:      '13px',
      letterSpacing: '2px',
      color:         '#cc88ff',
    } as Partial<CSSStyleDeclaration>);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      background: 'none', border: 'none',
      color: '#7a5a8a', cursor: 'pointer', fontSize: '16px',
    } as Partial<CSSStyleDeclaration>);
    closeBtn.onclick = () => SpellForge.close();
    header.append(title, closeBtn);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:14px;';

    // Ingredients row
    const ingRow = document.createElement('div');
    ingRow.style.cssText = 'display:flex;align-items:center;gap:12px;justify-content:center;font-size:.85rem;';
    const mkChip = (label: string, color: string) => {
      const c = document.createElement('span');
      c.textContent = label;
      c.style.cssText = `background:rgba(0,0,0,.4);border:1px solid ${color};
        border-radius:12px;padding:4px 14px;color:${color};font-family:monospace;font-size:.8rem;`;
      return c;
    };
    ingRow.append(
      mkChip(nameA, '#80c0ff'),
      Object.assign(document.createElement('span'), { textContent: '+', style: 'color:#7a5a8a;font-size:1.2rem;' }),
      mkChip(nameB, '#ff80a0'),
    );
    body.appendChild(ingRow);

    // Result preview
    const resultSec = document.createElement('div');
    resultSec.style.cssText = 'background:rgba(102,0,170,0.1);border:1px solid #5a1070;border-radius:5px;padding:12px;text-align:center;';
    const resultName = document.createElement('div');
    resultName.textContent = `✨ ${hybridTitle}`;
    resultName.style.cssText = 'font-size:1.1rem;color:#e0a8ff;font-family:Cinzel,serif;margin-bottom:6px;';
    const resultDesc = document.createElement('div');
    resultDesc.style.cssText = 'font-size:.78rem;color:#9a7aaa;line-height:1.5;';
    resultDesc.textContent = alreadyKnown
      ? 'You already know this spell.'
      : `A fusion of ${nameA} and ${nameB}. Blends their damage, speed, radius, and colour into something new.`;
    resultSec.append(resultName, resultDesc);
    body.appendChild(resultSec);

    // Forge button
    const forgeBtn = document.createElement('button');
    forgeBtn.textContent = alreadyKnown ? '✓ Already known' : '🔮 Fuse Spells';
    forgeBtn.disabled = alreadyKnown;
    Object.assign(forgeBtn.style, {
      background:   alreadyKnown ? 'rgba(40,20,60,0.5)' : 'linear-gradient(135deg,#6010c0,#9030e0)',
      border:       '1px solid #8020c0',
      color:        alreadyKnown ? '#7a5a9a' : '#f0e0ff',
      borderRadius: '4px',
      padding:      '10px 20px',
      cursor:       alreadyKnown ? 'default' : 'pointer',
      fontFamily:   'Cinzel, serif',
      fontSize:     '.9rem',
      letterSpacing:'1px',
      transition:   'background .15s',
    } as Partial<CSSStyleDeclaration>);

    if (!alreadyKnown) {
      forgeBtn.onclick = () => {
        _registerHybrid(spellSystem, hybridId, hybridTitle, spellA, spellB);
        progression.grantSpell(hybridId);
        onForged(hybridId);

        // Show success flash
        forgeBtn.textContent = '✨ Spell Discovered!';
        forgeBtn.disabled = true;
        resultDesc.textContent = `${hybridTitle} has been added to your Grimoire.`;
        resultDesc.style.color = '#88ddaa';
        setTimeout(() => SpellForge.close(), 1800);
      };
    }
    body.appendChild(forgeBtn);

    // Hint
    const hint = document.createElement('div');
    hint.textContent = '[E] or Esc to close';
    Object.assign(hint.style, {
      padding:    '8px 16px',
      fontSize:   '11px',
      color:      '#4a3a5a',
      borderTop:  '1px solid #2a1040',
      textAlign:  'center',
      fontFamily: 'monospace',
    } as Partial<CSSStyleDeclaration>);
    panel.append(body, hint);

    document.body.appendChild(panel);
    _panel = panel;

    _closeKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' || e.code === 'Escape') SpellForge.close();
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