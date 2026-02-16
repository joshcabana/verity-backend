# Verity v1 Telemetry Spec (Product + Safety Gates)

> Purpose: Define minimum viable analytics contract for stage-gate decisions.
> Status: Draft
> Date: 2026-02-16

## 1) Principles

- Measure what is needed for launch gates, nothing more.
- Treat safety metrics as first-class product metrics.
- Minimize personal data; prefer IDs/hashes over direct identifiers.

## 2) Required event envelope

Every event should include:

- `eventId` (UUID)
- `eventName` (string)
- `occurredAt` (ISO timestamp)
- `userId` (internal ID or irreversible hash)
- `platform` (`web` | `ios` | `android`)
- `appVersion` / `buildNumber`
- `region` (operational region key)
- `queueKey` (if applicable)
- `sessionId` (if applicable)
- `matchId` (if applicable)
- `requestId` / trace correlation fields where possible

## 3) Canonical funnel events

### Queue + matching

- `queue_joined`
  - fields: `entryMode`, `tokenDebited`, `usersSearchingSnapshot`
- `queue_timeout_shown`
  - fields: `waitSeconds`, `usersSearchingSnapshot`, `etaSeconds`
- `queue_timeout_continue`
  - fields: `waitSeconds`
- `queue_timeout_leave`
  - fields: `waitSeconds`, `refundIssued`
- `queue_match_found`
  - fields: `waitSeconds`, `usersSearchingSnapshot`
- `queue_left`
  - fields: `reason` (`manual`|`timeout`|`matched`|`system`), `refundIssued`

### Session lifecycle

- `session_started`
  - fields: `sessionId`, `matchedAt`, `serverStartLatencyMs`
- `session_ended`
  - fields: `durationSeconds`, `endedBy` (`timer`|`moderation`|`disconnect`|`error`)
- `session_choice_submitted`
  - fields: `choice` (`MATCH`|`PASS`), `submittedAtOffsetSec`
- `session_result`
  - fields: `result` (`mutual_match`|`non_mutual`|`auto_pass`)

### Post-session

- `match_chat_opened`
  - fields: `timeFromMutualMatchSec`
- `match_message_sent`
  - fields: `timeFromMutualMatchSec`, `messageLengthBucket`

### Safety + enforcement

- `safety_report_submitted`
  - fields: `category`, `severityHint`, `source` (`in_call`|`post_call`)
- `safety_violation_detected`
  - fields: `detector`, `policyType`, `confidenceBand`
- `safety_action_taken`
  - fields: `action` (`warn`|`timeout`|`ban`|`terminate_session`), `actionLatencyMs`, `automated`
- `safety_appeal_opened`
  - fields: `actionType`, `timeFromActionSec`
- `safety_appeal_resolved`
  - fields: `resolution` (`upheld`|`overturned`), `resolutionLatencySec`

### Monetization

- `token_balance_viewed`
- `token_purchase_started`
  - fields: `pack`, `priceTier`
- `token_purchase_completed`
  - fields: `pack`, `amount`, `currency`
- `token_spent`
  - fields: `reason` (`queue_entry`|`priority`|`fast_requeue`|`themed_room`), `amount`

## 4) Gate metrics derived from events

- Match wait p50/p90: `queue_match_found.waitSeconds`
- Queue abandonment: `queue_left(reason != matched)` / `queue_joined`
- Call completion: `session_ended(durationSeconds >= 40)` / `session_started`
- Mutual match rate: `session_result(result = mutual_match)` / `session_result`
- Chat activation: `match_chat_opened` / `session_result(mutual_match)`
- Severe incident density: severe `safety_action_taken` per 10k `session_started`
- Appeal overturn rate: `safety_appeal_resolved(overturned)` / all resolved appeals

## 5) Data quality checks (must have)

- Exactly-once guard using `eventId` dedupe.
- Drop-rate monitor by event type (alert if >1%).
- Time-skew guard (reject/flag events with impossible timestamps).
- Contract versioning (`eventSchemaVersion`) for backward compatibility.

## 6) Privacy and legal controls

- Never include raw message content in telemetry events.
- Never include call media in analytics pipeline.
- User IDs should be pseudonymous in analytics stores.
- Retention policy should be explicit and minimum required for operational decisions.

## 7) Rollout checklist

- [ ] Event contract implemented in web/mobile/backend emitters.
- [ ] Event parity tests in CI.
- [ ] Dashboard and alerting thresholds configured.
- [ ] Incident runbook includes telemetry outage play.

## 8) Risk callout

If this contract is partially implemented (missing queue/safety fields), stage-gate decisions become unreliable and can trigger premature scaling.
