import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfiguredApp } from './server/configured-app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runningOnVercel = Boolean(process.env.VERCEL);

const app = createConfiguredApp({
  databasePath: process.env.DATABASE_PATH ?? (runningOnVercel ? '/tmp/campusiq.db' : './data/campusiq.db'),
  databaseUrl: process.env.DATABASE_URL,
  staticPath: runningOnVercel ? undefined : path.resolve(__dirname, '../public'),
});

export default app;
