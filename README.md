# ExpenseFlow (Mobile‑First, Multi‑Tenant Expense Approvals)

## Problem

Field teams submit expenses with paper receipts, approvals happen late (or not at all), and finance spends time chasing people instead of closing books. There’s no clean audit trail and visibility is poor.

## Solution

ExpenseFlow is a cloud-based, multi-tenant expense management system that supports fast expense submission (receipt + details), email-driven director approvals (no login needed), and a finance-ready queue with export.

## Features

- Auth (JWT + refresh tokens)
- Role-based access (Super Admin, Company Admin, Sales, Director, Finance)
- Multi-tenant company isolation (company/domain-based)
- Expense submission (draft → submitted) + receipt upload
- Email-driven approvals (Approve/Reject/Open details via PWA, token-based)
- Finance queue (approved → verified → posted) + CSV export
- Audit logs + in-app notifications

## Tech Stack

- React (PWA)
- Tailwind CSS
- Vite
- Node.js (Fastify)
- PostgreSQL
- Email: Mailtrap / SMTP / SendGrid (provider-switchable)

## Architecture

Flow:

PWA → API → PostgreSQL (+ receipt storage + email provider)

```mermaid
flowchart LR
  PWA[PWA (React + Tailwind + Vite)] -->|HTTPS JSON + multipart| API[API (Node.js + Fastify)]
  API --> DB[(PostgreSQL)]
  API --> Storage[(Receipt files: local uploads / S3 later)]
  API --> Mail[Email provider (Mailtrap / SMTP / SendGrid)]
```

## Screenshots

Add 3–5 images here (place in `docs/screenshots/`):

- `docs/screenshots/login.png`
- `docs/screenshots/sales-new-expense.png`
- `docs/screenshots/sales-expenses.png`
- `docs/screenshots/director-approval.png`
- `docs/screenshots/finance-queue.png`

How to add screenshots:

1) Create the folder: `docs/screenshots/`
2) Take screenshots (desktop browser or phone)
3) Save them with the filenames above
4) Commit and push

## API Example

Create an expense (multipart with receipt):

```http
POST /expenses
Authorization: Bearer <token>
Content-Type: multipart/form-data

amount=4500
currency=KES
category=Meals
description=lunch at kempinski
receipt=<file>
```

Submit for approval (triggers director email):

```http
POST /expenses/:id/submit
Authorization: Bearer <token>
```

## Setup

Prereqs:

- Node.js 20+ recommended
- Docker (optional, for local Postgres)

1) Start PostgreSQL (Docker)

```powershell
cd expenseflow-mobile-first
docker compose up -d db
```

1) Install deps (repo root)

```powershell
cd expenseflow-mobile-first
npm install
```

1) Run API

```powershell
npm -w services/api run dev
```

1) Run Mobile PWA

```powershell
npm -w apps/mobile run dev
```

Configure environment variables (do not commit `.env` files):

- `services/api/.env`: DB connection, `PUBLIC_BASE_URL`, `APP_BASE_URL`, `ORIGIN`, mail provider settings
- `apps/mobile/.env`: `VITE_API_BASE_URL`

Managed Postgres often requires SSL/TLS:

- Set `DB_SSL=true`
- If your provider uses a non-standard chain, set `DB_SSL_REJECT_UNAUTHORIZED=false`

## Live Demo

- (Add link here)

## Demo Flow (2–3 minutes)

1) **Login as Sales** → create an expense (attach receipt photo)
2) Tap **Submit** → expense becomes `submitted`
3) **Director receives email** → taps **Open details** (PWA opens, no login) → taps **Approve**
4) Expense becomes `approved` and **Finance receives an email**
5) **Login as Finance** → open Finance queue → **Verify** then **Post**
