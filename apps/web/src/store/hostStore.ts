/**
 * Host-side Zustand store.
 *
 * Covers: auth, quiz list, active game state (phase, players, question,
 * distribution, leaderboard).  Socket handlers are registered once from
 * the HostGame component.
 */
import { create } from 'zustand';
import type { GamePhase, RankedPlayer } from '@amadeus/shared';
import { HostEvents, ServerEvents } from '@amadeus/shared';
import { socket } from '../lib/socket';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HostPlayer {
  id: string;
  nickname: string;
}

export interface ActiveQuestion {
  questionId: string;
  text: string;
  options: string[];
  correct: number[];
  timeLimitSec: number;
  basePoints: number;
  endsAt: number;
  serverTime: number;
}

export interface HostState {
  // auth
  password: string;
  authed: boolean;

  // active game
  pin: string;
  hostToken: string;
  gameId: string;
  phase: GamePhase | null;
  players: HostPlayer[];
  answeredCount: number;
  totalPlayers: number;
  question: ActiveQuestion | null;
  questionIndex: number;
  totalQuestions: number;
  distribution: number[];
  correctIndices: number[];
  leaderboard: RankedPlayer[];
  top3: RankedPlayer[];
  allRanked: RankedPlayer[];
  tieDetectedIds: string[];

  error: string;
}

const INITIAL: HostState = {
  password: '',
  authed: false,
  pin: '',
  hostToken: '',
  gameId: '',
  phase: null,
  players: [],
  answeredCount: 0,
  totalPlayers: 0,
  question: null,
  questionIndex: -1,
  totalQuestions: 0,
  distribution: [],
  correctIndices: [],
  leaderboard: [],
  top3: [],
  allRanked: [],
  tieDetectedIds: [],
  error: '',
};

export const useHostStore = create<HostState>(() => ({ ...INITIAL }));

const set = useHostStore.setState;

export function resetHost(): void {
  set({ ...INITIAL });
}

// ---------------------------------------------------------------------------
// Auth helpers (password stored in sessionStorage so a tab refresh keeps it)
// ---------------------------------------------------------------------------

export function loadStoredAuth(): void {
  const pw = sessionStorage.getItem('aaa_host_pw');
  if (pw) set({ password: pw, authed: true });
}

export function saveAuth(password: string): void {
  sessionStorage.setItem('aaa_host_pw', password);
  set({ password, authed: true });
}

export function clearAuth(): void {
  sessionStorage.removeItem('aaa_host_pw');
  set({ password: '', authed: false });
}

// ---------------------------------------------------------------------------
// Game socket actions
// ---------------------------------------------------------------------------

export function createGame(
  quizId: string,
  settings: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!socket.connected) socket.connect();
    socket.emit(
      HostEvents.CREATE,
      { quizId, settings },
      (res: {
        ok: boolean;
        data?: { pin: string; hostToken: string; gameId: string };
        error?: { message: string };
      }) => {
        if (!res.ok) {
          resolve({ ok: false, error: res.error?.message ?? 'Failed to create game' });
          return;
        }
        const { pin, hostToken, gameId } = res.data!;
        set({ pin, hostToken, gameId, phase: 'lobby', error: '' });
        sessionStorage.setItem('aaa_host_game', JSON.stringify({ pin, hostToken }));
        resolve({ ok: true });
      },
    );
  });
}

export function resumeGame(
  pin: string,
  hostToken: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit(
      HostEvents.RESUME,
      { pin, hostToken },
      (res: {
        ok: boolean;
        data?: { phase: GamePhase; players: HostPlayer[] };
        error?: { message: string };
      }) => {
        if (!res.ok) {
          resolve({ ok: false, error: res.error?.message });
          return;
        }
        set({
          pin,
          hostToken,
          phase: res.data!.phase,
          players: res.data!.players,
          error: '',
        });
        resolve({ ok: true });
      },
    );
  });
}

export function startGame(pin: string): void {
  socket.emit(HostEvents.START, { pin }, (res: { ok: boolean; error?: { message: string } }) => {
    if (!res.ok) set({ error: res.error?.message ?? 'Could not start' });
  });
}

export function skipQuestion(pin: string): void {
  socket.emit(HostEvents.SKIP, { pin }, () => { /* fire and forget */ });
}

export function nextPhase(pin: string): void {
  socket.emit(HostEvents.NEXT, { pin }, () => { /* fire and forget */ });
}

export function endGame(pin: string): void {
  socket.emit(HostEvents.END, { pin }, () => { /* fire and forget */ });
}

export function kickPlayer(pin: string, playerId: string): void {
  socket.emit(HostEvents.KICK, { pin, playerId }, () => { /* fire and forget */ });
}

export function resolveTie(pin: string, orderedPlayerIds: string[]): void {
  socket.emit(HostEvents.RESOLVE_TIE, { pin, orderedPlayerIds }, () => { /* fire and forget */ });
}

// ---------------------------------------------------------------------------
// Socket event handlers — registered once from HostGame
// ---------------------------------------------------------------------------

let _registered = false;

export function registerHostSocketHandlers(): void {
  if (_registered) return;
  _registered = true;

  socket.on(ServerEvents.LOBBY_UPDATE, (payload: { players: HostPlayer[]; count: number }) => {
    set({ players: payload.players, totalPlayers: payload.count });
  });

  socket.on(
    ServerEvents.GAME_PHASE,
    (payload: { phase: GamePhase; questionIndex: number; total: number }) => {
      set({
        phase: payload.phase,
        questionIndex: payload.questionIndex,
        totalQuestions: payload.total,
        answeredCount: 0,
        distribution: [],
        correctIndices: [],
      });
    },
  );

  socket.on(ServerEvents.QUESTION_START, (payload: ActiveQuestion) => {
    set({
      phase: 'question',
      question: payload,
      answeredCount: 0,
      distribution: [],
    });
  });

  socket.on(
    ServerEvents.QUESTION_PROGRESS,
    (payload: { answered: number; total: number }) => {
      set({ answeredCount: payload.answered, totalPlayers: payload.total });
    },
  );

  socket.on(
    ServerEvents.QUESTION_REVEAL,
    (payload: { correct: number[]; distribution: number[]; top5: RankedPlayer[] }) => {
      set({
        phase: 'reveal',
        correctIndices: payload.correct,
        distribution: payload.distribution,
        leaderboard: payload.top5,
      });
    },
  );

  socket.on(ServerEvents.LEADERBOARD_SHOW, (payload: { ranked: RankedPlayer[] }) => {
    set({ phase: 'leaderboard', leaderboard: payload.ranked });
  });

  socket.on(
    ServerEvents.PODIUM_SHOW,
    (payload: { top3: RankedPlayer[]; all: RankedPlayer[] }) => {
      set({ phase: 'podium', top3: payload.top3, allRanked: payload.all });
    },
  );

  socket.on(HostEvents.TIE_DETECTED, (payload: { tiedPlayerIds: string[] }) => {
    set({ tieDetectedIds: payload.tiedPlayerIds });
  });

  socket.on(ServerEvents.GAME_ENDED, () => {
    set({ phase: 'ended' });
    sessionStorage.removeItem('aaa_host_game');
  });
}
