import type { Quiz, GameSettings } from '@amadeus/shared';
import { randomBytes } from 'node:crypto';
import { Game } from './Game.js';
import { uniquePin } from '../util/pin.js';
import type { Clock } from '../util/clock.js';
import { realClock } from '../util/clock.js';

/** How long (ms) an idle game is kept before garbage collection. */
const IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** How long (ms) a finished game is kept after reaching 'ended'. */
const ENDED_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class GameManager {
  private _games = new Map<string, Game>();
  /** GC timer handles keyed by PIN */
  private _gcTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _clock: Clock;

  constructor(clock: Clock = realClock) {
    this._clock = clock;
  }

  // -------------------------------------------------------------------------
  // Game lifecycle
  // -------------------------------------------------------------------------

  /**
   * Creates a new game and returns it.
   * Generates a unique 6-digit PIN and a secure host token.
   */
  createGame(
    quiz: Quiz,
    settings?: Partial<GameSettings>,
  ): Game {
    const pin = uniquePin(new Set(this._games.keys()));
    const hostToken = randomBytes(32).toString('hex');

    const game = new Game({ pin, hostToken, quiz, settings, clock: this._clock });
    this._games.set(pin, game);

    // Start the idle GC timer
    this._scheduleGC(pin, IDLE_TTL_MS);

    return game;
  }

  get(pin: string): Game | undefined {
    return this._games.get(pin);
  }

  getAll(): Game[] {
    return [...this._games.values()];
  }

  /**
   * Removes a game immediately (called after 'ended' + delay, or manually).
   */
  destroy(pin: string): void {
    this._cancelGC(pin);
    this._games.delete(pin);
  }

  /** Total number of players across all active games. */
  totalPlayers(): number {
    let n = 0;
    for (const g of this._games.values()) {
      n += g.players.size;
    }
    return n;
  }

  // -------------------------------------------------------------------------
  // GC helpers
  // -------------------------------------------------------------------------

  /**
   * Resets the idle GC timer for a game (call on any activity).
   * When a game reaches 'ended', call `scheduleEndedGC` instead.
   */
  resetIdleTimer(pin: string): void {
    this._scheduleGC(pin, IDLE_TTL_MS);
  }

  /**
   * Schedules cleanup ENDED_TTL_MS after the game ends.
   */
  scheduleEndedGC(pin: string): void {
    this._scheduleGC(pin, ENDED_TTL_MS);
  }

  private _scheduleGC(pin: string, delayMs: number): void {
    this._cancelGC(pin);
    const handle = this._clock.setTimeout(() => {
      this._games.delete(pin);
      this._gcTimers.delete(pin);
    }, delayMs);
    this._gcTimers.set(pin, handle);
  }

  private _cancelGC(pin: string): void {
    const h = this._gcTimers.get(pin);
    if (h !== undefined) {
      this._clock.clearTimeout(h);
      this._gcTimers.delete(pin);
    }
  }
}
