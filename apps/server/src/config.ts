import { defaultGameSettings } from '@amadeus/shared';

const parsedMax = Number(process.env.MAX_PLAYERS ?? defaultGameSettings.maxPlayers);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  dbPath: process.env.DB_PATH ?? 'data/quizzes.db',
  maxPlayers: Number.isFinite(parsedMax) ? parsedMax : defaultGameSettings.maxPlayers,
};

export const isDev = config.nodeEnv !== 'production';
