import { type Card, point, wild } from './cards.js';
import { type Pattern, type Play, legalPlays, returnable, tier } from './rules.js';

export interface Observation {
  seat: number; hand: Card[]; level: number; lead: { seat: number; pattern: Pattern } | null;
  counts: number[]; finished: number[]; returning: boolean;
}
export interface Decision { ids: number[] | null; patternId?: string; }
export function decide(obs: Observation): Decision {
  if (obs.returning) return { ids: [returnable(obs.hand, obs.level)[0].id] };
  const options = legalPlays(obs.hand, obs.level, obs.lead?.pattern ?? null);
  if (!options.length) return { ids: null };
  const finishing = options.find(p => p.cards.length === obs.hand.length);
  if (finishing) return { ids: finishing.cards.map(c => c.id), patternId: finishing.pattern.id };
  const mateLeading = obs.lead && obs.lead.seat % 2 === obs.seat % 2;
  if (mateLeading) return { ids: null };
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
  options.sort((a, b) => score(b) - score(a) || a.cards.map(c => c.id).join(',').localeCompare(b.cards.map(c => c.id).join(',')));
  return { ids: options[0].cards.map(c => c.id), patternId: options[0].pattern.id };
}
