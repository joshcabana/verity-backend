# Verity Executive Brief for NotebookLM

Last updated: 2026-02-11
Prepared from repository state at commit: `2358dddbee6fd8ef9605f15bc730dea6a47b3d25`

## Executive Summary

Verity is a three-surface product platform:
- Backend platform and real-time services
- Web client
- Mobile client

Core user journey:
1. Anonymous onboarding
2. Queue entry for real-time pairing
3. Time-boxed video session
4. Mutual decision flow (match/pass)
5. Chat unlock on mutual match
6. Token-based monetization via Stripe

This repository includes not only product code but also operational assets: deployment templates, CI workflows, runbooks, and release checklists.

## Current Platform Shape

### Product capabilities in scope
- Real-time matching and short video sessions
- Messaging between matched users
- Moderation reporting and user blocking
- Token balance and purchase flows
- Push token registration
- Basic observability endpoints for web vitals and frontend errors

### Delivery model
- Monorepo with backend, web, and mobile clients
- Automated CI checks for backend, web, and mobile
- Manual Azure deployment workflow for controlled releases
- Australia-first infrastructure posture with Canberra primary and Sydney fallback

## Operational Readiness Signals

### Positive indicators
- Strong documented test posture and broad automated checks in CI
- Published incident runbook with severity model and first-15-minute triage flow
- Go-live checklist covering build/test/infrastructure/runtime/rollback controls
- Deployment automation defined in GitHub Actions plus Azure Bicep

### Risk indicators
- Historical mobile/backend contract mismatch workstream exists and should be treated as active risk until all items are validated complete
- Real-time systems depend on correct cross-app event contracts; regressions are high impact
- Production reliability depends on external integrations (Stripe, Agora, Hive, Twilio) and environment correctness

## Governance and Security Posture

Key controls present in code/config:
- JWT-based authentication with refresh-token rotation model
- CORS origin allowlisting via environment configuration
- Global request throttling plus targeted endpoint throttles
- Account export and deletion endpoints for user data handling
- CI guardrails around push-notification privacy payloads

Executive note: this is a practical security baseline; periodic security review and incident drills remain necessary.

## Deployment and Infrastructure Posture

Primary target architecture:
- Azure Container Apps (API + worker)
- PostgreSQL Flexible Server
- Redis
- Key Vault + managed identity

Regional strategy:
- Canberra preferred when available
- Sydney fallback path already documented and supported

Release model:
- Manual dispatch deploy workflow (lower automation risk, higher operator control)

## What NotebookLM Should Prioritize

For executive Q&A, NotebookLM should prioritize:
1. `docs/notebooklm-executive-brief.md` (this file)
2. `docs/notebooklm-context-pack.md` (technical cross-reference)
3. `docs/notes/go-live-checklist.md`
4. `docs/notes/incident-runbook.md`
5. `docs/test-summary.md`
6. `docs/notes/mobile-backend-gap-report.md`
7. `docs/notes/mobile-backend-gap-fix-checklist.md`

## Suggested Executive Questions

- What launch blockers remain before broad rollout?
- Which risks are highest probability vs highest impact?
- What are the minimum reliability gates for launch/no-launch?
- What rollback and incident response capability exists today?
- What dependencies outside engineering control could affect launch timing?

## Decision-Oriented Watchlist

Track these weekly until stable launch:
- End-to-end pass rate for onboarding -> queue -> video -> decision -> chat flows
- Mobile/backend contract drift incidents
- Stripe webhook success/failure trends
- Session and queue failure rates during peak tests
- Time-to-detect and time-to-recover in incident drills

## NotebookLM Prompt Seed (Executive)

Use this prompt after uploading sources:

"Act as an executive technical advisor for Verity. Use source code only as supporting evidence and prioritize operational and decision-level clarity. Always separate (1) confirmed facts from sources, (2) inferred risks, and (3) recommended actions. For each recommendation, include expected impact, implementation effort (low/medium/high), and urgency (now/next/later)."

