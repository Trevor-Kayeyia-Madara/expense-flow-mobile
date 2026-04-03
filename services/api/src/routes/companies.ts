import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";
import { writeAuditLog } from "../lib/audit";

export const companiesRoutes: FastifyPluginAsync = async (app) => {
  // Current company details (for Company Admin settings screen).
  app.get("/me", async (req) => {
    const { companyId, role } = await requireAuth(app, req);
    if (role !== "company_admin" && role !== "super_admin") throw new Error("Not allowed");

    const pool = getPool();
    const row = await pool.query(
      `SELECT id, name, domain, default_director_id as "defaultDirectorId", created_at as "createdAt"
       FROM companies
       WHERE id = $1
       LIMIT 1`,
      [companyId]
    );
    if (!row.rowCount) throw new Error("Company not found");
    return row.rows[0];
  });

  app.patch("/me", async (req) => {
    const { companyId, role, userId } = await requireAuth(app, req);
    if (role !== "company_admin" && role !== "super_admin") throw new Error("Not allowed");

    const body = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        domain: z.string().trim().min(3).max(120).optional(),
        defaultDirectorId: z.string().uuid().nullable().optional()
      })
      .parse(req.body);

    const pool = getPool();
    const before = await pool.query(
      `SELECT id, name, domain, default_director_id as "defaultDirectorId"
       FROM companies
       WHERE id = $1
       LIMIT 1`,
      [companyId]
    );
    if (!before.rowCount) throw new Error("Company not found");

    const normalizedDomain = body.domain ? body.domain.toLowerCase().replace(/^@/, "") : undefined;

    if (normalizedDomain) {
      const dupe = await pool.query(
        "SELECT 1 FROM companies WHERE lower(domain) = lower($1) AND id <> $2 LIMIT 1",
        [normalizedDomain, companyId]
      );
      if (dupe.rowCount) throw new Error("Domain already exists");

      const invalid = await pool.query(
        `SELECT 1
         FROM users
         WHERE company_id = $1 AND split_part(lower(email),'@',2) <> lower($2)
         LIMIT 1`,
        [companyId, normalizedDomain]
      );
      if (invalid.rowCount) {
        throw new Error("Cannot change domain: existing user emails do not match the new domain");
      }
    }

    if (body.defaultDirectorId !== undefined && body.defaultDirectorId !== null) {
      const d = await pool.query(
        `SELECT id FROM users
         WHERE id = $1 AND company_id = $2 AND role = 'director' AND is_active = true
         LIMIT 1`,
        [body.defaultDirectorId, companyId]
      );
      if (!d.rowCount) throw new Error("Director not found (must be an active director in this company)");
    }

    await pool.query(
      `UPDATE companies
       SET default_director_id = COALESCE($1, default_director_id),
           name = COALESCE($2, name),
           domain = COALESCE($3, domain)
       WHERE id = $4`,
      [
        body.defaultDirectorId === undefined ? null : body.defaultDirectorId,
        body.name ?? null,
        normalizedDomain ?? null,
        companyId
      ]
    );

    const after = await pool.query(
      `SELECT id, name, domain, default_director_id as "defaultDirectorId"
       FROM companies
       WHERE id = $1
       LIMIT 1`,
      [companyId]
    );

    await writeAuditLog({
      companyId,
      entityType: "company",
      entityId: companyId,
      action: "company.defaults.updated",
      performedBy: userId,
      beforeState: before.rows[0],
      afterState: after.rows[0]
    });

    return { ok: true };
  });

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
