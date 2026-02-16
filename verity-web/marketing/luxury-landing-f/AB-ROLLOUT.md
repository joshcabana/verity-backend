# Verity Landing — A/B Rollout Runbook (Luxury Variant F)

Last updated: 2026-02-16

## Objective

Increase qualified waitlist conversion while preserving trust-first, privacy-first positioning.

## Experiment scope

- Control variants: `A`, `C`
- Treatment variant: `F` (luxury dark/light, intensity: subtle|medium|bold)

## Success metrics

### Primary KPI

- **Waitlist submit rate** = `waitlist_form_submit / lp_exposure`

### Secondary KPIs

- Form start rate = `waitlist_form_start / lp_exposure`
- Hero CTA CTR = `lp_click(target=hero_waitlist_primary) / lp_exposure`
- Final CTA CTR = `lp_click(target=final_waitlist_primary) / lp_exposure`
- Theme toggle engagement = `theme_toggle / lp_exposure`

### Guardrails

- Scroll depth >= 50% drop must be < 12% vs control
- FAQ open rate drop must be < 15% vs control
- No increase in invalid/low-intent submissions (manual QA sample daily)

## Recommended rollout ladder

> Keep treatment fixed at `intensity=medium` for the first pass.

1. **Stage 0 — Baseline lock (24h)**
   - Collect control baseline (A/C only)
   - Confirm instrumentation sanity + no SRM

2. **Stage 1 — 10% treatment (24h)**
   - Route 10% eligible traffic to `variant=F&theme=luxury-dark&intensity=medium`
   - Keep all paid channels balanced (avoid source skew)

3. **Stage 2 — 30% treatment (24–48h)**
   - Promote only if Stage 1 KPI >= control and guardrails hold

4. **Stage 3 — 50% treatment (48h)**
   - Optional split test inside F: `medium` vs `subtle`

5. **Stage 4 — Default candidate**
   - If lift persists + guardrails pass, set F-medium as default candidate

## Stop / rollback rules

Rollback immediately if any of the below occur for > 3h sustained:

- Primary KPI down >= 10% vs control
- Form start rate down >= 12% vs control
- Significant UX regression on mobile (manual QA + session review)
- Telemetry outage (cannot trust readout)

## Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Source mix bias (paid links forcing one variant) | False winner | Medium | Randomize at edge/app layer; stratify by source/campaign |
| Novelty effect on luxury visuals | Temporary uplift | Medium | Hold test for at least 3 full dayparts |
| Mobile performance regression from ambient video | Conversion drop | Low-Med | Keep mobile video disabled; use poster fallback |
| Privacy/compliance telemetry overreach | Trust/legal risk | Low | Track event metadata only; no email payloads |
| SRM (traffic split mismatch) | Invalid stats | Medium | Daily SRM check before interpretation |

## Minimal daily checklist

- [ ] KPI and guardrails by variant/theme/intensity
- [ ] Source/campaign split parity
- [ ] Mobile QA pass (iOS + Android)
- [ ] Form submission quality sample
- [ ] Decision log entry (hold / promote / rollback)

## Notes

- Keep `F-bold` as a later test branch, not initial rollout.
- Keep copy constant while testing visual treatment first (avoid multi-variable confusion).
