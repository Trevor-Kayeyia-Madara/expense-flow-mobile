import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/users", async (req) => {
    const { tenantId, role } = await requireAuth(app, req);
    if (role !== "admin") throw new Error("Not allowed");

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, email, role, created_at as "createdAt"
       FROM users
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [tenantId]
    );
    return { items: result.rows };
  });

  app.post("/users", async (req) => {
    const { tenantId, role } = await requireAuth(app, req);
    if (role !== "admin") throw new Error("Not allowed");

    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(["sales", "director", "finance", "admin"])
      })
      .parse(req.body);

    const pool = getPool();
    const id = randomUUID();
    const hash = await bcrypt.hash(body.password, 10);
    const now = new Date();

    await pool.query(
      "INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, tenantId, body.email.toLowerCase(), hash, body.role, now]
    );

    return { id };
  });

  app.post("/smtp/test", async (req) => {
    const { role } = await requireAuth(app, req);
    if (role !== "admin") throw new Error("Not allowed");

    const body = z.object({ to: z.string().email() }).parse(req.body);
    const { sendMail } = await import("../lib/mailer");
    const result = await sendMail({
      to: body.to,
      subject: "ExpenseFlow email test",
      text: "Email sending is configured and working."
    });
    return { ok: true, ...result };
  });

  // Alias endpoint name (same behavior).
  app.post("/mail/test", async (req) => {
    const { role } = await requireAuth(app, req);
    if (role !== "admin") throw new Error("Not allowed");

    const body = z.object({ to: z.string().email() }).parse(req.body);
    const { sendMail } = await import("../lib/mailer");
    const result = await sendMail({
      to: body.to,
      subject: "ExpenseFlow email test",
      text: "Email sending is configured and working."
    });
    return { ok: true, ...result };
  });
};
