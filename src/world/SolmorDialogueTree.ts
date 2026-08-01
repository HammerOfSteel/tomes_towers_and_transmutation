/**
 * SolmorDialogueTree — Arcanist Solmor's dialogue stages.
 *
 * Phase E2.
 *
 * Solmor is the wizard who captured the player. After the player escapes the
 * tower with the master key, he appears at the entrance and begins a
 * relationship that spans the full game.
 *
 * Three stages:
 *   Stage 1 — First meeting: surprised, businesslike, tries to hire the player.
 *   Stage 2 — After Act I arc: more candid, reveals ascension lore.
 *   Stage 3 — Endgame: full vulnerability, offers the true-ending choice.
 *
 * Dialogue is species-aware: each species gets unique first-line reactions.
 *
 * Usage (main.ts):
 *   import { showSolmorEncounter, getSolmorStage } from '@/world/SolmorDialogueTree';
 *
 *   // When player exits the tower and prologue is done:
 *   if (_solmorStage < 1) {
 *     showSolmorEncounter(1, _characterSpecies, () => { _solmorStage = 1; });
 *   }
 */

import type { SpeciesId } from '@/world/StoryQuestLine';
import { injectHudTheme } from '@/ui/hudTheme';

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tt3_solmor_stage';

/** Returns the current Solmor dialogue stage (0 = not started). */
export function getSolmorStage(): number {
  return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
}

/** Advance to the next stage (persists across sessions). */
export function advanceSolmorStage(): void {
  const cur = getSolmorStage();
  localStorage.setItem(STORAGE_KEY, String(cur + 1));
}

/** Reset to stage 0 (new game). */
export function resetSolmorStage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Dialogue content ──────────────────────────────────────────────────────────

interface SolmorLine {
  speaker: 'solmor' | 'player';
  text: string;
}

interface SolmorDialogue {
  title:   string;
  lines:   SolmorLine[];
  /**
   * If defined, the final screen shows these choice buttons instead of a
   * single [Continue].  The key is the choice label; the value is a callback
   * id stored in localStorage for downstream quest logic.
   */
  choices?: Array<{ label: string; choiceId: string }>;
}

// ── Stage 1 — First meeting ───────────────────────────────────────────────────

const STAGE1_OPENING: Record<SpeciesId, string> = {
  human: `"Ah. A soldier. You move like one, at least.\n\nI expected you to take longer. The last candidate lasted three weeks before finding the key. You managed... considerably less. I'm choosing to view that as impressive rather than as a critique of my security arrangements.\n\nYou can lower whatever you're reaching for. I'm not here to recapture you."`,
  undead: `"Well. An animated candidate. That's a first.\n\nI should clarify — and I do apologise for any confusion my notes may have caused — that the term 'candidate' in my research documentation does not imply you had a choice in the matter. You did not. I am aware this is a significant moral failing on my part. We can discuss that later.\n\nPlease don't try to bite me. It would be awkward for both of us."`,
  vulperia: `"Of course it's a fox.\n\nI don't say that pejoratively. Foxes are statistically overrepresented in situations like this — escape attempts, contract violations, what-have-you. I have several notes about it. The point is: I expected you to be faster, actually. You slowed down on floor three. Were you looking at something?\n\nDon't answer that. It doesn't matter. You're out, which is the relevant fact."`,
  slime: `"Hm.\n\nI'll be honest: I did not expect the slime candidate to find the key. Not because slimes lack capability — they are, as a category, significantly underestimated — but because the key is on a workbench and I assumed the, ah... the format would make workbenches less accessible.\n\nI was clearly wrong. I will update my notes."`,
  elf:   `"Oh.\n\nYou are... not surprised at all.\n\nI have had that reaction before. The last elf candidate I attempted to study was considerably less cooperative, largely because they had, as they explained at length, 'done this sort of thing before.' I note you carry yourself with similar certainty. I find this equal parts encouraging and alarming.\n\nHow many towers is this for you?"`,
  celestial: `"You are giving off a faint light.\n\nI find that either impressive or alarming. I have written a paper on celestial binding at ground level — possibly the only paper on celestial binding at ground level — and the results were, I quote, 'inconclusive.' I note you read that paper in my archive.\n\nI would appreciate it if you did not infer too much from the highlighted sections."`,
  draconic: `"Your scales have been absorbing the ambient spellwork.\n\nI noticed three days ago. I chose not to intervene because the situation was, in terms of research value, extraordinary. I hope you will understand that 'extraordinary research value' is as close to an apology as I reliably manage.\n\nAlso: the wards on floor four were not damaged. That was already like that."`,
};

const STAGE1_CORE = `"My name is Arcanist Solmor. I am the wizard who — and I will use the word precisely — kidnapped you for research purposes. The research is ongoing. The kidnapping is not.\n\nHere is what I propose:\n\nYou are, evidently, capable. The tower trained you. That's the point of the exercise — it was always meant to produce someone worth talking to. And now I find myself in need of precisely that: someone capable, motivated, and — ideally — not planning to report me to any relevant authorities.\n\nI have work. The kind of work that cannot be done from inside a tower. I am offering you a contract. Paid. Legitimate. Largely aboveboard.\n\nYou don't have to answer now. The front gate will remain open. Take some time to look at the world. It's considerably larger than my library, and slightly more difficult to organise.\n\nWhen you're ready — find me."`;

const STAGE1_EXIT = `He steps aside with the precise economy of someone who has spent decades in narrow corridors.\n\nThe gate is open. The road is yours.\n\nDistantly, you are certain you can hear him making notes.`;

function getStage1(species: SpeciesId): SolmorDialogue {
  return {
    title: 'Arcanist Solmor — First Meeting',
    lines: [
      { speaker: 'solmor', text: STAGE1_OPENING[species] },
      { speaker: 'solmor', text: STAGE1_CORE },
      { speaker: 'player', text: '...' },
      { speaker: 'solmor', text: STAGE1_EXIT },
    ],
  };
}

// ── Stage 2 — After Act I arc ─────────────────────────────────────────────────

const STAGE2_SPECIES: Record<SpeciesId, string> = {
  human:    `"The war band. Yes. I know about them.\n\nOne of my previous candidates — the third, I believe, possibly the fourth; the archive is specific but my memory is not — went rather dramatically off-course after they escaped. They retained some of the tower's training but applied it to considerably less regulated ends.\n\nI take partial responsibility. The 'controlled outcome' portion of my methodology was optimistic."`,
  undead:   `"The notes you found. I wondered whether you'd find those.\n\nThe ascension cycle — the mechanism by which the undead eventually transcend the material attachment that keeps them here — is not well understood. My research was an attempt to understand it. Some of the interventions I documented were not... advisable. In retrospect.\n\nYou are still here. That suggests either the cycle is further along than I thought, or the research worked in a way I didn't intend."`,
  vulperia: `"A contract on your life. Placed by me. I won't insult you by pretending I don't know what you found.\n\nWhen the tower produces a candidate I can work with, I prefer to know where they are. The hunter's guild was a precaution — a tracker, not an assassin. I was monitoring your progress.\n\nYou neutralised them, which I had not predicted. I have updated my models accordingly."`,
  slime:    `"The previous candidate's fragment. Yes. I knew about that.\n\nThe previous slime candidate was considerably more... expressive than the others. They left several impressions in the tower's systems. I was not certain whether those impressions retained coherence. Evidently they did.\n\nWhat they told you — about the other way out — is accurate. I chose not to mention it. That was, in retrospect, an error."`,
  elf:      `"The annotated book in the library.\n\nYes. It is yours. The previous elf candidate — three hundred and twelve years ago, I believe — left annotations throughout my collection. I preserved them for reference. I was not expecting you to recognise your own handwriting.\n\nThis raises questions I have been attempting to formulate correctly for several days."`,
  celestial: `"The ward stone. You found it.\n\nI placed it. I should tell you that directly rather than let you conclude it indirectly, which would be worse. The ward was designed to suppress celestial abilities at ground level. My research required a controlled environment.\n\nI understand this was, from your perspective, not a research choice."`,
  draconic: `"The territorial maps.\n\nYes, I know about those. I acquired the tower site through a legal mechanism that was technically sound at the time and would not survive modern scrutiny. The previous draconic claims were — are — real. I chose to proceed anyway.\n\nI am, I find, explaining this to someone who can breathe fire, which is giving me a new perspective on the decision."`,
};

const STAGE2_LORE = `"There is something you should know about what I'm doing.\n\nAscension — the process by which an exceptional individual transcends their mortal limitations — is real. Documented. Repeatable under controlled conditions. I have been attempting to understand it for forty years.\n\nThe tower is not a prison. It is a crucible. Every candidate who enters it and succeeds — really succeeds, the way you have — demonstrates that the process is viable.\n\nI am trying to understand why some people ascend and others do not. Why some candidates leave the tower changed and others leave unchanged. Why nine towers have failed to produce what I was looking for.\n\nYou are, by any measurement, a success. I would prefer to understand what that means before I lose you to whatever comes next.\n\nThe work I have for you — it is related to this. I need someone in the world who has been through the crucible. Someone who can observe what happens when ascension brushes against ordinary life.\n\nI am asking you to be that person."`;

function getStage2(species: SpeciesId): SolmorDialogue {
  return {
    title: 'Arcanist Solmor — A Candid Word',
    lines: [
      { speaker: 'solmor', text: STAGE2_SPECIES[species] },
      { speaker: 'solmor', text: STAGE2_LORE },
    ],
  };
}

// ── Stage 3 — Endgame ─────────────────────────────────────────────────────────

const STAGE3_OPENING = `"You have done something that none of the other candidates managed.\n\nNine towers. Decades of work. None of them made it this far.\n\nI want to tell you what I think ascension actually means. Not the theory. The truth — as best as I have been able to determine it after a very long time of looking.\n\nBut first I need you to understand something:\n\nI am old. The tower is old. The research has cost more than I had originally budgeted, in every sense of that word.\n\nI have been looking for someone to give this to."`;

const STAGE3_REVELATION = `"Ascension is not transcendence. It is not becoming a god or shedding the mortal. It is the opposite.\n\nIt is the moment when a person becomes fully, irreducibly themselves. When all the things that were done to them — all the forces that shaped them without consent — no longer define them. When they can say, honestly, without performance: this is what I am.\n\nThe tower tests for that. Not strength. Not intelligence. Not even survival. It tests for selfhood.\n\nYou passed. Every metric. In ways I did not design for.\n\nI don't know what to do with that. I expected to know more by now.\n\nThe choice I'm about to offer you — it's not a test. There are no wrong answers. This is me, asking you, because you have earned the right to be asked:\n\nWhat do you want to do with what you are?"`;

const STAGE3_CHOICES: Array<{ label: string; choiceId: string }> = [
  { label: 'Take Solmor\'s research and continue it alone.',       choiceId: 'solmor_end_independent' },
  { label: 'Work with Solmor — become the research partner.',      choiceId: 'solmor_end_partner' },
  { label: 'Burn the tower and walk away from all of it.',         choiceId: 'solmor_end_freedom' },
  { label: 'Ask Solmor what he actually wants, for once.',         choiceId: 'solmor_end_reciprocal' },
];

/** Species-specific final choice — the answer most true to each form. */
const STAGE3_SPECIES_CHOICE: Partial<Record<SpeciesId, { label: string; choiceId: string }>> = {
  human:    { label: '"I want to go home. And then come back, on my own terms."',       choiceId: 'solmor_end_human' },
  undead:   { label: '"I want to know why I\'m still here. Not the mechanism. The reason."', choiceId: 'solmor_end_undead' },
  vulperia: { label: '"I want a contract. Proper terms. My signature, not a capture order."', choiceId: 'solmor_end_vulperia' },
  slime:    { label: '(Consider for a long time) "More."',                              choiceId: 'solmor_end_slime' },
  elf:      { label: '"I want to know if any of the others made it. Not the candidates. The ones before them."', choiceId: 'solmor_end_elf' },
  celestial: { label: '"I want my complaint resolved. And then we can talk about the rest."', choiceId: 'solmor_end_celestial' },
  draconic: { label: '"I want the Appendix D unsealed. After that I\'ll decide."',      choiceId: 'solmor_end_draconic' },
};

function getStage3(species?: SpeciesId): SolmorDialogue {
  const choices = [...STAGE3_CHOICES];
  // Add species-specific choice as a 5th option if available
  const speciesChoice = species ? STAGE3_SPECIES_CHOICE[species] : null;
  if (speciesChoice) choices.push(speciesChoice);
  return {
    title: 'Arcanist Solmor — The True Question',
    lines: [
      { speaker: 'solmor', text: STAGE3_OPENING },
      { speaker: 'solmor', text: STAGE3_REVELATION },
    ],
    choices,
  };
}

// ── UI ────────────────────────────────────────────────────────────────────────

let _solmorPanel: HTMLElement | null = null;

function _closeSolmorPanel(): void {
  if (_solmorPanel) {
    _solmorPanel.remove();
    _solmorPanel = null;
  }
}

/**
 * Show a Solmor encounter dialogue.
 *
 * @param stage         1|2|3
 * @param species       Player's species (for species-aware lines).
 * @param onComplete    Called when dialogue ends; receives the chosen choiceId
 *                      (undefined for stages without choices).
 */
export function showSolmorEncounter(
  stage:      1 | 2 | 3,
  species:    SpeciesId,
  onComplete: (choiceId?: string) => void,
): void {
  injectHudTheme();
  _closeSolmorPanel();

  const dialogue =
    stage === 1 ? getStage1(species) :
    stage === 2 ? getStage2(species) :
    getStage3(species);

  // ── Build panel ───────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;',
    'background:rgba(4,3,8,0.82);',
    'display:flex;align-items:center;justify-content:center;',
    'z-index:900;',
    'animation:fadeIn 0.3s ease;',
  ].join('');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'background:rgba(10,8,18,0.97);',
    'border:1px solid #4a3860;border-radius:8px;',
    'padding:28px 32px;',
    'max-width:600px;width:90vw;',
    'max-height:80vh;overflow-y:auto;',
    'box-shadow:0 0 60px rgba(120,60,200,0.25);',
    'font-family:var(--hud-font-mono,monospace);',
    'color:#c0a0f0;',
  ].join('');

  // Title bar
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:.85rem;color:#786090;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px;border-bottom:1px solid #2a1e40;padding-bottom:10px;';
  titleEl.textContent = dialogue.title;
  panel.appendChild(titleEl);

  // Dialogue lines
  let lineIdx = 0;

  const lineEl = document.createElement('div');
  lineEl.style.cssText = 'font-size:.84rem;line-height:1.75;white-space:pre-wrap;min-height:5em;';
  panel.appendChild(lineEl);

  // Speaker badge
  const speakerEl = document.createElement('div');
  speakerEl.style.cssText = 'font-size:.7rem;color:#4a3860;letter-spacing:.06em;margin-bottom:6px;';
  panel.insertBefore(speakerEl, lineEl);

  // Footer
  const footerEl = document.createElement('div');
  footerEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:20px;gap:8px;flex-wrap:wrap;';
  panel.appendChild(footerEl);

  const pageHint = document.createElement('div');
  pageHint.style.cssText = 'font-size:.7rem;color:#4a3860;';
  footerEl.appendChild(pageHint);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  footerEl.appendChild(btnRow);

  const renderLine = () => {
    const line = dialogue.lines[lineIdx];
    if (!line) return;
    speakerEl.textContent = line.speaker === 'solmor' ? '🧙 Arcanist Solmor' : '— You';
    lineEl.textContent = line.text;
    pageHint.textContent = `${lineIdx + 1} / ${dialogue.lines.length}`;

    btnRow.innerHTML = '';
    const isLast = lineIdx >= dialogue.lines.length - 1;

    if (!isLast) {
      const continueBtn = document.createElement('button');
      continueBtn.className = 'hud-btn';
      continueBtn.textContent = 'Continue [E]';
      continueBtn.onclick = () => { lineIdx++; renderLine(); };
      btnRow.appendChild(continueBtn);
    } else if (dialogue.choices) {
      // Final screen with choices
      for (const choice of dialogue.choices) {
        const btn = document.createElement('button');
        btn.className = 'hud-btn';
        btn.style.cssText = 'font-size:.75rem;padding:6px 12px;text-align:left;white-space:normal;max-width:240px;';
        btn.textContent = choice.label;
        btn.onclick = () => {
          localStorage.setItem('tt3_solmor_choice_s3', choice.choiceId);
          _closeSolmorPanel();
          onComplete(choice.choiceId);
        };
        btnRow.appendChild(btn);
      }
    } else {
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'hud-btn';
      dismissBtn.textContent = 'Dismiss [E]';
      dismissBtn.onclick = () => { _closeSolmorPanel(); onComplete(undefined); };
      btnRow.appendChild(dismissBtn);
    }
  };

  // Keyboard [E] to advance
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyE' && _solmorPanel) {
      if (lineIdx < dialogue.lines.length - 1) {
        lineIdx++;
        renderLine();
      } else if (!dialogue.choices) {
        window.removeEventListener('keydown', onKey);
        _closeSolmorPanel();
        onComplete(undefined);
      }
    }
  };
  window.addEventListener('keydown', onKey);

  renderLine();
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  _solmorPanel = overlay;
}

/** Whether the Solmor encounter panel is currently open. */
export function isSolmorOpen(): boolean {
  return _solmorPanel !== null;
}

/** Stored ending choice from Stage 3 (if made). */
export function getSolmorEndingChoice(): string | null {
  return localStorage.getItem('tt3_solmor_choice_s3');
}
