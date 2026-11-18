import type { Socket } from 'socket.io';
import type { ErrorCode } from '@amadeus/shared';

// ---------------------------------------------------------------------------
// Acknowledgement helpers
// ---------------------------------------------------------------------------

export function ackOk<T>(data?: T): T extends undefined ? { ok: true } : { ok: true; data: T } {
  if (data === undefined) return { ok: true } as never;
  return { ok: true, data } as never;
}

export function ackErr(
  code: ErrorCode,
  message: string,
): { ok: false; error: { code: ErrorCode; message: string } } {
  return { ok: false, error: { code, message } };
}

// ---------------------------------------------------------------------------
// Token-bucket rate limiter (per socket)
// ---------------------------------------------------------------------------

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const RATE_LIMIT = 10; // events per second
const REFILL_INTERVAL_MS = 1000;

const buckets = new WeakMap<Socket, Bucket>();

export function consumeToken(socket: Socket): boolean {
  const now = Date.now();
  let bucket = buckets.get(socket);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT, lastRefill: now };
    buckets.set(socket, bucket);
  }
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    bucket.tokens = RATE_LIMIT;
    bucket.lastRefill = now;
  }
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

// ---------------------------------------------------------------------------
// IP-based join rate limiter (5 attempts / minute)
// ---------------------------------------------------------------------------

interface JoinRecord {
  count: number;
  windowStart: number;
}

const joinAttempts = new Map<string, JoinRecord>();
const JOIN_LIMIT = 5;
const JOIN_WINDOW_MS = 60_000;

export function canAttemptJoin(ip: string): boolean {
  const now = Date.now();
  const rec = joinAttempts.get(ip);
  if (!rec || now - rec.windowStart >= JOIN_WINDOW_MS) {
    joinAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (rec.count >= JOIN_LIMIT) return false;
  rec.count += 1;
  return true;
}

/** Prune stale join records (call occasionally). */
export function pruneJoinRecords(): void {
  const now = Date.now();
  for (const [ip, rec] of joinAttempts) {
    if (now - rec.windowStart >= JOIN_WINDOW_MS) joinAttempts.delete(ip);
  }
}

/** Reset all join rate-limit records (test helper). */
export function resetJoinRecords(): void {
  joinAttempts.clear();
}
