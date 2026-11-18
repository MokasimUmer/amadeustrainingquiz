import { randomInt } from 'node:crypto';

/**
 * Generates a random 6-digit PIN string (zero-padded).
 * Uses `crypto.randomInt` so the output is cryptographically unpredictable.
 */
export function generatePin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Keeps generating PINs until one is not in `activePins`.
 * Throws after `maxAttempts` to prevent an infinite loop if the pool is saturated.
 */
export function uniquePin(
  activePins: Set<string>,
  maxAttempts = 100,
): string {
  for (let i = 0; i < maxAttempts; i++) {
    const pin = generatePin();
    if (!activePins.has(pin)) return pin;
  }
  throw new Error('Could not generate a unique PIN after ' + maxAttempts + ' attempts');
}
