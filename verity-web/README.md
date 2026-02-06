# Verity Web

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
- `VITE_API_URL`
- `VITE_WS_URL`
- `VITE_AGORA_APP_ID`
- `VITE_WEB_VITALS_ENDPOINT` (optional)
- `VITE_FRONTEND_ERROR_ENDPOINT` (optional)
