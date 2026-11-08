import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { type Card, point, sorted } from './cards.js';
import { RULE_VERSION, beats, classify, legalPlays, returnable } from './rules.js';
import { RuleError, advance, assertConservation, move, newGame, prepareTribute, returnCard } from './game.js';
import { decide, type Observation, type Decision } from './policy.js';
import { Bots } from './bots.js';
import { Store } from './store.js';
import type { Room, Seat, View, Action, Preview } from './model.js';

export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
export function validateToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(value)) throw new RuleError('AUTH', '请重新加入牌桌');
  return value;
}
function displayName(value: unknown): string {
  if (value === undefined || value === '') return '牌友' + randomInt(10, 100);
  if (typeof value !== 'string' || [...value.trim()].length > 12 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new RuleError('NAME', '称呼请用1到12个字');
  return value.trim() || '牌友' + randomInt(10, 100);
}
function newSeat(name: string, token: string | null): Seat {
  return { playerId: randomUUID(), name, tokenHash: token ? digest(token) : null, kind: token ? 'human' : 'ai', auto: !token, connected: false, epoch: 0 };
}
export interface RoomOptions {
  botDelay?: number; disconnectGrace?: number; maxRooms?: number;
  random?: () => number; firstSeat?: () => number;
  audit?: (event: Record<string, unknown>) => void;
}
export class Rooms {
  readonly rooms = new Map<string, Room>();
  readonly bots = new Bots();
  onChange: (room: Room) => void = () => {};
  private pending = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private awayTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private closing = false;
  constructor(readonly store: Store, private options: RoomOptions = {}) {
    for (const room of store.load()) this.rooms.set(room.code, room);
  }
  startTimers(): void {
    for (const room of this.rooms.values()) {
      room.seats.forEach((s, i) => { if (s?.kind === 'human') this.away(room, i); });
      this.schedule(room);
    }
  }
  private later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.closing) fn(); }, ms);
    this.timers.add(timer); return timer;
  }
  private saved(room: Room, backup: Room): void {
    room.version++; room.updatedAt = Date.now();
    try { this.store.save(room); } catch (error) { Object.assign(room, backup); throw error; }
    this.onChange(room); this.schedule(room);
  }
  find(token: string): { room: Room; seat: number; player: Seat } | null {
    const hash = digest(validateToken(token));
    for (const room of this.rooms.values()) {
      const seat = room.seats.findIndex(s => s?.tokenHash === hash);
      if (seat >= 0) return { room, seat, player: room.seats[seat]! };
    }
    return null;
  }
  auth(code: string, token: string): { room: Room; seat: number; player: Seat } {
    const found = this.find(token);
    if (!found || found.room.code !== code) throw new RuleError('AUTH', '这个座位需要本人重新加入');
    return found;
  }
  create(token: string, name: unknown): View {
    validateToken(token);
    const existing = this.find(token);
    if (existing) return this.view(existing.room, existing.seat);
    if (this.rooms.size >= (this.options.maxRooms ?? 128)) throw new RuleError('CAPACITY', '当前牌桌较多，请稍后再试');
    let code: string;
    do { code = String(randomInt(10_000_000, 100_000_000)); } while (this.rooms.has(code));
    const host = newSeat(displayName(name), token);
    const room: Room = { code, owner: host.playerId, seats: [host, null, null, null], version: 1,
      stage: 'waiting', createdAt: Date.now(), updatedAt: Date.now(), levels: [2, 2], activeTeam: 0,
      round: 0, game: null, result: null, notice: '请邀请亲友，空位可以由电脑补齐' };
    this.rooms.set(code, room);
    try { this.store.save(room); } catch (error) { this.rooms.delete(code); throw error; }
    return this.view(room, 0);
  }
  join(code: string, token: string, name: unknown): View {
    validateToken(token);
    const existing = this.find(token);
    if (existing) {
      if (existing.room.code !== code) throw new RuleError('OTHER_ROOM', '请先离开当前牌桌再加入新桌');
      return this.view(existing.room, existing.seat);
    }
    const room = this.rooms.get(code);
    if (!room) throw new RuleError('NOT_FOUND', '没有找到这张桌，请核对8位牌桌号');
    const seat = room.seats.findIndex(s => s === null || s.kind === 'ai');
    if (seat < 0) throw new RuleError('FULL', '这桌已经坐满，断线亲友的座位会保留');
    const backup = structuredClone(room);
    room.seats[seat] = newSeat(displayName(name), token);
    if (!room.seats.some(s => s?.playerId === room.owner && s.kind === 'human')) room.owner = room.seats[seat]!.playerId;
    room.notice = `${room.seats[seat]!.name}已入座`;
    this.saved(room, backup);
    this.bots.release(room.code + ':' + seat); this.away(room, seat);
    return this.view(room, seat);
  }
  connected(code: string, token: string, connected: boolean): void {
    if (this.closing) return;
    const { room, seat, player } = this.auth(code, token);
    player.connected = connected;
    const old = this.awayTimers.get(player.playerId);
    if (old) { clearTimeout(old); this.timers.delete(old); this.awayTimers.delete(player.playerId); }
    if (!connected) this.away(room, seat);
    this.onChange(room);
  }
  private away(room: Room, seat: number): void {
    const player = room.seats[seat];
    if (!player || player.kind !== 'human' || this.awayTimers.has(player.playerId)) return;
    const id = player.playerId;
    const timer = this.later(() => {
      this.awayTimers.delete(id);
      const current = room.seats.find(s => s?.playerId === id);
      if (!current || current.connected || current.auto || room.stage === 'waiting') return;
      const backup = structuredClone(room);
      current.auto = true; current.epoch++; room.notice = `${current.name}暂时离线，电脑代打中`;
      try { this.saved(room, backup); }
      catch {
        this.options.audit?.({ type: 'persistence_failed', room: room.code, operation: 'disconnect_takeover' });
        this.later(() => this.away(room, room.seats.findIndex(s => s?.playerId === id)), 1000);
      }
    }, this.options.disconnectGrace ?? 20_000);
    this.awayTimers.set(id, timer);
  }
  private begin(room: Room, restart = false): void {
    const previous = restart ? null : room.result;
    if (restart) { room.levels = [2, 2]; room.activeTeam = 0; room.round = 0; }
    for (let i = 0; i < 4; i++) if (!room.seats[i]) room.seats[i] = newSeat(`电脑${i + 1}`, null);
    room.round++;
    const first = this.options.firstSeat?.() ?? randomInt(0, 4);
    room.game = newGame(room.levels[room.activeTeam], this.options.random ?? (() => randomInt(0, 4294967296) / 4294967296), first, randomUUID());
    room.stage = 'playing'; room.notice = `第${room.round}副开始，打${room.game.level === 14 ? 'A' : room.game.level}`;
    if (previous) {
      const tribute = prepareTribute(room.game, previous);
      room.notice = tribute.note;
      if (tribute.entries.length) room.stage = 'tribute';
    }
    room.seats.forEach((s, i) => { if (s?.kind === 'human' && !s.connected) this.away(room, i); });
    assertConservation(room.game);
  }
  private complete(room: Room): void {
    const g = room.game!;
    if (g.result) {
      const next = advance(room.levels, g.level, g.result);
      room.result = { ...g.result, before: [...room.levels], after: next.levels, matchWinner: next.matchWinner };
      room.levels = next.levels; room.activeTeam = g.result.winner;
      room.stage = next.matchWinner === null ? 'roundOver' : 'matchOver';
      room.notice = next.matchWinner === null ? `本副结束，头游一方升${g.result.upgrade}级` : '这一场打过A了';
      this.bots.releaseRoom(room.code);
    }
  }
  action(code: string, token: string, action: Action): { view: View | null; duplicate: boolean } {
    const { room, seat, player } = this.auth(code, token);
    const hash = digest(JSON.stringify({ type: action.type, ids: action.ids, patternId: action.patternId, seat: action.seat, roundId: action.roundId }));
    const receipt = this.store.receipt(code, player.playerId, action.actionId);
    if (receipt) {
      if (receipt.hash !== hash) throw new RuleError('REUSED_ID', '操作标记已使用，请重新操作');
      return { view: this.view(room, seat), duplicate: true };
    }
    if (action.expectedVersion !== room.version) throw new RuleError('STALE', '牌桌刚刚更新，请确认后再操作');
    const backup = structuredClone(room);
    try {
      const game = room.game;
      switch (action.type) {
        case 'start':
          if (room.stage !== 'waiting' || room.owner !== player.playerId) throw new RuleError('START', '请由房主开始');
          this.begin(room); break;
        case 'next':
          if (room.stage !== 'roundOver') throw new RuleError('PHASE', '请等这一副打完');
          this.begin(room); break;
        case 'restart':
          if (room.stage !== 'matchOver') throw new RuleError('PHASE', '请等这一场结束');
          this.begin(room, true); break;
        case 'play': case 'pass': case 'return':
          if (!game || !['playing', 'tribute'].includes(room.stage) || action.roundId !== game.roundId) throw new RuleError('ROUND', '牌局已更新，请重新确认');
          if (player.auto) throw new RuleError('AUTO', '请先点接回自己打');
          if (action.type === 'return') {
            if (room.stage !== 'tribute' || action.ids?.length !== 1) throw new RuleError('RETURN_CARD', '请选择一张合法还牌');
            returnCard(game, seat, action.ids[0]);
            if (game.tribute!.entries.every(e => e.returned)) { room.stage = 'playing'; room.notice = '贡还完成，开始出牌'; }
          } else {
            if (room.stage !== 'playing') throw new RuleError('PHASE', '请先完成还牌');
            move(game, seat, action.type === 'pass' ? null : action.ids ?? [], action.patternId);
            room.notice = action.type === 'pass' ? `${player.name}不要` : `${player.name}出了${game.displays[seat] && 'pattern' in game.displays[seat]! ? (game.displays[seat] as { pattern: { name: string } }).pattern.name : '一手牌'}`;
            this.complete(room);
          }
          assertConservation(game); break;
        case 'auto': player.auto = true; player.epoch++; room.notice = `${player.name}已请电脑代打`; break;
        case 'resume': player.auto = false; player.epoch++; room.notice = `${player.name}已接回自己打`; break;
        case 'switch': {
          const target = action.seat;
          if (room.stage !== 'waiting' || target === undefined || target < 0 || target > 3 || room.seats[target]?.kind === 'human') throw new RuleError('SEAT', '开局前可以换到空位');
          room.seats[seat] = room.seats[target]; room.seats[target] = player; player.epoch++; break;
        }
        case 'leave': {
          room.seats[seat] = room.stage === 'waiting' ? null : newSeat(`电脑${seat + 1}`, null);
          if (room.owner === player.playerId) room.owner = room.seats.find(s => s?.kind === 'human')?.playerId ?? '';
          this.bots.release(code + ':' + seat); room.notice = `${player.name}离开了牌桌`; break;
        }
        default: throw new RuleError('ACTION', '没有识别这个操作');
      }
      room.version++; room.updatedAt = Date.now();
      this.store.save(room, { room: code, player: player.playerId, id: action.actionId, hash, version: room.version });
    } catch (error) { Object.assign(room, backup); throw error; }
    this.options.audit?.({ type: 'action', room: code, seat, action: action.type, version: room.version, actionId: action.actionId });
    this.onChange(room); this.schedule(room);
    return { view: action.type === 'leave' ? null : this.view(room, room.seats.findIndex(s => s?.playerId === player.playerId)), duplicate: false };
  }
  preview(code: string, token: string, ids: number[]): Preview {
    const { room, seat } = this.auth(code, token), g = room.game;
    if (!g || room.stage !== 'playing') return { patterns: [], message: '请先开始牌局' };
    const cards = ids.map(id => g.hands[seat].find(c => c.id === id));
    if (!ids.length || new Set(ids).size !== ids.length || cards.some(c => !c)) return { patterns: [], message: '请选择自己手中的牌' };
    const patterns = classify(cards as Card[], g.level).filter(p => beats(p, g.last?.pattern ?? null));
    return { patterns, message: patterns.length ? patterns[0].name : '牌型不对或压不过，请重新选择' };
  }
  hint(code: string, token: string, cursor: number): Decision & { total: number } {
    const { room, seat } = this.auth(code, token), g = room.game;
    if (!g || !['playing', 'tribute'].includes(room.stage)) throw new RuleError('PHASE', '现在不需要提示');
    if (room.stage === 'tribute') {
      if (!g.tribute?.entries.some(e => e.receiver === seat && !e.returned)) return { ids: [], total: 0 };
      const options = returnable(g.hands[seat], g.level); return { ids: [options[cursor % options.length].id], total: options.length };
    }
    if (g.turn !== seat) throw new RuleError('TURN', '还没轮到你');
    const options = legalPlays(g.hands[seat], g.level, g.last?.pattern ?? null);
    const preferred = decide({ seat, hand: g.hands[seat], level: g.level,
      lead: g.last ? { seat: g.last.seat, pattern: g.last.pattern } : null,
      counts: g.hands.map(h => h.length), finished: g.finish, returning: false });
    const isPreferred = (p: typeof options[number]) => p.pattern.id === preferred.patternId &&
      p.cards.length === preferred.ids?.length && p.cards.every(c => preferred.ids!.includes(c.id));
    options.sort((a, b) => Number(isPreferred(b)) - Number(isPreferred(a)));
    const selected = options[cursor % options.length];
    return selected ? { ids: selected.cards.map(c => c.id), patternId: selected.pattern.id, total: options.length } : { ids: null, total: 0 };
  }
  view(room: Room, self: number): View {
    const game = room.game;
    const positions = game?.result?.order ?? game?.finish ?? [];
    return {
      code: room.code, version: room.version, ruleVersion: RULE_VERSION, stage: room.stage, self,
      host: room.seats.findIndex(s => s?.playerId === room.owner),
      seats: room.seats.map((s, index) => ({ index, name: s?.name ?? '等待亲友', kind: s?.kind ?? 'empty',
        connected: s?.connected ?? false, auto: s?.auto ?? false, count: game?.hands[index].length ?? 0,
        finish: positions.includes(index) ? (game?.result?.doubleDown && positions.indexOf(index) >= 2 ? 5 : positions.indexOf(index) + 1) : null })),
      hand: self >= 0 && game ? sorted(game.hands[self], game.level) : [], levels: [...room.levels],
      level: game?.level ?? 2, round: room.round, roundId: game?.roundId ?? null,
      turn: game?.turn ?? -1, last: game?.last ?? null, displays: game?.displays ?? [null, null, null, null],
      result: room.result, notice: room.notice,
      returnIds: game && room.stage === 'tribute' && game.tribute?.entries.some(e => e.receiver === self && !e.returned) ? returnable(game.hands[self], game.level).map(c => c.id) : [],
      tribute: game?.tribute?.entries.map(e => ({ giver: e.giver, receiver: e.receiver, card: e.card, done: e.returned !== null })) ?? []
    };
  }
  private schedule(room: Room): void {
    if (this.closing || !room.game || !['playing', 'tribute'].includes(room.stage)) return;
    const seats = room.stage === 'tribute' ? room.game.tribute!.entries.filter(e => !e.returned).map(e => e.receiver) : [room.game.turn];
    for (const seat of seats) {
      const player = room.seats[seat];
      if (!player || (player.kind === 'human' && !player.auto)) continue;
      const key = room.code + ':' + seat;
      if (this.pending.has(key)) continue;
      this.pending.add(key);
      this.later(() => { void this.botTurn(room, seat, key); }, this.options.botDelay ?? 750);
    }
  }
  private async botTurn(room: Room, seat: number, key: string): Promise<void> {
    const game = room.game, player = room.seats[seat];
    const eligible = () => room.game === game && !!player && room.seats[seat] === player &&
      (player.kind === 'ai' || player.auto) && (room.stage === 'playing' && game?.turn === seat || room.stage === 'tribute' && game?.tribute?.entries.some(e => e.receiver === seat && !e.returned));
    if (!game || !eligible()) { this.pending.delete(key); this.schedule(room); return; }
    const epoch = player!.epoch, version = room.version;
    const observation: Observation = { seat, hand: structuredClone(game.hands[seat]), level: game.level,
      lead: game.last ? { seat: game.last.seat, pattern: structuredClone(game.last.pattern) } : null,
      counts: game.hands.map(h => h.length), finished: [...game.finish], returning: room.stage === 'tribute' };
    this.options.audit?.({ type: 'ai_input', room: room.code, seat, version, observation });
    let decision: Decision;
    try { decision = await this.bots.choose(key, observation); }
    catch {
      if (observation.returning) decision = { ids: [returnable(observation.hand, observation.level)[0].id] };
      else { const first = legalPlays(observation.hand, observation.level, observation.lead?.pattern ?? null)[0]; decision = first ? { ids: first.cards.map(c => c.id), patternId: first.pattern.id } : { ids: null }; }
    }
    this.pending.delete(key);
    if (this.closing) return;
    if (!eligible() || player!.epoch !== epoch || room.version !== version) { this.schedule(room); return; }
    const backup = structuredClone(room);
    try {
      if (room.stage === 'tribute') {
        returnCard(game, seat, decision.ids![0]);
        if (game.tribute!.entries.every(e => e.returned)) { room.stage = 'playing'; room.notice = '贡还完成，开始出牌'; }
      } else {
        move(game, seat, decision.ids, decision.patternId); room.notice = `${player!.name}${decision.ids ? '出牌' : '不要'}`;
        this.complete(room);
      }
      assertConservation(game); room.version++; room.updatedAt = Date.now(); this.store.save(room);
      this.options.audit?.({ type: 'ai_accepted', room: room.code, seat, inputVersion: version, version: room.version, decision });
      this.onChange(room);
    } catch (error) {
      Object.assign(room, backup);
      this.options.audit?.({ type: 'ai_rejected', room: room.code, seat, error: error instanceof Error ? error.message : 'invalid decision' });
    }
    this.schedule(room);
  }
  async close(): Promise<void> { this.closing = true; for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); await this.bots.close(); }
}
