# Verity v1 Priority Backlog (Ticket-Ready)

> Horizon: Next 2–6 weeks
> Status: Prioritized draft
> Date: 2026-02-16

## Prioritization method

- **P0:** Blocks safe launch or valid decision-making.
- **P1:** Needed to improve conversion/retention once P0 is stable.
- **P2:** Valuable optimization after core gates are green.

## P0 — Launch blockers

### EPIC P0-1: Telemetry sink and gate dashboard

**Why now**
Without durable analytics, stage decisions are guesswork.

**Stories**
1. Implement production event sink for queue/session/match/chat funnel events.
2. Build gate dashboard with p50/p90 wait, abandonment, severe incidents, completion, mutual match, chat activation.
3. Add event QA harness to detect dropped/duplicate events.

**Acceptance criteria**
- Event delivery success >= 99% for tracked flows.
- Dashboard updates within operational SLA.
- Data parity checks pass across backend and client emissions.

**Risk callout**
Partial telemetry can produce false-positive launch decisions.

---

### EPIC P0-2: Trust & Safety enforcement core

**Why now**
Brand trust is fragile during first cohort growth.

**Stories**
1. One-tap in-call report/block from live session UI.
2. Enforcement ladder implementation (warn/timeout/ban).
3. Device/account link strategy for repeat-offender evasion resistance.
4. Appeal triage queue with SLA tracking.

**Acceptance criteria**
- Severe moderation action latency p95 <= 2s.
- Repeat-offender return rate trends downward week over week.
- Appeal backlog within SLA.

**Risk callout**
Under-enforcement creates safety incidents; over-enforcement harms legitimate users.

---

### EPIC P0-3: Queue liquidity controls

**Why now**
Queue wait is the first product moment and fastest churn lever.

**Stories**
1. Timeout prompt with continue/leave paths and deterministic behavior.
2. Queue ETA confidence bands and fallback copy ladder.
3. No-match auto-refund (or credit) logic with explicit user messaging.
4. Live-window ops controls (capacity, invite pacing, overflow handling).

**Acceptance criteria**
- Match wait p50 <= 30s, p90 <= 90s (closed beta target).
- Queue abandonment <= 15%.
- Refund logic validated in edge paths.

**Risk callout**
Aggressive capacity unlock without supply controls can collapse quality quickly.

---

## P1 — Product signal strengthening

### EPIC P1-1: New-user confidence layer

**Why now**
45s intensity can be high for first-time users.

**Stories**
1. Optional pre-call icebreaker prompt card.
2. First-session expectation setting UX (what happens in 45s + safety reminders).
3. Post-call lightweight reflection prompt for quality signals.

**Acceptance criteria**
- First-call completion improves without safety regressions.
- No increase in drop-off at queue entry.

**Risk callout**
Too much guidance can dilute the product’s fast, minimal identity.

---

### EPIC P1-2: Cohort intake quality

**Why now**
Early cohort quality determines downstream retention shape.

**Stories**
1. Invite/referral weighting for high-intent users.
2. Onboarding friction tuning for authenticity and safety.
3. Segment-level retention tracking (professionals/creatives/high-intent tags where lawful).

**Acceptance criteria**
- D7 return >= 22% for first-call cohort.
- Safety incident density does not increase with cohort expansion.

**Risk callout**
Over-curation can hurt scale learning; under-curation can poison early brand trust.

---

## P2 — Monetization rollout (after gates)

### EPIC P2-1: Token activation with fairness guardrails

**Why now**
Revenue should follow validated core experience, not precede it.

**Stories**
1. Free baseline sessions with clear replenishment policy.
2. Priority matching experiments on small traffic slices.
3. Fast re-queue token option with spend friction prompts.
4. Themed room token access pilots.

**Acceptance criteria**
- Paid conversion >= 4% (eligible cohort) by week 4.
- No degradation in liquidity or safety gates.
- Complaint rate about pricing fairness stays below threshold.

**Risk callout**
Poorly tuned token mechanics can look predatory and harm long-term retention.

## Operational checklist for every sprint

- [ ] Are market assumptions still flagged as assumptions (if not source-locked)?
- [ ] Did any feature increase queue wait or abandonment?
- [ ] Did any feature increase severe incidents or appeal overturns?
- [ ] Did monetization changes impact cohort fairness outcomes?
- [ ] Are we still preserving Verity non-negotiables?
