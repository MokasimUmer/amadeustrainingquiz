import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from './Game.js';
import type { GameEvent, AnswerResult } from './Game.js';
import type { Quiz, GamePhase } from '@amadeus/shared';

// ---------------------------------------------------------------------------
// Fake clock
// ---------------------------------------------------------------------------

function makeFakeClock(startMs = 1_000_000) {
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
    /** Advance clock by `ms` and fire any timers that have elapsed. */
    tick(ms: number): void {
      _now += ms;
      for (const [id, t] of _timers) {
        if (_now >= t.fireAt) {
          _timers.delete(id);
          t.fn();
        }
      }
    },
    set now$(v: number) {
      _now = v;
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal test quiz
// ---------------------------------------------------------------------------

function makeQuiz(questionCount = 2): Quiz {
  return {
    id: 'q1',
    title: 'Test Quiz',
    createdAt: 0,
    updatedAt: 0,
    questions: Array.from({ length: questionCount }, (_, i) => ({
      id: `q${i}`,
      text: `Question ${i}`,
      options: ['A', 'B', 'C'],
      correct: [0 as const],
      timeLimitSec: 20,
      basePoints: 1000,
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectEvents(game: Game): GameEvent[] {
  const events: GameEvent[] = [];
  game.on((e) => events.push(e));
  return events;
}

function addPlayer(game: Game, nickname: string, socketId = `sock-${nickname}`) {
  const r = game.addPlayer(nickname, socketId);
  if (!r.player) throw new Error(`addPlayer failed: ${r.error}`);
  return r.player;
}

// ---------------------------------------------------------------------------
// Lobby phase
// ---------------------------------------------------------------------------

describe('Game – lobby', () => {
  it('starts in lobby phase', () => {
    const game = new Game({ pin: '123456', hostToken: 'tok', quiz: makeQuiz() });
    expect(game.phase).toBe('lobby');
  });

  it('allows players to join in lobby', () => {
    const game = new Game({ pin: '123456', hostToken: 'tok', quiz: makeQuiz() });
    const { player, error } = game.addPlayer('Alice', 's1');
    expect(error).toBeNull();
    expect(player?.nickname).toBe('Alice');
  });

  it('assigns unique ids to each player', () => {
    const game = new Game({ pin: '123456', hostToken: 'tok', quiz: makeQuiz() });
    const p1 = addPlayer(game, 'Alice');
    const p2 = addPlayer(game, 'Bob');
    expect(p1.id).not.toBe(p2.id);
  });

  it('rejects duplicate nicknames (case-insensitive)', () => {
    const game = new Game({ pin: '123456', hostToken: 'tok', quiz: makeQuiz() });
    addPlayer(game, 'Alice');
    const { error } = game.addPlayer('alice', 's2');
    expect(error).toBe('NICKNAME_TAKEN');
  });

  it('rejects join when game is full', () => {
    const game = new Game({
      pin: '123456',
      hostToken: 'tok',
      quiz: makeQuiz(),
      settings: { maxPlayers: 2 },
    });
    addPlayer(game, 'Alice');
    addPlayer(game, 'Bob');
    const { error } = game.addPlayer('Carol', 's3');
    expect(error).toBe('GAME_FULL');
  });

  it('rejects join after game has started (BAD_PHASE)', () => {
    const game = new Game({ pin: '123456', hostToken: 'tok', quiz: makeQuiz() });
    addPlayer(game, 'Alice');
    game.start();
    const { error } = game.addPlayer('Bob', 's2');
    expect(error).toBe('BAD_PHASE');
  });

  it('refuses to start with zero players', () => {
    const game = new Game({ pin: '123456', hostToken: 'tok', quiz: makeQuiz() });
    expect(game.start()).toBe(false);
    expect(game.phase).toBe('lobby');
  });

  it('removes a kicked player', () => {
    const game = new Game({ pin: '123456', hostToken: 'tok', quiz: makeQuiz() });
    const p = addPlayer(game, 'Alice');
    game.kickPlayer(p.id);
    expect(game.players.has(p.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Start → question transition
// ---------------------------------------------------------------------------

describe('Game – start / question phase', () => {
  it('transitions to question phase on start', () => {
    const game = new Game({ pin: '000001', hostToken: 'tok', quiz: makeQuiz() });
    addPlayer(game, 'Alice');
    game.start();
    expect(game.phase).toBe('question');
    expect(game.questionIndex).toBe(0);
  });

  it('emits phase and questionStart events on start', () => {
    const clock = makeFakeClock();
    const game = new Game({ pin: '000001', hostToken: 'tok', quiz: makeQuiz(), clock });
    addPlayer(game, 'Alice');
    const events = collectEvents(game);
    game.start();
    const phaseEvt = events.find((e) => e.type === 'phase' && e.phase === 'question');
    const startEvt = events.find((e) => e.type === 'questionStart');
    expect(phaseEvt).toBeDefined();
    expect(startEvt).toBeDefined();
  });

  it('sets endsAt to now + timeLimitSec * 1000', () => {
    const clock = makeFakeClock(5000);
    const game = new Game({ pin: '000001', hostToken: 'tok', quiz: makeQuiz(), clock });
    addPlayer(game, 'Alice');
    game.start();
    expect(game.questionEndsAt).toBe(5000 + 20_000);
  });

  it('refuses a second start call', () => {
    const game = new Game({ pin: '000001', hostToken: 'tok', quiz: makeQuiz() });
    addPlayer(game, 'Alice');
    game.start();
    expect(game.start()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Answer submission
// ---------------------------------------------------------------------------

describe('Game – submitAnswer', () => {
  function setup() {
    const clock = makeFakeClock(10_000);
    const game = new Game({
      pin: '000002',
      hostToken: 'tok',
      quiz: makeQuiz(),
      clock,
      settings: { scoringMode: 'speed' },
    });
    const alice = addPlayer(game, 'Alice');
    const bob = addPlayer(game, 'Bob');
    game.start();
    return { game, clock, alice, bob };
  }

  it('accepts a correct answer and returns correct=true', () => {
    const { game, alice } = setup();
    const q = game.currentQuestion!;
    const { result } = game.submitAnswer(alice.id, q.id, 0);
    expect(result?.correct).toBe(true);
  });

  it('accepts a wrong answer and returns correct=false with 0 points', () => {
    const { game, alice } = setup();
    const q = game.currentQuestion!;
    const { result } = game.submitAnswer(alice.id, q.id, 1);
    expect(result?.correct).toBe(false);
    expect(result?.pointsEarned).toBe(0);
  });

  it('rejects a duplicate answer (ALREADY_ANSWERED)', () => {
    const { game, alice } = setup();
    const q = game.currentQuestion!;
    game.submitAnswer(alice.id, q.id, 0);
    const { error } = game.submitAnswer(alice.id, q.id, 0);
    expect(error).toBe('ALREADY_ANSWERED');
  });

  it('rejects an answer with wrong questionId', () => {
    const { game, alice } = setup();
    const { error } = game.submitAnswer(alice.id, 'wrong-id', 0);
    expect(error).toBe('BAD_PHASE');
  });

  it('rejects an answer after endsAt + grace period', () => {
    // Use a fresh single-player game so the timer fires and the phase changes.
    // Alice doesn't answer during the question → timer fires → reveal phase.
    // Then try to submit after the grace period: should get BAD_PHASE (not question)
    // OR TOO_LATE if still in question. We test the late-submission path via a
    // custom receivedAt timestamp that is past endsAt + grace, while still in
    // question phase (before the timer fires).
    const clock2 = makeFakeClock(10_000);
    const game2 = new Game({
      pin: '999001',
      hostToken: 'tok',
      quiz: makeQuiz(),
      clock: clock2,
      settings: { scoringMode: 'speed' },
    });
    const player1 = addPlayer(game2, 'P1');
    const player2 = addPlayer(game2, 'P2');
    game2.start();
    const q = game2.currentQuestion!;

    // Submit with a receivedAt that is past endsAt + grace, but don't tick the
    // clock so the timer hasn't fired yet.
    const lateTime = 10_000 + 20_000 + 500; // start + timeLimitMs + 500 ms
    const { error } = game2.submitAnswer(player1.id, q.id, 0, lateTime);
    expect(error).toBe('TOO_LATE');
    void player2; // suppress unused warning
  });

  it('awards more points for a faster correct answer (speed mode)', () => {
    const clock = makeFakeClock(10_000);
    const game = new Game({
      pin: '000003',
      hostToken: 'tok',
      quiz: makeQuiz(),
      clock,
      settings: { scoringMode: 'speed' },
    });
    const alice = addPlayer(game, 'Alice');
    const bob = addPlayer(game, 'Bob');
    game.start();
    const q = game.currentQuestion!;

    // Alice answers immediately (t ≈ 0 → ~1000 pts)
    const r1 = game.submitAnswer(alice.id, q.id, 0, clock.now());

    // Bob answers near the buzzer using a custom receivedAt timestamp.
    // We do NOT tick the clock (to avoid firing the timer and ending the question).
    const nearBuzzer = clock.now() + 19_500; // 19.5 s elapsed
    const r2 = game.submitAnswer(bob.id, q.id, 0, nearBuzzer);

    expect(r1.result).not.toBeNull();
    expect(r2.result).not.toBeNull();
    expect(r1.result!.pointsEarned).toBeGreaterThan(r2.result!.pointsEarned);
  });

  it('flat mode gives same points regardless of elapsed time', () => {
    const clock = makeFakeClock(10_000);
    const game = new Game({
      pin: '000004',
      hostToken: 'tok',
      quiz: makeQuiz(),
      clock,
      settings: { scoringMode: 'flat' },
    });
    const alice = addPlayer(game, 'Alice');
    const bob = addPlayer(game, 'Bob');
    game.start();
    const q = game.currentQuestion!;

    const r1 = game.submitAnswer(alice.id, q.id, 0, clock.now());
    clock.tick(18_000);
    const r2 = game.submitAnswer(bob.id, q.id, 0, clock.now());
    expect(r1.result!.pointsEarned).toBe(r2.result!.pointsEarned);
  });

  it('emits questionProgress after each answer', () => {
    const { game, alice, bob } = setup();
    const events = collectEvents(game);
    const q = game.currentQuestion!;
    game.submitAnswer(alice.id, q.id, 0);
    game.submitAnswer(bob.id, q.id, 0);
    const progressEvts = events.filter((e) => e.type === 'questionProgress');
    expect(progressEvts.length).toBe(2);
  });

  it('emits playerResult with the per-player outcome', () => {
    const { game, alice } = setup();
    const events = collectEvents(game);
    const q = game.currentQuestion!;
    game.submitAnswer(alice.id, q.id, 0);
    const resultEvt = events.find(
      (e) => e.type === 'playerResult' && e.playerId === alice.id,
    );
    expect(resultEvt).toBeDefined();
    if (resultEvt?.type === 'playerResult') {
      expect(resultEvt.result.correct).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Early end when all connected players have answered
// ---------------------------------------------------------------------------

describe('Game – early end when all answered', () => {
  it('moves to reveal as soon as the last connected player answers', () => {
    const clock = makeFakeClock();
    const game = new Game({ pin: '000005', hostToken: 'tok', quiz: makeQuiz(), clock });
    const alice = addPlayer(game, 'Alice');
    const bob = addPlayer(game, 'Bob');
    game.start();
    const q = game.currentQuestion!;

    game.submitAnswer(alice.id, q.id, 0);
    expect(game.phase).toBe('question'); // still waiting for Bob

    game.submitAnswer(bob.id, q.id, 0);
    expect(game.phase).toBe('reveal'); // all answered → early reveal
  });

  it('ignores disconnected players when checking all-answered', () => {
    const clock = makeFakeClock();
    const game = new Game({ pin: '000006', hostToken: 'tok', quiz: makeQuiz(), clock });
    const alice = addPlayer(game, 'Alice');
    const bob = addPlayer(game, 'Bob');
    game.start();

    game.disconnectPlayer(bob.id);
    const q = game.currentQuestion!;
    game.submitAnswer(alice.id, q.id, 0);

    // Bob is disconnected; Alice is the only connected player → should reveal
    expect(game.phase).toBe('reveal');
  });

  it('auto-ends via timer when not all players answer', () => {
    const clock = makeFakeClock();
    const game = new Game({ pin: '000007', hostToken: 'tok', quiz: makeQuiz(), clock });
    addPlayer(game, 'Alice');
    addPlayer(game, 'Bob');
    game.start();

    // Alice answers but Bob doesn't
    const q = game.currentQuestion!;
    game.submitAnswer('nonexistent-id', q.id, 0); // will fail — that's fine

    expect(game.phase).toBe('question');
    clock.tick(20_000); // timer fires
    expect(game.phase).toBe('reveal');
  });
});

// ---------------------------------------------------------------------------
// reveal → leaderboard → next question
// ---------------------------------------------------------------------------

describe('Game – reveal → leaderboard → next', () => {
  function setupAtReveal() {
    const clock = makeFakeClock();
    const game = new Game({
      pin: '000008',
      hostToken: 'tok',
      quiz: makeQuiz(2),
      clock,
      settings: { showLeaderboardEachQuestion: true },
    });
    const alice = addPlayer(game, 'Alice');
    game.start();
    const q = game.currentQuestion!;
    game.submitAnswer(alice.id, q.id, 0);
    // Alice is the only player → all answered → auto-reveal
    expect(game.phase).toBe('reveal');
    return { game, clock, alice };
  }

  it('next() from reveal goes to leaderboard (when showLeaderboardEachQuestion=true)', () => {
    const { game } = setupAtReveal();
    game.next();
    expect(game.phase).toBe('leaderboard');
  });

  it('next() from leaderboard advances to question(1)', () => {
    const { game } = setupAtReveal();
    game.next(); // reveal → leaderboard
    game.next(); // leaderboard → question(1)
    expect(game.phase).toBe('question');
    expect(game.questionIndex).toBe(1);
  });

  it('next() after last leaderboard goes to podium', () => {
    const { game, alice } = setupAtReveal();
    game.next(); // reveal → leaderboard
    game.next(); // leaderboard → question(1)
    const q2 = game.currentQuestion!;
    game.submitAnswer(alice.id, q2.id, 0); // triggers early reveal
    game.next(); // reveal → leaderboard
    game.next(); // leaderboard → podium
    expect(game.phase).toBe('podium');
  });

  it('emits leaderboard event with ranked players', () => {
    const { game } = setupAtReveal();
    const events = collectEvents(game);
    game.next();
    const lbEvt = events.find((e) => e.type === 'leaderboard');
    expect(lbEvt).toBeDefined();
  });

  it('emits podium event with top3 and all', () => {
    const { game, alice } = setupAtReveal();
    const events = collectEvents(game);
    game.next();
    game.next(); // → question(1)
    const q2 = game.currentQuestion!;
    game.submitAnswer(alice.id, q2.id, 0);
    game.next(); // → leaderboard
    game.next(); // → podium
    const podiumEvt = events.find((e) => e.type === 'podium');
    expect(podiumEvt).toBeDefined();
    if (podiumEvt?.type === 'podium') {
      expect(podiumEvt.top3.length).toBeLessThanOrEqual(3);
      expect(podiumEvt.all.length).toBeGreaterThan(0);
    }
  });

  it('next() returns false in question phase', () => {
    const clock = makeFakeClock();
    const game = new Game({ pin: '000009', hostToken: 'tok', quiz: makeQuiz(), clock });
    addPlayer(game, 'Alice');
    game.start();
    expect(game.next()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Skip (host forces early end)
// ---------------------------------------------------------------------------

describe('Game – skipQuestion', () => {
  it('moves from question to reveal', () => {
    const clock = makeFakeClock();
    const game = new Game({ pin: '000010', hostToken: 'tok', quiz: makeQuiz(), clock });
    addPlayer(game, 'Alice');
    game.start();
    expect(game.skipQuestion()).toBe(true);
    expect(game.phase).toBe('reveal');
  });

  it('returns false when not in question phase', () => {
    const game = new Game({ pin: '000011', hostToken: 'tok', quiz: makeQuiz() });
    addPlayer(game, 'Alice');
    expect(game.skipQuestion()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Podium → ended
// ---------------------------------------------------------------------------

describe('Game – end()', () => {
  function setupAtPodium() {
    const clock = makeFakeClock();
    const game = new Game({
      pin: '000012',
      hostToken: 'tok',
      quiz: makeQuiz(1),
      clock,
      settings: { showLeaderboardEachQuestion: true },
    });
    const alice = addPlayer(game, 'Alice');
    game.start();
    const q = game.currentQuestion!;
    game.submitAnswer(alice.id, q.id, 0); // → reveal
    game.next(); // → leaderboard
    game.next(); // last question → podium
    return { game, clock };
  }

  it('transitions from podium to ended', () => {
    const { game } = setupAtPodium();
    expect(game.phase).toBe('podium');
    expect(game.end()).toBe(true);
    expect(game.phase).toBe('ended');
  });

  it('emits ended event', () => {
    const { game } = setupAtPodium();
    const events = collectEvents(game);
    game.end();
    expect(events.find((e) => e.type === 'ended')).toBeDefined();
  });

  it('returns false when not in podium phase', () => {
    const game = new Game({ pin: '000013', hostToken: 'tok', quiz: makeQuiz() });
    expect(game.end()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// showLeaderboardEachQuestion = false
// ---------------------------------------------------------------------------

describe('Game – showLeaderboardEachQuestion=false', () => {
  it('skips leaderboard and goes straight to next question', () => {
    const clock = makeFakeClock();
    const game = new Game({
      pin: '000014',
      hostToken: 'tok',
      quiz: makeQuiz(2),
      clock,
      settings: { showLeaderboardEachQuestion: false },
    });
    const alice = addPlayer(game, 'Alice');
    game.start();
    const q = game.currentQuestion!;
    game.submitAnswer(alice.id, q.id, 0); // → reveal
    game.next(); // should jump straight to question(1)
    expect(game.phase).toBe('question');
    expect(game.questionIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reconnection
// ---------------------------------------------------------------------------

describe('Game – reconnection', () => {
  it('rebinds the socket and marks player as connected', () => {
    const game = new Game({ pin: '000015', hostToken: 'tok', quiz: makeQuiz() });
    const p = addPlayer(game, 'Alice', 'old-sock');
    game.disconnectPlayer(p.id);
    expect(game.players.get(p.id)?.connected).toBe(false);

    const reconnected = game.reconnectPlayer(p.id, 'new-sock');
    expect(reconnected?.socketId).toBe('new-sock');
    expect(reconnected?.connected).toBe(true);
  });

  it('returns null for an unknown playerId', () => {
    const game = new Game({ pin: '000016', hostToken: 'tok', quiz: makeQuiz() });
    expect(game.reconnectPlayer('no-such-id', 'sock')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Answer distribution
// ---------------------------------------------------------------------------

describe('Game – answer distribution in reveal', () => {
  it('counts how many players chose each option', () => {
    const clock = makeFakeClock();
    const game = new Game({ pin: '000017', hostToken: 'tok', quiz: makeQuiz(), clock });
    const alice = addPlayer(game, 'Alice');
    const bob = addPlayer(game, 'Bob');
    const carol = addPlayer(game, 'Carol');
    game.start();
    const q = game.currentQuestion!;

    const events = collectEvents(game);

    game.submitAnswer(alice.id, q.id, 0); // correct
    game.submitAnswer(bob.id, q.id, 1);   // wrong
    game.submitAnswer(carol.id, q.id, 0); // correct

    const revealEvt = events.find((e) => e.type === 'questionReveal');
    expect(revealEvt).toBeDefined();
    if (revealEvt?.type === 'questionReveal') {
      expect(revealEvt.reveal.distribution[0]).toBe(2);
      expect(revealEvt.reveal.distribution[1]).toBe(1);
      expect(revealEvt.reveal.distribution[2]).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scoring accumulation across questions
// ---------------------------------------------------------------------------

describe('Game – score accumulation', () => {
  it('accumulates score across two questions', () => {
    const clock = makeFakeClock();
    const game = new Game({
      pin: '000018',
      hostToken: 'tok',
      quiz: makeQuiz(2),
      clock,
      settings: { scoringMode: 'flat', showLeaderboardEachQuestion: true },
    });
    const alice = addPlayer(game, 'Alice');
    game.start();

    const q1 = game.currentQuestion!;
    game.submitAnswer(alice.id, q1.id, 0); // correct → 1000
    game.next(); // → leaderboard
    game.next(); // → question(1)

    const q2 = game.currentQuestion!;
    game.submitAnswer(alice.id, q2.id, 0); // correct → 1000
    // → reveal (auto, single player)

    const player = game.players.get(alice.id)!;
    expect(player.score).toBe(2000);
  });
});
