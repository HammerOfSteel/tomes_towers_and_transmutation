/**
 * DevRoomHandoff — generalizes the "open the real game straight into a
 * specific dev/test room" pattern used by the Water Lab quick-launch
 * button in Overworld Studio. Adding a future dev room is: one more
 * DevRoomId union member, one more button in the Dev Rooms section, and
 * one more `case` in main.ts's boot handoff.
 *
 * The handoff is a "?devroom=<id>" query param on the URL used to open
 * the new tab, NOT localStorage. window.open('/index.html', '_blank')
 * can land in a browsing context that doesn't share localStorage with
 * the opener (observed in some embedded/desktop-app webviews), which
 * silently drops the handoff and leaves the new tab on the main menu.
 * A URL query param travels with the navigation itself, so it can't be
 * dropped that way. localStorage is still written/read as a legacy
 * fallback for any external callers, but the query param is primary.
 */
export const DEV_ROOM_LAUNCH_KEY = 'ttt_dev_room_launch';
export const DEV_ROOM_LAUNCH_PARAM = 'devroom';

export type DevRoomId = 'water-lab' | 'settlement-lab' | 'overworld-lab';

/** Carried-over settlement parameters for a "Play in 3D" settlement-lab
 * launch from Overworld Studio's Settlement tab, so the lab opens showing
 * the exact settlement that was configured there instead of its own
 * hardcoded defaults. */
export interface SettlementLabLaunchParams {
  seed:    number;
  type:    string;
  faction: string;
  layout:  string;
}

/** Carried-over realm parameters for a "Play in 3D" overworld-lab launch
 * from Overworld Studio's Realm tab, so the live game's exterior overworld
 * boots using the exact realm configuration previewed there (seed, shape,
 * climate, roughness, settlement count) instead of the player's own saved
 * world-gen settings. `worldSize` is the closest square live `WorldSize`
 * (128/256/512) to the Studio's (possibly non-square) realm size preset —
 * see `2026-08-30-overworld-lab.md`'s "Known, deliberate approximation"
 * note for why an exact resample isn't attempted here. */
export interface OverworldLabLaunchParams {
  seed:            number;
  worldSize:       128 | 256 | 512;
  shape:           string;   // RealmShape, kept as string to avoid importing RealmGenerator.ts's types into this DOM-adjacent module
  climate:         string;   // RealmClimate
  roughness:       number;
  settlementCount: number;
}

const SL_SEED_PARAM    = 'sl_seed';
const SL_TYPE_PARAM    = 'sl_type';
const SL_FACTION_PARAM = 'sl_faction';
const SL_LAYOUT_PARAM  = 'sl_layout';

const OL_SEED_PARAM        = 'ol_seed';
const OL_WORLDSIZE_PARAM   = 'ol_worldsize';
const OL_SHAPE_PARAM       = 'ol_shape';
const OL_CLIMATE_PARAM     = 'ol_climate';
const OL_ROUGHNESS_PARAM   = 'ol_roughness';
const OL_SETTLEMENTS_PARAM = 'ol_settlements';

/** Builds the URL used to open `page` straight into `room`. */
export function buildDevRoomLaunchUrl(page: string, room: DevRoomId): string {
  const url = new URL(page, window.location.href);
  url.searchParams.set(DEV_ROOM_LAUNCH_PARAM, room);
  return url.pathname + url.search;
}

/** Builds the URL used to open `page` straight into the Settlement Lab,
 * carrying over `params` (seed/type/faction/layout) so it renders the
 * exact settlement configured in Overworld Studio's Settlement tab rather
 * than the lab's own defaults. Uses the same query-param handoff mechanism
 * as `buildDevRoomLaunchUrl` (see module doc comment for why: it survives
 * browsing contexts that don't share localStorage with the opener). */
export function buildSettlementLabLaunchUrl(page: string, params: SettlementLabLaunchParams): string {
  const url = new URL(page, window.location.href);
  url.searchParams.set(DEV_ROOM_LAUNCH_PARAM, 'settlement-lab');
  url.searchParams.set(SL_SEED_PARAM, String(params.seed));
  url.searchParams.set(SL_TYPE_PARAM, params.type);
  url.searchParams.set(SL_FACTION_PARAM, params.faction);
  url.searchParams.set(SL_LAYOUT_PARAM, params.layout);
  return url.pathname + url.search;
}

/** Builds the URL used to open `page` straight into the live exterior
 * overworld, carrying over `params` (seed/worldSize/shape/climate/
 * roughness/settlementCount) from Overworld Studio's Realm tab — see
 * `OverworldLabLaunchParams`'s doc comment. Same query-param handoff
 * mechanism as the other `build*LaunchUrl` functions. */
export function buildOverworldLabLaunchUrl(page: string, params: OverworldLabLaunchParams): string {
  const url = new URL(page, window.location.href);
  url.searchParams.set(DEV_ROOM_LAUNCH_PARAM, 'overworld-lab');
  url.searchParams.set(OL_SEED_PARAM, String(params.seed));
  url.searchParams.set(OL_WORLDSIZE_PARAM, String(params.worldSize));
  url.searchParams.set(OL_SHAPE_PARAM, params.shape);
  url.searchParams.set(OL_CLIMATE_PARAM, params.climate);
  url.searchParams.set(OL_ROUGHNESS_PARAM, String(params.roughness));
  url.searchParams.set(OL_SETTLEMENTS_PARAM, String(params.settlementCount));
  return url.pathname + url.search;
}

/** Reads a pending dev-room id from the URL's query param (primary) or
 * localStorage (legacy fallback), returning null if neither is set. */
export function readPendingDevRoom(): DevRoomId | null {
  const validIds: DevRoomId[] = ['water-lab', 'settlement-lab', 'overworld-lab'];
  const fromQuery = new URLSearchParams(window.location.search).get(DEV_ROOM_LAUNCH_PARAM);
  if (validIds.includes(fromQuery as DevRoomId)) return fromQuery as DevRoomId;
  const fromStorage = localStorage.getItem(DEV_ROOM_LAUNCH_KEY);
  if (validIds.includes(fromStorage as DevRoomId)) return fromStorage as DevRoomId;
  return null;
}

/** Reads carried-over settlement params from the URL's `sl_*` query params
 * (set by `buildSettlementLabLaunchUrl`), returning null if they're absent
 * or malformed (e.g. a non-numeric seed) — callers should then fall back
 * to the Settlement Lab's own defaults, exactly as if no handoff params
 * were present at all. Query-param only (no localStorage fallback): these
 * are only ever produced by a same-tab-navigation `window.open()` call, so
 * the storage-drop concern that justifies the devroom/localStorage
 * fallback above doesn't apply here. */
export function readPendingSettlementLabParams(): SettlementLabLaunchParams | null {
  const search = new URLSearchParams(window.location.search);
  const seedRaw = search.get(SL_SEED_PARAM);
  const type    = search.get(SL_TYPE_PARAM);
  const faction = search.get(SL_FACTION_PARAM);
  const layout  = search.get(SL_LAYOUT_PARAM);
  if (seedRaw === null || type === null || faction === null || layout === null) return null;
  const seed = Number(seedRaw);
  if (!Number.isFinite(seed)) return null;
  return { seed, type, faction, layout };
}

/** Reads carried-over realm params from the URL's `ol_*` query params (set
 * by `buildOverworldLabLaunchUrl`), returning null if they're absent or
 * malformed — including a `worldSize` that isn't exactly 128/256/512,
 * which would otherwise silently construct an invalid `WorldGenConfig`.
 * Query-param only, same rationale as `readPendingSettlementLabParams`. */
export function readPendingOverworldLabParams(): OverworldLabLaunchParams | null {
  const search = new URLSearchParams(window.location.search);
  const seedRaw       = search.get(OL_SEED_PARAM);
  const worldSizeRaw  = search.get(OL_WORLDSIZE_PARAM);
  const shape         = search.get(OL_SHAPE_PARAM);
  const climate       = search.get(OL_CLIMATE_PARAM);
  const roughnessRaw  = search.get(OL_ROUGHNESS_PARAM);
  const settlementsRaw = search.get(OL_SETTLEMENTS_PARAM);
  if (seedRaw === null || worldSizeRaw === null || shape === null || climate === null
      || roughnessRaw === null || settlementsRaw === null) return null;
  const seed = Number(seedRaw);
  const worldSizeNum = Number(worldSizeRaw);
  const roughness = Number(roughnessRaw);
  const settlementCount = Number(settlementsRaw);
  if (!Number.isFinite(seed) || !Number.isFinite(roughness) || !Number.isFinite(settlementCount)) return null;
  if (worldSizeNum !== 128 && worldSizeNum !== 256 && worldSizeNum !== 512) return null;
  return { seed, worldSize: worldSizeNum, shape, climate, roughness, settlementCount };
}

/** Clears both the query param (via history.replaceState, no reload) and
 * the legacy localStorage key, so a later reload of the same tab doesn't
 * re-trigger the handoff. */
export function clearPendingDevRoom(): void {
  localStorage.removeItem(DEV_ROOM_LAUNCH_KEY);
  const url = new URL(window.location.href);
  let changed = false;
  for (const param of [
    DEV_ROOM_LAUNCH_PARAM, SL_SEED_PARAM, SL_TYPE_PARAM, SL_FACTION_PARAM, SL_LAYOUT_PARAM,
    OL_SEED_PARAM, OL_WORLDSIZE_PARAM, OL_SHAPE_PARAM, OL_CLIMATE_PARAM, OL_ROUGHNESS_PARAM, OL_SETTLEMENTS_PARAM,
  ]) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}
