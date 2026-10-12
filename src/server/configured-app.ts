import type { Express } from 'express';
import { createApp } from './app.js';
import { createPostgresApp } from './postgres-app.js';

interface ConfiguredAppOptions { databasePath: string; databaseUrl?: string; staticPath?: string; }

export function createConfiguredApp(options: ConfiguredAppOptions): Express {
  const driver = (process.env.DATABASE_DRIVER ?? 'sqlite').toLowerCase();
  if (driver === 'postgres') {
    const databaseUrl = options.databaseUrl?.trim();
    if (!databaseUrl) throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres.');
    return createPostgresApp({ databaseUrl, staticPath: options.staticPath });
  }
  if (driver !== 'sqlite') throw new Error(`Unsupported DATABASE_DRIVER: ${driver}`);
  return createApp({ databasePath: options.databasePath, staticPath: options.staticPath });
}
