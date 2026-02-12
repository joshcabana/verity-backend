import { apiJson } from './api';

export const MOBILE_ANALYTICS_EVENTS = [
  'queue_timeout_shown',
  'queue_timeout_continue',
  'queue_timeout_leave',
] as const;

export type MobileAnalyticsEventName = (typeof MOBILE_ANALYTICS_EVENTS)[number];

type AnalyticsProperties = Record<string, string | number | boolean | null>;

export function trackEvent(
  name: MobileAnalyticsEventName,
  properties: AnalyticsProperties = {},
) {
  void apiJson('/analytics/events', {
    method: 'POST',
    body: JSON.stringify({ name, properties }),
  });
}
