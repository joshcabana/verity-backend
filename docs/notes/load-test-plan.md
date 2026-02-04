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
