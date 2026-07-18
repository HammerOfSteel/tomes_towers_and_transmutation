import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressionSystem } from '@/progression/ProgressionSystem';
describe('ProgressionSystem', () => {
    let ps;
    beforeEach(() => {
        ps = new ProgressionSystem();
    });
    // ── markRead ───────────────────────────────────────────────────────────────
    it('markRead returns true on first read', () => {
        expect(ps.markRead('lib__bookshelf__0')).toBe(true);
    });
    it('markRead returns false on subsequent read of same book', () => {
        ps.markRead('lib__bookshelf__0');
        expect(ps.markRead('lib__bookshelf__0')).toBe(false);
    });
    it('markRead returns true again for a different book', () => {
        ps.markRead('lib__bookshelf__0');
        expect(ps.markRead('lib__bookshelf__1')).toBe(true);
    });
    // ── spellUnlock ────────────────────────────────────────────────────────────
    it('unlocks spell on first read when spellUnlock is provided', () => {
        ps.markRead('lib__lectern__0', 'flame_dart');
        expect(ps.isSpellUnlocked('flame_dart')).toBe(true);
    });
    it('does not double-unlock a spell on re-read', () => {
        ps.markRead('lib__lectern__0', 'flame_dart');
        ps.markRead('lib__lectern__0', 'flame_dart');
        // magic_bolt is pre-unlocked, flame_dart was just unlocked
        expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'magic_bolt']);
    });
    it('does not unlock spell if already read (no re-trigger)', () => {
        // First call adds the book; second call is a no-op
        ps.markRead('lib__lectern__0', 'flame_dart');
        const secondResult = ps.markRead('lib__lectern__0', 'void_bolt');
        expect(secondResult).toBe(false);
        // void_bolt must NOT be unlocked — only flame_dart was from first read
        expect(ps.isSpellUnlocked('void_bolt')).toBe(false);
    });
    it('does not unlock spell when no spellUnlock arg is passed', () => {
        ps.markRead('lib__bookshelf__0');
        // Only magic_bolt is pre-unlocked from constructor
        expect(ps.getUnlockedSpells()).toEqual(['magic_bolt']);
    });
    it('multiple distinct spells can be unlocked from different books', () => {
        ps.markRead('lib__lectern__0', 'flame_dart');
        ps.markRead('lib__lectern__1', 'magic_bolt'); // already pre-unlocked, no double-add
        expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'magic_bolt']);
    });
    // ── hasRead ────────────────────────────────────────────────────────────────
    it('hasRead returns false before reading', () => {
        expect(ps.hasRead('lib__bookshelf__0')).toBe(false);
    });
    it('hasRead returns true after reading', () => {
        ps.markRead('lib__bookshelf__0');
        expect(ps.hasRead('lib__bookshelf__0')).toBe(true);
    });
    // ── isSpellUnlocked ────────────────────────────────────────────────────────
    it('isSpellUnlocked returns false for unknown spell', () => {
        expect(ps.isSpellUnlocked('nonexistent_spell')).toBe(false);
    });
    // ── readCount ─────────────────────────────────────────────────────────────
    it('readCount starts at 0', () => {
        expect(ps.readCount).toBe(0);
    });
    it('readCount increments once per unique book', () => {
        ps.markRead('a');
        ps.markRead('b');
        ps.markRead('a'); // duplicate — should not increase count
        expect(ps.readCount).toBe(2);
    });
    // ── getUnlockedSpells ─────────────────────────────────────────────────────
    it('getUnlockedSpells returns sorted list', () => {
        ps.markRead('b', 'magic_bolt'); // already pre-unlocked
        ps.markRead('a', 'flame_dart');
        expect(ps.getUnlockedSpells()).toEqual(['flame_dart', 'magic_bolt']);
    });
    it('getUnlockedSpells returns [magic_bolt] on fresh instance (starter spell)', () => {
        expect(ps.getUnlockedSpells()).toEqual(['magic_bolt']);
    });
});
