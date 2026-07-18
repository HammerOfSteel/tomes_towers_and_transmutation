/**
 * NPCDialogue — generates contextual dialogue for world NPCs.
 *
 * Template strings pull from world data (settlement name, nearby dungeons,
 * river direction, faction history events) to make each NPC feel grounded
 * in the actual generated world.
 */

import { mulberry32 }             from '@/core/prng';
import type { NPCRole }           from './NPCDnaGenerator';
import type { HistoryEvent }      from './WorldHistory';

// ── Context passed to dialogue generation ─────────────────────────────────────

export interface DialogueContext {
  npcName:             string;
  npcRole:             NPCRole;
  settlementName:      string;
  settlementType:      'village' | 'town' | 'city';
  /** Cardinal direction of the nearest river, if any. */
  nearestRiverDir?:    'north' | 'south' | 'east' | 'west';
  /** Name of the nearest dungeon the player hasn't cleared. */
  nearestDungeonName?: string;
  nearestDungeonDir?:  'north' | 'south' | 'east' | 'west';
  /** Recent history events near this NPC (radius ~60 tiles). */
  nearbyEvents?:       HistoryEvent[];
}

// ── Template banks ────────────────────────────────────────────────────────────

type Templates = Record<NPCRole, string[][]>;  // [greeting lines][]]

const GREETINGS: Templates = {
  merchant: [
    ['{name}? Just a humble trader. {settlement} may be small but we get good traffic.',
     'Finest wares this side of the {dir_dungeon} ruins, if you\'re interested.'],
    ['I\'ve been running goods through {settlement} for years.',
     'The road to the {dungeon} is dangerous lately — bad for business.'],
    ['Welcome, wanderer! {settlement} doesn\'t see many unfamiliar faces.',
     'My caravan comes through here every fortnight. Good place to restock.'],
  ],
  guard:  [
    ['Move along. {settlement} has enough trouble without strangers lurking.',
     'Heard something stirring in {dungeon} to the {dir_dungeon}. Stay sharp.'],
    ['You there! State your purpose in {settlement}.',
     'We\'ve had {event} lately. Keep your weapons sheathed.'],
    ['This is {settlement}. We keep the peace here — don\'t make me regret saying that.'],
  ],
  citizen: [
    ['Oh! A visitor. We don\'t get many travellers this far {dir_river}.',
     'Have you come from beyond the {river} lands?'],
    ['A good day to you! {settlement} is a quiet place — mostly.',
     'There\'s been talk of strange things {dir_dungeon} of here.'],
    ['Good day, stranger. I was just on my way to the market.',
     '{settlement} isn\'t much but it\'s home.'],
  ],
  scholar: [
    ['Fascinating. A new arrival. I am cataloguing local {event_type}.',
     'The {dungeon} to the {dir_dungeon} shows signs of ancient activity — quite remarkable.'],
    ['Ah, a traveller! Tell me — have you noticed any anomalies {dir_river}?',
     'My research into {settlement}\'s history has uncovered disturbing patterns.'],
    ['You arrive at an opportune moment. I\'ve been seeking a messenger.',
     'There is knowledge buried in {dungeon} that mustn\'t remain hidden.'],
  ],
  innkeeper: [
    ['Welcome to {settlement}! Room and board — best deal this side of {dir_dungeon}.',
     'Been a quiet week. The {event} spooked most travellers away.'],
    ['Come in, come in! The hearth is warm and the stew is hot.',
     'I hear the roads {dir_dungeon} are dangerous right now.'],
    ['You look weary, friend. {settlement}\'s inn is just what you need.',
     'Last guest through here had tales of the {dungeon}. Sounded grim.'],
  ],
  blacksmith: [
    ['Need your blade sharpened? I\'ve been the smith in {settlement} for twenty years.',
     'Iron\'s scarce since the {event} blocked the trade roads.'],
    ['Aye? What can I forge for you? {settlement} doesn\'t have the fanciest shop but I\'m good.',
     'If you\'re heading to {dungeon}, get your gear checked first.'],
    ['Weapons, armour, tools — you name it. I\'ve got coal and iron, that\'s enough.',
     '{settlement} folk know to come to me before any expedition {dir_dungeon}.'],
  ],
  // C1: Quest-giver archetypes
  quest_giver: [
    ['Name\'s {name}. Wandering merchant by trade, information broker by necessity.',
     '{settlement} sits on a crossroads — I hear everything that moves through here.',
     'And something has been moving from {dungeon}.'],
    ['I\'ve seen a lot of strange things on the road.',
     'What\'s coming out of {dungeon} to the {dir_dungeon} is stranger than most.',
     'I have coin for someone willing to take a closer look.'],
    ['You look capable. I\'ve been waiting for someone capable.',
     '{settlement} won\'t talk about it but I will — there is something in {dungeon}.'],
  ],
  settlement_elder: [
    ['Welcome to {settlement}. I am {name}, elder here for thirty years.',
     'These lands were peaceful once. The {dungeon} was quiet.',
     'It is not quiet anymore.'],
    ['You arrive at a troubled time, stranger.',
     '{settlement} has faced {event} and we are not as strong as we were.',
     'Perhaps you are what we\'ve been waiting for.'],
  ],
  mysterious: [
    ['...You found me. Not many do.',
     'The ruins here hold answers. Also questions. Mostly questions.',
     'But I know which ones are worth asking.'],
    ['I have been here since before {settlement} had its current name.',
     'The {dungeon} to the {dir_dungeon} — I know what sleeps there.',
     'I will tell you, if you wish to know.'],
  ],
};

const QUEST_HINTS: Templates = {
  merchant: [
    ['I\'d pay well if someone could clear the path to {dungeon}.',
     'My next shipment is overdue — something is blocking the {dir_dungeon} road.'],
    ['There\'s profit for whoever clears out {dungeon}.',
     'Trade between {settlement} and the next town has dried up since {event}.'],
  ],
  guard: [
    ['I can\'t leave my post but {dungeon} needs someone to deal with what\'s inside.',
     'If you\'re heading {dir_dungeon}, keep your eyes open.'],
    ['The {dungeon} keeps sending things our way.',
     'We\'d rest easier if someone with your look dealt with it.'],
  ],
  citizen: [
    ['My cousin ventured toward {dungeon} last month and never came back.',
     'I just want to know what happened.'],
    ['The elders say {dungeon} was sealed for good reason.',
     'But something has been opening it back up.'],
  ],
  scholar: [
    ['I need a relic from {dungeon} to complete my research.',
     'It\'s the only way to understand the {event_type} we\'ve been witnessing.'],
    ['The {dungeon} holds records from before {settlement} was founded.',
     'Retrieve them and I can explain everything.'],
  ],
  innkeeper: [
    ['My supplier vanished somewhere between here and {dungeon}.',
     'If you find any trace of them, I\'d be grateful.'],
    ['A group of adventurers stopped here on their way to {dungeon}.',
     'None of them have come back. It\'s been weeks.'],
  ],
  blacksmith: [
    ['I left a special ore deposit {dir_dungeon} — in the hills near {dungeon}.',
     'Bring me a load and I\'ll make it worth your while.'],
    ['Those creatures from {dungeon} have been taking tools.',
     'Get them back and I\'ll outfit you for free.'],
  ],
  // C1: Quest-giver archetypes
  quest_giver: [
    ['I\'ve been travelling these roads for years. {settlement} is a good rest stop.',
     'But I\'ve heard things about {dungeon} that would make your hair stand on end.',
     'I\'d make it worth someone\'s while to look into it.'],
    ['Word travels fast on the merchant roads.',
     'Something unusual is coming out of {dungeon} to the {dir_dungeon}.',
     'I have a proposition for anyone with the courage to find out what.'],
  ],
  settlement_elder: [
    ['{settlement} has stood here for generations. We\'ve seen things come and go.',
     'But what stirs in {dungeon} now is different from anything in our records.',
     'I have been waiting for someone like you.'],
    ['The old ways say that when the {dungeon} wakes, a wanderer will come.',
     'You arrived at the right moment. We have need of you.'],
  ],
  mysterious: [
    ['...', 'I wondered when someone would come this way.',
     'The ruins remember things the living have forgotten.'],
    ['You found me. That means you were meant to.',
     'There is something in {dungeon} that should not remain buried.',
     'But I cannot retrieve it myself.'],
  ],
};

// ── Substitution helpers ──────────────────────────────────────────────────────

function fill(template: string, ctx: DialogueContext): string {
  const recentEvent = ctx.nearbyEvents?.find(e =>
    e.type === 'faction_raid' || e.type === 'monster_sighting' || e.type === 'magical_anomaly'
  );
  return template
    .replace('{name}',        ctx.npcName)
    .replace('{settlement}',  ctx.settlementName)
    .replace('{dungeon}',     ctx.nearestDungeonName ?? 'the old ruins')
    .replace('{dir_dungeon}', ctx.nearestDungeonDir ?? 'north')
    .replace('{dir_river}',   ctx.nearestRiverDir   ?? 'east')
    .replace('{river}',       ctx.nearestRiverDir ? `${ctx.nearestRiverDir}ern` : 'distant')
    .replace('{event}',       recentEvent?.description ?? 'strange happenings')
    .replace('{event_type}',  recentEvent?.type?.replace(/_/g, ' ') ?? 'anomalies');
}

// ── Public API ────────────────────────────────────────────────────────────────

/** 2–3 lines of greeting dialogue for the given NPC/world context. */
export function generateGreeting(ctx: DialogueContext, seed: number): string {
  const rand = mulberry32(seed ^ 0xA0_B1_C2);
  const banks  = GREETINGS[ctx.npcRole];
  const lines  = banks[Math.floor(rand() * banks.length)]!;
  return lines.map(l => fill(l, ctx)).join(' ');
}

/** 1–2 lines of quest-hint dialogue. */
export function generateQuestHint(ctx: DialogueContext, seed: number): string {
  if (!ctx.nearestDungeonName) return '';
  const rand  = mulberry32(seed ^ 0xD3_E4_F5);
  const banks = QUEST_HINTS[ctx.npcRole];
  const lines = banks[Math.floor(rand() * banks.length)]!;
  return lines.map(l => fill(l, ctx)).join(' ');
}
