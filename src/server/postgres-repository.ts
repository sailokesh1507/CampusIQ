import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { calculateScore } from '../analytics/scoring.js';
import { getSegments, SEGMENT_DEFINITIONS, type SegmentMatch } from '../analytics/segments.js';
import type { Intervention, InterventionNote, StudentRecord, StudentSummary } from '../shared/types.js';
import type { PostgresDatabase } from '../db/postgres.js';
import { PG_DEMO_INSTITUTION_ID, upsertPostgresRecord } from '../db/postgres.js';

type Queryable = pg.Pool | pg.PoolClient;
type Row = Record<string, unknown>;
const numberOrNull = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);
const stringOrNull = (value: unknown): string | null => value === null || value === undefined ? null : String(value);

export async function getPostgresRecord(database: PostgresDatabase, institutionId: string, studentId: string, queryable: Queryable = database.pool): Promise<StudentRecord | null> {
  const result = await queryable.query(`SELECT s.*, d.name AS department_name, p.name AS programme_name
    FROM students s LEFT JOIN departments d ON d.id=s.department_id LEFT JOIN programmes p ON p.id=s.programme_id
    WHERE s.institution_id=$1 AND s.student_id=$2 LIMIT 1`, [institutionId, studentId]);
  const row = result.rows[0] as Row | undefined;
  if (!row) return null;
  const internalId = String(row.id);
  const [academic, attendance, subject, lms, engagement, placement, skills, feedback] = await Promise.all([
    queryable.query('SELECT * FROM academic_metrics WHERE student_id=$1 ORDER BY observed_at DESC LIMIT 1', [internalId]),
    queryable.query('SELECT * FROM attendance_metrics WHERE student_id=$1 ORDER BY observed_at DESC LIMIT 1', [internalId]),
    queryable.query('SELECT subject_code,marks_percent,attendance_percent FROM subject_metrics WHERE student_id=$1 AND observed_at=(SELECT MAX(observed_at) FROM subject_metrics WHERE student_id=$1) ORDER BY subject_code', [internalId]),
    queryable.query('SELECT * FROM lms_metrics WHERE student_id=$1 ORDER BY observed_at DESC LIMIT 1', [internalId]),
    queryable.query('SELECT * FROM engagement_metrics WHERE student_id=$1 ORDER BY observed_at DESC LIMIT 1', [internalId]),
    queryable.query('SELECT * FROM placement_metrics WHERE student_id=$1 ORDER BY observed_at DESC LIMIT 1', [internalId]),
    queryable.query('SELECT * FROM skills_metrics WHERE student_id=$1 ORDER BY observed_at DESC LIMIT 1', [internalId]),
    queryable.query('SELECT * FROM feedback WHERE student_id=$1 ORDER BY observed_at DESC LIMIT 1', [internalId]),
  ]);
  const a = academic.rows[0] ?? {}; const at = attendance.rows[0] ?? {}; const l = lms.rows[0] ?? {}; const e = engagement.rows[0] ?? {}; const p = placement.rows[0] ?? {}; const s = skills.rows[0] ?? {}; const f = feedback.rows[0] ?? {};
  return {
    studentId: String(row.student_id), displayName: String(row.display_name), email: stringOrNull(row.email),
    department: String(row.department_name ?? row.department ?? 'Unassigned'), programme: String(row.programme_name ?? row.programme ?? 'Unassigned'), semester: numberOrNull(row.semester), active: Boolean(row.active), observedAt: String(a.observed_at ?? at.observed_at ?? row.updated_at),
    academic: { cgpa: numberOrNull(a.cgpa), cgpaScale: numberOrNull(a.cgpa_scale), marksPercent: numberOrNull(a.marks_percent), backlogs: numberOrNull(a.backlogs) },
    attendance: { overallPercent: numberOrNull(at.overall_percent) }, subjectMetrics: subject.rows.map((item) => ({ subjectCode: String(item.subject_code), marksPercent: numberOrNull(item.marks_percent), attendancePercent: numberOrNull(item.attendance_percent) })),
    lms: { loginCount: numberOrNull(l.login_count), assignmentCompletionPercent: numberOrNull(l.assignment_completion_percent) },
    engagement: { eventsCount: numberOrNull(e.events_count), clubsCount: numberOrNull(e.clubs_count), hackathonsCount: numberOrNull(e.hackathons_count), certificationsCount: numberOrNull(e.certifications_count) },
    placement: { aptitudeScore: numberOrNull(p.aptitude_score), codingScore: numberOrNull(p.coding_score), mockInterviewScore: numberOrNull(p.mock_interview_score) },
    skills: { technicalScore: numberOrNull(s.technical_score), softSkillScore: numberOrNull(s.soft_skill_score) }, feedback: { studentSatisfaction: numberOrNull(f.student_satisfaction), facultyFeedback: stringOrNull(f.faculty_feedback) },
  };
}

export async function getPostgresRecords(database: PostgresDatabase, institutionId: string): Promise<StudentRecord[]> {
  const result = await database.pool.query('SELECT student_id FROM students WHERE institution_id=$1 ORDER BY student_id', [institutionId]);
  return Promise.all(result.rows.map((row) => getPostgresRecord(database, institutionId, String(row.student_id)))).then((records) => records.filter((record): record is StudentRecord => record !== null));
}

export function postgresSummary(record: StudentRecord): StudentSummary {
  const explanation = calculateScore(record);
  return { studentId: record.studentId, displayName: record.displayName, department: record.department, programme: record.programme, semester: record.semester, score: explanation.score, coverage: explanation.coverage, supportLevel: explanation.supportLevel, signals: explanation.signals.map((item) => item.key), segments: getSegments(record, explanation).map((item) => item.key), updatedAt: record.observedAt };
}

export function postgresSegments(record: StudentRecord): SegmentMatch[] { return getSegments(record, calculateScore(record)); }

export async function refreshPostgresSnapshots(database: PostgresDatabase, institutionId: string): Promise<number> {
  const records = await getPostgresRecords(database, institutionId); const now = new Date().toISOString();
  await database.transaction(async (client) => {
    await client.query('DELETE FROM score_snapshots WHERE institution_id=$1', [institutionId]);
    for (const record of records) {
      const student = await client.query('SELECT id FROM students WHERE institution_id=$1 AND student_id=$2', [institutionId, record.studentId]);
      const explanation = calculateScore(record); const segments = getSegments(record, explanation);
      await client.query(`INSERT INTO score_snapshots (id,institution_id,student_id,calculated_at,success_score,coverage_percent,support_level,explanation_json,algorithm_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), institutionId, student.rows[0].id, now, explanation.score, explanation.coverage, explanation.supportLevel, JSON.stringify({ ...explanation, segments }), explanation.algorithmVersion]);
    }
    await client.query(`UPDATE interventions i SET score_snapshot_id=s.id FROM score_snapshots s WHERE i.student_id=s.student_id AND i.institution_id=$1 AND s.institution_id=$1 AND i.score_snapshot_id IS NULL`, [institutionId]);
  });
  return records.length;
}

export async function postgresSnapshotId(database: PostgresDatabase, institutionId: string, studentId: string): Promise<string | null> {
  const row = await database.pool.query(`SELECT s.id FROM score_snapshots s JOIN students st ON st.id=s.student_id WHERE s.institution_id=$1 AND st.student_id=$2 ORDER BY s.calculated_at DESC LIMIT 1`, [institutionId, studentId]);
  return row.rows[0]?.id ? String(row.rows[0].id) : null;
}

export interface PostgresIntervention extends Intervention { institutionId: string; createdByUserId: string | null; updatedByUserId: string | null; }

async function mapPostgresIntervention(database: PostgresDatabase, row: Row, queryable: Queryable = database.pool): Promise<PostgresIntervention> {
  const notes = await queryable.query('SELECT id,body,author,created_at FROM intervention_notes WHERE intervention_id=$1 ORDER BY created_at', [row.id]);
  return { id: String(row.id), studentId: String(row.external_student_id), studentName: stringOrNull(row.display_name) ?? undefined, scoreSnapshotId: stringOrNull(row.score_snapshot_id), category: row.category as Intervention['category'], title: String(row.title), rationale: String(row.rationale), owner: String(row.owner), dueDate: String(row.due_date), status: row.status as Intervention['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at), notes: notes.rows.map((note) => ({ id: String(note.id), body: String(note.body), author: String(note.author), createdAt: String(note.created_at) })), institutionId: String(row.institution_id), createdByUserId: stringOrNull(row.created_by_user_id), updatedByUserId: stringOrNull(row.updated_by_user_id) };
}

export async function listPostgresInterventions(database: PostgresDatabase, institutionId: string): Promise<PostgresIntervention[]> {
  const rows = await database.pool.query(`SELECT i.*, s.student_id AS external_student_id, s.display_name FROM interventions i JOIN students s ON s.id=i.student_id WHERE i.institution_id=$1 ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, i.due_date`, [institutionId]);
  return Promise.all(rows.rows.map((row) => mapPostgresIntervention(database, row)));
}

export async function getPostgresIntervention(database: PostgresDatabase, institutionId: string, id: string): Promise<PostgresIntervention | null> {
  const result = await database.pool.query(`SELECT i.*, s.student_id AS external_student_id, s.display_name FROM interventions i JOIN students s ON s.id=i.student_id WHERE i.institution_id=$1 AND i.id=$2`, [institutionId, id]);
  return result.rows[0] ? mapPostgresIntervention(database, result.rows[0]) : null;
}

export { PG_DEMO_INSTITUTION_ID, SEGMENT_DEFINITIONS };
