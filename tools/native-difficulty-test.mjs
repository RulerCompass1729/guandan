/** Focused installed-APK checks for difficulty, shared rooms and in-place upgrades. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { createApp } from '../dist/src/server.js';
import { NativeDevice, PACKAGE, pause, until } from './native-device.mjs';

const run = randomUUID(), dir = resolve('.local/difficulty-evidence', run);
const shots = join(homedir(), 'Pictures/neomind-dogfood', new Date().toISOString().slice(0, 7), 'guandan-difficulty-' + run);
mkdirSync(dir, { recursive: true }); mkdirSync(shots, { recursive: true });
const apk = join(dir, 'tested.apk');
copyFileSync(resolve(process.env.GUANDAN_APK ?? 'android/app/build/outputs/apk/release/app-release.apk'), apk);
const oldApk = resolve(process.env.GUANDAN_OLD_APK ?? '.local/release/guandan-0.2.0.apk');
const devices = Array.from({ length: 4 }, (_, i) => new NativeDevice(i, dir));
const report = { run, apkSha256: createHash('sha256').update(readFileSync(apk)).digest('hex'),
  scope: 'Generic Android API33 ARM64, 1080x2340; real native app, not a Huawei hardware claim', passed: false, devices: [], checks: [] };
let app;
const audit = [];
function progress(value) { console.log(JSON.stringify({ ...value, dir })); }
async function shot(d, label) {
  await d.screenshot(join(shots, d.name + '-' + label + '.png'));
  writeFileSync(join(shots, d.name + '-' + label + '.xml'), await d.source());
}
async function ready(d, name, budget = 20000) { return until(async () => {
  const o = await d.observe(); return o.byId[name]?.enabled === 'true' ? o : false;
}, budget, d.name + ' ' + name); }
function practiceState(d) {
  const text = d.adb('shell', 'cat', '/data/user/0/' + PACKAGE + '/shared_prefs/seat.xml').toString();
  const value = text.match(/<string name="practiceState">([\s\S]*?)<\/string>/)?.[1];
  assert.ok(value, 'saved practice state must exist');
  return JSON.parse(value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
async function leave(d) {
  const o = await d.observe();
  if (o.byId.leave_open) { await d.reveal('leave_open'); await d.click('leave_open'); }
  else { await d.click('rules'); await d.click('离开牌桌', true); }
  await d.click('leave_confirm'); await ready(d, 'create_room');
}
const labels = { easy: '轻松', standard: '标准', advanced: '进阶' };
async function choose(d, mode, confirm = true) {
  await d.reveal('difficulty_open'); const previous = await d.text('difficulty_open'); await d.click('difficulty_open');
  const text = { easy: '轻松\n优先简单出牌，适合熟悉操作', standard: '标准\n出牌与配合比较均衡', advanced: '进阶\n更注意保留组合、拦截与收尾' }[mode];
  // Match the entire decoded label, assert uniqueness, then dispatch a physical tap.
  let previousBounds = '', stable = 0;
  const found = await until(async () => {
    const observed = await d.observe(), targets = observed.nodes.filter(n => n['resource-id'] === 'android:id/text1' && n.text === text);
    assert.ok(targets.length <= 1, 'one exact native difficulty row');
    const bounds = targets.length === 1 ? JSON.stringify(targets[0].rect) : '';
    stable = bounds && bounds === previousBounds ? stable + 1 : 0; previousBounds = bounds;
    return stable >= 2 ? { observed, target: targets[0] } : false;
  }, 10000, 'difficulty picker row visible');
  await d.tapObserved({ ...found.observed, byId: { 'android:id/text1': found.target } }, 'android:id/text1');
  await d.click(confirm ? 'difficulty_confirm' : 'difficulty_cancel');
  await until(async () => !(await d.elements('difficulty_confirm')).length &&
    (await d.text('difficulty_open')) === (confirm ? '电脑难度：' + labels[mode] : previous), 10000, 'difficulty picker saved or cancelled');
}
async function step(d, code = null) {
  const before = code ? structuredClone(app.rooms.rooms.get(code)) : practiceState(d), offset = audit.length;
  const o = await ready(d, 'hint'); await d.tapObserved(o, 'hint');
  const selected = await until(async () => { const x = await d.observe();
    return x.byId.play?.enabled === 'true' || x.byId.selection_info?.text.includes('压不过') ? x : false;
  }, 20000, 'native hint is visible');
  const target = selected.byId.play?.enabled === 'true' ? 'play' : 'pass';
  await d.tapObserved(selected, target);
  if (code) {
    const receipt = await until(() => audit.slice(offset).find(e => e.type === 'action' && e.room === code &&
      e.seat === d.index && ['play', 'pass', 'return'].includes(e.action)), 20000, 'physical move has a persisted action receipt');
    assert.ok(receipt.version > before.version);
    return receipt.actionId;
  }
  const after = await until(() => {
    const state = practiceState(d);
    return state.version > before.version && state.game.ply >= before.game.ply + 2 && state.game.turn === 0 ? state : false;
  }, 30000, 'saved human move and subsequent AI moves');
  assert.equal(after.game.roundId, before.game.roundId);
  assert.ok(target === 'pass' ? after.game.hands[0].length === before.game.hands[0].length : after.game.hands[0].length < before.game.hands[0].length);
  return { ownBefore: before.game.hands[0].length, ownAfter: after.game.hands[0].length,
    fromPly: before.game.ply, toPly: after.game.ply, fromVersion: before.version, toVersion: after.version };
}
async function startServer() {
  app = createApp({ host: '127.0.0.1', port: 3310, dbPath: join(dir, 'rooms.sqlite'),
    botDelay: 120, disconnectGrace: 20000, audit: event => { audit.push(event); } });
  await app.listen();
}
try {
  for (const d of devices) {
    d.assertOwned(); d.adb('root'); d.adb('wait-for-device');
    if (d.adb('shell', 'pm', 'list', 'packages', PACKAGE).toString().includes(PACKAGE)) d.adb('uninstall', PACKAGE);
    d.adb('install', d.index === 3 ? oldApk : apk);
    report.devices.push(await d.start());
    await d.command('POST', '/orientation', { orientation: 'PORTRAIT' });
    await ready(d, 'practice');
  }
  assert.equal(new Set(report.devices.map(d => d.androidId)).size, 4);
  const d = devices[3];
  await d.click('practice'); await ready(d, 'hint');
  await d.command('POST', '/orientation', { orientation: 'LANDSCAPE' });
  await d.click('mode_toggle'); await ready(d, 'hint'); await shot(d, 'v02-before-upgrade');
  await d.stop(); d.adb('shell', 'am', 'force-stop', PACKAGE);
  const before = practiceState(d); assert.equal(before.difficulty, undefined);
  writeFileSync(join(dir, 'upgrade-before.json'), before ? JSON.stringify(before, null, 2) : '');
  const installed = d.adb('install', '-r', apk).toString(); assert.ok(installed.includes('Success'));
  await d.start(); await ready(d, 'hint');
  const after = practiceState(d);
  assert.equal(after.game.roundId, before.game.roundId); assert.deepEqual(after.game.hands, before.game.hands);
  assert.equal(await d.text('mode_toggle'), '大字', 'compact preference survives a same-signature update');
  await d.click('rules'); await d.click('电脑难度：标准', true); await d.click('知道了', true);
  await shot(d, 'v03-after-upgrade');
  report.checks.push({ type: 'inPlaceUpdate', from: '0.2.0', to: '0.3.0', preservedHands: true, preservedRound: true, preservedCompact: true, defaultDifficulty: 'standard' });
  await leave(d); progress({ phase: 'upgrade_passed' });

  // Three independent installed clients, each with a different saved policy.
  for (const [index, mode] of ['easy', 'standard', 'advanced'].entries()) {
    const device = devices[index]; await choose(device, mode);
    assert.equal(await device.text('difficulty_open'), '电脑难度：' + labels[mode]);
    await choose(device, mode === 'easy' ? 'advanced' : 'easy', false);
    assert.equal(await device.text('difficulty_open'), '电脑难度：' + labels[mode], 'cancel must not save');
    // Back and outside-cancel have the same dialog default: no persistence callback.
    await device.click('practice'); await ready(device, 'hint');
    await device.command('POST', '/orientation', { orientation: 'LANDSCAPE' });
    assert.equal(practiceState(device).difficulty, mode);
    await device.record('practice-' + mode, true);
    const moveProof = await step(device); await ready(device, 'hint'); await shot(device, 'practice-' + mode);
    await device.record('practice-' + mode, false);
    const saved = practiceState(device);
    await device.stop(); device.adb('shell', 'am', 'force-stop', PACKAGE); await device.start(); await ready(device, 'hint');
    assert.equal(practiceState(device).difficulty, mode);
    assert.equal(practiceState(device).game.roundId, saved.game.roundId);
    assert.deepEqual(practiceState(device).game.hands, saved.game.hands);
    report.checks.push({ type: 'practice', difficulty: mode, physicalHumanMove: true, aiResponded: moveProof.toPly > moveProof.fromPly + 1,
      moveProof, coldBootPreserved: true });
    await leave(device);
  }
  progress({ phase: 'three_native_difficulties_passed' });
  await startServer();
  for (const device of devices) {
    await device.command('POST', '/orientation', { orientation: 'PORTRAIT' });
    await device.click('rules'); await device.click('设置亲友联机服务', true);
    await device.fill('server_address', 'http://10.0.2.2:3310'); await device.click('server_save');
    await until(async () => !(await device.elements('server_address')).length);
  }
  const host = devices[0]; await host.click('create_room');
  const code = await until(async () => { const x = await host.text('header_code'); return /^\d{8}$/.test(x) ? x : false; });
  for (const device of devices.slice(1)) { await device.fill('join_code', code); await device.click('join_room'); await ready(device, 'difficulty_open'); }
  await choose(host, 'advanced');
  for (const device of devices) { await until(async () => (await device.text('difficulty_open')) === '电脑难度：进阶'); await shot(device, 'shared-advanced'); }
  await devices[1].click('difficulty_open');
  assert.equal((await devices[1].elements('difficulty_confirm')).length, 0, 'guest gets no editable picker');
  await devices[1].click('知道了', true);
  await app.close(); app = null; await startServer();
  assert.equal(app.rooms.rooms.get(code).difficulty, 'advanced');
  for (const device of devices) await until(async () => {
    const x = await device.observe(); return x.byId.difficulty_open?.text === '电脑难度：进阶' && !x.byId.reconnect;
  }, 20000, 'shared room reconnect after real service restart');
  report.checks.push({ type: 'fourClientSharedDifficulty', difficulty: 'advanced', guestReadOnly: true, serviceRestartPreserved: true });
  progress({ phase: 'four_clients_shared_difficulty_passed' });
  await leave(devices[2]); await leave(devices[3]);
  for (const device of devices.slice(0, 2)) await device.command('POST', '/orientation', { orientation: 'LANDSCAPE' });
  await host.reveal('start_game'); await host.click('start_game');
  await until(() => app.rooms.rooms.get(code).stage === 'playing', 15000, 'native start action accepted');
  const end = Date.now() + 600000, humanActions = new Set();
  while (Date.now() < end) {
    const room = app.rooms.rooms.get(code);
    if (['roundOver', 'matchOver'].includes(room.stage)) break;
    const seat = room.stage === 'tribute' ? room.game.tribute.entries.find(e => !e.returned && e.receiver < 2)?.receiver : room.game.turn;
    if (seat === 0 || seat === 1) humanActions.add(await step(devices[seat], code));
    else await pause(100);
  }
  const room = app.rooms.rooms.get(code); assert.ok(['roundOver', 'matchOver'].includes(room.stage));
  const humanMoves = humanActions.size;
  report.completedRound = { result: structuredClone(room.result), humanActionIds: [...humanActions], humanMoves };
  const inputs = audit.filter(e => e.type === 'ai_input' && e.room === code), accepted = audit.filter(e => e.type === 'ai_accepted' && e.room === code);
  assert.ok(humanMoves > 0 && accepted.length > 0);
  assert.ok(inputs.every(e => e.observation.difficulty === 'advanced' && !('hands' in e.observation)));
  for (const device of devices.slice(0, 2)) { await until(async () => (await device.observe()).byId.next_game); await shot(device, 'shared-result'); }
  await choose(host, 'easy');
  await devices[1].reveal('difficulty_open');
  await until(async () => (await devices[1].text('difficulty_open')) === '电脑难度：轻松');
  await host.reveal('next_game'); await host.click('next_game');
  await until(() => app.rooms.rooms.get(code).round === 2);
  assert.equal(app.rooms.rooms.get(code).difficulty, 'easy');
  report.checks.push({ type: 'twoHumansTwoAdvancedAiRound', humanMoves, aiMoves: accepted.length, restrictedInputs: true, roundTwoEasy: true });
  for (const device of devices.slice(0, 2)) await leave(device);
  writeFileSync(join(dir, 'ai-events.json'), JSON.stringify(audit, null, 2));
  report.passed = true; progress({ phase: 'native_difficulty_passed', humanMoves, aiMoves: accepted.length });
} catch (error) {
  report.error = error.stack;
  for (const d of devices) if (d.id) try { await shot(d, 'failure'); } catch {}
  console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(join(dir, 'ai-events.json'), JSON.stringify(audit, null, 2));
  for (const d of devices) try { await d.stop(); } catch (error) { report.cleanupError = String(error); process.exitCode = 1; }
  if (app) await app.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(report, null, 2));
  writeFileSync('.local/difficulty/latest-native-run.json', JSON.stringify({ dir, shots, passed: report.passed }, null, 2));
}
