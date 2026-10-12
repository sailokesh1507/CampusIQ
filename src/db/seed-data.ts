import type { StudentRecord } from '../shared/types.js';

const observedAt = '2026-01-15T00:00:00.000Z';
const departments = ['Computer Science', 'Information Systems', 'Electronics & Communication'];
const programmes = ['B.Tech Computer Science', 'BBA Business Analytics', 'B.Tech Electronics'];

function record(index: number, overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    studentId: `SYN-${String(index).padStart(3, '0')}`,
    displayName: `Synthetic Student ${String(index).padStart(2, '0')}`,
    email: null,
    department: departments[(index - 1) % departments.length],
    programme: programmes[(index - 1) % programmes.length],
    semester: ((index - 1) % 8) + 1,
    active: true,
    observedAt,
    academic: { cgpa: 7.5, cgpaScale: 10, marksPercent: 74, backlogs: 0 },
    attendance: { overallPercent: 82 },
    lms: { loginCount: 16, assignmentCompletionPercent: 78 },
    engagement: { eventsCount: 3, clubsCount: 1, hackathonsCount: 1, certificationsCount: 1 },
    placement: { aptitudeScore: 72, codingScore: 68, mockInterviewScore: 70 },
    skills: { technicalScore: 74, softSkillScore: 76 },
    feedback: { studentSatisfaction: 4, facultyFeedback: 'Synthetic demonstration record for review.' },
    ...overrides,
  };
}

export function buildSyntheticRecords(): StudentRecord[] {
  const records: StudentRecord[] = [];
  for (let index = 1; index <= 6; index += 1) records.push(record(index, {
    academic: { cgpa: 9.1, cgpaScale: 10, marksPercent: 91, backlogs: 0 }, attendance: { overallPercent: 92 },
    lms: { loginCount: 20, assignmentCompletionPercent: 96 }, engagement: { eventsCount: 5, clubsCount: 2, hackathonsCount: 2, certificationsCount: 3 },
    placement: { aptitudeScore: 90, codingScore: 88, mockInterviewScore: 91 }, skills: { technicalScore: 92, softSkillScore: 89 },
  }));
  for (let index = 7; index <= 12; index += 1) records.push(record(index, {
    academic: { cgpa: 8.9, cgpaScale: 10, marksPercent: 88, backlogs: 0 }, attendance: { overallPercent: 86 },
    lms: { loginCount: 18, assignmentCompletionPercent: 90 }, engagement: { eventsCount: 4, clubsCount: 1, hackathonsCount: 1, certificationsCount: 2 },
    placement: { aptitudeScore: 42, codingScore: 38, mockInterviewScore: 45 }, skills: { technicalScore: 78, softSkillScore: 72 },
  }));
  for (let index = 13; index <= 18; index += 1) records.push(record(index, {
    academic: { cgpa: 4.6, cgpaScale: 10, marksPercent: 43, backlogs: 3 }, attendance: { overallPercent: 68 },
    lms: { loginCount: 6, assignmentCompletionPercent: 42 }, engagement: { eventsCount: 1, clubsCount: 0, hackathonsCount: 0, certificationsCount: 0 },
    placement: { aptitudeScore: 48, codingScore: 44, mockInterviewScore: 46 }, skills: { technicalScore: 45, softSkillScore: 49 },
  }));
  for (let index = 19; index <= 22; index += 1) records.push(record(index, {
    academic: { cgpa: 4.8, cgpaScale: 10, marksPercent: 47, backlogs: 2 }, attendance: { overallPercent: 84 },
    lms: { loginCount: 14, assignmentCompletionPercent: 82 }, engagement: { eventsCount: 3, clubsCount: 1, hackathonsCount: 1, certificationsCount: 1 },
    placement: { aptitudeScore: 82, codingScore: 78, mockInterviewScore: 84 }, skills: { technicalScore: 76, softSkillScore: 80 },
  }));
  for (let index = 23; index <= 27; index += 1) records.push(record(index, {
    academic: { cgpa: index % 2 ? 7.2 : null, cgpaScale: index % 2 ? 10 : null, marksPercent: index % 2 ? 69 : null, backlogs: null },
    attendance: { overallPercent: null }, lms: { loginCount: null, assignmentCompletionPercent: null },
    engagement: { eventsCount: null, clubsCount: null, hackathonsCount: null, certificationsCount: null },
    placement: { aptitudeScore: null, codingScore: null, mockInterviewScore: null }, skills: { technicalScore: null, softSkillScore: null },
    feedback: { studentSatisfaction: null, facultyFeedback: 'Only an academic snapshot was supplied in this synthetic import.' },
  }));
  for (let index = 28; index <= 54; index += 1) {
    const variation = index % 5;
    records.push(record(index, {
      academic: { cgpa: 6.1 + variation * 0.45, cgpaScale: 10, marksPercent: 58 + variation * 6, backlogs: variation === 1 ? 1 : 0 },
      attendance: { overallPercent: 72 + variation * 4 },
      lms: { loginCount: 9 + variation * 2, assignmentCompletionPercent: 55 + variation * 8 },
      engagement: { eventsCount: variation, clubsCount: variation > 1 ? 1 : 0, hackathonsCount: variation > 3 ? 1 : 0, certificationsCount: variation > 2 ? 1 : 0 },
      placement: { aptitudeScore: 55 + variation * 5, codingScore: 52 + variation * 7, mockInterviewScore: 58 + variation * 4 },
      skills: { technicalScore: 58 + variation * 6, softSkillScore: 62 + variation * 5 },
    }));
  }
  return records;
}
