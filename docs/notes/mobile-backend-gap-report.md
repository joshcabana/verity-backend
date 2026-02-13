# Mobile vs Backend Gap Report (Patch-Ready)

Date: 2026-02-08  
Scope: `/Users/joshcabana/verity/verity-mobile/src`, `/Users/joshcabana/verity/verity-mobile/tests`, `/Users/joshcabana/verity/src`, and `/Users/joshcabana/verity/verity-web/src`  
Output mode: specification only (no code changes in this step)

> Historical snapshot: this report captures the gap state on 2026-02-08.  
> Current production queue contract uses `/queue` `match` payload `{ sessionId, partnerAnonymousId, queueKey, matchedAt }` and scoped `queue:status` updates.

## Executive Summary
- Primary release risk is high because multiple P0 contract mismatches break onboarding, queue entry, session bootstrap, and decision resolution.
- Severity counts:
  - P0: 6
  - P1: 2
  - P2: 2
- Highest-risk breakpoints:
  - Mobile queue join request omits required `region`.
  - Mobile queue and decision/session listeners use the wrong socket namespace.
  - Mobile expects queue payload to contain Agora fields, but backend sends session metadata only.
  - Mobile onboarding expects `{ userId, accessToken }` while backend returns `{ user, accessToken }`.
  - Mobile calls `PATCH /users/me`, but backend does not expose it.
- Existing non-target workspace state (deleted `/Users/joshcabana/verity/Dockerfile`) was intentionally left untouched.

## Contract Baseline (Backend)

### REST (mobile-impacting)

| Method | Path | Auth | Canonical request payload | Canonical response payload | Source |
|---|---|---|---|---|---|
| POST | `/auth/signup-anonymous` | No | `{ dateOfBirth?, consents?, privacyNoticeVersion?, tosVersion? }` | `{ user, accessToken }` | `/Users/joshcabana/verity/src/auth/auth.controller.ts` |
| POST | `/auth/verify-email` | JWT | `{ email, code? }` | Updated user object | `/Users/joshcabana/verity/src/auth/auth.controller.ts` |
| POST | `/auth/verify-phone` | JWT | `{ phone, code? }` | Updated user object | `/Users/joshcabana/verity/src/auth/auth.controller.ts` |
| GET | `/users/me` | JWT | none | Current user profile | `/Users/joshcabana/verity/src/auth/auth.controller.ts` |
| DELETE | `/users/me` | JWT | none | `{ success: true }` | `/Users/joshcabana/verity/src/auth/auth.controller.ts` |
| GET | `/users/me/export` | JWT | none | Export bundle | `/Users/joshcabana/verity/src/auth/auth.controller.ts` |
| POST | `/queue/join` | JWT | `{ region, preferences? }` | `{ status, queueKey, position }` | `/Users/joshcabana/verity/src/queue/queue.controller.ts`, `/Users/joshcabana/verity/src/queue/queue.service.ts` |
| DELETE | `/queue/leave` | JWT | none | `{ status, refunded }` | `/Users/joshcabana/verity/src/queue/queue.controller.ts`, `/Users/joshcabana/verity/src/queue/queue.service.ts` |
| POST | `/sessions/:id/choice` | JWT | `{ choice: "MATCH" \| "PASS" }` | `{ status: "pending", deadline }` or `{ status: "resolved", outcome, matchId? }` | `/Users/joshcabana/verity/src/session/session.controller.ts`, `/Users/joshcabana/verity/src/session/session.service.ts` |
| GET | `/matches` | JWT | none | `Match[]` with `partner` profile | `/Users/joshcabana/verity/src/matches/matches.controller.ts`, `/Users/joshcabana/verity/src/matches/matches.service.ts` |
| GET | `/matches/:id/messages` | JWT | `limit?` query | `Message[]` | `/Users/joshcabana/verity/src/matches/matches.controller.ts` |
| POST | `/matches/:id/messages` | JWT | `{ text }` | `Message` | `/Users/joshcabana/verity/src/matches/matches.controller.ts` |
| GET | `/tokens/balance` | JWT | none | `{ tokenBalance }` | `/Users/joshcabana/verity/src/payments/payments.controller.ts` |
| POST | `/tokens/purchase` | JWT | `{ packId: "starter" \| "plus" \| "pro" }` | `{ sessionId, url }` | `/Users/joshcabana/verity/src/payments/payments.controller.ts`, `/Users/joshcabana/verity/src/payments/payments.service.ts` |
| POST | `/notifications/tokens` | JWT | `{ token, platform, deviceId? }` | `{ success, token }` | `/Users/joshcabana/verity/src/notifications/notifications.controller.ts` |
| DELETE | `/notifications/tokens` | JWT | `{ token }` | `{ success, removed }` | `/Users/joshcabana/verity/src/notifications/notifications.controller.ts` |

### WebSocket (canonical)

| Namespace | Event | Payload | Direction | Source |
|---|---|---|---|---|
| `/queue` | `match` | `{ sessionId, partnerAnonymousId, queueKey, matchedAt }` | Server -> client | `/Users/joshcabana/verity/src/queue/queue.gateway.ts` |
| `/video` | `session:start` | `{ sessionId, channelName, rtc, rtm, startAt, endAt, expiresAt, durationSeconds }` | Server -> client | `/Users/joshcabana/verity/src/video/video.gateway.ts` |
| `/video` | `session:end` | `{ sessionId, reason, endedAt }` | Server -> client | `/Users/joshcabana/verity/src/video/video.gateway.ts` |
| `/video` | `match:mutual` | `{ sessionId, matchId }` | Server -> client | `/Users/joshcabana/verity/src/session/session.service.ts` |
| `/video` | `match:non_mutual` | `{ sessionId, outcome: "pass" }` | Server -> client | `/Users/joshcabana/verity/src/session/session.service.ts` |
| `/chat` | `message:new` | `{ id, matchId, senderId, text, createdAt }` | Server -> client | `/Users/joshcabana/verity/src/chat/chat.gateway.ts` |

## Mobile Usage Map

### Onboarding and profile
- `/auth/signup-anonymous` called in `/Users/joshcabana/verity/verity-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`.
- `PATCH /users/me` called in:
  - `/Users/joshcabana/verity/verity-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`
  - `/Users/joshcabana/verity/verity-mobile/src/screens/settings/ProfileEditScreen.tsx`
- `DELETE /users/me` called in `/Users/joshcabana/verity/verity-mobile/src/screens/settings/DeleteAccountScreen.tsx`.
- `/auth/verify-email` and `/auth/verify-phone` called in `/Users/joshcabana/verity/verity-mobile/src/screens/settings/SettingsScreen.tsx`.

### Queue and waiting
- `/queue/join` and `/queue/leave` called in `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`.
- Historical note (resolved): queue listeners were on root socket (`queue:estimate`, `match:found`) at report time.
- Current implementation listens on `/queue` for `match` and `queue:status`, while keeping `match:found` fallback compatibility for one release window.

### Session and decision
- `session:end` listener currently attached to root socket in `/Users/joshcabana/verity/verity-mobile/src/screens/VideoCallScreen.tsx`.
- Decision resolution listeners currently on root socket in `/Users/joshcabana/verity/verity-mobile/src/hooks/useDecision.ts`:
  - `match:mutual`
  - `match:non_mutual`
  - `match:rejected` (not emitted by backend)
- `POST /sessions/:id/choice` called in `/Users/joshcabana/verity/verity-mobile/src/hooks/useDecision.ts`.

### Matches and chat
- `/matches`, `/matches/:id/messages`, `/matches/:id/messages` (POST) in:
  - `/Users/joshcabana/verity/verity-mobile/src/queries/useMatchesQuery.ts`
  - `/Users/joshcabana/verity/verity-mobile/src/queries/useChatQuery.ts`
- `/chat` namespace socket and `message:new` listener in `/Users/joshcabana/verity/verity-mobile/src/hooks/useWebSocket.ts`.

### Tokens
- `/tokens/balance` and `/tokens/purchase` in `/Users/joshcabana/verity/verity-mobile/src/hooks/usePurchaseTokens.ts`.

## Gap Matrix (Exact Fix-List Format)

### GAP-001
1. Gap ID: `GAP-001`
2. Severity (P0/P1/P2): `P0`
3. Current mobile behavior: `POST /queue/join` is called with no body.
4. Canonical backend contract: `/queue/join` requires `{ region, preferences? }`.
5. Recommended change: Send `{ region, preferences: {} }` from mobile; default `region` from environment or app constant with explicit fallback.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`
   - `/Users/joshcabana/verity/verity-mobile/src/screens/HomeScreen.tsx` (if region is user-selectable or stored here)
7. Backward compatibility note: None required; this is request-side completion to satisfy existing required backend DTO.
8. Test updates required:
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/queue.flow.test.tsx`
   - add assertion for request body containing `region`
9. Definition of done: Queue join succeeds (2xx) and waiting flow starts without `Region is required` errors.

### GAP-002
1. Gap ID: `GAP-002`
2. Severity (P0/P1/P2): `P0`
3. Current mobile behavior: Queue events listened on root socket (`match:found`, `queue:estimate`).
4. Canonical backend contract: Queue gateway emits `match` on namespace `/queue`.
5. Recommended change: Add dedicated `/queue` socket client and subscribe to `match`; keep temporary fallback listener for `match:found` during migration.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useWebSocket.ts`
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`
   - `/Users/joshcabana/verity/verity-mobile/src/screens/WaitingScreen.tsx` (if event wiring remains screen-side)
7. Backward compatibility note: Keep `match:found` fallback for one release window to support mixed backend environments.
8. Test updates required:
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/queue.flow.test.tsx`
   - add namespace-aware socket mock and `match` event assertions
9. Definition of done: Mobile receives `match` from `/queue` and navigates to session reliably.

### GAP-003
1. Gap ID: `GAP-003`
2. Severity (P0/P1/P2): `P0`
3. Current mobile behavior: `VideoCallScreen` expects route params `channelToken` and `agoraChannel`.
4. Canonical backend contract: Session credentials arrive via `/video` `session:start` payload (`channelName`, `rtc.token`, `rtc.uid`, `durationSeconds`).
5. Recommended change: Refactor mobile session bootstrap to wait for `session:start` and initialize Agora from payload fields.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/screens/VideoCallScreen.tsx`
   - `/Users/joshcabana/verity/verity-mobile/src/services/agora.ts`
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useWebSocket.ts` (add `/video` socket)
7. Backward compatibility note: Allow temporary legacy route-param bootstrap fallback only if `session:start` is absent after timeout.
8. Test updates required:
   - `/Users/joshcabana/verity/verity-mobile/src/screens/__tests__/VideoCallScreen.test.tsx`
   - add test for `session:start`-driven bootstrap path
9. Definition of done: Video call can start with backend-provided `session:start` payload alone.

### GAP-004
1. Gap ID: `GAP-004`
2. Severity (P0/P1/P2): `P0`
3. Current mobile behavior: Decision/match listeners are attached to root socket; also listens for `match:rejected` which backend does not emit.
4. Canonical backend contract: `match:mutual` and `match:non_mutual` are emitted on namespace `/video`.
5. Recommended change: Attach decision and mutual-match listeners to `/video`; remove dependency on nonexistent `match:rejected`.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useDecision.ts`
   - `/Users/joshcabana/verity/verity-mobile/src/screens/matches/MatchesListScreen.tsx`
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useWebSocket.ts`
7. Backward compatibility note: Optional short-term fallback listener on root can be retained for phased rollout.
8. Test updates required:
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/decision.flow.test.tsx`
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/matches.test.tsx`
9. Definition of done: Decision outcome resolves on emitted `/video` events without hanging.

### GAP-005
1. Gap ID: `GAP-005`
2. Severity (P0/P1/P2): `P0`
3. Current mobile behavior: Onboarding signup expects `{ userId, accessToken }`.
4. Canonical backend contract: Signup returns `{ user, accessToken }`.
5. Recommended change: Update mobile parsing to read `data.user.id`; store full returned user shape where useful.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useAuth.ts` (type alignment if needed)
7. Backward compatibility note: During migration, parsing can accept both `{ userId }` and `{ user: { id } }`.
8. Test updates required:
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/onboarding.flow.test.tsx`
9. Definition of done: New users complete signup without response-shape errors.

### GAP-006
1. Gap ID: `GAP-006`
2. Severity (P0/P1/P2): `P0`
3. Current mobile behavior: Calls `PATCH /users/me` during onboarding and profile edit.
4. Canonical backend contract: Backend currently has `GET /users/me` and `DELETE /users/me` only.
5. Recommended change: Add backend `PATCH /users/me` (JWT) with DTO for editable fields (`displayName`, `age`, `gender`, `interests`, `photos`, `bio`) and return updated profile aligned with `GET /users/me`.
6. Files to modify:
   - `/Users/joshcabana/verity/src/auth/auth.controller.ts`
   - `/Users/joshcabana/verity/src/auth/auth.service.ts`
   - `/Users/joshcabana/verity/src/auth/dto/` (new update DTO)
   - `/Users/joshcabana/verity/verity-mobile/src/screens/onboarding/ProfileSetupScreen.tsx`
   - `/Users/joshcabana/verity/verity-mobile/src/screens/settings/ProfileEditScreen.tsx`
7. Backward compatibility note: Additive endpoint; no consumer breakage. Existing `GET/DELETE /users/me` unchanged.
8. Test updates required:
   - backend unit/e2e for `PATCH /users/me`
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/settings.test.tsx`
9. Definition of done: Onboarding profile write and profile edit both succeed against canonical API.

### GAP-007
1. Gap ID: `GAP-007`
2. Severity (P0/P1/P2): `P1`
3. Current mobile behavior: `useDecision` ignores resolved payload from `POST /sessions/:id/choice`; it always waits for events.
4. Canonical backend contract: Choice endpoint can return immediate `resolved` result including `matchId`.
5. Recommended change: Handle resolved API response path directly, mirroring web logic.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useDecision.ts`
   - `/Users/joshcabana/verity/verity-mobile/src/screens/DecisionScreen.tsx`
7. Backward compatibility note: Keep event path active; direct response handling is additive resilience.
8. Test updates required:
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/decision.flow.test.tsx`
9. Definition of done: User proceeds correctly even if socket event is delayed or dropped.

### GAP-008
1. Gap ID: `GAP-008`
2. Severity (P0/P1/P2): `P1`
3. Current mobile behavior: Queue leave refund decision is inferred locally instead of reading backend `refunded`.
4. Canonical backend contract: `/queue/leave` explicitly returns `{ refunded }`.
5. Recommended change: Parse and trust backend `refunded` field to avoid local over-credit races.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`
   - `/Users/joshcabana/verity/verity-mobile/src/screens/WaitingScreen.tsx`
7. Backward compatibility note: Fallback to current heuristic only if payload lacks `refunded`.
8. Test updates required:
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/queue.flow.test.tsx`
9. Definition of done: Local balance adjustments match server refund decisions under race conditions.

### GAP-009
1. Gap ID: `GAP-009`
2. Severity (P0/P1/P2): `P2`
3. Current mobile behavior: Expects `queue:estimate` event.
4. Canonical backend contract: No `queue:estimate` emission exists in current backend codebase.
5. Recommended change: Remove dependency from UI logic or add backend estimate emitter in a separate feature ticket.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/hooks/useQueue.ts`
   - optional backend feature path: `/Users/joshcabana/verity/src/queue/queue.service.ts`
7. Backward compatibility note: Keep listener as no-op if retained; do not block flow on estimate.
8. Test updates required:
   - Queue UI tests should not require estimate event.
9. Definition of done: Queue UI remains functional when no estimate events are emitted.

### GAP-010
1. Gap ID: `GAP-010`
2. Severity (P0/P1/P2): `P2`
3. Current mobile behavior: Mixed transport helpers (`apiJson` and raw `fetch`) produce inconsistent parsing/error paths.
4. Canonical backend contract: Uniform JSON API with consistent auth and error semantics.
5. Recommended change: Standardize mobile networking through one helper layer for `/users/me`, verification, and token endpoints.
6. Files to modify:
   - `/Users/joshcabana/verity/verity-mobile/src/screens/settings/ProfileEditScreen.tsx`
   - `/Users/joshcabana/verity/verity-mobile/src/screens/settings/DeleteAccountScreen.tsx`
   - `/Users/joshcabana/verity/verity-mobile/src/screens/settings/SettingsScreen.tsx`
7. Backward compatibility note: No API contract change; client-side reliability improvement.
8. Test updates required:
   - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/settings.test.tsx`
9. Definition of done: Settings/profile actions share consistent auth, error, and response handling behavior.

## Fix Plan (Ordered Implementation)

1. P0 transport and namespace/event alignment
   - Add `/queue` and `/video` sockets in mobile.
   - Move queue listeners to `/queue` and session/decision listeners to `/video`.
   - Keep temporary fallback listeners where specified.
2. P0 request/response shape alignment
   - Add `region` to queue join request.
   - Align signup response parsing to `{ user, accessToken }`.
   - Implement backend `PATCH /users/me`.
3. P1 resiliency fixes
   - Handle immediate resolved response from `/sessions/:id/choice`.
   - Respect backend `refunded` response in queue leave flow.
4. P2 cleanup
   - Remove stale/noncanonical listeners and root-socket dependencies.
   - Standardize transport helpers in settings/profile screens.

## Validation Plan

### Runtime smoke checks
1. Onboarding path:
   - Signup succeeds.
   - Profile update succeeds via `PATCH /users/me`.
   - User reaches main tabs.
2. Queue path:
   - Join sends `region`.
   - Match event on `/queue` navigates to session.
3. Session path:
   - `session:start` initializes Agora.
   - `session:end` transitions to decision.
4. Decision path:
   - Mutual and non-mutual outcomes resolve via `/video` events and/or immediate resolved API response.
5. Settings path:
   - Verify email/phone, delete account, and profile update all work with consistent error handling.

### Automated tests to update/add (minimum)
- `/Users/joshcabana/verity/verity-mobile/tests/__tests__/queue.flow.test.tsx`
- `/Users/joshcabana/verity/verity-mobile/src/screens/__tests__/VideoCallScreen.test.tsx`
- `/Users/joshcabana/verity/verity-mobile/tests/__tests__/settings.test.tsx`
- Plus recommended:
  - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/onboarding.flow.test.tsx`
  - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/decision.flow.test.tsx`
  - `/Users/joshcabana/verity/verity-mobile/tests/__tests__/matches.test.tsx`

## Rollout and Compatibility
- Stage 1 (safe dual-read): keep temporary fallback listeners for `match:found` and legacy response keys.
- Stage 2 (primary cutover): remove root-socket dependency for queue/video flows.
- Stage 3 (cleanup): remove temporary fallbacks after one stable release cycle.
- Backend additive change (`PATCH /users/me`) can be released before mobile rollout to reduce coordination risk.

## Assumptions and Defaults Applied
1. Backend code is source of truth for existing contracts.
2. Web implementation is tie-breaker when mobile and backend differ.
3. `PATCH /users/me` is an approved additive backend contract extension.
4. This report intentionally performs no functional code edits.
