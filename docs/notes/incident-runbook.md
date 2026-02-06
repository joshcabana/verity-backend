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
