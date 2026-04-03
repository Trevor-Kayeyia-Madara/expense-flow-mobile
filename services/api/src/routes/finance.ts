import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";
import { writeAuditLog } from "../lib/audit";
import { createNotification } from "../lib/notifications";

const statusSchema = z.enum(["approved", "verified", "posted"]);

export const financeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/expenses", async (req) => {
    const { companyId, role } = await requireAuth(app, req);
    if (role !== "finance" && role !== "super_admin") throw new Error("Not allowed");

    const query = z.object({ status: statusSchema.optional().default("approved") }).parse(req.query);
    const pool = getPool();

    const result = await pool.query(
      `SELECT
         e.id,
         e.amount_cents as "amountCents",
         e.currency,
         e.category,
         e.description,
         e.status,
         u.email as "submittedBy",
         e.created_at as "createdAt",
         e.submitted_at as "submittedAt",
         e.decided_at as "decidedAt",
         e.verified_at as "verifiedAt",
         e.posted_at as "postedAt"
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       WHERE e.company_id = $1 AND e.status = $2
       ORDER BY e.created_at DESC
       LIMIT 500`,
      [companyId, query.status]
    );

    return { items: result.rows };
  });

  app.get("/expenses.csv", async (req, reply) => {
    const { companyId, role } = await requireAuth(app, req);
    if (role !== "finance" && role !== "super_admin") throw new Error("Not allowed");

    const query = z.object({ status: statusSchema.optional().default("approved") }).parse(req.query);
    const pool = getPool();
    const rows = await pool.query(
      `SELECT
         e.id,
         u.email as submitted_by,
         e.amount_cents,
         e.currency,
         e.category,
         e.description,
         e.status,
         e.created_at,
         e.submitted_at,
         e.decided_at,
         e.verified_at,
         e.posted_at
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       WHERE e.company_id = $1 AND e.status = $2
       ORDER BY e.created_at DESC`,
      [companyId, query.status]
    );

    const header =
      "id,submitted_by,amount_cents,currency,category,description,status,created_at,submitted_at,decided_at,verified_at,posted_at\n";
    const lines = (rows.rows as any[]).map((r) =>
      [
        r.id,
        r.submitted_by,
        r.amount_cents,
        r.currency,
        r.category ?? "",
        (r.description ?? "").replaceAll('"', '""'),
        r.status,
        r.created_at?.toISOString?.() ?? r.created_at,
        r.submitted_at?.toISOString?.() ?? r.submitted_at ?? "",
        r.decided_at?.toISOString?.() ?? r.decided_at ?? "",
        r.verified_at?.toISOString?.() ?? r.verified_at ?? "",
        r.posted_at?.toISOString?.() ?? r.posted_at ?? ""
      ]
        .map((v) => `"${String(v ?? "")}"`)
        .join(",")
    );

    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="expenses-${query.status}.csv"`);
    return reply.send(header + lines.join("\n"));
  });

  app.post("/expenses/:id/verify", async (req) => {
    const { companyId, role, userId } = await requireAuth(app, req);
    if (role !== "finance" && role !== "super_admin") throw new Error("Not allowed");
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const before = await pool.query(
      `SELECT id, user_id as "userId", amount_cents as "amountCents", currency, status
       FROM expenses
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
      [params.id, companyId]
    );
    if (!before.rowCount) throw new Error("Expense not found");
    const exp = before.rows[0] as any;
    if (exp.status !== "approved") throw new Error("Only approved expenses can be verified");

    const now = new Date();
    await pool.query(`UPDATE expenses SET status='verified', verified_at=$1, updated_at=$1 WHERE id=$2 AND company_id=$3`, [
      now,
      params.id,
      companyId
    ]);

    await writeAuditLog({
      companyId,
      entityType: "expense",
      entityId: params.id,
      action: "expense.verified",
      performedBy: userId,
      beforeState: exp,
      afterState: { ...exp, status: "verified", verifiedAt: now },
      createdAt: now
    });

    await createNotification({
      companyId,
      userId: exp.userId,
      title: "Expense verified",
      message: `Finance verified your expense (${exp.currency} ${(exp.amountCents / 100).toFixed(2)}).`,
      createdAt: now
    });

    return { ok: true };
  });

  app.post("/expenses/:id/post", async (req) => {
    const { companyId, role, userId } = await requireAuth(app, req);
    if (role !== "finance" && role !== "super_admin") throw new Error("Not allowed");
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const before = await pool.query(
      `SELECT id, user_id as "userId", amount_cents as "amountCents", currency, status
       FROM expenses
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
      [params.id, companyId]
    );
    if (!before.rowCount) throw new Error("Expense not found");
    const exp = before.rows[0] as any;
    if (exp.status !== "verified") throw new Error("Only verified expenses can be posted");

    const now = new Date();
    await pool.query(`UPDATE expenses SET status='posted', posted_at=$1, updated_at=$1 WHERE id=$2 AND company_id=$3`, [
      now,
      params.id,
      companyId
    ]);

    await writeAuditLog({
      companyId,
      entityType: "expense",
      entityId: params.id,
      action: "expense.posted",
      performedBy: userId,
      beforeState: exp,
      afterState: { ...exp, status: "posted", postedAt: now },
      createdAt: now
    });

    await createNotification({
      companyId,
      userId: exp.userId,
      title: "Expense posted",
      message: `Finance posted your expense (${exp.currency} ${(exp.amountCents / 100).toFixed(2)}).`,
      createdAt: now
    });

    return { ok: true };
  });
};

