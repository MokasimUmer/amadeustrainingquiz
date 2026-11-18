import { describe, it, expect } from 'vitest';
import {
  rankPlayers,
  topN,
  hasTopTie,
  applyTieResolution,
} from './leaderboard.js';
import type { Player } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(
  partial: Partial<Player> & { id: string; nickname: string; score: number },
): Player {
  return {
    socketId: null,
    reconnectToken: 'tok',
    streak: 0,
    totalResponseMs: 0,
    answers: {},
    connected: true,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// rankPlayers – basic ordering
// ---------------------------------------------------------------------------

describe('rankPlayers – basic ordering', () => {
  it('sorts by score descending', () => {
    const players = [
      makePlayer({ id: 'c', nickname: 'Charlie', score: 500 }),
      makePlayer({ id: 'a', nickname: 'Alice', score: 1500 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('assigns rank 1, 2, 3 for distinct scores', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1500 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
      makePlayer({ id: 'c', nickname: 'Charlie', score: 500 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it('handles a single player', () => {
    const result = rankPlayers(
      [makePlayer({ id: 'a', nickname: 'Alice', score: 1000 })],
      'time',
    );
    expect(result[0].rank).toBe(1);
    expect(result[0].score).toBe(1000);
  });

  it('handles an empty list', () => {
    expect(rankPlayers([], 'time')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Competition ranking (ties share the same rank, next rank skips)
// ---------------------------------------------------------------------------

describe('rankPlayers – competition ranking', () => {
  it('gives shared rank 1 to two tied players, rank 3 to the next', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
      makePlayer({ id: 'c', nickname: 'Charlie', score: 500 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(3);
  });

  it('produces 1, 2, 2, 4 for the pattern described in the spec', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 2000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
      makePlayer({ id: 'c', nickname: 'Carol', score: 1000 }),
      makePlayer({ id: 'd', nickname: 'Dave', score: 500 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result.map((p) => p.rank)).toEqual([1, 2, 2, 4]);
  });

  it('produces 1, 1, 1, 4 when the top three are all tied', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
      makePlayer({ id: 'c', nickname: 'Carol', score: 1000 }),
      makePlayer({ id: 'd', nickname: 'Dave', score: 500 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result.map((p) => p.rank)).toEqual([1, 1, 1, 4]);
  });
});

// ---------------------------------------------------------------------------
// Tie-break = 'time'
// ---------------------------------------------------------------------------

describe('rankPlayers – tieBreak time', () => {
  it('breaks score tie by totalResponseMs ascending', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000, totalResponseMs: 8000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000, totalResponseMs: 5000 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result[0].id).toBe('b'); // faster wins
    expect(result[1].id).toBe('a');
  });

  it('assigns different ranks when time breaks the tie', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000, totalResponseMs: 8000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000, totalResponseMs: 5000 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('still shares rank when score AND time are equal', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000, totalResponseMs: 5000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000, totalResponseMs: 5000 }),
      makePlayer({ id: 'c', nickname: 'Carol', score: 500, totalResponseMs: 1000 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(3);
  });

  it('uses nickname as final tiebreaker (alphabetic ascending)', () => {
    const players = [
      makePlayer({ id: 'z', nickname: 'Zara', score: 1000, totalResponseMs: 5000 }),
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000, totalResponseMs: 5000 }),
    ];
    const result = rankPlayers(players, 'time');
    // Alice before Zara alphabetically → different position, but still rank 1 each
    expect(result[0].nickname).toBe('Alice');
    // Both have same score + same time → both rank 1
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tie-break = 'host'
// ---------------------------------------------------------------------------

describe('rankPlayers – tieBreak host', () => {
  it('does not use totalResponseMs to break ties', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000, totalResponseMs: 8000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000, totalResponseMs: 5000 }),
    ];
    const result = rankPlayers(players, 'host');
    // Both should share rank 1 (time not used)
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
  });

  it('still sorts by score descending', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 500 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1500 }),
    ];
    const result = rankPlayers(players, 'host');
    expect(result[0].id).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// delta field
// ---------------------------------------------------------------------------

describe('rankPlayers – delta', () => {
  it('computes delta from prevScores', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1500 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
    ];
    const prev = new Map([
      ['a', 1000],
      ['b', 800],
    ]);
    const result = rankPlayers(players, 'time', prev);
    const alice = result.find((p) => p.id === 'a')!;
    const bob = result.find((p) => p.id === 'b')!;
    expect(alice.delta).toBe(500);
    expect(bob.delta).toBe(200);
  });

  it('defaults delta to 0 when no prevScores provided', () => {
    const players = [makePlayer({ id: 'a', nickname: 'Alice', score: 1000 })];
    const result = rankPlayers(players, 'time');
    expect(result[0].delta).toBe(0);
  });

  it('defaults missing player in prevScores to 0', () => {
    const players = [makePlayer({ id: 'a', nickname: 'Alice', score: 800 })];
    const prev = new Map<string, number>(); // empty
    const result = rankPlayers(players, 'time', prev);
    expect(result[0].delta).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// Streak passthrough
// ---------------------------------------------------------------------------

describe('rankPlayers – streak field', () => {
  it('propagates the streak value from the player object', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000, streak: 4 }),
    ];
    const result = rankPlayers(players, 'time');
    expect(result[0].streak).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// topN
// ---------------------------------------------------------------------------

describe('topN', () => {
  const ranked = [
    { id: 'a', nickname: 'A', score: 3000, rank: 1, streak: 0, delta: 0 },
    { id: 'b', nickname: 'B', score: 2000, rank: 2, streak: 0, delta: 0 },
    { id: 'c', nickname: 'C', score: 1000, rank: 3, streak: 0, delta: 0 },
    { id: 'd', nickname: 'D', score: 500, rank: 4, streak: 0, delta: 0 },
  ];

  it('returns the first N entries', () => {
    expect(topN(ranked, 3).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves existing rank values', () => {
    expect(topN(ranked, 2).map((p) => p.rank)).toEqual([1, 2]);
  });

  it('returns all when N >= length', () => {
    expect(topN(ranked, 10)).toHaveLength(4);
  });

  it('returns empty for N=0', () => {
    expect(topN(ranked, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hasTopTie
// ---------------------------------------------------------------------------

describe('hasTopTie', () => {
  it('returns true when top two share rank 1', () => {
    const ranked = [
      { id: 'a', nickname: 'A', score: 1000, rank: 1, streak: 0, delta: 0 },
      { id: 'b', nickname: 'B', score: 1000, rank: 1, streak: 0, delta: 0 },
      { id: 'c', nickname: 'C', score: 500, rank: 3, streak: 0, delta: 0 },
    ];
    expect(hasTopTie(ranked)).toBe(true);
  });

  it('returns false when first two have different ranks', () => {
    const ranked = [
      { id: 'a', nickname: 'A', score: 1500, rank: 1, streak: 0, delta: 0 },
      { id: 'b', nickname: 'B', score: 1000, rank: 2, streak: 0, delta: 0 },
    ];
    expect(hasTopTie(ranked)).toBe(false);
  });

  it('returns false for a single player', () => {
    const ranked = [
      { id: 'a', nickname: 'A', score: 1000, rank: 1, streak: 0, delta: 0 },
    ];
    expect(hasTopTie(ranked)).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(hasTopTie([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyTieResolution
// ---------------------------------------------------------------------------

describe('applyTieResolution', () => {
  it('reorders the tied top group per host choice', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
      makePlayer({ id: 'c', nickname: 'Carol', score: 500 }),
    ];
    const ranked = rankPlayers(players, 'host');
    // Both Alice and Bob share rank 1; host picks Bob first
    const resolved = applyTieResolution(ranked, ['b', 'a']);
    expect(resolved[0].id).toBe('b');
    expect(resolved[0].rank).toBe(1);
    expect(resolved[1].id).toBe('a');
    expect(resolved[1].rank).toBe(2);
    // Carol is not in the tied group; check she's still there
    expect(resolved[2].id).toBe('c');
  });

  it('leaves non-tied players in their original positions', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
      makePlayer({ id: 'c', nickname: 'Carol', score: 500 }),
      makePlayer({ id: 'd', nickname: 'Dave', score: 300 }),
    ];
    const ranked = rankPlayers(players, 'host');
    const resolved = applyTieResolution(ranked, ['b', 'a']);
    const carol = resolved.find((p) => p.id === 'c')!;
    const dave = resolved.find((p) => p.id === 'd')!;
    expect(carol.rank).toBeGreaterThan(2);
    expect(dave.rank).toBeGreaterThan(carol.rank);
  });

  it('handles an empty orderedPlayerIds (no-op)', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
    ];
    const ranked = rankPlayers(players, 'host');
    const resolved = applyTieResolution(ranked, []);
    expect(resolved).toEqual(ranked);
  });

  it('appends any tied player the host omitted from orderedPlayerIds', () => {
    const players = [
      makePlayer({ id: 'a', nickname: 'Alice', score: 1000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 1000 }),
      makePlayer({ id: 'c', nickname: 'Carol', score: 1000 }),
    ];
    const ranked = rankPlayers(players, 'host');
    // Host only specifies two of the three tied players
    const resolved = applyTieResolution(ranked, ['c', 'a']);
    const ids = resolved.map((p) => p.id);
    // Carol and Alice first (host-ordered), then Bob (appended)
    expect(ids[0]).toBe('c');
    expect(ids[1]).toBe('a');
    expect(ids[2]).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// Full end-to-end scenario
// ---------------------------------------------------------------------------

describe('rankPlayers – full scenario', () => {
  it('produces the correct ranking for a 5-player game after two questions', () => {
    // Scores after Q2:
    //   Eve:   2500 (fast answers)
    //   Alice: 2000 (medium)
    //   Bob:   2000 (slow)
    //   Carol: 1500
    //   Dave:  0    (all wrong)
    const players = [
      makePlayer({ id: 'd', nickname: 'Dave', score: 0, totalResponseMs: 100 }),
      makePlayer({ id: 'c', nickname: 'Carol', score: 1500, totalResponseMs: 12000 }),
      makePlayer({ id: 'b', nickname: 'Bob', score: 2000, totalResponseMs: 18000 }),
      makePlayer({ id: 'a', nickname: 'Alice', score: 2000, totalResponseMs: 10000 }),
      makePlayer({ id: 'e', nickname: 'Eve', score: 2500, totalResponseMs: 5000 }),
    ];

    const result = rankPlayers(players, 'time');

    expect(result[0]).toMatchObject({ id: 'e', rank: 1 });
    expect(result[1]).toMatchObject({ id: 'a', rank: 2 }); // Alice faster
    expect(result[2]).toMatchObject({ id: 'b', rank: 3 }); // Bob slower
    expect(result[3]).toMatchObject({ id: 'c', rank: 4 });
    expect(result[4]).toMatchObject({ id: 'd', rank: 5 });
  });
});
