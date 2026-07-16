/**
 * NewGameFlow — orchestrates the full campfire intro sequence.
 *
 * Creates a fullscreen container, mounts the 3D scene and dialogue overlay
 * into it, runs the wizard conversation, and returns a ready-to-use
 * CharacterConfig when the player has made all their choices.
 *
 * Usage:
 *   const flow = new NewGameFlow();
 *   const cfg  = await flow.play(document.body, slotId);
 *   flow.dispose();
 *   startGame(undefined, cfg);
 */

import campfireLullabyUrl          from '../../assets/intro_scene/campfire_lullaby.mp3?url';
import { NewGameScene }            from '@/scene/NewGameScene';
import { FloatingDialogue3D }      from '@/ui/FloatingDialogue3D';
import { CharacterDecisionTree,
         CHAR_MANIFEST_MAP }       from '@/scene/CharacterDecisionTree';
import { randomWizardDef }         from '@/characters/wizardManifest';
import { CHAR_MODELS }             from '@/characters/charManifest';
import type { CharacterConfig,
              StartingBoon }       from '@/ui/CharacterCreation';
import { DEFAULT_PLAYER_DNA }      from '@/creatures/CreatureDNA';
import type { StatBonus }          from '@/scene/CharacterDecisionTree';

// ── public API ────────────────────────────────────────────────────────────────

export class NewGameFlow {
  private _container: HTMLElement | null = null;
  private _scene:     NewGameScene | null = null;
  private _overlay:   FloatingDialogue3D | null = null;
  private _music:     HTMLAudioElement  | null = null;

  /**
   * Run the full campfire intro and return a CharacterConfig.
   * `container` is the element that will host the fullscreen scene
   * (typically document.body).
   */
  async play(container: HTMLElement, slotId: number): Promise<CharacterConfig> {
    // ── 1. Build fullscreen host ──────────────────────────────────────────────
    const host = document.createElement('div');
    host.style.cssText = `
      position: fixed; inset: 0;
      width: 100%; height: 100%;
      z-index: 1000; background: #000;
      overflow: hidden;
    `;
    container.appendChild(host);
    this._container = host;

    // ── 2. Create scene + overlay ─────────────────────────────────────────────
    const scene   = new NewGameScene();
    const overlay = new FloatingDialogue3D({
      scene:    scene.scene,
      camera:   scene.camera,
      renderer: scene.renderer,
    });
    const tree    = new CharacterDecisionTree();

    this._scene   = scene;
    this._overlay = overlay;

    // Register floating-dialogue tick so it runs inside the scene’s RAF loop
    scene.setDialogueTick((t) => overlay.tick(t));

    scene.mount(host);
    overlay.mount(host);

    // ── 3. Load GLB environment (parallel with wizard) ────────────────────────
    const envLoadPromise   = scene.initEnvironment().catch(() => { /* fallback silhouettes shown */ });
    const wizDef = randomWizardDef();
    const wizardLoadPromise = scene.loadWizard(wizDef);

    // ── 4. Fade in from black (1.2 s) ─────────────────────────────────────────
    await overlay.fadeIn(1200);
    // ── 4b. Begin music fade-in concurrently with scene load ─────────────────
    this._fadeInMusic();
    // Ensure environment + wizard are loaded before proceeding
    await Promise.all([envLoadPromise, wizardLoadPromise]);

    // ── 5. Hold a beat — silence before the wizard arrives ───────────────────
    await _pause(600);

    // ── 6. Wizard walks into firelight ───────────────────────────────────────
    await scene.runEnterSequence();

    // Pause after wizard settles — he adjusts his spectacles, consults clipboard
    await _pause(800);

    // ── 7. Dialogue tree ─────────────────────────────────────────────────────
    // Gesture on every wizard speech line; nod camera when player makes a choice
    const origSpeak  = overlay.speak.bind(overlay);
    overlay.speak = async (text) => {
      scene.triggerGesture();
      return origSpeak(text);
    };
    const origChoose = overlay.choose.bind(overlay);
    overlay.choose = async (choices) => {
      const idx = await origChoose(choices);
      scene.triggerNod();
      return idx;
    };

    const result = await tree.run(overlay);

    // Restore unpatched methods
    overlay.speak  = origSpeak;
    overlay.choose = origChoose;

    // ── 8. Brief beat after farewell ─────────────────────────────────────────
    await _pause(400);
    overlay.hideSpeech();

    // ── 9. Wizard walks back into darkness ───────────────────────────────────
    scene.runExitSequence();        // intentionally not awaited — fade overlaps
    await _pause(1200);             // let wizard get moving before fade

    // ── 10. Fade to black (music out concurrently) ───────────────────────
    this._fadeOutMusic(2000);
    await overlay.fadeOut(1800);

    // ── 11. Build CharacterConfig ─────────────────────────────────────────────
    const manifestId = CHAR_MANIFEST_MAP[result.characterId];
    const assetModel = CHAR_MODELS.find(m => m.id === manifestId) ?? null;

    const cfg: CharacterConfig = {
      name:        assetModel?.name ?? 'Mysterious Stranger',
      boon:        _deriveBoon(result.statBonuses),
      slotId,
      dna:         { ...DEFAULT_PLAYER_DNA },
      assetModel:  assetModel ?? undefined,
      statBonuses: result.statBonuses,
    };

    return cfg;
  }

  dispose(): void {
    this._fadeOutMusic(800);
    this._scene?.unmount();
    this._scene?.dispose();
    this._overlay?.unmount();
    this._container?.remove();
    this._scene     = null;
    this._overlay   = null;
    this._container = null;
  }

  // ── music helpers ───────────────────────────────────────────────────────────

  private _fadeInMusic(targetVol = 0.45, durationMs = 5000): void {
    const audio   = new Audio(campfireLullabyUrl);
    audio.loop    = true;
    audio.volume  = 0;
    this._music   = audio;
    audio.play().catch(() => { /* autoplay policy — silent fail */ });

    const step  = 50;
    const delta = targetVol / (durationMs / step);
    const id = setInterval(() => {
      if (!this._music) { clearInterval(id); return; }
      this._music.volume = Math.min(targetVol, this._music.volume + delta);
      if (this._music.volume >= targetVol) clearInterval(id);
    }, step);
  }

  private _fadeOutMusic(durationMs = 2000): void {
    if (!this._music) return;
    const audio    = this._music;
    this._music    = null;
    if (durationMs <= 0) { audio.pause(); return; }
    const startVol = audio.volume;
    const step     = 50;
    const delta    = startVol / (durationMs / step);
    const id = setInterval(() => {
      audio.volume = Math.max(0, audio.volume - delta);
      if (audio.volume <= 0) { audio.pause(); clearInterval(id); }
    }, step);
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function _pause(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Derive a starting boon from the conversation stat bonuses. */
function _deriveBoon(bonuses: [StatBonus, StatBonus]): StartingBoon {
  if (bonuses.includes('magic_power') || bonuses.includes('intelligence')) return 'tome';
  if (bonuses.includes('max_hp')      || bonuses.includes('constitution')) return 'blood';
  return 'swift';   // strength/agility/attack_power/stealth → swift feet
}
