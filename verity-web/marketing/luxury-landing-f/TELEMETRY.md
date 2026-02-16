# Verity Landing Telemetry (v1)

Last updated: 2026-02-16

## Event transport

The landing script emits telemetry to multiple sinks:

1. `window.dataLayer` (for GTM-compatible setups)
2. `document` custom event: `verity:telemetry`
3. `window.plausible(...)` if Plausible is loaded
4. Optional HTTP endpoint via `<body data-telemetry-endpoint="https://...">`

If no endpoint is configured, telemetry still goes to dataLayer/custom events.

## Event list

- `lp_exposure`
- `lp_click`
- `lp_scroll_depth`
- `lp_section_view`
- `waitlist_form_start`
- `waitlist_form_submit`
- `faq_open`
- `theme_toggle`

## Shared properties

All events include:

- `event`
- `timestamp_iso`
- `session_id`
- `hero_variant`
- `visual_variant`
- `theme_mode`
- `luxury_intensity`
- `experiment_id`
- `landing_path`
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`

## Privacy constraints

- No email field is included in event payloads.
- No message content or free text is sent.
- Location is only captured at submit as selected city (coarse intent signal).

## Endpoint payload example

```json
{
  "event": "waitlist_form_submit",
  "timestamp_iso": "2026-02-16T02:10:11.000Z",
  "session_id": "sess_abcd1234",
  "hero_variant": "F",
  "visual_variant": "luxury-cinematic-medium",
  "theme_mode": "luxury-dark",
  "luxury_intensity": "medium",
  "experiment_id": "hero_h1_v3_luxury_f_medium",
  "landing_path": "/",
  "utm_source": "instagram",
  "utm_medium": "paid_social",
  "utm_campaign": "canberra_luxury_test",
  "utm_content": "creative_2",
  "utm_term": "",
  "city": "Canberra"
}
```

## Recommended backend schema

- Partition by date + event
- Composite index: `(event, hero_variant, visual_variant, timestamp_iso)`
- Materialize KPI views for quick decisioning:
  - exposure -> form_start -> submit funnel
  - CTA click-through by variant/theme/intensity

## Risk notes

1. **Attribution skew risk:** if only paid links force `variant=F`, results can be biased.
2. **Compliance risk:** ensure policy disclosure covers analytics collection.
3. **Data loss risk:** endpoint outages silently drop HTTP events unless your endpoint retries client-side.
