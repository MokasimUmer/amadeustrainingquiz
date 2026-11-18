import { useHostStore, skipQuestion } from '../../store/hostStore';
import { TimerRing } from '../../components/TimerRing';
import { Button } from '../../components/Button';

const GLYPHS = ['▲', '◆', '●', '■'];
const COLORS = ['text-opt-a', 'text-opt-b', 'text-opt-c', 'text-opt-d'];

interface Props {
  pin: string;
}

export function HostQuestion({ pin }: Props) {
  const question = useHostStore((s) => s.question);
  const answered = useHostStore((s) => s.answeredCount);
  const total = useHostStore((s) => s.totalPlayers);
  const qi = useHostStore((s) => s.questionIndex);
  const totalQ = useHostStore((s) => s.totalQuestions);

  if (!question) return null;

  const totalSec = Math.round((question.endsAt - question.serverTime) / 1000);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      {/* Top bar */}
      <div className="flex items-center gap-6">
        <TimerRing
          endsAt={question.endsAt}
          serverTime={question.serverTime}
          totalSec={totalSec}
        />
        <div className="flex-1">
          <p className="text-xs text-muted">
            Question {qi + 1} of {totalQ}
          </p>
          <p className="mt-1 text-xl font-semibold text-text">{question.text}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-bold tabular-nums text-brand">
            {answered}
            <span className="text-lg text-muted">/{total}</span>
          </p>
          <p className="text-xs text-muted">answered</p>
        </div>
      </div>

      {/* Options preview */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        {question.options.map((opt, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-arena bg-surface px-4 py-3"
          >
            <span className={`text-xl ${COLORS[i] ?? ''}`} aria-hidden="true">
              {GLYPHS[i]}
            </span>
            <span className="text-sm font-medium text-text">{opt}</span>
          </div>
        ))}
      </div>

      {/* Skip */}
      <div className="mt-8 flex justify-end">
        <Button variant="ghost" onClick={() => skipQuestion(pin)}>
          Skip question
        </Button>
      </div>
    </main>
  );
}
