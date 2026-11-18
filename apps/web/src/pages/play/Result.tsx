import { usePlayerStore } from '../../store/playerStore';
import { ScoreCounter } from '../../components/ScoreCounter';
import { ordinal } from '../../lib/format';

export function Result() {
  const result = usePlayerStore((s) => s.result);

  // Show a neutral waiting screen while the reveal is in progress but no
  // per-player result has arrived yet (e.g. player didn't answer in time).
  if (!result) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg">
        <p className="text-muted">Waiting for results…</p>
      </main>
    );
  }

  const bg = result.correct ? 'bg-ok' : 'bg-bad';
  const headline = result.correct ? 'Correct!' : 'Wrong';

  return (
    <main
      className={`${bg} flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center text-bg`}
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Outcome headline */}
      <p className="font-display text-5xl font-bold tracking-tight">{headline}</p>

      {/* Points earned */}
      {result.correct && result.pointsEarned > 0 && (
        <div>
          <ScoreCounter
            from={0}
            to={result.pointsEarned}
            className="font-display text-4xl font-semibold"
          />
          <p className="mt-1 text-sm font-medium opacity-80">points</p>
        </div>
      )}

      {/* Rank */}
      <div>
        <p className="font-display text-6xl font-bold">
          {ordinal(result.rank)}
        </p>
        <p className="text-sm font-medium opacity-80">place</p>
      </div>

      {/* Streak */}
      {result.streak >= 2 && (
        <p className="text-lg font-semibold">
          🔥 {result.streak}-answer streak
        </p>
      )}

      {/* Gap to player above */}
      {result.behind && (
        <p className="text-sm opacity-80">
          <strong className="font-semibold">{result.behind.gap}</strong> pts behind{' '}
          <strong className="font-semibold">{result.behind.nickname}</strong>
        </p>
      )}

      {/* Total score */}
      <p className="text-sm opacity-70">
        Total:{' '}
        <ScoreCounter
          from={result.score - result.pointsEarned}
          to={result.score}
          className="font-semibold"
        />
      </p>
    </main>
  );
}
