# Test & Coverage Summary

## Key Changes
- Added comprehensive unit tests for backend services in `test/unit/`.
- Added moderation accuracy suite:
  - `test/moderation/accuracy.spec.ts`
  - `test/moderation/mock-payloads.ts`
- Created shared mocks in `test/mocks/`:
  - `prisma.mock.ts`, `redis.mock.ts`, `stripe.mock.ts`, `gateway.mock.ts`
- Added `jest.config.js` to target unit + moderation suites with ≥80% global coverage thresholds.
- Updated `package.json` test scripts to use the explicit Jest config.
- Updated README with:
  - “Running Unit Tests & Coverage”
  - “Moderation Accuracy Testing”
- Added `.codex/` to `.gitignore`.
- Added CI workflow: `.github/workflows/tests.yml` to run unit tests and the moderation accuracy suite.

## Tests Run
- `npm test`
- `npm test -- --runTestsByPath test/moderation/accuracy.spec.ts`
- `npm run test:cov`

## Latest Coverage
- Lines: 94.75%
- Branches: 83.25%

## Notes
- `SessionService` logs a token error during tests as part of the token-error path coverage; tests still pass.
