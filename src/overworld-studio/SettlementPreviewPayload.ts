export const OVERWORLD_SETTLEMENT_PREVIEW_KEY = 'ttt_overworld_settlement_preview';

export interface SettlementPreviewPoint {
  x: number;
  y: number;
}

export interface SettlementPreviewWard {
  type: string;
  center: SettlementPreviewPoint;
  withinCity: boolean;
}

export interface SettlementPreviewModel {
  centre: SettlementPreviewPoint;
  radius: number;
  wards: SettlementPreviewWard[];
}

export interface OverworldSettlementPreviewPayload {
  version: 1;
  seed: number;
  name: string;
  settlementType: 'village' | 'town' | 'city';
  faction: string;
  model: SettlementPreviewModel;
}