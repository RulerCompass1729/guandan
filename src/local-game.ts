/** Local practice adapter. The rules and policy are the same modules as the server. */
import { seeded, sorted, type Card } from './cards.js';
import { newGame, move, prepareTribute, returnCard, advance, assertConservation, RuleError, type Game } from './game.js';
import { RULE_VERSION, classify, beats, legalPlays, returnable } from './rules.js';
import { decide, difficulty, isDifficulty, type Decision, type Difficulty } from './policy.js';
import type { Action, View, Result, Stage, Preview } from './model.js';

interface LocalState {
  version: number; stage: Stage; name: string; auto: boolean; round: number;
  levels: number[]; activeTeam: number; game: Game; result: Result | null;
  notice: string; testSeed?: number;
  difficulty: Difficulty;
}
function startRound(state: LocalState): void {
  const random = state.testSeed === undefined ? Math.random : seeded(state.testSeed + state.round);
  state.game = newGame(state.levels[state.activeTeam], random, Math.floor(random() * 4),
    'practice-' + state.round + '-' + Math.floor(random() * 0x100000000).toString(16));
  if (state.result) prepareTribute(state.game, state.result);
  state.result = null;
  state.stage = state.game.tribute?.entries.length ? 'tribute' : 'playing';
  state.notice = state.game.tribute?.note ?? `第${state.round}副开始`;
}
function finish(state: LocalState): void {
  assertConservation(state.game);
  if (state.stage === 'tribute' && !state.game.tribute!.entries.some(e => !e.returned)) state.stage = 'playing';
  if (!state.game.result) return;
  const before = [...state.levels], next = advance(state.levels, state.game.level, state.game.result);
  state.levels = next.levels; state.activeTeam = state.game.result.winner;
  state.result = { ...state.game.result, before, after: [...state.levels], matchWinner: next.matchWinner };
  state.stage = next.matchWinner === null ? 'roundOver' : 'matchOver';
  state.notice = next.matchWinner === null ? '本副结束，继续下一副' : '已过A，本场结束';
}
function view(state: LocalState): View {
  const g = state.game, positions = g.result?.order ?? g.finish;
  return { code: '本机练习', version: state.version, ruleVersion: RULE_VERSION, stage: state.stage, self: 0, host: 0,
    difficulty: state.difficulty,
    seats: [0, 1, 2, 3].map(index => ({ index, name: index === 0 ? state.name : '电脑' + (index + 1),
      kind: index === 0 ? 'human' : 'ai', connected: true, auto: index === 0 ? state.auto : false,
      count: g.hands[index].length, finish: positions.includes(index) ? g.result?.doubleDown && positions.indexOf(index) >= 2 ? 5 : positions.indexOf(index) + 1 : null })),
    hand: sorted(g.hands[0], g.level), levels: [...state.levels], level: g.level,
    round: state.round, roundId: g.roundId, turn: g.turn, last: g.last, displays: g.displays,
    result: state.result, notice: state.notice,
    returnIds: state.stage === 'tribute' && g.tribute?.entries.some(e => e.receiver === 0 && !e.returned) ? returnable(g.hands[0], g.level).map(c => c.id) : [],
    tribute: g.tribute?.entries.map(e => ({ giver: e.giver, receiver: e.receiver, card: e.card, done: e.returned !== null })) ?? [] };
}
function observation(state: LocalState, seat: number, returning: boolean) {
  const g = state.game;
  return { seat, hand: g.hands[seat], level: g.level, lead: g.last ? { seat: g.last.seat, pattern: g.last.pattern } : null,
    counts: g.hands.map(h => h.length), finished: g.finish, returning, difficulty: state.difficulty };
}
function needsBot(state: LocalState): number | null {
  if (state.stage === 'tribute') return state.game.tribute!.entries.find(e => !e.returned && (e.receiver !== 0 || state.auto))?.receiver ?? null;
  if (state.stage === 'playing' && (state.game.turn !== 0 || state.auto)) return state.game.turn;
  return null;
}
function action(state: LocalState, a: Action): void {
  if (a.roundId && a.roundId !== state.game.roundId) throw new RuleError('STALE', '已经是新一副牌');
  // An AI tick may finish between a visible control tap and its queued request.
  // Same-round explicit auto/resume intents are safe to apply to the newer state.
  // Card moves and unbound/future-version requests still require an exact version.
  const queuedControl = (a.type === 'auto' || a.type === 'resume') && a.roundId === state.game.roundId &&
    Number.isInteger(a.expectedVersion) && a.expectedVersion >= 0 && a.expectedVersion < state.version;
  if (a.expectedVersion !== state.version && !queuedControl) throw new RuleError('STALE', '牌桌已经更新，请重新操作');
  if (a.type === 'difficulty') {
    if (!['roundOver', 'matchOver'].includes(state.stage)) throw new RuleError('PHASE', '打完这一副后再调整难度');
    if (!isDifficulty(a.difficulty)) throw new RuleError('INPUT', '请选择轻松、标准或进阶');
    state.difficulty = a.difficulty; state.notice = '电脑难度已调整';
  } else if (a.type === 'auto' || a.type === 'resume') state.auto = a.type === 'auto';
  else if (a.type === 'next' || a.type === 'restart') {
    if (a.type === 'next' && state.stage !== 'roundOver' || a.type === 'restart' && state.stage !== 'matchOver') throw new RuleError('PHASE', '请先打完这一副');
    if (a.type === 'restart') { state.levels = [2, 2]; state.activeTeam = 0; state.round = 0; state.result = null; }
    state.round++; startRound(state);
  } else if (a.type === 'return') {
    if (state.stage !== 'tribute' || state.auto || a.ids?.length !== 1) throw new RuleError('PHASE', '现在不能还牌');
    returnCard(state.game, 0, a.ids[0]); state.notice = '已还牌';
  } else if (a.type === 'play' || a.type === 'pass') {
    if (state.stage !== 'playing' || state.auto) throw new RuleError('PHASE', '请先接回自己的牌');
    const played = move(state.game, 0, a.type === 'pass' ? null : a.ids ?? [], a.patternId);
    state.notice = played ? state.name + '出了' + played.pattern.name : state.name + '不要';
  } else throw new RuleError('INPUT', '本机练习不支持这个操作');
  state.version++; finish(state);
}
function hint(state: LocalState, cursor: number): Decision & { total: number } {
  const g = state.game;
  if (state.stage === 'tribute') {
    if (!g.tribute?.entries.some(e => e.receiver === 0 && !e.returned)) return { ids: [], total: 0 };
    const options = returnable(g.hands[0], g.level); return { ids: [options[cursor % options.length].id], total: options.length };
  }
  if (state.stage !== 'playing' || g.turn !== 0) throw new RuleError('TURN', '还没轮到你，请稍等');
  const options = legalPlays(g.hands[0], g.level, g.last?.pattern ?? null), preferred = decide({ ...observation(state, 0, false), difficulty: 'standard' });
  const preferredOption = (p: typeof options[number]) => p.pattern.id === preferred.patternId && p.cards.length === preferred.ids?.length && p.cards.every(c => preferred.ids!.includes(c.id));
  options.sort((a, b) => Number(preferredOption(b)) - Number(preferredOption(a)));
  const selected = options[cursor % options.length];
  return selected ? { ids: selected.cards.map(c => c.id), patternId: selected.pattern.id, total: options.length } : { ids: null, total: 0 };
}
function preview(state: LocalState, ids: number[]): Preview {
  const g = state.game;
  if (state.stage !== 'playing') return { patterns: [], message: '现在不需要出牌' };
  const cards = ids.map(id => g.hands[0].find(c => c.id === id));
  if (!ids.length || new Set(ids).size !== ids.length || cards.some(c => !c)) return { patterns: [], message: '请选择自己手中的牌' };
  const patterns = classify(cards as Card[], g.level).filter(p => beats(p, g.last?.pattern ?? null));
  return { patterns, message: patterns.length ? patterns[0].name : '牌型不对或压不过，请重新选择' };
}
/** A JSON boundary lets a native client reuse the engine without a browser or WebView. */
export function dispatch(json: string): string {
  try {
    const input = JSON.parse(json);
    let state: LocalState = input.state;
    if (input.op === 'new') {
      state = { version: 1, stage: 'playing', name: String(input.name || '牌友').slice(0, 14), auto: false,
        round: 1, levels: [2, 2], activeTeam: 0, game: null as unknown as Game, result: null, notice: '', difficulty: difficulty(input.difficulty) };
      if (input.difficulty !== undefined && !isDifficulty(input.difficulty)) throw new RuleError('INPUT', '请选择轻松、标准或进阶');
      if (Number.isSafeInteger(input.testSeed)) state.testSeed = input.testSeed;
      startRound(state);
    } else {
      if (!state?.game || state.game.hands?.length !== 4 || !Number.isSafeInteger(state.version)) throw new RuleError('STATE', '练习进度不完整，请重新开始');
      assertConservation(state.game);
      state.difficulty = difficulty(state.difficulty);
      if (input.op === 'action') action(state, input.action);
      else if (input.op === 'tick') {
        const seat = needsBot(state);
        if (seat !== null) {
          const d = decide(observation(state, seat, state.stage === 'tribute'));
          if (state.stage === 'tribute') { returnCard(state.game, seat, d.ids![0]); state.notice = '电脑已还牌'; }
          else { const p = move(state.game, seat, d.ids, d.patternId); state.notice = (seat === 0 ? state.name : '电脑' + (seat + 1)) + (p ? '出了' + p.pattern.name : '不要'); }
          state.version++; finish(state);
        }
      }
    }
    const result: Record<string, unknown> = { state, view: view(state), needsBot: needsBot(state) !== null };
    if (input.op === 'hint') Object.assign(result, hint(state, Math.max(0, Number(input.cursor) || 0)));
    if (input.op === 'preview') Object.assign(result, preview(state, input.ids ?? []));
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : '练习暂时未能处理', code: error instanceof RuleError ? error.code : 'STATE' });
  }
}
