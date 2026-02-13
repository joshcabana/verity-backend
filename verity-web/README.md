# Verity Web

Production-ready Vite + React + TypeScript + Tailwind frontend for the Verity dating flow:

1. Onboarding + legal consent
2. Token balance + queue join
3. Live 45s video session (Agora)
4. Match/pass decision
5. Mutual reveal + chat (Socket.IO)

Backend contracts and legal text remain unchanged.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment

```bash
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
VITE_AGORA_APP_ID=your-agora-app-id
VITE_WEB_VITALS_ENDPOINT=http://localhost:3000/monitoring/web-vitals
VITE_FRONTEND_ERROR_ENDPOINT=http://localhost:3000/monitoring/frontend-errors
```

## Commands

```bash
npm run dev
npm run test
npm run build
npm run check:budgets
npm run test:smoke
```

## Notes

- Real-time namespaces used by frontend: `/queue`, `/video`, `/chat`.
- Frontend handles edge states: offline, token depletion, queue timeout, reveal-ack-required, blocked chat, and camera/connect failures.
- Tailwind is configured through `tailwind.config.ts` + `postcss.config.cjs`.
