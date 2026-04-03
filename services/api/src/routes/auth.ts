import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getPool } from "../lib/pg";
import { requireAuth } from "../lib/auth";
import { hashToken, newRefreshToken } from "../lib/security";
import { writeAuditLog } from "../lib/audit";

function emailDomain(email: string) {
  return (email.toLowerCase().split("@")[1] ?? "").trim();
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });

  const registerSchema = z.object({
    companyName: z.string().trim().min(2).max(80),
    // Optional, but if provided it must match the admin's email domain.
    companyDomain: z.string().trim().min(3).max(120).optional(),
    name: z.string().trim().min(2).max(80).optional(),
    email: z.string().email(),
    password: z.string().min(8).max(100)
  });

  app.post("/login", async (req) => {
    const { email, password } = loginSchema.parse(req.body);
    const pool = getPool();

    const result = await pool.query(
      `SELECT id,
              company_id as "companyId",
              email,
              password_hash as "passwordHash",
              role,
              is_active as "isActive"
       FROM users
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0] as
      | { id: string; companyId: string; email: string; passwordHash: string; role: string; isActive: boolean }
      | undefined;
    if (!user) throw new Error("Invalid credentials");
    if (!user.isActive) throw new Error("User is disabled");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new Error("Invalid credentials");

    const accessToken = app.jwt.sign(
      { sub: user.id, cid: user.companyId, role: user.role, email: user.email },
      { expiresIn: "15m" }
    );

    const refreshToken = newRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (id, company_id, user_id, token_hash, expires_at, revoked_at)
       VALUES ($1,$2,$3,$4,$5,NULL)`,
      [randomUUID(), user.companyId, user.id, refreshHash, expiresAt]
    );

    return {
      token: accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, companyId: user.companyId, role: user.role }
    };
  });

  // Creates a new company + first Company Admin.
  app.post("/register", async (req) => {
    const body = registerSchema.parse(req.body);
    const pool = getPool();

    const adminEmail = body.email.toLowerCase();
    const domainFromEmail = emailDomain(adminEmail);
    const domain = (body.companyDomain ?? domainFromEmail).toLowerCase().replace(/^@/, "");
    if (!domainFromEmail || domainFromEmail !== domain) {
      throw new Error(`companyDomain must match admin email domain (${domainFromEmail || "unknown"})`);
    }

    const existing = await pool.query("SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1", [adminEmail]);
    if (existing.rowCount) throw new Error("Email already registered");

    const existingCompany = await pool.query("SELECT 1 FROM companies WHERE lower(domain) = lower($1) LIMIT 1", [
      domain
    ]);
    if (existingCompany.rowCount) throw new Error("Company domain already exists");

    const companyId = randomUUID();
    const userId = randomUUID();
    const now = new Date();
    const hash = await bcrypt.hash(body.password, 10);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO companies (id, name, domain) VALUES ($1,$2,$3)", [
        companyId,
        body.companyName,
        domain
      ]);
      await client.query(
        `INSERT INTO users (id, company_id, name, email, password_hash, role, is_active)
         VALUES ($1,$2,$3,$4,$5,'company_admin',true)`,
        [userId, companyId, body.name ?? null, adminEmail, hash]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLog({
      companyId,
      entityType: "company",
      entityId: companyId,
      action: "company.registered",
      performedBy: userId,
      beforeState: null,
      afterState: { companyName: body.companyName, domain, adminEmail },
      createdAt: now
    });

    const accessToken = app.jwt.sign(
      { sub: userId, cid: companyId, role: "company_admin", email: adminEmail },
      { expiresIn: "15m" }
    );
    const refreshToken = newRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (id, company_id, user_id, token_hash, expires_at, revoked_at)
       VALUES ($1,$2,$3,$4,$5,NULL)`,
      [randomUUID(), companyId, userId, refreshHash, expiresAt]
    );

    return {
      token: accessToken,
      refreshToken,
      user: { id: userId, email: adminEmail, companyId, role: "company_admin" }
    };
  });

  app.post("/refresh", async (req) => {
    const body = z.object({ refreshToken: z.string().min(32) }).parse(req.body);
    const pool = getPool();
    const now = new Date();
    const tokenHash = hashToken(body.refreshToken);

    const rt = await pool.query(
      `SELECT id, company_id as "companyId", user_id as "userId", expires_at as "expiresAt", revoked_at as "revokedAt"
       FROM refresh_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );
    const row = rt.rows[0] as
      | { id: string; companyId: string; userId: string; expiresAt: Date; revokedAt: Date | null }
      | undefined;
    if (!row) throw new Error("Invalid refresh token");
    if (row.revokedAt) throw new Error("Refresh token revoked");
    if (new Date(row.expiresAt).getTime() < now.getTime()) throw new Error("Refresh token expired");

    await pool.query("UPDATE refresh_tokens SET revoked_at = $1 WHERE id = $2", [now, row.id]);

    const userRow = await pool.query(
      `SELECT email, role, is_active as "isActive"
       FROM users
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
      [row.userId, row.companyId]
    );
    if (!userRow.rowCount) throw new Error("User not found");
    const u = userRow.rows[0] as { email: string; role: string; isActive: boolean };
    if (!u.isActive) throw new Error("User is disabled");

    const accessToken = app.jwt.sign(
      { sub: row.userId, cid: row.companyId, role: u.role, email: u.email },
      { expiresIn: "15m" }
    );
    const refreshToken = newRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (id, company_id, user_id, token_hash, expires_at, revoked_at)
       VALUES ($1,$2,$3,$4,$5,NULL)`,
      [randomUUID(), row.companyId, row.userId, refreshHash, expiresAt]
    );

    return { token: accessToken, refreshToken };
  });

  app.post("/logout", async (req) => {
    const body = z.object({ refreshToken: z.string().min(32) }).parse(req.body);
    const pool = getPool();
    const now = new Date();
    const tokenHash = hashToken(body.refreshToken);
    await pool.query("UPDATE refresh_tokens SET revoked_at = $1 WHERE token_hash = $2", [now, tokenHash]);
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const { userId, companyId, role, email } = await requireAuth(app, req);
    return { userId, companyId, role, email };
  });
};

