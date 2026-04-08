import type { FastifyPluginAsync } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { env } from "../lib/env";
import { requireAuth } from "../lib/auth";
import { getPool } from "../lib/pg";
import { writeAuditLog } from "../lib/audit";
import { createNotification } from "../lib/notifications";
import { createEmailToken } from "../lib/emailTokens";
import { isMailConfigured, sendMail } from "../lib/mailer";

const statusSchema = z.enum(["draft", "submitted", "approved", "rejected", "verified", "posted"]);
type ExpenseStatus = z.infer<typeof statusSchema>;

function safeImageExt(mime: string) {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

function emailDomain(email: string) {
  return (email.toLowerCase().split("@")[1] ?? "").trim();
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function saveReceiptFile(input: { companyId: string; mimeType: string; stream: NodeJS.ReadableStream; fileName?: string }) {
  const ext = safeImageExt(input.mimeType);
  const id = randomUUID();
  const rel = `${input.companyId}/receipts/${id}${ext}`;
  const full = resolve(env.UPLOAD_DIR, rel);
  await mkdir(dirname(full), { recursive: true });
  await pipeline(input.stream, createWriteStream(full));
  const st = await stat(full);
  return { fileKey: rel, fileName: input.fileName ?? null, mimeType: input.mimeType, sizeBytes: st.size };
}

export const expensesRoutes: FastifyPluginAsync = async (app) => {
  // List expenses
  app.get("/", async (req) => {
    const { userId, companyId, role } = await requireAuth(app, req);
    const query = z
      .object({
        status: statusSchema.optional(),
        mine: z.union([z.literal("true"), z.literal("false")]).optional()
      })
      .parse(req.query);

    const mine = role === "sales" ? true : query.mine === "true";
    const pool = getPool();

    const args: any[] = [companyId];
    let where = "e.company_id = $1";
    if (mine) {
      args.push(userId);
      where += ` AND e.user_id = $${args.length}`;
    }
    if (query.status) {
      args.push(query.status);
      where += ` AND e.status = $${args.length}`;
    }

    const result = await pool.query(
      `SELECT
        e.id,
        e.user_id as "userId",
        u.email as "submittedBy",
        e.amount_cents as "amountCents",
        e.currency,
        e.category,
        e.description,
        e.status,
        e.current_approver_id as "currentApproverId",
        e.submitted_at as "submittedAt",
        e.decided_at as "decidedAt",
        e.verified_at as "verifiedAt",
        e.posted_at as "postedAt",
        e.created_at as "createdAt",
        e.updated_at as "updatedAt"
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       WHERE ${where}
       ORDER BY e.created_at DESC
       LIMIT 200`,
      args
    );
    return { items: result.rows };
  });

  // Get one expense (includes receipts)
  app.get("/:id", async (req) => {
    const { userId, companyId, role } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const exp = await pool.query(
      `SELECT
        e.id,
        e.user_id as "userId",
        e.amount_cents as "amountCents",
        e.currency,
        e.category,
        e.description,
        e.status,
        e.current_approver_id as "currentApproverId",
        e.submitted_at as "submittedAt",
        e.decided_at as "decidedAt",
        e.verified_at as "verifiedAt",
        e.posted_at as "postedAt",
        e.created_at as "createdAt",
        e.updated_at as "updatedAt"
       FROM expenses e
       WHERE e.id = $1 AND e.company_id = $2
       LIMIT 1`,
      [params.id, companyId]
    );
    if (!exp.rowCount) throw new Error("Expense not found");
    const expense = exp.rows[0] as any;

    if (role === "sales" && expense.userId !== userId) throw new Error("Not allowed");

    const receipts = await pool.query(
      `SELECT id,
              file_key as "fileKey",
              file_name as "fileName",
              mime_type as "mimeType",
              size_bytes as "sizeBytes",
              created_at as "createdAt"
       FROM receipts
       WHERE expense_id = $1 AND company_id = $2
       ORDER BY created_at DESC`,
      [params.id, companyId]
    );

    const approvals = await pool.query(
      `SELECT a.id,
              a.decision,
              a.comment,
              a.created_at as "createdAt",
              u.email as "approverEmail"
       FROM approvals a
       JOIN users u ON u.id = a.approver_id
       WHERE a.expense_id = $1 AND a.company_id = $2
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [params.id, companyId]
    );

    return { ...expense, receipts: receipts.rows, approvals: approvals.rows };
  });

  // Create expense (draft). Supports optional receipt upload (multipart).
  app.post("/", async (req) => {
    const { userId, companyId } = await requireAuth(app, req);
    const pool = getPool();

    const parts = req.parts();
    let amount: number | null = null;
    let currency: string | undefined;
    let category: string | undefined;
    let description: string | null = null;
    let savedReceipt:
      | { fileKey: string; fileName: string | null; mimeType: string; sizeBytes: number }
      | null = null;

    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "amount") amount = Number(part.value);
        if (part.fieldname === "currency") currency = String(part.value);
        if (part.fieldname === "category") category = String(part.value);
        if (part.fieldname === "description") description = String(part.value);
      } else if (part.type === "file") {
        if (part.fieldname !== "receipt") continue;
        savedReceipt = await saveReceiptFile({
          companyId,
          mimeType: part.mimetype,
          stream: part.file,
          fileName: part.filename
        });
      }
    }

    const parsed = z
      .object({
        amount: z.number().finite().positive(),
        currency: z.string().trim().min(3).max(3).default("KES"),
        category: z.string().trim().min(2).max(60).optional(),
        description: z.string().trim().min(2).max(140)
      })
      .parse({
        amount,
        currency: currency ?? "KES",
        category,
        description
      });

    const id = randomUUID();
    const now = new Date();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO expenses
          (id, company_id, user_id, amount_cents, currency, category, description, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$8)`,
        [
          id,
          companyId,
          userId,
          Math.round(parsed.amount * 100),
          parsed.currency.toUpperCase(),
          parsed.category ?? null,
          parsed.description,
          now
        ]
      );

      if (savedReceipt) {
        await client.query(
          `INSERT INTO receipts (id, company_id, expense_id, file_key, file_name, mime_type, size_bytes, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            companyId,
            id,
            savedReceipt.fileKey,
            savedReceipt.fileName,
            savedReceipt.mimeType,
            savedReceipt.sizeBytes,
            now
          ]
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      // Rollback won't delete file, so best-effort cleanup.
      if (savedReceipt) {
        try {
          await unlink(resolve(env.UPLOAD_DIR, savedReceipt.fileKey));
        } catch {
          // ignore
        }
      }
      throw e;
    } finally {
      client.release();
    }

    await writeAuditLog({
      companyId,
      entityType: "expense",
      entityId: id,
      action: "expense.created",
      performedBy: userId,
      beforeState: null,
      afterState: { amountCents: Math.round(parsed.amount * 100), currency: parsed.currency, description: parsed.description },
      createdAt: now
    });

    return { id, status: "draft" as ExpenseStatus };
  });

  // Attach a receipt (multipart: `receipt` file)
  app.post("/:id/receipts", async (req) => {
    const { userId, companyId, role } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const exp = await pool.query(
      `SELECT id, user_id as "userId", status
       FROM expenses
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
      [params.id, companyId]
    );
    if (!exp.rowCount) throw new Error("Expense not found");
    const row = exp.rows[0] as any;
    if (role === "sales" && row.userId !== userId) throw new Error("Not allowed");
    if (row.status !== "draft") throw new Error("Receipts can only be added to drafts");

    const part = await req.file();
    if (!part) throw new Error("Missing file");
    if (part.fieldname !== "receipt") throw new Error("Expected field: receipt");

    const saved = await saveReceiptFile({
      companyId,
      mimeType: part.mimetype,
      stream: part.file,
      fileName: part.filename
    });

    const id = randomUUID();
    const now = new Date();
    await pool.query(
      `INSERT INTO receipts (id, company_id, expense_id, file_key, file_name, mime_type, size_bytes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, companyId, params.id, saved.fileKey, saved.fileName, saved.mimeType, saved.sizeBytes, now]
    );

    return { id };
  });

  app.get("/:id/receipts", async (req) => {
    const { userId, companyId, role } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const exp = await pool.query(
      `SELECT id, user_id as "userId"
       FROM expenses
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
      [params.id, companyId]
    );
    if (!exp.rowCount) throw new Error("Expense not found");
    const row = exp.rows[0] as any;
    if (role === "sales" && row.userId !== userId) throw new Error("Not allowed");

    const receipts = await pool.query(
      `SELECT id,
              file_key as "fileKey",
              file_name as "fileName",
              mime_type as "mimeType",
              size_bytes as "sizeBytes",
              created_at as "createdAt"
       FROM receipts
       WHERE expense_id = $1 AND company_id = $2
       ORDER BY created_at DESC`,
      [params.id, companyId]
    );
    return { items: receipts.rows };
  });

  app.delete("/receipts/:id", async (req) => {
    const { userId, companyId, role } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const receipt = await pool.query(
      `SELECT r.id,
              r.file_key as "fileKey",
              e.user_id as "userId",
              e.status
       FROM receipts r
       JOIN expenses e ON e.id = r.expense_id
       WHERE r.id = $1 AND r.company_id = $2
       LIMIT 1`,
      [params.id, companyId]
    );
    if (!receipt.rowCount) throw new Error("Receipt not found");
    const row = receipt.rows[0] as any;
    if (role === "sales" && row.userId !== userId) throw new Error("Not allowed");
    if (row.status !== "draft") throw new Error("Receipts can only be deleted from drafts");

    await pool.query("DELETE FROM receipts WHERE id = $1 AND company_id = $2", [params.id, companyId]);
    try {
      await unlink(resolve(env.UPLOAD_DIR, row.fileKey));
    } catch {
      // ignore
    }
    return { ok: true };
  });

  // Download a receipt file (authenticated). Use fetch+blob in the frontend; <img> tags can't send auth headers.
  app.get("/receipts/:id/file", async (req, reply) => {
    const { userId, companyId, role } = await requireAuth(app, req);
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const row = await pool.query(
      `SELECT r.file_key as "fileKey",
              r.mime_type as "mimeType",
              e.user_id as "expenseUserId"
       FROM receipts r
       JOIN expenses e ON e.id = r.expense_id
       WHERE r.id = $1 AND r.company_id = $2
       LIMIT 1`,
      [params.id, companyId]
    );
    if (!row.rowCount) throw new Error("Receipt not found");
    const r = row.rows[0] as { fileKey: string; mimeType: string; expenseUserId: string };
    if (role === "sales" && r.expenseUserId !== userId) throw new Error("Not allowed");

    const full = resolve(env.UPLOAD_DIR, r.fileKey);
    reply.type(r.mimeType);
    return reply.send(createReadStream(full));
  });

  // Submit expense for director approval (sends email links).
  app.post("/:id/submit", async (req) => {
    const { userId, companyId, role, email } = await requireAuth(app, req);
    if (role !== "sales") throw new Error("Only sales can submit");
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const pool = getPool();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const exp = await client.query(
        `SELECT id,
                user_id as "userId",
                amount_cents as "amountCents",
                currency,
                description,
                status
         FROM expenses
         WHERE id = $1 AND company_id = $2
         LIMIT 1`,
        [params.id, companyId]
      );
      if (!exp.rowCount) throw new Error("Expense not found");
      const e = exp.rows[0] as any;
      if (e.userId !== userId) throw new Error("Not allowed");
      if (e.status !== "draft") throw new Error("Only drafts can be submitted");

      const directorRow = await client.query(
        `SELECT id, email
         FROM users
         WHERE id = (
           SELECT default_director_id
           FROM companies
           WHERE id = $1
         )
         AND company_id = $1
         AND role = 'director'
         AND is_active = true
         LIMIT 1`,
        [companyId]
      );
      let director: { id: string; email: string } | null =
        directorRow.rowCount ? (directorRow.rows[0] as { id: string; email: string }) : null;

      if (!director) {
        const fallback = await client.query(
          `SELECT id, email
           FROM users
           WHERE company_id = $1 AND role = 'director' AND is_active = true
           ORDER BY created_at ASC
           LIMIT 1`,
          [companyId]
        );
        if (!fallback.rowCount) throw new Error("No director configured for this company");
        director = fallback.rows[0] as { id: string; email: string };
      }

      const now = new Date();
      await client.query(
        `UPDATE expenses
         SET status='submitted',
             current_approver_id=$1,
             submitted_at=$2,
             updated_at=$2
         WHERE id=$3 AND company_id=$4`,
        [director.id, now, params.id, companyId]
      );

      await writeAuditLog({
        companyId,
        entityType: "expense",
        entityId: params.id,
        action: "expense.submitted",
        performedBy: userId,
        beforeState: { status: "draft" },
        afterState: { status: "submitted", currentApproverId: director.id },
        createdAt: now
      });

      await createNotification({
        companyId,
        userId,
        title: "Expense submitted",
        message: "Sent to director for approval.",
        createdAt: now
      });

      const token = await createEmailToken({
        companyId,
        expenseId: params.id,
        approverId: director.id,
        expiresInHours: 24
      });

      let emailed = false;
      let mailProvider: string | undefined;
      let mailId: string | undefined;

      if (isMailConfigured()) {
        try {
          const approvalUiBase = `${env.APP_BASE_URL.replace(/\/+$/, "")}/#/approval?token=${encodeURIComponent(token.token)}`;
          // Email should open the PWA (director panel). The PWA will call the backend using token-only endpoints.
          const approveUrl = `${approvalUiBase}&action=approve`;
          const rejectUrl = `${approvalUiBase}&action=reject`;
          const viewUrl = approvalUiBase;

          // Attach latest receipt image (best-effort).
          let attachments:
            | Array<{ filename: string; contentType: string; content: Buffer }>
            | undefined;
          try {
            const r = await pool.query(
              `SELECT file_key as "fileKey", file_name as "fileName", mime_type as "mimeType"
               FROM receipts
               WHERE expense_id = $1 AND company_id = $2
               ORDER BY created_at DESC
               LIMIT 1`,
              [params.id, companyId]
            );
            if (r.rowCount) {
              const row = r.rows[0] as { fileKey: string; fileName: string | null; mimeType: string };
              const full = resolve(env.UPLOAD_DIR, row.fileKey);
              const buf = await readFile(full);
              attachments = [
                {
                  filename: row.fileName || "receipt.jpg",
                  contentType: row.mimeType,
                  content: buf
                }
              ];
            }
          } catch {
            // ignore attachment issues
          }

          const subject = `Approve expense: ${e.currency} ${(e.amountCents / 100).toFixed(2)}`;
          const text =
            `Expense approval request\n\n` +
            `Amount: ${e.currency} ${(e.amountCents / 100).toFixed(2)}\n` +
            `Description: ${e.description}\n` +
            `Submitted by: ${email}\n\n` +
            `Approve: ${approveUrl}\n` +
            `Reject: ${rejectUrl}\n` +
            `Open details: ${viewUrl}\n` +
            `Expires: ${token.expiresAt.toISOString()}\n`;

          const html =
            `<p><strong>Expense approval request</strong></p>` +
            `<p>Amount: <strong>${escapeHtml(e.currency)} ${(e.amountCents / 100).toFixed(2)}</strong><br/>` +
            `Description: ${escapeHtml(e.description)}</p>` +
            `<p>Submitted by: ${escapeHtml(email)}</p>` +
            `<p style="margin-top:16px">` +
            `<a href="${approveUrl}" style="display:inline-block;padding:10px 14px;border-radius:12px;background:#10b981;color:white;text-decoration:none;font-weight:900;margin-right:8px">Approve</a>` +
            `<a href="${rejectUrl}" style="display:inline-block;padding:10px 14px;border-radius:12px;background:#ef4444;color:white;text-decoration:none;font-weight:900">Reject</a>` +
            `</p>` +
            `<p style="margin-top:10px"><a href="${viewUrl}">Open details</a></p>` +
            `<p style="color:#666">Expires: ${escapeHtml(token.expiresAt.toISOString())}</p>`;

          let from: string | undefined;
          if (env.MAIL_FROM_MODE === "actor" && email) {
            try {
              const c = await pool.query("SELECT domain FROM companies WHERE id = $1 LIMIT 1", [companyId]);
              const domain = String(c.rows?.[0]?.domain ?? "").toLowerCase();
              if (domain && emailDomain(email) === domain) from = email;
            } catch {
              // ignore
            }
          }

          let res:
            | { provider: "smtp" | "sendgrid" | "mailtrap"; id?: string; messageId?: string }
            | undefined;
          try {
            res = await sendMail({
              to: director.email,
              subject,
              text,
              html,
              from,
              replyTo: email || undefined,
              attachments
            });
          } catch (e) {
            // If actor-from is rejected by the provider, retry using the system sender.
            if (from) {
              res = await sendMail({
                to: director.email,
                subject,
                text,
                html,
                replyTo: email || undefined,
                attachments
              });
            } else {
              throw e;
            }
          }
          emailed = true;
          mailProvider = (res as any)?.provider;
          mailId = (res as any)?.id ?? (res as any)?.messageId;
        } catch {
          // best-effort; director can still use web app
        }
      }

      await client.query("COMMIT");
      return {
        ok: true,
        status: "submitted" as ExpenseStatus,
        directorEmail: director.email,
        emailed,
        mailProvider,
        mailId
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
};
