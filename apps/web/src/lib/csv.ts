import type { RankedPlayer } from '@amadeus/shared';

function escape(v: string | number): string {
  const s = String(v);
  // Wrap in quotes if the value contains a comma, quote, or newline
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Builds a CSV string from the final leaderboard and triggers a browser
 * download. No library needed — the data is flat and small.
 */
export function downloadResultsCsv(ranked: RankedPlayer[], quizTitle: string): void {
  const header = ['Rank', 'Nickname', 'Score', 'Streak'];
  const rows = ranked.map((p) => [p.rank, p.nickname, p.score, p.streak]);

  const csv =
    [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n';

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${quizTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
