import { z } from 'zod';
import type { RankedPlayer, GamePhase, ScoringMode, TieBreak } from './types.js';

// ---------------------------------------------------------------------------
// Re-usable primitive schemas
// ---------------------------------------------------------------------------

const pinSchema = z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits');
const playerIdSchema = z.string().uuid();
const questionIdSchema = z.string().min(1);
const answerIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

// ---------------------------------------------------------------------------
// Game settings schema
// ---------------------------------------------------------------------------

export const gameSettingsSchema = z.object({
  scoringMode: z.enum(['speed', 'flat'] satisfies [ScoringMode, ScoringMode]),
  tieBreak: z.enum(['time', 'host'] satisfies [TieBreak, TieBreak]),
  showLeaderboardEachQuestion: z.boolean(),
  maxPlayers: z.number().int().min(1).max(100),
  lockLobbyOnStart: z.boolean(),
});

// ---------------------------------------------------------------------------
// Client → Server: host events
// ---------------------------------------------------------------------------

export const hostCreateSchema = z.object({
  quizId: z.string().min(1),
  settings: gameSettingsSchema.partial().optional(),
});

export const hostResumeSchema = z.object({
  pin: pinSchema,
  hostToken: z.string().min(1),
});

export const hostStartSchema = z.object({ pin: pinSchema });
export const hostSkipSchema = z.object({ pin: pinSchema });
export const hostNextSchema = z.object({ pin: pinSchema });
export const hostEndSchema = z.object({ pin: pinSchema });

export const hostKickSchema = z.object({
  pin: pinSchema,
  playerId: playerIdSchema,
});

export const hostResolveTieSchema = z.object({
  pin: pinSchema,
  orderedPlayerIds: z.array(playerIdSchema).min(2),
});

// ---------------------------------------------------------------------------
// Client → Server: player events
// ---------------------------------------------------------------------------

export const playerJoinSchema = z.object({
  pin: pinSchema,
  nickname: z.string().min(1).max(20),
});

export const playerRejoinSchema = z.object({
  pin: pinSchema,
  playerId: playerIdSchema,
  reconnectToken: z.string().min(1),
});

export const playerAnswerSchema = z.object({
  pin: pinSchema,
  questionId: questionIdSchema,
  choice: answerIndexSchema,
});

// ---------------------------------------------------------------------------
// Server → Client payload types  (plain interfaces, no Zod needed server-side)
// ---------------------------------------------------------------------------

export interface LobbyUpdatePayload {
  players: { id: string; nickname: string }[];
  count: number;
}

export interface GamePhasePayload {
  phase: GamePhase;
  questionIndex: number;
  total: number;
  serverTime: number;
}

/** Sent to the host – includes full question text and correct answer. */
export interface QuestionStartHostPayload {
  questionId: string;
  text: string;
  options: string[];
  correct: number[];
  timeLimitSec: number;
  basePoints: number;
  endsAt: number;
  serverTime: number;
}

/** Sent to players – NO correct answer, NO question text by default. */
export interface QuestionStartPlayerPayload {
  questionId: string;
  optionCount: number;
  endsAt: number;
  serverTime: number;
  /** When showTextOnPlayer is true the host setting exposes this. */
  text?: string;
}

export interface QuestionProgressPayload {
  answered: number;
  total: number;
}

export interface QuestionRevealPayload {
  correct: number[];
  distribution: number[];
  top5: RankedPlayer[];
}

export interface PlayerResultPayload {
  correct: boolean;
  pointsEarned: number;
  score: number;
  rank: number;
  streak: number;
  behind: { nickname: string; gap: number } | null;
}

export interface LeaderboardShowPayload {
  ranked: RankedPlayer[];
}

export interface PodiumShowPayload {
  top3: RankedPlayer[];
  all: RankedPlayer[];
}

// ---------------------------------------------------------------------------
// Acknowledgement envelope
// ---------------------------------------------------------------------------

export type AckOk<T = undefined> = T extends undefined
  ? { ok: true }
  : { ok: true; data: T };

export type AckError = {
  ok: false;
  error: { code: ErrorCode; message: string };
};

export type Ack<T = undefined> = AckOk<T> | AckError;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'GAME_NOT_FOUND'
  | 'GAME_LOCKED'
  | 'GAME_FULL'
  | 'NICKNAME_TAKEN'
  | 'NICKNAME_INVALID'
  | 'NOT_HOST'
  | 'BAD_PHASE'
  | 'ALREADY_ANSWERED'
  | 'TOO_LATE'
  | 'RATE_LIMITED';

// ---------------------------------------------------------------------------
// Socket event name constants
// ---------------------------------------------------------------------------

export const HostEvents = {
  CREATE: 'host:create',
  RESUME: 'host:resume',
  START: 'host:start',
  SKIP: 'host:skip',
  NEXT: 'host:next',
  KICK: 'host:kick',
  RESOLVE_TIE: 'host:resolveTie',
  END: 'host:end',
  TIE_DETECTED: 'host:tieDetected',
} as const;

export const PlayerEvents = {
  JOIN: 'player:join',
  REJOIN: 'player:rejoin',
  ANSWER: 'player:answer',
  RESULT: 'player:result',
  KICKED: 'player:kicked',
} as const;

export const ServerEvents = {
  LOBBY_UPDATE: 'lobby:update',
  GAME_PHASE: 'game:phase',
  GAME_SNAPSHOT: 'game:snapshot',
  GAME_ENDED: 'game:ended',
  QUESTION_START: 'question:start',
  QUESTION_PROGRESS: 'question:progress',
  QUESTION_REVEAL: 'question:reveal',
  LEADERBOARD_SHOW: 'leaderboard:show',
  PODIUM_SHOW: 'podium:show',
  TIME_PING: 'time:ping',
  TIME_PONG: 'time:pong',
} as const;
