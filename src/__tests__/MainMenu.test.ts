/**
 * MainMenu — unit + smoke tests
 *
 * What these tests protect against:
 *  - Constructor crashing (the main-menu-is-gone bug)
 *  - Lore modal not rendering locked grimoire when no species
 *  - Lore modal not rendering species pages when species set
 *  - setActiveSpecies / localStorage persistence
 *  - show() / hide() lifecycle
 *  - SPECIES_LORE completeness (all 4 species, 4 pages each)
 *
 * No Three.js needed — MainMenu is pure DOM.
 * Audio is stubbed via jsdom's HTMLAudioElement (already a no-op).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeciesId } from '@/world/StoryQuestLine';

// ── HTMLMediaElement stub (jsdom has no audio playback) ────────────────────
beforeAll(() => {
  // Use plain functions (not vi.fn()) so vi.restoreAllMocks() cannot clear them
  Object.defineProperty(HTMLMediaElement.prototype, 'play',  { writable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, 'load',  { writable: true, value: () => {} });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { writable: true, value: () => {} });
});

describe('MainMenu', () => {
  let MainMenuClass: typeof import('@/ui/MainMenu').MainMenu;

  beforeEach(async () => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    localStorage.clear();
    vi.useFakeTimers();
    // Fresh import each suite so the injected <style> is always present
    const mod = await import('@/ui/MainMenu');
    MainMenuClass = mod.MainMenu;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Smoke ──────────────────────────────────────────────────────────────────

  it('smoke: constructor does not throw', () => {
    expect(() => new MainMenuClass({ onPlay: vi.fn() })).not.toThrow();
  });

  it('smoke: overlay is appended to document.body', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    expect(document.body.querySelector('.mm-overlay')).not.toBeNull();
    menu.dispose();
  });

  it('smoke: injected <style> tag exists after construction', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    expect(document.getElementById('mm-css')).not.toBeNull();
    menu.dispose();
  });

  it('smoke: isVisible is true immediately after construction', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    expect(menu.isVisible).toBe(true);
    menu.dispose();
  });

  // ── Visibility lifecycle ───────────────────────────────────────────────────

  it('hide() sets opacity to 0 and then display:none', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    const overlay = document.body.querySelector('.mm-overlay') as HTMLElement;
    menu.hide();
    expect(overlay.style.opacity).toBe('0');
    vi.runAllTimers();
    expect(overlay.style.display).toBe('none');
    menu.dispose();
  });

  it('hide() sets isVisible to false', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.hide();
    expect(menu.isVisible).toBe(false);
    menu.dispose();
  });

  it('show() after hide() restores display and opacity', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.hide();
    vi.runAllTimers();
    menu.show();
    const overlay = document.body.querySelector('.mm-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('flex');
    expect(menu.isVisible).toBe(true);
    menu.dispose();
  });

  it('show() is idempotent when already visible', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    expect(() => { menu.show(); menu.show(); }).not.toThrow();
    menu.dispose();
  });

  it('dispose() removes the overlay from the DOM', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.dispose();
    expect(document.body.querySelector('.mm-overlay')).toBeNull();
  });

  // ── setActiveSpecies ───────────────────────────────────────────────────────

  it('setActiveSpecies persists to localStorage', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.setActiveSpecies('human');
    expect(localStorage.getItem('ttt_character_species')).toBe('human');
    menu.dispose();
  });

  it('setActiveSpecies(null) removes species from localStorage', () => {
    localStorage.setItem('ttt_character_species', 'slime');
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.setActiveSpecies(null);
    expect(localStorage.getItem('ttt_character_species')).toBeNull();
    menu.dispose();
  });

  it('setActiveSpecies does not throw for all valid species', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    const species: SpeciesId[] = ['human', 'undead', 'vulperia', 'slime'];
    for (const s of species) {
      expect(() => menu.setActiveSpecies(s)).not.toThrow();
    }
    menu.dispose();
  });

  // ── Lore modal — locked state ──────────────────────────────────────────────

  it('lore page shows locked grimoire when no species in localStorage', () => {
    localStorage.clear();
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    // Drive the private methods via the public surface (clicking the button or
    // calling the private methods via cast — acceptable in smoke tests).
    (menu as any)._refreshLoreSpecies();
    (menu as any)._setLorePage(0);

    const page = document.getElementById('mm-lore-page');
    expect(page).not.toBeNull();
    expect(page!.innerHTML).toContain('mm-lore-locked');
    expect(page!.innerHTML).toContain('fate has not yet been woven');
    menu.dispose();
  });

  it('lore nav is hidden when grimoire is locked', () => {
    localStorage.clear();
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    (menu as any)._refreshLoreSpecies();
    (menu as any)._setLorePage(0);

    const nav = document.getElementById('mm-book-nav');
    expect(nav?.style.visibility).toBe('hidden');
    menu.dispose();
  });

  it('lore page does NOT show locked grimoire after setActiveSpecies', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.setActiveSpecies('human');
    (menu as any)._setLorePage(0);

    const page = document.getElementById('mm-lore-page');
    expect(page!.innerHTML).not.toContain('mm-lore-locked');
    expect(page!.innerHTML).not.toContain('fate has not yet been woven');
    menu.dispose();
  });

  it('lore nav is visible after species is set', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.setActiveSpecies('slime');
    (menu as any)._setLorePage(0);

    const nav = document.getElementById('mm-book-nav');
    expect(nav?.style.visibility).toBe('visible');
    menu.dispose();
  });

  // ── Lore modal — species pages ────────────────────────────────────────────

  it.each<SpeciesId>(['human', 'undead', 'vulperia', 'slime'])(
    'lore: %s page 0 renders chapter label and title',
    (species) => {
      const menu = new MainMenuClass({ onPlay: vi.fn() });
      menu.setActiveSpecies(species);
      (menu as any)._setLorePage(0);

      const page = document.getElementById('mm-lore-page');
      expect(page!.querySelector('.mm-lore-chapter')).not.toBeNull();
      expect(page!.querySelector('.mm-lore-title')).not.toBeNull();
      expect(page!.querySelector('.mm-lore-byline')).not.toBeNull();
      expect(page!.querySelector('.mm-lore-body')).not.toBeNull();
      menu.dispose();
    },
  );

  it.each<SpeciesId>(['human', 'undead', 'vulperia', 'slime'])(
    'lore: %s has exactly 4 pages',
    (species) => {
      const menu = new MainMenuClass({ onPlay: vi.fn() });
      menu.setActiveSpecies(species);
      const pages = (menu as any)._getActivePages();
      expect(pages).toHaveLength(4);
      menu.dispose();
    },
  );

  it.each<SpeciesId>(['human', 'undead', 'vulperia', 'slime'])(
    'lore: %s all pages have non-empty body',
    (species) => {
      const menu = new MainMenuClass({ onPlay: vi.fn() });
      menu.setActiveSpecies(species);
      const pages = (menu as any)._getActivePages() as Array<{ body: string }>;
      for (const p of pages) {
        expect(p.body.trim().length).toBeGreaterThan(0);
      }
      menu.dispose();
    },
  );

  it('lore: prev/next navigation updates page number', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.setActiveSpecies('vulperia');
    (menu as any)._setLorePage(0);

    const pnum = document.getElementById('mm-book-pnum');
    expect(pnum?.textContent).toContain('1');

    // Advance to page 2
    (menu as any)._setLorePage(1);
    expect(pnum?.textContent).toContain('2');
    menu.dispose();
  });

  it('lore: prev button disabled on page 0', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.setActiveSpecies('human');
    (menu as any)._setLorePage(0);
    expect((menu as any)._prevBtn?.disabled).toBe(true);
    menu.dispose();
  });

  it('lore: next button disabled on last page', () => {
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    menu.setActiveSpecies('human');
    (menu as any)._setLorePage(3); // page 4 of 4
    expect((menu as any)._nextBtn?.disabled).toBe(true);
    menu.dispose();
  });

  // ── localStorage restoration on reload ───────────────────────────────────

  it('_refreshLoreSpecies reads stored species from localStorage on creation', () => {
    localStorage.setItem('ttt_character_species', 'undead');
    const menu = new MainMenuClass({ onPlay: vi.fn() });
    (menu as any)._refreshLoreSpecies();
    (menu as any)._setLorePage(0);

    const page = document.getElementById('mm-lore-page');
    // Should show undead lore, not the locked grimoire
    expect(page!.innerHTML).not.toContain('mm-lore-locked');
    menu.dispose();
  });
});
