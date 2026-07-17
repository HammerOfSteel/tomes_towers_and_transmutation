// ── MainMenu ───────────────────────────────────────────────────────────────
//
// Full-screen animated main menu with:
//  • Concept-art masonry gallery (8 tiles, staggered cross-fade, no duplicates)
//  • Play modal with 3 localStorage save slots
//  • Settings modal (volume, fullscreen, world-gen parameters)
//  • Lore modal (4-page book — Wizard's journal + Princess's account)
//  • Controls modal
//
// NOTE: Concept art images are served from /concept_art/ (project root).
//       For production builds, move that folder into /public/concept_art/.

import {
  type WorldGenConfig,
  loadWorldGenConfig,
  saveWorldGenConfig,
  randomiseSeed,
  KENNEY_PACKS,
} from '@/world/WorldGenConfig';
import { CHAR_PACKS } from '@/characters/charManifest';
import type { SpeciesId } from '@/world/StoryQuestLine';

const LS_CHARACTER_SPECIES = 'ttt_character_species';

// ── Image pool ────────────────────────────────────────────────────────────

const CONCEPT_ART = [
  '/concept_art/tower_study.png',
  '/concept_art/punk_rock_mage.png',
  '/concept_art/cozy_study.png',
  '/concept_art/dungeon_exploration.png',
  '/concept_art/hiking_with_slimey.png',
  '/concept_art/potion_making.png',
  '/concept_art/practice_hermalism.png',
  '/concept_art/practice_magic.png',
  '/concept_art/practice_magic_2.png',
  '/concept_art/rainy_day.png',
  '/concept_art/sunlit_hammock.png',
];

// ── Grid layout ───────────────────────────────────────────────────────────
//
//  Col:  1          2          3          4
//  R1:  [tall]    [normal]   [normal]   [tall]
//  R2:  [tall]    [wide 2×1..........]  [tall]
//  R3:  [normal]  [normal]   [wide 2×1..........]
//
// tile 2 is intentionally normal (not tall) to avoid overlapping tile 4 (wide cols 2-3 row 2).
// 8 tiles; 11 images → 3 always in the pool for rotation.

interface TilePos {
  col: string;
  row: string;
}

const TILE_POSITIONS: TilePos[] = [
  { col: '1',          row: '1 / span 2' }, // 0 tall-left
  { col: '2',          row: '1'          }, // 1 normal
  { col: '3',          row: '1'          }, // 2 normal  ← not tall; avoids conflict with tile 4
  { col: '4',          row: '1 / span 2' }, // 3 tall-right
  { col: '2 / span 2', row: '2'          }, // 4 wide-mid (cols 2-3)
  { col: '1',          row: '3'          }, // 5 normal-bl
  { col: '2',          row: '3'          }, // 6 normal
  { col: '3 / span 2', row: '3'          }, // 7 wide-br
];

const NUM_TILES = TILE_POSITIONS.length;

// Image swap timing
const SWAP_MIN_MS  = 7_000;
const SWAP_MAX_MS  = 14_000;
const FADE_MS      = 1_400;  // CSS transition duration
const STAGGER_MS   = 1_300;  // per-tile offset on initial start

// LocalStorage helpers
const lsSave   = (i: number) => `ttt_save_${i}`;
const LS_VOL   = 'ttt_vol';
const NUM_SLOTS = 3;

const LS_MUSIC_VISIBLE = 'ttt_music_visible';

// ── Music tracks (Dancing Salamanders — Glitchwitch) ─────────────────────
const TRACKS: readonly string[] = [
  'Lint',
  'bless this mess (and all its variables)',
  'breadcrumb cosmology',
  'checksum of the heart',
  'half hymn whole hashmap',
  'kettle logic',
  'kindly demons of the pantry',
  'leaven rise',
  'magpie logging',
  'meandering migration',
  'moss matrix',
  'patch day at the cottage',
];

interface SaveData {
  location: string;
  floor: number;
  timestamp: number;
  // Character identity (from NewGameFlow)
  characterId?: string;
  boon?: string;
  statBonuses?: string[];
  // In-game progress
  hasMasterKey?: boolean;
}

// ── Save-slot helpers (exported for main.ts auto-save) ─────────────────────
export function readSaveSlot(slotId: number): SaveData | null {
  const raw = localStorage.getItem(lsSave(slotId));
  return raw ? (JSON.parse(raw) as SaveData) : null;
}

export function patchSaveSlot(slotId: number, patch: Partial<SaveData>): void {
  const base = readSaveSlot(slotId) ?? { location: 'The Cell', floor: 0, timestamp: 0 };
  localStorage.setItem(lsSave(slotId), JSON.stringify({ ...base, ...patch, timestamp: Date.now() }));
}

interface LorePage {
  chapterLabel: string;
  title: string;
  byline: string;
  body: string;        // HTML
}

const LORE_PAGES: LorePage[] = [
  {
    chapterLabel: 'Prologue',
    title: 'Tomes and Towers',
    byline: 'From the records of W., Wizard, Upper Order — suspended, pending review',
    body: `
      <p>Right. Where to begin.</p>
      <p>Perhaps with a clarification: I am not, as certain colleagues implied at the last Grand Convocation, <em>"losing his faculties."</em> My faculties are in exceptional working order. I can name all fourteen subspecies of the Cascading Vortex Moth from memory, translate Elven treatises on temporal harmonics whilst boiling an egg, and I once predicted a solar eclipse to within four minutes — the remaining four being attributable to continental drift, not error.</p>
      <p>The egg was fine, by the way. These things happen.</p>
      <p>What I <em>am</em> is busy. Impressively, productively busy, in ways that the uninitiated might misread as absent-mindedness but are in fact simply the natural consequence of operating at a higher cognitive frequency than most of one's contemporaries.</p>
      <p>I have a tower. A <em>good</em> tower — three generations of careful architectural decisions, seventeen wards, two basement levels (one of which is technically in a different dimension, but that's structural, not magical; there is a distinction), and a library that has been described, by those with sufficient vocabulary, as "formidable."</p>
      <p>I mention all of this because events have occurred in my absence that have since, I am told, taken on the quality of a <em>story.</em></p>
      <p>I do not write stories. I write <em>records.</em> What follows is a record of what happened when I left for what I was certain would be no more than a week, and returned to find my tower considerably more inhabited than I had left it.</p>
      <p>The tower was still standing. I want to be clear about that.</p>`,
  },
  {
    chapterLabel: 'Prologue, continued',
    title: 'On the Thoroughness of Locks',
    byline: 'From the records of W.',
    body: `
      <p>When I locked the tower, I locked it <em>thoroughly.</em></p>
      <p>Seventeen wards on the main door alone. Enchanted window shutters. A Confundment Field over the library rated to give a fully-trained archivist a week-long headache measurable on standard diagnostics. The second staircase is a defensive illusion — has been since 1842. The corridor between floors two and three contains traps that are, I am still quite proud to say, tasteful.</p>
      <p>In thirty-seven years of practice, not one person had successfully circumvented these measures. The Confundment Field specifically was designed to make the books feel <em>unreadable</em> — not illegible, but somehow beside the point, like trying to read a menu in a language you theoretically know but practically find tedious.</p>
      <p>What I had not accounted for — what I maintain no <em>reasonable</em> person could have accounted for — was the possibility that someone might simply find all of this funny, and read the books anyway, on principle, out of what can only be described as <em>spite.</em></p>
      <p>In my defence: the Field was rated for deterring adults with seven or more years of formal magical education. It was not rated for someone with nothing else to do and a high threshold for being told what not to think about.</p>
      <p>These things happen.</p>
      <p>I am still forming opinions about whether they should have.</p>`,
  },
  {
    chapterLabel: 'Chapter I',
    title: 'What I Understood About Towers (Before I Started Breaking Things)',
    byline: 'The personal accounts of Z. — uninvited guest, floor one, cell three',
    body: `
      <p>When I found the books, I want to be perfectly clear: I was not <em>snooping.</em></p>
      <p>I was <em>exploring.</em> There is an important distinction, and it is fundamentally dependent on whether the person who owns the things is present to object — which, as I had established over the course of several days, he very much was not.</p>
      <p>The cell wasn't terrible. I use the word descriptively, not dramatically, though I acknowledge it carries a certain drama regardless. There was a window. There was a bed with strong opinions about lumbar support. There was a bookshelf that extended upward in three separate directions, which I initially assumed was a shelving error and later understood to be entirely intentional and, frankly, impressive.</p>
      <p>The books had titles like: <em>On the Recursive Properties of Asymptotic Ward Fields,</em> and <em>A Catalogue of Observable Anomalies in Sub-Dimensional Space (Vol. XXIV),</em> and, memorably, <em>Why Everyone Else Is Wrong: A Corrective Analysis</em> — the author's initials embossed in gold on the spine, clearly by his own instruction, because he was quite pleased with it.</p>
      <p>It took me approximately four hours to realise no one was coming.</p>
      <p>Another four to understand this was, looked at correctly, rather good news.</p>`,
  },
  {
    chapterLabel: 'Chapter I, continued',
    title: 'Things I Now Know, and What I Intend to Do About Them',
    byline: 'Z.',
    body: `
      <p>By the end of the first week, I had pieced together the following:</p>
      <p>Towers, apparently, are a very <em>serious business</em> among Wizards.</p>
      <p>Not the buildings — buildings don't care; they simply stand there and occasionally settle. It's what the towers <em>represent.</em> Having a tower means you have a territory. A <em>tall</em> tower means the territory matters. The number of wards, the obscurity of the location, the complexity of the interior, the volume of the library — these are, as best I can determine, the primary metrics by which very old men in very large hats measure themselves against each other at conferences.</p>
      <p>By these measurements, my captor's tower is, conservatively, extraordinary. Which was somewhat alarming, since I had been operating on the comfortable assumption that I was dealing with a second-rate Wizard who had locked me up by accident and forgotten.</p>
      <p>The accident part, I still believe. The forgetting, clearly true.</p>
      <p>But the journal on the highest shelf — the one with the coffee stain on page forty-seven and the margin note reading <em>"do not let this fall into the wrong hands — W."</em> — suggested I had been significantly underestimating the situation.</p>
      <p>I made tea. I found a better candle. I borrowed the blank journal from the third drawer of the writing desk, which appeared to have been left there for correspondence the Wizard intended to write <em>eventually.</em></p>
      <p>I opened to the first page and wrote, at the top: <em>Things I Now Know About This Tower, and What I Intend to Do About Them.</em></p>
      <p>Then I turned back to volume one, page one, and I read.</p>`,
  },
];

// ── Species-specific lore pages (princess's account, per-species voice) ──

const SPECIES_LORE: Record<SpeciesId, LorePage[]> = {
  human: [
    {
      chapterLabel: 'Day One',
      title: 'What I Understand About My Current Situation (Preliminary)',
      byline: 'From the personal record of Z. — written in a borrowed journal, with a borrowed quill, by a candle that was probably not meant to be borrowed either',
      body: `
        <p>The room is called a cell. It is more comfortable than that implies. There is a window. There is a bed with opinions. There is a bookshelf that extends upward in three directions, which I initially took as a shelving error and have since identified as entirely deliberate and, I will admit, impressive.</p>
        <p>The books are in the wizard's handwriting — or attributed to him, or annotated by him, or occasionally physically argued with by him, in a handwriting that becomes smaller and more aggressive the more he disagrees with the source. I find this relatable in a way I did not expect.</p>
        <p>The wizard is absent. I have established this over the course of several careful hours. He is not hiding. He has simply — left. The wardrobe is missing items in a purposeful, holiday pattern. The mail has not been collected. The ink in the primary writing stand is dry.</p>
        <p>I do not yet know how I feel about this. I am reserving judgement until I have reviewed more data.</p>`,
    },
    {
      chapterLabel: 'Day Three',
      title: 'The Library, Broadly Speaking',
      byline: 'Z.',
      body: `
        <p>The library occupies — as best I can determine from careful inspection — three full floors, a partial fourth, and what may be a dimensional extension behind the east wing. I am treating that last point as a working hypothesis rather than a fact, because I am a methodical person who does not commit to hypotheses until the evidence warrants.</p>
        <p>The books cover, among other subjects: advanced ward theory (seventeen volumes, annotated), temporal harmonics (four, two of which he appears to have written in an argument with himself), the ethical dimensions of an extended lifespan (thoughtfully argued, repeatedly revisited), and what I can only describe as an extensive personal correspondence with the entire field of pre-Conclave magical methodology, which he largely disagrees with.</p>
        <p>The margin note on page forty-seven of the restricted journal reads: <em>"do not let this fall into the wrong hands."</em> I have taken extensive notes. I consider my hands to be among the more responsible ones I know.</p>`,
    },
    {
      chapterLabel: 'Day Five',
      title: 'A Working Theory',
      byline: 'Z.',
      body: `
        <p>He forgot. I am now fairly certain of this.</p>
        <p>Not maliciously. Not out of indifference — from what I can reconstruct from his notes, he is not an indifferent person; he is a busy one, in the specific way that very competent people get busy, where the business compounds over time into something that crowds out administrative details. I am, apparently, an administrative detail.</p>
        <p>The practical facts are as follows: The upward staircases are warded. The front door is sealed with a tertiary cascade ward that requires a master key. The master key is on the central workbench in the basement laboratory, per two separate notes in two different inks — he wrote it down and then forgot he'd written it down and wrote it again, which I find almost endearing.</p>
        <p>I find this entire situation more amusing than alarming. I am choosing to treat that as a personality strength.</p>`,
    },
    {
      chapterLabel: 'Day Seven',
      title: 'The Key. The Door. The World Outside.',
      byline: 'Z.',
      body: `
        <p>There is a master key in the basement. There is a sealed front door. There is a world outside the tower that I now know considerably more about than I did a week ago, having read everything the wizard has ever written regarding its geography, politics, and primary spell systems — which is, I note, a great deal.</p>
        <p>I have a plan. The plan involves the basement, the key, the door, and a firm resolve not to put any of it on his account when I leave. I am taking two books. I will not be specifying which two.</p>
        <p>I am leaving this journal here when I go. I think he might benefit from reading it. I have left a bookmark at the relevant pages.</p>
        <p>The jar of preserved ink on the writing desk will be fine. Probably.</p>`,
    },
  ],
  undead: [
    {
      chapterLabel: 'Entry. First.',
      title: 'Notes on the Current Arrangement',
      byline: 'From the account of Z. — who has, it must be said, been in worse arrangements',
      body: `
        <p>The tower is old. She can tell from the wards — not from their condition, which is exceptional, but from the signature: pre-Conclave methodology, with a clean retrofit in the upper sections no more than forty years ago. Whoever built this was both old and continuing to be old, which she respects.</p>
        <p>She has been placed in a room that the wizard considers a cell. She has been in cells. This is not a cell. This is a room with a window, two blankets of acceptable weight, and a library that extends, as best she can judge from the initial survey, through at least three floors and possibly a dimensional extension she is reserving judgement on until she has time to probe the east wall properly.</p>
        <p>The wizard is absent. She has identified this from the wards: active but unmonitored. He is alive — the sustaining enchantments are calibrated to a living caster — but distant. This is neither alarming nor inconvenient.</p>
        <p>Time, she has found, tends to resolve these things. She has found this repeatedly. Over a considerable period.</p>`,
    },
    {
      chapterLabel: 'Entry. Subsequent.',
      title: 'The Library, As It Pertains to Me Personally',
      byline: 'Z.',
      body: `
        <p>A significant portion of the wizard's library concerns itself with undead theory. Not unusually — it is a dense and interesting field — but with a particular focus on preservation wards, voluntary versus involuntary reconstitution, and what the author calls "the ethical dimensions of an extended lifespan," which she has read three times now with considerable attention.</p>
        <p>He is, she notes, mostly wrong. Not about the ethics — those sections are thoughtfully argued, if somewhat optimistic about timescales — but about the preservation ward specifications, which have changed considerably since approximately 1800 and which he appears to be sourcing from a secondary reference that she now knows contains three transcription errors on the relevant page.</p>
        <p>She has begun annotating the margins in a careful hand, with citations. She assumes he will not mind. He seems like someone who appreciates thorough notes.</p>
        <p>She left a similar note in the margins of his temporal harmonics volumes. That one was less charitable but equally well-sourced.</p>`,
    },
    {
      chapterLabel: 'Entry. Further.',
      title: 'On the Question of Urgency',
      byline: 'Z.',
      body: `
        <p>The wizard has been absent for — she has lost precise track, which is unusual and suggests she has been more absorbed in the reading than she intended.</p>
        <p>The wards on the upward staircases are active and will remain so until the master key is used. The key is, per a note she found in the basement section of the archive, on a workbench two floors below. The note was written in two different inks, which she takes as evidence of a thorough if slightly repetitive nature.</p>
        <p>She is not in a hurry. She wants to be precise about this: the situation is not urgent. Urgent implies a cost to waiting, and she has long since decoupled her decisions from urgency as a motivating principle, which has been, on balance, a significant improvement to her quality of existence.</p>
        <p>She will go when she has finished the chapters on reconstitution theory. They are genuinely interesting. The ones on temporal ward harmonics as well, if she has time. She usually has time.</p>`,
    },
    {
      chapterLabel: 'Entry. When Relevant.',
      title: 'On Exits',
      byline: 'Z.',
      body: `
        <p>She has identified the following: the location of the master key (central workbench, lower laboratory), the structure of the door seal (tertiary cascade ward, disengages cleanly with no residual effect), and the general layout of the floors above, which she intends to examine before she leaves.</p>
        <p>She will take the key when the time seems right. She will take perhaps two or three of the books as well, with the intention of returning them eventually. She acknowledges that "eventually" covers a considerable range of timescales given her particular circumstances, but she has always been careful with borrowed things, and she does not intend to change that now.</p>
        <p>She would leave a note but suspects the wizard will figure it out from the annotations. She has left a lot of annotations. He will know she was here.</p>
        <p>She hopes that is not an inconvenience. It is, she thinks, the least alarming thing he is likely to find when he returns.</p>`,
    },
  ],
  vulperia: [
    {
      chapterLabel: 'Survey Log — First Light',
      title: 'Initial Assessment',
      byline: 'Notes of Z. — compiled for operational reference',
      body: `
        <p>Arrival conditions: tower, seventh or eighth floor equivalent, stone construction, four accessible levels on first scan. Primary sensory data: sulphur and reagent compound (lower levels, persistent, suggesting active laboratory), old paper and oak gall ink (library section, dense, decades of accumulation), something unidentified burning slowly at sub-perceptible temperature (basement vicinity, flagged for follow-up).</p>
        <p>The wizard is not present. She determined this within three minutes of arrival: no body heat, no recent air displacement above baseline, no active scent trail newer than 72 hours. The wards are live but unmonitored — calibrated to a living caster, currently remote.</p>
        <p>The room she has been placed in contains a bookshelf that is more extensive than expected. She has counted the spines visible from the doorway. There are a great many. This is, she notes, operationally useful: she has been looking for four of these titles for some time.</p>
        <p>Assessment: situation is live. Beginning secondary survey.</p>`,
    },
    {
      chapterLabel: 'Survey Log — Day Two',
      title: 'Resources Identified',
      byline: 'Z.',
      body: `
        <p>The library is more substantial than any single-practitioner tower has a reasonable right to be. Either the wizard has been here a very long time or he acquires books at a rate that implies a problem. Both, possibly. The collection contains material she has been looking for — she has set four texts aside and confirmed three more are here by scent-tracing the binding adhesive to a specific workshop she recognises.</p>
        <p>His personal notes are revealing in ways he probably did not intend. His ego is, as she suspected from the ward signatures, a primary organising principle. She can tell by the way the annotations shift when he disagrees with himself — smaller handwriting when backing down, which is almost endearing. She has mapped the sections of genuine value and will return to them.</p>
        <p>Structural note: the basement is accessible. She has not gone yet. She is saving it for when she has a complete picture of what to expect.</p>
        <p>Exit candidates: three identified, two viable. Working through the options.</p>`,
    },
    {
      chapterLabel: 'Survey Log — Priority Update',
      title: 'The Key Problem',
      byline: 'Z.',
      body: `
        <p>Obstacle confirmed: the upward staircases above the ground floor are warded against passage. She probed two in sequence and confirmed they share a root enchantment — keyed to the master ward on the front door, which requires a physical key.</p>
        <p>The key is in the basement. She knows this because the wizard's notes mention it in two separate places, in different inks, in a handwriting pattern consistent with writing something down so you don't forget and then writing it again in case you forgot the first time. She finds this relatable. She does not find it reassuring about his short-term memory.</p>
        <p>Plan B is now the primary plan: basement first, key acquired, remaining floors accessible for survey, exit confirmed via front door. Estimated timeline: two days under current conditions, one if she moves with purpose.</p>
        <p>She intends to move with purpose. She generally does.</p>`,
    },
    {
      chapterLabel: 'Survey Log — Status: Active',
      title: 'Projected Exit',
      byline: 'Z.',
      body: `
        <p>Everything is proceeding within acceptable parameters.</p>
        <p>Key location confirmed: central workbench, lower laboratory. Door mechanism confirmed: tertiary cascade ward, disengages cleanly on key insertion. Upper floors contain items of interest she intends to examine before leaving — three confirmed, possibly more. Total estimated time to exit: one to two days, conditions nominal.</p>
        <p>She will be thorough. She is always thorough. The wizard built this tower over what she estimates as thirty to forty years of continuous work, and it shows. The least she can do is see all of it properly before she leaves.</p>
        <p>She is leaving this note here in case he returns before she exits and wonders. She thinks he would want to know someone found the place impressive. It is, she concludes, genuinely impressive.</p>
        <p>The four books she is taking she will return. Eventually.</p>`,
    },
  ],
  slime: [
    {
      chapterLabel: 'Day One (Approximately)',
      title: 'The Tower: A Good Evaluation',
      byline: 'This journal belongs to Z. now, she found it on the desk and is using it',
      body: `
        <p>Hello. I am writing in this journal because there is no one here and I found a quill and the desk is very smooth. I like the desk. This is the first note.</p>
        <p>The tower is tall. I can tell because I came in through the top and went down a lot of stairs, and each stair is slightly different — some are stone and some have a wooden covering and one of them makes a sound — and I like that. I have gone back to the sound stair several times already. It is on the fourth floor from the bottom. I think this is a feature, not an error, because everything else here seems very deliberate.</p>
        <p>The room I am in has a window and a bookshelf. The bookshelf goes up in three directions and has a lot of books on it. The books have words in them. There are a lot of words. I have looked at several of them. I have not read them yet but I have got a sense of them, which I think counts as a start.</p>
        <p>The floor is cold. I like the floor very much.</p>`,
    },
    {
      chapterLabel: 'Day Three',
      title: 'The Books (I Am Working On Them)',
      byline: 'Z.',
      body: `
        <p>I have been reading the books. It is going well, I think. There are some pages that have pictures and I have been reading those very carefully, and there are some pages that are just words, which are also good but take longer.</p>
        <p>One of the books is called "A Corrective Analysis" and has the author's initials in gold on the front, which I think means they liked this book very much. I liked it too. I did not understand most of it, but the gold lettering is very nice and it smells like cedar, which is a good smell. I left a small thank-you smear on the back cover, which I believe is polite.</p>
        <p>There is a book about preservation wards that has a lot of notes in the margins from someone who disagrees with everything in it. I find this book very interesting. I think the person who disagrees is the same person who wrote the gold book. The handwriting is the same but more aggressive.</p>
        <p>The candelabra on the table is warm. I have been sitting next to it while I read. I recommend this.</p>`,
    },
    {
      chapterLabel: 'Day Five',
      title: 'About the Door Situation',
      byline: 'Z.',
      body: `
        <p>The front door is sealed. I noticed this on the first day but I have been thinking about it carefully before writing it down, because I wanted to be fair.</p>
        <p>The wards on the door make my edges feel strange, which means they are very good wards. I am actually impressed. I tried going under the door. This did not work — the wards go all the way down, which shows a thoroughness I respect. I tried the window. The window has a different kind of ward and also it is very high up. I thought about the chimney. The chimney is probably also warded. He seems like someone who thinks about chimneys.</p>
        <p>There is a key in the basement. I read about it in one of the books (the annotated one). The wizard wrote the location in two places, which I think means it is very important. The basement is down the stairs on the ground floor.</p>
        <p>I have been saving the basement stairs because they look interesting. I will go tomorrow. Or possibly the day after. The books are still going well.</p>`,
    },
    {
      chapterLabel: 'Day Seven',
      title: 'My Plan (It Is Good)',
      byline: 'Z.',
      body: `
        <p>The plan is: key from the basement, key in the door, door opens, I go outside.</p>
        <p>I have heard that outside is also good. The wizard's books say outside has weather and rivers and several types of terrain I have not experienced yet, including one called "meadow" which sounds very soft and I want to try it. There is also a description of rain in volume fourteen, which I found very interesting. Rain is apparently like being everywhere at once, which is something I understand.</p>
        <p>I am going to leave this journal here on the desk when I go. I think it was meant for the wizard to write in eventually, and he can have it back. I have left it open to this page so it is easy to find.</p>
        <p>I am going to take the book with the gold lettering. Just to borrow. I will bring it back when I have finished it, which will be when I understand it, which might take a while, but I am patient.</p>
        <p>Outside is waiting. That is fine. I have been patient about other things. I can be patient about this too.</p>`,
    },
  ],
};

export interface MainMenuOptions {
  /** Called when the player picks a save slot.
   *  `isNewGame` is true when the slot was previously empty. */
  onPlay: (slotId: number, isNewGame: boolean) => void;
  /** Called when the Dev Lab button is clicked (only visible in dev mode). */
  onDevLab?: () => void;
}

// ── MainMenu class ────────────────────────────────────────────────────────

export class MainMenu {
  private readonly overlay: HTMLElement;
  private readonly tiles: Array<{ front: HTMLImageElement; back: HTMLImageElement }> = [];
  /** Index into CONCEPT_ART currently displayed in each tile. */
  private readonly current: number[];
  /** CONCEPT_ART indices not currently on screen. */
  private pool: number[];
  /** Currently active species — null shows locked grimoire, set value shows species lore. */
  private _loreSpecies: SpeciesId | null = null;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private _visible = true;
  private _lorePage = 0;
  private _prevBtn: HTMLButtonElement | null = null;
  private _nextBtn: HTMLButtonElement | null = null;
  private _devLabBtn: HTMLButtonElement | null = null;
  private _audio: HTMLAudioElement | null = null;
  private _trackIdx = 0;
  private _shuffling = false;
  private _songNameEl: HTMLElement | null = null;
  private _playPauseBtn: HTMLButtonElement | null = null;
  private _shuffleBtn: HTMLButtonElement | null = null;

  constructor(private readonly opts: MainMenuOptions) {
    this._ensureFonts();
    this._ensureStyles();

    const order = shuffled(CONCEPT_ART.map((_, i) => i));
    this.current = order.slice(0, NUM_TILES);
    this.pool    = order.slice(NUM_TILES);

    this.overlay = this._buildDOM();
    document.body.appendChild(this.overlay);
    this._scheduleAll();
    this._initAudio();
  }

  get isVisible(): boolean { return this._visible; }

  hide(): void {
    if (!this._visible) return;
    this._visible = false;
    this.overlay.style.opacity = '0';
    setTimeout(() => { this.overlay.style.display = 'none'; }, 520);
  }

  show(): void {
    this._visible = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => { this.overlay.style.opacity = '1'; });
  }

  dispose(): void {
    this.timers.forEach(clearTimeout);
    if (this._audio) { this._audio.pause(); this._audio.src = ''; }
    this.overlay.remove();
  }

  /**
   * Notify the menu of the active character's species so the lore modal
   * shows species-specific pages instead of the locked grimoire.
   * Pass `null` to reset to locked (e.g. after clearing all saves).
   */
  setActiveSpecies(species: SpeciesId | null): void {
    this._loreSpecies = species;
    if (species) {
      localStorage.setItem(LS_CHARACTER_SPECIES, species);
    } else {
      localStorage.removeItem(LS_CHARACTER_SPECIES);
    }
  }

  // ── DOM build ─────────────────────────────────────────────────────────

  private _buildDOM(): HTMLElement {
    const ov = mkEl('div', 'mm-overlay');

    // Header
    const header = mkEl('header', 'mm-header');
    const subtitle = mkEl('p', 'mm-subtitle');
    subtitle.textContent = 'Tomes, Towers & Transmutation';
    const title = mkEl('h1', 'mm-title');
    title.textContent = 'For Princesses';
    const nav = mkEl('nav', 'mm-nav');
    const navSep = mkEl('span', 'mm-nav-sep');
    // Dev Lab button — only shown when dev mode is enabled
    const devLabBtn = mkBtn('Dev Lab', 'mm-btn mm-btn--dev', () => this.opts.onDevLab?.());
    devLabBtn.style.display = localStorage.getItem('ttt_dev_mode') === 'true' ? '' : 'none';
    this._devLabBtn = devLabBtn;
    nav.append(
      mkBtn('Play',     'mm-btn', () => { this._renderSaveSlots(); this._openModal('mm-play'); }),
      mkBtn('Settings', 'mm-btn', () => this._openModal('mm-settings')),
      mkBtn('Controls', 'mm-btn', () => this._openModal('mm-controls')),
      mkBtn('Lore',     'mm-btn', () => { this._refreshLoreSpecies(); this._setLorePage(0); this._openModal('mm-lore'); }),
      devLabBtn,
      navSep,
      this._buildMusicPlayer(),
    );
    header.append(subtitle, title, nav);

    // Masonry gallery
    const section = mkEl('section', 'mm-gallery');
    const frame   = mkEl('div', 'mm-frame');
    frame.insertAdjacentHTML('beforeend', corners());
    const grid = mkEl('div', 'mm-grid');

    TILE_POSITIONS.forEach((pos, i) => {
      const tile  = mkEl('div', 'mm-tile');
      tile.style.gridColumn = pos.col;
      tile.style.gridRow    = pos.row;

      const back  = document.createElement('img');
      back.className = 'mm-img mm-img--back';
      back.alt = '';
      back.draggable = false;

      const front = document.createElement('img');
      front.className = 'mm-img mm-img--front';
      front.src = CONCEPT_ART[this.current[i]];
      front.alt = '';
      front.draggable = false;

      tile.append(back, front);
      grid.appendChild(tile);
      this.tiles.push({ front, back });
    });

    frame.appendChild(grid);
    section.appendChild(frame);

    ov.append(
      header,
      section,
      this._buildPlayModal(),
      this._buildSettingsModal(),
      this._buildControlsModal(),
      this._buildLoreModal(),
    );
    return ov;
  }

  // ── Play / save slot modal ─────────────────────────────────────────────

  private _buildPlayModal(): HTMLElement {
    const [modal, card] = mkModal('mm-play', 'Select Chronicle', () => this._closeModal('mm-play'));
    const slots = mkEl('div', 'mm-slots');
    slots.id = 'mm-slots';
    const footer = mkEl('div', 'mm-modal-footer');
    footer.appendChild(mkBtn('← Back', 'mm-slot-btn', () => this._closeModal('mm-play')));
    card.append(slots, footer);
    modal.appendChild(card);
    return modal;
  }

  private _renderSaveSlots(): void {
    const container = document.getElementById('mm-slots');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < NUM_SLOTS; i++) {
      const raw  = localStorage.getItem(lsSave(i));
      const data = raw ? (JSON.parse(raw) as SaveData) : null;
      const row  = mkEl('div', 'mm-save-row');

      if (data) {
        const date = new Date(data.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        row.innerHTML = `
          <div class="mm-save-info">
            <span class="mm-save-name">Chronicle ${i + 1}</span>
            <span class="mm-save-detail">${data.location} &middot; Floor ${data.floor} &middot; ${date}</span>
          </div>
          <div class="mm-save-actions">
            <button class="mm-slot-btn mm-slot-btn--play" data-i="${i}">Continue</button>
            <button class="mm-slot-btn mm-slot-btn--del"  data-i="${i}">✕</button>
          </div>`;
      } else {
        row.innerHTML = `
          <span class="mm-save-name mm-save-empty">Chronicle ${i + 1} — Empty</span>
          <button class="mm-slot-btn mm-slot-btn--play" data-i="${i}">New Game</button>`;
      }

      row.querySelectorAll<HTMLButtonElement>('.mm-slot-btn--play').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.i ?? '0');
          const wasNew = !data;
          if (!data) {
            patchSaveSlot(idx, { location: 'The Cell', floor: 0 });
          }
          this._closeModal('mm-play');
          this.hide();
          this.opts.onPlay(idx, wasNew);
        });
      });
      row.querySelectorAll<HTMLButtonElement>('.mm-slot-btn--del').forEach(b => {
        b.addEventListener('click', () => {
          localStorage.removeItem(lsSave(parseInt(b.dataset.i ?? '0')));
          this._renderSaveSlots();
        });
      });

      container.appendChild(row);
    }
  }

  // ── Settings modal ─────────────────────────────────────────────────────

  private _buildSettingsModal(): HTMLElement {
    const vol = parseInt(localStorage.getItem(LS_VOL) ?? '80');
    const [modal, card] = mkModal('mm-settings', 'Grimoire Options', () => this._closeModal('mm-settings'));

    const musicVis = localStorage.getItem(LS_MUSIC_VISIBLE) !== 'false';
    const devOn    = localStorage.getItem('ttt_dev_mode') === 'true';
    const wg       = loadWorldGenConfig();

    card.insertAdjacentHTML('beforeend', `
      <div class="mm-setting-row">
        <label class="mm-setting-label">Master Volume</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-vol" class="mm-slider" min="0" max="100" value="${vol}">
          <span id="mm-vol-val" class="mm-setting-val">${vol}%</span>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">Fullscreen</label>
        <label class="mm-toggle">
          <input type="checkbox" id="mm-fs">
          <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">Music Player</label>
        <label class="mm-toggle">
          <input type="checkbox" id="mm-music-toggle" ${musicVis ? 'checked' : ''}>
          <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>
      <div class="mm-setting-divider"></div>
      <div class="mm-setting-row">
        <label class="mm-setting-label mm-setting-label--dev">
          Dev Mode
          <span class="mm-setting-dev-hint">Enables cheat panel in-game (Pause → Dev Panel)</span>
        </label>
        <label class="mm-toggle mm-toggle--dev">
          <input type="checkbox" id="mm-dev-toggle" ${devOn ? 'checked' : ''}>
          <span class="mm-toggle-track mm-toggle-track--dev"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>
      <div class="mm-setting-divider"></div>
      <div class="mm-setting-row mm-setting-row--section-hdr">
        <span class="mm-setting-section-title">World Generation</span>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">World Size</label>
        <div class="mm-setting-ctl mm-setting-ctl--radio">
          <label class="mm-radio-label">
            <input type="radio" name="mm-wg-size" value="128" ${wg.worldSize === 128 ? 'checked' : ''}> Standard (128)
          </label>
          <label class="mm-radio-label">
            <input type="radio" name="mm-wg-size" value="256" ${wg.worldSize === 256 ? 'checked' : ''}> Large (256)
          </label>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">Seed
          <span class="mm-setting-dev-hint">0 = random each game</span>
        </label>
        <div class="mm-setting-ctl mm-setting-ctl--seed">
          <input type="number" id="mm-wg-seed" class="mm-text-input" min="0" max="4294967295" step="1" value="${wg.seed}">
          <button id="mm-wg-rand" class="mm-slot-btn mm-slot-btn--icon" title="Randomise seed">🎲</button>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">Dungeon Entrances</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-wg-dungeons" class="mm-slider" min="2" max="12" value="${wg.dungeonCount}">
          <span id="mm-wg-dungeons-val" class="mm-setting-val">${wg.dungeonCount}</span>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">Enemy Camps</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-wg-camps" class="mm-slider" min="2" max="10" value="${wg.enemyCampCount}">
          <span id="mm-wg-camps-val" class="mm-setting-val">${wg.enemyCampCount}</span>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">Villages</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-wg-villages" class="mm-slider" min="0" max="6" value="${wg.villageCount}">
          <span id="mm-wg-villages-val" class="mm-setting-val">${wg.villageCount}</span>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">River Paths</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-wg-rivers" class="mm-slider" min="2" max="8" value="${wg.riverCount}">
          <span id="mm-wg-rivers-val" class="mm-setting-val">${wg.riverCount}</span>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">Towns</label>
        <div class="mm-setting-ctl">
          <input type="range" id="mm-wg-towns" class="mm-slider" min="0" max="4" value="${wg.townCount}">
          <span id="mm-wg-towns-val" class="mm-setting-val">${wg.townCount}</span>
        </div>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">City</label>
        <div class="mm-setting-ctl">
          <label class="mm-toggle">
            <input type="checkbox" id="mm-wg-city" ${wg.hasCity ? 'checked' : ''}>
            <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
          </label>
        </div>
      </div>
      <div class="mm-setting-row mm-setting-row--share">
        <button id="mm-wg-share" class="mm-slot-btn" title="Copy world config to clipboard">Share Config</button>
        <input type="text" id="mm-wg-load-input" class="mm-text-input mm-text-input--share" placeholder="Paste config code…">
        <button id="mm-wg-load" class="mm-slot-btn">Load</button>
      </div>
      <div class="mm-setting-divider"></div>
      <div class="mm-setting-row mm-setting-row--section-hdr">
        <span class="mm-setting-section-title">🎨 Visual Style</span>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">
          Environment Art: Procedural / KayKit Assets
          <span class="mm-setting-dev-hint">Off = procedural code-first geometry (default). On = Kenney 3D GLB tile packs.</span>
        </label>
        <label class="mm-toggle">
          <input type="checkbox" id="mm-asset-mode" ${wg.assetMode === 'kenney' ? 'checked' : ''}>
          <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>
      <div id="mm-asset-packs-row" class="mm-setting-row" style="flex-direction:column;gap:8px;${wg.assetMode !== 'kenney' ? 'display:none' : ''}">
        <label class="mm-setting-label">Active packs — same-provider rule: Kenney only</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0">
          ${KENNEY_PACKS.map(p => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;color:#c8b89a" title="${p.desc}"><input type="checkbox" class="mm-pack-cb" value="${p.id}" ${wg.assetPacks.includes(p.id) ? 'checked' : ''}> ${p.icon} ${p.name}${p.recommended ? ' ★' : ''}</label>`).join('')}
        </div>
      </div>
      <div class="mm-setting-divider"></div>
      <div class="mm-setting-row mm-setting-row--section-hdr">
        <span class="mm-setting-section-title">🎨 Visual Style</span>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">
          Environment Art: Procedural / KayKit Assets
          <span class="mm-setting-dev-hint">Default: procedural code-first geometry. Enable to swap in Kenney 3D GLB tiles per-pack.</span>
        </label>
        <label class="mm-toggle">
          <input type="checkbox" id="mm-asset-mode" ${wg.assetMode === 'kenney' ? 'checked' : ''}>
          <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>
      <div id="mm-asset-packs-row" class="mm-setting-row mm-asset-packs-row" style="${wg.assetMode !== 'kenney' ? 'display:none' : ''}">
        <label class="mm-setting-label">Active packs</label>
        <div class="mm-setting-ctl mm-pack-grid">
          ${KENNEY_PACKS.map(p => `
            <label class="mm-pack-label${p.recommended ? ' mm-pack-label--rec' : ''}" title="${p.desc}">
              <input type="checkbox" class="mm-pack-cb" value="${p.id}" ${wg.assetPacks.includes(p.id) ? 'checked' : ''}>
              <span>${p.icon} ${p.name}${p.recommended ? ' ★' : ''}</span>
            </label>`,
          ).join('')}
        </div>
      </div>
      <div class="mm-setting-divider"></div>
      <div class="mm-setting-row mm-setting-row--section-hdr">
        <span class="mm-setting-section-title">🎭 Characters</span>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">
          Asset Characters
          <span class="mm-setting-dev-hint">Off = procedural code-first DNA builder (default). On = GLB/FBX model packs.</span>
        </label>
        <label class="mm-toggle">
          <input type="checkbox" id="mm-char-mode" ${wg.charMode === 'asset' ? 'checked' : ''}>
          <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>
      <div id="mm-char-packs-row" class="mm-setting-row mm-asset-packs-row" style="${wg.charMode !== 'asset' ? 'display:none' : ''}">
        <label class="mm-setting-label">Active packs</label>
        <div class="mm-setting-ctl mm-pack-grid">
          ${CHAR_PACKS.map(p => `
            <label class="mm-pack-label${p.recommended ? ' mm-pack-label--rec' : ''}" title="${p.desc} (${p.modelCount} models)">
              <input type="checkbox" class="mm-char-pack-cb" value="${p.id}" ${wg.charPacks.includes(p.id) ? 'checked' : ''}>
              <span>${p.icon} ${p.name}${p.recommended ? ' ★' : ''}</span>
            </label>`).join('')}
        </div>
      </div>
    `);

    const footer = mkEl('div', 'mm-modal-footer');
    footer.appendChild(mkBtn('Apply & Close', 'mm-slot-btn', () => this._closeModal('mm-settings')));
    card.appendChild(footer);

    // ── Volume ──────────────────────────────────────────────────────────────
    const slider = card.querySelector<HTMLInputElement>('#mm-vol')!;
    const valEl  = card.querySelector<HTMLSpanElement>('#mm-vol-val')!;
    slider.addEventListener('input', () => {
      valEl.textContent = `${slider.value}%`;
      localStorage.setItem(LS_VOL, slider.value);
      if (this._audio) this._audio.volume = parseInt(slider.value) / 100;
    });

    const fsCb = card.querySelector<HTMLInputElement>('#mm-fs')!;
    fsCb.checked = !!document.fullscreenElement;
    fsCb.addEventListener('change', () => {
      if (fsCb.checked) document.documentElement.requestFullscreen().catch(() => {});
      else              document.exitFullscreen().catch(() => {});
    });

    const musicToggle = card.querySelector<HTMLInputElement>('#mm-music-toggle')!;
    musicToggle.addEventListener('change', () => {
      const playerEl = document.getElementById('mm-player');
      if (playerEl) playerEl.style.display = musicToggle.checked ? 'flex' : 'none';
      localStorage.setItem(LS_MUSIC_VISIBLE, String(musicToggle.checked));
    });

    const devToggle = card.querySelector<HTMLInputElement>('#mm-dev-toggle')!;
    devToggle.addEventListener('change', () => {
      localStorage.setItem('ttt_dev_mode', String(devToggle.checked));
      // Show / hide the Dev Lab nav button in real-time
      if (this._devLabBtn) {
        this._devLabBtn.style.display = devToggle.checked ? '' : 'none';
      }
    });

    // ── World Gen ───────────────────────────────────────────────────────────
    const saveWg = (): void => saveWorldGenConfig(wg);

    const sizeRadios = card.querySelectorAll<HTMLInputElement>('input[name="mm-wg-size"]');
    sizeRadios.forEach(r => r.addEventListener('change', () => {
      wg.worldSize = parseInt(r.value) as WorldGenConfig['worldSize'];
      saveWg();
    }));

    const seedInput = card.querySelector<HTMLInputElement>('#mm-wg-seed')!;
    seedInput.addEventListener('change', () => {
      wg.seed = Math.max(0, Math.min(0xFFFF_FFFF, parseInt(seedInput.value) || 0));
      seedInput.value = String(wg.seed);
      saveWg();
    });

    const randBtn = card.querySelector<HTMLButtonElement>('#mm-wg-rand')!;
    randBtn.addEventListener('click', () => {
      const next = randomiseSeed(wg);
      wg.seed = next.seed;
      seedInput.value = String(wg.seed);
      saveWg();
    });

    const mkSlider = (id: string, valId: string, key: keyof WorldGenConfig): void => {
      const el  = card.querySelector<HTMLInputElement>(id)!;
      const val = card.querySelector<HTMLSpanElement>(valId)!;
      el.addEventListener('input', () => {
        (wg as unknown as Record<string, unknown>)[key as string] = parseInt(el.value);
        val.textContent = el.value;
        saveWg();
      });
    };
    mkSlider('#mm-wg-dungeons', '#mm-wg-dungeons-val', 'dungeonCount');
    mkSlider('#mm-wg-camps',    '#mm-wg-camps-val',    'enemyCampCount');
    mkSlider('#mm-wg-villages', '#mm-wg-villages-val', 'villageCount');
    mkSlider('#mm-wg-rivers',   '#mm-wg-rivers-val',   'riverCount');
    mkSlider('#mm-wg-towns',    '#mm-wg-towns-val',    'townCount');

    const cityToggle = card.querySelector<HTMLInputElement>('#mm-wg-city')!;
    cityToggle.addEventListener('change', () => { wg.hasCity = cityToggle.checked; saveWg(); });

    // ── Asset mode + pack selection ───────────────────────────────────────────────────────
    const assetModeCb   = card.querySelector<HTMLInputElement>('#mm-asset-mode')!;
    const assetPacksRow = card.querySelector<HTMLElement>('#mm-asset-packs-row')!;

    assetModeCb.addEventListener('change', () => {
      wg.assetMode = assetModeCb.checked ? 'kenney' : 'code';
      assetPacksRow.style.display = assetModeCb.checked ? '' : 'none';
      saveWg();
    });

    card.querySelectorAll<HTMLInputElement>('.mm-pack-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        wg.assetPacks = [...card.querySelectorAll<HTMLInputElement>('.mm-pack-cb')]
          .filter(c => c.checked).map(c => c.value);
        saveWg();
      });
    });

    // ── Character mode + pack selection ──────────────────────────────────────
    const charModeCb   = card.querySelector<HTMLInputElement>('#mm-char-mode')!;
    const charPacksRow = card.querySelector<HTMLElement>('#mm-char-packs-row')!;

    charModeCb.addEventListener('change', () => {
      wg.charMode = charModeCb.checked ? 'asset' : 'code';
      charPacksRow.style.display = charModeCb.checked ? '' : 'none';
      saveWg();
    });

    card.querySelectorAll<HTMLInputElement>('.mm-char-pack-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        wg.charPacks = [...card.querySelectorAll<HTMLInputElement>('.mm-char-pack-cb')]
          .filter(c => c.checked).map(c => c.value);
        saveWg();
      });
    });

    const shareBtn = card.querySelector<HTMLButtonElement>('#mm-wg-share')!;
    shareBtn.addEventListener('click', () => {
      try {
        const encoded = btoa(JSON.stringify(wg));
        navigator.clipboard.writeText(encoded).catch(() => {
          prompt('Copy config code:', encoded);
        });
      } catch { /* ignore */ }
    });

    const loadInput = card.querySelector<HTMLInputElement>('#mm-wg-load-input')!;
    const loadBtn   = card.querySelector<HTMLButtonElement>('#mm-wg-load')!;
    loadBtn.addEventListener('click', () => {
      try {
        const raw  = loadInput.value.trim();
        const parsed = JSON.parse(atob(raw)) as Partial<WorldGenConfig>;
        Object.assign(wg, parsed);
        saveWg();
        loadInput.value = '';
        loadBtn.textContent = '✓';
        setTimeout(() => { loadBtn.textContent = 'Load'; }, 1500);
      } catch {
        loadInput.style.outline = '2px solid #f44';
        setTimeout(() => { loadInput.style.outline = ''; }, 1200);
      }
    });

    modal.appendChild(card);
    return modal;
  }

  // ── Controls modal ────────────────────────────────────────────────────

  private _buildControlsModal(): HTMLElement {
    const [modal, card] = mkModal('mm-controls', 'Tome of Controls', () => this._closeModal('mm-controls'));

    const rows: [string, string][] = [
      ['W A S D',         'Move'],
      ['Shift',           'Run'],
      ['Space',           'Jump'],
      ['F',               'Dodge roll'],
      ['Left Click',      'Melee attack'],
      ['Right Click',     'Cast active spell'],
      ['1 / 2 / 3 / 4',  'Switch spell slot'],
      ['E',               'Interact (NPC / object / board)'],
      ['Z',               'Use Minor Heal potion'],
      ['X',               'Use Major Heal potion'],
      ['Q',               'Quest log'],
      ['K',               'Spellbook (Grimoire)'],
      ['P',               'Character stats'],
      ['T',               'Talent tree'],
      ['H',               'Controls & how to play (in-game)'],
      ['B',               'Build mode (exterior only)'],
      ['Escape',          'Pause / close panel'],
      ['` (tilde)',       'Level editor (dev)'],
    ];

    const table = mkEl('div', 'mm-controls-table');
    rows.forEach(([key, action]) => {
      table.insertAdjacentHTML('beforeend', `
        <div class="mm-ctrl-row">
          <kbd class="mm-kbd">${key}</kbd>
          <span class="mm-ctrl-action">${action}</span>
        </div>`);
    });

    const footer = mkEl('div', 'mm-modal-footer');
    footer.appendChild(mkBtn('Close', 'mm-slot-btn', () => this._closeModal('mm-controls')));
    card.append(table, footer);
    modal.appendChild(card);
    return modal;
  }

  // ── Lore / book modal ──────────────────────────────────────────────────

  private _buildLoreModal(): HTMLElement {
    const modal = mkEl('div', 'mm-modal');
    modal.id = 'mm-lore';
    modal.addEventListener('click', (e) => { if (e.target === modal) this._closeModal('mm-lore'); });

    const card = mkEl('div', 'mm-book-card');
    card.addEventListener('click', (e) => e.stopPropagation());

    // Close button (top-right of card)
    const closeX = mkBtn('✕', 'mm-book-close', () => this._closeModal('mm-lore'));
    card.appendChild(closeX);

    // Scrollable page content
    const pageWrap = mkEl('div', 'mm-book-page-wrap');
    const page = mkEl('div', 'mm-lore-page');
    page.id = 'mm-lore-page';
    pageWrap.appendChild(page);

    // Navigation bar (hidden when grimoire is locked)
    const nav = mkEl('div', 'mm-book-nav');
    nav.id = 'mm-book-nav';
    this._prevBtn = mkBtn('◄ Previous', 'mm-book-nav-btn', () => this._flipLore(-1)) as HTMLButtonElement;
    const pageNum = mkEl('span', 'mm-book-page-num') as HTMLSpanElement;
    pageNum.id = 'mm-book-pnum';
    this._nextBtn = mkBtn('Next ►', 'mm-book-nav-btn', () => this._flipLore(1)) as HTMLButtonElement;
    nav.append(this._prevBtn, pageNum, this._nextBtn);

    card.append(pageWrap, nav);
    modal.appendChild(card);

    // Render the first page now (DOM exists at this point)
    this._refreshLoreSpecies();
    this._setLorePage(0);
    return modal;
  }

  /** Read species from in-memory field (falls back to localStorage for page reloads). */
  private _refreshLoreSpecies(): void {
    if (!this._loreSpecies) {
      const stored = localStorage.getItem(LS_CHARACTER_SPECIES) as SpeciesId | null;
      this._loreSpecies = stored;
    }
  }

  /** Returns the page array appropriate for the current state. */
  private _getActivePages(): LorePage[] {
    return this._loreSpecies ? (SPECIES_LORE[this._loreSpecies] ?? LORE_PAGES) : LORE_PAGES;
  }

  private _setLorePage(idx: number): void {
    const pages = this._getActivePages();
    const isLocked = !this._loreSpecies;

    this._lorePage = Math.max(0, Math.min(idx, pages.length - 1));
    const page = document.getElementById('mm-lore-page');
    const pnum = document.getElementById('mm-book-pnum');
    const nav  = document.getElementById('mm-book-nav');

    if (isLocked) {
      // ── Locked grimoire state ─────────────────────────────────────────
      if (nav) nav.style.visibility = 'hidden';
      if (page) {
        page.innerHTML = `
          <div class="mm-lore-locked">
            <div class="mm-grimoire-seal-wrap">
              <div class="mm-grimoire-seal-ring">
                <div class="mm-grimoire-seal-inner">
                  <span class="mm-grimoire-seal-glyph">⚜</span>
                </div>
              </div>
            </div>
            <p class="mm-grimoire-locked-title">Tomes, Towers &amp; Transmutation</p>
            <p class="mm-grimoire-locked-subtitle">For Princesses</p>
            <div class="mm-grimoire-locked-rule"></div>
            <p class="mm-grimoire-locked-msg"><em>This fate has not yet been woven.</em></p>
            <p class="mm-grimoire-locked-hint">Begin a chronicle to unlock these records.</p>
          </div>
        `;
      }
    } else {
      // ── Unlocked: species-specific pages ─────────────────────────────
      if (nav) nav.style.visibility = 'visible';
      const p = pages[this._lorePage];
      if (page) {
        page.innerHTML = `
          <div class="mm-lore-chapter">${p.chapterLabel}</div>
          <h2 class="mm-lore-title">${p.title}</h2>
          <p class="mm-lore-byline">${p.byline}</p>
          <div class="mm-lore-rule"></div>
          <div class="mm-lore-body">${p.body}</div>
        `;
      }
      if (pnum) pnum.textContent = `${this._lorePage + 1} \u2013 ${pages.length}`;
      if (this._prevBtn) this._prevBtn.disabled = this._lorePage === 0;
      if (this._nextBtn) this._nextBtn.disabled = this._lorePage === pages.length - 1;
    }
  }

  /** Animate page turn in direction +1 (forward) or -1 (back). */
  private _flipLore(dir: 1 | -1): void {
    const pages = this._getActivePages();
    const next = this._lorePage + dir;
    if (next < 0 || next >= pages.length) return;

    const page = document.getElementById('mm-lore-page');
    if (!page) return;

    const exitCls  = dir > 0 ? 'mm-flip-out-fwd'  : 'mm-flip-out-back';
    const enterCls = dir > 0 ? 'mm-flip-in-fwd'   : 'mm-flip-in-back';

    page.classList.add(exitCls);
    // Block nav during animation
    if (this._prevBtn) this._prevBtn.disabled = true;
    if (this._nextBtn) this._nextBtn.disabled = true;

    setTimeout(() => {
      page.classList.remove(exitCls);
      this._setLorePage(next);
      page.classList.add(enterCls);
      setTimeout(() => page.classList.remove(enterCls), 300);
    }, 260);
  }

  // ── Music player ───────────────────────────────────────────────────────

  private _buildMusicPlayer(): HTMLElement {
    const visible = localStorage.getItem(LS_MUSIC_VISIBLE) !== 'false';

    const wrap = mkEl('div', 'mm-player');
    wrap.id = 'mm-player';
    if (!visible) wrap.style.display = 'none';

    const prevBtn = mkBtn('⏮', 'mm-player-btn', () => this._prevTrack());
    prevBtn.title = 'Previous';

    this._playPauseBtn = mkBtn('▶', 'mm-player-btn mm-player-btn--pp', () => this._togglePlayPause()) as HTMLButtonElement;
    this._playPauseBtn.title = 'Play / Pause';

    const nextBtn = mkBtn('⏭', 'mm-player-btn', () => this._nextTrack());
    nextBtn.title = 'Next';

    this._shuffleBtn = mkBtn('⇄', 'mm-player-btn mm-player-btn--shuf', () => this._toggleShuffle()) as HTMLButtonElement;
    this._shuffleBtn.title = 'Shuffle';

    const controls = mkEl('div', 'mm-player-controls');
    controls.append(prevBtn, this._playPauseBtn, nextBtn, this._shuffleBtn);

    this._songNameEl = mkEl('span', 'mm-player-track');
    this._songNameEl.textContent = TRACKS[0];
    const artist = mkEl('span', 'mm-player-artist');
    artist.textContent = 'Dancing Salamanders';
    const info = mkEl('div', 'mm-player-info');
    info.append(this._songNameEl, artist);

    wrap.append(controls, info);
    return wrap;
  }

  private _initAudio(): void {
    const audio = new Audio();
    audio.volume = parseInt(localStorage.getItem(LS_VOL) ?? '80') / 100;
    this._audio = audio;
    audio.addEventListener('ended', () => this._nextTrack());
    audio.addEventListener('pause', () => this._updatePlayerUI());
    audio.addEventListener('play',  () => this._updatePlayerUI());

    // Set first track src without auto-starting
    this._playTrack(0, false);

    // Muted autoplay is universally permitted by browser policy; unmute once playing
    audio.muted = true;
    audio.play()
      .then(() => { audio.muted = false; })
      .catch(() => {
        // Very restrictive config: fall back to first user gesture
        audio.muted = false;
        const startOnGesture = () => {
          audio.play().catch(() => {});
          document.removeEventListener('click',   startOnGesture, true);
          document.removeEventListener('keydown', startOnGesture, true);
        };
        document.addEventListener('click',   startOnGesture, { capture: true, once: true });
        document.addEventListener('keydown', startOnGesture, { capture: true, once: true });
      });
  }

  private _playTrack(idx: number, autoStart = false): void {
    if (!this._audio) return;
    this._trackIdx = Math.max(0, Math.min(idx, TRACKS.length - 1));
    this._audio.src = `/music/${encodeURIComponent(TRACKS[this._trackIdx] + '.mp3')}`;
    this._updatePlayerUI();
    if (autoStart) this._audio.play().catch(() => {});
  }

  private _prevTrack(): void {
    if (this._audio && this._audio.currentTime > 3) {
      this._audio.currentTime = 0;
    } else {
      this._playTrack((this._trackIdx - 1 + TRACKS.length) % TRACKS.length, true);
    }
  }

  private _nextTrack(): void {
    let idx: number;
    if (this._shuffling) {
      do { idx = Math.floor(Math.random() * TRACKS.length); }
      while (TRACKS.length > 1 && idx === this._trackIdx);
    } else {
      idx = (this._trackIdx + 1) % TRACKS.length;
    }
    this._playTrack(idx, true);
  }

  private _togglePlayPause(): void {
    if (!this._audio) return;
    if (this._audio.paused) this._audio.play().catch(() => {});
    else                    this._audio.pause();
  }

  private _toggleShuffle(): void {
    this._shuffling = !this._shuffling;
    this._shuffleBtn?.classList.toggle('mm-player-btn--active', this._shuffling);
  }

  private _updatePlayerUI(): void {
    if (this._songNameEl)   this._songNameEl.textContent   = TRACKS[this._trackIdx];
    if (this._playPauseBtn) this._playPauseBtn.textContent = this._audio?.paused !== false ? '▶' : '⏸';
  }

  // ── Modal helpers ──────────────────────────────────────────────────────

  private _openModal(id: string): void {
    document.getElementById(id)?.classList.add('mm-modal--open');
  }

  private _closeModal(id: string): void {
    document.getElementById(id)?.classList.remove('mm-modal--open');
  }

  // ── Masonry crossfade ──────────────────────────────────────────────────

  private _scheduleAll(): void {
    for (let i = 0; i < NUM_TILES; i++) {
      const delay = 2_800 + i * STAGGER_MS + randInt(0, 2_000);
      this.timers[i] = setTimeout(() => this._swapTile(i), delay);
    }
  }

  private _swapTile(i: number): void {
    if (this.pool.length === 0) {
      this.timers[i] = setTimeout(() => this._swapTile(i), SWAP_MIN_MS);
      return;
    }

    const { front, back } = this.tiles[i];
    // Pick a random candidate from the pool
    const newIdx = this.pool[Math.floor(Math.random() * this.pool.length)];

    const preload = new Image();
    preload.onload = () => {
      // Update accounting before any DOM change
      this.pool = this.pool.filter(x => x !== newIdx);
      this.pool.push(this.current[i]);
      this.current[i] = newIdx;

      back.src = CONCEPT_ART[newIdx];

      // Two rAF to ensure the back image is painted before we start the fade
      requestAnimationFrame(() => requestAnimationFrame(() => {
        back.style.opacity  = '1';
        front.style.opacity = '0';

        setTimeout(() => {
          front.src           = back.src;
          front.style.opacity = '1';
          back.style.opacity  = '0';
          // Do NOT clear back.src here — setting src='' triggers the broken-image
          // placeholder while back is still fading to opacity:0.  The src will be
          // overwritten on the next swap cycle, so leaving it is safe.

          this.timers[i] = setTimeout(
            () => this._swapTile(i),
            SWAP_MIN_MS + randInt(0, SWAP_MAX_MS - SWAP_MIN_MS),
          );
        }, FADE_MS + 80);
      }));
    };
    preload.onerror = () => {
      // Image failed — retry after a short wait without burning a cycle
      this.timers[i] = setTimeout(() => this._swapTile(i), 3_000);
    };
    preload.src = CONCEPT_ART[newIdx];
  }

  // ── Font / style injection ─────────────────────────────────────────────

  private _ensureFonts(): void {
    if (document.getElementById('mm-gfonts')) return;
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com';
    (pre2 as HTMLLinkElement & { crossOrigin: string }).crossOrigin = 'anonymous';
    const lnk = document.createElement('link');
    lnk.id = 'mm-gfonts';
    lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=IM+Fell+English:ital@0;1&display=swap';
    document.head.append(pre1, pre2, lnk);
  }

  private _ensureStyles(): void {
    if (document.getElementById('mm-css')) return;
    const s = document.createElement('style');
    s.id = 'mm-css';
    s.textContent = MM_CSS;
    document.head.appendChild(s);
  }
}

// ── Small DOM helpers ─────────────────────────────────────────────────────

function mkEl(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function mkBtn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button') as HTMLButtonElement;
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/** Build a modal overlay + card pair. Returns [overlay, card]. */
function mkModal(
  id: string,
  titleText: string,
  onBackdropClick: () => void,
): [HTMLElement, HTMLElement] {
  const overlay = mkEl('div', 'mm-modal');
  overlay.id = id;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) onBackdropClick(); });

  const card = mkEl('div', 'mm-modal-card');
  card.addEventListener('click', (e) => e.stopPropagation());
  card.insertAdjacentHTML('beforeend', corners());

  const h2 = mkEl('h2', 'mm-modal-title') as HTMLHeadingElement;
  h2.textContent = titleText;
  card.appendChild(h2);

  return [overlay, card];
}

function corners(): string {
  return `<span class="mm-corner mm-c-tl">✥</span>
          <span class="mm-corner mm-c-tr">✥</span>
          <span class="mm-corner mm-c-bl">✥</span>
          <span class="mm-corner mm-c-br">✥</span>`;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── CSS ───────────────────────────────────────────────────────────────────

const MM_CSS = `
/* ── Base overlay ───────────────────────────────────────────────────────── */
.mm-overlay {
  position: fixed; inset: 0; z-index: 9000;
  display: flex; flex-direction: column; align-items: center;
  overflow-y: auto;
  background: #1a1820;
  background-image:
    radial-gradient(circle at 50% -10%, rgba(157,124,206,.18) 0%, transparent 55%),
    radial-gradient(circle at 95% 95%,  rgba(85,60,120,.22) 0%,  transparent 40%);
  color: #e2d9c8;
  font-family: 'IM Fell English', Georgia, serif;
  opacity: 1;
  transition: opacity .5s ease;
  padding-bottom: 48px;
  scrollbar-width: thin;
  scrollbar-color: #4a4158 transparent;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.mm-header {
  text-align: center;
  width: 100%; max-width: min(94vw, 1140px);
  padding: 52px 24px 28px;
}

.mm-subtitle {
  font-family: 'Cinzel', serif;
  font-size: 12px; letter-spacing: 6px; text-transform: uppercase;
  color: #9d7cce; margin-bottom: 14px;
}

.mm-title {
  font-family: 'Cinzel', serif;
  font-size: clamp(38px, 7.5vw, 82px);
  font-weight: 700; color: #fff;
  text-shadow: 0 0 35px rgba(157,124,206,.55), 0 5px 10px rgba(0,0,0,.85);
  letter-spacing: 4px; margin-bottom: 40px; line-height: 1.1;
}

/* ── Nav buttons ─────────────────────────────────────────────────────────── */
.mm-nav {
  display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;
}

.mm-btn {
  background: transparent;
  border: 2px solid #4a4158; border-radius: 4px;
  color: #e2d9c8;
  font-family: 'Cinzel', serif; font-size: 17px;
  padding: 11px 44px;
  cursor: pointer; text-transform: uppercase; letter-spacing: 2px;
  position: relative; overflow: hidden;
  transition: border-color .28s, color .28s, box-shadow .28s, transform .14s;
}
.mm-btn::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(157,124,206,.16), transparent);
  transform: translateX(-100%);
  transition: transform .48s ease;
}
.mm-btn:hover::after { transform: translateX(100%); }
.mm-btn:hover {
  border-color: #9d7cce; color: #fff;
  box-shadow: 0 0 22px rgba(157,124,206,.38);
  transform: translateY(-2px);
}
.mm-btn:active { transform: translateY(1px); }
.mm-btn--dev {
  border-color: #3a2860; color: #9060d0; font-size: 14px; padding: 11px 28px;
}
.mm-btn--dev:hover { border-color: #7040c0; color: #d0a0ff; box-shadow: 0 0 16px rgba(120,60,200,.3); }

/* ── Gallery frame ───────────────────────────────────────────────────────── */
.mm-gallery {
  width: 100%; max-width: 1160px;
  padding: 0 20px;
}

.mm-frame {
  position: relative;
  background: rgba(28,24,36,.72); border: 2px solid #4a4158; border-radius: 12px;
  padding: 22px;
  box-shadow: inset 0 0 55px rgba(0,0,0,.5), 0 12px 42px rgba(0,0,0,.42);
}

.mm-corner {
  position: absolute; color: #4a4158; font-size: 19px; line-height: 1;
  pointer-events: none;
}
.mm-c-tl { top:10px;  left:14px;  }
.mm-c-tr { top:10px;  right:14px; }
.mm-c-bl { bottom:10px; left:14px;  }
.mm-c-br { bottom:10px; right:14px; }

/* ── Masonry grid ─────────────────────────────────────────────────────────── */
.mm-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: 210px 210px 230px;
  gap: 13px;
}

.mm-tile {
  position: relative;
  border-radius: 8px; overflow: hidden;
  border: 1px solid rgba(255,255,255,.045);
  box-shadow: 0 4px 14px rgba(0,0,0,.42);
  background: #0f0d14;
  cursor: default;
  transition: transform .32s cubic-bezier(.25,.8,.25,1),
              box-shadow .32s,
              border-color .32s;
}
.mm-tile:hover {
  transform: scale(1.042) translateY(-4px);
  box-shadow: 0 14px 30px rgba(0,0,0,.55), 0 0 18px rgba(157,124,206,.22);
  border-color: rgba(157,124,206,.38);
  z-index: 5;
}

.mm-img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover;
  transition: opacity ${FADE_MS}ms ease-in-out;
  filter: brightness(.84) contrast(1.06);
  user-select: none;
}
.mm-img--front { opacity: 1; z-index: 2; }
.mm-img--back  { opacity: 0; z-index: 1; }
.mm-tile:hover .mm-img--front { filter: brightness(1.06) contrast(1.0); }

/* ── Modal overlay ───────────────────────────────────────────────────────── */
.mm-modal {
  position: fixed; inset: 0; z-index: 9200;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.84);
  backdrop-filter: blur(5px);
  opacity: 0; pointer-events: none;
  transition: opacity .32s ease;
}
.mm-modal.mm-modal--open {
  opacity: 1; pointer-events: auto;
}

.mm-modal-card {
  position: relative;
  background: rgba(26,22,34,.97); border: 2px solid #4a4158; border-radius: 12px;
  padding: 38px 46px; width: 90%; max-width: 580px;
  box-shadow: inset 0 0 50px rgba(0,0,0,.65), 0 22px 60px rgba(0,0,0,.6);
  transform: translateY(18px);
  transition: transform .38s cubic-bezier(.175,.885,.32,1.28);
  max-height: 85vh; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #4a4158 transparent;
}
.mm-modal.mm-modal--open .mm-modal-card {
  transform: translateY(0);
}

.mm-modal-title {
  font-family: 'Cinzel', serif; font-size: 22px; font-weight: 700;
  text-align: center; color: #9d7cce;
  margin-bottom: 24px; padding-bottom: 14px;
  border-bottom: 1px solid #4a4158; letter-spacing: 2px;
}

.mm-modal-footer {
  margin-top: 26px; text-align: center;
}

/* ── Save slots ──────────────────────────────────────────────────────────── */
.mm-save-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: rgba(0,0,0,.32); border: 1px solid #4a4158; border-radius: 6px;
  padding: 14px 16px; margin-bottom: 10px;
  transition: border-color .22s;
}
.mm-save-row:hover { border-color: #9d7cce; }

.mm-save-info { display: flex; flex-direction: column; gap: 5px; }
.mm-save-name {
  font-family: 'Cinzel', serif; font-size: 14px;
  color: #e2d9c8; letter-spacing: 1px;
}
.mm-save-detail { font-size: 11px; color: #9d7cce; font-family: monospace; }
.mm-save-empty { color: #5e5870 !important; font-style: italic; }
.mm-save-actions { display: flex; gap: 8px; flex-shrink: 0; }

/* ── Slot / action buttons ───────────────────────────────────────────────── */
.mm-slot-btn {
  background: transparent;
  border: 1px solid #9d7cce; border-radius: 4px;
  color: #e2d9c8;
  font-family: 'Cinzel', serif; font-size: 12px;
  padding: 7px 18px; cursor: pointer;
  text-transform: uppercase; letter-spacing: 1px;
  transition: background .2s, color .2s, box-shadow .2s;
  white-space: nowrap;
}
.mm-slot-btn:hover {
  background: #9d7cce; color: #fff;
  box-shadow: 0 0 12px rgba(157,124,206,.4);
}
.mm-slot-btn--del {
  border-color: #7a3030; color: #bb7070;
  padding: 7px 12px;
}
.mm-slot-btn--del:hover { background: #7a3030; color: #fff; box-shadow: 0 0 10px rgba(122,48,48,.4); }

/* ── Settings ────────────────────────────────────────────────────────────── */
.mm-setting-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 15px 0; gap: 16px;
  border-bottom: 1px solid rgba(255,255,255,.055);
}
.mm-setting-label {
  font-family: 'Cinzel', serif; font-size: 14px;
  letter-spacing: 1px; color: #e2d9c8;
}
.mm-setting-ctl { display: flex; align-items: center; gap: 11px; }

.mm-slider {
  -webkit-appearance: none; appearance: none;
  width: 150px; height: 4px;
  background: #4a4158; border-radius: 2px; cursor: pointer;
  accent-color: #9d7cce;
}
.mm-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px; height: 16px; border-radius: 50%;
  background: #9d7cce; cursor: pointer;
  box-shadow: 0 0 6px rgba(157,124,206,.5);
}

.mm-setting-val {
  font-family: monospace; font-size: 13px; color: #9d7cce;
  min-width: 38px; text-align: right;
}

/* Toggle switch */
.mm-toggle { position: relative; display: inline-flex; cursor: pointer; }
.mm-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.mm-toggle-track {
  width: 48px; height: 26px;
  background: #26223a; border: 1px solid #4a4158; border-radius: 13px;
  position: relative;
  transition: background .3s, border-color .3s;
}
.mm-toggle input:checked ~ .mm-toggle-track {
  background: #9d7cce; border-color: #9d7cce;
}
.mm-toggle-thumb {
  position: absolute; width: 18px; height: 18px;
  background: #c8bedd; border-radius: 50%;
  top: 3px; left: 3px;
  transition: transform .28s ease, background .28s;
}
.mm-toggle input:checked ~ .mm-toggle-track .mm-toggle-thumb {
  transform: translateX(22px); background: #fff;
}

/* Dev-mode toggle (amber accent instead of purple) */
.mm-setting-divider {
  border-top: 1px solid rgba(204,136,68,.15); margin: 4px 0;
}
.mm-setting-label--dev { color: #cc8844; }
.mm-setting-dev-hint {
  display: block; font-family: monospace; font-size: 9px;
  color: #4a2a10; letter-spacing: 0.5px; margin-top: 3px;
}
.mm-toggle-track--dev { background: #2a1a08; border-color: #5a3a18; }
.mm-toggle input:checked ~ .mm-toggle-track--dev { background: #cc8844; border-color: #cc8844; }

/* World-gen settings section */
.mm-setting-row--section-hdr { padding-bottom: 2px; border-bottom: none; }
.mm-setting-section-title {
  font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 2px;
  color: #7a9d6c; text-transform: uppercase;
}
.mm-setting-ctl--radio { flex-direction: column; align-items: flex-start; gap: 6px; }
.mm-radio-label {
  font-family: 'IM Fell English', Georgia, serif; font-size: 13px; color: #c8bedd;
  cursor: pointer; display: flex; align-items: center; gap: 7px;
}
.mm-radio-label input[type="radio"] { accent-color: #7a9d6c; cursor: pointer; }
.mm-setting-ctl--seed { gap: 8px; }
.mm-text-input {
  background: #1a1628; border: 1px solid #4a4158; border-radius: 4px;
  color: #c8bedd; font-family: monospace; font-size: 13px;
  padding: 4px 8px; width: 110px; outline: none;
}
.mm-text-input:focus { border-color: #7a9d6c; }
.mm-slot-btn--icon {
  padding: 4px 10px; font-size: 16px; line-height: 1;
  background: #1e2a1a; border-color: #3a5a32;
}
.mm-slot-btn--icon:hover { background: #2a3e24; border-color: #7a9d6c; }

/* ── Controls table ──────────────────────────────────────────────────────── */
.mm-controls-table { display: flex; flex-direction: column; gap: 8px; padding: 6px 0; }
.mm-ctrl-row {
  display: flex; align-items: center; gap: 16px;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.04);
}
.mm-kbd {
  display: inline-block; min-width: 138px;
  background: rgba(0,0,0,.4); border: 1px solid #4a4158; border-radius: 4px;
  padding: 4px 10px; text-align: center;
  font-family: monospace; font-size: 13px; color: #bfa5e6;
  flex-shrink: 0;
}
.mm-ctrl-action {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 14px; color: #e2d9c8;
}

/* ── Lore / Book modal ───────────────────────────────────────────────────── */

/* Page-flip keyframes */
@keyframes mm-flip-out-fwd {
  from { opacity:1; transform: perspective(700px) rotateY(0deg)   translateX(0);    }
  to   { opacity:0; transform: perspective(700px) rotateY(-22deg) translateX(-4%);  }
}
@keyframes mm-flip-in-fwd {
  from { opacity:0; transform: perspective(700px) rotateY(22deg)  translateX(4%);   }
  to   { opacity:1; transform: perspective(700px) rotateY(0deg)   translateX(0);    }
}
@keyframes mm-flip-out-back {
  from { opacity:1; transform: perspective(700px) rotateY(0deg)   translateX(0);   }
  to   { opacity:0; transform: perspective(700px) rotateY(22deg)  translateX(4%);  }
}
@keyframes mm-flip-in-back {
  from { opacity:0; transform: perspective(700px) rotateY(-22deg) translateX(-4%); }
  to   { opacity:1; transform: perspective(700px) rotateY(0deg)   translateX(0);   }
}
.mm-flip-out-fwd  { animation: mm-flip-out-fwd  .26s ease forwards; pointer-events:none; }
.mm-flip-in-fwd   { animation: mm-flip-in-fwd   .28s ease forwards; }
.mm-flip-out-back { animation: mm-flip-out-back .26s ease forwards; pointer-events:none; }
.mm-flip-in-back  { animation: mm-flip-in-back  .28s ease forwards; }

/* Book card — parchment look, intentionally different from dark modals */
.mm-book-card {
  position: relative;
  /* Warm parchment with subtle horizontal ruling */
  background: #f0e6ca;
  background-image: repeating-linear-gradient(
    transparent, transparent 27px, rgba(100,65,20,.07) 27px, rgba(100,65,20,.07) 28px
  );
  /* Left = spine (flat), right = page edge (slight curve) */
  border: 2px solid #8b6030;
  border-left: 8px solid #5a3010;
  border-radius: 2px 10px 10px 2px;
  padding: 40px 52px 28px 48px;
  width: 90%; max-width: 720px;
  box-shadow: -6px 0 18px rgba(0,0,0,.35), 6px 0 10px rgba(0,0,0,.15),
              0 24px 60px rgba(0,0,0,.65);
  transform: translateY(18px);
  transition: transform .38s cubic-bezier(.175,.885,.32,1.28);
  display: flex; flex-direction: column;
  max-height: 88vh; overflow: hidden;
}
.mm-modal.mm-modal--open .mm-book-card { transform: translateY(0); }

/* Close button (top-right, low-profile) */
.mm-book-close {
  position: absolute; top: 12px; right: 16px;
  background: transparent; border: none; cursor: pointer;
  color: #8b6030; font-size: 18px; line-height: 1;
  opacity: .55; transition: opacity .2s;
  padding: 4px 8px;
}
.mm-book-close:hover { opacity: 1; }

/* Scrollable page area */
.mm-book-page-wrap {
  flex: 1; overflow-y: auto; min-height: 320px;
  scrollbar-width: thin; scrollbar-color: #c8a878 transparent;
  padding-right: 4px;
}

/* The animated page content div */
.mm-lore-page { padding-bottom: 8px; }

/* Chapter label (small-caps above title) */
.mm-lore-chapter {
  font-family: 'Cinzel', serif;
  font-size: 10px; letter-spacing: 5px; text-transform: uppercase;
  color: #8b4513; margin-bottom: 6px;
}

/* Page title */
.mm-lore-title {
  font-family: 'Cinzel', serif;
  font-size: clamp(17px, 2.4vw, 22px); font-weight: 700;
  color: #2a1204; line-height: 1.25; margin-bottom: 6px;
}

/* Byline / attribution */
.mm-lore-byline {
  font-family: 'IM Fell English', Georgia, serif;
  font-style: italic; font-size: 12px; color: #7a5030;
  margin-bottom: 10px;
}

/* Decorative rule */
.mm-lore-rule {
  height: 1px; margin: 10px 0 16px;
  background: linear-gradient(to right, #8b6030, transparent);
}

/* Body text */
.mm-lore-body { color: #1e1006; font-family: 'IM Fell English', Georgia, serif; }
.mm-lore-body p { font-size: 15px; line-height: 1.85; margin-bottom: 12px; }
.mm-lore-body p:last-child { margin-bottom: 0; }
.mm-lore-body em { font-style: italic; }

/* Drop cap on the first paragraph of each page */
.mm-lore-body p:first-child::first-letter {
  float: left;
  font-family: 'Cinzel', serif; font-size: 3.8em; line-height: .82;
  margin: .05em .14em 0 0;
  color: #5a2d0c;
}

/* Navigation bar */
.mm-book-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 16px; margin-top: 14px;
  border-top: 1px solid rgba(100,65,20,.2);
  flex-shrink: 0;
}

.mm-book-nav-btn {
  background: transparent;
  border: 1px solid #8b6030; border-radius: 3px;
  color: #5a3010; font-family: 'Cinzel', serif;
  font-size: 12px; letter-spacing: 1px; text-transform: uppercase;
  padding: 6px 18px; cursor: pointer;
  transition: background .2s, color .2s, border-color .2s;
}
.mm-book-nav-btn:hover:not(:disabled) { background: #8b6030; color: #f0e6ca; }
.mm-book-nav-btn:disabled { opacity: .3; cursor: default; }

.mm-book-page-num {
  font-family: 'Cinzel', serif; font-size: 12px;
  color: #8b6030; letter-spacing: 2px;
}

/* ── Locked grimoire state ───────────────────────────────────────────────── */
.mm-lore-locked {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 32px 24px 20px;
  text-align: center;
}

/* Wax-seal style emblem */
.mm-grimoire-seal-wrap {
  margin-bottom: 28px;
}
.mm-grimoire-seal-ring {
  width: 108px; height: 108px; border-radius: 50%;
  border: 2px solid rgba(139,96,48,.38);
  display: flex; align-items: center; justify-content: center;
  box-shadow:
    0 0 0 5px rgba(139,96,48,.07),
    inset 0 0 26px rgba(139,96,48,.07);
  position: relative;
  animation: mm-seal-pulse 3.6s ease-in-out infinite;
}
.mm-grimoire-seal-ring::before {
  content: '';
  position: absolute; inset: -10px;
  border-radius: 50%;
  border: 1px dashed rgba(139,96,48,.18);
}
.mm-grimoire-seal-ring::after {
  content: '';
  position: absolute; inset: -18px;
  border-radius: 50%;
  border: 1px dotted rgba(139,96,48,.10);
}
.mm-grimoire-seal-inner {
  width: 72px; height: 72px; border-radius: 50%;
  background: rgba(139,96,48,.055);
  border: 1px dashed rgba(139,96,48,.3);
  display: flex; align-items: center; justify-content: center;
}
.mm-grimoire-seal-glyph {
  font-size: 30px; line-height: 1;
  color: rgba(139,96,48,.45);
  font-family: 'Cinzel', serif;
}

@keyframes mm-seal-pulse {
  0%, 100% { box-shadow: 0 0 0 5px rgba(139,96,48,.07), inset 0 0 26px rgba(139,96,48,.07); }
  50%       { box-shadow: 0 0 0 8px rgba(139,96,48,.12), inset 0 0 34px rgba(139,96,48,.12); }
}

.mm-grimoire-locked-title {
  font-family: 'Cinzel', serif; font-size: 16px; letter-spacing: 2px;
  color: #5a3010; margin-bottom: 4px; font-weight: 700;
}
.mm-grimoire-locked-subtitle {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 13px; font-style: italic; color: #8b6030;
  margin-bottom: 16px; opacity: .7;
}
.mm-grimoire-locked-rule {
  width: 160px; height: 1px;
  background: linear-gradient(to right, transparent, rgba(139,96,48,.4), transparent);
  margin: 0 auto 20px;
}
.mm-grimoire-locked-msg {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 17px; color: #3a1e08;
  margin-bottom: 10px; line-height: 1.5;
}
.mm-grimoire-locked-hint {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 12px; color: #8b6030; opacity: .65;
  letter-spacing: .5px;
}

/* ── Music player ────────────────────────────────────────────────────────── */
.mm-nav-sep {
  width: 1px; height: 28px;
  background: #4a4158;
  align-self: center;
  flex-shrink: 0;
}

.mm-player {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px 6px 10px;
  background: rgba(0,0,0,.28);
  border: 1px solid #4a4158;
  border-radius: 100px;
  width: fit-content;
  max-width: 94vw;
  transition: border-color .25s;
}
.mm-player:hover { border-color: #9d7cce; }

.mm-player-controls {
  display: flex; align-items: center; gap: 2px; flex-shrink: 0;
}

.mm-player-btn {
  background: transparent; border: none; cursor: pointer;
  color: #c8bedd; font-size: 15px; line-height: 1;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  transition: color .2s, background .2s;
  padding: 0;
}
.mm-player-btn:hover { color: #fff; background: rgba(157,124,206,.18); }
.mm-player-btn--active { color: #9d7cce !important; }

.mm-player-info {
  display: flex; flex-direction: column; justify-content: center;
  min-width: 0;
}

.mm-player-track {
  font-family: 'Cinzel', serif;
  font-size: 11px; letter-spacing: .5px;
  color: #e2d9c8; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  max-width: 220px;
}

.mm-player-artist {
  font-family: 'IM Fell English', Georgia, serif;
  font-style: italic; font-size: 10px;
  color: #9d7cce; white-space: nowrap;
}
`;
