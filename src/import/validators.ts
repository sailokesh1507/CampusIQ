import Papa from 'papaparse';
import { z } from 'zod';
import { isIsoDate, normalizeNullable } from '../analytics/normalize.js';
import type { ImportError, StudentRecord, SubjectMetric } from '../shared/types.js';

export const UNIFIED_HEADERS = [
  'student_id', 'display_name', 'department', 'programme', 'semester', 'observed_at', 'cgpa', 'cgpa_scale', 'marks_percent', 'backlogs', 'subject_performance',
  'attendance_percent', 'subject_attendance', 'lms_login_count', 'assignment_completion_percent', 'events_count', 'clubs_count', 'hackathons_count', 'certifications_count',
  'aptitude_score', 'coding_score', 'mock_interview_score', 'technical_skill_score', 'soft_skill_score', 'student_satisfaction', 'faculty_feedback',
] as const;

const numericFields: Record<string, { min?: number; max?: number; integer?: boolean }> = {
  semester: { min: 1, max: 12, integer: true }, cgpa: { min: 0 }, cgpa_scale: { min: 0.0001 }, marks_percent: { min: 0, max: 100 }, backlogs: { min: 0, integer: true },
  attendance_percent: { min: 0, max: 100 }, lms_login_count: { min: 0, integer: true }, assignment_completion_percent: { min: 0, max: 100 }, events_count: { min: 0, integer: true }, clubs_count: { min: 0, integer: true }, hackathons_count: { min: 0, integer: true }, certifications_count: { min: 0, integer: true },
  aptitude_score: { min: 0, max: 100 }, coding_score: { min: 0, max: 100 }, mock_interview_score: { min: 0, max: 100 }, technical_skill_score: { min: 0, max: 100 }, soft_skill_score: { min: 0, max: 100 }, student_satisfaction: { min: 1, max: 5 },
};

const rowSchema = z.object({ studentId: z.string().min(1), observedAt: z.string().refine(isIsoDate, 'must be an ISO date') });

export interface ValidatedImport {
  records: StudentRecord[];
  recordRows: Array<{ rowNumber: number; record: StudentRecord }>;
  errors: ImportError[];
  totalRows: number;
  headersValid: boolean;
}

function value(row: Record<string, string>, key: string): string | null {
  const raw = row[key];
  return raw === undefined || raw.trim() === '' ? null : raw.trim();
}
function number(row: Record<string, string>, key: string): number | null { return normalizeNullable(value(row, key)); }

function subjectMap(raw: string | null, field: string, rowNumber: number, errors: ImportError[]): Map<string, number> {
  const results = new Map<string, number>();
  if (raw === null) return results;
  for (const entry of raw.split(';').map((item) => item.trim()).filter(Boolean)) {
    const [codeRaw, scoreRaw, ...extra] = entry.split(':').map((item) => item.trim());
    const score = Number(scoreRaw);
    const code = codeRaw?.toUpperCase();
    if (!code || !scoreRaw || extra.length || !Number.isFinite(score) || score < 0 || score > 100) {
      errors.push({ rowNumber, field, code: 'invalid_subject_value', message: `${field} entries must use SUBJECT_CODE:0-100 separated by semicolons.`, rawValue: entry });
      continue;
    }
    if (results.has(code)) {
      errors.push({ rowNumber, field, code: 'duplicate_subject', message: `Subject '${code}' appears more than once in ${field}.`, rawValue: entry });
      continue;
    }
    results.set(code, score);
  }
  return results;
}

export function validateUnifiedCsv(csv: string): ValidatedImport {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: (header) => header.trim() });
  const headers = parsed.meta.fields ?? [];
  const errors: ImportError[] = parsed.errors.map((error) => ({ rowNumber: (error.row ?? 0) + 2, field: 'row', code: 'csv_parse_error', message: error.message, rawValue: '' }));
  const unknownHeaders = headers.filter((header) => !UNIFIED_HEADERS.includes(header as (typeof UNIFIED_HEADERS)[number]));
  for (const header of unknownHeaders) errors.push({ rowNumber: 1, field: header, code: 'invalid_header', message: `Header '${header}' is not supported by the unified template.`, rawValue: header });
  for (const required of ['student_id', 'observed_at']) if (!headers.includes(required)) errors.push({ rowNumber: 1, field: required, code: 'missing_header', message: `Required header '${required}' is missing.`, rawValue: '' });
  const records: StudentRecord[] = [];
  const recordRows: Array<{ rowNumber: number; record: StudentRecord }> = [];
  const seen = new Set<string>();
  const rows = parsed.data;
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const studentId = value(row, 'student_id');
    const observedAt = value(row, 'observed_at');
    const parsedBase = rowSchema.safeParse({ studentId, observedAt });
    if (!parsedBase.success) {
      for (const issue of parsedBase.error.issues) errors.push({ rowNumber, field: issue.path[0] === 'studentId' ? 'student_id' : 'observed_at', code: 'required_or_invalid', message: issue.message, rawValue: value(row, String(issue.path[0])) ?? '' });
      return;
    }
    const duplicateKey = `${studentId!.toLowerCase()}|${observedAt}`;
    if (seen.has(duplicateKey)) errors.push({ rowNumber, field: 'student_id', code: 'duplicate_observation', message: 'Duplicate student_id and observed_at in this batch.', rawValue: studentId! });
    seen.add(duplicateKey);
    for (const [field, rule] of Object.entries(numericFields)) {
      const raw = value(row, field);
      if (raw === null) continue;
      const parsedNumber = Number(raw);
      if (!Number.isFinite(parsedNumber) || (rule.integer && !Number.isInteger(parsedNumber)) || rule.min !== undefined && parsedNumber < rule.min || rule.max !== undefined && parsedNumber > rule.max) {
        errors.push({ rowNumber, field, code: 'out_of_range_or_invalid', message: `${field} must be a ${rule.integer ? 'whole ' : ''}number${rule.min !== undefined ? ` ≥ ${rule.min}` : ''}${rule.max !== undefined ? ` and ≤ ${rule.max}` : ''}.`, rawValue: raw });
      }
    }
    if (value(row, 'cgpa') !== null && value(row, 'cgpa_scale') === null) errors.push({ rowNumber, field: 'cgpa_scale', code: 'missing_scale', message: 'cgpa_scale is required when cgpa is supplied; the platform never assumes a 10-point scale.', rawValue: '' });
    const subjectPerformance = subjectMap(value(row, 'subject_performance'), 'subject_performance', rowNumber, errors);
    const subjectAttendance = subjectMap(value(row, 'subject_attendance'), 'subject_attendance', rowNumber, errors);
    const measurable = ['cgpa', 'marks_percent', 'backlogs', 'attendance_percent', 'subject_performance', 'subject_attendance', 'lms_login_count', 'assignment_completion_percent', 'events_count', 'clubs_count', 'hackathons_count', 'certifications_count', 'aptitude_score', 'coding_score', 'mock_interview_score', 'technical_skill_score', 'soft_skill_score', 'student_satisfaction'].some((field) => value(row, field) !== null);
    if (!measurable) errors.push({ rowNumber, field: 'row', code: 'no_measurement', message: 'At least one measurable domain value is required.', rawValue: '' });
    const record: StudentRecord = {
      studentId: studentId!, displayName: value(row, 'display_name') ?? `Imported student ${studentId}`,
      email: null, department: value(row, 'department') ?? 'Unassigned', programme: value(row, 'programme') ?? 'Unassigned', semester: number(row, 'semester'), active: true, observedAt: observedAt!,
      academic: { cgpa: number(row, 'cgpa'), cgpaScale: number(row, 'cgpa_scale'), marksPercent: number(row, 'marks_percent'), backlogs: number(row, 'backlogs') },
      attendance: { overallPercent: number(row, 'attendance_percent') }, subjectMetrics: Array.from(new Set([...subjectPerformance.keys(), ...subjectAttendance.keys()])).sort().map((subjectCode): SubjectMetric => ({ subjectCode, marksPercent: subjectPerformance.get(subjectCode) ?? null, attendancePercent: subjectAttendance.get(subjectCode) ?? null })), lms: { loginCount: number(row, 'lms_login_count'), assignmentCompletionPercent: number(row, 'assignment_completion_percent') },
      engagement: { eventsCount: number(row, 'events_count'), clubsCount: number(row, 'clubs_count'), hackathonsCount: number(row, 'hackathons_count'), certificationsCount: number(row, 'certifications_count') },
      placement: { aptitudeScore: number(row, 'aptitude_score'), codingScore: number(row, 'coding_score'), mockInterviewScore: number(row, 'mock_interview_score') },
      skills: { technicalScore: number(row, 'technical_skill_score'), softSkillScore: number(row, 'soft_skill_score') }, feedback: { studentSatisfaction: number(row, 'student_satisfaction'), facultyFeedback: value(row, 'faculty_feedback') },
    };
    records.push(record);
    recordRows.push({ rowNumber, record });
  });
  return { records, recordRows, errors, totalRows: rows.length, headersValid: unknownHeaders.length === 0 && headers.includes('student_id') && headers.includes('observed_at') };
}
