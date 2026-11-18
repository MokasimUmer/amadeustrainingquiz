import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { config, isDev } from './config.js';
import { GameManager } from './game/GameManager.js';
import { registerHostHandlers } from './sockets/hostHandlers.js';
import { registerPlayerHandlers } from './sockets/playerHandlers.js';
import { pruneJoinRecords } from './sockets/middleware.js';
import { openDb } from './db.js';
import { createQuizRouter } from './routes/quizzes.js';
import { adminAuth } from './routes/middleware.js';
import type { Quiz } from '@amadeus/shared';

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

if (isDev) {
  app.use(cors({ origin: 'http://localhost:5173' }));
}

// ---------------------------------------------------------------------------
// Game manager (singleton for this process)
// ---------------------------------------------------------------------------

export const gameManager = new GameManager();

// ---------------------------------------------------------------------------
// Health endpoint (before DB is ready, so it stays synchronous)
// ---------------------------------------------------------------------------

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    games: gameManager.getAll().length,
    players: gameManager.totalPlayers(),
  });
});

// ---------------------------------------------------------------------------
// HTTP + Socket.IO
// ---------------------------------------------------------------------------

const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: isDev ? { origin: 'http://localhost:5173' } : { origin: false },
  pingTimeout: 20_000,
  pingInterval: 10_000,
});

// ---------------------------------------------------------------------------
// DB + quiz routes (async init, mounted before sockets connect in practice)
// ---------------------------------------------------------------------------

let _dbReady = false;
const _quizStoreFallback = new Map<string, Quiz>();

/** Fallback for integration tests that don't go through the HTTP layer. */
export function registerQuiz(quiz: Quiz): void {
  _quizStoreFallback.set(quiz.id, quiz);
}

export async function initDb(dbPath = config.dbPath): Promise<void> {
  const db = await openDb(dbPath);
  const quizRouter = createQuizRouter(db);
  app.use('/api/quizzes', adminAuth, quizRouter);
  _dbReady = true;

  // After DB is ready, teach the socket layer to load quizzes from DB
  _loadQuizFromDb = (id: string) => {
    const result = db.exec('SELECT json FROM quizzes WHERE id = ?', [id]);
    const row = result[0];
    if (!row) return undefined;
    const val = row.values[0];
    if (!val) return undefined;
    return JSON.parse(val[0] as string) as Quiz;
  };
}

let _loadQuizFromDb: ((id: string) => Quiz | undefined) | null = null;

function loadQuiz(quizId: string): Quiz | undefined {
  if (_loadQuizFromDb) return _loadQuizFromDb(quizId);
  return _quizStoreFallback.get(quizId);
}

// ---------------------------------------------------------------------------
// Socket connections
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  registerHostHandlers(io, socket, gameManager, loadQuiz);
  registerPlayerHandlers(io, socket, gameManager);

  socket.on('disconnect', () => {
    socket.removeAllListeners();
  });

  socket.on('time:ping', (clientTime: number, ack: (t: number) => void) => {
    if (typeof ack === 'function') ack(Date.now());
    else socket.emit('time:pong', { clientTime, serverTime: Date.now() });
  });
});

// Prune stale join rate-limit records every minute
setInterval(pruneJoinRecords, 60_000);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// In production serve the compiled React app as static files
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, '..', '..', '..', 'apps', 'web', 'dist');
if (!isDev && existsSync(webDist)) {
  app.use(express.static(webDist));
  // Fall back to index.html for client-side routes
  app.get('*', (_req, res) => {
    res.sendFile(join(webDist, 'index.html'));
  });
}

if (process.env.NODE_ENV !== 'test') {
  void initDb().then(() => {
    httpServer.listen(config.port, () => {
      console.log(`Amadeus Apex Arena server listening on port ${config.port}`);
    });
  });
}

export { httpServer, app, _dbReady };
