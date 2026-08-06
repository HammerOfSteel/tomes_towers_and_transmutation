/**
 * DevRoomHandoff — generalizes the "open the real game straight into a
 * specific dev/test room" pattern used by the Water Lab quick-launch
 * button in Overworld Studio. Adding a future dev room is: one more
 * DevRoomId union member, one more button in the Dev Rooms section, and
 * one more `case` in main.ts's boot handoff.
 */
export const DEV_ROOM_LAUNCH_KEY = 'ttt_dev_room_launch';

export type DevRoomId = 'water-lab';
