import { randomUUID } from 'node:crypto';
import type {
  Quiz,
  Question,
  Player,
  GameSettings,
  GamePhase,
  RankedPlayer,
  AnswerIndex,
} from '@amadeus/shared';
import { defaultGameSettings, computePoints, rankPlayers } from '@amadeus/shared';
import type { Clock } from '../util/clock.js';
import { realClock } from '../util/clock.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnswerResult {
  correct: boolean;
  pointsEarned: number;
  score: number;
  rank: number;
  streak: number;
  behind: { nickname: string; gap: number } | null;
}

export interface QuestionReveal {
  correct: number[];
  /** How many players chose each option index. */
  distribution: number[];
  top5: RankedPlayer[];
}

/** Events emitted by Game so callers (sockets layer) can react. */
export type GameEvent =
  | { type: 'phase'; phase: GamePhase; questionIndex: number; total: number; serverTime: number }
  | { type: 'questionStart'; questionIndex: number; endsAt: number; serverTime: number }
  | { type: 'questionProgress'; answered: number; total: number }
  | { type: 'questionReveal'; reveal: QuestionReveal; ranked: RankedPlayer[] }
  | { type: 'leaderboard'; ranked: RankedPlayer[] }
  | { type: 'podium'; top3: RankedPlayer[]; all: RankedPlayer[] }
  | { type: 'ended' }
  | { type: 'playerResult'; playerId: string; result: AnswerResult };

export type GameEventListener = (event: GameEvent) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Grace period after `endsAt` during which late answers are still accepted. */
const ANSWER_GRACE_MS = 300;

// ---------------------------------------------------------------------------
// Game class
// ---------------------------------------------------------------------------

export class Game {
  readonly pin: string;
  readonly hostToken: string;
  readonly id: string;
  readonly settings: GameSettings;
  readonly quiz: Quiz;

  private _phase: GamePhase = 'lobby';
  private _questionIndex = -1;
  private _questionStartedAt = 0;
  private _questionEndsAt = 0;
  private _players = new Map<string, Player>();
  /** socketId → playerId for the host */
  private _hostSocketId: string | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  /** Scores captured before the current question for delta computation. */
  private _prevScores = new Map<string, number>();
  /** Tracks which players have answered the current question. */
  private _answeredThisQuestion = new Set<string>();

  private _listeners: GameEventListener[] = [];
  private readonly _clock: Clock;

  constructor(opts: {
    pin: string;
    hostToken: string;
    quiz: Quiz;
    settings?: Partial<GameSettings>;
    clock?: Clock;
  }) {
    this.pin = opts.pin;
    this.hostToken = opts.hostToken;
    this.quiz = opts.quiz;
    this.id = randomUUID();
    this.settings = { ...defaultGameSettings, ...opts.settings };
    this._clock = opts.clock ?? realClock;
  }

  // -------------------------------------------------------------------------
  // Public read-only accessors
  // -------------------------------------------------------------------------

  get phase(): GamePhase {
    return this._phase;
  }

  get questionIndex(): number {
    return this._questionIndex;
  }

  get currentQuestion(): Question | null {
    return this.quiz.questions[this._questionIndex] ?? null;
  }

  get players(): ReadonlyMap<string, Player> {
    return this._players;
  }

  get hostSocketId(): string | null {
    return this._hostSocketId;
  }

  get questionEndsAt(): number {
    return this._questionEndsAt;
  }

  // -------------------------------------------------------------------------
  // Event listeners
  // -------------------------------------------------------------------------

  on(listener: GameEventListener): void {
    this._listeners.push(listener);
  }

  off(listener: GameEventListener): void {
    this._listeners = this._listeners.filter((l) => l !== listener);
  }

  private _emit(event: GameEvent): void {
    for (const l of this._listeners) l(event);
  }

  // -------------------------------------------------------------------------
  // Host socket management
  // -------------------------------------------------------------------------

  setHostSocketId(socketId: string): void {
    this._hostSocketId = socketId;
  }

  clearHostSocketId(): void {
    this._hostSocketId = null;
  }

  // -------------------------------------------------------------------------
  // Player management (lobby phase)
  // -------------------------------------------------------------------------

  /**
   * Adds a player. Returns `null` with the error code when the join should be
   * rejected.
   */
  addPlayer(
    nickname: string,
    socketId: string,
  ): { player: Player; error: null } | { player: null; error: string } {
    if (this._phase !== 'lobby') return { player: null, error: 'BAD_PHASE' };
    if (this.settings.lockLobbyOnStart && this._phase !== 'lobby') {
      return { player: null, error: 'GAME_LOCKED' };
    }
    if (this._players.size >= this.settings.maxPlayers) {
      return { player: null, error: 'GAME_FULL' };
    }
    const taken = [...this._players.values()].some(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase(),
    );
    if (taken) return { player: null, error: 'NICKNAME_TAKEN' };

    const player: Player = {
      id: randomUUID(),
      nickname,
      socketId,
      reconnectToken: randomUUID(),
      score: 0,
      streak: 0,
      totalResponseMs: 0,
      answers: {},
      connected: true,
    };
    this._players.set(player.id, player);
    return { player, error: null };
  }

  removePlayer(playerId: string): void {
    this._players.delete(playerId);
  }

  /** Reconnect: rebind socketId and mark connected. */
  reconnectPlayer(playerId: string, socketId: string): Player | null {
    const player = this._players.get(playerId);
    if (!player) return null;
    player.socketId = socketId;
    player.connected = true;
    return player;
  }

  disconnectPlayer(playerId: string): void {
    const player = this._players.get(playerId);
    if (player) {
      player.socketId = null;
      player.connected = false;
    }
  }

  kickPlayer(playerId: string): boolean {
    return this._players.delete(playerId);
  }

  connectedPlayerCount(): number {
    return [...this._players.values()].filter((p) => p.connected).length;
  }

  // -------------------------------------------------------------------------
  // State machine transitions
  // -------------------------------------------------------------------------

  /**
   * Transitions from lobby → question(0).
   * Returns false if the transition is not allowed.
   */
  start(): boolean {
    if (this._phase !== 'lobby') return false;
    if (this._players.size === 0) return false;
    this._advanceToQuestion(0);
    return true;
  }

  /**
   * Ends the current question immediately (host skip or all answered).
   * Returns false if no question is active.
   */
  skipQuestion(): boolean {
    if (this._phase !== 'question') return false;
    this._endQuestion();
    return true;
  }

  /**
   * Advances from reveal → leaderboard, leaderboard → question(i+1),
   * or last leaderboard → podium.
   * Returns false if the current phase does not support this transition.
   */
  next(): boolean {
    if (this._phase === 'reveal') {
      if (this.settings.showLeaderboardEachQuestion) {
        this._transitionTo('leaderboard');
        const ranked = rankPlayers([...this._players.values()], this.settings.tieBreak);
        this._emit({ type: 'leaderboard', ranked });
      } else {
        this._advanceAfterLeaderboard();
      }
      return true;
    }

    if (this._phase === 'leaderboard') {
      this._advanceAfterLeaderboard();
      return true;
    }

    return false;
  }

  /**
   * Transitions from podium → ended.
   */
  end(): boolean {
    if (this._phase !== 'podium') return false;
    this._transitionTo('ended');
    this._emit({ type: 'ended' });
    return true;
  }

  // -------------------------------------------------------------------------
  // Answer submission
  // -------------------------------------------------------------------------

  /**
   * Records a player's answer.
   *
   * Returns an error string on rejection, or `null` on success.
   * The caller is responsible for emitting the `playerResult` to the right
   * socket; we emit it through the event bus here as well.
   */
  submitAnswer(
    playerId: string,
    questionId: string,
    choice: AnswerIndex,
    receivedAt?: number,
  ): { result: AnswerResult; error: null } | { result: null; error: string } {
    if (this._phase !== 'question') return { result: null, error: 'BAD_PHASE' };

    const question = this.currentQuestion;
    if (!question) return { result: null, error: 'BAD_PHASE' };
    if (question.id !== questionId) return { result: null, error: 'BAD_PHASE' };

    const now = receivedAt ?? this._clock.now();
    if (now > this._questionEndsAt + ANSWER_GRACE_MS) {
      return { result: null, error: 'TOO_LATE' };
    }

    const player = this._players.get(playerId);
    if (!player) return { result: null, error: 'GAME_NOT_FOUND' };
    if (player.answers[questionId] !== undefined) {
      return { result: null, error: 'ALREADY_ANSWERED' };
    }

    const elapsedMs = Math.max(0, now - this._questionStartedAt);
    const timeLimitMs = question.timeLimitSec * 1000;
    const correct = question.correct.includes(choice);

    const previousStreak = player.streak;
    if (correct) {
      player.streak += 1;
    } else {
      player.streak = 0;
    }

    const pointsEarned = computePoints({
      correct,
      mode: this.settings.scoringMode,
      elapsedMs,
      timeLimitMs,
      basePoints: question.basePoints,
      streak: previousStreak,
    });

    player.score += pointsEarned;
    if (correct) player.totalResponseMs += elapsedMs;

    player.answers[questionId] = {
      choice,
      ms: elapsedMs,
      correct,
      points: pointsEarned,
    };

    this._answeredThisQuestion.add(playerId);

    // Emit progress to host
    const answered = this._answeredThisQuestion.size;
    const total = this._players.size;
    this._emit({ type: 'questionProgress', answered, total });

    // Build the per-player result
    const ranked = rankPlayers([...this._players.values()], this.settings.tieBreak);
    const myRank = ranked.find((r) => r.id === playerId)?.rank ?? total;
    const myIndex = ranked.findIndex((r) => r.id === playerId);
    const above = myIndex > 0 ? ranked[myIndex - 1] : null;
    const behind =
      above && above.score > player.score
        ? { nickname: above.nickname, gap: above.score - player.score }
        : null;

    const result: AnswerResult = {
      correct,
      pointsEarned,
      score: player.score,
      rank: myRank,
      streak: player.streak,
      behind,
    };

    this._emit({ type: 'playerResult', playerId, result });

    // End the question early if every connected player has answered
    const connectedIds = [...this._players.values()]
      .filter((p) => p.connected)
      .map((p) => p.id);
    const allAnswered = connectedIds.every((id) => this._answeredThisQuestion.has(id));
    if (allAnswered) {
      this._endQuestion();
    }

    return { result, error: null };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _transitionTo(phase: GamePhase): void {
    this._phase = phase;
    this._emit({
      type: 'phase',
      phase,
      questionIndex: this._questionIndex,
      total: this.quiz.questions.length,
      serverTime: this._clock.now(),
    });
  }

  private _advanceToQuestion(index: number): void {
    const question = this.quiz.questions[index];
    if (!question) return;

    this._questionIndex = index;
    this._answeredThisQuestion.clear();

    // Snapshot scores before this question for delta computation
    this._prevScores.clear();
    for (const [id, p] of this._players) {
      this._prevScores.set(id, p.score);
    }

    this._transitionTo('question');

    const now = this._clock.now();
    this._questionStartedAt = now;
    const timeLimitMs = question.timeLimitSec * 1000;
    this._questionEndsAt = now + timeLimitMs;

    this._emit({
      type: 'questionStart',
      questionIndex: index,
      endsAt: this._questionEndsAt,
      serverTime: now,
    });

    // Set timer to end the question automatically
    if (this._timer !== null) this._clock.clearTimeout(this._timer);
    this._timer = this._clock.setTimeout(() => {
      if (this._phase === 'question' && this._questionIndex === index) {
        this._endQuestion();
      }
    }, timeLimitMs);
  }

  private _endQuestion(): void {
    if (this._timer !== null) {
      this._clock.clearTimeout(this._timer);
      this._timer = null;
    }

    const question = this.currentQuestion;
    if (!question) return;

    this._transitionTo('reveal');

    const distribution = new Array<number>(question.options.length).fill(0);
    for (const p of this._players.values()) {
      const ans = p.answers[question.id];
      if (ans !== undefined) {
        const bucket = distribution[ans.choice];
        distribution[ans.choice] = (bucket ?? 0) + 1;
      }
    }

    const ranked = rankPlayers(
      [...this._players.values()],
      this.settings.tieBreak,
      this._prevScores,
    );

    const reveal: QuestionReveal = {
      correct: question.correct,
      distribution,
      top5: ranked.slice(0, 5),
    };

    this._emit({ type: 'questionReveal', reveal, ranked });
  }

  private _advanceAfterLeaderboard(): void {
    const nextIndex = this._questionIndex + 1;
    if (nextIndex < this.quiz.questions.length) {
      this._advanceToQuestion(nextIndex);
    } else {
      this._showPodium();
    }
  }

  private _showPodium(): void {
    this._transitionTo('podium');
    const all = rankPlayers([...this._players.values()], this.settings.tieBreak);
    const top3 = all.slice(0, 3);
    this._emit({ type: 'podium', top3, all });
  }
}
