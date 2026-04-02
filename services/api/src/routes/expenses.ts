import type { FastifyPluginAsync } from "fastify";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { z } from "zod";
import { env } from "../lib/env";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";
import { createApprovalToken } from "../lib/approvalTokens";
import { isMailConfigured, sendMail } from "../lib/mailer";

export const expensesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const { userId, tenantId } = await requireAuth(app, req);
    const pool = getPool();
    const result = await pool.query(
      `SELECT
        id,
        amount_cents as "amountCents",
        currency,
        description,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM expenses
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [tenantId, userId]
    );
    return { items: result.rows };
  });

  app.get("/:id", async (req) => {
    const { tenantId } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();
    const result = await pool.query(
      `SELECT
        id,
        user_id as "userId",
        amount_cents as "amountCents",
        currency,
        description,
        receipt_key as "receiptKey",
        receipt_mime as "receiptMime",
        receipt_size as "receiptSize",
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM expenses
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [params.id, tenantId]
    );
    if (result.rowCount === 0) throw new Error("Expense not found");
    return result.rows[0];
  });

  app.get("/:id/receipt", async (req, reply) => {
    const { tenantId } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();
    const result = await pool.query(
      `SELECT receipt_key as "receiptKey", receipt_mime as "receiptMime"
       FROM expenses
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [params.id, tenantId]
    );
    if (result.rowCount === 0) throw new Error("Receipt not found");
    const row = result.rows[0] as { receiptKey: string; receiptMime: string };
    const full = resolve(env.UPLOAD_DIR, row.receiptKey);
    reply.header("content-type", row.receiptMime);
    return reply.send(createReadStream(full));
  });

  app.post("/", async (req) => {
    const { userId, tenantId } = await requireAuth(app, req);
    const pool = getPool();

    const parts = req.parts();
    let amount: number | null = null;
    let currency: string | undefined = undefined;
    let description: string | null = null;
    let receiptKey: string | null = null;
    let receiptMime: string | null = null;
    let receiptSize: number | null = null;

    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "amount") amount = Number(part.value);
        if (part.fieldname === "currency") currency = String(part.value);
        if (part.fieldname === "description") description = String(part.value);
      } else if (part.type === "file") {
        if (part.fieldname !== "receipt") continue;
        const ext = safeImageExt(part.mimetype);
        const id = randomUUID();
        const rel = `${tenantId}/${id}${ext}`;
        const full = resolve(env.UPLOAD_DIR, rel);
        await mkdir(dirname(full), { recursive: true });
        await pipeline(part.file, createWriteStream(full));
        const st = await stat(full);
        receiptKey = rel;
        receiptMime = part.mimetype;
        receiptSize = st.size;
      }
    }

    const parsed = z
      .object({
        amount: z.number().finite().positive(),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().default("KES"),
        description: z.string().trim().min(2).max(140),
        receiptKey: z.string().min(1),
        receiptMime: z.string().min(1),
        receiptSize: z.number().int().positive()
      })
      .parse({
        amount,
        currency: currency && currency.trim().length > 0 ? currency : undefined,
        description,
        receiptKey,
        receiptMime,
        receiptSize
      });

    const id = randomUUID();
    const now = new Date();
    const amountCents = Math.round(parsed.amount * 100);
    const status = "submitted";

    await pool.query(
      `INSERT INTO expenses
        (id, tenant_id, user_id, amount_cents, currency, description, receipt_key, receipt_mime, receipt_size, status, created_at, updated_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        tenantId,
        userId,
        amountCents,
        parsed.currency,
        parsed.description,
        parsed.receiptKey,
        parsed.receiptMime,
        parsed.receiptSize,
        status,
        now,
        now
      ]
    );

    return { id, status };
  });

  app.post("/:id/request-approval", async (req) => {
    const { userId, tenantId, role, email } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        directorEmail: z.string().email().optional(),
        expiresInHours: z.number().int().positive().max(720).optional()
      })
      .parse(req.body);

    const pool = getPool();
    const exp = await pool.query(
      `SELECT id, user_id as "userId", amount_cents as "amountCents", currency, description, status
       FROM expenses
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [params.id, tenantId]
    );
    if (exp.rowCount === 0) throw new Error("Expense not found");
    const expense = exp.rows[0] as {
      id: string;
      userId: string;
      amountCents: number;
      currency: string;
      description: string;
      status: string;
    };

    const canRequest =
      role === "admin" || role === "finance" || role === "director" || expense.userId === userId;
    if (!canRequest) throw new Error("Not allowed");

    // Move to a clear state before approval.
    if (expense.status === "submitted") {
      await pool.query("UPDATE expenses SET status = $1, updated_at = $2 WHERE id = $3", [
        "pending_approval",
        new Date(),
        expense.id
      ]);
    }

    const { token, expiresAt } = await createApprovalToken({
      tenantId,
      expenseId: expense.id,
      expiresInHours: body.expiresInHours
    });

    const approvalUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/approvals/${token}/view`;
    const amount = (expense.amountCents / 100).toFixed(2);

    let directorEmail = body.directorEmail;
    if (!directorEmail) {
      const director = await pool.query(
        `SELECT email
         FROM users
         WHERE tenant_id = $1 AND role = 'director'
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId]
      );
      directorEmail = (director.rows[0]?.email as string | undefined) ?? undefined;
    }

    let emailed = false;
    let emailedTo: string | undefined = undefined;
    let mailProvider: string | undefined = undefined;
    let mailId: string | undefined = undefined;
    if (directorEmail) {
      if (!isMailConfigured()) {
        // Still return a usable link (share via WhatsApp/SMS) even if SMTP isn't set up.
        return { ok: true, approvalUrl, expiresAt, emailed: false, reason: "Email provider not configured" };
      }
      const result = await sendMail({
        to: directorEmail,
        replyTo: email || undefined,
        subject: `Approve expense: ${expense.currency} ${amount}`,
        text:
          `Expense approval request\n\n` +
          `Amount: ${expense.currency} ${amount}\n` +
          `Description: ${expense.description}\n` +
          (email ? `Submitted by: ${email}\n` : "") +
          `Approve/Reject: ${approvalUrl}\n` +
          `Expires: ${expiresAt.toISOString()}\n`,
        html:
          `<p><strong>Expense approval request</strong></p>` +
          `<p>Amount: <strong>${escapeHtml(expense.currency)} ${escapeHtml(amount)}</strong><br/>` +
          `Description: ${escapeHtml(expense.description)}</p>` +
          (email ? `<p>Submitted by: ${escapeHtml(email)}</p>` : "") +
          `<p><a href="${approvalUrl}">Open approval link</a></p>` +
          `<p style="color:#666">Expires: ${escapeHtml(expiresAt.toISOString())}</p>`
      });
      emailed = true;
      emailedTo = directorEmail;
      mailProvider = (result as any)?.provider;
      mailId = (result as any)?.id ?? (result as any)?.messageId;
    }

    if (!emailed) {
      return { ok: true, approvalUrl, expiresAt, emailed: false, reason: "No director user found" };
    }

    return { ok: true, approvalUrl, expiresAt, emailed, emailedTo, mailProvider, mailId };
  });

  // In-app sharing path (no email): generate an approval link you can copy/share via WhatsApp/SMS.
  app.post("/:id/approval-link", async (req) => {
    const { userId, tenantId, role } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        expiresInHours: z.number().int().positive().max(720).optional()
      })
      .optional()
      .parse(req.body);

    const pool = getPool();
    const exp = await pool.query(
      `SELECT id, user_id as "userId", amount_cents as "amountCents", currency, description, status
       FROM expenses
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [params.id, tenantId]
    );
    if (exp.rowCount === 0) throw new Error("Expense not found");
    const expense = exp.rows[0] as { id: string; userId: string; status: string };

    const canRequest =
      role === "admin" || role === "finance" || role === "director" || expense.userId === userId;
    if (!canRequest) throw new Error("Not allowed");

    if (expense.status === "submitted") {
      await pool.query("UPDATE expenses SET status = $1, updated_at = $2 WHERE id = $3", [
        "pending_approval",
        new Date(),
        expense.id
      ]);
    }

    const { token, expiresAt } = await createApprovalToken({
      tenantId,
      expenseId: expense.id,
      expiresInHours: body?.expiresInHours
    });
    const approvalUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/approvals/${token}/view`;
    return { ok: true, approvalUrl, expiresAt };
  });
};

function safeImageExt(mimetype: string) {
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  return ".jpg";
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
