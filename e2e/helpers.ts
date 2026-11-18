/**
 * Shared helpers for e2e tests.
 *
 * We drive the server directly via socket.io-client rather than mocking it,
 * so each test gets a real game with a real PIN.
 */
import { io as ioc } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { HostEvents, PlayerEvents } from '@amadeus/shared';
import type { Quiz } from '@amadeus/shared';

const SERVER_URL = 'http://localhost:3000';

export const TEST_QUIZ: Quiz = {
  id: 'e2e-quiz',
  title: 'E2E Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'e2e-q0',
      text: 'What is 1+1?',
      options: ['1', '2', '3', '4'],
      correct: [1],
      timeLimitSec: 30,
      basePoints: 1000,
    },
  ],
};

/** Connect a socket and wait until it is connected. */
export function connectSocket(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(SERVER_URL, { reconnection: false });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

/** Create a game via the host socket and return PIN + hostToken. */
export async function createTestGame(
  hostSocket: Socket,
  settings: Record<string, unknown> = {},
): Promise<{ pin: string; hostToken: string }> {
  return new Promise((resolve, reject) => {
    hostSocket.emit(
      HostEvents.CREATE,
      { quizId: TEST_QUIZ.id, settings: { scoringMode: 'flat', showLeaderboardEachQuestion: false, ...settings } },
      (res: { ok: boolean; data?: { pin: string; hostToken: string }; error?: { message: string } }) => {
        if (res.ok) resolve(res.data!);
        else reject(new Error(res.error?.message ?? 'create failed'));
      },
    );
  });
}

/** Join as a player and return playerId. */
export async function joinAsPlayer(
  playerSocket: Socket,
  pin: string,
  nickname: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    playerSocket.emit(
      PlayerEvents.JOIN,
      { pin, nickname },
      (res: { ok: boolean; data?: { playerId: string }; error?: { message: string } }) => {
        if (res.ok) resolve(res.data!.playerId);
        else reject(new Error(res.error?.message ?? 'join failed'));
      },
    );
  });
}

/** Wait for a socket event and return its payload. */
export function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}
