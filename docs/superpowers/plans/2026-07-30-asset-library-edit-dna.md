# Asset Library "Edit DNA" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Edit DNA" action to the Overworld Studio Library panel that lets a designer edit a library entry's raw generation data (`data` field) as JSON and save it back.

**Architecture:** A new `AssetLibrary.updateData(id, rawData)` method (mirroring the existing `rename()`/`pinToLocation()` pattern: find by id, replace one field, mark `isCustom = true`, save, return the updated entry or `null`). The Library panel UI gets a new "✏️ Edit DNA" button that toggles a JSON `<textarea>` pre-filled via the existing `exportEntry()` encoding, with Save (parse → `updateData()` → re-render) and Cancel (discard) actions.

**Tech Stack:** TypeScript, Vitest (unit tests), Playwright (throwaway manual verification only, not committed), plain DOM (no framework) in `overworld-studio.html` / `src/overworld-studio.ts`.

## Global Constraints

- Never run plain `npm run build` / `tsc` (non-`--noEmit`) — it emits stale compiled `.js` twins across the repo. Always use `npx tsc --noEmit`.
- `noUnusedLocals` / `noUnusedParameters` are enabled in `tsconfig.json` — remove/use every declared variable or `tsc --noEmit` regresses.
- Baseline to maintain: `npx tsc --noEmit` = 159 pre-existing errors (unchanged), `npx vitest run` = 3792 total tests with 16 pre-existing unrelated failures (talentSystem/enemyLoader/towerGenerator flakiness) — all other tests must pass.
- For any live/manual UI verification, use a throwaway Playwright spec prefixed `_` in `tests/e2e/`, run it against `npx vite --host 127.0.0.1 --port 5174` (matches `playwright.config.ts`'s `baseURL`), then delete the spec before committing — never commit throwaway specs.
- Git commit messages containing apostrophes: write the message to a temp file and use `git commit -F <file>`, then delete the temp file (heredoc with `<<'EOF'` breaks on contractions in this shell).
- Every commit must end with the trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

---

### Task 1: `AssetLibrary.updateData()` method

**Files:**
- Modify: `src/overworld-studio/AssetLibrary.ts` (add method after `rename()`, which ends at line 281)
- Test: `tests/overworld-studio/AssetLibrary.test.ts` (add new `describe('AssetLibrary updateData()', ...)` block after the `describe('AssetLibrary rename()', ...)` block, which ends at line 130)

**Interfaces:**
- Consumes: existing `decodeValue(value: unknown): unknown` (private module-level function in `AssetLibrary.ts`, already used by `importEntry()`); existing `LibraryEntry` type; existing private `this._entries: LibraryEntry[]`, `this._save(): void`.
- Produces: `AssetLibrary.prototype.updateData(id: string, rawData: unknown): LibraryEntry | null` — used by Task 2's UI wiring.

- [ ] **Step 1: Write the failing tests**

Add this block to `tests/overworld-studio/AssetLibrary.test.ts`, immediately after the closing `});` of `describe('AssetLibrary rename()', ...)` (line 130):

```ts
describe('AssetLibrary updateData()', () => {
  it('replaces data and marks the entry custom', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', isCustom: false, data: { hp: 10 } }));

    const updated = lib.updateData('e1', { hp: 99 });

    expect(updated).not.toBeNull();
    expect(updated?.data).toEqual({ hp: 99 });
    expect(updated?.isCustom).toBe(true);
    expect(lib.getAll()[0]?.data).toEqual({ hp: 99 });
  });

  it('preserves id, name, seed, createdAt, tags, thumbnail', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({
      id: 'e1',
      name: 'Old Name',
      seed: 7,
      createdAt: 555,
      tags: ['tag-a'],
      thumbnail: 'data:image/png;base64,xyz',
      data: { hp: 10 },
    }));

    const updated = lib.updateData('e1', { hp: 99 });

    expect(updated?.id).toBe('e1');
    expect(updated?.name).toBe('Old Name');
    expect(updated?.seed).toBe(7);
    expect(updated?.createdAt).toBe(555);
    expect(updated?.tags).toEqual(['tag-a']);
    expect(updated?.thumbnail).toBe('data:image/png;base64,xyz');
  });

  it('decodes Map-encoded payloads (textarea round-trip)', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', type: 'dungeon', data: { rooms: {}, startRoomId: 'r0', seed: 1 } }));

    const updated = lib.updateData('e1', {
      rooms: {
        __tttType: 'Map',
        entries: [['room_0', { id: 'room_0', width: 7 }]],
      },
      startRoomId: 'room_0',
      seed: 1,
    });

    expect(updated).not.toBeNull();
    const rooms = (updated?.data as { rooms: Map<string, unknown> }).rooms;
    expect(rooms).toBeInstanceOf(Map);
    expect(rooms.get('room_0')).toEqual({ id: 'room_0', width: 7 });
  });

  it('returns null when updating a missing entry and does not mutate the library', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', data: { hp: 10 } }));

    const result = lib.updateData('missing', { hp: 1 });

    expect(result).toBeNull();
    expect(lib.getAll()[0]?.data).toEqual({ hp: 10 });
  });

  it('is idempotent on isCustom when the entry is already custom', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', isCustom: true, data: { hp: 10 } }));

    const updated = lib.updateData('e1', { hp: 20 });

    expect(updated?.isCustom).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/overworld-studio/AssetLibrary.test.ts -t "updateData"`
Expected: FAIL — `TypeError: lib.updateData is not a function` (method does not exist yet).

- [ ] **Step 3: Implement `updateData()`**

In `src/overworld-studio/AssetLibrary.ts`, add this method immediately after `rename()` (after its closing `}` at line 281, before the `/** Pin an entry...` comment for `pinToLocation`):

```ts
  /**
   * Replace an entry's generation data (its "DNA") with a new value, e.g.
   * hand-edited via the Library panel's "Edit DNA" JSON editor. `rawData` is
   * expected to be JSON.parse'd, encoded-shape data (the same shape
   * exportEntry() produces) — decodeValue() restores any Map-backed fields.
   * Marks the entry isCustom, since an edited entry is now a designer
   * override rather than a pristine procedural result.
   * Returns the updated entry, or null if id was not found.
   */
  updateData(id: string, rawData: unknown): LibraryEntry | null {
    const idx = this._entries.findIndex(e => e.id === id);
    if (idx < 0) return null;
    const updated: LibraryEntry = {
      ...this._entries[idx]!,
      data: decodeValue(rawData),
      isCustom: true,
    };
    this._entries[idx] = updated;
    this._save();
    console.log(`[AssetLibrary] updated DNA for "${updated.name}" (${updated.type})`);
    (window as any).__assetLibrarySize = this._entries.length;
    return updated;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/overworld-studio/AssetLibrary.test.ts`
Expected: PASS — all tests in the file green, including the 5 new `updateData()` tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/terrygoleman/Documents/dev/games/tomes_towers_and_transmutation
git add src/overworld-studio/AssetLibrary.ts tests/overworld-studio/AssetLibrary.test.ts
cat > /tmp/commit_msg_task1.txt << 'MSGEOF'
feat: add AssetLibrary.updateData() for Edit DNA

New method to replace a library entry's generation data in place,
mirroring the rename()/pinToLocation() pattern: find by id, replace
the data field (decoding any Map-encoded payload), mark isCustom,
save, return the updated entry or null if not found.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSGEOF
git commit -F /tmp/commit_msg_task1.txt
rm /tmp/commit_msg_task1.txt
```

---

### Task 2: Wire "Edit DNA" into the Library panel UI

**Files:**
- Modify: `overworld-studio.html` (Library preview section, lines 573-600)
- Modify: `src/overworld-studio.ts` (near the other library preview action handlers, around lines 5260-5320, and `_selectLibraryEntry` around line 5124)

**Interfaces:**
- Consumes: `assetLibrary.exportEntry(id): StoredLibraryEntry | null` (existing, used to pre-fill the textarea with the same encoded shape as Export JSON); `assetLibrary.updateData(id, rawData): LibraryEntry | null` (from Task 1); existing `_librarySelectedId: string | null` module state; existing `_renderLibraryGrid()`, `_selectLibraryEntry(id)`, `_showToast(msg)` helpers.
- Produces: nothing consumed by later tasks — this is the final functional piece.

- [ ] **Step 1: Add the button and editor markup to `overworld-studio.html`**

In `overworld-studio.html`, replace this block (lines 574-580):

```html
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
            <span id="library-preview-name" style="font-size:11px;color:#e8d0a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
            <div style="display:flex;gap:4px;flex-shrink:0">
              <button class="btn" id="btn-library-duplicate" title="Duplicate" style="padding:2px 6px">⧉</button>
              <button class="btn" id="btn-library-export" title="Export JSON" style="padding:2px 6px">⬇</button>
              <button class="btn" id="btn-library-delete" title="Delete" style="padding:2px 6px;color:#c05050">✕</button>
            </div>
          </div>
```

with:

```html
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
            <span id="library-preview-name" style="font-size:11px;color:#e8d0a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
            <div style="display:flex;gap:4px;flex-shrink:0">
              <button class="btn" id="btn-library-duplicate" title="Duplicate" style="padding:2px 6px">⧉</button>
              <button class="btn" id="btn-library-editdna" title="Edit DNA" style="padding:2px 6px">✏️</button>
              <button class="btn" id="btn-library-export" title="Export JSON" style="padding:2px 6px">⬇</button>
              <button class="btn" id="btn-library-delete" title="Delete" style="padding:2px 6px;color:#c05050">✕</button>
            </div>
          </div>
```

Then, in the same file, add this new block immediately after the `library-pin-tags` div and before the closing `</div><!-- /library-panel -->` (i.e. right after line 600's `<div id="library-pin-tags" ...></div>`):

```html
          <div id="library-dna-editor" style="display:none;margin-top:6px">
            <textarea
              id="library-dna-textarea"
              spellcheck="false"
              style="width:100%;min-height:140px;background:#1a1610;border:1px solid #3a3028;color:#c8a96e;border-radius:3px;font-size:11px;font-family:monospace;box-sizing:border-box;padding:6px"
            ></textarea>
            <div style="display:flex;gap:4px;margin-top:4px">
              <button class="btn" id="btn-library-dna-save" style="flex:1">Save DNA</button>
              <button class="btn" id="btn-library-dna-cancel" style="flex:1">Cancel</button>
            </div>
          </div>
```

- [ ] **Step 2: Add editor open/close + save/cancel wiring to `src/overworld-studio.ts`**

Find the `_selectLibraryEntry` function (around line 5124):

```ts
function _selectLibraryEntry(id: string) {
  _librarySelectedId = id;
  const entry = assetLibrary.getAll().find(e => e.id === id) ?? null;
  const section = document.getElementById('library-preview-section');
  const nameLbl = document.getElementById('library-preview-name');
  const renameInput = document.getElementById('library-rename-input') as HTMLInputElement | null;
  if (section) section.style.display = entry ? '' : 'none';
  if (nameLbl && entry) nameLbl.textContent = `${entry.name} (${entry.type}, seed ${entry.seed})`;
  if (renameInput) renameInput.value = entry?.name ?? '';
  _renderPinTags(entry);
  _previewLibraryEntry(entry);
  _renderLibraryGrid();
}
```

Replace it with (adds a call to close the DNA editor whenever selection changes, so stale unsaved edits from a previously selected entry are never silently applied to a new one):

```ts
function _selectLibraryEntry(id: string) {
  _librarySelectedId = id;
  const entry = assetLibrary.getAll().find(e => e.id === id) ?? null;
  const section = document.getElementById('library-preview-section');
  const nameLbl = document.getElementById('library-preview-name');
  const renameInput = document.getElementById('library-rename-input') as HTMLInputElement | null;
  if (section) section.style.display = entry ? '' : 'none';
  if (nameLbl && entry) nameLbl.textContent = `${entry.name} (${entry.type}, seed ${entry.seed})`;
  if (renameInput) renameInput.value = entry?.name ?? '';
  _renderPinTags(entry);
  _previewLibraryEntry(entry);
  _renderLibraryGrid();
  _closeDnaEditor();
}

// ── Edit DNA ──────────────────────────────────────────────────────────────────
function _closeDnaEditor() {
  const editor = document.getElementById('library-dna-editor') as HTMLElement | null;
  if (editor) editor.style.display = 'none';
}

document.getElementById('btn-library-editdna')?.addEventListener('click', () => {
  if (!_librarySelectedId) return;
  const exported = assetLibrary.exportEntry(_librarySelectedId);
  if (!exported) return;
  const textarea = document.getElementById('library-dna-textarea') as HTMLTextAreaElement | null;
  const editor = document.getElementById('library-dna-editor') as HTMLElement | null;
  if (!textarea || !editor) return;
  textarea.value = JSON.stringify(exported.data, null, 2);
  editor.style.display = 'block';
});

document.getElementById('btn-library-dna-cancel')?.addEventListener('click', () => {
  _closeDnaEditor();
});

document.getElementById('btn-library-dna-save')?.addEventListener('click', () => {
  if (!_librarySelectedId) return;
  const textarea = document.getElementById('library-dna-textarea') as HTMLTextAreaElement | null;
  if (!textarea) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(textarea.value);
  } catch (err) {
    console.error('[AssetLibrary] Edit DNA: invalid JSON', err);
    _showToast('✕ Invalid JSON');
    return;
  }
  const updated = assetLibrary.updateData(_librarySelectedId, parsed);
  if (!updated) {
    _showToast('✕ Update failed');
    return;
  }
  _closeDnaEditor();
  _renderLibraryGrid();
  _selectLibraryEntry(updated.id);
  _showToast('✓ DNA updated');
});
```

Note: `_selectLibraryEntry(updated.id)` is called after a successful save, which itself calls `_closeDnaEditor()` again — this is harmless (idempotent) and keeps the function's existing "reselect after mutation" convention used by `_renameSelectedLibraryEntry` and the Duplicate handler.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: Same error count as the pre-existing baseline (159 errors) — no new errors introduced by this change. If the count differs, read the new/changed error(s) and fix them before proceeding (likely cause: a mistyped DOM id or missing null-check).

- [ ] **Step 4: Commit**

```bash
cd /Users/terrygoleman/Documents/dev/games/tomes_towers_and_transmutation
git add overworld-studio.html src/overworld-studio.ts
cat > /tmp/commit_msg_task2.txt << 'MSGEOF'
feat: wire Edit DNA button into Library panel UI

Adds a "Edit DNA" button to the Library preview panel that opens a
JSON textarea pre-filled from assetLibrary.exportEntry() (matching
the existing Export JSON encoding). Save parses the textarea and
calls assetLibrary.updateData(); invalid JSON shows a toast and
keeps the editor open. Cancel discards edits. Selecting a different
entry always closes the editor so stale edits are never applied to
the wrong entry.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSGEOF
git commit -F /tmp/commit_msg_task2.txt
rm /tmp/commit_msg_task2.txt
```

---

### Task 3: Live verification, full baseline check, TODO update

**Files:**
- Create (temporary, deleted before commit): `tests/e2e/_edit-dna-verify.spec.ts`
- Modify: `TODO/01-overworld-studio/asset-library.md` (check off the "Edit DNA" line)

**Interfaces:**
- Consumes: `window.__game` debug hooks are not needed for this feature (it's Studio-only, not runtime/game); instead this task drives `overworld-studio.html` directly via Playwright, using the DOM ids introduced in Task 2 (`btn-library-toggle` already exists from prior work, `btn-library-editdna`, `library-dna-textarea`, `btn-library-dna-save`, `btn-library-dna-cancel`).
- Produces: nothing — this is the final task.

- [ ] **Step 1: Start a dev server**

Run: `npx vite --host 127.0.0.1 --port 5174` (in the background/async — this matches `playwright.config.ts`'s `baseURL`)
Expected: server logs `ready` and is reachable at `http://127.0.0.1:5174/overworld-studio.html`.

- [ ] **Step 2: Write a throwaway verification spec**

Create `tests/e2e/_edit-dna-verify.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('Edit DNA: save persists valid JSON, invalid JSON is rejected, cancel discards', async ({ page }) => {
  await page.goto('/overworld-studio.html');
  await page.waitForSelector('#btn-library-toggle');

  // This spec assumes at least one asset already exists in the library
  // (localStorage persists across runs in a real browser profile — generate
  // one manually first via any generator's "💾 Save to Library" button if
  // running against a fresh profile). Driving a fresh generate-and-save flow
  // isn't done here to keep this throwaway spec focused only on the Edit DNA
  // controls themselves.
  await page.click('#btn-library-toggle');
  const hasEntries = await page.locator('#library-grid > *').count();
  test.skip(hasEntries === 0, 'No pre-existing library entries in a clean profile; run after generating at least one asset once via the Studio UI.');

  await page.click('#library-grid > *:first-child');
  await page.click('#btn-library-editdna');
  await expect(page.locator('#library-dna-editor')).toBeVisible();

  const original = await page.locator('#library-dna-textarea').inputValue();
  const parsed = JSON.parse(original);

  // Invalid JSON is rejected and editor stays open.
  await page.fill('#library-dna-textarea', '{ not valid json');
  await page.click('#btn-library-dna-save');
  await expect(page.locator('#library-dna-editor')).toBeVisible();

  // Cancel discards edits and closes the editor.
  await page.click('#btn-library-dna-cancel');
  await expect(page.locator('#library-dna-editor')).toBeHidden();

  // Valid edit persists.
  await page.click('#btn-library-editdna');
  const edited = { ...parsed, __editDnaVerify: 12345 };
  await page.fill('#library-dna-textarea', JSON.stringify(edited));
  await page.click('#btn-library-dna-save');
  await expect(page.locator('#library-dna-editor')).toBeHidden();

  await page.click('#btn-library-editdna');
  const reopened = JSON.parse(await page.locator('#library-dna-textarea').inputValue());
  expect(reopened.__editDnaVerify).toBe(12345);
});
```

- [ ] **Step 3: Run the spec and confirm behavior manually**

Run: `npx playwright test tests/e2e/_edit-dna-verify.spec.ts --project=chromium`

If the test reports `skipped` because the library is empty in a clean browser profile, that is expected on a fresh profile — in that case, manually verify instead: open `http://127.0.0.1:5174/overworld-studio.html` in a browser, generate any asset (e.g. a building) and click its "💾 Save to Library" button, open the 📚 Library panel, select the saved entry, click ✏️ Edit DNA, confirm the textarea shows formatted JSON matching the entry, edit a field, click Save DNA, confirm the toast shows "✓ DNA updated" and the panel does not error, reopen Edit DNA and confirm the edit persisted, and separately confirm typing invalid JSON and clicking Save DNA shows "✕ Invalid JSON" without closing the editor.

Expected: all assertions pass (either via the automated spec or manual walkthrough).

- [ ] **Step 4: Delete the throwaway spec and stop the dev server**

```bash
rm /Users/terrygoleman/Documents/dev/games/tomes_towers_and_transmutation/tests/e2e/_edit-dna-verify.spec.ts
```

Stop the `vite` dev server process started in Step 1.

- [ ] **Step 5: Run the full test suite and type-check baselines**

Run: `npx vitest run`
Expected: 3792+ tests total (5 more than the 3792 baseline from the new `updateData()` tests, so ~3797), with the same 16 pre-existing unrelated failures (talentSystem/enemyLoader/towerGenerator) and every other test passing.

Run: `npx tsc --noEmit`
Expected: 159 errors (unchanged baseline).

- [ ] **Step 6: Update the TODO checklist**

In `TODO/01-overworld-studio/asset-library.md`, change this line under `### AL-2 — Library UI Panel (in Overworld Studio)`:

```markdown
- [ ] Actions remaining: Edit DNA
```

to:

```markdown
- [x] Actions shipped: Edit DNA — raw JSON editor in the Library preview panel (`AssetLibrary.updateData()`); marks the entry `isCustom`
```

- [ ] **Step 7: Commit**

```bash
cd /Users/terrygoleman/Documents/dev/games/tomes_towers_and_transmutation
git add TODO/01-overworld-studio/asset-library.md
cat > /tmp/commit_msg_task3.txt << 'MSGEOF'
docs: mark Asset Library Edit DNA as shipped

Verified live: valid JSON edits persist and mark the entry custom,
invalid JSON is rejected with a toast without closing the editor,
and Cancel discards in-progress edits. Full vitest/tsc baselines
maintained.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSGEOF
git commit -F /tmp/commit_msg_task3.txt
rm /tmp/commit_msg_task3.txt
```

---

## Self-Review Notes

- **Spec coverage:** `updateData()` (Task 1) ✅, UI button/textarea/Save/Cancel (Task 2) ✅, invalid-JSON handling (Task 2 + verified Task 3) ✅, isCustom flip (Task 1 tests) ✅, thumbnail/createdAt untouched (Task 1 test) ✅, TODO checkbox (Task 3) ✅, test/baseline maintenance (Task 2 Step 3, Task 3 Steps 5) ✅.
- **Placeholder scan:** no TBD/TODO markers; every step has full runnable code or exact shell commands.
- **Type consistency:** `updateData(id: string, rawData: unknown): LibraryEntry | null` name/signature matches between Task 1 (definition) and Task 2 (call site `assetLibrary.updateData(_librarySelectedId, parsed)`).
