import test from 'node:test';
import assert from 'node:assert/strict';
import { type Card, type Suit, deck, seeded, wild } from '../src/cards.js';
import { beats, classify, legalPlays, returnable } from '../src/rules.js';
import { advance, assertConservation, move, newGame, prepareTribute, returnCard, type Game } from '../src/game.js';
import { decide } from '../src/policy.js';

const cards = deck();
const c = (rank: number, suit: Suit = 'S', copy = 0): Card => cards.filter(x => x.rank === rank && x.suit === (rank >= 16 ? 'J' : suit))[copy];
const p = (hand: Card[], kind: string, level = 7) => {
  const found = classify(hand, level).find(x => x.kind === kind);
  assert.ok(found, `expected ${kind}`); return found;
};
function ending(hands: Card[][], turn = 0): Game {
  const g = newGame(7, seeded(1), turn, 'end-fixture');
  g.hands = hands; const held = new Set(hands.flat().map(x => x.id)); g.played = cards.filter(x => !held.has(x.id));
  assertConservation(g); return g;
}
function arranged(required: Card[][]): Game {
  const g = newGame(7, seeded(2), 0, 'tribute-fixture');
  const used = new Set(required.flat().map(x => x.id));
  assert.equal(used.size, required.flat().length);
  const rest = cards.filter(x => !used.has(x.id));
  g.hands = required.map(h => [...h]);
  for (const hand of g.hands) while (hand.length < 27) hand.push(rest.shift()!);
  assertConservation(g); return g;
}

test('old regression: equal level singles never compare suits', () => {
  const a = p([c(7, 'S')], 'single'), b = p([c(7, 'D')], 'single');
  assert.equal(a.high, b.high); assert.equal(beats(a, b), false); assert.equal(beats(b, a), false);
  assert.ok(beats(p([c(16)], 'single'), a));
});
test('old regression: A2345 is lower than 23456; no wraparound', () => {
  const low = p([c(14), c(2, 'H'), c(3), c(4), c(5)], 'straight');
  const next = p([c(2), c(3, 'H'), c(4), c(5), c(6)], 'straight');
  assert.equal(low.high, 5); assert.equal(next.high, 6); assert.ok(beats(next, low));
  assert.equal(classify([c(13), c(14, 'H'), c(2), c(3), c(4)], 7).length, 0);
});
test('old regression: hints enumerate straight flush against a four-card bomb', () => {
  const bomb = p([c(8), c(8, 'H'), c(8, 'C'), c(8, 'D')], 'bomb');
  const flush = [c(3, 'C'), c(4, 'C'), c(5, 'C'), c(6, 'C'), c(7, 'C')];
  assert.ok(legalPlays(flush, 7, bomb).some(x => x.pattern.kind === 'straightflush'));
});
test('independent hierarchy: four bomb < five bomb < straight flush < six bomb < four jokers', () => {
  const rank8 = cards.filter(x => x.rank === 8);
  const chain = [p(rank8.slice(0, 4), 'bomb'), p(rank8.slice(0, 5), 'bomb'),
    p([3, 4, 5, 6, 7].map(r => c(r, 'C')), 'straightflush'), p(rank8.slice(0, 6), 'bomb'),
    p(cards.filter(x => x.rank >= 16), 'rocket')];
  for (let i = 1; i < chain.length; i++) { assert.ok(beats(chain[i], chain[i - 1])); assert.equal(beats(chain[i - 1], chain[i]), false); }
});
test('wild cards make ten-card bombs but cannot replace a joker', () => {
  const ten = [...cards.filter(x => x.rank === 8), c(7, 'H'), c(7, 'H', 1)];
  assert.equal(p(ten, 'bomb').count, 10);
  assert.equal(classify([c(16), c(7, 'H')], 7).some(x => x.kind === 'pair' && x.high === 16), false);
  assert.ok(p([c(9), c(7, 'H')], 'pair'));
  assert.equal(classify([c(8), c(8)], 7).length, 0);
});
test('low Ace pairs and steel; full house compares only triple', () => {
  const pairs = p([c(14), c(14, 'D'), c(2), c(2, 'D'), c(3), c(3, 'D')], 'pairs');
  assert.equal(pairs.high, 3);
  const steel = p([c(14), c(14, 'D'), c(14, 'C'), c(2), c(2, 'D'), c(2, 'C')], 'steel');
  assert.equal(steel.high, 2);
  const a = p([c(5), c(5, 'H'), c(5, 'C'), c(13), c(13, 'H')], 'fullhouse');
  const b = p([c(5), c(5, 'H'), c(5, 'C'), c(2), c(2, 'H')], 'fullhouse');
  assert.equal(beats(a, b), false); assert.equal(beats(b, a), false);
});
test('red level substitutes missing sequence rank and suit', () => {
  const hand = [c(3, 'C'), c(4, 'C'), c(6, 'C'), c(7, 'C'), c(7, 'H')];
  const flush = p(hand, 'straightflush');
  assert.deepEqual(flush.substitutions, [{ id: c(7, 'H').id, rank: 5, suit: 'C' }]);
});
test('finished leader borrows wind only after all remaining opponents pass', () => {
  const g = ending([[c(3)], [c(4)], [c(5)], [c(6)]]);
  move(g, 0, [c(3).id]); assert.equal(g.turn, 1);
  move(g, 1, null); move(g, 2, null); assert.ok(g.last); assert.equal(g.turn, 3);
  move(g, 3, null); assert.equal(g.turn, 2); assert.equal(g.last, null); assertConservation(g);
});
test('double-up ends immediately, no third player needs to finish', () => {
  const g = ending([[c(3)], [c(4), c(5)], [c(6)], [c(8), c(9)]]);
  move(g, 0, [c(3).id]); move(g, 1, null); move(g, 2, [c(6).id]);
  assert.ok(g.result?.doubleDown); assert.equal(g.result.upgrade, 3); assert.deepEqual(g.result.order.slice(0, 2), [0, 2]); assertConservation(g);
});
test('A must actually be played; first-and-last does not pass A', () => {
  const double = { order: [0, 2, 1, 3], winner: 0, upgrade: 3, doubleDown: true };
  assert.deepEqual(advance([12, 8], 12, double), { levels: [14, 8], matchWinner: null });
  assert.equal(advance([14, 8], 14, { ...double, upgrade: 2 }).matchWinner, 0);
  assert.equal(advance([14, 8], 14, { ...double, order: [0, 1, 3, 2], upgrade: 1 }).matchWinner, null);
  assert.equal(advance([14, 8], 8, double).matchWinner, null);
});
test('single tribute: only giver counts for anti-tribute', () => {
  const g = arranged([[c(16)], [c(17)], [c(16, 'J', 1)], [c(17, 'J', 1)]]);
  const t = prepareTribute(g, { order: [0, 1, 2, 3], winner: 0, upgrade: 2, doubleDown: false });
  assert.equal(t.entries.length, 1); assert.equal(t.entries[0].giver, 3); assert.equal(t.entries[0].card.rank, 17); assert.equal(t.leader, 3);
  returnCard(g, 0, returnable(g.hands[0], g.level)[0].id);
  assert.deepEqual(g.hands.map(h => h.length), [27, 27, 27, 27]); assertConservation(g);
});
test('double tribute larger goes to first; equal goes clockwise; anti-tribute', () => {
  const result = { order: [0, 2, 1, 3], winner: 0, upgrade: 3, doubleDown: true };
  const g = arranged([[c(17)], [c(16)], [c(17, 'J', 1)], [c(16, 'J', 1)]]);
  const t = prepareTribute(g, result);
  assert.equal(t.entries[0].giver, 1); assert.equal(t.entries[0].receiver, 0); assert.equal(t.leader, 1);
  for (const entry of t.entries) returnCard(g, entry.receiver, returnable(g.hands[entry.receiver], g.level)[0].id);
  assert.deepEqual(g.hands.map(h => h.length), [27, 27, 27, 27]); assertConservation(g);
  const anti = arranged([[c(16)], [c(17)], [c(16, 'J', 1)], [c(17, 'J', 1)]]);
  assert.equal(prepareTribute(anti, result).entries.length, 0); assert.equal(anti.turn, 0);
});
test('return restrictions use promoted level value, and all-high fallback chooses minimum', () => {
  assert.deepEqual(returnable([c(7), c(8), c(13)], 7).map(x => x.id), [c(8).id]);
  assert.deepEqual(returnable([c(11), c(13), c(14), c(7)], 7).map(x => x.id), [c(11).id]);
});
test('AI only takes observation; changing hidden state leaves decision identical', () => {
  const g = newGame(7, seeded(24), 0, 'fairness');
  const obs = { seat: 0, hand: g.hands[0], level: 7, lead: null, counts: [27, 27, 27, 27], finished: [], returning: false };
  const first = decide(structuredClone(obs));
  [g.hands[1], g.hands[3]] = [g.hands[3], g.hands[1]];
  assert.deepEqual(decide(structuredClone(obs)), first);
  assert.ok(first.ids?.length); assert.ok(first.ids?.every(id => g.hands[0].some(c => c.id === id)));
});
test('seeded complete games conserve cards and every policy action is legal', () => {
  for (let seed = 0; seed < 12; seed++) {
    const g = newGame(2 + seed % 13, seeded(seed), seed % 4, `seed-${seed}`);
    while (!g.result && g.ply < 2000) {
      const seat = g.turn;
      const decision = decide({ seat, hand: g.hands[seat], level: g.level, lead: g.last, counts: g.hands.map(h => h.length), finished: g.finish, returning: false });
      move(g, seat, decision.ids, decision.patternId); assertConservation(g);
    }
    assert.ok(g.result, `game must finish, seed ${seed}`);
    assert.equal(g.hands.flat().some(x => wild(x, g.level) && x.suit !== 'H'), false);
  }
});
