import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { WebSocket } from 'ws';
import { createApp, type AppOptions } from '../src/server.js';
import { decide, type Observation, type Decision } from '../src/policy.js';
import type { View, Action } from '../src/model.js';

const token = () => randomBytes(32).toString('hex');
const pause = (ms: number) => new Promise<void>(ok => setTimeout(ok, ms));
async function until(check: () => boolean | Promise<boolean>, timeout = 5000): Promise<void> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await pause(10); }
  throw new Error('condition timed out');
}
async function setup(t: TestContext, options: AppOptions = {}) {
  mkdirSync(resolve('.local/server-tests'), { recursive: true });
  const directory = mkdtempSync(resolve('.local/server-tests/run-'));
  const app = createApp({ dbPath: join(directory, 'state.sqlite'), port: 0, botDelay: 2, disconnectGrace: 60_000, firstSeat: () => 0, ...options });
  const port = await app.listen(), base = `http://127.0.0.1:${port}`;
  let closed = false;
  t.after(async () => { if (!closed) await app.close(); });
  const call = async (path: string, credential: string, data?: unknown) => {
    const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + credential, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, data: await response.json() };
  };
  const session = async (credential: string): Promise<View> => {
    const response = await call('/api/session', credential); assert.equal(response.status, 200); return response.data.view;
  };
  const act = async (credential: string, type: Action['type'], extra: Partial<Action> = {}) => {
    const v = await session(credential);
    return call(`/api/rooms/${v.code}/action`, credential, { type, actionId: randomUUID(), expectedVersion: v.version, roundId: v.roundId, ...extra });
  };
  const create = async (credential: string): Promise<View> => {
    const r = await call('/api/rooms', credential, { name: '测试牌友' }); assert.equal(r.status, 200); return r.data.view;
  };
  return { app, port, base, call, act, session, create, directory,
    close: async () => { await app.close(); closed = true; } };
}

test('four HTTP identities share public progress and have disjoint private hands; fifth rejected', async t => {
  const env = await setup(t), tokens = [token(), token(), token(), token(), token()];
  const initial = await env.create(tokens[0]);
  for (let i = 1; i < 4; i++) assert.equal((await env.call(`/api/rooms/${initial.code}/join`, tokens[i], { name: `牌友${i}` })).status, 200);
  assert.equal((await env.call(`/api/rooms/${initial.code}/join`, tokens[4], { name: '第五人' })).status, 409);
  assert.equal((await env.act(tokens[0], 'start')).status, 200);
  const states = await Promise.all(tokens.slice(0, 4).map(env.session));
  assert.equal(new Set(states.map(v => v.roundId)).size, 1);
  assert.equal(new Set(states.map(v => v.version)).size, 1);
  assert.equal(new Set(states.flatMap(v => v.hand.map(c => c.id))).size, 108);
  for (const v of states) { assert.equal(v.hand.length, 27); assert.equal('hands' in v, false); assert.equal(JSON.stringify(v).includes('tokenHash'), false); }
  const moved = await env.act(tokens[0], 'play', { ids: [states[0].hand[0].id] });
  assert.equal(moved.status, 200);
  const next = await Promise.all(tokens.slice(0, 4).map(env.session));
  assert.ok(next.every(v => v.turn === 1 && v.version === next[0].version));
  assert.equal(next[0].hand.length, 26); assert.equal(next[1].hand.length, 27);
});
test('concurrent requests for the final seat admit exactly one player', async t => {
  const env = await setup(t), tokens = Array.from({ length: 5 }, token);
  const room = await env.create(tokens[0]);
  for (const credential of tokens.slice(1, 3)) assert.equal((await env.call(`/api/rooms/${room.code}/join`, credential, {})).status, 200);
  const contenders = tokens.slice(3);
  const results = await Promise.all(contenders.map(credential => env.call(`/api/rooms/${room.code}/join`, credential, {})));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const winner = contenders[results.findIndex(r => r.status === 200)];
  const loser = contenders[results.findIndex(r => r.status === 409)];
  assert.ok(results.find(r => r.status === 409)!.data.error.length > 0);
  assert.equal((await env.call('/api/session', loser)).status, 401);
  const states = await Promise.all([...tokens.slice(0, 3), winner].map(env.session));
  assert.equal(new Set(states.map(v => v.self)).size, 4);
  assert.ok(states.every(v => v.seats.filter(s => s.kind === 'human').length === 4));
  assert.equal((await env.act(tokens[0], 'start')).status, 200);
});
test('two live rooms keep human actions, AI workers and private sessions separate', async t => {
  const trace: Record<string, unknown>[] = [];
  const env = await setup(t, { audit: event => trace.push(event) }), a = token(), b = token();
  const roomA = await env.create(a), roomB = await env.create(b);
  assert.notEqual(roomA.code, roomB.code);
  assert.equal((await env.act(a, 'start')).status, 200);
  assert.equal((await env.act(b, 'start')).status, 200);
  const beforeA = await env.session(a), beforeB = await env.session(b);
  assert.equal((await env.act(a, 'play', { ids: [beforeA.hand[0].id] })).status, 200);
  await until(async () => (await env.session(a)).turn === 0 && trace.some(e => e.type === 'ai_accepted' && e.room === roomA.code));
  const stableA = await env.session(a);
  const unchangedB = await env.session(b);
  assert.deepEqual(unchangedB.hand, beforeB.hand); assert.equal(unchangedB.version, beforeB.version);
  assert.equal(unchangedB.roundId, beforeB.roundId); assert.equal(unchangedB.turn, 0);
  assert.equal((await env.act(b, 'play', { ids: [beforeB.hand[0].id] })).status, 200);
  await until(async () => (await env.session(b)).turn === 0 && trace.some(e => e.type === 'ai_accepted' && e.room === roomB.code));
  const unchangedA = await env.session(a);
  assert.deepEqual(unchangedA.hand, stableA.hand); assert.equal(unchangedA.version, stableA.version);
  assert.equal(unchangedA.roundId, stableA.roundId);
  const foreign = await env.call(`/api/rooms/${roomB.code}/action`, a, {
    type: 'resume', actionId: randomUUID(), expectedVersion: (await env.session(b)).version
  });
  assert.equal(foreign.status, 401);
  assert.ok(trace.some(e => e.type === 'ai_input' && e.room === roomA.code));
  assert.ok(trace.some(e => e.type === 'ai_input' && e.room === roomB.code));
});
test('action receipt persists across server restart; retries cannot play twice', async t => {
  const env = await setup(t), tokens = [token(), token(), token(), token()];
  const first = await env.create(tokens[0]);
  for (const credential of tokens.slice(1)) await env.call(`/api/rooms/${first.code}/join`, credential, {});
  await env.act(tokens[0], 'start'); const before = await env.session(tokens[0]);
  const action: Action = { type: 'play', actionId: randomUUID(), expectedVersion: before.version, roundId: before.roundId, ids: [before.hand[0].id] };
  const a = await env.call(`/api/rooms/${before.code}/action`, tokens[0], action);
  const b = await env.call(`/api/rooms/${before.code}/action`, tokens[0], action);
  assert.equal(a.status, 200); assert.equal(b.data.duplicate, true); assert.equal(a.data.view.version, b.data.view.version);
  const snapshot = a.data.view;
  await env.close();
  const restored = createApp({ dbPath: join(env.directory, 'state.sqlite'), port: 0, disconnectGrace: 60_000 });
  const port = await restored.listen(); t.after(() => restored.close());
  const response = await fetch(`http://127.0.0.1:${port}/api/session`, { headers: { Authorization: 'Bearer ' + tokens[0] } });
  const after = (await response.json()).view;
  assert.deepEqual(after.hand, snapshot.hand); assert.equal(after.roundId, snapshot.roundId); assert.equal(after.version, snapshot.version);
  const retry = await fetch(`http://127.0.0.1:${port}/api/rooms/${before.code}/action`, { method: 'POST', headers: { Authorization: 'Bearer ' + tokens[0], 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
  const result = await retry.json(); assert.equal(result.duplicate, true); assert.equal(result.view.hand.length, 26);
});
test('invalid/stale/cross-room requests do not alter a hand; production has no test entry', async t => {
  const env = await setup(t), a = token(), b = token();
  const va = await env.create(a), vb = await env.create(b);
  assert.equal((await env.call(`/api/rooms/${vb.code}/action`, a, { type: 'start', actionId: randomUUID(), expectedVersion: vb.version })).status, 401);
  const stale = await env.call(`/api/rooms/${va.code}/action`, a, { type: 'start', actionId: randomUUID(), expectedVersion: 999 });
  assert.equal(stale.status, 409); assert.equal((await env.session(a)).stage, 'waiting');
  const malformed = await env.call(`/api/rooms/${va.code}/action`, a, { type: 'play', actionId: randomUUID(), expectedVersion: va.version, ids: [999] });
  assert.equal(malformed.status, 400);
  assert.equal((await fetch(env.base + '/__test/rooms/' + va.code)).status, 404);
  const foreign = await fetch(env.base + '/api/rooms', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', Origin: 'https://unrelated.invalid' }, body: '{}' });
  assert.equal(foreign.status, 403);
});
test('AI uses actual worker and accepted actions match restricted observations', async t => {
  const trace: Record<string, unknown>[] = [];
  const env = await setup(t, { firstSeat: () => 1, audit: event => trace.push(event) });
  const credential = token(); await env.create(credential); await env.act(credential, 'start');
  await until(() => trace.some(e => e.type === 'ai_accepted'));
  const input = trace.find(e => e.type === 'ai_input')!;
  const obs = input.observation as Observation;
  assert.deepEqual(Object.keys(obs).sort(), ['counts', 'difficulty', 'finished', 'hand', 'lead', 'level', 'returning', 'seat']);
  assert.equal(obs.difficulty, 'standard');
  assert.equal(obs.hand.length, 27); assert.equal('hands' in obs, false);
  const accepted = trace.find(e => e.type === 'ai_accepted')!;
  assert.equal(accepted.inputVersion, input.version); assert.equal(accepted.seat, input.seat);
  const decision = accepted.decision as Decision;
  assert.ok(decision.ids?.every(id => obs.hand.some(c => c.id === id)));
  assert.ok((await env.session(credential)).seats.some(s => s.kind === 'ai' && s.count < 27));
});
test('host difficulty is shared, durable and receipt-bound; guests and live-round changes are rejected', async t => {
  const env = await setup(t), host = token(), guest = token();
  const created = await env.create(host);
  assert.equal(created.difficulty, 'standard');
  await env.call(`/api/rooms/${created.code}/join`, guest, { name: '亲友' });
  assert.equal((await env.act(guest, 'difficulty', { difficulty: 'advanced' })).status, 400);
  assert.equal((await env.session(host)).difficulty, 'standard');
  for (const mode of ['easy', 'standard', 'advanced'] as const) {
    const current = await env.session(host);
    const action = { type: 'difficulty', difficulty: mode, actionId: randomUUID(), expectedVersion: current.version, roundId: current.roundId };
    const changed = await env.call(`/api/rooms/${created.code}/action`, host, action);
    assert.equal(changed.status, 200);
    assert.equal((await env.session(guest)).difficulty, mode);
    const retried = await env.call(`/api/rooms/${created.code}/action`, host, action);
    assert.equal(retried.data.duplicate, true);
    const reused = await env.call(`/api/rooms/${created.code}/action`, host, { ...action, difficulty: mode === 'easy' ? 'advanced' : 'easy' });
    assert.equal(reused.status, 400);
  }
  const before = await env.session(host);
  const malformed = await env.call(`/api/rooms/${created.code}/action`, host, {
    type: 'difficulty', difficulty: 'cheat', actionId: randomUUID(), expectedVersion: before.version });
  assert.equal(malformed.status, 400);
  assert.equal((await env.session(host)).version, before.version);
  await env.close();
  const restored = createApp({ dbPath: join(env.directory, 'state.sqlite'), port: 0, disconnectGrace: 60_000 });
  const port = await restored.listen(); t.after(() => restored.close());
  const response = await fetch(`http://127.0.0.1:${port}/api/session`, { headers: { Authorization: 'Bearer ' + guest } });
  assert.equal((await response.json()).view.difficulty, 'advanced');
  const room = restored.rooms.rooms.get(created.code)!;
  restored.rooms.action(room.code, host, { type: 'start', actionId: randomUUID(), expectedVersion: room.version });
  assert.throws(() => restored.rooms.action(room.code, host, {
    type: 'difficulty', difficulty: 'easy', actionId: randomUUID(), expectedVersion: room.version }), /打完/);
  assert.equal(room.difficulty, 'advanced');
});
test('selected difficulty reaches an isolated real AI worker and its accepted decision', async t => {
  const trace: Record<string, unknown>[] = [];
  const env = await setup(t, { firstSeat: () => 1, audit: event => trace.push(event) });
  const host = token(); await env.create(host);
  await env.act(host, 'difficulty', { difficulty: 'advanced' });
  await env.act(host, 'start');
  await until(() => trace.some(e => e.type === 'ai_accepted'));
  const input = trace.find(e => e.type === 'ai_input')!, accepted = trace.find(e => e.type === 'ai_accepted')!;
  assert.equal((input.observation as Observation).difficulty, 'advanced');
  assert.deepEqual(accepted.decision, decide(input.observation as Observation));
  assert.equal('hands' in (input.observation as Observation), false);
});
test('late friend claims an AI seat without replacing a disconnected human seat', async t => {
  const env = await setup(t, { firstSeat: () => 1, botDelay: 150 });
  const host = token(), guest = token(); const original = await env.create(host); await env.act(host, 'start');
  const before = (await env.session(host)).roundId;
  const joined = await env.call(`/api/rooms/${original.code}/join`, guest, { name: '后到牌友' });
  assert.equal(joined.data.view.self, 1); assert.equal(joined.data.view.hand.length, 27);
  await pause(220); const state = await env.session(guest);
  assert.equal(state.turn, 1); assert.equal(state.roundId, before); assert.equal(state.seats[0].kind, 'human');
});
test('take-back invalidates a pending AI answer before it can play', async t => {
  const env = await setup(t); const credential = token(); await env.create(credential); await env.act(credential, 'start');
  let answer: ((value: Decision) => void) | null = null, observation: Observation | null = null;
  env.app.rooms.bots.choose = async (_key, obs) => { observation = obs; return new Promise<Decision>(ok => { answer = ok; }); };
  await env.act(credential, 'auto'); await until(() => answer !== null);
  const resumed = await env.act(credential, 'resume'); assert.equal(resumed.status, 200);
  const release = answer as unknown as (value: Decision) => void; release(decide(observation!));
  await pause(30); const state = await env.session(credential);
  assert.equal(state.hand.length, 27); assert.equal(state.turn, 0); assert.equal(state.seats[0].auto, false);
});
test('one real WebSocket disconnect changes only that human to automatic control', async t => {
  const env = await setup(t, { disconnectGrace: 70, botDelay: 150 });
  const tokens = [token(), token(), token(), token()], first = await env.create(tokens[0]);
  for (const credential of tokens.slice(1)) await env.call(`/api/rooms/${first.code}/join`, credential, {});
  const sockets = await Promise.all(tokens.map(credential => new Promise<WebSocket>((ok, fail) => {
    const ws = new WebSocket(`ws://127.0.0.1:${env.port}/ws`); ws.once('error', fail);
    ws.once('open', () => ws.send(JSON.stringify({ type: 'authenticate', room: first.code, token: credential })));
    ws.once('message', () => ok(ws));
  })));
  t.after(() => sockets.forEach(ws => ws.terminate()));
  await env.act(tokens[0], 'start'); sockets[0].close();
  await until(async () => (await env.session(tokens[1])).seats[0].auto);
  const state = await env.session(tokens[1]);
  assert.equal(state.seats[0].connected, false);
  assert.ok(state.seats.slice(1).every(s => s.connected && !s.auto));
});

test('an empty waiting table can be reclaimed with a functioning host', async t => {
  const env = await setup(t), a = token(), b = token();
  const first = await env.create(a); assert.equal((await env.act(a, 'leave')).status, 200);
  const joined = await env.call(`/api/rooms/${first.code}/join`, b, { name: '新房主' });
  assert.equal(joined.status, 200);
  assert.equal((await env.act(b, 'start')).status, 200);
});
for (const operation of ['create', 'join'] as const) test(`failed ${operation} persistence cannot turn into an unpersisted success on retry`, async t => {
  const env = await setup(t), host = token(), guest = token();
  const initial = operation === 'join' ? await env.create(host) : null;
  const credential = operation === 'join' ? guest : host;
  const save = env.app.rooms.store.save.bind(env.app.rooms.store);
  let failOnce = true;
  env.app.rooms.store.save = (room, receipt) => { if (failOnce) { failOnce = false; throw new Error('injected disk write failure'); } save(room, receipt); };
  const path = operation === 'join' ? `/api/rooms/${initial!.code}/join` : '/api/rooms';
  assert.equal((await env.call(path, credential, { name: '需保留的座位' })).status, 500);
  assert.equal((await env.call(path, credential, { name: '需保留的座位' })).status, 200);
  await env.close();
  const restored = createApp({ dbPath: join(env.directory, 'state.sqlite'), port: 0 });
  const port = await restored.listen(); t.after(() => restored.close());
  const response = await fetch(`http://127.0.0.1:${port}/api/session`, { headers: { Authorization: 'Bearer ' + credential } });
  assert.equal(response.status, 200, 'a seat acknowledged after retry must survive restart');
});

test('disconnect timer rolls back failed persistence and retries without an uncaught error', async t => {
  const trace: Record<string, unknown>[] = [];
  const env = await setup(t, { disconnectGrace: 20, botDelay: 1000, audit: event => trace.push(event) });
  const credential = token(); await env.create(credential); await env.act(credential, 'start');
  const save = env.app.rooms.store.save.bind(env.app.rooms.store);
  let failOnce = true;
  env.app.rooms.store.save = (room, receipt) => { if (failOnce) { failOnce = false; throw new Error('injected transient timer write failure'); } save(room, receipt); };
  await pause(50);
  assert.equal((await env.session(credential)).seats[0].auto, false, 'failed write cannot grant unpersisted control');
  await until(async () => (await env.session(credential)).seats[0].auto);
  assert.ok(trace.some(e => e.type === 'persistence_failed'));
});

test('persisted private hands and SQLite sidecars are accessible only to the server user', async t => {
  const env = await setup(t); await env.create(token());
  for (const suffix of ['', '-wal', '-shm']) assert.equal(statSync(join(env.directory, 'state.sqlite' + suffix)).mode & 0o777, 0o600);
});
