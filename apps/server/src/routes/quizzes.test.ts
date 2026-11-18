/**
 * Tests for the quiz REST API.
 * Uses an in-memory sql.js database per test suite (no file I/O).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { openDb, closeDb } from '../db.js';
import { createQuizRouter } from './quizzes.js';
import { adminAuth } from './middleware.js';

// ---------------------------------------------------------------------------
// Minimal HTTP client helpers (native fetch, Node 20+)
// ---------------------------------------------------------------------------

let baseUrl: string;

async function req(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

const get = (path: string, token?: string) => req('GET', path, undefined, token);
const post = (path: string, body: unknown, token?: string) => req('POST', path, body, token);
const put = (path: string, body: unknown, token?: string) => req('PUT', path, body, token);
const del = (path: string, token?: string) => req('DELETE', path, undefined, token);

// ---------------------------------------------------------------------------
// Test quiz fixture
// ---------------------------------------------------------------------------

const QUIZ_BODY = {
  title: 'Test Quiz',
  questions: [
    {
      text: 'What is 1+1?',
      options: ['1', '2', '3'],
      correct: [1],
      timeLimitSec: 20,
      basePoints: 1000,
    },
  ],
};

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

let app: Express;
let server: Server;

beforeAll(async () => {
  const db = await openDb(); // in-memory
  app = express();
  app.use(express.json());
  app.use('/api/quizzes', adminAuth, createQuizRouter(db));

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(
  () =>
    new Promise<void>((resolve) => {
      closeDb();
      server.close(() => resolve());
    }),
);

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

describe('POST /api/quizzes', () => {
  it('creates a quiz and returns 201', async () => {
    const { status, body } = await post('/api/quizzes', QUIZ_BODY);
    expect(status).toBe(201);
    const q = body as { id: string; title: string };
    expect(q.id).toBeTruthy();
    expect(q.title).toBe('Test Quiz');
  });

  it('returns 400 for a missing title', async () => {
    const { status } = await post('/api/quizzes', { questions: QUIZ_BODY.questions });
    expect(status).toBe(400);
  });

  it('returns 400 for empty questions array', async () => {
    const { status } = await post('/api/quizzes', { title: 'T', questions: [] });
    expect(status).toBe(400);
  });

  it('returns 400 for a question with 1 option', async () => {
    const { status } = await post('/api/quizzes', {
      title: 'T',
      questions: [{ text: 'Q', options: ['A'], correct: [0], timeLimitSec: 20, basePoints: 1000 }],
    });
    expect(status).toBe(400);
  });

  it('assigns a UUID id', async () => {
    const { body } = await post('/api/quizzes', QUIZ_BODY);
    expect((body as { id: string }).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('assigns UUIDs to questions that lack an id', async () => {
    const { body } = await post('/api/quizzes', QUIZ_BODY);
    const q = body as { questions: Array<{ id: string }> };
    expect(q.questions[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('GET /api/quizzes', () => {
  it('returns an array', async () => {
    const { status, body } = await get('/api/quizzes');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('includes previously created quizzes', async () => {
    await post('/api/quizzes', { ...QUIZ_BODY, title: 'List Test' });
    const { body } = await get('/api/quizzes');
    const quizzes = body as Array<{ title: string }>;
    expect(quizzes.some((q) => q.title === 'List Test')).toBe(true);
  });
});

describe('GET /api/quizzes/:id', () => {
  it('returns the quiz by id', async () => {
    const { body: created } = await post('/api/quizzes', QUIZ_BODY);
    const id = (created as { id: string }).id;
    const { status, body } = await get(`/api/quizzes/${id}`);
    expect(status).toBe(200);
    expect((body as { id: string }).id).toBe(id);
  });

  it('returns 404 for unknown id', async () => {
    const { status } = await get('/api/quizzes/no-such-id');
    expect(status).toBe(404);
  });
});

describe('PUT /api/quizzes/:id', () => {
  it('updates title and questions', async () => {
    const { body: created } = await post('/api/quizzes', QUIZ_BODY);
    const id = (created as { id: string }).id;

    const updated = { ...QUIZ_BODY, title: 'Updated Title' };
    const { status, body } = await put(`/api/quizzes/${id}`, updated);
    expect(status).toBe(200);
    expect((body as { title: string }).title).toBe('Updated Title');
  });

  it('preserves the original createdAt', async () => {
    const { body: created } = await post('/api/quizzes', QUIZ_BODY);
    const id = (created as { id: string; createdAt: number }).id;
    const originalCreatedAt = (created as { createdAt: number }).createdAt;

    const { body: updated } = await put(`/api/quizzes/${id}`, {
      ...QUIZ_BODY,
      title: 'New',
    });
    expect((updated as { createdAt: number }).createdAt).toBe(originalCreatedAt);
  });

  it('updates updatedAt', async () => {
    const { body: created } = await post('/api/quizzes', QUIZ_BODY);
    const id = (created as { id: string }).id;
    const originalUpdatedAt = (created as { updatedAt: number }).updatedAt;

    // Small delay to ensure updatedAt changes
    await new Promise((r) => setTimeout(r, 5));
    const { body: updated } = await put(`/api/quizzes/${id}`, {
      ...QUIZ_BODY,
      title: 'T2',
    });
    expect((updated as { updatedAt: number }).updatedAt).toBeGreaterThanOrEqual(
      originalUpdatedAt,
    );
  });

  it('returns 404 for unknown id', async () => {
    const { status } = await put('/api/quizzes/no-such-id', QUIZ_BODY);
    expect(status).toBe(404);
  });
});

describe('DELETE /api/quizzes/:id', () => {
  it('deletes the quiz and returns 204', async () => {
    const { body: created } = await post('/api/quizzes', QUIZ_BODY);
    const id = (created as { id: string }).id;

    const { status } = await del(`/api/quizzes/${id}`);
    expect(status).toBe(204);

    const { status: status2 } = await get(`/api/quizzes/${id}`);
    expect(status2).toBe(404);
  });

  it('returns 404 when deleting unknown id', async () => {
    const { status } = await del('/api/quizzes/no-such-id');
    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

describe('POST /api/quizzes/import', () => {
  it('imports a single quiz object', async () => {
    const toImport = { ...QUIZ_BODY, title: 'Imported', id: 'import-1' };
    const { status, body } = await post('/api/quizzes/import', toImport);
    expect(status).toBe(201);
    const list = body as Array<{ id: string; title: string }>;
    expect(list[0]?.title).toBe('Imported');
  });

  it('imports an array of quizzes', async () => {
    const arr = [
      { ...QUIZ_BODY, title: 'Arr1', id: 'arr-1' },
      { ...QUIZ_BODY, title: 'Arr2', id: 'arr-2' },
    ];
    const { status, body } = await post('/api/quizzes/import', arr);
    expect(status).toBe(201);
    expect((body as unknown[]).length).toBe(2);
  });

  it('upserts on conflict (re-import same id)', async () => {
    const toImport = { ...QUIZ_BODY, title: 'First', id: 'upsert-test' };
    await post('/api/quizzes/import', toImport);
    await post('/api/quizzes/import', { ...toImport, title: 'Second' });

    const { body } = await get('/api/quizzes/upsert-test');
    expect((body as { title: string }).title).toBe('Second');
  });

  it('returns 400 for invalid quiz body', async () => {
    const { status } = await post('/api/quizzes/import', { title: 'Bad' }); // no questions
    expect(status).toBe(400);
  });
});

describe('GET /api/quizzes/:id/export', () => {
  it('returns the quiz as a JSON file download', async () => {
    const { body: created } = await post('/api/quizzes', QUIZ_BODY);
    const id = (created as { id: string }).id;

    const res = await fetch(`${baseUrl}/api/quizzes/${id}/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const json = (await res.json()) as { id: string };
    expect(json.id).toBe(id);
  });

  it('returns 404 for unknown id', async () => {
    const { status } = await get('/api/quizzes/unknown-id/export');
    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Admin auth middleware
// ---------------------------------------------------------------------------

describe('adminAuth middleware', () => {
  let protectedApp: Express;
  let protectedServer: Server;
  let protectedUrl: string;

  beforeAll(async () => {
    // We test adminAuth in isolation by mounting a tiny route that uses it.
    // adminAuth reads config.adminPassword at call-time, so we patch it here.
    const configMod = await import('../config.js');
    const originalPw = configMod.config.adminPassword;
    // Force a non-empty password so the middleware activates
    (configMod.config as Record<string, unknown>)['adminPassword'] = 'secret123';

    const db = await openDb();
    protectedApp = express();
    protectedApp.use(express.json());
    protectedApp.use('/api/quizzes', adminAuth, createQuizRouter(db));

    protectedServer = createServer(protectedApp);
    await new Promise<void>((r) =>
      protectedServer.listen(0, '127.0.0.1', () => {
        const addr = protectedServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        protectedUrl = `http://127.0.0.1:${port}`;
        r();
      }),
    );

    // Restore after suite
    return () => {
      (configMod.config as Record<string, unknown>)['adminPassword'] = originalPw;
      return new Promise<void>((resolve) => protectedServer.close(() => resolve()));
    };
  });

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        protectedServer.close(() => resolve());
      }),
  );

  it('returns 401 without a token', async () => {
    const res = await fetch(`${protectedUrl}/api/quizzes`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with a wrong token', async () => {
    const res = await fetch(`${protectedUrl}/api/quizzes`, {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with the correct token', async () => {
    const res = await fetch(`${protectedUrl}/api/quizzes`, {
      headers: { Authorization: 'Bearer secret123' },
    });
    expect(res.status).toBe(200);
  });
});
