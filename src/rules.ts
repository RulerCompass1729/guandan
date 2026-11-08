import { type Card, type Suit, SUITS, point, sorted, wild } from './cards.js';

export const RULE_VERSION = 'gd-2022-home-v1';
export type Kind = 'single' | 'pair' | 'triple' | 'fullhouse' | 'straight' | 'pairs' | 'steel' | 'bomb' | 'straightflush' | 'rocket';
export interface Substitution { id: number; rank: number; suit?: Suit; }
export interface Pattern { id: string; kind: Kind; high: number; count: number; name: string; substitutions: Substitution[]; }
export interface Play { cards: Card[]; pattern: Pattern; }
interface Requirement { rank: number; count: number; suit?: Suit; }
const NAMES: Record<Kind, string> = { single: '单张', pair: '对子', triple: '三张', fullhouse: '三带对', straight: '顺子', pairs: '三连对', steel: '钢板', bomb: '炸弹', straightflush: '同花顺', rocket: '四大天王' };

function fit(cards: Card[], level: number, needs: Requirement[]): Substitution[] | null {
  if (needs.reduce((n, x) => n + x.count, 0) !== cards.length) return null;
  const remaining = needs.flatMap(x => Array.from({ length: x.count }, () => ({ rank: x.rank, suit: x.suit })));
  const ws = cards.filter(c => wild(c, level));
  for (const card of cards) {
    if (wild(card, level)) continue;
    const index = remaining.findIndex(x => x.rank === card.rank && (!x.suit || x.suit === card.suit));
    if (index < 0) return null;
    remaining.splice(index, 1);
  }
  if (remaining.length !== ws.length || remaining.some(x => x.rank > 14)) return null;
  return remaining.map((x, i) => ({ id: ws[i].id, rank: x.rank, ...(x.suit ? { suit: x.suit } : {}) }));
}
function pattern(kind: Kind, high: number, count: number, substitutions: Substitution[]): Pattern {
  return { id: `${kind}:${high}:${count}`, kind, high, count,
    name: kind === 'bomb' ? `${count}张炸弹` : NAMES[kind], substitutions };
}
export function tier(p: Pattern): number {
  if (p.kind === 'rocket') return 1000;
  if (p.kind === 'bomb') return p.count >= 6 ? 100 + p.count : p.count === 5 ? 80 : 70;
  return p.kind === 'straightflush' ? 90 : 0;
}
export function beats(candidate: Pattern, lead: Pattern | null): boolean {
  if (!lead) return true;
  const a = tier(candidate), b = tier(lead);
  if (a !== b) return a > b;
  if (candidate.kind !== lead.kind || candidate.count !== lead.count) return false;
  return candidate.high > lead.high;
}
function sequence(start: number, length: number): number[] {
  return Array.from({ length }, (_, i) => start + i === 1 ? 14 : start + i);
}
/** All declared legal interpretations of one physical selection. */
export function classify(cards: Card[], level: number): Pattern[] {
  const n = cards.length;
  if (!Number.isInteger(level) || level < 2 || level > 14 || n < 1 || n > 10 || new Set(cards.map(c => c.id)).size !== n) return [];
  const ws = cards.filter(c => wild(c, level));
  if (ws.length > 2) return [];
  const result: Pattern[] = [];
  const add = (kind: Kind, high: number, requirements: Requirement[]) => {
    const subs = fit(cards, level, requirements);
    if (subs) result.push(pattern(kind, high, n, subs));
  };
  if (n === 1) return [pattern('single', point(cards[0].rank, level), 1, [])];
  if (n === 4 && cards.filter(c => c.rank === 16).length === 2 && cards.filter(c => c.rank === 17).length === 2) result.push(pattern('rocket', 100, 4, []));
  if (n === 2 || n === 3 || n >= 4) {
    const kind: Kind = n === 2 ? 'pair' : n === 3 ? 'triple' : 'bomb';
    for (let rank = 2; rank <= 14; rank++) add(kind, point(rank, level), [{ rank, count: n }]);
    if (n === 2) for (const rank of [16, 17]) add('pair', rank, [{ rank, count: 2 }]);
  }
  if (n === 5) {
    const natural = cards.filter(c => !wild(c, level));
    const ranks = [...new Set(natural.map(c => c.rank))];
    for (const triple of ranks.filter(r => r <= 14)) {
      if (natural.filter(c => c.rank === triple).length + ws.length < 3) continue;
      const others = ranks.filter(r => r !== triple);
      const pairs = others.length ? others : Array.from({ length: 13 }, (_, i) => i + 2);
      for (const pair of pairs) if (pair !== triple) add('fullhouse', point(triple, level), [{ rank: triple, count: 3 }, { rank: pair, count: 2 }]);
    }
    const naturalFlush = ws.length === 0 && cards.every(c => c.suit === cards[0].suit);
    for (let start = 1; start <= 10; start++) {
      const seq = sequence(start, 5);
      if (!naturalFlush) add('straight', start + 4, seq.map(rank => ({ rank, count: 1 })));
      for (const suit of SUITS) add('straightflush', start + 4, seq.map(rank => ({ rank, count: 1, suit })));
    }
  }
  if (n === 6) {
    for (let start = 1; start <= 12; start++) add('pairs', start + 2, sequence(start, 3).map(rank => ({ rank, count: 2 })));
    for (let start = 1; start <= 13; start++) add('steel', start + 1, sequence(start, 2).map(rank => ({ rank, count: 3 })));
  }
  const unique = new Map(result.map(p => [p.id, p]));
  return [...unique.values()].sort((a, b) => tier(b) - tier(a) || b.high - a.high || a.id.localeCompare(b.id));
}

/** Bounded representatives, sufficient for hints/policy; manual selections use classify. */
export function legalPlays(hand: Card[], level: number, lead: Pattern | null): Play[] {
  const ws = hand.filter(c => wild(c, level));
  const natural = hand.filter(c => !wild(c, level));
  const groups = new Map<number, Card[]>();
  for (const card of sorted(natural, level)) { const g = groups.get(card.rank) ?? []; g.push(card); groups.set(card.rank, g); }
  const seen = new Set<string>();
  const selections = new Set<string>();
  const result: Play[] = [];
  const add = (cards: Card[]) => {
    const key = cards.map(c => c.id).sort((a, b) => a - b).join(',');
    if (selections.has(key)) return;
    selections.add(key);
    for (const p of classify(cards, level)) if (beats(p, lead)) {
      const full = key + '/' + p.id;
      if (!seen.has(full)) { seen.add(full); result.push({ cards, pattern: p }); }
    }
  };
  const take = (needs: Requirement[]) => {
    const cards: Card[] = []; let used = 0;
    for (const need of needs) {
      const available = (groups.get(need.rank) ?? []).filter(c => !need.suit || c.suit === need.suit);
      const picked = available.slice(0, need.count);
      cards.push(...picked);
      const missing = need.count - picked.length;
      if ((missing && need.rank > 14) || used + missing > ws.length) return;
      cards.push(...ws.slice(used, used + missing)); used += missing;
    }
    add(cards);
  };
  if (!lead || lead.kind === 'single') for (const card of hand) add([card]);
  for (let rank = 2; rank <= 17; rank++) {
    if (rank === 15) continue;
    const pool = groups.get(rank) ?? [];
    const max = rank > 14 ? pool.length : Math.min(10, pool.length + ws.length);
    for (let count = 2; count <= max; count++) {
      if (count < 4 && lead && !((count === 2 && lead.kind === 'pair') || (count === 3 && lead.kind === 'triple'))) continue;
      for (let use = 0; use <= ws.length && use <= count; use++) {
        if (rank > 14 && use) continue;
        if (count - use <= pool.length) add([...pool.slice(0, count - use), ...ws.slice(0, use)]);
      }
    }
  }
  if (hand.filter(c => c.rank >= 16).length === 4) add(hand.filter(c => c.rank >= 16));
  if (!lead || lead.kind === 'fullhouse') {
    for (let triple = 2; triple <= 14; triple++) {
      if ((groups.get(triple)?.length ?? 0) + ws.length < 3) continue;
      for (let pair = 2; pair <= 17; pair++) if (pair !== triple && pair !== 15) take([{ rank: triple, count: 3 }, { rank: pair, count: 2 }]);
    }
  }
  if (!lead || lead.kind === 'straight') for (let start = 1; start <= 10; start++) take(sequence(start, 5).map(rank => ({ rank, count: 1 })));
  // Straight flushes must also be considered against bombs.
  for (let start = 1; start <= 10; start++) for (const suit of SUITS) take(sequence(start, 5).map(rank => ({ rank, count: 1, suit })));
  if (!lead || lead.kind === 'pairs') for (let start = 1; start <= 12; start++) take(sequence(start, 3).map(rank => ({ rank, count: 2 })));
  if (!lead || lead.kind === 'steel') for (let start = 1; start <= 13; start++) take(sequence(start, 2).map(rank => ({ rank, count: 3 })));
  return result.sort((a, b) => tier(a.pattern) - tier(b.pattern) || a.pattern.high - b.pattern.high || a.cards.length - b.cards.length);
}

export function returnable(hand: Card[], level: number): Card[] {
  const low = hand.filter(c => point(c.rank, level) <= 10);
  if (low.length) return sorted(low, level);
  const min = Math.min(...hand.map(c => point(c.rank, level)));
  return sorted(hand.filter(c => point(c.rank, level) === min), level);
}
