import { apiJson } from '../api/client';

export const WEB_ANALYTICS_EVENTS = [
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
  'message_sent',
  'first_message_sent',
  'token_purchase_started',
  'token_purchase_succeeded',
] as const;

export type WebAnalyticsEventName = (typeof WEB_ANALYTICS_EVENTS)[number];

type EventProperties = Record<string, string | number | boolean | null>;

export function trackEvent(
  name: WebAnalyticsEventName,
  properties: EventProperties = {},
) {
  void apiJson('/analytics/events', {
    method: 'POST',
    body: {
      name,
      properties: {
        ...properties,
        path:
          typeof window !== 'undefined' ? window.location.pathname : undefined,
      },
    },
  });
}
