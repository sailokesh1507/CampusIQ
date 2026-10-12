import type { ScoreExplanation, SegmentKey, StudentRecord } from '../shared/types.js';

export interface SegmentMatch { key: SegmentKey; label: string; reasons: string[]; }

export const SEGMENT_DEFINITIONS: Array<{ key: SegmentKey; label: string; description: string }> = [
  { key: 'high-academic-low-placement', label: 'High academic · low placement', description: 'Academic component is strong while placement readiness needs attention.' },
  { key: 'attendance-academic-support', label: 'Attendance + academic support', description: 'Attendance is below threshold alongside an academic support opportunity.' },
  { key: 'placement-ready-academic-support', label: 'Placement-ready · academic support', description: 'Placement readiness is strong while academic support is indicated.' },
  { key: 'consistently-strong', label: 'Current strong performance', description: 'Current components meet strong-performance thresholds; historical consistency requires dated snapshots.' },
  { key: 'insufficient-data', label: 'Insufficient data to assess', description: 'Less than 60% of weighted components are available.' },
];

export function getSegments(record: StudentRecord, explanation: ScoreExplanation): SegmentMatch[] {
  if (explanation.coverage < 60) return [{ key: 'insufficient-data', label: 'Insufficient data to assess', reasons: [`Coverage is ${explanation.coverage.toFixed(0)}%; 60% is required before performance segments are inferred.`] }];
  const academic = explanation.components.find((component) => component.key === 'academic')?.value;
  const attendance = explanation.components.find((component) => component.key === 'attendance')?.value;
  const learning = explanation.components.find((component) => component.key === 'learning')?.value;
  const placement = explanation.components.find((component) => component.key === 'placement')?.value;
  const segments: SegmentMatch[] = [];
  if (academic !== null && academic !== undefined && academic >= 75 && placement !== null && placement !== undefined && placement < 55) {
    segments.push({ key: 'high-academic-low-placement', label: 'High academic · low placement', reasons: [`Academic component ${academic.toFixed(1)} ≥ 75`, `Placement component ${placement.toFixed(1)} < 55`] });
  }
  if (attendance !== null && attendance !== undefined && attendance < 75 && explanation.signals.some((signal) => signal.key === 'academic')) {
    segments.push({ key: 'attendance-academic-support', label: 'Attendance + academic support', reasons: [`Attendance ${attendance.toFixed(1)}% < 75%`, 'Academic support signal is present'] });
  }
  if (placement !== null && placement !== undefined && placement >= 70 && academic !== null && academic !== undefined && academic < 55) {
    segments.push({ key: 'placement-ready-academic-support', label: 'Placement-ready · academic support', reasons: [`Placement component ${placement.toFixed(1)} ≥ 70`, `Academic component ${academic.toFixed(1)} < 55`] });
  }
  if (academic !== null && academic !== undefined && academic >= 75 && attendance !== null && attendance !== undefined && attendance >= 80 && (learning ?? 0) >= 65 && (placement ?? 0) >= 70 && explanation.signals.length === 0) {
    segments.push({ key: 'consistently-strong', label: 'Current strong performance', reasons: ['Academic ≥ 75', 'Attendance ≥ 80%', 'Learning ≥ 65', 'Placement ≥ 70', 'No current support signal; two dated snapshots are required to call this consistent'] });
  }
  return segments;
}
