import { randomUUID } from 'node:crypto';
import pg from 'pg';

const base = (process.env.LIVE_BASE_URL || 'https://campusiq-eight.vercel.app').replace(/\/$/, '');
const databaseUrl = process.env.DATABASE_URL;
const demoInstitutionId = '00000000-0000-0000-0000-000000000001';
if (!databaseUrl) throw new Error('DATABASE_URL is required for live write smoke cleanup.');

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const studentId = `LIVE-SMOKE-${randomUUID().slice(0, 8)}`;
let interventionId = null;
let batchId = null;

async function readJson(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const demoLogin = await fetch(`${base}/api/auth/demo`, { method: 'POST' });
  if (!demoLogin.ok) throw new Error(`Demo login failed with HTTP ${demoLogin.status}`);
  const cookie = demoLogin.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Demo login did not set a session cookie.');
  const headers = { cookie };
  const created = await readJson(await fetch(`${base}/api/interventions`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ studentId: 'SYN-007', category: 'placement', title: 'Live smoke follow-up', rationale: 'Temporary release verification record.', owner: 'Release Check', dueDate: '2026-02-20' }),
  }));
  interventionId = created.data.id;
  const updated = await readJson(await fetch(`${base}/api/interventions/${interventionId}`, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' }),
  }));
  if (updated.data.status !== 'in_progress') throw new Error('Live intervention status did not persist.');
  await readJson(await fetch(`${base}/api/interventions/${interventionId}/notes`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ body: 'Temporary live smoke note.' }),
  }));

  const form = new FormData();
  form.append('mode', 'partial');
  form.append('file', new Blob([`student_id,display_name,observed_at,marks_percent\n${studentId},Live Smoke Student,2026-01-15T00:00:00.000Z,71\n`], { type: 'text/csv' }), 'live-smoke.csv');
  const validation = await readJson(await fetch(`${base}/api/imports/validate`, { method: 'POST', headers, body: form }));
  batchId = validation.data.batchId;
  const committed = await readJson(await fetch(`${base}/api/imports/${batchId}/commit`, { method: 'POST', headers }));
  if (committed.data.status !== 'committed') throw new Error('Live import did not commit.');
  const profile = await readJson(await fetch(`${base}/api/students/${studentId}`, { headers }));
  if (profile.data.record.studentId !== studentId) throw new Error('Live imported profile was not readable.');
  console.log(JSON.stringify({ status: 'ok', live: base, intervention: 'persisted', import: 'committed', cleanup: 'pending' }));
}

try {
  await main();
} finally {
  await pool.query('DELETE FROM interventions WHERE id=$1', [interventionId]).catch(() => undefined);
  await pool.query('DELETE FROM import_batches WHERE id=$1', [batchId]).catch(() => undefined);
  await pool.query('DELETE FROM students WHERE institution_id=$1 AND student_id=$2', [demoInstitutionId, studentId]).catch(() => undefined);
  if (interventionId || batchId) await pool.query('DELETE FROM audit_logs WHERE institution_id=$1 AND entity_id = ANY($2::text[])', [demoInstitutionId, [interventionId, batchId].filter(Boolean)]).catch(() => undefined);
  await pool.end();
}
