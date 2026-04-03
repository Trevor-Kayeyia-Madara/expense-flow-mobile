import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";
import { writeAuditLog } from "../lib/audit";

const roleSchema = z.enum(["super_admin", "company_admin", "sales", "director", "finance"]);

function emailDomain(email: string) {
  return (email.toLowerCase().split("@")[1] ?? "").trim();
}

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const { companyId, role } = await requireAuth(app, req);
    if (role !== "company_admin" && role !== "super_admin") throw new Error("Not allowed");

    const pool = getPool();
    const args: any[] = [];
    let where = "1=1";
    if (role !== "super_admin") {
      args.push(companyId);
      where = `company_id = $${args.length}`;
    }

    const rows = await pool.query(
      `SELECT id,
              company_id as "companyId",
              name,
              email,
              role,
              is_active as "isActive",
              created_at as "createdAt",
              updated_at as "updatedAt"
       FROM users
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT 500`,
      args
    );
    return { items: rows.rows };
  });

  app.get("/:id", async (req) => {
    const { companyId, role } = await requireAuth(app, req);
    if (role !== "company_admin" && role !== "super_admin") throw new Error("Not allowed");
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const pool = getPool();
    const row = await pool.query(
      `SELECT id,
              company_id as "companyId",
              name,
              email,
              role,
              is_active as "isActive",
              created_at as "createdAt",
              updated_at as "updatedAt"
       FROM users
       WHERE id = $1 AND ($2::uuid IS NULL OR company_id = $2)
       LIMIT 1`,
      [params.id, role === "super_admin" ? null : companyId]
    );
    if (!row.rowCount) throw new Error("User not found");
    return row.rows[0];
  });

  app.post("/", async (req) => {
    const { companyId, role, userId } = await requireAuth(app, req);
    if (role !== "company_admin" && role !== "super_admin") throw new Error("Not allowed");

    const body = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        email: z.string().email(),
        password: z.string().min(8).max(100),
        role: roleSchema,
        isActive: z.boolean().optional().default(true),
        companyId: z.string().uuid().optional()
      })
      .parse(req.body);

    const targetCompanyId = role === "super_admin" ? body.companyId ?? companyId : companyId;
    if (!targetCompanyId) throw new Error("companyId is required");

    const pool = getPool();
    const company = await pool.query("SELECT domain FROM companies WHERE id = $1 LIMIT 1", [targetCompanyId]);
    if (!company.rowCount) throw new Error("Company not found");
    const domain = String(company.rows[0]?.domain ?? "").toLowerCase();

    const userEmail = body.email.toLowerCase();
    const userDomain = emailDomain(userEmail);
    if (domain && userDomain !== domain) {
      throw new Error(`User email domain must match company domain (${domain})`);
    }

    const id = randomUUID();
    const now = new Date();
    const hash = await bcrypt.hash(body.password, 10);

    await pool.query(
      `INSERT INTO users (id, company_id, name, email, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [id, targetCompanyId, body.name ?? null, userEmail, hash, body.role, body.isActive, now]
    );

    await writeAuditLog({
      companyId: targetCompanyId,
      entityType: "user",
      entityId: id,
      action: "user.created",
      performedBy: userId,
      beforeState: null,
      afterState: { email: userEmail, role: body.role, isActive: body.isActive },
      createdAt: now
    });

    return { id };
  });

  app.patch("/:id", async (req) => {
    const { companyId, role, userId } = await requireAuth(app, req);
    if (role !== "company_admin" && role !== "super_admin") throw new Error("Not allowed");
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const body = z
      .object({
        name: z.string().trim().min(2).max(80).nullable().optional(),
        password: z.string().min(8).max(100).optional(),
        role: roleSchema.optional(),
        isActive: z.boolean().optional()
      })
      .parse(req.body);

    const pool = getPool();
    const before = await pool.query(
      `SELECT id, company_id as "companyId", name, email, role, is_active as "isActive"
       FROM users
       WHERE id = $1 AND ($2::uuid IS NULL OR company_id = $2)
       LIMIT 1`,
      [params.id, role === "super_admin" ? null : companyId]
    );
    if (!before.rowCount) throw new Error("User not found");
    const beforeUser = before.rows[0] as any;

    const now = new Date();
    let passwordHash: string | undefined;
    if (body.password) passwordHash = await bcrypt.hash(body.password, 10);

    await pool.query(
      `UPDATE users
       SET
         name = COALESCE($1, name),
         password_hash = COALESCE($2, password_hash),
         role = COALESCE($3, role),
         is_active = COALESCE($4, is_active),
         updated_at = $5
       WHERE id = $6`,
      [
        body.name === undefined ? null : body.name,
        passwordHash ?? null,
        body.role ?? null,
        body.isActive ?? null,
        now,
        params.id
      ]
    );

    const after = await pool.query(
      `SELECT id, company_id as "companyId", name, email, role, is_active as "isActive"
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [params.id]
    );

    await writeAuditLog({
      companyId: String(beforeUser.companyId),
      entityType: "user",
      entityId: params.id,
      action: "user.updated",
      performedBy: userId,
      beforeState: beforeUser,
      afterState: after.rows[0],
      createdAt: now
    });

    return { ok: true };
  });
};

