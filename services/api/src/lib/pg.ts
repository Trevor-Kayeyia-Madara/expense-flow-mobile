import pg from "pg";
import { env } from "./env";

export type PgPool = pg.Pool;

let pool: PgPool | null = null;

export function getPool(): PgPool {
  if (!pool) throw new Error("DB not initialized");
  return pool;
}

export async function initPostgres() {
  if (pool) return pool;

  const shouldUseSsl = (() => {
    if (env.DB_SSL) return true;
    if (!env.DATABASE_URL) return false;

    // If sslmode is present in DATABASE_URL, honor it.
    try {
      const u = new URL(env.DATABASE_URL);
      const mode = (u.searchParams.get("sslmode") ?? "").toLowerCase();
      if (mode === "disable") return false;
      if (mode === "require" || mode === "verify-ca" || mode === "verify-full") return true;
    } catch {
      // ignore
    }

    // Managed DBs often require TLS; default to SSL when DATABASE_URL is provided unless explicitly disabled.
    return process.env.DB_SSL === undefined;
  })();

  const ssl = shouldUseSsl ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED } : undefined;

  pool = new pg.Pool(
    env.DATABASE_URL
      ? { connectionString: env.DATABASE_URL, ssl }
      : {
          host: env.DB_HOST,
          port: env.DB_PORT,
          user: env.DB_USER,
          password: env.DB_PASSWORD,
          database: env.DB_NAME,
          ssl,
          max: 10
        }
  );

  await pool.query("SELECT 1");
  return pool;
}
