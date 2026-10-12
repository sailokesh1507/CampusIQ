import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name`, [[
    'institutions', 'users', 'sessions', 'departments', 'programmes', 'students', 'academic_metrics', 'attendance_metrics', 'subject_metrics',
    'lms_metrics', 'engagement_metrics', 'placement_metrics', 'skills_metrics', 'feedback', 'score_snapshots', 'interventions', 'intervention_notes',
    'import_batches', 'import_errors', 'import_staged_records', 'audit_logs',
  ]]);
  console.log(`CampusIQ production tables found=${result.rows.length}`);
  console.log(result.rows.map((row) => row.table_name).join(', '));
} finally {
  await client.end();
}
