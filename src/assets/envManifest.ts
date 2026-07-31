// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// envManifest.ts — empty procedural manifest.
//
// The game no longer ships external GLB asset kits (KayKit / Kenney);
// all environment art is procedurally generated (see src/rendering,
// src/world/buildings/BuildingGenerator.ts). This file is kept only so
// the legacy asset-browser UI (Creative Mode "Models" tab, model-review
// Environment/Editor tabs, backroom asset showcase) still type-checks
// and renders an empty/no-op state instead of crashing.
//
// If external kits are ever reintroduced, populate ENV_KITS/ENV_ASSETS
// here (see public/assets-index/*.json for the historical data shape).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type KitGroup = 'kaykit' | 'kenney' | 'kenney_modular';

export interface EnvKitDef {
  id:        string;
  group:     KitGroup;
  label:     string;
  icon:      string;
  /** URL prefix under /assets/ used to match hotbar slots to a kit; unset when not extracted. */
  path?:     string;
  extracted: boolean;
}

export interface EnvAssetDef {
  path:      string;
  name:      string;
  category:  string;
  gameScale: number;
  kitId:     string;
}

export const ENV_KITS: EnvKitDef[] = [];

export const ENV_ASSETS: EnvAssetDef[] = [];

export const ENV_CATEGORIES: string[] = [];
