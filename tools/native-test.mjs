/** Install the supplied APK into four owned guests and use physical native UI input. */
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, openSync, closeSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { NativeDevice, PACKAGE, pause, until } from './native-device.mjs';

const ROOT = resolve('.'), RUN = randomUUID(), DIR = resolve('.local/native-evidence', RUN);
const SHOTS = join(homedir(), 'Pictures/neomind-dogfood', new Date().toISOString().slice(0, 7), 'guandan-native-' + RUN);
mkdirSync(DIR, { recursive: true }); mkdirSync(SHOTS, { recursive: true });
const APK = join(DIR, 'tested.apk');
copyFileSync(resolve(process.env.GUANDAN_APK ?? 'android/app/build/outputs/apk/release/app-release.apk'), APK);
const CONTROL = randomBytes(32).toString('hex'), BACKEND = 3212, BASE = 3310;
const summary = { run: RUN, startedAt: new Date().toISOString(), scope: 'Installed native APK, NATIVE_APP hierarchy, physical input and ADB full-screen video; generic Android API33, not Huawei hardware',
  apkSha256: createHash('sha256').update(readFileSync(APK)).digest('hex'), devices: [], isolation: null, modes: [], faults: [], passed: false };
const progress = value => { const entry = { ...value, at: new Date().toISOString(), directory: DIR }; writeFileSync('.local/native-progress.json', JSON.stringify(entry, null, 2)); console.log(JSON.stringify(entry)); };
const devices = Array.from({ length: 4 }, (_, i) => new NativeDevice(i, DIR));
let backend;
function startBackend(seed = '1729') {
  const log = openSync(join(DIR, 'server.log'), 'a');
  backend = spawn(process.execPath, ['dist/src/server.js'], { cwd: ROOT, env: { ...process.env, GUANDAN_HOST: '127.0.0.1', GUANDAN_PORT: String(BACKEND), GUANDAN_DATA_DIR: join(DIR, 'database'),
    GUANDAN_TEST_CONTROL: CONTROL, GUANDAN_TEST_SEED: seed, GUANDAN_BOT_DELAY_MS: '120', GUANDAN_GRACE_MS: '20000', GUANDAN_AUDIT_PATH: join(DIR, 'ai-events.ndjson') }, stdio: ['ignore', log, log] });
  closeSync(log); writeFileSync(join(DIR, 'server.pid'), String(backend.pid));
}
async function stopBackend() {
  if (!backend || backend.exitCode !== null) return;
  const owned = backend; owned.kill('SIGTERM');
  await Promise.race([new Promise(ok => owned.once('exit', ok)), pause(10000).then(() => { if (owned.exitCode === null) throw new Error('owned test service did not stop'); })]); backend = null;
}
async function ready() { await until(async () => (await fetch('http://127.0.0.1:' + BACKEND + '/api/health')).ok, 15000, 'native test backend'); }
async function snapshot(code) {
  const response = await fetch('http://127.0.0.1:' + BACKEND + '/__test/rooms/' + code, { headers: { 'x-test-control': CONTROL } });
  assert.ok(response.ok); return response.json();
}
class Link {
  constructor(index) {
    this.index = index; this.port = BASE + index; this.blocked = false; this.delay = 0; this.sockets = new Set(); this.pairs = new Set(); this.events = []; this.dropConfirmationOnce = false; this.dropTypes = ['play', 'pass', 'return'];
    this.server = createServer(async (req, res) => {
      const arrivedAt = Date.now();
      if (this.blocked) { req.destroy(); return; }
      const parts = []; for await (const chunk of req) parts.push(chunk); const body = Buffer.concat(parts);
      let input; try { input = JSON.parse(body.toString()); } catch {}
      // A lost-start test needs the cached waiting screen. Remove only this
      // client's WS before forwarding the action, then drop its HTTP response.
      if (this.dropConfirmationOnce && this.dropTypes.includes(input?.type)) for (const pair of this.pairs) { pair.client.destroy(); pair.upstream.destroy(); }
      if (this.delay) await pause(this.delay);
      if (this.blocked) { res.destroy(); return; }
      const upstream = request({ host: '127.0.0.1', port: BACKEND, method: req.method, path: req.url, headers: req.headers }, incoming => {
        const chunks = []; incoming.on('data', x => chunks.push(x));
        incoming.on('end', async () => {
          const bytes = Buffer.concat(chunks); let output; try { output = JSON.parse(bytes.toString()); } catch {}
          const event = { at: Date.now(), arrivedAt, device: 'ABCD'[index], path: req.url, method: req.method, input, status: incoming.statusCode, output };
          this.events.push(event);
          if (this.dropConfirmationOnce && req.url.endsWith('/action') && this.dropTypes.includes(input?.type) && incoming.statusCode === 200) {
            event.confirmationDropped = true; appendFileSync(join(DIR, 'native-http.ndjson'), JSON.stringify(event) + '\n');
            this.dropConfirmationOnce = false; this.dropped = event; this.cut(true); return;
          }
          if (this.delay) await pause(this.delay);
          if (!res.destroyed) { event.servedAt = Date.now(); appendFileSync(join(DIR, 'native-http.ndjson'), JSON.stringify(event) + '\n'); res.writeHead(incoming.statusCode, incoming.headers); res.end(bytes); }
        });
      });
      upstream.on('error', () => res.destroy()); upstream.end(body);
    });
    this.server.on('connection', socket => { this.sockets.add(socket); socket.on('close', () => this.sockets.delete(socket)); });
    this.server.on('upgrade', (req, client, head) => {
      if (this.blocked) { client.destroy(); return; }
      const upstream = connect(BACKEND, '127.0.0.1'), pair = { client, upstream, timers: new Set() }; this.pairs.add(pair);
      const close = () => { client.destroy(); upstream.destroy(); for (const t of pair.timers) clearTimeout(t); this.pairs.delete(pair); };
      client.on('error', close); upstream.on('error', close); client.on('close', close); upstream.on('close', close);
      upstream.on('connect', () => {
        let header = req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '\r\n';
        for (let i = 0; i < req.rawHeaders.length; i += 2) header += req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1] + '\r\n';
        upstream.write(header + '\r\n'); if (head.length) upstream.write(head);
      });
      for (const [from, to] of [[client, upstream], [upstream, client]]) {
        let nextAt = 0;
        from.on('data', chunk => {
          if (!this.delay) { if (!to.destroyed) to.write(chunk); return; }
          nextAt = Math.max(Date.now() + this.delay, nextAt + 1);
          const timer = setTimeout(() => { pair.timers.delete(timer); if (!to.destroyed) to.write(chunk); }, nextAt - Date.now()); pair.timers.add(timer);
        });
      }
    });
  }
  async start() { await new Promise((ok, fail) => { this.server.once('error', fail); this.server.listen(this.port, '127.0.0.1', ok); }); }
  cut(blocked) { this.blocked = blocked; if (blocked) { for (const socket of this.sockets) socket.destroy(); for (const p of this.pairs) { p.client.destroy(); p.upstream.destroy(); } } }
  async close() { this.cut(true); this.server.closeAllConnections(); await new Promise(ok => this.server.close(ok)); }
}
const links = devices.map(d => new Link(d.index));
function clearFirewall(d) {
  d.assertOwned(); d.adb('shell', 'iptables -D OUTPUT -j GUANDAN_TEST 2>/dev/null || true\niptables -F GUANDAN_TEST 2>/dev/null || true\niptables -X GUANDAN_TEST 2>/dev/null || true\nip6tables -D OUTPUT -j GUANDAN_TEST 2>/dev/null || true\nip6tables -F GUANDAN_TEST 2>/dev/null || true\nip6tables -X GUANDAN_TEST 2>/dev/null || true');
}
function firewall(d) {
  d.adb('shell', `iptables -N GUANDAN_TEST
iptables -I OUTPUT 1 -j GUANDAN_TEST
iptables -A GUANDAN_TEST -o lo -j ACCEPT
iptables -A GUANDAN_TEST -d 10.0.2.2 -p tcp --dport ${BASE + d.index} -j ACCEPT
iptables -A GUANDAN_TEST -d 10.0.2.2 -p tcp --sport 5555 -j ACCEPT
iptables -A GUANDAN_TEST -j REJECT
ip6tables -N GUANDAN_TEST
ip6tables -I OUTPUT 1 -j GUANDAN_TEST
ip6tables -A GUANDAN_TEST -o lo -j ACCEPT
ip6tables -A GUANDAN_TEST -j REJECT`);
  return { ipv4: d.adb('shell', 'iptables -L GUANDAN_TEST -nv').toString(), ipv6: d.adb('shell', 'ip6tables -L GUANDAN_TEST -nv').toString() };
}
async function probe(d, port) {
  // Keep stdin open: this toybox nc half-closes TCP immediately on EOF.
  const out = await d.adbAsync('shell', `{ printf 'GET /api/health HTTP/1.1\r\nHost: local.test\r\nConnection: close\r\n\r\n'; sleep 2; } | toybox timeout 3 toybox nc -w 2 10.0.2.2 ${port} 2>&1 || true`);
  return { resolved: out.includes('"ok":true'), output: out };
}
async function isolation() {
  const network = [], storage = [], marker = 'native-isolation-' + RUN;
  const path = '/data/user/0/' + PACKAGE + '/files/isolation-probe';
  devices[0].adb('shell', 'mkdir -p /data/user/0/' + PACKAGE + '/files');
  devices[0].adb('shell', 'echo ' + marker + ' > ' + path);
  for (const d of devices) {
    const exists = d.adb('shell', 'test -f ' + path + ' && cat ' + path + ' || true').toString().trim(); storage.push({ device: d.name, marker: exists });
    const other = BASE + (d.index + 1) % 4, positive = await probe(d, other);
    writeFileSync(join(DIR, 'network-positive-' + d.name + '.json'), JSON.stringify(positive, null, 2));
    assert.ok(positive.resolved, 'network observation must succeed before isolation');
    const rules = firewall(d), allowed = await probe(d, BASE + d.index), denied = await probe(d, other);
    assert.ok(allowed.resolved); assert.equal(denied.resolved, false); network.push({ device: d.name, positive, allowed, denied, rules });
  }
  assert.equal(storage[0].marker, marker); assert.ok(storage.slice(1).every(x => !x.marker));
  assert.equal(new Set(summary.devices.map(d => d.androidId)).size, 4);
  summary.isolation = { independentAndroidIds: 4, storage, network }; writeFileSync(join(DIR, 'isolation.json'), JSON.stringify(summary.isolation, null, 2)); progress({ phase: 'native_isolation_passed', devices: 4 });
}
async function observeReady(d, name, budget = 15000) { return until(async () => { const o = await d.observe(); return o.byId[name]?.enabled === 'true' ? o : false; }, budget, d.name + ' native ' + name); }
async function shot(d, label) { await d.screenshot(join(SHOTS, d.name + '-' + label + '.png')); writeFileSync(join(SHOTS, d.name + '-' + label + '.xml'), await d.source()); }
async function setServer(d) {
  await d.click('rules'); await d.click('设置亲友联机服务', true); await d.fill('server_address', 'http://10.0.2.2:' + (BASE + d.index)); await d.click('server_save');
  await until(async () => !(await d.elements('server_address')).length, 5000, 'native service setting persisted');
}
async function leave(d) {
  const o = await d.observe();
  if (o.byId.leave_open) { await d.reveal('leave_open'); await d.click('leave_open'); } else { await d.click('rules'); await d.click('离开牌桌', true); }
  await d.click('leave_confirm'); await observeReady(d, 'create_room');
}
function actionable(room, seat) {
  return room.stage === 'playing' && room.game.turn === seat || room.stage === 'tribute' && room.game.tribute.entries.some(e => !e.returned && e.receiver === seat);
}
async function step(d, code, seat) {
  const before = (await snapshot(code)).room;
  if (!actionable(before, seat)) return false;
  const initial = await observeReady(d, 'hint', 10000); await d.tapObserved(initial, 'hint');
  const selection = await until(async () => {
    const o = await d.observe(); return o.byId.play?.enabled === 'true' || o.byId.selection_info?.text.includes('压不过') ? o : false;
  }, 10000, 'visible native hint result');
  const action = selection.byId.play?.enabled === 'true' ? 'play' : 'pass';
  assert.equal(selection.byId[action]?.enabled, 'true');
  const offset = links[d.index].events.length; await d.tapObserved(selection, action);
  const receipt = await until(() => links[d.index].events.slice(offset).find(e => e.path.endsWith('/action') && e.status === 200 && ['play', 'pass', 'return'].includes(e.input?.type)), 15000, 'native physical action accepted');
  assert.ok(receipt.output.view.version > before.version); assert.equal(receipt.output.view.self, seat);
  return { device: d.name, seat, type: receipt.input.type, actionId: receipt.input.actionId, from: before.version, to: receipt.output.view.version, beforeHand: before.game.hands[seat].length, afterHand: receipt.output.view.hand.length };
}
async function playRound(active, code, seats, budget = 900000, label = 'round') {
  const actions = [], end = Date.now() + budget; let segmentAt = Date.now(), part = 0;
  while (Date.now() < end) {
    const state = (await snapshot(code)).room;
    if (['roundOver', 'matchOver'].includes(state.stage)) {
      await Promise.all(active.map(d => until(async () => { const o = await d.observe(); return o.byId.next_game ? o : false; }, 10000, 'native shared result visible'))); return { room: state, actions };
    }
    const index = seats.findIndex(seat => actionable(state, seat));
    if (index < 0) { await pause(80); continue; }
    const result = await step(active[index], code, seats[index]);
    if (result) { actions.push(result); if (actions.length % 10 === 0) progress({ phase: 'native_playing', players: active.length, round: state.round, humanPhysicalActions: actions.length }); }
    if (Date.now() - segmentAt > 90000) {
      await Promise.all(active.map(d => d.record(label + '-part-' + part, false))); await Promise.all(active.map(d => d.record(label, true))); segmentAt = Date.now(); part++;
    }
  }
  throw new Error('native complete round exceeded budget');
}
async function layoutChecks(d, compact) {
  const initial = await until(async () => { const x = await d.observe(); return x.byId.hint && x.byId.mode_toggle && !x.byId.reconnect ? x : false; }, 10000, 'native table connected and visible');
  if ((initial.byId.mode_toggle.text === '大字') !== compact) await d.tapObserved(initial, 'mode_toggle');
  const o = await until(async () => { const x = await d.observe(); return x.byId.hint && x.byId.mode_toggle?.text === (compact ? '大字' : '紧凑') ? x : false; }, 10000, 'native layout switch completes');
  const handTargets = Object.entries(o.byId).filter(([name]) => name.startsWith(compact ? 'group_' : 'card_')).map(([, node]) => node);
  const total = compact ? handTargets.reduce((n, node) => n + Number(node['content-desc'].match(/共(\d+)张/)[1]), 0) : handTargets.length;
  assert.equal(total, 27, 'the initial native hand must expose all 27 cards');
  assert.ok(handTargets.every(n => n.rect.width > 0 && n.rect.height > 0 && n.rect.y + n.rect.height <= o.byId.bottom_controls.rect.y), 'all initial hand targets must fit above the fixed controls');
  for (const name of ['hint', 'pass', 'play', 'mode_toggle']) {
    const r = o.byId[name]?.rect; assert.ok(r && r.y + r.height <= o.screen.height && r.x + r.width <= o.screen.width, name + ' must fit entirely');
    assert.ok(r.width >= d.density * 48 - 1 && r.height >= d.density * 48 - 1, name + ' must be 48dp');
  }
  if (compact) {
    const group = Object.keys(o.byId).find(x => x.startsWith('group_')); assert.ok(group);
    await d.tapObserved(o, group);
    const expanded = await until(async () => { const x = await d.observe(); return x.byId.group_close && Object.keys(x.byId).some(key => key.startsWith('card_')) ? x : false; }, 10000, 'native card group fully opens');
    const card = Object.keys(expanded.byId).find(x => x.startsWith('card_')); assert.ok(card);
    await d.tapObserved(expanded, card); await d.click('取消', true);
    const canceled = await until(async () => { const x = await d.observe(); return x.byId.selection_info ? x : false; });
    assert.ok(!canceled.byId.selection_info.text.startsWith('已选'), 'cancel must roll back popup selection');
  } else {
    const card = Object.keys(o.byId).find(x => x.startsWith('card_')); await d.tapObserved(o, card);
    const selected = await until(async () => { const x = await d.observe(); return x.byId.selection_info?.text.includes('已选') ? x : false; });
    await d.tapObserved(selected, 'selection_clear');
    await until(async () => { const x = await d.observe(); return x.byId.selection_info && !x.byId.selection_info.text.startsWith('已选'); });
  }
  return { mode: compact ? 'compact' : 'large', screen: o.screen, controls: o.byId.bottom_controls.rect, targetsAtLeast48dp: true, selectionCancel: true };
}
async function mode(count, variant = 'standard') {
  const active = devices.slice(0, count), label = 'mode-' + count + '-' + variant;
  for (const d of active) { await d.command('POST', '/orientation', { orientation: 'PORTRAIT' }); await d.fill('nickname', '牌友' + d.name); }
  await active[0].click('create_room');
  const code = await until(async () => { const o = await active[0].observe(); return /^\d{8}$/.test(o.byId.header_code?.text ?? '') ? o.byId.header_code.text : false; });
  for (const d of active.slice(1)) { await d.fill('join_code', code); await d.click('join_room'); await until(async () => (await d.observe()).byId.header_code?.text === code); }
  if (variant === 'same-team') { await active[1].click('sit_2'); await until(async () => (await snapshot(code)).room.seats[2]?.name === '牌友B'); }
  if (variant === 'same-team') links[1].delay = 150;
  const before = (await snapshot(code)).room, seats = active.map(d => before.seats.findIndex(s => s?.name === '牌友' + d.name));
  for (const d of active) await d.command('POST', '/orientation', { orientation: 'LANDSCAPE' });
  const recoveryOnly = process.env.GUANDAN_NATIVE_RECOVERY_ONLY === '1' || process.env.GUANDAN_NATIVE_START_RECOVERY_ONLY === '1' || variant === 'start-recovery' || variant === 'entrusted-exit-recheck';
  if (!recoveryOnly) await Promise.all(active.map(d => d.record(label, true)));
  if (process.env.GUANDAN_NATIVE_START_RECOVERY_ONLY === '1' || variant === 'start-recovery') { await startRecovery(active, code); for (const d of active) await leave(d); return; }
  await active[0].click('start_game'); await until(async () => (await snapshot(code)).room.stage === 'playing');
  const layouts = [];
  for (const d of active) { await observeReady(d, 'mode_toggle'); layouts.push(await layoutChecks(d, d.index % 2 === 1)); await shot(d, label + '-initial'); }
  if (variant === 'entrusted-exit-recheck') {
    await entrustedMatch(active, code);
    for (const d of active) {
      const beforeExit = await d.observe(); assert.equal(beforeExit.screen.width, 2340); assert.equal(beforeExit.screen.height, 1080);
      await shot(d, 'landscape-result-before-scroll'); await d.record('landscape-result-exit', true);
      const revealed = await d.reveal('leave_open'); assert.equal(revealed.screen.width, 2340); assert.equal(revealed.screen.height, 1080);
      await shot(d, 'landscape-result-after-scroll'); await d.tapObserved(revealed, 'leave_open'); await d.click('leave_confirm');
      await observeReady(d, 'create_room'); await shot(d, 'landscape-exit-home'); await d.record('landscape-result-exit', false);
    }
    const final = (await snapshot(code)).room; assert.equal(final.seats.filter(s => s.kind === 'human').length, 0);
    summary.landscapeExitRecheck = { passed: true, screen: [2340,1080], physicalScroll: true, fourClientsHome: true, humanSeatsRemaining: 0 };
    progress({ phase: 'native_landscape_exit_recheck_passed', ...summary.landscapeExitRecheck }); return;
  }
  if (recoveryOnly) { await confirmationRecovery(active, code, seats); for (const d of active) await leave(d); return; }
  const result = await playRound(active, code, seats, 900000, label), audit = await snapshot(code), ai = audit.events.filter(e => e.type === 'ai_accepted');
  assert.equal(audit.room.seats.filter(s => s?.kind === 'human').length, count);
  if (count === 4) assert.equal(ai.length, 0); else assert.ok(ai.length > 0);
  if (variant === 'same-team') {
    const b = links[1].events.filter(e => e.input?.type === 'play' && e.status === 200 && e.servedAt && e.output?.view?.code === code);
    const a = links[0].events.filter(e => e.input?.type === 'play' && e.status === 200 && e.servedAt && e.output?.view?.code === code);
    assert.ok(b.length && a.length);
    const bMin = Math.min(...b.map(e => e.servedAt - e.arrivedAt)), aMin = Math.min(...a.map(e => e.servedAt - e.arrivedAt));
    assert.ok(bMin >= 300 && aMin < 150, 'only B native UI traffic must incur the injected delay');
    summary.faults.push({ type: 'B-only link delay during a complete native same-team round', eachDirectionMs: 150, minimumBActionRoundTripMs: bMin, minimumAActionRoundTripMs: aMin, acceptedBPlays: b.length });
  }
  await Promise.all(active.map(d => shot(d, label + '-result'))); await Promise.all(active.map(d => d.record(label, false)));
  await active[0].click('next_game'); await until(async () => (await snapshot(code)).room.round === 2);
  await Promise.all(active.map(d => until(async () => (await d.observe()).byId.header_code?.text === code)));
  const record = { humans: count, ai: 4 - count, variant, humanSeats: seats, layouts, physicalActions: result.actions.length, aiAccepted: ai.length, result: audit.room.result, nextRound: 2 };
  summary.modes.push(record); writeFileSync(join(DIR, label + '.json'), JSON.stringify({ record, actions: result.actions, audit }, null, 2)); progress({ phase: 'native_mode_passed', ...record });
  if (count === 4) { await faults(active, code, seats); await confirmationRecovery(active, code, seats); await entrustedMatch(active, code); }
  for (const d of active) await leave(d);
  if (variant === 'same-team') links[1].delay = 0;
}
async function faults(active, code, seats) {
  // A stable human turn makes before/after hand checks unambiguous.
  while (!actionable((await snapshot(code)).room, seats[0])) { const r = (await snapshot(code)).room; const i = seats.findIndex(s => actionable(r, s)); if (i >= 0) await step(active[i], code, seats[i]); else await pause(100); }
  const before = (await snapshot(code)).room;
  links[0].cut(true); progress({ phase: 'native_A_disconnected', graceMs: 20000 });
  await until(async () => (await snapshot(code)).room.seats[seats[0]].auto, 30000, 'native disconnect takeover');
  const peers = await Promise.all(active.slice(1).map(d => d.observe()));
  assert.ok(peers.every(o => o.source.includes('电脑代打'))); links[0].cut(false);
  await observeReady(active[0], 'resume_big', 15000); await active[0].click('resume_big');
  await until(async () => !(await snapshot(code)).room.seats[seats[0]].auto);
  assert.equal((await snapshot(code)).room.round, before.round); summary.faults.push({ type: 'A-only transport cut', otherThreeVisibleTakeover: true, originalSeatRestored: true, graceMs: 20000 });
  const stable = (await snapshot(code)).room; await stopBackend(); startBackend(); await ready();
  await until(async () => (await snapshot(code)).room.seats.every(s => s.connected), 15000, 'all native clients reconnect to restarted server');
  const after = (await snapshot(code)).room; assert.deepEqual(after.game.hands, stable.game.hands); assert.equal(after.round, stable.round);
  summary.faults.push({ type: 'actual service restart', allFourReconnected: true, handsAndRoundPreserved: true });
  links[1].delay = 150; const offset = links[1].events.length; assert.ok((await probe(active[1], BASE + 1)).resolved);
  const event = links[1].events.slice(offset).find(e => e.path === '/api/health' && e.servedAt); assert.ok(event);
  const elapsed = event.servedAt - event.arrivedAt; assert.ok(elapsed >= 300); links[1].delay = 0;
  summary.faults.push({ type: 'B-only latency', eachDirectionMs: 150, measuredProxyRoundTripMs: elapsed });
  await Promise.all(active.map(d => shot(d, 'reconnected'))); progress({ phase: 'native_recovery_passed', faults: summary.faults.length });
}
async function reachHuman(active, code, seats, target = 0) {
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    const room = (await snapshot(code)).room;
    if (['roundOver', 'matchOver'].includes(room.stage)) { await active[0].click('next_game'); continue; }
    if (actionable(room, seats[target])) return room;
    const index = seats.findIndex(s => actionable(room, s)); if (index >= 0) await step(active[index], code, seats[index]); else await pause(100);
  }
  throw new Error('stable native human turn unavailable');
}
async function confirmationRecovery(active, code, seats) {
  const d = active[0], before = await reachHuman(active, code, seats);
  await d.record('confirmation-recovery', true); links[0].dropConfirmationOnce = true;
  const accepted = await step(d, code, seats[0]); assert.ok(links[0].dropped);
  await until(async () => (await d.observe()).byId.retry_action, 15000, 'native pending action visible');
  await shot(d, 'confirmation-pending');
  await d.record('confirmation-before-kill', false); d.assertOwned();
  d.adb('shell', 'am', 'force-stop', PACKAGE); d.adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity');
  const offline = await observeReady(d, 'retry_action', 15000); assert.equal(offline.byId.header_code.text, code);
  assert.equal(offline.byId.play?.enabled, 'false'); assert.equal(offline.byId.hint?.enabled, 'false'); await d.record('confirmation-after-reopen', true); await shot(d, 'coldboot-offline');
  links[0].cut(false); await d.tapObserved(offline, 'retry_action');
  await until(async () => (await snapshot(code)).room.seats[seats[0]].connected, 15000, 'one retry reconnects original native seat');
  const repeated = await until(() => links[0].events.find(e => e.path.endsWith('/action') && e.input?.actionId === accepted.actionId && e.output?.duplicate === true), 15000, 'same action durable duplicate receipt');
  const current = (await snapshot(code)).room; assert.equal(current.game.hands[seats[0]].length, links[0].dropped.output.view.hand.length);
  assert.equal(current.game.roundId, before.game.roundId); assert.equal(repeated.input.actionId, accepted.actionId);
  await shot(d, 'confirmation-restored'); await pause(400); await d.record('confirmation-after-reopen', false);
  summary.faults.push({ type: 'accepted confirmation lost then actual APK force-stop and offline cold boot', sameActionId: accepted.actionId, duplicateReceipt: true, oneReconnectRestoredSeat: true, handReducedOnlyOnce: true });
  progress({ phase: 'native_confirmation_recovery_passed', faults: summary.faults.length });
}
async function startRecovery(active, code) {
  const d = active[0]; links[0].dropTypes = ['start']; links[0].dropConfirmationOnce = true;
  await d.click('start_game');
  const accepted = await until(() => links[0].dropped, 10000, 'start accepted without its confirmation');
  await observeReady(d, 'retry_action'); await shot(d, 'start-pending-waiting'); d.assertOwned();
  d.adb('shell', 'am', 'force-stop', PACKAGE); d.adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity');
  let offline = await observeReady(d, 'retry_action');
  assert.equal(offline.byId.header_code.text, code); assert.ok(!offline.byId.hint);
  for (const seat of [0,1,2,3]) assert.equal(offline.byId['seat_' + seat]?.enabled, 'false', 'cached waiting seats are read-only');
  await d.record('start-coldboot-recovery', true); await shot(d, 'start-coldboot-offline');
  await d.click('leave_open'); await until(async () => (await d.source()).includes('请先点重试这次操作，确认牌桌状态后再离开。'));
  await d.click('知道了', true); offline = await observeReady(d, 'retry_action'); links[0].cut(false); await d.tapObserved(offline, 'retry_action');
  await until(async () => (await snapshot(code)).room.seats.every(s => s.connected), 15000, 'start duplicate reconnects all native seats');
  const repeated = await until(() => links[0].events.find(e => e.input?.actionId === accepted.input.actionId && e.output?.duplicate === true));
  await observeReady(d, 'hint'); await shot(d, 'start-recovered-playing'); await pause(400); await d.record('start-coldboot-recovery', false);
  assert.equal(repeated.output.view.round, 1); assert.equal(repeated.output.view.hand.length, 27);
  summary.faults.push({ type: 'start accepted, both confirmation channels lost, waiting cache then offline cold boot', duplicateReceipt: true, sameRound: 1, handCount: 27, singleVisibleRetry: true });
  links[0].dropTypes = ['play', 'pass', 'return']; progress({ phase: 'native_start_recovery_passed', faults: summary.faults.length });
}
async function entrustedMatch(active, code) {
  // The first complete four-human round above must have zero AI moves. This next
  // part explicitly entrusts all four seats through visible native buttons.
  for (const d of active) { await observeReady(d, 'auto_toggle'); await d.click('auto_toggle'); }
  await until(async () => (await snapshot(code)).room.seats.every(s => s.auto));
  const rounds = [];
  for (let round = 0; round < 40; round++) {
    await active[0].record('entrusted-' + round, true);
    const state = await until(async () => { const r = (await snapshot(code)).room; return ['roundOver', 'matchOver'].includes(r.stage) ? r : false; }, 120000, 'native entrusted round completes');
    await until(async () => (await active[0].observe()).byId.next_game, 10000, 'native entrusted result');
    await shot(active[0], 'entrusted-' + state.round); await active[0].record('entrusted-' + round, false);
    rounds.push({ round: state.round, level: state.game.level, levels: state.levels, result: state.result });
    progress({ phase: 'native_entrusted_match', round: state.round, levels: state.levels, stage: state.stage });
    if (state.stage === 'matchOver') {
      await Promise.all(active.map(d => shot(d, 'over-A'))); summary.fullMatch = { mode: 'four human-owned seats explicitly entrusted to AI after manual round', rounds, winner: state.result.matchWinner }; return;
    }
    await active[0].click('next_game');
  }
  throw new Error('native entrusted full match did not reach over-A');
}
function practiceState(d) {
  const xml = d.adb('exec-out', 'cat', '/data/user/0/' + PACKAGE + '/shared_prefs/seat.xml').toString();
  const value = xml.match(/<string name="practiceState">([\s\S]*?)<\/string>/)?.[1]; assert.ok(value, 'persisted native practice state required');
  return JSON.parse(value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
function packageEnabledState(d, name) {
  const value = d.adb('shell', 'dumpsys', 'package', name).toString().match(/User 0:[^\n]*enabled=(\d+)/)?.[1];
  assert.ok(value !== undefined, 'package state observation required: ' + name); return Number(value);
}
function restoreFont(d, value) {
  if (value === 'null') d.adb('shell', 'settings', 'delete', 'system', 'font_scale');
  else d.adb('shell', 'settings', 'put', 'system', 'font_scale', value);
}
async function offlinePractice() {
  const d = devices[0], originalFont = d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim();
  const packages = ['com.google.android.gms', 'com.android.chrome'], restore = [];
  let recording = false;
  try {
    for (const name of packages) {
      if (!d.adb('shell', 'pm', 'list', 'packages', name).toString().includes('package:' + name)) continue;
      const disabled = d.adb('shell', 'pm', 'list', 'packages', '-d', name).toString().includes('package:' + name);
      if (!disabled) { const state = packageEnabledState(d, name); d.adb('shell', 'pm', 'disable-user', '--user', '0', name); restore.push({name, state}); }
    }
    links[0].cut(true); await d.command('POST', '/orientation', { orientation: 'PORTRAIT' }); await d.click('practice');
    await until(async () => (await d.observe()).byId.header_code?.text === '本机练习', 20000, 'offline native practice opens');
    await d.command('POST', '/orientation', { orientation: 'LANDSCAPE' }); await observeReady(d, 'mode_toggle');
    await d.record('offline-practice', true); recording = true;
    await until(() => practiceState(d).game.turn === 0, 20000, 'practice human turn');
    let o = await d.observe(); if (o.byId.mode_toggle.text !== '大字') await d.tapObserved(o, 'mode_toggle');
    await until(async () => (await d.observe()).byId.mode_toggle?.text === '大字');
    const before = practiceState(d); await shot(d, 'offline-compact-before-kill'); await d.record('offline-before-kill', false); recording = false;
    d.adb('shell', 'am', 'force-stop', PACKAGE); d.adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity');
    await until(async () => (await d.observe()).byId.mode_toggle?.text === '大字');
    const reopened = practiceState(d); assert.equal(reopened.version, before.version); assert.deepEqual(reopened.game.hands, before.game.hands);
    await d.record('offline-layout-restored', true); recording = true;
    await shot(d, 'offline-compact-reopened');
    await d.record('offline-layout-restored', false); recording = false;
    // Inspect large system text using actual configuration and a physical scroll.
    d.adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3'); await d.command('POST', '/orientation', { orientation: 'PORTRAIT' }); await pause(500);
    o = await d.observe(); if (o.byId.mode_toggle?.text === '大字') await d.tapObserved(o, 'mode_toggle');
    await pause(250); let enlarged = await d.observe();
    if (!enlarged.byId.hint || enlarged.byId.hint.rect.height < d.density * 48 - 1) {
      const s = enlarged.screen;
      d.adb('shell', 'input', 'swipe', String(Math.round(s.width / 2)), String(Math.round(s.height * .85)), String(Math.round(s.width / 2)), String(Math.round(s.height * .25)), '500'); await pause(250);
      enlarged = await d.observe();
    }
    assert.ok(enlarged.byId.hint?.rect.height >= d.density * 48 - 1, '130% text must retain a reachable native primary target');
    await shot(d, 'large-system-text-130');
    restoreFont(d, originalFont); await d.command('POST', '/orientation', { orientation: 'LANDSCAPE' }); await pause(400);
    await d.record('offline-practice', true); recording = true;
    const actions = [], end = Date.now() + 240000;
    while (Date.now() < end) {
      const state = practiceState(d);
      if (['roundOver', 'matchOver'].includes(state.stage)) break;
      if (state.game.turn !== 0 && state.stage === 'playing' || state.stage === 'tribute' && !state.game.tribute.entries.some(e => e.receiver === 0 && !e.returned)) { await pause(150); continue; }
      const initial = await observeReady(d, 'hint'); await d.tapObserved(initial, 'hint');
      const choice = await until(async () => { const x = await d.observe(); return x.byId.play?.enabled === 'true' || x.byId.selection_info?.text.includes('压不过') ? x : false; });
      const type = choice.byId.play?.enabled === 'true' ? 'play' : 'pass'; await d.tapObserved(choice, type);
      const after = await until(() => { const x = practiceState(d); return x.version > state.version ? x : false; });
      actions.push({ type, from: state.version, to: after.version, beforeHand: state.game.hands[0].length, afterHand: after.game.hands[0].length });
      if (actions.length % 10 === 0) progress({ phase: 'native_offline_practice', physicalActions: actions.length });
    }
    const final = practiceState(d); assert.ok(['roundOver', 'matchOver'].includes(final.stage), 'offline native round must complete');
    await until(async () => (await d.observe()).byId.next_game); await shot(d, 'offline-result'); await d.record('offline-practice', false); recording = false;
    await d.click('next_game'); await until(() => practiceState(d).round === 2);
    summary.offlinePractice = { noTransport: true, packagesDisabled: restore.map(x => x.name), nativePhysicalActions: actions.length, modeSurvivedProcessKill: true, sameHandsAfterReopen: true, fontScale130Reachable: true, completeRound: true, nextRound: 2 };
    writeFileSync(join(DIR, 'offline-practice.json'), JSON.stringify({ record: summary.offlinePractice, actions, final }, null, 2)); await leave(d); progress({ phase: 'native_offline_practice_passed', ...summary.offlinePractice });
  } finally {
    if (recording) try { await d.record('offline-failure', false); } catch {}
    links[0].cut(false); restoreFont(d, originalFont);
    for (const {name, state} of restore) { d.adb('shell', 'pm', state === 0 ? 'default-state' : 'enable', '--user', '0', name); assert.equal(packageEnabledState(d, name), state); }
    const fontAfter = d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim(); assert.equal(fontAfter, originalFont);
    writeFileSync(join(DIR, 'guest-restoration.json'), JSON.stringify({ originalFont, fontAfter, packages: restore, verified: true }, null, 2));
  }
}
async function stalePatternPopup() {
  // Select a reproducible ordinary shuffle that deals both heart-level cards to
  // A. No test route writes game state or submits a player's move.
  const { seeded } = await import('../dist/src/cards.js'), { newGame } = await import('../dist/src/game.js');
  let seed;
  for (let value = 0; value < 1000; value++) {
    const hand = newGame(2, seeded(value), 0, 'seed-search').hands[0];
    if (hand.filter(c => c.rank === 2 && c.suit === 'H').length === 2) { seed = String(value); break; }
  }
  assert.ok(seed); await stopBackend(); startBackend(seed); await ready();
  for (const d of devices) { await d.command('POST', '/orientation', { orientation: 'PORTRAIT' }); await d.fill('nickname', '牌友' + d.name); }
  await devices[0].click('create_room');
  const code = await until(async () => { const x = await devices[0].observe(); return /^\d{8}$/.test(x.byId.header_code?.text ?? '') ? x.byId.header_code.text : false; });
  for (const d of devices.slice(1)) { await d.fill('join_code', code); await d.click('join_room'); await until(async () => (await d.observe()).byId.header_code?.text === code); }
  for (const d of devices) await d.command('POST', '/orientation', { orientation: 'LANDSCAPE' });
  await devices[0].click('start_game'); await observeReady(devices[0], 'hint');
  const d = devices[0], room = (await snapshot(code)).room, cards = room.game.hands[0].filter(c => c.rank === 2 && c.suit === 'H'); assert.equal(cards.length, 2);
  let o = await d.observe(); if (o.byId.mode_toggle.text !== '紧凑') { await d.tapObserved(o, 'mode_toggle'); await until(async () => (await d.observe()).byId.mode_toggle?.text === '紧凑'); }
  await d.record('stale-pattern-popup', true);
  for (const card of cards) { const x = await until(async () => { const x = await d.observe(); return x.byId['card_' + card.id] ? x : false; }); await d.tapObserved(x, 'card_' + card.id); }
  await observeReady(d, 'pattern_choice'); await d.click('pattern_choice');
  await until(async () => (await d.source()).includes('这手牌按哪种牌型出')); await shot(d, 'pattern-popup-open');
  const pid = d.adb('shell', 'pidof', PACKAGE).toString().trim(); await d.record('pattern-before-background', false); d.assertOwned(); d.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await until(async () => (await snapshot(code)).room.seats[0].auto, 30000, 'actual background timeout updates old pattern version');
  const changed = (await snapshot(code)).room; assert.ok(changed.version > room.version);
  d.adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', PACKAGE + '/.MainActivity');
  await observeReady(d, 'resume_big', 15000); assert.equal(d.adb('shell', 'pidof', PACKAGE).toString().trim(), pid);
  await d.record('pattern-after-background', true);
  assert.ok(!(await d.source()).includes('这手牌按哪种牌型出'), 'stale native pattern dialog must close after version change');
  await shot(d, 'pattern-popup-after-background'); await d.click('resume_big'); await pause(400); await d.record('pattern-after-background', false);
  summary.stalePattern = { seed, usedOrdinaryShuffle: true, actualBackgroundTakeover: true, sameProcess: true, oldPopupClosed: true, nativeAppSurvived: true };
  writeFileSync(join(DIR, 'stale-pattern.json'), JSON.stringify(summary.stalePattern, null, 2));
  for (const player of devices) await leave(player); progress({ phase: 'native_stale_pattern_passed', ...summary.stalePattern });
}

try {
  for (const d of devices) {
    d.assertOwned(); d.adb('root'); await pause(250); d.adb('wait-for-device'); clearFirewall(d);
    if (d.adb('shell', 'pm', 'list', 'packages', PACKAGE).toString().includes('package:' + PACKAGE)) d.adb('shell', 'pm', 'uninstall', PACKAGE);
    d.adb('install', APK);
  }
  startBackend(); await ready(); await Promise.all(links.map(p => p.start()));
  summary.devices = await Promise.all(devices.map(d => d.start())); writeFileSync(join(DIR, 'sessions.json'), JSON.stringify(summary.devices, null, 2));
  await isolation();
  for (const d of devices) { await d.command('POST', '/orientation', { orientation: 'PORTRAIT' }); await setServer(d); }
  const selected = (process.env.GUANDAN_NATIVE_MODES ?? '1,2,3,4,team').split(',').filter(Boolean);
  for (const count of selected) if (count === 'team') await mode(2, 'same-team'); else if (count === 'exit') await mode(4, 'entrusted-exit-recheck'); else await mode(Number(count));
  const extras = process.env.GUANDAN_NATIVE_EXTRAS ?? 'all';
  if (extras === 'offline') await offlinePractice();
  else if (extras !== '0') { await mode(4, 'start-recovery'); await stalePatternPopup(); await offlinePractice(); }
  summary.passed = true; summary.completedAt = new Date().toISOString(); progress({ phase: 'native_all_selected_modes_passed', modes: summary.modes.length });
} catch (error) {
  summary.error = error.stack ?? String(error); process.exitCode = 1; progress({ phase: 'native_failed', error: error.message });
  for (const d of devices) if (d.id) try { await shot(d, 'failure'); } catch {}
} finally {
  writeFileSync(join(DIR, 'summary.json'), JSON.stringify(summary, null, 2)); writeFileSync('.local/native-latest.json', JSON.stringify({ directory: DIR, screenshots: SHOTS, passed: summary.passed }, null, 2));
  for (const d of devices) await d.stop();
  for (const link of links) try { await link.close(); } catch {}
  await stopBackend(); for (const d of devices) try { clearFirewall(d); } catch {}
}
