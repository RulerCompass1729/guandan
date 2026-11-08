import type { Card } from './cards.js';
import type { Game, Display, RoundResult } from './game.js';
import type { Pattern } from './rules.js';
import type { Difficulty } from './policy.js';

export type Stage = 'waiting' | 'tribute' | 'playing' | 'roundOver' | 'matchOver';
export interface Seat {
  playerId: string; name: string; tokenHash: string | null; kind: 'human' | 'ai';
  auto: boolean; connected: boolean; epoch: number;
}
export interface Result extends RoundResult { before: number[]; after: number[]; matchWinner: number | null; }
export interface Room {
  code: string; owner: string; seats: (Seat | null)[]; version: number; stage: Stage;
  createdAt: number; updatedAt: number; levels: number[]; activeTeam: number;
  round: number; game: Game | null; result: Result | null; notice: string;
  difficulty: Difficulty;
}
export interface SeatView {
  index: number; name: string; kind: 'human' | 'ai' | 'empty'; connected: boolean;
  auto: boolean; count: number; finish: number | null;
}
export interface View {
  code: string; version: number; ruleVersion: string; stage: Stage; self: number;
  host: number; seats: SeatView[]; hand: Card[]; levels: number[]; level: number;
  round: number; roundId: string | null; turn: number; last: Display;
  displays: Display[]; result: Result | null; notice: string;
  difficulty: Difficulty;
  returnIds: number[]; tribute: { giver: number; receiver: number; card: Card; done: boolean }[];
}
export type ActionType = 'start' | 'next' | 'restart' | 'play' | 'pass' | 'return' | 'auto' | 'resume' | 'switch' | 'leave' | 'difficulty';
export interface Action {
  type: ActionType; actionId: string; expectedVersion: number; roundId?: string | null;
  ids?: number[]; patternId?: string; seat?: number;
  difficulty?: Difficulty;
}
export interface Preview { patterns: Pattern[]; message: string; }
