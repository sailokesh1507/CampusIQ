import { PostgresDatabase } from '../src/db/postgres.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

process.env.POSTGRES_SEED_DEMO = 'true';
const database = new PostgresDatabase(databaseUrl);
await database.ready;
const count = await database.pool.query('SELECT COUNT(*)::int AS count FROM students WHERE institution_id=$1', ['00000000-0000-0000-0000-000000000001']);
console.log(`Postgres synthetic demo ready students=${count.rows[0].count}`);
await database.close();
