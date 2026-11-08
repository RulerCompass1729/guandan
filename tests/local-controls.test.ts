import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/local-game.js';
const call = (input: unknown) => JSON.parse(dispatch(JSON.stringify(input)));
function interleaved() {
  const first = call({ op: 'new', testSeed: 1729 });
  const auto = call({ op: 'action', state: first.state, action: { type: 'auto', expectedVersion: first.state.version, roundId: first.state.game.roundId } });
  const tick = call({ op: 'tick', state: auto.state });
  assert.ok(tick.state.version > auto.state.version);
  return { auto, tick };
}
test('resume requested before an AI tick still takes back the same round', () => {
  const { auto, tick } = interleaved();
  const result = call({ op: 'action', state: tick.state, action: { type: 'resume', expectedVersion: auto.state.version, roundId: auto.state.game.roundId } });
  assert.equal(result.error, undefined); assert.equal(result.state.auto, false);
  assert.deepEqual(result.state.game.hands, tick.state.game.hands);
});
test('stale ordinary card actions remain rejected after an AI tick', () => {
  const { auto, tick } = interleaved();
  for (const type of ['play', 'pass', 'return', 'next'])
    assert.equal(call({ op: 'action', state: tick.state, action: { type, expectedVersion: auto.state.version, roundId: auto.state.game.roundId } }).code, 'STALE');
});
test('control retry cannot cross rounds, use a future version, or omit stale binding', () => {
  const { auto, tick } = interleaved();
  for (const action of [
    { type: 'resume', expectedVersion: tick.state.version, roundId: 'different-round' },
    { type: 'resume', expectedVersion: tick.state.version + 1, roundId: tick.state.game.roundId },
    { type: 'resume', expectedVersion: auto.state.version },
  ]) assert.equal(call({ op: 'action', state: tick.state, action }).code, 'STALE');
});
