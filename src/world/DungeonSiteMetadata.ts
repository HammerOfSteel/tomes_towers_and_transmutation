/**
 * DungeonSiteMetadata.ts — 02-game-world-integration (DI-2, DI-2b)
 *
 * Pure data transform: enriches a realm-map dungeon marker (OW-A
 * `RealmData.dungeons[]` — currently just `{x, y}`) with a deterministic
 * seed, entrance faction, and DI-2b's "site-family identity" + reward-bias
 * metadata, without touching `overworld-studio.ts`'s dungeon marker
 * placement algorithm itself (that logic — spacing dungeons away from
 * settlements and from each other — already lives in `generateRealmData`
 * and is out of scope here; this module only *enriches* whatever markers
 * that placement produces).
 *
 * Every `DungeonSite` this module produces is derived solely from the
 * marker's (x, y) plus the realm seed, so re-running generation with the
 * same realm seed always yields the same site-family/reward-bias/faction
 * assignment for a dungeon at a given position (DI-5's persistence
 * requirement) without needing to store anything beyond the realm seed.
 *
 * Note on "school bias" (DI-2b: "school bias tags where relevant"): the
 * canonical spell-school list is not yet finalized (see
 * `TODO/06-game-systems/tomes-research-spellcraft.md`, TRS-1 "Define
 * school list aligned to new design" — still unchecked). `schoolBias`
 * below is therefore a provisional, free-form `string[]` rather than a
 * strict union, sourced from `PROVISIONAL_SCHOOLS`; replace with the real
 * school enum once TRS-1 lands.
 */

import { mulberry32 } from '@/core/prng';
import type { SettlementFaction } from '@/overworld-studio';

// ── DI-2b — site-family identity ─────────────────────────────────────────────

export type DungeonSiteFamily =
  | 'tower_floor'
  | 'library_ruin'
  | 'alchemy_vault'
  | 'tomb_barrow'
  | 'beast_lair'
  | 'mine_works'
  | 'observatory_ruin'
  | 'surface_threat';

export type DungeonRewardBiasTag =
  | 'knowledge_rich'
  | 'volatile_materials'
  | 'beast_capture_opportunity'
  | 'defense_intel'
  | 'candidate_archive';

/** Provisional school-bias tags — see module header. Replace once TRS-1 defines the real school list. */
export const PROVISIONAL_SCHOOLS = [
  'elemental', 'illusion', 'necromancy', 'alchemy', 'conjuration', 'divination',
] as const;
export type ProvisionalSchool = typeof PROVISIONAL_SCHOOLS[number];

/**
 * Per-site-family fixed traits: which reward-bias tags it always carries,
 * whether it's an elite-recruit or defense-intel source, and which
 * provisional schools it's likely to bias toward (empty = no school lean).
 */
interface SiteFamilyProfile {
  rewardBias: DungeonRewardBiasTag[];
  eliteRecruitOpportunity: boolean;
  defenseIntelSource: boolean;
  likelySchools: ProvisionalSchool[];
}

const SITE_FAMILY_PROFILES: Record<DungeonSiteFamily, SiteFamilyProfile> = {
  tower_floor:       { rewardBias: ['defense_intel'],                                   eliteRecruitOpportunity: false, defenseIntelSource: true,  likelySchools: [] },
  library_ruin:      { rewardBias: ['knowledge_rich', 'candidate_archive'],              eliteRecruitOpportunity: false, defenseIntelSource: false, likelySchools: ['divination', 'illusion'] },
  alchemy_vault:     { rewardBias: ['volatile_materials', 'knowledge_rich'],             eliteRecruitOpportunity: false, defenseIntelSource: false, likelySchools: ['alchemy'] },
  tomb_barrow:       { rewardBias: ['candidate_archive', 'volatile_materials'],          eliteRecruitOpportunity: true,  defenseIntelSource: false, likelySchools: ['necromancy'] },
  beast_lair:        { rewardBias: ['beast_capture_opportunity'],                        eliteRecruitOpportunity: true,  defenseIntelSource: false, likelySchools: [] },
  mine_works:        { rewardBias: ['volatile_materials'],                               eliteRecruitOpportunity: false, defenseIntelSource: false, likelySchools: ['elemental'] },
  observatory_ruin:  { rewardBias: ['knowledge_rich'],                                   eliteRecruitOpportunity: false, defenseIntelSource: true,  likelySchools: ['divination'] },
  surface_threat:    { rewardBias: ['defense_intel', 'beast_capture_opportunity'],       eliteRecruitOpportunity: true,  defenseIntelSource: true,  likelySchools: ['conjuration'] },
};

const SITE_FAMILIES = Object.keys(SITE_FAMILY_PROFILES) as DungeonSiteFamily[];

/** Faction the entrance/interior is themed after — reuses the realm-map faction palette (DI-1's `buildDungeonEntrance(faction)`). */
const ENTRANCE_FACTIONS: SettlementFaction[] = [
  'human', 'elven', 'dwarven', 'orcish', 'vampire', 'undead', 'vulperia', 'slime', 'fae',
];

export interface DungeonMarker { x: number; y: number; }

export interface DungeonSite {
  x: number;
  y: number;
  /** Deterministic per-dungeon seed (derived from realm seed + position), used for DungeonScene generation and re-derivable for save/load (DI-5). */
  seed: number;
  faction: SettlementFaction;
  siteFamily: DungeonSiteFamily;
  rewardBias: DungeonRewardBiasTag[];
  /** Provisional — see module header. */
  schoolBias: ProvisionalSchool[];
  eliteRecruitOpportunity: boolean;
  defenseIntelSource: boolean;
  /** Optional book/reagent family hints a content-seeding pass could read (DI-2b "likely book/reagent families") — deliberately generic strings, not tied to a specific enum yet. */
  likelyBookFamilies: string[];
  likelyReagentFamilies: string[];
}

function hashDungeonMarker(realmSeed: number, marker: DungeonMarker): number {
  let h = (realmSeed >>> 0) ^ Math.imul(marker.x + 1, 374761393) ^ Math.imul(marker.y + 1, 668265263);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

/** DI-2b's book/reagent family hint text per site family — free-form, for a content-seeding pass to consume. */
const BOOK_FAMILY_HINTS: Record<DungeonSiteFamily, string[]> = {
  tower_floor:      ['tower_lore', 'defense_doctrine'],
  library_ruin:     ['archive_fragment', 'lost_treatise'],
  alchemy_vault:    ['formulary', 'reagent_codex'],
  tomb_barrow:      ['funerary_rite', 'candidate_biography'],
  beast_lair:       ['bestiary'],
  mine_works:       ['prospecting_ledger'],
  observatory_ruin: ['star_chart', 'divination_treatise'],
  surface_threat:   ['threat_report', 'defense_doctrine'],
};

const REAGENT_FAMILY_HINTS: Record<DungeonSiteFamily, string[]> = {
  tower_floor:      [],
  library_ruin:     [],
  alchemy_vault:    ['volatile_essence', 'catalyst_salt'],
  tomb_barrow:      ['grave_dust', 'bone_relic'],
  beast_lair:       ['beast_ichor', 'hide_scale'],
  mine_works:       ['raw_ore', 'crystal_shard'],
  observatory_ruin: ['star_metal'],
  surface_threat:   ['corrupted_essence'],
};

/**
 * DI-2 / DI-2b — enrich a bare realm-map dungeon marker `{x, y}` into a full
 * `DungeonSite` with a deterministic seed, faction, site-family identity,
 * and reward-bias metadata. Pure function — same `(realmSeed, marker)`
 * always produces the same `DungeonSite`.
 */
export function enrichDungeonMarker(realmSeed: number, marker: DungeonMarker): DungeonSite {
  const seed = hashDungeonMarker(realmSeed, marker);
  const rand = mulberry32(seed);

  const siteFamily = SITE_FAMILIES[Math.floor(rand() * SITE_FAMILIES.length)]!;
  const faction = ENTRANCE_FACTIONS[Math.floor(rand() * ENTRANCE_FACTIONS.length)]!;
  const profile = SITE_FAMILY_PROFILES[siteFamily];

  return {
    x: marker.x,
    y: marker.y,
    seed,
    faction,
    siteFamily,
    rewardBias: profile.rewardBias,
    schoolBias: profile.likelySchools,
    eliteRecruitOpportunity: profile.eliteRecruitOpportunity,
    defenseIntelSource: profile.defenseIntelSource,
    likelyBookFamilies: BOOK_FAMILY_HINTS[siteFamily],
    likelyReagentFamilies: REAGENT_FAMILY_HINTS[siteFamily],
  };
}

/** DI-2 — enrich every dungeon marker in a realm at once. */
export function enrichDungeonMarkers(realmSeed: number, markers: readonly DungeonMarker[]): DungeonSite[] {
  return markers.map(m => enrichDungeonMarker(realmSeed, m));
}
