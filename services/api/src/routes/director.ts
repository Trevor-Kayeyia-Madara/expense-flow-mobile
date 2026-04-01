import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";

export const directorRoutes: FastifyPluginAsync = async (app) => {
  app.get("/queue", async (req) => {
    const { tenantId, role } = await requireAuth(app, req);
    if (role !== "director" && role !== "admin") throw new Error("Not allowed");

    const pool = getPool();
    const result = await pool.query(
      `SELECT
        e.id,
        e.amount_cents as "amountCents",
        e.currency,
        e.description,
        e.status,
        e.created_at as "createdAt",
        u.email as "submittedBy"
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       WHERE e.tenant_id = $1 AND e.status IN ('pending_approval','submitted')
       ORDER BY e.created_at DESC
       LIMIT 200`,
      [tenantId]
    );
    return { items: result.rows };
  });

  app.post("/expenses/:id/decision", async (req) => {
    const { tenantId, role } = await requireAuth(app, req);
    if (role !== "director" && role !== "admin") throw new Error("Not allowed");

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ decision: z.enum(["approved", "rejected"]) }).parse(req.body);

    const pool = getPool();
    const now = new Date();
    const result = await pool.query(
      `UPDATE expenses
       SET status = $1, updated_at = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING id`,
      [body.decision, now, params.id, tenantId]
    );
    if (result.rowCount === 0) throw new Error("Expense not found");
    return { ok: true, decision: body.decision };
  });
};

