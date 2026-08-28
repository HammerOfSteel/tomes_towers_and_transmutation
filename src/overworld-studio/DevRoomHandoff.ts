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

export type DevRoomId = 'water-lab' | 'settlement-lab';

/** Builds the URL used to open `page` straight into `room`. */
export function buildDevRoomLaunchUrl(page: string, room: DevRoomId): string {
  const url = new URL(page, window.location.href);
  url.searchParams.set(DEV_ROOM_LAUNCH_PARAM, room);
  return url.pathname + url.search;
}

/** Reads a pending dev-room id from the URL's query param (primary) or
 * localStorage (legacy fallback), returning null if neither is set. */
export function readPendingDevRoom(): DevRoomId | null {
  const validIds: DevRoomId[] = ['water-lab', 'settlement-lab'];
  const fromQuery = new URLSearchParams(window.location.search).get(DEV_ROOM_LAUNCH_PARAM);
  if (validIds.includes(fromQuery as DevRoomId)) return fromQuery as DevRoomId;
  const fromStorage = localStorage.getItem(DEV_ROOM_LAUNCH_KEY);
  if (validIds.includes(fromStorage as DevRoomId)) return fromStorage as DevRoomId;
  return null;
}

/** Clears both the query param (via history.replaceState, no reload) and
 * the legacy localStorage key, so a later reload of the same tab doesn't
 * re-trigger the handoff. */
export function clearPendingDevRoom(): void {
  localStorage.removeItem(DEV_ROOM_LAUNCH_KEY);
  const url = new URL(window.location.href);
  if (url.searchParams.has(DEV_ROOM_LAUNCH_PARAM)) {
    url.searchParams.delete(DEV_ROOM_LAUNCH_PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}
