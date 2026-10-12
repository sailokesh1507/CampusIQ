import { describe, expect, it } from 'vitest';
import { calculateScore } from '../src/analytics/scoring.js';
import type { StudentRecord } from '../src/shared/types.js';

function fixture(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    studentId: 'TEST-001', displayName: 'Synthetic Test Student', email: null, department: 'Test', programme: 'Test Programme', semester: 4, active: true, observedAt: '2026-01-15T00:00:00.000Z',
    academic: { cgpa: 10, cgpaScale: 10, marksPercent: 100, backlogs: 0 }, attendance: { overallPercent: 100 },
    lms: { loginCount: 20, assignmentCompletionPercent: 100 }, engagement: { eventsCount: 6, clubsCount: 0, hackathonsCount: 0, certificationsCount: 3 },
    placement: { aptitudeScore: 100, codingScore: 100, mockInterviewScore: 100 }, skills: { technicalScore: 100, softSkillScore: 100 }, feedback: { studentSatisfaction: 5, facultyFeedback: 'Synthetic test context' }, ...overrides,
  };
}

describe('heuristic-v1 scoring', () => {
  it('returns 100 for perfect 10-point-scale inputs', () => {
    const result = calculateScore(fixture());
    expect(result.score).toBe(100);
    expect(result.coverage).toBe(100);
    expect(result.supportLevel).toBe('none');
    expect(result.signals).toHaveLength(0);
    expect(result.components.reduce((sum, component) => sum + (component.contribution ?? 0), 0)).toBe(100);
  });

  it('normalizes four-point CGPA and clamps inputs', () => {
    const result = calculateScore(fixture({ academic: { cgpa: 4, cgpaScale: 4, marksPercent: 110, backlogs: 0 }, attendance: { overallPercent: -5 } }));
    expect(result.components.find((component) => component.key === 'academic')?.value).toBe(100);
    expect(result.components.find((component) => component.key === 'attendance')?.value).toBe(0);
  });

  it('applies one capped backlog adjustment and flags two backlogs', () => {
    const result = calculateScore(fixture({ academic: { cgpa: 8, cgpaScale: 10, marksPercent: 80, backlogs: 2 } }));
    const academic = result.components.find((component) => component.key === 'academic')!;
    expect(academic.value).toBe(70);
    expect(result.signals.some((signal) => signal.key === 'academic')).toBe(true);
  });

  it('does not assume a scale and withholds a score below 60% coverage', () => {
    const result = calculateScore(fixture({ academic: { cgpa: 8, cgpaScale: null, marksPercent: null, backlogs: null }, attendance: { overallPercent: 70 }, lms: { loginCount: null, assignmentCompletionPercent: null }, engagement: { eventsCount: null, clubsCount: null, hackathonsCount: null, certificationsCount: null }, placement: { aptitudeScore: null, codingScore: null, mockInterviewScore: null }, skills: { technicalScore: null, softSkillScore: null } }));
    expect(result.score).toBeNull();
    expect(result.coverage).toBe(25);
    expect(result.missingIndicators).toContain('Academic performance: declared cgpa scale');
  });

  it('uses explicit attendance and placement boundaries', () => {
    const attendance = calculateScore(fixture({ attendance: { overallPercent: 74.9 } }));
    const boundary = calculateScore(fixture({ attendance: { overallPercent: 75 } }));
    expect(attendance.signals.some((signal) => signal.key === 'attendance')).toBe(true);
    expect(boundary.signals.some((signal) => signal.key === 'attendance')).toBe(false);
    const placement = calculateScore(fixture({ placement: { aptitudeScore: 54.9, codingScore: null, mockInterviewScore: null } }));
    expect(placement.signals.some((signal) => signal.key === 'placement')).toBe(true);
  });

  it('is repeatable for identical input', () => {
    expect(calculateScore(fixture())).toEqual(calculateScore(fixture()));
  });
});
