import test from 'node:test';
import assert from 'node:assert/strict';
import { deck, seeded, type Card, type Suit } from '../src/cards.js';
import { newGame, move, assertConservation, type Game } from '../src/game.js';
import { classify } from '../src/rules.js';
import { decide, type Difficulty } from '../src/policy.js';
const all = deck();
const c = (rank: number, suit: Suit = 'S') => all.find(x => x.rank === rank && x.suit === suit)!;
const single = (rank: number) => classify([c(rank)], 7).find(p => p.kind === 'single')!;
for (const mode of ['easy', 'standard', 'advanced'] as Difficulty[]) {
  test(mode + ': block next opponent on one card even when partner leads', () => {
    const game: Game = newGame(7, seeded(1), 2, 'partner-threat');
    game.hands = [[c(13), c(4), c(4, 'H'), c(8), c(8, 'H')], [c(10)], [c(3), c(6)], [c(5), c(5, 'H')]];
    const ids = new Set(game.hands.flat().map(x => x.id)); game.played = all.filter(x => !ids.has(x.id)); assertConservation(game);
    move(game, 2, [c(3).id]); move(game, 3, null);
    const decision = decide({ seat: 0, hand: game.hands[0], level: 7, lead: game.last,
      counts: game.hands.map(h => h.length), finished: [], returning: false, difficulty: mode });
    assert.deepEqual(decision.ids, [c(13).id], 'use the high single to interrupt the one-card threat');
    move(game, 0, decision.ids, decision.patternId); assertConservation(game);
    assert.throws(() => move(game, 1, [c(10).id]), /压不过/);
  });
  test(mode + ': partner is respected when next opponent cannot finish this shape', () => {
    const hand = [c(13), c(4), c(4, 'H')];
    const observation = { seat: 0, hand, level: 7, lead: { seat: 2, pattern: single(3) },
      counts: [3, 2, 10, 10], finished: [], returning: false, difficulty: mode };
    assert.equal(decide(observation).ids, null);
    const pair = classify([c(3), c(3, 'H')], 7).find(p => p.kind === 'pair')!;
    assert.equal(decide({ ...observation, lead: { seat: 2, pattern: pair }, counts: [3, 1, 10, 10] }).ids, null);
  });
}
test('a two-card opponent is blocked with a high pair, and finished seats are skipped', () => {
  const hand = [c(13), c(13, 'H'), c(4)];
  const lead = { seat: 2, pattern: classify([c(3), c(3, 'H')], 7).find(p => p.kind === 'pair')! };
  for (const difficulty of ['easy', 'standard', 'advanced'] as Difficulty[])
    assert.deepEqual(new Set(decide({ seat: 0, hand, level: 7, lead, counts: [3, 2, 10, 10], finished: [], returning: false, difficulty }).ids!), new Set([c(13).id, c(13, 'H').id]));
  assert.equal(decide({ seat: 0, hand, level: 7, lead, counts: [3, 0, 10, 2], finished: [1], returning: false }).ids, null,
    'the partner leads again before the distant opponent; do not steal their lead');
});
