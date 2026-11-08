import { type Card, RANK_NAMES, SUIT_NAMES, wild } from './cards.js';
import type { View, Action, ActionType, Preview } from './model.js';
import type { Decision } from './policy.js';
import type { Pattern } from './rules.js';

const app = document.querySelector<HTMLDivElement>('#app')!;
const SESSION = 'guandan.session.v1', PENDING = 'guandan.pending.v1';
interface Session { token: string; code?: string; }
function read<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } }
function textStored(key: string): string { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
function forget(key: string): void { try { localStorage.removeItem(key); } catch { /* cleanup must not hide the original result */ } }
let session: Session | null = read(SESSION), pending: Action | null = read(PENDING);
let view: View | null = null, connected = false, busy = false, resolving = false;
let socket: WebSocket | null = null, retryTimer: ReturnType<typeof setTimeout> | null = null, retryCount = 0;
let selected = new Set<number>(), patterns: Pattern[] = [], chosen = '', hintCursor = 0;
let message = '', isError = false, modal: 'rules' | 'leave' | 'desktop' | null = null;
let modalReturnFocus: string | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
const suitSymbols = { S: '♠', H: '♥', C: '♣', D: '♦', J: '★' };
const e = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const rankName = (rank: number): string => String(RANK_NAMES[rank] ?? rank);
function randomId(bytes = 16): string {
  const values = new Uint8Array(bytes); crypto.getRandomValues(values);
  return [...values].map(x => x.toString(16).padStart(2, '0')).join('');
}
function saveSession(): void {
  try { if (session) localStorage.setItem(SESSION, JSON.stringify(session)); else localStorage.removeItem(SESSION); }
  catch { throw new Error('浏览器没有保存座位。请允许本网站存储数据后再加入'); }
}
function clearSession(): void {
  session = null; pending = null; view = null; selected.clear(); patterns = []; chosen = '';
  forget(SESSION); forget(PENDING);
  if (retryTimer) clearTimeout(retryTimer); retryTimer = null;
  if (socket) { socket.onclose = null; socket.close(); } socket = null; connected = false;
}
class ApiError extends Error { constructor(message: string, readonly code: string, readonly state?: View) { super(message); } }
async function api<T>(path: string, data?: unknown): Promise<T> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(path, { method: data === undefined ? 'GET' : 'POST',
      headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(session ? { Authorization: 'Bearer ' + session.token } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: controller.signal, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new ApiError(result.error ?? '暂时没处理成功，请重试', result.code ?? 'SERVER', result.view);
    return result as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error('暂时连不上牌桌，已保留座位，请稍后重试');
  } finally { clearTimeout(timeout); }
}
function tell(text: string, error = false): void { message = text; isError = error; render(); }
function accept(next: View): void {
  if (view && view.code === next.code && next.version < view.version) return;
  const changedStage = !view || view.code !== next.code || view.stage !== next.stage;
  if (!view || view.roundId !== next.roundId || view.self !== next.self) { selected.clear(); patterns = []; chosen = ''; hintCursor = 0; }
  view = next; selected = new Set([...selected].filter(id => next.hand.some(c => c.id === id)));
  if (session) { session.code = next.code; saveSession(); }
  render(); if (changedStage) window.scrollTo({ top: 0, behavior: 'auto' });
  if (selected.size && next.turn === next.self && next.stage === 'playing') schedulePreview();
}
function connect(): void {
  if (!session?.code) return;
  if (retryTimer) clearTimeout(retryTimer); retryTimer = null;
  if (socket) { socket.onclose = null; socket.close(); }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket = ws; connected = false; render();
  ws.onopen = () => ws.send(JSON.stringify({ type: 'authenticate', room: session?.code, token: session?.token }));
  ws.onmessage = event => {
    if (socket !== ws) return;
    try { const data = JSON.parse(event.data); if (data.type !== 'state') return;
      connected = true; retryCount = 0; accept(data.view); if (pending) void resolvePending();
    } catch { tell('收到的牌桌信息不完整，正在重新连接', true); ws.close(); }
  };
  ws.onerror = () => {};
  ws.onclose = event => {
    if (socket !== ws) return; connected = false;
    if (event.code === 4002) { clearSession(); render(); return; }
    if (event.code === 4001) { tell('这个座位已在另一窗口打开。需要在这里继续时，点重新连接', true); return; }
    render(); if (session?.code) retryTimer = setTimeout(connect, Math.min(5000, 500 * 2 ** retryCount++));
  };
}
async function join(create: boolean): Promise<void> {
  if (busy) return;
  const name = $<HTMLInputElement>('nickname')?.value.trim() ?? '';
  const code = $<HTMLInputElement>('join-code')?.value.replace(/\s/g, '') ?? '';
  if (!create && !/^\d{8}$/.test(code)) { tell('请输入8位牌桌号', true); return; }
  busy = true;
  try {
    if (!session) session = { token: randomId(32) };
    saveSession(); localStorage.setItem('guandan.name', name);
    const result = await api<{ view: View }>(create ? '/api/rooms' : `/api/rooms/${code}/join`, { name });
    message = ''; accept(result.view); history.replaceState(null, '', location.pathname); connect();
  } catch (error) { handleError(error); } finally { busy = false; render(); }
}
function actionable(action: Action, state: View): boolean {
  if (['play', 'pass'].includes(action.type)) return state.stage === 'playing' && state.roundId === action.roundId && state.turn === state.self && !state.seats[state.self].auto && (action.ids?.every(id => state.hand.some(c => c.id === id)) ?? true);
  if (action.type === 'return') return state.stage === 'tribute' && state.roundId === action.roundId && action.ids?.length === 1 && state.returnIds.includes(action.ids[0]);
  if (action.type === 'next') return state.stage === 'roundOver';
  if (action.type === 'restart') return state.stage === 'matchOver';
  if (action.type === 'start' || action.type === 'switch') return state.stage === 'waiting';
  return true;
}
async function resolvePending(): Promise<void> {
  if (!pending || !session?.code || resolving) return;
  resolving = true; busy = true; render(); const action = pending;
  try {
    let result;
    try { result = await api<{ view: View | null; duplicate: boolean }>(`/api/rooms/${session.code}/action`, action); }
    catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'STALE' || !error.state || !actionable(action, error.state)) throw error;
      accept(error.state); action.expectedVersion = error.state.version; localStorage.setItem(PENDING, JSON.stringify(action));
      result = await api<{ view: View | null; duplicate: boolean }>(`/api/rooms/${session.code}/action`, action);
    }
    pending = null; forget(PENDING); message = ''; isError = false;
    selected.clear(); patterns = []; chosen = ''; hintCursor = 0;
    if (result.view) accept(result.view); else clearSession();
  } catch (error) {
    if (error instanceof ApiError) { pending = null; forget(PENDING); if (error.state) accept(error.state); }
    handleError(error);
  } finally { resolving = false; busy = false; render(); }
}
async function act(type: ActionType, extra: Partial<Action> = {}): Promise<void> {
  if (!view || busy || pending) return;
  pending = { type, actionId: randomId(), expectedVersion: view.version, roundId: view.roundId, ...extra };
  try { localStorage.setItem(PENDING, JSON.stringify(pending)); }
  catch { pending = null; tell('浏览器没有保存这次操作，尚未提交，请检查存储空间后重试', true); return; }
  await resolvePending();
}
function handleError(error: unknown): void {
  if (error instanceof ApiError && error.state) accept(error.state);
  if (error instanceof ApiError && error.code === 'AUTH') clearSession();
  tell(error instanceof Error ? error.message : '暂时没有处理成功，请重试', true);
}
function schedulePreview(): void {
  if (previewTimer) clearTimeout(previewTimer);
  if (!view || view.stage !== 'playing' || !selected.size) { patterns = []; chosen = ''; updateSelection(); return; }
  const key = [...selected].sort((a, b) => a - b).join(','), round = view.roundId, version = view.version;
  previewTimer = setTimeout(() => {
    void api<Preview>(`/api/rooms/${view!.code}/preview`, { ids: [...selected] }).then(data => {
      if (!view || view.roundId !== round || view.version !== version || [...selected].sort((a, b) => a - b).join(',') !== key) return;
      patterns = data.patterns; if (!patterns.some(p => p.id === chosen)) chosen = patterns[0]?.id ?? ''; updateSelection();
    }).catch(() => { patterns = []; chosen = ''; updateSelection(); });
  }, 70);
}
async function hint(): Promise<void> {
  if (!view || busy) return; const version = view.version;
  try {
    const result = await api<Decision & { total: number }>(`/api/rooms/${view.code}/hint`, { cursor: hintCursor++ });
    if (view.version !== version) { tell('牌桌已更新，请再点一次提示'); return; }
    selected = new Set(result.ids ?? []); chosen = result.patternId ?? '';
    if (!result.total) tell('这手压不过，可以点不要');
    else { message = '已选好候选牌，请确认；再次点提示可换一手'; isError = false; render(); schedulePreview(); }
  } catch (error) { handleError(error); }
}
function toggleCard(id: number): void {
  if (!view || busy || view.seats[view.self].auto) return;
  if (view.stage === 'tribute') { if (!view.returnIds.includes(id)) return; selected = selected.has(id) ? new Set() : new Set([id]); }
  else if (selected.has(id)) selected.delete(id);
  else { if (selected.size >= 10) { tell('一手最多选10张牌', true); return; } selected.add(id); }
  chosen = ''; patterns = [];
  document.querySelectorAll<HTMLButtonElement>('.playing-card').forEach(button => {
    const on = selected.has(Number(button.dataset.cardId)); button.classList.toggle('selected', on); button.setAttribute('aria-pressed', String(on));
  });
  updateSelection(); schedulePreview();
}

function cardHTML(card: Card, mini = false, pattern?: Pattern): string {
  const isWild = view && wild(card, view.level), red = card.suit === 'H' || card.suit === 'D' || card.rank === 17;
  const rank = RANK_NAMES[card.rank] ?? card.rank, substitution = pattern?.substitutions.find(s => s.id === card.id);
  if (mini) return `<span class="mini-card ${red ? 'red' : ''}"><span>${e(rank)}${card.rank < 16 ? suitSymbols[card.suit] : ''}</span>${substitution ? `<small>作${e(rankName(substitution.rank))}</small>` : ''}</span>`;
  const ineligible = view?.stage === 'tribute' && !view.returnIds.includes(card.id);
  const description = SUIT_NAMES[card.suit] + rank + (isWild ? '，红桃配牌' : '');
  return `<button type="button" id="card-${card.id}" data-card-id="${card.id}" aria-label="${e(description)}" aria-pressed="${selected.has(card.id)}" class="playing-card ${red ? 'red' : ''} ${card.rank >= 16 ? 'joker' : ''} ${selected.has(card.id) ? 'selected' : ''} ${ineligible ? 'ineligible' : ''}" ${ineligible ? 'disabled' : ''}><span class="rank">${e(rank)}</span><span class="suit" aria-hidden="true">${suitSymbols[card.suit]}</span>${isWild ? '<span class="wild-label">配</span>' : ''}</button>`;
}
function seatHTML(index: number, position: string): string {
  const s = view!.seats[index], self = index === view!.self, mate = index === (view!.self + 2) % 4;
  const finish = s.finish === 5 ? '双下' : s.finish ? ['头游', '二游', '三游', '末游'][s.finish - 1] : '';
  const type = s.kind === 'empty' ? '空位' : s.kind === 'ai' ? '电脑牌友' : s.auto ? '电脑代打' : s.connected ? '已入座' : '暂时离线';
  const active = view!.stage === 'playing' && view!.turn === index || view!.stage === 'tribute' && view!.tribute.some(t => t.receiver === index && !t.done);
  const canSit = view!.stage === 'waiting' && !self && s.kind !== 'human';
  return `<div class="seat ${position} ${active ? 'active' : ''}" data-seat="${index}"><div class="seat-name">${e(s.name)}${self ? '（你）' : ''}</div><span class="seat-label">${self ? '本家' : mate ? '你的队友' : '另一队'}</span><div class="seat-sub">${finish || (view!.stage === 'waiting' ? type : `${s.count}张 · ${type}`)}</div>${canSit ? `<button data-sit="${index}">坐这里</button>` : ''}</div>`;
}
function renderHome(): string {
  const invite = new URLSearchParams(location.hash.slice(1)).get('room') ?? '';
  const name = textStored('guandan.name');
  return `<main class="home">
    <header class="home-top"><div class="brand"><span class="brand-mark" aria-hidden="true">♠</span><div><h1>掼蛋</h1><p>一张桌，亲友一起玩</p></div></div><button id="rules-open" class="subtle">玩法说明</button></header>
    <section class="home-intro"><p class="eyebrow">亲友牌桌</p><h2>人齐就一起，<br>缺人电脑来凑。</h2><p>四个座位，对家合作。记住牌桌，下次打开接着玩。</p></section>
    ${message ? `<div role="status" class="status ${isError ? 'error' : ''}">${e(message)}</div>` : ''}
    ${session?.code ? '<button class="primary full" id="return-room">回到我的牌桌</button>' : ''}
    <div class="name-field"><label for="nickname">怎么称呼你</label><input id="nickname" maxlength="12" autocomplete="nickname" placeholder="输入称呼（可不填）" value="${e(name)}"><p class="field-note">不必注册账号，座位会保存在这个浏览器。</p></div>
    <div class="home-grid"><section class="home-card"><h3>我来建一桌</h3><p>把牌桌号告诉亲友，人不够也能开局。</p><button id="create-room" class="primary full" ${busy ? 'disabled' : ''}>建一桌</button></section>
    <section class="home-card"><h3>加入亲友的桌</h3><label for="join-code" class="sr-only">8位牌桌号</label><input id="join-code" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="输入8位牌桌号" value="${e(/^\d{8}$/.test(invite) ? invite : '')}"><button id="join-room" class="full" ${busy ? 'disabled' : ''}>加入牌桌</button></section></div>
    <footer class="home-foot"><span>RulerCompass1729 · 掼蛋</span><button id="desktop-open" class="subtle">下次怎样快速打开</button></footer></main>`;
}
function renderRoom(): string {
  const v = view!, me = v.seats[v.self], myTurn = v.stage === 'playing' && v.turn === v.self;
  const ended = v.stage === 'roundOver' || v.stage === 'matchOver', ownTeam = v.self % 2;
  let center = '<p class="board-note">对家合作，先出完牌</p>';
  if (v.stage === 'waiting') center = '<p class="turn-label">等亲友入座</p><p class="board-note">不满四人，电脑补齐</p>';
  else if (v.stage === 'tribute') center = '<p class="turn-label">进贡与还牌</p><p class="board-note">完成还牌后开始出牌</p>';
  else if (ended) center = `<p class="turn-label">${v.stage === 'matchOver' ? '这一场打完了' : '这一副打完了'}</p>`;
  else {
    const last = v.last && 'cards' in v.last ? v.last : null;
    center = `<div class="turn-label" id="turn-label">${myTurn ? '轮到你出牌' : `轮到 ${e(v.seats[v.turn]?.name ?? '亲友')}`}</div>${last ? `<div class="mini-cards">${last.cards.map(c => cardHTML(c, true, last.pattern)).join('')}</div><p class="last-name">${e(v.seats[last.seat].name)} · ${e(last.pattern.name)}</p>` : '<p class="board-note">这一手可以先出任意牌型</p>'}`;
  }
  let content = '';
  if (v.stage === 'waiting') content = `<section class="invite-block"><p>把8位牌桌号告诉亲友</p><div class="big-code" id="room-code">${e(v.code)}</div><div class="invite-actions"><button id="copy-room">复制牌桌号</button>${v.host === v.self ? `<button class="primary" id="start-game" ${!connected || busy ? 'disabled' : ''}>开始，空位电脑补齐</button>` : '<p>等房主开始，也可以先换到对家座位。</p>'}</div></section>`;
  else if (ended) {
    const r = v.result!, winnerIsOurs = r.winner === ownTeam;
    content = `<section class="result-panel" aria-labelledby="result-title"><p class="eyebrow">第${v.round}副 · 共同结算</p><h2 id="result-title">${v.stage === 'matchOver' ? (r.matchWinner === ownTeam ? '你们打过A了' : '对方打过A了') : winnerIsOurs ? `你和对家升${r.upgrade}级` : `对方升${r.upgrade}级`}</h2><p class="muted">你们打 ${rankName(v.levels[ownTeam])} · 对方打 ${rankName(v.levels[1 - ownTeam])}</p><div class="result-order">${r.order.map((seat, index) => `<div class="result-person"><strong>${r.doubleDown && index >= 2 ? '双下' : ['头游', '二游', '三游', '末游'][index]}</strong>${e(v.seats[seat].name)}</div>`).join('')}</div><button id="next-game" class="primary" ${busy || !connected ? 'disabled' : ''}>${v.stage === 'matchOver' ? '重新从2开始' : '继续下一副'}</button></section>`;
  } else content = `<div class="status-line"><p>${v.stage === 'tribute' ? v.returnIds.length ? '请选一张还牌，浅色牌可选' : '等收贡的牌友还牌' : myTurn ? '选好牌，再点出牌；选错再点即可取消' : '你可以先选牌，轮到时再确认出牌'}</p><button id="auto-toggle" class="subtle" ${busy ? 'disabled' : ''}>${me.auto ? '接回自己打' : '请电脑代打'}</button></div>${me.auto ? '<div class="auto-banner"><p>电脑正在替你打，随时可以接回。</p><button id="resume-big" class="gold">接回自己打</button></div>' : ''}<div class="own-label">你的手牌 · ${v.hand.length}张<span>对家：${e(v.seats[(v.self + 2) % 4].name)}</span></div><div class="hand" aria-label="你的手牌">${v.hand.map(c => cardHTML(c)).join('')}</div><div class="selection-line" id="selection-line"></div><div class="controls"><button id="hint" ${busy || !connected || me.auto || !(myTurn || v.returnIds.length) ? 'disabled' : ''}>提示</button><button id="pass" ${busy || !connected || me.auto || !myTurn || !v.last ? 'disabled' : ''}>不要</button><button id="play" class="primary" disabled>${v.stage === 'tribute' ? '还这一张' : '出牌'}</button></div>`;
  return `<main class="game-shell"><header class="table-header"><div class="brand"><span class="brand-mark" aria-hidden="true">♠</span><div><h1>掼蛋</h1><p>亲友牌桌 <span class="room-code" id="header-code">${e(v.code)}</span></p></div></div><div class="header-actions"><button id="copy-header">复制桌号</button><button id="rules-open">规则</button><button id="leave-open" class="subtle">离开</button></div></header><div class="meta-line"><span class="level-pill">${v.round ? `第${v.round}副 · 打${rankName(v.level)}` : '等待开局'}</span><span class="round-name"><span class="connection ${connected ? '' : 'off'}"></span>${connected ? '已连接' : '正在连接，座位已保留'}</span><span>你们 ${rankName(v.levels[ownTeam])} / 对方 ${rankName(v.levels[1 - ownTeam])}</span></div>${!connected ? '<div class="status" role="status">连接中，正在尝试回到原牌桌。<button id="reconnect">重新连接</button></div>' : ''}<section class="table-board" aria-label="共同牌桌"><div class="board-players">${seatHTML((v.self + 2) % 4, 'top')}${seatHTML((v.self + 3) % 4, 'left')}<div class="board-center">${center}</div>${seatHTML((v.self + 1) % 4, 'right')}${seatHTML(v.self, 'self')}</div></section><div class="live-message ${isError ? 'error' : ''}" role="status" aria-live="polite">${e(message || v.notice)}${pending && !resolving ? ' <button id="retry-action">重试这次操作</button>' : ''}</div>${content}<footer class="room-footer">${v.stage === 'waiting' ? '开局前可以换空位，对面就是你的队友。' : '需要歇一会儿，可以请电脑代打。'}</footer></main>`;
}

function renderModal(): string {
  if (!modal) return '';
  let title = '', text = '', buttons = '<button id="modal-close" class="primary">知道了</button>';
  if (modal === 'rules') {
    title = '本桌怎么玩';
    text = '<ul><li>四人分两队，对家是队友。两副牌，每人27张。</li><li>大王、小王、级牌、A到2依次降低。红桃级牌可以作配牌，不能代王。</li><li>可出单张、对子、三张、三带对、五张顺子、三连对、钢板。A可在连续牌型的两端，不能绕接。</li><li>四张炸、五张炸、同花顺、六张以上炸、四王依次增大，不比花色。</li><li>头游搭档为二游、三游、末游，分别升3、2、1级。必须实际打A，头游且搭档不是末游才过A。</li><li>贡牌自动交接，收贡后自己确认还牌。张数自动显示。</li></ul><p class="muted small">首副随机首出，后续按贡还规则先出。电脑身份和代打状态始终可见。</p>';
  } else if (modal === 'desktop') {
    title = '下次怎样快速打开';
    text = '<p>先用系统浏览器打开牌桌，再在浏览器菜单中寻找“添加到桌面”或同类选项。</p><p>下次点桌面图标，原浏览器里的座位会自动恢复。请不要清除本网站数据；更换浏览器需要重新加入。</p><p class="muted small">不同手机的菜单名称可能不同。添加桌面不会让牌桌在断网时继续联机。</p>';
  } else {
    title = '离开这张牌桌？'; text = '<p>离开后，这个座位会交给电脑，也可以让其他亲友入座。</p><p>只是暂时休息，可以返回并选择“请电脑代打”，保留自己的座位。</p>';
    buttons = '<button id="modal-close">继续留在桌上</button><button id="leave-confirm" class="danger">离开牌桌</button>';
  }
  return `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${title}</h2>${text}<div class="dialog-actions">${buttons}</div></section></div>`;
}
function updateSelection(): void {
  const line = $('selection-line'); if (!line || !view) return;
  line.classList.toggle('empty', selected.size === 0);
  app.querySelector('.game-shell')?.classList.toggle('has-selection', selected.size > 0);
  const p = patterns.find(x => x.id === chosen);
  line.innerHTML = selected.size ? `<span>已选${selected.size}张${p ? ` · ${e(p.name)}` : ''}</span>${patterns.length > 1 ? `<label class="sr-only" for="pattern-choice">配牌解释</label><select id="pattern-choice">${patterns.map(x => `<option value="${e(x.id)}" ${x.id === chosen ? 'selected' : ''}>${e(x.name)}${x.substitutions.length ? '（配作' + x.substitutions.map(s => rankName(s.rank)).join('、') + '）' : ''}</option>`).join('')}</select>` : ''}<button id="clear-selection" class="selection-clear">重选</button>` : '<span class="muted">点牌选中，再点取消</span>';
  $('clear-selection')?.addEventListener('click', () => { selected.clear(); patterns = []; chosen = ''; render(); });
  $('pattern-choice')?.addEventListener('change', event => { chosen = (event.target as HTMLSelectElement).value; updateSelection(); });
  const button = $<HTMLButtonElement>('play');
  if (button) {
    const can = view.stage === 'tribute' ? selected.size === 1 && view.returnIds.includes([...selected][0]) : view.turn === view.self && !!p;
    button.disabled = busy || !!pending || !connected || view.seats[view.self].auto || !can;
  }
}
async function copyRoom(): Promise<void> {
  if (!view) return;
  try { await navigator.clipboard.writeText(view.code); tell('牌桌号已复制，发给亲友即可'); }
  catch { tell(`牌桌号：${view.code}，也可以直接告诉亲友`); }
}
function bind(): void {
  const click = (id: string, fn: () => void) => $(id)?.addEventListener('click', fn);
  const openModal = (type: typeof modal) => { modalReturnFocus = document.activeElement?.id ?? null; modal = type; render(); };
  click('create-room', () => void join(true)); click('join-room', () => void join(false));
  click('return-room', () => void restore()); click('rules-open', () => openModal('rules'));
  click('desktop-open', () => openModal('desktop'));
  click('modal-close', () => { modal = null; render(); }); click('leave-open', () => openModal('leave'));
  click('leave-confirm', () => { modal = null; void act('leave'); });
  click('copy-room', () => void copyRoom()); click('copy-header', () => void copyRoom());
  click('reconnect', connect); click('retry-action', () => void resolvePending());
  click('start-game', () => void act('start')); click('next-game', () => void act(view?.stage === 'matchOver' ? 'restart' : 'next'));
  click('auto-toggle', () => void act(view?.seats[view.self].auto ? 'resume' : 'auto'));
  click('compact-auto', () => void act(view?.seats[view.self].auto ? 'resume' : 'auto'));
  click('resume-big', () => void act('resume')); click('hint', () => void hint());
  click('pass', () => void act('pass'));
  click('play', () => void act(view?.stage === 'tribute' ? 'return' : 'play', { ids: [...selected], ...(chosen ? { patternId: chosen } : {}) }));
  document.querySelectorAll<HTMLButtonElement>('[data-card-id]').forEach(button => button.addEventListener('click', () => toggleCard(Number(button.dataset.cardId))));
  document.querySelectorAll<HTMLButtonElement>('[data-sit]').forEach(button => button.addEventListener('click', () => void act('switch', { seat: Number(button.dataset.sit) })));
  $<HTMLInputElement>('join-code')?.addEventListener('keydown', event => { if (event.key === 'Enter') void join(false); });
}
function render(): void {
  const focus = document.activeElement?.id;
  app.dataset.stage = view?.stage ?? 'home'; app.dataset.self = String(view?.self ?? -1);
  app.dataset.turn = String(view?.turn ?? -1); app.dataset.version = String(view?.version ?? 0);
  app.dataset.connected = String(connected); app.dataset.round = String(view?.round ?? 0);
  app.innerHTML = (view ? renderRoom() : renderHome()) + renderModal();
  if (view && ['playing', 'tribute'].includes(view.stage)) {
    app.querySelector('.header-actions')?.insertAdjacentHTML('beforeend', `<button id="compact-auto" class="compact-auto">${view.seats[view.self].auto ? '接回' : '代打'}</button>`);
    app.querySelector('.table-header h1')?.insertAdjacentHTML('beforeend', `<span class="compact-level">打${e(rankName(view.level))}</span>`);
  }
  bind(); updateSelection();
  if (modal) {
    app.querySelector('main')?.setAttribute('inert', '');
    app.querySelector('main')?.setAttribute('aria-hidden', 'true');
    const target = focus && $(focus)?.closest('.dialog') ? $(focus) : app.querySelector<HTMLElement>('.dialog button');
    target?.focus({ preventScroll: true });
  } else if (modalReturnFocus) { $(modalReturnFocus)?.focus({ preventScroll: true }); modalReturnFocus = null; }
  else if (focus && $(focus)) $(focus)?.focus({ preventScroll: true });
}
async function restore(): Promise<void> {
  if (!session) { render(); return; }
  try { const data = await api<{ view: View }>('/api/session'); message = ''; accept(data.view); connect(); }
  catch (error) { handleError(error); render(); }
}
window.addEventListener('online', () => { if (view) connect(); else void restore(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && view && socket?.readyState !== WebSocket.OPEN) connect(); });
document.addEventListener('keydown', event => {
  if (!modal) return;
  if (event.key === 'Escape') { event.preventDefault(); modal = null; render(); return; }
  if (event.key !== 'Tab') return;
  const items = [...app.querySelectorAll<HTMLElement>('.dialog button:not([disabled]),.dialog a[href],.dialog input,.dialog select')];
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
render(); void restore();
