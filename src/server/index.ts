import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const app = createApp({
  databasePath: process.env.DATABASE_PATH ?? './data/campusiq.db',
  staticPath: isProduction ? path.resolve(__dirname, '../../dist-client') : undefined,
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`CampusIQ API listening on http://localhost:${port}`);
});
