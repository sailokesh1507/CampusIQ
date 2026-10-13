import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { calculateScore } from '../analytics/scoring.js';
import { getSegments, SEGMENT_DEFINITIONS } from '../analytics/segments.js';
import { METHODOLOGY } from '../shared/methodology.js';
import type { DashboardData, Intervention, StudentRecord, StudentSummary } from '../shared/types.js';
import { Database } from '../db/connection.js';
import { seedDatabase } from '../db/seed.js';
import { audit, authConfig, DEMO_INSTITUTION_ID, authMiddleware, clearSessionCookie, createSession, currentSessionToken, demoCredentials, findUserByEmail, requireRole, setSessionCookie, verifyPassword, deleteSession } from '../auth/auth.js';
import { unifiedTemplate } from '../import/templates.js';
import { validateUnifiedCsv } from '../import/validators.js';
import { getIntervention, getRecord, getRecords, getSnapshotId, listInterventions, refreshSnapshots, toSummary, upsertRecord } from './repository.js';

interface AppOptions { databasePath: string; staticPath?: string; }
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const interventionSchema = z.object({
  studentId: z.string().min(1), category: z.enum(['academic', 'attendance', 'learning', 'placement', 'wellbeing_referral', 'other']), title: z.string().trim().min(1).max(160), rationale: z.string().trim().min(1).max(2000), owner: z.string().trim().min(1).max(120), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).default('open'), scoreSnapshotId: z.string().nullable().optional(),
});

const response = (res: Response, data: unknown, status = 200) => res.status(status).json({ data });
const failure = (res: Response, code: string, message: string, status = 400, fieldErrors?: unknown) => res.status(status).json({ error: { code, message, ...(fieldErrors ? { fieldErrors } : {}), requestId: res.locals.requestId ?? null } });
const median = (values: number[]): number | null => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return Number((sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2).toFixed(1)); };

function matches(record: StudentRecord, summary: StudentSummary, query: Record<string, string>): boolean {
  const q = query.q?.toLowerCase();
  if (q && !`${record.studentId} ${record.displayName} ${record.department} ${record.programme}`.toLowerCase().includes(q)) return false;
  if (query.department && record.department !== query.department) return false;
  if (query.programme && record.programme !== query.programme) return false;
  if (query.semester && String(record.semester) !== query.semester) return false;
  if (query.signal && !summary.signals.includes(query.signal as StudentSummary['signals'][number])) return false;
  if (query.segment && !summary.segments.includes(query.segment as StudentSummary['segments'][number])) return false;
  if (query.minScore && (summary.score === null || summary.score < Number(query.minScore))) return false;
  if (query.maxScore && (summary.score === null || summary.score > Number(query.maxScore))) return false;
  if (query.coverage === 'insufficient' && summary.coverage >= 60) return false;
  if (query.coverage === 'assessed' && summary.coverage < 60) return false;
  return true;
}

function filteredRows(database: Database, query: Record<string, string>): Array<{ record: StudentRecord; summary: StudentSummary }> {
  return getRecords(database).map((record) => ({ record, summary: toSummary(record) })).filter(({ record, summary }) => matches(record, summary, query));
}

function dashboard(database: Database, query: Record<string, string>): DashboardData {
  const rows = filteredRows(database, query);
  const summaries = rows.map((row) => row.summary);
  const scoreValues = summaries.flatMap((item) => item.score === null ? [] : [item.score]);
  const signals = (key: StudentSummary['signals'][number]) => summaries.filter((item) => item.signals.includes(key)).length;
  const segmentCounts = SEGMENT_DEFINITIONS.map((definition) => ({ ...definition, count: summaries.filter((item) => item.segments.includes(definition.key)).length }));
  return {
    kpis: {
      totalStudents: summaries.length, assessedStudents: scoreValues.length, coveragePercent: summaries.length ? Number((summaries.reduce((sum, item) => sum + item.coverage, 0) / summaries.length).toFixed(1)) : 0,
      medianScore: median(scoreValues), needsReview: summaries.filter((item) => item.supportLevel === 'needs_review').length, watch: summaries.filter((item) => item.supportLevel === 'watch').length,
      academicSignals: signals('academic'), attendanceSignals: signals('attendance'), placementSignals: signals('placement'), learningSignals: signals('learning'),
    },
    distribution: [
      { label: 'Needs review', count: summaries.filter((item) => item.supportLevel === 'needs_review').length, color: '#dc6b55' },
      { label: 'Watch', count: summaries.filter((item) => item.supportLevel === 'watch').length, color: '#d49b45' },
      { label: 'No immediate signal', count: summaries.filter((item) => item.supportLevel === 'none').length, color: '#2c9d8f' },
      { label: 'Insufficient data', count: summaries.filter((item) => item.supportLevel === 'insufficient').length, color: '#8b98a8' },
    ],
    segments: segmentCounts.map(({ key, label, count, description }) => ({ key, label, count, description })),
    reviewQueue: summaries.filter((item) => item.supportLevel === 'needs_review' || item.supportLevel === 'watch').sort((a, b) => (a.score ?? 101) - (b.score ?? 101)).slice(0, 8),
    filtersApplied: query,
  };
}

function parseRowsForCommit(validation: ReturnType<typeof validateUnifiedCsv>): StudentRecord[] {
  const invalidRows = new Set(validation.errors.filter((error) => error.rowNumber > 1).map((error) => error.rowNumber));
  return validation.recordRows.filter(({ rowNumber }) => !invalidRows.has(rowNumber)).map(({ record }) => record);
}

export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  const database = new Database(options.databasePath);
  database.initialize();
  seedDatabase(database);
  refreshSnapshots(database);

  app.use(cors({ credentials: true }));
  app.use((req, res, next) => {
    const requestId = req.header('x-request-id')?.trim() || randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(authMiddleware(database));
  app.get('/healthz', (_req: Request, res: Response) => response(res, { status: 'ok', service: 'campusiq', database: 'ready' }));
  app.get('/api/health', (_req: Request, res: Response) => response(res, { status: 'ok' }));

  app.get('/api/auth/config', (_req, res) => response(res, authConfig()));
  app.get('/api/auth/me', (req, res) => response(res, { user: req.authUser ?? null }));
  app.post('/api/auth/login', (req, res) => {
    const parsed = z.object({ email: z.string().trim().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return failure(res, 'invalid_credentials', 'Enter a valid email and password.', 401);
    const row = findUserByEmail(database, parsed.data.email);
    if (!row || !row.active || !verifyPassword(parsed.data.password, row.password_hash)) return failure(res, 'invalid_credentials', 'The email or password is not correct.', 401);
    const session = createSession(database, row.id);
    const now = new Date().toISOString();
    database.db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id);
    setSessionCookie(res, session.token, session.expiresAt);
    const user = { id: row.id, email: row.email, displayName: row.display_name, role: row.role, institutionId: row.institution_id, institutionName: row.institution_name };
    audit(database, req, 'auth.login', 'user', row.id, { email: row.email });
    return response(res, { user, expiresAt: session.expiresAt });
  });
  app.post('/api/auth/demo', (req, res) => {
    if (!authConfig().demoAccess) return failure(res, 'demo_access_unavailable', 'The fictional demo workspace is not available.', 503);
    const credentials = demoCredentials();
    const row = findUserByEmail(database, credentials.email);
    if (!row || !row.active || !verifyPassword(credentials.password, row.password_hash)) return failure(res, 'demo_access_unavailable', 'The fictional demo workspace is not available.', 503);
    const session = createSession(database, row.id);
    setSessionCookie(res, session.token, session.expiresAt);
    const user = { id: row.id, email: row.email, displayName: row.display_name, role: row.role, institutionId: row.institution_id, institutionName: row.institution_name };
    audit(database, req, 'auth.demo_login', 'user', row.id);
    return response(res, { user, expiresAt: session.expiresAt });
  });
  app.post('/api/auth/logout', (req, res) => {
    const token = currentSessionToken(req);
    if (token) { const userId = req.authUser?.id ?? null; deleteSession(database, token); if (userId) audit(database, req, 'auth.logout', 'user', userId); }
    clearSessionCookie(res);
    return response(res, { loggedOut: true });
  });

  app.get('/api/catalog', (req, res) => {
    const institutionId = req.authUser?.institutionId ?? DEMO_INSTITUTION_ID;
    const departments = database.db.prepare('SELECT id, code, name, active FROM departments WHERE institution_id = ? ORDER BY name').all(institutionId);
    const programmes = database.db.prepare(`SELECT p.id, p.code, p.name, p.department_id AS departmentId, d.code AS departmentCode, p.active
      FROM programmes p JOIN departments d ON d.id = p.department_id WHERE p.institution_id = ? ORDER BY p.name`).all(institutionId);
    return response(res, { departments, programmes });
  });
  app.post('/api/catalog/departments', requireRole('admin', 'coordinator'), (req, res) => {
    const parsed = z.object({ code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/), name: z.string().trim().min(2).max(120) }).safeParse(req.body);
    if (!parsed.success) return failure(res, 'validation_error', 'Department code and name are required.', 400, parsed.error.flatten().fieldErrors);
    const institutionId = req.authUser!.institutionId; const id = randomUUID(); const now = new Date().toISOString();
    try { database.db.prepare('INSERT INTO departments (id, institution_id, code, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)').run(id, institutionId, parsed.data.code.toUpperCase(), parsed.data.name, now, now); }
    catch { return failure(res, 'catalog_conflict', 'A department with that code already exists.', 409); }
    audit(database, req, 'catalog.department.create', 'department', id, parsed.data); return response(res, { id, code: parsed.data.code.toUpperCase(), name: parsed.data.name, active: true }, 201);
  });
  app.post('/api/catalog/programmes', requireRole('admin', 'coordinator'), (req, res) => {
    const parsed = z.object({ code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/), name: z.string().trim().min(2).max(120), departmentCode: z.string().trim().min(2).max(24) }).safeParse(req.body);
    if (!parsed.success) return failure(res, 'validation_error', 'Programme code, name and department code are required.', 400, parsed.error.flatten().fieldErrors);
    const department = database.db.prepare('SELECT id FROM departments WHERE institution_id = ? AND code = ? COLLATE NOCASE').get(req.authUser!.institutionId, parsed.data.departmentCode) as { id: string } | undefined;
    if (!department) return failure(res, 'unknown_department', 'Create the department before adding a programme.', 422);
    const id = randomUUID(); const now = new Date().toISOString();
    try { database.db.prepare('INSERT INTO programmes (id, institution_id, department_id, code, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(id, req.authUser!.institutionId, department.id, parsed.data.code.toUpperCase(), parsed.data.name, now, now); }
    catch { return failure(res, 'catalog_conflict', 'A programme with that code already exists.', 409); }
    audit(database, req, 'catalog.programme.create', 'programme', id, parsed.data); return response(res, { id, code: parsed.data.code.toUpperCase(), name: parsed.data.name, departmentId: department.id, active: true }, 201);
  });

  app.get('/api/dashboard', (req, res) => response(res, dashboard(database, req.query as Record<string, string>)));
  app.get('/api/students', (req, res) => {
    const query = req.query as Record<string, string>;
    const rows = filteredRows(database, query);
    const sort = query.sort ?? 'score';
    rows.sort((a, b) => {
      if (sort === 'name') return a.record.displayName.localeCompare(b.record.displayName);
      if (sort === 'coverage') return b.summary.coverage - a.summary.coverage;
      return (a.summary.score ?? -1) - (b.summary.score ?? -1);
    });
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 100)));
    return response(res, { items: rows.slice((page - 1) * pageSize, page * pageSize).map((item) => item.summary), total: rows.length, page, pageSize });
  });
  app.get('/api/students/:studentId', (req, res) => {
    const record = getRecord(database, req.params.studentId);
    if (!record) return failure(res, 'not_found', 'Student was not found.', 404);
    const explanation = calculateScore(record);
    return response(res, { record, explanation, segments: getSegments(record, explanation), interventions: listInterventions(database).filter((item) => item.studentId.toLowerCase() === record.studentId.toLowerCase()) });
  });
  app.get('/api/segments', (req, res) => {
    const rows = filteredRows(database, req.query as Record<string, string>);
    return response(res, { definitions: SEGMENT_DEFINITIONS, cohorts: SEGMENT_DEFINITIONS.map((definition) => ({ ...definition, count: rows.filter((row) => row.summary.segments.includes(definition.key)).length, students: rows.filter((row) => row.summary.segments.includes(definition.key)).map((row) => row.summary) })) });
  });
  app.get('/api/methodology', (_req, res) => response(res, { ...METHODOLOGY, formula: 'Score = sum(component × published weight) / sum(weights for present components)', componentNotes: { academic: '60% normalized CGPA + 40% marks/subject average, with up to 20 points for backlogs.', attendance: 'Overall attendance, or subject mean when available.', learning: '60% LMS + 25% engagement + 15% skills, reweighted across supplied groups.', placement: '40% aptitude + 35% coding + 25% mock interview, reweighted across supplied tests.' }, excludedFromScore: ['Faculty feedback text', 'Student satisfaction'], missingData: 'Blank optional fields remain NULL. A score is withheld below 60% top-level component coverage.' }));
  app.post('/api/analytics/refresh', (_req, res) => response(res, { recalculatedStudents: refreshSnapshots(database), algorithmVersion: METHODOLOGY.version }));

  app.get('/api/import/templates/unified', (_req, res) => { res.type('text/csv').send(unifiedTemplate()); });
  app.post('/api/imports/validate', upload.single('file'), (req, res) => {
    if (!req.file) return failure(res, 'missing_file', 'Attach a CSV file in the file field.', 400);
    const mode = req.body.mode === 'partial' ? 'partial' : 'atomic';
    const validation = validateUnifiedCsv(req.file.buffer.toString('utf8'));
    const batchId = randomUUID();
    const accepted = parseRowsForCommit(validation);
    const stage = database.db.transaction(() => {
      database.db.prepare('INSERT INTO import_batches (id, source_type, filename, mode, status, total_rows, accepted_rows, rejected_rows, initiated_by, institution_id, initiated_by_user_id, payload_json, blocking_header_errors) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(batchId, 'unified', req.file!.originalname, mode, 'validated', validation.totalRows, accepted.length, validation.totalRows - accepted.length, req.authUser?.displayName ?? 'Demo faculty', req.authUser?.institutionId ?? DEMO_INSTITUTION_ID, req.authUser?.id ?? null, JSON.stringify(accepted), validation.headersValid ? 0 : 1);
      const insertError = database.db.prepare('INSERT INTO import_errors (batch_id, row_number, field, code, message, raw_value) VALUES (?, ?, ?, ?, ?, ?)');
      for (const error of validation.errors) insertError.run(batchId, error.rowNumber, error.field, error.code, error.message, error.rawValue);
      const insertStaged = database.db.prepare('INSERT INTO import_staged_records (batch_id, row_number, record_json) VALUES (?, ?, ?)');
      for (const { rowNumber, record } of validation.recordRows) {
        if (!validation.errors.some((error) => error.rowNumber === rowNumber)) insertStaged.run(batchId, rowNumber, JSON.stringify(record));
      }
    });
    stage();
    audit(database, req, 'import.validate', 'import_batch', batchId, { filename: req.file.originalname, acceptedRows: accepted.length, rejectedRows: validation.totalRows - accepted.length });
    return response(res, { batchId, status: 'validated', totalRows: validation.totalRows, acceptedRows: accepted.length, rejectedRows: validation.totalRows - accepted.length, errors: validation.errors }, 201);
  });
  app.post('/api/imports/:batchId/commit', (req, res) => {
    const batch = database.db.prepare('SELECT * FROM import_batches WHERE id = ?').get(req.params.batchId) as { status: string; rejected_rows: number; mode: 'atomic' | 'partial'; payload_json: string | null; blocking_header_errors: number } | undefined;
    if (!batch) return failure(res, 'batch_not_found', 'Import batch does not exist.', 404);
    if (batch.status !== 'validated') return failure(res, 'batch_not_committable', 'This import batch has already been committed or is no longer available for commit.', 409);
    const hasHeaderErrors = Boolean((database.db.prepare('SELECT 1 FROM import_errors WHERE batch_id = ? AND row_number = 1 LIMIT 1').get(req.params.batchId)));
    if (batch.blocking_header_errors || hasHeaderErrors) return failure(res, 'blocking_errors', 'The CSV header contract is invalid. Download the unified template and correct the headers before committing.', 422);
    if (batch.rejected_rows > 0 && batch.mode === 'atomic') return failure(res, 'blocking_errors', 'Atomic import cannot commit while row errors remain. Choose partial mode after reviewing the errors.', 422);
    const stagedRows = database.db.prepare('SELECT record_json as recordJson FROM import_staged_records WHERE batch_id = ? ORDER BY row_number').all(req.params.batchId) as Array<{ recordJson: string }>;
    let records = stagedRows.map(({ recordJson }) => JSON.parse(recordJson) as StudentRecord);
    if (!records.length) {
      try { records = JSON.parse(batch.payload_json ?? '[]') as StudentRecord[]; } catch { return failure(res, 'invalid_batch_payload', 'Validated import payload could not be restored. Validate the CSV again.', 409); }
    }
    if (!records.length) return failure(res, 'empty_import', 'No valid CSV rows are available to commit.', 422);
    const commit = database.db.transaction(() => { for (const record of records) upsertRecord(database, record, req.params.batchId); database.db.prepare('UPDATE import_batches SET status = ?, imported_at = ? WHERE id = ?').run('committed', new Date().toISOString(), req.params.batchId); });
    commit();
    refreshSnapshots(database);
    audit(database, req, 'import.commit', 'import_batch', req.params.batchId, { importedRows: records.length });
    return response(res, { batchId: req.params.batchId, status: 'committed', importedRows: records.length, recalculatedStudents: getRecords(database).length });
  });
  app.get('/api/imports', (_req, res) => response(res, database.db.prepare('SELECT * FROM import_batches ORDER BY COALESCE(imported_at, rowid) DESC').all()));
  app.get('/api/imports/:batchId/errors', (req, res) => response(res, database.db.prepare('SELECT row_number as rowNumber, field, code, message, raw_value as rawValue FROM import_errors WHERE batch_id = ? ORDER BY row_number, id').all(req.params.batchId)));

  app.get('/api/interventions', (_req, res) => response(res, listInterventions(database)));
  app.post('/api/interventions', (req, res) => {
    const parsed = interventionSchema.safeParse(req.body);
    if (!parsed.success) return failure(res, 'validation_error', 'Review the required intervention fields.', 400, parsed.error.flatten().fieldErrors);
    if (!getRecord(database, parsed.data.studentId)) return failure(res, 'unknown_student', 'The selected student does not exist.', 422, { studentId: ['Unknown student ID'] });
    const id = randomUUID(); const now = new Date().toISOString();
    database.db.prepare('INSERT INTO interventions (id, student_id, score_snapshot_id, category, title, rationale, owner, due_date, status, institution_id, created_by_user_id, updated_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, parsed.data.studentId, parsed.data.scoreSnapshotId ?? getSnapshotId(database, parsed.data.studentId), parsed.data.category, parsed.data.title, parsed.data.rationale, parsed.data.owner, parsed.data.dueDate, parsed.data.status, req.authUser?.institutionId ?? DEMO_INSTITUTION_ID, req.authUser?.id ?? null, req.authUser?.id ?? null, now, now);
    audit(database, req, 'intervention.create', 'intervention', id, { studentId: parsed.data.studentId, category: parsed.data.category });
    return response(res, getIntervention(database, id), 201);
  });
  app.patch('/api/interventions/:id', (req, res) => {
    const current = getIntervention(database, req.params.id);
    if (!current) return failure(res, 'not_found', 'Intervention was not found.', 404);
    const patch = z.object({ title: z.string().trim().min(1).max(160).optional(), rationale: z.string().trim().min(1).max(2000).optional(), owner: z.string().trim().min(1).max(120).optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(), actor: z.string().trim().min(1).max(120).default('Faculty reviewer') }).safeParse(req.body);
    if (!patch.success) return failure(res, 'validation_error', 'Invalid intervention update.', 400, patch.error.flatten().fieldErrors);
    const transitions: Record<Intervention['status'], Intervention['status'][]> = { open: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] };
    if (patch.data.status && patch.data.status !== current.status && !transitions[current.status].includes(patch.data.status)) return failure(res, 'invalid_transition', `An intervention in ${current.status} cannot move to ${patch.data.status}.`, 422);
    const updated = { ...current, ...patch.data }; const now = new Date().toISOString();
    database.db.prepare('UPDATE interventions SET title = ?, rationale = ?, owner = ?, due_date = ?, status = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?').run(updated.title, updated.rationale, updated.owner, updated.dueDate, updated.status, req.authUser?.id ?? null, now, current.id);
    if (patch.data.status && patch.data.status !== current.status) {
      database.db.prepare('INSERT INTO intervention_notes (id, intervention_id, body, author, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), current.id, `Status changed from ${current.status} to ${patch.data.status}.`, req.authUser?.displayName ?? patch.data.actor, now);
    }
    audit(database, req, 'intervention.update', 'intervention', current.id, { status: updated.status });
    return response(res, getIntervention(database, current.id));
  });
  app.post('/api/interventions/:id/notes', (req, res) => {
    const current = getIntervention(database, req.params.id);
    if (!current) return failure(res, 'not_found', 'Intervention was not found.', 404);
    const parsed = z.object({ body: z.string().trim().min(1).max(2000), author: z.string().trim().min(1).max(120).default('Faculty reviewer') }).safeParse(req.body);
    if (!parsed.success) return failure(res, 'validation_error', 'A note body is required and must be under 2,000 characters.', 400, parsed.error.flatten().fieldErrors);
    const author = req.authUser?.displayName ?? parsed.data.author;
    database.db.prepare('INSERT INTO intervention_notes (id, intervention_id, body, author, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), current.id, parsed.data.body, author, new Date().toISOString());
    audit(database, req, 'intervention.note.create', 'intervention', current.id);
    return response(res, getIntervention(database, current.id));
  });

  if (options.staticPath) {
    app.use(express.static(options.staticPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(path.join(options.staticPath!, 'index.html'));
      next();
    });
  }
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    console.error(`[CampusIQ ${res.locals.requestId ?? 'unknown'}]`, error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return failure(res, 'upload_too_large', 'CSV uploads must be 2 MB or smaller.', 413);
    }
    if (error instanceof SyntaxError) {
      return failure(res, 'invalid_json', 'The request body is not valid JSON.', 400);
    }
    return failure(res, 'internal_error', 'CampusIQ could not complete the request.', 500);
  });
  return app;
}
