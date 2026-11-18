import type { Player, RankedPlayer, TieBreak } from './types.js';

/**
 * Sorts players and assigns competition ranks.
 *
 * Sort order:
 *   1. score descending
 *   2. totalResponseMs ascending  (only applied when tieBreak === 'time')
 *   3. nickname ascending          (stable alphabetic fallback)
 *
 * Competition ranking: tied players share the same rank and the next rank
 * skips accordingly (1, 2, 2, 4).
 *
 * @param players   All players in the game (connected or not).
 * @param tieBreak  'time' resolves ties by cumulative response time;
 *                  'host' leaves tied players in nickname order
 *                  (the host resolves them separately via host:resolveTie).
 * @param prevScores  Optional map of playerId → score before this question,
 *                    used to compute the `delta` field.
 */
export function rankPlayers(
  players: Player[],
  tieBreak: TieBreak,
  prevScores?: Map<string, number>,
): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => {
    // 1. score descending
    if (b.score !== a.score) return b.score - a.score;
    // 2. response time ascending (only when tieBreak = 'time')
    if (tieBreak === 'time' && a.totalResponseMs !== b.totalResponseMs) {
      return a.totalResponseMs - b.totalResponseMs;
    }
    // 3. nickname ascending (always applied as final stable tie-breaker)
    return a.nickname.localeCompare(b.nickname);
  });

  const result: RankedPlayer[] = [];
  let rank = 1;

  for (let i = 0; i < sorted.length; i++) {
    // sorted[i] is always defined because i < sorted.length
    const p = sorted[i] as Player;

    if (i > 0) {
      const prev = sorted[i - 1] as Player;

      // Two players share a rank only when every earlier tie-breaking criterion is equal.
      const strictlyEqual =
        p.score === prev.score &&
        (tieBreak !== 'time' || p.totalResponseMs === prev.totalResponseMs);

      if (!strictlyEqual) {
        rank = i + 1;
      }
    }

    const delta = prevScores ? p.score - (prevScores.get(p.id) ?? 0) : 0;

    result.push({
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      rank,
      streak: p.streak,
      delta,
    });
  }

  return result;
}

/**
 * Returns the top-N ranked players from a full ranking.
 * Preserves the existing rank values (does not re-number).
 */
export function topN(ranked: RankedPlayer[], n: number): RankedPlayer[] {
  return ranked.slice(0, n);
}

/**
 * Detects whether the leading position is shared by more than one player.
 * Used to trigger the host:tieDetected flow when tieBreak === 'host'.
 */
export function hasTopTie(ranked: RankedPlayer[]): boolean {
  if (ranked.length < 2) return false;
  // Both indices are guaranteed safe by the length check above.
  return (ranked[0] as RankedPlayer).rank === (ranked[1] as RankedPlayer).rank;
}

/**
 * Applies a host-ordered tie resolution to the top of the leaderboard.
 *
 * `orderedPlayerIds` is the host's preferred order for the tied players.
 * Players not in the tied group keep their original positions.
 * The returned array keeps competition ranks intact for non-tied players
 * but assigns sequential ranks to the previously-tied group.
 */
export function applyTieResolution(
  ranked: RankedPlayer[],
  orderedPlayerIds: string[],
): RankedPlayer[] {
  if (orderedPlayerIds.length === 0) return ranked;

  const first = ranked[0];
  if (!first) return ranked;

  const tiedRank = first.rank;
  const tiedGroup = ranked.filter((p) => p.rank === tiedRank);
  const rest = ranked.filter((p) => p.rank !== tiedRank);

  // Build the ordered tied group; append any tied player the host omitted.
  const orderedSet = new Set(orderedPlayerIds);
  const orderedGroup: RankedPlayer[] = [];

  for (const id of orderedPlayerIds) {
    const player = tiedGroup.find((p) => p.id === id);
    if (player) orderedGroup.push(player);
  }

  for (const p of tiedGroup) {
    if (!orderedSet.has(p.id)) orderedGroup.push(p);
  }

  // Assign sequential ranks to the now-ordered group.
  const resolved: RankedPlayer[] = orderedGroup.map((p, i) => ({
    ...p,
    rank: i + 1,
  }));

  // Shift the remaining players' ranks to account for any size change (usually 0).
  const offset = orderedGroup.length - tiedGroup.length;
  const shiftedRest: RankedPlayer[] = rest.map((p) => ({
    ...p,
    rank: p.rank + offset,
  }));

  return [...resolved, ...shiftedRest];
}
