import { Platform } from 'react-native';
import { apiJson } from './api';

export const MOBILE_ANALYTICS_EVENTS = [
  'queue_timeout_shown',
  'queue_timeout_continue',
  'queue_timeout_leave',
  'queue_joined',
  'queue_left',
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
  'token_purchase_started',
  'token_purchase_completed',
  'token_balance_viewed',
  'token_spent',
  'safety_report_submitted',
  'safety_violation_detected',
  'safety_action_taken',
  'safety_appeal_opened',
  'safety_appeal_resolved',
] as const;

export type MobileAnalyticsEventName = (typeof MOBILE_ANALYTICS_EVENTS)[number];

type AnalyticsProperties = Record<string, string | number | boolean | null>;

const MOBILE_APP_VERSION =
  process.env.EXPO_PUBLIC_APP_VERSION ?? process.env.EXPO_PUBLIC_VERSION ?? 'mobile-dev';
const MOBILE_BUILD_NUMBER = process.env.EXPO_PUBLIC_BUILD_NUMBER ?? undefined;
const MOBILE_REGION = process.env.EXPO_PUBLIC_REGION ?? undefined;

export function trackEvent(
  name: MobileAnalyticsEventName,
  properties: AnalyticsProperties = {},
) {
  const eventId =
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : undefined;

  void apiJson('/analytics/events', {
    method: 'POST',
    headers: {
      'X-Client-Platform': Platform.OS === 'ios' ? 'ios' : 'android',
      'X-App-Version': MOBILE_APP_VERSION,
      ...(MOBILE_BUILD_NUMBER ? { 'X-Build-Number': MOBILE_BUILD_NUMBER } : {}),
      ...(MOBILE_REGION ? { 'X-Region': MOBILE_REGION } : {}),
    },
    body: JSON.stringify({
      name,
      eventSchemaVersion: 1,
      eventId,
      occurredAt: new Date().toISOString(),
      properties,
    }),
  });
}
