/**
 * CreatureStats — derived gameplay-stat modifiers computed from CreatureDNA.
 *
 * CC-9: Visual choices have mild stat implications that deepen identity investment.
 * Stats are flavor-level tweaks, not hard power differences.
 *
 * Computed once at creation time (or DNA change) and stored alongside the DNA.
 */
// ── Derivation function ────────────────────────────────────────────────────────
/**
 * Computes `CreatureStatModifiers` from a DNA object.
 * Call this once at character creation time (or after DNA edit), then store
 * the result in `CharacterConfig.derivedStats`.
 */
export function deriveStats(dna) {
    const props = dna.props;
    const outfit = dna.outfit ?? { top: 'none', legs: 'none', over: 'none' };
    // ── Glide bonus — wings_bat prop or avian archetype ───────────────────
    const hasWings = props.includes('wings_bat') || dna.archetype === 'avian';
    const glideDurationBonus = hasWings ? 0.8 : 0;
    // ── Melee damage — tusks (fangs not in PropId set) ─────────────────────
    const hasFangsOrTusks = props.includes('tusk_lower');
    const meleeDamageBonus = hasFangsOrTusks ? 0.05 : 0;
    // ── Spell range — aura ────────────────────────────────────────────────
    const spellRangeBonus = props.includes('aura') ? 0.10 : 0;
    // ── Physical resistance — armor prop or armor_chest outfit ────────────
    const hasArmor = props.includes('armor_light')
        || outfit.top === 'armor_chest'
        || outfit.legs === 'armor_legs';
    const physicalResistBonus = hasArmor ? 0.08 : 0;
    // ── Spell damage — robe / mage outfit ─────────────────────────────────
    const isMageOutfit = props.includes('robe')
        || outfit.over === 'robe_full'
        || outfit.over === 'robe_layered'
        || outfit.top === 'dress_layered';
    const spellDamageBonus = isMageOutfit ? 0.08 : 0;
    // ── Speed — serpent archetype ─────────────────────────────────────────
    const speedBonus = dna.archetype === 'serpent' ? 0.15 : 0;
    // ── NPC dialogue label ────────────────────────────────────────────────
    const subRace = dna.subRace;
    const creatureTypeLabel = (subRace && subRace !== 'none')
        ? String(subRace).replace(/_/g, ' ')
        : dna.archetype;
    return {
        glideDurationBonus,
        meleeDamageBonus,
        spellRangeBonus,
        physicalResistBonus,
        spellDamageBonus,
        speedBonus,
        creatureTypeLabel,
    };
}
// ── Aggregate ─────────────────────────────────────────────────────────────────
/** Sum multiple stat modifier objects (for stacking items/effects). */
export function stackStats(base, ...rest) {
    let out = { ...base };
    for (const s of rest) {
        if (s.glideDurationBonus != null)
            out.glideDurationBonus += s.glideDurationBonus;
        if (s.meleeDamageBonus != null)
            out.meleeDamageBonus += s.meleeDamageBonus;
        if (s.spellRangeBonus != null)
            out.spellRangeBonus += s.spellRangeBonus;
        if (s.physicalResistBonus != null)
            out.physicalResistBonus += s.physicalResistBonus;
        if (s.spellDamageBonus != null)
            out.spellDamageBonus += s.spellDamageBonus;
        if (s.speedBonus != null)
            out.speedBonus += s.speedBonus;
    }
    return out;
}
