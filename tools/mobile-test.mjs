import assert from 'node:assert/strict';
import { createServer, connect as tcpConnect } from 'node:net';
import { createServer as httpServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolve('.'), RUN = randomUUID(), DIR = resolve('.local/mobile-evidence', RUN);
const SHOTS = join(homedir(), 'Pictures/neomind-dogfood', new Date().toISOString().slice(0, 7), 'guandan-' + RUN);
mkdirSync(DIR, { recursive: true }); mkdirSync(SHOTS, { recursive: true });
const CONTROL = randomBytes(32).toString('hex');
const APPIUM = process.env.GUANDAN_APPIUM_URL ?? 'http://127.0.0.1:4723';
const BACKEND = 3212, PROXY_BASE = 3310, PROBE_PORT = 3213;
const probeServer = httpServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end('<!doctype html><meta charset="utf-8"><title>Local network probe</title><p>Isolated guest transport check</p>'); });
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const summary = { run: RUN, startedAt: new Date().toISOString(), scope: 'Real Android OS/browser UI automation, not Huawei physical hardware', devices: [], isolation: null, modes: [], faults: [], passed: false };
const progressPath = resolve('.local/mobile-progress.json');
const progress = value => { const data = { ...value, at: new Date().toISOString(), run: RUN }; writeFileSync(progressPath, JSON.stringify(data, null, 2)); console.log(JSON.stringify(data)); };
const adb = (index, ...args) => {
  const p = spawnSync('adb', ['-s', `emulator-${5554 + index * 2}`, ...args], { encoding: 'utf8', timeout: 20000 });
  if (p.status !== 0) throw new Error('adb failed: ' + (p.stderr || p.stdout).slice(0, 400));
  return p.stdout.trim();
};
async function until(fn, budget = 15000, note = 'condition') {
  const end = Date.now() + budget; let last;
  while (Date.now() < end) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await sleep(100); }
  throw new Error(note + ' timed out' + (last ? ': ' + last.message : ''));
}
class Device {
  constructor(index) { this.index = index; this.name = 'ABCD'[index]; this.serial = `emulator-${5554 + index * 2}`; this.id = null; }
  async command(method, path, data) {
    const response = await fetch(APPIUM + (this.id ? '/session/' + this.id : '') + path, { method,
      headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(120000) });
    const result = await response.json();
    const media = path === '/screenshot' || path === '/appium/stop_recording_screen';
    appendFileSync(join(DIR, this.name + '.ndjson'), JSON.stringify({ at: Date.now(), method, path, data, ok: response.ok,
      value: media ? { mediaBase64Characters: result.value?.length } : result.value }) + '\n');
    if (!response.ok || result.value?.error) throw new Error(this.name + ' ' + path + ': ' + (result.value?.message ?? response.status));
    return result.value;
  }
  async start() {
    const result = await this.command('POST', '/session', { capabilities: { alwaysMatch: {
      platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:udid': this.serial,
      'appium:systemPort': 8200 + this.index, 'appium:chromedriverPort': 9515 + this.index,
      browserName: 'Chrome', 'appium:noReset': true, 'appium:newCommandTimeout': 1800,
      'appium:chromeOptions': { args: ['--no-first-run', '--disable-fre', '--disable-background-networking', '--disable-sync', '--disable-breakpad'] }
    }, firstMatch: [{}] } });
    this.id = result.sessionId;
    return { name: this.name, serial: this.serial, session: this.id, androidId: adb(this.index, 'shell', 'settings', 'get', 'secure', 'android_id'), capabilities: result.capabilities };
  }
  read(script) { return this.command('POST', '/execute/sync', { script, args: [] }); }
  async state() {
    return this.read(`const a=document.querySelector('#app');
      return {stage:a?.dataset.stage, self:Number(a?.dataset.self), turn:Number(a?.dataset.turn), version:Number(a?.dataset.version), round:Number(a?.dataset.round), connected:a?.dataset.connected==='true',
      code:document.querySelector('#header-code')?.textContent.trim(), hand:Array.from(document.querySelectorAll('[data-card-id]')).map(x=>Number(x.dataset.cardId)),
      hint:!!document.querySelector('#hint')&&!document.querySelector('#hint').disabled, play:!!document.querySelector('#play')&&!document.querySelector('#play').disabled,
      pass:!!document.querySelector('#pass')&&!document.querySelector('#pass').disabled, message:document.querySelector('.live-message')?.textContent.trim()||'',
      auto:document.querySelector('#auto-toggle')?.textContent.includes('接回')||false,
      seats:Array.from(document.querySelectorAll('[data-seat]')).map(x=>({seat:Number(x.dataset.seat),text:x.textContent.trim()})), size:[innerWidth,innerHeight]};`);
  }
  async element(selector) {
    const elements = await this.command('POST', '/elements', { using: 'css selector', value: selector });
    assert.equal(elements.length, 1, `${this.name}: selector must identify exactly one target: ${selector}`);
    return elements[0]['element-6066-11e4-a52e-4f735466cecf'];
  }
  async click(selector) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { const id = await this.element(selector); await this.command('POST', `/element/${id}/click`, {}); return; }
      catch (error) { if (attempt === 2 || !error.message.includes('stale element')) throw error; }
    }
  }
  async fill(selector, text) { const id = await this.element(selector); await this.command('POST', `/element/${id}/clear`, {}); await this.command('POST', `/element/${id}/value`, { text }); }
  async goto(url) { await this.command('POST', '/url', { url }); }
  async screenshot(label) {
    const data = await this.command('GET', '/screenshot');
    writeFileSync(join(SHOTS, this.name + '-' + label + '.png'), Buffer.from(data, 'base64'));
  }
  async stop() { if (this.id) { try { await this.command('DELETE', ''); } catch {} this.id = null; } }
}
class Proxy {
  constructor(index) {
    this.port = PROXY_BASE + index; this.blocked = false; this.delay = 0; this.pairs = new Set(); this.bytes = 0;
    this.server = createServer(client => {
      if (this.blocked) { client.destroy(); return; }
      const upstream = tcpConnect(BACKEND, '127.0.0.1');
      const pair = { client, upstream, timers: new Set() }; this.pairs.add(pair);
      const close = () => { client.destroy(); upstream.destroy(); for (const timer of pair.timers) clearTimeout(timer); this.pairs.delete(pair); };
      client.on('error', close); upstream.on('error', close); client.on('close', close); upstream.on('close', close);
      for (const [from, to] of [[client, upstream], [upstream, client]]) {
        let nextAt = 0;
        from.on('data', chunk => {
          this.bytes += chunk.length;
          if (!this.delay) { if (!to.destroyed) to.write(chunk); return; }
          nextAt = Math.max(Date.now() + this.delay, nextAt + 1);
          const timer = setTimeout(() => { pair.timers.delete(timer); if (!to.destroyed) to.write(chunk); }, nextAt - Date.now());
          pair.timers.add(timer);
        });
      }
    });
  }
  async start() { await new Promise((ok, fail) => { this.server.once('error', fail); this.server.listen(this.port, '127.0.0.1', ok); }); }
  cut(value) { this.blocked = value; if (value) for (const pair of this.pairs) { pair.client.destroy(); pair.upstream.destroy(); } }
  async close() { this.cut(true); await new Promise(ok => this.server.close(ok)); }
}
let backend = null;
function startBackend() {
  const log = openSync(join(DIR, 'server.log'), 'a');
  backend = spawn(process.execPath, ['dist/src/server.js'], { cwd: ROOT,
    env: { ...process.env, GUANDAN_PORT: String(BACKEND), GUANDAN_DATA_DIR: join(DIR, 'database'),
      GUANDAN_TEST_CONTROL: CONTROL, GUANDAN_TEST_SEED: '1729', GUANDAN_BOT_DELAY_MS: '120', GUANDAN_GRACE_MS: '20000' }, stdio: ['ignore', log, log] });
  closeSync(log); writeFileSync(join(DIR, 'server.pid'), String(backend.pid));
}
async function stopBackend() {
  if (!backend || backend.exitCode !== null) return;
  const processToStop = backend; processToStop.kill('SIGTERM');
  await Promise.race([new Promise(ok => processToStop.once('exit', ok)), sleep(10000).then(() => { if (processToStop.exitCode === null) throw new Error('owned server did not stop'); })]);
  backend = null;
}
async function ready() { await until(async () => (await fetch(`http://127.0.0.1:${BACKEND}/api/health`)).ok, 15000, 'test server'); }
async function snapshot(code) {
  const response = await fetch(`http://127.0.0.1:${BACKEND}/__test/rooms/${code}`, { headers: { 'x-test-control': CONTROL } });
  assert.ok(response.ok); return response.json();
}

async function healthProbe(device, port) {
  return device.command('POST', '/execute/async', { script: `const done=arguments[arguments.length-1]; const c=new AbortController(); const timer=setTimeout(()=>c.abort(),2000);
    fetch('http://10.0.2.2:${port}/api/health?probe=${device.name}',{mode:'no-cors',cache:'no-store',signal:c.signal}).then(r=>{clearTimeout(timer);done({resolved:true,type:r.type})}).catch(e=>{clearTimeout(timer);done({resolved:false,failure:e.name})});`, args: [] });
}
function firewall(index, ownPort) {
  // Only a dedicated Guandan guest is modified, never the host firewall.
  assert.equal(adb(index, 'emu', 'avd', 'name').split('\n')[0].trim(), 'Guandan_' + 'ABCD'[index]);
  const script = `iptables -N GUANDAN_TEST 2>/dev/null || true
iptables -C OUTPUT -j GUANDAN_TEST 2>/dev/null || iptables -I OUTPUT 1 -j GUANDAN_TEST
iptables -F GUANDAN_TEST
iptables -A GUANDAN_TEST -o lo -j ACCEPT
iptables -A GUANDAN_TEST -d 10.0.2.2 -p tcp --dport ${ownPort} -j ACCEPT
iptables -A GUANDAN_TEST -d 10.0.2.2 -p tcp --dport ${PROBE_PORT} -j ACCEPT
iptables -A GUANDAN_TEST -d 10.0.2.2 -p tcp --sport 5555 -j ACCEPT
iptables -A GUANDAN_TEST -j REJECT
ip6tables -N GUANDAN_TEST 2>/dev/null || true
ip6tables -C OUTPUT -j GUANDAN_TEST 2>/dev/null || ip6tables -I OUTPUT 1 -j GUANDAN_TEST
ip6tables -F GUANDAN_TEST
ip6tables -A GUANDAN_TEST -o lo -j ACCEPT
ip6tables -A GUANDAN_TEST -j REJECT`;
  adb(index, 'shell', script);
  return { ipv4: adb(index, 'shell', 'iptables -L GUANDAN_TEST -nv'), ipv6: adb(index, 'shell', 'ip6tables -L GUANDAN_TEST -nv') };
}
async function step(device) {
  const before = await device.state();
  if (!before.connected || !['playing', 'tribute'].includes(before.stage) || !before.hint) return false;
  await device.click('#hint');
  const ready = await until(async () => {
    const s = await device.state();
    return s.play || s.message.startsWith('这手压不过') ? s : false;
  }, 7000, device.name + ' hint completion');
  assert.ok(ready.play || ready.pass, 'an unavailable play must offer a legal pass');
  await device.click(ready.play ? '#play' : '#pass');
  const after = await until(async () => { const s = await device.state(); return s.version > before.version ? s : false; }, 7000, device.name + ' action acceptance');
  return { device: device.name, seat: before.self, from: before.version, to: after.version, action: ready.play ? before.stage === 'tribute' ? 'return' : 'play' : 'pass' };
}
async function playRound(devices, budget = 600000, stopAt = null) {
  const end = Date.now() + budget; const actions = [];
  while (Date.now() < end) {
    const states = await Promise.all(devices.map(d => d.state()));
    if (stopAt && stopAt(states)) return { stopped: true, states, actions };
    if (states.every(s => ['roundOver', 'matchOver'].includes(s.stage))) return { states, actions };
    const index = states.findIndex(s => s.connected && s.hint);
    if (index >= 0) {
      const result = await step(devices[index]);
      if (result) { actions.push(result); if (actions.length % 10 === 0) progress({ phase: 'playing', players: devices.length, round: states[0].round, humanActions: actions.length, version: result.to }); }
    } else await sleep(80);
  }
  throw new Error('Android UI round exceeded its budget');
}
async function record(device, label, start) {
  if (start) await device.command('POST', '/appium/start_recording_screen', { options: { timeLimit: 180, videoSize: '1280x592', bitRate: 1000000, forceRestart: true } });
  else {
    const video = await device.command('POST', '/appium/stop_recording_screen', { options: {} });
    assert.ok(typeof video === 'string' && video.length > 100, 'screen video must contain actual frames');
    writeFileSync(join(DIR, device.name + '-' + label + '.mp4'), Buffer.from(video, 'base64'));
  }
}
async function checkIsolation(devices) {
  const marker = 'probe-' + randomUUID();
  for (const d of devices) { await d.goto(`http://10.0.2.2:${BACKEND}`); await until(async () => (await d.state()).stage === 'home'); }
  await devices[0].command('POST', '/execute/sync', { script: 'localStorage.setItem(arguments[0],arguments[1]);document.cookie=arguments[0]+"="+arguments[1]+"; path=/";return true;', args: ['guandan_isolation_probe', marker] });
  const storage = await Promise.all(devices.map(d => d.read("return {local:localStorage.getItem('guandan_isolation_probe'),cookies:document.cookie}")));
  assert.equal(storage[0].local, marker); assert.ok(storage.slice(1).every(x => x.local === null && !x.cookies.includes(marker)));
  const network = [];
  for (let i = 0; i < devices.length; i++) {
    const d = devices[i], own = PROXY_BASE + i, other = PROXY_BASE + (i + 1) % 4;
    await d.goto(`http://10.0.2.2:${PROBE_PORT}`);
    const positive = await healthProbe(d, other); assert.ok(positive.resolved, `${d.name} cross-port probe must be observable before firewall: ${JSON.stringify(positive)}`);
    const rules = firewall(i, own);
    const allowed = await healthProbe(d, own), denied = await healthProbe(d, other);
    assert.ok(allowed.resolved, 'own game channel must still work'); assert.equal(denied.resolved, false, 'other client channel must be blocked');
    network.push({ device: d.name, positive, allowed, denied, rules });
  }
  summary.isolation = { independentAndroidIds: new Set(summary.devices.map(d => d.androidId)).size, storage, network };
  assert.equal(summary.isolation.independentAndroidIds, 4);
  writeFileSync(join(DIR, 'isolation.json'), JSON.stringify(summary.isolation, null, 2));
  progress({ phase: 'isolation_passed', devices: 4 });
}
async function faults(devices, proxies) {
  // Reach a stable human turn before altering the real transport.
  await playRound(devices, 90000, states => states[0].stage === 'playing' && states[0].turn === 0);
  const before = await Promise.all(devices.map(d => d.state()));
  proxies[0].cut(true); progress({ phase: 'A_disconnected_waiting_for_default_20s_grace' });
  await until(async () => {
    const peers = await Promise.all(devices.slice(1).map(d => d.state()));
    return peers.every(s => s.connected && s.seats.some(p => p.seat === 0 && p.text.includes('电脑代打')));
  }, 30000, 'only A should enter takeover');
  for (let i = 1; i < 4; i++) assert.ok((await healthProbe(devices[i], PROXY_BASE + i)).resolved);
  proxies[0].cut(false);
  await until(async () => (await devices[0].state()).connected, 15000, 'A reconnect');
  const rejoined = await devices[0].state(); assert.equal(rejoined.self, before[0].self); assert.equal(rejoined.round, before[0].round);
  await devices[0].click('#resume-big'); await until(async () => !(await devices[0].state()).auto);
  summary.faults.push({ type: 'A-only TCP disconnect', defaultGraceMs: 20000, otherThreeObservedTakeover: true, originalSeatRestored: true });
  const stable = await Promise.all(devices.map(d => d.state()));
  await stopBackend(); startBackend(); await ready();
  await until(async () => (await Promise.all(devices.map(d => d.state()))).every(s => s.connected), 15000, 'server restart reconnect');
  const after = await Promise.all(devices.map(d => d.state()));
  assert.deepEqual(after.map(s => s.hand), stable.map(s => s.hand)); assert.deepEqual(after.map(s => s.round), stable.map(s => s.round));
  summary.faults.push({ type: 'real service restart', handsAndRoundsPreserved: true });
  proxies[1].delay = 150;
  const began = Date.now(); assert.ok((await healthProbe(devices[1], PROXY_BASE + 1)).resolved);
  const elapsedMs = Date.now() - began; assert.ok(elapsedMs >= 150);
  await sleep(400); proxies[1].delay = 0;
  summary.faults.push({ type: 'B-only link delay', eachDirectionMs: 150, observedProbeMs: elapsedMs });
  progress({ phase: 'Android_recovery_passed', scenarios: summary.faults.length });
}
async function mode(count, devices, proxies, variant = 'standard') {
  const active = devices.slice(0, count), label = 'mode-' + count + '-' + variant;
  for (const d of active) {
    await d.goto(`http://10.0.2.2:${PROXY_BASE + d.index}`);
    await d.read("localStorage.removeItem('guandan.session.v1');localStorage.removeItem('guandan.pending.v1');return true;");
    await d.goto(`http://10.0.2.2:${PROXY_BASE + d.index}`);
    await until(async () => (await d.state()).stage === 'home');
    await d.command('POST', '/orientation', { orientation: 'LANDSCAPE' });
    await d.fill('#nickname', '牌友' + d.name);
  }
  await active[0].click('#create-room');
  const host = await until(async () => { const s = await active[0].state(); return s.stage === 'waiting' && s.connected ? s : false; });
  for (const d of active.slice(1)) { await d.fill('#join-code', host.code); await d.click('#join-room'); await until(async () => (await d.state()).stage === 'waiting' && (await d.state()).connected); }
  if (variant === 'same-team') {
    await active[1].click('[data-sit="2"]');
    await until(async () => (await active[1].state()).self === 2);
  }
  await Promise.all(active.map(d => record(d, label, true)));
  await active[0].click('#start-game');
  await until(async () => (await Promise.all(active.map(d => d.state()))).every(s => s.stage === 'playing'));
  await Promise.all(active.map(d => d.screenshot(label + '-initial')));
  const layouts = await Promise.all(active.map(d => d.read("const b=document.querySelector('.controls').getBoundingClientRect();const h=document.querySelector('.hand').getBoundingClientRect();return {viewport:innerHeight,controlsBottom:b.bottom,handBottom:h.bottom,controlsTop:b.top,scroll:scrollY}")));
  assert.ok(layouts.every(x => x.controlsBottom <= x.viewport + 1 && x.handBottom <= x.controlsTop + 1 && x.scroll === 0), 'all cards and controls must fit the compact landscape');
  const result = await playRound(active);
  const audit = await snapshot(host.code), accepted = audit.events.filter(e => e.type === 'ai_accepted');
  assert.equal(audit.room.stage === 'roundOver' || audit.room.stage === 'matchOver', true);
  assert.equal(audit.room.seats.filter(s => s.kind === 'human').length, count);
  if (count === 4) assert.equal(accepted.length, 0); else assert.ok(accepted.length > 0);
  assert.equal(new Set(result.states.map(s => s.version)).size, 1);
  writeFileSync(join(DIR, label + '.json'), JSON.stringify({ count, result, audit }, null, 2));
  await Promise.all(active.map(d => d.screenshot(label + '-result')));
  await Promise.all(active.map(d => record(d, label, false)));
  await active[0].click('#next-game'); await until(async () => (await active[0].state()).round === 2);
  summary.modes.push({ humans: count, ai: 4 - count, variant,
    layouts,
    humanSeats: audit.room.seats.map((s, i) => s.kind === 'human' ? i : -1).filter(i => i >= 0),
    humanUiActions: result.actions.length, aiAccepted: accepted.length, sharedResultVersion: result.states[0].version, nextRound: 2 });
  progress({ phase: 'mode_passed', ...summary.modes.at(-1) });
  if (count === 4) {
    await faults(active, proxies);
    const rounds = [];
    for (let i = 0; i < 40; i++) {
      await Promise.all(active.map(d => record(d, 'match-' + i, true)));
      const finished = await playRound(active, 600000);
      await Promise.all(active.map(d => record(d, 'match-' + i, false)));
      const state = await snapshot(host.code); rounds.push({ round: state.room.round, level: state.room.game.level, result: state.room.result, uiActions: finished.actions.length });
      progress({ phase: 'full_match', round: state.room.round, levels: state.room.levels });
      if (state.room.stage === 'matchOver') break;
      await active[0].click('#next-game');
    }
    const final = await snapshot(host.code); assert.equal(final.room.stage, 'matchOver');
    summary.fullMatch = { rounds, winner: final.room.result.matchWinner };
    await Promise.all(active.map(d => d.screenshot('full-match-result')));
    writeFileSync(join(DIR, 'full-match.json'), JSON.stringify({ rounds, final }, null, 2));
  }
  for (const d of active) { await d.click('#leave-open'); await d.click('#leave-confirm'); await until(async () => (await d.state()).stage === 'home'); }
}

const devices = Array.from({ length: 4 }, (_, i) => new Device(i));
const proxies = Array.from({ length: 4 }, (_, i) => new Proxy(i));
try {
  // Retire only sessions recorded by this project's earlier smoke check.
  for (const letter of 'ABCD') {
    try { const previous = JSON.parse(readFileSync(resolve('.local', 'android-session-' + letter + '.json'), 'utf8')); await fetch(APPIUM + '/session/' + previous.sessionId, { method: 'DELETE' }); } catch {}
  }
  for (let i = 0; i < 4; i++) {
    assert.equal(adb(i, 'emu', 'avd', 'name').split('\n')[0].trim(), 'Guandan_' + 'ABCD'[i]);
    adb(i, 'root'); await sleep(300); adb(i, 'wait-for-device');
    adb(i, 'shell', 'iptables -F GUANDAN_TEST 2>/dev/null || true\nip6tables -F GUANDAN_TEST 2>/dev/null || true');
  }
  startBackend(); await ready(); await Promise.all(proxies.map(p => p.start()));
  await new Promise((ok, fail) => { probeServer.once('error', fail); probeServer.listen(PROBE_PORT, '127.0.0.1', ok); });
  const capabilities = await Promise.all(devices.map(d => d.start())); summary.devices = capabilities;
  writeFileSync(join(DIR, 'sessions.json'), JSON.stringify(capabilities, null, 2));
  await checkIsolation(devices);
  for (const count of [1, 2, 3, 4]) await mode(count, devices, proxies);
  await mode(2, devices, proxies, 'same-team');
  summary.passed = true; summary.completedAt = new Date().toISOString();
  progress({ phase: 'all_passed', modes: summary.modes.length, fullMatchRounds: summary.fullMatch.rounds.length + 1 });
} catch (error) {
  summary.error = error.stack ?? String(error); progress({ phase: 'failed', error: error.message }); process.exitCode = 1;
  for (const d of devices) if (d.id) { try { await d.screenshot('failure'); } catch {} }
} finally {
  writeFileSync(join(DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(resolve('.local/mobile-latest.json'), JSON.stringify({ directory: DIR, screenshots: SHOTS, passed: summary.passed }, null, 2));
  for (const d of devices) await d.stop();
  for (const p of proxies) { try { await p.close(); } catch {} }
  await new Promise(ok => probeServer.close(ok));
  await stopBackend();
}
