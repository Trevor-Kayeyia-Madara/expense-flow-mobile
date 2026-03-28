import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { getPool } from "./pg";

export async function initSchemaAndSeed() {
  const pool = getPool();

  // Basic SaaS schema (multi-tenant).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      created_at timestamptz NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role text NOT NULL,
      created_at timestamptz NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount_cents integer NOT NULL,
      currency char(3) NOT NULL DEFAULT 'KES',
      description text NOT NULL,
      receipt_key text NOT NULL,
      receipt_mime text NOT NULL,
      receipt_size integer NOT NULL,
      status text NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS ix_expenses_tenant_created ON expenses(tenant_id, created_at DESC)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS ix_expenses_user_created ON expenses(user_id, created_at DESC)"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_tokens (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      token char(64) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz NULL,
      decided_at timestamptz NULL,
      decision text NULL
    );
  `);

  // Seed a first tenant + admin if none exist.
  const tenantRows = await pool.query("SELECT id FROM tenants LIMIT 1");
  const hasTenant = (tenantRows.rowCount ?? 0) > 0;
  if (hasTenant) return;

  const tenantId = randomUUID();
  const userId = randomUUID();
  const now = new Date();
  const hash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 10);

  await pool.query("INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)", [
    tenantId,
    env.SEED_TENANT_NAME,
    now
  ]);
  await pool.query(
    "INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [userId, tenantId, env.SEED_ADMIN_EMAIL.toLowerCase(), hash, "admin", now]
  );
}
