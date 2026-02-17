# Queue Operational Polish Stream

## Objective
Ship a focused follow-up that improves waiting confidence and queue conversion with clear timeout handling and basic funnel telemetry.

## Scope
1. Timeout UX
- Add explicit timeout threshold to waiting flow.
- Show decision state when timeout is reached: wait vs leave.
- Ensure no token regression when timeout leads to leave.
- Keep manual pre-timeout exit available via cancel.

2. Waiting Copy Ladder
- Primary status priority:
  1. Live queue count (`X online` on web, `X Online` on mobile)
  2. ETA fallback (`< Ys wait` on web, `< Ys Wait` on mobile)
  3. Default fallback (`Matching fast...`)
- Keep copy stable across web and mobile.

3. Timeout Prompt Copy
- Prompt title: `Still looking...`
- Continue action: `Wait`
- Exit action: `Leave`
- Body copy:
  - Web: `Top tier matches are worth the wait.`
  - Mobile: `Top matches are worth the wait. Refund on exit.`

4. Funnel Instrumentation
- Add/confirm events for:
  - `queue_joined`
  - `queue_timeout_shown`
  - `queue_timeout_continue`
  - `queue_timeout_leave`
  - `queue_match_found`
  - `queue_left`
- Include `queueKey` and outcome fields where relevant.

## Non-goals
- No schema changes.
- No match algorithm changes.
- No reveal/privacy contract changes.

## Acceptance Criteria
- Timeout prompt appears deterministically after threshold in web and mobile waiting screens.
- User can continue searching without resetting queue state.
- User can leave from timeout prompt and refund behavior is preserved.
- Pre-timeout cancel path remains available and functional.
- Funnel events fire exactly once per action path.
- Existing queue + match + waiting tests remain green.

## Validation Plan
- Backend: unit + e2e queue flows and analytics assertions.
- Web: waiting page tests and smoke flow.
- Mobile: queue waiting tests and typecheck.
