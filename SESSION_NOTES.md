# Codex Session Notes

Last updated: 2026-02-12

## Goal
- Close all P0 and P1 mobile-backend gap items.
- Phase 4 (P2) cleanup retained for phased rollout.

## Current status
- All P0 gaps (GAP-001 through GAP-006) resolved in previous sessions.
- All P1 gaps (GAP-007, GAP-008) resolved this session.
- P2 gap GAP-010 (settings/profile raw fetch → apiJson) resolved this session.
- P2 gap GAP-009 (queue:estimate cleanup) deferred — UI already graceful when absent.
- Local build + targeted unit tests + Docker-backed e2e smoke previously passed.
- Staging params file exists: infra/azure/params.staging.json.
- Deploy blocked on Azure authentication and required deploy env vars.

## Changes this session (2026-02-12)
1. **GAP-008**: `useQueue.ts` — `leaveQueue()` now reads and trusts backend `refunded` field from `DELETE /queue/leave`, with fallback to local heuristic.
2. **GAP-010**: `DeleteAccountScreen.tsx` — replaced raw `fetch` with `apiJson` helper.
3. **GAP-010**: `SettingsScreen.tsx` — replaced local `authenticatedFetch` helper with project-wide `apiJson`, removed redundant `API_URL` constant.
4. Updated `docs/notes/mobile-backend-gap-fix-checklist.md` to reflect all completed items.

## Remaining work
- [x] Update mobile unit tests for `leaveQueue()` refund parsing and settings `apiJson` usage.
- [x] Verified system with expanded unit and flow tests (Onboarding, Decision, Matches).
- [x] Created `tests/__tests__/decision.unit.test.tsx` for immediate resolution handling.
- [x] Updated `onboarding.flow.test.tsx` for profile payload verification.
- [x] Manual smoke test: onboarding → queue → leave/refund (Verified on web client).
- [x] Updated `infra/azure/params.staging.json` to use `australiaCentral` (Canberra) as primary location.
- [ ] Remove temporary fallback socket listeners after one stable release cycle.
- [ ] Azure authentication for staging deploy.
