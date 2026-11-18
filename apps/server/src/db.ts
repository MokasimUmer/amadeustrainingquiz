import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

export type { Database };

let _db: Database | null = null;
let _dbPath = ':memory:';

/**
 * Resolve the sql.js WASM file path explicitly so it works in Docker where
 * the default fetch-based loader cannot find the file.
 */
function getWasmPath(): string {
  const require = createRequire(import.meta.url);
  const sqlJsDir = dirname(require.resolve('sql.js'));
  return join(sqlJsDir, 'sql-wasm.wasm');
}

export async function openDb(filePath = ':memory:'): Promise<Database> {
  if (_db) return _db;

  _dbPath = filePath;

  const wasmPath = getWasmPath();
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  if (filePath !== ':memory:' && existsSync(filePath)) {
    const fileBuffer = readFileSync(filePath);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  _migrate(_db);
  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
  _dbPath = ':memory:';
}

export function persistDb(): void {
  if (!_db || _dbPath === ':memory:') return;
  const data = _db.export();
  const dir = dirname(_dbPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(_dbPath, Buffer.from(data));
}

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
