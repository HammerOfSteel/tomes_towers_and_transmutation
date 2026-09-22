# Quaternius Asset Import System + Dev Asset Lab — Design & Spec

*Step 2 of the 3D Asset Integration initiative. Research → design → spec for
building (a) a general multi-format import pipeline for the Quaternius packs
inventoried in [`2026-09-22-quaternius-asset-inventory.md`](./2026-09-22-quaternius-asset-inventory.md),
and (b) a dev-only "Asset Lab" to browse every imported asset in 3D before any
procedural-system wiring happens (step 3).*

> **Correction (post-playtest).** Section 3 below ("Import scope for this
> step") originally deferred `modern_type_buildings/`, `modular_dungeons/
> Ultimate Modular Sci-Fi`, and `nature_props/` as "tonal mismatch" /
> "deprioritized." **That was wrong and has been reversed at the user's
> explicit, direct instruction: every asset in every pack under the source
> folder is imported, with no taste/style filtering, period.** All three
> have since been imported (the `nature_props/` `.blend` files via a new
> Blender-based export pipeline, `scripts/blender/export_glb.py`, which also
> fixed a shadow/no-texture rendering bug found in the same packs). See the
> inventory doc's own correction banner and "Import scope" table for the
> current, accurate state. The text below is left as-is as a historical
> record of the (superseded, incorrect) original design decision.

## Research: what already exists to reuse

This codebase already has a **complete, working precedent** for exactly this
problem — the character asset pipeline — built in an earlier initiative and
never reverted (unlike the environment-kit attempt in
`TODO/archive/ASSETS_TODO.md`, which *was* reverted; `envManifest.ts` is its
empty tombstone). Four pieces make up that precedent, and this step mirrors
all four rather than inventing a new pattern:

1. **Source storage**: raw packs live as `.zip` in `assets/<category>/` at
   repo root (LFS-tracked — `.gitattributes` already has `*.zip` and `*.fbx`/
   `*.glb` under `filter=lfs`). This directory is *not* served by Vite; it's
   just where the original downloads live in version control so a fresh
   clone can re-extract without depending on any developer's local
   `Downloads/` folder.
2. **Extraction script** (`scripts/extract-char-assets.mjs`): a plain Node
   script that shells out to the system `unzip -o -j <zip> "<glob>" -d <dest>`
   per pack, with a hand-written config table (one block per pack, calling a
   small `extract()` helper). Idempotent, no npm zip library needed.
3. **Manifest codegen** (`scripts/gen-char-manifest.mjs`): scans the
   extracted `public/assets/characters/` tree and writes a self-contained,
   typed `src/characters/charManifest.ts` (types + `CHAR_PACKS`/`CHAR_MODELS`
   data, `DO NOT EDIT` header). Static per-pack metadata (name/icon/desc/
   roles/tags) lives in a hand-maintained `PACK_META` table inside the
   generator script; per-model data (path, format, animated flag) is
   derived automatically from the files found on disk.
4. **Runtime loader** (`src/characters/CharacterLoader.ts`): a caching loader
   supporting **both GLB (GLTFLoader) and FBX (FBXLoader)**, returning
   `{ scene, mixer, clips, format }` — `mixer` is a ready-to-use
   `THREE.AnimationMixer` already wired to the cloned scene.
5. **Dev browse/preview UI** (`src/ui/DevSandbox.ts`'s `_buildAssetsTab()` +
   `main.ts`'s `onPreviewModel`/`onPlayPreviewAnim` wiring): a manifest-driven
   list with a role filter, text filter, a "▶ View" button per model that
   calls back into `main.ts` to load the model via `CharacterLoader` and drop
   it into the live sandbox scene at a fixed inspection position (auto-scaled
   to ~2 world units tall), plus an animation-clip dropdown that calls
   `mixer.clipAction(clip).play()`. This *is* already a working "asset
   testing space" for one asset family — it just needs a second manifest/
   loader wired into the same UI shell for Quaternius assets, not a new
   scene, route, or 3D view built from scratch.

**Format-loading confirmation** (research, not assumption): `FBXLoader` is
already imported and used in production
(`src/characters/CharacterLoader.ts`), confirmed working for rigged,
animated FBX models (e.g. `bandits_free`, `goblin_pack` in
`public/assets/characters/`). This means **no external FBX→GLB conversion
step (Blender, FBX2glTF, etc.) is required** for "full fidelity" FBX import —
three.js's native `FBXLoader` already handles meshes, embedded materials,
skeletons, and animation clips directly. This removes one of the open
questions from the inventory doc's format-fidelity concerns for every pack
except `nature_props/` (`.blend`-only, still a hard gap — no three.js loader
reads `.blend` directly; left out of this step's import batch, tracked as a
follow-up, per the user's explicit "don't block on this" guidance applied
analogously here).

`OBJLoader`+`MTLLoader` (needed for `modular_dungeons/OBJ`) are not currently
imported anywhere in `src/`, but both ship in `three/examples/jsm/loaders/`
(same package already a dependency) — no new dependency needed, just a new
import.

## Decisions (spec)

1. **Asset home**: mirror the existing two-tier convention exactly.
   - Source zips (selected, in-scope packs only — see scope below) copied
     into `assets/quaternius/<category>/<Pack Name>.zip` (LFS via existing
     `*.zip` rule).
   - Extracted, game-ready files land in
     `public/assets/quaternius/<category>/<packId>/`, one folder per pack,
     preferred-format-per-asset (GLTF+bin+textures where shipped, else FBX,
     else OBJ+MTL+textures), preserving each pack's own texture-reference
     layout so relative texture paths inside `.gltf`/`.mtl` still resolve.
2. **LFS coverage**: add `*.gltf`, `*.bin`, `*.obj`, `*.mtl` to `.gitattributes`
   (mirroring `*.glb`/`*.fbx`) so the new binary-heavy asset tree doesn't
   bloat plain git history. Existing `*.png`/`*.jpg` are *not* yet
   LFS-tracked in this repo (existing `public/assets/characters/*/textures/`
   PNGs are plain git blobs) — kept consistent with that existing choice
   rather than introducing a new rule for just this pack family.
3. **Import scope for this step** (per the user's explicit steer not to
   block on perfect coverage): import every in-scope pack's **full asset
   list**, skipping only the three items already flagged in the inventory
   doc as out of scope or blocked:
   - `modern_type_buildings/` (both sub-packs) — tonal mismatch, deprioritized
   - `modular_dungeons/Ultimate Modular Sci-Fi` — tonal mismatch, deprioritized
   - `nature_props/` — `.blend`-only, no loadable format yet (tracked as a
     follow-up; a Blender MCP connection is now available per the user's
     note in the inventory doc's open questions, but using it is out of
     scope for this step)

   In scope (≈548 individual assets across 8 packs): `animals/` (12),
   `monsters/Animated Monster Pack` (4), `monsters/Bestiary` (2),
   `monsters/Cute Animated Monsters` (21), `fantasy_props/MegaKit` (94),
   `fantasy_props/Ultimate Food Pack` (103), `medieval_village_pack/
   Buildings` (10) + `Props` (34), `modular_dungeons/OBJ` (92),
   `modular_fantasy_village/Medieval Village MegaKit` (176).
4. **Manifest shape**: `src/assets/quaterniusManifest.ts`, codegen'd by
   `scripts/gen-quaternius-manifest.mjs`, mirroring `charManifest.ts`'s
   `CharPackDef`/`CharModelDef` shape but with a `category` field instead of
   `roles` (categories: `animal`, `monster`, `prop`, `food`, `building`,
   `village_kit`, `dungeon_kit`) and no `animRig`/`animRigB` (Quaternius packs
   that animate ship embedded clips, unlike KayKit's shared-rig scheme).
5. **Loader**: `src/assets/QuaterniusAssetLoader.ts`, mirroring
   `CharacterLoader.ts`'s cache/pending-map/clone pattern, extended to 3
   formats (`gltf`/`glb` → `GLTFLoader`, `fbx` → `FBXLoader`, `obj` →
   `OBJLoader` + `MTLLoader`). Returns the same `{ scene, mixer, clips,
   format }` shape so the dev UI code can stay nearly identical to the
   character preview path.
6. **Dev Asset Lab UI**: a new DevSandbox tab (`'quaternius'`, "🗿 Asset Lab"),
   built the same way as `_buildAssetsTab()` — category filter instead of
   role filter, text filter, scrollable list, "▶ View" spawns the asset at a
   second fixed inspection slot in the sandbox scene (offset from the
   character-preview slot so both can be inspected without overlapping),
   animation-clip dropdown reusing the same `mixer.clipAction()` pattern.
   No new route/scene/camera rig needed — this reuses the exact mechanism
   the character Asset Browser tab already proved out.
7. **No wiring into procedural systems this step.** The Asset Lab is
   deliberately dev-only and disconnected from `NaturePropField.ts`,
   `BuildingGenerator.ts`, `BlueprintRenderer.ts`, `AmbientWildlife.ts`, or
   `enemy-creator/` — that hookup is step 3's job (needs its own research/
   design/spec/plan per the `research-driven-world-polish` skill), including
   the dev-menu "external assets" on/off toggle requirement from the
   initiative kickoff.

## Non-goals for this step
- No FBX→GLB conversion tooling, no Blender MCP usage.
- No `nature_props/` import (blocked, tracked).
- No changes to any procedural generator's actual output.
- No LOD/texture-repacking/compression pass — straight pass-through import
  at source fidelity, matching "full fidelity" from the kickoff brief.

## Test plan
- `src/assets/__tests__/QuaterniusAssetLoader.test.ts` — unit tests mirroring
  `AssetLoader.test.ts`'s mock-loader pattern, extended to cover all three
  format branches (gltf/fbx/obj) and mixer/clip wiring.
- `npm run test` (vitest) full pass.
- `tsc` (via `npm run build`'s first step, or a standalone `tsc --noEmit`) to
  confirm the new manifest/loader/UI code type-checks cleanly.
- Manual/human playtest gate (see plan doc) — no Playwright smoke test added
  this step since the existing Asset Browser tab has none either; consistent
  scope with the precedent being mirrored.

## Implementation notes (post-build findings)

These refine/correct assumptions made during research, discovered while
writing `scripts/extract-quaternius-assets.mjs`:

1. **glTF self-containment varies per pack, not per format.** Some
   glTF-preferred packs (`animals/Ultimate Animated Animals`) embed both the
   buffer (base64 data-URI) AND images (via `bufferView`, no external
   texture files at all) — fully self-contained in the single `.gltf` file.
   Others (`fantasy_props/Fantasy Props MegaKit`, `modular_fantasy_village/
   Medieval Village MegaKit`, `monsters/Cute Animated Monsters`) reference an
   external sibling `.bin` buffer and external PNG textures by **bare
   filename** (no path prefix), which only resolves correctly if the PNGs
   sit in the same directory as the `.gltf`/`.bin`. The extraction script
   handles this by flattening (`unzip -j`) the `.gltf` + `.bin` + any
   `Textures/*.png` for that pack into one destination folder per pack, so
   bare-filename references resolve regardless of the zip's internal nesting.
2. **`modular_dungeons/OBJ.zip`'s materials are flat vertex-colour only** —
   confirmed by grepping all 92 `.mtl` files for `map_*` texture directives:
   zero matches. The sibling `Textures.zip` (2 loose files: `Bark_Texture.jpg`,
   `Leaf_Texture.png`) is **not extracted** — it's orphaned/unrelated to this
   OBJ export, resolving inventory open question #3 (previously flagged as
   "looks incomplete" — it's actually just unused).
3. **FBX animation detection**: no cheap JSON header exists for FBX (unlike
   glTF/GLB), so the manifest generator greps each `.fbx` file for the
   ASCII string `AnimCurve`, present (hundreds of times) in genuinely
   animated exports (e.g. `Bat.fbx`) and completely absent (0 occurrences)
   in static exports (e.g. `Blacksmith.fbx`, `Apple.fbx`) — confirmed
   against known samples before relying on it for all 151 FBX assets in
   scope.
4. **Final counts**: extraction produced exactly the ~548 models predicted
   (548 exactly, 38 with usable animation clips) across the 10 packs (note:
   `medieval_village_pack` and `modular_dungeons` each split into 2 on-disk
   packs — Buildings/Props and OBJ-kit/orphaned-textures respectively — so
   "8 in-scope source packs" became 10 manifest pack entries).
5. **`OBJLoader`/`MTLLoader`** required no new dependency (ship in the
   already-installed `three` package's `examples/jsm/loaders/`), confirming
   the research-phase finding.
