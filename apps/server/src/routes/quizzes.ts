import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db.js';
import { persistDb } from '../db.js';
import type { Quiz, Question } from '@amadeus/shared';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const answerIndexSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const questionSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(100)).min(2).max(4),
  correct: z.array(answerIndexSchema).min(1),
  timeLimitSec: z.number().int().min(5).max(120).default(20),
  basePoints: z.number().int().min(1).default(1000),
});

const quizBodySchema = z.object({
  title: z.string().min(1).max(200),
  questions: z.array(questionSchema).min(1).max(50),
});

// ---------------------------------------------------------------------------
// Repository helpers (synchronous sql.js operations)
// ---------------------------------------------------------------------------

interface QuizRow {
  id: string;
  title: string;
  json: string;
  created_at: number;
  updated_at: number;
}

function rowToQuiz(row: QuizRow): Quiz {
  return JSON.parse(row.json) as Quiz;
}

function queryAll(db: Database, sql: string, params: unknown[] = []): QuizRow[] {
  const result = db.exec(sql, params as (string | number | null | Uint8Array)[]);
  if (!result[0]) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    (columns as string[]).forEach((col: string, i: number) => {
      obj[col] = row[i];
    });
    return obj as unknown as QuizRow;
  });
}

function queryOne(db: Database, sql: string, params: unknown[] = []): QuizRow | undefined {
  return queryAll(db, sql, params)[0];
}

// ---------------------------------------------------------------------------
// Router factory — receives the already-opened db instance
// ---------------------------------------------------------------------------

export function createQuizRouter(db: Database): Router {
  const router = Router();

  // ---- GET /api/quizzes ----
  router.get('/', (_req, res) => {
    const rows = queryAll(db, 'SELECT id, title, created_at, updated_at, json FROM quizzes ORDER BY created_at DESC');
    const quizzes = rows.map(rowToQuiz);
    res.json(quizzes);
  });

  // ---- GET /api/quizzes/:id ----
  router.get('/:id', (req, res) => {
    const row = queryOne(db, 'SELECT json FROM quizzes WHERE id = ?', [req.params['id']]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(rowToQuiz(row));
  });

  // ---- POST /api/quizzes ----
  router.post('/', (req, res) => {
    const parsed = quizBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const now = Date.now();
    const quiz: Quiz = {
      id: randomUUID(),
      title: parsed.data.title,
      questions: parsed.data.questions.map((q) => ({
        id: q.id ?? randomUUID(),
        text: q.text,
        options: q.options,
        correct: q.correct as Question['correct'],
        timeLimitSec: q.timeLimitSec,
        basePoints: q.basePoints,
      })),
      createdAt: now,
      updatedAt: now,
    };

    db.run(
      'INSERT INTO quizzes (id, title, json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [quiz.id, quiz.title, JSON.stringify(quiz), now, now],
    );
    persistDb();
    return res.status(201).json(quiz);
  });

  // ---- PUT /api/quizzes/:id ----
  router.put('/:id', (req, res) => {
    const id = req.params['id'];
    const existing = queryOne(db, 'SELECT json FROM quizzes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const parsed = quizBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const prev = rowToQuiz(existing);
    const now = Date.now();
    const updated: Quiz = {
      ...prev,
      title: parsed.data.title,
      questions: parsed.data.questions.map((q) => ({
        id: q.id ?? randomUUID(),
        text: q.text,
        options: q.options,
        correct: q.correct as Question['correct'],
        timeLimitSec: q.timeLimitSec,
        basePoints: q.basePoints,
      })),
      updatedAt: now,
    };

    db.run(
      'UPDATE quizzes SET title = ?, json = ?, updated_at = ? WHERE id = ?',
      [updated.title, JSON.stringify(updated), now, id],
    );
    persistDb();
    return res.json(updated);
  });

  // ---- DELETE /api/quizzes/:id ----
  router.delete('/:id', (req, res) => {
    const id = req.params['id'];
    const existing = queryOne(db, 'SELECT id FROM quizzes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.run('DELETE FROM quizzes WHERE id = ?', [id]);
    persistDb();
    return res.status(204).send();
  });

  // ---- POST /api/quizzes/import ----
  router.post('/import', (req, res) => {
    // Accept a full Quiz object (or array) and upsert
    const body = req.body as unknown;
    const quizzesToImport: unknown[] = Array.isArray(body) ? body : [body];

    const imported: Quiz[] = [];
    for (const raw of quizzesToImport) {
      const parsed = quizBodySchema.safeParse(raw);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const now = Date.now();
      // Use provided id if present and valid, else generate
      const rawId = typeof (raw as Record<string, unknown>)['id'] === 'string'
        ? (raw as Record<string, unknown>)['id'] as string
        : randomUUID();

      const quiz: Quiz = {
        id: rawId,
        title: parsed.data.title,
        questions: parsed.data.questions.map((q) => ({
          id: q.id ?? randomUUID(),
          text: q.text,
          options: q.options,
          correct: q.correct as Question['correct'],
          timeLimitSec: q.timeLimitSec,
          basePoints: q.basePoints,
        })),
        createdAt: now,
        updatedAt: now,
      };

      db.run(
        `INSERT INTO quizzes (id, title, json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, json=excluded.json, updated_at=excluded.updated_at`,
        [quiz.id, quiz.title, JSON.stringify(quiz), now, now],
      );
      imported.push(quiz);
    }
    persistDb();
    return res.status(201).json(imported);
  });

  // ---- GET /api/quizzes/:id/export ----
  router.get('/:id/export', (req, res) => {
    const row = queryOne(db, 'SELECT json FROM quizzes WHERE id = ?', [req.params['id']]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const quiz = rowToQuiz(row);
    res
      .header('Content-Disposition', `attachment; filename="quiz-${quiz.id}.json"`)
      .header('Content-Type', 'application/json')
      .send(JSON.stringify(quiz, null, 2));
  });

  return router;
}
