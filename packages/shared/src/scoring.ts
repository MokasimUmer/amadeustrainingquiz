import type { ScoringMode } from './types.js';

export interface ComputePointsOpts {
  correct: boolean;
  mode: ScoringMode;
  elapsedMs: number;
  timeLimitMs: number;
  basePoints: number;
  streak: number;
}

/**
 * Computes points earned for a single answer.
 *
 * Speed mode:  score = basePoints * (1 - t/2)  where t = elapsedMs / timeLimitMs clamped [0,1]
 *              → 100% of basePoints at t=0, 50% at t=1
 * Flat mode:   score = basePoints (always, when correct)
 *
 * Streak bonus: +50 per consecutive correct answer, capped at 5 streaks (+250 max).
 */
export function computePoints(opts: ComputePointsOpts): number {
  if (!opts.correct) return 0;

  if (opts.mode === 'flat') return opts.basePoints;

  const t = Math.min(Math.max(opts.elapsedMs / opts.timeLimitMs, 0), 1);
  const speed = Math.round(opts.basePoints * (1 - t / 2));
  const streakBonus = Math.min(opts.streak, 5) * 50;
  return speed + streakBonus;
}
