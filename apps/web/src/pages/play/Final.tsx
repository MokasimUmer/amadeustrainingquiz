import { usePlayerStore, resetPlayer } from '../../store/playerStore';
import { useNavigate } from 'react-router-dom';
import { ScoreCounter } from '../../components/ScoreCounter';
import { Button } from '../../components/Button';
import { ordinal } from '../../lib/format';

export function Final() {
  const finalRank = usePlayerStore((s) => s.finalRank);
  const navigate = useNavigate();

  const isTopThree = finalRank && finalRank.rank <= 3;

  function handleLeave() {
    resetPlayer();
    navigate('/');
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      {isTopThree && (
        <p className="text-5xl" aria-label="Top three finish" role="img">
          {finalRank.rank === 1 ? '🥇' : finalRank.rank === 2 ? '🥈' : '🥉'}
        </p>
      )}

      <div>
        <p className="text-sm text-muted">Your final rank</p>
        <p className="font-display text-6xl font-bold text-accent">
          {finalRank ? ordinal(finalRank.rank) : '—'}
        </p>
      </div>

      {finalRank && (
        <div>
          <p className="text-sm text-muted">Score</p>
          <ScoreCounter
            from={0}
            to={finalRank.score}
            durationMs={1200}
            className="font-display text-4xl font-semibold text-text"
          />
        </div>
      )}

      {isTopThree && (
        <p className="text-base text-accent" aria-live="polite">
          Amazing — you&rsquo;re on the podium!
        </p>
      )}

      <Button variant="ghost" onClick={handleLeave} className="mt-4">
        Leave
      </Button>
    </main>
  );
}
