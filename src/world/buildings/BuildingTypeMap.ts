import { WARD_TO_KIND, WARD_TO_SIZE, WARD_TO_FLOORS } from '@/buildingToDungeonPlan';
import type { SettlementType, PlacedBuilding } from '../SettlementGenerator';
import type { BuildingDNA, Faction } from './BuildingDNA';
import { factionBuildingDna } from './BuildingDNA';

export function mapStudioFactionToRuntimeFaction(faction: string): Faction {
  const map: Record<string, Faction> = {
    human: 'human_town',
    elven: 'elven',
    dwarven: 'dwarven',
    orcish: 'orcish',
    vampire: 'vampire',
    undead: 'undead_common',
    vulperia: 'vulperia',
    slime: 'slime',
    fae: 'fae',
  };
  return map[faction] ?? 'human_town';
}

export function settlementTypeToFaction(type: SettlementType): Faction {
  switch (type) {
    case 'village': return 'human_rural';
    case 'town': return 'human_town';
    case 'city': return 'human_noble';
  }
}

export function createSettlementBuildingDna(
  b: PlacedBuilding,
  settlementType: SettlementType,
  faction: Faction,
): BuildingDNA | null {
  const kind = WARD_TO_KIND[b.wardType];
  if (!kind) return null;
  if (b.isAnchor) {
    const size = WARD_TO_SIZE[b.wardType] ?? 'medium';
    const floors = WARD_TO_FLOORS[b.wardType] ?? (settlementType === 'city' ? 2 : 1);
    return factionBuildingDna(kind, faction, b.seed, size, floors as 1 | 2 | 3 | 4);
  }
  const dna = factionBuildingDna(kind, faction, b.seed, 'tiny', 1);
  dna.hasInterior = false;
  dna.interiorLayout = 'none';
  return dna;
}
