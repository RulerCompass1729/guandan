import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seeded } from '../src/cards.js';
import { RULE_VERSION, returnable } from '../src/rules.js';
import { newGame, move, assertConservation, advance, prepareTribute, returnCard, type Game, type RoundResult } from '../src/game.js';
import { decide } from '../src/policy.js';

const count = Number(process.argv[2] ?? 1000);
if (!Number.isSafeInteger(count) || count < 1 || count > 10_000) throw new Error('choose 1..10000 rounds');
const start = Date.now(); let moves = 0, maxMoves = 0;
function finish(game: Game): RoundResult {
  if (game.tribute) for (const entry of game.tribute.entries) {
    returnCard(game, entry.receiver, returnable(game.hands[entry.receiver], game.level)[0].id);
    assertConservation(game);
  }
  while (!game.result && game.ply < 2000) {
    const seat = game.turn;
    const choice = decide({ seat, hand: game.hands[seat], level: game.level, lead: game.last,
      counts: game.hands.map(h => h.length), finished: game.finish, returning: false });
    move(game, seat, choice.ids, choice.patternId); assertConservation(game); moves++;
  }
  if (!game.result) throw new Error(`round did not finish: ${game.roundId}`);
  maxMoves = Math.max(maxMoves, game.ply); return game.result;
}
for (let seed = 0; seed < count; seed++) {
  finish(newGame(2 + seed % 13, seeded(seed), seed % 4, `seed-${seed}`));
  if ((seed + 1) % 100 === 0) console.log(JSON.stringify({ completed: seed + 1, total: count, elapsedMs: Date.now() - start }));
}
let levels = [2, 2], active = 0, previous: RoundResult | null = null, winner: number | null = null;
const match: { round: number; level: number; order: number[]; levels: number[]; tribute: string | null }[] = [];
const random = seeded(1729);
for (let round = 1; round <= 100 && winner === null; round++) {
  const g = newGame(levels[active], random, round % 4, `match-${round}`);
  if (previous) prepareTribute(g, previous);
  previous = finish(g);
  const next = advance(levels, g.level, previous); levels = next.levels; winner = next.matchWinner; active = previous.winner;
  match.push({ round, level: g.level, order: previous.order, levels, tribute: g.tribute?.note ?? null });
}
if (winner === null) throw new Error('full match did not pass A');
mkdirSync(resolve('.local'), { recursive: true });
const result = { ruleVersion: RULE_VERSION, runtime: process.version, fixedSeedRounds: count, legalMoves: moves,
  maxMovesInRound: maxMoves, fullMatch: match, matchWinner: winner, elapsedMs: Date.now() - start,
  scope: 'Pure rule/policy simulation, not multiplayer UI or physical phone evidence', passed: true };
writeFileSync(resolve('.local/logic-simulation.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: true, fixedSeedRounds: count, fullMatchRounds: match.length, winner, moves, elapsedMs: result.elapsedMs }));
