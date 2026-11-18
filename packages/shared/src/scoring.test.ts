import { describe, it, expect } from 'vitest';
import { computePoints } from './scoring.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const base = {
  mode: 'speed' as const,
  timeLimitMs: 20_000,
  basePoints: 1000,
  streak: 0,
};

// ---------------------------------------------------------------------------
// Incorrect answers always return 0
// ---------------------------------------------------------------------------

describe('computePoints – incorrect answer', () => {
  it('returns 0 regardless of mode (speed)', () => {
    expect(computePoints({ ...base, correct: false, elapsedMs: 0 })).toBe(0);
  });

  it('returns 0 regardless of mode (flat)', () => {
    expect(
      computePoints({ ...base, mode: 'flat', correct: false, elapsedMs: 0 }),
    ).toBe(0);
  });

  it('returns 0 even when elapsedMs is negative', () => {
    expect(computePoints({ ...base, correct: false, elapsedMs: -100 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Flat mode
// ---------------------------------------------------------------------------

describe('computePoints – flat mode', () => {
  it('returns basePoints for an instant answer', () => {
    expect(
      computePoints({ ...base, mode: 'flat', correct: true, elapsedMs: 0 }),
    ).toBe(1000);
  });

  it('returns basePoints at the buzzer (elapsedMs = timeLimitMs)', () => {
    expect(
      computePoints({
        ...base,
        mode: 'flat',
        correct: true,
        elapsedMs: 20_000,
      }),
    ).toBe(1000);
  });

  it('ignores streak in flat mode', () => {
    expect(
      computePoints({
        ...base,
        mode: 'flat',
        correct: true,
        elapsedMs: 0,
        streak: 10,
      }),
    ).toBe(1000);
  });

  it('uses the configured basePoints value', () => {
    expect(
      computePoints({
        ...base,
        mode: 'flat',
        correct: true,
        elapsedMs: 0,
        basePoints: 500,
      }),
    ).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Speed mode – boundary values
// ---------------------------------------------------------------------------

describe('computePoints – speed mode boundaries', () => {
  it('returns basePoints (1000) for an instant answer with no streak', () => {
    // t = 0  → speed = round(1000 * (1 - 0/2)) = 1000
    expect(computePoints({ ...base, correct: true, elapsedMs: 0 })).toBe(1000);
  });

  it('returns exactly 500 at the buzzer (100% of time used, no streak)', () => {
    // t = 1  → speed = round(1000 * (1 - 1/2)) = 500
    expect(
      computePoints({ ...base, correct: true, elapsedMs: 20_000 }),
    ).toBe(500);
  });

  it('returns 750 at the halfway mark (50% of time used)', () => {
    // t = 0.5 → speed = round(1000 * (1 - 0.25)) = round(750) = 750
    expect(
      computePoints({ ...base, correct: true, elapsedMs: 10_000 }),
    ).toBe(750);
  });

  it('clamps elapsedMs below 0 to t=0 (treats as instant)', () => {
    expect(
      computePoints({ ...base, correct: true, elapsedMs: -500 }),
    ).toBe(1000);
  });

  it('clamps elapsedMs above timeLimitMs to t=1 (treats as buzzer)', () => {
    expect(
      computePoints({ ...base, correct: true, elapsedMs: 25_000 }),
    ).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Speed mode – different basePoints
// ---------------------------------------------------------------------------

describe('computePoints – speed mode basePoints variations', () => {
  it('scales correctly with basePoints=2000', () => {
    // t=0 → 2000; t=1 → 1000
    expect(
      computePoints({ ...base, correct: true, elapsedMs: 0, basePoints: 2000 }),
    ).toBe(2000);
    expect(
      computePoints({
        ...base,
        correct: true,
        elapsedMs: 20_000,
        basePoints: 2000,
      }),
    ).toBe(1000);
  });

  it('rounds to nearest integer', () => {
    // elapsedMs=1 on a 20 s limit: t=1/20000
    // speed = round(1000 * (1 - 1/40000)) = round(999.975) = 1000
    expect(
      computePoints({ ...base, correct: true, elapsedMs: 1 }),
    ).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Streak bonus
// ---------------------------------------------------------------------------

describe('computePoints – streak bonus (speed mode)', () => {
  it('adds 50 per streak, up to streak=5 (+250)', () => {
    const instant = { ...base, correct: true, elapsedMs: 0 };
    expect(computePoints({ ...instant, streak: 1 })).toBe(1050);
    expect(computePoints({ ...instant, streak: 2 })).toBe(1100);
    expect(computePoints({ ...instant, streak: 3 })).toBe(1150);
    expect(computePoints({ ...instant, streak: 4 })).toBe(1200);
    expect(computePoints({ ...instant, streak: 5 })).toBe(1250);
  });

  it('caps streak bonus at 5 streaks (streak=6 same as streak=5)', () => {
    const instant = { ...base, correct: true, elapsedMs: 0 };
    expect(computePoints({ ...instant, streak: 6 })).toBe(1250);
    expect(computePoints({ ...instant, streak: 100 })).toBe(1250);
  });

  it('adds streak bonus on top of reduced speed score at buzzer', () => {
    // speed=500, streak=3 → +150 → 650
    expect(
      computePoints({ ...base, correct: true, elapsedMs: 20_000, streak: 3 }),
    ).toBe(650);
  });

  it('streak=0 gives no bonus', () => {
    expect(computePoints({ ...base, correct: true, elapsedMs: 0, streak: 0 })).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Different time limits
// ---------------------------------------------------------------------------

describe('computePoints – varying timeLimitMs', () => {
  it('scores correctly on a 5 s limit', () => {
    // instant answer → 1000; at 2.5 s → 750; at 5 s → 500
    const opts = { ...base, correct: true, timeLimitMs: 5_000 };
    expect(computePoints({ ...opts, elapsedMs: 0 })).toBe(1000);
    expect(computePoints({ ...opts, elapsedMs: 2_500 })).toBe(750);
    expect(computePoints({ ...opts, elapsedMs: 5_000 })).toBe(500);
  });

  it('scores correctly on a 120 s limit', () => {
    const opts = { ...base, correct: true, timeLimitMs: 120_000 };
    expect(computePoints({ ...opts, elapsedMs: 0 })).toBe(1000);
    expect(computePoints({ ...opts, elapsedMs: 120_000 })).toBe(500);
  });
});
