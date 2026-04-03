import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { getPool } from "./pg";

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^@/, "");
}

async function upsertCompany(name: string, domain: string) {
  const pool = getPool();
  const d = normalizeDomain(domain);
  const existing = await pool.query("SELECT id FROM companies WHERE lower(domain) = lower($1) LIMIT 1", [d]);
  if ((existing.rowCount ?? 0) > 0) return String(existing.rows[0].id);

  const id = randomUUID();
  await pool.query("INSERT INTO companies (id, name, domain) VALUES ($1, $2, $3)", [id, name, d]);
  return id;
}

async function upsertUser(input: { companyId: string; email: string; password: string; role: string; name?: string }) {
  const pool = getPool();
  const email = input.email.trim().toLowerCase();
  const existing = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [email]);
  if ((existing.rowCount ?? 0) > 0) return String(existing.rows[0].id);

  const id = randomUUID();
  const hash = await bcrypt.hash(input.password, 10);
  await pool.query(
    `INSERT INTO users (id, company_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.companyId, input.name ?? null, email, hash, input.role]
  );
  return id;
}

export async function seed() {
  const companyId = await upsertCompany(env.SEED_COMPANY_NAME, env.SEED_COMPANY_DOMAIN);

  if (env.SEED_SUPER_ADMIN_EMAIL && env.SEED_SUPER_ADMIN_PASSWORD) {
    await upsertUser({
      companyId,
      email: env.SEED_SUPER_ADMIN_EMAIL,
      password: env.SEED_SUPER_ADMIN_PASSWORD,
      role: "super_admin",
      name: "Super Admin"
    });
  }

  if (env.SEED_COMPANY_ADMIN_EMAIL && env.SEED_COMPANY_ADMIN_PASSWORD) {
    await upsertUser({
      companyId,
      email: env.SEED_COMPANY_ADMIN_EMAIL,
      password: env.SEED_COMPANY_ADMIN_PASSWORD,
      role: "company_admin",
      name: "Company Admin"
    });
  }

  if (env.SEED_DIRECTOR_EMAIL && env.SEED_DIRECTOR_PASSWORD) {
    await upsertUser({
      companyId,
      email: env.SEED_DIRECTOR_EMAIL,
      password: env.SEED_DIRECTOR_PASSWORD,
      role: "director",
      name: "Director"
    });
  }

  if (env.SEED_SALES_EMAIL && env.SEED_SALES_PASSWORD) {
    await upsertUser({
      companyId,
      email: env.SEED_SALES_EMAIL,
      password: env.SEED_SALES_PASSWORD,
      role: "sales",
      name: "Sales"
    });
  }

  if (env.SEED_FINANCE_EMAIL && env.SEED_FINANCE_PASSWORD) {
    await upsertUser({
      companyId,
      email: env.SEED_FINANCE_EMAIL,
      password: env.SEED_FINANCE_PASSWORD,
      role: "finance",
      name: "Finance"
    });
  }
}

