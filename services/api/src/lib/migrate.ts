import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPool } from "./pg";

function migrationsDir() {
  // dist/lib -> ../../migrations
  return resolve(__dirname, "../../migrations");
}

export async function migrate() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = await pool.query("SELECT id FROM schema_migrations ORDER BY id");
  const appliedIds = new Set<string>(applied.rows.map((r) => String(r.id)));

  const dir = migrationsDir();
  const files = readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const id = file.replace(/\.sql$/i, "");
    if (appliedIds.has(id)) continue;

    const sql = readFileSync(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

