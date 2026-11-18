/**
 * Minimal clock abstraction so Game.ts can be unit-tested with a fake clock.
 */
export interface Clock {
  /** Returns the current wall-clock time in milliseconds (like Date.now()). */
  now(): number;
  /**
   * Schedules a callback after `ms` milliseconds.
   * Returns an opaque handle that can be passed to `clearTimeout`.
   */
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  /** Cancels a previously scheduled callback. */
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

/** Production clock that delegates to the Node.js globals. */
export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};
