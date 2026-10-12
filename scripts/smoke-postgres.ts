import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPostgresApp } from '../src/server/postgres-app.js';
import { hashPassword } from '../src/auth/auth.js';
import type { PostgresDatabase } from '../src/db/postgres.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const suffix = randomUUID();
const institutionA = randomUUID();
const institutionB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const departmentA = randomUUID();
const programmeA = randomUUID();
const studentA = randomUUID();
const studentB = randomUUID();
const password = `Smoke-${suffix}!`;
const emailA = `smoke-a-${suffix}@campusiq.test`;
const emailB = `smoke-b-${suffix}@campusiq.test`;
const studentCodeA = `SMOKE-A-${suffix.slice(0, 8)}`;
const studentCodeB = `SMOKE-B-${suffix.slice(0, 8)}`;
const observedAt = '2026-01-15T00:00:00.000Z';
let poolClosed = false;

async function closePool(): Promise<void> {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
}

function cookieFrom(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert.ok(value, 'login response did not set a session cookie');
  return value.split(';', 1)[0];
}

async function json(response: Response): Promise<Record<string, any>> {
  const body = await response.json() as Record<string, any>;
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main(): Promise<void> {
  process.env.AUTH_REQUIRED = 'true';
  process.env.DEMO_MODE = 'false';
  process.env.POSTGRES_SEED_DEMO = 'false';

  await pool.query('BEGIN');
  await pool.query('INSERT INTO institutions (id,name,slug) VALUES ($1,$2,$3),($4,$5,$6)', [institutionA, 'CampusIQ Smoke A', `smoke-a-${suffix}`, institutionB, 'CampusIQ Smoke B', `smoke-b-${suffix}`]);
  await pool.query('INSERT INTO departments (id,institution_id,code,name) VALUES ($1,$2,$3,$4)', [departmentA, institutionA, 'SMOKE', 'Smoke Testing']);
  await pool.query('INSERT INTO programmes (id,institution_id,department_id,code,name) VALUES ($1,$2,$3,$4,$5)', [programmeA, institutionA, departmentA, 'SMOKE-BSC', 'Smoke Testing Programme']);
  await pool.query(`INSERT INTO users (id,institution_id,email,display_name,password_hash,role) VALUES ($1,$2,$3,$4,$5,'admin'),($6,$7,$8,$9,$10,'admin')`, [userA, institutionA, emailA, 'Smoke Admin A', hashPassword(password), userB, institutionB, emailB, 'Smoke Admin B', hashPassword(password)]);
  await pool.query(`INSERT INTO students (id,institution_id,student_id,display_name,department,programme,department_id,programme_id,semester)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,4),($9,$10,$11,$12,'Other','Other',NULL,NULL,4)`, [studentA, institutionA, studentCodeA, 'Smoke Student A', 'Smoke Testing', 'Smoke Testing Programme', departmentA, programmeA, studentB, institutionB, studentCodeB, 'Smoke Student B']);
  await pool.query(`INSERT INTO academic_metrics (institution_id,student_id,observed_at,cgpa,cgpa_scale,marks_percent,backlogs)
    VALUES ($1,$2,$3,8.5,10,82,0),($4,$5,$3,7.2,10,70,0)`, [institutionA, studentA, observedAt, institutionB, studentB]);
  await pool.query(`INSERT INTO attendance_metrics (institution_id,student_id,observed_at,overall_percent) VALUES ($1,$2,$3,88),($4,$5,$3,80)`, [institutionA, studentA, observedAt, institutionB, studentB]);
  await pool.query('COMMIT');

  const app = createPostgresApp({ databaseUrl });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (route: string, init: RequestInit = {}) => fetch(`${base}${route}`, init);
  let cookieA = '';
  let cookieB = '';

  try {
    assert.equal((await json(await request('/healthz'))).data.database, 'postgres');

    const loginResponseA = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: emailA, password }) });
    cookieA = cookieFrom(loginResponseA);
    const loginA = await json(loginResponseA);
    assert.equal(loginA.data.user.institutionId, institutionA);
    const catalog = await json(await request('/api/catalog', { headers: { cookie: cookieA } }));
    assert.equal(catalog.data.departments[0].code, 'SMOKE');
    const dashboardA = await json(await request('/api/dashboard', { headers: { cookie: cookieA } }));
    assert.equal(dashboardA.data.kpis.totalStudents, 1);
    const profileA = await json(await request(`/api/students/${studentCodeA}`, { headers: { cookie: cookieA } }));
    assert.equal(profileA.data.record.studentId, studentCodeA);

    const createdDepartment = await json(await request('/api/catalog/departments', { method: 'POST', headers: { cookie: cookieA, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'SMOKE2', name: 'Smoke Extension' }) }));
    assert.equal(createdDepartment.data.code, 'SMOKE2');

    const intervention = await json(await request('/api/interventions', { method: 'POST', headers: { cookie: cookieA, 'content-type': 'application/json' }, body: JSON.stringify({ studentId: studentCodeA, category: 'academic', title: 'Smoke follow-up', rationale: 'Verify Postgres intervention persistence.', owner: 'Smoke Admin', dueDate: '2026-02-20' }) }));
    assert.equal(intervention.data.status, 'open');
    const updated = await json(await request(`/api/interventions/${intervention.data.id}`, { method: 'PATCH', headers: { cookie: cookieA, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) }));
    assert.equal(updated.data.status, 'in_progress');

    const form = new FormData();
    form.append('mode', 'partial');
    form.append('file', new Blob([`student_id,display_name,observed_at,marks_percent\n${studentCodeA}-IMPORT,Imported Smoke,${observedAt},71\n`], { type: 'text/csv' }), 'smoke.csv');
    const validation = await json(await request('/api/imports/validate', { method: 'POST', headers: { cookie: cookieA }, body: form }));
    const committed = await json(await request(`/api/imports/${validation.data.batchId}/commit`, { method: 'POST', headers: { cookie: cookieA } }));
    assert.equal(committed.data.status, 'committed');
    assert.equal((await json(await request(`/api/students/${studentCodeA}-IMPORT`, { headers: { cookie: cookieA } }))).data.record.studentId, `${studentCodeA}-IMPORT`);

    cookieB = cookieFrom(await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: emailB, password }) }));
    const dashboardB = await json(await request('/api/dashboard', { headers: { cookie: cookieB } }));
    assert.equal(dashboardB.data.kpis.totalStudents, 1);
    const crossTenant = await request(`/api/students/${studentCodeA}`, { headers: { cookie: cookieB } });
    assert.equal(crossTenant.status, 404);
    const crossTenantInterventions = await json(await request('/api/interventions', { headers: { cookie: cookieB } }));
    assert.equal(crossTenantInterventions.data.length, 0);
    console.log(JSON.stringify({ status: 'ok', institutionIsolation: 'verified', import: 'committed', intervention: 'persisted' }));
  } finally {
    server.close();
    await (app.locals as { postgresDatabase?: PostgresDatabase }).postgresDatabase?.close();
    await pool.query('DELETE FROM institutions WHERE id IN ($1,$2)', [institutionA, institutionB]);
    await closePool();
  }
}

main().catch(async (error) => {
  if (!poolClosed) {
    await pool.query('ROLLBACK').catch(() => undefined);
    await pool.query('DELETE FROM institutions WHERE id IN ($1,$2)', [institutionA, institutionB]).catch(() => undefined);
    await closePool();
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
