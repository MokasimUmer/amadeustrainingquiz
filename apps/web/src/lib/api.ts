/**
 * Thin REST client for the quiz CRUD API.
 * All functions throw on non-2xx responses.
 */
import type { Quiz } from '@amadeus/shared';

const BASE = '/api/quizzes';

function authHeaders(password: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${password}`,
  };
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function listQuizzes(password: string): Promise<Quiz[]> {
  return json(await fetch(BASE, { headers: authHeaders(password) }));
}

export async function getQuiz(id: string, password: string): Promise<Quiz> {
  return json(await fetch(`${BASE}/${id}`, { headers: authHeaders(password) }));
}

export async function createQuiz(
  body: Omit<Quiz, 'id' | 'createdAt' | 'updatedAt'>,
  password: string,
): Promise<Quiz> {
  return json(
    await fetch(BASE, {
      method: 'POST',
      headers: authHeaders(password),
      body: JSON.stringify(body),
    }),
  );
}

export async function updateQuiz(
  id: string,
  body: Omit<Quiz, 'id' | 'createdAt' | 'updatedAt'>,
  password: string,
): Promise<Quiz> {
  return json(
    await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: authHeaders(password),
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteQuiz(id: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(password),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function importQuiz(data: unknown, password: string): Promise<Quiz[]> {
  return json(
    await fetch(`${BASE}/import`, {
      method: 'POST',
      headers: authHeaders(password),
      body: JSON.stringify(data),
    }),
  );
}

export function exportUrl(id: string): string {
  return `${BASE}/${id}/export`;
}
