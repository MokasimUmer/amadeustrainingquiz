/**
 * SQLite database bootstrap via sql.js (pure WASM, no native build needed).
 *
 * The database is loaded from disk on startup (if the file exists) and
 * flushed back to disk after every write operation.  For v1 single-instance
 * deployments this is correct and simple; a Redis-backed approach would be
 * needed for multi-instance scaling.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

export type { Database };

let _db: Database | null = null;
let _dbPath = ':memory:';

/**
 * Initialises (or returns) the shared Database instance.
 * Call once at server startup; subsequent calls return the cached instance.
 */
export async function openDb(filePath = ':memory:'): Promise<Database> {
  if (_db) return _db;

  _dbPath = filePath;
  const SQL = await initSqlJs();

  if (filePath !== ':memory:' && existsSync(filePath)) {
    const fileBuffer = readFileSync(filePath);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  _migrate(_db);
  return _db;
}

/** Closes and destroys the current DB instance (useful for tests). */
export function closeDb(): void {
  _db?.close();
  _db = null;
  _dbPath = ':memory:';
}

/** Persists the in-memory database to the configured file path. */
export function persistDb(): void {
  if (!_db || _dbPath === ':memory:') return;
  const data = _db.export();
  const dir = dirname(_dbPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(_dbPath, Buffer.from(data));
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function _migrate(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id         TEXT    PRIMARY KEY,
      title      TEXT    NOT NULL,
      json       TEXT    NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}
