#!/usr/bin/env ts-node
/**
 * BotLauncher.ts — CLI entry point for running bot scenarios.
 *
 * Usage:
 *   npx ts-node tests/bot/BotLauncher.ts [options]
 *
 * Options:
 *   --scenario <name>   Scenario to run (default: creative-smoke)
 *   --headed            Show browser window (default: true)
 *   --headless          Run without visible window
 *   --slow-mo <ms>      Delay between actions in ms (default: 300)
 *   --port <n>          Dev server port (default: 5174)
 *   --record            Save video of the run
 *
 * Examples:
 *   npx ts-node tests/bot/BotLauncher.ts --scenario creative-smoke --headed --slow-mo 500
 *   npx ts-node tests/bot/BotLauncher.ts --scenario creative-smoke --headless
 */

import { GameBot }             from './GameBot';
import { BotReporter }         from './BotReporter';
import { creativeSmokeScenario }        from './scenarios/creative-smoke';
import { newGameFlowScenario }          from './scenarios/new-game-flow';
import { overworldScenario }            from './scenarios/overworld';
import { questChainScenario }           from './scenarios/quest-chain';
import { exploreFloorScenario }         from './scenarios/explore-floor';
import { findQuestNpcScenario }         from './scenarios/find-quest-npc';
import { botPlaceForestScenario }       from './scenarios/bot-place-forest';
import { botDesignDungeonRoomScenario } from './scenarios/bot-design-dungeon-room';
import { botRedesignTowerFloorScenario } from './scenarios/bot-redesign-tower-floor';
import { princessCreatorScenario }       from './scenarios/princess-creator';

// ── Scenario registry ─────────────────────────────────────────────────────────
const SCENARIOS: Record<string, (bot: GameBot) => Promise<void>> = {
  'creative-smoke':            creativeSmokeScenario,
  'new-game-flow':             newGameFlowScenario,
  'overworld':                 overworldScenario,
  'quest-chain':               questChainScenario,
  'explore-floor':             exploreFloorScenario,
  'find-quest-npc':            findQuestNpcScenario,
  'bot-place-forest':          botPlaceForestScenario,
  'bot-design-dungeon-room':   botDesignDungeonRoomScenario,
  'bot-redesign-tower-floor':  botRedesignTowerFloorScenario,
  'princess-creator':          princessCreatorScenario,
};

// ── CLI arg parsing ───────────────────────────────────────────────────────────
function parseArgs(): {
  scenario: string;
  headed: boolean;
  slowMo: number;
  port: number;
  record: boolean;
} {
  const args = process.argv.slice(2);
  const get  = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  return {
    scenario: get('--scenario') ?? 'creative-smoke',
    headed:   !has('--headless'),
    slowMo:   parseInt(get('--slow-mo') ?? '300', 10),
    port:     parseInt(get('--port')    ?? '5174', 10),
    record:   has('--record'),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const opts = parseArgs();
  const run  = SCENARIOS[opts.scenario];

  if (!run) {
    console.error(`Unknown scenario: "${opts.scenario}"`);
    console.error(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
    console.error('\nUsage: npm run bot -- --scenario <name> [--headed] [--headless] [--slow-mo <ms>] [--port <n>] [--record]');
    process.exit(1);
  }

  console.log(`\n🤖  Bot Scenario: ${opts.scenario}`);
  console.log(`    headed=${opts.headed}  slowMo=${opts.slowMo}ms  port=${opts.port}\n`);

  const bot = new GameBot({
    headed:  opts.headed,
    slowMo:  opts.slowMo,
    port:    opts.port,
    record:  opts.record,
  });

  await bot.launch();
  const reporter = new BotReporter(opts.scenario);

  try {
    await run(bot);
    reporter.addSteps(bot.steps);
  } catch (err) {
    console.error('\nScenario threw unexpectedly:', err);
  } finally {
    reporter.write();
    const code = bot.summary();
    await bot.close();
    process.exit(code);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
