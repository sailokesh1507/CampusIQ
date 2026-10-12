import { ALGORITHM_VERSION, COMPONENT_WEIGHTS } from '../shared/methodology.js';
import type {
  ComponentResult,
  RiskSignal,
  ScoreExplanation,
  StudentRecord,
  SupportLevel,
} from '../shared/types.js';

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));
const present = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
const mean = (values: number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function weightedAvailable(values: Array<{ value: number | null; weight: number }>): number | null {
  const available = values.filter(({ value }) => present(value));
  if (!available.length) return null;
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  return available.reduce((sum, item) => sum + (item.value as number) * item.weight, 0) / totalWeight;
}

function academicComponent(record: StudentRecord): ComponentResult {
  const inputsUsed: string[] = [];
  const inputsAbsent: string[] = [];
  const details: string[] = [];
  let normalizedCgpa: number | null = null;
  if (present(record.academic.cgpa) && present(record.academic.cgpaScale) && record.academic.cgpaScale > 0) {
    normalizedCgpa = clamp(100 * record.academic.cgpa / record.academic.cgpaScale);
    inputsUsed.push('cgpa + declared cgpa scale');
    details.push(`CGPA normalized to ${normalizedCgpa.toFixed(1)} / 100 using the declared ${record.academic.cgpaScale}-point scale.`);
  } else {
    inputsAbsent.push(record.academic.cgpa !== null ? 'declared cgpa scale' : 'CGPA');
  }
  const subjectMarks = mean(record.subjectMetrics.flatMap((subject) => present(subject.marksPercent) ? [clamp(subject.marksPercent)] : []));
  const marksValue = present(record.academic.marksPercent) ? clamp(record.academic.marksPercent) : subjectMarks;
  if (present(record.academic.marksPercent)) {
    inputsUsed.push('marks percent');
  } else if (subjectMarks !== null) {
    inputsUsed.push('subject performance average');
    details.push(`Subject performance average is ${subjectMarks.toFixed(1)} / 100 across ${record.subjectMetrics.filter((subject) => present(subject.marksPercent)).length} supplied subject${record.subjectMetrics.filter((subject) => present(subject.marksPercent)).length === 1 ? '' : 's'}.`);
  } else {
    inputsAbsent.push('marks percent or subject performance');
  }
  if (present(record.academic.backlogs)) inputsUsed.push('backlogs');
  else inputsAbsent.push('backlogs');
  const base = weightedAvailable([
    { value: normalizedCgpa, weight: 60 },
    { value: marksValue, weight: 40 },
  ]);
  if (base === null) {
    return { key: 'academic', label: 'Academic performance', value: null, weight: COMPONENT_WEIGHTS.academic, contribution: null, coverage: 0, inputsUsed, inputsAbsent, details: ['No valid CGPA/scale or marks measurement was supplied.'] };
  }
  const adjustment = present(record.academic.backlogs) ? Math.min(20, 5 * record.academic.backlogs) : 0;
  if (adjustment > 0) details.push(`${record.academic.backlogs} backlog${record.academic.backlogs === 1 ? '' : 's'} apply a ${adjustment.toFixed(1)} point adjustment.`);
  const baseCoverage = (normalizedCgpa !== null ? 60 : 0) + (marksValue !== null ? 40 : 0);
  return { key: 'academic', label: 'Academic performance', value: clamp(base - adjustment), weight: COMPONENT_WEIGHTS.academic, contribution: null, coverage: baseCoverage, inputsUsed, inputsAbsent, details };
}

function attendanceComponent(record: StudentRecord): ComponentResult {
  const subjectAttendance = mean(record.subjectMetrics.flatMap((subject) => present(subject.attendancePercent) ? [clamp(subject.attendancePercent)] : []));
  const value = present(record.attendance.overallPercent) ? clamp(record.attendance.overallPercent) : subjectAttendance;
  return {
    key: 'attendance', label: 'Attendance', value, weight: COMPONENT_WEIGHTS.attendance, contribution: null,
    coverage: value === null ? 0 : 100,
    inputsUsed: value === null ? [] : [present(record.attendance.overallPercent) ? 'overall attendance percent' : 'subject-wise attendance average'],
    inputsAbsent: value === null ? ['overall or subject-wise attendance percent'] : [],
    details: value === null ? ['No attendance measurement was supplied.'] : [present(record.attendance.overallPercent) ? `Overall attendance is ${value.toFixed(1)}%.` : `Subject-wise attendance average is ${value.toFixed(1)}% across ${record.subjectMetrics.filter((subject) => present(subject.attendancePercent)).length} supplied subject${record.subjectMetrics.filter((subject) => present(subject.attendancePercent)).length === 1 ? '' : 's'}.`],
  };
}

function learningComponent(record: StudentRecord): ComponentResult {
  const inputsUsed: string[] = [];
  const inputsAbsent: string[] = [];
  const details: string[] = [];
  const lms = weightedAvailable([
    { value: present(record.lms.loginCount) ? clamp(record.lms.loginCount / 20 * 100) : null, weight: 50 },
    { value: present(record.lms.assignmentCompletionPercent) ? clamp(record.lms.assignmentCompletionPercent) : null, weight: 50 },
  ]);
  if (present(record.lms.loginCount)) inputsUsed.push('LMS login count'); else inputsAbsent.push('LMS login count');
  if (present(record.lms.assignmentCompletionPercent)) inputsUsed.push('assignment completion'); else inputsAbsent.push('assignment completion');
  const engagement = weightedAvailable([
    { value: present(record.engagement.eventsCount) || present(record.engagement.clubsCount) || present(record.engagement.hackathonsCount)
      ? clamp(((record.engagement.eventsCount ?? 0) + (record.engagement.clubsCount ?? 0) + (record.engagement.hackathonsCount ?? 0)) / 6 * 100) : null, weight: 40 },
    { value: present(record.engagement.certificationsCount) ? clamp(record.engagement.certificationsCount / 3 * 100) : null, weight: 60 },
  ]);
  if (present(record.engagement.eventsCount) || present(record.engagement.clubsCount) || present(record.engagement.hackathonsCount)) inputsUsed.push('engagement events/clubs/hackathons');
  else inputsAbsent.push('engagement activity counts');
  if (present(record.engagement.certificationsCount)) inputsUsed.push('certifications'); else inputsAbsent.push('certifications');
  const skills = weightedAvailable([
    { value: present(record.skills.technicalScore) ? clamp(record.skills.technicalScore) : null, weight: 50 },
    { value: present(record.skills.softSkillScore) ? clamp(record.skills.softSkillScore) : null, weight: 50 },
  ]);
  if (present(record.skills.technicalScore)) inputsUsed.push('technical skills'); else inputsAbsent.push('technical skills');
  if (present(record.skills.softSkillScore)) inputsUsed.push('soft skills'); else inputsAbsent.push('soft skills');
  const value = weightedAvailable([
    { value: lms, weight: 60 },
    { value: engagement, weight: 25 },
    { value: skills, weight: 15 },
  ]);
  if (lms !== null) details.push(`LMS group contributes ${lms.toFixed(1)}.`);
  if (engagement !== null) details.push(`Engagement group contributes ${engagement.toFixed(1)}.`);
  if (skills !== null) details.push(`Skills group contributes ${skills.toFixed(1)}.`);
  const lmsCoverage = (present(record.lms.loginCount) ? 30 : 0) + (present(record.lms.assignmentCompletionPercent) ? 30 : 0);
  const engagementCoverage = (present(record.engagement.eventsCount) || present(record.engagement.clubsCount) || present(record.engagement.hackathonsCount) ? 10 : 0) + (present(record.engagement.certificationsCount) ? 15 : 0);
  const skillsCoverage = (present(record.skills.technicalScore) ? 7.5 : 0) + (present(record.skills.softSkillScore) ? 7.5 : 0);
  return {
    key: 'learning', label: 'Learning & engagement', value, weight: COMPONENT_WEIGHTS.learning, contribution: null,
    coverage: lmsCoverage + engagementCoverage + skillsCoverage, inputsUsed, inputsAbsent,
    details: value === null ? ['No LMS, engagement, or skills measurement was supplied.'] : details,
  };
}

function placementComponent(record: StudentRecord): ComponentResult {
  const value = weightedAvailable([
    { value: present(record.placement.aptitudeScore) ? clamp(record.placement.aptitudeScore) : null, weight: 40 },
    { value: present(record.placement.codingScore) ? clamp(record.placement.codingScore) : null, weight: 35 },
    { value: present(record.placement.mockInterviewScore) ? clamp(record.placement.mockInterviewScore) : null, weight: 25 },
  ]);
  const inputs = [
    ['aptitude score', record.placement.aptitudeScore, 40],
    ['coding score', record.placement.codingScore, 35],
    ['mock interview score', record.placement.mockInterviewScore, 25],
  ] as const;
  const coverage = inputs.filter(([, item]) => present(item)).reduce((sum, [, , weight]) => sum + weight, 0);
  return {
    key: 'placement', label: 'Placement readiness', value, weight: COMPONENT_WEIGHTS.placement, contribution: null,
    coverage,
    inputsUsed: inputs.filter(([, item]) => present(item)).map(([label]) => label),
    inputsAbsent: inputs.filter(([, item]) => !present(item)).map(([label]) => label),
    details: value === null ? ['No placement assessment was supplied.'] : [`Readiness is based on ${inputs.filter(([, item]) => present(item)).length} supplied assessment${inputs.filter(([, item]) => present(item)).length === 1 ? '' : 's'}.`],
  };
}

function buildSignals(record: StudentRecord, components: ComponentResult[]): RiskSignal[] {
  const academic = components.find((item) => item.key === 'academic')!;
  const attendance = components.find((item) => item.key === 'attendance')!;
  const learning = components.find((item) => item.key === 'learning')!;
  const placement = components.find((item) => item.key === 'placement')!;
  const signals: RiskSignal[] = [];
  const academicEvidence = academic.value !== null && academic.value < 55;
  const lowCgpa = present(record.academic.cgpa) && present(record.academic.cgpaScale) && record.academic.cgpaScale > 0 && (100 * record.academic.cgpa / record.academic.cgpaScale) < 50;
  const lowMarks = present(record.academic.marksPercent) && record.academic.marksPercent < 50;
  const backlogEvidence = present(record.academic.backlogs) && record.academic.backlogs >= 2;
  if (academicEvidence || lowCgpa || lowMarks || backlogEvidence) {
    signals.push({ key: 'academic', label: 'Academic support opportunity', severity: 'review', evidence: [academicEvidence ? `academic component ${academic.value!.toFixed(1)} is below 55` : '', lowCgpa ? 'normalized CGPA is below 50' : '', lowMarks ? 'marks are below 50%' : '', backlogEvidence ? `${record.academic.backlogs} backlogs recorded` : ''].filter(Boolean).join('; ') });
  }
  if (attendance.value !== null && attendance.value < 75) signals.push({ key: 'attendance', label: 'Attendance support opportunity', severity: 'review', evidence: `attendance is ${attendance.value.toFixed(1)}%, below the 75% review threshold` });
  if (learning.value !== null && learning.value < 50) signals.push({ key: 'learning', label: 'Learning engagement review', severity: 'review', evidence: `learning and engagement component is ${learning.value.toFixed(1)}, below 50` });
  const placementScores = [record.placement.aptitudeScore, record.placement.codingScore, record.placement.mockInterviewScore].filter(present);
  const lowPlacementTests = placementScores.filter((score) => score < 50).length >= 2;
  if ((placement.value !== null && placement.value < 55) || lowPlacementTests) signals.push({ key: 'placement', label: 'Placement readiness gap', severity: 'review', evidence: placement.value !== null && placement.value < 55 ? `placement component is ${placement.value.toFixed(1)}, below 55` : 'at least two placement tests are below 50' });
  return signals;
}

export function calculateScore(record: StudentRecord): ScoreExplanation {
  const components = [academicComponent(record), attendanceComponent(record), learningComponent(record), placementComponent(record)];
  const presentWeight = components.filter((item) => item.value !== null).reduce((sum, item) => sum + item.weight, 0);
  const coverage = presentWeight;
  const score = presentWeight < 60 ? null : components.reduce((sum, item) => sum + (item.value === null ? 0 : item.value * item.weight), 0) / presentWeight;
  for (const component of components) component.contribution = score === null || component.value === null ? null : component.value * component.weight / presentWeight;
  const signals = buildSignals(record, components);
  let supportLevel: SupportLevel = 'none';
  if (score === null) supportLevel = 'insufficient';
  else if ((score < 50) || signals.length >= 3) supportLevel = 'needs_review';
  else if (score < 60 || signals.length >= 2) supportLevel = 'watch';
  const missingIndicators = components.flatMap((component) => component.inputsAbsent.map((input) => `${component.label}: ${input}`));
  const summary = score === null
    ? `Insufficient data to calculate a success score. ${coverage.toFixed(0)}% of weighted components are present; at least 60% is required.`
    : `${score.toFixed(1)} success score from ${coverage.toFixed(0)}% component coverage. ${signals.length ? `${signals.length} support signal${signals.length === 1 ? '' : 's'} need faculty review.` : 'No immediate support signal is present.'}`;
  return { algorithmVersion: ALGORITHM_VERSION, score, coverage, components, signals, supportLevel, summary, missingIndicators };
}
