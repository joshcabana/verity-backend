# Web Beta Go-Live Checklist (Australia-First)

## Pre-Deploy

- `npm run build` passes in `/Users/joshcabana/verity`.
- `npm test -- --runInBand` passes in `/Users/joshcabana/verity`.
- `npm test` and `npm run test:smoke` pass in `/Users/joshcabana/verity/verity-web`.
- `npm run check:budgets` passes in `/Users/joshcabana/verity/verity-web`.

## Infrastructure

- Azure deployment completed from `/Users/joshcabana/verity/.github/workflows/deploy-azure.yml`.
- `DATABASE_URL`, `REDIS_URL`, JWT, Stripe, Agora, and Hive secrets present.
- `APP_ORIGINS`, `REFRESH_COOKIE_SAMESITE`, and `REFRESH_COOKIE_DOMAIN` set for web.

## Runtime Validation

- `/health` returns success.
- Signup, queue join, session, decision, match, and chat verified.
- Report flow creates moderation reports and admin resolution works.
- Token checkout opens Stripe and webhook credits token balance.

## Launch Controls

- Rollback image tag and command documented.
- Incident owner and contact path assigned.
- Support path published in web settings and legal docs.

## Stage-Gate Controls (Required)

- Stage gate dashboard is live and reviewed before each live window.
- Liquidity gates configured: p50/p90 wait, abandonment, no-match/refund monitoring.
- Safety gates configured: severe incidents per 10k, action latency p95, appeal backlog SLA.
- Product signal gates configured: call completion, mutual match band, chat activation, D7 return.
- Auto-pause trigger thresholds configured and on-call owner assigned.

## Market Reality Integration (Required)

- Male-skew and safety-friction assumptions are reflected in invite pacing and queue controls.
- Burnout-risk assumption is reflected in UX (no endless loops, clear session boundaries).
- Any external doc/deck using market stats has source-lock check against `docs/strategy/verity-market-context-source-register.md`.
- Unverified numbers are labeled as assumptions in internal docs.
