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
        semester INTEGER, active INTEGER NOT NULL DEFAULT 1, institution_id TEXT NOT NULL DEFAULT 'demo-institution', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS institutions (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        display_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'faculty',
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT,
        FOREIGN KEY(institution_id) REFERENCES institutions(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(institution_id, code), FOREIGN KEY(institution_id) REFERENCES institutions(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS programmes (
        id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, department_id TEXT NOT NULL,
        code TEXT NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(institution_id, code), FOREIGN KEY(institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
        FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
        request_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY(institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
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
      CREATE TABLE IF NOT EXISTS subject_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, observed_at TEXT NOT NULL,
        subject_code TEXT NOT NULL, marks_percent REAL, attendance_percent REAL, source_batch_id TEXT,
        UNIQUE(student_id, observed_at, subject_code),
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
        rejected_rows INTEGER NOT NULL DEFAULT 0, imported_at TEXT, initiated_by TEXT NOT NULL,
        institution_id TEXT NOT NULL DEFAULT 'demo-institution', initiated_by_user_id TEXT,
        payload_json TEXT, blocking_header_errors INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS import_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL, row_number INTEGER NOT NULL,
        field TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL, raw_value TEXT NOT NULL,
        FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS import_staged_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL, row_number INTEGER NOT NULL,
        record_json TEXT NOT NULL,
        FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);
      CREATE INDEX IF NOT EXISTS idx_students_institution ON students(institution_id);
      CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_programmes_department ON programmes(department_id);
      CREATE INDEX IF NOT EXISTS idx_audit_institution_created ON audit_logs(institution_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_subject_metrics_student_observed ON subject_metrics(student_id, observed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_interventions_status_due ON interventions(status, due_date);
      CREATE INDEX IF NOT EXISTS idx_import_staged_batch ON import_staged_records(batch_id, row_number);
    `);
    this.ensureColumn('import_batches', 'payload_json', 'TEXT');
    this.ensureColumn('import_batches', 'blocking_header_errors', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('students', 'institution_id', "TEXT NOT NULL DEFAULT 'demo-institution'");
    this.ensureColumn('interventions', 'institution_id', "TEXT NOT NULL DEFAULT 'demo-institution'");
    this.ensureColumn('interventions', 'created_by_user_id', 'TEXT');
    this.ensureColumn('interventions', 'updated_by_user_id', 'TEXT');
    this.ensureColumn('import_batches', 'institution_id', "TEXT NOT NULL DEFAULT 'demo-institution'");
    this.ensureColumn('import_batches', 'initiated_by_user_id', 'TEXT');
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  close(): void { this.db.close(); }
}
