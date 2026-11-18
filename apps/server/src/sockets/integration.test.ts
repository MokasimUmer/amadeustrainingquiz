/**
 * Integration test: spins up the real Express + Socket.IO server in-process
 * and simulates a full game: host creates → 3 players join → start →
 * all answer Q1 → reveal → leaderboard → Q2 → all answer → reveal →
 * leaderboard → podium → end.
 *
 * Uses real sockets (socket.io-client) but an ephemeral in-process server
 * so no network or port collision issues.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import {
  HostEvents,
  PlayerEvents,
  ServerEvents,
} from '@amadeus/shared';
import type { Quiz } from '@amadeus/shared';
import { GameManager } from '../game/GameManager.js';
import { registerHostHandlers } from './hostHandlers.js';
import { registerPlayerHandlers } from './playerHandlers.js';
import { resetJoinRecords } from './middleware.js';

// ---------------------------------------------------------------------------
// Test quiz
// ---------------------------------------------------------------------------

const TEST_QUIZ: Quiz = {
  id: 'test-quiz',
  title: 'Integration Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q0',
      text: 'What is 1+1?',
      options: ['1', '2', '3', '4'],
      correct: [1],
      timeLimitSec: 20,
      basePoints: 1000,
    },
    {
      id: 'q1',
      text: 'What is 2+2?',
      options: ['2', '3', '4', '5'],
      correct: [2],
      timeLimitSec: 20,
      basePoints: 1000,
    },
  ],
};

// ---------------------------------------------------------------------------
// Server setup / teardown
// ---------------------------------------------------------------------------

let httpServer: ReturnType<typeof createServer>;
let ioServer: Server;
let manager: GameManager;
let serverUrl: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      httpServer = createServer();
      ioServer = new Server(httpServer, { cors: { origin: '*' } });
      manager = new GameManager();

      ioServer.on('connection', (socket) => {
        registerHostHandlers(ioServer, socket, manager, (id) =>
          id === TEST_QUIZ.id ? TEST_QUIZ : undefined,
        );
        registerPlayerHandlers(ioServer, socket, manager);
      });

      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      ioServer.close();
      httpServer.close(() => resolve());
    }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connect(): ClientSocket {
  return ioc(serverUrl, { autoConnect: true, reconnection: false });
}

function waitFor(socket: ClientSocket, event: string): Promise<unknown> {
  return new Promise((resolve) => socket.once(event, resolve));
}

function call(
  socket: ClientSocket,
  event: string,
  payload: unknown,
): Promise<unknown> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Socket integration – full game with 3 players', () => {
  let hostSocket: ClientSocket;
  let p1Socket: ClientSocket;
  let p2Socket: ClientSocket;
  let p3Socket: ClientSocket;
  let pin: string;
  let hostToken: string;

  beforeEach(async () => {
    resetJoinRecords(); // reset per-IP join rate limiter between tests
    hostSocket = connect();
    p1Socket = connect();
    p2Socket = connect();
    p3Socket = connect();
    await Promise.all([
      connected(hostSocket),
      connected(p1Socket),
      connected(p2Socket),
      connected(p3Socket),
    ]);
  });

  afterEach(() => {
    hostSocket.disconnect();
    p1Socket.disconnect();
    p2Socket.disconnect();
    p3Socket.disconnect();
  });

  it('host:create returns pin, hostToken, gameId', async () => {
    const res = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string; hostToken: string; gameId: string } };

    expect(res.ok).toBe(true);
    expect(res.data.pin).toMatch(/^\d{6}$/);
    expect(res.data.hostToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.data.gameId).toBeTruthy();

    pin = res.data.pin;
    hostToken = res.data.hostToken;
  });

  it('players join and receive lobby:update', async () => {
    const createRes = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string; hostToken: string; gameId: string } };
    pin = createRes.data.pin;
    hostToken = createRes.data.hostToken;

    // Listen for lobby updates on all three players
    const lobbyPromises = [
      waitFor(p1Socket, ServerEvents.LOBBY_UPDATE),
      waitFor(p2Socket, ServerEvents.LOBBY_UPDATE),
      waitFor(p3Socket, ServerEvents.LOBBY_UPDATE),
    ];

    const j1 = (await call(p1Socket, PlayerEvents.JOIN, {
      pin,
      nickname: 'Alice',
    })) as { ok: boolean; data: { playerId: string; reconnectToken: string } };
    const j2 = (await call(p2Socket, PlayerEvents.JOIN, {
      pin,
      nickname: 'Bob',
    })) as { ok: boolean; data: { playerId: string; reconnectToken: string } };
    const j3 = (await call(p3Socket, PlayerEvents.JOIN, {
      pin,
      nickname: 'Carol',
    })) as { ok: boolean; data: { playerId: string; reconnectToken: string } };

    expect(j1.ok).toBe(true);
    expect(j2.ok).toBe(true);
    expect(j3.ok).toBe(true);

    // At least one lobby update received by each
    await Promise.all(lobbyPromises);
  });

  it('rejects duplicate nickname', async () => {
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string } };
    pin = cr.data.pin;

    await call(p1Socket, PlayerEvents.JOIN, { pin, nickname: 'Alice' });
    const res = (await call(p2Socket, PlayerEvents.JOIN, {
      pin,
      nickname: 'alice',
    })) as { ok: boolean; error: { code: string } };

    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('NICKNAME_TAKEN');
  });

  it('rejects join on unknown PIN', async () => {
    const res = (await call(p1Socket, PlayerEvents.JOIN, {
      pin: '000000',
      nickname: 'Ghost',
    })) as { ok: boolean; error: { code: string } };
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('GAME_NOT_FOUND');
  });

  it('host:start fails with no players', async () => {
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string; hostToken: string } };
    pin = cr.data.pin;

    const res = (await call(hostSocket, HostEvents.START, { pin })) as {
      ok: boolean;
      error: { code: string };
    };
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('BAD_PHASE');
  });

  it('runs a complete 2-question game end-to-end', async () => {
    // ---- Setup ----
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
      settings: { scoringMode: 'flat', showLeaderboardEachQuestion: true },
    })) as { ok: boolean; data: { pin: string; hostToken: string } };
    pin = cr.data.pin;
    hostToken = cr.data.hostToken;

    const j1 = (await call(p1Socket, PlayerEvents.JOIN, { pin, nickname: 'Alice' })) as {
      ok: boolean;
      data: { playerId: string };
    };
    const j2 = (await call(p2Socket, PlayerEvents.JOIN, { pin, nickname: 'Bob' })) as {
      ok: boolean;
      data: { playerId: string };
    };
    const j3 = (await call(p3Socket, PlayerEvents.JOIN, { pin, nickname: 'Carol' })) as {
      ok: boolean;
      data: { playerId: string };
    };

    expect(j1.ok).toBe(true);
    expect(j2.ok).toBe(true);
    expect(j3.ok).toBe(true);

    // ---- Q1 ----
    // All three players should receive question:start
    const q1Promises = [
      waitFor(p1Socket, ServerEvents.QUESTION_START),
      waitFor(p2Socket, ServerEvents.QUESTION_START),
      waitFor(p3Socket, ServerEvents.QUESTION_START),
    ];

    const startRes = (await call(hostSocket, HostEvents.START, { pin })) as { ok: boolean };
    expect(startRes.ok).toBe(true);

    const q1Results = (await Promise.all(q1Promises)) as Array<{
      questionId: string;
      optionCount: number;
      endsAt: number;
    }>;
    const q1p1 = q1Results[0]!;
    const q1p2 = q1Results[1]!;
    const q1p3 = q1Results[2]!;

    expect(q1p1.questionId).toBe('q0');
    expect(q1p2.questionId).toBe('q0');
    expect(q1p3.questionId).toBe('q0');
    expect(q1p1.optionCount).toBe(4);
    // Correct answer (index 1) must NOT appear in player payload
    expect((q1p1 as unknown as Record<string, unknown>)['correct']).toBeUndefined();

    // All three answer (q0 correct = index 1)
    const revealPromise = waitFor(p1Socket, ServerEvents.QUESTION_REVEAL);

    const a1 = (await call(p1Socket, PlayerEvents.ANSWER, {
      pin,
      questionId: 'q0',
      choice: 1,
    })) as { ok: boolean; data: { correct: boolean } };
    const a2 = (await call(p2Socket, PlayerEvents.ANSWER, {
      pin,
      questionId: 'q0',
      choice: 1,
    })) as { ok: boolean; data: { correct: boolean } };
    const a3 = (await call(p3Socket, PlayerEvents.ANSWER, {
      pin,
      questionId: 'q0',
      choice: 0, // wrong
    })) as { ok: boolean; data: { correct: boolean } };

    expect(a1.data.correct).toBe(true);
    expect(a2.data.correct).toBe(true);
    expect(a3.data.correct).toBe(false);

    // Reveal fires automatically when all players answered
    const reveal1 = (await revealPromise) as {
      correct: number[];
      distribution: number[];
      top5: unknown[];
    };
    expect(reveal1.correct).toContain(1);
    expect(reveal1.distribution[1]).toBe(2); // two correct
    expect(reveal1.distribution[0]).toBe(1); // one wrong (Carol picked 0)

    // ---- Leaderboard after Q1 ----
    const lbPromise = waitFor(p1Socket, ServerEvents.LEADERBOARD_SHOW);
    const nextRes1 = (await call(hostSocket, HostEvents.NEXT, { pin })) as { ok: boolean };
    expect(nextRes1.ok).toBe(true);
    const lb1 = (await lbPromise) as { ranked: Array<{ nickname: string; score: number }> };
    expect(lb1.ranked.length).toBeGreaterThan(0);
    // Alice and Bob both correct with flat 1000 pts; Carol 0
    const aliceEntry = lb1.ranked.find((r) => r.nickname === 'Alice');
    expect(aliceEntry?.score).toBe(1000);

    // ---- Q2 ----
    const q2Promises = [
      waitFor(p1Socket, ServerEvents.QUESTION_START),
      waitFor(p2Socket, ServerEvents.QUESTION_START),
      waitFor(p3Socket, ServerEvents.QUESTION_START),
    ];

    const nextRes2 = (await call(hostSocket, HostEvents.NEXT, { pin })) as { ok: boolean };
    expect(nextRes2.ok).toBe(true);

    const q2Results = (await Promise.all(q2Promises)) as Array<{ questionId: string }>;
    const q2p1 = q2Results[0]!;
    expect(q2p1.questionId).toBe('q1');

    // All answer Q2 (correct = index 2)
    const reveal2Promise = waitFor(p1Socket, ServerEvents.QUESTION_REVEAL);

    await call(p1Socket, PlayerEvents.ANSWER, { pin, questionId: 'q1', choice: 2 });
    await call(p2Socket, PlayerEvents.ANSWER, { pin, questionId: 'q1', choice: 2 });
    await call(p3Socket, PlayerEvents.ANSWER, { pin, questionId: 'q1', choice: 2 });

    await reveal2Promise;

    // ---- Leaderboard after Q2 ----
    const lb2Promise = waitFor(p1Socket, ServerEvents.LEADERBOARD_SHOW);
    await call(hostSocket, HostEvents.NEXT, { pin }); // reveal → leaderboard
    const lb2 = (await lb2Promise) as { ranked: Array<{ nickname: string; score: number }> };
    // All three correct on Q2: Alice/Bob had 1000, now 2000; Carol had 0, now 1000
    const aliceQ2 = lb2.ranked.find((r) => r.nickname === 'Alice');
    expect(aliceQ2?.score).toBe(2000);

    // ---- Podium ----
    const podiumPromise = waitFor(p1Socket, ServerEvents.PODIUM_SHOW);
    await call(hostSocket, HostEvents.NEXT, { pin }); // leaderboard → podium (last Q)
    const podium = (await podiumPromise) as {
      top3: Array<{ nickname: string; rank: number }>;
      all: unknown[];
    };
    expect(podium.top3.length).toBeGreaterThanOrEqual(1);
    expect(podium.all.length).toBe(3);

    // ---- End ----
    const endedPromise = waitFor(p1Socket, ServerEvents.GAME_ENDED);
    const endRes = (await call(hostSocket, HostEvents.END, { pin })) as { ok: boolean };
    expect(endRes.ok).toBe(true);
    await endedPromise;
  });

  it('host:resume reattaches after disconnect', async () => {
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string; hostToken: string } };
    pin = cr.data.pin;
    hostToken = cr.data.hostToken;

    // Simulate host reconnecting with a new socket
    const newHost = connect();
    await connected(newHost);

    const res = (await call(newHost, HostEvents.RESUME, { pin, hostToken })) as {
      ok: boolean;
      data: { phase: string };
    };
    expect(res.ok).toBe(true);
    expect(res.data.phase).toBe('lobby');

    newHost.disconnect();
  });

  it('player:rejoin receives game:snapshot', async () => {
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string } };
    pin = cr.data.pin;

    const jr = (await call(p1Socket, PlayerEvents.JOIN, {
      pin,
      nickname: 'Alice',
    })) as { ok: boolean; data: { playerId: string; reconnectToken: string } };
    expect(jr.ok).toBe(true);

    const { playerId, reconnectToken } = jr.data;

    // New socket simulates reconnect
    const newSock = connect();
    await connected(newSock);

    const snapshotPromise = waitFor(newSock, ServerEvents.GAME_SNAPSHOT);

    const rr = (await call(newSock, PlayerEvents.REJOIN, {
      pin,
      playerId,
      reconnectToken,
    })) as { ok: boolean; data: { phase: string } };

    expect(rr.ok).toBe(true);
    const snap = (await snapshotPromise) as { phase: string; total: number };
    expect(snap.phase).toBe('lobby');
    expect(snap.total).toBe(2); // 2 questions

    newSock.disconnect();
  });

  it('rejects answering twice (ALREADY_ANSWERED)', async () => {
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string } };
    pin = cr.data.pin;

    await call(p1Socket, PlayerEvents.JOIN, { pin, nickname: 'Solo' });
    // Need a second player so the question doesn't auto-end after Solo answers
    await call(p2Socket, PlayerEvents.JOIN, { pin, nickname: 'Dummy' });
    await call(hostSocket, HostEvents.START, { pin });

    // Wait for question start
    await waitFor(p1Socket, ServerEvents.QUESTION_START);

    await call(p1Socket, PlayerEvents.ANSWER, { pin, questionId: 'q0', choice: 1 });
    const res2 = (await call(p1Socket, PlayerEvents.ANSWER, {
      pin,
      questionId: 'q0',
      choice: 1,
    })) as { ok: boolean; error: { code: string } };

    expect(res2.ok).toBe(false);
    expect(res2.error.code).toBe('ALREADY_ANSWERED');
  });

  it('host:skip forces reveal mid-question', async () => {
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string } };
    pin = cr.data.pin;

    await call(p1Socket, PlayerEvents.JOIN, { pin, nickname: 'Alice' });
    await call(hostSocket, HostEvents.START, { pin });
    await waitFor(p1Socket, ServerEvents.QUESTION_START);

    const revealPromise = waitFor(p1Socket, ServerEvents.QUESTION_REVEAL);
    const skipRes = (await call(hostSocket, HostEvents.SKIP, { pin })) as { ok: boolean };
    expect(skipRes.ok).toBe(true);
    await revealPromise;
  });

  it('NOT_HOST error when wrong socket tries host actions', async () => {
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string } };
    pin = cr.data.pin;

    await call(p1Socket, PlayerEvents.JOIN, { pin, nickname: 'Alice' });

    // p1Socket is a player, not the host
    const res = (await call(p1Socket, HostEvents.START, { pin })) as {
      ok: boolean;
      error: { code: string };
    };
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('NOT_HOST');
  });

  it('host:kick removes the player and broadcasts lobby:update', async () => {
    const cr = (await call(hostSocket, HostEvents.CREATE, {
      quizId: TEST_QUIZ.id,
    })) as { ok: boolean; data: { pin: string } };
    pin = cr.data.pin;

    const jr = (await call(p1Socket, PlayerEvents.JOIN, {
      pin,
      nickname: 'ToKick',
    })) as { ok: boolean; data: { playerId: string } };

    const kickedPromise = waitFor(p1Socket, PlayerEvents.KICKED);
    const lobbyPromise = waitFor(hostSocket, ServerEvents.LOBBY_UPDATE);

    const kickRes = (await call(hostSocket, HostEvents.KICK, {
      pin,
      playerId: jr.data.playerId,
    })) as { ok: boolean };

    expect(kickRes.ok).toBe(true);
    await kickedPromise;
    const lobby = (await lobbyPromise) as { count: number };
    expect(lobby.count).toBe(0);
  });
});
