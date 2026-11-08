import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { seeded } from './cards.js';
import { RuleError } from './game.js';
import { RULE_VERSION } from './rules.js';
import { Rooms, validateToken, type RoomOptions } from './rooms.js';
import { Store } from './store.js';
import type { Action, ActionType, Room } from './model.js';
import { isDifficulty } from './policy.js';

const ACTIONS: ActionType[] = ['start', 'next', 'restart', 'play', 'pass', 'return', 'auto', 'resume', 'switch', 'leave', 'difficulty'];
function parseAction(value: unknown): Action {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RuleError('INPUT', '操作格式不对');
  const x = value as Record<string, unknown>;
  if (!ACTIONS.includes(x.type as ActionType) || typeof x.actionId !== 'string' || !/^[A-Za-z0-9_-]{12,80}$/.test(x.actionId) || !Number.isSafeInteger(x.expectedVersion) || (x.expectedVersion as number) < 1) throw new RuleError('INPUT', '请重新操作');
  if (x.ids !== undefined && (!Array.isArray(x.ids) || x.ids.length > 10 || x.ids.some(id => !Number.isInteger(id) || id < 0 || id >= 108))) throw new RuleError('INPUT', '选牌格式不对');
  if (x.patternId !== undefined && (typeof x.patternId !== 'string' || x.patternId.length > 60)) throw new RuleError('INPUT', '牌型格式不对');
  if (x.seat !== undefined && (!Number.isInteger(x.seat) || (x.seat as number) < 0 || (x.seat as number) > 3)) throw new RuleError('INPUT', '座位格式不对');
  if (x.roundId !== undefined && x.roundId !== null && (typeof x.roundId !== 'string' || x.roundId.length > 80)) throw new RuleError('INPUT', '牌局标记不对');
  if (x.type === 'difficulty' && !isDifficulty(x.difficulty)) throw new RuleError('INPUT', '请选择轻松、标准或进阶');
  return { type: x.type as ActionType, actionId: x.actionId, expectedVersion: x.expectedVersion as number,
    ids: x.ids as number[] | undefined, patternId: x.patternId as string | undefined, seat: x.seat as number | undefined, roundId: x.roundId as string | null | undefined,
    ...(x.type === 'difficulty' ? { difficulty: x.difficulty as Action['difficulty'] } : {}) };
}
function authToken(req: IncomingMessage): string {
  const value = req.headers.authorization;
  return validateToken(value?.startsWith('Bearer ') ? value.slice(7) : undefined);
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new RuleError('INPUT', '请使用正常页面操作');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new RuleError('INPUT', '操作内容过多'); chunks.push(chunk); }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new RuleError('INPUT', '没有读懂操作，请重试'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new RuleError('INPUT', '操作格式不对');
  return parsed as Record<string, unknown>;
}
function sameOrigin(req: IncomingMessage): boolean {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
export interface AppOptions extends RoomOptions {
  dbPath?: string; port?: number; host?: string; staticDir?: string;
  testControlToken?: string; auditPath?: string;
}
export function createApp(options: AppOptions = {}) {
  const store = new Store(options.dbPath ?? resolve('data/guandan.sqlite'));
  const events: Record<string, unknown>[] = [];
  const audit = options.auditPath || options.testControlToken || options.audit ? (event: Record<string, unknown>) => {
    const entry = { ...event, at: Date.now() };
    if (options.testControlToken) { events.push(entry); if (events.length > 3000) events.shift(); }
    if (options.auditPath) appendFileSync(options.auditPath, JSON.stringify(entry) + '\n', { mode: 0o600 });
    options.audit?.(entry);
  } : undefined;
  if (options.auditPath) mkdirSync(dirname(options.auditPath), { recursive: true, mode: 0o700 });
  const rooms = new Rooms(store, { ...options, audit });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const clients = new Map<string, { ws: WebSocket; code: string; token: string; alive: boolean }>();
  const attempts = new Map<string, { since: number; count: number }>();
  const staticDir = options.staticDir ?? fileURLToPath(new URL('../../public/', import.meta.url));
  const files: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'],
    '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/icon.svg': ['icon.svg', 'image/svg+xml']
  };
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    let path = '';
    try {
      path = new URL(req.url ?? '/', 'http://local.test').pathname;
      if (req.method === 'POST' && !sameOrigin(req)) { json(res, 403, { error: '请从牌桌页面操作', code: 'ORIGIN' }); return; }
      if (path === '/api/health' && req.method === 'GET') { json(res, 200, { ok: true, ruleVersion: RULE_VERSION }); return; }
      // A local-only explicit test capability. Absent in normal startup.
      if (path.startsWith('/__test/')) {
        if (!options.testControlToken || req.headers['x-test-control'] !== options.testControlToken || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) { json(res, 404, { error: '没有这个页面' }); return; }
        const match = /^\/__test\/rooms\/(\d{8})$/.exec(path);
        if (req.method === 'GET' && match) {
          const room = rooms.rooms.get(match[1]);
          if (!room) { json(res, 404, { error: '没有这张桌' }); return; }
          json(res, 200, { room, events: events.filter(e => e.room === room.code) }); return;
        }
        json(res, 404, { error: '没有这个页面' }); return;
      }
      if (path === '/api/session' && req.method === 'GET') {
        const found = rooms.find(authToken(req));
        if (!found) throw new RuleError('AUTH', '请重新加入牌桌');
        json(res, 200, { view: rooms.view(found.room, found.seat) }); return;
      }
      const route = /^\/api\/rooms(?:\/(\d{8})\/(join|action|preview|hint))?$/.exec(path);
      if (route && req.method === 'POST') {
        const token = authToken(req), input = await body(req);
        const routeName = route[2] ?? 'create';
        const key = routeName === 'create' || routeName === 'join' ? 'join:' + req.socket.remoteAddress : 'action:' + token;
        const now = Date.now(); let limit = attempts.get(key);
        if (!limit || now - limit.since > 60_000) { limit = { since: now, count: 0 }; attempts.set(key, limit); }
        if (++limit.count > (routeName === 'create' || routeName === 'join' ? 60 : 600)) { json(res, 429, { error: '操作有点快，请稍等', code: 'RATE' }); return; }
        if (attempts.size > 10_000) for (const [key, value] of attempts) if (now - value.since > 60_000) attempts.delete(key);
        if (routeName === 'create') { json(res, 200, { view: rooms.create(token, input.name) }); return; }
        if (routeName === 'join') { json(res, 200, { view: rooms.join(route[1], token, input.name) }); return; }
        if (routeName === 'action') { json(res, 200, rooms.action(route[1], token, parseAction(input))); return; }
        if (routeName === 'hint') {
          if (!Number.isSafeInteger(input.cursor) || (input.cursor as number) < 0 || (input.cursor as number) > 100_000) throw new RuleError('INPUT', '请重新点击提示');
          json(res, 200, rooms.hint(route[1], token, input.cursor as number)); return;
        }
        if (!Array.isArray(input.ids) || input.ids.length > 10 || input.ids.some(id => !Number.isInteger(id) || id < 0 || id >= 108)) throw new RuleError('INPUT', '请重新选牌');
        json(res, 200, rooms.preview(route[1], token, input.ids)); return;
      }
      if (req.method === 'GET' && files[path]) {
        const [name, type] = files[path];
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(readFileSync(resolve(staticDir, name))); return;
      }
      json(res, 404, { error: '没有这个页面' });
    } catch (error) {
      if (res.writableEnded) return;
      if (error instanceof RuleError) {
        let view;
        try { const found = rooms.find(authToken(req)); if (found) view = rooms.view(found.room, found.seat); } catch { /* no unauthorized projection */ }
        const status = error.code === 'AUTH' ? 401 : ['STALE', 'TURN', 'ROUND', 'FULL'].includes(error.code) ? 409 : 400;
        json(res, status, { error: error.message, code: error.code, ...(view ? { view } : {}) });
      } else { console.error('request failed'); json(res, 500, { error: '暂时没有处理成功，请重试', code: 'SERVER' }); }
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !sameOrigin(req)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', (ws: WebSocket) => {
    let key: string | null = null;
    const deadline = setTimeout(() => { if (!key) ws.close(1008, 'authentication required'); }, 5000);
    ws.on('error', () => {});
    ws.on('message', data => {
      if (key) return;
      try {
        const message = JSON.parse(data.toString());
        if (message.type !== 'authenticate' || typeof message.room !== 'string') throw new Error('invalid authentication');
        const token = validateToken(message.token), found = rooms.auth(message.room, token);
        key = found.player.playerId;
        const old = clients.get(key); if (old) old.ws.close(4001, 'seat opened elsewhere');
        clients.set(key, { ws, code: message.room, token, alive: true });
        clearTimeout(deadline); rooms.connected(message.room, token, true);
        ws.send(JSON.stringify({ type: 'state', view: rooms.view(found.room, found.seat) }));
      } catch { ws.close(1008, 'authentication failed'); }
    });
    ws.on('pong', () => { if (key) { const client = clients.get(key); if (client?.ws === ws) client.alive = true; } });
    ws.on('close', () => {
      clearTimeout(deadline);
      if (!key) return;
      const current = clients.get(key);
      if (!current || current.ws !== ws) return;
      clients.delete(key);
      try { rooms.connected(current.code, current.token, false); } catch { /* seat was released */ }
    });
  });
  rooms.onChange = (room: Room) => {
    for (const [key, client] of clients) if (client.code === room.code && client.ws.readyState === WebSocket.OPEN) {
      try { const { seat } = rooms.auth(room.code, client.token); client.ws.send(JSON.stringify({ type: 'state', view: rooms.view(room, seat) })); }
      catch { clients.delete(key); client.ws.close(4002, 'seat released'); }
    }
  };
  const heartbeat = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.alive) { client.ws.terminate(); continue; }
      client.alive = false; client.ws.ping();
    }
  }, 15_000);
  heartbeat.unref();
  return {
    server, rooms,
    async listen(): Promise<number> {
      const host = options.host ?? '127.0.0.1';
      if (options.testControlToken && !['127.0.0.1', '::1'].includes(host)) throw new Error('test service must bind loopback');
      await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(options.port ?? 3210, host, () => { server.off('error', fail); ok(); }); });
      rooms.startTimers(); return (server.address() as { port: number }).port;
    },
    async close(): Promise<void> {
      clearInterval(heartbeat); await rooms.close();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>(ok => server.close(() => ok()));
      wss.close(); store.close();
    }
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const testToken = process.env.GUANDAN_TEST_CONTROL;
  if (testToken && !/^[A-Za-z0-9_-]{40,100}$/.test(testToken)) throw new Error('test control capability must be at least 40 characters');
  const parse = (name: string, fallback: number) => { const value = process.env[name]; if (value === undefined) return fallback; const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid ' + name); return n; };
  const app = createApp({ host: process.env.GUANDAN_HOST ?? '127.0.0.1', port: parse('GUANDAN_PORT', 3210),
    dbPath: resolve(process.env.GUANDAN_DATA_DIR ?? 'data', 'guandan.sqlite'),
    botDelay: parse('GUANDAN_BOT_DELAY_MS', 750), disconnectGrace: parse('GUANDAN_GRACE_MS', 20_000),
    testControlToken: testToken, auditPath: process.env.GUANDAN_AUDIT_PATH,
    ...(testToken && process.env.GUANDAN_TEST_SEED ? { random: seeded(Number(process.env.GUANDAN_TEST_SEED)), firstSeat: () => 0 } : {}) });
  await app.listen(); console.log('Guandan listening. Open the configured host and port in a browser.');
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!closing) { closing = true; void app.close().then(() => process.exit(0)); } });
}
