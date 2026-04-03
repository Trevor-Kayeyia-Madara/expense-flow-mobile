import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";
import { writeAuditLog } from "../lib/audit";

export const companiesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const { role } = await requireAuth(app, req);
    if (role !== "super_admin") throw new Error("Not allowed");

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, domain, created_at as "createdAt"
       FROM companies
       ORDER BY created_at DESC
       LIMIT 500`
    );
    return { items: result.rows };
  });

  app.post("/", async (req) => {
    const { role, userId } = await requireAuth(app, req);
    if (role !== "super_admin") throw new Error("Not allowed");

    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        domain: z.string().trim().min(3).max(120)
      })
      .parse(req.body);

    const pool = getPool();
    const id = randomUUID();
    const domain = body.domain.toLowerCase().replace(/^@/, "");

    await pool.query("INSERT INTO companies (id, name, domain) VALUES ($1,$2,$3)", [id, body.name, domain]);

    await writeAuditLog({
      companyId: id,
      entityType: "company",
      entityId: id,
      action: "company.created",
      performedBy: userId,
      beforeState: null,
      afterState: { name: body.name, domain }
    });

    return { id };
  });

  app.patch("/:id", async (req) => {
    const { role, userId } = await requireAuth(app, req);
    if (role !== "super_admin") throw new Error("Not allowed");

    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        domain: z.string().trim().min(3).max(120).optional()
      })
      .parse(req.body);

    const pool = getPool();
    const before = await pool.query("SELECT id, name, domain FROM companies WHERE id = $1 LIMIT 1", [params.id]);
    if (!before.rowCount) throw new Error("Company not found");

    const domain = body.domain ? body.domain.toLowerCase().replace(/^@/, "") : undefined;
    await pool.query(
      `UPDATE companies
       SET name = COALESCE($1, name),
           domain = COALESCE($2, domain)
       WHERE id = $3`,
      [body.name ?? null, domain ?? null, params.id]
    );

    const after = await pool.query("SELECT id, name, domain FROM companies WHERE id = $1 LIMIT 1", [params.id]);

    await writeAuditLog({
      companyId: params.id,
      entityType: "company",
      entityId: params.id,
      action: "company.updated",
      performedBy: userId,
      beforeState: before.rows[0],
      afterState: after.rows[0]
    });

    return { ok: true };
  });
};

