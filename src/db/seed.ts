import { randomUUID } from 'node:crypto';
import { Database } from './connection.js';
import { buildSyntheticRecords } from './seed-data.js';

export function seedDatabase(database: Database): void {
  const existing = database.db.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number };
  const records = buildSyntheticRecords();
  if (existing.count > 0) {
    seedSubjectMetrics(database, records);
    return;
  }
  const now = new Date().toISOString();
  const insert = database.db.transaction(() => {
    for (const student of records) {
      database.db.prepare(`INSERT INTO students (student_id, display_name, email, department, programme, semester, active, created_at, updated_at)
        VALUES (@studentId, @displayName, @email, @department, @programme, @semester, @active, @createdAt, @updatedAt)`).run({
        studentId: student.studentId, displayName: student.displayName, email: student.email, department: student.department,
        programme: student.programme, semester: student.semester, active: student.active ? 1 : 0, createdAt: now, updatedAt: now,
      });
      const source = { studentId: student.studentId, observedAt: student.observedAt, sourceBatchId: 'synthetic-demo-seed' };
      database.db.prepare(`INSERT INTO academic_metrics (student_id, observed_at, cgpa, cgpa_scale, marks_percent, backlogs, source_batch_id)
        VALUES (@studentId, @observedAt, @cgpa, @cgpaScale, @marksPercent, @backlogs, @sourceBatchId)`).run({ ...source, cgpa: student.academic.cgpa, cgpaScale: student.academic.cgpaScale, marksPercent: student.academic.marksPercent, backlogs: student.academic.backlogs });
      database.db.prepare(`INSERT INTO attendance_metrics (student_id, observed_at, overall_percent, source_batch_id) VALUES (@studentId, @observedAt, @overallPercent, @sourceBatchId)`).run({ ...source, overallPercent: student.attendance.overallPercent });
      const insertSubject = database.db.prepare('INSERT OR IGNORE INTO subject_metrics (student_id, observed_at, subject_code, marks_percent, attendance_percent, source_batch_id) VALUES (?, ?, ?, ?, ?, ?)');
      for (const subject of student.subjectMetrics) insertSubject.run(student.studentId, student.observedAt, subject.subjectCode, subject.marksPercent, subject.attendancePercent, source.sourceBatchId);
      database.db.prepare(`INSERT INTO lms_metrics (student_id, observed_at, login_count, assignment_completion_percent, source_batch_id) VALUES (@studentId, @observedAt, @loginCount, @assignmentCompletionPercent, @sourceBatchId)`).run({ ...source, loginCount: student.lms.loginCount, assignmentCompletionPercent: student.lms.assignmentCompletionPercent });
      database.db.prepare(`INSERT INTO engagement_metrics (student_id, observed_at, events_count, clubs_count, hackathons_count, certifications_count, source_batch_id) VALUES (@studentId, @observedAt, @eventsCount, @clubsCount, @hackathonsCount, @certificationsCount, @sourceBatchId)`).run({ ...source, eventsCount: student.engagement.eventsCount, clubsCount: student.engagement.clubsCount, hackathonsCount: student.engagement.hackathonsCount, certificationsCount: student.engagement.certificationsCount });
      database.db.prepare(`INSERT INTO placement_metrics (student_id, observed_at, aptitude_score, coding_score, mock_interview_score, source_batch_id) VALUES (@studentId, @observedAt, @aptitudeScore, @codingScore, @mockInterviewScore, @sourceBatchId)`).run({ ...source, aptitudeScore: student.placement.aptitudeScore, codingScore: student.placement.codingScore, mockInterviewScore: student.placement.mockInterviewScore });
      database.db.prepare(`INSERT INTO skills_metrics (student_id, observed_at, technical_score, soft_skill_score, source_batch_id) VALUES (@studentId, @observedAt, @technicalScore, @softSkillScore, @sourceBatchId)`).run({ ...source, technicalScore: student.skills.technicalScore, softSkillScore: student.skills.softSkillScore });
      database.db.prepare(`INSERT INTO feedback (student_id, observed_at, student_satisfaction, faculty_feedback, source_batch_id) VALUES (@studentId, @observedAt, @studentSatisfaction, @facultyFeedback, @sourceBatchId)`).run({ ...source, studentSatisfaction: student.feedback.studentSatisfaction, facultyFeedback: student.feedback.facultyFeedback });
    }
    const interventions = [
      { studentId: 'SYN-007', category: 'placement', title: 'Placement preparation plan', rationale: 'High academic performance with low placement assessment evidence.', owner: 'Career Services', dueDate: '2026-02-15', status: 'in_progress' },
      { studentId: 'SYN-013', category: 'attendance', title: 'Attendance outreach', rationale: 'Attendance and academic support signals require a faculty conversation.', owner: 'Programme Mentor', dueDate: '2026-02-05', status: 'open' },
      { studentId: 'SYN-019', category: 'academic', title: 'Academic coaching check-in', rationale: 'Academic support opportunity alongside strong placement readiness.', owner: 'Academic Advisor', dueDate: '2026-02-10', status: 'completed' },
    ];
    for (const item of interventions) database.db.prepare(`INSERT INTO interventions (id, student_id, score_snapshot_id, category, title, rationale, owner, due_date, status, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), item.studentId, item.category, item.title, item.rationale, item.owner, item.dueDate, item.status, now, now);
  });
  insert();
}

function seedSubjectMetrics(database: Database, records: ReturnType<typeof buildSyntheticRecords>): void {
  const insert = database.db.prepare('INSERT OR IGNORE INTO subject_metrics (student_id, observed_at, subject_code, marks_percent, attendance_percent, source_batch_id) VALUES (?, ?, ?, ?, ?, ?)');
  const transaction = database.db.transaction(() => {
    for (const student of records) for (const subject of student.subjectMetrics) insert.run(student.studentId, student.observedAt, subject.subjectCode, subject.marksPercent, subject.attendancePercent, 'synthetic-demo-seed');
  });
  transaction();
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const database = new Database(process.env.DATABASE_PATH ?? './data/campusiq.db');
  database.initialize();
  seedDatabase(database);
  console.log(`Seeded ${buildSyntheticRecords().length} synthetic CampusIQ records.`);
  database.close();
}
