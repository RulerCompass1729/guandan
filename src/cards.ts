export type Suit = 'S' | 'H' | 'C' | 'D' | 'J';
export interface Card { id: number; rank: number; suit: Suit; }
export const SUITS = ['S', 'H', 'C', 'D'] as const;
export const RANK_NAMES: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 16: '小王', 17: '大王' };
export const SUIT_NAMES: Record<Suit, string> = { S: '黑桃', H: '红桃', C: '梅花', D: '方块', J: '' };
export function deck(): Card[] {
  const cards: Card[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (let rank = 2; rank <= 14; rank++) for (const suit of SUITS) cards.push({ id: cards.length, rank, suit });
    for (const rank of [16, 17]) cards.push({ id: cards.length, rank, suit: 'J' });
  }
  return cards;
}
export function wild(card: Card, level: number): boolean { return card.rank === level && card.suit === 'H'; }
export function point(rank: number, level: number): number { return rank === level ? 15 : rank; }
export function label(card: Card): string { return SUIT_NAMES[card.suit] + (RANK_NAMES[card.rank] ?? card.rank); }
export function sorted(cards: Card[], level: number): Card[] {
  return [...cards].sort((a, b) => point(a.rank, level) - point(b.rank, level) || SUITS.indexOf(a.suit as 'S') - SUITS.indexOf(b.suit as 'S') || a.id - b.id);
}
export function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
/** Test and policy randomness only. Production dealing supplies crypto randomness. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
