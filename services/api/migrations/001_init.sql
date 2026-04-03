-- ExpenseFlow V1 (multi-tenant + email-driven approvals)
-- NOTE: This is intended for Postgres.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_companies_domain ON companies (lower(domain));

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email));
CREATE INDEX IF NOT EXISTS ix_users_company_role ON users (company_id, role);

-- Roles: super_admin | company_admin | sales | director | finance
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin','company_admin','sales','director','finance'));

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_created ON refresh_tokens (user_id, created_at DESC);

-- Expenses: state machine
-- draft -> submitted -> approved/rejected -> verified -> posted
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL,
  currency char(3) NOT NULL DEFAULT 'KES',
  category text NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  current_approver_id uuid NULL REFERENCES users(id),
  submitted_at timestamptz NULL,
  decided_at timestamptz NULL,
  verified_at timestamptz NULL,
  posted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('draft','submitted','approved','rejected','verified','posted'));

CREATE INDEX IF NOT EXISTS ix_expenses_company_created ON expenses (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_expenses_user_created ON expenses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_expenses_company_status_created ON expenses (company_id, status, created_at DESC);

-- Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  file_key text NOT NULL,
  file_name text NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_receipts_expense_created ON receipts (expense_id, created_at DESC);

-- Approval decisions (audit-friendly)
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision text NOT NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE approvals
  ADD CONSTRAINT approvals_decision_check
  CHECK (decision IN ('approved','rejected'));

CREATE INDEX IF NOT EXISTS ix_approvals_expense_created ON approvals (expense_id, created_at DESC);

-- Email-driven approval tokens (single-use, expiring)
CREATE TABLE IF NOT EXISTS email_tokens (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  decided_at timestamptz NULL,
  decision text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_email_tokens_token ON email_tokens (token);
CREATE INDEX IF NOT EXISTS ix_email_tokens_expense_created ON email_tokens (expense_id, created_at DESC);

-- Notifications (in-app, optional for V1)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_notifications_user_created ON notifications (user_id, created_at DESC);

-- Audit logs (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  before_state jsonb NULL,
  after_state jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_company_created ON audit_logs (company_id, created_at DESC);

