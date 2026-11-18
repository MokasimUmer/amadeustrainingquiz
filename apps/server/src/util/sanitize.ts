import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Profanity list
// ---------------------------------------------------------------------------

function loadProfanityList(): Set<string> {
  const dir = dirname(fileURLToPath(import.meta.url));
  // Walk up to repo root to find profanity.txt
  const candidates = [
    join(dir, '..', '..', '..', 'profanity.txt'),
    join(dir, '..', 'profanity.txt'),
    join(dir, 'profanity.txt'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return new Set(
        readFileSync(p, 'utf8')
          .split('\n')
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean),
      );
    }
  }
  return new Set();
}

const PROFANITY = loadProfanityList();

// ---------------------------------------------------------------------------
// Nickname sanitization
// ---------------------------------------------------------------------------

export type NicknameError =
  | 'NICKNAME_INVALID' // empty / too long / contains control chars
  | 'NICKNAME_PROFANITY'; // matched profanity list

/**
 * Sanitizes a raw nickname string.
 *
 * Steps:
 *   1. Trim leading/trailing whitespace.
 *   2. Collapse internal runs of whitespace to a single space.
 *   3. Strip ASCII control characters (U+0000–U+001F, U+007F).
 *   4. Enforce 1–20 character length.
 *   5. Reject if the lowercased value matches a profanity list entry.
 *
 * Returns `{ ok: true, value }` or `{ ok: false, reason }`.
 */
export function sanitizeNickname(
  raw: string,
): { ok: true; value: string } | { ok: false; reason: NicknameError } {
  // Strip control characters
  // eslint-disable-next-line no-control-regex
  let name = raw.replace(/[\x00-\x1F\x7F]/g, '');
  // Trim and collapse whitespace
  name = name.trim().replace(/\s+/g, ' ');

  if (name.length === 0 || name.length > 20) {
    return { ok: false, reason: 'NICKNAME_INVALID' };
  }

  if (PROFANITY.has(name.toLowerCase())) {
    return { ok: false, reason: 'NICKNAME_PROFANITY' };
  }

  return { ok: true, value: name };
}
