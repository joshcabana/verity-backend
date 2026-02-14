# Verity Web

Production-style Vite + React + TypeScript frontend for Verity’s no-swipe, video-first dating experience.

## Setup

```bash
npm install
npm run dev
```

## Test

```bash
npm test
npm run test:smoke
```

## Build + Budget Check

```bash
npm run build
npm run check:budgets
```

## Environment

Copy `.env.example` to `.env` and set:

- `VITE_API_URL` (REST API base)
- `VITE_WS_URL` (Socket.IO/WS base)
- `VITE_AGORA_APP_ID` (Agora App ID)
- `VITE_STRIPE_PUBLISHABLE_KEY` (optional, reserved for embedded checkout)
- `VITE_WEB_VITALS_ENDPOINT` (optional)
- `VITE_FRONTEND_ERROR_ENDPOINT` (optional)

### Example

```bash
cp .env.example .env
# then edit values
```

The web client uses backend-driven flows for auth, queue, sessions, matches, moderation, and Stripe checkout URL redirects.
