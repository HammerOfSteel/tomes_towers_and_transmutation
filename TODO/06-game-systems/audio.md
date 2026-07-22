# Audio System
> ⚠️ GAP — Audio is referenced throughout the codebase but has no phased plan.

## Status: ⚠️ No plan (SFX hooks exist, no implementation roadmap)

## Current State
- SFX hooks called in main.ts at impact events (hit stop, spells, etc.)
- `src/audio/` folder exists with stub files
- Music files in `public/music/`
- No volume management, no pooling, no spatial audio

## Required for Demo

### AU-1 — SFX Library
- [ ] Inventory all SFX hook call sites in main.ts + SceneManager.ts
- [ ] Source/generate SFX for each: sword hit, spell cast, dodge, footstep, door, chest open, enemy death
- [ ] File format: OGG (primary) + MP3 fallback
- [ ] Naming convention: `sfx_[category]_[name]_[variant].ogg`

### AU-2 — Audio Manager (`AudioManager.ts`)
- [ ] Singleton: `playOneShot(id, volume?, pitch?)` — pitch variation ±8%
- [ ] `playLoop(id, volume?)` / `stopLoop(id)` — for ambient + music
- [ ] `setMasterVolume(0-1)` / `setSfxVolume(0-1)` / `setMusicVolume(0-1)`
- [ ] Persists volume settings to localStorage
- [ ] Sound pool: max 8 simultaneous instances per sound

### AU-3 — Spatial Audio
- [ ] Enemy footsteps / attack sounds attenuate with distance
- [ ] `THREE.PositionalAudio` via `THREE.AudioListener` on camera
- [ ] Max range: 20 WU

### AU-4 — Music System
- [ ] Ambient music: per biome/floor (overworld grassland, dungeon tense, boss fight)
- [ ] Crossfade on zone transition (0.8s)
- [ ] Boss fight: combat loop → victory sting → return to ambient

### AU-5 — Settings
- [ ] Settings page: Master/Music/SFX volume sliders
- [ ] Mute toggle

### AU-6 — Final SFX Pass (G3 dependency)
- [ ] Timing, pitch variation ±8%, volume mix for all SFX
- [ ] This is the G3 "All SFX: final pass" item

## Dependencies
- Feeds: G3 game feel (impact sounds)
- Feeds: G2 UI/UX (UI click sounds)
