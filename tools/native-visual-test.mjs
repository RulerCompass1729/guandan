/** Installed native UI regression: four guests, update, classic cards, turns and real mixed play. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { createApp } from '../dist/src/server.js';
import { NativeDevice, PACKAGE, pause, until } from './native-device.mjs';
const run = randomUUID(), dir = resolve('.local/visual-evidence', run);
const shots = join(homedir(), 'Pictures/neomind-dogfood', new Date().toISOString().slice(0, 7), 'guandan-visual-' + run);
mkdirSync(dir, { recursive: true }); mkdirSync(shots, { recursive: true });
const apk = join(dir, 'tested.apk'); copyFileSync(resolve(process.env.GUANDAN_APK ?? 'android/app/build/outputs/apk/release/app-release.apk'), apk);
const devices = Array.from({ length: 4 }, (_, i) => new NativeDevice(i, dir));
const report = { run, passed: false, apkSha256: createHash('sha256').update(readFileSync(apk)).digest('hex'), checks: [], devices: [], scope: 'API33 ARM64 real native app; generic 1080x2340 guests, not Huawei hardware' };
const audit = [], original = new Map(); let app, code;
const progress = x => console.log(JSON.stringify({ ...x, dir, shots }));
const ready = (d, id) => until(async () => { const o = await d.observe(); return o.byId[id]?.enabled === 'true' ? o : false; }, 20000, d.name + ' ' + id);
async function shot(d, name) { await d.screenshot(join(shots, d.name + '-' + name + '.png')); writeFileSync(join(shots, d.name + '-' + name + '.xml'), await d.source()); }
function preference(d, file) { return d.adb('shell', 'cat', '/data/user/0/' + PACKAGE + '/shared_prefs/' + file + '.xml').toString(); }
function practice(d) {
  const value = preference(d, 'seat').match(/<string name="practiceState">([\s\S]*?)<\/string>/)?.[1]; assert.ok(value);
  return JSON.parse(value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
async function leave(d) { const o = await d.observe(); if (o.byId.leave_open) { await d.reveal('leave_open'); await d.click('leave_open'); } else { await d.click('rules'); await d.click('离开牌桌', true); } await d.click('leave_confirm'); await ready(d, 'create_room'); }
function visible(o, id) { const b = o.byId[id]?.rect; assert.ok(b, id + ' must exist'); assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= o.screen.width && b.y + b.height <= o.screen.height, id + ' must be fully visible'); return b; }
function turnCue(o, active) { visible(o, 'round_status'); assert.equal(o.byId.round_status.text.includes('轮到您出牌'), active); assert.equal(o.byId.hint.enabled === 'true', active); }
async function step(d) {
  const room = app.rooms.rooms.get(code), ply = room.game.ply, version = room.version;
  const o = await ready(d, 'hint'); turnCue(o, true); await d.tapObserved(o, 'hint');
  const selected = await until(async () => { const p = await d.observe(); return p.byId.play?.enabled === 'true' || p.byId.selection_info?.text.includes('压不过') ? p : false; }, 15000, 'candidate shown');
  const target = selected.byId.play?.enabled === 'true' ? 'play' : 'pass'; await d.tapObserved(selected, target);
  await until(() => audit.find(e => e.type === 'action' && e.room === code && e.seat === d.index && e.version > version && ['play', 'pass', 'return'].includes(e.action)), 20000, 'physical input persisted');
  assert.ok(app.rooms.rooms.get(code).game.ply > ply);
}
try {
  // D has the already-played 0.3 practice used to reproduce the small old cue.
  const d = devices[3]; d.assertOwned(); d.adb('root'); d.adb('wait-for-device');
  const oldVersion = d.adb('shell', 'dumpsys', 'package', PACKAGE).toString().match(/versionName=(\S+)/)?.[1];
  assert.equal(oldVersion, '0.3.0', 'Prepare a real 0.3 practice on owned D before this update test'); report.oldVersion = oldVersion;
  const before = practice(d), oldDisplay = preference(d, 'display');
  for (const device of devices) {
    device.assertOwned(); device.adb('root'); device.adb('wait-for-device');
    original.set(device.index, Object.fromEntries(['animator_duration_scale', 'transition_animation_scale', 'window_animation_scale'].map(k => [k, device.adb('shell', 'settings', 'get', 'global', k).toString().trim()])));
    if (device.index < 3) device.adb('shell', 'pm', 'clear', PACKAGE);
    assert.ok(device.adb('install', '-r', apk).toString().includes('Success'));
    report.devices.push(await device.start());
    for (const k of ['animator_duration_scale', 'transition_animation_scale', 'window_animation_scale']) device.adb('shell', 'settings', 'put', 'global', k, '1');
    await device.command('POST', '/orientation', { orientation: 'LANDSCAPE' });
  }
  assert.equal(new Set(report.devices.map(d => d.androidId)).size, 4);
  await ready(d, 'hint'); const after = practice(d); assert.equal(after.game.roundId, before.game.roundId); assert.deepEqual(after.game.hands, before.game.hands);
  assert.equal(preference(d, 'display').includes('name="compact" value="true"'), oldDisplay.includes('name="compact" value="true"'));
  let o = await d.observe(); turnCue(o, true); await shot(d, 'same-signature-upgrade'); progress({ phase: 'upgrade_and_fixed_cue' }); report.checks.push({ type: 'upgrade', sameRound: true, sameHands: true, sameLayout: true });
  if (await d.text('mode_toggle') === '大字') await d.click('mode_toggle');
  o = await d.observe(); const cards = Object.keys(o.byId).filter(k => /^card_\d+$/.test(k)); assert.equal(cards.length, after.game.hands[0].length);
  for (const name of cards) { const b = visible(o, name); assert.ok(b.width >= d.density * 48 - 1 && b.height >= d.density * 48 - 1); }
  await d.tapObserved(o, cards[0]); await shot(d, 'selected-card'); assert.ok((await d.observe()).byId[cards[0]]['content-desc'].startsWith('已选中')); await d.click('selection_clear');
  await d.click('mode_toggle'); o = await d.observe(); const group = Object.keys(o.byId).find(k => /^group_\d+$/.test(k)); await d.tapObserved(o, group);
  await ready(d, 'group_close'); o = await d.observe(); const item = Object.keys(o.byId).find(k => /^card_\d+$/.test(k)); await d.tapObserved(o, item); assert.ok((await d.observe()).byId[item]['content-desc'].startsWith('已选中'));
  await d.click('取消', true); await until(async () => { const x = await d.observe(); return !x.byId.group_close && x.byId.selection_clear?.enabled === 'false'; }, 10000, 'group cancel restores original empty selection');
  await shot(d, 'compact'); await d.click('mode_toggle');
  const oldFont = d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim();
  try { d.adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3'); await pause(500); o = await ready(d, 'hint'); turnCue(o, true); visible(o, 'play'); await shot(d, 'font130'); }
  finally { d.adb('shell', 'settings', oldFont === 'null' ? 'delete' : 'put', 'system', 'font_scale', ...(oldFont === 'null' ? [] : [oldFont])); }
  await d.command('POST', '/orientation', { orientation: 'PORTRAIT' }); await pause(400); o = await ready(d, 'hint');
  for (const id of ['hint', 'pass', 'play', 'round_status', 'selection_clear']) visible(o, id); await shot(d, 'portrait');
  await d.command('POST', '/orientation', { orientation: 'LANDSCAPE' }); await pause(400); await ready(d, 'hint');
  await d.click('auto_toggle'); await until(async () => (await d.text('round_status')) === '电脑正在代打'); await shot(d, 'auto'); await d.click('resume_big'); await ready(d, 'hint');
  await leave(d); report.checks.push({ type: 'cardsAndCue', fullHandReachable: true, groupCancelRestores: true, font130: true, autoCue: true });
  app = createApp({ host: '127.0.0.1', port: 3310, dbPath: join(dir, 'rooms.sqlite'), botDelay: 150, disconnectGrace: 20000, audit: e => audit.push(e) }); await app.listen();
  for (const device of devices) {
    await device.click('rules'); await device.click('设置亲友联机服务', true); await device.fill('server_address', 'http://10.0.2.2:3310'); await device.click('server_save'); await ready(device, 'create_room');
    await device.fill('nickname', '牌友' + '甲乙丙丁'[device.index]);
    if (device.index === 0) { await device.click('create_room'); await ready(device, 'start_game'); code = await device.text('header_code'); }
    else { await device.fill('join_code', code); await device.click('join_room'); await ready(device, 'leave_open'); }
  }
  await devices[0].reveal('start_game'); await devices[0].click('start_game'); await until(() => app.rooms.rooms.get(code).stage === 'playing');
  for (const device of devices) { await ready(device, 'turn_banner'); await shot(device, 'full-original-deal'); }
  for (let i = 0; i < 4; i++) { const t = app.rooms.rooms.get(code).game.turn; await step(devices[t]); }
  const current = app.rooms.rooms.get(code).game.turn;
  for (const device of devices) { const o = await ready(device, 'turn_banner'); turnCue(o, device.index === current); await shot(device, 'four-client-turn'); }
  const liveBefore = structuredClone(app.rooms.rooms.get(code).game);
  await app.close();
  await until(async () => (await devices[current].text('round_status')) === '连接已中断', 15000, 'stale own-turn cue cleared after disconnect');
  assert.equal((await devices[current].observe()).byId.hint.enabled, 'false'); await shot(devices[current], 'disconnected');
  app = createApp({ host: '127.0.0.1', port: 3310, dbPath: join(dir, 'rooms.sqlite'), botDelay: 150, disconnectGrace: 20000, audit: e => audit.push(e) }); await app.listen();
  for (const device of devices) { const o = await device.observe(); if (o.byId.reconnect) await device.click('reconnect');
    await until(async () => { const x = await device.observe(); return x.byId.round_status && x.byId.round_status.text !== '连接已中断' && x.byId.round_status.text !== '正在确认操作'; }, 20000, 'reconnected cue'); }
  assert.deepEqual(app.rooms.rooms.get(code).game.hands, liveBefore.hands);
  report.checks.push({ type: 'disconnectCue', noFalseReady: true, restartHandsPreserved: true }); progress({ phase: 'four_clients_and_disconnect' });
  // Two late seats leave through the UI; their hands become visible computer seats.
  await leave(devices[2]); await leave(devices[3]);
  for (const device of devices.slice(0, 2)) await device.record('mixed-full-round', true);
  const deadline = Date.now() + 360000;
  while (Date.now() < deadline) {
    const room = app.rooms.rooms.get(code); if (['roundOver', 'matchOver'].includes(room.stage)) break;
    if (room.game.turn < 2) await step(devices[room.game.turn]); else await pause(100);
  }
  const room = app.rooms.rooms.get(code); assert.equal(room.stage, 'roundOver');
  await pause(1200);
  for (const device of devices.slice(0, 2)) { await until(async () => (await device.observe()).byId.result_message); await device.record('mixed-full-round', false); const result = await device.observe();
    assert.equal(result.byId.result_message.text, device.index % 2 === room.result.winner ? '本副获胜' : '本副失利'); visible(result, 'next_game'); await shot(device, 'result'); }
  const accepted = audit.filter(e => e.type === 'ai_accepted'), rejected = audit.filter(e => e.type === 'ai_rejected'); assert.ok(accepted.length > 0); assert.equal(rejected.length, 0);
  assert.ok(audit.filter(e => e.type === 'ai_input').every(e => !('hands' in e.observation)));
  report.checks.push({ type: 'fourGuestsAndMixedRound', ply: room.game.ply, aiAccepted: accepted.length, aiRejected: 0, result: room.result, winAndLossVisible: true, continueFixedVisible: true });
  await devices[0].click('next_game'); await until(() => app.rooms.rooms.get(code).round === 2); report.checks.push({ type: 'continueNextRound', round: 2 });
  // A fresh result with Android animations disabled must remain readable and actionable.
  devices[1].adb('shell', 'settings', 'put', 'global', 'animator_duration_scale', '0');
  for (const device of devices.slice(0, 2)) { await ready(device, 'auto_toggle'); await device.record('second-result-system-animation', true); await device.click('auto_toggle'); }
  await until(() => app.rooms.rooms.get(code).stage === 'roundOver', 120000, 'four computers finish next round'); await pause(1200);
  for (const device of devices.slice(0, 2)) { await device.record('second-result-system-animation', false); const o = await device.observe(); visible(o, 'next_game'); assert.ok(o.byId.result_message.text.includes('本副')); await shot(device, 'second-result'); }
  report.checks.push({ type: 'animations', normalAnimationScale: 1, secondResultWithSystemScaleZero: true, nextStillVisible: true });
  report.passed = true; progress({ phase: 'native_visual_passed', checks: report.checks });
} catch (error) { report.error = error.stack; console.error(error); process.exitCode = 1; for (const d of devices) if (d.id) try { await shot(d, 'failure'); } catch {} }
finally {
  for (const d of devices) { try { await d.stop(); } catch (e) { report.cleanupError = String(e); }
    for (const [k, value] of Object.entries(original.get(d.index) ?? {})) d.adb('shell', 'settings', value === 'null' ? 'delete' : 'put', 'global', k, ...(value === 'null' ? [] : [value])); }
  if (app) await app.close(); writeFileSync(join(dir, 'audit.json'), JSON.stringify(audit, null, 2)); writeFileSync(join(dir, 'summary.json'), JSON.stringify(report, null, 2));
  writeFileSync('.local/turn-cards/latest-native-run.json', JSON.stringify({ dir, shots, passed: report.passed }, null, 2));
}
