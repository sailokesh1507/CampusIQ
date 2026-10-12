import fs from 'node:fs';
import path from 'node:path';
import DatabaseDriver from 'better-sqlite3';

export class Database {
  readonly db: DatabaseDriver.Database;

  constructor(databasePath: string) {
    const resolved = databasePath === ':memory:' ? databasePath : path.resolve(databasePath);
    if (resolved !== ':memory:') fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new DatabaseDriver(resolved);
    this.db.pragma('foreign_keys = ON');
  }

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL, email TEXT, department TEXT NOT NULL, programme TEXT NOT NULL,
        semester INTEGER, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS academic_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, observed_at TEXT NOT NULL,
        cgpa REAL, cgpa_scale REAL, marks_percent REAL, backlogs INTEGER, source_batch_id TEXT,
        UNIQUE(student_id, observed_at), FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS attendance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, observed_at TEXT NOT NULL,
        overall_percent REAL, source_batch_id TEXT, UNIQUE(student_id, observed_at),
        FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS lms_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, observed_at TEXT NOT NULL,
        login_count INTEGER, assignment_completion_percent REAL, source_batch_id TEXT,
        UNIQUE(student_id, observed_at), FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS engagement_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, observed_at TEXT NOT NULL,
        events_count INTEGER, clubs_count INTEGER, hackathons_count INTEGER, certifications_count INTEGER, source_batch_id TEXT,
        UNIQUE(student_id, observed_at), FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS placement_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, observed_at TEXT NOT NULL,
        aptitude_score REAL, coding_score REAL, mock_interview_score REAL, source_batch_id TEXT,
        UNIQUE(student_id, observed_at), FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS skills_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, observed_at TEXT NOT NULL,
        technical_score REAL, soft_skill_score REAL, source_batch_id TEXT,
        UNIQUE(student_id, observed_at), FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, observed_at TEXT NOT NULL,
        student_satisfaction REAL, faculty_feedback TEXT, source_batch_id TEXT,
        UNIQUE(student_id, observed_at), FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS score_snapshots (
        id TEXT PRIMARY KEY, student_id TEXT NOT NULL, calculated_at TEXT NOT NULL, success_score REAL,
        coverage_percent REAL NOT NULL, support_level TEXT NOT NULL, explanation_json TEXT NOT NULL,
        algorithm_version TEXT NOT NULL, FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS interventions (
        id TEXT PRIMARY KEY, student_id TEXT NOT NULL, score_snapshot_id TEXT, category TEXT NOT NULL,
        title TEXT NOT NULL, rationale TEXT NOT NULL, owner TEXT NOT NULL, due_date TEXT NOT NULL,
        status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS intervention_notes (
        id TEXT PRIMARY KEY, intervention_id TEXT NOT NULL, body TEXT NOT NULL, author TEXT NOT NULL,
        created_at TEXT NOT NULL, FOREIGN KEY(intervention_id) REFERENCES interventions(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY, source_type TEXT NOT NULL, filename TEXT NOT NULL, mode TEXT NOT NULL,
        status TEXT NOT NULL, total_rows INTEGER NOT NULL, accepted_rows INTEGER NOT NULL DEFAULT 0,
        rejected_rows INTEGER NOT NULL DEFAULT 0, imported_at TEXT, initiated_by TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS import_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL, row_number INTEGER NOT NULL,
        field TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL, raw_value TEXT NOT NULL,
        FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);
      CREATE INDEX IF NOT EXISTS idx_interventions_status_due ON interventions(status, due_date);
    `);
  }

  close(): void { this.db.close(); }
}
