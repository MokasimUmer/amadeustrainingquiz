/**
 * Post-question leaderboard.
 *
 * Shows up to 10 players with rank, nickname, score, and a delta indicator
 * (+N pts this question). Rank changes animate via CSS transitions on the
 * list position.
 */
import { useHostStore, nextPhase } from '../../store/hostStore';
import { Button } from '../../components/Button';
import { ScoreCounter } from '../../components/ScoreCounter';
import { formatScore } from '../../lib/format';

interface Props {
  pin: string;
}

export function HostLeaderboard({ pin }: Props) {
  const leaderboard = useHostStore((s) => s.leaderboard);
  const qi = useHostStore((s) => s.questionIndex);
  const totalQ = useHostStore((s) => s.totalQuestions);
  const isLast = qi + 1 >= totalQ;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <p className="text-sm text-muted">
        After question {qi + 1} of {totalQ}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-text">Leaderboard</p>

      <ol className="mt-6 space-y-2">
        {leaderboard.slice(0, 10).map((p, i) => (
          <li
            key={p.id}
            className="flex items-center gap-4 rounded-arena bg-surface px-5 py-3"
            style={{
              /* Stagger the entrance so each row slides in sequentially */
              animationDelay: `${i * 60}ms`,
            }}
          >
            {/* Rank */}
            <span
              className={`w-7 text-center font-display text-lg font-bold tabular-nums ${
                p.rank === 1 ? 'text-accent' : 'text-muted'
              }`}
            >
              {p.rank}
            </span>

            {/* Nickname */}
            <span className="flex-1 truncate font-medium text-text">{p.nickname}</span>

            {/* Delta */}
            {p.delta > 0 && (
              <span className="text-xs font-medium text-ok">+{formatScore(p.delta)}</span>
            )}

            {/* Score */}
            <ScoreCounter
              from={p.score - p.delta}
              to={p.score}
              durationMs={600}
              className="font-display text-lg font-semibold text-text"
            />
          </li>
        ))}
      </ol>

      <div className="mt-8 flex justify-end">
        <Button onClick={() => nextPhase(pin)}>
          {isLast ? 'Show podium' : 'Next question'}
        </Button>
      </div>
    </main>
  );
}
