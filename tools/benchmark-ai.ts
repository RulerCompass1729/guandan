/** Paired deals, swapped teams. A repeatable comparison, not a human skill rating. */
import { seeded } from '../src/cards.js';
import { newGame, move, assertConservation } from '../src/game.js';
import { decide, isDifficulty, type Difficulty } from '../src/policy.js';

const [left = 'advanced', right = 'standard', count = '40', offset = '10000'] = process.argv.slice(2);
if (!isDifficulty(left) || !isDifficulty(right)) throw new Error('use easy, standard or advanced');
const pairs = Number(count), firstSeed = Number(offset);
if (!Number.isInteger(pairs) || pairs < 1 || pairs > 1000 || !Number.isSafeInteger(firstSeed)) throw new Error('invalid bounded seed range');
const wins: Record<string, number> = { [left]: 0, [right]: 0 };
const timings: Record<string, { calls: number; ms: number; maxMs: number }> = {};
const details = [];
for (let seed = firstSeed; seed < firstSeed + pairs; seed++) {
  for (let swap = 0; swap < 2; swap++) {
    const game = newGame(2 + seed % 13, seeded(seed), seed % 4, 'paired-' + seed);
    const modes: Difficulty[] = swap ? [right, left] : [left, right];
    while (!game.result && game.ply < 2000) {
      const seat = game.turn, mode = modes[seat % 2], start = performance.now();
      const result = decide({ seat, hand: game.hands[seat], level: game.level,
        lead: game.last, counts: game.hands.map(h => h.length), finished: game.finish,
        returning: false, difficulty: mode });
      const ms = performance.now() - start, timing = timings[mode] ??= { calls: 0, ms: 0, maxMs: 0 };
      timing.calls++; timing.ms += ms; timing.maxMs = Math.max(timing.maxMs, ms);
      move(game, seat, result.ids, result.patternId); assertConservation(game);
    }
    if (!game.result) throw new Error('round failed to finish: ' + seed);
    const winner = modes[game.result.winner]; wins[winner]++;
    details.push({ seed, swap, winner, ply: game.ply });
  }
}
console.log(JSON.stringify({ left, right, pairedDeals: pairs, rounds: pairs * 2, firstSeed,
  wins, timings, details }, null, 2));
