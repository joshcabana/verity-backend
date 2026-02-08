# Mobile/Backend Gap Fix Checklist

Date: 2026-02-08  
Companion report: `/Users/joshcabana/verity/docs/notes/mobile-backend-gap-report.md`

## How to use this checklist
- Order is strict by phase.
- Each item maps to one or more Gap IDs in the report.
- Do not advance phases until all gate checks for the current phase pass.

## Phase 1: P0 transport/namespace/event mismatches

### Tasks
- [ ] Implement queue socket namespace usage (`/queue`) and subscribe to canonical `match` event.
- [ ] Implement video socket namespace usage (`/video`) for `session:start`, `session:end`, `match:mutual`, `match:non_mutual`.
- [ ] Keep temporary fallback listener for `match:found` only as compatibility shim.
- [ ] Remove dependency on root socket for queue and video lifecycle events.
- [ ] Replace `match:rejected` dependency with canonical non-mutual handling.

### Primary files
- `/Users/joshcabana/verity/verity-mobile/src/hooks/useWebSocket.ts`
- `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`
- `/Users/joshcabana/verity/verity-mobile/src/hooks/useDecision.ts`
- `/Users/joshcabana/verity/verity-mobile/src/screens/VideoCallScreen.tsx`
- `/Users/joshcabana/verity/verity-mobile/src/screens/matches/MatchesListScreen.tsx`

### Gap IDs covered
- `GAP-002`, `GAP-003`, `GAP-004`

### Gate checks
- [ ] Queue match received from `/queue` namespace causes navigation to video session.
- [ ] Session starts from `session:start` payload (no route-param token dependency).
- [ ] Decision resolves from `/video` events without root socket listeners.

### Definition of done
- Mobile queue-to-session-to-decision flow operates end-to-end with namespaced sockets only (except temporary fallback listeners explicitly retained).

## Phase 2: P0 request/response schema mismatches

### Tasks
- [ ] Add required `{ region, preferences? }` payload to `POST /queue/join`.
- [ ] Align onboarding signup response parsing with `{ user, accessToken }`.
- [ ] Add backend `PATCH /users/me` endpoint with auth, DTO validation, and profile update response aligned to `GET /users/me`.
- [ ] Update mobile onboarding/profile edit flows to use canonical profile update contract.

### Primary files
- `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`
- `/Users/joshcabana/verity/verity-mobile/src/screens/HomeScreen.tsx`
- `/Users/joshcabana/verity/verity-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`
- `/Users/joshcabana/verity/verity-mobile/src/screens/settings/ProfileEditScreen.tsx`
- `/Users/joshcabana/verity/src/auth/auth.controller.ts`
- `/Users/joshcabana/verity/src/auth/auth.service.ts`
- `/Users/joshcabana/verity/src/auth/dto/` (new update DTO)

### Gap IDs covered
- `GAP-001`, `GAP-005`, `GAP-006`

### Gate checks
- [ ] Queue join returns 2xx with non-empty `queueKey`.
- [ ] Signup succeeds and user ID is read from `response.user.id`.
- [ ] `PATCH /users/me` returns updated profile fields and is consumed by mobile.

### Definition of done
- No blocking 4xx/shape errors remain in onboarding and queue entry paths.

## Phase 3: P1 reliability and race-condition handling

### Tasks
- [ ] Handle immediate `resolved` response from `POST /sessions/:id/choice` without waiting for socket event.
- [ ] Use backend `refunded` value from `DELETE /queue/leave` to drive local token refund logic.

### Primary files
- `/Users/joshcabana/verity/verity-mobile/src/hooks/useDecision.ts`
- `/Users/joshcabana/verity/verity-mobile/src/screens/DecisionScreen.tsx`
- `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`
- `/Users/joshcabana/verity/verity-mobile/src/screens/WaitingScreen.tsx`

### Gap IDs covered
- `GAP-007`, `GAP-008`

### Gate checks
- [ ] Decision path succeeds when API responds `resolved` even with delayed socket events.
- [ ] Queue leave never over-credits local token balance in race scenarios.

### Definition of done
- Flow remains correct under event delays and queue race conditions.

## Phase 4: P2 cleanup and compatibility removals

### Tasks
- [ ] Make `queue:estimate` optional/no-op or remove UI dependency.
- [ ] Standardize settings/profile screens on common API helper behavior.
- [ ] Remove temporary fallbacks after one stable release cycle.

### Primary files
- `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`
- `/Users/joshcabana/verity/verity-mobile/src/screens/settings/ProfileEditScreen.tsx`
- `/Users/joshcabana/verity/verity-mobile/src/screens/settings/DeleteAccountScreen.tsx`
- `/Users/joshcabana/verity/verity-mobile/src/screens/settings/SettingsScreen.tsx`

### Gap IDs covered
- `GAP-009`, `GAP-010`

### Gate checks
- [ ] Queue UI still functions when no estimate event is emitted.
- [ ] Settings/profile actions share consistent auth and error handling behavior.
- [ ] Legacy fallback listeners removed only after release verification.

### Definition of done
- Client code is contract-clean and migration shims are retired safely.

## Test Plan Checklist (minimum required)

### Update existing tests
- [ ] `/Users/joshcabana/verity/verity-mobile/tests/__tests__/queue.flow.test.tsx`
- [ ] `/Users/joshcabana/verity/verity-mobile/src/screens/__tests__/VideoCallScreen.test.tsx`
- [ ] `/Users/joshcabana/verity/verity-mobile/tests/__tests__/settings.test.tsx`

### Add/expand recommended tests
- [ ] `/Users/joshcabana/verity/verity-mobile/tests/__tests__/onboarding.flow.test.tsx`
- [ ] `/Users/joshcabana/verity/verity-mobile/tests/__tests__/decision.flow.test.tsx`
- [ ] `/Users/joshcabana/verity/verity-mobile/tests/__tests__/matches.test.tsx`

### Test gate before merge
- [ ] Mobile unit/integration suite passes.
- [ ] Backend tests for new `PATCH /users/me` pass.
- [ ] Manual smoke of onboarding -> queue -> session -> decision -> chat passes.

## Tracking fields (per PR or implementation batch)
- Owner:
- Branch:
- Date started:
- Date completed:
- Risks or blockers:
- Notes:
