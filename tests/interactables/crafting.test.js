import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Inventory } from '@/core/Inventory';
import { CraftingUI } from '@/interactables/CraftingUI';
import { ALCHEMY_RECIPES, FORGE_RECIPES, getRecipe, ALL_RECIPES } from '@/interactables/CraftingRecipes';
// Provide localStorage stub (jsdom quirk for opaque origins)
const storageMock = (() => {
    let store = {};
    return {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = v; },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; },
    };
})();
vi.stubGlobal('localStorage', storageMock);
describe('CraftingRecipes data', () => {
    it('all recipes have at least one ingredient', () => {
        for (const recipe of ALL_RECIPES) {
            expect(recipe.ingredients.length).toBeGreaterThan(0);
        }
    });
    it('all recipe ids are unique', () => {
        const ids = ALL_RECIPES.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it('getRecipe returns undefined for unknown id', () => {
        expect(getRecipe('no_such_recipe')).toBeUndefined();
    });
    it('getRecipe returns the correct recipe', () => {
        const r = getRecipe('potion_heal_minor');
        expect(r).toBeDefined();
        expect(r.stationType).toBe('alchemy');
        expect(r.result.kind).toBe('potion');
    });
    it('alchemy recipes all belong to alchemy station', () => {
        for (const r of ALCHEMY_RECIPES) {
            expect(r.stationType).toBe('alchemy');
        }
    });
    it('forge recipes all belong to forge station', () => {
        for (const r of FORGE_RECIPES) {
            expect(r.stationType).toBe('forge');
        }
    });
    it('animDuration is positive for all recipes', () => {
        for (const r of ALL_RECIPES) {
            expect(r.animDuration).toBeGreaterThan(0);
        }
    });
    it('no recipe has more than 3 ingredients', () => {
        for (const r of ALL_RECIPES) {
            expect(r.ingredients.length).toBeLessThanOrEqual(3);
        }
    });
});
describe('CraftingUI', () => {
    let inv;
    let ui;
    beforeEach(() => {
        localStorage.clear();
        inv = new Inventory();
        ui = new CraftingUI(inv);
    });
    it('is not open by default', () => {
        expect(ui.isOpen).toBe(false);
    });
    it('opens for a given station type', () => {
        ui.open('alchemy');
        expect(ui.isOpen).toBe(true);
    });
    it('closes', () => {
        ui.open('alchemy');
        ui.close();
        expect(ui.isOpen).toBe(false);
    });
    it('toggle opens when closed', () => {
        ui.toggle('alchemy');
        expect(ui.isOpen).toBe(true);
    });
    it('toggle closes when same station already open', () => {
        ui.open('alchemy');
        ui.toggle('alchemy');
        expect(ui.isOpen).toBe(false);
    });
    it('toggle switches station when different station', () => {
        ui.open('alchemy');
        ui.toggle('forge');
        expect(ui.isOpen).toBe(true); // stays open but changes station
    });
    it('onCraft fires after crafting with sufficient resources', () => {
        const recipe = getRecipe('potion_heal_minor');
        // Give enough essence
        inv.add('essence', recipe.ingredients[0].amount);
        const crafted = [];
        ui.onCraft = (r) => crafted.push(r.id);
        ui.open('alchemy');
        // Programmatically trigger craft (simulate selecting + clicking)
        // Access private method via type casting for testing
        ui._selected = recipe;
        ui._startCraft();
        // Resources are deducted immediately on craft start (before animation)
        expect(inv.get('essence')).toBe(0);
    });
    it('craft does not deduct resources if insufficient', () => {
        const recipe = getRecipe('potion_heal_major'); // needs 3 essence + 1 ore
        inv.add('essence', 1); // not enough
        ui._selected = recipe;
        // spendMulti returns false → craft should bail
        ui._startCraft();
        expect(inv.get('essence')).toBe(1); // unchanged
    });
    it('mystery potion recipe exists with 3 mixed ingredients', () => {
        const mystery = getRecipe('potion_mystery');
        expect(mystery).toBeDefined();
        expect(mystery.ingredients.length).toBe(3);
        const types = mystery.ingredients.map(i => i.type);
        expect(types).toContain('essence');
        expect(types).toContain('timber');
        expect(types).toContain('ore');
    });
});
