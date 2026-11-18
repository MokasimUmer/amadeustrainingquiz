import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { BrandLockup } from '../../components/BrandLockup';
import { useHostStore, clearAuth } from '../../store/hostStore';
import { listQuizzes, deleteQuiz } from '../../lib/api';
import type { Quiz } from '@amadeus/shared';

export function Dashboard() {
  const password = useHostStore((s) => s.password);
  const navigate = useNavigate();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listQuizzes(password)
      .then(setQuizzes)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('401')) {
          // Wrong password — drop back to auth gate
          clearAuth();
        } else {
          // Show the raw error so we can diagnose it
          setError(msg);
        }
      })
      .finally(() => setLoading(false));
  }, [password]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this quiz?')) return;
    await deleteQuiz(id, password);
    setQuizzes((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-start justify-between">
        <BrandLockup />
        <button
          onClick={clearAuth}
          className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
        >
          Sign out
        </button>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button onClick={() => navigate('/host/quiz/new')}>New quiz</Button>
      </div>

      {loading && <p className="mt-10 text-muted">Loading…</p>}

      {error && (
        <div className="mt-10 rounded-arena bg-surface p-4">
          <p className="text-sm font-semibold text-bad">Failed to load quizzes</p>
          <p className="mt-1 font-mono text-xs text-muted break-all">{error}</p>
          <button
            onClick={() => { setError(''); setLoading(true); listQuizzes(password).then(setQuizzes).catch((e: unknown) => setError(String(e))).finally(() => setLoading(false)); }}
            className="mt-3 text-sm text-brand underline-offset-4 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && quizzes.length === 0 && (
        <p className="mt-10 text-muted">No quizzes yet. Create one to get started.</p>
      )}

      <ul className="mt-6 space-y-3">
        {quizzes.map((quiz) => (
          <li
            key={quiz.id}
            className="flex items-center justify-between gap-4 rounded-arena bg-surface px-5 py-4"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-text">{quiz.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => navigate(`/host/quiz/${quiz.id}`)}
                className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-text hover:opacity-80"
              >
                Edit
              </button>
              <button
                onClick={() => navigate(`/host/game/${quiz.id}`)}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-bg hover:opacity-80"
              >
                Start
              </button>
              <button
                onClick={() => handleDelete(quiz.id)}
                className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-bad hover:opacity-80"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
