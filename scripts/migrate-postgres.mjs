import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Use a managed Postgres connection string; no files were changed.');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = await fs.readFile(path.join(root, 'src/db/postgres-schema.sql'), 'utf8');
const client = new pg.Client({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(schema);
  for (const table of ['institutions', 'users', 'sessions', 'departments', 'programmes', 'students', 'academic_metrics', 'attendance_metrics', 'subject_metrics', 'lms_metrics', 'engagement_metrics', 'placement_metrics', 'skills_metrics', 'feedback', 'score_snapshots', 'interventions', 'intervention_notes', 'import_batches', 'audit_logs']) {
    await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
  }
  await client.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT ''");
  await client.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS programme TEXT NOT NULL DEFAULT ''");
  await client.query("ALTER TABLE students ALTER COLUMN institution_id SET DEFAULT '00000000-0000-0000-0000-000000000001'");
  await client.query("ALTER TABLE interventions ALTER COLUMN institution_id SET DEFAULT '00000000-0000-0000-0000-000000000001'");
  await client.query("ALTER TABLE import_batches ALTER COLUMN institution_id SET DEFAULT '00000000-0000-0000-0000-000000000001'");
  await client.query("ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await client.query('COMMIT');
  console.log('CampusIQ Postgres schema applied successfully.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Postgres migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
