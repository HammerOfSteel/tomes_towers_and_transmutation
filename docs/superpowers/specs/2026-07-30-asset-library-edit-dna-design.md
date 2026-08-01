# Asset Library — "Edit DNA" Design

## Context

`TODO/01-overworld-studio/asset-library.md` (AL-2) tracks a "📚 Library" panel in
Overworld Studio that lets designers browse, preview, rename, duplicate, export,
import, delete, and pin generated assets (`settlement`, `dungeon`, `building`,
`cave`, `room`, `npc`, `realm`, `planet`, `solar`, `enemy`, `prop`, `tile`).

The one remaining shipped-panel action is **"Edit DNA"** — letting a designer
directly edit an entry's underlying generation data (its `data` field) from the
Library panel, without needing to re-run a generator or hand-edit an exported
JSON file outside the app.

## Goal

Add an "Edit DNA" action to the Library preview panel that opens the selected
entry's `data` as editable JSON, and persists valid edits back into the
`AssetLibrary`.

## Non-goals

- Per-type schema validation or structured/typed editing forms (e.g. dedicated
  fields for a `building`'s dimensions). This ships a generic raw-JSON editor
  only, matching the trade-off already accepted during design (see
  "Approaches considered" below).
- Regenerating the thumbnail after an edit. Thumbnails may go stale after a DNA
  edit; this is an acceptable known limitation, consistent with `rename`/`pin`
  which also don't touch the thumbnail.
- Live-previewing edits before saving. The existing "click entry → preview"
  flow already re-runs after a successful save.

## Approaches considered

1. **Raw JSON textarea (chosen)** — reuses the existing `encodeValue`/
   `decodeValue` Map-safe (de)serialization already used by Export/Import, so
   implementation is small and consistent with an existing, understood
   pattern. Con: no schema guidance, a malformed edit could break the entry
   when it flows into runtime overrides. Mitigated by validating JSON
   parses successfully before saving, and by this being a "power user" action.
2. **Structured per-type form** — nicer UX, but requires bespoke fields for
   12 asset types with very different `data` shapes (see `LibraryEntry.data:
   unknown`). Rejected: much larger scope for one backlog item, and the
   panel doesn't currently have any per-type structured editors to build on.

## Data layer — `src/overworld-studio/AssetLibrary.ts`

New method on `AssetLibrary`:

```ts
/**
 * Replace an entry's generation data with a new value (e.g. hand-edited via
 * the Library panel's "Edit DNA" JSON editor). Marks the entry isCustom, since
 * an edited entry is now a designer override rather than a pristine
 * procedural result. Returns the updated entry, or null if id was not found.
 */
updateData(id: string, rawData: unknown): LibraryEntry | null {
  const idx = this._entries.findIndex(e => e.id === id);
  if (idx < 0) return null;
  const updated: LibraryEntry = {
    ...this._entries[idx],
    data: decodeValue(rawData),
    isCustom: true,
  };
  this._entries[idx] = updated;
  this._save();
  console.log(`[AssetLibrary] updated DNA for "${updated.name}" (${updated.type})`);
  return updated;
}
```

- `id`, `name`, `seed`, `createdAt`, `tags`, `thumbnail` are preserved unchanged.
- `rawData` is expected to already be `JSON.parse`-d, encoded-shape data (same
  shape `exportEntry()` produces) — decoding (Map restoration) happens here,
  mirroring `importEntry()`.
- JSON.parse validity is the caller's (UI layer's) responsibility, matching
  how `library-import-file`'s change handler already validates before calling
  `importEntry`.

## UI layer — `src/overworld-studio.ts`

In the Library preview section, alongside the existing Rename / Duplicate /
Export / Delete controls:

- New **"✏️ Edit DNA"** button toggles a `<textarea>` editor for the currently
  selected entry.
- On open: pre-fill the textarea with
  `JSON.stringify(assetLibrary.exportEntry(id)!.data, null, 2)` — i.e. the same
  encoded form the Export JSON button downloads, so Map-backed fields (e.g.
  `DungeonPlan.rooms`) round-trip through the textarea exactly as they would
  through a file export/import cycle.
- **"Save"** button:
  1. `JSON.parse()` the textarea contents.
  2. On parse failure: toast `✕ Invalid JSON`, leave the editor open with the
     user's text untouched (no data loss).
  3. On success: call `assetLibrary.updateData(id, parsed)`. If it returns
     `null` (id vanished, e.g. entry was deleted in another tab), toast
     `✕ Update failed`. On success: close the editor, re-render the library
     grid and preview (`_renderLibraryGrid()`, `_selectLibraryEntry(id)`), and
     toast `✓ DNA updated`.
- **"Cancel"** button: closes the editor and discards in-progress edits; no
  library mutation.

## Testing

- Unit tests in `tests/overworld-studio/AssetLibrary.test.ts`:
  - Happy path: `updateData` replaces `data`, preserves other fields, sets
    `isCustom = true`.
  - Unknown id returns `null` and does not mutate `_entries`.
  - Map round-trip: encode a `Map`-bearing entry, `JSON.parse(JSON.stringify(...))`
    it (simulating the textarea round-trip), call `updateData`, assert the
    restored `data` field is a `Map` with the same entries.
  - Calling `updateData` on an already-`isCustom` entry is a no-op change to
    that flag (stays `true`).
- Manual/live verification: a throwaway Playwright spec (prefixed `_`,
  deleted after use) exercising the full UI flow — select an entry, open Edit
  DNA, edit a field, Save, confirm the preview reflects the change and
  `isCustom` is now `true`; also confirm Cancel discards edits and invalid
  JSON shows the error toast without closing the editor.

## Acceptance criteria

- [ ] `AssetLibrary.updateData()` implemented and unit-tested.
- [ ] "✏️ Edit DNA" button, textarea editor, Save/Cancel wired in the Library
      preview panel.
- [ ] Invalid JSON is rejected with a toast and does not corrupt the entry.
- [ ] Successful edits mark the entry `isCustom = true` and are reflected
      immediately in the grid/preview.
- [ ] `TODO/01-overworld-studio/asset-library.md` AL-2 "Edit DNA" checkbox
      checked off.
- [ ] Full `npx vitest run` and `npx tsc --noEmit` baselines maintained.
