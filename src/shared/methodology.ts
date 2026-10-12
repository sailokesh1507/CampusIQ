export const ALGORITHM_VERSION = 'heuristic-v1';

export const COMPONENT_WEIGHTS = {
  academic: 35,
  attendance: 25,
  learning: 15,
  placement: 25,
} as const;

export const METHODOLOGY = {
  version: ALGORITHM_VERSION,
  weights: COMPONENT_WEIGHTS,
  coverageThreshold: 60,
  thresholds: {
    academic: 55,
    attendance: 75,
    learning: 50,
    placement: 55,
    watchScore: 60,
    reviewScore: 50,
  },
  limitations: [
    'This is deterministic heuristic decision support, not a validated predictive model.',
    'Missing measurements reduce coverage and are never treated as zero.',
    'Signals are prompts for faculty review and must not be used for automated adverse decisions.',
    'Demo records are synthetic and do not represent an actual institution.',
  ],
} as const;
