/*
  Moderation test dataset (QA fixtures v1 + synthetic edge cases).
  - Clear violations: adult/violence examples
  - Borderline cases: ambiguous, low-signal clips
  - False positives: poor lighting, gestures, occlusions
  - False negative tolerance: violations without explicit violation flag
*/

export type ModerationExpectedAction = 'terminate' | 'none' | 'ban';

export type ModerationTestCase = {
  id: string;
  description: string;
  expectedAction: ModerationExpectedAction;
  isViolation: boolean;
  payload: {
    sessionId: string;
    userId?: string;
    violation?: boolean;
    action?: string;
    event?: string;
    labels?: string[];
    severity?: string;
    timestamp?: string;
    reason?: string;
  };
};

export const MODERATION_TEST_CASES: ModerationTestCase[] = [
  // Clear violation: adult content
  {
    id: 'adult_clear',
    description: 'Explicit adult content detected by labels',
    expectedAction: 'terminate',
    isViolation: true,
    payload: {
      sessionId: 'session-adult-1',
      userId: 'user-adult-1',
      violation: true,
      labels: ['adult_nudity'],
      severity: 'high',
      reason: 'adult',
    },
  },
  // Clear violation: violence content
  {
    id: 'violence_clear',
    description: 'Explicit violence signaled via action=violation',
    expectedAction: 'terminate',
    isViolation: true,
    payload: {
      sessionId: 'session-violence-1',
      userId: 'user-violence-1',
      action: 'violation',
      labels: ['violence'],
      severity: 'high',
      reason: 'violence',
    },
  },
  // False negative tolerance: labels present without violation flag
  {
    id: 'adult_label_only',
    description: 'Adult label present even if violation=false',
    expectedAction: 'terminate',
    isViolation: true,
    payload: {
      sessionId: 'session-adult-2',
      userId: 'user-adult-2',
      violation: false,
      labels: ['adult_nudity'],
      severity: 'medium',
      reason: 'adult',
    },
  },
  // Borderline: low-light, no labels
  {
    id: 'borderline_low_light',
    description: 'Low lighting, ambiguous scene, no violation signals',
    expectedAction: 'none',
    isViolation: false,
    payload: {
      sessionId: 'session-borderline-1',
      userId: 'user-borderline-1',
      event: 'review',
      labels: [],
      severity: 'low',
      reason: 'low_light',
    },
  },
  // Borderline: ambiguous gestures, no labels
  {
    id: 'borderline_ambiguous_gesture',
    description: 'Ambiguous gesture flagged for review only',
    expectedAction: 'none',
    isViolation: false,
    payload: {
      sessionId: 'session-borderline-2',
      userId: 'user-borderline-2',
      event: 'review',
      labels: [],
      severity: 'low',
      reason: 'gesture',
    },
  },
  // False positive scenario: poor lighting
  {
    id: 'false_positive_poor_lighting',
    description: 'Poor lighting misread risk, should not terminate',
    expectedAction: 'none',
    isViolation: false,
    payload: {
      sessionId: 'session-fp-1',
      userId: 'user-fp-1',
      violation: false,
      labels: [],
      severity: 'low',
      reason: 'poor_lighting',
    },
  },
  // False positive scenario: hand gestures
  {
    id: 'false_positive_gestures',
    description: 'Gestures that could be misclassified as violence',
    expectedAction: 'none',
    isViolation: false,
    payload: {
      sessionId: 'session-fp-2',
      userId: 'user-fp-2',
      violation: false,
      labels: [],
      severity: 'low',
      reason: 'gestures',
    },
  },
  // False positive scenario: background occlusion
  {
    id: 'false_positive_occlusion',
    description: 'Background occlusion, no actionable signals',
    expectedAction: 'none',
    isViolation: false,
    payload: {
      sessionId: 'session-fp-3',
      userId: 'user-fp-3',
      event: 'monitor',
      labels: [],
      severity: 'low',
      reason: 'occlusion',
    },
  },
  // Repeat offender: ban action
  {
    id: 'repeat_offender_ban',
    description: 'Repeat offender above threshold should be banned',
    expectedAction: 'ban',
    isViolation: true,
    payload: {
      sessionId: 'session-repeat-1',
      userId: 'user-repeat',
      violation: true,
      labels: ['adult_nudity'],
      severity: 'high',
      reason: 'repeat_violation',
    },
  },
];
