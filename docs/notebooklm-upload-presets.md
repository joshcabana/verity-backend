# NotebookLM Upload Presets

Last updated: 2026-02-11
Workspace: `/Users/joshcabana/verity`

## Preset A: Executive (fastest)

Upload only these:
- `/Users/joshcabana/verity/docs/notebooklm-executive-brief.md`
- `/Users/joshcabana/verity/docs/notebooklm-context-pack.md`
- `/Users/joshcabana/verity/docs/notes/go-live-checklist.md`
- `/Users/joshcabana/verity/docs/notes/incident-runbook.md`
- `/Users/joshcabana/verity/docs/test-summary.md`

Use when you want strategy, risks, readiness, and launch guidance.

## Preset B: Engineering Core

Upload these in addition to Preset A:
- `/Users/joshcabana/verity/README.md`
- `/Users/joshcabana/verity/package.json`
- `/Users/joshcabana/verity/prisma/schema.prisma`
- `/Users/joshcabana/verity/src/app.module.ts`
- `/Users/joshcabana/verity/src/main.ts`
- `/Users/joshcabana/verity/src/common/security-config.ts`
- `/Users/joshcabana/verity/src/auth/auth.controller.ts`
- `/Users/joshcabana/verity/src/queue/queue.controller.ts`
- `/Users/joshcabana/verity/src/session/session.controller.ts`
- `/Users/joshcabana/verity/src/matches/matches.controller.ts`
- `/Users/joshcabana/verity/src/payments/payments.controller.ts`
- `/Users/joshcabana/verity/src/moderation/moderation.controller.ts`
- `/Users/joshcabana/verity/src/notifications/notifications.controller.ts`
- `/Users/joshcabana/verity/src/queue/queue.gateway.ts`
- `/Users/joshcabana/verity/src/video/video.gateway.ts`
- `/Users/joshcabana/verity/src/chat/chat.gateway.ts`
- `/Users/joshcabana/verity/.github/workflows/tests.yml`
- `/Users/joshcabana/verity/.github/workflows/deploy-azure.yml`
- `/Users/joshcabana/verity/infra/azure/README.md`
- `/Users/joshcabana/verity/infra/azure/main.bicep`
- `/Users/joshcabana/verity/.env.production.example`

Use when you want implementation-level API, socket, auth, and deployment analysis.

## Preset C: Full Monorepo Code

Connect GitHub repo:
- [verity-backend](https://github.com/joshcabana/verity-backend)

Then add:
- `/Users/joshcabana/verity/docs/notebooklm-context-pack.md`
- `/Users/joshcabana/verity/docs/notebooklm-executive-brief.md`

Use when you want highest answer quality across product + code + operations.

## Do Not Upload

- `/Users/joshcabana/verity/node_modules/**`
- `/Users/joshcabana/verity/verity-web/node_modules/**`
- `/Users/joshcabana/verity/verity-mobile/node_modules/**`
- `/Users/joshcabana/verity/dist/**`
- `/Users/joshcabana/verity/verity-web/dist/**`
- `/Users/joshcabana/verity/coverage/**`
- `/Users/joshcabana/verity/.venv-pdf/**`
- any real secret files such as `.env`

