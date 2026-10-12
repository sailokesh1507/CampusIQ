import { randomUUID } from 'node:crypto';
import { calculateScore } from '../analytics/scoring.js';
import { getSegments, SEGMENT_DEFINITIONS, type SegmentMatch } from '../analytics/segments.js';
import type { Database } from '../db/connection.js';
import type { Intervention, InterventionNote, StudentRecord, StudentSummary } from '../shared/types.js';

type Row = Record<string, unknown>;
const nullable = (value: unknown): number | null => typeof value === 'number' ? value : null;
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;

function latest(db: Database['db'], table: string, studentId: string): Row {
  return (db.prepare(`SELECT * FROM ${table} WHERE student_id = ? ORDER BY observed_at DESC LIMIT 1`).get(studentId) as Row | undefined) ?? {};
}

export function getRecord(db: Database, studentId: string): StudentRecord | null {
  const row = db.db.prepare('SELECT * FROM students WHERE student_id = ? COLLATE NOCASE').get(studentId) as Row | undefined;
  if (!row) return null;
  const academic = latest(db.db, 'academic_metrics', String(row.student_id));
  const attendance = latest(db.db, 'attendance_metrics', String(row.student_id));
  const lms = latest(db.db, 'lms_metrics', String(row.student_id));
  const engagement = latest(db.db, 'engagement_metrics', String(row.student_id));
  const placement = latest(db.db, 'placement_metrics', String(row.student_id));
  const skills = latest(db.db, 'skills_metrics', String(row.student_id));
  const feedback = latest(db.db, 'feedback', String(row.student_id));
  const subjectObserved = db.db.prepare('SELECT MAX(observed_at) AS observed_at FROM subject_metrics WHERE student_id = ?').get(String(row.student_id)) as Row;
  const subjectMetrics = subjectObserved.observed_at
    ? (db.db.prepare('SELECT subject_code, marks_percent, attendance_percent FROM subject_metrics WHERE student_id = ? AND observed_at = ? ORDER BY subject_code').all(String(row.student_id), String(subjectObserved.observed_at)) as Row[]).map((subject) => ({ subjectCode: String(subject.subject_code), marksPercent: nullable(subject.marks_percent), attendancePercent: nullable(subject.attendance_percent) }))
    : [];
  return {
    studentId: String(row.student_id), displayName: String(row.display_name), email: text(row.email), department: String(row.department), programme: String(row.programme), semester: nullable(row.semester), active: Boolean(row.active),
    observedAt: String(academic.observed_at ?? attendance.observed_at ?? row.updated_at),
    academic: { cgpa: nullable(academic.cgpa), cgpaScale: nullable(academic.cgpa_scale), marksPercent: nullable(academic.marks_percent), backlogs: nullable(academic.backlogs) },
    attendance: { overallPercent: nullable(attendance.overall_percent) },
    subjectMetrics,
    lms: { loginCount: nullable(lms.login_count), assignmentCompletionPercent: nullable(lms.assignment_completion_percent) },
    engagement: { eventsCount: nullable(engagement.events_count), clubsCount: nullable(engagement.clubs_count), hackathonsCount: nullable(engagement.hackathons_count), certificationsCount: nullable(engagement.certifications_count) },
    placement: { aptitudeScore: nullable(placement.aptitude_score), codingScore: nullable(placement.coding_score), mockInterviewScore: nullable(placement.mock_interview_score) },
    skills: { technicalScore: nullable(skills.technical_score), softSkillScore: nullable(skills.soft_skill_score) },
    feedback: { studentSatisfaction: nullable(feedback.student_satisfaction), facultyFeedback: text(feedback.faculty_feedback) },
  };
}

export function getRecords(db: Database): StudentRecord[] {
  const rows = db.db.prepare('SELECT student_id FROM students ORDER BY student_id').all() as Row[];
  return rows.map((row) => getRecord(db, String(row.student_id))).filter((record): record is StudentRecord => record !== null);
}

export function getSegmentsForRecord(record: StudentRecord): SegmentMatch[] {
  return getSegments(record, calculateScore(record));
}

export function toSummary(record: StudentRecord): StudentSummary {
  const explanation = calculateScore(record);
  return {
    studentId: record.studentId, displayName: record.displayName, department: record.department, programme: record.programme, semester: record.semester,
    score: explanation.score, coverage: explanation.coverage, supportLevel: explanation.supportLevel,
    signals: explanation.signals.map((signal) => signal.key), segments: getSegments(record, explanation).map((segment) => segment.key), updatedAt: record.observedAt,
  };
}

export function refreshSnapshots(db: Database): number {
  const records = getRecords(db);
  const now = new Date().toISOString();
  const refresh = db.db.transaction(() => {
    db.db.prepare('DELETE FROM score_snapshots').run();
    const insert = db.db.prepare(`INSERT INTO score_snapshots (id, student_id, calculated_at, success_score, coverage_percent, support_level, explanation_json, algorithm_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const record of records) {
      const explanation = calculateScore(record);
      const segments = getSegments(record, explanation);
      insert.run(randomUUID(), record.studentId, now, explanation.score, explanation.coverage, explanation.supportLevel, JSON.stringify({ ...explanation, segments }), explanation.algorithmVersion);
    }
  });
  refresh();
  const latestSnapshots = db.db.prepare('SELECT student_id, id FROM score_snapshots WHERE calculated_at = ?').all(now) as Array<{ student_id: string; id: string }>;
  const updateIntervention = db.db.prepare('UPDATE interventions SET score_snapshot_id = ? WHERE student_id = ? AND score_snapshot_id IS NULL');
  for (const snapshot of latestSnapshots) updateIntervention.run(snapshot.id, snapshot.student_id);
  return records.length;
}

export function getSnapshotId(db: Database, studentId: string): string | null {
  const row = db.db.prepare('SELECT id FROM score_snapshots WHERE student_id = ? ORDER BY calculated_at DESC LIMIT 1').get(studentId) as Row | undefined;
  return row ? String(row.id) : null;
}

export function upsertRecord(db: Database, record: StudentRecord, sourceBatchId: string | null = null): void {
  const now = new Date().toISOString();
  const source = { studentId: record.studentId, observedAt: record.observedAt, sourceBatchId };
  db.db.prepare(`INSERT INTO students (student_id, display_name, email, department, programme, semester, active, created_at, updated_at) VALUES (@studentId, @displayName, @email, @department, @programme, @semester, @active, @createdAt, @updatedAt)
    ON CONFLICT(student_id) DO UPDATE SET display_name=excluded.display_name, email=excluded.email, department=excluded.department, programme=excluded.programme, semester=excluded.semester, active=excluded.active, updated_at=excluded.updated_at`).run({ studentId: record.studentId, displayName: record.displayName, email: record.email, department: record.department, programme: record.programme, semester: record.semester, active: record.active ? 1 : 0, createdAt: now, updatedAt: now });
  db.db.prepare(`INSERT INTO academic_metrics (student_id, observed_at, cgpa, cgpa_scale, marks_percent, backlogs, source_batch_id) VALUES (@studentId, @observedAt, @cgpa, @cgpaScale, @marksPercent, @backlogs, @sourceBatchId) ON CONFLICT(student_id, observed_at) DO UPDATE SET cgpa=excluded.cgpa, cgpa_scale=excluded.cgpa_scale, marks_percent=excluded.marks_percent, backlogs=excluded.backlogs, source_batch_id=excluded.source_batch_id`).run({ ...source, cgpa: record.academic.cgpa, cgpaScale: record.academic.cgpaScale, marksPercent: record.academic.marksPercent, backlogs: record.academic.backlogs });
  db.db.prepare(`INSERT INTO attendance_metrics (student_id, observed_at, overall_percent, source_batch_id) VALUES (@studentId, @observedAt, @overallPercent, @sourceBatchId) ON CONFLICT(student_id, observed_at) DO UPDATE SET overall_percent=excluded.overall_percent, source_batch_id=excluded.source_batch_id`).run({ ...source, overallPercent: record.attendance.overallPercent });
  db.db.prepare('DELETE FROM subject_metrics WHERE student_id = ? AND observed_at = ?').run(record.studentId, record.observedAt);
  const insertSubject = db.db.prepare('INSERT INTO subject_metrics (student_id, observed_at, subject_code, marks_percent, attendance_percent, source_batch_id) VALUES (?, ?, ?, ?, ?, ?)');
  for (const subject of record.subjectMetrics) insertSubject.run(record.studentId, record.observedAt, subject.subjectCode, subject.marksPercent, subject.attendancePercent, sourceBatchId);
  db.db.prepare(`INSERT INTO lms_metrics (student_id, observed_at, login_count, assignment_completion_percent, source_batch_id) VALUES (@studentId, @observedAt, @loginCount, @assignmentCompletionPercent, @sourceBatchId) ON CONFLICT(student_id, observed_at) DO UPDATE SET login_count=excluded.login_count, assignment_completion_percent=excluded.assignment_completion_percent, source_batch_id=excluded.source_batch_id`).run({ ...source, loginCount: record.lms.loginCount, assignmentCompletionPercent: record.lms.assignmentCompletionPercent });
  db.db.prepare(`INSERT INTO engagement_metrics (student_id, observed_at, events_count, clubs_count, hackathons_count, certifications_count, source_batch_id) VALUES (@studentId, @observedAt, @eventsCount, @clubsCount, @hackathonsCount, @certificationsCount, @sourceBatchId) ON CONFLICT(student_id, observed_at) DO UPDATE SET events_count=excluded.events_count, clubs_count=excluded.clubs_count, hackathons_count=excluded.hackathons_count, certifications_count=excluded.certifications_count, source_batch_id=excluded.source_batch_id`).run({ ...source, eventsCount: record.engagement.eventsCount, clubsCount: record.engagement.clubsCount, hackathonsCount: record.engagement.hackathonsCount, certificationsCount: record.engagement.certificationsCount });
  db.db.prepare(`INSERT INTO placement_metrics (student_id, observed_at, aptitude_score, coding_score, mock_interview_score, source_batch_id) VALUES (@studentId, @observedAt, @aptitudeScore, @codingScore, @mockInterviewScore, @sourceBatchId) ON CONFLICT(student_id, observed_at) DO UPDATE SET aptitude_score=excluded.aptitude_score, coding_score=excluded.coding_score, mock_interview_score=excluded.mock_interview_score, source_batch_id=excluded.source_batch_id`).run({ ...source, aptitudeScore: record.placement.aptitudeScore, codingScore: record.placement.codingScore, mockInterviewScore: record.placement.mockInterviewScore });
  db.db.prepare(`INSERT INTO skills_metrics (student_id, observed_at, technical_score, soft_skill_score, source_batch_id) VALUES (@studentId, @observedAt, @technicalScore, @softSkillScore, @sourceBatchId) ON CONFLICT(student_id, observed_at) DO UPDATE SET technical_score=excluded.technical_score, soft_skill_score=excluded.soft_skill_score, source_batch_id=excluded.source_batch_id`).run({ ...source, technicalScore: record.skills.technicalScore, softSkillScore: record.skills.softSkillScore });
  db.db.prepare(`INSERT INTO feedback (student_id, observed_at, student_satisfaction, faculty_feedback, source_batch_id) VALUES (@studentId, @observedAt, @studentSatisfaction, @facultyFeedback, @sourceBatchId) ON CONFLICT(student_id, observed_at) DO UPDATE SET student_satisfaction=excluded.student_satisfaction, faculty_feedback=excluded.faculty_feedback, source_batch_id=excluded.source_batch_id`).run({ ...source, studentSatisfaction: record.feedback.studentSatisfaction, facultyFeedback: record.feedback.facultyFeedback });
}

function noteRows(db: Database, interventionId: string): InterventionNote[] {
  return (db.db.prepare('SELECT id, body, author, created_at FROM intervention_notes WHERE intervention_id = ? ORDER BY created_at ASC').all(interventionId) as Row[]).map((row) => ({ id: String(row.id), body: String(row.body), author: String(row.author), createdAt: String(row.created_at) }));
}

export function mapIntervention(db: Database, row: Row): Intervention {
  return { id: String(row.id), studentId: String(row.student_id), studentName: text(row.display_name) ?? undefined, scoreSnapshotId: text(row.score_snapshot_id), category: row.category as Intervention['category'], title: String(row.title), rationale: String(row.rationale), owner: String(row.owner), dueDate: String(row.due_date), status: row.status as Intervention['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at), notes: noteRows(db, String(row.id)) };
}

export function listInterventions(db: Database): Intervention[] {
  return (db.db.prepare(`SELECT i.*, s.display_name FROM interventions i JOIN students s ON s.student_id = i.student_id ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, i.due_date ASC`).all() as Row[]).map((row) => mapIntervention(db, row));
}

export function getIntervention(db: Database, id: string): Intervention | null {
  const row = db.db.prepare('SELECT i.*, s.display_name FROM interventions i JOIN students s ON s.student_id = i.student_id WHERE i.id = ?').get(id) as Row | undefined;
  return row ? mapIntervention(db, row) : null;
}

export { SEGMENT_DEFINITIONS };
