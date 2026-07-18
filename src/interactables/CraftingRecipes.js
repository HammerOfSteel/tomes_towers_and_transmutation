/**
 * CraftingRecipes — data definitions for all 4 crafting station types.
 *
 * Phase 7f: Crafting Systems
 *
 * Station types:
 *   alchemy   — Alchemy Station (cauldron): potion recipes
 *   forge     — Forge: equipment token recipes
 *   enchanting — Enchanting Table: spell modifier chips
 *   blueprint  — Blueprint Crafting (base building): structure blueprints
 */
// ── Alchemy recipes ────────────────────────────────────────────────────────
export const ALCHEMY_RECIPES = [
    {
        id: 'potion_heal_minor',
        stationType: 'alchemy',
        name: 'Minor Healing Draught',
        icon: '🧪',
        ingredients: [
            { type: 'essence', amount: 1, label: '1 Essence' },
        ],
        result: {
            kind: 'potion', id: 'potion_heal_minor',
            name: 'Minor Healing Draught',
            description: 'Restores 15 HP when consumed.',
        },
        animDuration: 3,
    },
    {
        id: 'potion_heal_major',
        stationType: 'alchemy',
        name: 'Major Healing Draught',
        icon: '🧪',
        ingredients: [
            { type: 'essence', amount: 3, label: '3 Essence' },
            { type: 'ore', amount: 1, label: '1 Ore' },
        ],
        result: {
            kind: 'potion', id: 'potion_heal_major',
            name: 'Major Healing Draught',
            description: 'Restores 40 HP when consumed.',
        },
        animDuration: 3,
    },
    {
        id: 'potion_swiftness',
        stationType: 'alchemy',
        name: 'Swiftness Brew',
        icon: '💨',
        ingredients: [
            { type: 'essence', amount: 2, label: '2 Essence' },
            { type: 'timber', amount: 1, label: '1 Timber' },
        ],
        result: {
            kind: 'potion', id: 'potion_swiftness',
            name: 'Swiftness Brew',
            description: '+30% movement speed for 30s.',
        },
        animDuration: 3,
    },
    {
        id: 'potion_power',
        stationType: 'alchemy',
        name: 'Power Tincture',
        icon: '💪',
        ingredients: [
            { type: 'essence', amount: 2, label: '2 Essence' },
            { type: 'ore', amount: 2, label: '2 Ore' },
        ],
        result: {
            kind: 'potion', id: 'potion_power',
            name: 'Power Tincture',
            description: '+50% melee damage for 20s.',
        },
        animDuration: 3,
    },
    {
        id: 'potion_mystery',
        stationType: 'alchemy',
        name: 'Mystery Concoction',
        icon: '❓',
        ingredients: [
            { type: 'essence', amount: 1, label: '1 Essence' },
            { type: 'timber', amount: 1, label: '1 Timber' },
            { type: 'ore', amount: 1, label: '1 Ore' },
        ],
        result: {
            kind: 'potion', id: 'potion_mystery',
            name: 'Mystery Concoction',
            description: 'Unknown effect. Result is seeded by attempt count.',
        },
        animDuration: 4,
    },
];
// ── Forge recipes ──────────────────────────────────────────────────────────
export const FORGE_RECIPES = [
    {
        id: 'token_iron_blade',
        stationType: 'forge',
        name: 'Iron Blade Token',
        icon: '⚔️',
        ingredients: [
            { type: 'ore', amount: 3, label: '3 Ore' },
            { type: 'recipe_card', amount: 1, label: '1 Recipe Card' },
        ],
        result: {
            kind: 'equipment_token', id: 'token_iron_blade',
            name: 'Iron Blade Token',
            description: '+5 Power stat while equipped.',
        },
        animDuration: 4,
    },
    {
        id: 'token_arcane_focus',
        stationType: 'forge',
        name: 'Arcane Focus Token',
        icon: '🔮',
        ingredients: [
            { type: 'ore', amount: 2, label: '2 Ore' },
            { type: 'essence', amount: 2, label: '2 Essence' },
            { type: 'recipe_card', amount: 1, label: '1 Recipe Card' },
        ],
        result: {
            kind: 'equipment_token', id: 'token_arcane_focus',
            name: 'Arcane Focus Token',
            description: '+3 Attunement stat while equipped.',
        },
        animDuration: 4,
    },
    {
        id: 'token_vitality_band',
        stationType: 'forge',
        name: 'Vitality Band Token',
        icon: '💚',
        ingredients: [
            { type: 'ore', amount: 2, label: '2 Ore' },
            { type: 'timber', amount: 1, label: '1 Timber' },
            { type: 'recipe_card', amount: 1, label: '1 Recipe Card' },
        ],
        result: {
            kind: 'equipment_token', id: 'token_vitality_band',
            name: 'Vitality Band Token',
            description: '+4 Vitality stat while equipped.',
        },
        animDuration: 4,
    },
];
// ── Enchanting recipes ─────────────────────────────────────────────────────
export const ENCHANTING_RECIPES = [
    {
        id: 'chip_blazing',
        stationType: 'enchanting',
        name: 'Blazing Chip',
        icon: '🔥',
        ingredients: [
            { type: 'essence', amount: 2, label: '2 Essence' },
            { type: 'ore', amount: 1, label: '1 Ore' },
        ],
        result: {
            kind: 'enchant_chip', id: 'chip_blazing',
            name: 'Blazing',
            description: 'Spell gains fire DoT: 2 dmg/s for 3s.',
        },
        animDuration: 2.5,
    },
    {
        id: 'chip_seeking',
        stationType: 'enchanting',
        name: 'Seeking Chip',
        icon: '🎯',
        ingredients: [
            { type: 'essence', amount: 3, label: '3 Essence' },
        ],
        result: {
            kind: 'enchant_chip', id: 'chip_seeking',
            name: 'Seeking',
            description: 'Projectile gains mild homing toward nearest enemy.',
        },
        animDuration: 2.5,
    },
    {
        id: 'chip_glacial',
        stationType: 'enchanting',
        name: 'Glacial Chip',
        icon: '❄️',
        ingredients: [
            { type: 'essence', amount: 2, label: '2 Essence' },
            { type: 'timber', amount: 1, label: '1 Timber' },
        ],
        result: {
            kind: 'enchant_chip', id: 'chip_glacial',
            name: 'Glacial',
            description: 'Slows hit enemy movement by 40% for 2s.',
        },
        animDuration: 2.5,
    },
];
// ── Blueprint recipes ──────────────────────────────────────────────────────
export const BLUEPRINT_RECIPES = [
    {
        id: 'blueprint_barrier_wall',
        stationType: 'blueprint',
        name: 'Barrier Wall Blueprint',
        icon: '🧱',
        ingredients: [
            { type: 'timber', amount: 3, label: '3 Timber' },
        ],
        result: {
            kind: 'blueprint', id: 'blueprint_barrier_wall',
            name: 'Barrier Wall',
            description: '3u tall solid wall. Blocks enemy pathing.',
        },
        animDuration: 2,
    },
    {
        id: 'blueprint_watch_perch',
        stationType: 'blueprint',
        name: 'Watch Perch Blueprint',
        icon: '🗼',
        ingredients: [
            { type: 'timber', amount: 2, label: '2 Timber' },
            { type: 'ore', amount: 1, label: '1 Ore' },
        ],
        result: {
            kind: 'blueprint', id: 'blueprint_watch_perch',
            name: 'Watch Perch',
            description: 'Assign a minion as a guard. +4 aggro range.',
        },
        animDuration: 2,
    },
    {
        id: 'blueprint_healing_fountain',
        stationType: 'blueprint',
        name: 'Healing Fountain Blueprint',
        icon: '💧',
        ingredients: [
            { type: 'ore', amount: 4, label: '4 Ore' },
        ],
        result: {
            kind: 'blueprint', id: 'blueprint_healing_fountain',
            name: 'Healing Fountain',
            description: '+1 HP/5s to player & minions in 5u radius.',
        },
        animDuration: 2,
    },
    {
        id: 'blueprint_ward_stone',
        stationType: 'blueprint',
        name: 'Ward Stone Blueprint',
        icon: '🔯',
        ingredients: [
            { type: 'essence', amount: 3, label: '3 Essence' },
        ],
        result: {
            kind: 'blueprint', id: 'blueprint_ward_stone',
            name: 'Ward Stone',
            description: 'Repels hostile entities from a 4u radius.',
        },
        animDuration: 2,
    },
];
// ── Lookup helpers ─────────────────────────────────────────────────────────
export const ALL_RECIPES = [
    ...ALCHEMY_RECIPES,
    ...FORGE_RECIPES,
    ...ENCHANTING_RECIPES,
    ...BLUEPRINT_RECIPES,
];
export const RECIPES_BY_STATION = {
    alchemy: ALCHEMY_RECIPES,
    forge: FORGE_RECIPES,
    enchanting: ENCHANTING_RECIPES,
    blueprint: BLUEPRINT_RECIPES,
};
export function getRecipe(id) {
    return ALL_RECIPES.find(r => r.id === id);
}
