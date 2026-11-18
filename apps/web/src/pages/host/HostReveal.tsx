/**
 * Post-question reveal: correct answer highlighted, animated distribution
 * bars, top-5 snapshot.
 */
import { useHostStore, nextPhase } from '../../store/hostStore';
import { Button } from '../../components/Button';
import { formatScore } from '../../lib/format';

const GLYPH = ['▲', '◆', '●', '■'];
const BG = ['bg-opt-a', 'bg-opt-b', 'bg-opt-c', 'bg-opt-d'];
const BORDER = ['ring-opt-a', 'ring-opt-b', 'ring-opt-c', 'ring-opt-d'];

interface Props {
  pin: string;
}

export function HostReveal({ pin }: Props) {
  const question = useHostStore((s) => s.question);
  const distribution = useHostStore((s) => s.distribution);
  const correctIndices = useHostStore((s) => s.correctIndices);
  const leaderboard = useHostStore((s) => s.leaderboard);

  if (!question) return null;

  const total = distribution.reduce((a, b) => a + b, 0) || 1;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <p className="text-sm text-muted">Results</p>
      <p className="mt-1 text-xl font-semibold text-text">{question.text}</p>

      {/* Distribution bars */}
      <div className="mt-6 space-y-3">
        {question.options.map((opt, i) => {
          const isCorrect = correctIndices.includes(i);
          const count = distribution[i] ?? 0;
          const pct = Math.round((count / total) * 100);

          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-text">
                  <span
                    className={`${isCorrect ? BG[i] : 'bg-surface-2'} rounded px-1.5 py-0.5 text-xs font-bold ${isCorrect ? 'text-bg' : 'text-muted'}`}
                  >
                    {GLYPH[i]}
                  </span>
                  <span className={isCorrect ? 'text-text' : 'text-muted'}>{opt}</span>
                  {isCorrect && (
                    <span className="text-xs font-medium text-ok">✓ correct</span>
                  )}
                </span>
                <span className="tabular-nums text-muted">{count}</span>
              </div>

              {/* Animated bar */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${isCorrect ? BG[i] : 'bg-surface'} ${isCorrect ? '' : 'opacity-40'} ${isCorrect && BORDER[i] ? '' : ''}`}
                  style={{ width: `${pct}%` }}
                  role="meter"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${opt}: ${pct}%`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Top 5 */}
      {leaderboard.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-medium text-muted">Top 5</p>
          <ol className="mt-2 space-y-2">
            {leaderboard.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-surface px-4 py-2"
              >
                <span className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-bold text-muted">
                    {p.rank}
                  </span>
                  <span className="font-medium text-text">{p.nickname}</span>
                </span>
                <span className="tabular-nums text-sm font-semibold text-accent">
                  {formatScore(p.score)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <Button onClick={() => nextPhase(pin)}>Next</Button>
      </div>
    </main>
  );
}
