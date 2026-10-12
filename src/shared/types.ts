export type SupportLevel = 'insufficient' | 'none' | 'watch' | 'needs_review';
export type Signal = 'academic' | 'attendance' | 'learning' | 'placement';
export type SegmentKey =
  | 'high-academic-low-placement'
  | 'attendance-academic-support'
  | 'placement-ready-academic-support'
  | 'consistently-strong'
  | 'insufficient-data';

export interface AcademicMetrics {
  cgpa: number | null;
  cgpaScale: number | null;
  marksPercent: number | null;
  backlogs: number | null;
}

export interface AttendanceMetrics { overallPercent: number | null; }
export interface SubjectMetric {
  subjectCode: string;
  marksPercent: number | null;
  attendancePercent: number | null;
}
export interface LmsMetrics { loginCount: number | null; assignmentCompletionPercent: number | null; }
export interface EngagementMetrics {
  eventsCount: number | null;
  clubsCount: number | null;
  hackathonsCount: number | null;
  certificationsCount: number | null;
}
export interface PlacementMetrics {
  aptitudeScore: number | null;
  codingScore: number | null;
  mockInterviewScore: number | null;
}
export interface SkillsMetrics { technicalScore: number | null; softSkillScore: number | null; }
export interface FeedbackMetrics { studentSatisfaction: number | null; facultyFeedback: string | null; }

export interface StudentRecord {
  studentId: string;
  displayName: string;
  email: string | null;
  department: string;
  programme: string;
  semester: number | null;
  active: boolean;
  observedAt: string;
  academic: AcademicMetrics;
  attendance: AttendanceMetrics;
  subjectMetrics: SubjectMetric[];
  lms: LmsMetrics;
  engagement: EngagementMetrics;
  placement: PlacementMetrics;
  skills: SkillsMetrics;
  feedback: FeedbackMetrics;
}

export interface ComponentResult {
  key: Signal;
  label: string;
  value: number | null;
  weight: number;
  contribution: number | null;
  coverage: number;
  inputsUsed: string[];
  inputsAbsent: string[];
  details: string[];
}

export interface RiskSignal {
  key: Signal;
  label: string;
  severity: 'review' | 'watch';
  evidence: string;
}

export interface ScoreExplanation {
  algorithmVersion: string;
  score: number | null;
  coverage: number;
  components: ComponentResult[];
  signals: RiskSignal[];
  supportLevel: SupportLevel;
  summary: string;
  missingIndicators: string[];
}

export interface StudentSummary {
  studentId: string;
  displayName: string;
  department: string;
  programme: string;
  semester: number | null;
  score: number | null;
  coverage: number;
  supportLevel: SupportLevel;
  signals: Signal[];
  segments: SegmentKey[];
  updatedAt: string;
}

export interface Intervention {
  id: string;
  studentId: string;
  studentName?: string;
  scoreSnapshotId: string | null;
  category: 'academic' | 'attendance' | 'learning' | 'placement' | 'wellbeing_referral' | 'other';
  title: string;
  rationale: string;
  owner: string;
  dueDate: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  notes: InterventionNote[];
}
export interface InterventionNote { id: string; body: string; author: string; createdAt: string; }

export interface DashboardData {
  kpis: {
    totalStudents: number;
    assessedStudents: number;
    coveragePercent: number;
    medianScore: number | null;
    needsReview: number;
    watch: number;
    academicSignals: number;
    attendanceSignals: number;
    placementSignals: number;
    learningSignals: number;
  };
  distribution: Array<{ label: string; count: number; color: string }>;
  segments: Array<{ key: SegmentKey; label: string; count: number; description: string }>;
  reviewQueue: StudentSummary[];
  filtersApplied: Record<string, string>;
}

export interface ImportError { rowNumber: number; field: string; code: string; message: string; rawValue: string; }
