# Overworld Studio Asset Library — Manual Playtest

Use this checklist before merging `cline_work-01_overworld_studio` back into `cline_work`.

## Setup
1. Start the app:
   - `npm run dev`
2. Open:
   - `http://localhost:5174/overworld-studio.html`

## What to test

### 1. Save generated assets
- In **Settlement** mode, click **💾 Save to Library**
- Switch to **Dungeon** mode, wait for a dungeon to generate, click **💾 Save to Library**
- Switch to **Cave** mode, wait for a cave/glade to generate, click **💾 Save to Library**

Expected:
- A green toast appears after each save
- No console errors
- Reloading the page does **not** lose saved entries

### 2. Open the library
- Click **📚 Library**

Expected:
- Library panel opens
- Entry count matches saved assets
- Cards appear with thumbnails/placeholders
- Search and type filters are visible

### 3. Preview saved entries
- Filter to **Settlement**, click the saved entry
- Filter to **Dungeon**, click the saved entry
- Filter to **Cave**, click the saved entry

Expected:
- The selected card highlights
- The preview name updates
- The **main canvas** updates to show the selected saved asset
- Dungeon preview still works after page reload (proves persistence works for Map-based dungeon data)

### 4. Export
- Select any saved entry
- Click the **⬇ export** button

Expected:
- A JSON download starts
- Downloaded filename matches the selected entry
- No console errors

### 5. Delete
- Select a saved entry
- Click the **✕ delete** button

Expected:
- Entry disappears
- Entry count decreases
- Reloading the page keeps the deletion

## Regression checks
- Switching between normal studio tabs still works
- Saving still works in Settlement / Dungeon / Cave modes
- Dungeon tab still renders normally outside the library
- Cave and Settlement previews still regenerate normally after leaving the library

## If something fails
Capture:
- browser console output
- a screenshot
- the exact saved entry type that failed
- whether failure happened before or after reload