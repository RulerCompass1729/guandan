import { test, expect, chromium, type Browser, type Page, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { View } from '../../src/model.js';

const base = 'http://127.0.0.1:3211';
interface Client { context: BrowserContext; page: Page; states: View[]; errors: string[]; }
async function newClient(browser: Browser, directory: string): Promise<Client> {
  mkdirSync(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true,
    recordVideo: { dir: directory, size: { width: 844, height: 390 } } });
  await context.tracing.start({ screenshots: true, snapshots: true });
  context.setDefaultTimeout(7000);
  const page = await context.newPage(), states: View[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', ws => ws.on('framereceived', event => {
    try { const data = JSON.parse(String(event.payload)); if (data.type === 'state') states.push(data.view); } catch { /* non-state frames */ }
  }));
  return { context, page, states, errors };
}
async function state(page: Page) {
  return page.locator('#app').evaluate(node => ({ stage: (node as HTMLElement).dataset.stage!,
    self: Number((node as HTMLElement).dataset.self), turn: Number((node as HTMLElement).dataset.turn),
    version: Number((node as HTMLElement).dataset.version), connected: (node as HTMLElement).dataset.connected === 'true',
    round: Number((node as HTMLElement).dataset.round) }));
}
async function drive(pages: Page[], steps: { seat: number; from: number; to: number; action: string }[], throughRound = 1) {
  const end = Date.now() + 150_000;
  while (Date.now() < end) {
    const all = await Promise.all(pages.map(state));
    if (all.every(s => ['roundOver', 'matchOver'].includes(s.stage) && s.round >= throughRound)) return;
    let advanced = false;
    for (let i = 0; i < pages.length; i++) {
      const s = all[i], page = pages[i];
      if (!s.connected || !['playing', 'tribute'].includes(s.stage)) continue;
      const hint = page.locator('#hint');
      let enabled;
      try { enabled = await hint.isEnabled({ timeout: 400 }); }
      catch (error) { if ((await state(page)).stage !== s.stage) continue; throw error; }
      if (!enabled) continue;
      const version = s.version;
      await hint.click();
      await expect.poll(async () => await page.locator('#play').isEnabled() || (await page.locator('.live-message').innerText()).startsWith('这手压不过')).toBe(true);
      const canPlay = await page.locator('#play').isEnabled();
      await page.locator(canPlay ? '#play' : '#pass').click();
      await expect.poll(async () => (await state(page)).version).toBeGreaterThan(version);
      steps.push({ seat: s.self, from: version, to: (await state(page)).version, action: canPlay ? s.stage === 'tribute' ? 'return' : 'play' : 'pass' });
      advanced = true; break;
    }
    if (!advanced) await new Promise(ok => setTimeout(ok, 12));
  }
  throw new Error('UI game did not finish within its budget');
}
const scenarios = [
  ...[1, 2, 3, 4].map(count => ({ count, id: `players-${count}`, move: null as { player: number; seat: number } | null })),
  { count: 2, id: 'two-same-team', move: { player: 1, seat: 2 } },
  { count: 3, id: 'ai-at-two', move: { player: 2, seat: 3 } },
  { count: 3, id: 'ai-at-one', move: { player: 1, seat: 3 } },
  { count: 3, id: 'ai-at-zero', move: { player: 0, seat: 3 } },
  { count: 1, id: 'solo-at-three', move: { player: 0, seat: 3 } }
];
for (const scenario of scenarios) {
  const count = scenario.count;
  test(`${count} human seats plus ${4 - count} actual AI seats complete a shared round (${scenario.id})`, async ({ browser }) => {
    const directory = resolve(`.local/browser-evidence/${process.env.GUANDAN_BROWSER_RUN}/${scenario.id}`);
    const clients: Client[] = [], steps: { seat: number; from: number; to: number; action: string }[] = [];
    try {
      for (let i = 0; i < count; i++) clients.push(await newClient(browser, resolve(directory, String(i))));
      const host = clients[0].page;
      await host.goto(base); await host.getByLabel('怎么称呼你').fill('牌友甲'); await host.getByRole('button', { name: '建一桌', exact: true }).click();
      const code = await host.locator('#room-code').innerText();
      for (let i = 1; i < count; i++) {
        const page = clients[i].page;
        await page.goto(base + '/#room=' + code); await page.getByLabel('怎么称呼你').fill('牌友' + i);
        await page.getByRole('button', { name: '加入牌桌', exact: true }).click();
        await expect(page.locator('#header-code')).toHaveText(code);
      }
      if (scenario.move) {
        await clients[scenario.move.player].page.locator(`[data-sit="${scenario.move.seat}"]`).click();
        await expect.poll(async () => (await state(clients[scenario.move!.player].page)).self).toBe(scenario.move.seat);
      }
      await expect(host.locator('#start-game')).toBeEnabled(); await host.locator('#start-game').click();
      for (const client of clients) await expect.poll(async () => (await state(client.page)).stage).toBe('playing');
      await host.screenshot({ path: resolve(directory, 'initial.png'), fullPage: true });
      await drive(clients.map(c => c.page), steps);
      for (const client of clients) {
        await expect(client.page.locator('#next-game')).toBeVisible();
        expect(client.errors).toEqual([]);
        expect(client.states.every(v => !('hands' in v) && !JSON.stringify(v).includes('tokenHash'))).toBe(true);
      }
      const last = clients.map(c => c.states.at(-1)!);
      expect(new Set(last.map(v => v.version)).size).toBe(1);
      expect(new Set(last.map(v => JSON.stringify(v.result))).size).toBe(1);
      const initial = clients.map(c => c.states.find(v => v.stage === 'playing' && v.hand.length === 27)!);
      expect(initial.every(Boolean)).toBe(true);
      expect(new Set(initial.flatMap(v => v.hand.map(c => c.id))).size).toBe(count * 27);
      const audit = await (await fetch(`${base}/__test/rooms/${code}`, { headers: { 'x-test-control': process.env.GUANDAN_TEST_CONTROL! } })).json();
      const inputs = audit.events.filter((event: { type: string }) => event.type === 'ai_input');
      const accepted = audit.events.filter((event: { type: string }) => event.type === 'ai_accepted');
      expect(accepted.length > 0).toBe(count < 4);
      expect(inputs.every((event: { observation: Record<string, unknown> }) => !('hands' in event.observation))).toBe(true);
      writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify({ count, code, steps, states: clients.map(c => c.states), audit }, null, 2));
      await host.locator('#next-game').click();
      await expect.poll(async () => (await state(host)).round).toBe(2);
      for (const client of clients) await expect.poll(async () => (await state(client.page)).round).toBe(2);
    } finally {
      for (let i = 0; i < clients.length; i++) {
        await clients[i].context.tracing.stop({ path: resolve(directory, String(i), 'trace.zip') });
        await clients[i].context.close();
      }
    }
  });
}

test('selection cancellation, reload and real offline recovery retain the original seat', async ({ browser }) => {
  const client = await newClient(browser, resolve(`.local/browser-evidence/${process.env.GUANDAN_BROWSER_RUN}/recovery`));
  try {
    await client.page.goto(base); await client.page.getByRole('button', { name: '建一桌', exact: true }).click();
    const code = await client.page.locator('#room-code').innerText();
    await client.page.locator('#start-game').click();
    const card = client.page.locator('.playing-card').first();
    await card.click(); await expect(card).toHaveAttribute('aria-pressed', 'true');
    await card.click(); await expect(card).toHaveAttribute('aria-pressed', 'false');
    const before = client.states.at(-1)!;
    await client.page.reload(); await expect(client.page.locator('#header-code')).toHaveText(code);
    await expect.poll(async () => (await state(client.page)).connected).toBe(true);
    expect(client.states.at(-1)!.hand).toEqual(before.hand);
    await client.context.setOffline(true);
    await new Promise(ok => setTimeout(ok, 1200));
    await client.context.setOffline(false);
    await expect.poll(async () => (await state(client.page)).connected).toBe(true);
    expect(client.states.at(-1)!.self).toBe(before.self);
    expect(client.states.at(-1)!.roundId).toBe(before.roundId);
    expect(client.errors).toEqual([]);
  } finally { await client.context.tracing.stop({ path: resolve(`.local/browser-evidence/${process.env.GUANDAN_BROWSER_RUN}/recovery/trace.zip`) }); await client.context.close(); }
});

test('a committed play with a lost HTTP confirmation retries after reload without playing twice', async ({ browser }) => {
  const directory = resolve(`.local/browser-evidence/${process.env.GUANDAN_BROWSER_RUN}/lost-confirmation`);
  const clients: Client[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const client = await newClient(browser, resolve(directory, String(i)));
      await client.context.addInitScript(() => {
        const native = WebSocket;
        const harness = window as unknown as { testSockets: WebSocket[] };
        harness.testSockets = [];
        window.WebSocket = class extends native {
          constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); harness.testSockets.push(this); }
        };
      });
      clients.push(client);
    }
    const host = clients[0].page;
    await host.goto(base); await host.getByRole('button', { name: '建一桌', exact: true }).click();
    const code = await host.locator('#room-code').innerText();
    for (const { page } of clients.slice(1)) {
      await page.goto(base + '/#room=' + code); await page.getByRole('button', { name: '加入牌桌', exact: true }).click();
      await expect(page.locator('#header-code')).toHaveText(code);
    }
    await host.locator('#start-game').click();
    for (const { page } of clients) await expect.poll(async () => (await state(page)).stage).toBe('playing');
    const turn = (await state(host)).turn;
    const actor = clients[turn].page, before = clients[turn].states.at(-1)!;
    let allowRetry = false, committed = false;
    const attempts: { action: unknown; duplicate?: boolean; aborted: boolean }[] = [];
    await actor.route('**/api/rooms/*/action', async route => {
      const action = route.request().postDataJSON();
      if (action.type !== 'play') { await route.continue(); return; }
      if (committed && !allowRetry) { attempts.push({ action, aborted: true }); await route.abort('failed'); return; }
      const response = await route.fetch(); expect(response.ok()).toBe(true);
      const result = await response.json();
      attempts.push({ action, duplicate: result.duplicate, aborted: !committed });
      if (!committed) { committed = true; await route.abort('failed'); }
      else await route.fulfill({ response });
    });
    await actor.locator('.playing-card').first().click();
    await expect(actor.locator('#play')).toBeEnabled(); await actor.locator('#play').click();
    await expect(actor.locator('#retry-action')).toBeVisible();
    const pending = await actor.evaluate(() => JSON.parse(localStorage.getItem('guandan.pending.v1')!));
    expect(pending.type).toBe('play'); expect(pending.ids).toHaveLength(1);
    await expect(actor.locator('.playing-card')).toHaveCount(26);
    allowRetry = true;
    await actor.reload();
    await expect.poll(async () => (await state(actor)).connected).toBe(true);
    await expect.poll(() => actor.evaluate(() => localStorage.getItem('guandan.pending.v1'))).toBeNull();
    const after = clients[turn].states.at(-1)!;
    expect(after.self).toBe(before.self); expect(after.roundId).toBe(before.roundId);
    expect(after.hand.map(c => c.id)).toEqual(before.hand.filter(c => !pending.ids.includes(c.id)).map(c => c.id));
    expect(attempts.at(-1)!.duplicate).toBe(true);
    expect(attempts.every(a => (a.action as { actionId: string }).actionId === pending.actionId)).toBe(true);
    const audit = await (await fetch(`${base}/__test/rooms/${code}`, { headers: { 'x-test-control': process.env.GUANDAN_TEST_CONTROL! } })).json();
    expect(audit.events.filter((event: { type: string; actionId?: string }) => event.type === 'action' && event.actionId === pending.actionId)).toHaveLength(1);
    await actor.evaluate(old => {
      const harness = window as unknown as { testSockets: WebSocket[] };
      harness.testSockets.at(-1)!.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'state', view: old }) }));
    }, before);
    expect((await state(actor)).version).toBe(after.version);
    await expect(actor.locator('.playing-card')).toHaveCount(26);
    let actionsAfterCredentialLoss = 0;
    actor.on('request', request => { if (request.url().endsWith('/action')) actionsAfterCredentialLoss++; });
    await actor.evaluate(() => localStorage.clear()); await actor.reload();
    await expect(actor.getByRole('button', { name: '建一桌', exact: true })).toBeVisible();
    expect((await state(actor)).stage).toBe('home'); expect(await actor.locator('#play').count()).toBe(0);
    expect(actionsAfterCredentialLoss).toBe(0);
    expect(clients.flatMap(c => c.errors)).toEqual([]);
    writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify({ before, pending, attempts, after, audit,
      staleSnapshotIgnored: true, credentialLossReturnsHome: true, actionsAfterCredentialLoss }, null, 2));
  } finally {
    for (let i = 0; i < clients.length; i++) {
      await clients[i].context.tracing.stop({ path: resolve(directory, String(i), 'trace.zip') }); await clients[i].context.close();
    }
  }
});

test('a force-terminated browser reopens its persisted original seat', async ({ browser }) => {
  const directory = resolve(`.local/browser-evidence/${process.env.GUANDAN_BROWSER_RUN}/process-recovery`);
  mkdirSync(directory, { recursive: true });
  const profile = resolve(directory, 'profile'), peers: Client[] = [];
  let context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 851, height: 313 } });
  try {
    let page = context.pages()[0];
    await page.goto(base); await page.getByRole('button', { name: '建一桌', exact: true }).click();
    const code = await page.locator('#room-code').innerText();
    // Establish an existing on-disk credential, independently of browser write-back timing.
    await context.close();
    context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 851, height: 313 } });
    page = context.pages()[0]; await page.goto(base);
    await expect(page.locator('#header-code')).toHaveText(code);
    for (let i = 0; i < 3; i++) {
      const peer = await newClient(browser, resolve(directory, String(i))); peers.push(peer);
      await peer.page.goto(base + '/#room=' + code); await peer.page.getByRole('button', { name: '加入牌桌', exact: true }).click();
      await expect(peer.page.locator('#header-code')).toHaveText(code);
    }
    await page.locator('#start-game').click(); await expect(page.locator('.playing-card')).toHaveCount(27);
    const credential = await page.evaluate(() => JSON.parse(localStorage.getItem('guandan.session.v1')!).token);
    const inspect = async () => (await fetch(`${base}/__test/rooms/${code}`, { headers: { 'x-test-control': process.env.GUANDAN_TEST_CONTROL! } })).json();
    const before = await inspect();
    const ownedBrowser = context.browser()!;
    const cdp = await ownedBrowser.newBrowserCDPSession();
    const processes = await cdp.send('SystemInfo.getProcessInfo');
    const pid = Number(processes.processInfo.find(p => p.type === 'browser')!.id);
    expect(Number.isSafeInteger(pid) && pid > 1).toBe(true);
    expect(execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })).toContain('--user-data-dir=' + profile);
    process.kill(pid, 'SIGKILL');
    await expect.poll(() => ownedBrowser.isConnected()).toBe(false);
    context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 851, height: 313 } });
    page = context.pages()[0]; await page.goto(base);
    await expect(page.locator('#header-code')).toHaveText(code);
    await expect.poll(async () => (await state(page)).connected).toBe(true);
    expect((await state(page)).self).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('guandan.session.v1')!).token)).toBe(credential);
    const current = await inspect();
    if (current.room.seats[0].auto) { await page.locator('#resume-big').click(); await expect.poll(async () => (await inspect()).room.seats[0].auto).toBe(false); }
    const after = await inspect();
    expect(after.room.game.roundId).toBe(before.room.game.roundId);
    expect(after.room.round).toBe(before.room.round);
    const hand = await page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(n => Number((n as HTMLElement).dataset.cardId)).sort((a, b) => a - b));
    expect(hand).toEqual(after.room.game.hands[0].map((c: { id: number }) => c.id).sort((a: number, b: number) => a - b));
    writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify({ killedOwnedPid: pid, before, after, samePersistedCredential: true, hand }, null, 2));
  } finally {
    await context.close();
    for (let i = 0; i < peers.length; i++) { await peers[i].context.tracing.stop({ path: resolve(directory, String(i), 'trace.zip') }); await peers[i].context.close(); }
  }
});

test('dialogs keep keyboard focus, names remain text, and failed local save submits nothing', async ({ page }) => {
  await page.goto(base);
  await page.getByRole('button', { name: '玩法说明', exact: true }).click();
  await expect(page.getByRole('button', { name: '知道了', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '知道了', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '玩法说明', exact: true })).toBeFocused();
  await page.getByLabel('怎么称呼你').fill('<b>甲</b>'); await page.getByRole('button', { name: '建一桌', exact: true }).click();
  await expect(page.locator('.seat-name').filter({ hasText: '<b>甲</b>' })).toBeVisible();
  expect(await page.locator('.seat-name b').count()).toBe(0);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'guandan.pending.v1') throw new DOMException('test quota', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await page.locator('#start-game').click();
  await expect(page.locator('.live-message')).toContainText('尚未提交');
  await expect.poll(async () => (await state(page)).stage).toBe('waiting');
});

for (const height of [313, 292]) test(`compact landscape at ${height}px shows the whole initial hand and all play controls without covering cards`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 851, height }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(); await page.goto(base); await page.getByRole('button', { name: '建一桌', exact: true }).click();
    await page.locator('#start-game').click(); await expect(page.locator('.playing-card')).toHaveCount(27);
    const layout = await page.evaluate(() => {
      const card = document.querySelectorAll('.playing-card'), last = card[card.length - 1].getBoundingClientRect();
      const controls = document.querySelector('.controls')!.getBoundingClientRect();
      return { viewport: innerHeight, lastCardBottom: last.bottom, controlsTop: controls.top, controlsBottom: controls.bottom, scroll: scrollY };
    });
    expect(layout.scroll).toBe(0); expect(layout.lastCardBottom).toBeLessThanOrEqual(layout.controlsTop);
    expect(layout.controlsBottom).toBeLessThanOrEqual(layout.viewport);
    await expect(page.locator('#compact-auto')).toBeVisible();
    await page.locator('.playing-card').first().click();
    const selectedLayout = await page.locator('.controls').evaluate(node => ({ bottom: node.getBoundingClientRect().bottom, viewport: innerHeight }));
    expect(selectedLayout.bottom).toBeLessThanOrEqual(selectedLayout.viewport);
  } finally { await context.close(); }
});

test('blocked storage keeps the start screen usable and never sends an unsaved join', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem'] as const) Storage.prototype[method] = function () { throw new DOMException('blocked for test', 'SecurityError'); };
    });
    const page = await context.newPage(), errors: string[] = []; let creates = 0;
    page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.url().endsWith('/api/rooms') && request.method() === 'POST') creates++; });
    await page.goto(base); await expect(page.getByRole('button', { name: '建一桌', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '建一桌', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('没有保存座位');
    expect(creates).toBe(0); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('failed cache cleanup cannot replace an authentication explanation with a page crash', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) { return key === 'guandan.session.v1' ? JSON.stringify({ token: 'x'.repeat(64) }) : original.call(this, key); };
      Storage.prototype.removeItem = function () { throw new DOMException('blocked for test', 'SecurityError'); };
    });
    const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await expect(page.getByRole('status')).toContainText('重新加入牌桌'); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
