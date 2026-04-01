import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getPool } from "../lib/pg";
import { requireAuth } from "../lib/auth";

export const authRoutes: FastifyPluginAsync = async (app) => {
  const bodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });

  app.post("/login", async (req) => {
    const { email, password } = bodySchema.parse(req.body);
    const pool = getPool();
    const result = await pool.query(
      "SELECT id, email, tenant_id as \"tenantId\", password_hash as \"passwordHash\", role FROM users WHERE email = $1 LIMIT 1",
      [email.toLowerCase()]
    );
    const user = result.rows[0] as
      | { id: string; email: string; tenantId: string; passwordHash: string; role: string }
      | undefined;
    if (!user) throw new Error("Invalid credentials");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new Error("Invalid credentials");

    const token = app.jwt.sign(
      { sub: user.id, tid: user.tenantId, role: user.role, email: user.email },
      { expiresIn: "30d" }
    );
    return { token, user: { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role } };
  });

  app.get("/me", async (req) => {
    const { userId, tenantId, role, email } = await requireAuth(app, req);
    return { userId, tenantId, role, email };
  });
};
