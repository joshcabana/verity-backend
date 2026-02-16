# Verity v1 Stage Playbook (Operator Draft)

> Status: Active draft
> Date: 2026-02-16
> Scope: Product + Ops + Safety + Monetization gates for AU-first launch

## 1) What this document does

This playbook turns Verity’s core concept into stage gates that can be operated day to day.
It also bakes in market reality from mainstream dating platforms so we design for real behavior, not ideal behavior.

## 2) Core product truth (do not compromise)

- No profile browsing/swiping
- 45-second live video first interaction
- Private Match/Pass after call
- Mutual match unlock only
- Safety-first moderation and enforcement

## 3) Market Reality Layer (carry through every stage)

Use this context in planning, launch reviews, and comms:

- Online dating is massive (hundreds of millions of users globally; multibillion-dollar annual revenue).
- Mainstream heterosexual apps tend to skew male.
- Women report higher safety friction and harassment rates.
- Men report low-match frustration; women report overwhelm/quality issues.
- Burnout is common; users take breaks from swipe-heavy loops.
- Many users want long-term relationships, not only casual dating.

### Risk callout
These are strategy assumptions until source-locked. Do not use hard numbers in investor/legal/public copy until verified in the source register.

## 4) Stage map

## Stage 0 — Foundation (Reliability + Safety + Instrumentation)

### Objective
Ship a stable and safe closed-beta core before growth.

### Required outputs
- Event pipeline wired to durable sink (product + safety dashboards).
- Moderation policy language hardened (capture prohibited/deterred/penalized).
- Enforcement ladder implemented (warn → timeout → ban + evasion controls).
- Queue timeout UX and no-match handling complete.

### Market reality embedded
- Design initial safety friction to support higher-safety-concern cohorts.
- Avoid swipe-like loops that recreate burnout dynamics.

### Gate to pass
- Connect success >= 98.5%
- Crash-free sessions >= 99.5%
- Severe moderation action latency p95 <= 2s

### Risk callout
If telemetry is weak, every later stage can produce false wins and bad scaling decisions.

---

## Stage 1 — Closed Beta (Single city, fixed live windows)

### Objective
Prove liquidity + safety under controlled supply.

### Required outputs
- Invite-controlled cohort with balanced intake strategy.
- Scheduled high-density windows (e.g., evening blocks).
- Queue ETA and auto-refund behavior live.

### Market reality embedded
- Male-skew risk treated as default condition; manage supply intentionally.
- Safety confidence prioritized to support retention where harassment risk is most sensitive.

### Gate to pass
- Match wait p50 <= 30s
- Match wait p90 <= 90s
- Queue abandonment <= 15%
- Severe incidents <= 3 per 10k calls

### Risk callout
A fast queue with poor safety is not a win. Both must hold together.

---

## Stage 2 — Open Beta (same city, broader hours)

### Objective
Prove repeatable behavior beyond curated early adopters.

### Required outputs
- Gradual capacity expansion with hourly guardrails.
- Real-time RAG dashboard (green/amber/red) for liquidity + safety + conversion.
- Ops runbook for surge windows and incident handling.

### Market reality embedded
- Burnout mitigation measured directly (return behavior, not survey optimism).
- High-intent positioning tested against real user behavior.

### Gate to pass
- Call completion >= 85%
- Mutual match rate in healthy band (12%–35%)
- Chat activation >= 60% after mutual match
- D7 return >= 22% for first-call cohort

### Risk callout
If mutual match is too high, selectivity/noise may be broken; if too low, the spark mechanism may be failing.

---

## Stage 3 — Monetization Activation (small traffic slice)

### Objective
Introduce tokens without degrading trust, fairness, or core experience.

### Required outputs
- Free baseline sessions retained.
- Paid levers limited to speed/experience layers (priority, requeue, themed rooms).
- Spend guardrails (cooldowns, friction prompts, transparent pricing).

### Market reality embedded
- Do not amplify male-skew frustration into pay-to-compete dynamics.
- Protect women’s safety/quality experience from monetized pressure.

### Gate to pass
- Paid conversion (eligible users) >= 4% by week 4
- No deterioration in Stage 1/2 safety + liquidity gates

### Risk callout
Short-term ARPU can mask long-term trust damage.

---

## Stage 4 — Controlled Scale (new zones only after gates)

### Objective
Expand geography only when operating metrics remain stable.

### Required outputs
- Replicable city-launch playbook (supply ops + safety staffing + dashboard templates).
- Automated go/no-go checks per city.

### Market reality embedded
- Region-level differences in gender ratio and behavior expected; don’t clone assumptions blindly.

### Gate to pass
- Two consecutive weeks with all prior gates green in source city
- New city reaches Stage 1 gate thresholds within target ramp window

### Risk callout
Premature expansion is the fastest way to collapse liquidity quality.

## 5) Universal no-go triggers (auto-pause)

- Severe incidents > 5 per 10k calls (rolling 24h)
- Match wait p90 > 150s for >2h
- Appeal backlog breaches SLA threshold
- Confirmed capture/leak pattern spike

## 6) Daily operating cadence

- 10:00: prior-day metric review (liquidity, safety, conversion)
- 14:00: incident + moderation quality review
- 18:00: live-window readiness review
- End-of-day: gate status snapshot + next-day adjustments

## 7) Immediate 14-day priority plan

1. Wire telemetry sink + dashboard reliability checks.
2. Finalize privacy/capture policy language and UI text.
3. Ship enforcement ladder and appeal triage workflow.
4. Launch closed-beta intake controls + live-window operations.
5. Run 2-week gate review and decide Stage 2 entry.

## 8) Decision rule defaults

- If uncertain between growth and trust/safety: choose trust/safety.
- If uncertain between monetization and liquidity quality: choose liquidity quality.
- If uncertain between speed and measurement quality: choose measurement quality.
