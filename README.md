# ExpenseFlow (Mobile-First MVP)

Mobile-first PWA + backend API designed for fast field submissions (receipt + amount + description).

## Repo layout

- `apps/mobile` - Mobile-first PWA (React + Vite)
- `services/api` - Backend API (Fastify + PostgreSQL + local uploads)
- `packages/shared` - Shared types/schemas (placeholder)

## Prereqs

- Node.js 20+ recommended
- Postgres (local via Docker or managed in cloud)

## Quick start (dev)

In two terminals:

Optional: start Postgres locally (Docker)
```powershell
cd expenseflow-mobile-first
docker compose up -d db
```

1) API
```powershell
cd services/api
copy .env.example .env
npm install
npm run dev
```

2) Mobile PWA
```powershell
cd apps/mobile
copy .env.example .env
npm install
npm run dev
```

Then open the Vite URL on your phone (same Wi-Fi) or use device emulation in your browser.

## What's included (MVP baseline)

- Login that stores a token (session remembered)
- Create expense in ~15-30 seconds:
  - "New Expense"
  - Camera/gallery receipt
  - Amount + description
  - Submit
- Image compression on-device (to reduce data usage)
- `POST /expenses` multipart upload + Postgres persistence + local file storage

## Next build steps

- Approval flow (tokenized email links)
- Status tracking + director view
- Better offline drafts (service worker + IndexedDB)

## SMTP (Gmail test)

For Gmail, use an **App Password** (not your normal password).

Set these in `services/api/.env`:

- `PUBLIC_BASE_URL` - base URL used in the emailed approval link (use your LAN IP for phone testing)
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=yourgmail@gmail.com`
- `SMTP_PASS=your_app_password`
- `SMTP_FROM="ExpenseFlow <yourgmail@gmail.com>"`
