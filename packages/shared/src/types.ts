export type AnswerIndex = 0 | 1 | 2 | 3;

export interface Question {
  id: string;
  text: string;
  options: string[];
  correct: AnswerIndex[];
  timeLimitSec: number;
  basePoints: number;
}

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
  createdAt: number;
  updatedAt: number;
}

export type ScoringMode = 'speed' | 'flat';
export type TieBreak = 'time' | 'host';

export interface GameSettings {
  scoringMode: ScoringMode;
  tieBreak: TieBreak;
  showLeaderboardEachQuestion: boolean;
  maxPlayers: number;
  lockLobbyOnStart: boolean;
}

export type GamePhase = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'podium' | 'ended';

export interface Player {
  id: string;
  nickname: string;
  socketId: string | null;
  reconnectToken: string;
  score: number;
  streak: number;
  totalResponseMs: number;
  answers: Record<string, { choice: AnswerIndex; ms: number; correct: boolean; points: number }>;
  connected: boolean;
}

export interface RankedPlayer {
  id: string;
  nickname: string;
  score: number;
  rank: number;
  streak: number;
  delta: number;
}

export const defaultGameSettings: GameSettings = {
  scoringMode: 'speed',
  tieBreak: 'time',
  showLeaderboardEachQuestion: true,
  maxPlayers: 100,
  lockLobbyOnStart: true,
};
