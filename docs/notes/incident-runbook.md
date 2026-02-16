# Incident Runbook (Web Beta)

## Severity Levels

- `SEV-1`: Service unavailable, data corruption risk, auth/session failure for most users.
- `SEV-2`: Core feature degraded (queue, session, chat, payments) for a subset of users.
- `SEV-3`: Non-critical degradation (UI regressions, intermittent errors, admin-only flows).

## First 15 Minutes

1. Confirm incident scope and time window.
2. Check API health endpoint and recent deployment SHA.
3. Check Postgres and Redis connectivity.
4. Check recent Stripe/Hive webhook failures.
5. Freeze deployments until stabilised.

## Mitigation Paths

- Web-only regression:
  - Roll back web deployment to last healthy release.
- Backend regression:
  - Roll back API/worker image to prior SHA.
  - Re-run smoke checks: signup, queue, session, decision, chat.
- Data plane stress:
  - Temporarily throttle queue intake.
  - Scale API/worker and Redis/Postgres tiers if required.

## Evidence Collection

- Request IDs and failing endpoints.
- Error traces from API logs.
- Redis and Postgres saturation metrics.
- Timeline of deploys and config changes.

## Exit Criteria

- Core flows stable for 30 minutes.
- Error rate returned to baseline.
- Incident summary written with root cause and preventive actions.

## Telemetry Outage Play

1. Detect and classify:
   - Check `/telemetry/stage-gates` freshness and API health.
   - Check `analytics.event.drop` and sink write failures in backend logs.
   - Confirm if outage is ingestion-only, metrics-only, or alert-delivery-only.
2. Contain impact:
   - Freeze gate-based expansion decisions while telemetry is degraded.
   - Keep safety manual review cadence active (do not disable moderation actions).
   - If alerting is down, assign temporary manual threshold checks every 30 minutes.
3. Recover ingestion:
   - Verify Postgres connectivity and Prisma error rate.
   - Verify Redis connectivity for alert cooldown/breach keys.
   - Verify `TELEMETRY_ALERT_WEBHOOK_URL` and escalation owner env values.
4. Replay/backfill:
   - Replay synthetic events with `npm run telemetry:synthetic`.
   - Backfill missed windows from persisted `analytics.event` logs where available.
   - Recompute snapshots by letting worker tick run (5-minute interval) or by forced service restart.
5. Validate closure:
   - Confirm stage-gate snapshot updates with current window timestamps.
   - Confirm auto-pause trigger paths produce Slack alerts.
   - Record outage window, missing-data impact, and mitigation in postmortem notes.
