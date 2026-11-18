import type { Server, Socket } from 'socket.io';
import {
  playerJoinSchema,
  playerRejoinSchema,
  playerAnswerSchema,
  PlayerEvents,
  ServerEvents,
} from '@amadeus/shared';
import type { AnswerIndex } from '@amadeus/shared';
import type { GameManager } from '../game/GameManager.js';
import { sanitizeNickname } from '../util/sanitize.js';
import { ackOk, ackErr, consumeToken, canAttemptJoin } from './middleware.js';

type Ack = (res: unknown) => void;

/** Map of socketId → { pin, playerId } for disconnect handling. */
const socketToPlayer = new Map<string, { pin: string; playerId: string }>();

export function registerPlayerHandlers(
  io: Server,
  socket: Socket,
  manager: GameManager,
): void {
  const ip = (socket.handshake.headers['x-forwarded-for'] as string | undefined)
    ?? socket.handshake.address
    ?? 'unknown';

  // -------------------------------------------------------------------------
  // player:join
  // -------------------------------------------------------------------------
  socket.on(PlayerEvents.JOIN, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));
    if (!canAttemptJoin(ip)) return ack(ackErr('RATE_LIMITED', 'Too many join attempts'));

    const parsed = playerJoinSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('NICKNAME_INVALID', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));
    if (game.phase !== 'lobby') return ack(ackErr('GAME_LOCKED', 'Game already started'));

    const sanitized = sanitizeNickname(parsed.data.nickname);
    if (!sanitized.ok) return ack(ackErr('NICKNAME_INVALID', sanitized.reason));

    const { player, error } = game.addPlayer(sanitized.value, socket.id);
    if (error) return ack(ackErr(error as never, error));

    socketToPlayer.set(socket.id, { pin: game.pin, playerId: player!.id });
    void socket.join(game.pin);
    manager.resetIdleTimer(game.pin);

    // Broadcast updated lobby to everyone in the room
    io.to(game.pin).emit(ServerEvents.LOBBY_UPDATE, {
      players: [...game.players.values()].map((p) => ({ id: p.id, nickname: p.nickname })),
      count: game.players.size,
    });

    ack(
      ackOk({
        playerId: player!.id,
        reconnectToken: player!.reconnectToken,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // player:rejoin
  // -------------------------------------------------------------------------
  socket.on(PlayerEvents.REJOIN, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = playerRejoinSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));

    const player = game.players.get(parsed.data.playerId);
    if (!player) return ack(ackErr('GAME_NOT_FOUND', 'Player not found'));
    if (player.reconnectToken !== parsed.data.reconnectToken) {
      return ack(ackErr('GAME_NOT_FOUND', 'Invalid reconnect token'));
    }

    game.reconnectPlayer(parsed.data.playerId, socket.id);
    socketToPlayer.set(socket.id, { pin: game.pin, playerId: player.id });
    void socket.join(game.pin);
    manager.resetIdleTimer(game.pin);

    // Send a snapshot of the current game state so the client can render
    // the correct screen immediately.
    const currentQ = game.currentQuestion;
    socket.emit(ServerEvents.GAME_SNAPSHOT, {
      phase: game.phase,
      questionIndex: game.questionIndex,
      total: game.quiz.questions.length,
      endsAt: game.questionEndsAt,
      serverTime: Date.now(),
      question: currentQ
        ? {
            questionId: currentQ.id,
            optionCount: currentQ.options.length,
            text: currentQ.text,
          }
        : null,
      myScore: player.score,
      myStreak: player.streak,
    });

    ack(ackOk({ phase: game.phase }));
  });

  // -------------------------------------------------------------------------
  // player:answer
  // -------------------------------------------------------------------------
  socket.on(PlayerEvents.ANSWER, (payload: unknown, ack: Ack) => {
    if (!consumeToken(socket)) return ack(ackErr('RATE_LIMITED', 'Too many requests'));

    const parsed = playerAnswerSchema.safeParse(payload);
    if (!parsed.success) return ack(ackErr('GAME_NOT_FOUND', parsed.error.message));

    const game = manager.get(parsed.data.pin);
    if (!game) return ack(ackErr('GAME_NOT_FOUND', 'Game not found'));

    const info = socketToPlayer.get(socket.id);
    if (!info || info.pin !== parsed.data.pin) {
      return ack(ackErr('GAME_NOT_FOUND', 'Not in this game'));
    }

    const { result, error } = game.submitAnswer(
      info.playerId,
      parsed.data.questionId,
      parsed.data.choice as AnswerIndex,
    );

    if (error) return ack(ackErr(error as never, error));

    manager.resetIdleTimer(game.pin);
    ack(ackOk(result!));
  });

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------
  socket.on('disconnect', () => {
    const info = socketToPlayer.get(socket.id);
    if (info) {
      const game = manager.get(info.pin);
      if (game) game.disconnectPlayer(info.playerId);
      socketToPlayer.delete(socket.id);
    }
  });
}
