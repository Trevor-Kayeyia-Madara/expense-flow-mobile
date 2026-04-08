import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const { companyId, userId } = await requireAuth(app, req);
    const q = z
      .object({
        unread: z.union([z.literal("true"), z.literal("false")]).optional()
      })
      .parse(req.query);

    const pool = getPool();
    const unreadOnly = q.unread === "true";
    const rows = await pool.query(
      `SELECT id,
              title,
              message,
              read_at as "readAt",
              created_at as "createdAt"
       FROM notifications
       WHERE company_id = $1
         AND user_id = $2
         AND ($3::boolean = false OR read_at IS NULL)
       ORDER BY created_at DESC
       LIMIT 200`,
      [companyId, userId, unreadOnly]
    );
    return { items: rows.rows };
  });

  app.get("/unread-count", async (req) => {
    const { companyId, userId } = await requireAuth(app, req);
    const pool = getPool();
    const r = await pool.query(
      `SELECT count(*)::int as "count"
       FROM notifications
       WHERE company_id = $1 AND user_id = $2 AND read_at IS NULL`,
      [companyId, userId]
    );
    return { count: Number(r.rows?.[0]?.count ?? 0) };
  });

  app.patch("/:id/read", async (req) => {
    const { companyId, userId } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const now = new Date();
    const res = await pool.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, $1)
       WHERE id = $2 AND company_id = $3 AND user_id = $4
       RETURNING id`,
      [now, params.id, companyId, userId]
    );
    if (!res.rowCount) throw new Error("Notification not found");
    return { ok: true };
  });
};

