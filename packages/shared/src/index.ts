export type {
  AnswerIndex,
  Question,
  Quiz,
  ScoringMode,
  TieBreak,
  GameSettings,
  GamePhase,
  Player,
  RankedPlayer,
} from './types.js';

export { defaultGameSettings } from './types.js';

export type { ComputePointsOpts } from './scoring.js';
export { computePoints } from './scoring.js';

export { rankPlayers, topN, hasTopTie, applyTieResolution } from './leaderboard.js';

export type {
  LobbyUpdatePayload,
  GamePhasePayload,
  QuestionStartHostPayload,
  QuestionStartPlayerPayload,
  QuestionProgressPayload,
  QuestionRevealPayload,
  PlayerResultPayload,
  LeaderboardShowPayload,
  PodiumShowPayload,
  AckOk,
  AckError,
  Ack,
  ErrorCode,
} from './events.js';

export {
  gameSettingsSchema,
  hostCreateSchema,
  hostResumeSchema,
  hostStartSchema,
  hostSkipSchema,
  hostNextSchema,
  hostEndSchema,
  hostKickSchema,
  hostResolveTieSchema,
  playerJoinSchema,
  playerRejoinSchema,
  playerAnswerSchema,
  HostEvents,
  PlayerEvents,
  ServerEvents,
} from './events.js';
