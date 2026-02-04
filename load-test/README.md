# K6 Load Tests (Staging)

These scripts target the staging API. They create anonymous users, seed tokens via Stripe webhook signatures, and exercise queue, session creation, and webhook spikes.

**Thresholds (built into scripts)**
- Queue join latency p95 < 3s (metric: `queue_join_latency`)
- HTTP request duration p95 < 100ms (metric: `http_req_duration`)
- Error rate < 0.1% (metrics: `http_req_failed`, `error_rate`)

**Required env vars**
- `BASE_URL` staging API base URL (example: `https://staging-api.example.com`)
- `STRIPE_WEBHOOK_SECRET` staging webhook signing secret (required for token seeding and webhook spikes)

**Optional env vars (common)**
- `QUEUE_REGION` region string sent to `/queue/join` (default: `australiaCentral`)
- `QUEUE_MODE` `isolated` or `shared` (default varies per script)
- `USE_SIMPLE=1` disables built-in stages so `--vus`/`--duration` CLI flags take effect
- `THINK_TIME_MIN` and `THINK_TIME_MAX` seconds for realistic pauses
- `PROMETHEUS_URL` Prometheus base URL (example: `https://prom.example.com`)
- `PROMETHEUS_BEARER_TOKEN` optional bearer token for Prometheus

## 1) Queue Concurrency
Ramp to 10,000 VUs joining/leaving over 10 minutes with ramp-down. Default uses `QUEUE_MODE=isolated` to avoid matches and token exhaustion.

Run (default stages):
```bash
BASE_URL=... STRIPE_WEBHOOK_SECRET=... k6 run load-test/queue-concurrency.js
```

Run with explicit VUs/duration:
```bash
USE_SIMPLE=1 BASE_URL=... STRIPE_WEBHOOK_SECRET=... \
  k6 run load-test/queue-concurrency.js --vus 10000 --duration 10m
```

Useful overrides:
- `TARGET_VUS=10000`
- `RAMP_UP=10m` `HOLD=0m` `RAMP_DOWN=2m`
- `QUEUE_MODE=shared` to force a single queue key for match-time stress
- `TOKENS_PER_USER=2` and `SEED_TOKENS=1`

## 2) Video Session Sustain
Sustain ~1,000 concurrent sessions by holding ~2,000 users in the same queue. This simulates session creation via `/queue/join` and the matching worker.

Run (default stages):
```bash
BASE_URL=... STRIPE_WEBHOOK_SECRET=... k6 run load-test/video-session-sustain.js
```

Run with explicit VUs/duration:
```bash
USE_SIMPLE=1 BASE_URL=... STRIPE_WEBHOOK_SECRET=... \
  k6 run load-test/video-session-sustain.js --vus 2000 --duration 15m
```

Useful overrides:
- `SESSION_VUS=2000`
- `RAMP_UP=5m` `HOLD=10m` `RAMP_DOWN=2m`
- `SESSION_HOLD_SECONDS=45` (server session length)
- `AUTO_TOP_UP=1` `TOP_UP_TOKENS=5` `BALANCE_CHECK_EVERY=3`

## 3) Token Purchase Webhook Spike
Spikes `POST /webhooks/stripe` at a high arrival rate using valid Stripe signatures.

Run (default spike):
```bash
BASE_URL=... STRIPE_WEBHOOK_SECRET=... k6 run load-test/token-purchase-spike.js
```

Run with explicit VUs/duration:
```bash
USE_SIMPLE=1 BASE_URL=... STRIPE_WEBHOOK_SECRET=... \
  k6 run load-test/token-purchase-spike.js --vus 200 --duration 5m
```

Useful overrides:
- `SEED_USER_COUNT=100` (users created in setup)
- `TOKENS_PER_EVENT=5`
- `BASE_RATE=20` `SPIKE_RATE=400` `RAMP_UP=1m` `SPIKE_HOLD=2m` `RAMP_DOWN=1m`
- `PREALLOCATED_VUS=800` `MAX_VUS=1200`

## Prometheus Metrics (Optional)
If `PROMETHEUS_URL` is set, each script queries these metrics at start and end:
- `redis_connected_clients`
- `redis_used_memory_bytes`
- `pg_stat_database_xact_commit`
- `pg_stat_database_blks_read`

## Notes
- All scripts create anonymous users and seed tokens through Stripe webhooks. Use staging-only secrets.
- `QUEUE_MODE=shared` increases matching but consumes tokens faster.
- The session sustain script does not use socket.io; it approximates session creation by keeping pairs in the same queue key and holding for `SESSION_HOLD_SECONDS`.
