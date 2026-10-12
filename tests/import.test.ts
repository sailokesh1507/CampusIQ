import { describe, expect, it } from 'vitest';
import { validateUnifiedCsv } from '../src/import/validators.js';

describe('unified CSV validation', () => {
  it('normalizes a valid row and preserves blank values as null', () => {
    const result = validateUnifiedCsv('student_id,observed_at,cgpa,cgpa_scale,attendance_percent\nSYN-100,2026-01-15T00:00:00.000Z,8,10,\n');
    expect(result.errors).toHaveLength(0);
    expect(result.records[0].academic.cgpa).toBe(8);
    expect(result.records[0].attendance.overallPercent).toBeNull();
  });

  it('parses subject performance and subject-wise attendance into stable subject evidence', () => {
    const result = validateUnifiedCsv('student_id,observed_at,subject_performance,subject_attendance\nSYN-103,2026-01-15T00:00:00.000Z,"CS101:81;MATH101:73","CS101:90;MATH101:76"\n');
    expect(result.errors).toHaveLength(0);
    expect(result.records[0].subjectMetrics).toEqual([
      { subjectCode: 'CS101', marksPercent: 81, attendancePercent: 90 },
      { subjectCode: 'MATH101', marksPercent: 73, attendancePercent: 76 },
    ]);
  });

  it('reports missing scale, invalid ranges, malformed dates and duplicate observations', () => {
    const csv = 'student_id,observed_at,cgpa,marks_percent,attendance_percent\nSYN-101,2026-01-15T00:00:00.000Z,8,,120\nSYN-101,2026-01-15T00:00:00.000Z,,45,80\nSYN-102,not-a-date,,45,80\n';
    const result = validateUnifiedCsv(csv);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['required_or_invalid', 'out_of_range_or_invalid', 'missing_scale', 'duplicate_observation']));
    expect(result.records).toHaveLength(2);
  });

  it('rejects unsupported headers and rows without measurements', () => {
    const result = validateUnifiedCsv('student_id,observed_at,unknown_column\nSYN-102,2026-01-15T00:00:00.000Z,hello\n');
    expect(result.headersValid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['invalid_header', 'no_measurement']));
  });
});
