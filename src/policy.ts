import { type Card, point, wild } from './cards.js';
import { type Pattern, type Play, legalPlays, returnable, tier } from './rules.js';

export type Difficulty = 'easy' | 'standard' | 'advanced';
export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'standard' || value === 'advanced';
}
/** Missing fields in older saved games retain the original policy. */
export function difficulty(value: unknown): Difficulty { return isDifficulty(value) ? value : 'standard'; }
export interface Observation {
  seat: number; hand: Card[]; level: number; lead: { seat: number; pattern: Pattern } | null;
  counts: number[]; finished: number[]; returning: boolean;
  difficulty?: Difficulty;
}
export interface Decision { ids: number[] | null; patternId?: string; }

/** A bounded own-hand heuristic. No sampled or actual opponents' hands are used. */
function remainingCost(hand: Card[]): number {
  const original = Array(18).fill(0) as number[];
  for (const card of hand) original[card.rank]++;
  let best = Infinity;
  // Try both sequences-first and rank-groups-first decompositions. This is an
  // estimate, not a promise of an exact minimum or an exhaustive search.
  for (let order = 0; order < 2; order++) {
    const counts = original.slice(); let turns = 0;
    const groups = () => {
      for (let rank = 2; rank <= 14; rank++) if (counts[rank] >= 4) { counts[rank] = 0; turns++; }
    };
    if (counts[16] === 2 && counts[17] === 2) { counts[16] = counts[17] = 0; turns++; }
    if (order === 1) groups();
    for (const [width, size] of [[2, 3], [3, 2], [5, 1]]) {
      for (let start = 1; start <= 15 - width; start++) {
        const ranks = Array.from({ length: width }, (_, i) => start + i === 1 ? 14 : start + i);
        while (ranks.every(rank => counts[rank] >= size)) {
          for (const rank of ranks) counts[rank] -= size;
          turns++;
        }
      }
    }
    if (order === 0) groups();
    for (let rank = 2; rank <= 14; rank++) while (counts[rank] >= 3) {
      counts[rank] -= 3; turns++;
      const pair = counts.findIndex((count, r) => r >= 2 && r !== rank && count >= 2);
      if (pair >= 0) counts[pair] -= 2;
    }
    for (let rank = 2; rank <= 17; rank++) turns += Math.ceil(counts[rank] / 2);
    const smallSingles = counts.reduce((n, count, rank) => n + (rank >= 2 && rank <= 10 && count % 2 === 1 ? 1 : 0), 0);
    best = Math.min(best, turns * 12 + smallSingles * 2);
  }
  return best;
}

export function decide(obs: Observation): Decision {
  if (obs.returning) return { ids: [returnable(obs.hand, obs.level)[0].id] };
  const options = legalPlays(obs.hand, obs.level, obs.lead?.pattern ?? null);
  if (!options.length) return { ids: null };
  const finishing = options.find(p => p.cards.length === obs.hand.length);
  if (finishing) return { ids: finishing.cards.map(c => c.id), patternId: finishing.pattern.id };
  const mateLeading = obs.lead && obs.lead.seat % 2 === obs.seat % 2;
  if (mateLeading) return { ids: null };
  const mode = difficulty(obs.difficulty);
  if (mode === 'easy') {
    // Deliberately simple: use the smallest legal representative. The same
    // finish/teammate guards above still apply, and every choice is legal.
    options.sort((a, b) => tier(a.pattern) - tier(b.pattern) || a.pattern.high - b.pattern.high ||
      a.cards.length - b.cards.length || a.cards.map(c => c.id).join(',').localeCompare(b.cards.map(c => c.id).join(',')));
    const play = options[0];
    return { ids: play.cards.map(c => c.id), patternId: play.pattern.id };
  }
  const danger = obs.counts.some((n, seat) => seat % 2 !== obs.seat % 2 && n > 0 && n <= 2);
  const score = (play: Play): number => {
    const bomb = tier(play.pattern) > 0;
    let value = play.cards.length * (obs.lead ? 4 : 9) - play.pattern.high * 0.7 - (bomb ? 70 : 0);
    value -= play.cards.filter(c => wild(c, obs.level)).length * 10;
    if (danger && obs.lead?.pattern.kind === 'single') value += play.pattern.high * 2;
    if (obs.hand.length - play.cards.length <= 2) value += 20;
    // Avoid breaking ordinary pairs/triples merely to play a small single.
    if (play.cards.length === 1) {
      const c = play.cards[0];
      const groupSize = obs.hand.filter(x => point(x.rank, obs.level) === point(c.rank, obs.level)).length;
      if (groupSize > 1) value -= groupSize * 5;
    }
    return value;
  };
  const advancedScore = (play: Play): number => {
    const used = new Set(play.cards.map(c => c.id)), rest = obs.hand.filter(c => !used.has(c.id));
    const bomb = tier(play.pattern) > 0;
    let value = -remainingCost(rest) - play.pattern.high * 0.35;
    value -= play.cards.filter(c => wild(c, obs.level)).length * 5;
    if (bomb && rest.length > 2) value -= danger ? 4 : 18;
    // Force a high single/pair when an opponent can otherwise go out at once.
    if (danger && obs.lead && !bomb && ['single', 'pair'].includes(obs.lead.pattern.kind)) value += play.pattern.high * 2;
    if (!obs.lead && danger && play.cards.length <= 2) value -= 15;
    return value;
  };
  // Cache scores: Array.sort must not repeat the hand decomposition on Rhino.
  const ranked = options.map(play => ({ play, value: mode === 'advanced' ? advancedScore(play) : score(play) }));
  ranked.sort((a, b) => b.value - a.value || a.play.cards.map(c => c.id).join(',').localeCompare(b.play.cards.map(c => c.id).join(',')));
  options[0] = ranked[0].play;
  return { ids: options[0].cards.map(c => c.id), patternId: options[0].pattern.id };
}
