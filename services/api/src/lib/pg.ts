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

  pool = new pg.Pool(
    env.DATABASE_URL
      ? { connectionString: env.DATABASE_URL }
      : {
          host: env.DB_HOST,
          port: env.DB_PORT,
          user: env.DB_USER,
          password: env.DB_PASSWORD,
          database: env.DB_NAME,
          ssl: env.DB_SSL ? { rejectUnauthorized: true } : undefined,
          max: 10
        }
  );

  await pool.query("SELECT 1");
  return pool;
}

