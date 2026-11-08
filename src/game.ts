import { type Card, deck, point, shuffled, sorted, wild } from './cards.js';
import { type Pattern, beats, classify, returnable } from './rules.js';

export interface Played { seat: number; cards: Card[]; pattern: Pattern; }
export type Display = Played | { seat: number; pass: true } | null;
export interface RoundResult { order: number[]; winner: number; upgrade: number; doubleDown: boolean; }
export interface Exchange { giver: number; receiver: number; card: Card; returned: Card | null; }
export interface Tribute { entries: Exchange[]; leader: number; note: string; }
export interface Game {
  roundId: string; level: number; hands: Card[][]; turn: number; last: Played | null;
  responders: number[]; finish: number[]; played: Card[]; displays: Display[];
  ply: number; result: RoundResult | null; tribute: Tribute | null;
}
export class RuleError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export const partner = (seat: number): number => (seat + 2) % 4;
export const team = (seat: number): number => seat % 2;

export function newGame(level: number, random: () => number, first: number, roundId: string): Game {
  const cards = shuffled(deck(), random);
  const hands: Card[][] = [[], [], [], []];
  cards.forEach((card, i) => hands[i % 4].push(card));
  return { roundId, level, hands, turn: first, last: null, responders: [], finish: [], played: [],
    displays: [null, null, null, null], ply: 0, result: null, tribute: null };
}
function nextSeats(game: Game, from: number): number[] {
  return [1, 2, 3].map(n => (from + n) % 4).filter(s => game.hands[s].length > 0);
}
function ordered(cards: Card[], p: Pattern, level: number): Card[] {
  const effective = (c: Card) => p.substitutions.find(s => s.id === c.id)?.rank ?? c.rank;
  const lowAce = (p.kind === 'straight' || p.kind === 'straightflush') ? p.high === 5 : p.kind === 'pairs' ? p.high === 3 : p.kind === 'steel' && p.high === 2;
  const value = (c: Card) => {
    const r = effective(c);
    if (p.kind === 'fullhouse') return point(r, level) === p.high ? 0 : 1;
    return lowAce && r === 14 ? 1 : r;
  };
  return [...cards].sort((a, b) => value(a) - value(b) || a.id - b.id);
}
function conclude(game: Game): boolean {
  const f = game.finish;
  const doubleDown = f.length >= 2 && team(f[0]) === team(f[1]);
  if (!doubleDown && f.length < 3) return false;
  const order = [...f];
  for (const s of [0, 1, 2, 3]) if (!order.includes(s)) order.push(s);
  const position = order.indexOf(partner(order[0]));
  game.result = { order, winner: team(order[0]), upgrade: position === 1 ? 3 : position === 2 ? 2 : 1, doubleDown };
  game.turn = -1; game.responders = [];
  return true;
}
export function move(game: Game, seat: number, ids: number[] | null, declaration?: string): Played | null {
  if (game.result || game.tribute?.entries.some(x => !x.returned)) throw new RuleError('PHASE', '现在还不能出牌');
  if (game.turn !== seat || !game.hands[seat]?.length) throw new RuleError('TURN', '还没轮到你，请稍等');
  if (ids === null) {
    if (!game.last) throw new RuleError('MUST_LEAD', '这一手由你先出，不能不要');
    game.displays[seat] = { seat, pass: true };
    game.responders.shift();
    game.ply++;
    if (game.responders.length) game.turn = game.responders[0];
    else {
      const previous = game.last.seat;
      game.turn = game.hands[previous].length ? previous : partner(previous);
      game.last = null; game.displays = [null, null, null, null];
    }
    return null;
  }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 || new Set(ids).size !== ids.length || ids.some(id => !Number.isInteger(id))) throw new RuleError('SELECTION', '请重新选择要出的牌');
  const cards = ids.map(id => game.hands[seat].find(c => c.id === id));
  if (cards.some(c => !c)) throw new RuleError('OWNERSHIP', '只能出自己手中的牌');
  const possibilities = classify(cards as Card[], game.level);
  if (!possibilities.length) throw new RuleError('PATTERN', '牌型不对，请重新选牌');
  const p = declaration ? possibilities.find(x => x.id === declaration) : possibilities.find(x => beats(x, game.last?.pattern ?? null));
  if (!p) throw new RuleError('DECLARATION', declaration ? '配牌解释已变化，请重新确认' : '这手牌压不过，请重选或点不要');
  if (!beats(p, game.last?.pattern ?? null)) throw new RuleError('TOO_SMALL', '这手牌压不过，请重选或点不要');
  const played: Played = { seat, cards: ordered(cards as Card[], p, game.level), pattern: p };
  game.hands[seat] = game.hands[seat].filter(c => !ids.includes(c.id));
  game.played.push(...played.cards); game.last = played; game.displays[seat] = played;
  if (!game.hands[seat].length) game.finish.push(seat);
  game.ply++;
  if (!conclude(game)) { game.responders = nextSeats(game, seat); game.turn = game.responders[0]; }
  return played;
}

export function advance(levels: number[], playedLevel: number, result: RoundResult): { levels: number[]; matchWinner: number | null } {
  const next = [...levels];
  const passedA = playedLevel === 14 && levels[result.winner] === 14 && result.upgrade >= 2;
  next[result.winner] = Math.min(14, levels[result.winner] + result.upgrade);
  return { levels: next, matchWinner: passedA ? result.winner : null };
}

export function prepareTribute(game: Game, previous: RoundResult): Tribute {
  const [first, second, , last] = previous.order;
  const givers = previous.doubleDown ? previous.order.slice(2) : [last];
  const bigJokers = givers.reduce((n, seat) => n + game.hands[seat].filter(c => c.rank === 17).length, 0);
  if (bigJokers === 2) {
    game.turn = first;
    game.tribute = { entries: [], leader: first, note: '两张大王抗贡，头游先出' };
    return game.tribute;
  }
  const gifts = givers.map(giver => {
    const eligible = game.hands[giver].filter(c => !wild(c, game.level));
    const card = sorted(eligible, game.level).at(-1)!;
    return { giver, card };
  });
  if (gifts.length === 2) gifts.sort((a, b) => point(b.card.rank, game.level) - point(a.card.rank, game.level) || ((a.giver - first + 4) % 4) - ((b.giver - first + 4) % 4));
  const entries = gifts.map((gift, i) => ({ ...gift, receiver: i === 0 ? first : second, returned: null as Card | null }));
  for (const e of entries) {
    game.hands[e.giver] = game.hands[e.giver].filter(c => c.id !== e.card.id);
    game.hands[e.receiver].push(e.card);
  }
  game.turn = gifts[0].giver;
  game.tribute = { entries, leader: game.turn, note: entries.length === 2 ? '双贡，收贡后请各还一张牌' : '单贡，收贡后请还一张牌' };
  return game.tribute;
}
export function returnCard(game: Game, seat: number, id: number): void {
  const exchange = game.tribute?.entries.find(e => e.receiver === seat && !e.returned);
  if (!exchange) throw new RuleError('RETURN_PHASE', '现在不需要你还牌');
  const card = returnable(game.hands[seat], game.level).find(c => c.id === id);
  if (!card) throw new RuleError('RETURN_CARD', '请选择提示范围内的一张还牌');
  game.hands[seat] = game.hands[seat].filter(c => c.id !== id);
  game.hands[exchange.giver].push(card); exchange.returned = card;
}
export function assertConservation(game: Game): void {
  const all = [...game.hands.flat(), ...game.played];
  if (all.length !== 108 || new Set(all.map(c => c.id)).size !== 108 || all.some(c => c.id < 0 || c.id >= 108)) throw new Error('card conservation violated');
}
