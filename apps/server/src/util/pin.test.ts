import { describe, it, expect } from 'vitest';
import { generatePin, uniquePin } from './pin.js';

describe('generatePin', () => {
  it('returns a 6-character string', () => {
    expect(generatePin()).toHaveLength(6);
  });

  it('contains only digits', () => {
    for (let i = 0; i < 20; i++) {
      expect(generatePin()).toMatch(/^\d{6}$/);
    }
  });

  it('zero-pads low numbers', () => {
    // generatePin can produce '000000' through '000009'; just confirm format
    const pins = Array.from({ length: 100 }, generatePin);
    for (const p of pins) {
      expect(p).toHaveLength(6);
    }
  });
});

describe('uniquePin', () => {
  it('returns a PIN not in the active set', () => {
    const active = new Set(['000001', '000002']);
    const pin = uniquePin(active);
    expect(active.has(pin)).toBe(false);
  });

  it('throws when every possible PIN is taken', () => {
    // Fill all 1 million pins — that's too slow, so we override with maxAttempts=1
    // and seed a set that is guaranteed to contain whatever generatePin returns.
    // We use a proxy instead: pass a Set that always returns true for .has().
    const alwaysTaken = {
      has: () => true,
    } as unknown as Set<string>;
    expect(() => uniquePin(alwaysTaken, 5)).toThrow();
  });

  it('succeeds when the set is empty', () => {
    const pin = uniquePin(new Set());
    expect(pin).toMatch(/^\d{6}$/);
  });
});
