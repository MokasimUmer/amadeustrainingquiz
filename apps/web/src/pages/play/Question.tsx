import { useEffect } from 'react';
import { usePlayerStore, submitAnswer } from '../../store/playerStore';
import { TimerRing } from '../../components/TimerRing';
import { AnswerTile } from '../../components/AnswerTile';

// Option labels shown when the question text is hidden (Kahoot-style phones)
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

export function Question() {
  const question = usePlayerStore((s) => s.question);
  const answerState = usePlayerStore((s) => s.answerState);
  const chosenIndex = usePlayerStore((s) => s.chosenIndex);
  const pin = usePlayerStore((s) => s.pin);

  // Keep screen awake during question
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock
      .request('screen')
      .then((l) => { lock = l; })
      .catch(() => { /* ignore */ });
    return () => { void lock?.release(); };
  }, []);

  if (!question) return null;

  const optionCount = question.optionCount;

  // Derive per-tile state from the top-level answer state
  function tileState(i: number): 'default' | 'chosen' | 'dimmed' | 'disabled' {
    if (answerState === 'idle') return 'default';
    if (answerState === 'locked' || answerState === 'correct' || answerState === 'wrong') {
      if (i === chosenIndex) return 'chosen';
      return 'dimmed';
    }
    return 'default';
  }

  function handleChoice(index: number) {
    if (answerState !== 'idle') return;
    submitAnswer(pin, question!.questionId, index);
  }

  // Calculate total seconds for the ring from endsAt − serverTime
  const totalMs = question.endsAt - question.serverTime;
  const totalSec = Math.round(totalMs / 1000);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <TimerRing
          endsAt={question.endsAt}
          serverTime={question.serverTime}
          totalSec={totalSec}
        />

        {question.text && (
          <p className="ml-4 flex-1 text-sm font-medium leading-snug text-text line-clamp-3">
            {question.text}
          </p>
        )}
      </div>

      {/* Answer tiles */}
      <div className="mt-6 flex flex-1 flex-col gap-3">
        {Array.from({ length: optionCount }, (_, i) => (
          <AnswerTile
            key={i}
            index={i as 0 | 1 | 2 | 3}
            label={OPTION_LETTERS[i] ?? String(i + 1)}
            state={tileState(i)}
            onClick={() => handleChoice(i)}
          />
        ))}
      </div>

      {/* Waiting message after answer locked */}
      {answerState !== 'idle' && (
        <p
          className="mt-6 text-center text-sm text-muted"
          role="status"
          aria-live="polite"
        >
          Answer locked in&nbsp;&mdash; waiting for others…
        </p>
      )}
    </main>
  );
}
