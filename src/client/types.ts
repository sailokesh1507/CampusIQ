import type { Intervention, ScoreExplanation, SegmentKey, StudentRecord } from '../shared/types.js';

export type Page = 'overview' | 'students' | 'segments' | 'imports' | 'interventions' | 'methodology';

export interface FilterState {
  q: string;
  department: string;
  programme: string;
  semester: string;
  signal: string;
  segment: string;
  coverage: string;
  sort: string;
}

export const EMPTY_FILTERS: FilterState = {
  q: '', department: '', programme: '', semester: '', signal: '', segment: '', coverage: '', sort: 'score',
};

export interface Profile {
  record: StudentRecord;
  explanation: ScoreExplanation;
  segments: Array<{ key: SegmentKey; label: string; reasons: string[] }>;
  interventions: Intervention[];
}

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  'high-academic-low-placement': 'High academic · placement gap',
  'attendance-academic-support': 'Attendance + academic support',
  'placement-ready-academic-support': 'Placement-ready · academic support',
  'consistently-strong': 'Current strong performance',
  'insufficient-data': 'Insufficient data',
};

export const labelFor = (value: string) => ({
  none: 'No immediate review', insufficient: 'More data needed', needs_review: 'Needs review',
  in_progress: 'In progress', wellbeing_referral: 'Wellbeing referral',
}[value] ?? value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/^\w/, (letter) => letter.toUpperCase()));

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
export const displayDate = (date: string) => new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
