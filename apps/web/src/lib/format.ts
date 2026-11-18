/** Formats a millisecond duration as whole seconds, clamped to [0, max]. */
export function msToSec(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** Formats a score number with thousands separator. */
export function formatScore(n: number): string {
  return n.toLocaleString('en-US');
}

/** Ordinal suffix: 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
