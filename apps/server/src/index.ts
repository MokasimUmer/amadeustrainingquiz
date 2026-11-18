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

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

if (isDev) {
  app.use(cors({ origin: 'http://localhost:5173' }));
}

export const gameManager = new GameManager();

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    games: gameManager.getAll().length,
    players: gameManager.totalPlayers(),
  });
});

const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: isDev ? { origin: 'http://localhost:5173' } : { origin: false },
  pingTimeout: 20_000,
  pingInterval: 10_000,
});

// ---------------------------------------------------------------------------
// DB + quiz routes
// ---------------------------------------------------------------------------

let _dbReady = false;
const _quizStoreFallback = new Map<string, Quiz>();

export function registerQuiz(quiz: Quiz): void {
  _quizStoreFallback.set(quiz.id, quiz);
}

export async function initDb(dbPath = config.dbPath): Promise<void> {
  console.log(`[db] opening database at: ${dbPath}`);
  try {
    const db = await openDb(dbPath);
    console.log(`[db] database opened successfully`);
    const quizRouter = createQuizRouter(db);
    // API routes must be mounted BEFORE the static file catch-all
    app.use('/api/quizzes', adminAuth, quizRouter);
    _dbReady = true;
    console.log(`[db] quiz routes mounted`);

    _loadQuizFromDb = (id: string) => {
      const result = db.exec('SELECT json FROM quizzes WHERE id = ?', [id]);
      const row = result[0];
      if (!row) return undefined;
      const val = row.values[0];
      if (!val) return undefined;
      return JSON.parse(val[0] as string) as Quiz;
    };
  } catch (err) {
    console.error(`[db] FAILED to open database:`, err);
    throw err;
  }
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

setInterval(pruneJoinRecords, 60_000);

// ---------------------------------------------------------------------------
// Start — DB first, then static files, then listen
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== 'test') {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDist = join(__dirname, '..', '..', '..', 'apps', 'web', 'dist');

  initDb()
    .then(() => {
      // Static files and catch-all mounted AFTER API routes
      if (!isDev && existsSync(webDist)) {
        app.use(express.static(webDist));
        app.get('*', (_req, res) => {
          res.sendFile(join(webDist, 'index.html'));
        });
      }
      httpServer.listen(config.port, () => {
        console.log(`Amadeus Apex Arena listening on port ${config.port}`);
      });
    })
    .catch((err: unknown) => {
      console.error('Failed to initialise database, exiting:', err);
      process.exit(1);
    });
}

export { httpServer, app, _dbReady };
