import assert from 'node:assert/strict';
import { spawnSync, execFile } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const PACKAGE = 'io.github.rulercompass1729.guandan';
const APPIUM = process.env.GUANDAN_APPIUM_URL ?? 'http://127.0.0.1:4723';
const SDK = process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library/Android/sdk');
export const pause = ms => new Promise(ok => setTimeout(ok, ms));
export async function until(fn, budget = 15000, label = 'condition') {
  const end = Date.now() + budget; let last;
  while (Date.now() < end) {
    try { const result = await fn(); if (result) return result; } catch (error) { last = error; }
    await pause(150);
  }
  throw new Error(label + ' timed out' + (last ? ': ' + last.message : ''));
}
export class NativeDevice {
  constructor(index, directory) {
    this.index = index; this.name = 'ABCD'[index]; this.serial = 'emulator-' + (5554 + index * 2);
    this.directory = directory; this.id = null; this.density = 2.75;
  }
  assertOwned() {
    const script = `import importlib.util,json,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('owned','tools/android_devices.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
entries=json.loads(Path('.local/android/devices.json').read_text())
entry=next(x for x in entries if x['serial']==sys.argv[1]);assert m.check_owned(entry), 'unowned device'`;
    const result = spawnSync('python3', ['-c', script, this.serial], { encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, result.stderr);
  }
  adb(...args) {
    const result = spawnSync(join(SDK, 'platform-tools/adb'), ['-s', this.serial, ...args], { timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(result.status, 0, (result.stderr?.toString() || result.stdout?.toString()).slice(0, 300)); return result.stdout;
  }
  adbAsync(...args) {
    return new Promise((ok, fail) => execFile(join(SDK, 'platform-tools/adb'), ['-s', this.serial, ...args], { encoding: 'utf8', timeout: 20000 },
      (error, stdout, stderr) => error ? fail(new Error('owned adb command failed: ' + stderr.slice(0, 300))) : ok(stdout)));
  }
  async command(method, path, data) {
    const response = await fetch(APPIUM + (this.id ? '/session/' + this.id : '') + path, { method,
      headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(90000) });
    const result = await response.json();
    const media = path === '/appium/stop_recording_screen';
    appendFileSync(join(this.directory, this.name + '.ndjson'), JSON.stringify({ at: new Date().toISOString(), method, path, data,
      status: response.status, value: media ? { base64Characters: result.value?.length } : result.value }) + '\n');
    assert.ok(response.ok && !result.value?.error, this.name + ': ' + (result.value?.message ?? response.status));
    return result.value;
  }
  async start() {
    this.assertOwned();
    const density = this.adb('shell', 'wm', 'density').toString();
    this.density = Number((density.match(/Override density: (\d+)/) ?? density.match(/Physical density: (\d+)/))[1]) / 160;
    const result = await this.command('POST', '/session', { capabilities: { alwaysMatch: {
      platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:udid': this.serial,
      'appium:systemPort': 8200 + this.index, 'appium:appPackage': PACKAGE,
      'appium:appActivity': '.MainActivity', 'appium:noReset': true, 'appium:newCommandTimeout': 1800,
      'appium:disableWindowAnimation': true
    }, firstMatch: [{}] } });
    this.id = result.sessionId;
    assert.equal(await this.command('GET', '/context'), 'NATIVE_APP');
    const contexts = await this.command('GET', '/contexts');
    assert.ok(contexts.every(x => x === 'NATIVE_APP'), 'a native test must not enter a WebContext');
    return { name: this.name, serial: this.serial, session: this.id, density: this.density,
      androidId: this.adb('shell', 'settings', 'get', 'secure', 'android_id').toString().trim(), capabilities: result.capabilities };
  }
  async elements(name, exactText = false) {
    const query = exactText ? { using: '-android uiautomator', value: 'new UiSelector().text(' + JSON.stringify(name) + ')' } :
      { using: 'id', value: name.startsWith('android:') ? name : PACKAGE + ':id/' + name };
    return this.command('POST', '/elements', query);
  }
  async one(name, exactText = false) {
    const found = await until(async () => { const values = await this.elements(name, exactText); return values.length ? values : false; }, 5000, this.name + ': native target appears ' + name);
    assert.equal(found.length, 1, this.name + ': expected a unique native target ' + name);
    return found[0]['element-6066-11e4-a52e-4f735466cecf'];
  }
  async attr(name, attribute) {
    const id = await this.one(name); return this.command('GET', '/element/' + id + '/attribute/' + attribute);
  }
  async text(name) { const id = await this.one(name); return this.command('GET', '/element/' + id + '/text'); }
  async enabled(name) {
    const found = await this.elements(name); if (found.length !== 1) return false;
    return this.command('GET', '/element/' + found[0]['element-6066-11e4-a52e-4f735466cecf'] + '/enabled');
  }
  async foreground() {
    const output = this.adb('shell', 'dumpsys', 'window').toString();
    const focus = output.split('\n').find(line => line.includes('mCurrentFocus=')) ?? '';
    assert.ok(focus.includes(PACKAGE), 'native app is not in the current focused window: ' + focus);
    appendFileSync(join(this.directory, this.name + '.ndjson'), JSON.stringify({ at: new Date().toISOString(), type: 'native_focused_window', focus }) + '\n');
    return focus;
  }
  async click(name, exactText = false) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const id = await this.one(name, exactText);
        assert.ok(await this.command('GET', '/element/' + id + '/displayed'), 'native target is not displayed');
        assert.ok(await this.command('GET', '/element/' + id + '/enabled'), 'native target is disabled');
        const rect = await this.command('GET', '/element/' + id + '/rect');
        assert.ok(rect.width >= this.density * 48 - 1 && rect.height >= this.density * 48 - 1,
          'native target must expose a usable physical hit area: ' + name + ' ' + JSON.stringify(rect));
        const screen = await this.command('GET', '/window/rect');
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= screen.width && rect.y + rect.height <= screen.height,
          'the complete native target must fit on screen: ' + name + ' ' + JSON.stringify({rect, screen}));
        await this.foreground();
        const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
        appendFileSync(join(this.directory, this.name + '.ndjson'), JSON.stringify({ at: new Date().toISOString(),
          type: 'physical_adb_tap', resource: name, rect, x, y }) + '\n');
        // System input dispatch cannot invoke a hidden WebView/DOM click behind a modal.
        this.adb('shell', 'input', 'tap', String(x), String(y)); return;
      } catch (error) {
        if (attempt === 2 || !error.message.toLowerCase().includes('stale')) throw error;
      }
    }
  }
  async fill(name, text) {
    const id = await this.one(name);
    assert.ok(await this.command('GET', '/element/' + id + '/displayed'));
    await this.command('POST', '/element/' + id + '/clear', {});
    await this.command('POST', '/element/' + id + '/value', { text });
  }
  source() { return this.command('GET', '/source'); }
  async observe() {
    const source = await this.source();
    const decode = value => value.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, number) =>
      String.fromCodePoint(number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const nodes = [...source.matchAll(/<([\w.$]+)\s+([^>]+)>/g)].filter(match => match[1] !== 'hierarchy').map(match => {
      const attrs = Object.fromEntries([...match[2].matchAll(/([\w:-]+)="([^"]*)"/g)].map(x => [x[1], decode(x[2])]));
      const b = attrs.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
      return { ...attrs, rect: b ? { x: +b[1], y: +b[2], width: +b[3] - b[1], height: +b[4] - b[2] } : null };
    });
    assert.ok(nodes.length > 0 && nodes[0].rect, 'native hierarchy must expose window bounds');
    const byId = Object.fromEntries(nodes.filter(n => n['resource-id']?.startsWith(PACKAGE + ':id/')).map(n => [n['resource-id'].split('/')[1], n]));
    return { nodes, byId, screen: nodes[0].rect, source };
  }
  async tapObserved(observation, name) {
    const node = observation.byId[name];
    assert.ok(node && node.package === PACKAGE && node.displayed !== 'false' && node.enabled === 'true', 'visible enabled native target required: ' + name);
    const rect = node.rect, screen = observation.screen;
    assert.ok(rect && rect.width >= this.density * 48 - 1 && rect.height >= this.density * 48 - 1, 'native 48dp target required: ' + name + ' ' + JSON.stringify(rect));
    assert.ok(rect.x >= screen.x && rect.y >= screen.y && rect.x + rect.width <= screen.x + screen.width && rect.y + rect.height <= screen.y + screen.height, 'native target clipped: ' + name);
    await this.foreground();
    const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
    appendFileSync(join(this.directory, this.name + '.ndjson'), JSON.stringify({ at: new Date().toISOString(), type: 'physical_adb_tap', resource: name, rect, x, y, observedText: node.text }) + '\n');
    this.adb('shell', 'input', 'tap', String(x), String(y));
  }
  async reveal(name) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const o = await this.observe(), target = o.byId[name], r = target?.rect;
      if (r && target.displayed !== 'false' && r.height >= this.density * 48 - 1 && r.y + r.height <= o.screen.y + o.screen.height) return o;
      const scroll = o.nodes.find(n => n.package === PACKAGE && n.class === 'android.widget.ScrollView' && n.scrollable === 'true');
      assert.ok(scroll?.rect, 'no visible native scroll container for ' + name);
      const b = scroll.rect, x = Math.round(b.x + b.width / 2), from = Math.round(b.y + b.height * .8), to = Math.round(b.y + b.height * .25);
      await this.foreground();
      appendFileSync(join(this.directory, this.name + '.ndjson'), JSON.stringify({ at: new Date().toISOString(), type: 'physical_adb_swipe', toReveal: name, x, from, to }) + '\n');
      this.adb('shell', 'input', 'swipe', String(x), String(from), String(x), String(to), '400'); await pause(200);
    }
    throw new Error('native target not fully revealed: ' + name);
  }
  async screenshot(path) {
    await this.foreground();
    writeFileSync(path, this.adb('exec-out', 'screencap', '-p'));
  }
  async record(label, start) {
    if (start) {
      await this.command('POST', '/appium/start_recording_screen', { options: { timeLimit: 180, videoSize: '1280x592', bitRate: 1500000, forceRestart: true } });
      this.recordingLabel = label;
    }
    else {
      const data = await this.command('POST', '/appium/stop_recording_screen', { options: {} });
      assert.ok(typeof data === 'string' && data.length > 100);
      writeFileSync(join(this.directory, this.name + '-' + label + '.mp4'), Buffer.from(data, 'base64'));
      this.recordingLabel = null;
    }
  }
  async stop() {
    if (this.id) {
      try { if (this.recordingLabel) await this.record('interrupted-' + this.recordingLabel, false); }
      finally { try { await this.command('DELETE', ''); } finally { this.id = null; } }
    }
  }
}
