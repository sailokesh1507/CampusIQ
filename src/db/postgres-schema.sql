-- CampusIQ production schema
-- Apply with: npm run db:migrate:postgres
-- This schema is intentionally separate from the SQLite demo schema.

CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'faculty', 'coordinator', 'viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, code)
);

CREATE TABLE IF NOT EXISTS programmes (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, code)
);

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  programme_id UUID REFERENCES programmes(id) ON DELETE SET NULL,
  semester INTEGER CHECK (semester BETWEEN 1 AND 12),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, student_id)
);

CREATE TABLE IF NOT EXISTS academic_metrics (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  cgpa NUMERIC,
  cgpa_scale NUMERIC,
  marks_percent NUMERIC CHECK (marks_percent BETWEEN 0 AND 100),
  backlogs INTEGER CHECK (backlogs >= 0),
  source_batch_id UUID,
  UNIQUE (student_id, observed_at)
);

CREATE TABLE IF NOT EXISTS attendance_metrics (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  overall_percent NUMERIC CHECK (overall_percent BETWEEN 0 AND 100),
  source_batch_id UUID,
  UNIQUE (student_id, observed_at)
);

CREATE TABLE IF NOT EXISTS subject_metrics (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  subject_code TEXT NOT NULL,
  marks_percent NUMERIC CHECK (marks_percent BETWEEN 0 AND 100),
  attendance_percent NUMERIC CHECK (attendance_percent BETWEEN 0 AND 100),
  source_batch_id UUID,
  UNIQUE (student_id, observed_at, subject_code)
);

CREATE TABLE IF NOT EXISTS lms_metrics (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  login_count INTEGER CHECK (login_count >= 0),
  assignment_completion_percent NUMERIC CHECK (assignment_completion_percent BETWEEN 0 AND 100),
  source_batch_id UUID,
  UNIQUE (student_id, observed_at)
);

CREATE TABLE IF NOT EXISTS engagement_metrics (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  events_count INTEGER CHECK (events_count >= 0),
  clubs_count INTEGER CHECK (clubs_count >= 0),
  hackathons_count INTEGER CHECK (hackathons_count >= 0),
  certifications_count INTEGER CHECK (certifications_count >= 0),
  source_batch_id UUID,
  UNIQUE (student_id, observed_at)
);

CREATE TABLE IF NOT EXISTS placement_metrics (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  aptitude_score NUMERIC CHECK (aptitude_score BETWEEN 0 AND 100),
  coding_score NUMERIC CHECK (coding_score BETWEEN 0 AND 100),
  mock_interview_score NUMERIC CHECK (mock_interview_score BETWEEN 0 AND 100),
  source_batch_id UUID,
  UNIQUE (student_id, observed_at)
);

CREATE TABLE IF NOT EXISTS skills_metrics (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  technical_score NUMERIC CHECK (technical_score BETWEEN 0 AND 100),
  soft_skill_score NUMERIC CHECK (soft_skill_score BETWEEN 0 AND 100),
  source_batch_id UUID,
  UNIQUE (student_id, observed_at)
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  student_satisfaction NUMERIC CHECK (student_satisfaction BETWEEN 1 AND 5),
  faculty_feedback TEXT,
  source_batch_id UUID,
  UNIQUE (student_id, observed_at)
);

CREATE TABLE IF NOT EXISTS score_snapshots (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  calculated_at TIMESTAMPTZ NOT NULL,
  success_score NUMERIC,
  coverage_percent NUMERIC NOT NULL,
  support_level TEXT NOT NULL CHECK (support_level IN ('insufficient', 'none', 'watch', 'needs_review')),
  explanation_json JSONB NOT NULL,
  algorithm_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interventions (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score_snapshot_id UUID REFERENCES score_snapshots(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('academic', 'attendance', 'learning', 'placement', 'wellbeing_referral', 'other')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  owner TEXT NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intervention_notes (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('atomic', 'partial')),
  status TEXT NOT NULL CHECK (status IN ('validating', 'validated', 'committed', 'failed')),
  total_rows INTEGER NOT NULL,
  accepted_rows INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,
  initiated_by TEXT NOT NULL,
  initiated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload_json JSONB,
  blocking_header_errors BOOLEAN NOT NULL DEFAULT FALSE,
  imported_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_errors (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  field TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  raw_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_staged_records (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  record_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_students_institution ON students(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_department_programme ON students(department_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_metrics_student_observed ON academic_metrics(student_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_subject_metrics_student_observed ON subject_metrics(student_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_snapshots_student_calculated ON score_snapshots(student_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_status_due ON interventions(status, due_date);
CREATE INDEX IF NOT EXISTS idx_audit_institution_created ON audit_logs(institution_id, created_at DESC);
