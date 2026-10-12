import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfiguredApp } from './configured-app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const app = createConfiguredApp({
  databasePath: process.env.DATABASE_PATH ?? './data/campusiq.db',
  databaseUrl: process.env.DATABASE_URL,
  staticPath: isProduction ? path.resolve(__dirname, '../../public') : undefined,
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`CampusIQ API listening on http://localhost:${port}`);
});
