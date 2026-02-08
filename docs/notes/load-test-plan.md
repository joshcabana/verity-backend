# Load Test Plan Summary (K6)

Date: 2026-02-04

## Context
Goal: create K6 load tests for staging to validate scalability and bottlenecks.
Critical targets:
- match time < 3s with thousands in queue
- API latency p95 < 100ms
- error rate < 0.1%
- support 1000+ concurrent video sessions

## Deliverables Created
- `load-test/queue-concurrency.js`
- `load-test/video-session-sustain.js`
- `load-test/token-purchase-spike.js`
- `load-test/README.md`

## Scenario Coverage
1. Queue concurrency ramp
   - ramp to 10,000 VUs over 10 minutes with ramp-down
   - join/leave queue with realistic think times
2. Video session sustain
   - sustain ~1,000 concurrent sessions (simulated by shared queue key and 45s holds)
3. Token purchase webhook spike
   - spikes `POST /webhooks/stripe` using valid Stripe signatures
4. Optional Prometheus snapshots
   - queries Redis and Postgres metrics at start/end when `PROMETHEUS_URL` is set

## Built-In Thresholds
- `queue_join_latency` p95 < 3000 ms
- `http_req_duration` p95 < 100 ms
- `http_req_failed` < 0.1%
- `error_rate` < 0.1%

## Environment Variables
Required:
- `BASE_URL` (staging API)
- `STRIPE_WEBHOOK_SECRET` (staging webhook signing secret)

Optional:
- `QUEUE_REGION`
- `QUEUE_MODE` (`isolated` or `shared`)
- `USE_SIMPLE=1` (use CLI `--vus`/`--duration`)
- `THINK_TIME_MIN`, `THINK_TIME_MAX`
- `PROMETHEUS_URL`, `PROMETHEUS_BEARER_TOKEN`

## Safe Execution Plan (Requested)
1. Queue concurrency dry run
   - 1,000 VUs for ~2 minutes, `QUEUE_MODE=isolated`
2. Queue concurrency full run
   - ramp to 10,000 VUs over 10 minutes (default script stages)
3. Video session sustain dry run
   - 500 VUs for ~5 minutes, `QUEUE_MODE=shared`
4. Video session sustain full run
   - 2,000 VUs, 45s holds to sustain ~1,000 concurrent sessions

## Status
- `k6` installed via Homebrew.
- Awaiting staging `BASE_URL` and `STRIPE_WEBHOOK_SECRET` to execute tests.
- Optional: confirm staging load-test window and Prometheus URL/token.

## Execution Log
- 2026-02-08T20:40:53Z: Operating mode updated to autonomous execution with regular note updates.
- 2026-02-08T20:40:53Z: Current hard blocker remains staging endpoint discovery (`BASE_URL`) from an Azure subscription that actually owns deployed Container Apps.
- 2026-02-08T20:40:53Z: Next executable actions, once `BASE_URL` resolves:
  - run queue dry run (1k VUs, ~2m)
  - run full queue ramp (10k VUs, 10m)
  - run video sustain dry run (500 VUs, ~5m)
  - run video sustain full (2k VUs, 45s holds)
  - run token webhook spike and summarize threshold pass/fail
- 2026-02-08T20:45:00Z: Verified all load scripts parse successfully with `k6 inspect` and expose expected stages/scenarios/thresholds.
- 2026-02-08T20:45:00Z: Repository Actions secrets/variables are empty at repo scope, so GitHub workflow path cannot deploy or reveal a staging endpoint without external Azure access.
- 2026-02-08T20:50:00Z: Inspected concurrent workspace changes per user request. Findings:
  - `src/auth/*`, `test/e2e/auth.flow.spec.ts`, `test/unit/auth.service.spec.ts`, and `verity-mobile/src/hooks/useWebSocket.ts` are feature work (profile update + socket wiring) and do not alter load-test scripts directly.
  - `test/e2e.setup.ts` now seeds default `DATABASE_URL`/`REDIS_URL` for tests; unrelated to k6 staging execution.
  - `infra/azure/params.staging.json` exists with generated app names (`verity-stg-uebjgh-api`, etc.) but still uses placeholder public domains and secrets.
- 2026-02-08T20:50:00Z: Integration decision: preserve all in-progress non-load-test files as-is; continue load-test execution path independently, using `params.staging.json` app name as a discovery hint once Azure subscription access is available.
