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
