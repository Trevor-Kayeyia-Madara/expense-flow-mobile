# ExpenseFlow (V1 MVP)

Multi-tenant, domain-based expense management system with email-driven director approvals and finance-ready exports.

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
npm install
npm run dev
```

2) Mobile PWA (optional)
```powershell
cd apps/mobile
npm install
npm run dev
```

Then open the Vite URL on your phone (same Wi-Fi) or use device emulation in your browser.

## V1 MVP scope (baseline)

- Multi-tenant companies (domain-based isolation)
- Auth (JWT + refresh tokens) + RBAC (Super Admin / Company Admin / Sales / Director / Finance)
- Expense submission + receipt upload
- Director approvals via email links (`/approval/approve|reject?token=...`)
- Finance queue + CSV export

## Next build steps

- OCR (V2)
- Better notifications (email + delivery events)
- Advanced reporting

## Email (optional)

The API sends the director an email when a sales user submits an expense (Approve/Reject links inside).

Mailtrap (Email Sending API) envs in `services/api/.env`:

- `MAIL_PROVIDER=mailtrap`
- `MAILTRAP_TOKEN=...`
- `MAILTRAP_FROM_EMAIL=...`
- `MAILTRAP_FROM_NAME=ExpenseFlow`
