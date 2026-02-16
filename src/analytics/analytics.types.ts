export const ANALYTICS_EVENT_NAMES = [
  'auth_signup_completed',
  'queue_join_requested',
  'queue_joined',
  'queue_cancel',
  'queue_left',
  'queue_timeout_shown',
  'queue_timeout_continue',
  'queue_timeout_leave',
  'queue_match_found',
  'session_started',
  'session_ended',
  'session_choice_submitted',
  'session_choice_resolved',
  'session_result',
  'message_sent',
  'first_message_sent',
  'match_chat_opened',
  'match_message_sent',
  'token_balance_viewed',
  'token_purchase_started',
  'token_purchase_succeeded',
  'token_purchase_completed',
  'token_spent',
  'safety_report_submitted',
  'safety_violation_detected',
  'safety_action_taken',
  'safety_appeal_opened',
  'safety_appeal_resolved',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type AnalyticsPrimitive = string | number | boolean | null;

export type AnalyticsProperties = Record<string, AnalyticsPrimitive>;
