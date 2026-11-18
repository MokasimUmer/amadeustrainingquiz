/**
 * Player-side Zustand store.
 *
 * All mutations happen inside socket event handlers registered once in
 * useSocketSetup (called from App). Components read from this store and
 * never call socket.emit directly — they go through the action functions
 * exported below.
 */
import { create } from 'zustand';
import type { GamePhase, RankedPlayer } from '@amadeus/shared';
import { PlayerEvents, ServerEvents } from '@amadeus/shared';
import { socket } from '../lib/socket';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnswerState = 'idle' | 'locked' | 'correct' | 'wrong';

export interface QuestionView {
  questionId: string;
  optionCount: number;
  text?: string;
  endsAt: number;
  serverTime: number;
}

export interface ResultView {
  correct: boolean;
  pointsEarned: number;
  score: number;
  rank: number;
  streak: number;
  behind: { nickname: string; gap: number } | null;
}

export interface PlayerState {
  // identity
  pin: string;
  playerId: string;
  reconnectToken: string;
  nickname: string;

  // game state
  phase: GamePhase | null;
  lobbyCount: number;

  // current question
  question: QuestionView | null;
  answerState: AnswerState;
  chosenIndex: number | null;

  // last result
  result: ResultView | null;

  // final leaderboard
  finalRank: RankedPlayer | null;
  allRanked: RankedPlayer[];

  // error shown on screens
  error: string;
}

type SetFn = (partial: Partial<PlayerState> | ((s: PlayerState) => Partial<PlayerState>)) => void;

const INITIAL: PlayerState = {
  pin: '',
  playerId: '',
  reconnectToken: '',
  nickname: '',
  phase: null,
  lobbyCount: 0,
  question: null,
  answerState: 'idle',
  chosenIndex: null,
  result: null,
  finalRank: null,
  allRanked: [],
  error: '',
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlayerStore = create<PlayerState>(() => ({ ...INITIAL }));

const set: SetFn = usePlayerStore.setState;

/** Reset to initial state (called on game end or leave). */
export function resetPlayer(): void {
  set({ ...INITIAL });
}

// ---------------------------------------------------------------------------
// Socket actions (called by components)
// ---------------------------------------------------------------------------

export function joinGame(
  pin: string,
  nickname: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit(
      PlayerEvents.JOIN,
      { pin, nickname },
      (res: { ok: boolean; data?: { playerId: string; reconnectToken: string }; error?: { message: string } }) => {
        if (!res.ok) {
          resolve({ ok: false, error: res.error?.message ?? 'Failed to join' });
          return;
        }
        const { playerId, reconnectToken } = res.data!;
        set({ pin, nickname, playerId, reconnectToken, phase: 'lobby', error: '' });
        // Persist reconnect credentials
        localStorage.setItem('aaa_reconnect', JSON.stringify({ pin, playerId, reconnectToken }));
        resolve({ ok: true });
      },
    );
  });
}

export function submitAnswer(
  pin: string,
  questionId: string,
  choice: number,
): void {
  // Optimistic lock
  set({ answerState: 'locked', chosenIndex: choice });

  socket.emit(
    PlayerEvents.ANSWER,
    { pin, questionId, choice },
    (res: { ok: boolean; error?: { code: string } }) => {
      if (!res.ok) {
        // Roll back optimistic update on error
        set({ answerState: 'idle', chosenIndex: null });
      }
      // Actual result arrives via player:result event
    },
  );
}

// ---------------------------------------------------------------------------
// Socket event handlers — registered once at app start
// ---------------------------------------------------------------------------

export function registerPlayerSocketHandlers(): void {
  socket.on(ServerEvents.LOBBY_UPDATE, (payload: { count: number }) => {
    set({ lobbyCount: payload.count });
  });

  socket.on(ServerEvents.GAME_PHASE, (payload: { phase: GamePhase }) => {
    set({ phase: payload.phase });
  });

  socket.on(ServerEvents.QUESTION_START, (payload: QuestionView) => {
    set({
      phase: 'question',
      question: payload,
      answerState: 'idle',
      chosenIndex: null,
      result: null,
    });
  });

  socket.on(PlayerEvents.RESULT, (payload: ResultView) => {
    set({
      result: payload,
      answerState: payload.correct ? 'correct' : 'wrong',
    });
  });

  socket.on(ServerEvents.QUESTION_REVEAL, () => {
    set({ phase: 'reveal' });
  });

  socket.on(ServerEvents.LEADERBOARD_SHOW, () => {
    set({ phase: 'leaderboard' });
  });

  socket.on(ServerEvents.PODIUM_SHOW, (payload: { top3: RankedPlayer[]; all: RankedPlayer[] }) => {
    const { pin, playerId } = usePlayerStore.getState();
    const me = payload.all.find((p) => p.id === playerId) ?? null;
    set({ phase: 'podium', finalRank: me, allRanked: payload.all, pin });
  });

  socket.on(ServerEvents.GAME_ENDED, () => {
    set({ phase: 'ended' });
  });

  socket.on(PlayerEvents.KICKED, () => {
    resetPlayer();
  });

  socket.on(ServerEvents.GAME_SNAPSHOT, (payload: {
    phase: GamePhase;
    questionIndex: number;
    total: number;
    endsAt: number;
    serverTime: number;
    question: { questionId: string; optionCount: number; text?: string } | null;
    myScore: number;
    myStreak: number;
  }) => {
    if (payload.phase === 'question' && payload.question) {
      set({
        phase: 'question',
        question: {
          questionId: payload.question.questionId,
          optionCount: payload.question.optionCount,
          text: payload.question.text,
          endsAt: payload.endsAt,
          serverTime: payload.serverTime,
        },
      });
    } else {
      set({ phase: payload.phase });
    }
  });
}
