import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildSyntheticRecords } from './seed-data.js';
import { DEMO_INSTITUTION_ID, DEMO_INSTITUTION_NAME, demoCredentials, authConfig, hashPassword } from '../auth/auth.js';
import type { StudentRecord } from '../shared/types.js';

const PG_DEMO_INSTITUTION_ID = '00000000-0000-0000-0000-000000000001';
const departmentCatalog = [
  { code: 'CSE', name: 'Computer Science', programmeCode: 'BTECH-CSE', programmeName: 'B.Tech Computer Science' },
  { code: 'IS', name: 'Information Systems', programmeCode: 'BBA-BA', programmeName: 'BBA Business Analytics' },
  { code: 'ECE', name: 'Electronics & Communication', programmeCode: 'BTECH-ECE', programmeName: 'B.Tech Electronics' },
];

export class PostgresDatabase {
  readonly pool: pg.Pool;
  readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
    this.ready = this.pool.query('SELECT 1').then(async () => {
      if (process.env.POSTGRES_SEED_DEMO === 'true') await seedPostgresDemo(this);
    });
  }

  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> { await this.pool.end(); }
}

async function seedPostgresDemo(database: PostgresDatabase): Promise<void> {
  const now = new Date().toISOString();
  await database.pool.query(`INSERT INTO institutions (id, name, slug, active, created_at, updated_at) VALUES ($1, $2, $3, TRUE, $4, $4)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, updated_at=EXCLUDED.updated_at`, [PG_DEMO_INSTITUTION_ID, DEMO_INSTITUTION_NAME, 'demo-campus', now]);
  for (const [index, item] of departmentCatalog.entries()) {
    const departmentId = `00000000-0000-0000-0000-00000000001${index}`;
    await database.pool.query(`INSERT INTO departments (id, institution_id, code, name, active, created_at, updated_at) VALUES ($1, $2, $3, $4, TRUE, $5, $5)
      ON CONFLICT (institution_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=EXCLUDED.updated_at`, [departmentId, PG_DEMO_INSTITUTION_ID, item.code, item.name, now]);
    await database.pool.query(`INSERT INTO programmes (id, institution_id, department_id, code, name, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6)
      ON CONFLICT (institution_id, code) DO UPDATE SET department_id=EXCLUDED.department_id, name=EXCLUDED.name, updated_at=EXCLUDED.updated_at`, [`10000000-0000-0000-0000-00000000002${index}`, PG_DEMO_INSTITUTION_ID, departmentId, item.programmeCode, item.programmeName, now]);
  }
  const credentials = demoCredentials();
  const existingUser = await database.pool.query('SELECT id FROM users WHERE email = $1', [credentials.email]);
  if (!existingUser.rowCount) await database.pool.query(`INSERT INTO users (id, institution_id, email, display_name, password_hash, role, active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, $6, $6)`, [randomUUID(), PG_DEMO_INSTITUTION_ID, credentials.email, 'Demo Faculty Administrator', hashPassword(credentials.password), now]);
  const studentCount = await database.pool.query('SELECT COUNT(*)::int AS count FROM students WHERE institution_id = $1', [PG_DEMO_INSTITUTION_ID]);
  if (Number(studentCount.rows[0].count) > 0) return;
  const records = buildSyntheticRecords();
  await database.transaction(async (client) => {
    for (const record of records) await upsertPostgresRecord(database, record, null, client, PG_DEMO_INSTITUTION_ID);
    const students = await client.query('SELECT id, student_id FROM students WHERE institution_id = $1', [PG_DEMO_INSTITUTION_ID]);
    const interventions = [
      { studentId: 'SYN-007', category: 'placement', title: 'Placement preparation plan', rationale: 'High academic performance with low placement assessment evidence.', owner: 'Career Services', dueDate: '2026-02-15', status: 'in_progress' },
      { studentId: 'SYN-013', category: 'attendance', title: 'Attendance outreach', rationale: 'Attendance and academic support signals require a faculty conversation.', owner: 'Programme Mentor', dueDate: '2026-02-05', status: 'open' },
      { studentId: 'SYN-019', category: 'academic', title: 'Academic coaching check-in', rationale: 'Academic support opportunity alongside strong placement readiness.', owner: 'Academic Advisor', dueDate: '2026-02-10', status: 'completed' },
    ];
    for (const item of interventions) {
      const student = students.rows.find((row) => row.student_id === item.studentId);
      if (student) await client.query(`INSERT INTO interventions (id, institution_id, student_id, category, title, rationale, owner, due_date, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`, [randomUUID(), PG_DEMO_INSTITUTION_ID, student.id, item.category, item.title, item.rationale, item.owner, item.dueDate, item.status, now]);
    }
  });
}

export async function upsertPostgresRecord(database: PostgresDatabase, record: StudentRecord, sourceBatchId: string | null, client: pg.PoolClient | pg.Pool = database.pool, institutionId = PG_DEMO_INSTITUTION_ID): Promise<string> {
  const now = new Date().toISOString();
  const catalog = departmentCatalog.find((item) => item.name === record.department || item.programmeName === record.programme);
  const department = catalog ? await client.query('SELECT id FROM departments WHERE institution_id = $1 AND code = $2', [institutionId, catalog.code]) : { rows: [] };
  const programme = catalog ? await client.query('SELECT id FROM programmes WHERE institution_id = $1 AND code = $2', [institutionId, catalog.programmeCode]) : { rows: [] };
  const existing = await client.query(`INSERT INTO students (id, institution_id, student_id, display_name, email, department_id, programme_id, department, programme, semester, active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
    ON CONFLICT (institution_id, student_id) DO UPDATE SET display_name=EXCLUDED.display_name, email=EXCLUDED.email, department_id=EXCLUDED.department_id, programme_id=EXCLUDED.programme_id, department=EXCLUDED.department, programme=EXCLUDED.programme, semester=EXCLUDED.semester, active=EXCLUDED.active, updated_at=EXCLUDED.updated_at
    RETURNING id`, [randomUUID(), institutionId, record.studentId, record.displayName, record.email, department.rows[0]?.id ?? null, programme.rows[0]?.id ?? null, record.department, record.programme, record.semester, record.active, now]);
  const studentId = existing.rows[0].id as string;
  const source = sourceBatchId;
  await client.query(`INSERT INTO academic_metrics (id, institution_id, student_id, observed_at, cgpa, cgpa_scale, marks_percent, backlogs, source_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (student_id, observed_at) DO UPDATE SET cgpa=EXCLUDED.cgpa,cgpa_scale=EXCLUDED.cgpa_scale,marks_percent=EXCLUDED.marks_percent,backlogs=EXCLUDED.backlogs,source_batch_id=EXCLUDED.source_batch_id`, [randomUUID(), institutionId, studentId, record.observedAt, record.academic.cgpa, record.academic.cgpaScale, record.academic.marksPercent, record.academic.backlogs, source]);
  await client.query(`INSERT INTO attendance_metrics (id,institution_id,student_id,observed_at,overall_percent,source_batch_id) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (student_id, observed_at) DO UPDATE SET overall_percent=EXCLUDED.overall_percent,source_batch_id=EXCLUDED.source_batch_id`, [randomUUID(), institutionId, studentId, record.observedAt, record.attendance.overallPercent, source]);
  await client.query('DELETE FROM subject_metrics WHERE student_id = $1 AND observed_at = $2', [studentId, record.observedAt]);
  for (const subject of record.subjectMetrics) await client.query('INSERT INTO subject_metrics (id,institution_id,student_id,observed_at,subject_code,marks_percent,attendance_percent,source_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), institutionId, studentId, record.observedAt, subject.subjectCode, subject.marksPercent, subject.attendancePercent, source]);
  await client.query(`INSERT INTO lms_metrics (id,institution_id,student_id,observed_at,login_count,assignment_completion_percent,source_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (student_id, observed_at) DO UPDATE SET login_count=EXCLUDED.login_count,assignment_completion_percent=EXCLUDED.assignment_completion_percent,source_batch_id=EXCLUDED.source_batch_id`, [randomUUID(), institutionId, studentId, record.observedAt, record.lms.loginCount, record.lms.assignmentCompletionPercent, source]);
  await client.query(`INSERT INTO engagement_metrics (id,institution_id,student_id,observed_at,events_count,clubs_count,hackathons_count,certifications_count,source_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (student_id, observed_at) DO UPDATE SET events_count=EXCLUDED.events_count,clubs_count=EXCLUDED.clubs_count,hackathons_count=EXCLUDED.hackathons_count,certifications_count=EXCLUDED.certifications_count,source_batch_id=EXCLUDED.source_batch_id`, [randomUUID(), institutionId, studentId, record.observedAt, record.engagement.eventsCount, record.engagement.clubsCount, record.engagement.hackathonsCount, record.engagement.certificationsCount, source]);
  await client.query(`INSERT INTO placement_metrics (id,institution_id,student_id,observed_at,aptitude_score,coding_score,mock_interview_score,source_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (student_id, observed_at) DO UPDATE SET aptitude_score=EXCLUDED.aptitude_score,coding_score=EXCLUDED.coding_score,mock_interview_score=EXCLUDED.mock_interview_score,source_batch_id=EXCLUDED.source_batch_id`, [randomUUID(), institutionId, studentId, record.observedAt, record.placement.aptitudeScore, record.placement.codingScore, record.placement.mockInterviewScore, source]);
  await client.query(`INSERT INTO skills_metrics (id,institution_id,student_id,observed_at,technical_score,soft_skill_score,source_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (student_id, observed_at) DO UPDATE SET technical_score=EXCLUDED.technical_score,soft_skill_score=EXCLUDED.soft_skill_score,source_batch_id=EXCLUDED.source_batch_id`, [randomUUID(), institutionId, studentId, record.observedAt, record.skills.technicalScore, record.skills.softSkillScore, source]);
  await client.query(`INSERT INTO feedback (id,institution_id,student_id,observed_at,student_satisfaction,faculty_feedback,source_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (student_id, observed_at) DO UPDATE SET student_satisfaction=EXCLUDED.student_satisfaction,faculty_feedback=EXCLUDED.faculty_feedback,source_batch_id=EXCLUDED.source_batch_id`, [randomUUID(), institutionId, studentId, record.observedAt, record.feedback.studentSatisfaction, record.feedback.facultyFeedback, source]);
  return studentId;
}

export { PG_DEMO_INSTITUTION_ID };
