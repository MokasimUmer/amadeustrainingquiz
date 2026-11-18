import type { Server, Socket } from 'socket.io';
import { timingSafeEqual } from 'node:crypto';
import {
  hostCreateSchema,
  hostResumeSchema,
  hostStartSchema,
  hostSkipSchema,
  hostNextSchema,
  hostEndSchema,
  hostKickSchema,
  hostResolveTieSchema,
  HostEvents,
  PlayerEvents,
  ServerEvents,
  hasTopTie,
  applyTieResolution,
  rankPlayers,
} from '@amadeus/shared';
import type { Quiz } from '@amadeus/shared';
import type { GameManager } from '../game/GameManager.js';
import type { GameEvent } from '../game/Game.js';
import { ackOk, ackErr, consumeToken } from './middleware.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Ack = (res: unknown) => void;

function safeCompare(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Map of pin → hostSocketId (for quick lookup on disconnect). */
const socketToPin = new Map<string, string>();

// ---------------------------------------------------------------------------
// Attach all host event listeners to a socket
// ---------------------------------------------------------------------------

export function registerHostHandlers(
  io: Server,
  socket: Socket,
  manager: GameManager,
  /** Injectable quiz loader (real impl will query DB; here we accept it as a param). */
  loadQuiz: (quizId: string) => Quiz | undefined,
): void {
  // -------------------------------------------------------------------------
  // host:create
  // -------------------------------------------------------------------------
  socket.on(HostEvents.CREATE, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = hostCreateSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const quiz = loadQuiz(parsed.data.quizId);
    if (!quiz) return ack(ackErr('GAME_NOT_FOUND', 'Quiz not found'));

    const game = manager.createGame(quiz, parsed.data.settings ?? {});
    game.setHostSocketId(socket.id);
    socketToPin.set(socket.id, game.pin);

    void socket.join(game.pin);
    _attachGameListeners(io, socket, game.pin, manager);

    ack(ackOk({ pin: game.pin, hostToken: game.hostToken, gameId: game.id }));
  });

  // -------------------------------------------------------------------------
  // host:resume
  // -------------------------------------------------------------------------
  socket.on(HostEvents.RESUME, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = hostResumeSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));
    if (!safeCompare(parsed.data.hostToken, game.hostToken)) {
      return ack(ackErr('NOT_HOST', 'Invalid host token'));
    }

    game.setHostSocketId(socket.id);
    socketToPin.set(socket.id, game.pin);
    void socket.join(game.pin);
    _attachGameListeners(io, socket, game.pin, manager);
    manager.resetIdleTimer(game.pin);

    ack(
      ackOk({
        phase: game.phase,
        questionIndex: game.questionIndex,
        total: game.quiz.questions.length,
        players: [...game.players.values()].map((p) => ({
          id: p.id,
          nickname: p.nickname,
        })),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // host:start
  // -------------------------------------------------------------------------
  socket.on(HostEvents.START, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = hostStartSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));
    if (game.hostSocketId !== socket.id) return ack(ackErr('NOT_HOST', 'Not the host'));

    if (!game.start()) return ack(ackErr('BAD_PHASE', 'Cannot start from current phase'));

    manager.resetIdleTimer(game.pin);
    ack(ackOk());
  });

  // -------------------------------------------------------------------------
  // host:skip
  // -------------------------------------------------------------------------
  socket.on(HostEvents.SKIP, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = hostSkipSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));
    if (game.hostSocketId !== socket.id) return ack(ackErr('NOT_HOST', 'Not the host'));

    if (!game.skipQuestion()) return ack(ackErr('BAD_PHASE', 'No question active'));

    manager.resetIdleTimer(game.pin);
    ack(ackOk());
  });

  // -------------------------------------------------------------------------
  // host:next
  // -------------------------------------------------------------------------
  socket.on(HostEvents.NEXT, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = hostNextSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));
    if (game.hostSocketId !== socket.id) return ack(ackErr('NOT_HOST', 'Not the host'));

    if (!game.next()) return ack(ackErr('BAD_PHASE', 'Cannot advance from current phase'));

    manager.resetIdleTimer(game.pin);
    ack(ackOk());
  });

  // -------------------------------------------------------------------------
  // host:end
  // -------------------------------------------------------------------------
  socket.on(HostEvents.END, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = hostEndSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));
    if (game.hostSocketId !== socket.id) return ack(ackErr('NOT_HOST', 'Not the host'));

    if (!game.end()) return ack(ackErr('BAD_PHASE', 'Cannot end from current phase'));

    manager.scheduleEndedGC(game.pin);
    ack(ackOk());
  });

  // -------------------------------------------------------------------------
  // host:kick
  // -------------------------------------------------------------------------
  socket.on(HostEvents.KICK, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = hostKickSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));
    if (game.hostSocketId !== socket.id) return ack(ackErr('NOT_HOST', 'Not the host'));

    const player = game.players.get(parsed.data.playerId);
    if (!player) return ack(ackErr('GAME_NOT_FOUND', 'Player not found'));

    // Notify the kicked player first
    if (player.socketId) {
      io.to(player.socketId).emit(PlayerEvents.KICKED);
    }

    game.kickPlayer(parsed.data.playerId);

    // Broadcast updated lobby
    io.to(game.pin).emit(ServerEvents.LOBBY_UPDATE, {
      players: [...game.players.values()].map((p) => ({ id: p.id, nickname: p.nickname })),
      count: game.players.size,
    });

    ack(ackOk());
  });

  // -------------------------------------------------------------------------
  // host:resolveTie
  // -------------------------------------------------------------------------
  socket.on(HostEvents.RESOLVE_TIE, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = hostResolveTieSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));
    if (game.hostSocketId !== socket.id) return ack(ackErr('NOT_HOST', 'Not the host'));

    const ranked = rankPlayers([...game.players.values()], game.settings.tieBreak);
    const resolved = applyTieResolution(ranked, parsed.data.orderedPlayerIds);

    // Re-emit the podium with the resolved order
    const top3 = resolved.slice(0, 3);
    io.to(game.pin).emit(ServerEvents.PODIUM_SHOW, { top3, all: resolved });

    ack(ackOk());
  });

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------
  socket.on('disconnect', () => {
    const pin = socketToPin.get(socket.id);
    if (pin) {
      const game = manager.get(pin);
      if (game && game.hostSocketId === socket.id) {
        game.clearHostSocketId();
      }
      socketToPin.delete(socket.id);
    }
  });
}

// ---------------------------------------------------------------------------
// Attach game event → broadcast mappings (called once per game/host join)
// ---------------------------------------------------------------------------

function _attachGameListeners(
  io: Server,
  _socket: Socket,
  pin: string,
  manager: GameManager,
): void {
  const game = manager.get(pin);
  if (!game) return;

  // Avoid double-registration
  if ((game as unknown as { _listenersAttached?: boolean })._listenersAttached) return;
  (game as unknown as { _listenersAttached?: boolean })._listenersAttached = true;

  const listener: GameEvent extends infer E
    ? (event: E) => void
    : never = (event: GameEvent) => {
    switch (event.type) {
      case 'phase':
        io.to(pin).emit(ServerEvents.GAME_PHASE, {
          phase: event.phase,
          questionIndex: event.questionIndex,
          total: event.total,
          serverTime: event.serverTime,
        });
        break;

      case 'questionStart': {
        const g = manager.get(pin);
        if (!g) break;
        const q = g.quiz.questions[event.questionIndex];
        if (!q) break;

        // Host gets full question (including correct answer)
        if (g.hostSocketId) {
          io.to(g.hostSocketId).emit(ServerEvents.QUESTION_START, {
            questionId: q.id,
            text: q.text,
            options: q.options,
            correct: q.correct,
            timeLimitSec: q.timeLimitSec,
            basePoints: q.basePoints,
            endsAt: event.endsAt,
            serverTime: event.serverTime,
          });
        }

        // Players get sanitized payload (no correct answer)
        for (const player of g.players.values()) {
          if (player.socketId) {
            io.to(player.socketId).emit(ServerEvents.QUESTION_START, {
              questionId: q.id,
              optionCount: q.options.length,
              endsAt: event.endsAt,
              serverTime: event.serverTime,
              // showTextOnPlayer is true by default (training sessions)
              text: q.text,
            });
          }
        }
        break;
      }

      case 'questionProgress':
        if (manager.get(pin)?.hostSocketId) {
          io.to(manager.get(pin)!.hostSocketId!).emit(ServerEvents.QUESTION_PROGRESS, {
            answered: event.answered,
            total: event.total,
          });
        }
        break;

      case 'questionReveal': {
        const g = manager.get(pin);
        if (!g) break;
        io.to(pin).emit(ServerEvents.QUESTION_REVEAL, {
          correct: event.reveal.correct,
          distribution: event.reveal.distribution,
          top5: event.reveal.top5,
        });

        // Check for top tie when tieBreak = 'host'
        if (
          g.settings.tieBreak === 'host' &&
          g.phase === 'podium' &&
          hasTopTie(event.ranked)
        ) {
          if (g.hostSocketId) {
            io.to(g.hostSocketId).emit(HostEvents.TIE_DETECTED, {
              tiedPlayerIds: event.ranked
                .filter((r) => r.rank === event.ranked[0]?.rank)
                .map((r) => r.id),
            });
          }
        }
        break;
      }

      case 'playerResult': {
        const g = manager.get(pin);
        if (!g) break;
        const player = g.players.get(event.playerId);
        if (player?.socketId) {
          io.to(player.socketId).emit(PlayerEvents.RESULT, event.result);
        }
        break;
      }

      case 'leaderboard':
        io.to(pin).emit(ServerEvents.LEADERBOARD_SHOW, {
          ranked: event.ranked.slice(0, 10),
        });
        break;

      case 'podium': {
        io.to(pin).emit(ServerEvents.PODIUM_SHOW, {
          top3: event.top3,
          all: event.all,
        });
        // Trigger tie detection for host-break mode
        const g2 = manager.get(pin);
        if (g2?.settings.tieBreak === 'host' && hasTopTie(event.top3)) {
          if (g2.hostSocketId) {
            io.to(g2.hostSocketId).emit(HostEvents.TIE_DETECTED, {
              tiedPlayerIds: event.top3
                .filter((r) => r.rank === event.top3[0]?.rank)
                .map((r) => r.id),
            });
          }
        }
        break;
      }

      case 'ended':
        io.to(pin).emit(ServerEvents.GAME_ENDED);
        manager.scheduleEndedGC(pin);
        break;
    }
  };

  game.on(listener);
}
