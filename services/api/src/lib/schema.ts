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
  const now = new Date();
  const tenantRow = await pool.query("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1");
  let tenantId: string;

  if ((tenantRow.rowCount ?? 0) === 0) {
    tenantId = randomUUID();
    await pool.query("INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)", [
      tenantId,
      env.SEED_TENANT_NAME,
      now
    ]);
  } else {
    tenantId = tenantRow.rows[0].id as string;
  }

  // Admin (idempotent)
  {
    const userId = randomUUID();
    const hash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [userId, tenantId, env.SEED_ADMIN_EMAIL.toLowerCase(), hash, "admin", now]
    );
  }

  // Optional: director seed (idempotent)
  if (env.SEED_DIRECTOR_EMAIL && env.SEED_DIRECTOR_PASSWORD) {
    const directorId = randomUUID();
    const directorHash = await bcrypt.hash(env.SEED_DIRECTOR_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [
        directorId,
        tenantId,
        env.SEED_DIRECTOR_EMAIL.toLowerCase(),
        directorHash,
        "director",
        now
      ]
    );
  }

  // Optional: salesperson seed (idempotent)
  if (env.SEED_SALES_EMAIL && env.SEED_SALES_PASSWORD) {
    const salesId = randomUUID();
    const salesHash = await bcrypt.hash(env.SEED_SALES_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [salesId, tenantId, env.SEED_SALES_EMAIL.toLowerCase(), salesHash, "sales", now]
    );
  }
}
