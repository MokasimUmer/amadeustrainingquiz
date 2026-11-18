import { describe, it, expect } from 'vitest';
import { GameManager } from './GameManager.js';
import type { Quiz } from '@amadeus/shared';

// ---------------------------------------------------------------------------
// Minimal quiz
// ---------------------------------------------------------------------------

function makeQuiz(): Quiz {
  return {
    id: 'quiz-1',
    title: 'Test',
    createdAt: 0,
    updatedAt: 0,
    questions: [
      {
        id: 'q0',
        text: 'Q0',
        options: ['A', 'B'],
        correct: [0],
        timeLimitSec: 20,
        basePoints: 1000,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Fake clock that lets us control GC timers
// ---------------------------------------------------------------------------

function makeFakeClock(startMs = 0) {
  let _now = startMs;
  type Handle = ReturnType<typeof setTimeout>;
  const _timers = new Map<number, { fn: () => void; fireAt: number }>();
  let _nextId = 1;

  return {
    now: () => _now,
    setTimeout(fn: () => void, ms: number): Handle {
      const id = _nextId++;
      _timers.set(id, { fn, fireAt: _now + ms });
      return id as unknown as Handle;
    },
    clearTimeout(h: Handle): void {
      _timers.delete(h as unknown as number);
    },
    tick(ms: number): void {
      _now += ms;
      for (const [id, t] of _timers) {
        if (_now >= t.fireAt) {
          _timers.delete(id);
          t.fn();
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

describe('GameManager – createGame', () => {
  it('creates a game and returns it', () => {
    const mgr = new GameManager();
    const game = mgr.createGame(makeQuiz());
    expect(game).toBeDefined();
    expect(game.pin).toMatch(/^\d{6}$/);
  });

  it('assigns a unique host token (32-byte hex)', () => {
    const mgr = new GameManager();
    const game = mgr.createGame(makeQuiz());
    expect(game.hostToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two games get different PINs', () => {
    const mgr = new GameManager();
    const g1 = mgr.createGame(makeQuiz());
    const g2 = mgr.createGame(makeQuiz());
    expect(g1.pin).not.toBe(g2.pin);
  });

  it('applies partial settings override', () => {
    const mgr = new GameManager();
    const game = mgr.createGame(makeQuiz(), { scoringMode: 'flat' });
    expect(game.settings.scoringMode).toBe('flat');
  });
});

// ---------------------------------------------------------------------------
// get / destroy
// ---------------------------------------------------------------------------

describe('GameManager – get / destroy', () => {
  it('retrieves a game by PIN', () => {
    const mgr = new GameManager();
    const game = mgr.createGame(makeQuiz());
    expect(mgr.get(game.pin)).toBe(game);
  });

  it('returns undefined for an unknown PIN', () => {
    const mgr = new GameManager();
    expect(mgr.get('000000')).toBeUndefined();
  });

  it('destroy removes the game', () => {
    const mgr = new GameManager();
    const game = mgr.createGame(makeQuiz());
    mgr.destroy(game.pin);
    expect(mgr.get(game.pin)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// totalPlayers
// ---------------------------------------------------------------------------

describe('GameManager – totalPlayers', () => {
  it('counts players across all games', () => {
    const mgr = new GameManager();
    const g1 = mgr.createGame(makeQuiz());
    const g2 = mgr.createGame(makeQuiz());
    g1.addPlayer('Alice', 's1');
    g1.addPlayer('Bob', 's2');
    g2.addPlayer('Carol', 's3');
    expect(mgr.totalPlayers()).toBe(3);
  });

  it('returns 0 when no games exist', () => {
    const mgr = new GameManager();
    expect(mgr.totalPlayers()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GC – idle timer
// ---------------------------------------------------------------------------

describe('GameManager – GC idle timer', () => {
  it('removes a game after 30 minutes of inactivity', () => {
    const clock = makeFakeClock();
    const mgr = new GameManager(clock);
    const game = mgr.createGame(makeQuiz());
    expect(mgr.get(game.pin)).toBeDefined();

    clock.tick(30 * 60 * 1000); // 30 min
    expect(mgr.get(game.pin)).toBeUndefined();
  });

  it('resetIdleTimer restarts the 30 min window', () => {
    const clock = makeFakeClock();
    const mgr = new GameManager(clock);
    const game = mgr.createGame(makeQuiz());

    clock.tick(29 * 60 * 1000); // 29 min — not yet expired
    mgr.resetIdleTimer(game.pin); // reset
    clock.tick(29 * 60 * 1000); // another 29 min — still not expired
    expect(mgr.get(game.pin)).toBeDefined();

    clock.tick(2 * 60 * 1000); // 31 min total since last reset → expired
    expect(mgr.get(game.pin)).toBeUndefined();
  });

  it('destroy cancels the GC timer (no crash)', () => {
    const clock = makeFakeClock();
    const mgr = new GameManager(clock);
    const game = mgr.createGame(makeQuiz());
    mgr.destroy(game.pin);
    // Advance past when GC would have fired — should not throw
    expect(() => clock.tick(31 * 60 * 1000)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GC – ended timer
// ---------------------------------------------------------------------------

describe('GameManager – GC ended timer', () => {
  it('removes a finished game after 10 minutes', () => {
    const clock = makeFakeClock();
    const mgr = new GameManager(clock);
    const game = mgr.createGame(makeQuiz());
    mgr.scheduleEndedGC(game.pin);

    clock.tick(10 * 60 * 1000); // 10 min
    expect(mgr.get(game.pin)).toBeUndefined();
  });

  it('a finished game survives for less than 10 minutes', () => {
    const clock = makeFakeClock();
    const mgr = new GameManager(clock);
    const game = mgr.createGame(makeQuiz());
    mgr.scheduleEndedGC(game.pin);

    clock.tick(9 * 60 * 1000 + 59_000); // 9 min 59 sec
    expect(mgr.get(game.pin)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getAll
// ---------------------------------------------------------------------------

describe('GameManager – getAll', () => {
  it('returns all active games', () => {
    const mgr = new GameManager();
    mgr.createGame(makeQuiz());
    mgr.createGame(makeQuiz());
    expect(mgr.getAll().length).toBe(2);
  });

  it('returns empty array when no games exist', () => {
    const mgr = new GameManager();
    expect(mgr.getAll()).toEqual([]);
  });
});
