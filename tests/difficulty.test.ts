import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, move, assertConservation } from '../src/game.js';
import { seeded } from '../src/cards.js';
import { decide, difficulty, type Difficulty } from '../src/policy.js';
import { dispatch } from '../src/local-game.js';

test('three policies finish legal full rounds without changing their own observation', () => {
  const choices = new Map<string, string>();
  for (const mode of ['easy', 'standard', 'advanced'] as Difficulty[]) {
    for (let seed = 60; seed < 63; seed++) {
      const game = newGame(2 + seed % 13, seeded(seed), seed % 4, 'difficulty-' + seed);
      while (!game.result && game.ply < 2000) {
        const seat = game.turn;
        const observation = { seat, hand: structuredClone(game.hands[seat]), level: game.level,
          lead: game.last, counts: game.hands.map(h => h.length), finished: game.finish,
          returning: false, difficulty: mode };
        const before = structuredClone(observation), choice = decide(observation);
        assert.deepEqual(observation, before);
        if (game.ply === 0 && seed === 60) choices.set(mode, JSON.stringify(choice));
        move(game, seat, choice.ids, choice.patternId); assertConservation(game);
      }
      assert.ok(game.result, mode + ' round must finish');
    }
  }
  assert.equal(new Set(choices.values()).size, 3, 'difficulty changes actual choices on the same opening hand');
});
test('older practice states and missing difficulty keep standard; explicit new values are validated', () => {
  const call = (value: unknown) => JSON.parse(dispatch(JSON.stringify(value)));
  const initial = call({ op: 'new', name: '练习牌友', testSeed: 60 });
  assert.equal(initial.view.difficulty, 'standard');
  delete initial.state.difficulty;
  const restored = call({ op: 'view', state: initial.state });
  assert.equal(restored.view.difficulty, 'standard');
  for (const mode of ['easy', 'standard', 'advanced']) {
    const created = call({ op: 'new', testSeed: 60, difficulty: mode });
    assert.equal(call({ op: 'view', state: created.state }).view.difficulty, mode);
    const invalid = call({ op: 'action', state: created.state, action: {
      type: 'difficulty', difficulty: 'easy', expectedVersion: created.view.version } });
    assert.equal(invalid.code, 'PHASE', 'no changing a live round');
  }
  assert.equal(call({ op: 'new', difficulty: 'cheat' }).code, 'INPUT');
  assert.equal(difficulty(undefined), 'standard');
});
