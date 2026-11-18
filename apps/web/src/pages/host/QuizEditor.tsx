/**
 * Quiz editor.
 *
 * Questions are reorderable via drag-and-drop (HTML5 drag API, no extra lib).
 * Autosaves 1 second after the last keystroke via a debounce.
 * Works for both creating a new quiz (/host/quiz/new) and editing an
 * existing one (/host/quiz/:id).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { BrandLockup } from '../../components/BrandLockup';
import { useHostStore } from '../../store/hostStore';
import { createQuiz, getQuiz, updateQuiz, exportUrl } from '../../lib/api';
import type { Question } from '@amadeus/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyQuestion(): Question {
  return {
    id: crypto.randomUUID(),
    text: '',
    options: ['', ''],
    correct: [0],
    timeLimitSec: 20,
    basePoints: 1000,
  };
}

const TIME_OPTIONS = [5, 10, 20, 30, 60, 90, 120];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuizEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const password = useHostStore((s) => s.password);
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : (id ?? null));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(!isNew);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragIndex = useRef<number | null>(null);

  // Load existing quiz
  useEffect(() => {
    if (isNew || !id) return;
    getQuiz(id, password)
      .then((quiz) => {
        setTitle(quiz.title);
        setQuestions(quiz.questions);
        setSavedId(quiz.id);
      })
      .catch(() => navigate('/host'))
      .finally(() => setLoading(false));
  }, [id, isNew, password, navigate]);

  // Autosave
  const save = useCallback(
    async (t: string, qs: Question[]) => {
      if (!t.trim() || qs.some((q) => !q.text.trim())) return;
      setStatus('saving');
      try {
        const body = { title: t, questions: qs };
        const quiz = savedId
          ? await updateQuiz(savedId, body, password)
          : await createQuiz(body, password);
        setSavedId(quiz.id);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    },
    [savedId, password],
  );

  function scheduleAutosave(t: string, qs: Question[]) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => void save(t, qs), 1000);
  }

  function updateTitle(v: string) {
    setTitle(v);
    setStatus('idle');
    scheduleAutosave(v, questions);
  }

  function updateQuestion(index: number, patch: Partial<Question>) {
    const next = questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
    setQuestions(next);
    setStatus('idle');
    scheduleAutosave(title, next);
  }

  function addQuestion() {
    const next = [...questions, emptyQuestion()];
    setQuestions(next);
    scheduleAutosave(title, next);
  }

  function removeQuestion(index: number) {
    if (questions.length === 1) return;
    const next = questions.filter((_, i) => i !== index);
    setQuestions(next);
    scheduleAutosave(title, next);
  }

  function addOption(qIndex: number) {
    const q = questions[qIndex];
    if (!q || q.options.length >= 4) return;
    updateQuestion(qIndex, { options: [...q.options, ''] });
  }

  function removeOption(qIndex: number, optIndex: number) {
    const q = questions[qIndex];
    if (!q || q.options.length <= 2) return;
    const opts = q.options.filter((_, i) => i !== optIndex);
    const correct = q.correct
      .map((c) => (c > optIndex ? (c - 1) as typeof c : c))
      .filter((c) => c < opts.length) as Question['correct'];
    updateQuestion(qIndex, {
      options: opts,
      correct: correct.length ? correct : [0],
    });
  }

  // Drag-to-reorder
  function onDragStart(index: number) {
    dragIndex.current = index;
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const next = [...questions];
    const [moved] = next.splice(dragIndex.current, 1);
    if (!moved) return;
    next.splice(index, 0, moved);
    dragIndex.current = index;
    setQuestions(next);
  }

  function onDragEnd() {
    dragIndex.current = null;
    scheduleAutosave(title, questions);
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-muted">Loading…</p>
      </main>
    );
  }

  const statusLabel = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed' }[status];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <BrandLockup />
        <div className="flex items-center gap-3">
          {statusLabel && (
            <span className={`text-sm ${status === 'error' ? 'text-bad' : 'text-muted'}`}>
              {statusLabel}
            </span>
          )}
          {savedId && (
            <a
              href={exportUrl(savedId)}
              download
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-text hover:opacity-80"
            >
              Export JSON
            </a>
          )}
          <button
            onClick={() => navigate('/host')}
            className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={(e) => updateTitle(e.target.value)}
        placeholder="Quiz title"
        maxLength={200}
        className="mt-8 w-full rounded-arena bg-surface px-5 py-3 font-display text-2xl font-semibold text-text ring-1 ring-white/10 placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {/* Questions */}
      <ol className="mt-6 space-y-6">
        {questions.map((q, qi) => (
          <li
            key={q.id}
            draggable
            onDragStart={() => onDragStart(qi)}
            onDragOver={(e) => onDragOver(e, qi)}
            onDragEnd={onDragEnd}
            className="rounded-arena bg-surface p-5 ring-1 ring-white/5"
          >
            {/* Question header */}
            <div className="flex items-center gap-3">
              <span
                className="cursor-grab text-muted select-none"
                aria-label="Drag to reorder"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <span className="text-sm font-medium text-muted">Q{qi + 1}</span>
              <div className="flex-1" />
              <button
                onClick={() => removeQuestion(qi)}
                disabled={questions.length === 1}
                className="text-sm text-bad disabled:opacity-30 hover:opacity-80"
                aria-label="Remove question"
              >
                Remove
              </button>
            </div>

            {/* Question text */}
            <textarea
              value={q.text}
              onChange={(e) => updateQuestion(qi, { text: e.target.value })}
              placeholder="Question text"
              maxLength={200}
              rows={2}
              className="mt-3 w-full resize-none rounded-lg bg-surface-2 px-4 py-3 text-sm text-text ring-1 ring-white/5 placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-brand"
            />

            {/* Options */}
            <div className="mt-3 space-y-2">
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    checked={q.correct.includes(oi as 0 | 1 | 2 | 3)}
                    onChange={() =>
                      updateQuestion(qi, { correct: [oi as 0 | 1 | 2 | 3] })
                    }
                    className="accent-brand"
                    aria-label={`Mark option ${oi + 1} as correct`}
                  />
                  <input
                    value={opt}
                    onChange={(e) => {
                      const opts = [...q.options];
                      opts[oi] = e.target.value;
                      updateQuestion(qi, { options: opts });
                    }}
                    placeholder={`Option ${oi + 1}`}
                    maxLength={100}
                    className="flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text ring-1 ring-white/5 placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <button
                    onClick={() => removeOption(qi, oi)}
                    disabled={q.options.length <= 2}
                    className="text-sm text-muted disabled:opacity-30 hover:text-bad"
                    aria-label="Remove option"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {q.options.length < 4 && (
              <button
                onClick={() => addOption(qi)}
                className="mt-2 text-sm text-brand hover:opacity-80"
              >
                + Add option
              </button>
            )}

            {/* Per-question settings */}
            <div className="mt-4 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-muted">
                Time
                <select
                  value={q.timeLimitSec}
                  onChange={(e) =>
                    updateQuestion(qi, { timeLimitSec: Number(e.target.value) })
                  }
                  className="rounded bg-surface-2 px-2 py-1 text-text"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}s
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                Points
                <input
                  type="number"
                  value={q.basePoints}
                  min={1}
                  max={9999}
                  onChange={(e) =>
                    updateQuestion(qi, { basePoints: Math.max(1, Number(e.target.value)) })
                  }
                  className="w-20 rounded bg-surface-2 px-2 py-1 text-text"
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <Button variant="ghost" onClick={addQuestion} className="mt-6">
        + Add question
      </Button>
    </main>
  );
}
